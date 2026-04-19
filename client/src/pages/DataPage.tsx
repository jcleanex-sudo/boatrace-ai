import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Database, Download, Brain, RefreshCw, Loader2, CheckCircle, AlertCircle, History } from "lucide-react";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-2xl"
      style={{ background: "oklch(0.22 0.04 230 / 0.7)", border: "1px solid oklch(0.62 0.18 200 / 0.15)" }}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold" style={{ color: "oklch(0.80 0.18 200)" }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export default function DataPage() {
  const [fetchDays, setFetchDays] = useState(30);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: status, refetch: refetchStatus, isLoading: statusLoading } = trpc.data.getStatus.useQuery();
  const fetchResultsMutation = trpc.data.fetchResults.useMutation();
  const trainMutation = trpc.data.trainModel.useMutation();
  const collectHistoryMutation = trpc.data.collectHistory.useMutation();

  const handleCollectHistory = async () => {
    toast.info("過去2年分のデータを一括取得中...数分かかる場合があります");
    try {
      const r = await collectHistoryMutation.mutateAsync({ years: 2, delaySeconds: 0.5 });
      if (r.success) {
        toast.success(`一括取得完了: ${r.successDays}/${r.totalDays}日分成功, ${r.totalSaved}件保存`);
        refetchStatus();
      } else {
        toast.error(`取得失敗: ${r.error}`);
      }
    } catch (e: any) {
      toast.error(`エラー: ${e.message}`);
    }
  };

  const handleFetchResults = async () => {
    toast.info("過去レース結果を取得中...");
    try {
      const input: { days?: number; startDate?: string; endDate?: string } = {};
      if (startDate && endDate) {
        input.startDate = startDate;
        input.endDate = endDate;
      } else {
        input.days = fetchDays;
      }
      const r = await fetchResultsMutation.mutateAsync(input);
      if (r.success) {
        toast.success(`取得完了: ${r.total}件保存`);
        refetchStatus();
      } else {
        toast.error(`取得失敗: ${r.error}`);
      }
    } catch (e: any) {
      toast.error(`エラー: ${e.message}`);
    }
  };

  const handleTrain = async () => {
    toast.info("モデル学習を開始中... (数分かかる場合があります)");
    try {
      const r = await trainMutation.mutateAsync();
      if (r.success) {
        toast.success(`学習完了！精度: ${(r.accuracy! * 100).toFixed(1)}% / 学習データ: ${r.trainRows}件`);
      } else {
        toast.error(`学習失敗: ${r.error}`);
      }
    } catch (e: any) {
      toast.error(`エラー: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="section-header-icon">
          <Database className="h-5 w-5" style={{ color: "oklch(0.75 0.18 200)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold gradient-text">データ管理</h1>
          <p className="text-sm text-muted-foreground">過去データの取得・管理・モデル学習</p>
        </div>
      </div>

      {/* データ状況 */}
      <Card className="ocean-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center justify-between" style={{ color: "oklch(0.80 0.18 200)" }}>
            <span>データベース状況</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchStatus()}
              disabled={statusLoading}
              className="h-7 px-2 text-xs"
            >
              {statusLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="レース結果"
              value={status?.resultsCount ?? 0}
              sub="件"
            />
            <StatCard
              label="出走表"
              value={status?.entriesCount ?? 0}
              sub="件"
            />
            <StatCard
              label="直前情報"
              value={status?.beforeInfoCount ?? 0}
              sub="件"
            />
            <StatCard
              label="最終取得日"
              value={status?.lastResultDate
                ? String(status.lastResultDate).slice(0, 10)
                : "未取得"}
            />
          </div>
        </CardContent>
      </Card>

      {/* 過去結果取得 */}
      <Card className="ocean-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2" style={{ color: "oklch(0.80 0.18 200)" }}>
            <Download className="h-4 w-4" style={{ color: "oklch(0.75 0.18 200)" }} />
            過去レース結果の取得（Boatrace Open API）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Boatrace Open APIから過去のレース結果（着順・STタイム・配当）を取得してDBに保存します。
            機械学習モデルの学習に使用されます。
          </p>

          <div className="space-y-3">
            {/* 期間指定 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">開始日（任意）</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">終了日（任意）</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="space-y-1 flex-1">
                <label className="text-xs text-muted-foreground">
                  過去N日分（期間未指定時）
                </label>
                <select
                  value={fetchDays}
                  onChange={(e) => setFetchDays(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-input bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={7}>過去7日</option>
                  <option value={30}>過去30日</option>
                  <option value={90}>過去90日</option>
                  <option value={180}>過去180日</option>
                  <option value={365}>過去1年</option>
                </select>
              </div>
              <Button
                onClick={handleFetchResults}
                disabled={fetchResultsMutation.isPending}
                className="mt-5 gap-2 btn-ocean"
              >
                {fetchResultsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                取得開始
              </Button>
            </div>
          </div>

          {fetchResultsMutation.data && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
              fetchResultsMutation.data.success
                ? "bg-green-500/10 text-green-400"
                : "bg-destructive/10 text-destructive"
            }`}>
              {fetchResultsMutation.data.success ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {fetchResultsMutation.data.success
                ? `完了: ${fetchResultsMutation.data.total}件取得`
                : `エラー: ${fetchResultsMutation.data.error}`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* モデル学習 */}
      <Card className="ocean-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2" style={{ color: "oklch(0.80 0.18 200)" }}>
            <Brain className="h-4 w-4" style={{ color: "oklch(0.75 0.18 200)" }} />
            AIモデル学習（LightGBM）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            DBに蓄積されたレース結果・出走表・直前情報を使ってLightGBMモデルを学習します。
            学習には最低100件以上のデータが必要です。データが少ない場合はヒューリスティック予想が使用されます。
          </p>

          <div className="p-3 rounded-xl text-xs text-muted-foreground space-y-1" style={{ background: "oklch(0.22 0.04 230 / 0.6)", border: "1px solid oklch(0.30 0.04 230 / 0.8)" }}>
            <p className="font-medium text-foreground">使用する特徴量:</p>
            <p>選手: 級別・全国勝率・当地勝率・平均ST・フライング回数</p>
            <p>機材: モーター2連率・ボート2連率</p>
            <p>環境: 天候・風速・波高・展示タイム・チルト角度</p>
            <p>コース: 枠番・開催場</p>
          </div>

          <Button
            onClick={handleTrain}
            disabled={trainMutation.isPending}
            className="gap-2 btn-ocean"
          >
            {trainMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
            モデル学習を開始
          </Button>

          {trainMutation.data && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
              trainMutation.data.success
                ? "bg-green-500/10 text-green-400"
                : "bg-destructive/10 text-destructive"
            }`}>
              {trainMutation.data.success ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {trainMutation.data.success
                ? `学習完了！精度: ${((trainMutation.data.accuracy ?? 0) * 100).toFixed(1)}% / 学習データ: ${trainMutation.data.trainRows}件`
                : `エラー: ${trainMutation.data.error}`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 過去データ一括収集 */}
      <Card className="ocean-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2" style={{ color: "oklch(0.80 0.18 200)" }}>
            <History className="h-4 w-4" style={{ color: "oklch(0.75 0.18 200)" }} />
            過去データ一括収集（2年分）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: "oklch(0.22 0.12 85 / 0.15)", border: "1px solid oklch(0.78 0.18 85 / 0.3)", color: "oklch(0.85 0.18 85)" }}>
            <p className="font-semibold">⚠️ 重要: 初回実行時のみ実行してください</p>
            <p>2年分のデータを取得するため、数分〜数十分かかる場合があります。</p>
            <p>LightGBMの学習データが増えることで的中率・回収率が向上します。</p>
          </div>
          <Button
            onClick={handleCollectHistory}
            disabled={collectHistoryMutation.isPending}
            variant="outline"
            className="gap-2 w-full"
          >
            {collectHistoryMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <History className="h-4 w-4" />
            )}
            {collectHistoryMutation.isPending ? "取得中...しばらくお待ちください" : "過去2年分を一括取得"}
          </Button>
          {collectHistoryMutation.data && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
              collectHistoryMutation.data.success
                ? "bg-green-500/10 text-green-400"
                : "bg-destructive/10 text-destructive"
            }`}>
              {collectHistoryMutation.data.success ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {collectHistoryMutation.data.success
                ? `完了: ${collectHistoryMutation.data.successDays}/${collectHistoryMutation.data.totalDays}日分成功, ${collectHistoryMutation.data.totalSaved}件保存`
                : `エラー: ${collectHistoryMutation.data.error}`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 使い方ガイド */}
      <Card className="ocean-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold" style={{ color: "oklch(0.80 0.18 200)" }}>推奨ワークフロー</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground">
            {[
              "「過去レース結果の取得」で過去90〜365日分のデータを取得する",
              "「AIモデル学習」でLightGBMモデルを学習する",
              "「予想実行」ページで対象レースを選択し、「データ取得」ボタンで出走表・直前情報を取得する",
              "「AI予想を実行」ボタンで3連単×6点の予想を取得する",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <Badge
                  variant="outline"
                  className="shrink-0 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full font-bold" style={{ background: "oklch(0.62 0.18 200 / 0.2)", border: "1px solid oklch(0.62 0.18 200 / 0.4)", color: "oklch(0.80 0.18 200)" }}
                >
                  {i + 1}
                </Badge>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
