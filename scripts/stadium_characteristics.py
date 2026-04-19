"""
24場の競艇場特性データ
出典: 公式データ・各種競艇情報サイトを参考に整備

各場の特性:
  - course_win_rates: コース別1着率 [1~6コース]
  - water_type: 水質 (淡水/海水/汽水)
  - tidal_difference: 干満差あり (True/False)
  - wind_influence: 風の影響度 (1=弱い, 2=普通, 3=強い)
  - wave_level: 波の高さ (1=とても低い, 2=低い, 3=普通, 4=高い, 5=とても高い)
  - surface_width: 水面の広さ (1=狭い, 2=普通, 3=広い)
  - in_strength: インコースの強さ (1=弱い, 2=普通, 3=強い)
  - race_time: レース時間帯 (day/night/morning)
  - motor_exchange_month: モーター交換月
  - notes: 特記事項

コース有利不利の考え方:
  - 追い風: インコース有利 (スタンド→第1ターン方向)
  - 向かい風: アウトコース有利
  - 各場の「追い風方向」は場所・水面配置による
"""

# 場コード → 場名
STADIUM_NAMES = {
    "01": "桐生",
    "02": "戸田",
    "03": "江戸川",
    "04": "平和島",
    "05": "多摩川",
    "06": "浜名湖",
    "07": "蒲郡",
    "08": "常滑",
    "09": "津",
    "10": "三国",
    "11": "びわこ",
    "12": "住之江",
    "13": "尼崎",
    "14": "鳴門",
    "15": "丸亀",
    "16": "児島",
    "17": "宮島",
    "18": "徳山",
    "19": "下関",
    "20": "若松",
    "21": "芦屋",
    "22": "福岡",
    "23": "唐津",
    "24": "大村",
}

# 24場の特性データ
STADIUM_CHARACTERISTICS = {
    "01": {  # 桐生
        "name": "桐生",
        "prefecture": "群馬",
        "course_win_rates": [0.511, 0.157, 0.127, 0.112, 0.075, 0.019],
        "water_type": "淡水",
        "tidal_difference": False,
        "wind_influence": 2,       # 普通
        "wave_level": 3,           # 普通
        "surface_width": 2,        # 普通
        "in_strength": 2,          # 普通
        "race_time": "night",
        "motor_exchange_month": 12,
        # 桐生は山に囲まれた内陸の淡水面。北からの風が強くなりやすい。
        # 追い風（南風）でインが有利、向かい風（北風）でアウトが有利
        "tailwind_direction": "南",   # この方向の風がインに有利
        "wind_effect_on_in": 0.03,    # 追い風時のイン補正値
        "notes": "山に囲まれた内陸の淡水面。北からの風が吹くとインが不利。モーター差が出やすい。",
    },
    "02": {  # 戸田
        "name": "戸田",
        "prefecture": "埼玉",
        "course_win_rates": [0.430, 0.163, 0.153, 0.163, 0.074, 0.020],
        "water_type": "淡水",
        "tidal_difference": False,
        "wind_influence": 1,       # 弱い
        "wave_level": 1,           # とても低い
        "surface_width": 1,        # 狭い
        "in_strength": 1,          # 弱い
        "race_time": "day",
        "motor_exchange_month": 7,
        # 全国一水面が狭い。第1ターンが大きく振られるため3・4コースのまくりが決まりやすい
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.02,
        "notes": "全国一水面が狭い。3・4コースのまくりが決まりやすく、インが弱い。",
    },
    "03": {  # 江戸川
        "name": "江戸川",
        "prefecture": "東京",
        "course_win_rates": [0.443, 0.182, 0.150, 0.116, 0.068, 0.044],
        "water_type": "汽水",
        "tidal_difference": True,
        "wind_influence": 3,       # 強い
        "wave_level": 5,           # とても高い
        "surface_width": 1,        # 狭い
        "in_strength": 1,          # 弱い
        "race_time": "day",
        "motor_exchange_month": 4,
        # 全国一の難水面。干満差あり、風が強く波が高い。6コースが比較的強い
        "tailwind_direction": "南西",
        "wind_effect_on_in": 0.04,
        "notes": "全国一の難水面。干満差あり、風が強く波が高い。6コースが比較的強い。",
    },
    "04": {  # 平和島
        "name": "平和島",
        "prefecture": "東京",
        "course_win_rates": [0.446, 0.166, 0.132, 0.143, 0.081, 0.033],
        "water_type": "海水",
        "tidal_difference": True,
        "wind_influence": 3,       # 強い
        "wave_level": 4,           # 高い
        "surface_width": 2,        # 普通
        "in_strength": 1,          # 弱い
        "race_time": "day",
        "motor_exchange_month": 6,
        "tailwind_direction": "北",
        "wind_effect_on_in": 0.035,
        "notes": "海水面で干満差あり。風が強く波が高い。インが弱く荒れやすい。",
    },
    "05": {  # 多摩川
        "name": "多摩川",
        "prefecture": "東京",
        "course_win_rates": [0.517, 0.149, 0.126, 0.131, 0.054, 0.022],
        "water_type": "淡水",
        "tidal_difference": False,
        "wind_influence": 2,       # 普通
        "wave_level": 3,           # 普通
        "surface_width": 3,        # 広い
        "in_strength": 2,          # 普通
        "race_time": "day",
        "motor_exchange_month": 8,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.025,
        "notes": "淡水面で広い水面。比較的走りやすい。",
    },
    "06": {  # 浜名湖
        "name": "浜名湖",
        "prefecture": "静岡",
        "course_win_rates": [0.507, 0.156, 0.133, 0.118, 0.067, 0.020],
        "water_type": "汽水",
        "tidal_difference": True,
        "wind_influence": 3,       # 強い
        "wave_level": 3,           # 普通
        "surface_width": 3,        # 広い
        "in_strength": 1,          # 弱い
        "race_time": "day",
        "motor_exchange_month": 4,
        "tailwind_direction": "北",
        "wind_effect_on_in": 0.04,
        "notes": "汽水面で干満差あり。風が強く荒れやすい。全国一広い水面。",
    },
    "07": {  # 蒲郡
        "name": "蒲郡",
        "prefecture": "愛知",
        "course_win_rates": [0.544, 0.126, 0.119, 0.121, 0.074, 0.018],
        "water_type": "汽水",
        "tidal_difference": False,
        "wind_influence": 2,       # 普通
        "wave_level": 2,           # 低い
        "surface_width": 2,        # 普通
        "in_strength": 2,          # 普通
        "race_time": "night",
        "motor_exchange_month": 5,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.025,
        "notes": "汽水面だが比較的安定した水面。ナイター開催。",
    },
    "08": {  # 常滑
        "name": "常滑",
        "prefecture": "愛知",
        "course_win_rates": [0.555, 0.127, 0.114, 0.112, 0.068, 0.025],
        "water_type": "海水",
        "tidal_difference": False,
        "wind_influence": 3,       # 強い
        "wave_level": 2,           # 低い
        "surface_width": 3,        # 広い
        "in_strength": 2,          # 普通
        "race_time": "day",
        "motor_exchange_month": 12,
        "tailwind_direction": "北西",
        "wind_effect_on_in": 0.03,
        "notes": "海水面で広い水面。風が強いが波は低め。",
    },
    "09": {  # 津
        "name": "津",
        "prefecture": "三重",
        "course_win_rates": [0.579, 0.146, 0.120, 0.089, 0.044, 0.021],
        "water_type": "汽水",
        "tidal_difference": False,
        "wind_influence": 2,       # 普通
        "wave_level": 3,           # 普通
        "surface_width": 2,        # 普通
        "in_strength": 3,          # 強い
        "race_time": "day",
        "motor_exchange_month": 9,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.025,
        "notes": "インが強い。汽水面だが比較的安定。",
    },
    "10": {  # 三国
        "name": "三国",
        "prefecture": "福井",
        "course_win_rates": [0.531, 0.171, 0.130, 0.103, 0.045, 0.020],
        "water_type": "淡水",
        "tidal_difference": False,
        "wind_influence": 3,       # 強い
        "wave_level": 3,           # 普通
        "surface_width": 2,        # 普通
        "in_strength": 2,          # 普通
        "race_time": "day",
        "motor_exchange_month": 4,
        # 冬は日本海からの強風が吹く。北風が強くなりやすい
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.04,
        "notes": "冬は日本海からの強風（北風）が吹く。北風時はアウトが有利。",
    },
    "11": {  # びわこ
        "name": "びわこ",
        "prefecture": "滋賀",
        "course_win_rates": [0.504, 0.162, 0.128, 0.122, 0.063, 0.021],
        "water_type": "淡水",
        "tidal_difference": False,
        "wind_influence": 2,       # 普通
        "wave_level": 3,           # 普通
        "surface_width": 3,        # 広い
        "in_strength": 1,          # 弱い
        "race_time": "day",
        "motor_exchange_month": 6,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.03,
        "notes": "琵琶湖の淡水面。広い水面で風の影響を受けやすい。",
    },
    "12": {  # 住之江
        "name": "住之江",
        "prefecture": "大阪",
        "course_win_rates": [0.569, 0.158, 0.113, 0.100, 0.045, 0.015],
        "water_type": "淡水",
        "tidal_difference": False,
        "wind_influence": 1,       # 弱い
        "wave_level": 2,           # 低い
        "surface_width": 1,        # 狭い
        "in_strength": 3,          # 強い
        "race_time": "night",
        "motor_exchange_month": 3,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.02,
        "notes": "全国屈指のイン水面。淡水面で静水面。ナイター開催。",
    },
    "13": {  # 尼崎
        "name": "尼崎",
        "prefecture": "兵庫",
        "course_win_rates": [0.557, 0.142, 0.123, 0.106, 0.058, 0.013],
        "water_type": "淡水",
        "tidal_difference": False,
        "wind_influence": 2,       # 普通
        "wave_level": 1,           # とても低い
        "surface_width": 2,        # 普通
        "in_strength": 2,          # 普通（強めの普通）
        "race_time": "day",
        "motor_exchange_month": 4,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.025,
        "notes": "淡水面で波が低く安定した水面。",
    },
    "14": {  # 鳴門
        "name": "鳴門",
        "prefecture": "徳島",
        "course_win_rates": [0.502, 0.154, 0.145, 0.116, 0.059, 0.023],
        "water_type": "海水",
        "tidal_difference": True,
        "wind_influence": 2,       # 普通
        "wave_level": 3,           # 普通
        "surface_width": 1,        # 狭い
        "in_strength": 1,          # 弱い
        "race_time": "morning",
        "motor_exchange_month": 4,
        "tailwind_direction": "北",
        "wind_effect_on_in": 0.035,
        "notes": "海水面で干満差あり。鳴門海峡に近く潮流の影響を受ける。モーニング開催。",
    },
    "15": {  # 丸亀
        "name": "丸亀",
        "prefecture": "香川",
        "course_win_rates": [0.522, 0.163, 0.124, 0.106, 0.066, 0.019],
        "water_type": "海水",
        "tidal_difference": True,
        "wind_influence": 2,       # 普通
        "wave_level": 3,           # 普通
        "surface_width": 1,        # 狭い
        "in_strength": 2,          # 普通
        "race_time": "night",
        "motor_exchange_month": 11,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.03,
        "notes": "海水面で干満差あり。瀬戸内海に面しており比較的穏やか。ナイター開催。",
    },
    "16": {  # 児島
        "name": "児島",
        "prefecture": "岡山",
        "course_win_rates": [0.566, 0.135, 0.111, 0.106, 0.063, 0.018],
        "water_type": "海水",
        "tidal_difference": True,
        "wind_influence": 2,       # 普通
        "wave_level": 3,           # 普通
        "surface_width": 2,        # 普通
        "in_strength": 2,          # 普通（強めの普通）
        "race_time": "day",
        "motor_exchange_month": 1,
        # 児島は瀬戸内海に面しており、追い風（南西風）でインが有利
        # 向かい風（北東風）でアウトが有利
        "tailwind_direction": "南西",
        "wind_effect_on_in": 0.03,
        "notes": "瀬戸内海の海水面。干満差あり。追い風（南西）でインが有利、向かい風（北東）でアウトが有利。",
    },
    "17": {  # 宮島
        "name": "宮島",
        "prefecture": "広島",
        "course_win_rates": [0.568, 0.131, 0.121, 0.104, 0.057, 0.019],
        "water_type": "海水",
        "tidal_difference": True,
        "wind_influence": 2,       # 普通
        "wave_level": 3,           # 普通
        "surface_width": 2,        # 普通
        "in_strength": 2,          # 普通（強めの普通）
        "race_time": "day",
        "motor_exchange_month": 9,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.03,
        "notes": "瀬戸内海の海水面。干満差あり。世界遺産・宮島の近く。",
    },
    "18": {  # 徳山
        "name": "徳山",
        "prefecture": "山口",
        "course_win_rates": [0.645, 0.135, 0.092, 0.074, 0.042, 0.011],
        "water_type": "海水",
        "tidal_difference": True,
        "wind_influence": 2,       # 普通
        "wave_level": 4,           # 高い
        "surface_width": 3,        # 広い
        "in_strength": 3,          # 強い
        "race_time": "morning",
        "motor_exchange_month": 4,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.025,
        "notes": "全国屈指のイン水面（1コース勝率64.5%）。海水面で干満差あり。モーニング開催。",
    },
    "19": {  # 下関
        "name": "下関",
        "prefecture": "山口",
        "course_win_rates": [0.576, 0.129, 0.111, 0.111, 0.051, 0.023],
        "water_type": "海水",
        "tidal_difference": True,
        "wind_influence": 2,       # 普通
        "wave_level": 4,           # 高い
        "surface_width": 3,        # 広い
        "in_strength": 3,          # 強い
        "race_time": "night",
        "motor_exchange_month": 2,
        "tailwind_direction": "南西",
        "wind_effect_on_in": 0.03,
        "notes": "海水面で干満差あり。関門海峡に近く潮流の影響を受ける。ナイター開催。",
    },
    "20": {  # 若松
        "name": "若松",
        "prefecture": "福岡",
        "course_win_rates": [0.571, 0.154, 0.111, 0.095, 0.052, 0.017],
        "water_type": "海水",
        "tidal_difference": True,
        "wind_influence": 3,       # 強い
        "wave_level": 4,           # 高い
        "surface_width": 1,        # 狭い
        "in_strength": 3,          # 強い
        "race_time": "night",
        "motor_exchange_month": 12,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.04,
        "notes": "海水面で干満差あり。風が強く波が高い。ナイター開催。",
    },
    "21": {  # 芦屋
        "name": "芦屋",
        "prefecture": "福岡",
        "course_win_rates": [0.611, 0.114, 0.098, 0.108, 0.052, 0.017],
        "water_type": "淡水",
        "tidal_difference": False,
        "wind_influence": 3,       # 強い
        "wave_level": 4,           # 高い
        "surface_width": 2,        # 普通
        "in_strength": 3,          # 強い
        "race_time": "morning",
        "motor_exchange_month": 5,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.04,
        "notes": "淡水面だが風が強く波が高い。1コース勝率61.1%と高い。モーニング開催。",
    },
    "22": {  # 福岡
        "name": "福岡",
        "prefecture": "福岡",
        "course_win_rates": [0.507, 0.165, 0.152, 0.114, 0.052, 0.011],
        "water_type": "汽水",
        "tidal_difference": True,
        "wind_influence": 3,       # 強い
        "wave_level": 4,           # 高い
        "surface_width": 3,        # 広い
        "in_strength": 1,          # 弱い
        "race_time": "day",
        "motor_exchange_month": 6,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.045,
        "notes": "汽水面で干満差あり。風が強く波が高い。インが弱く荒れやすい。",
    },
    "23": {  # 唐津
        "name": "唐津",
        "prefecture": "佐賀",
        "course_win_rates": [0.535, 0.161, 0.128, 0.110, 0.052, 0.017],
        "water_type": "淡水",
        "tidal_difference": False,
        "wind_influence": 3,       # 強い
        "wave_level": 4,           # 高い
        "surface_width": 1,        # 狭い
        "in_strength": 2,          # 普通
        "race_time": "morning",
        "motor_exchange_month": 8,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.04,
        "notes": "淡水面だが風が強く波が高い。モーニング開催。",
    },
    "24": {  # 大村
        "name": "大村",
        "prefecture": "長崎",
        "course_win_rates": [0.682, 0.119, 0.098, 0.065, 0.028, 0.009],
        "water_type": "海水",
        "tidal_difference": True,
        "wind_influence": 2,       # 普通
        "wave_level": 3,           # 普通
        "surface_width": 2,        # 普通
        "in_strength": 3,          # 強い
        "race_time": "night",
        "motor_exchange_month": 6,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.025,
        "notes": "全国最強のイン水面（1コース勝率68.2%）。海水面で干満差あり。ナイター開催。",
    },
}


def get_stadium_characteristics(stadium_id: str) -> dict:
    """
    場コードから競艇場特性を取得。
    見つからない場合はデフォルト値を返す。
    """
    sid = str(stadium_id).zfill(2)
    return STADIUM_CHARACTERISTICS.get(sid, {
        "name": f"場{sid}",
        "course_win_rates": [0.53, 0.15, 0.12, 0.11, 0.06, 0.02],
        "water_type": "不明",
        "tidal_difference": False,
        "wind_influence": 2,
        "wave_level": 3,
        "surface_width": 2,
        "in_strength": 2,
        "race_time": "day",
        "motor_exchange_month": 4,
        "tailwind_direction": "南",
        "wind_effect_on_in": 0.03,
        "notes": "",
    })


def calculate_wind_effect(stadium_id: str, wind_direction: str, wind_speed: float) -> dict:
    """
    風向・風速から各コースへの影響を計算する。
    
    戻り値: {course_number: adjustment_factor}
    adjustment_factor > 0: 有利, < 0: 不利
    """
    characteristics = get_stadium_characteristics(stadium_id)
    tailwind_dir = characteristics.get("tailwind_direction", "南")
    wind_effect = characteristics.get("wind_effect_on_in", 0.03)
    
    if not wind_direction or not wind_speed:
        return {i: 0.0 for i in range(1, 7)}
    
    # 風速による影響度スケール
    if wind_speed < 3:
        scale = 0.3
    elif wind_speed < 5:
        scale = 0.6
    elif wind_speed < 7:
        scale = 1.0
    elif wind_speed < 10:
        scale = 1.4
    else:
        scale = 1.8
    
    # 追い風かどうかの判定
    # 追い風方向と実際の風向が一致する場合はインが有利
    is_tailwind = _is_tailwind(tailwind_dir, wind_direction)
    
    if is_tailwind:
        # 追い風: インコース有利、アウトコース不利
        adjustments = {
            1: wind_effect * scale,
            2: wind_effect * scale * 0.5,
            3: 0.0,
            4: -wind_effect * scale * 0.3,
            5: -wind_effect * scale * 0.5,
            6: -wind_effect * scale * 0.7,
        }
    else:
        # 向かい風: アウトコース有利、インコース不利
        adjustments = {
            1: -wind_effect * scale,
            2: -wind_effect * scale * 0.5,
            3: 0.0,
            4: wind_effect * scale * 0.3,
            5: wind_effect * scale * 0.5,
            6: wind_effect * scale * 0.7,
        }
    
    return adjustments


# 方位の近接度マップ（16方位）
_DIRECTIONS_16 = [
    "北", "北北東", "北東", "東北東",
    "東", "東南東", "南東", "南南東",
    "南", "南南西", "南西", "西南西",
    "西", "西北西", "北西", "北北西",
]


def _is_tailwind(tailwind_dir: str, actual_dir: str) -> bool:
    """
    実際の風向が追い風方向（±45度以内）かどうかを判定。
    """
    if tailwind_dir not in _DIRECTIONS_16 or actual_dir not in _DIRECTIONS_16:
        return False
    
    idx_tail = _DIRECTIONS_16.index(tailwind_dir)
    idx_actual = _DIRECTIONS_16.index(actual_dir)
    
    # 16方位で±2（=±45度）以内なら追い風
    diff = abs(idx_tail - idx_actual)
    diff = min(diff, 16 - diff)  # 円環距離
    return diff <= 2


def get_course_base_win_rate(stadium_id: str, course: int) -> float:
    """
    場特性から特定コースの基準1着率を取得。
    """
    characteristics = get_stadium_characteristics(stadium_id)
    rates = characteristics.get("course_win_rates", [0.53, 0.15, 0.12, 0.11, 0.06, 0.02])
    if 1 <= course <= 6:
        return rates[course - 1]
    return 0.0


if __name__ == "__main__":
    # テスト
    import json
    
    # 児島競艇場の特性確認
    kojima = get_stadium_characteristics("16")
    print("=== 児島競艇場 ===")
    print(f"1コース勝率: {kojima['course_win_rates'][0]*100:.1f}%")
    print(f"水質: {kojima['water_type']}")
    print(f"追い風方向: {kojima['tailwind_direction']}")
    print(f"特記: {kojima['notes']}")
    print()
    
    # 追い風7m（南西風）の場合の影響
    print("=== 追い風7m（南西風）の場合 ===")
    effects = calculate_wind_effect("16", "南西", 7.0)
    for course, adj in effects.items():
        direction = "有利" if adj > 0 else "不利" if adj < 0 else "中立"
        print(f"  {course}コース: {adj:+.3f} ({direction})")
    print()
    
    # 向かい風7m（北東風）の場合の影響
    print("=== 向かい風7m（北東風）の場合 ===")
    effects = calculate_wind_effect("16", "北東", 7.0)
    for course, adj in effects.items():
        direction = "有利" if adj > 0 else "不利" if adj < 0 else "中立"
        print(f"  {course}コース: {adj:+.3f} ({direction})")
