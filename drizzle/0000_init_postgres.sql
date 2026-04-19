CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "openId" varchar(64) NOT NULL,
  "name" text,
  "email" varchar(320),
  "loginMethod" varchar(64),
  "role" varchar(10) NOT NULL DEFAULT 'user',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "lastSignedIn" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "users_openId_unique" UNIQUE("openId")
);

CREATE TABLE IF NOT EXISTS "race_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "raceDate" date NOT NULL,
  "stadiumId" varchar(10) NOT NULL,
  "raceNumber" integer NOT NULL,
  "boatNumber" integer NOT NULL,
  "place" integer,
  "racerNumber" varchar(10),
  "startTiming" real,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "race_entries" (
  "id" serial PRIMARY KEY NOT NULL,
  "raceDate" date NOT NULL,
  "stadiumId" varchar(10) NOT NULL,
  "raceNumber" integer NOT NULL,
  "boatNumber" integer NOT NULL,
  "racerNumber" varchar(10),
  "racerName" varchar(50),
  "racerClass" varchar(10),
  "age" integer,
  "weight" real,
  "branch" varchar(20),
  "nationalWinRate" real,
  "national2Rate" real,
  "localWinRate" real,
  "motor2Rate" real,
  "boat2Rate" real,
  "avgSt" real,
  "flyingCount" integer DEFAULT 0,
  "lateCount" integer DEFAULT 0,
  "exhibitionTime" real,
  "tilt" real,
  "startTime" varchar(10),
  "winOdds" real,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "race_before_info" (
  "id" serial PRIMARY KEY NOT NULL,
  "raceDate" date NOT NULL,
  "stadiumId" varchar(10) NOT NULL,
  "raceNumber" integer NOT NULL,
  "boatNumber" integer NOT NULL,
  "exhibitionTime" real,
  "exhibitionRank" integer,
  "tilt" real,
  "startTime" varchar(10),
  "weather" varchar(20),
  "windDirection" varchar(20),
  "windSpeed" real,
  "waveHeight" real,
  "waterTemp" real,
  "airTemp" real,
  "stabilizer" boolean DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "prediction_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "raceDate" date NOT NULL,
  "stadiumId" varchar(10) NOT NULL,
  "raceNumber" integer NOT NULL,
  "predictions" text,
  "modelVersion" varchar(20),
  "betAmount" integer,
  "actualResult" varchar(20),
  "isHit" integer,
  "payout" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "bankroll" (
  "id" serial PRIMARY KEY NOT NULL,
  "raceDate" date NOT NULL UNIQUE,
  "totalBet" integer NOT NULL DEFAULT 0,
  "totalPayout" integer NOT NULL DEFAULT 0,
  "profit" integer NOT NULL DEFAULT 0,
  "cumulativeProfit" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "data_fetch_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "fetchType" varchar(30) NOT NULL,
  "raceDate" date,
  "stadiumId" varchar(10),
  "status" varchar(10) NOT NULL DEFAULT 'success',
  "message" text,
  "recordCount" integer DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" varchar(100) NOT NULL UNIQUE,
  "value" text,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "skip_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "raceDate" date NOT NULL,
  "stadiumId" varchar(10) NOT NULL,
  "raceNumber" integer NOT NULL,
  "reason" text,
  "skipScore" real,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "bankroll_conditions" (
  "id" serial PRIMARY KEY NOT NULL,
  "conditionType" varchar(30) NOT NULL,
  "conditionValue" real,
  "betMultiplier" real DEFAULT 1.0,
  "isActive" boolean DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
