import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Star,
  RefreshCw,
  TrendingUp,
  Wind,
  Waves,
  CloudSun,
  Trophy,
  AlertTriangle,
  ChevronRight,
  Search,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Target,
  Anchor,
} from "lucide-react";

export default function RecommendedRacesPage() {
  const [, navigate] = useLocation();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [minEv, setMinEv] = useState(0.7);
  const [filterStadium, setFilterStadium] = useState("");
  const [excludeHighRisk, setExcludeHighRisk] = useState(true);

  const [elapsedSec, setElapsedSec] = useState(0);
  const [scanStarted, setScanStarted] = useState(false);

  const { data, isLoading, refetch } = trpc.recommended.getRecommended.useQuery(
    { date, maxRaces: 20, minEv, excludeHighRisk },
    { refetchOnWindowFocus: false, enabled: false }
  );

  // スキャン中の経過秒数カウンター
  useEffect(() => {
    if (!isLoading) {
      setElapsedSec(0);
      return;
    }
    const timer = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isLoading]);

  const handleScan = () => {
    setScanStarted(true);
    setElapsedSec(0);
    refetch();
  };

  const races = data?.races ?? [];
  const filtered = filterStadium
    ? races.filter(r => r.stadiumName.includes(filterStadium) || r.stadiumId === filterStadium)
    : races;

  const getRankBadge = (index: number) => {
    if (index === 0) return <Badge className="bg-yellow-500 text-black font-bold text-xs px-2">🥇 1位</Badge>;
    if (index === 1) return <Badge className="bg-gray-400 text-black font-bold text-xs px-2">🥈 2位</Badge>;
    if (index === 2) return <Badge className="bg-amber-600 text-white font-bold text-xs px-2">🥉 3位</Badge>;
    return <Badge variant="outline" className="text-muted-foreground text-xs">#{index + 1}</Badge>;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return "text-green-400";
    if (confidence >= 50) return "text-emerald-400";
    if (confidence >= 35) return "text-yellow-400";
    return "text-orange-400";
  };

  const getConfidenceBg = (confidence: number) => {
    if (confidence >= 70) return "border-green-500/40 bg-green-500/5";
    if (confidence >= 50) return "border-emerald-500/30 bg-emerald-500/5";
    if (confidence >= 35) return "border-yellow-500/30 bg-yellow-500/5";
    return "border-orange-500/20 bg-orange-500/5";
  };

  const getConfidenceBarColor = (confidence: number) => {
    if (confidence >= 70) return "bg-green-500";
    if (confidence >= 50) return "bg-emerald-500";
    if (confidence >= 35) return "bg-yellow-500";
    return "bg-orange-500";
  };

  const getRiskBadge = (riskLevel: string, riskLabel: string) => {
    if (riskLevel === "high") {
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/40 text-xs gap-1">
          <ShieldX className="h-3 w-3" />
          {riskLabel}
        </Badge>
      );
    }
    if (riskLevel === "medium") {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40 text-xs gap-1">
          <ShieldAlert className="h-3 w-3" />
          {riskLabel}
        </Badge>
      );
    }
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/40 text-xs gap-1">
        <ShieldCheck className="h-3 w-3" />
        {riskLabel}
      </Badge>
    );
  };

  const handleGoToPredict = (stadiumId: string, raceNumber: number) => {
    navigate(`/?stadium=${stadiumId}&race=${raceNumber}&date=${date}`);
  };

  return (
    <div className="container py-6 max-w-4xl">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-6">
        <div className="section-header-icon">
          <Star className="h-5 w-5" style={{ color: "oklch(0.85 0.20 85)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold gradient-text">おすすめレース</h1>
          <p className="text-sm text-muted-foreground">
            EV・的中確率・環境安定度の複合スコアで「当たりやすい」レースを優先表示
          </p>
        </div>
      </div>

      {/* 検索・フィルター */}
      <Card className="ocean-card mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground mb-1 block">開催日</Label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-32">
              <Label className="text-xs text-muted-foreground mb-1 block">最低EV</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="3"
                value={minEv}
                onChange={e => setMinEv(Number(e.target.value))}
                className="h-9"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs text-muted-foreground mb-1 block">場名フィルタ</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="例: 桐生"
                  value={filterStadium}
                  onChange={e => setFilterStadium(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Switch
                id="exclude-high-risk"
                checked={excludeHighRisk}
                onCheckedChange={setExcludeHighRisk}
              />
              <Label htmlFor="exclude-high-risk" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                荒れ除外
              </Label>
            </div>
            <Button
              onClick={handleScan}
              disabled={isLoading}
              className="h-9 btn-ocean"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isLoading ? `スキャン中... ${elapsedSec}s` : "スキャン実行"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* スキャン結果サマリー */}
      {data && (
        <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
          <span>スキャン済み: <strong className="text-foreground">{data.scannedCount}レース</strong></span>
          <span>おすすめ: <strong className="text-yellow-400">{filtered.length}件</strong></span>
          <span>対象日: <strong className="text-foreground">{data.date.slice(0,4)}/{data.date.slice(4,6)}/{data.date.slice(6,8)}</strong></span>
        </div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div className="space-y-3">
          {/* プログレスバー */}
          <div className="rounded-2xl p-4" style={{ background: "oklch(0.18 0.04 220 / 0.6)", border: "1px solid oklch(0.62 0.18 200 / 0.25)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm" style={{ color: "oklch(0.75 0.18 200)" }}>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>全レースを並列スキャン中...</span>
              </div>
              <span className="text-sm font-mono" style={{ color: "oklch(0.80 0.18 200)" }}>{elapsedSec}s経過</span>
            </div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${Math.min((elapsedSec / 20) * 100, 95)}%`, background: "linear-gradient(90deg, oklch(0.62 0.18 200), oklch(0.70 0.20 180))" }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              全レースを同時並列処理中—完了次第結果が表示されます
            </p>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-lg bg-muted/20 animate-pulse" />
          ))}
        </div>
      )}

      {/* 初期表示（スキャン未実行） */}
      {!isLoading && !scanStarted && (
        <div className="rounded-2xl py-12 text-center" style={{ border: "2px dashed oklch(0.62 0.18 200 / 0.25)", background: "oklch(0.18 0.03 230 / 0.3)" }}>
          <Star className="h-12 w-12 mx-auto mb-3" style={{ color: "oklch(0.62 0.18 200 / 0.4)" }} />
          <p className="text-muted-foreground">「スキャン実行」ボタンを押してください</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            当日のデータ取得済みレースを自動スキャンします
          </p>
        </div>
      )}

      {/* データなし */}
      {!isLoading && scanStarted && !data && (
        <div className="rounded-2xl py-12 text-center" style={{ border: "2px dashed oklch(0.62 0.18 200 / 0.25)", background: "oklch(0.18 0.03 230 / 0.3)" }}>
          <Star className="h-12 w-12 mx-auto mb-3" style={{ color: "oklch(0.62 0.18 200 / 0.4)" }} />
          <p className="text-muted-foreground">「スキャン実行」ボタンを押してください</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            当日のデータ取得済みレースを自動スキャンします
          </p>
        </div>
      )}

      {/* おすすめレースなし */}
      {!isLoading && data && filtered.length === 0 && (
        <Card className="rounded-2xl" style={{ border: "2px dashed oklch(0.62 0.18 200 / 0.25)", background: "oklch(0.18 0.03 230 / 0.3)" }}>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500/40 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {data.scannedCount === 0
                ? "本日のデータがありません。先にデータ取得を実行してください。"
                : `条件を満たすおすすめレースが見つかりませんでした。`}
            </p>
            {data.scannedCount === 0 && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate("/data")}
              >
                データ管理ページへ
              </Button>
            )}
            {data.scannedCount > 0 && excludeHighRisk && (
              <p className="text-xs text-muted-foreground/60 mt-2">
                「荒れ除外」をオフにすると表示件数が増えます
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* おすすめレース一覧 */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((race, index) => (
            <Card
              key={`${race.stadiumId}-${race.raceNumber}`}
              className={`rounded-2xl border transition-all hover:shadow-lg cursor-pointer ${getConfidenceBg(race.confidence ?? 0)}`}
              onClick={() => handleGoToPredict(race.stadiumId, race.raceNumber)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-4">
                  {/* ランク */}
                  <div className="w-14 flex-shrink-0 pt-0.5">
                    {getRankBadge(index)}
                  </div>

                  {/* 場・レース情報 */}
                  <div className="flex-1 min-w-0">
                    {/* 1行目: 場名・レース番号・バッジ類 */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-bold text-lg">{race.stadiumName}</span>
                      <Badge variant="outline" className="text-xs">
                        {race.raceNumber}R
                      </Badge>
                      {race.raceMode === "2連単" && (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                          2連単
                        </Badge>
                      )}
                      {getRiskBadge(race.riskLevel ?? "low", race.riskLabel ?? "安定")}
                    </div>

                    {/* 2行目: 推奨組み合わせ */}
                    {race.topCombination && (
                      <div className="flex items-center gap-2 text-sm mb-1.5">
                        <Trophy className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />
                        <span className="text-muted-foreground text-xs">本線推奨:</span>
                        <span className="font-mono font-semibold text-foreground">
                          {race.topCombination}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          ({(race.topProbability ?? 0).toFixed(1)}%)
                        </span>
                      </div>
                    )}

                    {/* 3行目: 1号艇確率・環境情報 */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {(race.boat1WinProb ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <Anchor className="h-3 w-3 text-blue-400" />
                          <span className="text-blue-300">1号艇 {(race.boat1WinProb ?? 0).toFixed(1)}%</span>
                        </span>
                      )}
                      {race.weather && (
                        <span className="flex items-center gap-1">
                          <CloudSun className="h-3 w-3" />
                          {race.weather}
                        </span>
                      )}
                      {(race.windSpeed ?? 0) > 0 && (
                        <span className={`flex items-center gap-1 ${(race.windSpeed ?? 0) > 5 ? "text-orange-400" : ""}`}>
                          <Wind className="h-3 w-3" />
                          {race.windSpeed}m/s
                        </span>
                      )}
                      {(race.waveHeight ?? 0) > 0 && (
                        <span className={`flex items-center gap-1 ${(race.waveHeight ?? 0) > 10 ? "text-orange-400" : ""}`}>
                          <Waves className="h-3 w-3" />
                          {race.waveHeight}cm
                        </span>
                      )}
                      {(race.positiveEvCount ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-green-400">
                          <Target className="h-3 w-3" />
                          プラスEV {race.positiveEvCount}点
                        </span>
                      )}
                    </div>

                    {/* 4行目: 信頼度プログレスバー */}
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">信頼度</span>
                        <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${getConfidenceBarColor(race.confidence ?? 0)}`}
                            style={{ width: `${race.confidence ?? 0}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${getConfidenceColor(race.confidence ?? 0)}`}>
                          {race.confidence ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* EV表示 */}
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 justify-end mb-0.5">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">最大EV</span>
                    </div>
                    <div className={`text-2xl font-bold ${getConfidenceColor(race.confidence ?? 0)}`}>
                      {(race.maxEv ?? 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      平均 {(race.avgEv ?? 0).toFixed(2)}
                    </div>
                  </div>

                  {/* 矢印 */}
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 注意書き */}
      {!isLoading && filtered.length > 0 && (
        <div className="mt-6 space-y-1">
          <p className="text-xs text-muted-foreground/60 text-center">
            ※ 信頼度スコアはEV・的中確率・環境安定度・1号艇確率の複合指標です（高いほど当たりやすい）
          </p>
          <p className="text-xs text-muted-foreground/60 text-center">
            ※ レース直前に再度予想を実行して最新オッズを確認してください
          </p>
        </div>
      )}
    </div>
  );
}
