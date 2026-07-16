# backend/tests/test_insights_anti_noshow.py
"""Task 6: KPIs anti-noshow no briefing (janela 7d BRT)."""
from __future__ import annotations

import importlib
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

BRT = timezone(timedelta(hours=-3))


def _now_brt() -> datetime:
    return datetime.now(BRT)


def _schema(conn: sqlite3.Connection) -> None:
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
        """
    )
    conn.commit()


@pytest.fixture()
def insights_mod(tmp_path, monkeypatch):
    """Temp CRM DB + patch insights_service.query/query_one."""
    db = tmp_path / "crm.db"
    conn = sqlite3.connect(db)
    _schema(conn)
    conn.close()

    def _open():
        c = sqlite3.connect(db)
        c.row_factory = sqlite3.Row
        return c

    def fake_query(sql: str, params: tuple = ()):
        c = _open()
        try:
            rows = c.execute(sql, params).fetchall()
            return [dict(r) for r in rows]
        finally:
            c.close()

    def fake_query_one(sql: str, params: tuple = ()):
        rows = fake_query(sql, params)
        return rows[0] if rows else None

    import insights_service

    importlib.reload(insights_service)
    monkeypatch.setattr(insights_service, "query", fake_query)
    monkeypatch.setattr(insights_service, "query_one", fake_query_one)

    return insights_service, Path(db)


def _seed_window(db_path: Path) -> None:
    """Seed known counts inside / outside 7d window."""
    now = _now_brt()
    hoje = now.strftime("%Y-%m-%d")
    d3 = (now - timedelta(days=3)).strftime("%Y-%m-%d")
    d10 = (now - timedelta(days=10)).strftime("%Y-%m-%d")  # fora da janela
    ts_recent = (now - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")
    ts_old = (now - timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")

    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO pacientes (id, nome, whatsapp) VALUES (1, 'Ana', '5584111111111')"
    )
    # Agenda 7d: 2 agendado, 3 confirmado, 1 realizado, 1 no_show  → denom 7
    rows = [
        (1, d3, "09:00", "agendado", 0),
        (1, d3, "10:00", "agendado", 0),
        (1, d3, "11:00", "confirmado", 0),
        (1, d3, "12:00", "confirmado", 0),
        (1, hoje, "14:00", "confirmado", 0),
        (1, d3, "15:00", "realizado", 0),
        (1, d3, "16:00", "no_show", 1),
        # fora da janela
        (1, d10, "09:00", "confirmado", 0),
        (1, d10, "10:00", "no_show", 1),
        # cancelado não entra no denom
        (1, d3, "17:00", "cancelado", 0),
    ]
    for i, (pid, data, hora, status, nos) in enumerate(rows, start=1):
        conn.execute(
            """INSERT INTO agendamentos
               (id, paciente_id, data, horario, status, procedimento, no_show)
               VALUES (?, ?, ?, ?, ?, 'Avaliação', ?)""",
            (i, pid, data, hora, status, nos),
        )

    # Lembretes 7d
    conn.execute(
        """INSERT INTO lembretes
           (agendamento_id, paciente_id, tipo, data_envio, mensagem, status, enviado_at, created_at)
           VALUES (1, 1, 'd1', ?, 'ok', 'enviado', ?, ?)""",
        (ts_recent, ts_recent, ts_recent),
    )
    conn.execute(
        """INSERT INTO lembretes
           (agendamento_id, paciente_id, tipo, data_envio, mensagem, status, enviado_at, created_at)
           VALUES (2, 1, 'd1', ?, 'ok2', 'enviado', ?, ?)""",
        (ts_recent, ts_recent, ts_recent),
    )
    conn.execute(
        """INSERT INTO lembretes
           (agendamento_id, paciente_id, tipo, data_envio, mensagem, status, created_at)
           VALUES (3, 1, 'd0', ?, 'fail', 'falhou', ?)""",
        (ts_recent, ts_recent),
    )
    # fora da janela
    conn.execute(
        """INSERT INTO lembretes
           (agendamento_id, paciente_id, tipo, data_envio, mensagem, status, enviado_at, created_at)
           VALUES (8, 1, 'd1', ?, 'old', 'enviado', ?, ?)""",
        (ts_old, ts_old, ts_old),
    )

    # Lista espera
    conn.execute(
        """INSERT INTO lista_espera
           (paciente_id, procedimento, status, created_at, updated_at)
           VALUES (1, 'Limpeza', 'ativo', ?, ?)""",
        (ts_recent, ts_recent),
    )
    conn.execute(
        """INSERT INTO lista_espera
           (paciente_id, procedimento, status, created_at, updated_at)
           VALUES (1, 'Avaliação', 'ofertado', ?, ?)""",
        (ts_recent, ts_recent),
    )
    conn.execute(
        """INSERT INTO lista_espera
           (paciente_id, procedimento, status, created_at, updated_at)
           VALUES (1, 'Canal', 'convertido', ?, ?)""",
        (ts_recent, ts_recent),
    )
    conn.execute(
        """INSERT INTO lista_espera
           (paciente_id, procedimento, status, created_at, updated_at)
           VALUES (1, 'Clareamento', 'ofertado', ?, ?)""",
        (ts_old, ts_old),
    )
    conn.commit()
    conn.close()


def test_anti_noshow_kpis_counts_and_rates(insights_mod):
    mod, db = insights_mod
    _seed_window(db)

    k = mod.anti_noshow_kpis()

    assert k["agendados_7d"] == 2
    assert k["confirmados_7d"] == 3
    assert k["no_show_7d"] == 1
    assert k["realizado_7d"] == 1
    assert k["base_agenda_7d"] == 7  # 2+3+1+1
    # 3/7 * 100 ≈ 42.9
    assert k["taxa_confirmacao_pct"] == 42.9
    # 1/7 * 100 ≈ 14.3
    assert k["taxa_no_show_pct"] == 14.3

    assert k["lembretes_enviados_7d"] == 2
    assert k["lembretes_falhos_7d"] == 1
    assert k["lista_espera_ativos"] == 1
    assert k["lista_espera_ofertados_7d"] == 1  # old ofertado fora da janela
    assert k["lista_espera_convertidos_7d"] == 1


def test_anti_noshow_kpis_empty_zero_pct(insights_mod):
    mod, _db = insights_mod
    k = mod.anti_noshow_kpis()
    assert k["agendados_7d"] == 0
    assert k["confirmados_7d"] == 0
    assert k["taxa_confirmacao_pct"] == 0.0
    assert k["taxa_no_show_pct"] == 0.0
    assert k["lista_espera_ativos"] == 0


def test_clinic_briefing_embeds_anti_noshow(insights_mod):
    mod, db = insights_mod
    _seed_window(db)
    # clinic_briefing tenta v2 financeiro — deve tolerar falha
    b = mod.clinic_briefing()
    assert "anti_noshow" in b
    anti = b["anti_noshow"]
    assert anti["confirmados_7d"] == 3
    assert anti["taxa_confirmacao_pct"] == 42.9
    assert anti["lista_espera_ativos"] == 1


def test_quick_prompts_include_confirmacao_and_lista():
    import insights_service as mod

    ids = {q["id"] for q in mod.QUICK_PROMPTS}
    assert "confirmacao_noshow" in ids
    assert "lista_espera" in ids
    prompts = {q["prompt"] for q in mod.QUICK_PROMPTS}
    assert "Como está nossa taxa de confirmação e no-show nos últimos 7 dias?" in prompts
    assert "Quem está na lista de espera ativa e o que ofertar hoje?" in prompts
