import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.warn("[Migrate] No DATABASE_URL, skipping migration");
  process.exit(0);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const db = drizzle(pool);
const migrationsFolder = path.join(__dirname, "../drizzle");

try {
  console.log("[Migrate] Running migrations...");
  await migrate(db, { migrationsFolder });
  console.log("[Migrate] Done!");
} catch (e) {
  console.error("[Migrate] Failed:", e.message);
} finally {
  await pool.end();
}
