import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Bell, TrendingUp, DollarSign, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { data: settings, refetch } = trpc.settings.getAll.useQuery();

  const [lineToken, setLineToken] = useState("");
  const [targetReturnRate, setTargetReturnRate] = useState("100");
  const [maxBetPerRace, setMaxBetPerRace] = useState("3000");
  const [alertBelowRate, setAlertBelowRate] = useState("80");

  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => refetch(),
  });

  const testLineNotify = trpc.settings.testLineNotify.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("LINE通知テスト成功", { description: data.message });
        refetch();
      } else {
        toast.error("LINE通知テスト失敗", { description: data.message });
      }
    },
  });

  useEffect(() => {
    if (settings) {
      setLineToken(settings["line_notify_token"] || "");
      setTargetReturnRate(settings["target_return_rate"] || "100");
      setMaxBetPerRace(settings["max_bet_per_race"] || "3000");
      setAlertBelowRate(settings["alert_below_rate"] || "80");
    }
  }, [settings]);

  const handleSaveSetting = async (key: string, value: string, label: string) => {
    await setSetting.mutateAsync({ key, value });
    toast.success(`${label}を保存しました`, { description: value });
  };

  const isLineConfigured = !!(settings?.["line_notify_token"]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-7 w-7 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold">設定</h1>
          <p className="text-sm text-muted-foreground">通知・リスク管理・アラートの設定</p>
        </div>
      </div>

      {/* LINE通知設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-green-400" />
            LINE通知設定
            {isLineConfigured && (
              <Badge variant="default" className="ml-2 bg-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                設定済み
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            予想完了・的中時にLINEへ自動通知します。LINE Notify（無料）のトークンが必要です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span>
              LINE Notifyトークンは{" "}
              <a
                href="https://notify-bot.line.me/ja/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                notify-bot.line.me
              </a>{" "}
              で無料取得できます。「トークンを発行する」→「1:1でLINE Notifyから通知を受け取る」を選択してください。
            </span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="line-token">LINE Notifyトークン</Label>
            <div className="flex gap-2">
              <Input
                id="line-token"
                type="password"
                placeholder="LINE Notifyトークンを入力..."
                value={lineToken}
                onChange={(e) => setLineToken(e.target.value)}
                className="font-mono"
              />
              <Button
                onClick={() => testLineNotify.mutate({ token: lineToken })}
                disabled={!lineToken || testLineNotify.isPending}
                variant="outline"
                className="shrink-0"
              >
                {testLineNotify.isPending ? "送信中..." : "テスト送信"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              テスト送信が成功するとトークンが自動保存されます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 目標回収率・アラート設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            回収率アラート設定
          </CardTitle>
          <CardDescription>
            月間回収率が設定値を下回った場合にLINEで通知します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-rate">目標回収率 (%)</Label>
              <div className="flex gap-2">
                <Input
                  id="target-rate"
                  type="number"
                  min="50"
                  max="300"
                  value={targetReturnRate}
                  onChange={(e) => setTargetReturnRate(e.target.value)}
                />
                <Button
                  onClick={() => handleSaveSetting("target_return_rate", targetReturnRate, "目標回収率")}
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                >
                  保存
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">例: 110 = 10%の利益を目標</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-rate">アラート閾値 (%)</Label>
              <div className="flex gap-2">
                <Input
                  id="alert-rate"
                  type="number"
                  min="0"
                  max="200"
                  value={alertBelowRate}
                  onChange={(e) => setAlertBelowRate(e.target.value)}
                />
                <Button
                  onClick={() => handleSaveSetting("alert_below_rate", alertBelowRate, "アラート閾値")}
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                >
                  保存
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">この値を下回ったらLINE通知</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 賭け金上限設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-yellow-400" />
            賭け金リスク管理
          </CardTitle>
          <CardDescription>
            1レースあたりの最大賭け金を設定して過剰投資を防止します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="max-bet">1レースあたりの最大賭け金 (円)</Label>
            <div className="flex gap-2 max-w-xs">
              <Input
                id="max-bet"
                type="number"
                min="100"
                max="100000"
                step="100"
                value={maxBetPerRace}
                onChange={(e) => setMaxBetPerRace(e.target.value)}
              />
              <Button
                onClick={() => handleSaveSetting("max_bet_per_race", maxBetPerRace, "最大賭け金")}
                variant="outline"
                className="shrink-0"
              >
                保存
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ケリー基準で計算された賭け金がこの値を超える場合、上限値に制限されます
            </p>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4 text-yellow-400" />
              リスク管理のヒント
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>1レースの賭け金は資金の1〜2%以内が推奨（例: 資金10万円なら1,000〜2,000円）</li>
              <li>回収率が80%を下回る月が続いたら投資額を半減させることを検討</li>
              <li>見送り判定が出たレースは必ず見送る（感情的な賭けを避ける）</li>
              <li>月間損失が資金の10%を超えたら、その月の投資を停止する</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* 現在の設定サマリー */}
      {settings && Object.keys(settings).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">現在の設定</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">LINE通知</span>
                <span>{isLineConfigured ? "✓ 設定済み" : "未設定"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">目標回収率</span>
                <span>{settings["target_return_rate"] || "100"}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">アラート閾値</span>
                <span>{settings["alert_below_rate"] || "80"}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">最大賭け金</span>
                <span>¥{Number(settings["max_bet_per_race"] || 3000).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
