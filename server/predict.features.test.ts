/**
 * predict.features.test.ts
 * 安定板補正・的中判定・当日サマリー機能のユニットテスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 安定板補正ロジックのテスト ────────────────────────────────────────────────
describe("安定板補正ロジック", () => {
  // 安定板補正の計算を直接テスト（predict.pyのロジックをJSで再現）
  function applyStabilizerAdj(baseScore: number, boatNum: number): number {
    const adj: Record<number, number> = { 1: 0.05, 2: 0.03, 3: 0.01, 4: -0.01, 5: -0.03, 6: -0.05 };
    const a = adj[boatNum] ?? 0;
    return Math.max(baseScore * (1.0 + a), 0.01);
  }

  it("1コースは5%有利になる", () => {
    const base = 1.0;
    const adjusted = applyStabilizerAdj(base, 1);
    expect(adjusted).toBeCloseTo(1.05, 5);
  });

  it("6コースは5%不利になる", () => {
    const base = 1.0;
    const adjusted = applyStabilizerAdj(base, 6);
    expect(adjusted).toBeCloseTo(0.95, 5);
  });

  it("3コースは1%有利になる", () => {
    const base = 1.0;
    const adjusted = applyStabilizerAdj(base, 3);
    expect(adjusted).toBeCloseTo(1.01, 5);
  });

  it("スコアが0以下にならない（最小値0.01）", () => {
    const base = 0.001;
    const adjusted = applyStabilizerAdj(base, 6);
    expect(adjusted).toBeGreaterThanOrEqual(0.01);
  });
});

// ─── 的中判定ロジックのテスト ──────────────────────────────────────────────────
describe("的中判定ロジック", () => {
  function checkHit(predictions: Array<{ combo: string }>, actualCombo: string): boolean {
    const predictedCombos = predictions.map((p) => p.combo);
    return predictedCombos.includes(actualCombo);
  }

  it("予想した組み合わせが的中する", () => {
    const predictions = [
      { combo: "1-2-3" },
      { combo: "1-3-2" },
      { combo: "1-2-4" },
    ];
    expect(checkHit(predictions, "1-2-3")).toBe(true);
  });

  it("予想していない組み合わせは的中しない", () => {
    const predictions = [
      { combo: "1-2-3" },
      { combo: "1-3-2" },
      { combo: "1-2-4" },
    ];
    expect(checkHit(predictions, "2-1-3")).toBe(false);
  });

  it("6点全て外れの場合はfalse", () => {
    const predictions = [
      { combo: "1-2-3" }, { combo: "1-3-2" }, { combo: "1-2-4" },
      { combo: "1-4-2" }, { combo: "1-3-4" }, { combo: "1-4-3" },
    ];
    expect(checkHit(predictions, "3-2-1")).toBe(false);
  });

  it("空の予想リストは的中しない", () => {
    expect(checkHit([], "1-2-3")).toBe(false);
  });
});

// ─── 当日サマリー計算ロジックのテスト ─────────────────────────────────────────
describe("当日サマリー計算", () => {
  type LogRow = { isHit: number | null; payout: number | null };

  function calcSummary(rows: LogRow[]) {
    const total = rows.length;
    const judged = rows.filter((r) => r.isHit !== null).length;
    const hits = rows.filter((r) => r.isHit === 1).length;
    const totalPayout = rows.reduce((sum, r) => sum + (r.payout ?? 0), 0);
    const hitRate = judged > 0 ? Math.round((hits / judged) * 1000) / 10 : null;
    return { total, judged, hits, hitRate, totalPayout };
  }

  it("的中1件・外れ2件の場合の的中率は33.3%", () => {
    const rows: LogRow[] = [
      { isHit: 1, payout: 5000 },
      { isHit: 0, payout: 0 },
      { isHit: 0, payout: 0 },
    ];
    const result = calcSummary(rows);
    expect(result.total).toBe(3);
    expect(result.judged).toBe(3);
    expect(result.hits).toBe(1);
    expect(result.hitRate).toBeCloseTo(33.3, 1);
    expect(result.totalPayout).toBe(5000);
  });

  it("未判定のレースは judged に含まれない", () => {
    const rows: LogRow[] = [
      { isHit: 1, payout: 3000 },
      { isHit: null, payout: null },  // 未判定
      { isHit: null, payout: null },  // 未判定
    ];
    const result = calcSummary(rows);
    expect(result.total).toBe(3);
    expect(result.judged).toBe(1);
    expect(result.hits).toBe(1);
    expect(result.hitRate).toBe(100);
  });

  it("全て未判定の場合、hitRateはnull", () => {
    const rows: LogRow[] = [
      { isHit: null, payout: null },
      { isHit: null, payout: null },
    ];
    const result = calcSummary(rows);
    expect(result.judged).toBe(0);
    expect(result.hitRate).toBeNull();
  });

  it("予想0件の場合、全て0", () => {
    const result = calcSummary([]);
    expect(result.total).toBe(0);
    expect(result.hits).toBe(0);
    expect(result.totalPayout).toBe(0);
    expect(result.hitRate).toBeNull();
  });
});
