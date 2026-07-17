# backend/tests/test_message_feedback.py
from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import chat_store  # noqa: E402


@pytest.fixture()
def crm_db(tmp_path, monkeypatch):
    db = tmp_path / "crm.db"
    con = sqlite3.connect(db)
    con.executescript(
        """
        CREATE TABLE pacientes (
          id INTEGER PRIMARY KEY, nome TEXT, whatsapp TEXT, telefone TEXT, observacoes TEXT
        );
        CREATE TABLE interacoes (
          id INTEGER PRIMARY KEY, paciente_id INTEGER, tipo TEXT DEFAULT 'envio',
          mensagem TEXT, classificacao TEXT,
          created_at TEXT DEFAULT (datetime('now', '-3 hours')), telefone TEXT
        );
        INSERT INTO pacientes (id, nome, whatsapp, telefone)
          VALUES (1, 'Maria', '5584991111111', '5584991111111');
        INSERT INTO interacoes (id, paciente_id, telefone, tipo, mensagem, classificacao)
          VALUES (10, 1, '5584991111111', 'envio', 'Oi', 'cliente');
        INSERT INTO interacoes (id, paciente_id, telefone, tipo, mensagem, classificacao)
          VALUES (11, 1, '5584991111111', 'reply', 'Olá! Como posso ajudar?', 'bot');
        INSERT INTO interacoes (id, paciente_id, telefone, tipo, mensagem, classificacao)
          VALUES (12, 1, '5584991111111', 'reply', 'Sou a recepção', 'atendente:Ana');
        """
    )
    con.commit()
    con.close()
    monkeypatch.setenv("ODONTO_CRM_DB", str(db))
    chat_store.DB_PATH = str(db)
    chat_store.ensure_schema()
    return str(db)


def test_upsert_feedback_1_a_5(crm_db):
    fb = chat_store.upsert_message_feedback(11, nota=4, comentario="Bom tom", operador="Gerente")
    assert fb["nota"] == 4
    assert fb["comentario"] == "Bom tom"
    assert fb["interacao_id"] == 11
    fb2 = chat_store.upsert_message_feedback(11, nota=2, comentario="Frio")
    assert fb2["nota"] == 2
    assert chat_store.get_message_feedback(11)["nota"] == 2


def test_reject_nota_invalida(crm_db):
    with pytest.raises(ValueError):
        chat_store.upsert_message_feedback(11, nota=0)
    with pytest.raises(ValueError):
        chat_store.upsert_message_feedback(11, nota=6)


def test_reject_envio_e_atendente(crm_db):
    with pytest.raises(ValueError):
        chat_store.upsert_message_feedback(10, nota=3)
    with pytest.raises(ValueError):
        chat_store.upsert_message_feedback(12, nota=3)


def test_listar_mensagens_inclui_feedback(crm_db):
    chat_store.upsert_message_feedback(11, nota=5, comentario="ok")
    msgs = chat_store.listar_mensagens("5584991111111", limit=50)
    bot = next(m for m in msgs if m["id"] == 11)
    assert bot["feedback"]["nota"] == 5
    envio = next(m for m in msgs if m["id"] == 10)
    assert envio.get("feedback") is None
