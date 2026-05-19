"""
race_entries_fallback.py

morning_predict_12.py が boatrace.jp スクレイピングに失敗した場合に、
事前取得済みの race_entries テーブルから出走表を読み込むフォールバックモジュール。

使い方:
    morning_predict_12.py の中で、出走表取得失敗時に
    load_race_entries_from_db() を呼んで代替データを取得する。

prefetch_race_entries.py で事前に保存しておく必要あり。
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

log = logging.getLogger(__name__)


def load_race_entries_from_db(
    stadium_code: str,
    race_no: int,
    race_date: Optional[str] = None,
) -> list[dict]:
    """
    Neon DB の race_entries テーブルから指定レースの出走表を読み込む。
    
    Args:
        stadium_code: '01' 〜 '24'
        race_no: 1 〜 12
        race_date: 'YYYY-MM-DD' 形式。Noneなら本日(JST)
    
    Returns:
        艇番1〜6の辞書リスト。データなしなら空リスト。
    """
    if not PSYCOPG2_AVAILABLE:
        log.error("[fallback] psycopg2 not available")
        return []
    
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        log.error("[fallback] DATABASE_URL not set")
        return []
    
    if race_date is None:
        jst = timezone(timedelta(hours=9))
        race_date = datetime.now(jst).strftime("%Y-%m-%d")
    
    try:
        with psycopg2.connect(database_url) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT 
                        race_date, stadium_code, stadium_name, race_no, waku,
                        toban, grade, racer_name, branch, birthplace,
                        age, weight, flying, late, avg_st,
                        national_win_rate, national_top2_rate, national_top3_rate,
                        local_win_rate, local_top2_rate, local_top3_rate,
                        motor_no, motor_top2_rate, motor_top3_rate,
                        boat_no, boat_top2_rate, boat_top3_rate,
                        fetched_at
                    FROM race_entries
                    WHERE race_date = %s
                      AND stadium_code = %s
                      AND race_no = %s
                    ORDER BY waku ASC
                """, (race_date, stadium_code, race_no))
                
                rows = cur.fetchall()
                if not rows:
                    log.warning(
                        f"[fallback] no data for "
                        f"{race_date} stadium={stadium_code} race={race_no}"
                    )
                    return []
                
                # RealDictRow を dict に変換
                entries = [dict(r) for r in rows]
                
                # Decimal を float に変換(JSON serializable に)
                for e in entries:
                    for k, v in e.items():
                        if hasattr(v, "__float__") and v is not None:
                            try:
                                e[k] = float(v)
                            except (ValueError, TypeError):
                                pass
                
                log.info(
                    f"[fallback] loaded {len(entries)} entries from DB "
                    f"({race_date} stadium={stadium_code} race={race_no})"
                )
                return entries
    
    except Exception as e:
        log.error(f"[fallback] DB read failed: {e}")
        return []


def fetch_with_fallback(
    primary_fetch_func,
    stadium_code: str,
    race_no: int,
    race_date: Optional[str] = None,
    **kwargs,
) -> list[dict]:
    """
    プライマリ取得→失敗時にDBフォールバック の汎用ラッパ。
    
    使い方:
        from race_entries_fallback import fetch_with_fallback
        
        entries = fetch_with_fallback(
            primary_fetch_func=scrape_from_boatrace_jp,
            stadium_code='01',
            race_no=1,
        )
    
    Args:
        primary_fetch_func: スクレイピング関数。例外 or 空リスト返却で失敗判定。
        stadium_code, race_no, race_date: フォールバック用パラメータ
    
    Returns:
        出走表データ(辞書リスト)
    """
    # ① プライマリ(スクレイピング)試行
    try:
        entries = primary_fetch_func(stadium_code, race_no, **kwargs)
        if entries and len(entries) >= 6:
            log.info(
                f"[primary] success: stadium={stadium_code} race={race_no} "
                f"({len(entries)} entries)"
            )
            return entries
        log.warning(
            f"[primary] insufficient data (got {len(entries) if entries else 0}), "
            f"trying fallback..."
        )
    except Exception as e:
        log.warning(
            f"[primary] failed: stadium={stadium_code} race={race_no}, "
            f"error={e}. Trying fallback..."
        )
    
    # ② DB フォールバック試行
    entries = load_race_entries_from_db(stadium_code, race_no, race_date)
    if entries:
        log.info(f"[fallback] success: {len(entries)} entries from DB")
        return entries
    
    # ③ 全て失敗
    log.error(
        f"[ALL FAILED] stadium={stadium_code} race={race_no} "
        f"date={race_date}: no data available from any source"
    )
    return []


# ============================================================
# テスト
# ============================================================

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    
    # スタンドアロンテスト: DB から桐生1Rを読む
    print("=== DB読み込みテスト ===")
    entries = load_race_entries_from_db("01", 1)
    if entries:
        print(f"取得成功: {len(entries)} 艇分")
        for e in entries:
            print(
                f"  枠{e['waku']}: {e['racer_name']} "
                f"({e['grade']}) 全国勝率 {e['national_win_rate']}"
            )
    else:
        print("データなし(prefetch_race_entries.py を先に実行してください)")
