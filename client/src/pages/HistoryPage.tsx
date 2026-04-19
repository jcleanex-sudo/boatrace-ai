import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Trophy, ChevronRight, Loader2 } from "lucide-react";
import { STADIUM_MAP, BOAT_COLORS } from "@shared/boatrace";

function BoatBadge({ num }: { num: number }) {
  const c = BOAT_COLORS[num] || { bg: "#888", text: "#fff", name: "?" };
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 border border-white/20"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {num}
    </span>
  );
}

function formatDate(d: Date | string | null) {
  if (!d) return "-";
  const s = String(d).slice(0, 10);
  return s;
}

export default function HistoryPage() {
  const { data: history, isLoading } = trpc.predict.getHistory.useQuery({ limit: 50 });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <History className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">予想履歴</h1>
          <p className="text-sm text-muted-foreground">過去の予想ログ一覧</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !history || history.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <History className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">予想履歴がありません</p>
            <p className="text-xs text-muted-foreground mt-1">「予想実行」ページから予想を実行してください</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {history.map((log) => {
            const stadium = STADIUM_MAP[log.stadiumId];
            const preds = (log.predictions as Array<{ combo: string; probability: number; odds?: number | null }>) ?? [];
            return (
              <Card key={log.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    {/* 左: レース情報 */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {formatDate(log.raceDate)} {stadium?.name ?? log.stadiumId} {log.raceNumber}R
                        </span>
                        {log.isHit === 1 && (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                            <Trophy className="h-3 w-3 mr-1" />
                            的中
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.modelVersion ?? "Unknown"} • {formatDate(log.createdAt)}
                      </div>
                    </div>

                    {/* 右: 予想結果 */}
                    <div className="flex flex-wrap gap-2">
                      {preds.slice(0, 6).map((pred, idx) => {
                        const boats = pred.combo.split("-").map(Number);
                        const isTop = idx === 0;
                        return (
                          <div
                            key={pred.combo}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-xs ${
                              isTop
                                ? "border-yellow-500/40 bg-yellow-500/5"
                                : "border-border bg-secondary/30"
                            }`}
                          >
                            <span className={`font-bold mr-0.5 ${isTop ? "text-yellow-400" : "text-muted-foreground"}`}>
                              {idx + 1}.
                            </span>
                            {boats.map((b, i) => (
                              <span key={i} className="flex items-center gap-0.5">
                                <BoatBadge num={b} />
                                {i < boats.length - 1 && (
                                  <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                                )}
                              </span>
                            ))}
                            <span className="ml-1 text-muted-foreground">{pred.probability.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 的中情報 */}
                  {log.actualResult && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">実際の結果:</span>
                      <span className="font-semibold text-foreground">{log.actualResult}</span>
                      {log.payout && (
                        <span className="text-yellow-400 font-bold">
                          ¥{log.payout.toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
