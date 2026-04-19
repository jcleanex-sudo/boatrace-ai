import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { STADIUMS, RACE_NUMBERS, BOAT_COLORS } from "@shared/boatrace";
import {
  Loader2, Waves, Wind, Thermometer, Trophy, Target,
  ChevronRight, AlertCircle, Zap, RefreshCw, Droplets, CloudSun, Anchor,
  Info, TrendingDown, SkipForward
} from "lucide-react";

type PredictionCombo = {
  combo: string;
  racerNames?: string[];
  probability: number;
  odds: number | null;
  ev?: number | null;
  recommendedBet?: number;
};

type PredictionResult = {
  success: boolean;
  error?: string;
  logId?: number;
  honsen?: PredictionCombo[];
  osae?: PredictionCombo[];
  aname?: PredictionCombo[];
  predictions?: PredictionCombo[];
  racerInfo?: Array<{
    boatNumber: number;
    racerNumber?: number;
    racerName?: string;
    racerClass?: string;
    age?: number;
    weight?: number;
    branch?: string;
    nationalWinRate?: number;
    national2Rate?: number;
    localWinRate?: number;
    motor2Rate?: number;
    boat2Rate?: number;
    avgSt?: number;
    flyingCount?: number;
    lateCount?: number;
    exhibitionTime?: number;
    tilt?: number;
    startTime?: string;
    winOdds?: number;
    winProbability?: number;
    adjustments?: string[];  // 補正内容ログ
  }>;
  envInfo?: {
    weather?: string;
    windDirection?: string;
    windSpeed?: number;
    waveHeight?: number;
    waterTemp?: number;
    airTemp?: number;
    stabilizer?: boolean;
  };
  stadiumInfo?: {
    name?: string;
    waterType?: string;
    tidalDifference?: boolean;
    inStrength?: number;
    tailwindDirection?: string;
    notes?: string;
  };
  modelUsed?: string;
  betSummary?: {
    totalRecommendedBet: number;
    positiveEvCount: number;
    avgEv: number;
    hasPositiveEv: boolean;
    shouldSkip?: boolean;
    skipReason?: string;
  };
  correctionSummary?: string[];  // 予想根拠サマリー
  bankrollUsed?: boolean;  // ケリー基準使用フラグ
};

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateDisplay(yyyymmdd: string) {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`;
}

function BoatBadge({ num }: { num: number }) {
  const c = BOAT_COLORS[num] || { bg: "#888", text: "#fff", name: "?" };
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold shrink-0 border border-white/20"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {num}
    </span>
  );
}

function ClassBadge({ cls }: { cls?: string }) {
  if (!cls) return <span className="text-muted-foreground text-xs">-</span>;
  const colorMap: Record<string, string> = {
    A1: "text-red-400 font-bold",
    A2: "text-orange-400 font-semibold",
    B1: "text-blue-400",
    B2: "text-gray-400",
  };
  return <span className={`text-sm ${colorMap[cls] || "text-gray-400"}`}>{cls}</span>;
}

function WeatherIcon({ weather }: { weather?: string }) {
  if (!weather) return <CloudSun className="h-5 w-5 text-yellow-400" />;
  if (weather.includes("雨")) return <Droplets className="h-5 w-5 text-blue-400" />;
  if (weather.includes("曇")) return <CloudSun className="h-5 w-5 text-gray-400" />;
  return <CloudSun className="h-5 w-5 text-yellow-400" />;
}

function ComboRow({
  pred,
  rank,
  highlight,
}: {
  pred: PredictionCombo;
  rank: number;
  highlight?: "gold" | "silver" | "blue";
}) {
  const boats = pred.combo.split("-").map(Number);
  const names = pred.racerNames ?? boats.map((b) => `${b}号艇`);

  const borderClass =
    highlight === "gold"
      ? "border-yellow-500/50 bg-yellow-500/5"
      : highlight === "silver"
      ? "border-slate-400/40 bg-slate-400/5"
      : highlight === "blue"
      ? "border-primary/50 bg-primary/5"
      : "border-border bg-secondary/20";

  const rankColor =
    highlight === "gold"
      ? "text-yellow-400"
      : highlight === "silver"
      ? "text-slate-300"
      : highlight === "blue"
      ? "text-primary"
      : "text-muted-foreground";

  return (
    <div className={`flex flex-col gap-1.5 p-3 rounded-xl border transition-all ${borderClass}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold w-4 shrink-0 ${rankColor}`}>{rank}</span>
        <div className="flex items-center gap-1">
          {boats.map((b, i) => (
            <span key={i} className="flex items-center gap-0.5">
              <BoatBadge num={b} />
              {i < boats.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          ))}
        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="text-sm font-bold text-foreground font-mono">{pred.combo}</div>
          <div className="text-xs text-muted-foreground">
            {pred.probability.toFixed(1)}%
            {pred.odds != null && ` / ${pred.odds}倍`}
          </div>
          {pred.ev != null && (
            <div className={`text-xs font-semibold mt-0.5 ${
              pred.ev >= 1.5 ? 'text-green-400' :
              pred.ev >= 1.0 ? 'text-yellow-400' :
              'text-red-400/70'
            }`}>
              EV {pred.ev.toFixed(2)}
            </div>
          )}
          {pred.recommendedBet != null && pred.recommendedBet > 0 && (
            <div className="text-xs text-cyan-400 font-mono mt-0.5">
              推奨 {pred.recommendedBet.toLocaleString()}円
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 pl-6 text-xs">
        {boats.map((b, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <span
              className="font-medium"
              style={{ color: (BOAT_COLORS[b] || { bg: "#aaa" }).bg }}
            >
              {names[i] || `${b}号艇`}
            </span>
            {i < boats.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function CategoryCard({
  title,
  icon,
  combos,
  highlight,
  description,
  accentClass,
}: {
  title: string;
  icon: React.ReactNode;
  combos?: PredictionCombo[];
  highlight: "gold" | "silver" | "blue";
  description: string;
  accentClass: string;
}) {
  return (
    <Card className="ocean-card">
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm font-bold flex items-center gap-2 ${accentClass}`}>
          {icon}
          {title}
          <span className="text-xs font-normal text-muted-foreground ml-1">{description}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {combos && combos.length > 0 ? (
          combos.map((pred, idx) => (
            <ComboRow
              key={pred.combo}
              pred={pred}
              rank={idx + 1}
              highlight={idx === 0 ? highlight : undefined}
            />
          ))
        ) : (
          <p className="text-xs text-muted-foreground py-2">データなし</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PredictPage() {
  const [stadiumId, setStadiumId] = useState("01");
  const [raceNumber, setRaceNumber] = useState(1);
  const [raceDate, setRaceDate] = useState(getTodayString());
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [betInput, setBetInput] = useState<string>("");
  const [betRecorded, setBetRecorded] = useState(false);
  const [skipRecorded, setSkipRecorded] = useState(false);

  const scrapeAllMutation = trpc.data.scrapeAll.useMutation();
  const predictMutation = trpc.predict.run.useMutation();
  const checkHitMutation = trpc.predict.checkHit.useMutation();
  const recordBetMutation = trpc.predict.recordBet.useMutation();
  const saveSkipMutation = trpc.skipHistory.save.useMutation({
    onSuccess: () => {
      toast.success("見送りを記録しました", { description: "見送り履歴ページで後から結果を確認できます" });
      setSkipRecorded(true);
    },
  });

  const todayDate = getTodayString();
  const dailySummaryQuery = trpc.predict.getDailySummary.useQuery(
    { raceDate: todayDate },
    { refetchInterval: 30_000 }
  );
  const summary = dailySummaryQuery.data;

  const stadiumName = useMemo(
    () => STADIUMS.find((s) => s.id === stadiumId)?.name ?? stadiumId,
    [stadiumId]
  );

  const dateInputValue = raceDate.length === 8
    ? `${raceDate.slice(0, 4)}-${raceDate.slice(4, 6)}-${raceDate.slice(6, 8)}`
    : raceDate;

  const handleDateChange = (v: string) => {
    setRaceDate(v.replace(/-/g, ""));
  };

  const handleFetchData = async () => {
    toast.info("出走表・直前情報を並列取得中...");
    try {
      const r = await scrapeAllMutation.mutateAsync({ raceDate, stadiumId, raceNumber });
      if (r.success) {
        toast.success("取得完了（出走表・直前情報）");
      } else {
        if (!r.racecard.success) toast.error(`出走表取得失敗: ${(r.racecard as any).error}`);
        if (!r.beforeInfo.success) toast.error(`直前情報取得失敗: ${(r.beforeInfo as any).error}`);
      }
    } catch (e: any) {
      toast.error(`エラー: ${e.message}`);
    }
  };

  const handlePredict = async () => {
    toast.info("予想を実行中...");
    setBetInput("");
    setBetRecorded(false);
    try {
      const r = await predictMutation.mutateAsync({ raceDate, stadiumId, raceNumber });
      setResult(r as PredictionResult);
      if (r.success) {
        toast.success("予想完了！");
      } else {
        toast.error(`予想失敗: ${r.error}`);
      }
    } catch (e: any) {
      toast.error(`エラー: ${e.message}`);
    }
  };

  const handleCheckHit = async () => {
    toast.info("的中判定を実行中...");
    try {
      const r = await checkHitMutation.mutateAsync({ raceDate: todayDate });
      if (r.success) {
        toast.success(`的中判定完了 (${r.updated}件更新)`);
        dailySummaryQuery.refetch();
      } else {
        toast.error(`的中判定失敗: ${(r as any).error}`);
      }
    } catch (e: any) {
      toast.error(`エラー: ${e.message}`);
    }
  };

  const handleRecordBet = async () => {
    const amount = parseInt(betInput);
    if (!amount || amount < 100 || !result?.logId) return;
    try {
      await recordBetMutation.mutateAsync({
        logId: result.logId,
        betAmount: amount,
        raceDate: raceDate,
      });
      setBetRecorded(true);
      toast.success(`賭け金 ${amount.toLocaleString()}円を記録しました`);
    } catch (e: any) {
      toast.error(`記録失敗: ${e.message}`);
    }
  };

  const isLoading = scrapeAllMutation.isPending || predictMutation.isPending;
  const env = result?.envInfo;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="section-header-icon">
          <Waves className="h-5 w-5" style={{ color: "oklch(0.75 0.18 200)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold gradient-text">3連単予想</h1>
          <p className="text-sm text-muted-foreground">本線・抱え・穴目の3カテゴリ自動選出</p>
        </div>
      </div>

      {/* 当日の的中率サマリー */}
      {summary && summary.total === 0 && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-2 text-muted-foreground"
          style={{ background: "oklch(0.19 0.03 230 / 0.6)", border: "1px solid oklch(0.62 0.18 200 / 0.15)" }}>
          <Trophy className="h-4 w-4 shrink-0" style={{ color: "oklch(0.75 0.18 200)" }} />
          <span className="text-sm">本日の予想はまだありません。上のフォームからデータ取得→AI予想を実行してください。</span>
        </div>
      )}

      {summary && summary.total > 0 && (
        <Card className="rounded-2xl" style={{ background: "linear-gradient(135deg, oklch(0.20 0.06 155 / 0.5), oklch(0.18 0.05 165 / 0.5))", border: "1px solid oklch(0.55 0.18 145 / 0.3)" }}>
          <CardContent className="py-4 px-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-400" />
                  <span className="text-sm font-semibold text-foreground">今日の的中率</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">予想数: </span>
                    <span className="font-bold text-foreground">{summary.total}件</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">判定済: </span>
                    <span className="font-bold text-foreground">{summary.judged}件</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">的中: </span>
                    <span className="font-bold text-green-400">{summary.hits}件</span>
                  </div>
                  {summary.hitRate != null && (
                    <div>
                      <span className="text-muted-foreground">的中率: </span>
                      <span className="font-bold text-yellow-400">{summary.hitRate}%</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">合計払戻: </span>
                    <span className="font-bold text-cyan-400">{summary.totalPayout.toLocaleString()}円</span>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCheckHit}
                disabled={checkHitMutation.isPending}
                className="gap-2 rounded-xl"
                style={{ borderColor: "oklch(0.55 0.18 145 / 0.5)", color: "oklch(0.70 0.18 145)" }}
              >
                {checkHitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                的中判定更新
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* レース選択 */}
      <Card className="ocean-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2" style={{ color: "oklch(0.80 0.18 200)" }}>
            <Target className="h-4 w-4" style={{ color: "oklch(0.75 0.18 200)" }} />
            レース選択
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">開催日</label>
              <input
                type="date"
                value={dateInputValue}
                onChange={(e) => handleDateChange(e.target.value)}
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
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">レース番号</label>
              <Select value={String(raceNumber)} onValueChange={(v) => setRaceNumber(Number(v))}>
                <SelectTrigger className="h-10 bg-input border-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {RACE_NUMBERS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}R</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              variant="outline"
              onClick={handleFetchData}
              disabled={isLoading}
              className="gap-2 rounded-xl"
              style={{ borderColor: "oklch(0.62 0.18 200 / 0.4)", color: "oklch(0.75 0.18 200)" }}
            >
              {scrapeAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              データ取得（出走表・直前情報）
            </Button>
            <Button
              onClick={handlePredict}
              disabled={isLoading}
              className="gap-2 btn-ocean"
            >
              {predictMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              AI予想を実行
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 予想結果 */}
      {result && (
        <>
          {!result.success ? (
            <Card className="border-destructive/50 bg-destructive/10">
              <CardContent className="pt-4 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <p className="text-sm text-destructive">{result.error}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* 予想ヘッダー */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-400" />
                  {formatDateDisplay(raceDate)} {stadiumName} {raceNumber}R 予想結果
                </h2>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                    {result.modelUsed}
                  </Badge>
                  {env?.stabilizer && (
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-semibold">
                      安定板使用
                    </Badge>
                  )}
                </div>
              </div>

              {/* 環境情報バナー */}
              {env && (
                <Card className="rounded-2xl" style={{ background: "linear-gradient(135deg, oklch(0.18 0.05 220 / 0.6), oklch(0.17 0.04 210 / 0.6))", border: "1px solid oklch(0.62 0.18 200 / 0.25)" }}>
                  <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <WeatherIcon weather={env.weather} />
                        <div>
                          <p className="text-xs text-muted-foreground">天候</p>
                          <p className="text-sm font-bold text-foreground">{env.weather ?? "-"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Thermometer className="h-5 w-5 text-orange-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">気温</p>
                          <p className="text-sm font-bold text-foreground">
                            {env.airTemp != null ? `${env.airTemp}℃` : "-"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Droplets className="h-5 w-5 text-cyan-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">水温</p>
                          <p className="text-sm font-bold text-foreground">
                            {env.waterTemp != null ? `${env.waterTemp}℃` : "-"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wind className="h-5 w-5 text-sky-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">風向・風速</p>
                          <p className="text-sm font-bold text-foreground">
                            {env.windDirection ?? "-"}{env.windSpeed != null ? ` ${env.windSpeed}m` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Waves className="h-5 w-5 text-teal-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">波高</p>
                          <p className="text-sm font-bold text-foreground">
                            {env.waveHeight != null ? `${env.waveHeight}cm` : "-"}
                          </p>
                        </div>
                      </div>
                      {env.stabilizer && (
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-semibold">
                          安定板使用
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 場特性情報バナー */}
              {result.stadiumInfo && (
                <Card className="rounded-2xl" style={{ background: "oklch(0.18 0.03 230 / 0.6)", border: "1px solid oklch(0.30 0.04 230 / 0.5)" }}>
                  <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">水質</span>
                        <span className="text-sm font-semibold text-foreground">{result.stadiumInfo.waterType ?? "-"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">干満差</span>
                        <span className={`text-sm font-semibold ${result.stadiumInfo.tidalDifference ? "text-amber-400" : "text-foreground"}`}>
                          {result.stadiumInfo.tidalDifference ? "あり" : "なし"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">イン強さ</span>
                        <span className={`text-sm font-semibold ${
                          result.stadiumInfo.inStrength === 3 ? "text-green-400" :
                          result.stadiumInfo.inStrength === 1 ? "text-red-400" : "text-foreground"
                        }`}>
                          {result.stadiumInfo.inStrength === 3 ? "強い" : result.stadiumInfo.inStrength === 1 ? "弱い" : "普通"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">追い風方向</span>
                        <span className="text-sm font-semibold text-sky-300">{result.stadiumInfo.tailwindDirection ?? "-"}</span>
                      </div>
                      {result.stadiumInfo.notes && (
                        <p className="w-full text-xs text-muted-foreground italic mt-0.5">{result.stadiumInfo.notes}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 見送り判定アラート */}
              {result.betSummary?.shouldSkip && (
                <Card className="rounded-2xl" style={{ background: "oklch(0.18 0.06 20 / 0.4)", border: "1px solid oklch(0.60 0.22 25 / 0.5)" }}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <SkipForward className="h-5 w-5 text-red-400 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-red-300">このレースは見送りを推奨</p>
                        <p className="text-xs text-red-400/80 mt-0.5">{result.betSummary.skipReason}</p>
                      </div>
                      {!skipRecorded ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-700/50 text-red-300 hover:bg-red-900/30 text-xs"
                          disabled={saveSkipMutation.isPending}
                          onClick={() => {
                            const allCombos = [
                              ...(result.honsen ?? []),
                              ...(result.osae ?? []),
                              ...(result.aname ?? []),
                            ].map(c => ({ combo: c.combo, ev: c.ev }));
                            saveSkipMutation.mutate({
                              raceDate,
                              stadiumId,
                              raceNumber,
                              skipReason: result.betSummary?.skipReason ?? "",
                              predictedCombos: allCombos,
                            });
                          }}
                        >
                          {saveSkipMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <SkipForward className="h-3 w-3 mr-1" />
                          )}
                          見送りを記録
                        </Button>
                      ) : (
                        <Badge variant="outline" className="border-red-700/50 text-red-300 text-xs">
                          記録済み
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 予想根拠サマリー */}
              {result.correctionSummary && result.correctionSummary.length > 0 && (
                <Card className="ocean-card">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-sky-300 mb-1">適用された補正</p>
                        <div className="flex flex-wrap gap-2">
                          {result.correctionSummary.map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs border-sky-700/50 text-sky-300 bg-sky-950/30">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 賭け金サマリーカード */}
              {result.betSummary && (
                <Card className="rounded-2xl" style={result.betSummary.hasPositiveEv ? { background: "linear-gradient(135deg, oklch(0.20 0.06 155 / 0.4), oklch(0.18 0.05 165 / 0.4))", border: "1px solid oklch(0.55 0.18 145 / 0.35)" } : { background: "oklch(0.18 0.03 230 / 0.5)", border: "1px solid oklch(0.30 0.04 230 / 0.5)" }}>
                  <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">推奨合計賭け金</span>
                        <span className="text-lg font-bold text-cyan-400 font-mono">
                          {result.betSummary.totalRecommendedBet.toLocaleString()}円
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">期待値プラス点数</span>
                        <span className={`text-sm font-bold ${
                          result.betSummary.positiveEvCount > 0 ? 'text-green-400' : 'text-muted-foreground'
                        }`}>
                          {result.betSummary.positiveEvCount}点
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">平均EV</span>
                        <span className={`text-sm font-bold font-mono ${
                          result.betSummary.avgEv >= 1.0 ? 'text-green-400' :
                          result.betSummary.avgEv >= 0.75 ? 'text-yellow-400' : 'text-red-400/70'
                        }`}>
                          {result.betSummary.avgEv.toFixed(3)}
                        </span>
                      </div>
                      {result.betSummary.hasPositiveEv ? (
                        <Badge className="bg-green-500/20 text-green-300 border-green-500/40 text-xs">
                          期待値プラスあり
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/40 text-xs">
                          期待値マイナス（要注意）
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 3カテゴリ予想 */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <CategoryCard
                  title="本線"
                  icon={<Trophy className="h-4 w-4 text-yellow-400" />}
                  combos={result.honsen ?? result.predictions}
                  highlight="gold"
                  description="確率上位6点"
                  accentClass="text-yellow-400"
                />
                <CategoryCard
                  title="抱え"
                  icon={<Anchor className="h-4 w-4 text-slate-300" />}
                  combos={result.osae}
                  highlight="silver"
                  description="軸固定・中穴3点"
                  accentClass="text-slate-300"
                />
                <CategoryCard
                  title="穴目"
                  icon={<Zap className="h-4 w-4 text-cyan-400" />}
                  combos={result.aname}
                  highlight="blue"
                  description="高配当狙い3点"
                  accentClass="text-cyan-400"
                />
              </div>

              {/* 選手情報テーブル */}
              {result.racerInfo && result.racerInfo.length > 0 && (
                <Card className="ocean-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2" style={{ color: "oklch(0.80 0.18 200)" }}>
                      <Target className="h-4 w-4" style={{ color: "oklch(0.75 0.18 200)" }} />
                      出走選手情報
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">艇</th>
                            <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">選手</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">級</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">全国勝率</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">当地勝率</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">M2率</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">平均ST</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">展示T</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">チルト</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">ST</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">F/L</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">単勝O</th>
                            <th className="text-center px-3 py-2 text-xs text-muted-foreground font-medium">AI確率</th>
                            <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">補正内容</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.racerInfo.map((r) => (
                            <tr
                              key={r.boatNumber}
                              className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <BoatBadge num={r.boatNumber} />
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-foreground">
                                  {r.racerName ?? "不明"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {r.racerNumber ?? "-"} / {r.branch ?? "-"}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <ClassBadge cls={r.racerClass} />
                              </td>
                              <td className="px-3 py-3 text-center text-foreground">
                                {r.nationalWinRate?.toFixed(2) ?? "-"}
                              </td>
                              <td className="px-3 py-3 text-center text-foreground">
                                {r.localWinRate?.toFixed(2) ?? "-"}
                              </td>
                              <td className="px-3 py-3 text-center text-foreground">
                                {r.motor2Rate?.toFixed(1) ?? "-"}%
                              </td>
                              <td className="px-3 py-3 text-center text-foreground">
                                {r.avgSt?.toFixed(2) ?? "-"}
                              </td>
                              <td className="px-3 py-3 text-center text-foreground">
                                {r.exhibitionTime?.toFixed(2) ?? "-"}
                              </td>
                              <td className="px-3 py-3 text-center text-foreground">
                                {r.tilt != null ? `${r.tilt}°` : "-"}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {r.startTime ? (
                                  <span className={`font-mono text-sm font-semibold ${
                                    r.startTime.startsWith("F") ? "text-red-400" :
                                    r.startTime.startsWith("L") ? "text-yellow-400" :
                                    "text-green-400"
                                  }`}>
                                    {r.startTime}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {(() => {
                                  const fl = (r.flyingCount ?? 0) + (r.lateCount ?? 0);
                                  return fl > 0 ? (
                                    <span className={`text-xs font-bold ${
                                      fl >= 3 ? 'text-red-400' : fl >= 2 ? 'text-orange-400' : 'text-yellow-400'
                                    }`}>
                                      F/L {fl}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-3 text-center text-foreground">
                                {r.winOdds?.toFixed(1) ?? "-"}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <div
                                    className="h-1.5 rounded-full bg-primary"
                                    style={{ width: `${Math.min((r.winProbability ?? 0) * 2, 60)}px` }}
                                  />
                                  <span className="text-xs font-semibold text-primary">
                                    {r.winProbability?.toFixed(1) ?? "-"}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                {r.adjustments && r.adjustments.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {r.adjustments.map((adj, i) => (
                                      <span key={i} className="badge-ocean text-xs whitespace-nowrap">
                                        {adj}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">補正なし</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 賭け金記録フォーム */}
              {result.logId && (
                <Card className="ocean-card">
                  <CardContent className="py-4 px-5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground mb-1">実際に賭けた金額を記録</p>
                        <p className="text-xs text-muted-foreground">賭け金を入力すると収支管理ページに反映されます</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={100}
                          step={100}
                          placeholder="賭け金合計（円）"
                          value={betInput}
                          onChange={(e) => setBetInput(e.target.value)}
                          disabled={betRecorded}
                          className="w-36 px-3 py-2 text-sm rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50" style={{ background: "oklch(0.22 0.04 230)", border: "1px solid oklch(0.35 0.04 230)" }}
                        />
                        <button
                          onClick={handleRecordBet}
                          disabled={recordBetMutation.isPending || betRecorded || !betInput}
                          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                        >
                          {betRecorded ? "✓ 記録済" : recordBetMutation.isPending ? "記録中..." : "記録"}
                        </button>
                      </div>
                    </div>
                    {betRecorded && (
                      <p className="text-xs text-green-400 mt-2">
                        賭け金 {parseInt(betInput).toLocaleString()}円を記録しました。収支管理ページで回収率を確認できます。
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
