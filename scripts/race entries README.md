# 出走表事前取得 + フォールバック システム

`morning_predict_12.py` が朝8:00 のリアルタイムスクレイピングに失敗した場合に備え、
事前に出走表を取得しておき、DBから読み込むフォールバック構造を提供。

## 構成

```
prefetch_race_entries.py   # boatrace.jp → Neon DB に事前取得
race_entries_fallback.py   # morning_predict_12 用フォールバック関数
```

## 1. 事前取得 (prefetch_race_entries.py)

### 環境要件

```bash
pip install requests beautifulsoup4 psycopg2-binary
```

### 実行(瀬戸AI or ローカル)

```bash
export DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
python prefetch_race_entries.py            # 本日(JST)
python prefetch_race_entries.py 20260520   # 日付指定
```

### 動作

1. 本日の開催場(12場前後)を boatrace.jp から取得
1. 各場×12レース分の出走表をスクレイピング(レート制限1秒)
1. `race_entries` テーブルに upsert 保存
1. JSON ファイル(`race_entries_YYYYMMDD.json`)もローカル出力
1. 約3〜5分で完了

### 出力テーブル: race_entries

```sql
CREATE TABLE race_entries (
    id BIGSERIAL PRIMARY KEY,
    race_date DATE NOT NULL,
    stadium_code VARCHAR(2) NOT NULL,
    stadium_name VARCHAR(20),
    race_no INTEGER NOT NULL,
    waku INTEGER NOT NULL,
    toban VARCHAR(10),
    grade VARCHAR(3),
    racer_name VARCHAR(50),
    -- ... 詳細は prefetch_race_entries.py CREATE_TABLE_SQL 参照
    UNIQUE (race_date, stadium_code, race_no, waku)
);
```

upsert 構造なので、複数回実行しても重複しない。

## 2. フォールバック (race_entries_fallback.py)

### morning_predict_12.py への統合方法

**現状**:

```python
def fetch_race_entries(stadium_code, race_no):
    # boatrace.jp スクレイピング
    return scrape_boatrace_jp(stadium_code, race_no)
```

**修正後**:

```python
from race_entries_fallback import fetch_with_fallback

def fetch_race_entries(stadium_code, race_no):
    return fetch_with_fallback(
        primary_fetch_func=scrape_boatrace_jp,
        stadium_code=stadium_code,
        race_no=race_no,
    )
```

### 挙動

```
1. boatrace.jp スクレイピング試行
   ├ 成功 → そのままデータ返却
   └ 失敗(タイムアウト/IPブロック/HTTP error)
       ↓
2. Neon DB の race_entries から読み込み
   ├ データあり → DBデータ返却
   └ データなし → 空リスト返却(致命的)
```

## 3. 自動化案(中期改善)

毎晩23:00 に prefetch を自動実行する cron を追加:

### base44 / Render Cron 設定

```
Schedule: 0 14 * * *   # UTC 14:00 = JST 23:00
Command:  python prefetch_race_entries.py
```

これで毎日翌朝の本番8:00 までに最新出走表が DB に揃う状態に。

## 4. テスト方法

### prefetch スクリプト単体テスト

```bash
DATABASE_URL=... python prefetch_race_entries.py
```

成功条件:

- ログに「Saved N entries to race_entries」が表示
- Neon SQL Editor で `SELECT COUNT(*) FROM race_entries WHERE race_date = CURRENT_DATE` が >0

### fallback モジュール単体テスト

```bash
DATABASE_URL=... python race_entries_fallback.py
```

成功条件:

- 「取得成功: 6 艇分」と表示
- 各艇の選手名・勝率が出力

### 統合テスト

morning_predict_12.py に組み込んだ後:

```python
# モックでスクレイピング失敗させる
def mock_scrape_fail(stadium_code, race_no):
    raise Exception("simulated IP block")

entries = fetch_with_fallback(
    primary_fetch_func=mock_scrape_fail,
    stadium_code='01',
    race_no=1,
)
assert len(entries) == 6  # DBから読めてればOK
```

## 5. 注意事項

- **scraping rate limit**: `REQUEST_INTERVAL_SEC = 1.0` を厳守(boatrace.jp への負荷配慮)
- **DATABASE_URL**: Neon のセキュアな接続文字列を使用(Render環境変数推奨)
- **テーブル名衝突**: 既存の `race_entries` テーブルがある場合はスキーマ確認必須
- **タイムゾーン**: 全て JST 基準(日付は朝8:00 時点での日付)

## 6. 既知の制約

- レース直前変更(F持ち選手の進入変更等)は反映されない → 朝8:00 のリアルタイム取得が常に優先
- 出走取消(R欠場)情報は事前取得時点では不明 → フォールバック時は朝の判断が必要
- ボート番号・モーター番号は前夜時点と変わらないため事前取得で OK

## 7. デプロイ手順(base44 復帰時)

1. `prefetch_race_entries.py` を Render リポジトリに追加
1. `race_entries_fallback.py` を Render リポジトリに追加
1. `morning_predict_12.py` の fetch 部分を `fetch_with_fallback` 呼出に変更
1. Render Cron Job 設定: 毎日 23:00 JST に prefetch 実行
1. テスト: morning_predict_12 のドライランで fallback 動作確認
1. 本番投入