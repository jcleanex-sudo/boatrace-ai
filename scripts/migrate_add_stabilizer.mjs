/**
 * DBマイグレーション: race_before_info に stabilizer カラムを追加
 */
import { createConnection } from "mysql2/promise";

const conn = await createConnection(process.env.DATABASE_URL);

const columnsToAdd = [
  { name: "stabilizer", sql: "ALTER TABLE `race_before_info` ADD COLUMN `stabilizer` TINYINT DEFAULT 0" },
];

for (const col of columnsToAdd) {
  try {
    await conn.execute(col.sql);
    console.log(`Column ${col.name} added successfully`);
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME" || err.message.includes("Duplicate column")) {
      console.log(`Column ${col.name} already exists, skipping`);
    } else {
      console.error(`Error adding column ${col.name}:`, err.message);
    }
  }
}

await conn.end();
console.log("Migration complete!");
