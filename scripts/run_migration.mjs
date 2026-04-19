#!/usr/bin/env node
/**
 * マイグレーションSQLをDBに適用するスクリプト
 */
import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql1 = `
CREATE TABLE IF NOT EXISTS \`app_settings\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`settingKey\` varchar(64) NOT NULL,
  \`settingValue\` text,
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`app_settings_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`app_settings_settingKey_unique\` UNIQUE(\`settingKey\`)
)
`;

const sql2 = `
CREATE TABLE IF NOT EXISTS \`skip_history\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`raceDate\` date NOT NULL,
  \`stadiumId\` varchar(2) NOT NULL,
  \`raceNumber\` tinyint NOT NULL,
  \`skipReason\` text,
  \`actualResult\` varchar(10),
  \`actualPayout\` int,
  \`predictedCombos\` json,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`skip_history_id\` PRIMARY KEY(\`id\`)
)
`;

const conn = await mysql.createConnection(dbUrl);
try {
  await conn.execute(sql1);
  console.log('Created app_settings table');
  await conn.execute(sql2);
  console.log('Created skip_history table');
} finally {
  await conn.end();
}
