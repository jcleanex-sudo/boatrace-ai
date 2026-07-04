import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { registerGachaBoatraceRoutes } from "../gachaBoatrace";
import {
  blockPublicPredictionTrpcWhenDisabled,
  isBetakoPublicEnabled,
} from "../publicAvailability";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

const execFileAsync = promisify(execFile);
const SCRIPTS_DIR = path.resolve(process.cwd(), "scripts");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const PYTHON_DEPS_DIR = path.resolve(process.cwd(), ".python-packages");
const PYTHON_PATH = process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin";

/** Pythonスクリプトを実行する共通ヘルパー */
async function runScheduledPython(script: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = path.join(SCRIPTS_DIR, script);
  const env: Record<string, string> = {
    PATH: PYTHON_PATH,
    HOME: process.env.HOME || "/home/ubuntu",
    TMPDIR: process.env.TMPDIR || "/tmp",
    PYTHONPATH: PYTHON_DEPS_DIR,
    ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    ...(process.env.SSL_CERT_FILE ? { SSL_CERT_FILE: process.env.SSL_CERT_FILE } : {}),
  };
  try {
    return await execFileAsync(PYTHON_BIN, [scriptPath, ...args], { env, timeout: 300_000 });
  } catch (err: any) {
    return { stdout: err.stdout || "", stderr: err.stderr || err.message };
  }
}

/** 最後JSON行を抽出 */
function extractLastJson(stdout: string): unknown {
  const lines = stdout.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch { continue; }
  }
  return null;
}

/** 自動的中判定スケジューラー
 * 毎日30分ごと当日の的中判定を実行する。
 * レース終了後に自動で的中判定を更新する。
 */
function startHitCheckScheduler() {
  const INTERVAL_MS = 30 * 60 * 1000; // 30分
  let isRunning = false;

  const runCheck = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const today = new Date();
      const dateStr = today.getFullYear().toString() +
        String(today.getMonth() + 1).padStart(2, "0") +
        String(today.getDate()).padStart(2, "0");
      console.log(`[HitCheck] 的中判定自動実行: ${dateStr}`);
      const { stdout, stderr } = await runScheduledPython("check_hit.py", ["--date", dateStr]);
      const result = extractLastJson(stdout) as any;
      if (result?.success) {
        console.log(`[HitCheck] 完了: ${result.checked}件確認, ${result.updated}件更新`);
      } else {
        console.warn(`[HitCheck] 失敗: ${stderr || "不明なエラー"}`);
      }
    } catch (e) {
      console.warn("[HitCheck] スケジューラーエラー:", e);
    } finally {
      isRunning = false;
    }
  };

  // 起動から1分後に初回実行、その後30分ごと
  setTimeout(() => {
    runCheck();
    setInterval(runCheck, INTERVAL_MS);
  }, 60_000);
  console.log("[HitCheck] 自動的中判定スケジューラーを開始しました（30分ごと）");
}

/** 過去データ自動収集スケジューラー
 * 毎日深夜2時に前日のレース結果を自動取得する。
 */
function startDataCollectionScheduler() {
  const checkAndRun = async () => {
    const now = new Date();
    // 毎日深夜2時に実行（時到02分以内）
    if (now.getHours() !== 2 || now.getMinutes() > 2) return;

    try {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split("T")[0]; // YYYY-MM-DD
      console.log(`[DataCollect] 前日データ自動取得: ${dateStr}`);
      const { stdout, stderr } = await runScheduledPython("fetch_results.py", ["--date", dateStr]);
      const result = extractLastJson(stdout) as any;
      if (result?.success) {
        console.log(`[DataCollect] 完了: ${result.total}件保存`);
      } else {
        console.warn(`[DataCollect] 失敗: ${stderr}`);
      }
    } catch (e) {
      console.warn("[DataCollect] エラー:", e);
    }
  };

  // 5分ごとに時刼をチェック
  setInterval(checkAndRun, 5 * 60 * 1000);
  console.log("[DataCollect] 過去データ自動収集スケジューラーを開始しました（毎日深夜2時）");
}

/** LINE通知ヘルパー */
async function sendLineNotify(token: string, message: string): Promise<boolean> {
  try {
    const res = await fetch("https://notify-api.line.me/api/notify", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ message }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[LINE] 通知失敗:", e);
    return false;
  }
}

/** DB設定を取得するヘルパー */
async function getAppSetting(key: string): Promise<string | null> {
  try {
    const { default: mysql } = await import("mysql2/promise");
    const conn = await mysql.createConnection(process.env.DATABASE_URL!);
    const [rows] = await conn.execute(
      "SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1",
      [key]
    ) as any;
    await conn.end();
    if (rows && rows.length > 0) return rows[0].setting_value;
    return null;
  } catch (e) {
    return null;
  }
}

/** 目標回収率アラートスケジューラー
 * 毎日夜11時に当月の回収率を確認し、目標を下回っていたらLINE通知する。
 */
function startReturnRateAlertScheduler() {
  const checkAndAlert = async () => {
    const now = new Date();
    // 毎日23時に実行
    if (now.getHours() !== 23 || now.getMinutes() > 5) return;

    try {
      const lineToken = await getAppSetting("line_notify_token");
      const targetRateStr = await getAppSetting("target_return_rate");
      if (!lineToken || !targetRateStr) return;

      const targetRate = parseFloat(targetRateStr);
      if (isNaN(targetRate)) return;

      // 当月の収支を集計
      const { default: mysql } = await import("mysql2/promise");
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      const now2 = new Date();
      const monthStart = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}-01`;
      const [rows] = await conn.execute(
        `SELECT SUM(betAmount) as totalBet, SUM(returnAmount) as totalReturn
         FROM bankroll_history
         WHERE createdAt >= ?`,
        [monthStart]
      ) as any;
      await conn.end();

      if (!rows || rows.length === 0 || !rows[0].totalBet) return;
      const totalBet = parseFloat(rows[0].totalBet) || 0;
      const totalReturn = parseFloat(rows[0].totalReturn) || 0;
      if (totalBet <= 0) return;

      const currentRate = (totalReturn / totalBet) * 100;
      if (currentRate < targetRate) {
        const msg = `\n⚠️ 競艇予想AI 目標回収率アラート\n当月回収率: ${currentRate.toFixed(1)}%\n目標回収率: ${targetRate.toFixed(1)}%\n差分: ${(currentRate - targetRate).toFixed(1)}%\n損切りラインに注意してください。`;
        await sendLineNotify(lineToken, msg);
        console.log(`[ReturnAlert] LINE通知送信: 回収率${currentRate.toFixed(1)}% < 目標${targetRate.toFixed(1)}%`);
      }
    } catch (e) {
      console.warn("[ReturnAlert] エラー:", e);
    }
  };

  setInterval(checkAndAlert, 5 * 60 * 1000);
  console.log("[ReturnAlert] 目標回収率アラートスケジューラーを開始しました（毎日23時）");
}

// Pythonスクリプトの依存パッケージを自動インストール
function ensurePythonDeps() {
  console.log(`[Python] Using project dependencies from ${PYTHON_DEPS_DIR}`);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Python依存パッケージを起動時に確認・インストール
  ensurePythonDeps();

  // バックグラウンドスケジューラーを起動
  startHitCheckScheduler();
  startDataCollectionScheduler();
  startReturnRateAlertScheduler();

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/public-status", (_req, res) => {
    res.json({ ok: true, publicEnabled: isBetakoPublicEnabled() });
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  registerGachaBoatraceRoutes(app);
  // tRPC API

  // ─── /api/schedule (Base44からのスケジュール取得用) ─────────────────────────
  app.get('/api/schedule', async (req: any, res: any) => {
    const date = (req.query.date as string) || new Date().toISOString().slice(0,10).replace(/-/g,'');
    const STADIUM_NAMES: Record<string, string> = {
      '01':'桐生','02':'戸田','03':'江戸川','04':'平和島','05':'多摩川','06':'浜名湖',
      '07':'蒲郡','08':'常滑','09':'津','10':'三国','11':'びわこ','12':'住之江',
      '13':'尼崎','14':'鳴門','15':'丸亀','16':'児島','17':'宮島','18':'徳山',
      '19':'下関','20':'若松','21':'芦屋','22':'福岡','23':'唐津','24':'大村',
    };
    const GRADE_PATTERNS: [RegExp, string][] = [
      [/SG|グランプリ|クラシック|ダービー|メモリアル|チャンピオンシップ|オールスター|グランドチャンピオン|BBCトーナメント|チャレンジカップ/, 'SG'],
      [/周年|総理大臣杯|笹川賞|モーターボート記念|地域対抗|最高峰|王座/, 'G1'],
      [/G2|競艇名人|オーシャン/, 'G2'],
      [/マスターズ|レディース|女子|オールレディース|クイーン|ヴィーナス|カップ|サッポロ|記念|節/, 'G3'],
    ];
    try {
      const url = `https://www.boatrace.jp/owpc/pc/race/index?hd=${date}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
      const html = await response.text();
      const jcdMatches = [...html.matchAll(/jcd=(\d{2})/g)];
      const stadiums = [...new Set(jcdMatches.map((m: RegExpMatchArray) => m[1]))].slice(0, 12);
      const grade_map: Record<string, string> = {};
      for (const sid of stadiums) {
        const escapedSid = sid;
        const raceNameRegex = new RegExp(`jcd=${escapedSid}&amp;hd=${date}">(.*?)<\\/a>`, 'g');
        const nameMatches = [...html.matchAll(raceNameRegex)];
        for (const match of nameMatches) {
          const raceName = match[1];
          for (const [pattern, grade] of GRADE_PATTERNS) {
            if (pattern.test(raceName)) {
              grade_map[sid] = `${grade}（${raceName}）`;
              break;
            }
          }
          if (grade_map[sid]) break;
        }
      }
      res.json({ stadiums, grade_map, stadium_names: STADIUM_NAMES });
    } catch (e: any) {
      res.status(500).json({ error: String(e), stadiums: [], grade_map: {} });
    }
  });


  // ─── /api/racer-course (選手コース別成績取得) ──────────────────────────────
  app.get('/api/racer-course', async (req: any, res: any) => {
    const toban = req.query.toban as string;
    if (!toban) return res.status(400).json({ error: 'toban is required' });
    try {
      const url = `https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=${toban}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(10000)
      });
      const html = await response.text();
      // コース別成績テーブルをパース
      const courseStats: Record<number, { attempts: number; win: number; place2: number; place3: number; winRate: number }> = {};
      // 1コース〜6コースの勝率・連対率を正規表現で抽出
      const tableMatch = html.match(/コース別出走成績[\s\S]*?<\/table>/);
      if (tableMatch) {
        const rows = tableMatch[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
        let courseNum = 1;
        for (const row of rows) {
          const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m =>
            m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()
          );
          if (cells.length >= 4) {
            const attempts = parseInt(cells[0]) || 0;
            const win = parseInt(cells[1]) || 0;
            const winRate = attempts > 0 ? win / attempts : 0;
            const place2 = parseInt(cells[2]) || 0;
            const place3 = parseInt(cells[3]) || 0;
            if (courseNum <= 6) {
              courseStats[courseNum] = { attempts, win, place2, place3, winRate };
              courseNum++;
            }
          }
        }
      }
      // フォールバック: 数値パターンで抽出
      if (Object.keys(courseStats).length === 0) {
        const numPattern = /(\d+(?:\.\d+)?)/g;
        const allNums = [...html.matchAll(/1コース|2コース|3コース|4コース|5コース|6コース/g)];
        res.json({ toban, courseStats: {}, raw_found: allNums.length });
      } else {
        res.json({ toban, courseStats });
      }
    } catch (e: any) {
      res.status(500).json({ error: String(e), toban, courseStats: {} });
    }
  });

  // ─── /api/racelist (出走表取得) ────────────────────────────────────────────
  app.get('/api/racelist', async (req: any, res: any) => {
    const { jcd, hd, rno } = req.query;
    if (!jcd || !hd || !rno) return res.status(400).json({ error: 'jcd, hd, rno are required' });
    try {
      const url = `https://www.boatrace.jp/owpc/pc/race/racelist?jcd=${jcd}&hd=${hd}&rno=${rno}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(15000)
      });
      const html = await response.text();
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ─── /api/beforeinfo (直前情報取得) ───────────────────────────────────────
  app.get('/api/beforeinfo', async (req: any, res: any) => {
    const { jcd, hd, rno } = req.query;
    if (!jcd || !hd || !rno) return res.status(400).json({ error: 'jcd, hd, rno are required' });
    try {
      const url = `https://www.boatrace.jp/owpc/pc/race/beforeinfo?jcd=${jcd}&hd=${hd}&rno=${rno}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(15000)
      });
      const html = await response.text();
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: String(e) });
    }
  });


  // ─── /api/save-prediction (予想をNeonDBのrace_resultsに保存) ───────────────
  app.post('/api/save-prediction', async (req: any, res: any) => {
    const { date, stadiumId, stadiumName, raceNumber, predictedCombos, clientId } = req.body;
    if (!date || !stadiumId || !stadiumName || !raceNumber) {
      return res.status(400).json({ error: 'date, stadiumId, stadiumName, raceNumber are required' });
    }
    try {
      const { savePredictionLog } = await import('../db');
      const id = await savePredictionLog({
        date,
        stadiumId,
        stadiumName,
        raceNumber: String(raceNumber),
        predictions: predictedCombos ? predictedCombos.split(',').map((c: string) => ({ combo: c.trim(), category: 'honsen' })) : [],
        clientId: clientId || '001',
        actualResult: null,
        actualPayout: null,
      });
      res.json({ success: true, id });
    } catch (e: any) {
      console.error('[save-prediction] Error:', e.message);
      res.status(500).json({ success: false, error: String(e.message) });
    }
  });

  // ─── /api/result (レース結果を照合・更新) ────────────────────────────────
  app.post('/api/result', async (req: any, res: any) => {
    const { date, stadiumId, raceNumber } = req.body;
    if (!date || !stadiumId || !raceNumber) {
      return res.status(400).json({ error: 'date, stadiumId, raceNumber are required' });
    }
    try {
      // ボートレース公式から結果取得
      const url = `https://www.boatrace.jp/owpc/pc/race/raceresult?rno=${raceNumber}&jcd=${stadiumId}&hd=${date}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000)
      });
      const html = await response.text();
      
      // 3連単パース
      const trifectaMatch = html.match(/3連単[\s\S]*?(\d)-(\d)-(\d)[\s\S]*?[¥￥]([\d,]+)/);
      let trifectaCombo = null;
      let trifectaPayout = null;
      if (trifectaMatch) {
        trifectaCombo = `${trifectaMatch[1]}-${trifectaMatch[2]}-${trifectaMatch[3]}`;
        trifectaPayout = parseInt(trifectaMatch[4].replace(/,/g, ''));
      }
      
      if (!trifectaCombo) {
        return res.json({ success: false, error: 'result_not_found', date, stadiumId, raceNumber });
      }
      
      res.json({ success: true, trifectaCombo, trifectaPayout, date, stadiumId, raceNumber });
    } catch (e: any) {
      res.status(500).json({ success: false, error: String(e.message) });
    }
  });

  app.use(
    "/api/trpc",
    blockPublicPredictionTrpcWhenDisabled,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
