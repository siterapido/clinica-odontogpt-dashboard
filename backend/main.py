from fastapi import FastAPI, Query, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from database import query, query_one
from auth import require_auth, create_token, revoke_token, DASH_PASSWORD
from models import LoginRequest, LoginResponse

app = FastAPI(title="OdontoGPT Dashboard API", version="1.1.0")

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

@app.get("/api/health")
def health():
    try:
        db_test = query_one("SELECT COUNT(*) as total FROM pacientes")
        return {"status": "ok", "db": "conectado", "total_pacientes": db_test["total"]}
    except Exception as e:
        return {"status": "error", "db": str(e)}
