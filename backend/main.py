from fastapi import FastAPI, Query, HTTPException, Depends, Header, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from typing import Optional
from pathlib import Path
import asyncio
import json
import os


def _load_dotenv_file() -> None:
    """Garante .env no processo (systemd EnvironmentFile às vezes não exporta JWTs)."""
    base = Path(__file__).resolve().parent
    prefer = {
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "CLINIC_LOGIN_EMAIL",
        "CLINIC_LOGIN_PASSWORD",
        "EVOLUTION_API_KEY",
        "EVOLUTION_INSTANCE",
        "EVOLUTION_API_URL",
        "CHAT_BRIDGE_TOKEN",
    }
    for name in (".env", ".env.evolution"):
        env_path = base / name
        if not env_path.is_file():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("'").strip('"')
            if not key:
                continue
            if key not in os.environ:
                os.environ[key] = val
            elif key in prefer:
                os.environ[key] = val


_load_dotenv_file()

from database import query, query_one
from auth import require_auth, revoke_token, login_email_password, login_legacy_password
import auth as auth_module
from starlette.middleware.base import BaseHTTPMiddleware

# rebind supabase config after dotenv (auth lê env no import)
auth_module.SUPABASE_URL = (
    os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
).rstrip("/")
auth_module.SUPABASE_ANON_KEY = (
    os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or ""
)
auth_module.SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
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
    ChatCrmBody,
    ChatRascunhoBody,
    ChatAprovarRascunhoBody,
    ChatFollowupBody,
    ChatFollowupStatusBody,
    ChatTesteBody,
    MessageFeedbackBody,
    MessageRewriteBody,
    ClinicaBody,
    ClinicaMarcaBody,
    EntregavelCreateBody,
    EntregavelUpdateBody,
    EntregavelNovaVersaoBody,
    EntregavelExportBody,
    EntregavelPreviewBody,
    DentistaBody,
    DentistaUpdateBody,
    AgentChatBody,
    AgentPreferenciasBody,
    MemoryNoteBody,
    TarefaCreateBody,
    TarefaUpdateBody,
    TarefaFromRotinaBody,
    RotinaProgramadaBody,
    EstudantesChatBody,
    VisionAnalyzeBody,
    VisionPreanalyzeBody,
    VisionCropBody,
    VisionEntregavelBody,
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
import tarefas_store
import clinic_config
import dentistas_store
import brand_store
import entregaveis_store
from hermes_agent_client import (
    ask_admin,
    ask_admin_stream,
    admin_session_id,
    ask_student,
    ask_vision,
    ask_patient,
    patient_session_id,
    estudante_session_id,
    vision_session_id,
)
from insights_service import (
    clinic_briefing,
    QUICK_PROMPTS,
    agent_operational_snapshot,
    is_casual_admin_message,
    minimal_operational_hint,
)
from dashboard_service import build_cockpit
import media_service
from media_service import save_upload, resolve_upload, file_to_agent_parts, meta_json
import memory_service

app = FastAPI(title="OdontoGPT Dashboard API", version="2.0.0")


@app.on_event("startup")
def _startup_chat_schema():
    # Multi-tenant: bootstrap SQLite local + push canônico Supabase
    try:
        import clinic_sync

        boot = clinic_sync.bootstrap_clinic()
        print(f"[startup] clinic bootstrap: {boot.get('ok')} local={boot.get('local_db')}")
    except Exception as e:
        print(f"[startup] clinic bootstrap skipped: {e}")

    chat_store.ensure_schema()
    agent_store.ensure_schema()
    try:
        tarefas_store.ensure_schema()
    except Exception:
        pass
    try:
        clinic_config.ensure_schema()
    except Exception:
        pass
    try:
        brand_store.ensure_schema()
    except Exception:
        pass
    try:
        entregaveis_store.ensure_schema()
    except Exception:
        pass
    try:
        dentistas_store.ensure_schema()
    except Exception:
        pass
    try:
        memory_service.ensure_schema()
    except Exception:
        pass
    try:
        chat_store.ensure_test_paciente()
    except Exception:
        pass

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Headers de segurança básicos (skill security-audit / defense in depth)."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        response.headers.setdefault("Cache-Control", "no-store")
        return response


# CORS: em produção preferir clinica.odontogpt.com; * mantido se painel for servido same-origin via Caddy
_cors_origins = [
    o.strip()
    for o in __import__("os").environ.get(
        "CORS_ALLOW_ORIGINS",
        "https://clinica.odontogpt.com,https://estudante.odontogpt.com,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)
app.add_middleware(SecurityHeadersMiddleware)


# ─── Autenticação ───────────────────────────────────────────────────

@app.post("/api/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request):
    """Login via Supabase Auth (e-mail + senha). Exige membership em clínica.

    Autorização: clinic_members + profiles (nunca user_metadata).
    """
    email = (body.email or "").strip()
    client_ip = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if forwarded:
        client_ip = forwarded
    if email:
        return login_email_password(email, body.password or "", client_ip=client_ip)
    # Fallback legado (só se ODONTOGPT_LEGACY_PASSWORD_AUTH=true)
    return login_legacy_password(body.password or "")


@app.post("/api/logout")
def logout_endpoint(authorization: str = Header(default=None)):
    """Encerra sessão (logout Supabase / revoga token legado)."""
    revoked = revoke_token(authorization) if authorization else False
    return {"status": "ok", "revoked": revoked}


@app.get("/api/me")
def me(user=Depends(require_auth)):
    """Usuário autenticado + clínicas (Supabase)."""
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "active_clinic_id": user.active_clinic_id,
            "active_workspace": user.active_workspace,
            "account_modes": user.account_modes,
            "clinics": user.clinics,
            "auth_source": user.auth_source,
        }
    }


@app.post("/api/clinic/sync/push")
def clinic_sync_push(user=Depends(require_auth)):
    """Push CRM local + memória Hermes → Supabase (canônico multi-tenant)."""
    import clinic_sync
    import clinic_context as cx

    cid = user.active_clinic_id or cx.clinic_id()
    # se user tem clinics, preferir a ativa ou a primeira
    if user.clinics and not user.active_clinic_id:
        cid = user.clinics[0].get("clinic_id") or cid
    result = clinic_sync.push_clinic(cid)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error") or "sync_failed")
    return result


@app.post("/api/clinic/sync/pull")
def clinic_sync_pull(user=Depends(require_auth)):
    """Pull Supabase → SQLite local da clínica."""
    import clinic_sync
    import clinic_context as cx

    cid = user.active_clinic_id or cx.clinic_id()
    if user.clinics and not user.active_clinic_id:
        cid = user.clinics[0].get("clinic_id") or cid
    result = clinic_sync.pull_clinic(cid)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error") or "pull_failed")
    return result


@app.get("/api/clinic/sync/status")
def clinic_sync_status(user=Depends(require_auth)):
    """Status do tenant ativo: paths locais + contagens."""
    import clinic_context as cx
    from database import resolve_db_path
    import os
    from pathlib import Path

    cid = user.active_clinic_id or cx.clinic_id()
    db = resolve_db_path()
    mem = cx.clinic_memory_dir(cid)
    mem_files = [p.name for p in mem.iterdir() if p.is_file()] if mem.is_dir() else []
    return {
        "clinic_id": cid,
        "sqlite": db,
        "sqlite_exists": os.path.isfile(db),
        "sqlite_size": os.path.getsize(db) if os.path.isfile(db) else 0,
        "memory_dir": str(mem),
        "memory_files": mem_files,
        "hermes_session_sample": cx.hermes_session_key("admin", "Gerente", cid=cid),
    }


# ─── Cadastro da clínica ────────────────────────────────────────────

@app.get("/api/clinica", dependencies=[Depends(require_auth)])
def get_clinica():
    return {"data": clinic_config.get_clinica()}


@app.put("/api/clinica", dependencies=[Depends(require_auth)])
def put_clinica(body: ClinicaBody):
    payload = body.model_dump(exclude_unset=True)
    data = clinic_config.update_clinica(payload)
    return {"ok": True, "data": data}


# ─── Marca / identidade visual ──────────────────────────────────────

@app.get("/api/clinica/marca", dependencies=[Depends(require_auth)])
def get_clinica_marca():
    return {"data": brand_store.get_brand()}


@app.put("/api/clinica/marca", dependencies=[Depends(require_auth)])
def put_clinica_marca(body: ClinicaMarcaBody):
    payload = body.model_dump(exclude_unset=True)
    try:
        data = brand_store.update_brand(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "data": data}


@app.post("/api/clinica/marca/logo", dependencies=[Depends(require_auth)])
async def post_clinica_logo(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        data = brand_store.save_logo(file.filename or "logo.png", raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "data": data}


@app.get("/api/clinica/marca/logo-file", dependencies=[Depends(require_auth)])
def get_clinica_logo_file():
    from fastapi.responses import FileResponse

    path = brand_store.logo_file_path()
    if not path:
        raise HTTPException(status_code=404, detail="logo não cadastrada")
    return FileResponse(path)


# ─── Biblioteca de entregáveis ──────────────────────────────────────

@app.get("/api/entregaveis", dependencies=[Depends(require_auth)])
def list_entregaveis(
    tipo: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(60, ge=1, le=200),
):
    return {
        "data": entregaveis_store.list_entregaveis(tipo=tipo, status=status, limit=limit),
        "tipos": [
            {"id": k, "label": v}
            for k, v in entregaveis_store.TIPO_LABELS.items()
            if k not in ("relatorio", "apresentacao_legacy")
        ],
    }


@app.get("/api/entregaveis/{eid}", dependencies=[Depends(require_auth)])
def get_entregavel(eid: int):
    item = entregaveis_store.get_entregavel(eid)
    if not item:
        raise HTTPException(status_code=404, detail="entregável não encontrado")
    return {"data": item}


@app.post("/api/entregaveis", dependencies=[Depends(require_auth)])
def create_entregavel(body: EntregavelCreateBody):
    try:
        item = entregaveis_store.create_entregavel(
            tipo=body.tipo,
            titulo=body.titulo,
            corpo_md=body.corpo_md,
            operador=body.operador or "Gerente",
            origem=body.origem or "manual",
            meta=body.meta,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "data": item}


@app.post("/api/entregaveis/{eid}/nova-versao", dependencies=[Depends(require_auth)])
def entregavel_nova_versao(eid: int, body: EntregavelNovaVersaoBody):
    try:
        item = entregaveis_store.nova_versao(
            eid,
            corpo_md=body.corpo_md,
            titulo=body.titulo,
            operador=body.operador or "Gerente",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True, "data": item}


@app.patch("/api/entregaveis/{eid}", dependencies=[Depends(require_auth)])
def patch_entregavel(eid: int, body: EntregavelUpdateBody):
    try:
        item = entregaveis_store.update_entregavel(
            eid, status=body.status, titulo=body.titulo
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True, "data": item}


@app.get("/api/entregaveis/{eid}/preview", dependencies=[Depends(require_auth)])
def entregavel_preview(eid: int):
    from fastapi.responses import HTMLResponse

    try:
        html_doc = entregaveis_store.build_preview_html(eid)
    except ValueError:
        raise HTTPException(status_code=404, detail="entregável não encontrado")
    return HTMLResponse(html_doc)


@app.post("/api/entregaveis/preview", dependencies=[Depends(require_auth)])
def entregavel_preview_adhoc(body: EntregavelPreviewBody):
    """Preview branded a partir do conteúdo do chat (sem id de biblioteca)."""
    from fastapi.responses import HTMLResponse

    if not (body.corpo_md or "").strip():
        raise HTTPException(status_code=400, detail="corpo vazio")
    html_doc = entregaveis_store.build_preview_html_content(
        titulo=body.titulo,
        corpo_md=body.corpo_md,
        tipo=body.tipo,
        tipo_label=body.tipo_label,
        versao=body.versao,
        created_at=body.created_at,
    )
    return HTMLResponse(html_doc)


@app.get("/api/entregaveis/{eid}/export", dependencies=[Depends(require_auth)])
def entregavel_export(
    eid: int,
    fmt: str = Query("pdf", pattern="^(pdf|docx)$"),
):
    """Baixa entregável da biblioteca em PDF ou DOCX (não markdown)."""
    from fastapi.responses import Response

    try:
        data, media, filename = entregaveis_store.export_entregavel(eid, fmt=fmt)
    except ValueError as e:
        msg = str(e)
        code = 404 if "não encontrado" in msg else 400
        raise HTTPException(status_code=code, detail=msg)
    return Response(
        content=data,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@app.post("/api/entregaveis/export", dependencies=[Depends(require_auth)])
def entregavel_export_adhoc(body: EntregavelExportBody):
    """Exporta conteúdo do chat (sem id de biblioteca) em PDF ou DOCX."""
    from fastapi.responses import Response

    try:
        data, media, filename = entregaveis_store.export_bytes(
            titulo=body.titulo,
            corpo_md=body.corpo_md,
            tipo=body.tipo or "relatorio_executivo",
            fmt=body.fmt or "pdf",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(
        content=data,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@app.get("/api/entregaveis/{eid}/thumb", dependencies=[Depends(require_auth)])
def entregavel_thumb(eid: int):
    from fastapi.responses import FileResponse

    path = entregaveis_store.thumb_path(eid)
    if not path:
        raise HTTPException(status_code=404, detail="thumb não encontrada")
    return FileResponse(path, media_type="image/svg+xml")


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
    # WhatsApp / Evolution — status operacional (arquivo escrito pelo reconnect/watchdog)
    wa_status: dict = {
        "ok": False,
        "state": "unknown",
        "has_qr": False,
        "action": "unknown",
        "message_pt": "Status WhatsApp indisponível",
        "updated_at": None,
    }
    wa_path = Path("/root/odontogpt-wa-status.json")
    if wa_path.is_file():
        try:
            wa_status = {**wa_status, **json.loads(wa_path.read_text(encoding="utf-8"))}
        except (OSError, json.JSONDecodeError):
            pass
    steps.insert(
        0,
        {
            "id": "whatsapp",
            "titulo": "WhatsApp conectado",
            "ok": bool(wa_status.get("ok")),
            "href": "/operacao",
            "hint": wa_status.get("message_pt")
            or (
                "Conectado"
                if wa_status.get("ok")
                else "Desconectado — escaneie o QR abaixo"
            ),
        },
    )

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
        "whatsapp": wa_status,
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
            "operacao": "/operacao",
        },
    }


@app.get("/api/operacao/whatsapp/qr", dependencies=[Depends(require_auth)])
def operacao_whatsapp_qr():
    """QR de reconexão WhatsApp (só autenticado). Regenera se necessário."""
    from fastapi.responses import FileResponse

    png = Path("/root/odontogpt-qr.png")
    status_path = Path("/root/odontogpt-wa-status.json")
    need = True
    if status_path.is_file():
        try:
            st = json.loads(status_path.read_text(encoding="utf-8"))
            if st.get("ok"):
                raise HTTPException(status_code=404, detail="WhatsApp já conectado")
            need = not (st.get("has_qr") and png.is_file())
        except (OSError, json.JSONDecodeError):
            pass
    if need or not png.is_file():
        import subprocess

        subprocess.run(
            ["/root/odontogpt-wa-reconnect.sh"],
            check=False,
            capture_output=True,
            timeout=45,
        )
    if not png.is_file():
        raise HTTPException(status_code=404, detail="QR indisponível — tente de novo em 30s")
    return FileResponse(png, media_type="image/png", filename="odontogpt-whatsapp-qr.png")


# ─── Métricas ───────────────────────────────────────────────────────

@app.get("/api/dashboard/cockpit", dependencies=[Depends(require_auth)])
def dashboard_cockpit():
    """Visão geral agentica: missão, riscos, trabalho do OdontoGPT, fila, ganho."""
    return build_cockpit()


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
    paciente.update(_paciente_consent_fields(int(paciente_id)))
    return paciente


@app.post("/api/pacientes", dependencies=[Depends(require_auth)])
def criar_paciente(body: PacienteCreate, user=Depends(require_auth)):
    try:
        crm = get_crm()
        row = crm.criar_paciente(
            body.nome, body.telefone, body.data_nascimento, body.indicacao, body.observacoes
        )
        pid = row.get("id") if isinstance(row, dict) else None
        if pid and body.consentimento_vision:
            import vision_consent

            vision_consent.set_paciente_consent(
                int(pid),
                aceito=True,
                operador_email=getattr(user, "email", None),
            )
            row = {**row, **_paciente_consent_fields(int(pid))}
        elif pid:
            row = {**row, **_paciente_consent_fields(int(pid))}
        return row
    except Exception as e:
        raise HTTPException(status_code=400, detail=crm_error_to_http(e))


@app.patch("/api/pacientes/{paciente_id}", dependencies=[Depends(require_auth)])
def atualizar_paciente(paciente_id: int, body: PacienteUpdate, user=Depends(require_auth)):
    try:
        crm = get_crm()
        data = body.model_dump(exclude_unset=True)
        consent = data.pop("consentimento_vision", None)
        row = crm.atualizar_paciente(paciente_id, **data) if data else query_one(
            "SELECT * FROM pacientes WHERE id = ?", (paciente_id,)
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Paciente não encontrado")
        if consent is not None:
            import vision_consent

            vision_consent.set_paciente_consent(
                int(paciente_id),
                aceito=bool(consent),
                operador_email=getattr(user, "email", None),
            )
        if isinstance(row, dict):
            row = {**row, **_paciente_consent_fields(int(paciente_id))}
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=crm_error_to_http(e))


def _paciente_consent_fields(paciente_id: int) -> dict:
    import vision_consent

    try:
        info = vision_consent.get_paciente_consent(paciente_id)
        return {
            "consentimento_vision": info["consentimento_vision"],
            "consentimento_vision_em": info["consentimento_vision_em"],
            "consentimento_vision_versao": info["consentimento_vision_versao"],
            "consentimento_vision_atual": info["termo_atual"],
        }
    except Exception:
        return {
            "consentimento_vision": False,
            "consentimento_vision_em": None,
            "consentimento_vision_versao": None,
            "consentimento_vision_atual": False,
        }


@app.get("/api/vision/termo-consentimento", dependencies=[Depends(require_auth)])
def vision_termo_consentimento():
    import vision_consent

    return {"data": vision_consent.term_payload()}


@app.get(
    "/api/pacientes/{paciente_id}/consentimento-vision",
    dependencies=[Depends(require_auth)],
)
def paciente_consentimento_vision(paciente_id: int):
    import vision_consent

    try:
        return {"data": vision_consent.get_paciente_consent(paciente_id)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.put(
    "/api/pacientes/{paciente_id}/consentimento-vision",
    dependencies=[Depends(require_auth)],
)
def put_paciente_consentimento_vision(
    paciente_id: int,
    aceito: bool = Query(...),
    user=Depends(require_auth),
):
    import vision_consent

    try:
        return {
            "data": vision_consent.set_paciente_consent(
                paciente_id,
                aceito=aceito,
                operador_email=getattr(user, "email", None),
            )
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


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
def chat_listar_conversas(
    limit: int = Query(50, ge=1, le=100),
    since: Optional[str] = Query(None, description="funil_version anterior; se igual, changed=false"),
):
    version = chat_store.funil_version()
    if since and since == version:
        return {
            "changed": False,
            "version": version,
            "data": None,
            "resumo": None,
            "stages": chat_store.STAGES,
        }
    data = chat_store.listar_conversas(limit=limit)
    resumo = chat_store.resumo_crm(data)
    return {
        "changed": True,
        "version": resumo.get("version") or version,
        "data": data,
        "resumo": resumo,
        "stages": chat_store.STAGES,
        "tag_presets": chat_store.TAG_PRESETS,
    }


@app.get("/api/chat/conversas/events", dependencies=[Depends(require_auth)])
async def chat_conversas_events(
    since: str = Query(..., description="funil_version observada pelo cliente"),
    timeout: int = Query(25, ge=2, le=40),
    limit: int = Query(50, ge=1, le=100),
):
    """Long-poll: bloqueia até o funil mudar ou timeout (tempo real sem websocket)."""
    import asyncio

    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        version = chat_store.funil_version()
        if version != since:
            data = chat_store.listar_conversas(limit=limit)
            resumo = chat_store.resumo_crm(data)
            return {
                "changed": True,
                "version": resumo.get("version") or version,
                "data": data,
                "resumo": resumo,
                "stages": chat_store.STAGES,
                "tag_presets": chat_store.TAG_PRESETS,
            }
        await asyncio.sleep(1.2)
    return {
        "changed": False,
        "version": chat_store.funil_version(),
        "data": None,
        "resumo": None,
        "stages": chat_store.STAGES,
    }


@app.get("/api/chat/crm/stages", dependencies=[Depends(require_auth)])
def chat_crm_stages():
    return {
        "stages": chat_store.STAGES,
        "prioridades": sorted(chat_store.PRIORIDADES),
        "tag_presets": chat_store.TAG_PRESETS,
        "sla_atencao_min": chat_store.SLA_ATENCAO_MIN,
        "sla_critico_min": chat_store.SLA_CRITICO_MIN,
        "lead_scores": chat_store.LEAD_SCORES,
        "script_fluxos": list(chat_store.SCRIPT_FLUXOS.values()),
    }


@app.patch("/api/chat/conversas/{telefone}/crm", dependencies=[Depends(require_auth)])
def chat_atualizar_crm(telefone: str, body: ChatCrmBody):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    try:
        sess = chat_store.atualizar_crm(
            phone,
            stage=body.stage,
            prioridade=body.prioridade,
            notas_crm=body.notas_crm,
            tags=body.tags,
            clear_notas=body.clear_notas,
            lead_score=body.lead_score,
            script_fluxo=body.script_fluxo,
            script_passo=body.script_passo,
            clear_script=body.clear_script,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "sessao": sess}


@app.post("/api/chat/conversas/{telefone}/perfil/refresh", dependencies=[Depends(require_auth)])
def chat_refresh_perfil(telefone: str, force: bool = Query(False)):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    # injeta chave Evolution do host se ainda não no processo
    if not os.environ.get("EVOLUTION_API_KEY"):
        try:
            import json as _json
            from pathlib import Path as _P

            p = _P("/tmp/evo_env.json")
            if p.is_file():
                cfg = _json.loads(p.read_text())
                os.environ.setdefault("EVOLUTION_API_KEY", cfg.get("key") or "")
                os.environ.setdefault("EVOLUTION_INSTANCE", cfg.get("instance") or "odontogpt")
                os.environ.setdefault("EVOLUTION_API_URL", cfg.get("url") or "http://127.0.0.1:8080")
        except Exception:
            pass
    result = chat_store.refresh_wa_perfil(phone, max_age_hours=0 if force else 12)
    return result


@app.get("/api/chat/conversas/{telefone}/historico", dependencies=[Depends(require_auth)])
def chat_historico(telefone: str, limit: int = Query(40, ge=1, le=100)):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    return {
        "telefone": phone,
        "eventos": chat_store.listar_eventos(phone, limit=limit),
        "followups": chat_store.listar_followups(phone),
        "sessao": chat_store.get_modo(phone),
    }


@app.post("/api/chat/conversas/{telefone}/followups", dependencies=[Depends(require_auth)])
def chat_criar_followup(telefone: str, body: ChatFollowupBody):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    row = chat_store.criar_followup(
        phone,
        body.titulo,
        tipo=body.tipo or "manual",
        descricao=body.descricao,
        due_hours=body.due_hours or 24,
    )
    return {"ok": True, "followup": row}


@app.patch("/api/chat/followups/{followup_id}", dependencies=[Depends(require_auth)])
def chat_status_followup(followup_id: int, body: ChatFollowupStatusBody):
    try:
        row = chat_store.atualizar_followup(followup_id, body.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not row:
        raise HTTPException(status_code=404, detail="Follow-up não encontrado")
    return {"ok": True, "followup": row}


@app.post("/api/chat/conversas/{telefone}/rascunho", dependencies=[Depends(require_auth)])
def chat_salvar_rascunho(telefone: str, body: ChatRascunhoBody):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    try:
        sess = chat_store.salvar_rascunho(phone, body.mensagem, body.origem or "humano")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "sessao": sess}


@app.delete("/api/chat/conversas/{telefone}/rascunho", dependencies=[Depends(require_auth)])
def chat_descartar_rascunho(telefone: str):
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    try:
        sess = chat_store.limpar_rascunho(phone)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "sessao": sess}


@app.post("/api/chat/conversas/{telefone}/rascunho/aprovar", dependencies=[Depends(require_auth)])
def chat_aprovar_rascunho(telefone: str, body: ChatAprovarRascunhoBody):
    """HITL: assume conversa se preciso, envia WhatsApp e limpa rascunho."""
    phone = normalize_phone(telefone)
    if not phone:
        raise HTTPException(status_code=400, detail="Telefone inválido")
    sess = chat_store.get_modo(phone)
    texto = (body.mensagem or sess.get("rascunho_resposta") or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Nenhum rascunho para aprovar")
    atendente = (body.atendente or sess.get("atendente") or "Atendente").strip()
    if sess.get("modo") != "human":
        chat_store.set_modo(phone, "human", atendente)
    # reutiliza fluxo de envio
    if phone == TEST_CHAT_PHONE:
        mid = chat_store.registrar_mensagem(
            phone, "reply", texto, classificacao=f"atendente:{atendente}:hitl"
        )
        chat_store.limpar_rascunho(phone)
        return {"ok": True, "bridge": {"simulador": True, "id": mid}, "sessao": chat_store.get_modo(phone)}
    ok, info = bridge_send_text(phone, texto, atendente)
    if not ok:
        raise HTTPException(status_code=502, detail=info)
    chat_store.limpar_rascunho(phone)
    return {"ok": True, "bridge": info, "sessao": chat_store.get_modo(phone)}


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


@app.post("/api/chat/mensagens/{interacao_id}/feedback", dependencies=[Depends(require_auth)])
def chat_message_feedback(interacao_id: int, body: MessageFeedbackBody):
    try:
        fb = chat_store.upsert_message_feedback(
            interacao_id, body.nota, body.comentario, operador="dashboard"
        )
        return {"ok": True, "feedback": fb}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/api/chat/mensagens/{interacao_id}/feedback", dependencies=[Depends(require_auth)])
def chat_get_message_feedback(interacao_id: int):
    fb = chat_store.get_message_feedback(interacao_id)
    if not fb:
        raise HTTPException(status_code=404, detail="sem feedback")
    return {"ok": True, "feedback": fb}


@app.post("/api/chat/mensagens/{interacao_id}/reescrever", dependencies=[Depends(require_auth)])
def chat_reescrever_mensagem(interacao_id: int, body: MessageRewriteBody):
    inter = chat_store.get_interacao(interacao_id)
    if not inter or not chat_store.is_bot_reply(inter):
        raise HTTPException(status_code=400, detail="mensagem inválida para reescrita")
    try:
        if body.nota is not None:
            chat_store.upsert_message_feedback(
                interacao_id, body.nota, body.comentario, operador="dashboard"
            )
        elif body.comentario:
            existing = chat_store.get_message_feedback(interacao_id)
            if existing:
                chat_store.upsert_message_feedback(
                    interacao_id,
                    existing["nota"],
                    body.comentario,
                    operador="dashboard",
                )
            else:
                raise HTTPException(status_code=400, detail="informe a nota (1–5)")
        fb = chat_store.get_message_feedback(interacao_id)
        if not fb:
            raise HTTPException(status_code=400, detail="salve a nota antes de reescrever")

        phone = inter.get("telefone") or ""
        # listar_mensagens is ASC; take the most recent turns for rewrite context
        hist_rows = chat_store.listar_mensagens(phone, limit=200, after_id=0)[-24:]
        history = []
        for h in hist_rows:
            if h.get("tipo") == "envio":
                history.append({"role": "user", "content": h.get("mensagem") or ""})
            elif h.get("tipo") == "reply":
                history.append({"role": "assistant", "content": h.get("mensagem") or ""})

        from patient_atendimento import rewrite_patient_reply

        ok, text = rewrite_patient_reply(
            original=inter.get("mensagem") or "",
            nota=fb.get("nota"),
            comentario=fb.get("comentario"),
            history=history,
        )
        if not ok:
            raise HTTPException(status_code=502, detail=text)

        out = chat_store.apply_message_rewrite(interacao_id, text)
        return {"ok": True, **out}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


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

    # Fecha o loop CRM: modelo free não tem tools — ações :::crm::: + sanitização
    crm_actions: list = []
    try:
        from patient_atendimento import process_patient_reply

        answer, crm_actions = process_patient_reply(phone, answer)
    except Exception as ex:
        print(f"[chat_teste_simular] process_patient_reply: {ex}")

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
        "crm_actions": crm_actions,
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


# ─── Memória / Segundo cérebro (AG-UI) ───────────────────────────────

@app.get("/api/agent/memoria", dependencies=[Depends(require_auth)])
def agent_memoria_overview():
    return memory_service.get_memory_overview()


@app.post("/api/agent/memoria/seed", dependencies=[Depends(require_auth)])
def agent_memoria_seed(force: bool = Query(False)):
    """Importa second-brain Hermes + protocolos base para a biblioteca."""
    return memory_service.seed_from_second_brain(force=force)


@app.get("/api/agent/memoria/documentos", dependencies=[Depends(require_auth)])
def agent_memoria_list_docs(limit: int = Query(50, ge=1, le=200)):
    return {"data": memory_service.list_docs(limit=limit)}


@app.get("/api/agent/memoria/documentos/{doc_id}", dependencies=[Depends(require_auth)])
def agent_memoria_get_doc(doc_id: str):
    doc = memory_service.get_doc(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return doc


@app.post("/api/agent/memoria/documentos", dependencies=[Depends(require_auth)])
async def agent_memoria_upload_doc(
    file: UploadFile = File(...),
    titulo: Optional[str] = Form(None),
    tipo: str = Form("documento"),
):
    raw = await file.read()
    try:
        doc = memory_service.add_document(
            file.filename or "arquivo",
            raw,
            file.content_type,
            titulo=titulo,
            tipo=tipo or "documento",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "documento": doc}


@app.post("/api/agent/memoria/notas", dependencies=[Depends(require_auth)])
def agent_memoria_add_note(body: MemoryNoteBody):
    try:
        doc = memory_service.add_note(
            titulo=body.titulo or "Nota",
            conteudo=body.conteudo,
            tipo=body.tipo or "nota",
            tags=body.tags,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "documento": doc}


@app.delete("/api/agent/memoria/documentos/{doc_id}", dependencies=[Depends(require_auth)])
def agent_memoria_delete_doc(doc_id: str):
    if not memory_service.delete_doc(doc_id):
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return {"ok": True}


@app.post("/api/agent/upload", dependencies=[Depends(require_auth)])
async def agent_upload(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        meta = save_upload(file.filename or "anexo", raw, file.content_type)
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    return {"ok": True, "anexo": json.loads(meta_json(meta))}


def _agent_chat_prepare(body: AgentChatBody):
    """Prepara sessão, anexos e snapshot — compartilhado por chat e stream."""
    sid = admin_session_id(body.operador or "Gerente")
    text = (body.mensagem or "").strip()
    anexos = body.anexos_ids or []
    if not text and not anexos:
        raise HTTPException(status_code=400, detail="Mensagem ou anexo obrigatório")

    metrics_hint = None
    if body.incluir_metricas:
        try:
            if is_casual_admin_message(text):
                metrics_hint = minimal_operational_hint()
            else:
                metrics_hint = agent_operational_snapshot()
        except Exception as ex:
            print(f"[agent_chat] snapshot fallback: {ex}")
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
    if history and history[-1]["role"] == "user":
        history = history[:-1]

    prefs = agent_store.get_preferencias(body.operador or "Gerente")
    return {
        "sid": sid,
        "text": text,
        "metrics_hint": metrics_hint,
        "history": history,
        "content_parts": content_parts if content_parts else None,
        "prefs": prefs,
        "operador": body.operador or "Gerente",
    }


@app.post("/api/agent/chat", dependencies=[Depends(require_auth)])
def agent_chat(body: AgentChatBody):
    prep = _agent_chat_prepare(body)
    ok, answer = ask_admin(
        prep["sid"],
        prep["text"],
        metrics_hint=prep["metrics_hint"],
        history=prep["history"],
        content_parts=prep["content_parts"],
        prefs=prep["prefs"],
    )
    if not ok:
        print(f"[agent_chat] provider error session={prep['sid']}: {answer}")
        friendly = "Não consegui responder agora. Tente de novo em instantes."
        agent_store.append(prep["sid"], "assistant", friendly)
        raise HTTPException(status_code=502, detail=friendly)
    return _agent_finalize_answer(prep["sid"], answer, prep["operador"])


def _agent_finalize_answer(sid: str, answer: str, operador: str):
    display, meta = agent_store.parse_assistant_message(answer)
    entrega = (meta or {}).get("entrega")
    acoes = (meta or {}).get("acoes")
    msg_id = agent_store.append(sid, "assistant", display, meta=meta)
    saved_ent = None
    if entrega:
        saved_ent = agent_store.save_entrega(
            sid,
            msg_id,
            entrega["tipo"],
            entrega["titulo"],
            entrega["corpo_md"],
            operador=operador,
        )
        if meta is None:
            meta = {}
        meta = dict(meta)
        meta["entrega"] = saved_ent
        try:
            agent_store.update_message_meta(msg_id, meta)
        except Exception:
            pass
    return {
        "ok": True,
        "resposta": display,
        "session_id": sid,
        "entrega": saved_ent,
        "acoes": acoes or [],
        "message_id": msg_id,
    }


@app.post("/api/agent/chat/stream", dependencies=[Depends(require_auth)])
async def agent_chat_stream(body: AgentChatBody, request: Request):
    """SSE: tokens em tempo real + evento final com entrega/ações parseadas.

    Para se o cliente desconectar (cancelar) — não grava resposta parcial.
    """
    prep = _agent_chat_prepare(body)
    stream_iter = ask_admin_stream(
        prep["sid"],
        prep["text"],
        metrics_hint=prep["metrics_hint"],
        history=prep["history"],
        content_parts=prep["content_parts"],
        prefs=prep["prefs"],
    )

    def _next_chunk():
        try:
            return next(stream_iter), False
        except StopIteration:
            return None, True

    async def event_stream():
        yield f"event: status\ndata: {json.dumps({'status': 'crm_ok'}, ensure_ascii=False)}\n\n"
        buf: list[str] = []
        cancelled = False
        try:
            while True:
                if await request.is_disconnected():
                    cancelled = True
                    print(f"[agent_chat_stream] client disconnected sid={prep['sid']}")
                    break
                chunk, done = await asyncio.to_thread(_next_chunk)
                if done:
                    break
                buf.append(chunk)
                yield f"event: token\ndata: {json.dumps({'t': chunk}, ensure_ascii=False)}\n\n"

            if cancelled:
                yield f"event: cancelled\ndata: {json.dumps({'ok': False}, ensure_ascii=False)}\n\n"
                return

            answer = "".join(buf)
            if not answer.strip():
                raise RuntimeError("resposta vazia")
            result = _agent_finalize_answer(prep["sid"], answer, prep["operador"])
            yield f"event: done\ndata: {json.dumps(result, ensure_ascii=False)}\n\n"
        except Exception as ex:
            if cancelled:
                return
            print(f"[agent_chat_stream] error: {ex}")
            friendly = "Não consegui responder agora. Tente de novo em instantes."
            try:
                agent_store.append(prep["sid"], "assistant", friendly)
            except Exception:
                pass
            yield f"event: error\ndata: {json.dumps({'detail': friendly}, ensure_ascii=False)}\n\n"
        finally:
            # fecha gerador upstream (encerra HTTP do provider se possível)
            try:
                stream_iter.close()
            except Exception:
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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


# ─── Tarefas da clínica + rotinas programadas ───────────────────────

@app.get("/api/agent/rotinas/catalogo", dependencies=[Depends(require_auth)])
def agent_rotinas_catalogo():
    return {"data": tarefas_store.list_catalog()}


@app.get("/api/agent/tarefas", dependencies=[Depends(require_auth)])
def agent_list_tarefas(
    operador: str = Query("Gerente"),
    status: Optional[str] = Query(None),
    limit: int = Query(80, ge=1, le=200),
):
    return {"data": tarefas_store.list_tarefas(operador, status=status, limit=limit)}


@app.post("/api/agent/tarefas", dependencies=[Depends(require_auth)])
def agent_create_tarefa(body: TarefaCreateBody):
    try:
        return tarefas_store.create_tarefa(
            body.operador or "Gerente",
            titulo=body.titulo,
            descricao=body.descricao,
            prioridade=body.prioridade or "media",
            rotina_id=body.rotina_id,
            prompt=body.prompt,
            due_at=body.due_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/agent/tarefas/from-rotina", dependencies=[Depends(require_auth)])
def agent_tarefa_from_rotina(body: TarefaFromRotinaBody):
    try:
        return tarefas_store.create_from_rotina(body.operador or "Gerente", body.rotina_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/api/agent/tarefas/{tarefa_id}", dependencies=[Depends(require_auth)])
def agent_update_tarefa(tarefa_id: int, body: TarefaUpdateBody):
    try:
        return tarefas_store.update_tarefa(
            tarefa_id,
            status=body.status,
            titulo=body.titulo,
            descricao=body.descricao,
            prioridade=body.prioridade,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/api/agent/tarefas/{tarefa_id}", dependencies=[Depends(require_auth)])
def agent_delete_tarefa(tarefa_id: int):
    if not tarefas_store.delete_tarefa(tarefa_id):
        raise HTTPException(status_code=404, detail="tarefa não encontrada")
    return {"ok": True}


@app.get("/api/agent/rotinas/programadas", dependencies=[Depends(require_auth)])
def agent_list_rotinas_programadas(operador: str = Query("Gerente")):
    return {
        "data": tarefas_store.list_rotinas_programadas(operador),
        "devidas": tarefas_store.due_rotinas(operador),
    }


@app.put("/api/agent/rotinas/programadas", dependencies=[Depends(require_auth)])
def agent_upsert_rotina(body: RotinaProgramadaBody):
    try:
        return tarefas_store.upsert_rotina_programada(
            body.operador or "Gerente",
            body.rotina_id,
            schedule=body.schedule,
            hora=body.hora,
            weekday=body.weekday,
            ativo=body.ativo,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/agent/rotinas/programadas/{rotina_id}", dependencies=[Depends(require_auth)])
def agent_delete_rotina(rotina_id: str, operador: str = Query("Gerente")):
    if not tarefas_store.delete_rotina_programada(operador, rotina_id):
        raise HTTPException(status_code=404, detail="rotina não encontrada")
    return {"ok": True}


@app.post("/api/agent/rotinas/programadas/{rotina_id}/run", dependencies=[Depends(require_auth)])
def agent_run_rotina(rotina_id: str, operador: str = Query("Gerente")):
    """Marca execução e devolve o prompt da rotina (o front envia ao chat).

    Não cria tarefa de checklist: o trabalho vive na timeline do agente (AG-UI).
    """
    item = tarefas_store.get_catalog_item(rotina_id)
    if not item:
        raise HTTPException(status_code=404, detail="rotina desconhecida")
    marked = tarefas_store.mark_rotina_run(operador, rotina_id)
    return {
        "ok": True,
        "rotina": item,
        "programada": marked,
        "tarefa": None,
        "prompt": item["prompt"],
    }


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


@app.post("/api/vision/preanalyze", dependencies=[Depends(require_auth)])
def vision_preanalyze(body: VisionPreanalyzeBody):
    """Etapa 1 — análise técnica sem LLM (contraste, nitidez, ROIs sugeridas)."""
    import vision_cv

    return vision_cv.analyze_image_cv(body.imagem_data_url)


@app.post("/api/vision/crop", dependencies=[Depends(require_auth)])
def vision_crop(body: VisionCropBody):
    """Aplica crop normalizado e devolve nova data URL JPEG."""
    import vision_cv

    try:
        out = vision_cv.crop_data_url(body.imagem_data_url, list(body.bbox))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Crop falhou: {exc}"[:200]) from exc
    return {"ok": True, "imagem_data_url": out}


@app.post("/api/vision/analyze", dependencies=[Depends(require_auth)])
def vision_analyze(body: VisionAnalyzeBody, user=Depends(require_auth)):
    """OdontoVision — pipeline estruturado (validação → CV → LLM → pós).

    Segurança: modo=paciente exige paciente_id + consentimento_assistivo.
    persistir=true grava análise+imagem com retenção e audit trail.
    """
    import vision_service
    import vision_store

    modo = (body.modo or "estudo").strip().lower()
    if modo not in ("estudo", "paciente"):
        raise HTTPException(status_code=400, detail="modo inválido (estudo|paciente)")
    if body.persistir and modo != "paciente":
        raise HTTPException(
            status_code=400,
            detail="persistir exige modo=paciente com consentimento",
        )
    if modo == "paciente":
        if not body.paciente_id:
            raise HTTPException(status_code=400, detail="paciente_id obrigatório")
        if not body.consentimento_assistivo:
            raise HTTPException(
                status_code=400,
                detail="Marque o consentimento assistivo para vincular ao paciente",
            )
        import vision_consent

        if not vision_consent.paciente_tem_consentimento_atual(int(body.paciente_id)):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Paciente sem termo Vision assinado/registrado. "
                    "Registre o consentimento no cadastro do paciente antes de analisar."
                ),
            )

    op = (body.operador or "Dentista").strip() or "Dentista"
    sid = vision_session_id(op)
    ctx = (body.contexto_clinico or "").strip()
    modalidade = (body.modalidade_sugerida or "").strip()
    # Não gravar contexto clínico identificável no chat genérico quando vinculado
    if modo == "estudo":
        user_note = ctx or "Análise OdontoVision (estudo)"
        if modalidade:
            user_note = f"[{modalidade}] {user_note}"
        agent_store.append(sid, "user", user_note[:8000])
    else:
        agent_store.append(
            sid,
            "user",
            f"[OdontoVision paciente_id={body.paciente_id} modalidade={modalidade or 'auto'}]",
        )

    rois = None
    if body.rois:
        rois = []
        for r in body.rois[:8]:
            if isinstance(r, (list, tuple)) and len(r) == 4:
                try:
                    rois.append([float(r[0]), float(r[1]), float(r[2]), float(r[3])])
                except (TypeError, ValueError):
                    continue

    # Contexto enviado ao modelo: sem nome/telefone — só texto clínico + id interno se paciente
    ctx_llm = ctx
    if modo == "paciente" and body.paciente_id:
        ctx_llm = (f"[paciente_ref={body.paciente_id}] " + ctx).strip()

    result = vision_service.run_pipeline(
        body.imagem_data_url,
        contexto=ctx_llm,
        modalidade_sugerida=modalidade,
        operador=op,
        history=None,
        rois=rois,
        cv_preanalise=body.cv_preanalise if isinstance(body.cv_preanalise, dict) else None,
    )
    if not result.get("ok"):
        if result.get("estruturado"):
            agent_store.append(
                sid, "assistant", result.get("analise") or result.get("erro") or "falha"
            )
            return {
                "ok": False,
                "erro": result.get("erro"),
                "analise": result.get("analise") or result.get("erro"),
                "estruturado": result.get("estruturado"),
                "disclaimer": result.get("disclaimer") or vision_service.DISCLAIMER,
                "pipeline": result.get("pipeline") or [],
                "session_id": sid,
                "tech": result.get("tech"),
                "cv": result.get("cv"),
                "rois": result.get("rois") or rois or [],
                "analise_salva": None,
            }
        raise HTTPException(status_code=502, detail=result.get("erro") or "falha na análise")

    agent_store.append(sid, "assistant", (result.get("analise") or "")[:12000])

    analise_salva = None
    # Persistir: modo paciente + (persistir flag OU default true quando paciente)
    should_persist = modo == "paciente" and (
        body.persistir or body.consentimento_assistivo
    )
    if should_persist:
        try:
            estruturado = result.get("estruturado") or {}
            analise_salva = vision_store.create_analise(
                modo="paciente",
                paciente_id=int(body.paciente_id),
                consentimento_assistivo=True,
                operador_user_id=getattr(user, "id", None),
                operador_email=getattr(user, "email", None),
                operador_nome=op,
                modalidade=estruturado.get("modalidade") or modalidade or None,
                resumo=estruturado.get("resumo"),
                analise_md=result.get("analise"),
                estruturado=estruturado if isinstance(estruturado, dict) else None,
                disclaimer=result.get("disclaimer") or vision_service.DISCLAIMER,
                imagem_data_url=body.imagem_data_url,
                persist_image=True,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)[:240]) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"Falha ao persistir análise: {exc}"[:240]
            ) from exc
    elif modo == "estudo":
        # Registro efêmero sem imagem (auditoria de uso, sem PHI de imagem)
        try:
            estruturado = result.get("estruturado") or {}
            analise_salva = vision_store.create_analise(
                modo="estudo",
                paciente_id=None,
                consentimento_assistivo=False,
                operador_user_id=getattr(user, "id", None),
                operador_email=getattr(user, "email", None),
                operador_nome=op,
                modalidade=estruturado.get("modalidade") or modalidade or None,
                resumo=estruturado.get("resumo"),
                analise_md=None,  # estudo: não guardar markdown clínico longo
                estruturado={"modalidade": estruturado.get("modalidade")}
                if isinstance(estruturado, dict)
                else None,
                disclaimer=result.get("disclaimer") or vision_service.DISCLAIMER,
                imagem_data_url=None,
                persist_image=False,
            )
        except Exception:
            analise_salva = None

    return {
        "ok": True,
        "analise": result.get("analise"),
        "estruturado": result.get("estruturado"),
        "disclaimer": result.get("disclaimer") or vision_service.DISCLAIMER,
        "pipeline": result.get("pipeline") or [],
        "session_id": sid,
        "tech": result.get("tech"),
        "cv": result.get("cv"),
        "rois": result.get("rois") or rois or [],
        "analise_salva": analise_salva,
        "modo": modo,
        "paciente_id": body.paciente_id if modo == "paciente" else None,
    }


@app.get("/api/vision/analises", dependencies=[Depends(require_auth)])
def vision_list_analises(
    paciente_id: int = Query(..., ge=1),
    limit: int = Query(30, ge=1, le=100),
    user=Depends(require_auth),
):
    import vision_store

    try:
        data = vision_store.list_by_paciente(
            paciente_id,
            operador_user_id=getattr(user, "id", None),
            operador_email=getattr(user, "email", None),
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)[:200]) from exc
    return {"data": data}


@app.get("/api/vision/analises/{public_id}", dependencies=[Depends(require_auth)])
def vision_get_analise(public_id: str, user=Depends(require_auth)):
    import vision_store

    item = vision_store.get_analise(
        public_id,
        operador_user_id=getattr(user, "id", None),
        operador_email=getattr(user, "email", None),
    )
    if not item:
        raise HTTPException(status_code=404, detail="análise não encontrada")
    return {"data": item}


@app.get("/api/vision/analises/{public_id}/imagem", dependencies=[Depends(require_auth)])
def vision_get_imagem(public_id: str, user=Depends(require_auth)):
    import vision_store
    from fastapi.responses import FileResponse

    try:
        path, mime = vision_store.open_image(
            public_id,
            operador_user_id=getattr(user, "id", None),
            operador_email=getattr(user, "email", None),
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="imagem não encontrada")
    return FileResponse(
        path,
        media_type=mime,
        filename=f"vision-{public_id[:8]}.bin",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.delete("/api/vision/analises/{public_id}", dependencies=[Depends(require_auth)])
def vision_delete_analise(public_id: str, user=Depends(require_auth)):
    import vision_store

    ok = vision_store.soft_delete(
        public_id,
        operador_user_id=getattr(user, "id", None),
        operador_email=getattr(user, "email", None),
        reason="user",
    )
    if not ok:
        raise HTTPException(status_code=404, detail="análise não encontrada")
    return {"ok": True}


@app.post("/api/vision/entregavel", dependencies=[Depends(require_auth)])
def vision_entregavel(body: VisionEntregavelBody, user=Depends(require_auth)):
    """Gera parecer descritivo (tipo laudo) na biblioteca + pronto para PDF."""
    import vision_cv
    import vision_store

    estruturado = body.estruturado or {}
    if not isinstance(estruturado, dict):
        raise HTTPException(status_code=400, detail="estruturado inválido")
    brand = brand_store.get_brand() or {}
    clinica_cfg = {}
    try:
        clinica_cfg = clinic_config.get_clinica() or {}
    except Exception:
        clinica_cfg = {}
    clinica = (
        clinica_cfg.get("nome")
        or brand.get("nome_clinica")
        or brand.get("nome")
        or "Clínica"
    )
    corpo = vision_cv.build_laudo_markdown(estruturado, clinica=str(clinica)[:120])
    modalidade = str(estruturado.get("modalidade") or "exame").replace("_", " ")
    titulo = (body.titulo or "").strip() or f"Parecer descritivo — {modalidade}"
    op = (body.operador or "Dentista").strip() or "Dentista"
    meta = {
        "fonte": "odontovision",
        "modalidade": estruturado.get("modalidade"),
        "qualidade_tecnica": estruturado.get("qualidade_tecnica"),
    }
    if body.analise_public_id:
        meta["vision_public_id"] = body.analise_public_id
    if body.paciente_id:
        meta["paciente_id"] = body.paciente_id
    try:
        item = entregaveis_store.create_entregavel(
            tipo="laudo",
            titulo=titulo[:200],
            corpo_md=corpo,
            operador=op,
            origem="odontovision",
            meta=meta,
            status="pronto",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao salvar entregável: {exc}"[:240]) from exc
    if body.analise_public_id and item.get("id"):
        vision_store.link_entregavel(
            body.analise_public_id,
            int(item["id"]),
            operador_user_id=getattr(user, "id", None),
            operador_email=getattr(user, "email", None),
        )
    return {"ok": True, "entregavel": item}

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
