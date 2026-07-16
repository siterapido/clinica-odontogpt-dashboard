# backend/tests/test_anti_noshow_crm.py
"""Contrato anti-noshow (Task 1 RED): confirm, cancel→lista espera, skip envio."""
from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

CRM_SKILL = Path("/root/.hermes-docker/profiles/odonto-gpt/skills/odonto_crm")
sys.path.insert(0, str(CRM_SKILL))

from lib.core import OdontoCRM  # type: ignore
from lib.v2 import OdontoCRMV2  # type: ignore

BRT = timezone(timedelta(hours=-3))


def _schema(conn: sqlite3.Connection) -> None:
    # Schema mínimo + config_local (criar_agendamento_v2 chama get_config/FF_PRECONSULTA).
    conn.executescript(
        """
        CREATE TABLE pacientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT, whatsapp TEXT, telefone TEXT,
          created_at TEXT DEFAULT (datetime('now','-3 hours'))
        );
        CREATE TABLE agendamentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          paciente_id INTEGER, dentista TEXT, data TEXT, horario TEXT,
          status TEXT DEFAULT 'agendado',
          procedimento TEXT, created_at TEXT,
          dentista_id INTEGER, duracao_min INTEGER DEFAULT 30,
          sala TEXT, origem TEXT DEFAULT 'whatsapp',
          confirmado_em TEXT, cancelado_em TEXT,
          motivo_cancelamento TEXT, no_show INTEGER DEFAULT 0,
          orcamento_id INTEGER
        );
        CREATE TABLE lembretes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agendamento_id INTEGER, paciente_id INTEGER NOT NULL,
          tipo TEXT NOT NULL, data_envio TEXT NOT NULL, mensagem TEXT NOT NULL,
          status TEXT DEFAULT 'pendente', tentativas INTEGER DEFAULT 0,
          erro TEXT, created_at TEXT, enviado_at TEXT
        );
        CREATE TABLE lista_espera (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          paciente_id INTEGER NOT NULL, dentista_id INTEGER,
          procedimento TEXT, prioridade INTEGER DEFAULT 50,
          janela_inicio TEXT, janela_fim TEXT,
          periodo_preferido TEXT DEFAULT 'qualquer',
          status TEXT DEFAULT 'ativo',
          ofertado_agendamento_id INTEGER, notas TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE config_local (
          chave TEXT PRIMARY KEY,
          valor TEXT
        );
        """
    )
    # Desliga pré-consulta para não exigir tabela preconsultas no harness.
    conn.execute(
        "INSERT INTO config_local (chave, valor) VALUES ('FF_PRECONSULTA', '0')"
    )
    conn.commit()


@pytest.fixture
def crm_db(tmp_path):
    db = tmp_path / "crm.db"
    conn = sqlite3.connect(db)
    _schema(conn)
    conn.execute(
        "INSERT INTO pacientes (id, nome, whatsapp) VALUES (1, 'Maria Silva', '5584999999999')"
    )
    conn.execute(
        "INSERT INTO pacientes (id, nome, whatsapp) VALUES (2, 'João Espera', '5584888888888')"
    )
    conn.commit()
    conn.close()
    os.environ["ODONTO_CRM_DB"] = str(db)
    yield str(db)


def test_confirmar_seta_confirmado_em(crm_db):
    v2 = OdontoCRMV2(OdontoCRM(crm_db))
    aid = v2.criar_agendamento_v2(
        paciente_id=1, data="2099-01-15", horario="14:00",
        procedimento="Avaliação",
    )
    assert v2.confirmar_agendamento(aid) is True
    row = sqlite3.connect(crm_db).execute(
        "SELECT status, confirmado_em FROM agendamentos WHERE id=?", (aid,)
    ).fetchone()
    assert row[0] == "confirmado"
    assert row[1]  # not null


def test_cancelar_enfileira_oferta_lista_espera(crm_db):
    v2 = OdontoCRMV2(OdontoCRM(crm_db))
    # paciente 2 na lista de espera ativo
    v2.lista_espera_add(paciente_id=2, procedimento="Avaliação", prioridade=80)
    aid = v2.criar_agendamento_v2(
        paciente_id=1, data="2099-01-20", horario="10:00",
        procedimento="Avaliação",
    )
    assert v2.cancelar_agendamento_v2(aid, motivo="paciente cancelou") is True
    conn = sqlite3.connect(crm_db)
    # deve existir lembrete tipo lista_espera pendente para paciente 2
    rows = conn.execute(
        """SELECT paciente_id, tipo, status FROM lembretes
           WHERE tipo='lista_espera' AND status='pendente'"""
    ).fetchall()
    assert any(r[0] == 2 for r in rows)
    # hold: lista_espera do paciente 2 fica ofertado apontando ao slot cancelado
    le = conn.execute(
        """SELECT status, ofertado_agendamento_id FROM lista_espera
           WHERE paciente_id=2"""
    ).fetchone()
    assert le is not None
    assert le[0] == "ofertado"
    assert le[1] == aid


def test_worker_helper_skip_se_agendamento_cancelado(crm_db):
    """Função pura que o worker usará — importável."""
    from lib.lembrete_policy import deve_enviar_lembrete  # type: ignore

    conn = sqlite3.connect(crm_db)
    conn.row_factory = sqlite3.Row
    # setup: lembrete + agendamento cancelado
    conn.execute(
        """INSERT INTO agendamentos (id, paciente_id, data, horario, status, procedimento)
           VALUES (9, 1, '2099-02-01', '09:00', 'cancelado', 'Limpeza')"""
    )
    conn.execute(
        """INSERT INTO lembretes (id, agendamento_id, paciente_id, tipo, data_envio, mensagem, status)
           VALUES (9, 9, 1, 'd1', '2099-01-31 09:00:00', 'oi', 'pendente')"""
    )
    conn.commit()
    row = conn.execute("SELECT * FROM lembretes WHERE id=9").fetchone()
    assert deve_enviar_lembrete(conn, row) is False


def test_reenvio_d1_apos_4h_sem_confirmacao(crm_db):
    from lib.reenvio import gerar_reenvios_d1  # type: ignore

    conn = sqlite3.connect(crm_db)
    # agendamento amanhã agendado
    amanha = (datetime.now(BRT) + timedelta(days=1)).strftime("%Y-%m-%d")
    conn.execute(
        """INSERT INTO agendamentos (id, paciente_id, data, horario, status, procedimento)
           VALUES (50, 1, ?, '15:00', 'agendado', 'Avaliação')""",
        (amanha,),
    )
    enviado_at = (datetime.now(BRT) - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        """INSERT INTO lembretes
           (agendamento_id, paciente_id, tipo, data_envio, mensagem, status, enviado_at)
           VALUES (50, 1, 'd1', ?, 'primeiro', 'enviado', ?)""",
        (enviado_at, enviado_at),
    )
    conn.commit()
    n = gerar_reenvios_d1(crm_db)
    assert n == 1
    cnt = conn.execute(
        """SELECT COUNT(*) FROM lembretes
           WHERE agendamento_id=50 AND status='pendente' AND mensagem LIKE '%confirmação%'"""
    ).fetchone()[0]
    assert cnt == 1
