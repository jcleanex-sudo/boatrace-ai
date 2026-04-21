import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import path from "path";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.warn("[Migrate] No DATABASE_URL, skipping migration");
  process.exit(0);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();

try {
  console.log("[Migrate] Running migrations...");

  // 初期SQL実行
  const sql = readFileSync(path.join(__dirname, "../drizzle/0000_init_postgres.sql"), "utf-8");
  const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch (e) {
      if (!e.message.includes("already exists")) {
        console.warn("[Migrate] Warning:", e.message.substring(0, 100));
      }
    }
  }

  // data_fetch_logsのカラム補完（既存DBにtargetDateがない場合）
  const alterStatements = [
    `ALTER TABLE data_fetch_logs ADD COLUMN IF NOT EXISTS "targetDate" date`,
    `ALTER TABLE data_fetch_logs ADD COLUMN IF NOT EXISTS "raceNumber" smallint`,
    `ALTER TABLE data_fetch_logs ADD COLUMN IF NOT EXISTS "rowsAffected" integer`,
    `ALTER TABLE data_fetch_logs ADD COLUMN IF NOT EXISTS "errorMessage" text`,
    `ALTER TABLE data_fetch_logs ADD COLUMN IF NOT EXISTS "stadiumId" varchar(2)`,
    `ALTER TABLE data_fetch_logs ALTER COLUMN "status" SET DEFAULT 'running'`,
  ];

  for (const stmt of alterStatements) {
    try {
      await client.query(stmt);
      console.log("[Migrate] OK:", stmt.substring(0, 60));
    } catch (e) {
      console.warn("[Migrate] Skip:", e.message.substring(0, 80));
    }
  }

  console.log("[Migrate] Done!");
} catch (e) {
  console.error("[Migrate] Failed:", e.message);
} finally {
  client.release();
  await pool.end();
}
