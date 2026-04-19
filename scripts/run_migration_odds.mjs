import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const sql = readFileSync(new URL("../drizzle/0006_magical_riptide.sql", import.meta.url), "utf8");

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    console.log("Executing:", stmt.slice(0, 60) + "...");
    await conn.execute(stmt);
  }
  console.log("Migration completed successfully!");
} catch (err) {
  if (err.code === "ER_TABLE_EXISTS_ERROR") {
    console.log("Table already exists, skipping.");
  } else {
    console.error("Migration error:", err.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}
