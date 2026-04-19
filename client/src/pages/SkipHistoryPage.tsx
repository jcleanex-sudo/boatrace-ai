import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SkipForward, CheckCircle, XCircle, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { STADIUMS } from "@shared/boatrace";

interface SkipRecord {
  id: number;
  raceDate: string | Date;
  stadiumId: string;
  raceNumber: number;
  skipReason: string | null;
  actualResult: string | null;
  actualPayout: number | null;
  predictedCombos: unknown;
  createdAt: string | Date;
}

export default function SkipHistoryPage() {
  const { data: history, isLoading, refetch } = trpc.skipHistory.getHistory.useQuery({ limit: 100 });
  const updateResult = trpc.skipHistory.updateResult.useMutation({
    onSuccess: () => {
      toast.success("結果を更新しました");
      refetch();
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editResult, setEditResult] = useState("");
  const [editPayout, setEditPayout] = useState("");

  const stadiumMap = Object.fromEntries(STADIUMS.map((s) => [s.id, s.name]));

  const formatDate = (d: string | Date) => {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" });
  };

  const handleSaveResult = (id: number) => {
    updateResult.mutate({
      id,
      actualResult: editResult,
      actualPayout: Number(editPayout) || 0,
    });
    setEditingId(null);
    setEditResult("");
    setEditPayout("");
  };

  const records = (history as SkipRecord[] | undefined) ?? [];

  // 統計計算
  const withResult = records.filter((r) => r.actualResult);
  const wouldHaveHit = withResult.filter((r) => {
    const combos = Array.isArray(r.predictedCombos) ? r.predictedCombos : [];
    return combos.some((c: unknown) => {
      if (typeof c === "object" && c !== null && "combo" in c) {
        return (c as { combo: string }).combo === r.actualResult;
      }
      return c === r.actualResult;
    });
  });
  const savedAmount = withResult.reduce((sum, r) => {
    // 見送りしたことで損失を避けた金額（払戻がなかった場合）
    const combos = Array.isArray(r.predictedCombos) ? r.predictedCombos : [];
    const totalBet = combos.length * 100;
    const wouldHit = combos.some((c: unknown) => {
      if (typeof c === "object" && c !== null && "combo" in c) {
        return (c as { combo: string }).combo === r.actualResult;
      }
      return c === r.actualResult;
    });
    return sum + (wouldHit ? -(r.actualPayout || 0) + totalBet : totalBet);
  }, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SkipForward className="h-7 w-7 text-orange-400" />
        <div>
          <h1 className="text-2xl font-bold">見送り履歴</h1>
          <p className="text-sm text-muted-foreground">見送り推奨で実際に見送ったレースの結果を確認</p>
        </div>
      </div>

      {/* 統計サマリー */}
      {withResult.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">見送り件数</div>
              <div className="text-2xl font-bold">{records.length}</div>
              <div className="text-xs text-muted-foreground">うち結果確認済み: {withResult.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">見送りで正解だった割合</div>
              <div className="text-2xl font-bold text-green-400">
                {withResult.length > 0
                  ? Math.round(((withResult.length - wouldHaveHit.length) / withResult.length) * 100)
                  : 0}%
              </div>
              <div className="text-xs text-muted-foreground">
                {withResult.length - wouldHaveHit.length}/{withResult.length} 件が外れ
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">見送りによる節約額（推定）</div>
              <div className={`text-2xl font-bold ${savedAmount >= 0 ? "text-green-400" : "text-red-400"}`}>
                {savedAmount >= 0 ? "+" : ""}¥{savedAmount.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">損失回避 - 機会損失</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 見送り履歴テーブル */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">見送り一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground text-sm">読み込み中...</div>
          ) : records.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center py-8">
              <SkipForward className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>見送り履歴はありません</p>
              <p className="text-xs mt-1">予想実行時に「見送り推奨」が表示されたレースを見送り記録すると表示されます</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日付</TableHead>
                  <TableHead>競艇場</TableHead>
                  <TableHead className="text-right">R</TableHead>
                  <TableHead>見送り理由</TableHead>
                  <TableHead>実際の結果</TableHead>
                  <TableHead className="text-right">払戻</TableHead>
                  <TableHead>判定</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const combos = Array.isArray(record.predictedCombos) ? record.predictedCombos : [];
                  const wouldHit = record.actualResult && combos.some((c: unknown) => {
                    if (typeof c === "object" && c !== null && "combo" in c) {
                      return (c as { combo: string }).combo === record.actualResult;
                    }
                    return c === record.actualResult;
                  });
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="text-sm">{formatDate(record.raceDate)}</TableCell>
                      <TableCell className="text-sm">{stadiumMap[record.stadiumId] || record.stadiumId}</TableCell>
                      <TableCell className="text-right text-sm">{record.raceNumber}R</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                        {record.skipReason || "-"}
                      </TableCell>
                      <TableCell>
                        {editingId === record.id ? (
                          <div className="flex gap-1">
                            <Input
                              value={editResult}
                              onChange={(e) => setEditResult(e.target.value)}
                              placeholder="例: 1-2-3"
                              className="h-7 text-xs w-24"
                            />
                            <Input
                              value={editPayout}
                              onChange={(e) => setEditPayout(e.target.value)}
                              placeholder="払戻額"
                              type="number"
                              className="h-7 text-xs w-20"
                            />
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveResult(record.id)}>
                              保存
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <span className="text-sm font-mono">{record.actualResult || "-"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {record.actualPayout ? `¥${record.actualPayout.toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell>
                        {record.actualResult ? (
                          wouldHit ? (
                            <Badge variant="destructive" className="text-xs">
                              <XCircle className="h-3 w-3 mr-1" />
                              機会損失
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              見送り正解
                            </Badge>
                          )
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <HelpCircle className="h-3 w-3 mr-1" />
                            未確認
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!record.actualResult && editingId !== record.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => {
                              setEditingId(record.id);
                              setEditResult("");
                              setEditPayout("");
                            }}
                          >
                            結果入力
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
