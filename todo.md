# 競艇予想AI - TODO

## DBスキーマ
- [x] race_results テーブル（レース結果・着順・STタイム・配当）
- [x] race_entries テーブル（出走表：選手・モーター・ボート成績）
- [x] race_beforeinfo テーブル（直前情報：展示タイム・チルト・オッズ）
- [x] prediction_logs テーブル（予想ログ）
- [x] data_fetch_logs テーブル（データ取得ログ）

## バックエンドAPI（tRPCルーター）
- [x] data.fetchResults: Boatrace Open APIから過去結果を取得・保存
- [x] data.scrapeRacecard: 公式サイトから出走表をスクレイピング・保存
- [x] data.scrapeBeforeInfo: 公式サイトから直前情報をスクレイピング・保存
- [x] data.getDataStatus: DB内データ件数・最終更新日を返す
- [x] data.trainModel: LightGBMモデルの学習
- [x] predict.run: 指定レースの3連単×6点予想を実行
- [x] predict.getHistory: 過去の予想ログ一覧を返す
- [x] race.getStadiums: 開催場一覧を返す

## Pythonスクリプト（サーバーサイド実行）
- [x] scripts/fetch_results.py: Boatrace Open APIからデータ取得
- [x] scripts/scrape_racecard.py: 出走表スクレイピング
- [x] scripts/scrape_beforeinfo.py: 直前情報スクレイピング
- [x] scripts/train_model.py: LightGBMモデル学習
- [x] scripts/predict.py: 3連単×6点予想実行（LightGBM + ヒューリスティック）

## フロントエンドUI
- [x] ダッシュボードレイアウト（DashboardLayout使用）
- [x] 予想実行ページ（レース選択UI）
  - [x] 開催場選択（24場）
  - [x] 日付選択
  - [x] レース番号選択（1〜12R）
  - [x] データ取得ボタン（出走表・直前情報）
  - [x] 予想実行ボタン
- [x] 予想結果表示UI
  - [x] 推奨3連単6点リスト（予測確率付き）
  - [x] 各選手情報テーブル（級別・勝率・モーター等）
  - [x] 環境情報表示（天候・風・波）
  - [x] 展示タイム・オッズ表示
- [x] データ管理ページ
  - [x] 過去データ取得状況表示
  - [x] 一括データ取得ボタン
  - [x] モデル学習ボタン
- [x] 予想履歴ページ

## テスト
- [x] race router のユニットテスト（getStadiums, getRaceEntries, getRaceBeforeInfo）
- [x] data router のユニットテスト（getStatus, scrapeRacecard, scrapeBeforeInfo, fetchResults, trainModel）
- [x] predict router のユニットテスト（run, getHistory）
- [x] auth router のユニットテスト（me）

## バグ修正
- [x] python3コマンドをpython3.11に変更（SREモジュールミスマッチエラー解消）
- [x] db_helper.pyを作成し全スクリプトのDB接続を共通化（TiDB Cloud SSL対応）
- [x] runPythonをホワイトリスト環境変数方式に変更（PYTHONPATH/OTEL等の干渉を完全排除）
- [x] exec→execFileに変更しテストモックも対応（全17テスト通過）

## 機能追加
- [x] 予想結果の3連単組み合わせに選手名を表示（例: 1-2-3 → 山田太郎-鈴木一郎-佐藤次郎）
- [x] scrape_racecard.pyの選手名スクレイピングを正しいHTML構造（div.is-fs18）に対応
- [x] predict.pyのSQLをMAX(id)サブクエリ方式に変更し重複データを除外

## 機能追加（展示タイム・直線・STタイム）
- [x] race_before_infoテーブルにstartTimeカラムを追加
- [x] scrape_beforeinfo.pyを実際のHTML構造に対応（展示タイム・STタイム・単勝オッズ・3連単オッズを正しく取得）
- [x] predict.pyのSQLクエリにstartTimeを追加
- [x] PredictPage.tsxの選手情報テーブルにST列を追加（F/Lは赤色・黄色で警告表示）
- [x] 周り足・直線タイム：beforeinfo2ページはログイン必須のため取得不可（公式サイト仕様による制約）

## 機能追加（本線・抱え・穴目の3カテゴリ予想）
- [x] predict.py: 本線6点（高確率上位）・抱え3点（本線軸を含む中穴）・穴目3点（低人気だが高オッズ狙い）の選出ロジックを実装
- [x] predict.py: 出力JSONに honsen/osae/aname フィールドを追加
- [x] PredictPage.tsx: 予想結果を本線・抱え・穴目の3カラムレイアウトで分けて表示
- [x] PredictPage.tsx: 各カテゴリに色分け（本線=黄金、抱え=シルバー、穴目=シアン）でアイコン付き表示

## 機能追加（天気・気温・水温等の環境情報表示）
- [x] PredictPage.tsx: 天気・風向・風速・波高・水温・気温をアイコン付きグラデーションバナーで表示
- [x] PredictPage.tsx: 環境情報カードを予想結果直下に表示（天気・気温・水温・風向風速・波高）

## バグ修正・機能追加（2026/04/02）
- [x] 環境情報（天気・気温・水温・風向・風速・波高）スクレイピング修正（beforeinfoページから正しく取得、race_before_infoにカラム追加）
- [x] 24場の競艇場特性データ整備（scripts/stadium_characteristics.py作成）
- [x] 競艇場特性を予想ロジックに組み込み（predict.pyに場特性・風補正を追加）
- [x] PredictPage.tsxに場特性情報カード表示（水質・干満差・イン強さ・追い風方向・備考）

## 機能追加・改善（2026/04/02 その2）
- [x] 安定板情報をスクレイピングで取得（beforeinfoページの安定板使用ラベルを検出）
- [x] race_before_infoに安定板カラムを追加しDBマイグレーション完了
- [x] predict.pyに安定板補正を追加（安定板付き→イン+5%・アウト-5%）
- [x] PredictPage: 的中率サマリーに0件時の空状態表示（「本日の予想はまだありません」）を追加
- [x] PredictPage.tsxに安定板表示を追加（バッジ等）
- [x] データ取得の並列化（出走表・直前情報を並列スクレイピングしてレスポンス改嚄）
- [x] routers.tsのscrapeRacecardとscrapeBeforeInfoを並列実行対応（scrapeAllプロシージャを追加）

## 機能追加（2026/04/02 その3）
- [x] 当日の予想ログに対してレース結果を照合し的中判定を行うAPIを追加（check_hit.py・predict.checkHit）
- [x] prediction_logsテーブルのisHit・actualResult・payoutを自動更新するスクリプト作成
- [x] 予想実行ページ（PredictPage）に当日の的中率サマリーカードを追加（予想数・的中数・的中率・合計払戻）
- [x] 安定板使用バッジを環境情報バナー・予想ヘッダーに表示
- [x] 出走表・直前情報を並列取得（scrapeAllミューテーション）でレスポンス改善

## バグ修正（2026/04/02 その4）
- [x] mysql-connector-python が未インストールでpredict.pyがクラッシュするバグを修正（sudo pip3でインストール）
- [x] サーバー起動時にPython依存パッケージを自動インストールする仕組みを追加（server/_core/index.tsにensurePythonDeps追加）
- [x] scripts/requirements.txtを作成（mysql-connector-python・リクエスト・ビーティフルスープ・ライトグビム・サイキットラーン・パンダス・ナンパイ）

## 機能追加（2026/04/03）
- [x] サイドバーに当日の予想数・的中数・的中率をリアルタイム表示するサマリーウィジェットを追加（DailyStatsWidget）
- [x] DashboardLayoutのサイドバーにウィジェットを組み込み（30秒ごと自動更新・的中率カラーコード対応）
- [x] fetch_results.pyのAPIレスポンス構造対応修正（trifecta/exacta/trio形式）

## 収益化機能（2026/04/03）
- [x] prediction_logsにbetAmount（賭け金）・actualPayout（実払戻）カラムを追加しDBマイグレーション
- [x] bankrollテーブルを新規作成（日別収支・累計収支・回収率管理）
- [x] predict.pyにオッズ取得機能を追加（trifectaOddsをDBから取得）
- [x] predict.pyに期待値計算ロジックを追加（各組み合わせの確率xd7オッズ）
- [x] predict.pyに賭け金配分提案ロジックを追加（期待値に応じた6点への最適配分）
- [x] routers.tsに賭け金入力・収支記録APIを追加（updateBet mutation）
- [x] routers.tsに収支サマリーAPI（日別・月別・累計回収率）を追加
- [x] PredictPageに期待値表示カラムを予想結果テーブルに追加
- [x] PredictPageに賭け金配分提案UIを追加（各組み合わせへの推奨賭け金）
- [x] PredictPageに賭け金入力フォームを追加（実際に賭けた金額を記録）
- [x] BankrollPage（収支管理ページ）を新規作成（日別収支グラフ・累計回収率・月別サマリー）
- [x] サイドバーにBankrollPageへのリンクを追加

## 収益化フル実装（2026/04/03）
- [x] prediction_logsにbetAmount（賭け金）カラムを追加しDBマイグレーション
- [x] bankrollテーブルを新規作成（日別収支・累計収支・回収率管理）
- [x] predict.pyにオッズ取得機能を追加（trifectaOddsをDBから取得）
- [x] predict.pyに期待値計算ロジックを追加（確率xd7オッズ）
- [x] predict.pyに賭け金配分提案ロジックを追加（期待値に応じた最適配分）
- [x] routers.tsに賭け金入力・収支記録APIを追加（updateBet mutation）
- [x] routers.tsに収支サマリーAPI（日別・月別・累計回収率）を追加
- [x] 過去データ自動収集スケジューラーを追加（毎日深夜に前日結果を自動取得）
- [x] PredictPageに期待値表示カラムを予想結果テーブルに追加
- [x] PredictPageに賭け金配分提案UIを追加（各組み合わせへの推奨賭け金）
- [x] PredictPageに賭け金入力フォームを追加（実際に賭けた金額を記録）
- [x] BankrollPage（収支管理ページ）を新規作成（日別収支グラフ・累計回収率・月別サマリー）
- [x] サイドバーにBankrollPageへのリンクを追加（DollarSignアイコン）
- [x] サイドバーの当日成績ウィジェットに回収率を追加表示

## 精度向上・収益化強化（2026/04/03 大規模アップデート）

### 過去データ自動収集
- [x] collect_history.py: boatrace open APIから2〜3年分の過去レース結果を一括収集
- [x] routers.tsにcollectHistory手動実行APIを追加
- [x] 自動的中判定スケジューラー（server/_core/index.ts）: レース終了後に自動でcheck_hit.pyを実行するcronジョブを追加
- [x] 過去データ自動収集スケジューラー: 毎日深夜に前日結果を自動取得するcronジョブを追加

### 見送り判定・ケリー基準
- [x] predict.py: 全組み合わせのEVが閾値以下の場合「見送り推奨」フラグを追加（shouldSkip/skipReason）
- [x] predict.py: ケリー基準による賭け金配分（期待値・オッズ・資金残高から最適賭け金を算出）
- [x] routers.tsにbankroll残高取得APIを追加（getBankrollBalance）
- [x] PredictPage: 見送り推奨時に警告バナーを表示（SkipForwardアイコン付き）

### フライング・出遅れ履歴補正
- [x] predict.py: 直近のF/L歴がある選手の確率を大幅に下げる補正を追加（flyingCount/lateCount）
- [x] PredictPage: 選手テーブルにF/L列を追加（件数に応じて赤・橙・黄色で警告表示）

### 干満差補正
- [x] predict.py: 干満差のある競艇場（児島・宮島・住之江等）で前半（1〜6R）と後半（7〜12R）の潮の状態に応じた補正を追加

### スタート展示タイム分析強化
- [x] predict.py: 展示タイムをコース別・場別の基準値と比較して相対評価に変換

### 複数レース一括予想
- [x] routers.tsにbatchPredict APIを追加（1場の全12レースを一括予想）
- [x] BatchPredictPage: 一括予想ページを新規作成（レース選択・一括実行・見送り判定・EV表示）
- [x] サイドバーに「一括予想」ナビゲーション項目を追加（Layersアイコン）

### 回収率条件別分析UI
- [x] BankrollPage: 競艇場別・レース番号別の回収率テーブルを追加
- [x] routers.tsに条件別収支集計API（getBankrollByCondition）を追加
- [x] db.tsにgetBankrollByConditionヘルパーを追加

### 予想根拠表示
- [x] predict.py: 各選手への補正内容（場特性・風・安定板・F歴・干満差・展示タイム等）をJSON出力に追加（adjustments[]フィールド）
- [x] predict.py: 全体の補正サマリーをcorrectionSummary[]として出力
- [x] PredictPage: 予想根拠（補正内容）を選手テーブルの「補正内容」列に表示
- [x] PredictPage: 適用された補正をバッジ形式でサマリー表示

## 全機能追加（2026/04/04 第2弾大規模アップデート）

### 精度向上系
- [x] predict.py: 2連単モード自動切替（波高>15cm または 風速>5m/s の場合に3連単→2連単へ切替）
- [x] predict.py: 選手直近3ヶ月成績フィルタ（直近勝率が著しく低い選手を自動除外）
- [x] predict.py: モーター整備後トレンド補正（整備直後N日以内のモーターに不確実性補正を追加）
- [x] predict.py: コース別勝率を学習特徴量に追加（選手ごとのコース別勝率をDBから取得してLightGBMに入力）
- [x] train_model.py: コース別勝率特徴量を学習に組み込む

### 収益化・運用系
- [x] LINE通知機能: 予想完了・的中時にLINE Notifyでスマホへ自動通知（server/_core/index.tsのスケジューラーに組み込み）
- [x] routers.tsにLINE通知設定API（トークン保存・テスト送信）を追加（settingsRouter.testLineNotify）
- [x] SettingsPage: LINE通知設定ページを新規作成（トークン入力・テスト送信ボタン・目標回収率・賭け金上限）
- [x] 目標回収率アラート: 月間回収率が設定値を下回ったらLINE通知（SettingsPageで設定可能）
- [x] 賭け金上限設定: 1レースの最大賭け金をSettingsPageで設定・predict.pyのケリー基準に反映
- [x] 見送り履歴ページ: SkipHistoryPage新規作成（見送り推奨レースの結果を後から確認・実際結果入力）
- [x] 月次レポート自動生成: AnalyticsPageに月別収支サマリーテーブルを表示（月末PDF生成は将来拡張）

### UI・分析系
- [x] AnalyticsPage: 予想精度ダッシュボード（本線・抱え・穴目それぞれの的中率グラフ）
- [x] AnalyticsPage: 天候別成績分析（晴れ・雨・強風での回収率比較テーブル）
- [x] AnalyticsPage: 月別収支サマリービュー（月間の予想・的中・収支テーブルと回収率グラフ）
- [x] OddsMonitorPage: オッズ変動モニタリングページ新規作成（締め切り前のオッズ変動を追跡・人気集中/穴を検出）
- [x] DashboardLayout: サイドバーに予想分析・見送り履歴・オッズモニター・設定へのリンクを追加

### 上級機能
- [x] train_model.py: アンサンブル学習（LightGBM + XGBoost + RandomForest + GradientBoostingの多数決）
- [x] predict.py: オッズ逆算確率補正（市場オッズから暗黙の確率を計算し自モデルと合成）
- [x] train_model.py: ベイズ最適化によるハイパーパラメータ自動調整（optuna使用）

## 追加実装（2026/04/05）

- [x] AnalyticsPage: 予想カレンダービュー（月間の日別収支・的中・予想数をカレンダー形式で表示、前後月ナビゲーション付き）
- [x] routers.ts analyticsRouter: getDailyCalendar API追加（指定月の日別収支・予想数を返す）
- [x] server/_core/index.ts: 目標回収率アラートスケジューラー追加（毎日23時に当月回収率をチェックしてLINE通知）
- [x] server/_core/index.ts: LINE通知ヘルパー関数（sendLineNotify）とDB設定取得ヘルパー（getAppSetting）を追加
- [x] predict.py: max_bet引数を追加しcalc_kelly_bet/calc_bet_allocationにDB設定からの上限を反映

## 開催中おすすめレース機能（2026/04/05）
- [x] routers.ts: getRecommendedRaces API（内部データからEV・見送り判定でランキング）
- [x] RecommendedRacesPage.tsx: おすすめレース一覧ページ（EV順・場別フィルタ・ワンクリックで予想実行）
- [x] DashboardLayout.tsx: サイドバーに「おすすめレース」ナビゲーション項目を追加（Starアイコン）
- [x] App.tsx: RecommendedRacesPageのルートを追加（/recommended）

## おすすめレース精度向上（2026/04/06）
- [x] routers.ts: スコアリングをEV単独→複合スコア（EV×確率×環境リスク×場特性）に変更
- [x] routers.ts: 環境リスクフィルタ追加（風速>7m/s・波高>15cmのレースを除外）
- [x] routers.ts: 1号艇確率が高いレースを優先（イン有利の安定レース）
- [x] routers.ts: 本線トップ組み合わせの確率が高いレースを優先（予想精度が高い）
- [x] routers.ts: 信頼度スコア（0〜100）を計算して返す
- [x] routers.ts: 荒れやすい条件（強風・高波・アウト有利場の後半レース）を検出して警告
- [x] RecommendedRacesPage.tsx: 信頼度スコアをプログレスバーで表示
- [x] RecommendedRacesPage.tsx: 「荒れ注意」「安定」バッジを追加
- [x] RecommendedRacesPage.tsx: 1号艇確率・トップ組み合わせ確率を表示
- [x] RecommendedRacesPage.tsx: ソート順を「信頼度スコア順」に変更（EV×確率の複合）

## おすすめレース高速化（2026/04/06）
- [x] routers.ts: 並列数をCONCURRENCY=5→全件同時並列に変更（for loopを削除）
- [x] routers.ts: predict.pyのタイムアウトを120秒←20秒に短縮（遅いレースを早期スキップ）
- [x] RecommendedRacesPage.tsx: スキャン中に経過秒数プログレスバーを表示
- [x] RecommendedRacesPage.tsx: スキャン未実行時は enabled=falseで自動実行しないよう変更
- [x] routers.ts: 当日データが0件の場合は早期リターン（既存実装済み）

## 展示タイム・ST補正改善（2026/04/06）
- [x] predict.py: 展示タイム補正を「全国平均比較」→「同レース内6艇の相対順位比較」に変更
- [x] predict.py: スタート展示ST（startTime）を解析して確率補正に組み込む（早いSTは有利、遅いSTは不利）
- [x] predict.py: 展示データがない場合（展示前）は補正なし（0.0）で正常動作を維持
- [x] predict.py: 補正根拠ログ（adjustment_log）に展示相対順位とST値を記録

## デザインリニューアル（2026/04/06）
- [x] index.css: カラーパレットを海・競艇テーマ（ターコイズ・ネイビー・コーラル・ゴールド）に変更
- [x] index.css: フォントをM PLUS Rounded 1c（丸みのある日本語フォント）に変更
- [x] DashboardLayout.tsx: サイドバーを海・波テーマのグラデーションデザインに変更
- [x] DashboardLayout.tsx: マスコットロゴ・ナビアイコンを競艇テーマに変更
- [x] PredictPage.tsx: カード・ボタン・ヘッダーを新テーマに統一
- [x] RecommendedRacesPage.tsx: 新テーマに統一
- [x] DataPage.tsx: 新テーマに統一
- [x] Home.tsx: PredictPageへのリダイレクトのみ（ランディングページ不要、PredictPageが実質的なホーム）

## バグ修正（2026/04/06 本番環境）
- [x] routers.ts: 本番環境でpython3.11が見つからないENOENTエラーを修正（resolvePythonBin()でpython3.11→python3→pythonの順に動的検出）

## バグ修正（2026/04/06 本番環境 その2）
- [x] routers.ts: 本番環境でspawn python3 ENOENTエラーを修正（execFileSync+whichにESM対応で動的検出）

## バグ修正（2026/04/08 本番環境）
- [x] fetch_results.py: 本番環境でCommand failedエラーを修正（db_helper.pyのDATABASE_URLに混入したdotenvメッセージを_parse_db_url()で除去）
