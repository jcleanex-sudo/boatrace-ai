#!/usr/bin/env python3.11
"""
train_model.py
DBの過去データを使ってアンサンブルモデルを学習し、models/ディレクトリに保存する。

強化機能:
  - アンサンブル学習: LightGBM + XGBoost + RandomForest の多数決
  - ベイズ最適化: Optunaによるハイパーパラメータ自動調整
  - コース別勝率特徴量: 選手ごとのコース別勝率をDBから計算して追加
  - 選手直近3ヶ月成績: 直近の調子を反映

Usage:
  python3 train_model.py
  python3 train_model.py --optimize   # ベイズ最適化あり（時間がかかる）
  python3 train_model.py --no-ensemble  # LightGBMのみ
"""
import argparse
import json
import os
import pickle
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd

SCRIPTS_DIR = os.path.dirname(__file__)
sys.path.insert(0, SCRIPTS_DIR)
from db_helper import get_db  # noqa: E402

try:
    import lightgbm as lgb
    USE_LGBM = True
except ImportError:
    USE_LGBM = False

try:
    import xgboost as xgb
    USE_XGB = True
except ImportError:
    USE_XGB = False

try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    USE_OPTUNA = True
except ImportError:
    USE_OPTUNA = False

from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier, VotingClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.calibration import CalibratedClassifierCV

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def load_training_data(conn) -> pd.DataFrame:
    """レース結果 + 出走表 + 直前情報を結合してトレーニングデータを作成"""
    query = """
        SELECT
            rr.raceDate, rr.stadiumId, rr.raceNumber, rr.boatNumber,
            rr.place, rr.startTiming,
            re.racerNumber, re.racerClass, re.age, re.weight,
            re.nationalWinRate, re.national2Rate, re.national3Rate,
            re.localWinRate, re.local2Rate,
            re.motor2Rate, re.motor3Rate, re.boat2Rate,
            re.avgSt, re.flyingCount, re.lateCount,
            re.weather, re.windSpeed, re.waveHeight,
            rb.exhibitionTime, rb.circuitTime, rb.tilt, rb.winOdds
        FROM race_results rr
        LEFT JOIN race_entries re
          ON rr.raceDate=re.raceDate AND rr.stadiumId=re.stadiumId
          AND rr.raceNumber=re.raceNumber AND rr.boatNumber=re.boatNumber
        LEFT JOIN race_before_info rb
          ON rr.raceDate=rb.raceDate AND rr.stadiumId=rb.stadiumId
          AND rr.raceNumber=rb.raceNumber AND rr.boatNumber=rb.boatNumber
        WHERE rr.place IS NOT NULL AND rr.place BETWEEN 1 AND 6
        ORDER BY rr.raceDate, rr.stadiumId, rr.raceNumber, rr.boatNumber
    """
    df = pd.read_sql(query, conn)
    return df


def load_course_win_rates(conn) -> pd.DataFrame:
    """選手ごとのコース別勝率を計算（過去データから）"""
    query = """
        SELECT
            re.racerNumber,
            re.boatNumber AS course,
            COUNT(*) AS total_races,
            SUM(CASE WHEN rr.place = 1 THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN rr.place <= 2 THEN 1 ELSE 0 END) AS top2,
            SUM(CASE WHEN rr.place <= 3 THEN 1 ELSE 0 END) AS top3
        FROM race_results rr
        JOIN race_entries re
          ON rr.raceDate=re.raceDate AND rr.stadiumId=re.stadiumId
          AND rr.raceNumber=re.raceNumber AND rr.boatNumber=re.boatNumber
        WHERE rr.place IS NOT NULL AND re.racerNumber IS NOT NULL
        GROUP BY re.racerNumber, re.boatNumber
        HAVING total_races >= 5
    """
    try:
        df = pd.read_sql(query, conn)
        df["courseWinRate"] = df["wins"] / df["total_races"]
        df["courseTop2Rate"] = df["top2"] / df["total_races"]
        df["courseTop3Rate"] = df["top3"] / df["total_races"]
        return df[["racerNumber", "course", "courseWinRate", "courseTop2Rate", "courseTop3Rate"]]
    except Exception as e:
        print(f"  [WARN] コース別勝率の取得に失敗: {e}", file=sys.stderr)
        return pd.DataFrame()


def load_recent_form(conn, months: int = 3) -> pd.DataFrame:
    """選手の直近N ヶ月の成績を取得"""
    cutoff = (date.today() - timedelta(days=months * 30)).strftime("%Y-%m-%d")
    query = f"""
        SELECT
            re.racerNumber,
            COUNT(*) AS recentRaces,
            AVG(rr.place) AS recentAvgPlace,
            SUM(CASE WHEN rr.place = 1 THEN 1 ELSE 0 END) / COUNT(*) AS recentWinRate,
            SUM(CASE WHEN rr.place <= 3 THEN 1 ELSE 0 END) / COUNT(*) AS recentTop3Rate
        FROM race_results rr
        JOIN race_entries re
          ON rr.raceDate=re.raceDate AND rr.stadiumId=re.stadiumId
          AND rr.raceNumber=re.raceNumber AND rr.boatNumber=re.boatNumber
        WHERE rr.raceDate >= '{cutoff}'
          AND rr.place IS NOT NULL
          AND re.racerNumber IS NOT NULL
        GROUP BY re.racerNumber
        HAVING recentRaces >= 3
    """
    try:
        return pd.read_sql(query, conn)
    except Exception as e:
        print(f"  [WARN] 直近成績の取得に失敗: {e}", file=sys.stderr)
        return pd.DataFrame()


def build_features(df: pd.DataFrame, course_rates: pd.DataFrame, recent_form: pd.DataFrame) -> tuple:
    """特徴量エンジニアリング（コース別勝率・直近成績を追加）"""
    # カテゴリ変数をエンコード
    le_class = LabelEncoder()
    df["racerClassEnc"] = le_class.fit_transform(df["racerClass"].fillna("B2"))

    le_weather = LabelEncoder()
    df["weatherEnc"] = le_weather.fit_transform(df["weather"].fillna("晴"))

    # コース別勝率を結合
    if not course_rates.empty:
        df = df.merge(
            course_rates.rename(columns={"course": "boatNumber"}),
            on=["racerNumber", "boatNumber"],
            how="left"
        )
        df["courseWinRate"] = df["courseWinRate"].fillna(df["nationalWinRate"] / 100 if "nationalWinRate" in df.columns else 0.1)
        df["courseTop2Rate"] = df["courseTop2Rate"].fillna(0.3)
        df["courseTop3Rate"] = df["courseTop3Rate"].fillna(0.45)
    else:
        df["courseWinRate"] = 0.1
        df["courseTop2Rate"] = 0.3
        df["courseTop3Rate"] = 0.45

    # 直近成績を結合
    if not recent_form.empty:
        df = df.merge(recent_form, on="racerNumber", how="left")
        df["recentWinRate"] = df["recentWinRate"].fillna(df["nationalWinRate"] / 100 if "nationalWinRate" in df.columns else 0.1)
        df["recentTop3Rate"] = df["recentTop3Rate"].fillna(0.45)
        df["recentAvgPlace"] = df["recentAvgPlace"].fillna(3.5)
    else:
        df["recentWinRate"] = 0.1
        df["recentTop3Rate"] = 0.45
        df["recentAvgPlace"] = 3.5

    # 数値特徴量（コース別勝率・直近成績を追加）
    feature_cols = [
        "boatNumber", "stadiumId",
        "racerClassEnc", "age", "weight",
        "nationalWinRate", "national2Rate", "national3Rate",
        "localWinRate", "local2Rate",
        "motor2Rate", "motor3Rate", "boat2Rate",
        "avgSt", "flyingCount", "lateCount",
        "weatherEnc", "windSpeed", "waveHeight",
        "exhibitionTime", "circuitTime", "tilt", "winOdds",
        # 新規追加特徴量
        "courseWinRate", "courseTop2Rate", "courseTop3Rate",
        "recentWinRate", "recentTop3Rate", "recentAvgPlace",
    ]

    # stadiumId を数値に変換
    df["stadiumId"] = pd.to_numeric(df["stadiumId"], errors="coerce")

    # 欠損値補完
    for col in feature_cols:
        if col in df.columns:
            try:
                df[col] = pd.to_numeric(df[col], errors="coerce")
                median_val = df[col].median()
                df[col] = df[col].fillna(median_val if not pd.isna(median_val) else 0)
            except Exception:
                df[col] = 0.0
        else:
            df[col] = 0.0

    X = df[feature_cols].values
    y = (df["place"] == 1).astype(int).values

    return X, y, feature_cols, le_class, le_weather


def optimize_lgbm(X_train, y_train, X_val, y_val, n_trials: int = 30) -> dict:
    """Optunaによるベイズ最適化でLightGBMのハイパーパラメータを探索"""
    def objective(trial):
        params = {
            "objective": "binary",
            "metric": "binary_logloss",
            "verbosity": -1,
            "n_jobs": -1,
            "num_leaves": trial.suggest_int("num_leaves", 20, 150),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
            "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
            "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
            "bagging_freq": trial.suggest_int("bagging_freq", 1, 10),
            "min_child_samples": trial.suggest_int("min_child_samples", 5, 100),
            "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
        }
        dtrain = lgb.Dataset(X_train, label=y_train)
        dval = lgb.Dataset(X_val, label=y_val, reference=dtrain)
        model = lgb.train(
            params, dtrain,
            num_boost_round=300,
            valid_sets=[dval],
            callbacks=[lgb.early_stopping(30), lgb.log_evaluation(-1)],
        )
        preds = model.predict(X_val)
        return roc_auc_score(y_val, preds)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
    print(f"  [Optuna] Best AUC: {study.best_value:.4f}, params: {study.best_params}")
    return study.best_params


def train(conn, use_ensemble: bool = True, use_optimize: bool = False):
    print("Loading training data...", flush=True)
    df = load_training_data(conn)
    print(f"  {len(df)} rows loaded", flush=True)

    if len(df) < 100:
        print("  [WARN] Not enough data for training. Need at least 100 rows.", flush=True)
        return None

    # コース別勝率・直近成績を取得
    print("Loading course win rates and recent form...", flush=True)
    course_rates = load_course_win_rates(conn)
    recent_form = load_recent_form(conn, months=3)
    print(f"  Course rates: {len(course_rates)} records, Recent form: {len(recent_form)} racers", flush=True)

    X, y, feature_cols, le_class, le_weather = build_features(df, course_rates, recent_form)
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    print(f"  Train: {len(X_train)}, Val: {len(X_val)}", flush=True)
    print(f"  Positive rate (1st place): {y.mean():.3f}", flush=True)

    models = []
    model_names = []

    # ─── LightGBM ─────────────────────────────────────────────────────────────
    if USE_LGBM:
        print("Training LightGBM...", flush=True)
        if use_optimize and USE_OPTUNA:
            print("  Running Bayesian optimization (30 trials)...", flush=True)
            best_params = optimize_lgbm(X_train, y_train, X_val, y_val, n_trials=30)
            lgbm_params = {
                "objective": "binary",
                "metric": "binary_logloss",
                "verbosity": -1,
                "n_jobs": -1,
                **best_params,
            }
        else:
            lgbm_params = {
                "objective": "binary",
                "metric": "binary_logloss",
                "num_leaves": 63,
                "learning_rate": 0.05,
                "feature_fraction": 0.8,
                "bagging_fraction": 0.8,
                "bagging_freq": 5,
                "min_child_samples": 20,
                "reg_alpha": 0.1,
                "reg_lambda": 0.1,
                "verbose": -1,
                "n_jobs": -1,
            }
        dtrain = lgb.Dataset(X_train, label=y_train, feature_name=feature_cols)
        dval = lgb.Dataset(X_val, label=y_val, reference=dtrain)
        lgbm_model = lgb.train(
            lgbm_params, dtrain,
            num_boost_round=500,
            valid_sets=[dval],
            callbacks=[lgb.early_stopping(50), lgb.log_evaluation(200)],
        )
        lgbm_preds = lgbm_model.predict(X_val)
        lgbm_acc = accuracy_score(y_val, (lgbm_preds > 0.5).astype(int))
        lgbm_auc = roc_auc_score(y_val, lgbm_preds)
        print(f"  LightGBM: acc={lgbm_acc:.4f}, auc={lgbm_auc:.4f}", flush=True)
        models.append(("lgbm", lgbm_model, lgbm_preds))
        model_names.append("LightGBM")

    # ─── XGBoost ──────────────────────────────────────────────────────────────
    if use_ensemble and USE_XGB:
        print("Training XGBoost...", flush=True)
        xgb_model = xgb.XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            use_label_encoder=False,
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        xgb_model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
        xgb_preds = xgb_model.predict_proba(X_val)[:, 1]
        xgb_acc = accuracy_score(y_val, (xgb_preds > 0.5).astype(int))
        xgb_auc = roc_auc_score(y_val, xgb_preds)
        print(f"  XGBoost: acc={xgb_acc:.4f}, auc={xgb_auc:.4f}", flush=True)
        models.append(("xgb", xgb_model, xgb_preds))
        model_names.append("XGBoost")

    # ─── RandomForest ─────────────────────────────────────────────────────────
    if use_ensemble:
        print("Training RandomForest...", flush=True)
        rf_model = RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            min_samples_leaf=10,
            random_state=42,
            n_jobs=-1,
        )
        rf_model.fit(X_train, y_train)
        rf_preds = rf_model.predict_proba(X_val)[:, 1]
        rf_acc = accuracy_score(y_val, (rf_preds > 0.5).astype(int))
        rf_auc = roc_auc_score(y_val, rf_preds)
        print(f"  RandomForest: acc={rf_acc:.4f}, auc={rf_auc:.4f}", flush=True)
        models.append(("rf", rf_model, rf_preds))
        model_names.append("RandomForest")

    # フォールバック（LightGBMもXGBoostもない場合）
    if not models:
        print("Training GradientBoosting (fallback)...", flush=True)
        gb_model = GradientBoostingClassifier(n_estimators=100, random_state=42)
        gb_model.fit(X_train, y_train)
        gb_preds = gb_model.predict_proba(X_val)[:, 1]
        models.append(("gb", gb_model, gb_preds))
        model_names.append("GradientBoosting")

    # ─── アンサンブル（多数決・平均）─────────────────────────────────────────
    if len(models) > 1:
        # 各モデルの予測確率を平均（ソフト投票）
        ensemble_preds = np.mean([preds for _, _, preds in models], axis=0)
        ensemble_acc = accuracy_score(y_val, (ensemble_preds > 0.5).astype(int))
        ensemble_auc = roc_auc_score(y_val, ensemble_preds)
        print(f"  Ensemble ({'+'.join(model_names)}): acc={ensemble_acc:.4f}, auc={ensemble_auc:.4f}", flush=True)
        final_acc = ensemble_acc
        final_auc = ensemble_auc
    else:
        final_acc = accuracy_score(y_val, (models[0][2] > 0.5).astype(int))
        final_auc = roc_auc_score(y_val, models[0][2])

    # ─── モデルを保存 ─────────────────────────────────────────────────────────
    os.makedirs(MODEL_DIR, exist_ok=True)

    # 各モデルを個別に保存
    saved_models = {}
    for name, model, _ in models:
        model_path = os.path.join(MODEL_DIR, f"{name}_model.pkl")
        with open(model_path, "wb") as f:
            pickle.dump(model, f)
        saved_models[name] = model_path

    # メインモデル（後方互換性のため lgbm_model.pkl にも保存）
    main_model = models[0][1]
    main_model_path = os.path.join(MODEL_DIR, "lgbm_model.pkl")
    with open(main_model_path, "wb") as f:
        pickle.dump(main_model, f)

    meta = {
        "feature_cols": feature_cols,
        "le_class_classes": le_class.classes_.tolist(),
        "le_weather_classes": le_weather.classes_.tolist(),
        "accuracy": final_acc,
        "auc": final_auc,
        "train_rows": len(X_train),
        "val_rows": len(X_val),
        "use_lgbm": USE_LGBM,
        "use_ensemble": len(models) > 1,
        "ensemble_models": model_names,
        "has_course_features": True,
        "has_recent_form": True,
    }
    meta_path = os.path.join(MODEL_DIR, "model_meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"  Models saved to {MODEL_DIR}", flush=True)
    return {
        "accuracy": final_acc,
        "auc": final_auc,
        "train_rows": len(X_train),
        "ensemble_models": model_names,
    }


def main():
    parser = argparse.ArgumentParser(description="競艇予想AIモデルの学習")
    parser.add_argument("--optimize", action="store_true", help="Optunaでハイパーパラメータを最適化（時間がかかる）")
    parser.add_argument("--no-ensemble", action="store_true", help="LightGBMのみ使用（アンサンブルなし）")
    args = parser.parse_args()

    conn = get_db()
    result = train(conn, use_ensemble=not args.no_ensemble, use_optimize=args.optimize)
    conn.close()

    if result:
        print(json.dumps({
            "success": True,
            "accuracy": result["accuracy"],
            "auc": result.get("auc", 0),
            "train_rows": result["train_rows"],
            "ensemble_models": result.get("ensemble_models", []),
        }))
    else:
        print(json.dumps({"success": False, "error": "Not enough data"}))


if __name__ == "__main__":
    main()
