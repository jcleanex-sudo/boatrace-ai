"""
prefetch_race_entries.py

boatrace.jp から本日の出走表を全場分スクレイピングし、
Neon PostgreSQL DB に保存する事前取得スクリプト。

morning_predict_12.py のスクレイピングが朝8:00 に失敗した場合の
バックアップデータとして利用する想定。

実行:
    DATABASE_URL=postgresql://... python prefetch_race_entries.py [YYYYMMDD]

引数なしの場合は本日の日付を使用。
"""

import os
import re
import sys
import json
import time
import logging
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict, field
from typing import Optional

import requests
from bs4 import BeautifulSoup

try:
    import psycopg2
    from psycopg2.extras import execute_batch
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False
    print("[WARN] psycopg2 not available. Will output JSON only.")

# ============================================================
# 設定
# ============================================================

BOATRACE_BASE_URL = "https://boatrace.jp"
INDEX_URL = f"{BOATRACE_BASE_URL}/owpc/pc/race/index"
RACELIST_URL_TEMPLATE = f"{BOATRACE_BASE_URL}/owpc/pc/race/racelist?rno={{rno}}&jcd={{jcd}}&hd={{hd}}"

# レート制限(秒)
REQUEST_INTERVAL_SEC = 1.0

# リトライ設定
MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 2.0

# User-Agent
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# 24競艇場マスター
STADIUM_NAMES = {
    "01": "桐生", "02": "戸田", "03": "江戸川", "04": "平和島",
    "05": "多摩川", "06": "浜名湖", "07": "蒲郡", "08": "常滑",
    "09": "津", "10": "三国", "11": "びわこ", "12": "住之江",
    "13": "尼崎", "14": "鳴門", "15": "丸亀", "16": "児島",
    "17": "宮島", "18": "徳山", "19": "下関", "20": "若松",
    "21": "芦屋", "22": "福岡", "23": "唐津", "24": "大村",
}

# ============================================================
# ロギング
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ============================================================
# データクラス
# ============================================================

@dataclass
class RaceEntry:
    """1艇分の出走情報"""
    race_date: str           # YYYY-MM-DD
    stadium_code: str        # 01-24
    stadium_name: str        # 桐生 等
    race_no: int             # 1-12
    waku: int                # 枠番 1-6
    toban: str               # 登録番号
    grade: str               # A1/A2/B1/B2
    racer_name: str          # 選手名
    branch: str              # 支部
    birthplace: str          # 出身地
    age: Optional[int]       # 年齢
    weight: Optional[float]  # 体重 kg
    flying: Optional[int]    # F数
    late: Optional[int]      # L数
    avg_st: Optional[float]  # 平均ST
    national_win_rate: Optional[float]
    national_top2_rate: Optional[float]
    national_top3_rate: Optional[float]
    local_win_rate: Optional[float]
    local_top2_rate: Optional[float]
    local_top3_rate: Optional[float]
    motor_no: Optional[int]
    motor_top2_rate: Optional[float]
    motor_top3_rate: Optional[float]
    boat_no: Optional[int]
    boat_top2_rate: Optional[float]
    boat_top3_rate: Optional[float]
    fetched_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============================================================
# スクレイピング処理
# ============================================================

def make_session() -> requests.Session:
    """HTTPセッション生成(User-Agent等)"""
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
    })
    return s


def http_get(session: requests.Session, url: str) -> Optional[str]:
    """リトライ付きGET"""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding or "utf-8"
            return resp.text
        except (requests.RequestException, requests.HTTPError) as e:
            log.warning(f"  retry {attempt}/{MAX_RETRIES}: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * attempt)
    log.error(f"  FAILED after {MAX_RETRIES} retries: {url}")
    return None


def fetch_today_stadiums(session: requests.Session, hd: str) -> list[str]:
    """本日開催の競艇場コード一覧を取得"""
    url = f"{INDEX_URL}?hd={hd}"
    log.info(f"Fetching index: {url}")
    html = http_get(session, url)
    if not html:
        return []
    
    soup = BeautifulSoup(html, "html.parser")
    stadiums = set()
    
    # 「raceindex?jcd=XX&hd=YYYYMMDD」のリンクから抽出
    for a in soup.find_all("a", href=True):
        m = re.search(r"raceindex\?jcd=(\d{2})&hd=" + hd, a["href"])
        if m:
            stadiums.add(m.group(1))
    
    return sorted(stadiums)


def parse_float(s: str) -> Optional[float]:
    """文字列を float に変換、ダメなら None"""
    try:
        return float(s.strip())
    except (ValueError, AttributeError):
        return None


def parse_int(s: str) -> Optional[int]:
    """文字列を int に変換、ダメなら None"""
    try:
        return int(s.strip())
    except (ValueError, AttributeError):
        return None


def fetch_race_entries(
    session: requests.Session,
    stadium_code: str,
    race_no: int,
    hd: str,
    race_date: str,
) -> list[RaceEntry]:
    """指定された場・レースの出走表6艇分を取得"""
    url = RACELIST_URL_TEMPLATE.format(rno=race_no, jcd=stadium_code, hd=hd)
    html = http_get(session, url)
    if not html:
        return []
    
    soup = BeautifulSoup(html, "html.parser")
    entries = []
    
    # 出走表テーブル: class="is-fs12" を含むtbody
    # boatrace.jpの構造: tbody.is-fs12 ごとに1艇分
    tbody_list = soup.select("table.is-w748 tbody")
    
    for tbody in tbody_list:
        try:
            entry = parse_racer_tbody(tbody, stadium_code, race_no, hd, race_date)
            if entry:
                entries.append(entry)
        except Exception as e:
            log.warning(f"  parse error: {e}")
            continue
    
    return entries


def parse_racer_tbody(tbody, stadium_code: str, race_no: int, hd: str, race_date: str) -> Optional[RaceEntry]:
    """tbody(1艇分)から RaceEntry 生成"""
    rows = tbody.find_all("tr")
    if not rows:
        return None
    
    first_row = rows[0]
    tds = first_row.find_all("td")
    if len(tds) < 7:
        return None
    
    # td[0]: 枠番
    waku_td = tds[0]
    waku = parse_int(waku_td.get_text(strip=True))
    if not waku or not (1 <= waku <= 6):
        return None
    
    # td[2]: 登録番号/級別/氏名/支部/出身地/年齢/体重
    info_td = tds[2]
    info_text = info_td.get_text(separator="\n", strip=True)
    info_lines = [l.strip() for l in info_text.split("\n") if l.strip()]
    
    toban = ""
    grade = ""
    racer_name = ""
    branch = ""
    birthplace = ""
    age = None
    weight = None
    
    # 1行目: "4727 / B1"
    if len(info_lines) >= 1:
        m = re.match(r"(\d{4})\s*/\s*(A1|A2|B1|B2)", info_lines[0])
        if m:
            toban = m.group(1)
            grade = m.group(2)
    
    # 2行目: 氏名
    if len(info_lines) >= 2:
        racer_name = info_lines[1]
    
    # 3行目: 支部/出身地
    if len(info_lines) >= 3:
        m = re.match(r"(\S+)\s*/\s*(\S+)", info_lines[2])
        if m:
            branch = m.group(1)
            birthplace = m.group(2)
    
    # 4行目: 年齢/体重
    if len(info_lines) >= 4:
        m = re.match(r"(\d+)歳\s*/\s*([\d.]+)kg", info_lines[3])
        if m:
            age = int(m.group(1))
            weight = float(m.group(2))
    
    # td[3]: F数 L数 平均ST
    fst_text = tds[3].get_text(separator=" ", strip=True)
    flying = None
    late = None
    avg_st = None
    
    m = re.search(r"F(\d+)", fst_text)
    if m:
        flying = int(m.group(1))
    m = re.search(r"L(\d+)", fst_text)
    if m:
        late = int(m.group(1))
    m = re.search(r"(\d+\.\d+)\s*$", fst_text)
    if m:
        avg_st = float(m.group(1))
    
    # td[4]: 全国成績 勝率/2連率/3連率
    nat_text = tds[4].get_text(separator=" ", strip=True)
    nat_nums = re.findall(r"[\d.]+", nat_text)
    nat_win = float(nat_nums[0]) if len(nat_nums) >= 1 else None
    nat_top2 = float(nat_nums[1]) if len(nat_nums) >= 2 else None
    nat_top3 = float(nat_nums[2]) if len(nat_nums) >= 3 else None
    
    # td[5]: 当地成績
    local_text = tds[5].get_text(separator=" ", strip=True)
    local_nums = re.findall(r"[\d.]+", local_text)
    local_win = float(local_nums[0]) if len(local_nums) >= 1 else None
    local_top2 = float(local_nums[1]) if len(local_nums) >= 2 else None
    local_top3 = float(local_nums[2]) if len(local_nums) >= 3 else None
    
    # td[6]: モーター
    motor_text = tds[6].get_text(separator=" ", strip=True)
    motor_nums = re.findall(r"[\d.]+", motor_text)
    motor_no = int(motor_nums[0]) if len(motor_nums) >= 1 else None
    motor_top2 = float(motor_nums[1]) if len(motor_nums) >= 2 else None
    motor_top3 = float(motor_nums[2]) if len(motor_nums) >= 3 else None
    
    # td[7]: ボート
    boat_no = None
    boat_top2 = None
    boat_top3 = None
    if len(tds) >= 8:
        boat_text = tds[7].get_text(separator=" ", strip=True)
        boat_nums = re.findall(r"[\d.]+", boat_text)
        boat_no = int(boat_nums[0]) if len(boat_nums) >= 1 else None
        boat_top2 = float(boat_nums[1]) if len(boat_nums) >= 2 else None
        boat_top3 = float(boat_nums[2]) if len(boat_nums) >= 3 else None
    
    return RaceEntry(
        race_date=race_date,
        stadium_code=stadium_code,
        stadium_name=STADIUM_NAMES.get(stadium_code, ""),
        race_no=race_no,
        waku=waku,
        toban=toban,
        grade=grade,
        racer_name=racer_name,
        branch=branch,
        birthplace=birthplace,
        age=age,
        weight=weight,
        flying=flying,
        late=late,
        avg_st=avg_st,
        national_win_rate=nat_win,
        national_top2_rate=nat_top2,
        national_top3_rate=nat_top3,
        local_win_rate=local_win,
        local_top2_rate=local_top2,
        local_top3_rate=local_top3,
        motor_no=motor_no,
        motor_top2_rate=motor_top2,
        motor_top3_rate=motor_top3,
        boat_no=boat_no,
        boat_top2_rate=boat_top2,
        boat_top3_rate=boat_top3,
    )


# ============================================================
# DB保存処理
# ============================================================

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS race_entries (
    id BIGSERIAL PRIMARY KEY,
    race_date DATE NOT NULL,
    stadium_code VARCHAR(2) NOT NULL,
    stadium_name VARCHAR(20),
    race_no INTEGER NOT NULL,
    waku INTEGER NOT NULL,
    toban VARCHAR(10),
    grade VARCHAR(3),
    racer_name VARCHAR(50),
    branch VARCHAR(20),
    birthplace VARCHAR(20),
    age INTEGER,
    weight DECIMAL(4,1),
    flying INTEGER,
    late INTEGER,
    avg_st DECIMAL(4,3),
    national_win_rate DECIMAL(4,2),
    national_top2_rate DECIMAL(5,2),
    national_top3_rate DECIMAL(5,2),
    local_win_rate DECIMAL(4,2),
    local_top2_rate DECIMAL(5,2),
    local_top3_rate DECIMAL(5,2),
    motor_no INTEGER,
    motor_top2_rate DECIMAL(5,2),
    motor_top3_rate DECIMAL(5,2),
    boat_no INTEGER,
    boat_top2_rate DECIMAL(5,2),
    boat_top3_rate DECIMAL(5,2),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (race_date, stadium_code, race_no, waku)
);

CREATE INDEX IF NOT EXISTS idx_race_entries_lookup 
ON race_entries (race_date, stadium_code, race_no);
"""

INSERT_SQL = """
INSERT INTO race_entries (
    race_date, stadium_code, stadium_name, race_no, waku,
    toban, grade, racer_name, branch, birthplace,
    age, weight, flying, late, avg_st,
    national_win_rate, national_top2_rate, national_top3_rate,
    local_win_rate, local_top2_rate, local_top3_rate,
    motor_no, motor_top2_rate, motor_top3_rate,
    boat_no, boat_top2_rate, boat_top3_rate,
    fetched_at
) VALUES (
    %(race_date)s, %(stadium_code)s, %(stadium_name)s, %(race_no)s, %(waku)s,
    %(toban)s, %(grade)s, %(racer_name)s, %(branch)s, %(birthplace)s,
    %(age)s, %(weight)s, %(flying)s, %(late)s, %(avg_st)s,
    %(national_win_rate)s, %(national_top2_rate)s, %(national_top3_rate)s,
    %(local_win_rate)s, %(local_top2_rate)s, %(local_top3_rate)s,
    %(motor_no)s, %(motor_top2_rate)s, %(motor_top3_rate)s,
    %(boat_no)s, %(boat_top2_rate)s, %(boat_top3_rate)s,
    %(fetched_at)s
)
ON CONFLICT (race_date, stadium_code, race_no, waku) 
DO UPDATE SET
    toban = EXCLUDED.toban,
    grade = EXCLUDED.grade,
    racer_name = EXCLUDED.racer_name,
    weight = EXCLUDED.weight,
    flying = EXCLUDED.flying,
    late = EXCLUDED.late,
    avg_st = EXCLUDED.avg_st,
    national_win_rate = EXCLUDED.national_win_rate,
    national_top2_rate = EXCLUDED.national_top2_rate,
    national_top3_rate = EXCLUDED.national_top3_rate,
    local_win_rate = EXCLUDED.local_win_rate,
    local_top2_rate = EXCLUDED.local_top2_rate,
    local_top3_rate = EXCLUDED.local_top3_rate,
    motor_no = EXCLUDED.motor_no,
    motor_top2_rate = EXCLUDED.motor_top2_rate,
    motor_top3_rate = EXCLUDED.motor_top3_rate,
    boat_no = EXCLUDED.boat_no,
    boat_top2_rate = EXCLUDED.boat_top2_rate,
    boat_top3_rate = EXCLUDED.boat_top3_rate,
    fetched_at = EXCLUDED.fetched_at;
"""


def save_to_neon(entries: list[RaceEntry], database_url: str):
    """Neon DB に出走表を保存(upsert)"""
    if not PSYCOPG2_AVAILABLE:
        log.error("psycopg2 not available, cannot save to DB")
        return False
    
    if not entries:
        log.warning("No entries to save")
        return True
    
    try:
        with psycopg2.connect(database_url) as conn:
            with conn.cursor() as cur:
                log.info("Ensuring table exists...")
                cur.execute(CREATE_TABLE_SQL)
                
                log.info(f"Inserting {len(entries)} entries...")
                data = [asdict(e) for e in entries]
                execute_batch(cur, INSERT_SQL, data, page_size=100)
                
                conn.commit()
                log.info(f"  ✅ Saved {len(entries)} entries to race_entries")
                return True
    except Exception as e:
        log.error(f"DB save failed: {e}")
        return False


# ============================================================
# メイン
# ============================================================

def main():
    # 日付決定
    if len(sys.argv) >= 2:
        hd = sys.argv[1]
    else:
        # JST 基準で本日
        jst = timezone(timedelta(hours=9))
        hd = datetime.now(jst).strftime("%Y%m%d")
    
    race_date = f"{hd[:4]}-{hd[4:6]}-{hd[6:8]}"
    log.info(f"=== Prefetch race entries for {race_date} (hd={hd}) ===")
    
    session = make_session()
    
    # 1. 本日の開催場一覧取得
    stadiums = fetch_today_stadiums(session, hd)
    if not stadiums:
        log.error("No stadiums found. Aborting.")
        sys.exit(1)
    log.info(f"Found {len(stadiums)} stadiums: {[STADIUM_NAMES.get(c, c) for c in stadiums]}")
    
    # 2. 各場の各レース(1-12)の出走表取得
    all_entries: list[RaceEntry] = []
    
    for stadium_code in stadiums:
        stadium_name = STADIUM_NAMES.get(stadium_code, stadium_code)
        log.info(f"--- {stadium_name} (jcd={stadium_code}) ---")
        
        for race_no in range(1, 13):
            time.sleep(REQUEST_INTERVAL_SEC)
            entries = fetch_race_entries(session, stadium_code, race_no, hd, race_date)
            if entries:
                log.info(f"  R{race_no}: {len(entries)} entries")
                all_entries.extend(entries)
            else:
                log.warning(f"  R{race_no}: no entries (race may not exist)")
    
    log.info(f"=== Total: {len(all_entries)} entries collected ===")
    
    # 3. JSON でローカル保存(常時)
    json_path = f"race_entries_{hd}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump([asdict(e) for e in all_entries], f, ensure_ascii=False, indent=2)
    log.info(f"JSON saved: {json_path}")
    
    # 4. Neon DB に保存(DATABASE_URL があれば)
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        log.info("Saving to Neon DB...")
        ok = save_to_neon(all_entries, database_url)
        if ok:
            log.info("✅ ALL DONE")
        else:
            log.error("DB保存失敗、JSONのみ生成済み")
            sys.exit(2)
    else:
        log.warning("DATABASE_URL not set. JSON saved but skipped DB insert.")
        log.warning("To insert: set DATABASE_URL env var and re-run.")


if __name__ == "__main__":
    main()
