import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/boatrace-ai/.env' });

const sql = readFileSync('/home/ubuntu/boatrace-ai/drizzle/0004_nosy_pixie.sql', 'utf8');
const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  console.log('Executing:', stmt.substring(0, 60) + '...');
  try {
    await conn.execute(stmt);
    console.log('✓ OK');
  } catch (e) {
    if (e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠ Already exists, skipping');
    } else {
      throw e;
    }
  }
}
await conn.end();
console.log('Migration complete!');
