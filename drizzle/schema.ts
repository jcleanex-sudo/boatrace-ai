import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  real,
  date,
  json,
  bigint,
  numeric,
  smallint,
  serial,
  boolean,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Race Results ─────────────────────────────────────────────────────────────
export const raceResults = pgTable("race_results", {
  id: serial("id").primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: smallint("raceNumber").notNull(),
  boatNumber: smallint("boatNumber").notNull(),
  place: smallint("place"),
  racerNumber: integer("racerNumber"),
  startTiming: real("startTiming"),
  trifectaCombo: varchar("trifectaCombo", { length: 10 }),
  trifectaPayout: integer("trifectaPayout"),
  exactaCombo: varchar("exactaCombo", { length: 10 }),
  exactaPayout: integer("exactaPayout"),
  trioCombo: varchar("trioCombo", { length: 10 }),
  trioPayout: integer("trioPayout"),
  quinellaCombo: varchar("quinellaCombo", { length: 10 }),
  quinellaPayout: integer("quinellaPayout"),
  winCombo: varchar("winCombo", { length: 5 }),
  winPayout: integer("winPayout"),
  placeCombo: varchar("placeCombo", { length: 5 }),
  placePayout: integer("placePayout"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RaceResult = typeof raceResults.$inferSelect;
export type InsertRaceResult = typeof raceResults.$inferInsert;

// ─── Race Entries ─────────────────────────────────────────────────────────────
export const raceEntries = pgTable("race_entries", {
  id: serial("id").primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: smallint("raceNumber").notNull(),
  boatNumber: smallint("boatNumber").notNull(),
  racerNumber: integer("racerNumber"),
  racerName: varchar("racerName", { length: 64 }),
  racerClass: varchar("racerClass", { length: 4 }),
  age: smallint("age"),
  weight: real("weight"),
  branch: varchar("branch", { length: 32 }),
  birthPlace: varchar("birthPlace", { length: 32 }),
  nationalWinRate: real("nationalWinRate"),
  national2Rate: real("national2Rate"),
  national3Rate: real("national3Rate"),
  localWinRate: real("localWinRate"),
  local2Rate: real("local2Rate"),
  motorNumber: integer("motorNumber"),
  motor2Rate: real("motor2Rate"),
  motor3Rate: real("motor3Rate"),
  boatNumber2: integer("boatNumber2"),
  boat2Rate: real("boat2Rate"),
  avgSt: real("avgSt"),
  flyingCount: smallint("flyingCount"),
  lateCount: smallint("lateCount"),
  sessionResults: varchar("sessionResults", { length: 64 }),
  weather: varchar("weather", { length: 16 }),
  windDirection: varchar("windDirection", { length: 16 }),
  windSpeed: real("windSpeed"),
  waveHeight: real("waveHeight"),
  waterTemp: real("waterTemp"),
  airTemp: real("airTemp"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RaceEntry = typeof raceEntries.$inferSelect;
export type InsertRaceEntry = typeof raceEntries.$inferInsert;

// ─── Race Before Info ─────────────────────────────────────────────────────────
export const raceBeforeInfo = pgTable("race_before_info", {
  id: serial("id").primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: smallint("raceNumber").notNull(),
  boatNumber: smallint("boatNumber").notNull(),
  exhibitionTime: real("exhibitionTime"),
  circuitTime: real("circuitTime"),
  tilt: real("tilt"),
  trifectaOdds: json("trifectaOdds"),
  winOdds: real("winOdds"),
  startCourse: smallint("startCourse"),
  weather: varchar("weather", { length: 16 }),
  windDirection: varchar("windDirection", { length: 16 }),
  windSpeed: real("windSpeed"),
  waveHeight: real("waveHeight"),
  waterTemp: real("waterTemp"),
  airTemp: real("airTemp"),
  startTime: varchar("startTime", { length: 8 }),
  stabilizer: smallint("stabilizer").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RaceBeforeInfo = typeof raceBeforeInfo.$inferSelect;
export type InsertRaceBeforeInfo = typeof raceBeforeInfo.$inferInsert;

// ─── Prediction Logs ─────────────────────────────────────────────────────────
export const predictionLogs = pgTable("prediction_logs", {
  id: serial("id").primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: smallint("raceNumber").notNull(),
  predictions: json("predictions").notNull(),
  modelVersion: varchar("modelVersion", { length: 32 }),
  betAmount: integer("betAmount"),
  actualResult: varchar("actualResult", { length: 10 }),
  isHit: smallint("isHit"),
  payout: integer("payout"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PredictionLog = typeof predictionLogs.$inferSelect;
export type InsertPredictionLog = typeof predictionLogs.$inferInsert;

// ─── Bankroll ─────────────────────────────────────────────────────────────────
export const bankroll = pgTable("bankroll", {
  id: serial("id").primaryKey(),
  raceDate: date("raceDate").notNull().unique(),
  totalBet: integer("totalBet").default(0).notNull(),
  totalPayout: integer("totalPayout").default(0).notNull(),
  totalRaces: integer("totalRaces").default(0).notNull(),
  hitRaces: integer("hitRaces").default(0).notNull(),
  returnRate: real("returnRate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Bankroll = typeof bankroll.$inferSelect;
export type InsertBankroll = typeof bankroll.$inferInsert;

// ─── Data Fetch Logs ─────────────────────────────────────────────────────────
export const dataFetchLogs = pgTable("data_fetch_logs", {
  id: serial("id").primaryKey(),
  fetchType: varchar("fetchType", { length: 32 }).notNull(),
  targetDate: date("targetDate"),
  stadiumId: varchar("stadiumId", { length: 2 }),
  raceNumber: smallint("raceNumber"),
  status: varchar("status", { length: 16 }).notNull(),
  rowsAffected: integer("rowsAffected"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DataFetchLog = typeof dataFetchLogs.$inferSelect;
export type InsertDataFetchLog = typeof dataFetchLogs.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("settingKey", { length: 64 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

// ─── Skip History ─────────────────────────────────────────────────────────────
export const skipHistory = pgTable("skip_history", {
  id: serial("id").primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }).notNull(),
  raceNumber: smallint("raceNumber").notNull(),
  skipReason: text("skipReason"),
  actualResult: varchar("actualResult", { length: 10 }),
  actualPayout: integer("actualPayout"),
  predictedCombos: json("predictedCombos"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SkipHistory = typeof skipHistory.$inferSelect;
export type InsertSkipHistory = typeof skipHistory.$inferInsert;

// ─── Bankroll Conditions ──────────────────────────────────────────────────────
export const bankrollConditions = pgTable("bankroll_conditions", {
  id: serial("id").primaryKey(),
  raceDate: date("raceDate").notNull(),
  stadiumId: varchar("stadiumId", { length: 2 }),
  weather: varchar("weather", { length: 16 }),
  windSpeed: real("windSpeed"),
  waveHeight: real("waveHeight"),
  totalBet: integer("totalBet").default(0),
  totalPayout: integer("totalPayout").default(0),
  totalRaces: integer("totalRaces").default(0),
  hitRaces: integer("hitRaces").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BankrollCondition = typeof bankrollConditions.$inferSelect;
export type InsertBankrollCondition = typeof bankrollConditions.$inferInsert;
