#!/usr/bin/env python3.11
"""
collect_history.py
Boatrace Open APIから過去2〜3年分のレース結果を一括収集してDBに保存する。
Usage:
  python3 collect_history.py --years 2          # 過去2年分
  python3 collect_history.py --from 20230101 --to 20241231  # 期間指定
  python3 collect_history.py --months 6         # 過去6ヶ月分
"""
import argparse
import json
import sys
import time
from datetime import date, timedelta
from db_helper import get_db

BOATRACE_API_BASE = "https://boatrace.jp/owpc/pc/race/resultlist"

def date_range(start: date, end: date):
    """start から end まで1日ずつ生成"""
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)

def fetch_results_for_date(conn, target_date: date) -> dict:
    """
    指定日の全場・全レース結果を取得してDBに保存する。
    fetch_results.py の処理を日付指定で呼び出す形式。
    """
    import subprocess
    date_str = target_date.strftime("%Y-%m-%d")
    result = subprocess.run(
        ["/usr/bin/python3.11", "/home/ubuntu/boatrace-ai/scripts/fetch_results.py",
         "--date", date_str],
        capture_output=True, text=True, timeout=120
    )
    stdout = result.stdout.strip()
    if not stdout:
        return {"success": False, "date": date_str, "total": 0, "error": result.stderr[:200]}
    # 最後のJSON行を取得
    for line in reversed(stdout.split("\n")):
        line = line.strip()
        if line.startswith("{"):
            try:
                data = json.loads(line)
                data["date"] = date_str
                return data
            except json.JSONDecodeError:
                pass
    return {"success": False, "date": date_str, "total": 0, "error": "JSON parse failed"}

def main():
    parser = argparse.ArgumentParser(description="過去レース結果の一括収集")
    parser.add_argument("--years", type=int, default=None, help="過去N年分を収集")
    parser.add_argument("--months", type=int, default=None, help="過去Nヶ月分を収集")
    parser.add_argument("--from", dest="from_date", help="開始日 YYYYMMDD")
    parser.add_argument("--to", dest="to_date", help="終了日 YYYYMMDD")
    parser.add_argument("--delay", type=float, default=1.0, help="日付間のスリープ秒数（デフォルト1.0）")
    parser.add_argument("--dry-run", action="store_true", help="実際には保存せずに対象日付を表示")
    args = parser.parse_args()

    today = date.today()

    # 期間を決定
    if args.from_date and args.to_date:
        start = date(int(args.from_date[:4]), int(args.from_date[4:6]), int(args.from_date[6:8]))
        end = date(int(args.to_date[:4]), int(args.to_date[4:6]), int(args.to_date[6:8]))
    elif args.years:
        start = date(today.year - args.years, today.month, today.day)
        end = today - timedelta(days=1)
    elif args.months:
        # 月数を日数に変換（近似）
        start = today - timedelta(days=args.months * 30)
        end = today - timedelta(days=1)
    else:
        # デフォルト: 過去2年分
        start = date(today.year - 2, today.month, today.day)
        end = today - timedelta(days=1)

    dates = list(date_range(start, end))
    total_days = len(dates)

    print(f"[CollectHistory] 収集期間: {start} 〜 {end} ({total_days}日分)", flush=True)

    if args.dry_run:
        print(f"[CollectHistory] DRY RUN: {total_days}日分の処理をスキップ", flush=True)
        print(json.dumps({"success": True, "total": 0, "days": total_days, "dry_run": True}))
        return

    total_saved = 0
    success_days = 0
    error_days = 0
    errors = []

    for i, d in enumerate(dates):
        try:
            result = fetch_results_for_date(None, d)
            if result.get("success"):
                saved = result.get("total", 0)
                total_saved += saved
                success_days += 1
                if i % 30 == 0:  # 30日ごとに進捗表示
                    print(f"[CollectHistory] 進捗: {i+1}/{total_days}日 ({d}) - 累計{total_saved}件保存", flush=True)
            else:
                error_days += 1
                errors.append({"date": str(d), "error": result.get("error", "unknown")})
        except Exception as e:
            error_days += 1
            errors.append({"date": str(d), "error": str(e)})

        # サーバー負荷軽減のためスリープ
        if args.delay > 0 and i < total_days - 1:
            time.sleep(args.delay)

    summary = {
        "success": True,
        "totalDays": total_days,
        "successDays": success_days,
        "errorDays": error_days,
        "totalSaved": total_saved,
        "errors": errors[:10],  # 最初の10件のエラーのみ
    }
    print(f"[CollectHistory] 完了: {success_days}/{total_days}日成功, {total_saved}件保存", flush=True)
    print(json.dumps(summary))

if __name__ == "__main__":
    main()
