import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { STADIUMS, BOAT_COLORS } from "@shared/boatrace";
import {
  Loader2, Zap, RefreshCw, ChevronRight, Trophy, AlertCircle,
  CheckCircle2, XCircle, SkipForward, Layers
} from "lucide-react";

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function BoatBadge({ num }: { num: number }) {
  const c = BOAT_COLORS[num] || { bg: "#888", text: "#fff" };
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {num}
    </span>
  );
}

type BatchResult = {
  raceNumber: number;
  success: boolean;
  logId?: number | null;
  error?: string;
  data?: {
    honsen?: Array<{ combo: string; probability: number; odds?: number | null; ev?: number | null; recommendedBet?: number; racerNames?: string[] }>;
    betSummary?: {
      totalRecommendedBet: number;
      positiveEvCount: number;
      avgEv: number;
      hasPositiveEv: boolean;
      shouldSkip?: boolean;
      skipReason?: string;
    };
    correctionSummary?: string[];
    modelUsed?: string;
  };
};

export default function BatchPredictPage() {
  const [stadiumId, setStadiumId] = useState("01");
  const [raceDate, setRaceDate] = useState(getTodayString());
  const [selectedRaces, setSelectedRaces] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const [results, setResults] = useState<BatchResult[]>([]);

  const balanceQuery = trpc.predict.getBankrollBalance.useQuery();
  const batchMutation = trpc.predict.batchPredict.useMutation();
  const scrapeAllMutation = trpc.data.scrapeAll.useMutation();

  const bankroll = balanceQuery.data?.balance ?? 0;
  const stadiumName = useMemo(
    () => STADIUMS.find((s) => s.id === stadiumId)?.name ?? stadiumId,
    [stadiumId]
  );

  const dateInputValue = raceDate.length === 8
    ? `${raceDate.slice(0, 4)}-${raceDate.slice(4, 6)}-${raceDate.slice(6, 8)}`
    : raceDate;

  const toggleRace = (n: number) => {
    setSelectedRaces(prev =>
      prev.includes(n) ? prev.filter(r => r !== n) : [...prev, n].sort((a, b) => a - b)
    );
  };

  const selectAll = () => setSelectedRaces([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const selectNone = () => setSelectedRaces([]);

  const handleFetchAll = async () => {
    if (selectedRaces.length === 0) {
      toast.error("レースを選択してください");
      return;
    }
    toast.info(`${selectedRaces.length}レース分のデータを取得中...`);
    let successCount = 0;
    for (const raceNumber of selectedRaces) {
      try {
        const r = await scrapeAllMutation.mutateAsync({ raceDate, stadiumId, raceNumber });
        if (r.success) successCount++;
      } catch { /* 継続 */ }
    }
    toast.success(`データ取得完了 (${successCount}/${selectedRaces.length}レース)`);
  };

  const handleBatchPredict = async () => {
    if (selectedRaces.length === 0) {
      toast.error("レースを選択してください");
      return;
    }
    toast.info(`${selectedRaces.length}レースを一括予想中...`);
    try {
      const r = await batchMutation.mutateAsync({
        raceDate,
        stadiumId,
        races: selectedRaces,
        bankroll: bankroll > 0 ? bankroll : 0,
      });
      setResults(r.results as BatchResult[]);
      toast.success(`一括予想完了 (${r.successCount}/${r.totalCount}レース成功)`);
    } catch (e: any) {
      toast.error(`エラー: ${e.message}`);
    }
  };

  const successResults = results.filter(r => r.success);
  const totalRecommendedBet = successResults.reduce(
    (sum, r) => sum + (r.data?.betSummary?.totalRecommendedBet ?? 0), 0
  );
  const skipCount = successResults.filter(r => r.data?.betSummary?.shouldSkip).length;
  const positiveEvCount = successResults.filter(r => r.data?.betSummary?.hasPositiveEv).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Layers className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">一括予想</h1>
          <p className="text-sm text-muted-foreground">複数レースを一度に予想・見送り判定</p>
        </div>
      </div>

      {/* 設定カード */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">予想設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">開催日</label>
              <input
                type="date"
                value={dateInputValue}
                onChange={(e) => setRaceDate(e.target.value.replace(/-/g, ""))}
                className="w-full h-10 rounded-md border border-input bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">開催場</label>
              <Select value={stadiumId} onValueChange={setStadiumId}>
                <SelectTrigger className="h-10 bg-input border-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border max-h-64">
                  {STADIUMS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.id} {s.name}（{s.prefecture}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* レース選択 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground font-medium">予想するレース</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-primary hover:underline">全選択</button>
                <span className="text-xs text-muted-foreground">|</span>
                <button onClick={selectNone} className="text-xs text-muted-foreground hover:underline">全解除</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                <button
                  key={n}
                  onClick={() => toggleRace(n)}
                  className={`w-10 h-10 rounded-lg text-sm font-bold transition-all border ${
                    selectedRaces.includes(n)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {n}R
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{selectedRaces.length}レース選択中</p>
          </div>

          {/* 資金残高表示 */}
          {bankroll !== 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
              <span className="text-xs text-muted-foreground">現在の資金残高:</span>
              <span className={`text-sm font-bold ${bankroll >= 0 ? "text-green-400" : "text-red-400"}`}>
                {bankroll >= 0 ? "+" : ""}{bankroll.toLocaleString()}円
              </span>
              <span className="text-xs text-muted-foreground ml-1">（ケリー基準の計算に使用）</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleFetchAll}
              disabled={batchMutation.isPending || scrapeAllMutation.isPending || selectedRaces.length === 0}
              className="gap-2"
            >
              {scrapeAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              全レースデータ取得
            </Button>
            <Button
              onClick={handleBatchPredict}
              disabled={batchMutation.isPending || selectedRaces.length === 0}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              {batchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {selectedRaces.length}レース一括予想
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 結果サマリー */}
      {results.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground mb-1">予想成功</div>
                <div className="text-xl font-bold text-foreground">{successResults.length}/{results.length}R</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground mb-1">期待値プラス</div>
                <div className={`text-xl font-bold ${positiveEvCount > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                  {positiveEvCount}R
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground mb-1">見送り推奨</div>
                <div className={`text-xl font-bold ${skipCount > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                  {skipCount}R
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <div className="text-xs text-muted-foreground mb-1">推奨合計賭け金</div>
                <div className="text-xl font-bold text-cyan-400 font-mono">
                  {totalRecommendedBet.toLocaleString()}円
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 各レース結果 */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-400" />
              {raceDate.slice(0, 4)}/{raceDate.slice(4, 6)}/{raceDate.slice(6, 8)} {stadiumName} 一括予想結果
            </h2>

            {results.map((result) => (
              <Card
                key={result.raceNumber}
                className={`border ${
                  !result.success
                    ? "border-destructive/40 bg-destructive/5"
                    : result.data?.betSummary?.shouldSkip
                    ? "border-slate-700/50 bg-slate-900/30 opacity-70"
                    : result.data?.betSummary?.hasPositiveEv
                    ? "border-green-700/40 bg-green-950/20"
                    : "border-border bg-card"
                }`}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    {/* レース番号 */}
                    <div className="shrink-0 w-12 text-center">
                      <div className="text-2xl font-bold text-foreground">{result.raceNumber}</div>
                      <div className="text-xs text-muted-foreground">R</div>
                    </div>

                    {/* 結果内容 */}
                    <div className="flex-1 min-w-0">
                      {!result.success ? (
                        <div className="flex items-center gap-2 text-destructive">
                          <XCircle className="h-4 w-4 shrink-0" />
                          <span className="text-sm">{result.error ?? "予想失敗"}</span>
                        </div>
                      ) : result.data?.betSummary?.shouldSkip ? (
                        <div className="flex items-center gap-2">
                          <SkipForward className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="text-sm font-semibold text-slate-300">見送り推奨</span>
                            <p className="text-xs text-slate-500 mt-0.5">{result.data.betSummary.skipReason}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* 本線上位3点 */}
                          <div className="flex flex-wrap gap-2">
                            {result.data?.honsen?.slice(0, 3).map((combo, i) => {
                              const boats = combo.combo.split("-").map(Number);
                              return (
                                <div key={i} className="flex items-center gap-1 bg-secondary/50 rounded-lg px-2 py-1">
                                  {boats.map((b, bi) => (
                                    <span key={bi} className="flex items-center gap-0.5">
                                      <BoatBadge num={b} />
                                      {bi < boats.length - 1 && (
                                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                      )}
                                    </span>
                                  ))}
                                  <span className="text-xs font-mono text-muted-foreground ml-1">
                                    {combo.probability.toFixed(1)}%
                                  </span>
                                  {combo.ev != null && (
                                    <span className={`text-xs font-bold ml-1 ${
                                      combo.ev >= 1.0 ? "text-green-400" : "text-red-400/70"
                                    }`}>
                                      EV{combo.ev.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* 補正サマリー */}
                          {result.data?.correctionSummary && result.data.correctionSummary.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {result.data.correctionSummary.map((s, i) => (
                                <Badge key={i} variant="outline" className="text-xs border-sky-700/40 text-sky-400/80 bg-sky-950/20">
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 右側サマリー */}
                    {result.success && !result.data?.betSummary?.shouldSkip && (
                      <div className="shrink-0 text-right space-y-1">
                        {result.data?.betSummary?.hasPositiveEv ? (
                          <div className="flex items-center gap-1 justify-end">
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                            <span className="text-xs text-green-400 font-semibold">EV+</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <AlertCircle className="h-4 w-4 text-yellow-400/60" />
                            <span className="text-xs text-muted-foreground">EV-</span>
                          </div>
                        )}
                        {result.data?.betSummary && (
                          <div className="text-xs font-mono text-cyan-400">
                            推奨 {result.data.betSummary.totalRecommendedBet.toLocaleString()}円
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          avgEV {result.data?.betSummary?.avgEv.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
