"""Schema e escrita para chat / handoff WhatsApp + CRM kanban."""
from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

DB_PATH = os.environ.get("ODONTO_CRM_DB", "/root/.hermes-docker/odonto_gpt/data/crm.db")


def _db_path() -> str:
    """Prioriza ODONTO_CRM_DB / DB_PATH do módulo (testes e override operacional)."""
    env = os.environ.get("ODONTO_CRM_DB")
    if env:
        return env
    if DB_PATH and DB_PATH != "/root/.hermes-docker/odonto_gpt/data/crm.db":
        return DB_PATH
    try:
        from database import resolve_db_path

        return resolve_db_path()
    except Exception:
        return DB_PATH or "/root/.hermes-docker/odonto_gpt/data/crm.db"

TZ_OFFSET = timedelta(hours=-3)

# Chat fixo no dashboard para o operador simular ser o paciente
TEST_CHAT_PHONE = "5599999000001"
TEST_CHAT_NOME = "Chat de Teste (você = cliente)"

# Funil operacional da clínica (WhatsApp → resultado)
STAGES: list[dict[str, str]] = [
    {"id": "entrada", "label": "Entrada", "hint": "Primeiro contato / triagem"},
    {"id": "agente", "label": "OdontoGPT", "hint": "Agente atendendo no WhatsApp"},
    {"id": "humano", "label": "Humano", "hint": "Equipe assumiu o atendimento"},
    {"id": "agendamento", "label": "Agendamento", "hint": "Marcando ou confirmando consulta"},
    {"id": "followup", "label": "Follow-up", "hint": "Pós-consulta, orçamento, retorno"},
    {"id": "concluido", "label": "Concluído", "hint": "Resolvido ou arquivado"},
]
STAGE_IDS = {s["id"] for s in STAGES}
PRIORIDADES = {"baixa", "media", "alta"}

# SLA operacional (paciente enviou e clínica ainda não respondeu)
SLA_ATENCAO_MIN = 15
SLA_CRITICO_MIN = 45
TAG_PRESETS = [
    "novo",
    "retorno",
    "urgencia",
    "orcamento",
    "confirmacao",
    "noshow",
    "vip",
    "implante",
    "ortodontia",
    "avaliacao",
]

# Qualidade do lead — metáforas da clínica (não estrelas genéricas)
LEAD_SCORES: list[dict[str, Any]] = [
    {
        "id": 1,
        "key": "semente",
        "label": "Semente",
        "hint": "Primeiro contato frio — ainda germinando",
        "icon": "sprout",
    },
    {
        "id": 2,
        "key": "consulta",
        "label": "Consulta",
        "hint": "Explorando opções — educar e escutar",
        "icon": "stethoscope",
    },
    {
        "id": 3,
        "key": "dor",
        "label": "Com dor",
        "hint": "Urgência clínica — priorizar atendimento",
        "icon": "thermometer",
    },
    {
        "id": 4,
        "key": "cadeira",
        "label": "Cadeira",
        "hint": "Pronto para marcar — fechar horário",
        "icon": "calendar",
    },
    {
        "id": 5,
        "key": "alto_valor",
        "label": "Alto valor",
        "hint": "Implante / ortodontia / plano — cuidado VIP",
        "icon": "gem",
    },
]
LEAD_SCORE_IDS = {s["id"] for s in LEAD_SCORES}

# Scripts de conversão / recuperação / follow-up (passos pré-determinados)
SCRIPT_FLUXOS: dict[str, dict[str, Any]] = {
    "conversao": {
        "id": "conversao",
        "label": "Script de conversão",
        "hint": "Do oi até a consulta marcada",
        "passos": [
            {
                "id": "saudacao",
                "label": "Saudação + escuta",
                "template": "Oi! Aqui é da clínica 😊 Como posso te ajudar hoje?",
            },
            {
                "id": "queixa",
                "label": "Mapear queixa",
                "template": "Entendi. Há quanto tempo sente isso? Já fez algum tratamento antes?",
            },
            {
                "id": "valor",
                "label": "Valor da avaliação",
                "template": "Podemos te encaixar numa avaliação com o dentista para olhar com calma e te passar o melhor caminho.",
            },
            {
                "id": "agenda",
                "label": "Oferecer horários",
                "template": "Tenho horários nesta semana. Prefere manhã ou tarde?",
            },
            {
                "id": "fechar",
                "label": "Fechar + confirmar",
                "template": "Perfeito! Vou reservar. Me confirma seu nome completo e se o WhatsApp é o melhor contato?",
            },
        ],
    },
    "recuperacao": {
        "id": "recuperacao",
        "label": "Recuperação de venda",
        "hint": "Orçamento parado, no-show ou sumiu",
        "passos": [
            {
                "id": "reativar",
                "label": "Reativar com carinho",
                "template": "Oi! Sentimos sua falta por aqui 😊 Ainda faz sentido falarmos do seu tratamento?",
            },
            {
                "id": "objecao",
                "label": "Ouvir objeção",
                "template": "Sem pressa — o que te travou na última conversa? Preço, horário ou dúvida no plano?",
            },
            {
                "id": "oferta",
                "label": "Oferta / encaixe",
                "template": "Conseguimos um encaixe esta semana e condições facilitadas. Quer que eu separe um horário?",
            },
            {
                "id": "fechar",
                "label": "Fechar ou lista de espera",
                "template": "Se preferir, te coloco na lista de espera prioritária e te aviso no primeiro horário livre.",
            },
        ],
    },
    "followup": {
        "id": "followup",
        "label": "Follow-up clínico",
        "hint": "Pós-consulta, cuidados e retorno",
        "passos": [
            {
                "id": "checkin",
                "label": "Check-in pós-consulta",
                "template": "Oi! Passando para saber como você está após a consulta. Alguma dúvida ou desconforto?",
            },
            {
                "id": "cuidados",
                "label": "Cuidados em casa",
                "template": "Lembrete dos cuidados: higiene suave, evitar alimentos duros se orientado, e avisar se piorar.",
            },
            {
                "id": "retorno",
                "label": "Agendar retorno",
                "template": "Quando quiser, já deixo o retorno marcado. Prefere em 7, 15 ou 30 dias?",
            },
            {
                "id": "nps",
                "label": "Avaliação (NPS)",
                "template": "De 0 a 10, quanto você recomendaria a clínica a um amigo? Seu feedback nos ajuda a cuidar melhor.",
            },
        ],
    },
}


def _now_dt() -> datetime:
    return datetime.now(timezone.utc) + TZ_OFFSET


def _now_sql() -> str:
    return _now_dt().strftime("%Y-%m-%d %H:%M:%S")


def _parse_sql_dt(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    text = str(raw).strip().replace("T", " ")[:19]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def minutos_desde(raw: Optional[str]) -> Optional[int]:
    dt = _parse_sql_dt(raw)
    if not dt:
        return None
    # timestamps no CRM são “wall clock” BRT (-3)
    delta = _now_dt() - dt
    return max(0, int(delta.total_seconds() // 60))


def sla_status_for(*, aguardando: bool, minutos: Optional[int], prioridade: str) -> str:
    """ok | atencao | critico | n/a"""
    if not aguardando or minutos is None:
        return "n/a"
    crit = SLA_CRITICO_MIN
    aten = SLA_ATENCAO_MIN
    if prioridade == "alta":
        crit = 20
        aten = 8
    if minutos >= crit:
        return "critico"
    if minutos >= aten:
        return "atencao"
    return "ok"


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
    con = sqlite3.connect(_db_path(), timeout=15)
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
        sess_cols = {r[1] for r in c.execute("PRAGMA table_info(whatsapp_sessoes)").fetchall()}
        migrations = [
            ("stage", "TEXT"),
            ("prioridade", "TEXT DEFAULT 'media'"),
            ("notas_crm", "TEXT"),
            ("tags", "TEXT"),
            ("stage_manual", "INTEGER DEFAULT 0"),
            ("stage_updated_at", "TEXT"),
            ("rascunho_resposta", "TEXT"),
            ("rascunho_origem", "TEXT"),
            ("rascunho_updated_at", "TEXT"),
            ("wa_nome", "TEXT"),
            ("wa_foto_url", "TEXT"),
            ("perfil_atualizado_em", "TEXT"),
            ("lead_score", "INTEGER"),
            ("script_fluxo", "TEXT"),
            ("script_passo", "INTEGER DEFAULT 0"),
        ]
        for col, decl in migrations:
            if col not in sess_cols:
                c.execute(f"ALTER TABLE whatsapp_sessoes ADD COLUMN {col} {decl}")
        cols = {r[1] for r in c.execute("PRAGMA table_info(interacoes)").fetchall()}
        if "telefone" not in cols:
            c.execute("ALTER TABLE interacoes ADD COLUMN telefone TEXT")
        c.execute(
            """UPDATE interacoes SET telefone = (
                 SELECT COALESCE(p.whatsapp, p.telefone) FROM pacientes p WHERE p.id = interacoes.paciente_id
               ) WHERE telefone IS NULL AND paciente_id IS NOT NULL"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS chat_eventos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telefone TEXT NOT NULL,
                tipo TEXT NOT NULL,
                titulo TEXT,
                detalhe TEXT,
                meta_json TEXT,
                created_at TEXT NOT NULL
            )"""
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_eventos_tel ON chat_eventos(telefone, id DESC)"
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS chat_followups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telefone TEXT NOT NULL,
                tipo TEXT NOT NULL DEFAULT 'auto',
                titulo TEXT NOT NULL,
                descricao TEXT,
                due_at TEXT,
                status TEXT NOT NULL DEFAULT 'pendente',
                created_at TEXT NOT NULL,
                completed_at TEXT
            )"""
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_followups_tel ON chat_followups(telefone, status)"
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS message_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interacao_id INTEGER NOT NULL UNIQUE,
                telefone TEXT NOT NULL,
                nota INTEGER NOT NULL CHECK(nota >= 1 AND nota <= 5),
                comentario TEXT,
                operador TEXT,
                reescrita_texto TEXT,
                reescrita_em TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_message_feedback_telefone "
            "ON message_feedback(telefone)"
        )
        # pacientes: cache do nome/foto capturados do WhatsApp
        pac_cols = {r[1] for r in c.execute("PRAGMA table_info(pacientes)").fetchall()}
        for col, decl in (
            ("wa_nome", "TEXT"),
            ("wa_foto_url", "TEXT"),
            ("wa_perfil_em", "TEXT"),
        ):
            if col not in pac_cols:
                try:
                    c.execute(f"ALTER TABLE pacientes ADD COLUMN {col} {decl}")
                except sqlite3.Error:
                    pass


def _sess_defaults(phone: str) -> dict[str, Any]:
    return {
        "telefone": phone,
        "modo": "bot",
        "atendente": None,
        "updated_at": None,
        "stage": None,
        "prioridade": "media",
        "notas_crm": None,
        "tags": [],
        "stage_manual": 0,
        "stage_updated_at": None,
        "rascunho_resposta": None,
        "rascunho_origem": None,
        "rascunho_updated_at": None,
        "wa_nome": None,
        "wa_foto_url": None,
        "perfil_atualizado_em": None,
        "lead_score": None,
        "script_fluxo": None,
        "script_passo": 0,
    }


def registrar_evento(
    telefone: str,
    tipo: str,
    titulo: str,
    detalhe: Optional[str] = None,
    meta: Optional[dict] = None,
) -> int:
    ensure_schema()
    phone = normalize_phone(telefone)
    now = _now_sql()
    with _rw() as c:
        cur = c.execute(
            """INSERT INTO chat_eventos (telefone, tipo, titulo, detalhe, meta_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                phone,
                (tipo or "info")[:40],
                (titulo or "")[:200],
                (detalhe or "")[:1000] if detalhe else None,
                json.dumps(meta, ensure_ascii=False) if meta else None,
                now,
            ),
        )
        return int(cur.lastrowid or 0)


def listar_eventos(telefone: str, limit: int = 40) -> list[dict[str, Any]]:
    ensure_schema()
    phone = normalize_phone(telefone)
    with _rw() as c:
        rows = c.execute(
            """SELECT * FROM chat_eventos WHERE telefone = ?
               ORDER BY id DESC LIMIT ?""",
            (phone, limit),
        ).fetchall()
    out = []
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


def criar_followup(
    telefone: str,
    titulo: str,
    *,
    tipo: str = "auto",
    descricao: Optional[str] = None,
    due_hours: int = 24,
) -> dict[str, Any]:
    ensure_schema()
    phone = normalize_phone(telefone)
    now = _now_dt()
    due = (now + timedelta(hours=max(1, due_hours))).strftime("%Y-%m-%d %H:%M:%S")
    now_s = now.strftime("%Y-%m-%d %H:%M:%S")
    with _rw() as c:
        # evita duplicar follow-up auto pendente com mesmo título nas últimas 24h
        if tipo == "auto":
            exists = c.execute(
                """SELECT id FROM chat_followups
                   WHERE telefone = ? AND titulo = ? AND status = 'pendente'
                   ORDER BY id DESC LIMIT 1""",
                (phone, titulo[:200]),
            ).fetchone()
            if exists:
                return dict(c.execute("SELECT * FROM chat_followups WHERE id = ?", (exists["id"],)).fetchone())
        cur = c.execute(
            """INSERT INTO chat_followups
               (telefone, tipo, titulo, descricao, due_at, status, created_at)
               VALUES (?, ?, ?, ?, ?, 'pendente', ?)""",
            (phone, tipo[:40], titulo[:200], (descricao or "")[:1000] or None, due, now_s),
        )
        fid = int(cur.lastrowid or 0)
        row = c.execute("SELECT * FROM chat_followups WHERE id = ?", (fid,)).fetchone()
    registrar_evento(phone, "followup", f"Follow-up: {titulo}", descricao, {"followup_id": fid, "due_at": due})
    return dict(row) if row else {"id": fid}


def listar_followups(telefone: str, status: Optional[str] = None) -> list[dict]:
    ensure_schema()
    phone = normalize_phone(telefone)
    with _rw() as c:
        if status:
            rows = c.execute(
                """SELECT * FROM chat_followups WHERE telefone = ? AND status = ?
                   ORDER BY due_at ASC, id DESC""",
                (phone, status),
            ).fetchall()
        else:
            rows = c.execute(
                """SELECT * FROM chat_followups WHERE telefone = ?
                   ORDER BY CASE status WHEN 'pendente' THEN 0 ELSE 1 END, due_at ASC""",
                (phone,),
            ).fetchall()
    return [dict(r) for r in rows]


def atualizar_followup(followup_id: int, status: str) -> Optional[dict]:
    if status not in ("pendente", "feito", "cancelado"):
        raise ValueError("status inválido")
    ensure_schema()
    now = _now_sql()
    with _rw() as c:
        row = c.execute("SELECT * FROM chat_followups WHERE id = ?", (followup_id,)).fetchone()
        if not row:
            return None
        done = now if status in ("feito", "cancelado") else None
        c.execute(
            "UPDATE chat_followups SET status = ?, completed_at = ? WHERE id = ?",
            (status, done, followup_id),
        )
        out = dict(c.execute("SELECT * FROM chat_followups WHERE id = ?", (followup_id,)).fetchone())
    registrar_evento(
        out["telefone"],
        "followup",
        f"Follow-up {status}: {out.get('titulo')}",
        meta={"followup_id": followup_id, "status": status},
    )
    return out


def _auto_followups_on_stage(phone: str, stage: str, lead_score: Optional[int]) -> None:
    """Grava follow-ups automáticos conforme estágio do funil."""
    if stage == "agendamento":
        criar_followup(
            phone,
            "Confirmar consulta (D-1)",
            tipo="auto",
            descricao="Lembrete de confirmação antes da consulta.",
            due_hours=20,
        )
    elif stage == "followup":
        criar_followup(
            phone,
            "Check-in pós-atendimento",
            tipo="auto",
            descricao="Perguntar como está e oferecer retorno.",
            due_hours=48,
        )
    elif stage == "concluido" and (lead_score or 0) >= 4:
        criar_followup(
            phone,
            "Recuperação / indicação VIP",
            tipo="auto",
            descricao="Lead alto valor concluído — pedir indicação ou plano de manutenção.",
            due_hours=72,
        )
    elif stage == "humano" and (lead_score or 0) >= 3:
        criar_followup(
            phone,
            "Retomar conversa humana",
            tipo="auto",
            descricao="Paciente em atendimento humano com engajamento — não deixar esfriar.",
            due_hours=4,
        )


def upsert_wa_perfil(
    telefone: str,
    *,
    nome: Optional[str] = None,
    foto_url: Optional[str] = None,
    force: bool = False,
) -> dict[str, Any]:
    """Persiste nome/foto do WhatsApp na sessão e no paciente."""
    ensure_schema()
    phone = normalize_phone(telefone)
    if not phone:
        raise ValueError("telefone inválido")
    now = _now_sql()
    with _rw() as c:
        sess = c.execute(
            "SELECT wa_nome, wa_foto_url, perfil_atualizado_em FROM whatsapp_sessoes WHERE telefone = ?",
            (phone,),
        ).fetchone()
        if not sess:
            c.execute(
                """INSERT INTO whatsapp_sessoes
                   (telefone, modo, atendente, updated_at, wa_nome, wa_foto_url, perfil_atualizado_em)
                   VALUES (?, 'bot', NULL, ?, ?, ?, ?)""",
                (phone, now, (nome or None), (foto_url or None), now if (nome or foto_url) else None),
            )
        else:
            new_nome = nome if nome else sess["wa_nome"]
            new_foto = foto_url if foto_url else sess["wa_foto_url"]
            c.execute(
                """UPDATE whatsapp_sessoes SET
                     wa_nome = ?, wa_foto_url = ?, perfil_atualizado_em = ?, updated_at = ?
                   WHERE telefone = ?""",
                (new_nome, new_foto, now if (nome or foto_url or force) else sess["perfil_atualizado_em"], now, phone),
            )
        # paciente
        pid = resolver_paciente_id(c, phone)
        if pid and nome:
            row = c.execute("SELECT nome, wa_nome FROM pacientes WHERE id = ?", (pid,)).fetchone()
            # só sobrescreve nome se estiver vazio ou igual ao wa_nome antigo
            if row:
                cur_nome = (row["nome"] or "").strip()
                if not cur_nome or cur_nome == (row["wa_nome"] or "") or cur_nome.startswith("+") or cur_nome.isdigit():
                    c.execute(
                        "UPDATE pacientes SET nome = ?, wa_nome = ?, wa_foto_url = ?, wa_perfil_em = ? WHERE id = ?",
                        (nome[:200], nome[:200], foto_url, now, pid),
                    )
                else:
                    c.execute(
                        "UPDATE pacientes SET wa_nome = ?, wa_foto_url = COALESCE(?, wa_foto_url), wa_perfil_em = ? WHERE id = ?",
                        (nome[:200], foto_url, now, pid),
                    )
        elif not pid and nome:
            c.execute(
                """INSERT INTO pacientes (nome, telefone, whatsapp, origem, wa_nome, wa_foto_url, wa_perfil_em)
                   VALUES (?, ?, ?, 'whatsapp', ?, ?, ?)""",
                (nome[:200], phone, phone, nome[:200], foto_url, now),
            )
    if nome or foto_url:
        registrar_evento(
            phone,
            "perfil",
            "Perfil WhatsApp atualizado",
            detalhe=nome,
            meta={"foto": bool(foto_url)},
        )
    return get_modo(phone)


def refresh_wa_perfil(telefone: str, *, max_age_hours: int = 12) -> dict[str, Any]:
    """Busca nome/foto na Evolution se perfil estiver velho ou ausente."""
    ensure_schema()
    phone = normalize_phone(telefone)
    sess = get_modo(phone)
    idade = minutos_desde(sess.get("perfil_atualizado_em"))
    if (
        sess.get("wa_nome")
        and sess.get("perfil_atualizado_em")
        and idade is not None
        and idade < max_age_hours * 60
    ):
        return {"ok": True, "cached": True, "sessao": sess}
    try:
        from bridge_client import fetch_perfil_bridge

        ok, data = fetch_perfil_bridge(phone)
    except Exception as e:
        return {"ok": False, "error": str(e), "sessao": sess}
    if not ok:
        return {"ok": False, "error": data.get("error"), "sessao": sess}
    nome = data.get("nome") or data.get("name") or data.get("pushName")
    foto = data.get("foto_url") or data.get("profilePictureUrl")
    if nome or foto:
        sess = upsert_wa_perfil(phone, nome=nome, foto_url=foto, force=True)
        return {"ok": True, "cached": False, "sessao": sess, "raw": data}
    return {"ok": True, "cached": False, "empty": True, "sessao": sess, "raw": data}


def _parse_tags(raw: Any) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(t).strip() for t in data if str(t).strip()]
    except (TypeError, json.JSONDecodeError):
        pass
    return [t.strip() for t in str(raw).split(",") if t.strip()]


def _row_sess(row: Optional[sqlite3.Row], phone: str) -> dict[str, Any]:
    if not row:
        return _sess_defaults(phone)
    d = dict(row)
    d["tags"] = _parse_tags(d.get("tags"))
    d["prioridade"] = d.get("prioridade") or "media"
    d["stage_manual"] = int(d.get("stage_manual") or 0)
    return d


def get_modo(telefone: str) -> dict:
    ensure_schema()
    phone = normalize_phone(telefone)
    with _rw() as c:
        row = c.execute(
            """SELECT telefone, modo, atendente, updated_at, stage, prioridade,
                      notas_crm, tags, stage_manual, stage_updated_at,
                      rascunho_resposta, rascunho_origem, rascunho_updated_at,
                      wa_nome, wa_foto_url, perfil_atualizado_em,
                      lead_score, script_fluxo, script_passo
               FROM whatsapp_sessoes WHERE telefone = ?""",
            (phone,),
        ).fetchone()
    return _row_sess(row, phone)


def salvar_rascunho(
    telefone: str,
    mensagem: str,
    origem: str = "humano",
) -> dict[str, Any]:
    """HITL: rascunho de resposta WhatsApp (humano ou sugerido pelo agente)."""
    ensure_schema()
    phone = normalize_phone(telefone)
    if not phone:
        raise ValueError("telefone inválido")
    msg = (mensagem or "").strip()
    if not msg:
        raise ValueError("rascunho vazio")
    if origem not in ("humano", "agente", "sistema", "feedback"):
        origem = "humano"
    now = _now_sql()
    with _rw() as c:
        exists = c.execute(
            "SELECT telefone FROM whatsapp_sessoes WHERE telefone = ?",
            (phone,),
        ).fetchone()
        if not exists:
            c.execute(
                """INSERT INTO whatsapp_sessoes
                   (telefone, modo, atendente, updated_at, rascunho_resposta,
                    rascunho_origem, rascunho_updated_at)
                   VALUES (?, 'bot', NULL, ?, ?, ?, ?)""",
                (phone, now, msg[:4000], origem, now),
            )
        else:
            c.execute(
                """UPDATE whatsapp_sessoes SET
                     rascunho_resposta = ?, rascunho_origem = ?,
                     rascunho_updated_at = ?, updated_at = ?
                   WHERE telefone = ?""",
                (msg[:4000], origem, now, now, phone),
            )
    return get_modo(phone)


def limpar_rascunho(telefone: str) -> dict[str, Any]:
    ensure_schema()
    phone = normalize_phone(telefone)
    if not phone:
        raise ValueError("telefone inválido")
    now = _now_sql()
    with _rw() as c:
        c.execute(
            """UPDATE whatsapp_sessoes SET
                 rascunho_resposta = NULL, rascunho_origem = NULL,
                 rascunho_updated_at = NULL, updated_at = ?
               WHERE telefone = ?""",
            (now, phone),
        )
    return get_modo(phone)


def funil_version() -> str:
    """Fingerprint barato para long-poll / cache do funil."""
    ensure_schema()
    with _rw() as c:
        max_i = c.execute("SELECT COALESCE(MAX(id), 0) AS m FROM interacoes").fetchone()["m"]
        max_s = c.execute(
            "SELECT COALESCE(MAX(updated_at), '') AS m FROM whatsapp_sessoes"
        ).fetchone()["m"]
        n_sess = c.execute("SELECT COUNT(*) AS n FROM whatsapp_sessoes").fetchone()["n"]
        n_draft = c.execute(
            "SELECT COUNT(*) AS n FROM whatsapp_sessoes WHERE rascunho_resposta IS NOT NULL AND rascunho_resposta != ''"
        ).fetchone()["n"]
        stages_sig = c.execute(
            "SELECT COALESCE(GROUP_CONCAT(telefone || ':' || COALESCE(stage,'') || ':' || COALESCE(prioridade,'') || ':' || COALESCE(length(tags),0), '|'), '') AS s FROM whatsapp_sessoes"
        ).fetchone()["s"]
    return f"{int(max_i)}:{max_s}:{int(n_sess)}:{int(n_draft)}:{hash(stages_sig) & 0xFFFFFFFF}"


def set_modo(telefone: str, modo: str, atendente: Optional[str] = None) -> dict:
    if modo not in ("bot", "human"):
        raise ValueError("modo inválido")
    ensure_schema()
    phone = normalize_phone(telefone)
    if not phone:
        raise ValueError("telefone inválido")
    now = _now_sql()
    with _rw() as c:
        existing = c.execute(
            "SELECT stage, stage_manual FROM whatsapp_sessoes WHERE telefone = ?",
            (phone,),
        ).fetchone()
        stage = None
        stage_manual = 0
        if existing:
            stage_manual = int(existing["stage_manual"] or 0)
            stage = existing["stage"]
        # Auto: handoff humano/bot só move estágio se não for manual
        if not stage_manual:
            stage = "humano" if modo == "human" else "agente"
            stage_updated = now
        else:
            stage_updated = None
        if existing:
            if stage_updated:
                c.execute(
                    """UPDATE whatsapp_sessoes SET
                         modo = ?, atendente = ?, updated_at = ?,
                         stage = ?, stage_updated_at = ?
                       WHERE telefone = ?""",
                    (modo, atendente if modo == "human" else None, now, stage, stage_updated, phone),
                )
            else:
                c.execute(
                    """UPDATE whatsapp_sessoes SET
                         modo = ?, atendente = ?, updated_at = ?
                       WHERE telefone = ?""",
                    (modo, atendente if modo == "human" else None, now, phone),
                )
        else:
            c.execute(
                """INSERT INTO whatsapp_sessoes
                   (telefone, modo, atendente, updated_at, stage, prioridade, stage_manual, stage_updated_at)
                   VALUES (?, ?, ?, ?, ?, 'media', 0, ?)""",
                (phone, modo, atendente if modo == "human" else None, now, stage or "agente", now),
            )
    return get_modo(phone)


def infer_stage(
    *,
    modo: str,
    stage: Optional[str],
    stage_manual: int,
    total_msgs: int,
    ultima_classificacao: Optional[str],
    tem_agendamento_aberto: bool,
) -> str:
    """Resolve estágio efetivo do card (manual tem prioridade)."""
    if stage_manual and stage in STAGE_IDS:
        return stage  # type: ignore[return-value]
    if stage in STAGE_IDS and stage_manual:
        return stage  # type: ignore[return-value]
    if modo == "human":
        return "humano"
    if stage in STAGE_IDS and stage not in ("entrada", "agente", "humano"):
        # stages de funil comercial/clínico mantidos mesmo em modo bot
        return stage  # type: ignore[return-value]
    if tem_agendamento_aberto:
        return "agendamento"
    cls = (ultima_classificacao or "").lower()
    if any(k in cls for k in ("agend", "confirm", "consulta", "horario")):
        return "agendamento"
    if any(k in cls for k in ("follow", "orcamento", "orçamento", "pos", "pós", "retorno", "nps")):
        return "followup"
    if total_msgs <= 2:
        return "entrada"
    return "agente"


def atualizar_crm(
    telefone: str,
    *,
    stage: Optional[str] = None,
    prioridade: Optional[str] = None,
    notas_crm: Optional[str] = None,
    tags: Optional[list[str]] = None,
    clear_notas: bool = False,
    lead_score: Optional[int] = None,
    script_fluxo: Optional[str] = None,
    script_passo: Optional[int] = None,
    clear_script: bool = False,
) -> dict[str, Any]:
    ensure_schema()
    phone = normalize_phone(telefone)
    if not phone:
        raise ValueError("telefone inválido")
    if stage is not None and stage not in STAGE_IDS:
        raise ValueError(f"stage inválido: {stage}")
    if prioridade is not None and prioridade not in PRIORIDADES:
        raise ValueError(f"prioridade inválida: {prioridade}")
    if lead_score is not None and lead_score not in LEAD_SCORE_IDS:
        raise ValueError(f"lead_score inválido: {lead_score}")
    if script_fluxo is not None and script_fluxo not in SCRIPT_FLUXOS and script_fluxo != "":
        raise ValueError(f"script_fluxo inválido: {script_fluxo}")

    now = _now_sql()
    stage_changed = False
    score_changed = False
    with _rw() as c:
        cur = c.execute(
            """SELECT telefone, modo, atendente, stage, prioridade, notas_crm, tags,
                      stage_manual, stage_updated_at, lead_score, script_fluxo, script_passo
               FROM whatsapp_sessoes WHERE telefone = ?""",
            (phone,),
        ).fetchone()

        if not cur:
            modo = "bot"
            atendente = None
            old_stage = None
            stage_manual = 0
            stage_updated_at = None
            old_pri = "media"
            old_notas = None
            old_tags = None
            old_score = None
            old_fluxo = None
            old_passo = 0
            c.execute(
                """INSERT INTO whatsapp_sessoes
                   (telefone, modo, atendente, updated_at, stage, prioridade,
                    notas_crm, tags, stage_manual, stage_updated_at)
                   VALUES (?, 'bot', NULL, ?, NULL, 'media', NULL, NULL, 0, NULL)""",
                (phone, now),
            )
        else:
            modo = cur["modo"] or "bot"
            atendente = cur["atendente"]
            old_stage = cur["stage"]
            stage_manual = int(cur["stage_manual"] or 0)
            stage_updated_at = cur["stage_updated_at"]
            old_pri = cur["prioridade"] or "media"
            old_notas = cur["notas_crm"]
            old_tags = cur["tags"]
            old_score = cur["lead_score"]
            old_fluxo = cur["script_fluxo"]
            old_passo = int(cur["script_passo"] or 0)

        new_stage = stage if stage is not None else old_stage
        new_pri = prioridade if prioridade is not None else old_pri
        if clear_notas:
            new_notas = None
        elif notas_crm is not None:
            new_notas = notas_crm.strip()[:2000] or None
        else:
            new_notas = old_notas
        if tags is not None:
            clean_tags = [t.strip()[:40] for t in tags if t and str(t).strip()][:12]
            new_tags = json.dumps(clean_tags, ensure_ascii=False)
        else:
            new_tags = old_tags

        new_score = lead_score if lead_score is not None else old_score
        if clear_script:
            new_fluxo, new_passo = None, 0
        else:
            new_fluxo = script_fluxo if script_fluxo is not None else old_fluxo
            if script_fluxo == "":
                new_fluxo = None
            new_passo = script_passo if script_passo is not None else old_passo
            if new_fluxo and new_fluxo in SCRIPT_FLUXOS:
                max_p = len(SCRIPT_FLUXOS[new_fluxo]["passos"]) - 1
                new_passo = max(0, min(int(new_passo or 0), max_p))
            elif not new_fluxo:
                new_passo = 0

        # Qualquer stage explícito = decisão humana no funil
        if stage is not None:
            stage_manual = 1
            if stage != old_stage:
                stage_updated_at = now
                stage_changed = True
            if stage == "humano":
                modo = "human"
                atendente = atendente or "Atendente"
            elif stage in ("agente", "entrada"):
                modo = "bot"
                atendente = None

        if lead_score is not None and lead_score != old_score:
            score_changed = True

        c.execute(
            """UPDATE whatsapp_sessoes SET
                 modo = ?, atendente = ?,
                 stage = ?, prioridade = ?, notas_crm = ?, tags = ?,
                 stage_manual = ?, stage_updated_at = ?, updated_at = ?,
                 lead_score = ?, script_fluxo = ?, script_passo = ?
               WHERE telefone = ?""",
            (
                modo,
                atendente,
                new_stage,
                new_pri,
                new_notas,
                new_tags,
                stage_manual,
                stage_updated_at,
                now,
                new_score,
                new_fluxo,
                int(new_passo or 0),
                phone,
            ),
        )

    if stage_changed and new_stage:
        registrar_evento(phone, "stage", f"Estágio → {new_stage}", meta={"from": old_stage, "to": new_stage})
        try:
            _auto_followups_on_stage(phone, new_stage, new_score if isinstance(new_score, int) else None)
        except Exception:
            pass
    if score_changed:
        label = next((s["label"] for s in LEAD_SCORES if s["id"] == new_score), str(new_score))
        registrar_evento(phone, "lead_score", f"Qualidade do lead: {label}", meta={"score": new_score})
        if new_score and int(new_score) >= 4:
            try:
                criar_followup(
                    phone,
                    "Lead quente — fechar agenda",
                    tipo="auto",
                    descricao="Score alto: priorizar oferta de horário ou orçamento.",
                    due_hours=6,
                )
            except Exception:
                pass
    if script_fluxo is not None or script_passo is not None:
        registrar_evento(
            phone,
            "script",
            f"Script {new_fluxo or '—'} passo {int(new_passo or 0) + 1}",
            meta={"fluxo": new_fluxo, "passo": new_passo},
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


def is_bot_reply(row: dict | None) -> bool:
    if not row or (row.get("tipo") or "") != "reply":
        return False
    cls = (row.get("classificacao") or "").lower()
    return not cls.startswith("atendente:")


def get_interacao(interacao_id: int) -> dict | None:
    ensure_schema()
    with _rw() as c:
        row = c.execute(
            "SELECT * FROM interacoes WHERE id = ?", (int(interacao_id),)
        ).fetchone()
        return dict(row) if row else None


def _feedback_row_to_dict(row) -> dict:
    d = dict(row)
    return {
        "id": d.get("id"),
        "interacao_id": d.get("interacao_id"),
        "telefone": d.get("telefone"),
        "nota": d.get("nota"),
        "comentario": d.get("comentario"),
        "operador": d.get("operador"),
        "reescrita_texto": d.get("reescrita_texto"),
        "reescrita_em": d.get("reescrita_em"),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
    }


def get_message_feedback(interacao_id: int) -> dict | None:
    ensure_schema()
    with _rw() as c:
        row = c.execute(
            "SELECT * FROM message_feedback WHERE interacao_id = ?",
            (int(interacao_id),),
        ).fetchone()
        return _feedback_row_to_dict(row) if row else None


def feedback_map_for_ids(ids: list[int]) -> dict[int, dict]:
    if not ids:
        return {}
    ensure_schema()
    placeholders = ",".join("?" * len(ids))
    with _rw() as c:
        rows = c.execute(
            f"SELECT * FROM message_feedback WHERE interacao_id IN ({placeholders})",
            [int(i) for i in ids],
        ).fetchall()
    return {int(r["interacao_id"]): _feedback_row_to_dict(r) for r in rows}


def upsert_message_feedback(
    interacao_id: int,
    nota: int,
    comentario: str | None = None,
    operador: str | None = None,
) -> dict:
    ensure_schema()
    n = int(nota)
    if n < 1 or n > 5:
        raise ValueError("nota deve ser entre 1 e 5")
    inter = get_interacao(interacao_id)
    if not inter:
        raise ValueError("mensagem não encontrada")
    if not is_bot_reply(inter):
        raise ValueError("feedback só em respostas do bot")
    phone = normalize_phone(inter.get("telefone") or "")
    if not phone:
        raise ValueError("telefone inválido na mensagem")
    now = _now_sql()
    com = (comentario or "").strip()[:2000] or None
    op = (operador or "").strip()[:120] or None
    with _rw() as c:
        existing = c.execute(
            "SELECT id FROM message_feedback WHERE interacao_id = ?",
            (int(interacao_id),),
        ).fetchone()
        if existing:
            c.execute(
                """UPDATE message_feedback SET
                     nota = ?, comentario = ?, operador = COALESCE(?, operador),
                     updated_at = ?
                   WHERE interacao_id = ?""",
                (n, com, op, now, int(interacao_id)),
            )
        else:
            c.execute(
                """INSERT INTO message_feedback
                   (interacao_id, telefone, nota, comentario, operador, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (int(interacao_id), phone, n, com, op, now, now),
            )
    return get_message_feedback(interacao_id)  # type: ignore[return-value]


def set_feedback_rewrite(interacao_id: int, texto: str) -> dict:
    ensure_schema()
    t = (texto or "").strip()[:4000]
    if not t:
        raise ValueError("reescrita vazia")
    fb = get_message_feedback(interacao_id)
    if not fb:
        raise ValueError("salve o feedback antes de reescrever")
    now = _now_sql()
    with _rw() as c:
        c.execute(
            """UPDATE message_feedback SET
                 reescrita_texto = ?, reescrita_em = ?, updated_at = ?
               WHERE interacao_id = ?""",
            (t, now, now, int(interacao_id)),
        )
    return get_message_feedback(interacao_id)  # type: ignore[return-value]


def apply_message_rewrite(interacao_id: int, texto: str) -> dict[str, Any]:
    """Persists rewrite. Assumes texto already generated.
    Returns {feedback, texto, destino, reply_id?}.
    Simulador (TEST_CHAT_PHONE) → thread with teste:reescrita;
    CRM phone → rascunho origem feedback (never WhatsApp send).
    """
    inter = get_interacao(interacao_id)
    if not inter or not is_bot_reply(inter):
        raise ValueError("mensagem inválida")
    phone = normalize_phone(inter.get("telefone") or "")
    fb = set_feedback_rewrite(interacao_id, texto)
    if phone == TEST_CHAT_PHONE:
        reply_id = registrar_mensagem(
            phone, "reply", texto, classificacao="teste:reescrita"
        )
        return {
            "feedback": fb,
            "texto": texto,
            "destino": "thread",
            "reply_id": reply_id,
        }
    salvar_rascunho(phone, texto, origem="feedback")
    try:
        registrar_evento(
            phone,
            tipo="feedback_rewrite",
            titulo="Reescrita por feedback",
            detalhe=f"interacao_id={interacao_id}",
            meta={"interacao_id": interacao_id, "nota": fb.get("nota")},
        )
    except Exception:
        pass
    return {
        "feedback": get_message_feedback(interacao_id),
        "texto": texto,
        "destino": "rascunho",
        "reply_id": None,
    }


def ensure_test_paciente() -> int:
    """Garante paciente + sessão do chat de teste no CRM."""
    ensure_schema()
    phone = TEST_CHAT_PHONE
    with _rw() as c:
        row = c.execute(
            "SELECT id FROM pacientes WHERE telefone = ? OR whatsapp = ? ORDER BY id LIMIT 1",
            (phone, phone),
        ).fetchone()
        if row:
            pid = int(row["id"])
            c.execute(
                "UPDATE pacientes SET nome = ?, whatsapp = ?, telefone = ? WHERE id = ?",
                (TEST_CHAT_NOME, phone, phone, pid),
            )
        else:
            cur = c.execute(
                """INSERT INTO pacientes (nome, telefone, whatsapp, observacoes)
                   VALUES (?, ?, ?, ?)""",
                (
                    TEST_CHAT_NOME,
                    phone,
                    phone,
                    "Simulador: operador se passa por cliente no dashboard.",
                ),
            )
            pid = int(cur.lastrowid or 0)
        now = _now_sql()
        c.execute(
            """INSERT INTO whatsapp_sessoes (telefone, modo, atendente, updated_at)
               VALUES (?, 'bot', NULL, ?)
               ON CONFLICT(telefone) DO NOTHING""",
            (phone, now),
        )
        return pid


def limpar_chat_teste() -> int:
    """Apaga histórico do chat de teste; mantém paciente e sessão em modo bot."""
    ensure_test_paciente()
    phone = TEST_CHAT_PHONE
    with _rw() as c:
        c.execute(
            "DELETE FROM message_feedback WHERE telefone = ?", (phone,)
        )
        cur = c.execute("DELETE FROM interacoes WHERE telefone = ?", (phone,))
        deleted = int(cur.rowcount or 0)
    set_modo(phone, "bot", None)
    return deleted


def _proxima_consulta(c: sqlite3.Connection, paciente_id: Optional[int]) -> Optional[dict]:
    if not paciente_id:
        return None
    try:
        row = c.execute(
            """
            SELECT id, data, horario, status, procedimento, dentista
            FROM agendamentos
            WHERE paciente_id = ?
              AND status IN ('agendado','confirmado','remarcado','pendente')
              AND date(data) >= date('now', '-3 hours')
            ORDER BY data ASC, horario ASC
            LIMIT 1
            """,
            (paciente_id,),
        ).fetchone()
    except sqlite3.Error:
        return None
    return dict(row) if row else None


def _tem_agendamento_aberto(c: sqlite3.Connection, paciente_id: Optional[int]) -> bool:
    return _proxima_consulta(c, paciente_id) is not None


def listar_conversas(limit: int = 50) -> list[dict[str, Any]]:
    ensure_schema()
    with _rw() as c:
        rows = c.execute(
            """
            SELECT
              COALESCE(i.telefone, p.whatsapp, p.telefone) AS telefone,
              MAX(i.id) AS ultima_interacao_id,
              MAX(i.created_at) AS ultima_em,
              COUNT(i.id) AS total_msgs,
              SUM(CASE WHEN i.tipo = 'envio' THEN 1 ELSE 0 END) AS total_envios,
              SUM(CASE WHEN i.tipo = 'reply' THEN 1 ELSE 0 END) AS total_replies,
              MAX(p.id) AS paciente_id,
              MAX(p.nome) AS paciente_nome
            FROM interacoes i
            LEFT JOIN pacientes p ON i.paciente_id = p.id
            WHERE COALESCE(i.telefone, p.whatsapp, p.telefone) IS NOT NULL
              AND COALESCE(i.telefone, p.whatsapp, p.telefone) != ''
              AND COALESCE(i.telefone, p.whatsapp, p.telefone) != ?
            GROUP BY COALESCE(i.telefone, p.whatsapp, p.telefone)
            ORDER BY ultima_em DESC
            LIMIT ?
            """,
            (TEST_CHAT_PHONE, limit),
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            tel = normalize_phone(d.get("telefone") or "")
            if not tel or tel == TEST_CHAT_PHONE:
                continue
            ultima = c.execute(
                """
                SELECT id, tipo, mensagem, classificacao, created_at
                FROM interacoes
                WHERE telefone = ? OR paciente_id = ?
                ORDER BY id DESC LIMIT 1
                """,
                (tel, d.get("paciente_id")),
            ).fetchone()
            sess_row = c.execute(
                """SELECT telefone, modo, atendente, updated_at, stage, prioridade,
                          notas_crm, tags, stage_manual, stage_updated_at,
                          rascunho_resposta, rascunho_origem, rascunho_updated_at,
                          wa_nome, wa_foto_url, perfil_atualizado_em,
                          lead_score, script_fluxo, script_passo
                   FROM whatsapp_sessoes WHERE telefone = ?""",
                (tel,),
            ).fetchone()
            sess = _row_sess(sess_row, tel)
            pid = d.get("paciente_id")
            if pid is not None:
                try:
                    pid = int(pid)
                except (TypeError, ValueError):
                    pid = None
            # enriquece nome/foto do paciente se sessão vazia
            if pid and (not sess.get("wa_nome") or not sess.get("wa_foto_url")):
                prow = c.execute(
                    "SELECT nome, wa_nome, wa_foto_url FROM pacientes WHERE id = ?",
                    (pid,),
                ).fetchone()
                if prow:
                    if not sess.get("wa_nome"):
                        sess["wa_nome"] = prow["wa_nome"] or None
                    if not sess.get("wa_foto_url") and prow["wa_foto_url"]:
                        sess["wa_foto_url"] = prow["wa_foto_url"]
            prox = _proxima_consulta(c, pid)
            total_msgs = int(d.get("total_msgs") or 0)
            ultima_cls = ultima["classificacao"] if ultima else None
            ultima_tipo = ultima["tipo"] if ultima else None
            ultima_msg = (ultima["mensagem"] if ultima else "") or ""
            ultima_em = (ultima["created_at"] if ultima else None) or d.get("ultima_em")
            stage = infer_stage(
                modo=sess["modo"],
                stage=sess.get("stage"),
                stage_manual=int(sess.get("stage_manual") or 0),
                total_msgs=total_msgs,
                ultima_classificacao=ultima_cls,
                tem_agendamento_aberto=prox is not None,
            )
            display = (
                sess.get("wa_nome")
                or d.get("paciente_nome")
                or None
            )
            fu_pend = c.execute(
                """SELECT COUNT(*) AS n FROM chat_followups
                   WHERE telefone = ? AND status = 'pendente'""",
                (tel,),
            ).fetchone()
            n_fu = int(fu_pend["n"] if fu_pend else 0)
            # Persistir estágio inferido se sessão sem stage (shared state)
            if not sess.get("stage") and not int(sess.get("stage_manual") or 0):
                now = _now_sql()
                c.execute(
                    """INSERT INTO whatsapp_sessoes
                       (telefone, modo, atendente, updated_at, stage, prioridade, stage_manual, stage_updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                       ON CONFLICT(telefone) DO UPDATE SET
                         stage = COALESCE(whatsapp_sessoes.stage, excluded.stage),
                         stage_updated_at = COALESCE(whatsapp_sessoes.stage_updated_at, excluded.stage_updated_at),
                         updated_at = excluded.updated_at""",
                    (
                        tel,
                        sess["modo"],
                        sess.get("atendente"),
                        now,
                        stage,
                        sess.get("prioridade") or "media",
                        now,
                    ),
                )

            # Aguardando = última msg do paciente (envio), independente do modo
            aguardando = ultima_tipo == "envio"
            minutos = minutos_desde(ultima_em) if aguardando else None
            pri = sess.get("prioridade") or "media"
            sla = sla_status_for(aguardando=bool(aguardando), minutos=minutos, prioridade=pri)
            rascunho = sess.get("rascunho_resposta")
            out.append(
                {
                    "telefone": tel,
                    "paciente_id": pid,
                    "paciente_nome": display or d.get("paciente_nome"),
                    "wa_nome": sess.get("wa_nome"),
                    "wa_foto_url": sess.get("wa_foto_url"),
                    "perfil_atualizado_em": sess.get("perfil_atualizado_em"),
                    "lead_score": sess.get("lead_score"),
                    "script_fluxo": sess.get("script_fluxo"),
                    "script_passo": int(sess.get("script_passo") or 0),
                    "followups_pendentes": n_fu,
                    "ultima_interacao_id": d.get("ultima_interacao_id"),
                    "ultima_em": ultima_em or d.get("ultima_em"),
                    "total_msgs": total_msgs,
                    "total_envios": int(d.get("total_envios") or 0),
                    "total_replies": int(d.get("total_replies") or 0),
                    "modo": sess["modo"],
                    "atendente": sess.get("atendente"),
                    "stage": stage,
                    "prioridade": pri,
                    "notas_crm": sess.get("notas_crm"),
                    "tags": sess.get("tags") or [],
                    "stage_manual": int(sess.get("stage_manual") or 0),
                    "ultima_mensagem": ultima_msg[:180],
                    "ultima_tipo": ultima_tipo,
                    "ultima_classificacao": ultima_cls,
                    "aguardando_resposta": bool(aguardando),
                    "minutos_espera": minutos,
                    "sla_status": sla,
                    "rascunho_resposta": rascunho,
                    "rascunho_origem": sess.get("rascunho_origem"),
                    "rascunho_updated_at": sess.get("rascunho_updated_at"),
                    "tem_rascunho": bool(rascunho),
                    "proxima_consulta": prox,
                    "is_teste": False,
                }
            )
        # prioridade alta primeiro, depois recência
        pri_rank = {"alta": 0, "media": 1, "baixa": 2}
        out.sort(
            key=lambda x: (
                0 if x.get("aguardando_resposta") else 1,
                pri_rank.get(x.get("prioridade") or "media", 1),
                x.get("ultima_em") or "",
            ),
            reverse=False,
        )
        # re-sort: aguardando first, then by ultima_em desc within same bucket — fix:
        out.sort(
            key=lambda x: (
                0 if x.get("aguardando_resposta") else 1,
                pri_rank.get(x.get("prioridade") or "media", 1),
                # invert time via negative not possible on str — use secondary reverse
            )
        )
        # Stable secondary by ultima_em DESC
        buckets: dict[tuple, list] = {}
        for item in out:
            key = (
                0 if item.get("aguardando_resposta") else 1,
                pri_rank.get(item.get("prioridade") or "media", 1),
            )
            buckets.setdefault(key, []).append(item)
        ordered = []
        for key in sorted(buckets.keys()):
            group = buckets[key]
            group.sort(key=lambda x: x.get("ultima_em") or "", reverse=True)
            ordered.extend(group)
        return ordered


def resumo_crm(conversas: Optional[list[dict]] = None) -> dict[str, Any]:
    items = conversas if conversas is not None else listar_conversas(limit=100)
    por_stage = {s["id"]: 0 for s in STAGES}
    aguardando = 0
    humano = 0
    alta = 0
    sla_critico = 0
    sla_atencao = 0
    com_rascunho = 0
    for c in items:
        st = c.get("stage") or "entrada"
        if st in por_stage:
            por_stage[st] += 1
        if c.get("aguardando_resposta"):
            aguardando += 1
        if c.get("modo") == "human":
            humano += 1
        if c.get("prioridade") == "alta":
            alta += 1
        if c.get("sla_status") == "critico":
            sla_critico += 1
        elif c.get("sla_status") == "atencao":
            sla_atencao += 1
        if c.get("tem_rascunho"):
            com_rascunho += 1
    return {
        "total": len(items),
        "por_stage": por_stage,
        "aguardando_resposta": aguardando,
        "em_humano": humano,
        "prioridade_alta": alta,
        "sla_critico": sla_critico,
        "sla_atencao": sla_atencao,
        "com_rascunho": com_rascunho,
        "sla_atencao_min": SLA_ATENCAO_MIN,
        "sla_critico_min": SLA_CRITICO_MIN,
        "tag_presets": TAG_PRESETS,
        "lead_scores": LEAD_SCORES,
        "script_fluxos": list(SCRIPT_FLUXOS.values()),
        "stages": STAGES,
        "version": funil_version(),
    }


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
        msgs = [dict(r) for r in rows]
    fmap = feedback_map_for_ids([int(m["id"]) for m in msgs if m.get("id") is not None])
    for m in msgs:
        m["feedback"] = fmap.get(int(m["id"])) if m.get("id") is not None else None
    return msgs