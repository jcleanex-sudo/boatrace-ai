import { execFile, execFileSync } from "child_process";
import { accessSync, constants as fsConstants } from "fs";
import path from "path";
import { promisify } from "util";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getDataStatus,
  getPredictionHistory,
  getRaceBeforeInfo,
  getRaceEntries,
  logDataFetch,
  savePredictionLog,
  getDailyHitSummary,
  updatePredictionBet,
  upsertBankroll,
  getBankrollHistory,
  getBankrollSummary,
  getCurrentBankrollBalance,
  getBankrollByCondition,
  getBankrollByWeather,
  getSetting,
  setSetting,
  getAllSettings,
  saveSkipHistory,
  getSkipHistory,
  updateSkipHistoryResult,
  getAvailableRacesForDate,
} from "./db";
import { STADIUMS } from "@shared/boatrace";

const execFileAsync = promisify(execFile);
const SCRIPTS_DIR = path.join(process.cwd(), "scripts");
const PYTHON_DEPS_DIR = path.resolve(process.cwd(), ".python-packages");
let pythonDepsVerified = false;

// Pythonバイナリを動的に解決（本番環境でのENOENTエラー対策）
function resolvePythonBin(): string {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  // whichコマンドでPATHから検索（本番環境のPATHに対応）
  const names = ["python3.11", "python3", "python"];
  for (const name of names) {
    try {
      const result = execFileSync("which", [name], {
        encoding: "utf8",
        env: { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin" },
        timeout: 3000,
      }).trim();
      if (result) {
        console.log(`[Python] Resolved binary: ${result}`);
        return result;
      }
    } catch {
      continue;
    }
  }
  // フォールバック: フルパス候補を順にチェック
  const candidates = [
    "/usr/bin/python3.11",
    "/usr/local/bin/python3.11",
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python",
  ];
  for (const p of candidates) {
    try {
      accessSync(p, fsConstants.X_OK);
      console.log(`[Python] Resolved binary (fallback): ${p}`);
      return p;
    } catch {
      continue;
    }
  }
  console.warn("[Python] WARNING: No Python binary found! Using 'python3' as last resort.");
  return "python3";
}
const PYTHON_BIN = resolvePythonBin();

function ensurePythonDeps(pythonBin: string) {
  if (pythonDepsVerified) return;

  const reqFile = path.resolve(process.cwd(), "scripts/requirements.txt");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: process.env.PATH || "/usr/bin:/bin:/usr/local/bin",
    PYTHONPATH: PYTHON_DEPS_DIR,
  };

  try {
    execFileSync(pythonBin, ["-c", "import numpy, pandas, sklearn, lightgbm, xgboost, joblib, lxml"], {
      env,
      timeout: 30_000,
      stdio: "pipe",
    });
    pythonDepsVerified = true;
    return;
  } catch {
    // Fall through and install into the project-local package directory.
  }

  try {
    execFileSync(pythonBin, [
      "-m",
      "pip",
      "install",
      "--target",
      PYTHON_DEPS_DIR,
      "--upgrade",
      "-q",
      "-r",
      reqFile,
    ], {
      env,
      timeout: 300_000,
      stdio: "pipe",
    });
    pythonDepsVerified = true;
    console.log("[Python] Dependencies verified for tRPC runtime.");
  } catch (err: any) {
    const stderr = Buffer.isBuffer(err.stderr) ? err.stderr.toString("utf8") : "";
    console.warn("[Python] Failed to verify dependencies for tRPC runtime:", stderr || err.message);
  }
}

// Pythonスクリプトを実行するヘルパー
async function runPython(script: string, args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  // 動的に解決したPythonバイナリを使用（本番環境でのENOENTエラー対策）
  const pythonBin = PYTHON_BIN;
  const scriptPath = path.join(SCRIPTS_DIR, script);
  ensurePythonDeps(pythonBin);
  // 引数を配列として渡す（シェルインジェクション回避）
  const scriptArgs = args.flatMap(a => a.split(" "));
  console.log(`[runPython] CMD: ${pythonBin} ${scriptPath} ${scriptArgs.join(' ')}`);
  // ホワイトリスト方式: Python関連の環境変数を全て除外し、必要最低限のみ渡す
  // OTEL/PYTHONPATH/PYTHONHOME/VIRTUAL_ENV/UV_*などがPython3.13を引き込む原因
  const env: Record<string, string> = {
    PATH: "/usr/bin:/bin:/usr/local/bin",
    HOME: process.env.HOME || "/home/ubuntu",
    TMPDIR: process.env.TMPDIR || "/tmp",
    PYTHONPATH: PYTHON_DEPS_DIR,
    // アプリケーション固有の環境変数のみ渡す
    ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    ...(process.env.SSL_CERT_FILE ? { SSL_CERT_FILE: process.env.SSL_CERT_FILE } : {}),
    ...(process.env.NODE_ENV ? { NODE_ENV: process.env.NODE_ENV } : {}),
  };
  try {
    const result = await execFileAsync(pythonBin, [scriptPath, ...scriptArgs], {
      env,
      timeout: timeoutMs,
    });
    return result;
  } catch (err: any) {
    return { stdout: err.stdout || "", stderr: err.stderr || err.message };
  }
}

// 最後のJSON行を抽出するヘルパー
function extractLastJson(stdout: string): unknown {
  const lines = stdout.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      continue;
    }
  }
  return null;
}


const settingsRouter = router({
  getAll: publicProcedure.query(async () => {
    return getAllSettings();
  }),

  set: publicProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      await setSetting(input.key, input.value);
      return { success: true };
    }),

  // LINE通知テスト送信
  testLineNotify: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const res = await fetch("https://notify-api.line.me/api/notify", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${input.token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ message: "\n競艇予想AIからのテスト通知です。\n設定が正常に完了しました！" }),
        });
        if (res.ok) {
          await setSetting("line_notify_token", input.token);
          return { success: true, message: "LINE通知を送信しました" };
        } else {
          const body = await res.text();
          return { success: false, message: `LINE通知の送信に失敗しました: ${body}` };
        }
      } catch (e) {
        return { success: false, message: `エラー: ${String(e)}` };
      }
    }),
});

// ─── Skip History Router ──────────────────────────────────────────────────────

const skipHistoryRouter = router({
  save: publicProcedure
    .input(z.object({
      raceDate: z.string(),
      stadiumId: z.string(),
      raceNumber: z.number(),
      skipReason: z.string(),
      predictedCombos: z.array(z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await saveSkipHistory(input);
      return { success: true, id };
    }),

  getHistory: publicProcedure
    .input(z.object({ limit: z.number().optional().default(50) }))
    .query(async ({ input }) => {
      return getSkipHistory(input.limit);
    }),

  updateResult: publicProcedure
    .input(z.object({
      id: z.number(),
      actualResult: z.string(),
      actualPayout: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      await updateSkipHistoryResult(input.id, input.actualResult, input.actualPayout);
      return { success: true };
    }),
});

// ─── Analytics Router ─────────────────────────────────────────────────────────

const analyticsRouter = router({
  // 予想精度分析（本線・抱え・穴目別の的中率）
  getPredictionAccuracy: publicProcedure.query(async () => {
    const history = await getPredictionHistory(500);
    const stats = { honsen: { total: 0, hit: 0 }, osae: { total: 0, hit: 0 }, aname: { total: 0, hit: 0 } };
    for (const log of history) {
      if (!log.actualResult || !log.predictions) continue;
      const preds = Array.isArray(log.predictions) ? log.predictions : [];
      const categories = ["honsen", "osae", "aname"] as const;
      for (const cat of categories) {
        const catPreds = preds.filter((p: any) => p.category === cat || (!p.category && cat === "honsen"));
        if (catPreds.length > 0) {
          stats[cat].total++;
          if (catPreds.some((p: any) => p.combo === log.actualResult)) {
            stats[cat].hit++;
          }
        }
      }
    }
    return {
      honsen: { ...stats.honsen, hitRate: stats.honsen.total > 0 ? Math.round(stats.honsen.hit / stats.honsen.total * 1000) / 10 : 0 },
      osae: { ...stats.osae, hitRate: stats.osae.total > 0 ? Math.round(stats.osae.hit / stats.osae.total * 1000) / 10 : 0 },
      aname: { ...stats.aname, hitRate: stats.aname.total > 0 ? Math.round(stats.aname.hit / stats.aname.total * 1000) / 10 : 0 },
    };
  }),

  // 天候別収支分析
  getWeatherStats: publicProcedure.query(async () => {
    return getBankrollByWeather();
  }),

  // 月別収支サマリー
  getMonthlySummary: publicProcedure.query(async () => {
    const history = await getBankrollHistory(365);
    const monthly: Record<string, { totalBet: number; totalPayout: number; totalRaces: number; hitRaces: number }> = {};
    for (const row of history) {
      const date = row.raceDate instanceof Date ? row.raceDate : new Date(row.raceDate as string);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = { totalBet: 0, totalPayout: 0, totalRaces: 0, hitRaces: 0 };
      monthly[key].totalBet += Number(row.totalBet ?? 0);
      monthly[key].totalPayout += Number(row.totalPayout ?? 0);
      monthly[key].totalRaces += Number(row.totalRaces ?? 0);
      monthly[key].hitRaces += Number(row.hitRaces ?? 0);
    }
    return Object.entries(monthly).map(([month, data]) => ({
      month,
      ...data,
      returnRate: data.totalBet > 0 ? Math.round(data.totalPayout / data.totalBet * 1000) / 10 : null,
      hitRate: data.totalRaces > 0 ? Math.round(data.hitRaces / data.totalRaces * 1000) / 10 : null,
    })).sort((a, b) => a.month.localeCompare(b.month));
  }),

  // 条件別収支（天候含む）
  getConditionStats: publicProcedure.query(async () => {
    const [condition, weather] = await Promise.all([
      getBankrollByCondition(),
      getBankrollByWeather(),
    ]);
    return { ...condition, byWeather: weather };
  }),
  // 日別カレンダーデータ（指定月の日別収支・予想数）
  getDailyCalendar: publicProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(async ({ input }) => {
      const { year, month } = input;
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const history = await getBankrollHistory(60);
      // 日別集計
      const daily: Record<string, { totalBet: number; totalPayout: number; totalRaces: number; hitRaces: number }> = {};
      for (const row of history) {
        const date = row.raceDate instanceof Date ? row.raceDate : new Date(row.raceDate as string);
        const dateStr = date.toISOString().split("T")[0];
        if (dateStr < monthStart || dateStr >= nextMonth) continue;
        if (!daily[dateStr]) daily[dateStr] = { totalBet: 0, totalPayout: 0, totalRaces: 0, hitRaces: 0 };
        daily[dateStr].totalBet += Number(row.totalBet ?? 0);
        daily[dateStr].totalPayout += Number(row.totalPayout ?? 0);
        daily[dateStr].totalRaces += Number(row.totalRaces ?? 0);
        daily[dateStr].hitRaces += Number(row.hitRaces ?? 0);
      }
      // 予想履歴から日別予想数も取得
      const predHistory = await getPredictionHistory(200);
      const dailyPreds: Record<string, number> = {};
      for (const log of predHistory) {
        const date = log.raceDate instanceof Date ? log.raceDate : new Date(log.raceDate as string);
        const dateStr = date.toISOString().split("T")[0];
        if (dateStr < monthStart || dateStr >= nextMonth) continue;
        dailyPreds[dateStr] = (dailyPreds[dateStr] || 0) + 1;
      }
      return Object.entries(daily).map(([date, data]) => ({
        date,
        ...data,
        predictionCount: dailyPreds[date] || 0,
        profit: data.totalPayout - data.totalBet,
        returnRate: data.totalBet > 0 ? Math.round(data.totalPayout / data.totalBet * 1000) / 10 : null,
      })).sort((a, b) => a.date.localeCompare(b.date));
    }),
});


// ─── Odds Monitor Router ──────────────────────────────────────────────────────
const oddsMonitorRouter = router({
  // オッズを取得してDBに保存
  scrapeOdds: publicProcedure
    .input(z.object({
      raceDate: z.string(),
      stadiumId: z.string(),
      raceNumber: z.number().min(1).max(12),
    }))
    .mutation(async ({ input }) => {
      const args = [
        `--date ${input.raceDate}`,
        `--stadium ${input.stadiumId}`,
        `--race ${input.raceNumber}`,
      ];
      const { stdout, stderr } = await runPython("scrape_odds.py", args);
      const result = extractLastJson(stdout) as any;
      if (!result || !result.success) {
        return { success: false, error: result?.error || stderr || "オッズ取得失敗" };
      }
      return { success: true, saved: result.saved, oddsCount: result.oddsCount };
    }),
  // オッズ変動履歴を取得
  getOddsHistory: publicProcedure
    .input(z.object({
      raceDate: z.string(),
      stadiumId: z.string(),
      raceNumber: z.number().min(1).max(12),
    }))
    .query(async ({ input }) => {
      const args = [
        `--date ${input.raceDate}`,
        `--stadium ${input.stadiumId}`,
        `--race ${input.raceNumber}`,
        `--get-history`,
      ];
       const { stdout } = await runPython("scrape_odds.py", args);
      const result = extractLastJson(stdout) as any;
      return Array.isArray(result) ? result : [];
    }),
});

// ─── Recommended Races Router ───────────────────────────────────────────────────────────────────────────────────
// ─── おすすめレース用: 複合信頼度スコアを計算 ───────────────────────────────
// 当たりやすさ = EV × 本線トップ確率 × 環境安定度 × 場のイン強さ補正
// 荒れリスク（強風・高波）が高い場合は大幅減点
function calcRecommendScore(params: {
  maxEv: number;
  topProbability: number; // 0〜100 (%)
  windSpeed: number;
  waveHeight: number;
  raceNumber: number;
  avgEv: number;
  positiveEvCount: number;
  boat1WinProb?: number; // 1号艇の1着確率 (0〜100%)
}): { score: number; confidence: number; riskLabel: string; riskLevel: "low" | "medium" | "high" } {
  const { maxEv, topProbability, windSpeed, waveHeight, raceNumber, avgEv, positiveEvCount, boat1WinProb } = params;

  // ① EV要素（最大EV + 平均EV + プラスEV件数）
  const evScore = Math.min(maxEv / 2.0, 1.0) * 0.35  // 最大EV (2.0を100%として)
    + Math.min(avgEv / 1.2, 1.0) * 0.15              // 平均EV (1.2を100%として)
    + Math.min(positiveEvCount / 6, 1.0) * 0.10;     // プラスEV件数 (6点満点)

  // ② 確率要素（本線トップ組み合わせの的中確率）
  // 確率が高い = 予想が収束している = 当たりやすい
  const probScore = Math.min(topProbability / 30.0, 1.0) * 0.25; // 30%を100%として

  // ③ 1号艇確率ボーナス（イン有利の安定レース）
  const boat1Bonus = boat1WinProb !== undefined
    ? Math.min(boat1WinProb / 60.0, 1.0) * 0.10  // 60%を100%として
    : 0.05; // データなしは中間値

  // ④ 環境安定度（荒れ条件は減点）
  let envPenalty = 0;
  if (windSpeed > 7) envPenalty += 0.25;       // 強風: 大幅減点
  else if (windSpeed > 5) envPenalty += 0.12;  // やや強風: 中程度減点
  else if (windSpeed > 3) envPenalty += 0.04;  // 微風: 軽微減点
  if (waveHeight > 15) envPenalty += 0.20;     // 高波: 大幅減点
  else if (waveHeight > 10) envPenalty += 0.08;// やや高波: 中程度減点
  const envScore = Math.max(0.15 - envPenalty, 0) / 0.15; // 0〜1に正規化
  const envWeight = 0.15;

  // 合計スコア (0〜1)
  const rawScore = evScore + probScore + boat1Bonus + envScore * envWeight;
  const score = Math.min(rawScore, 1.0);

  // 信頼度 (0〜100の整数)
  const confidence = Math.round(score * 100);

  // リスクラベル
  let riskLabel = "";
  let riskLevel: "low" | "medium" | "high" = "low";
  if (windSpeed > 7 || waveHeight > 15) {
    riskLabel = "荒れ注意";
    riskLevel = "high";
  } else if (windSpeed > 5 || waveHeight > 10) {
    riskLabel = "やや荒れ";
    riskLevel = "medium";
  } else if (raceNumber >= 9) {
    riskLabel = "後半戦";
    riskLevel = "medium";
  } else {
    riskLabel = "安定";
    riskLevel = "low";
  }

  return { score, confidence, riskLabel, riskLevel };
}

const recommendedRouter = router({
  // 現在開催中の全場をスキャンして当たりやすさ順におすすめレースを返す
  getRecommended: publicProcedure
    .input(z.object({
      date: z.string().optional(), // YYYY-MM-DD形式、未指定の場合は当日
      maxRaces: z.number().optional().default(10), // 返す件数上限
      minEv: z.number().optional().default(0.7), // 最低EV閾値（緩めに設定し複合スコアで絞る）
      excludeHighRisk: z.boolean().optional().default(true), // 荒れリスク高レースを除外
    }))
    .query(async ({ input }) => {
      const today = input.date
        ? input.date.replace(/-/g, "")
        : new Date().toISOString().slice(0, 10).replace(/-/g, "");

      // 当日のデータがある場・レースをDBから取得
      const db = await import("./db");
      const availableRaces = await db.getAvailableRacesForDate(today);

      if (availableRaces.length === 0) {
        return { races: [], scannedCount: 0, date: today };
      }

      // 全レースを同時並列実行（バッチ処理廃止で大幅高速化）
      const raceDate = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`;
      const allSettled = await Promise.allSettled(
        availableRaces.map(async (race) => {
          try {
            const args = [
              "--date", raceDate,
              "--stadium", race.stadiumId,
              "--race", String(race.raceNumber),
            ];
            // タイムアウトを短縮（120秒→ 20秒）で遅いレースを早期スキップ
            const { stdout } = await runPython("predict.py", args, 20_000);
            const prediction = extractLastJson(stdout) as any;
            if (!prediction || prediction.error) return null;

            // 全組み合わせを取得
            const allCombos: any[] = [
              ...(prediction.honsen || []),
              ...(prediction.osae || []),
              ...(prediction.aname || []),
            ];
            if (allCombos.length === 0) return null;

            // 最大EV・平均EV・プラスEV件数
            const evValues = allCombos.map((c: any) => c.ev || 0);
            const maxEv = Math.max(...evValues);
            const avgEv = evValues.reduce((a, b) => a + b, 0) / evValues.length;
            const positiveEvCount = evValues.filter(v => v > 1.0).length;

            // 本線トップ組み合わせ（確率最大）
            const honsenCombos: any[] = prediction.honsen || [];
            const topHonsen = honsenCombos.length > 0
              ? honsenCombos.reduce((a: any, b: any) => (b.probability || 0) > (a.probability || 0) ? b : a)
              : null;

            // 1号艇の1着確率
            const winProbs: Record<string, number> = prediction.winProbabilities || {};
            const boat1WinProb = parseFloat(String(winProbs["1"] ?? "0")) || 0;

            // 環境情報
            const envInfo = prediction.envInfo || {};
            const windSpeed = parseFloat(String(envInfo.windSpeed ?? prediction.windSpeed ?? 0));
            const waveHeight = parseFloat(String(envInfo.waveHeight ?? prediction.waveHeight ?? 0));
            const weather = envInfo.weather || prediction.weather || "";

            // betSummaryから見送り判定
            const betSummary = prediction.betSummary || {};
            const shouldSkip = betSummary.shouldSkip || prediction.shouldSkip || false;
            const skipReason = betSummary.skipReason || prediction.skipReason || "";

            // 複合信頼度スコアを計算
            const { score, confidence, riskLabel, riskLevel } = calcRecommendScore({
              maxEv,
              topProbability: topHonsen ? (topHonsen.probability || 0) : 0,
              windSpeed,
              waveHeight,
              raceNumber: race.raceNumber,
              avgEv,
              positiveEvCount,
              boat1WinProb,
            });

            return {
              stadiumId: race.stadiumId,
              stadiumName: race.stadiumName,
              raceNumber: race.raceNumber,
              maxEv,
              avgEv: Math.round(avgEv * 1000) / 1000,
              positiveEvCount,
              shouldSkip,
              skipReason,
              topCombination: topHonsen ? (topHonsen.combo || "") : "",
              topProbability: topHonsen ? (topHonsen.probability || 0) : 0,
              boat1WinProb,
              weather,
              windSpeed,
              waveHeight,
              raceMode: prediction.exactaMode ? "2連単" : "3連単",
              confidence,
              riskLabel,
              riskLevel,
              score,
              allCombosCount: allCombos.length,
            };
          } catch {
            return null;
          }
        })
      );

      const results = allSettled
        .filter((r): r is PromiseFulfilledResult<NonNullable<typeof r extends PromiseFulfilledResult<infer T> ? T : never>> =>
          r.status === "fulfilled" && r.value !== null
        )
        .map(r => (r as any).value);

      // 複合スコア順にソート・フィルタリング
      const recommended = results
        .filter(r => {
          if (r.shouldSkip) return false;
          if (r.maxEv < input.minEv) return false;
          // 荒れリスク高を除外（オプション）
          if (input.excludeHighRisk && r.riskLevel === "high") return false;
          return true;
        })
        .sort((a, b) => b.score - a.score) // 複合スコア順（当たりやすさ順）
        .slice(0, input.maxRaces);

      return {
        races: recommended,
        scannedCount: results.length,
        date: today,
      };
    }),
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Race Info ────────────────────────────────────────────────────────────
  race: router({
    getStadiums: publicProcedure.query(() => STADIUMS),

    getRaceEntries: publicProcedure
      .input(z.object({
        raceDate: z.string(),   // YYYYMMDD
        stadiumId: z.string(),
        raceNumber: z.number().min(1).max(12),
      }))
      .query(async ({ input }) => {
        return getRaceEntries(input.raceDate, input.stadiumId, input.raceNumber);
      }),

    getRaceBeforeInfo: publicProcedure
      .input(z.object({
        raceDate: z.string(),
        stadiumId: z.string(),
        raceNumber: z.number().min(1).max(12),
      }))
      .query(async ({ input }) => {
        return getRaceBeforeInfo(input.raceDate, input.stadiumId, input.raceNumber);
      }),
  }),

  // ─── Data Collection ──────────────────────────────────────────────────────
  data: router({
    getStatus: publicProcedure.query(async () => {
      return getDataStatus();
    }),

    // Boatrace Open APIから過去結果を取得
    fetchResults: publicProcedure
      .input(z.object({
        startDate: z.string().optional(),  // YYYY-MM-DD
        endDate: z.string().optional(),
        days: z.number().min(1).max(365).optional().default(30),
      }))
      .mutation(async ({ input }) => {
        const args: string[] = [];
        if (input.startDate && input.endDate) {
          args.push(`--start ${input.startDate}`, `--end ${input.endDate}`);
        } else {
          args.push(`--days ${input.days}`);
        }

        await logDataFetch({ fetchType: "results", status: "running" });
        const { stdout, stderr } = await runPython("fetch_results.py", args);
        const result = extractLastJson(stdout) as any;

        if (result?.success) {
          await logDataFetch({ fetchType: "results", status: "success", rowsAffected: result.total });
          return { success: true, total: result.total, output: stdout };
        } else {
          await logDataFetch({ fetchType: "results", status: "error", errorMessage: stderr });
          return { success: false, error: stderr || "Unknown error", output: stdout };
        }
      }),

    // 出走表をスクレイピング
    scrapeRacecard: publicProcedure
      .input(z.object({
        raceDate: z.string(),   // YYYYMMDD
        stadiumId: z.string(),
        raceNumber: z.number().min(1).max(12).optional(),
      }))
      .mutation(async ({ input }) => {
        const args = [
          `--date ${input.raceDate}`,
          `--stadium ${input.stadiumId}`,
        ];
        if (input.raceNumber) args.push(`--race ${input.raceNumber}`);

        await logDataFetch({
          fetchType: "racecard",
          targetDate: input.raceDate,
          stadiumId: input.stadiumId,
          raceNumber: input.raceNumber,
          status: "running",
        });

        const { stdout, stderr } = await runPython("scrape_racecard.py", args);
        const result = extractLastJson(stdout) as any;

        if (result?.success) {
          await logDataFetch({ fetchType: "racecard", status: "success", rowsAffected: result.total });
          return { success: true, total: result.total };
        } else {
          await logDataFetch({ fetchType: "racecard", status: "error", errorMessage: stderr });
          return { success: false, error: stderr || "スクレイピングに失敗しました" };
        }
      }),

    // 直前情報をスクレイピング
    scrapeBeforeInfo: publicProcedure
      .input(z.object({
        raceDate: z.string(),
        stadiumId: z.string(),
        raceNumber: z.number().min(1).max(12),
      }))
      .mutation(async ({ input }) => {
        const args = [
          `--date ${input.raceDate}`,
          `--stadium ${input.stadiumId}`,
          `--race ${input.raceNumber}`,
        ];

        await logDataFetch({
          fetchType: "beforeinfo",
          targetDate: input.raceDate,
          stadiumId: input.stadiumId,
          raceNumber: input.raceNumber,
          status: "running",
        });

        const { stdout, stderr } = await runPython("scrape_beforeinfo.py", args);
        const result = extractLastJson(stdout) as any;

        if (result?.success) {
          await logDataFetch({ fetchType: "beforeinfo", status: "success", rowsAffected: result.saved });
          return { success: true, entries: result.entries };
        } else {
          await logDataFetch({ fetchType: "beforeinfo", status: "error", errorMessage: stderr });
          return { success: false, error: stderr || "直前情報の取得に失敗しました" };
        }
      }),

    // 出走表・直前情報を並列取得
    scrapeAll: publicProcedure
      .input(z.object({
        raceDate: z.string(),
        stadiumId: z.string(),
        raceNumber: z.number().min(1).max(12),
      }))
      .mutation(async ({ input }) => {
        // 出走表と直前情報を並列実行
        const [racecardResult, beforeInfoResult] = await Promise.all([
          (async () => {
            const args = [
              `--date ${input.raceDate}`,
              `--stadium ${input.stadiumId}`,
              `--race ${input.raceNumber}`,
            ];
            await logDataFetch({
              fetchType: "racecard",
              targetDate: input.raceDate,
              stadiumId: input.stadiumId,
              raceNumber: input.raceNumber,
              status: "running",
            });
            const { stdout, stderr } = await runPython("scrape_racecard.py", args);
            const result = extractLastJson(stdout) as any;
            if (result?.success) {
              await logDataFetch({ fetchType: "racecard", status: "success", rowsAffected: result.total });
              return { success: true, total: result.total };
            } else {
              await logDataFetch({ fetchType: "racecard", status: "error", errorMessage: stderr });
              return { success: false, error: stderr || "スクレイピングに失敗しました" };
            }
          })(),
          (async () => {
            const args = [
              `--date ${input.raceDate}`,
              `--stadium ${input.stadiumId}`,
              `--race ${input.raceNumber}`,
            ];
            await logDataFetch({
              fetchType: "beforeinfo",
              targetDate: input.raceDate,
              stadiumId: input.stadiumId,
              raceNumber: input.raceNumber,
              status: "running",
            });
            const { stdout, stderr } = await runPython("scrape_beforeinfo.py", args);
            const result = extractLastJson(stdout) as any;
            if (result?.success) {
              await logDataFetch({ fetchType: "beforeinfo", status: "success", rowsAffected: result.saved });
              return { success: true, entries: result.entries };
            } else {
              await logDataFetch({ fetchType: "beforeinfo", status: "error", errorMessage: stderr });
              return { success: false, error: stderr || "直前情報の取得に失敗しました" };
            }
          })(),
        ]);

        return {
          success: racecardResult.success && beforeInfoResult.success,
          racecard: racecardResult,
          beforeInfo: beforeInfoResult,
        };
      }),

    // モデル学習
    trainModel: publicProcedure.mutation(async () => {
      const { stdout, stderr } = await runPython("train_model.py", []);
      const result = extractLastJson(stdout) as any;
      if (result?.success) {
        return { success: true, accuracy: result.accuracy, trainRows: result.train_rows };
      } else {
        return { success: false, error: result?.error || stderr || "学習に失敗しました" };
      }
    }),

    // 過去データ一括収集（2〜3年分）
    collectHistory: publicProcedure
      .input(z.object({
        years: z.number().min(1).max(3).optional().default(2),
        fromDate: z.string().optional(),  // YYYYMMDD
        toDate: z.string().optional(),    // YYYYMMDD
        delaySeconds: z.number().min(0).max(5).optional().default(1),
      }))
      .mutation(async ({ input }) => {
        const args: string[] = [];
        if (input.fromDate && input.toDate) {
          args.push(`--from ${input.fromDate}`, `--to ${input.toDate}`);
        } else {
          args.push(`--years ${input.years}`);
        }
        args.push(`--delay ${input.delaySeconds}`);

        await logDataFetch({ fetchType: "history", status: "running" });
        const { stdout, stderr } = await runPython("collect_history.py", args);
        const result = extractLastJson(stdout) as any;

        if (result?.success) {
          await logDataFetch({ fetchType: "history", status: "success", rowsAffected: result.totalSaved });
          return {
            success: true,
            totalDays: result.totalDays,
            successDays: result.successDays,
            errorDays: result.errorDays,
            totalSaved: result.totalSaved,
          };
        } else {
          await logDataFetch({ fetchType: "history", status: "error", errorMessage: stderr });
          return { success: false, error: stderr || "一括収集に失敗しました" };
        }
      }),
  }),

  // ─── Prediction ───────────────────────────────────────────────────────────
  predict: router({
    run: publicProcedure
      .input(z.object({
        raceDate: z.string(),   // YYYYMMDD
        stadiumId: z.string(),
        raceNumber: z.number().min(1).max(12),
      }))
      .mutation(async ({ input }) => {
        const args = [
          `--date ${input.raceDate}`,
          `--stadium ${input.stadiumId}`,
          `--race ${input.raceNumber}`,
        ];

        const { stdout, stderr } = await runPython("predict.py", args);
        const result = extractLastJson(stdout) as any;

        if (!result || result.error) {
          return { success: false, error: result?.error || stderr || "予想に失敗しました" };
        }

         // 予想ログを保存
        const logId = await savePredictionLog({
          raceDate: input.raceDate,
          stadiumId: input.stadiumId,
          raceNumber: input.raceNumber,
          predictions: result.predictions,
          modelVersion: result.modelUsed,
        });
        return { success: true, logId, ...result };
      }),

    getHistory: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(100).optional().default(20) }))
      .query(async ({ input }) => {
        return getPredictionHistory(input.limit);
      }),

    // 的中判定を実行
    checkHit: publicProcedure
      .input(z.object({
        raceDate: z.string().optional(),  // YYYYMMDD
        all: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const args: string[] = [];
        if (input.raceDate) {
          args.push(`--date ${input.raceDate}`);
        } else if (input.all) {
          args.push(`--all`);
        } else {
          return { success: false, error: "raceDate または all を指定してください" };
        }

        const { stdout, stderr } = await runPython("check_hit.py", args);
        const result = extractLastJson(stdout) as any;

        if (result?.success) {
          return { success: true, checked: result.checked, updated: result.updated };
        } else {
          return { success: false, error: result?.error || stderr || "的中判定に失敗しました" };
        }
      }),

     // 当日の的中率サマリーを取得
    getDailySummary: publicProcedure
      .input(z.object({ raceDate: z.string() }))  // YYYYMMDD
      .query(async ({ input }) => {
        return getDailyHitSummary(input.raceDate);
      }),
    // 賭け金を記録し収支を更新
    recordBet: publicProcedure
      .input(z.object({
        logId: z.number(),
        betAmount: z.number().min(100),
        raceDate: z.string(),  // YYYYMMDD
      }))
      .mutation(async ({ input }) => {
        await updatePredictionBet(input.logId, input.betAmount);
        const result = await upsertBankroll(input.raceDate);
        return { success: true, bankroll: result };
      }),
    // 収支履歴を取得
    getBankrollHistory: publicProcedure
      .input(z.object({ days: z.number().optional() }))
      .query(async ({ input }) => {
        return getBankrollHistory(input.days ?? 30);
      }),
    // 累計収支サマリーを取得
    getBankrollSummary: publicProcedure
      .query(async () => {
        return getBankrollSummary();
      }),
    // 収支を再集計（的中判定後に呼び出す）
    recalcBankroll: publicProcedure
      .input(z.object({ raceDate: z.string() }))
      .mutation(async ({ input }) => {
        const result = await upsertBankroll(input.raceDate);
        return { success: true, bankroll: result };
      }),

    // 現在の資金残高を取得（ケリー基準計算に使用）
    getBankrollBalance: publicProcedure
      .query(async () => {
        const balance = await getCurrentBankrollBalance();
        return { balance };
      }),

    // 条件別収支集計（競艇場別・レース番号別）
    getBankrollByCondition: publicProcedure
      .query(async () => {
        return getBankrollByCondition();
      }),

    // 複数レース一括予想
    batchPredict: publicProcedure
      .input(z.object({
        raceDate: z.string(),    // YYYYMMDD
        stadiumId: z.string(),
        races: z.array(z.number().min(1).max(12)),  // 予想するレース番号リスト
        bankroll: z.number().optional().default(0),
      }))
      .mutation(async ({ input }) => {
        const results: Array<{ raceNumber: number; success: boolean; logId?: number | null; data?: unknown; error?: string }> = [];

        for (const raceNumber of input.races) {
          const args = [
            `--date ${input.raceDate}`,
            `--stadium ${input.stadiumId}`,
            `--race ${raceNumber}`,
          ];
          if (input.bankroll > 0) {
            args.push(`--bankroll ${input.bankroll}`);
          }

          const { stdout, stderr } = await runPython("predict.py", args);
          const result = extractLastJson(stdout) as any;

          if (!result || result.error) {
            results.push({ raceNumber, success: false, error: result?.error || stderr || "予想に失敗しました" });
            continue;
          }

          const logId = await savePredictionLog({
            raceDate: input.raceDate,
            stadiumId: input.stadiumId,
            raceNumber,
            predictions: result.predictions,
            modelVersion: result.modelUsed,
          });
          results.push({ raceNumber, success: true, logId, data: result });
        }

        const successCount = results.filter(r => r.success).length;
        return { success: successCount > 0, results, successCount, totalCount: input.races.length };
      }),
  }),
  // ─── Settings (アプリ設定) ─────────────────────────────────────────────────────
  settings: settingsRouter,
  // ─── Skip History (見送り履歴) ─────────────────────────────────────────────────────
  skipHistory: skipHistoryRouter,
  // ─── Analytics (分析) ──────────────────────────────────────────────────────────────
  analytics: analyticsRouter,
  // ─── Odds Monitor (オッズ変動) ─────────────────────────────────────────────────────────
  oddsMonitor: oddsMonitorRouter,
  // ─── Recommended Races (おすすめレース) ──────────────────────────────────────────────────
  recommended: recommendedRouter,
});
export type AppRouter = typeof appRouter;;
