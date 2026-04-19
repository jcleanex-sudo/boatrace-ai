#!/usr/bin/env python3.11
"""
check_hit.py
予想ログ (prediction_logs) とレース結果 (race_results) を照合して的中判定を行う。
Usage:
  python3 check_hit.py --date 20260402  # 指定日の全予想を照合
  python3 check_hit.py --all            # 全予想を照合
"""
import argparse
import json
import sys
from db_helper import get_db


def check_hit_for_prediction(conn, pred_log: dict) -> dict:
    """
    1件の予想ログに対して的中判定を行う。
    戻り値: {"isHit": 0 or 1, "actualResult": "1-2-3", "payout": 1234}
    """
    race_date = pred_log["raceDate"]
    stadium_id = pred_log["stadiumId"]
    race_number = pred_log["raceNumber"]
    predictions = pred_log["predictions"]

    # predictionsはJSON配列: [{"combo": "1-2-3", "probability": 0.08, "odds": 12.3}, ...]
    if isinstance(predictions, str):
        predictions = json.loads(predictions)

    # 予想した組み合わせリスト
    predicted_combos = [p["combo"] for p in predictions if "combo" in p]

    # レース結果から3連単を取得
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT trifectaCombo, trifectaPayout
        FROM race_results
        WHERE raceDate=%s AND stadiumId=%s AND raceNumber=%s AND trifectaCombo IS NOT NULL
        LIMIT 1
    """, (race_date, stadium_id, race_number))
    result = cursor.fetchone()
    cursor.close()

    if not result:
        # レース結果がまだない
        return {"isHit": None, "actualResult": None, "payout": None}

    actual_combo = result["trifectaCombo"]
    payout = result["trifectaPayout"]

    is_hit = 1 if actual_combo in predicted_combos else 0

    return {
        "isHit": is_hit,
        "actualResult": actual_combo,
        "payout": payout if is_hit else 0,
    }


def update_prediction_log(conn, log_id: int, hit_data: dict):
    """prediction_logsテーブルのisHit・actualResult・payoutを更新"""
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE prediction_logs
        SET isHit=%s, actualResult=%s, payout=%s
        WHERE id=%s
    """, (hit_data["isHit"], hit_data["actualResult"], hit_data["payout"], log_id))
    conn.commit()
    cursor.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="YYYYMMDD形式の日付（指定日の予想のみ照合）")
    parser.add_argument("--all", action="store_true", help="全予想を照合")
    args = parser.parse_args()

    conn = get_db()
    cursor = conn.cursor(dictionary=True)

    # 照合対象の予想ログを取得
    if args.date:
        race_date = args.date.replace("-", "")
        cursor.execute("""
            SELECT id, raceDate, stadiumId, raceNumber, predictions, isHit, actualResult
            FROM prediction_logs
            WHERE DATE_FORMAT(raceDate, '%Y%m%d') = %s
            ORDER BY createdAt
        """, (race_date,))
    elif args.all:
        cursor.execute("""
            SELECT id, raceDate, stadiumId, raceNumber, predictions, isHit, actualResult
            FROM prediction_logs
            ORDER BY createdAt
        """)
    else:
        print(json.dumps({"success": False, "error": "--date または --all を指定してください"}))
        sys.exit(1)

    logs = cursor.fetchall()
    cursor.close()

    checked = 0
    updated = 0

    for log in logs:
        hit_data = check_hit_for_prediction(conn, log)
        if hit_data["isHit"] is None:
            # レース結果がまだない
            continue

        # 既に照合済みの場合はスキップ
        if log["isHit"] is not None and log["actualResult"] == hit_data["actualResult"]:
            checked += 1
            continue

        update_prediction_log(conn, log["id"], hit_data)
        updated += 1
        checked += 1

    conn.close()

    print(json.dumps({
        "success": True,
        "checked": checked,
        "updated": updated,
    }))


if __name__ == "__main__":
    main()
