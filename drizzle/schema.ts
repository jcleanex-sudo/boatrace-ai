import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  tinyint,
  date,
  json,
  bigint,
  decimal,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Race Results (Boatrace Open API) ────────────────────────────────────────
export const raceResults = mysqlTable("race_results", {
  id: int("id").autoincrement().primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),   // 01〜24
  raceNumber: tinyint("raceNumber").notNull(),                 // 1〜12
  boatNumber: tinyint("boatNumber").notNull(),                 // 1〜6
  place: tinyint("place"),                                     // 着順 (null=失格等)
  racerNumber: int("racerNumber"),
  startTiming: float("startTiming"),                          // STタイム (秒)
  // 払戻金 (3連単・2連単・3連複・2連複・単勝・複勝)
  trifectaCombo: varchar("trifectaCombo", { length: 10 }),    // 例: "1-2-3"
  trifectaPayout: int("trifectaPayout"),
  exactaCombo: varchar("exactaCombo", { length: 10 }),
  exactaPayout: int("exactaPayout"),
  trioCombo: varchar("trioCombo", { length: 10 }),
  trioPayout: int("trioPayout"),
  quinellaCombo: varchar("quinellaCombo", { length: 10 }),
  quinellaPayout: int("quinellaPayout"),
  winCombo: varchar("winCombo", { length: 5 }),
  winPayout: int("winPayout"),
  placeCombo: varchar("placeCombo", { length: 5 }),
  placePayout: int("placePayout"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RaceResult = typeof raceResults.$inferSelect;
export type InsertRaceResult = typeof raceResults.$inferInsert;

// ─── Race Entries (出走表) ────────────────────────────────────────────────────
export const raceEntries = mysqlTable("race_entries", {
  id: int("id").autoincrement().primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: tinyint("raceNumber").notNull(),
  boatNumber: tinyint("boatNumber").notNull(),               // 枠番 1〜6
  racerNumber: int("racerNumber"),
  racerName: varchar("racerName", { length: 64 }),
  racerClass: varchar("racerClass", { length: 4 }),          // A1/A2/B1/B2
  age: tinyint("age"),
  weight: float("weight"),                                   // 体重(kg)
  branch: varchar("branch", { length: 32 }),                 // 支部
  birthPlace: varchar("birthPlace", { length: 32 }),         // 出身地
  // 全国成績
  nationalWinRate: float("nationalWinRate"),                 // 全国勝率
  national2Rate: float("national2Rate"),                     // 全国2連率
  national3Rate: float("national3Rate"),                     // 全国3連率
  // 当地成績
  localWinRate: float("localWinRate"),                       // 当地勝率
  local2Rate: float("local2Rate"),                           // 当地2連率
  // モーター・ボート
  motorNumber: int("motorNumber"),
  motor2Rate: float("motor2Rate"),                           // モーター2連率
  motor3Rate: float("motor3Rate"),                           // モーター3連率
  boatNumber2: int("boatNumber2"),                           // ボート番号
  boat2Rate: float("boat2Rate"),                             // ボート2連率
  // スタート・フライング
  avgSt: float("avgSt"),                                     // 平均ST
  flyingCount: tinyint("flyingCount"),                       // F回数
  lateCount: tinyint("lateCount"),                           // L回数
  // 今節成績
  sessionResults: varchar("sessionResults", { length: 64 }), // 今節の着順文字列
  // 天候・環境
  weather: varchar("weather", { length: 16 }),
  windDirection: varchar("windDirection", { length: 16 }),
  windSpeed: float("windSpeed"),
  waveHeight: float("waveHeight"),
  waterTemp: float("waterTemp"),
  airTemp: float("airTemp"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RaceEntry = typeof raceEntries.$inferSelect;
export type InsertRaceEntry = typeof raceEntries.$inferInsert;

// ─── Race Before Info (直前情報) ──────────────────────────────────────────────
export const raceBeforeInfo = mysqlTable("race_before_info", {
  id: int("id").autoincrement().primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: tinyint("raceNumber").notNull(),
  boatNumber: tinyint("boatNumber").notNull(),
  // 展示情報
  exhibitionTime: float("exhibitionTime"),                   // 展示タイム
  circuitTime: float("circuitTime"),                         // 周回タイム
  tilt: float("tilt"),                                       // チルト角度
  // 直前オッズ (3連単上位)
  trifectaOdds: json("trifectaOdds"),                        // {combo: odds} マップ
  winOdds: float("winOdds"),                                 // 単勝オッズ
  // 直前コース
  startCourse: tinyint("startCourse"),                       // 実際のスタートコース
  // 天気情報（直前情報ページから取得）
  weather: varchar("weather", { length: 16 }),               // 天候
  windDirection: varchar("windDirection", { length: 16 }),   // 風向
  windSpeed: float("windSpeed"),                             // 風速(m/s)
  waveHeight: float("waveHeight"),                           // 波高(cm)
  waterTemp: float("waterTemp"),                             // 水温(℃)
  airTemp: float("airTemp"),                                 // 気温(℃)
  // スタート展示タイム
  startTime: varchar("startTime", { length: 8 }),            // スタートタイム (F.01, .12, L.01等)
  // 安定板
  stabilizer: tinyint("stabilizer").default(0),              // 安定板使用=1, なし=0
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RaceBeforeInfo = typeof raceBeforeInfo.$inferSelect;
export type InsertRaceBeforeInfo = typeof raceBeforeInfo.$inferInsert;

/// ─── Prediction Logs ─────────────────────────────────────────────────────
export const predictionLogs = mysqlTable("prediction_logs", {
  id: int("id").autoincrement().primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: tinyint("raceNumber").notNull(),
  // 予想結果 (3連単回6点)
  predictions: json("predictions").notNull(),                // [{combo, probability, odds, ev, betAmount}]
  modelVersion: varchar("modelVersion", { length: 32 }),
  // 賭け金情報
  betAmount: int("betAmount"),                               // 実際に賭けた合計金額(円)
  // 的中結果 (レース後に更新)
  actualResult: varchar("actualResult", { length: 10 }),     // 実際の3連単
  isHit: tinyint("isHit"),                                   // 的中=1
  payout: int("payout"),                                     // 払戻金
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PredictionLog = typeof predictionLogs.$inferSelect;
export type InsertPredictionLog = typeof predictionLogs.$inferInsert;

// ─── Bankroll (収支管理) ───────────────────────────────────────────────
export const bankroll = mysqlTable("bankroll", {
  id: int("id").autoincrement().primaryKey(),
  raceDate: date("raceDate").notNull().unique(),             // 日別集計
  totalBet: int("totalBet").default(0).notNull(),            // 当日合計賭け金(円)
  totalPayout: int("totalPayout").default(0).notNull(),      // 当日合計払戻(円)
  totalRaces: int("totalRaces").default(0).notNull(),        // 予想レース数
  hitRaces: int("hitRaces").default(0).notNull(),            // 的中レース数
  returnRate: float("returnRate"),                           // 回収率(%) = totalPayout/totalBet*100
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Bankroll = typeof bankroll.$inferSelect;
export type InsertBankroll = typeof bankroll.$inferInsert;

// ─── Data Fetch Logs ─────────────────────────────────────────────────────────
export const dataFetchLogs = mysqlTable("data_fetch_logs", {
  id: int("id").autoincrement().primaryKey(),
  fetchType: varchar("fetchType", { length: 32 }).notNull(), // "results"|"racecard"|"beforeinfo"
  targetDate: date("targetDate"),
  stadiumId: varchar("stadiumId", { length: 2 }),
  raceNumber: tinyint("raceNumber"),
  status: varchar("status", { length: 16 }).notNull(),       // "success"|"error"|"running"
  rowsAffected: int("rowsAffected"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DataFetchLog = typeof dataFetchLogs.$inferSelect;
export type InsertDataFetchLog = typeof dataFetchLogs.$inferInsert;

// ─── App Settings (アプリ設定) ──────────────────────────────────────────
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 64 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

// ─── Skip History (見送り履歴) ─────────────────────────────────────────
export const skipHistory = mysqlTable("skip_history", {
  id: int("id").autoincrement().primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: tinyint("raceNumber").notNull(),
  skipReason: text("skipReason"),
  // レース後に判明した実際結果
  actualResult: varchar("actualResult", { length: 10 }),
  actualPayout: int("actualPayout"),
  // 見送りした予想組み合わせ（後から確認用）
  predictedCombos: json("predictedCombos"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SkipHistory = typeof skipHistory.$inferSelect;
export type InsertSkipHistory = typeof skipHistory.$inferInsert;

// ─── Odds History (オッズ変動履歴) ─────────────────────────────────────────
export const oddsHistory = mysqlTable("odds_history", {
  id: int("id").autoincrement().primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: tinyint("raceNumber").notNull(),
  combo: varchar("combo", { length: 10 }).notNull(),  // 例: "1-2-3"
  odds: decimal("odds", { precision: 8, scale: 1 }).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type OddsHistory = typeof oddsHistory.$inferSelect;
export type InsertOddsHistory = typeof oddsHistory.$inferInsert;
