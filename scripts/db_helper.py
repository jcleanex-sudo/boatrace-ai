"""
db_helper.py
PostgreSQL (Neon) 対応のDB接続ヘルパー。
DATABASE_URL: postgresql://user:pass@host/dbname?sslmode=require
"""
import os
import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL", "")

def get_db():
    """DATABASE_URL からPostgreSQL接続を作成"""
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    return conn
