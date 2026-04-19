import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// DB モジュールをモック
vi.mock("./db", () => ({
  getDataStatus: vi.fn().mockResolvedValue({
    resultsCount: 100,
    entriesCount: 600,
    beforeInfoCount: 600,
    lastResultDate: "2025-03-01",
  }),
  getRaceEntries: vi.fn().mockResolvedValue([
    {
      id: 1,
      raceDate: new Date("2025-03-05"),
      stadiumId: "01",
      raceNumber: 3,
      boatNumber: 1,
      racerName: "テスト選手",
      racerClass: "A1",
      nationalWinRate: 6.5,
      motor2Rate: 42.0,
      avgSt: 0.15,
    },
  ]),
  getRaceBeforeInfo: vi.fn().mockResolvedValue([
    {
      id: 1,
      raceDate: new Date("2025-03-05"),
      stadiumId: "01",
      raceNumber: 3,
      boatNumber: 1,
      exhibitionTime: 6.72,
      tilt: 0,
      winOdds: 1.5,
    },
  ]),
  savePredictionLog: vi.fn().mockResolvedValue(null),
  getPredictionHistory: vi.fn().mockResolvedValue([
    {
      id: 1,
      raceDate: new Date("2025-03-05"),
      stadiumId: "01",
      raceNumber: 3,
      predictions: [{ combo: "1-2-3", probability: 15.5, odds: null }],
      modelVersion: "Heuristic",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  logDataFetch: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getCurrentBankrollBalance: vi.fn().mockResolvedValue(5000),
  getBankrollByCondition: vi.fn().mockResolvedValue({
    byStadium: [{ stadiumId: "01", totalBet: 1000, totalPayout: 1200, totalRaces: 5, hitRaces: 1, returnRate: 120 }],
    byRaceNumber: [{ raceNumber: 3, totalBet: 500, totalPayout: 600, totalRaces: 3, hitRaces: 1, returnRate: 120 }],
    byWeather: [],
  }),
  getBankrollSummary: vi.fn().mockResolvedValue({
    totalBet: 1000, totalPayout: 1200, hitRaces: 1, totalRaces: 5,
    hitRate: 20, returnRate: 120, days: 30,
  }),
  getBankrollHistory: vi.fn().mockResolvedValue([]),
  recalcBankroll: vi.fn().mockResolvedValue({ updated: 0 }),
  getDailySummary: vi.fn().mockResolvedValue({ total: 0, hits: 0, hitRate: null, totalPayout: 0 }),
  getPredictionLogById: vi.fn().mockResolvedValue(null),
  updatePredictionLogBet: vi.fn().mockResolvedValue(undefined),
  checkAndUpdateHitStatus: vi.fn().mockResolvedValue({ isHit: null, actualResult: null, payout: null }),
  getAvailableRacesForDate: vi.fn().mockResolvedValue([
    { stadiumId: "01", stadiumName: "桐生", raceNumber: 3 },
  ]),
}));

// child_process をモック (Pythonスクリプト実行)
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    execFile: vi.fn((bin: string, args: string[], opts: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      const scriptPath = args[0] || "";
      // predict.py のモック
      if (scriptPath.includes("predict.py")) {
        cb(null, {
          stdout: JSON.stringify({
            predictions: [
              { combo: "1-2-3", probability: 15.5, odds: null },
              { combo: "1-3-2", probability: 12.0, odds: null },
              { combo: "1-2-4", probability: 10.5, odds: null },
              { combo: "1-4-2", probability: 9.0, odds: null },
              { combo: "1-3-4", probability: 8.5, odds: null },
              { combo: "2-1-3", probability: 7.0, odds: null },
            ],
            racerInfo: [
              { boatNumber: 1, racerName: "テスト選手A", racerClass: "A1", winProbability: 55.0 },
              { boatNumber: 2, racerName: "テスト選手B", racerClass: "A2", winProbability: 15.0 },
            ],
            envInfo: { weather: "晴", windSpeed: 3, waveHeight: 5 },
            modelUsed: "Heuristic (モデル未学習)",
          }),
          stderr: "",
        });
      } else if (scriptPath.includes("scrape_racecard.py")) {
        cb(null, { stdout: JSON.stringify({ success: true, total: 6 }), stderr: "" });
      } else if (scriptPath.includes("scrape_beforeinfo.py")) {
        cb(null, { stdout: JSON.stringify({ success: true, entries: [], saved: 6 }), stderr: "" });
      } else if (scriptPath.includes("fetch_results.py")) {
        cb(null, { stdout: JSON.stringify({ success: true, total: 120 }), stderr: "" });
      } else if (scriptPath.includes("train_model.py")) {
        cb(null, { stdout: JSON.stringify({ success: true, accuracy: 0.72, train_rows: 800 }), stderr: "" });
      } else {
        cb(null, { stdout: "", stderr: "" });
      }
    }),
  };
});

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("race router", () => {
  it("getStadiums returns 24 stadiums", async () => {
    const caller = appRouter.createCaller(createCtx());
    const stadiums = await caller.race.getStadiums();
    expect(stadiums).toHaveLength(24);
    expect(stadiums[0]).toMatchObject({ id: "01", name: "桐生" });
  });

  it("getRaceEntries returns entries", async () => {
    const caller = appRouter.createCaller(createCtx());
    const entries = await caller.race.getRaceEntries({
      raceDate: "20250305",
      stadiumId: "01",
      raceNumber: 3,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ boatNumber: 1, racerClass: "A1" });
  });

  it("getRaceBeforeInfo returns before info", async () => {
    const caller = appRouter.createCaller(createCtx());
    const info = await caller.race.getRaceBeforeInfo({
      raceDate: "20250305",
      stadiumId: "01",
      raceNumber: 3,
    });
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({ boatNumber: 1, exhibitionTime: 6.72 });
  });
});

describe("data router", () => {
  it("getStatus returns data counts", async () => {
    const caller = appRouter.createCaller(createCtx());
    const status = await caller.data.getStatus();
    expect(status.resultsCount).toBe(100);
    expect(status.entriesCount).toBe(600);
  });

  it("scrapeRacecard returns success", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.data.scrapeRacecard({
      raceDate: "20250305",
      stadiumId: "01",
      raceNumber: 3,
    });
    expect(result.success).toBe(true);
    expect(result.total).toBe(6);
  });

  it("scrapeBeforeInfo returns success", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.data.scrapeBeforeInfo({
      raceDate: "20250305",
      stadiumId: "01",
      raceNumber: 3,
    });
    expect(result.success).toBe(true);
  });

  it("fetchResults returns success", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.data.fetchResults({ days: 30 });
    expect(result.success).toBe(true);
    expect(result.total).toBe(120);
  });

  it("trainModel returns accuracy", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.data.trainModel();
    expect(result.success).toBe(true);
    expect(result.accuracy).toBeCloseTo(0.72);
    expect(result.trainRows).toBe(800);
  });
});

describe("predict router", () => {
  it("run returns 6 predictions", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.predict.run({
      raceDate: "20250305",
      stadiumId: "01",
      raceNumber: 3,
    });
    expect(result.success).toBe(true);
    expect(result.predictions).toHaveLength(6);
    // 各予想はcomboとprobabilityを持つ
    const first = result.predictions![0];
    expect(first).toHaveProperty("combo");
    expect(first).toHaveProperty("probability");
    expect(first.combo).toMatch(/^\d-\d-\d$/);
  });

  it("run returns racer info", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.predict.run({
      raceDate: "20250305",
      stadiumId: "01",
      raceNumber: 3,
    });
    expect(result.racerInfo).toBeDefined();
    expect(result.racerInfo!.length).toBeGreaterThan(0);
  });

  it("run returns env info", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.predict.run({
      raceDate: "20250305",
      stadiumId: "01",
      raceNumber: 3,
    });
    expect(result.envInfo).toBeDefined();
    expect(result.envInfo!.weather).toBe("晴");
  });

  it("getHistory returns prediction logs", async () => {
    const caller = appRouter.createCaller(createCtx());
    const history = await caller.predict.getHistory({ limit: 20 });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ stadiumId: "01", raceNumber: 3 });
  });
});

describe("auth router", () => {
  it("me returns null for unauthenticated user", async () => {
    const caller = appRouter.createCaller(createCtx());
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });
});

describe("predict router - error paths", () => {
  it("run handles Python script failure gracefully", async () => {
    // execFileを失敗ケースにオーバーライド
    const { execFile } = await import("child_process");
    const execFileMock = vi.mocked(execFile);
    execFileMock.mockImplementationOnce((_bin: string, _args: string[], _opts: unknown, cb: any) => {
      cb(null, { stdout: "", stderr: "Python error: module not found" });
    });
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.predict.run({
      raceDate: "20250305",
      stadiumId: "01",
      raceNumber: 3,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("run handles invalid JSON output gracefully", async () => {
    const { execFile } = await import("child_process");
    const execFileMock = vi.mocked(execFile);
    execFileMock.mockImplementationOnce((_bin: string, _args: string[], _opts: unknown, cb: any) => {
      cb(null, { stdout: "not valid json at all", stderr: "" });
    });
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.predict.run({
      raceDate: "20250305",
      stadiumId: "01",
      raceNumber: 3,
    });
    expect(result.success).toBe(false);
  });

  it("run validates raceNumber range", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.predict.run({ raceDate: "20250305", stadiumId: "01", raceNumber: 13 })
    ).rejects.toThrow();
  });
});

describe("predict router - new features", () => {
  it("getBankrollBalance returns balance object", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.predict.getBankrollBalance();
    expect(result).toHaveProperty("balance");
    expect(typeof result.balance).toBe("number");
  });

  it("getBankrollByCondition returns condition breakdown", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.predict.getBankrollByCondition();
    expect(result).toHaveProperty("byStadium");
    expect(result).toHaveProperty("byRaceNumber");
    expect(Array.isArray(result.byStadium)).toBe(true);
    // モックデータは1件
    expect(result.byStadium).toHaveLength(1);
    expect(result.byStadium[0].returnRate).toBe(120);
  });

  it("batchPredict returns results for multiple races", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.predict.batchPredict({
      raceDate: "20250305",
      stadiumId: "01",
      races: [1, 2, 3],
      bankroll: 0,
    });
    expect(result.totalCount).toBe(3);
    expect(result.successCount).toBeGreaterThanOrEqual(0);
    expect(result.results).toHaveLength(3);
  });
});

describe("recommended router", () => {
  it("getRecommended returns races with composite score fields", async () => {
    // getAvailableRacesForDate はトップレベルの vi.mock でモック済みなので、再モックする
    const { getAvailableRacesForDate } = await import("./db");
    vi.mocked(getAvailableRacesForDate).mockResolvedValueOnce([
      { stadiumId: "01", stadiumName: "桐生", raceNumber: 3 },
    ] as any);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.recommended.getRecommended({ date: "2025-03-05", maxRaces: 10, minEv: 0.5 });

    expect(result).toHaveProperty("races");
    expect(result).toHaveProperty("scannedCount");
    expect(result).toHaveProperty("date");
    expect(Array.isArray(result.races)).toBe(true);
  });

  it("getRecommended returns empty when no available races", async () => {
    const { getAvailableRacesForDate } = await import("./db");
    vi.mocked(getAvailableRacesForDate).mockResolvedValueOnce([] as any);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.recommended.getRecommended({ date: "2025-03-05" });

    expect(result.races).toHaveLength(0);
    expect(result.scannedCount).toBe(0);
  });
});
