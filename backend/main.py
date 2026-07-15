from fastapi import FastAPI, Query, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from database import query, query_one
from auth import require_auth, create_token, DASH_PASSWORD
from models import LoginRequest, LoginResponse

app = FastAPI(title="OdontoGPT Dashboard API", version="1.0.0")

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
        "SELECT COUNT(DISTINCT paciente_id) as total FROM agendamentos WHERE data >= date('now', '-3 hours', '-90 days')"
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
        "ultimos_agendamentos": ultimos_agendamentos,
    }


# ─── Pacientes ──────────────────────────────────────────────────────

@app.get("/api/pacientes", dependencies=[Depends(require_auth)])
def listar_pacientes(
    busca: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sql = "SELECT * FROM pacientes"
    params = []
    if busca:
        sql += " WHERE nome LIKE ? OR telefone LIKE ? OR whatsapp LIKE ?"
        params = [f"%{busca}%", f"%{busca}%", f"%{busca}%"]
    sql += " ORDER BY nome ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    pacientes = query(sql, tuple(params))
    # Contar total para paginação
    count_sql = "SELECT COUNT(*) as total FROM pacientes"
    if busca:
        count_sql += " WHERE nome LIKE ? OR telefone LIKE ? OR whatsapp LIKE ?"
    total = query_one(count_sql, tuple(params[:3] if busca else []))["total"]
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
    paciente["agendamentos"] = agendamentos
    paciente["prontuarios"] = prontuarios
    return paciente


# ─── Agendamentos ───────────────────────────────────────────────────

@app.get("/api/agendamentos", dependencies=[Depends(require_auth)])
def listar_agendamentos(
    status: Optional[str] = Query(None),
    data: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sql = """SELECT a.*, p.nome as paciente_nome, p.telefone
             FROM agendamentos a
             LEFT JOIN pacientes p ON a.paciente_id = p.id
             WHERE 1=1"""
    params = []
    if status:
        sql += " AND a.status = ?"
        params.append(status)
    if data:
        sql += " AND a.data = ?"
        params.append(data)
    sql += " ORDER BY a.data DESC, a.horario DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    return {"data": query(sql, tuple(params)), "limit": limit, "offset": offset}


# ─── Prontuários ────────────────────────────────────────────────────

@app.get("/api/prontuarios", dependencies=[Depends(require_auth)])
def listar_prontuarios(
    paciente_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    sql = """SELECT pr.*, p.nome as paciente_nome
             FROM prontuario pr
             LEFT JOIN pacientes p ON pr.paciente_id = p.id
             WHERE 1=1"""
    params = []
    if paciente_id:
        sql += " AND pr.paciente_id = ?"
        params.append(paciente_id)
    sql += " ORDER BY pr.data_atendimento DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    return {"data": query(sql, tuple(params)), "limit": limit, "offset": offset}


# ─── Health Check ───────────────────────────────────────────────────

@app.get("/api/health")
def health():
    try:
        db_test = query_one("SELECT COUNT(*) as total FROM pacientes")
        return {"status": "ok", "db": "conectado", "total_pacientes": db_test["total"]}
    except Exception as e:
        return {"status": "error", "db": str(e)}
