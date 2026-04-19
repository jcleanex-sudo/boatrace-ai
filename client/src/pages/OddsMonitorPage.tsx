import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingDown, TrendingUp, Minus, RefreshCw, Loader2, Activity } from "lucide-react";
import { toast } from "sonner";
import { STADIUMS } from "@shared/boatrace";

const RACE_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

function getTodayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

export default function OddsMonitorPage() {
  const todayStr = getTodayString();
  const [dateInputValue, setDateInputValue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [raceDate, setRaceDate] = useState(todayStr);
  const [stadiumId, setStadiumId] = useState("01");
  const [raceNumber, setRaceNumber] = useState(1);

  const handleDateChange = (val: string) => {
    setDateInputValue(val);
    if (val) setRaceDate(val.replace(/-/g, ""));
  };

  const scrapeOddsMutation = trpc.oddsMonitor.scrapeOdds.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`オッズ取得完了 (${data.oddsCount}件)`);
        historyQuery.refetch();
      } else {
        toast.error(`取得失敗: ${(data as any).error}`);
      }
    },
    onError: (e) => toast.error(`エラー: ${e.message}`),
  });

  const historyQuery = trpc.oddsMonitor.getOddsHistory.useQuery(
    { raceDate, stadiumId, raceNumber },
    { enabled: false }
  );

  const handleFetchOdds = () => {
    scrapeOddsMutation.mutate({ raceDate, stadiumId, raceNumber });
  };

  const handleLoadHistory = () => {
    historyQuery.refetch();
  };

  const history = historyQuery.data ?? [];

  // 変動の大きい上位20件を表示
  const topChanges = [...history]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 20);

  // 人気集中（オッズが下がった）組み合わせ
  const popularCombos = history
    .filter((h) => h.changePct < -5)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 10);

  // 穴（オッズが上がった）組み合わせ
  const anaCombos = history
    .filter((h) => h.changePct > 10)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 10);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Activity className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">オッズ変動モニター</h1>
          <p className="text-sm text-muted-foreground">締め切り前のオッズ変動を追跡して人気集中・穴を検出</p>
        </div>
      </div>

      {/* レース選択 */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">レース選択</CardTitle>
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
                    <SelectItem key={s.id} value={s.id}>{s.id} {s.name}</SelectItem>
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
          <div className="flex gap-3">
            <Button
              onClick={handleFetchOdds}
              disabled={scrapeOddsMutation.isPending}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              {scrapeOddsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              オッズ取得・記録
            </Button>
            <Button
              variant="outline"
              onClick={handleLoadHistory}
              disabled={historyQuery.isFetching}
              className="gap-2 border-border hover:bg-secondary"
            >
              {historyQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Activity className="h-4 w-4" />
              )}
              変動履歴を表示
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            ※ レース締め切り前に複数回「オッズ取得・記録」を実行することで変動を追跡できます。
            目安：締め切り30分前・15分前・5分前の3回取得が効果的です。
          </p>
        </CardContent>
      </Card>

      {/* 結果表示 */}
      {history.length > 0 && (
        <>
          {/* サマリーカード */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="py-4 px-4">
                <div className="text-xs text-muted-foreground mb-1">追跡組み合わせ数</div>
                <div className="text-2xl font-bold text-foreground">{history.length}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  取得回数: {history[0]?.records?.length ?? 0}回
                </div>
              </CardContent>
            </Card>
            <Card className="bg-red-950/30 border-red-800/40">
              <CardContent className="py-4 px-4">
                <div className="text-xs text-red-400 mb-1">人気集中（オッズ低下）</div>
                <div className="text-2xl font-bold text-red-300">{popularCombos.length}件</div>
                <div className="text-xs text-red-400/70 mt-1">5%以上下落した組み合わせ</div>
              </CardContent>
            </Card>
            <Card className="bg-emerald-950/30 border-emerald-800/40">
              <CardContent className="py-4 px-4">
                <div className="text-xs text-emerald-400 mb-1">穴（オッズ上昇）</div>
                <div className="text-2xl font-bold text-emerald-300">{anaCombos.length}件</div>
                <div className="text-xs text-emerald-400/70 mt-1">10%以上上昇した組み合わせ</div>
              </CardContent>
            </Card>
          </div>

          {/* 人気集中コンボ */}
          {popularCombos.length > 0 && (
            <Card className="bg-red-950/20 border-red-800/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-300">
                  <TrendingDown className="h-4 w-4" />
                  人気集中（マネーが流入している組み合わせ）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {popularCombos.map((item) => (
                    <div key={item.combo} className="flex items-center justify-between py-2 border-b border-red-900/30 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-foreground text-lg">{item.combo}</span>
                        <div className="text-xs text-muted-foreground">
                          {item.firstOdds}倍 → <span className="text-red-300 font-semibold">{item.lastOdds}倍</span>
                        </div>
                      </div>
                      <Badge variant="destructive" className="text-xs">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        {item.changePct}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 穴コンボ */}
          {anaCombos.length > 0 && (
            <Card className="bg-emerald-950/20 border-emerald-800/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-300">
                  <TrendingUp className="h-4 w-4" />
                  穴（マネーが逃げている組み合わせ）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {anaCombos.map((item) => (
                    <div key={item.combo} className="flex items-center justify-between py-2 border-b border-emerald-900/30 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-foreground text-lg">{item.combo}</span>
                        <div className="text-xs text-muted-foreground">
                          {item.firstOdds}倍 → <span className="text-emerald-300 font-semibold">{item.lastOdds}倍</span>
                        </div>
                      </div>
                      <Badge className="text-xs bg-emerald-700/50 text-emerald-200 border-emerald-600/50">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        +{item.changePct}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 全変動テーブル */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                変動ランキング（上位20件）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">組み合わせ</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">初回オッズ</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">最新オッズ</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">変動率</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">取得回数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topChanges.map((item) => {
                      const isDown = item.changePct < -5;
                      const isUp = item.changePct > 10;
                      return (
                        <tr key={item.combo} className="border-b border-border/50 hover:bg-secondary/20">
                          <td className="py-2 px-3 font-mono font-bold text-foreground">{item.combo}</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">{item.firstOdds}倍</td>
                          <td className="py-2 px-3 text-right font-semibold text-foreground">{item.lastOdds}倍</td>
                          <td className="py-2 px-3 text-right">
                            <span className={isDown ? "text-red-400" : isUp ? "text-emerald-400" : "text-muted-foreground"}>
                              {isDown ? (
                                <TrendingDown className="inline h-3 w-3 mr-1" />
                              ) : isUp ? (
                                <TrendingUp className="inline h-3 w-3 mr-1" />
                              ) : (
                                <Minus className="inline h-3 w-3 mr-1" />
                              )}
                              {item.changePct > 0 ? "+" : ""}{item.changePct}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-muted-foreground">{item.records?.length ?? 1}回</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {history.length === 0 && historyQuery.isFetched && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="py-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">このレースのオッズ変動データがありません。</p>
            <p className="text-xs text-muted-foreground mt-1">「オッズ取得・記録」ボタンでデータを蓄積してください。</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
