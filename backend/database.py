import sqlite3
import os
from pathlib import Path

DB_PATH = "/root/.hermes-docker/odonto_gpt/data/crm.db"


def get_db():
    """Retorna conexão SQLite em modo READ-ONLY."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Banco de dados não encontrado: {DB_PATH}")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = ON")
    return conn


def query(sql: str, params: tuple = ()) -> list:
    """Executa query SELECT e retorna lista de dicionários."""
    conn = get_db()
    try:
        cursor = conn.execute(sql, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def query_one(sql: str, params: tuple = ()):
    """Executa query SELECT e retorna um dicionário ou None."""
    conn = get_db()
    try:
        cursor = conn.execute(sql, params)
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
