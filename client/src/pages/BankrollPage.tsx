import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, DollarSign, Target, Trophy, BarChart3, RefreshCw, Minus,
  Building2, Hash, Wallet
} from "lucide-react";
import { STADIUMS } from "@shared/boatrace";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ReferenceLine, Cell
} from "recharts";

function formatDate(d: Date | string | null) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatYen(n: number | null | undefined) {
  if (n == null) return "-";
  return n.toLocaleString() + "円";
}

function ReturnRateBadge({ rate }: { rate: number | null | undefined }) {
  if (rate == null) return <Badge variant="secondary">-</Badge>;
  if (rate >= 120) return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">回収率 {rate}%</Badge>;
  if (rate >= 100) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">回収率 {rate}%</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">回収率 {rate}%</Badge>;
}

export default function BankrollPage() {
  const [days, setDays] = useState(30);

  const summaryQuery = trpc.predict.getBankrollSummary.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const historyQuery = trpc.predict.getBankrollHistory.useQuery(
    { days },
    { refetchInterval: 60_000 }
  );
  const conditionQuery = trpc.predict.getBankrollByCondition.useQuery(undefined, {
    refetchInterval: 120_000,
  });
  const balanceQuery = trpc.predict.getBankrollBalance.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const recalcMutation = trpc.predict.recalcBankroll.useMutation();

  const summary = summaryQuery.data;
  const history = (historyQuery.data ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      date: formatDate(row.raceDate),
      profit: (row.totalPayout ?? 0) - (row.totalBet ?? 0),
      returnRate: row.returnRate ?? 0,
      totalBet: row.totalBet ?? 0,
      totalPayout: row.totalPayout ?? 0,
      hitRaces: row.hitRaces ?? 0,
      totalRaces: row.totalRaces ?? 0,
    }));

  // 累積収支
  let cumulative = 0;
  const cumulativeData = history.map((row) => {
    cumulative += row.profit;
    return { ...row, cumulative };
  });

  const profit = summary ? summary.totalPayout - summary.totalBet : null;
  const isProfit = profit != null && profit >= 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <DollarSign className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">収支管理</h1>
            <p className="text-sm text-muted-foreground">回収率・累積収支・日別成績</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            summaryQuery.refetch();
            historyQuery.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          更新
        </Button>
      </div>

      {/* サマリーカード */}
      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">累積収支</span>
              </div>
              <div className={`text-xl font-bold ${isProfit ? "text-green-400" : "text-red-400"}`}>
                {isProfit ? "+" : ""}{formatYen(profit)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{summary.days}日間</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">回収率</span>
              </div>
              <div className={`text-xl font-bold ${
                (summary.returnRate ?? 0) >= 100 ? "text-green-400" :
                (summary.returnRate ?? 0) >= 80 ? "text-yellow-400" : "text-red-400"
              }`}>
                {summary.returnRate != null ? `${summary.returnRate}%` : "-"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatYen(summary.totalBet)} 投資
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">的中率</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {summary.hitRate != null ? `${summary.hitRate}%` : "-"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {summary.hitRaces}/{summary.totalRaces}件
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">総払戻</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {formatYen(summary.totalPayout)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                投資 {formatYen(summary.totalBet)}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border-border animate-pulse">
              <CardContent className="pt-4 pb-3 h-20" />
            </Card>
          ))}
        </div>
      )}

      {/* 期間選択 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">表示期間：</span>
        {[7, 14, 30, 60, 90].map((d) => (
          <Button
            key={d}
            variant={days === d ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(d)}
          >
            {d}日
          </Button>
        ))}
      </div>

      {/* 累積収支グラフ */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            {isProfit
              ? <TrendingUp className="h-4 w-4 text-green-400" />
              : <TrendingDown className="h-4 w-4 text-red-400" />
            }
            累積収支推移
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cumulativeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulativeData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} tickFormatter={(v) => `${v.toLocaleString()}円`} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }}
                  labelStyle={{ color: "#aaa" }}
                  formatter={(value: number) => [`${value.toLocaleString()}円`, "累積収支"]}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#6366f1" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              データがありません
            </div>
          )}
        </CardContent>
      </Card>

      {/* 日別回収率グラフ */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <BarChart3 className="h-4 w-4 text-primary" />
            日別回収率
            <span className="text-xs font-normal text-muted-foreground ml-1">100%以上が黒字</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={history} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} tickFormatter={(v) => `${v}%`} domain={[0, "auto"]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }}
                  labelStyle={{ color: "#aaa" }}
                  formatter={(value: number) => [`${value}%`, "回収率"]}
                />
                <ReferenceLine y={100} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" label={{ value: "100%", fill: "#888", fontSize: 11 }} />
                <Bar dataKey="returnRate" radius={[3, 3, 0, 0]}>
                  {history.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.returnRate >= 100 ? "#22c55e" : entry.returnRate >= 80 ? "#eab308" : "#ef4444"}
                      fillOpacity={0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              データがありません
            </div>
          )}
        </CardContent>
      </Card>

      {/* 条件別収支分析 */}
      {conditionQuery.data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 競艇場別 */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Building2 className="h-4 w-4 text-primary" />
                競艇場別収支
                <span className="text-xs font-normal text-muted-foreground ml-1">勝てる場を特定</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {conditionQuery.data.byStadium.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">場</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">投資</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">払戈</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">的中</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">回収率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conditionQuery.data.byStadium.map((row) => {
                        const stadiumName = STADIUMS.find(s => s.id === row.stadiumId)?.name ?? row.stadiumId;
                        const rr = row.returnRate;
                        return (
                          <tr key={row.stadiumId} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="py-2 px-3 font-medium text-foreground">{stadiumName}</td>
                            <td className="py-2 px-2 text-right text-muted-foreground">{row.totalBet.toLocaleString()}円</td>
                            <td className="py-2 px-2 text-right text-foreground">{row.totalPayout.toLocaleString()}円</td>
                            <td className="py-2 px-2 text-right">
                              <span className={row.hitRaces > 0 ? "text-green-400 font-semibold" : "text-muted-foreground"}>
                                {row.hitRaces}/{row.totalRaces}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right">
                              <span className={`font-bold ${
                                rr != null && rr >= 120 ? "text-green-400" :
                                rr != null && rr >= 100 ? "text-yellow-400" : "text-red-400"
                              }`}>
                                {rr != null ? `${rr}%` : "-"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                  資金記録がある予想がまだありません
                </div>
              )}
            </CardContent>
          </Card>

          {/* レース番号別 */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Hash className="h-4 w-4 text-primary" />
                レース番号別収支
                <span className="text-xs font-normal text-muted-foreground ml-1">勝てるレースを特定</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {conditionQuery.data.byRaceNumber.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">R</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">投資</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">払戈</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">的中</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">回収率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conditionQuery.data.byRaceNumber.map((row) => {
                        const rr = row.returnRate;
                        return (
                          <tr key={row.raceNumber} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="py-2 px-3 font-bold text-foreground">{row.raceNumber}R</td>
                            <td className="py-2 px-2 text-right text-muted-foreground">{row.totalBet.toLocaleString()}円</td>
                            <td className="py-2 px-2 text-right text-foreground">{row.totalPayout.toLocaleString()}円</td>
                            <td className="py-2 px-2 text-right">
                              <span className={row.hitRaces > 0 ? "text-green-400 font-semibold" : "text-muted-foreground"}>
                                {row.hitRaces}/{row.totalRaces}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right">
                              <span className={`font-bold ${
                                rr != null && rr >= 120 ? "text-green-400" :
                                rr != null && rr >= 100 ? "text-yellow-400" : "text-red-400"
                              }`}>
                                {rr != null ? `${rr}%` : "-"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                  資金記録がある予想がまだありません
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 日別詳細テーブル */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">日別詳細</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">日付</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">予想数</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">的中</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">投資</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">払戻</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">収支</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">回収率</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((row, i) => {
                    const p = row.totalPayout - row.totalBet;
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="py-2 px-2 font-medium">{row.date}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{row.totalRaces}件</td>
                        <td className="py-2 px-2 text-right">
                          <span className={row.hitRaces > 0 ? "text-green-400 font-semibold" : "text-muted-foreground"}>
                            {row.hitRaces}件
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{formatYen(row.totalBet)}</td>
                        <td className="py-2 px-2 text-right">{formatYen(row.totalPayout)}</td>
                        <td className={`py-2 px-2 text-right font-semibold ${p >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {p >= 0 ? "+" : ""}{formatYen(p)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <ReturnRateBadge rate={row.returnRate} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Minus className="h-8 w-8 opacity-30" />
              <p className="text-sm">まだ収支データがありません</p>
              <p className="text-xs">予想を実行して賭け金を記録すると、ここに表示されます</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
