"""Histórico do chat administrador (SQLite, mesma base CRM)."""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Any

DB_PATH = os.environ.get("ODONTO_CRM_DB", "/root/.hermes-docker/odonto_gpt/data/crm.db")
TZ_OFFSET = timedelta(hours=-3)


def _now_sql() -> str:
    return (datetime.now(timezone.utc) + TZ_OFFSET).strftime("%Y-%m-%d %H:%M:%S")


@contextmanager
def _rw():
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def ensure_schema() -> None:
    with _rw() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS admin_agent_mensagens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user','assistant')),
                conteudo TEXT NOT NULL,
                created_at TEXT NOT NULL,
                meta_json TEXT
            )"""
        )
        cols = {r[1] for r in c.execute("PRAGMA table_info(admin_agent_mensagens)").fetchall()}
        if "meta_json" not in cols:
            c.execute("ALTER TABLE admin_agent_mensagens ADD COLUMN meta_json TEXT")
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_admin_agent_sess ON admin_agent_mensagens(session_id, id)"
        )


def append(
    session_id: str,
    role: str,
    conteudo: str,
    meta: dict[str, Any] | None = None,
) -> int:
    if role not in ("user", "assistant"):
        raise ValueError("role inválido")
    ensure_schema()
    msg = (conteudo or "").strip()[:8000]
    if not msg:
        raise ValueError("conteudo vazio")
    meta_s = json.dumps(meta, ensure_ascii=False) if meta else None
    with _rw() as c:
        cur = c.execute(
            """INSERT INTO admin_agent_mensagens (session_id, role, conteudo, created_at, meta_json)
               VALUES (?, ?, ?, ?, ?)""",
            (session_id, role, msg, _now_sql(), meta_s),
        )
        return int(cur.lastrowid or 0)


def list_messages(session_id: str, limit: int = 80, after_id: int = 0) -> list[dict[str, Any]]:
    ensure_schema()
    with _rw() as c:
        rows = c.execute(
            """SELECT id, session_id, role, conteudo, created_at, meta_json
               FROM admin_agent_mensagens
               WHERE session_id = ? AND id > ?
               ORDER BY id ASC LIMIT ?""",
            (session_id, after_id, limit),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            if d.get("meta_json"):
                try:
                    d["meta"] = json.loads(d["meta_json"])
                except json.JSONDecodeError:
                    d["meta"] = None
            else:
                d["meta"] = None
            out.append(d)
        return out


def history_for_llm(session_id: str, max_turns: int = 12) -> list[dict[str, Any]]:
    """Últimas mensagens para contexto Hermes (sem system)."""
    ensure_schema()
    with _rw() as c:
        rows = c.execute(
            """SELECT role, conteudo FROM admin_agent_mensagens
               WHERE session_id = ?
               ORDER BY id DESC LIMIT ?""",
            (session_id, max_turns),
        ).fetchall()
    msgs = [{"role": r["role"], "content": r["conteudo"]} for r in reversed(rows)]
    return msgs