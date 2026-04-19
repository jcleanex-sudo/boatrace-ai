#!/usr/bin/env python3
"""
scrape_racecard.py
ボートレース公式サイトから出走表をスクレイピングしてDBに保存する。
Usage:
  python3 scrape_racecard.py --date 2025-03-05 --stadium 01 --race 3
  python3 scrape_racecard.py --date 2025-03-05 --stadium 01  # 全レース
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime

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
        return float(str(s).strip().replace("F", "").replace("L", "").replace("-", "0"))
    except:
        return None


def safe_int(s):
    try:
        return int(str(s).strip())
    except:
        return None


def scrape_racecard(race_date: str, stadium_id: str, race_number: int) -> list[dict]:
    """出走表ページから1レース分のデータを取得"""
    url = f"{BASE_URL}/racelist?jcd={stadium_id}&hd={race_date}&rno={race_number}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"  [WARN] HTTP {resp.status_code} for {url}", file=sys.stderr)
            return []
    except Exception as e:
        print(f"  [WARN] Request error: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    entries = []

    # 天候情報
    weather = wind_dir = None
    wind_speed = wave_height = water_temp = air_temp = None
    weather_div = soup.find("div", class_="is-weather")
    if weather_div:
        spans = weather_div.find_all("span")
        for span in spans:
            txt = span.get_text(strip=True)
            if "天候" in txt or any(w in txt for w in ["晴", "曇", "雨", "雪"]):
                weather = txt.replace("天候:", "").strip()
            elif "風向" in txt:
                wind_dir = txt.replace("風向:", "").strip()
            elif "風速" in txt:
                wind_speed = safe_float(txt.replace("風速:", "").replace("m", ""))
            elif "波高" in txt:
                wave_height = safe_float(txt.replace("波高:", "").replace("cm", ""))
            elif "水温" in txt:
                water_temp = safe_float(txt.replace("水温:", "").replace("℃", ""))
            elif "気温" in txt:
                air_temp = safe_float(txt.replace("気温:", "").replace("℃", ""))

    # 各艇データ
    tbody_list = soup.find_all("tbody", class_="is-fs12")
    for tbody in tbody_list:
        rows = tbody.find_all("tr")
        if not rows:
            continue
        first_row = rows[0]
        cells = first_row.find_all("td")
        if len(cells) < 3:
            continue

        # 枠番
        boat_num_td = soup.find("td", class_="is-boatColor1") or cells[0]
        # より確実な方法: テーブル全体を解析
        try:
            boat_number = safe_int(cells[0].get_text(strip=True))
            if not boat_number or boat_number < 1 or boat_number > 6:
                continue
        except:
            continue

        # 選手情報
        # 実際のHTML構造:
        # cell[0]: 枠番
        # cell[1]: 選手写真（imgのみ）
        # cell[2]: 選手番号/級別、選手名（div.is-fs18.is-fBold > a）、支部/年齢・体重
        # cell[3]: F・L・平均ST
        # cell[4]: 全国勝率/2連率/3連率
        # ...
        racer_number = None
        racer_name = None
        racer_class = None
        age = None
        weight = None
        branch = None

        # cell[2]から選手情報を取得
        info_cell = cells[2] if len(cells) > 2 else None
        if info_cell:
            # 選手番号と級別: div.is-fs11 内の数字部分
            fs11_div = info_cell.find("div", class_="is-fs11")
            if fs11_div:
                fs11_text = fs11_div.get_text(strip=True)
                # 例: "3839 / B1" -> 数字部分が選手番号、スパン部分が級別
                import re as _re
                num_match = _re.search(r'(\d{4})', fs11_text)
                if num_match:
                    racer_number = safe_int(num_match.group(1))
                cls_span = fs11_div.find("span")
                if cls_span:
                    racer_class = cls_span.get_text(strip=True)
            # 選手名: div.is-fs18.is-fBold > a
            name_div = info_cell.find("div", class_="is-fs18")
            if name_div:
                name_a = name_div.find("a")
                if name_a:
                    racer_name = name_a.get_text(strip=True)
            # 支部・年齢・体重: 2番目のdiv.is-fs11
            fs11_divs = info_cell.find_all("div", class_="is-fs11")
            if len(fs11_divs) > 1:
                detail_text = fs11_divs[1].get_text(strip=True)
                # 例: "静岡/静岡 50歳/62.6kg"
                parts = detail_text.replace("\u3000", " ").split("/")
                if len(parts) >= 1:
                    branch = parts[0].strip()
                age_weight_str = detail_text
                age_match = _re.search(r'(\d+)歳', age_weight_str)
                if age_match:
                    age = safe_int(age_match.group(1))
                kg_match = _re.search(r'([\d.]+)kg', age_weight_str)
                if kg_match:
                    weight = safe_float(kg_match.group(1))

        # 実際のHTML構造に基づく各セルの内容:
        # cell[3]: F数/L数/平均ST (改行区切り)
        # cell[4]: 全国勝率/2連率/3連率 (改行区切り)
        # cell[5]: 当地勝率/2連率/3連率 (改行区切り)
        # cell[6]: モーターNo/2連率/3連率 (改行区切り)
        # cell[7]: ボートNo/2連率/3連率 (改行区切り)
        def parse_lineH2(cell):
            """is-lineH2セルの改行区切りテキストをリストで返す"""
            lines = [br.previous_sibling for br in cell.find_all('br')]
            lines = [str(l).strip() for l in lines if l and str(l).strip()]
            # 最後のテキストも追加
            last = cell.find_all(text=True)[-1] if cell.find_all(text=True) else ''
            last = str(last).strip()
            if last and last not in lines:
                lines.append(last)
            return lines

        # cell[3]: F数/L数/平均ST
        flying_count = late_count = avg_st = None
        if len(cells) > 3:
            fl_text = cells[3].get_text(strip=True)
            import re as _re2
            f_match = _re2.search(r'F(\d+)', fl_text)
            l_match = _re2.search(r'L(\d+)', fl_text)
            st_match = _re2.search(r'(\d+\.\d+)$', fl_text)
            if f_match:
                flying_count = safe_int(f_match.group(1))
            if l_match:
                late_count = safe_int(l_match.group(1))
            if st_match:
                avg_st = safe_float(st_match.group(1))

        # cell[4]: 全国勝率/2連率/3連率
        national_win_rate = national_2rate = national_3rate = None
        if len(cells) > 4:
            lines4 = parse_lineH2(cells[4])
            if len(lines4) >= 1:
                national_win_rate = safe_float(lines4[0])
            if len(lines4) >= 2:
                national_2rate = safe_float(lines4[1])
            if len(lines4) >= 3:
                national_3rate = safe_float(lines4[2])

        # cell[5]: 当地勝率/2連率/3連率
        local_win_rate = local_2rate = None
        if len(cells) > 5:
            lines5 = parse_lineH2(cells[5])
            if len(lines5) >= 1:
                local_win_rate = safe_float(lines5[0])
            if len(lines5) >= 2:
                local_2rate = safe_float(lines5[1])

        # cell[6]: モーターNo/2連率/3連率
        motor_number = motor_2rate = motor_3rate = None
        if len(cells) > 6:
            lines6 = parse_lineH2(cells[6])
            if len(lines6) >= 1:
                motor_number = safe_int(lines6[0])
            if len(lines6) >= 2:
                motor_2rate = safe_float(lines6[1])
            if len(lines6) >= 3:
                motor_3rate = safe_float(lines6[2])

        # cell[7]: ボートNo/2連率/3連率
        boat_number2 = boat_2rate = None
        if len(cells) > 7:
            lines7 = parse_lineH2(cells[7])
            if len(lines7) >= 1:
                boat_number2 = safe_int(lines7[0])
            if len(lines7) >= 2:
                boat_2rate = safe_float(lines7[1])

        session_results = None

        entries.append({
            "raceDate": race_date,
            "stadiumId": stadium_id,
            "raceNumber": race_number,
            "boatNumber": boat_number,
            "racerNumber": racer_number,
            "racerName": racer_name,
            "racerClass": racer_class,
            "age": age,
            "weight": weight,
            "branch": branch,
            "nationalWinRate": national_win_rate,
            "national2Rate": national_2rate,
            "national3Rate": national_3rate,
            "localWinRate": local_win_rate,
            "local2Rate": local_2rate,
            "motorNumber": motor_number,
            "motor2Rate": motor_2rate,
            "motor3Rate": motor_3rate,
            "boatNumber2": boat_number2,
            "boat2Rate": boat_2rate,
            "avgSt": avg_st,
            "flyingCount": flying_count,
            "lateCount": late_count,
            "sessionResults": session_results,
            "weather": weather,
            "windDirection": wind_dir,
            "windSpeed": wind_speed,
            "waveHeight": wave_height,
            "waterTemp": water_temp,
            "airTemp": air_temp,
        })

    return entries


def save_entries(conn, entries: list[dict]) -> int:
    if not entries:
        return 0
    cursor = conn.cursor()
    sql = """
        INSERT INTO race_entries
          (raceDate, stadiumId, raceNumber, boatNumber, racerNumber, racerName,
           racerClass, age, weight, branch,
           nationalWinRate, national2Rate, national3Rate,
           localWinRate, local2Rate,
           motorNumber, motor2Rate, motor3Rate,
           boatNumber2, boat2Rate,
           avgSt, flyingCount, lateCount, sessionResults,
           weather, windDirection, windSpeed, waveHeight, waterTemp, airTemp)
        VALUES
          (%(raceDate)s, %(stadiumId)s, %(raceNumber)s, %(boatNumber)s,
           %(racerNumber)s, %(racerName)s, %(racerClass)s, %(age)s, %(weight)s, %(branch)s,
           %(nationalWinRate)s, %(national2Rate)s, %(national3Rate)s,
           %(localWinRate)s, %(local2Rate)s,
           %(motorNumber)s, %(motor2Rate)s, %(motor3Rate)s,
           %(boatNumber2)s, %(boat2Rate)s,
           %(avgSt)s, %(flyingCount)s, %(lateCount)s, %(sessionResults)s,
           %(weather)s, %(windDirection)s, %(windSpeed)s, %(waveHeight)s,
           %(waterTemp)s, %(airTemp)s)
        ON DUPLICATE KEY UPDATE
          racerName=VALUES(racerName), racerClass=VALUES(racerClass),
          nationalWinRate=VALUES(nationalWinRate), motor2Rate=VALUES(motor2Rate),
          avgSt=VALUES(avgSt), weather=VALUES(weather)
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
    parser.add_argument("--date", required=True, help="YYYYMMDD または YYYY-MM-DD")
    parser.add_argument("--stadium", required=True, help="場コード 01〜24")
    parser.add_argument("--race", type=int, help="レース番号 1〜12 (省略時は全レース)")
    args = parser.parse_args()

    race_date = args.date.replace("-", "")
    stadium_id = args.stadium.zfill(2)
    races = [args.race] if args.race else list(range(1, 13))

    conn = get_db()
    total = 0
    for rno in races:
        entries = scrape_racecard(race_date, stadium_id, rno)
        n = save_entries(conn, entries)
        total += n
        print(f"  Race {rno}: {len(entries)} entries, {n} saved")
        time.sleep(1.0)

    conn.close()
    print(json.dumps({"success": True, "total": total}))


if __name__ == "__main__":
    main()
