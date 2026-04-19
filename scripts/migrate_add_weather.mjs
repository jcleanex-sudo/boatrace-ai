#!/usr/bin/env node
/**
 * race_before_infoテーブルに天気情報カラムとstartTimeカラムを追加するマイグレーション
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

const columns = [
  ["weather", "VARCHAR(16)"],
  ["windDirection", "VARCHAR(16)"],
  ["windSpeed", "FLOAT"],
  ["waveHeight", "FLOAT"],
  ["waterTemp", "FLOAT"],
  ["airTemp", "FLOAT"],
  ["startTime", "VARCHAR(8)"],
];

for (const [col, type] of columns) {
  try {
    // カラムが存在するか確認
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'race_before_info' AND COLUMN_NAME = ?`,
      [col]
    );
    if (rows.length > 0) {
      console.log(`Column ${col} already exists, skipping`);
    } else {
      await conn.execute(`ALTER TABLE \`race_before_info\` ADD COLUMN \`${col}\` ${type}`);
      console.log(`Added column: ${col} ${type}`);
    }
  } catch (e) {
    console.error(`Error adding ${col}:`, e.message);
  }
}

await conn.end();
console.log('Migration complete!');
