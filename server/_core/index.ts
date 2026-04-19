import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { execSync, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

const execFileAsync = promisify(execFile);
const SCRIPTS_DIR = path.resolve(process.cwd(), "scripts");
const PYTHON_BIN = "/usr/bin/python3.11";

/** Pythonスクリプトを実行する共通ヘルパー */
async function runScheduledPython(script: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = path.join(SCRIPTS_DIR, script);
  const env: Record<string, string> = {
    PATH: "/usr/bin:/bin:/usr/local/bin",
    HOME: process.env.HOME || "/home/ubuntu",
    TMPDIR: process.env.TMPDIR || "/tmp",
    PYTHONNOUSERSITE: "1",
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
  const reqFile = path.resolve(process.cwd(), "scripts/requirements.txt");
  try {
    execSync(`sudo pip3 install -q -r "${reqFile}"`, { stdio: "pipe" });
    console.log("[Python] Dependencies verified.");
  } catch (e) {
    console.warn("[Python] Failed to install dependencies:", (e as Error).message);
  }
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
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
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
