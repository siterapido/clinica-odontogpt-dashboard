"""Schema e escrita para chat / handoff WhatsApp."""
from __future__ import annotations

import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

DB_PATH = os.environ.get("ODONTO_CRM_DB", "/root/.hermes-docker/odonto_gpt/data/crm.db")
TZ_OFFSET = timedelta(hours=-3)


def _now_sql() -> str:
    return (datetime.now(timezone.utc) + TZ_OFFSET).strftime("%Y-%m-%d %H:%M:%S")


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return ""
    if digits.startswith("55") and len(digits) >= 12:
        return digits
    if len(digits) >= 10:
        return "55" + digits if not digits.startswith("55") else digits
    return digits


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
            """CREATE TABLE IF NOT EXISTS whatsapp_sessoes (
                telefone TEXT PRIMARY KEY,
                modo TEXT NOT NULL DEFAULT 'bot'
                    CHECK(modo IN ('bot','human')),
                atendente TEXT,
                updated_at TEXT NOT NULL
            )"""
        )
        cols = {r[1] for r in c.execute("PRAGMA table_info(interacoes)").fetchall()}
        if "telefone" not in cols:
            c.execute("ALTER TABLE interacoes ADD COLUMN telefone TEXT")
        c.execute(
            """UPDATE interacoes SET telefone = (
                 SELECT COALESCE(p.whatsapp, p.telefone) FROM pacientes p WHERE p.id = interacoes.paciente_id
               ) WHERE telefone IS NULL AND paciente_id IS NOT NULL"""
        )


def get_modo(telefone: str) -> dict:
    ensure_schema()
    phone = normalize_phone(telefone)
    with _rw() as c:
        row = c.execute(
            "SELECT telefone, modo, atendente, updated_at FROM whatsapp_sessoes WHERE telefone = ?",
            (phone,),
        ).fetchone()
    if not row:
        return {"telefone": phone, "modo": "bot", "atendente": None, "updated_at": None}
    return dict(row)


def set_modo(telefone: str, modo: str, atendente: Optional[str] = None) -> dict:
    if modo not in ("bot", "human"):
        raise ValueError("modo inválido")
    ensure_schema()
    phone = normalize_phone(telefone)
    if not phone:
        raise ValueError("telefone inválido")
    now = _now_sql()
    with _rw() as c:
        c.execute(
            """INSERT INTO whatsapp_sessoes (telefone, modo, atendente, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(telefone) DO UPDATE SET
                 modo = excluded.modo,
                 atendente = excluded.atendente,
                 updated_at = excluded.updated_at""",
            (phone, modo, atendente if modo == "human" else None, now),
        )
    return get_modo(phone)


def resolver_paciente_id(c: sqlite3.Connection, telefone: str) -> Optional[int]:
    phone = normalize_phone(telefone)
    row = c.execute(
        "SELECT id FROM pacientes WHERE whatsapp = ? OR telefone = ? ORDER BY id DESC LIMIT 1",
        (phone, phone),
    ).fetchone()
    return int(row["id"]) if row else None


def registrar_mensagem(
    telefone: str,
    tipo: str,
    mensagem: str,
    classificacao: Optional[str] = None,
) -> int:
    if tipo not in ("envio", "reply"):
        raise ValueError("tipo inválido")
    msg = (mensagem or "").strip()
    if not msg:
        raise ValueError("mensagem vazia")
    ensure_schema()
    phone = normalize_phone(telefone)
    with _rw() as c:
        pid = resolver_paciente_id(c, phone)
        cur = c.execute(
            """INSERT INTO interacoes (paciente_id, telefone, tipo, mensagem, classificacao)
               VALUES (?, ?, ?, ?, ?)""",
            (pid, phone, tipo, msg[:4000], classificacao),
        )
        return int(cur.lastrowid or 0)


def listar_conversas(limit: int = 50) -> list[dict[str, Any]]:
    ensure_schema()
    with _rw() as c:
        rows = c.execute(
            """
            SELECT
              COALESCE(i.telefone, p.whatsapp, p.telefone) AS telefone,
              MAX(i.id) AS ultima_interacao_id,
              MAX(i.created_at) AS ultima_em,
              SUM(CASE WHEN i.tipo = 'envio' THEN 1 ELSE 0 END) AS total_envios,
              p.id AS paciente_id,
              p.nome AS paciente_nome
            FROM interacoes i
            LEFT JOIN pacientes p ON i.paciente_id = p.id
            WHERE COALESCE(i.telefone, p.whatsapp, p.telefone) IS NOT NULL
              AND COALESCE(i.telefone, p.whatsapp, p.telefone) != ''
            GROUP BY COALESCE(i.telefone, p.whatsapp, p.telefone)
            ORDER BY ultima_em DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            tel = normalize_phone(d.get("telefone") or "")
            if not tel:
                continue
            sess = get_modo(tel)
            d["telefone"] = tel
            d["modo"] = sess["modo"]
            d["atendente"] = sess["atendente"]
            out.append(d)
        return out


def listar_mensagens(telefone: str, limit: int = 100, after_id: int = 0) -> list[dict]:
    ensure_schema()
    phone = normalize_phone(telefone)
    with _rw() as c:
        pid = resolver_paciente_id(c, phone)
        rows = c.execute(
            """
            SELECT i.*, p.nome AS paciente_nome
            FROM interacoes i
            LEFT JOIN pacientes p ON i.paciente_id = p.id
            WHERE (i.telefone = ? OR (? IS NOT NULL AND i.paciente_id = ?))
              AND i.id > ?
            ORDER BY i.id ASC
            LIMIT ?
            """,
            (phone, pid, pid, after_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]