import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart2, TrendingUp, Cloud, Calendar, Target, ChevronLeft, ChevronRight } from "lucide-react";

export default function AnalyticsPage() {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);

  const { data: accuracy, isLoading: loadingAccuracy } = trpc.analytics.getPredictionAccuracy.useQuery();
  const { data: weatherStats, isLoading: loadingWeather } = trpc.analytics.getWeatherStats.useQuery();
  const { data: monthly, isLoading: loadingMonthly } = trpc.analytics.getMonthlySummary.useQuery();
  const { data: calendarData, isLoading: loadingCalendar } = trpc.analytics.getDailyCalendar.useQuery(
    { year: calYear, month: calMonth }
  );

  const getReturnRateColor = (rate: number | null) => {
    if (rate === null) return "text-muted-foreground";
    if (rate >= 120) return "text-green-400";
    if (rate >= 100) return "text-blue-400";
    if (rate >= 80) return "text-yellow-400";
    return "text-red-400";
  };

  const getReturnRateBadge = (rate: number | null) => {
    if (rate === null) return "secondary";
    if (rate >= 100) return "default" as const;
    return "destructive" as const;
  };

  type CalendarDay = {
    date: string; totalBet: number; totalPayout: number; totalRaces: number;
    hitRaces: number; predictionCount: number; profit: number; returnRate: number | null;
  };

  // カレンダー用データマップ
  const calendarMap = useMemo(() => {
    const map: Record<string, CalendarDay> = {};
    if (calendarData) {
      for (const d of calendarData) {
        map[d.date] = d as CalendarDay;
      }
    }
    return map;
  }, [calendarData]);

  // カレンダーグリッドを生成
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(calYear, calMonth - 1, 1).getDay(); // 0=日
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // 7の倍数になるまでnullで埋める
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calYear, calMonth]);

  const prevMonth = () => {
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); }
    else setCalMonth(m => m + 1);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-7 w-7 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">予想精度分析</h1>
          <p className="text-sm text-muted-foreground">本線・抱え・穴目別の精度と条件別収支を分析</p>
        </div>
      </div>

      {/* 予想精度（本線・抱え・穴目別） */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-blue-400" />
            カテゴリ別的中率
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAccuracy ? (
            <div className="text-muted-foreground text-sm">読み込み中...</div>
          ) : accuracy ? (
            <div className="grid grid-cols-3 gap-4">
              {[
                { key: "honsen", label: "本線", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30" },
                { key: "osae", label: "抱え", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
                { key: "aname", label: "穴目", color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/30" },
              ].map(({ key, label, color, bg }) => {
                const stat = accuracy[key as keyof typeof accuracy];
                return (
                  <div key={key} className={`rounded-lg border p-4 ${bg}`}>
                    <div className={`text-sm font-medium ${color}`}>{label}</div>
                    <div className="text-3xl font-bold mt-1">
                      {stat.hitRate}<span className="text-base font-normal text-muted-foreground">%</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {stat.hit}/{stat.total} 件的中
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">データがありません。予想を実行して的中判定を行うと分析が表示されます。</div>
          )}
        </CardContent>
      </Card>

      {/* 予想カレンダービュー */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-indigo-400" />
            予想カレンダー
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" size="sm" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-sm">{calYear}年{calMonth}月</span>
            <Button variant="outline" size="sm" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {loadingCalendar ? (
            <div className="text-muted-foreground text-sm">読み込み中...</div>
          ) : (
            <>
              {/* 曜日ヘッダー */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
                  <div key={d} className={`text-center text-xs font-medium py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"}`}>
                    {d}
                  </div>
                ))}
              </div>
              {/* カレンダーグリッド */}
              <div className="grid grid-cols-7 gap-1">
                {calendarGrid.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} className="h-16" />;
                  const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const data = calendarMap[dateStr];
                  const isToday = dateStr === today.toISOString().split("T")[0];
                  const dayOfWeek = idx % 7;
                  return (
                    <div
                      key={dateStr}
                      className={`h-16 rounded-lg border p-1 text-xs transition-colors ${
                        isToday ? "border-blue-400 bg-blue-400/10" :
                        data ? (data.profit >= 0 ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10") :
                        "border-border bg-muted/20"
                      }`}
                    >
                      <div className={`font-medium mb-0.5 ${dayOfWeek === 0 ? "text-red-400" : dayOfWeek === 6 ? "text-blue-400" : ""}`}>
                        {day}
                      </div>
                      {data ? (
                        <>
                          <div className={`font-bold ${data.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {data.profit >= 0 ? "+" : ""}{(data.profit / 1000).toFixed(1)}k
                          </div>
                          <div className="text-muted-foreground">{data.totalRaces}R</div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {/* 凡例 */}
              <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-green-500/30 border border-green-500/40" />
                  <span>プラス収支</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-red-500/30 border border-red-500/40" />
                  <span>マイナス収支</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-muted/40 border border-border" />
                  <span>予想なし</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 月次収支サマリー */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-green-400" />
            月次収支サマリー
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMonthly ? (
            <div className="text-muted-foreground text-sm">読み込み中...</div>
          ) : monthly && monthly.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月</TableHead>
                  <TableHead className="text-right">レース数</TableHead>
                  <TableHead className="text-right">的中率</TableHead>
                  <TableHead className="text-right">投資額</TableHead>
                  <TableHead className="text-right">払戻額</TableHead>
                  <TableHead className="text-right">回収率</TableHead>
                  <TableHead className="text-right">収支</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...monthly].reverse().map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right">{row.totalRaces}</TableCell>
                    <TableCell className="text-right">
                      {row.hitRate !== null ? `${row.hitRate}%` : "-"}
                    </TableCell>
                    <TableCell className="text-right">¥{row.totalBet.toLocaleString()}</TableCell>
                    <TableCell className="text-right">¥{row.totalPayout.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={getReturnRateColor(row.returnRate)}>
                        {row.returnRate !== null ? `${row.returnRate}%` : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={row.totalPayout - row.totalBet >= 0 ? "text-green-400" : "text-red-400"}>
                        {row.totalPayout - row.totalBet >= 0 ? "+" : ""}
                        ¥{(row.totalPayout - row.totalBet).toLocaleString()}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground text-sm">データがありません。賭け金を記録すると月次分析が表示されます。</div>
          )}
        </CardContent>
      </Card>

      {/* 天候別収支 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="h-4 w-4 text-sky-400" />
            天候別収支分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingWeather ? (
            <div className="text-muted-foreground text-sm">読み込み中...</div>
          ) : weatherStats && (weatherStats as unknown[]).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>天候</TableHead>
                  <TableHead className="text-right">レース数</TableHead>
                  <TableHead className="text-right">的中数</TableHead>
                  <TableHead className="text-right">投資額</TableHead>
                  <TableHead className="text-right">払戻額</TableHead>
                  <TableHead className="text-right">回収率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(weatherStats as Array<{
                  weather: string; totalRaces: number; hitRaces: number;
                  totalBet: number; totalPayout: number; returnRate: number | null;
                }>).map((row) => (
                  <TableRow key={row.weather}>
                    <TableCell className="font-medium">{row.weather}</TableCell>
                    <TableCell className="text-right">{row.totalRaces}</TableCell>
                    <TableCell className="text-right">{row.hitRaces}</TableCell>
                    <TableCell className="text-right">¥{row.totalBet.toLocaleString()}</TableCell>
                    <TableCell className="text-right">¥{row.totalPayout.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={getReturnRateBadge(row.returnRate)}>
                        {row.returnRate !== null ? `${row.returnRate}%` : "-"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground text-sm">データがありません。</div>
          )}
        </CardContent>
      </Card>

      {/* 月次収支グラフ（テキストベース） */}
      {monthly && monthly.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              月次回収率トレンド
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {monthly.map((row) => {
                const rate = row.returnRate ?? 0;
                const barWidth = Math.min(Math.max(rate, 0), 200);
                const isProfit = rate >= 100;
                return (
                  <div key={row.month} className="flex items-center gap-3">
                    <div className="w-16 text-xs text-muted-foreground shrink-0">{row.month}</div>
                    <div className="flex-1 relative h-6 bg-muted/30 rounded overflow-hidden">
                      {/* 100%ライン */}
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
                      <div
                        className={`h-full rounded transition-all ${isProfit ? "bg-green-500/60" : "bg-red-500/60"}`}
                        style={{ width: `${(barWidth / 200) * 100}%` }}
                      />
                    </div>
                    <div className={`w-14 text-xs text-right shrink-0 ${getReturnRateColor(row.returnRate)}`}>
                      {row.returnRate !== null ? `${row.returnRate}%` : "-"}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>0%</span>
              <span>100%（損益分岐）</span>
              <span>200%</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
