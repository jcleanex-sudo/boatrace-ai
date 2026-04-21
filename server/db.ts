import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users, raceEntries, raceBeforeInfo, predictionLogs, dataFetchLogs, raceResults, bankroll } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle<any>> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Race Entries ─────────────────────────────────────────────────────────────
export async function getRaceEntries(raceDate: string, stadiumId: string, raceNumber: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(raceEntries).where(
    and(
      sql`TO_CHAR(${raceEntries.raceDate}, 'YYYYMMDD') = ${raceDate}`,
      eq(raceEntries.stadiumId, stadiumId),
      eq(raceEntries.raceNumber, raceNumber)
    )
  ).orderBy(raceEntries.boatNumber);
}

// ─── Race Before Info ─────────────────────────────────────────────────────────
export async function getRaceBeforeInfo(raceDate: string, stadiumId: string, raceNumber: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(raceBeforeInfo).where(
    and(
      sql`TO_CHAR(${raceBeforeInfo.raceDate}, 'YYYYMMDD') = ${raceDate}`,
      eq(raceBeforeInfo.stadiumId, stadiumId),
      eq(raceBeforeInfo.raceNumber, raceNumber)
    )
  ).orderBy(raceBeforeInfo.boatNumber);
}

// ─── Prediction Logs ──────────────────────────────────────────────────────────
export async function savePredictionLog(data: {
  raceDate: string;
  stadiumId: string;
  raceNumber: number;
  predictions: unknown;
  modelVersion?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(predictionLogs).values({
    raceDate: new Date(data.raceDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')),
    stadiumId: data.stadiumId,
    raceNumber: data.raceNumber,
    predictions: data.predictions,
    modelVersion: data.modelVersion,
  });
  // insertIdを返す
  const insertId = (result as any)[0]?.insertId ?? null;
  return insertId;
}

export async function getPredictionHistory(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(predictionLogs).orderBy(desc(predictionLogs.createdAt)).limit(limit);
}

// 指定日の的中率サマリーを取得
export async function getDailyHitSummary(raceDate: string) {
  const db = await getDb();
  if (!db) return null;

  // raceDate: YYYYMMDD形式
  const rows = await db.select().from(predictionLogs).where(
    sql`TO_CHAR(${predictionLogs.raceDate}, 'YYYYMMDD') = ${raceDate}`
  ).orderBy(desc(predictionLogs.createdAt));

  const total = rows.length;
  const judged = rows.filter(r => r.isHit !== null).length;
  const hits = rows.filter(r => r.isHit === 1).length;
  const totalPayout = rows.reduce((sum, r) => sum + (r.payout ?? 0), 0);
  const hitRate = judged > 0 ? Math.round((hits / judged) * 1000) / 10 : null;

  return {
    total,
    judged,
    hits,
    hitRate,
    totalPayout,
    logs: rows,
  };
}

// ─── Data Status ──────────────────────────────────────────────────────────────
export async function getDataStatus() {
  const db = await getDb();
  if (!db) return { resultsCount: 0, entriesCount: 0, beforeInfoCount: 0, lastResultDate: null };

  const [resultsCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(raceResults);
  const [entriesCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(raceEntries);
  const [beforeInfoCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(raceBeforeInfo);
  const [lastResult] = await db.select({ maxDate: sql<string>`MAX(raceDate)` }).from(raceResults);

  return {
    resultsCount: Number(resultsCount?.count ?? 0),
    entriesCount: Number(entriesCount?.count ?? 0),
    beforeInfoCount: Number(beforeInfoCount?.count ?? 0),
    lastResultDate: lastResult?.maxDate ?? null,
  };
}

// ─── Data Fetch Logs ──────────────────────────────────────────────────────────
export async function logDataFetch(data: {
  fetchType: string;
  targetDate?: string;
  stadiumId?: string;
  raceNumber?: number;
  status: string;
  rowsAffected?: number;
  errorMessage?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(dataFetchLogs).values({
    fetchType: data.fetchType,
    targetDate: data.targetDate ? (() => {
      const d = data.targetDate!;
      // YYYYMMDD形式 or YYYY-MM-DD形式どちらにも対応
      if (/^\d{8}$/.test(d)) {
        return new Date(d.substring(0,4) + '-' + d.substring(4,6) + '-' + d.substring(6,8));
      }
      return new Date(d);
    })() : undefined,
    stadiumId: data.stadiumId,
    raceNumber: data.raceNumber,
    status: data.status,
    rowsAffected: data.rowsAffected,
    errorMessage: data.errorMessage,
  });
}

// ─── Bankroll (収支管理) ──────────────────────────────────────────────────────

/** 予想ログに賭け金を記録 */
export async function updatePredictionBet(logId: number, betAmount: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(predictionLogs)
    .set({ betAmount })
    .where(eq(predictionLogs.id, logId));
}

/** 日別収支をupsert（INSERT OR UPDATE） */
export async function upsertBankroll(raceDate: string) {
  const db = await getDb();
  if (!db) return null;

  // 当日の予想ログを集計
  const rows = await db.select().from(predictionLogs).where(
    sql`TO_CHAR(${predictionLogs.raceDate}, 'YYYYMMDD') = ${raceDate}`
  );

  const totalBet = rows.reduce((sum, r) => sum + (r.betAmount ?? 0), 0);
  const totalPayout = rows.reduce((sum, r) => sum + (r.payout ?? 0), 0);
  const totalRaces = rows.length;
  const hitRaces = rows.filter(r => r.isHit === 1).length;
  const returnRate = totalBet > 0 ? Math.round((totalPayout / totalBet) * 1000) / 10 : null;

  // raceDate を Date 型に変換
  const raceDateObj = new Date(
    parseInt(raceDate.substring(0, 4)),
    parseInt(raceDate.substring(4, 6)) - 1,
    parseInt(raceDate.substring(6, 8))
  );

  // UPSERT: 既存なら UPDATE、なければ INSERT
  await db.insert(bankroll).values({
    raceDate: raceDateObj,
    totalBet,
    totalPayout,
    totalRaces,
    hitRaces,
    returnRate: returnRate ?? undefined,
  }).onDuplicateKeyUpdate({
    set: { totalBet, totalPayout, totalRaces, hitRaces, returnRate: returnRate ?? undefined },
  });

  return { raceDate, totalBet, totalPayout, totalRaces, hitRaces, returnRate };
}

/** 収支履歴を取得（直近N日） */
export async function getBankrollHistory(days: number = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bankroll)
    .orderBy(desc(bankroll.raceDate))
    .limit(days);
}

/** 累計収支サマリーを取得 */
export async function getBankrollSummary() {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({
    totalBet: sql<number>`SUM(totalBet)`,
    totalPayout: sql<number>`SUM(totalPayout)`,
    totalRaces: sql<number>`SUM(totalRaces)`,
    hitRaces: sql<number>`SUM(hitRaces)`,
    days: sql<number>`COUNT(*)`,
  }).from(bankroll);
  if (!row) return null;
  const totalBet = Number(row.totalBet ?? 0);
  const totalPayout = Number(row.totalPayout ?? 0);
  const totalRaces = Number(row.totalRaces ?? 0);
  const hitRaces = Number(row.hitRaces ?? 0);
  const days = Number(row.days ?? 0);
  return {
    totalBet,
    totalPayout,
    totalRaces,
    hitRaces,
    days,
    returnRate: totalBet > 0 ? Math.round((totalPayout / totalBet) * 1000) / 10 : null,
    hitRate: totalRaces > 0 ? Math.round((hitRaces / totalRaces) * 1000) / 10 : null,
    profit: totalPayout - totalBet,
  };
}

/** 現在の資金残高を取得（累計払戻 - 累計賭け金） */
export async function getCurrentBankrollBalance() {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({
    totalBet: sql<number>`SUM(totalBet)`,
    totalPayout: sql<number>`SUM(totalPayout)`,
  }).from(bankroll);
  if (!row) return 0;
  const totalBet = Number(row.totalBet ?? 0);
  const totalPayout = Number(row.totalPayout ?? 0);
  return totalPayout - totalBet;
}

/** 条件別収支集計（競艇場別・レース番号別・天候別） */
export async function getBankrollByCondition() {
  const db = await getDb();
  if (!db) return { byStadium: [], byRaceNumber: [], byWeather: [] };

  // 競艇場別
  const byStadium = await db.select({
    stadiumId: predictionLogs.stadiumId,
    totalBet: sql<number>`SUM(${predictionLogs.betAmount})`,
    totalPayout: sql<number>`SUM(${predictionLogs.payout})`,
    totalRaces: sql<number>`COUNT(*)`,
    hitRaces: sql<number>`SUM(CASE WHEN ${predictionLogs.isHit} = 1 THEN 1 ELSE 0 END)`,
  }).from(predictionLogs)
    .where(sql`${predictionLogs.betAmount} IS NOT NULL AND ${predictionLogs.betAmount} > 0`)
    .groupBy(predictionLogs.stadiumId)
    .orderBy(sql`SUM(${predictionLogs.betAmount}) DESC`);

  // レース番号別
  const byRaceNumber = await db.select({
    raceNumber: predictionLogs.raceNumber,
    totalBet: sql<number>`SUM(${predictionLogs.betAmount})`,
    totalPayout: sql<number>`SUM(${predictionLogs.payout})`,
    totalRaces: sql<number>`COUNT(*)`,
    hitRaces: sql<number>`SUM(CASE WHEN ${predictionLogs.isHit} = 1 THEN 1 ELSE 0 END)`,
  }).from(predictionLogs)
    .where(sql`${predictionLogs.betAmount} IS NOT NULL AND ${predictionLogs.betAmount} > 0`)
    .groupBy(predictionLogs.raceNumber)
    .orderBy(predictionLogs.raceNumber);

  return {
    byStadium: byStadium.map(r => ({
      stadiumId: r.stadiumId,
      totalBet: Number(r.totalBet ?? 0),
      totalPayout: Number(r.totalPayout ?? 0),
      totalRaces: Number(r.totalRaces ?? 0),
      hitRaces: Number(r.hitRaces ?? 0),
      returnRate: Number(r.totalBet ?? 0) > 0
        ? Math.round((Number(r.totalPayout ?? 0) / Number(r.totalBet ?? 0)) * 1000) / 10
        : null,
    })),
    byRaceNumber: byRaceNumber.map(r => ({
      raceNumber: r.raceNumber,
      totalBet: Number(r.totalBet ?? 0),
      totalPayout: Number(r.totalPayout ?? 0),
      totalRaces: Number(r.totalRaces ?? 0),
      hitRaces: Number(r.hitRaces ?? 0),
      returnRate: Number(r.totalBet ?? 0) > 0
        ? Math.round((Number(r.totalPayout ?? 0) / Number(r.totalBet ?? 0)) * 1000) / 10
        : null,
    })),
    byWeather: [],  // 天候別は直前情報テーブルとのJOINが必要なため将来実装
  };
}

// ─── App Settings ─────────────────────────────────────────────────────────────
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const { appSettings } = await import("../drizzle/schema");
  const rows = await db.select().from(appSettings).where(sql`${appSettings.settingKey} = ${key}`).limit(1);
  return rows[0]?.settingValue ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { appSettings } = await import("../drizzle/schema");
  await db.insert(appSettings).values({ settingKey: key, settingValue: value })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const { appSettings } = await import("../drizzle/schema");
  const rows = await db.select().from(appSettings);
  return Object.fromEntries(rows.map(r => [r.settingKey, r.settingValue ?? ""]));
}

// ─── Skip History ─────────────────────────────────────────────────────────────
export async function saveSkipHistory(data: {
  raceDate: string;
  stadiumId: string;
  raceNumber: number;
  skipReason: string;
  predictedCombos?: unknown;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const { skipHistory } = await import("../drizzle/schema");
  const result = await db.insert(skipHistory).values({
    raceDate: new Date(data.raceDate),
    stadiumId: data.stadiumId,
    raceNumber: data.raceNumber,
    skipReason: data.skipReason,
    predictedCombos: data.predictedCombos ?? null,
  });
  return (result[0] as { insertId?: number })?.insertId ?? 0;
}

export async function getSkipHistory(limit: number = 50): Promise<unknown[]> {
  const db = await getDb();
  if (!db) return [];
  const { skipHistory } = await import("../drizzle/schema");
  return db.select().from(skipHistory).orderBy(sql`${skipHistory.createdAt} DESC`).limit(limit);
}

export async function updateSkipHistoryResult(id: number, actualResult: string, actualPayout: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { skipHistory } = await import("../drizzle/schema");
  await db.update(skipHistory).set({ actualResult, actualPayout }).where(sql`${skipHistory.id} = ${id}`);
}

// ─── Weather-based Analytics ──────────────────────────────────────────────────
export async function getBankrollByWeather(): Promise<unknown[]> {
  const db = await getDb();
  if (!db) return [];
  // race_before_infoとprediction_logsをJOINして天候別集計
  const result = await db.execute(sql`
    SELECT
      COALESCE(rb.weather, '不明') AS weather,
      COUNT(*) AS totalRaces,
      SUM(CASE WHEN pl.betAmount IS NOT NULL AND pl.betAmount > 0 THEN pl.betAmount ELSE 0 END) AS totalBet,
      SUM(CASE WHEN pl.payout IS NOT NULL THEN pl.payout ELSE 0 END) AS totalPayout,
      SUM(CASE WHEN pl.isHit = 1 THEN 1 ELSE 0 END) AS hitRaces
    FROM prediction_logs pl
    LEFT JOIN race_before_info rb
      ON pl.raceDate = rb.raceDate
      AND pl.stadiumId = rb.stadiumId
      AND pl.raceNumber = rb.raceNumber
      AND rb.boatNumber = 1
    WHERE pl.betAmount IS NOT NULL AND pl.betAmount > 0
    GROUP BY COALESCE(rb.weather, '不明')
    ORDER BY totalBet DESC
  `);
  const rows = Array.isArray(result[0]) ? (result[0] as unknown[]) : [];
  return (rows as Array<Record<string, unknown>>).map(r => ({
    weather: r.weather,
    totalBet: Number(r.totalBet ?? 0),
    totalPayout: Number(r.totalPayout ?? 0),
    totalRaces: Number(r.totalRaces ?? 0),
    hitRaces: Number(r.hitRaces ?? 0),
    returnRate: Number(r.totalBet ?? 0) > 0
      ? Math.round((Number(r.totalPayout ?? 0) / Number(r.totalBet ?? 0)) * 1000) / 10
      : null,
  }));
}

// 指定日にデータが存在する場・レース一覧を返す（おすすめレース用）
export async function getAvailableRacesForDate(raceDate: string): Promise<Array<{
  stadiumId: string;
  stadiumName: string;
  raceNumber: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT DISTINCT
      rb.stadiumId,
      rb.raceNumber
    FROM race_before_info rb
    WHERE rb.raceDate = ${raceDate}
    ORDER BY rb.stadiumId, rb.raceNumber
  `);
  const rows = Array.isArray(result[0]) ? (result[0] as unknown[]) : [];
  const STADIUM_NAMES: Record<string, string> = {
    "01": "桐生", "02": "戸田", "03": "江戸川", "04": "平和島", "05": "多摩川",
    "06": "浜名湖", "07": "蒲郡", "08": "常滑", "09": "津", "10": "三国",
    "11": "びわこ", "12": "住之江", "13": "尼崎", "14": "鳴門", "15": "丸亀",
    "16": "児島", "17": "宮島", "18": "徳山", "19": "下関", "20": "若松",
    "21": "芦屋", "22": "福岡", "23": "唐津", "24": "大村",
  };
  return (rows as Array<Record<string, unknown>>).map(r => ({
    stadiumId: String(r.stadiumId ?? ""),
    stadiumName: STADIUM_NAMES[String(r.stadiumId ?? "")] ?? String(r.stadiumId ?? ""),
    raceNumber: Number(r.raceNumber ?? 1),
  }));
}
