"""
db_helper.py
全スクリプトから共通で使うDB接続ヘルパー。
TiDB Cloud の DATABASE_URL（mysql2://...?ssl=...形式）に対応。
"""
import os
import re
import ssl

import mysql.connector


def _parse_db_url(raw: str) -> str:
    """DATABASE_URLに混入したテキスト（dotenvメッセージ等）を除去して純粋なURLを返す"""
    # mysql:// または mysql2:// から始まる部分を抽出
    m = re.search(r"(mysql(?:2)?://\S+)", raw)
    return m.group(1) if m else raw


DB_URL = _parse_db_url(os.environ.get("DATABASE_URL", ""))


def get_db():
    """DATABASE_URL からSSL対応のMySQL接続を作成"""
    m = re.match(r"mysql(?:2)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/([^?]+)", DB_URL)
    if not m:
        raise ValueError(f"Invalid DATABASE_URL: {DB_URL!r}")
    user, password, host, port, database = m.groups()

    # TiDB CloudはSSL必須
    return mysql.connector.connect(
        host=host,
        port=int(port or 3306),
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        ssl_ca=None,
        ssl_disabled=False,
        ssl_verify_cert=False,
        ssl_verify_identity=False,
        connection_timeout=15,
    )
