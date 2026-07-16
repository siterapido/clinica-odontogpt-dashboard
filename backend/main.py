from fastapi import FastAPI, Query, HTTPException, Depends, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import json
from database import query, query_one
from auth import require_auth, create_token, revoke_token, DASH_PASSWORD
from models import (
    LoginRequest,
    LoginResponse,
    PacienteCreate,
    PacienteUpdate,
    AgendamentoCreate,
    AgendamentoUpdate,
    ProntuarioCreate,
    ProntuarioUpdate,
    ChatEnviarBody,
    ChatAssumirBody,
    AgentChatBody,
    EstudantesChatBody,
    VisionAnalyzeBody,
)
from crm_service import get_crm, crm_error_to_http
import chat_store
from bridge_client import send_text as bridge_send_text
from chat_store import normalize_phone
import agent_store
from hermes_agent_client import ask_admin, admin_session_id, ask_student, ask_vision, estudante_session_id, vision_session_id
from insights_service import clinic_briefing, QUICK_PROMPTS
import media_service
from media_service import save_upload, resolve_upload, file_to_agent_parts, meta_json

app = FastAPI(title="OdontoGPT Dashboard API", version="1.5.0")


@app.on_event("startup")
def _startup_chat_schema():
    chat_store.ensure_schema()
    agent_store.ensure_schema()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Autenticação ───────────────────────────────────────────────────

@app.post("/api/login", response_model=LoginResponse)
def login(body: LoginRequest):
    if not body.password or body.password != DASH_PASSWORD:
        raise HTTPException(status_code=401, detail="Senha incorreta")
    return {"token": create_token()}


@app.post("/api/logout")
def logout_endpoint(authorization: str = Header(default=None)):
    """Invalida o token atual (revoga sessão no servidor)."""
    revoked = revoke_token(authorization) if authorization else False
    return {"status": "ok", "revoked": revoked}


# ─── Métricas ───────────────────────────────────────────────────────

@app.get("/api/metricas", dependencies=[Depends(require_auth)])
def get_metricas():
    total_pacientes = query_one("SELECT COUNT(*) as total FROM pacientes")["total"]
    total_agendamentos = query_one("SELECT COUNT(*) as total FROM agendamentos")["total"]
    agendamentos_hoje = query_one(
        "SELECT COUNT(*) as total FROM agendamentos WHERE data = date('now', '-3 hours')"
    )["total"]
    agendamentos_pendentes = query_one(
        "SELECT COUNT(*) as total FROM agendamentos WHERE status IN ('agendado','confirmado')"
    )["total"]
    total_prontuarios = query_one("SELECT COUNT(*) as total FROM prontuario")["total"]
    pacientes_ativos = query_one(
        "SELECT COUNT(*) as total FROM (SELECT DISTINCT paciente_id FROM agendamentos WHERE data >= date('now', '-3 hours', '-90 days'))"
    )["total"]
    lembretes_pendentes = query_one(
        "SELECT COUNT(*) as total FROM lembretes WHERE status = 'pendente'"
    )["total"]
    lembretes_falhos = query_one(
        "SELECT COUNT(*) as total FROM lembretes WHERE status = 'falhou'"
    )["total"]
    ultimos_agendamentos = query(
        """SELECT a.id, a.paciente_id, p.nome as paciente_nome, a.data, a.horario, a.status, a.procedimento
           FROM agendamentos a
           LEFT JOIN pacientes p ON a.paciente_id = p.id
           ORDER BY a.created_at DESC LIMIT 5"""
    )
    return {
        "total_pacientes": total_pacientes,
        "total_agendamentos": total_agendamentos,
        "agendamentos_hoje": agendamentos_hoje,
        "agendamentos_pendentes": agendamentos_pendentes,
        "total_prontuarios": total_prontuarios,
        "pacientes_ativos_90d": pacientes_ativos,
        "lembretes_pendentes": lembretes_pendentes,
        "lembretes_falhos": lembretes_falhos,
        "ultimos_agendamentos": ultimos_agendamentos,
    }


# ─── Dentistas (filtro) ─────────────────────────────────────────────

@app.get("/api/dentistas", dependencies=[Depends(require_auth)])
def listar_dentistas():
    rows = query(
        """SELECT DISTINCT dentista as nome FROM agendamentos
           WHERE dentista IS NOT NULL AND TRIM(dentista) != ''
           UNION
           SELECT DISTINCT dentista as nome FROM prontuario
           WHERE dentista IS NOT NULL AND TRIM(dentista) != ''
           ORDER BY nome ASC"""
    )
    return {"data": [r["nome"] for r in rows]}


# ─── Pacientes ──────────────────────────────────────────────────────

@app.get("/api/pacientes", dependencies=[Depends(require_auth)])
def listar_pacientes(
    busca: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sql = "SELECT * FROM pacientes"
    params: list = []
    if busca:
        sql += " WHERE nome LIKE ? OR telefone LIKE ? OR whatsapp LIKE ?"
        params = [f"%{busca}%", f"%{busca}%", f"%{busca}%"]
    sql += " ORDER BY nome ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    pacientes = query(sql, tuple(params))
    count_sql = "SELECT COUNT(*) as total FROM pacientes"
    count_params: list = []
    if busca:
        count_sql += " WHERE nome LIKE ? OR telefone LIKE ? OR whatsapp LIKE ?"
        count_params = [f"%{busca}%", f"%{busca}%", f"%{busca}%"]
    total = query_one(count_sql, tuple(count_params))["total"]
    return {"data": pacientes, "total": total, "limit": limit, "offset": offset}


@app.get("/api/pacientes/{paciente_id}", dependencies=[Depends(require_auth)])
def get_paciente(paciente_id: int):
    paciente = query_one("SELECT * FROM pacientes WHERE id = ?", (paciente_id,))
    if not paciente:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    agendamentos = query(
        """SELECT * FROM agendamentos
           WHERE paciente_id = ?
           ORDER BY data DESC, horario DESC LIMIT 20""",
        (paciente_id,),
    )
    prontuarios = query(
        """SELECT * FROM prontuario
           WHERE paciente_id = ?
           ORDER BY data_atendimento DESC LIMIT 20""",
        (paciente_id,),
    )
    ultimas_interacoes = query(
        """SELECT id, tipo, mensagem, classificacao, created_at FROM interacoes
           WHERE paciente_id = ?
           ORDER BY created_at DESC LIMIT 3""",
        (paciente_id,),
    )
    paciente["agendamentos"] = agendamentos
    paciente["prontuarios"] = prontuarios
    paciente["ultimas_interacoes"] = ultimas_interacoes
    return paciente


@app.post("/api/pacientes", dependencies=[Depends(require_auth)])
def criar_paciente(body: PacienteCreate):
    try:
        crm = get_crm()
        row = crm.criar_paciente(
            body.nome, body.telefone, body.data_nascimento, body.indicacao, body.observacoes
        )
        return row
    except Exception as e:
        raise HTTPException(status_code=400, detail=crm_error_to_http(e))


@app.patch("/api/pacientes/{paciente_id}", dependencies=[Depends(require_auth)])
def atualizar_paciente(paciente_id: int, body: PacienteUpdate):
    try:
        crm = get_crm()
        data = body.model_dump(exclude_unset=True)
        return crm.atualizar_paciente(paciente_id, **data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=crm_error_to_http(e))


# ─── Agendamentos ───────────────────────────────────────────────────

@app.get("/api/agendamentos", dependencies=[Depends(require_auth)])
def listar_agendamentos(
    status: Optional[str] = Query(None),
    data: Optional[str] = Query(None),
    dentista: Optional[str] = Query(None),
    de: Optional[str] = Query(None, description="Data inicial (inclusive) YYYY-MM-DD"),
    ate: Optional[str] = Query(None, description="Data final (inclusive) YYYY-MM-DD"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sql = """SELECT a.*, p.nome as paciente_nome, p.telefone
             FROM agendamentos a
             LEFT JOIN pacientes p ON a.paciente_id = p.id
             WHERE 1=1"""
    params: list = []
    if status:
        sql += " AND a.status = ?"; params.append(status)
    if data:
        sql += " AND a.data = ?"; params.append(data)
    if dentista:
        sql += " AND a.dentista = ?"; params.append(dentista)
    if de:
        sql += " AND a.data >= ?"; params.append(de)
    if ate:
        sql += " AND a.data <= ?"; params.append(ate)
    sql += " ORDER BY a.data DESC, a.horario DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = query(sql, tuple(params))
    # total
    csql = "SELECT COUNT(*) as total FROM agendamentos a WHERE 1=1"
    cparams: list = []
    if status: csql += " AND a.status = ?"; cparams.append(status)
    if data: csql += " AND a.data = ?"; cparams.append(data)
    if dentista: csql += " AND a.dentista = ?"; cparams.append(dentista)
    if de: csql += " AND a.data >= ?"; cparams.append(de)
    if ate: csql += " AND a.data <= ?"; cparams.append(ate)
    total = query_one(csql, tuple(cparams))["total"]
    return {"data": rows, "total": total, "limit": limit, "offset": offset}


@app.post("/api/agendamentos", dependencies=[Depends(require_auth)])
def criar_agendamento(body: AgendamentoCreate):
    try:
        crm = get_crm()
        aid = crm.criar_agendamento(
            body.paciente_id, body.data, body.horario, body.procedimento, body.dentista
        )
        row = query_one("SELECT * FROM agendamentos WHERE id = ?", (aid,))
        return row or {"id": aid, "ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=crm_error_to_http(e))


@app.patch("/api/agendamentos/{agendamento_id}", dependencies=[Depends(require_auth)])
def atualizar_agendamento(agendamento_id: int, body: AgendamentoUpdate):
    try:
        crm = get_crm()
        data = body.model_dump(exclude_unset=True)
        ok = crm.atualizar_agendamento(agendamento_id, **data)
        if not ok:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        return query_one("SELECT * FROM agendamentos WHERE id = ?", (agendamento_id,))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=crm_error_to_http(e))


# ─── Prontuários ────────────────────────────────────────────────────

@app.get("/api/prontuarios", dependencies=[Depends(require_auth)])
def listar_prontuarios(
    paciente_id: Optional[int] = Query(None),
    dentista: Optional[str] = Query(None),
    de: Optional[str] = Query(None),
    ate: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sql = """SELECT pr.*, p.nome as paciente_nome
             FROM prontuario pr
             LEFT JOIN pacientes p ON pr.paciente_id = p.id
             WHERE 1=1"""
    params: list = []
    if paciente_id: sql += " AND pr.paciente_id = ?"; params.append(paciente_id)
    if dentista: sql += " AND pr.dentista = ?"; params.append(dentista)
    if de: sql += " AND pr.data_atendimento >= ?"; params.append(de)
    if ate: sql += " AND pr.data_atendimento <= ?"; params.append(ate)
    sql += " ORDER BY pr.data_atendimento DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = query(sql, tuple(params))
    csql = "SELECT COUNT(*) as total FROM prontuario pr WHERE 1=1"
    cparams: list = []
    if paciente_id: csql += " AND pr.paciente_id = ?"; cparams.append(paciente_id)
    if dentista: csql += " AND pr.dentista = ?"; cparams.append(dentista)
    if de: csql += " AND pr.data_atendimento >= ?"; cparams.append(de)
    if ate: csql += " AND pr.data_atendimento <= ?"; cparams.append(ate)
    total = query_one(csql, tuple(cparams))["total"]
    return {"data": rows, "total": total, "limit": limit, "offset": offset}


@app.post("/api/prontuarios", dependencies=[Depends(require_auth)])
def criar_prontuario(body: ProntuarioCreate):
    try:
        crm = get_crm()
        pid = crm.registrar_atendimento(
            body.paciente_id,
            body.procedimento,
            body.data_atendimento,
            body.dentista,
            body.queixa_principal,
            body.exame_clinico,
            body.diagnostico,
            body.plano_tratamento,
            body.observacoes,
            body.proximo_retorno_dias,
        )
        row = query_one("SELECT * FROM prontuario WHERE id = ?", (pid,))
        return row or {"id": pid, "ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=crm_error_to_http(e))


@app.patch("/api/prontuarios/{prontuario_id}", dependencies=[Depends(require_auth)])
def atualizar_prontuario(prontuario_id: int, body: ProntuarioUpdate):
    try:
        crm = get_crm()
        data = body.model_dump(exclude_unset=True)
        ok = crm.atualizar_prontuario(prontuario_id, **data)
        if not ok:
            raise HTTPException(status_code=404, detail="Prontuário não encontrado")
        return query_one("SELECT * FROM prontuario WHERE id = ?", (prontuario_id,))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=crm_error_to_http(e))


# ─── Chat atendente (WhatsApp) ──────────────────────────────────────

@app.get("/api/chat/conversas", dependencies=[Depends(require_auth)])
def chat_listar_conversas(limit: int = Query(50, ge=1, le=100)):
    return {"data": chat_store.listar_conversas(limit=limit)}


@app.get("/api/chat/conversas/{telefone}/mensagens", dependencies=[Depends(require_auth)])
def chat_mensagens(
    telefone: str,
    after_id: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=300),
):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    return {
        "telefone": phone,
        "sessao": chat_store.get_modo(phone),
        "data": chat_store.listar_mensagens(phone, limit=limit, after_id=after_id),
    }


@app.post("/api/chat/conversas/{telefone}/assumir", dependencies=[Depends(require_auth)])
def chat_assumir(telefone: str, body: ChatAssumirBody):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    sess = chat_store.set_modo(phone, "human", body.atendente.strip())
    return {"ok": True, "sessao": sess}


@app.post("/api/chat/conversas/{telefone}/devolver", dependencies=[Depends(require_auth)])
def chat_devolver(telefone: str):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    sess = chat_store.set_modo(phone, "bot", None)
    return {"ok": True, "sessao": sess}


@app.post("/api/chat/conversas/{telefone}/enviar", dependencies=[Depends(require_auth)])
def chat_enviar(telefone: str, body: ChatEnviarBody):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    sess = chat_store.get_modo(phone)
    if sess.get("modo") != "human":
        raise HTTPException(
            status_code=409,
            detail="Assuma a conversa antes de enviar mensagens (modo atendente humano).",
        )
    atendente = (body.atendente or sess.get("atendente") or "Atendente").strip()
    ok, info = bridge_send_text(phone, body.mensagem, atendente)
    if not ok:
        raise HTTPException(status_code=502, detail=info)
    return {"ok": True, "bridge": info}


# ─── Chat administrador (agente Hermes) ─────────────────────────────

@app.get("/api/agent/mensagens", dependencies=[Depends(require_auth)])
def agent_listar_mensagens(
    operador: str = Query("Gerente"),
    after_id: int = Query(0, ge=0),
    limit: int = Query(80, ge=1, le=200),
):
    sid = admin_session_id(operador)
    return {"session_id": sid, "data": agent_store.list_messages(sid, limit=limit, after_id=after_id)}


@app.get("/api/agent/briefing", dependencies=[Depends(require_auth)])
def agent_briefing():
    b = clinic_briefing()
    return {"briefing": b, "quick_prompts": QUICK_PROMPTS}


@app.post("/api/agent/upload", dependencies=[Depends(require_auth)])
async def agent_upload(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        meta = save_upload(file.filename or "anexo", raw, file.content_type)
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    return {"ok": True, "anexo": json.loads(meta_json(meta))}


@app.post("/api/agent/chat", dependencies=[Depends(require_auth)])
def agent_chat(body: AgentChatBody):
    sid = admin_session_id(body.operador or "Gerente")
    text = (body.mensagem or "").strip()
    anexos = body.anexos_ids or []
    if not text and not anexos:
        raise HTTPException(status_code=400, detail="Mensagem ou anexo obrigatório")

    metrics_hint = None
    if body.incluir_metricas:
        try:
            m = get_metricas()
            b = clinic_briefing()
            metrics_hint = (
                f"pacientes={m.get('total_pacientes')} agendamentos_hoje={m.get('agendamentos_hoje')} "
                f"pendentes={m.get('agendamentos_pendentes')} lembretes_pendentes={m.get('lembretes_pendentes')} "
                f"lembretes_falhos={m.get('lembretes_falhos')} inativos_120d={b.get('pacientes_sem_retorno_120d')}"
            )
        except Exception:
            metrics_hint = None

    attach_meta: list[dict] = []
    content_parts: list = []
    for aid in anexos[:5]:
        meta = resolve_upload(aid)
        if not meta:
            raise HTTPException(status_code=404, detail=f"Anexo {aid} não encontrado")
        attach_meta.append(json.loads(meta_json(meta)))
        content_parts.extend(file_to_agent_parts(meta))

    display_user = text or "(anexos enviados)"
    if attach_meta:
        names = ", ".join(a["filename"] for a in attach_meta)
        display_user = f"{display_user}\n📎 {names}".strip()

    agent_store.append(sid, "user", display_user, meta={"anexos": attach_meta} if attach_meta else None)
    history = agent_store.history_for_llm(sid, max_turns=10)
    # última msg user já in history via append — remover duplicata se presente
    if history and history[-1]["role"] == "user":
        history = history[:-1]

    ok, answer = ask_admin(
        sid,
        text,
        metrics_hint=metrics_hint,
        history=history,
        content_parts=content_parts if content_parts else None,
    )
    if not ok:
        raise HTTPException(status_code=502, detail=answer)
    agent_store.append(sid, "assistant", answer)
    return {"ok": True, "resposta": answer, "session_id": sid}


# ─── Interações (conversa WhatsApp) ─────────────────────────────────

@app.get("/api/interacoes", dependencies=[Depends(require_auth)])
def listar_interacoes(
    paciente_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sql = """SELECT i.*, p.nome as paciente_nome, p.telefone
             FROM interacoes i
             LEFT JOIN pacientes p ON i.paciente_id = p.id
             WHERE 1=1"""
    params: list = []
    if paciente_id: sql += " AND i.paciente_id = ?"; params.append(paciente_id)
    sql += " ORDER BY i.created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = query(sql, tuple(params))
    csql = "SELECT COUNT(*) as total FROM interacoes"
    cparams: list = []
    if paciente_id: csql += " WHERE paciente_id = ?"; cparams.append(paciente_id)
    total = query_one(csql, tuple(cparams))["total"]
    return {"data": rows, "total": total, "limit": limit, "offset": offset}


# ─── Lembretes (saúde do WhatsApp) ──────────────────────────────────

@app.get("/api/lembretes", dependencies=[Depends(require_auth)])
def listar_lembretes(
    status: Optional[str] = Query(None),
    tipo: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sql = """SELECT l.*, p.nome as paciente_nome, p.telefone
             FROM lembretes l
             LEFT JOIN pacientes p ON l.paciente_id = p.id
             WHERE 1=1"""
    params: list = []
    if status: sql += " AND l.status = ?"; params.append(status)
    if tipo: sql += " AND l.tipo = ?"; params.append(tipo)
    sql += " ORDER BY l.data_envio DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    rows = query(sql, tuple(params))
    csql = "SELECT COUNT(*) as total FROM lembretes l WHERE 1=1"
    cparams: list = []
    if status: csql += " AND l.status = ?"; cparams.append(status)
    if tipo: csql += " AND l.tipo = ?"; cparams.append(tipo)
    total = query_one(csql, tuple(cparams))["total"]
    return {"data": rows, "total": total, "limit": limit, "offset": offset}


# ─── Health Check ───────────────────────────────────────────────────



@app.get("/api/estudantes/mensagens", dependencies=[Depends(require_auth)])
def estudantes_mensagens(
    aluno: str = Query("Estudante", max_length=120),
    after_id: int = Query(0, ge=0),
    limit: int = Query(120, ge=1, le=200),
):
    sid = estudante_session_id(aluno)
    return {"session_id": sid, "data": agent_store.list_messages(sid, limit=limit, after_id=after_id)}


@app.post("/api/estudantes/chat", dependencies=[Depends(require_auth)])
def estudantes_chat(body: EstudantesChatBody):
    aluno = (body.aluno or "Estudante").strip() or "Estudante"
    sid = estudante_session_id(aluno)
    texto = (body.mensagem or "").strip()
    attach_meta = []
    content_parts = []
    for aid in (body.anexos_ids or [])[:5]:
        meta = resolve_upload(aid)
        if not meta:
            raise HTTPException(404, f"anexo não encontrado: {aid}")
        attach_meta.append(meta_json(meta))
        content_parts.extend(file_to_agent_parts(meta))
    if not texto and not content_parts:
        raise HTTPException(400, "mensagem ou anexo obrigatório")
    display_user = texto or "(anexos)"
    agent_store.append(sid, "user", display_user, meta={"anexos": attach_meta} if attach_meta else None)
    history = agent_store.history_for_llm(sid, max_turns=10)
    ok, answer = ask_student(sid, texto, history=history[:-1] if history else None, content_parts=content_parts or None)
    if not ok:
        raise HTTPException(502, answer)
    agent_store.append(sid, "assistant", answer)
    return {"ok": True, "resposta": answer, "session_id": sid}


@app.post("/api/vision/analyze", dependencies=[Depends(require_auth)])
def vision_analyze(body: VisionAnalyzeBody):
    op = (body.operador or "Estudante").strip() or "Estudante"
    sid = vision_session_id(op)
    ctx = (body.contexto_clinico or "").strip()
    user_note = ctx or "Análise de imagem (Odonto Vision)"
    agent_store.append(sid, "user", user_note[:8000])
    history = agent_store.history_for_llm(sid, max_turns=6)
    ok, answer = ask_vision(sid, body.imagem_data_url, clinical_context=ctx, history=history[:-1] if history else None)
    if not ok:
        raise HTTPException(502, answer)
    agent_store.append(sid, "assistant", answer)
    return {"ok": True, "analise": answer, "session_id": sid, "disclaimer": "Análise assistiva educacional — não substitui laudo profissional."}

@app.get("/api/health")
def health():
    try:
        db_test = query_one("SELECT COUNT(*) as total FROM pacientes")
        return {"status": "ok", "db": "conectado", "total_pacientes": db_test["total"]}
    except Exception as e:
        return {"status": "error", "db": str(e)}
