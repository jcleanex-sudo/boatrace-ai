#!/usr/bin/env python3
"""
scrape_odds.py - 3連単オッズをスクレイピングしてDBに保存
使用方法: python3 scrape_odds.py --date 20260403 --stadium 01 --race 1
"""
import argparse
import os
import sys
import json
import re
import requests
from datetime import datetime
from bs4 import BeautifulSoup

import psycopg2
import psycopg2.extras

def get_db_connection():
    url = os.environ.get("DATABASE_URL", "")
    conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    return conn

def scrape_trifecta_odds(date: str, stadium_id: str, race_number: int) -> dict:
    """
    ボートレース公式サイトから3連単オッズを取得
    返り値: {"1-2-3": 12.5, "1-2-4": 15.0, ...}
    """
    url = f"https://www.boatrace.jp/owpc/pc/race/odds3t?rno={race_number}&jcd={stadium_id.zfill(2)}&hd={date}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"[ERROR] オッズ取得失敗: {e}", file=sys.stderr)
        return {}

    soup = BeautifulSoup(resp.text, "html.parser")
    odds_dict = {}

    # 3連単オッズテーブルをパース
    # ボートレース公式の構造: td.oddsPoint に数値が入っている
    # 組み合わせは行・列の位置から算出
    tables = soup.select("table.is-w748")
    if not tables:
        # 別のセレクタを試す
        tables = soup.select("table.oddsPoint3t")

    if not tables:
        # テキストから直接パース
        # "1-2-3\n12.5" のような形式
        text = resp.text
        # オッズデータをJSONとして取得できる場合
        json_match = re.search(r'"odds3t"\s*:\s*(\{[^}]+\})', text)
        if json_match:
            try:
                raw = json.loads(json_match.group(1))
                for combo, val in raw.items():
                    if val and val != "---":
                        odds_dict[combo] = float(val)
            except Exception:
                pass
        return odds_dict

    # テーブルから3連単オッズを抽出
    # 1号艇が1着の場合: 1-2-3, 1-2-4, 1-2-5, 1-2-6, 1-3-2, ...
    boat_order = [1, 2, 3, 4, 5, 6]
    first_boats = boat_order  # 1着
    
    for table in tables[:6]:  # 最大6テーブル（1着ごと）
        rows = table.select("tr")
        for row in rows:
            cells = row.select("td.oddsPoint, td.is-oddsPoint")
            if not cells:
                continue
            for cell in cells:
                # data属性やtitle属性から組み合わせを取得
                combo = cell.get("data-combo") or cell.get("title", "")
                text = cell.get_text(strip=True)
                if combo and text and text != "---":
                    try:
                        odds_dict[combo] = float(text.replace(",", ""))
                    except ValueError:
                        pass

    # テーブル構造から組み合わせを推定（公式サイトの構造に基づく）
    if not odds_dict:
        # 全テーブルのセルを順番に読む
        all_cells = []
        for table in tables:
            for row in table.select("tr"):
                for cell in row.select("td"):
                    text = cell.get_text(strip=True)
                    if text and re.match(r"^\d+\.?\d*$", text.replace(",", "")):
                        all_cells.append(float(text.replace(",", "")))

        # 6艇の3連単は 6×5×4 = 120通り
        if len(all_cells) >= 120:
            idx = 0
            for first in range(1, 7):
                for second in range(1, 7):
                    if second == first:
                        continue
                    for third in range(1, 7):
                        if third == first or third == second:
                            continue
                        if idx < len(all_cells):
                            combo = f"{first}-{second}-{third}"
                            odds_dict[combo] = all_cells[idx]
                            idx += 1

    return odds_dict


def save_odds_to_db(date: str, stadium_id: str, race_number: int, odds_dict: dict):
    """オッズデータをDBに保存"""
    if not odds_dict:
        print("[WARN] オッズデータが空です", file=sys.stderr)
        return 0

    conn = get_db_connection()
    cursor = conn.cursor()
    saved = 0
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    race_date = f"{date[:4]}-{date[4:6]}-{date[6:8]}"

    for combo, odds_val in odds_dict.items():
        try:
            cursor.execute("""
                INSERT INTO odds_history (raceDate, stadiumId, raceNumber, combo, odds, recordedAt)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (race_date, stadium_id.zfill(2), race_number, combo, odds_val, now))
            saved += 1
        except Exception as e:
            print(f"[WARN] DB保存失敗 {combo}: {e}", file=sys.stderr)

    conn.commit()
    cursor.close()
    conn.close()
    return saved


def get_odds_history_from_db(date: str, stadium_id: str, race_number: int) -> list:
    """DBからオッズ変動履歴を取得"""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    race_date = f"{date[:4]}-{date[4:6]}-{date[6:8]}"

    cursor.execute("""
        SELECT combo, odds, recordedAt
        FROM odds_history
        WHERE raceDate = %s AND stadiumId = %s AND raceNumber = %s
        ORDER BY recordedAt ASC
    """, (race_date, stadium_id.zfill(2), race_number))

    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    # 組み合わせごとに変動をまとめる
    history = {}
    for row in rows:
        combo = row["combo"]
        if combo not in history:
            history[combo] = []
        history[combo].append({
            "odds": float(row["odds"]),
            "recordedAt": row["recordedAt"].isoformat() if hasattr(row["recordedAt"], "isoformat") else str(row["recordedAt"])
        })

    # 変動が大きい順にソート
    result = []
    for combo, records in history.items():
        if len(records) >= 2:
            first_odds = records[0]["odds"]
            last_odds = records[-1]["odds"]
            change_pct = ((last_odds - first_odds) / first_odds * 100) if first_odds > 0 else 0
            result.append({
                "combo": combo,
                "firstOdds": first_odds,
                "lastOdds": last_odds,
                "changePct": round(change_pct, 1),
                "records": records,
            })
        elif len(records) == 1:
            result.append({
                "combo": combo,
                "firstOdds": records[0]["odds"],
                "lastOdds": records[0]["odds"],
                "changePct": 0.0,
                "records": records,
            })

    result.sort(key=lambda x: abs(x["changePct"]), reverse=True)
    return result


def main():
    parser = argparse.ArgumentParser(description="3連単オッズ変動追跡")
    parser.add_argument("--date", required=True, help="レース日 (YYYYMMDD)")
    parser.add_argument("--stadium", required=True, help="競艇場コード (01-24)")
    parser.add_argument("--race", type=int, required=True, help="レース番号 (1-12)")
    parser.add_argument("--get-history", action="store_true", help="DBから変動履歴を取得して出力")
    args = parser.parse_args()

    if args.get_history:
        history = get_odds_history_from_db(args.date, args.stadium, args.race)
        print(json.dumps(history, ensure_ascii=False, indent=2))
        return

    print(f"[INFO] オッズ取得中: {args.date} {args.stadium}場 {args.race}R")
    odds = scrape_trifecta_odds(args.date, args.stadium, args.race)
    if odds:
        saved = save_odds_to_db(args.date, args.stadium, args.race, odds)
        print(json.dumps({
            "success": True,
            "saved": saved,
            "oddsCount": len(odds),
            "sample": dict(list(odds.items())[:5])
        }, ensure_ascii=False))
    else:
        print(json.dumps({"success": False, "error": "オッズデータを取得できませんでした"}))


if __name__ == "__main__":
    main()
