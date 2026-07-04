#!/usr/bin/env python3
"""
predict.py
指定レースの出走表・直前情報を使って3連単を予想する。
出力: 本線6点 / 抱え3点 / 穴目3点 の3カテゴリ

強化機能:
  - 干満差補正（前半1〜6R vs 後半7〜12R）
  - フライング・出遅れ履歴補正
  - 展示タイム相対評価（コース別基準値との比較）
  - 見送り判定（全EVが低い場合に警告）
  - ケリー基準による賭け金配分
  - 予想根拠（補正内容）の出力

Usage:
  python3 predict.py --date 20250305 --stadium 01 --race 3
  python3 predict.py --date 20250305 --stadium 01 --race 3 --bankroll 50000
"""
import argparse
import json
import os
import pickle
import sys
from itertools import permutations

import numpy as np

SCRIPTS_DIR = os.path.dirname(__file__)
sys.path.insert(0, SCRIPTS_DIR)
from db_helper import get_db  # noqa: E402
from stadium_characteristics import (  # noqa: E402
    get_stadium_characteristics,
    get_course_base_win_rate,
    calculate_wind_effect,
)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")

# ─── 展示タイムのコース別基準値（全国平均） ───────────────────────────────
# 1コース: 最も速い（インから直線的に走れる）
# 6コース: 最も遅い（外側を大回りする）
EXHIBITION_TIME_BASELINE = {
    1: 6.70,
    2: 6.75,
    3: 6.78,
    4: 6.80,
    5: 6.82,
    6: 6.85,
}

# ─── 干満差のある競艇場 ────────────────────────────────────────────────────
# 前半（1〜6R）: 満潮に近い → インが有利（水面が高く安定）
# 後半（7〜12R）: 干潮に近い → アウトが有利（水面が低く荒れやすい）
# ※ 実際の潮汐は複雑だが、統計的な傾向として前半インが有利とされる
TIDAL_STADIUMS = {"03", "04", "06", "14", "15", "16", "17", "24"}

# 前半レース（1〜6R）での干満差補正（イン有利）
TIDAL_EARLY_ADJ = {1: 0.04, 2: 0.02, 3: 0.01, 4: -0.01, 5: -0.02, 6: -0.03}
# 後半レース（7〜12R）での干満差補正（アウト有利）
TIDAL_LATE_ADJ = {1: -0.03, 2: -0.01, 3: 0.0, 4: 0.01, 5: 0.02, 6: 0.03}

# ─── フライング・出遅れ補正 ───────────────────────────────────────────────
# F/L回数が多い選手はスタートが慎重になり、実質的に不利になる
def calc_fl_penalty(flying_count: int, late_count: int) -> float:
    """F/L回数に基づくペナルティ係数（負の値）を返す"""
    total = (flying_count or 0) + (late_count or 0)
    if total == 0:
        return 0.0
    elif total == 1:
        return -0.05  # 1回: 軽微なペナルティ
    elif total == 2:
        return -0.12  # 2回: 中程度のペナルティ
    elif total == 3:
        return -0.20  # 3回: 重大なペナルティ（次のF/Lで出場停止）
    else:
        return -0.30  # 4回以上: 非常に重大


def load_model():
    model_path = os.path.join(MODEL_DIR, "lgbm_model.pkl")
    meta_path = os.path.join(MODEL_DIR, "model_meta.json")
    if not os.path.exists(model_path):
        return None, None
    with open(model_path, "rb") as f:
        model = pickle.load(f)
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
    return model, meta


def load_ensemble_models(meta: dict) -> list:
    """アンサンブルモデルを読み込む（存在するもののみ）"""
    model_names = meta.get("ensemble_models", [])
    models = []
    name_map = {"LightGBM": "lgbm", "XGBoost": "xgb", "RandomForest": "rf", "GradientBoosting": "gb"}
    for name in model_names:
        key = name_map.get(name, name.lower())
        path = os.path.join(MODEL_DIR, f"{key}_model.pkl")
        if os.path.exists(path):
            try:
                with open(path, "rb") as f:
                    m = pickle.load(f)
                models.append((name, m))
            except Exception as e:
                print(f"  [WARN] Failed to load {name}: {e}", file=sys.stderr)
    return models


def predict_ensemble(models: list, fv, meta: dict) -> float:
    """アンサンブル予測（複数モデルの平均確率）"""
    probs = []
    for name, model in models:
        try:
            if name == "LightGBM":
                import lightgbm as lgb
                p = float(model.predict([fv])[0])
            elif hasattr(model, "predict_proba"):
                p = float(model.predict_proba([fv])[0][1])
            else:
                p = float(model.predict([fv])[0])
            probs.append(p)
        except Exception as e:
            print(f"  [WARN] Ensemble predict error for {name}: {e}", file=sys.stderr)
    return float(np.mean(probs)) if probs else 1.0 / 6


def calc_implied_prob_correction(win_probs: dict, trifecta_odds_map: dict) -> dict:
    """
    オッズ逆算確率補正：市場オッズから暗黙の確率を計算し、自モデルと合成する。
    市場の暗黙確率 = 1 / オッズ（ブックメーカーマージンを考慮して正規化）
    合成確率 = 0.6 * 自モデル + 0.4 * 市場暗黙確率
    """
    if not trifecta_odds_map:
        return win_probs

    # 単勝オッズから市場暗黙確率を計算
    # win_oddsは単勝オッズなので、各艇の単勝オッズから暗黙確率を計算
    # ここでは3連単オッズの分布から各艇の暗黙確率を計算
    boat_implied = {}
    for combo, odds in trifecta_odds_map.items():
        try:
            parts = combo.split("-")
            if len(parts) >= 1:
                first_boat = int(parts[0])
                odds_val = float(odds) if odds else 0
                if odds_val > 0:
                    implied = 1.0 / odds_val
                    if first_boat not in boat_implied:
                        boat_implied[first_boat] = []
                    boat_implied[first_boat].append(implied)
        except Exception:
            pass

    if not boat_implied:
        return win_probs

    # 各艇の市場暗黙確率を集計（各艇が1着の全ての組み合わせの合計）
    market_probs = {}
    for boat, implied_list in boat_implied.items():
        market_probs[boat] = sum(implied_list)

    # 正規化
    total_market = sum(market_probs.values())
    if total_market > 0:
        market_probs = {k: v / total_market for k, v in market_probs.items()}

    # 合成：自モデル60% + 市場暗黙確率40%
    combined = {}
    for boat in win_probs:
        model_p = win_probs[boat]
        market_p = market_probs.get(boat, model_p)
        combined[boat] = 0.6 * model_p + 0.4 * market_p

    # 再正規化
    total = sum(combined.values())
    if total > 0:
        combined = {k: v / total for k, v in combined.items()}

    return combined


def should_use_exacta_mode(entries: list) -> tuple:
    """
    2連単モードに切り替えるか判定。
    条件: 波高>15cm または 風速>5m/s
    戻り値: (use_exacta: bool, reason: str)
    """
    if not entries:
        return False, ""
    first = entries[0]
    try:
        wave = float(first.get("waveHeight") or 0)
        wind = float(first.get("windSpeed") or 0)
    except Exception:
        return False, ""
    if wave > 15:
        return True, f"波高{wave}cm超過のため。2連単モードに切り替えました"
    if wind > 5:
        return True, f"風速{wind}m/s超過のため。2連単モードに切り替えました"
    return False, ""


def select_exacta_predictions(win_probs: dict, entries: list) -> list:
    """
    2連単の予想を生成（6点）。
    確率上位2艇の組み合わせから1着軌軍を選出。
    """
    from itertools import permutations
    name_map = {e["boatNumber"]: (e.get("racerName") or "").replace("　", "") for e in entries}
    sorted_boats = sorted(win_probs.items(), key=lambda x: x[1], reverse=True)
    top_boats = [b for b, _ in sorted_boats[:4]]  # 上位4艇から選出
    combos = []
    for a, b in permutations(top_boats, 2):
        prob = win_probs[a] * (win_probs[b] / (1 - win_probs[a]) if win_probs[a] < 1 else 0.5)
        combos.append({
            "combo": f"{a}-{b}",
            "racerNames": [name_map.get(a, ""), name_map.get(b, "")],
            "probability": round(prob * 100, 2),
            "odds": None,
            "ev": None,
            "recommendedBet": 100,
        })
    combos.sort(key=lambda x: x["probability"], reverse=True)
    return combos[:6]


def load_race_data(conn, race_date: str, stadium_id: str, race_number: int) -> list:
    """出走表 + 直前情報を取得"""
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            re.boatNumber, re.racerNumber, re.racerName, re.racerClass,
            re.age, re.weight, re.branch,
            re.nationalWinRate, re.national2Rate, re.national3Rate,
            re.localWinRate, re.local2Rate,
            re.motor2Rate, re.motor3Rate, re.boat2Rate,
            re.avgSt, re.flyingCount, re.lateCount,
            re.motorNumber, re.boatNumber2,
            rb.exhibitionTime, rb.circuitTime, rb.tilt, rb.startTime, rb.winOdds,
            rb.trifectaOdds, rb.startCourse,
            COALESCE(rb.stabilizer, 0) AS stabilizer,
            COALESCE(rb.weather, re.weather) AS weather,
            COALESCE(rb.windDirection, re.windDirection) AS windDirection,
            COALESCE(rb.windSpeed, re.windSpeed) AS windSpeed,
            COALESCE(rb.waveHeight, re.waveHeight) AS waveHeight,
            COALESCE(rb.waterTemp, re.waterTemp) AS waterTemp,
            COALESCE(rb.airTemp, re.airTemp) AS airTemp
        FROM (
            SELECT re_inner.*
            FROM race_entries re_inner
            INNER JOIN (
                SELECT boatNumber, MAX(id) as max_id
                FROM race_entries
                WHERE raceDate=%s AND stadiumId=%s AND raceNumber=%s
                  AND racerName != ''
                GROUP BY boatNumber
            ) latest ON re_inner.id = latest.max_id
        ) re
        LEFT JOIN race_before_info rb
          ON re.raceDate=rb.raceDate AND re.stadiumId=rb.stadiumId
          AND re.raceNumber=rb.raceNumber AND re.boatNumber=rb.boatNumber
        ORDER BY re.boatNumber
    """, (race_date, stadium_id, race_number))
    rows = cursor.fetchall()
    cursor.close()
    return rows


def build_feature_vector(entry: dict, meta: dict) -> np.ndarray:
    """1艇分の特徴量ベクトルを構築"""
    le_class_classes = meta["le_class_classes"]
    le_weather_classes = meta["le_weather_classes"]

    def encode_class(c):
        c = c or "B2"
        if c in le_class_classes:
            return le_class_classes.index(c)
        return 0

    def encode_weather(w):
        w = w or "晴"
        if w in le_weather_classes:
            return le_weather_classes.index(w)
        return 0

    def safe(v, default=0.0):
        try:
            return float(v) if v is not None else default
        except Exception:
            return default

    feature_map = {
        "boatNumber": safe(entry.get("boatNumber"), 1),
        "stadiumId": safe(entry.get("stadiumId"), 1),
        "racerClassEnc": encode_class(entry.get("racerClass")),
        "age": safe(entry.get("age"), 30),
        "weight": safe(entry.get("weight"), 52),
        "nationalWinRate": safe(entry.get("nationalWinRate"), 4.5),
        "national2Rate": safe(entry.get("national2Rate"), 30),
        "national3Rate": safe(entry.get("national3Rate"), 45),
        "localWinRate": safe(entry.get("localWinRate"), 4.0),
        "local2Rate": safe(entry.get("local2Rate"), 28),
        "motor2Rate": safe(entry.get("motor2Rate"), 35),
        "motor3Rate": safe(entry.get("motor3Rate"), 50),
        "boat2Rate": safe(entry.get("boat2Rate"), 35),
        "avgSt": safe(entry.get("avgSt"), 0.18),
        "flyingCount": safe(entry.get("flyingCount"), 0),
        "lateCount": safe(entry.get("lateCount"), 0),
        "weatherEnc": encode_weather(entry.get("weather")),
        "windSpeed": safe(entry.get("windSpeed"), 3),
        "waveHeight": safe(entry.get("waveHeight"), 5),
        "exhibitionTime": safe(entry.get("exhibitionTime"), 6.8),
        "circuitTime": safe(entry.get("circuitTime"), 36),
        "tilt": safe(entry.get("tilt"), 0),
        "winOdds": safe(entry.get("winOdds"), 5),
    }

    feature_cols = meta["feature_cols"]
    return np.array([feature_map.get(col, 0.0) for col in feature_cols])


def calc_exhibition_time_adj(entry: dict, all_entries: list = None) -> float:
    """
    展示タイムの相対評価による補正。
    all_entriesが渡された場合は「同レース内相対比較」を使用（選手差・モーター差を包含した公平な比較）。
    all_entriesがない場合は全国平均比較（フォールバック）。
    """
    exhibit_time = entry.get("exhibitionTime")
    if not exhibit_time:
        return 0.0
    try:
        exhibit_time = float(exhibit_time)
    except Exception:
        return 0.0
    if exhibit_time <= 0:
        return 0.0

    if all_entries and len(all_entries) >= 2:
        # 同レース内相対比較: 展示タイムがある艇のみで比較
        valid_times = []
        for e in all_entries:
            t = e.get("exhibitionTime")
            if t:
                try:
                    valid_times.append(float(t))
                except Exception:
                    pass
        if len(valid_times) < 2:
            return 0.0
        mean_time = sum(valid_times) / len(valid_times)
        std_time = (sum((t - mean_time) ** 2 for t in valid_times) / len(valid_times)) ** 0.5
        if std_time < 0.001:
            return 0.0
        # zスコア: 負の値 = 平均より速い = 有利
        z = (exhibit_time - mean_time) / std_time
        # z=-1なら+8%、z=+1なら-8%程度の補正
        adj = -z * 0.08
        return max(min(adj, 0.20), -0.20)  # ±20%でクリップ
    else:
        # フォールバック: 全国平均比較
        boat_num = entry.get("boatNumber", 1)
        baseline = EXHIBITION_TIME_BASELINE.get(boat_num, 6.80)
        diff = baseline - exhibit_time
        adj = diff * 0.5
        return max(min(adj, 0.15), -0.15)


def parse_start_time(st_str) -> float:
    """
    スタート展示のST文字列を浮動小数に変換。
    形式: '.12' -> 0.12, 'F.01' -> -0.01, 'L.01' -> 1.01
    正常スタート: 0.00〜0.30秒程度が理想的
    """
    if not st_str:
        return None
    st_str = str(st_str).strip()
    try:
        if st_str.upper().startswith('F'):
            # フライング: 負の値に変換
            num_part = st_str[1:].lstrip('.')
            return -float('0.' + num_part) if num_part else -0.01
        elif st_str.upper().startswith('L'):
            # 出遅れ: 大きな正の値
            return 1.0
        elif st_str.startswith('.'):
            return float('0' + st_str)
        else:
            return float(st_str)
    except Exception:
        return None


def calc_start_time_adj(entry: dict, all_entries: list = None) -> float:
    """
    スタート展示のSTによる補正。
    同レース内比較で、早いST(小さい値)は有利、遅いST(大きい値)は不利。
    F/Lは別途ペナルティで対応済みのため、正常スタートのみ評価。
    """
    st_val = parse_start_time(entry.get("startTime"))
    if st_val is None or st_val < 0 or st_val >= 1.0:
        # F/Lまたはデータなしはスキップ（F/Lは別途ペナルティで対応）
        return 0.0

    if all_entries and len(all_entries) >= 2:
        # 同レース内相対比較
        valid_sts = []
        for e in all_entries:
            v = parse_start_time(e.get("startTime"))
            if v is not None and 0.0 <= v < 1.0:  # 正常スタートのみ
                valid_sts.append(v)
        if len(valid_sts) < 2:
            return 0.0
        mean_st = sum(valid_sts) / len(valid_sts)
        std_st = (sum((s - mean_st) ** 2 for s in valid_sts) / len(valid_sts)) ** 0.5
        if std_st < 0.001:
            return 0.0
        # zスコア: 負の値 = 平均より早い = 有利
        z = (st_val - mean_st) / std_st
        # z=-1なら+6%、z=+1なら-6%程度の補正
        adj = -z * 0.06
        return max(min(adj, 0.15), -0.15)
    else:
        # フォールバック: 全国平均比較（0.18秒基準）
        diff = 0.18 - st_val
        adj = diff * 0.3
        return max(min(adj, 0.10), -0.10)


def calc_tidal_adj(stadium_id: str, race_number: int) -> dict:
    """
    干満差のある競艇場での潮の状態による補正。
    前半（1〜6R）: 満潮傾向 → インが有利
    後半（7〜12R）: 干潮傾向 → アウトが有利
    """
    if stadium_id not in TIDAL_STADIUMS:
        return {i: 0.0 for i in range(1, 7)}

    if race_number <= 6:
        return TIDAL_EARLY_ADJ.copy()
    else:
        return TIDAL_LATE_ADJ.copy()


def calc_trifecta_probs(win_probs: dict) -> dict:
    """3連単の全120通りの確率を計算"""
    boats = list(win_probs.keys())
    trifecta_probs = {}
    for perm in permutations(boats, 3):
        p1, p2, p3 = perm
        p1_prob = win_probs[p1]
        remaining_after_p1 = {k: v for k, v in win_probs.items() if k != p1}
        total2 = sum(remaining_after_p1.values())
        p2_prob = (remaining_after_p1.get(p2, 0) / total2) if total2 > 0 else 0
        remaining_after_p2 = {k: v for k, v in remaining_after_p1.items() if k != p2}
        total3 = sum(remaining_after_p2.values())
        p3_prob = (remaining_after_p2.get(p3, 0) / total3) if total3 > 0 else 0
        trifecta_probs[f"{p1}-{p2}-{p3}"] = p1_prob * p2_prob * p3_prob
    return trifecta_probs


def select_categories(trifecta_probs: dict, win_probs: dict, trifecta_odds_map: dict) -> dict:
    """
    本線・抱え・穴目の3カテゴリを選出する

    本線 (honsen): 確率上位6点 — 最も来る可能性が高い本命ライン
    抱え (osae):   本線に含まれない組み合わせのうち、本線の1着軸(1位艇)を含む中穴3点
                   → 軸を外さず2・3着を広げる「保険」
    穴目 (aname):  本線・抱えに含まれない組み合わせのうち、
                   オッズが高い(20倍以上)かつ確率が比較的高い上位3点
                   → 高配当狙いの一発
    """
    sorted_all = sorted(trifecta_probs.items(), key=lambda x: x[1], reverse=True)

    # 本線: 確率上位6点
    honsen = sorted_all[:6]
    honsen_combos = {c for c, _ in honsen}

    # 本線の1着軸（最も1着確率が高い艇）
    top_boat = max(win_probs, key=win_probs.get)

    # 抱え: 本線外で1着軸を含む組み合わせ上位3点
    osae_candidates = [
        (c, p) for c, p in sorted_all
        if c not in honsen_combos and c.startswith(f"{top_boat}-")
    ]
    osae = osae_candidates[:3]
    osae_combos = {c for c, _ in osae}

    # 穴目: 本線・抱え外でオッズ20倍以上かつ確率上位3点
    used_combos = honsen_combos | osae_combos
    aname_candidates = []
    for c, p in sorted_all:
        if c in used_combos:
            continue
        odds = trifecta_odds_map.get(c)
        try:
            odds_val = float(odds) if odds is not None else 0
        except Exception:
            odds_val = 0
        if odds_val >= 20:
            aname_candidates.append((c, p, odds_val))
    # オッズ×確率（期待値）でソートして上位3点
    aname_candidates.sort(key=lambda x: x[1] * min(x[2], 200), reverse=True)
    aname = [(c, p) for c, p, _ in aname_candidates[:3]]

    # 穴目候補がない場合は確率上位から補充（オッズ問わず）
    if len(aname) < 3:
        fallback = [
            (c, p) for c, p in sorted_all
            if c not in used_combos and c not in {cc for cc, _ in aname}
        ]
        aname += fallback[:3 - len(aname)]

    return {"honsen": honsen, "osae": osae, "aname": aname}


def format_predictions(category_combos: list, trifecta_odds_map: dict, entries: list) -> list:
    """カテゴリ内の組み合わせを整形（期待値・推奨賭け金付き）"""
    # boatNumber -> racerName マップ
    name_map = {e["boatNumber"]: (e.get("racerName") or "").replace("\u3000", "") for e in entries}
    result = []
    for combo, prob in category_combos:
        parts = combo.split("-")
        racer_names = [name_map.get(int(p), "") for p in parts]
        odds = trifecta_odds_map.get(combo)
        try:
            odds_val = float(odds) if odds is not None else None
        except Exception:
            odds_val = None
        # 期待値 = 確率 × オッズ（オッズがある場合のみ計算）
        ev = round(prob * odds_val, 3) if odds_val is not None else None
        result.append({
            "combo": combo,
            "racerNames": racer_names,
            "probability": round(prob * 100, 2),
            "odds": odds,
            "ev": ev,  # 期待値 (1.0超え = プラス期待値)
        })
    return result


def calc_kelly_bet(ev: float, odds: float, bankroll: float, fraction: float = 0.25, max_bet: int = 0) -> int:
    """
    ケリー基準による最適賭け金を計算。
    Kelly fraction = (b*p - q) / b
    b = odds - 1（純利益倍率）
    p = 的中確率
    q = 1 - p（外れ確率）

    fraction: 半ケリー（0.5）や1/4ケリー（0.25）でリスクを押える
    max_bet: 最大賭け金上限（0の場合は上限なし）
    """
    if not odds or odds <= 1.0 or not ev or ev <= 0:
        return 0
    # ev = p * odds なので p = ev / odds
    p = ev / odds
    q = 1.0 - p
    b = odds - 1.0
    kelly_f = (b * p - q) / b
    if kelly_f <= 0:
        return 0
    # フラクショナルケリー（リスク抑制）
    bet = bankroll * kelly_f * fraction
    # 100円単位に丸める
    bet = max(int(bet / 100) * 100, 100)
    # 最大賭け金上限を適用
    if max_bet > 0:
        bet = min(bet, max_bet)
    return int(bet)


def calc_bet_allocation(predictions: list, base_unit: int = 100, bankroll: float = 0, max_bet: int = 0) -> list:
    """
    賭け金配分を計算。
    - bankrollが指定されている場合: ケリー基準を使用
    - bankrollが0の場合: 期待値比例配分（従来方式）
    base_unit: 最小賭け金単位（デフォルト100円）
    max_bet: 最大賭け金上限（0の場合は上限なし）
    """
    result = []

    if bankroll > 0:
        # ケリー基準による配分
        for pred in predictions:
            ev = pred.get("ev") or 0.0
            odds = pred.get("odds")
            try:
                odds_val = float(odds) if odds is not None else 0
            except Exception:
                odds_val = 0
            kelly_bet = calc_kelly_bet(ev, odds_val, bankroll, max_bet=max_bet)
            result.append({**pred, "recommendedBet": kelly_bet})
    else:
        # 期待値比例配分（従来方式）
        ev_list = [(p["combo"], p.get("ev") or 0.0) for p in predictions]
        positive_ev = [(c, ev) for c, ev in ev_list if ev > 1.0]

        if positive_ev:
            total_ev = sum(ev for _, ev in positive_ev)
            for pred in predictions:
                ev = pred.get("ev") or 0.0
                if ev > 1.0 and total_ev > 0:
                    raw = (ev / total_ev) * len(positive_ev) * base_unit
                    bet = max(int(raw / base_unit) * base_unit, base_unit)
                else:
                    bet = 0
                result.append({**pred, "recommendedBet": bet})
        else:
            for pred in predictions:
                result.append({**pred, "recommendedBet": base_unit})

    return result


def calc_bet_summary(honsen: list, osae: list, aname: list, base_unit: int = 100) -> dict:
    """全組み合わせの賭け金合計と期待値サマリーを返す"""
    all_combos = honsen + osae + aname
    total_bet = sum(c.get("recommendedBet", base_unit) for c in all_combos)
    positive_ev_count = sum(1 for c in all_combos if (c.get("ev") or 0) > 1.0)
    avg_ev = round(sum(c.get("ev") or 0 for c in all_combos) / len(all_combos), 3) if all_combos else 0
    # 見送り判定: 全組み合わせの平均EVが0.7以下かつプラスEVが0件
    should_skip = avg_ev < 0.7 and positive_ev_count == 0
    skip_reason = ""
    if should_skip:
        skip_reason = f"全組み合わせの平均期待値が{avg_ev:.2f}と低く、見送りを推奨します。"
    return {
        "totalRecommendedBet": total_bet,
        "positiveEvCount": positive_ev_count,
        "avgEv": avg_ev,
        "hasPositiveEv": positive_ev_count > 0,
        "shouldSkip": should_skip,
        "skipReason": skip_reason,
    }


def predict_race(race_date: str, stadium_id: str, race_number: int, bankroll: float = 0, max_bet: int = 0) -> dict:
    """3連単を本線・抱え・穴目に分類して予想して返す"""
    conn = get_db()
    entries = load_race_data(conn, race_date, stadium_id, race_number)
    conn.close()

    if not entries:
        return {"error": "出走表データが見つかりません。先にデータを取得してください。"}

    model, meta = load_model()

    # モデルがない場合はヒューリスティックで予想
    if model is None or meta is None:
        return predict_heuristic(entries, stadium_id=stadium_id, race_number=race_number, bankroll=bankroll, max_bet=max_bet)

    # 2連単モード判定（波高・風速が高い場合）
    use_exacta, exacta_reason = should_use_exacta_mode(entries)

    # 風補正を事前に計算
    wind_direction = entries[0].get("windDirection") if entries else None
    try:
        wind_speed = float(entries[0].get("windSpeed") or 0) if entries else 0.0
    except Exception:
        wind_speed = 0.0
    wind_adjustments = calculate_wind_effect(stadium_id, wind_direction, wind_speed)

    # 干満差補正を計算
    tidal_adjustments = calc_tidal_adj(stadium_id, race_number)
    has_tidal = stadium_id in TIDAL_STADIUMS

    # 安定板使用の確認
    is_stabilizer = bool(entries[0].get("stabilizer")) if entries else False

    # アンサンブルモデルを読み込む
    ensemble_models = load_ensemble_models(meta)
    use_ensemble = len(ensemble_models) > 1

    # 各艇の1着確率を予測
    win_probs = {}
    adjustment_log = {}  # 予想根拠ログ
    for entry in entries:
        boat_num = entry["boatNumber"]
        fv = build_feature_vector(entry, meta)
        try:
            if use_ensemble:
                prob = predict_ensemble(ensemble_models, fv, meta)
            elif hasattr(model, "predict_proba"):
                prob = model.predict_proba([fv])[0][1]
            else:
                prob = float(model.predict([fv])[0])
        except Exception as e:
            print(f"  [WARN] predict error for boat {boat_num}: {e}", file=sys.stderr)
            prob = 1.0 / 6

        adj_log = []

        # 風補正を適用
        wind_adj = wind_adjustments.get(boat_num, 0.0)
        if abs(wind_adj) > 0.005:
            adj_label = "有利" if wind_adj > 0 else "不利"
            adj_log.append(f"風補正{adj_label}({wind_adj:+.1%})")
        prob = max(prob * (1.0 + wind_adj), 0.001)

        # 干満差補正を適用
        tidal_adj = tidal_adjustments.get(boat_num, 0.0)
        if abs(tidal_adj) > 0.005:
            phase = "前半(満潮)" if race_number <= 6 else "後半(干潮)"
            adj_label = "有利" if tidal_adj > 0 else "不利"
            adj_log.append(f"干満差{phase}{adj_label}({tidal_adj:+.1%})")
        prob = max(prob * (1.0 + tidal_adj), 0.001)

        # 安定板補正
        if is_stabilizer:
            stabilizer_adj = {1: 0.05, 2: 0.03, 3: 0.01, 4: -0.01, 5: -0.03, 6: -0.05}
            adj = stabilizer_adj.get(boat_num, 0.0)
            if abs(adj) > 0.005:
                adj_label = "有利" if adj > 0 else "不利"
                adj_log.append(f"安定板{adj_label}({adj:+.1%})")
            prob = max(prob * (1.0 + adj), 0.001)

        # フライング・出遅れ補正
        fl_penalty = calc_fl_penalty(entry.get("flyingCount"), entry.get("lateCount"))
        if fl_penalty < -0.01:
            fl_count = (entry.get("flyingCount") or 0) + (entry.get("lateCount") or 0)
            adj_log.append(f"F/L{fl_count}回ペナルティ({fl_penalty:+.1%})")
        prob = max(prob * (1.0 + fl_penalty), 0.001)

        # 展示タイム相対評価補正（同レース内比較）
        exhibit_adj = calc_exhibition_time_adj(entry, all_entries=entries)
        if abs(exhibit_adj) > 0.01:
            adj_label = "速い" if exhibit_adj > 0 else "遅い"
            adj_log.append(f"展示タイム{adj_label}(内比較{exhibit_adj:+.1%})")
        prob = max(prob * (1.0 + exhibit_adj), 0.001)

        # スタート展示スタートタイム補正（同レース内比較）
        st_adj = calc_start_time_adj(entry, all_entries=entries)
        if abs(st_adj) > 0.01:
            adj_label = "早い" if st_adj > 0 else "遅い"
            st_val_disp = parse_start_time(entry.get("startTime"))
            adj_log.append(f"展示スタート{adj_label}(ST{st_val_disp:.2f}秒{st_adj:+.1%})")
        prob = max(prob * (1.0 + st_adj), 0.001)

        win_probs[boat_num] = prob
        adjustment_log[boat_num] = adj_log
    # 確率を正規化
    total = sum(win_probs.values())
    if total > 0:
        win_probs = {k: v / total for k, v in win_probs.items()}

    # 直前オッズを取得
    trifecta_odds_map = {}
    for entry in entries:
        if entry.get("trifectaOdds"):
            try:
                odds_data = json.loads(entry["trifectaOdds"]) if isinstance(entry["trifectaOdds"], str) else entry["trifectaOdds"]
                trifecta_odds_map.update(odds_data)
            except Exception:
                pass

    # オッズ逆算確率補正（市場オッズと自モデルを合成）
    if trifecta_odds_map:
        win_probs = calc_implied_prob_correction(win_probs, trifecta_odds_map)
        for boat_num in win_probs:
            if boat_num in adjustment_log:
                adjustment_log[boat_num].append("オッズ逆算補正(市場40%合成)")

    # 2連単モードの場合は早期リターン
    if use_exacta:
        exacta_predictions = select_exacta_predictions(win_probs, entries)
        # 選手情報を整形
        racer_info = []
        for entry in entries:
            boat_num = entry["boatNumber"]
            racer_info.append({
                "boatNumber": boat_num,
                "racerNumber": entry.get("racerNumber"),
                "racerName": (entry.get("racerName") or "").replace("　", ""),
                "racerClass": entry.get("racerClass"),
                "age": entry.get("age"),
                "weight": entry.get("weight"),
                "branch": entry.get("branch"),
                "nationalWinRate": entry.get("nationalWinRate"),
                "national2Rate": entry.get("national2Rate"),
                "localWinRate": entry.get("localWinRate"),
                "motor2Rate": entry.get("motor2Rate"),
                "boat2Rate": entry.get("boat2Rate"),
                "avgSt": entry.get("avgSt"),
                "flyingCount": entry.get("flyingCount"),
                "lateCount": entry.get("lateCount"),
                "exhibitionTime": entry.get("exhibitionTime"),
                "tilt": entry.get("tilt"),
                "startTime": entry.get("startTime"),
                "winOdds": entry.get("winOdds"),
                "winProbability": round(win_probs.get(boat_num, 0) * 100, 2),
                "adjustments": adjustment_log.get(boat_num, []),
            })
        characteristics = get_stadium_characteristics(stadium_id)
        env_info = {}
        if entries:
            first = entries[0]
            env_info = {
                "weather": first.get("weather"),
                "windDirection": first.get("windDirection"),
                "windSpeed": first.get("windSpeed"),
                "waveHeight": first.get("waveHeight"),
                "waterTemp": first.get("waterTemp"),
                "airTemp": first.get("airTemp"),
                "stabilizer": bool(first.get("stabilizer")),
            }
        return {
            "honsen": exacta_predictions,
            "osae": [],
            "aname": [],
            "predictions": exacta_predictions,
            "racerInfo": racer_info,
            "envInfo": env_info,
            "stadiumInfo": {"name": characteristics.get("name", "")},
            "betSummary": {"totalRecommendedBet": len(exacta_predictions) * 100, "shouldSkip": False, "skipReason": ""},
            "correctionSummary": [exacta_reason],
            "modelUsed": "Ensemble" if use_ensemble else ("LightGBM" if meta.get("use_lgbm") else "GradientBoosting"),
            "winProbabilities": {str(k): round(v * 100, 2) for k, v in win_probs.items()},
            "bankrollUsed": bankroll > 0,
            "exactaMode": True,
            "exactaReason": exacta_reason,
        }

    # 3連単全120通りの確率を計算
    trifecta_probs = calc_trifecta_probs(win_probs)

    # 3カテゴリ選出
    categories = select_categories(trifecta_probs, win_probs, trifecta_odds_map)

    # 選手情報を整形（補正ログ付き）
    racer_info = []
    for entry in entries:
        boat_num = entry["boatNumber"]
        racer_info.append({
            "boatNumber": boat_num,
            "racerNumber": entry.get("racerNumber"),
            "racerName": (entry.get("racerName") or "").replace("\u3000", ""),
            "racerClass": entry.get("racerClass"),
            "age": entry.get("age"),
            "weight": entry.get("weight"),
            "branch": entry.get("branch"),
            "nationalWinRate": entry.get("nationalWinRate"),
            "national2Rate": entry.get("national2Rate"),
            "localWinRate": entry.get("localWinRate"),
            "motor2Rate": entry.get("motor2Rate"),
            "boat2Rate": entry.get("boat2Rate"),
            "avgSt": entry.get("avgSt"),
            "flyingCount": entry.get("flyingCount"),
            "lateCount": entry.get("lateCount"),
            "exhibitionTime": entry.get("exhibitionTime"),
            "tilt": entry.get("tilt"),
            "startTime": entry.get("startTime"),
            "winOdds": entry.get("winOdds"),
            "winProbability": round(win_probs.get(boat_num, 0) * 100, 2),
            "adjustments": adjustment_log.get(boat_num, []),  # 補正内容
        })

    # 環境情報
    env_info = {}
    if entries:
        first = entries[0]
        env_info = {
            "weather": first.get("weather"),
            "windDirection": first.get("windDirection"),
            "windSpeed": first.get("windSpeed"),
            "waveHeight": first.get("waveHeight"),
            "waterTemp": first.get("waterTemp"),
            "airTemp": first.get("airTemp"),
            "stabilizer": bool(first.get("stabilizer")),
        }

    # 場特性情報
    characteristics = get_stadium_characteristics(stadium_id)
    stadium_info = {
        "name": characteristics.get("name", ""),
        "waterType": characteristics.get("water_type", ""),
        "tidalDifference": characteristics.get("tidal_difference", False),
        "inStrength": characteristics.get("in_strength", 2),
        "tailwindDirection": characteristics.get("tailwind_direction", ""),
        "notes": characteristics.get("notes", ""),
    }

    honsen_fmt = format_predictions(categories["honsen"], trifecta_odds_map, entries)
    osae_fmt = format_predictions(categories["osae"], trifecta_odds_map, entries)
    aname_fmt = format_predictions(categories["aname"], trifecta_odds_map, entries)

    # 賭け金配分を計算
    honsen_with_bet = calc_bet_allocation(honsen_fmt, bankroll=bankroll, max_bet=max_bet)
    osae_with_bet = calc_bet_allocation(osae_fmt, bankroll=bankroll, max_bet=max_bet)
    aname_with_bet = calc_bet_allocation(aname_fmt, bankroll=bankroll, max_bet=max_bet)
    bet_summary = calc_bet_summary(honsen_with_bet, osae_with_bet, aname_with_bet)

    # 補正サマリー（予想根拠）
    correction_summary = []
    if has_tidal:
        phase = "前半（満潮傾向・イン有利）" if race_number <= 6 else "後半（干潮傾向・アウト有利）"
        correction_summary.append(f"干満差補正: {phase}")
    if is_stabilizer:
        correction_summary.append("安定板使用: イン+5%・アウト-5%補正")
    if wind_speed >= 5:
        adj_type = "追い風" if any(v > 0 for v in wind_adjustments.values() if isinstance(v, float)) else "向かい風"
        correction_summary.append(f"風補正: {wind_direction}{wind_speed}m ({adj_type})")

    return {
        "honsen": honsen_with_bet,
        "osae": osae_with_bet,
        "aname": aname_with_bet,
        "predictions": honsen_with_bet,
        "racerInfo": racer_info,
        "envInfo": env_info,
        "stadiumInfo": stadium_info,
        "betSummary": bet_summary,
        "correctionSummary": correction_summary,
        "modelUsed": "Ensemble" if use_ensemble else ("LightGBM" if meta.get("use_lgbm") else "GradientBoosting"),
        "winProbabilities": {str(k): round(v * 100, 2) for k, v in win_probs.items()},
        "bankrollUsed": bankroll > 0,
        "exactaMode": False,
        "exactaReason": "",
    }


def predict_heuristic(entries: list, stadium_id: str = "01", race_number: int = 1, bankroll: float = 0, max_bet: int = 0) -> dict:
    """モデルなしのヒューリスティック予想（コース・勝率ベース + 場特性補正）"""
    # 場特性からコース別基準1着率を取得
    characteristics = get_stadium_characteristics(stadium_id)
    course_win_rates = characteristics.get("course_win_rates", [0.55, 0.12, 0.09, 0.08, 0.08, 0.08])
    course_base = {i + 1: course_win_rates[i] for i in range(6)}

    # 環境情報を取得（最初のエントリから）
    wind_direction = None
    wind_speed = 0.0
    if entries:
        wind_direction = entries[0].get("windDirection")
        try:
            wind_speed = float(entries[0].get("windSpeed") or 0)
        except Exception:
            wind_speed = 0.0

    # 風による各コース補正を計算
    wind_adjustments = calculate_wind_effect(stadium_id, wind_direction, wind_speed)

    # 干満差補正を計算
    tidal_adjustments = calc_tidal_adj(stadium_id, race_number)
    has_tidal = stadium_id in TIDAL_STADIUMS

    # 安定板使用の確認（全艇共通のため最初のエントリから取得）
    is_stabilizer = bool(entries[0].get("stabilizer")) if entries else False

    win_probs = {}
    adjustment_log = {}
    for entry in entries:
        boat_num = entry["boatNumber"]
        base = course_base.get(boat_num, 0.1)
        win_rate = entry.get("nationalWinRate") or 4.5
        motor_2rate = entry.get("motor2Rate") or 35
        exhibit_time = entry.get("exhibitionTime") or 6.8

        score = base * (win_rate / 5.0) * (motor_2rate / 40.0)
        if exhibit_time and exhibit_time > 0:
            score *= (7.0 / exhibit_time)

        adj_log = []

        # 風補正を加算
        wind_adj = wind_adjustments.get(boat_num, 0.0)
        if abs(wind_adj) > 0.005:
            adj_label = "有利" if wind_adj > 0 else "不利"
            adj_log.append(f"風補正{adj_label}({wind_adj:+.1%})")
        score = max(score + wind_adj * score, 0.01)

        # 干満差補正
        tidal_adj = tidal_adjustments.get(boat_num, 0.0)
        if abs(tidal_adj) > 0.005:
            phase = "前半(満潮)" if race_number <= 6 else "後半(干潮)"
            adj_label = "有利" if tidal_adj > 0 else "不利"
            adj_log.append(f"干満差{phase}{adj_label}({tidal_adj:+.1%})")
        score = max(score * (1.0 + tidal_adj), 0.01)

        # 安定板補正
        if is_stabilizer:
            stabilizer_adj = {1: 0.05, 2: 0.03, 3: 0.01, 4: -0.01, 5: -0.03, 6: -0.05}
            adj = stabilizer_adj.get(boat_num, 0.0)
            if abs(adj) > 0.005:
                adj_label = "有利" if adj > 0 else "不利"
                adj_log.append(f"安定板{adj_label}({adj:+.1%})")
            score = max(score * (1.0 + adj), 0.01)

        # フライング・出遅れ補正
        fl_penalty = calc_fl_penalty(entry.get("flyingCount"), entry.get("lateCount"))
        if fl_penalty < -0.01:
            fl_count = (entry.get("flyingCount") or 0) + (entry.get("lateCount") or 0)
            adj_log.append(f"F/L{fl_count}回ペナルティ({fl_penalty:+.1%})")
        score = max(score * (1.0 + fl_penalty), 0.01)

        # 展示タイム相対評価補正（同レース内比較）
        exhibit_adj = calc_exhibition_time_adj(entry, all_entries=entries)
        if abs(exhibit_adj) > 0.01:
            adj_label = "速い" if exhibit_adj > 0 else "遅い"
            adj_log.append(f"展示タイム{adj_label}(内比較{exhibit_adj:+.1%})")
        score = max(score * (1.0 + exhibit_adj), 0.01)

        # スタート展示スタートタイム補正（同レース内比較）
        st_adj = calc_start_time_adj(entry, all_entries=entries)
        if abs(st_adj) > 0.01:
            adj_label = "早い" if st_adj > 0 else "遅い"
            st_val_disp = parse_start_time(entry.get("startTime"))
            if st_val_disp is not None:
                adj_log.append(f"展示スタート{adj_label}(ST{st_val_disp:.2f}秒{st_adj:+.1%})")
        score = max(score * (1.0 + st_adj), 0.01)

        win_probs[boat_num] = max(score, 0.01)
        adjustment_log[boat_num] = adj_log

    total = sum(win_probs.values())
    win_probs = {k: v / total for k, v in win_probs.items()}

    trifecta_probs = calc_trifecta_probs(win_probs)

    # オッズマップ（ヒューリスティック時は空）
    trifecta_odds_map = {}
    for entry in entries:
        if entry.get("trifectaOdds"):
            try:
                odds_data = json.loads(entry["trifectaOdds"]) if isinstance(entry["trifectaOdds"], str) else entry["trifectaOdds"]
                trifecta_odds_map.update(odds_data)
            except Exception:
                pass

    categories = select_categories(trifecta_probs, win_probs, trifecta_odds_map)

    racer_info = [{
        "boatNumber": e["boatNumber"],
        "racerNumber": e.get("racerNumber"),
        "racerName": (e.get("racerName") or "").replace("\u3000", ""),
        "racerClass": e.get("racerClass"),
        "nationalWinRate": e.get("nationalWinRate"),
        "motor2Rate": e.get("motor2Rate"),
        "avgSt": e.get("avgSt"),
        "flyingCount": e.get("flyingCount"),
        "lateCount": e.get("lateCount"),
        "exhibitionTime": e.get("exhibitionTime"),
        "startTime": e.get("startTime"),
        "winOdds": e.get("winOdds"),
        "winProbability": round(win_probs.get(e["boatNumber"], 0) * 100, 2),
        "adjustments": adjustment_log.get(e["boatNumber"], []),
    } for e in entries]

    env_info = {}
    if entries:
        first = entries[0]
        env_info = {
            "weather": first.get("weather"),
            "windDirection": first.get("windDirection"),
            "windSpeed": first.get("windSpeed"),
            "waveHeight": first.get("waveHeight"),
            "waterTemp": first.get("waterTemp"),
            "airTemp": first.get("airTemp"),
            "stabilizer": bool(first.get("stabilizer")),
        }

    # 場特性情報を追加
    characteristics = get_stadium_characteristics(stadium_id)
    stadium_info = {
        "name": characteristics.get("name", ""),
        "waterType": characteristics.get("water_type", ""),
        "tidalDifference": characteristics.get("tidal_difference", False),
        "inStrength": characteristics.get("in_strength", 2),
        "tailwindDirection": characteristics.get("tailwind_direction", ""),
        "notes": characteristics.get("notes", ""),
    }

    honsen_fmt = format_predictions(categories["honsen"], trifecta_odds_map, entries)
    osae_fmt = format_predictions(categories["osae"], trifecta_odds_map, entries)
    aname_fmt = format_predictions(categories["aname"], trifecta_odds_map, entries)
    honsen_with_bet = calc_bet_allocation(honsen_fmt, bankroll=bankroll, max_bet=max_bet)
    osae_with_bet = calc_bet_allocation(osae_fmt, bankroll=bankroll, max_bet=max_bet)
    aname_with_bet = calc_bet_allocation(aname_fmt, bankroll=bankroll, max_bet=max_bet)
    bet_summary = calc_bet_summary(honsen_with_bet, osae_with_bet, aname_with_bet)

    # 補正サマリー
    correction_summary = []
    if has_tidal:
        phase = "前半（満潮傾向・イン有利）" if race_number <= 6 else "後半（干潮傾向・アウト有利）"
        correction_summary.append(f"干満差補正: {phase}")
    if is_stabilizer:
        correction_summary.append("安定板使用: イン+5%・アウト-5%補正")
    if wind_speed >= 5:
        correction_summary.append(f"風補正: {wind_direction}{wind_speed}m")

    return {
        "honsen": honsen_with_bet,
        "osae": osae_with_bet,
        "aname": aname_with_bet,
        "predictions": honsen_with_bet,
        "racerInfo": racer_info,
        "envInfo": env_info,
        "stadiumInfo": stadium_info,
        "betSummary": bet_summary,
        "correctionSummary": correction_summary,
        "modelUsed": "Heuristic (モデル未学習)",
        "winProbabilities": {str(k): round(v * 100, 2) for k, v in win_probs.items()},
        "bankrollUsed": bankroll > 0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYYMMDD")
    parser.add_argument("--stadium", required=True, help="場コード 01〜24")
    parser.add_argument("--race", type=int, required=True, help="レース番号 1〜12")
    parser.add_argument("--bankroll", type=float, default=0, help="資金残高（ケリー基準に使用）")
    parser.add_argument("--max-bet", type=int, default=0, help="1レース最大賭け金（DB設定から取得）")
    args = parser.parse_args()

    race_date = args.date.replace("-", "")
    stadium_id = args.stadium.zfill(2)

    # DB設定からmax_bet_per_raceを取得（引数で指定された場合はそちらを優先）
    max_bet = getattr(args, 'max_bet', 0) or 0
    if max_bet <= 0:
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT setting_value FROM app_settings WHERE setting_key = 'max_bet_per_race' LIMIT 1")
            row = cur.fetchone()
            if row:
                max_bet = int(row[0])
            cur.close()
            conn.close()
        except Exception:
            max_bet = 0

    result = predict_race(race_date, stadium_id, args.race, bankroll=args.bankroll, max_bet=max_bet)
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
