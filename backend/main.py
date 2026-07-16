from fastapi import FastAPI, Query, HTTPException, Depends, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from pathlib import Path
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
    ChatTesteBody,
    ClinicaBody,
    DentistaBody,
    DentistaUpdateBody,
    AgentChatBody,
    AgentPreferenciasBody,
    EstudantesChatBody,
    VisionAnalyzeBody,
    OrcamentoCreateBody,
    OrcamentoStatusBody,
    PagamentoBody,
    ListaEsperaBody,
    ListaEsperaStatusBody,
    ProcedimentoBody,
    NpsBody,
    ConfirmAgendamentoBody,
)
from crm_service import get_crm, crm_error_to_http
from v2_service import get_v2, err_msg as v2_err
import chat_store
from bridge_client import send_text as bridge_send_text
from chat_store import normalize_phone, TEST_CHAT_PHONE, TEST_CHAT_NOME
import agent_store
import clinic_config
import dentistas_store
from hermes_agent_client import (
    ask_admin,
    admin_session_id,
    ask_student,
    ask_vision,
    ask_patient,
    patient_session_id,
    estudante_session_id,
    vision_session_id,
)
from insights_service import clinic_briefing, QUICK_PROMPTS
import media_service
from media_service import save_upload, resolve_upload, file_to_agent_parts, meta_json

app = FastAPI(title="OdontoGPT Dashboard API", version="2.0.0")


@app.on_event("startup")
def _startup_chat_schema():
    chat_store.ensure_schema()
    agent_store.ensure_schema()
    try:
        clinic_config.ensure_schema()
    except Exception:
        pass
    try:
        dentistas_store.ensure_schema()
    except Exception:
        pass
    try:
        chat_store.ensure_test_paciente()
    except Exception:
        pass

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


# ─── Cadastro da clínica ────────────────────────────────────────────

@app.get("/api/clinica", dependencies=[Depends(require_auth)])
def get_clinica():
    return {"data": clinic_config.get_clinica()}


@app.put("/api/clinica", dependencies=[Depends(require_auth)])
def put_clinica(body: ClinicaBody):
    payload = body.model_dump(exclude_unset=True)
    data = clinic_config.update_clinica(payload)
    return {"ok": True, "data": data}


@app.get("/api/operacao", dependencies=[Depends(require_auth)])
def status_operacao():
    """Checklist da operação da clínica no dashboard (sem expor stack interna)."""
    clinica = clinic_config.get_clinica()
    dentistas = dentistas_store.listar(incluir_inativos=False)
    com_grade = sum(1 for d in dentistas if any(h.get("ativo") for h in (d.get("horarios") or [])))

    nome_ok = bool((clinica.get("clinica_nome") or "").strip()) and (
        clinica.get("clinica_nome") or ""
    ).strip().lower() not in ("sua clínica odontológica", "sua clinica odontologica")
    end_ok = bool((clinica.get("clinica_endereco") or "").strip())
    horario_ok = bool(clinica.get("horario_comercial_inicio") and clinica.get("horario_comercial_fim"))

    total_pac = query_one("SELECT COUNT(*) as total FROM pacientes")["total"]
    total_ag = query_one("SELECT COUNT(*) as total FROM agendamentos")["total"]
    lembretes_pend = query_one(
        "SELECT COUNT(*) as total FROM lembretes WHERE status = 'pendente'"
    )["total"]

    # Capacidades do assistente (rótulos amigáveis na UI; checagem interna no backend)
    skills_root = Path("/root/.hermes-docker/profiles/odonto-gpt/skills")
    capacidades = [
        ("odonto-atendimento", "Atendimento WhatsApp"),
        ("odonto-agenda", "Agenda"),
        ("odonto-crm", "CRM de pacientes"),
        ("odonto-clinica", "Dados da clínica"),
        ("odonto-triagem", "Triagem de urgência"),
        ("odonto-confirmacao", "Confirmação de consulta"),
        ("odonto-recall", "Recall / retorno"),
        ("odonto-followup", "Follow-up de orçamento"),
        ("odonto-captacao", "Captação de leads"),
        ("odonto_lembretes", "Lembretes automáticos"),
    ]
    capacidades_ok: list[str] = []
    capacidades_faltando: list[str] = []
    for slug, label in capacidades:
        hit = False
        if skills_root.is_dir():
            for p in skills_root.rglob("SKILL.md"):
                try:
                    head = p.read_text(encoding="utf-8", errors="ignore")[:400]
                except OSError:
                    continue
                parent = str(p.parent).replace("-", "_")
                if (
                    f"name: {slug}" in head
                    or f"name: {slug.replace('-', '_')}" in head
                    or slug.replace("-", "_") in parent
                    or slug in str(p.parent)
                ):
                    hit = True
                    break
        (capacidades_ok if hit else capacidades_faltando).append(label)

    steps = [
        {
            "id": "clinica_nome",
            "titulo": "Nome da clínica",
            "ok": nome_ok,
            "href": "/clinica",
            "hint": "Cadastre o nome real em Clínica",
        },
        {
            "id": "clinica_endereco",
            "titulo": "Endereço",
            "ok": end_ok,
            "href": "/clinica",
            "hint": "Usado nas confirmações e no atendimento",
        },
        {
            "id": "clinica_horario",
            "titulo": "Horário de funcionamento",
            "ok": horario_ok,
            "href": "/clinica",
            "hint": "Abertura e fechamento",
        },
        {
            "id": "dentistas",
            "titulo": "Dentistas cadastrados",
            "ok": len(dentistas) >= 1,
            "href": "/dentistas",
            "hint": f"{len(dentistas)} ativo(s)",
        },
        {
            "id": "grade",
            "titulo": "Horários dos dentistas",
            "ok": com_grade >= 1,
            "href": "/dentistas",
            "hint": f"{com_grade} com grade",
        },
        {
            "id": "pacientes",
            "titulo": "Pacientes no CRM",
            "ok": total_pac >= 1,
            "href": "/pacientes",
            "hint": f"{total_pac} paciente(s)",
        },
        {
            "id": "agenda",
            "titulo": "Agendamentos",
            "ok": total_ag >= 1,
            "href": "/agendamentos",
            "hint": f"{total_ag} registro(s)",
        },
        {
            "id": "capacidades",
            "titulo": "Assistente configurado",
            "ok": len(capacidades_faltando) == 0,
            "href": "/simulador",
            "hint": f"{len(capacidades_ok)}/{len(capacidades)} capacidades",
        },
        {
            "id": "simulador",
            "titulo": "Testar atendimento",
            "ok": True,
            "href": "/simulador",
            "hint": "Simulador de WhatsApp",
            "optional": True,
        },
    ]
    required = [s for s in steps if not s.get("optional")]
    prontos = sum(1 for s in required if s["ok"])
    return {
        "assistente": "OdontoGPT",
        "clinica": {
            "nome": clinica.get("clinica_nome"),
            "cidade": clinica.get("clinica_cidade"),
            "estado": clinica.get("clinica_estado"),
        },
        "dentistas_ativos": len(dentistas),
        "dentistas_com_grade": com_grade,
        "pacientes": total_pac,
        "agendamentos": total_ag,
        "lembretes_pendentes": lembretes_pend,
        # nomes amigáveis para a UI
        "capacidades_ok": capacidades_ok,
        "capacidades_faltando": capacidades_faltando,
        # aliases legados (sem slug técnico na UI preferida)
        "skills_ok": capacidades_ok,
        "skills_missing": capacidades_faltando,
        "steps": steps,
        "progresso": {
            "prontos": prontos,
            "total": len(required),
            "pct": int(round(100 * prontos / max(1, len(required)))),
        },
        "links": {
            "clinica": "/clinica",
            "dentistas": "/dentistas",
            "agenda": "/agendamentos",
            "simulador": "/simulador",
            "conversas": "/conversas",
            "assistente": "/agente",
        },
    }


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
    fin = {}
    nps = {}
    orc_abertos = 0
    lista_espera = 0
    try:
        fin = get_v2().resumo_financeiro()
        nps = get_v2().nps_resumo(90)
        orc_abertos = query_one(
            """SELECT COUNT(*) as total FROM orcamentos
               WHERE status IN ('enviado','em_negociacao','rascunho')"""
        )["total"]
        lista_espera = query_one(
            "SELECT COUNT(*) as total FROM lista_espera WHERE status='ativo'"
        )["total"]
    except Exception:
        pass
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
        "faturamento_mes": fin.get("faturamento_mes", 0),
        "a_receber": fin.get("a_receber", 0),
        "atrasado_valor": fin.get("atrasado_valor", 0),
        "nps": nps.get("nps"),
        "orcamentos_abertos": orc_abertos,
        "lista_espera_ativos": lista_espera,
    }


# ─── Dentistas (cadastro + horários + filtro legado) ────────────────

@app.get("/api/dentistas", dependencies=[Depends(require_auth)])
def listar_dentistas(completo: bool = Query(False), incluir_inativos: bool = Query(False)):
    """
    completo=false → lista de nomes (filtros de agenda/prontuário).
    completo=true  → cadastro com horários.
    """
    if completo:
        return {"data": dentistas_store.listar(incluir_inativos=incluir_inativos)}
    return {"data": dentistas_store.nomes_para_filtro()}


@app.get("/api/dentistas/{dentista_id}", dependencies=[Depends(require_auth)])
def obter_dentista(dentista_id: int):
    d = dentistas_store.obter(dentista_id)
    if not d:
        raise HTTPException(status_code=404, detail="Dentista não encontrado")
    return {"data": d}


@app.post("/api/dentistas", dependencies=[Depends(require_auth)])
def criar_dentista(body: DentistaBody):
    try:
        payload = body.model_dump()
        payload["horarios"] = [h.model_dump() for h in (body.horarios or [])]
        data = dentistas_store.criar(payload)
        return {"ok": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/dentistas/{dentista_id}", dependencies=[Depends(require_auth)])
def atualizar_dentista(dentista_id: int, body: DentistaUpdateBody):
    try:
        payload = body.model_dump(exclude_unset=True)
        if "horarios" in payload and body.horarios is not None:
            payload["horarios"] = [h.model_dump() for h in body.horarios]
        data = dentistas_store.atualizar(dentista_id, payload)
        return {"ok": True, "data": data}
    except LookupError:
        raise HTTPException(status_code=404, detail="Dentista não encontrado")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/dentistas/{dentista_id}", dependencies=[Depends(require_auth)])
def excluir_dentista(dentista_id: int, hard: bool = Query(False)):
    ok = dentistas_store.excluir(dentista_id, soft=not hard)
    if not ok:
        raise HTTPException(status_code=404, detail="Dentista não encontrado")
    return {"ok": True, "soft": not hard}


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


@app.get("/api/agenda/disponibilidade", dependencies=[Depends(require_auth)])
def agenda_disponibilidade(
    data: str = Query(..., description="YYYY-MM-DD"),
    dentista: Optional[str] = Query(None),
    dentista_id: Optional[int] = Query(None),
    step_min: int = Query(30, ge=15, le=60),
    excluir_id: Optional[int] = Query(None),
):
    try:
        return dentistas_store.slots_disponiveis(
            data=data,
            dentista_nome=dentista,
            dentista_id=dentista_id,
            step_min=step_min,
            excluir_agendamento_id=excluir_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/agendamentos", dependencies=[Depends(require_auth)])
def criar_agendamento(body: AgendamentoCreate):
    try:
        ok, msg = dentistas_store.validar_horario_dentista(
            body.dentista, body.data, body.horario
        )
        if not ok:
            raise HTTPException(status_code=400, detail=msg)
        crm = get_crm()
        aid = crm.criar_agendamento(
            body.paciente_id, body.data, body.horario, body.procedimento, body.dentista
        )
        row = query_one("SELECT * FROM agendamentos WHERE id = ?", (aid,))
        return row or {"id": aid, "ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=crm_error_to_http(e))


@app.patch("/api/agendamentos/{agendamento_id}", dependencies=[Depends(require_auth)])
def atualizar_agendamento(agendamento_id: int, body: AgendamentoUpdate):
    try:
        atual = query_one("SELECT * FROM agendamentos WHERE id = ?", (agendamento_id,))
        if not atual:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        data = body.model_dump(exclude_unset=True)
        dent = data.get("dentista", atual.get("dentista"))
        dt = data.get("data", atual.get("data"))
        hr = data.get("horario", atual.get("horario"))
        if dent and dt and hr:
            ok_h, msg = dentistas_store.validar_horario_dentista(
                dent, dt, hr, excluir_agendamento_id=agendamento_id
            )
            if not ok_h:
                raise HTTPException(status_code=400, detail=msg)
        crm = get_crm()
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
    # Chat de teste: não manda WhatsApp real — grava só no CRM
    if phone == TEST_CHAT_PHONE:
        mid = chat_store.registrar_mensagem(
            phone, "reply", body.mensagem, classificacao=f"atendente:{atendente}"
        )
        return {"ok": True, "bridge": {"simulador": True, "id": mid}}
    ok, info = bridge_send_text(phone, body.mensagem, atendente)
    if not ok:
        raise HTTPException(status_code=502, detail=info)
    return {"ok": True, "bridge": info}


# ─── Chat de teste (operador age como paciente) ─────────────────────

@app.get("/api/chat/teste", dependencies=[Depends(require_auth)])
def chat_teste_info():
    chat_store.ensure_test_paciente()
    return {
        "telefone": TEST_CHAT_PHONE,
        "nome": TEST_CHAT_NOME,
        "sessao": chat_store.get_modo(TEST_CHAT_PHONE),
        "instrucao": (
            "Envie mensagens como se fosse o paciente. O bot OdontoGPT responde "
            "como no WhatsApp (sem enviar mensagem real)."
        ),
    }


@app.post("/api/chat/teste/simular", dependencies=[Depends(require_auth)])
def chat_teste_simular(body: ChatTesteBody):
    """Operador manda mensagem *como cliente*; OdontoGPT sempre responde (simulador isolado)."""
    chat_store.ensure_test_paciente()
    phone = TEST_CHAT_PHONE
    text = (body.mensagem or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")

    # Simulador é só paciente→bot (nunca handoff humano)
    chat_store.set_modo(phone, "bot", None)
    envio_id = chat_store.registrar_mensagem(phone, "envio", text, classificacao="teste:cliente")

    # Histórico recente no formato LLM (envio=paciente, reply=bot/atendente)
    hist_rows = chat_store.listar_mensagens(phone, limit=24, after_id=0)
    history = []
    for h in hist_rows:
        if h.get("id") == envio_id:
            continue  # a mensagem atual entra à parte
        if h.get("tipo") == "envio":
            history.append({"role": "user", "content": h.get("mensagem") or ""})
        elif h.get("tipo") == "reply":
            history.append({"role": "assistant", "content": h.get("mensagem") or ""})

    sid = patient_session_id(phone)
    ok, answer = ask_patient(sid, text, history=history, telefone=phone)
    if not ok:
        chat_store.registrar_mensagem(
            phone, "reply", f"[Erro no simulador: {answer}]", classificacao="teste:erro"
        )
        raise HTTPException(status_code=502, detail=answer)

    reply_id = chat_store.registrar_mensagem(
        phone, "reply", answer, classificacao="teste:bot"
    )
    return {
        "ok": True,
        "telefone": phone,
        "modo": "bot",
        "envio_id": envio_id,
        "reply_id": reply_id,
        "bot_respondeu": True,
        "resposta": answer,
    }


@app.post("/api/chat/teste/limpar", dependencies=[Depends(require_auth)])
def chat_teste_limpar():
    n = chat_store.limpar_chat_teste()
    return {"ok": True, "apagadas": n, "telefone": TEST_CHAT_PHONE}


# ─── Chat administrador (assistente da clínica) ─────────────────────

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

    prefs = agent_store.get_preferencias(body.operador or "Gerente")
    ok, answer = ask_admin(
        sid,
        text,
        metrics_hint=metrics_hint,
        history=history,
        content_parts=content_parts if content_parts else None,
        prefs=prefs,
    )
    if not ok:
        print(f"[agent_chat] provider error session={sid}: {answer}")
        friendly = "Não consegui responder agora. Tente de novo em instantes."
        agent_store.append(sid, "assistant", friendly)
        raise HTTPException(status_code=502, detail=friendly)
    display, entrega = agent_store.parse_entrega(answer)
    meta = {"entrega": entrega} if entrega else None
    msg_id = agent_store.append(sid, "assistant", display, meta=meta)
    saved_ent = None
    if entrega:
        saved_ent = agent_store.save_entrega(
            sid, msg_id, entrega["tipo"], entrega["titulo"], entrega["corpo_md"]
        )
    return {
        "ok": True,
        "resposta": display,
        "session_id": sid,
        "entrega": saved_ent,
    }


@app.get("/api/agent/preferencias", dependencies=[Depends(require_auth)])
def agent_get_preferencias(operador: str = Query("Gerente")):
    return agent_store.get_preferencias(operador)


@app.put("/api/agent/preferencias", dependencies=[Depends(require_auth)])
def agent_put_preferencias(body: AgentPreferenciasBody):
    try:
        return agent_store.save_preferencias(
            body.operador or "Gerente",
            nome_agente=body.nome_agente,
            tom=body.tom,
            habilidades=body.habilidades,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/agent/entregas", dependencies=[Depends(require_auth)])
def agent_list_entregas(
    operador: str = Query("Gerente"),
    limit: int = Query(40, ge=1, le=100),
):
    sid = admin_session_id(operador)
    return {"session_id": sid, "data": agent_store.list_entregas(sid, limit=limit)}


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

# ─── V2: Slots / confirmação agenda ─────────────────────────────────

@app.get("/api/v2/slots", dependencies=[Depends(require_auth)])
def v2_slots(
    data_inicio: str = Query(..., description="YYYY-MM-DD"),
    data_fim: str = Query(..., description="YYYY-MM-DD"),
    dentista_id: Optional[int] = Query(None),
    duracao_min: Optional[int] = Query(None),
    limite: int = Query(30, ge=1, le=100),
):
    try:
        return {"data": get_v2().listar_slots(data_inicio, data_fim, dentista_id, duracao_min, limite)}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.post("/api/v2/agendamentos/{agendamento_id}/acao", dependencies=[Depends(require_auth)])
def v2_agendamento_acao(agendamento_id: int, body: ConfirmAgendamentoBody):
    v2 = get_v2()
    try:
        if body.acao == "confirmar":
            ok = v2.confirmar_agendamento(agendamento_id)
        elif body.acao == "cancelar":
            ok = v2.cancelar_agendamento_v2(agendamento_id, body.motivo)
        elif body.acao == "noshow":
            ok = v2.registrar_noshow(agendamento_id)
        else:
            raise HTTPException(400, "acao deve ser confirmar|cancelar|noshow")
        if not ok:
            raise HTTPException(404, "Agendamento não encontrado ou já finalizado")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, v2_err(e))


# ─── V2: Lista de espera ────────────────────────────────────────────

@app.get("/api/v2/lista-espera", dependencies=[Depends(require_auth)])
def v2_lista_espera(status: str = Query("ativo")):
    try:
        return {"data": get_v2().lista_espera_listar(status=status)}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.post("/api/v2/lista-espera", dependencies=[Depends(require_auth)])
def v2_lista_espera_add(body: ListaEsperaBody):
    try:
        iid = get_v2().lista_espera_add(
            body.paciente_id, body.procedimento, body.dentista_id,
            body.prioridade, body.periodo_preferido, body.notas,
        )
        return {"ok": True, "id": iid}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.patch("/api/v2/lista-espera/{item_id}", dependencies=[Depends(require_auth)])
def v2_lista_espera_status(item_id: int, body: ListaEsperaStatusBody):
    try:
        ok = get_v2().lista_espera_atualizar_status(
            item_id, body.status, body.ofertado_agendamento_id
        )
        if not ok:
            raise HTTPException(404, "Item não encontrado")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, v2_err(e))


# ─── V2: Procedimentos / Orçamentos ─────────────────────────────────

@app.get("/api/v2/procedimentos", dependencies=[Depends(require_auth)])
def v2_procedimentos(incluir_inativos: bool = Query(False)):
    try:
        return {"data": get_v2().listar_procedimentos(apenas_ativos=not incluir_inativos)}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.post("/api/v2/procedimentos", dependencies=[Depends(require_auth)])
def v2_procedimento_upsert(body: ProcedimentoBody):
    try:
        return {"ok": True, "data": get_v2().upsert_procedimento(body.model_dump())}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.get("/api/v2/orcamentos", dependencies=[Depends(require_auth)])
def v2_orcamentos(
    paciente_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=300),
):
    try:
        return {"data": get_v2().listar_orcamentos(paciente_id, status, limit)}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.get("/api/v2/orcamentos/{orcamento_id}", dependencies=[Depends(require_auth)])
def v2_orcamento_get(orcamento_id: int):
    o = get_v2().get_orcamento(orcamento_id)
    if not o:
        raise HTTPException(404, "Orçamento não encontrado")
    return {"data": o}


@app.post("/api/v2/orcamentos", dependencies=[Depends(require_auth)])
def v2_orcamento_create(body: OrcamentoCreateBody):
    try:
        itens = [i.model_dump() for i in body.itens]
        o = get_v2().criar_orcamento(
            body.paciente_id, itens, body.dentista_id,
            body.desconto_pct, body.desconto_valor, body.validade_dias,
            body.forma_pagamento_sugerida, body.parcelas_max, body.observacoes,
        )
        return {"ok": True, "data": o}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.post("/api/v2/orcamentos/{orcamento_id}/enviar", dependencies=[Depends(require_auth)])
def v2_orcamento_enviar(orcamento_id: int):
    try:
        return {"ok": True, "data": get_v2().enviar_orcamento(orcamento_id)}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.patch("/api/v2/orcamentos/{orcamento_id}/status", dependencies=[Depends(require_auth)])
def v2_orcamento_status(orcamento_id: int, body: OrcamentoStatusBody):
    try:
        return {
            "ok": True,
            "data": get_v2().atualizar_status_orcamento(
                orcamento_id, body.status, body.motivo_recusa
            ),
        }
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.get("/api/v2/pipeline", dependencies=[Depends(require_auth)])
def v2_pipeline():
    try:
        return {"data": get_v2().pipeline_comercial()}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


# ─── V2: Financeiro ─────────────────────────────────────────────────

@app.get("/api/v2/financeiro/resumo", dependencies=[Depends(require_auth)])
def v2_fin_resumo(mes: Optional[str] = Query(None)):
    try:
        return get_v2().resumo_financeiro(mes)
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.get("/api/v2/financeiro/caixa", dependencies=[Depends(require_auth)])
def v2_fin_caixa(data: Optional[str] = Query(None)):
    try:
        return get_v2().caixa_do_dia(data)
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.get("/api/v2/pagamentos", dependencies=[Depends(require_auth)])
def v2_pagamentos(
    status: Optional[str] = Query(None),
    paciente_id: Optional[int] = Query(None),
    data_inicio: Optional[str] = Query(None),
    data_fim: Optional[str] = Query(None),
):
    try:
        return {
            "data": get_v2().listar_pagamentos(
                status=status, paciente_id=paciente_id,
                data_inicio=data_inicio, data_fim=data_fim,
            )
        }
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.post("/api/v2/pagamentos", dependencies=[Depends(require_auth)])
def v2_pagamento_create(body: PagamentoBody):
    try:
        return {"ok": True, "data": get_v2().registrar_pagamento(body.model_dump())}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


# ─── V2: NPS / pré-consulta / segurança ─────────────────────────────

@app.get("/api/v2/nps", dependencies=[Depends(require_auth)])
def v2_nps(dias: int = Query(90, ge=1, le=365)):
    try:
        return get_v2().nps_resumo(dias)
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.post("/api/v2/nps", dependencies=[Depends(require_auth)])
def v2_nps_create(body: NpsBody):
    try:
        nid = get_v2().registrar_nps(
            body.paciente_id, body.score, body.comentario, body.agendamento_id
        )
        return {"ok": True, "id": nid}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.get("/api/v2/preconsultas", dependencies=[Depends(require_auth)])
def v2_preconsultas(status: Optional[str] = Query(None)):
    try:
        return {"data": get_v2().listar_preconsultas(status)}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.get("/api/v2/security-events", dependencies=[Depends(require_auth)])
def v2_security(limit: int = Query(50, ge=1, le=200)):
    try:
        return {"data": get_v2().listar_security_events(limit)}
    except Exception as e:
        raise HTTPException(400, v2_err(e))


@app.get("/api/health")
def health():
    try:
        db_test = query_one("SELECT COUNT(*) as total FROM pacientes")
        tables_v2 = query_one(
            """SELECT COUNT(*) as total FROM sqlite_master
               WHERE type='table' AND name IN
               ('orcamentos','pagamentos','lista_espera','nps_respostas')"""
        )
        return {
            "status": "ok",
            "db": "conectado",
            "total_pacientes": db_test["total"],
            "v2_tables": tables_v2["total"] if tables_v2 else 0,
            "version": "2.0.0",
        }
    except Exception as e:
        return {"status": "error", "db": str(e)}
