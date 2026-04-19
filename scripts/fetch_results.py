#!/usr/bin/env python3
"""
fetch_results.py
Boatrace Open API から過去レース結果を取得し、DBに保存する。
Usage:
  python3 fetch_results.py --start 2024-01-01 --end 2024-12-31
  python3 fetch_results.py --date 2025-03-05
"""
import argparse
import json
import os
import sys
import time
from datetime import date, timedelta, datetime

import requests

SCRIPTS_DIR = os.path.dirname(__file__)
sys.path.insert(0, SCRIPTS_DIR)
from db_helper import get_db  # noqa: E402

OPEN_API_BASE = "https://boatraceopenapi.github.io/results/v2"


def fetch_day(target_date: date) -> list[dict]:
    """指定日のレース結果をOpen APIから取得"""
    year = target_date.year
    date_str = target_date.strftime("%Y%m%d")
    url = f"{OPEN_API_BASE}/{year}/{date_str}.json"
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  [WARN] {target_date}: {e}", file=sys.stderr)
        return []

    rows = []
    for race in data.get("results", []):
        stadium_id = str(race.get("race_stadium_number", "")).zfill(2)
        race_number = race.get("race_number")

        # 払戈金—新形式: payoutsはオブジェクト形式 {"trifecta": [{"combination":"1-2-3","payout":1000}], ...}
        raw_payouts = race.get("payouts", {})

        def get_payout(key):
            """payoutsオブジェクトから最初の組合せと金額を取得"""
            items = raw_payouts.get(key, [])
            if not items:
                return None, None
            if isinstance(items, list):
                first = items[0]
                return first.get("combination"), first.get("payout")
            return None, None

        trifecta_combo, trifecta_payout = get_payout("trifecta")
        exacta_combo, exacta_payout = get_payout("exacta")
        trio_combo, trio_payout = get_payout("trio")
        quinella_combo, quinella_payout = get_payout("quinella")
        win_combo, win_payout = get_payout("win")
        place_combo, place_payout = get_payout("place")

        for r in race.get("boats", []):
            rows.append({
                "raceDate": target_date.isoformat(),
                "stadiumId": stadium_id,
                "raceNumber": race_number,
                "boatNumber": r.get("racer_boat_number"),
                "place": r.get("racer_place_number"),
                "racerNumber": r.get("racer_number"),
                "startTiming": r.get("racer_start_timing"),
                "trifectaCombo": trifecta_combo,
                "trifectaPayout": trifecta_payout,
                "exactaCombo": exacta_combo,
                "exactaPayout": exacta_payout,
                "trioCombo": trio_combo,
                "trioPayout": trio_payout,
                "quinellaCombo": quinella_combo,
                "quinellaPayout": quinella_payout,
                "winCombo": win_combo,
                "winPayout": win_payout,
                "placeCombo": place_combo,
                "placePayout": place_payout,
            })
    return rows


def save_rows(conn, rows: list[dict]) -> int:
    """レース結果をDBにUPSERT"""
    if not rows:
        return 0
    cursor = conn.cursor()
    sql = """
        INSERT INTO race_results
          (raceDate, stadiumId, raceNumber, boatNumber, place, racerNumber,
           startTiming, trifectaCombo, trifectaPayout, exactaCombo, exactaPayout,
           trioCombo, trioPayout, quinellaCombo, quinellaPayout,
           winCombo, winPayout, placeCombo, placePayout)
        VALUES
          (%(raceDate)s, %(stadiumId)s, %(raceNumber)s, %(boatNumber)s, %(place)s,
           %(racerNumber)s, %(startTiming)s,
           %(trifectaCombo)s, %(trifectaPayout)s,
           %(exactaCombo)s, %(exactaPayout)s,
           %(trioCombo)s, %(trioPayout)s,
           %(quinellaCombo)s, %(quinellaPayout)s,
           %(winCombo)s, %(winPayout)s,
           %(placeCombo)s, %(placePayout)s)
        ON DUPLICATE KEY UPDATE
          place=VALUES(place), startTiming=VALUES(startTiming),
          trifectaCombo=VALUES(trifectaCombo), trifectaPayout=VALUES(trifectaPayout)
    """
    # ON DUPLICATE KEY が効くようにユニーク制約が必要だが、ここでは INSERT IGNORE で代用
    inserted = 0
    for row in rows:
        try:
            cursor.execute(sql, row)
            inserted += cursor.rowcount
        except Exception as e:
            print(f"  [WARN] insert error: {e}", file=sys.stderr)
    conn.commit()
    cursor.close()
    return inserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="単日 YYYY-MM-DD")
    parser.add_argument("--start", help="開始日 YYYY-MM-DD")
    parser.add_argument("--end", help="終了日 YYYY-MM-DD")
    parser.add_argument("--days", type=int, default=30, help="過去N日分 (--date/--start/--end未指定時)")
    args = parser.parse_args()

    if args.date:
        dates = [datetime.strptime(args.date, "%Y-%m-%d").date()]
    elif args.start and args.end:
        start = datetime.strptime(args.start, "%Y-%m-%d").date()
        end = datetime.strptime(args.end, "%Y-%m-%d").date()
        dates = []
        cur = start
        while cur <= end:
            dates.append(cur)
            cur += timedelta(days=1)
    else:
        today = date.today()
        dates = [today - timedelta(days=i) for i in range(args.days, 0, -1)]

    conn = get_db()
    total = 0
    for d in dates:
        rows = fetch_day(d)
        n = save_rows(conn, rows)
        total += n
        print(f"  {d}: {len(rows)} rows fetched, {n} inserted/updated")
        time.sleep(0.5)

    conn.close()
    print(f"\nDone. Total {total} rows saved.")
    # 結果をJSONで出力 (tRPCから呼び出す場合)
    print(json.dumps({"success": True, "total": total}))


if __name__ == "__main__":
    main()
