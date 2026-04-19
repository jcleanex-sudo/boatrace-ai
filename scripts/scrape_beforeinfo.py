#!/usr/bin/env python3
"""
scrape_beforeinfo.py
ボートレース公式サイトから直前情報（展示タイム・チルト・STタイム・オッズ）をスクレイピングしてDBに保存する。

取得ページ:
  - /owpc/pc/race/beforeinfo  : 展示タイム・チルト・STタイム
  - /owpc/pc/race/oddstf      : 単勝オッズ
  - /owpc/pc/race/odds3t      : 3連単オッズ

Usage:
  python3 scrape_beforeinfo.py --date 20250305 --stadium 01 --race 3
"""
import argparse
import json
import os
import sys
import time

import requests
from bs4 import BeautifulSoup

SCRIPTS_DIR = os.path.dirname(__file__)
sys.path.insert(0, SCRIPTS_DIR)
from db_helper import get_db  # noqa: E402

BASE_URL = "https://www.boatrace.jp/owpc/pc/race"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
}


def safe_float(s):
    try:
        v = str(s).strip().replace(",", "")
        return float(v)
    except Exception:
        return None


def safe_int(s):
    try:
        return int(str(s).strip().replace(",", ""))
    except Exception:
        return None


def fetch_page(path: str, params: dict) -> BeautifulSoup | None:
    url = f"{BASE_URL}/{path}"
    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"  [WARN] {path} returned {resp.status_code}", file=sys.stderr)
            return None
        return BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        print(f"  [WARN] {path}: {e}", file=sys.stderr)
        return None


# 風向クラス番号 → 方向テキスト（is-wind1=北, is-wind2=北北東, ...）
WIND_DIRECTION_MAP = {
    1: "北", 2: "北北東", 3: "北東", 4: "東北東",
    5: "東", 6: "東南東", 7: "南東", 8: "南南東",
    9: "南", 10: "南南西", 11: "南西", 12: "西南西",
    13: "西", 14: "西北西", 15: "北西", 16: "北北西",
}

# 天候クラス番号 → テキスト（is-weather1=晴, is-weather2=曇, ...）
WEATHER_MAP = {
    1: "晴", 2: "曇", 3: "雨", 4: "雪",
}


def scrape_weather(soup: BeautifulSoup) -> dict:
    """
    beforeinfoページのdiv.weather1から天気情報を取得。
    戻り値: {weather, windDirection, windSpeed, waveHeight, waterTemp, airTemp}
    """
    import re
    result = {
        "weather": None,
        "windDirection": None,
        "windSpeed": None,
        "waveHeight": None,
        "waterTemp": None,
        "airTemp": None,
    }

    weather_div = soup.find("div", class_="weather1")
    if not weather_div:
        return result

    # 天候: div.is-weather の p タグのクラスから取得
    weather_unit = weather_div.find("div", class_="is-weather")
    if weather_unit:
        p = weather_unit.find("p")
        if p:
            for c in (p.get("class") or []):
                m = re.match(r"is-weather(\d+)", c)
                if m:
                    result["weather"] = WEATHER_MAP.get(int(m.group(1)), "晴")
        # フォールバック: labelTitleテキスト
        if not result["weather"]:
            label = weather_unit.find("span", class_="weather1_bodyUnitLabelTitle")
            if label:
                result["weather"] = label.get_text(strip=True)

    # 風向: div.is-windDirection の p タグのクラスから取得
    wind_dir_unit = weather_div.find("div", class_="is-windDirection")
    if wind_dir_unit:
        p = wind_dir_unit.find("p")
        if p:
            for c in (p.get("class") or []):
                m = re.match(r"is-wind(\d+)", c)
                if m:
                    result["windDirection"] = WIND_DIRECTION_MAP.get(int(m.group(1)), f"風向{m.group(1)}")

    # 風速: div.is-wind の data span
    wind_unit = weather_div.find("div", class_="is-wind")
    if wind_unit:
        data_span = wind_unit.find("span", class_="weather1_bodyUnitLabelData")
        if data_span:
            result["windSpeed"] = safe_float(data_span.get_text(strip=True).replace("m", ""))

    # 水温: div.is-waterTemperature の data span
    water_unit = weather_div.find("div", class_="is-waterTemperature")
    if water_unit:
        data_span = water_unit.find("span", class_="weather1_bodyUnitLabelData")
        if data_span:
            result["waterTemp"] = safe_float(data_span.get_text(strip=True).replace("℃", ""))

    # 波高: div.is-wave の data span
    wave_unit = weather_div.find("div", class_="is-wave")
    if wave_unit:
        data_span = wave_unit.find("span", class_="weather1_bodyUnitLabelData")
        if data_span:
            result["waveHeight"] = safe_float(data_span.get_text(strip=True).replace("cm", ""))

    # 気温: div.is-direction の data span
    air_unit = weather_div.find("div", class_="is-direction")
    if air_unit:
        data_span = air_unit.find("span", class_="weather1_bodyUnitLabelData")
        if data_span:
            result["airTemp"] = safe_float(data_span.get_text(strip=True).replace("℃", ""))

    return result


def scrape_exhibit_and_st(race_date: str, stadium_id: str, race_number: int) -> dict:
    """
    beforeinfoページから展示タイム・チルト・STタイム・天気情報・安定板を取得。
    戻り値: {boat_number: {exhibitionTime, tilt, startTime}, "_weather": {...}, "_stabilizer": bool}
    """
    params = {"jcd": stadium_id, "hd": race_date, "rno": race_number}
    soup = fetch_page("beforeinfo", params)
    if not soup:
        return {}

    result = {}

    # --- 天気情報を取得 ---
    weather_info = scrape_weather(soup)
    result["_weather"] = weather_info

    # --- 安定板使用の確認 ---
    # div.title16_titleLabels__add2020 内に span.label2.is-type1 で「安定板使用」がある場合
    stabilizer = False
    labels_div = soup.find("div", class_="title16_titleLabels__add2020")
    if labels_div:
        for span in labels_div.find_all("span"):
            if "安定板" in span.get_text():
                stabilizer = True
                break
    result["_stabilizer"] = stabilizer

    # --- 展示タイム・チルト (Table 1: is-w748) ---
    # 構造: 各選手4行ずつ
    # Row 0: ヘッダー
    # Row 1: 調整重量
    # Row 2: [艇番, 写真, 選手名, 体重, 展示タイム, チルト, プロペラ, 部品交換, 前走成績, ...]
    # Row 3: 進入
    # Row 4: [ST値, 'ST', ...]
    # Row 5: 着順
    exhibit_table = soup.find("table", class_="is-w748")
    if exhibit_table:
        rows = exhibit_table.find_all("tr")
        # 選手データは2行目以降、4行ごと（Row2, Row6, Row10, ...）
        for i in range(2, len(rows), 4):
            cells = rows[i].find_all(["td", "th"])
            if len(cells) < 6:
                continue
            boat_num = safe_int(cells[0].get_text(strip=True))
            if not boat_num or boat_num < 1 or boat_num > 6:
                continue
            exhibit_time = safe_float(cells[4].get_text(strip=True))
            tilt = safe_float(cells[5].get_text(strip=True))
            result[boat_num] = {
                "exhibitionTime": exhibit_time,
                "tilt": tilt,
                "startTime": None,
            }

    # --- STタイム (Table 2: is-w238 スタート展示) ---
    # 構造:
    # Row 0: ヘッダー「スタート展示」
    # Row 1: コース / 並び / ST
    # Row 2〜7: 各艇 (colspan=3 の1セル、内部に艇番とSTタイムが入っている)
    #   <span class="table1_boatImage1Number is-typeN">N</span>
    #   <span class="table1_boatImage1Time is-fBold is-fColorN">F.01</span>
    start_table = soup.find("table", class_="is-w238")
    if start_table:
        rows = start_table.find_all("tr")
        for row in rows[2:]:  # ヘッダー2行をスキップ
            # 艇番
            boat_span = row.find("span", class_=lambda c: c and "table1_boatImage1Number" in c)
            # STタイム
            time_span = row.find("span", class_=lambda c: c and "table1_boatImage1Time" in c)
            if boat_span and time_span:
                boat_num = safe_int(boat_span.get_text(strip=True))
                st_text = time_span.get_text(strip=True)  # 例: "F.01", "L.01", ".01", "0.01"
                if boat_num and boat_num in result:
                    result[boat_num]["startTime"] = st_text if st_text else None

    return result


def scrape_win_odds(race_date: str, stadium_id: str, race_number: int) -> dict:
    """
    oddstfページから単勝オッズを取得。
    戻り値: {boat_number: odds_float}
    """
    params = {"jcd": stadium_id, "hd": race_date, "rno": race_number}
    soup = fetch_page("oddstf", params)
    if not soup:
        return {}

    win_odds = {}
    # Table 1 (is-w495): 単勝オッズ
    # Row 0: ヘッダー ['', 'ボートレーサー', '単勝オッズ']
    # Row 1〜6: [艇番, 選手名, オッズ]
    tables = soup.find_all("table", class_="is-w495")
    for table in tables:
        rows = table.find_all("tr")
        if not rows:
            continue
        header = [th.get_text(strip=True) for th in rows[0].find_all(["th", "td"])]
        if "単勝オッズ" not in header:
            continue
        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            if len(cells) >= 3:
                boat_num = safe_int(cells[0].get_text(strip=True))
                odds = safe_float(cells[2].get_text(strip=True))
                if boat_num:
                    win_odds[boat_num] = odds
        break

    return win_odds


def scrape_trifecta_odds(race_date: str, stadium_id: str, race_number: int) -> dict:
    """
    odds3tページから3連単オッズを取得。
    戻り値: {"1-2-3": 39.8, ...}
    構造: 6列（各1着）× 複数行（2着・3着の組み合わせ）
    Row 0: ヘッダー [艇番1, 選手名1, 艇番2, 選手名2, ...]
    Row 1〜: [2着, 3着, オッズ, 2着, 3着, オッズ, ...]
    """
    params = {"jcd": stadium_id, "hd": race_date, "rno": race_number}
    soup = fetch_page("odds3t", params)
    if not soup:
        return {}

    trifecta_odds = {}
    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        header_cells = rows[0].find_all(["th", "td"])
        if len(header_cells) < 12:
            continue

        # ヘッダーから各列の1着艇番を取得
        # 構造: [艇番1, 選手名1, 艇番2, 選手名2, 艇番3, 選手名3, 艇番4, 選手名4, 艇番5, 選手名5, 艇番6, 選手名6]
        first_boats = []
        for i in range(0, 12, 2):
            bn = safe_int(header_cells[i].get_text(strip=True))
            if bn:
                first_boats.append(bn)

        if len(first_boats) != 6:
            continue

        # データ行: 各行に6組の [2着, 3着, オッズ] が並ぶ
        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            if len(cells) < 18:
                continue
            for col_idx, first_boat in enumerate(first_boats):
                base = col_idx * 3
                if base + 2 >= len(cells):
                    continue
                second = safe_int(cells[base].get_text(strip=True))
                third = safe_int(cells[base + 1].get_text(strip=True))
                odds = safe_float(cells[base + 2].get_text(strip=True))
                if second and third and odds:
                    combo = f"{first_boat}-{second}-{third}"
                    trifecta_odds[combo] = odds

        if trifecta_odds:
            break

    return trifecta_odds


def scrape_beforeinfo(race_date: str, stadium_id: str, race_number: int) -> list[dict]:
    """全直前情報を統合して返す（天気情報・安定板を含む）"""
    exhibit_data = scrape_exhibit_and_st(race_date, stadium_id, race_number)
    weather_info = exhibit_data.pop("_weather", {})
    stabilizer = 1 if exhibit_data.pop("_stabilizer", False) else 0
    time.sleep(0.5)
    win_odds = scrape_win_odds(race_date, stadium_id, race_number)
    time.sleep(0.5)
    trifecta_odds = scrape_trifecta_odds(race_date, stadium_id, race_number)

    entries = []
    for boat_num in range(1, 7):
        ed = exhibit_data.get(boat_num, {})
        entries.append({
            "raceDate": race_date,
            "stadiumId": stadium_id,
            "raceNumber": race_number,
            "boatNumber": boat_num,
            "exhibitionTime": ed.get("exhibitionTime"),
            "tilt": ed.get("tilt"),
            "startTime": ed.get("startTime"),
            "circuitTime": None,  # beforeinfo2はログイン必須のため取得不可
            "trifectaOdds": json.dumps(trifecta_odds) if trifecta_odds else None,
            "winOdds": win_odds.get(boat_num),
            "startCourse": None,
            # 天気情報（全艇共通）
            "weather": weather_info.get("weather"),
            "windDirection": weather_info.get("windDirection"),
            "windSpeed": weather_info.get("windSpeed"),
            "waveHeight": weather_info.get("waveHeight"),
            "waterTemp": weather_info.get("waterTemp"),
            "airTemp": weather_info.get("airTemp"),
            # 安定板（全艇共通）
            "stabilizer": stabilizer,
        })

    return entries


def save_beforeinfo(conn, entries: list[dict]) -> int:
    if not entries:
        return 0
    cursor = conn.cursor()
    sql = """
        INSERT INTO race_before_info
          (raceDate, stadiumId, raceNumber, boatNumber,
           exhibitionTime, circuitTime, tilt, startTime, trifectaOdds, winOdds, startCourse,
           weather, windDirection, windSpeed, waveHeight, waterTemp, airTemp, stabilizer)
        VALUES
          (%(raceDate)s, %(stadiumId)s, %(raceNumber)s, %(boatNumber)s,
           %(exhibitionTime)s, %(circuitTime)s, %(tilt)s, %(startTime)s,
           %(trifectaOdds)s, %(winOdds)s, %(startCourse)s,
           %(weather)s, %(windDirection)s, %(windSpeed)s, %(waveHeight)s, %(waterTemp)s, %(airTemp)s,
           %(stabilizer)s)
        ON DUPLICATE KEY UPDATE
          exhibitionTime=VALUES(exhibitionTime),
          tilt=VALUES(tilt),
          startTime=VALUES(startTime),
          trifectaOdds=VALUES(trifectaOdds),
          winOdds=VALUES(winOdds),
          weather=VALUES(weather),
          windDirection=VALUES(windDirection),
          windSpeed=VALUES(windSpeed),
          waveHeight=VALUES(waveHeight),
          waterTemp=VALUES(waterTemp),
          airTemp=VALUES(airTemp),
          stabilizer=VALUES(stabilizer)
    """
    inserted = 0
    for entry in entries:
        try:
            cursor.execute(sql, entry)
            inserted += cursor.rowcount
        except Exception as e:
            print(f"  [WARN] insert error: {e}", file=sys.stderr)
    conn.commit()
    cursor.close()
    return inserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYYMMDD")
    parser.add_argument("--stadium", required=True, help="場コード 01〜24")
    parser.add_argument("--race", type=int, required=True, help="レース番号 1〜12")
    args = parser.parse_args()

    race_date = args.date.replace("-", "")
    stadium_id = args.stadium.zfill(2)

    conn = get_db()
    entries = scrape_beforeinfo(race_date, stadium_id, args.race)
    n = save_beforeinfo(conn, entries)
    conn.close()

    print(json.dumps({"success": True, "entries": entries, "saved": n}))


if __name__ == "__main__":
    main()
