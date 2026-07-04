import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { requireBetakoPublicEnabled } from "./publicAvailability";

const DEFAULT_CLIENT_ID = "001";

const STADIUM_NAMES: Record<string, string> = {
  "01": "Kiryu",
  "02": "Toda",
  "03": "Edogawa",
  "04": "Heiwajima",
  "05": "Tamagawa",
  "06": "Hamanako",
  "07": "Gamagori",
  "08": "Tokoname",
  "09": "Tsu",
  "10": "Mikuni",
  "11": "Biwako",
  "12": "Suminoe",
  "13": "Amagasaki",
  "14": "Naruto",
  "15": "Marugame",
  "16": "Kojima",
  "17": "Miyajima",
  "18": "Tokuyama",
  "19": "Shimonoseki",
  "20": "Wakamatsu",
  "21": "Ashiya",
  "22": "Fukuoka",
  "23": "Karatsu",
  "24": "Omura",
};

type SqlRow = Record<string, unknown>;

function rowsFromResult(result: unknown): SqlRow[] {
  const value = result as any;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.[0])) return value[0] as SqlRow[];
  if (Array.isArray(value)) return value as SqlRow[];
  return [];
}

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function normalizeDate(value: unknown): string {
  const raw = String(value ?? todayJst()).replace(/\D/g, "");
  return /^\d{8}$/.test(raw) ? raw : todayJst();
}

function normalizeStadiumId(value: unknown): string {
  const raw = String(value ?? "").replace(/\D/g, "");
  if (!raw) return "";
  return raw.padStart(2, "0").slice(-2);
}

function normalizeRaceNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const raceNumber = Number(value);
  return Number.isInteger(raceNumber) && raceNumber >= 1 && raceNumber <= 12
    ? raceNumber
    : null;
}

function normalizeConfidence(value: unknown): number {
  const confidence = Number(value ?? 0);
  if (!Number.isFinite(confidence) || confidence <= 0) return 0;
  return confidence <= 1 ? Math.round(confidence * 1000) / 10 : confidence;
}

function parseCombos(value: unknown): string[] {
  let raw = value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        raw = trimmed;
      }
    }
  }

  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];

  return items
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return String(record.combo ?? record.value ?? record.prediction ?? "");
      }
      return "";
    })
    .map((combo) => combo.trim().replace(/\s+/g, ""))
    .filter((combo) => /^[1-6]-[1-6]-[1-6]$/.test(combo));
}

function buildWinProbabilities(combos: string[]) {
  if (combos.length === 0) return [];
  const counts = new Map<number, number>();
  for (const combo of combos) {
    const boatNumber = Number(combo.split("-")[0]);
    if (boatNumber >= 1 && boatNumber <= 6) {
      counts.set(boatNumber, (counts.get(boatNumber) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([boatNumber, count]) => ({
      boatNumber,
      winProbability: Math.round((count / combos.length) * 1000) / 10,
    }))
    .sort((a, b) => b.winProbability - a.winProbability || a.boatNumber - b.boatNumber);
}

async function handleSchedule(req: Request, res: Response) {
  const db = await getDb();
  if (!db) {
    return res.status(503).json({ ok: false, message: "DATABASE_URL is not configured", venues: [] });
  }

  const raceDate = normalizeDate(req.query.date);
  const clientId = String(req.query.clientId ?? process.env.CLIENT_ID ?? DEFAULT_CLIENT_ID);

  const result = await db.execute(sql`
    SELECT
      "stadiumId"::text AS "stadiumId",
      array_agg(DISTINCT "raceNumber" ORDER BY "raceNumber") AS "raceNumbers"
    FROM race_predictions
    WHERE regexp_replace("raceDate"::text, '[^0-9]', '', 'g') = ${raceDate}
      AND COALESCE("clientId", ${DEFAULT_CLIENT_ID}) = ${clientId}
    GROUP BY "stadiumId"
    ORDER BY "stadiumId"
  `);

  const venues = rowsFromResult(result).map((row) => {
    const stadiumId = normalizeStadiumId(row.stadiumId);
    const raceNumbers = Array.isArray(row.raceNumbers)
      ? row.raceNumbers.map(Number).filter(Boolean)
      : [];
    return {
      stadiumId,
      jcd: stadiumId,
      name: STADIUM_NAMES[stadiumId] ?? stadiumId,
      raceNumbers,
    };
  });

  return res.json({ ok: true, date: raceDate, clientId, venues });
}

async function handlePredict(req: Request, res: Response) {
  const db = await getDb();
  if (!db) {
    return res.status(503).json({ ok: false, message: "DATABASE_URL is not configured" });
  }

  const raceDate = normalizeDate(req.query.date);
  const stadiumId = normalizeStadiumId(req.query.stadium ?? req.query.stadiumId ?? req.query.jcd);
  const raceNumber = normalizeRaceNumber(req.query.race ?? req.query.raceNo ?? req.query.raceNumber);
  const clientId = String(req.query.clientId ?? process.env.CLIENT_ID ?? DEFAULT_CLIENT_ID);

  if (!stadiumId) {
    return res.status(400).json({ ok: false, message: "stadium is required" });
  }

  const raceFilter = raceNumber === null ? sql`` : sql`AND "raceNumber" = ${raceNumber}`;
  const result = await db.execute(sql`
    SELECT
      regexp_replace("raceDate"::text, '[^0-9]', '', 'g') AS "raceDate",
      "stadiumId",
      "raceNumber",
      "predictedCombos",
      confidence,
      "modelVersion",
      "betAmount",
      "clientId",
      "createdAt"
    FROM race_predictions
    WHERE regexp_replace("raceDate"::text, '[^0-9]', '', 'g') = ${raceDate}
      AND "stadiumId" = ${stadiumId}
      AND COALESCE("clientId", ${DEFAULT_CLIENT_ID}) = ${clientId}
      ${raceFilter}
    ORDER BY confidence DESC NULLS LAST, "createdAt" DESC
    LIMIT 1
  `);

  const row = rowsFromResult(result)[0];
  if (!row) {
    return res.status(404).json({
      ok: false,
      message: "prediction_not_found",
      date: raceDate,
      stadiumId,
      raceNo: raceNumber,
      clientId,
    });
  }

  const combos = parseCombos(row.predictedCombos);
  const confidence = normalizeConfidence(row.confidence);

  return res.json({
    ok: true,
    raceDate: String(row.raceDate ?? raceDate),
    stadiumId,
    stadiumName: STADIUM_NAMES[stadiumId] ?? stadiumId,
    raceNo: Number(row.raceNumber ?? raceNumber ?? 0),
    raceNumber: Number(row.raceNumber ?? raceNumber ?? 0),
    confidence,
    score: confidence,
    winProbabilities: buildWinProbabilities(combos),
    honsen: combos.slice(0, 6),
    anaCombos: combos.slice(6),
    modelVersion: row.modelVersion ?? null,
    betAmount: Number(row.betAmount ?? 0),
    clientId: String(row.clientId ?? clientId),
  });
}

export function registerGachaBoatraceRoutes(app: Express) {
  app.get("/api/gacha/boatrace", requireBetakoPublicEnabled, async (req, res) => {
    try {
      const action = String(req.query.action ?? "");
      if (action === "schedule") return await handleSchedule(req, res);
      if (action === "predict") return await handlePredict(req, res);
      return res.status(400).json({ ok: false, message: "unknown action" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[gacha-boatrace]", message);
      return res.status(500).json({ ok: false, message });
    }
  });
}
