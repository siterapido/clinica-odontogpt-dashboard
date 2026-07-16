from pydantic import BaseModel, Field
from typing import Optional


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


class PacienteCreate(BaseModel):
    nome: str
    telefone: str
    data_nascimento: Optional[str] = None
    indicacao: Optional[str] = None
    observacoes: Optional[str] = None


class PacienteUpdate(BaseModel):
    nome: Optional[str] = None
    telefone: Optional[str] = None
    data_nascimento: Optional[str] = None
    indicacao: Optional[str] = None
    observacoes: Optional[str] = None


class AgendamentoCreate(BaseModel):
    paciente_id: int
    data: str = Field(description="YYYY-MM-DD")
    horario: str = Field(description="HH:MM")
    procedimento: str
    dentista: Optional[str] = None


class AgendamentoUpdate(BaseModel):
    status: Optional[str] = None
    data: Optional[str] = None
    horario: Optional[str] = None
    procedimento: Optional[str] = None
    dentista: Optional[str] = None


class ProntuarioCreate(BaseModel):
    paciente_id: int
    procedimento: str
    data_atendimento: Optional[str] = None
    dentista: Optional[str] = None
    queixa_principal: Optional[str] = None
    exame_clinico: Optional[str] = None
    diagnostico: Optional[str] = None
    plano_tratamento: Optional[str] = None
    observacoes: Optional[str] = None
    proximo_retorno_dias: Optional[int] = None


class ProntuarioUpdate(BaseModel):
    procedimento: Optional[str] = None
    data_atendimento: Optional[str] = None
    dentista: Optional[str] = None
    queixa_principal: Optional[str] = None
    exame_clinico: Optional[str] = None
    diagnostico: Optional[str] = None
    plano_tratamento: Optional[str] = None
    observacoes: Optional[str] = None
    proximo_retorno_dias: Optional[int] = None


class ChatEnviarBody(BaseModel):
    mensagem: str = Field(..., min_length=1, max_length=4000)
    atendente: Optional[str] = Field(None, max_length=120)


class ChatAssumirBody(BaseModel):
    atendente: str = Field(..., min_length=1, max_length=120)


class ChatTesteBody(BaseModel):
    """Mensagem como se fosse o paciente (simulador)."""
    mensagem: str = Field(..., min_length=1, max_length=4000)


class DentistaHorarioItem(BaseModel):
    dia_semana: int = Field(..., ge=0, le=6, description="0=Dom … 6=Sáb")
    hora_inicio: str = Field(..., min_length=4, max_length=5)
    hora_fim: str = Field(..., min_length=4, max_length=5)
    ativo: bool = True


class DentistaBody(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    cro: Optional[str] = Field(None, max_length=40)
    especialidade: Optional[str] = Field(None, max_length=120)
    telefone: Optional[str] = Field(None, max_length=30)
    email: Optional[str] = Field(None, max_length=120)
    cor: Optional[str] = Field(None, max_length=20)
    ativo: bool = True
    observacoes: Optional[str] = Field(None, max_length=2000)
    horarios: Optional[list[DentistaHorarioItem]] = None


class DentistaUpdateBody(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=200)
    cro: Optional[str] = Field(None, max_length=40)
    especialidade: Optional[str] = Field(None, max_length=120)
    telefone: Optional[str] = Field(None, max_length=30)
    email: Optional[str] = Field(None, max_length=120)
    cor: Optional[str] = Field(None, max_length=20)
    ativo: Optional[bool] = None
    observacoes: Optional[str] = Field(None, max_length=2000)
    horarios: Optional[list[DentistaHorarioItem]] = None


class ClinicaBody(BaseModel):
    """Cadastro / dados da clínica."""
    clinica_nome: Optional[str] = Field(None, max_length=200)
    clinica_razao_social: Optional[str] = Field(None, max_length=200)
    clinica_cnpj: Optional[str] = Field(None, max_length=20)
    clinica_endereco: Optional[str] = Field(None, max_length=300)
    clinica_numero: Optional[str] = Field(None, max_length=20)
    clinica_complemento: Optional[str] = Field(None, max_length=100)
    clinica_bairro: Optional[str] = Field(None, max_length=100)
    clinica_cidade: Optional[str] = Field(None, max_length=100)
    clinica_estado: Optional[str] = Field(None, max_length=2)
    clinica_cep: Optional[str] = Field(None, max_length=12)
    clinica_telefone: Optional[str] = Field(None, max_length=30)
    clinica_whatsapp: Optional[str] = Field(None, max_length=30)
    clinica_email: Optional[str] = Field(None, max_length=120)
    clinica_instagram: Optional[str] = Field(None, max_length=120)
    clinica_site: Optional[str] = Field(None, max_length=200)
    horario_comercial_inicio: Optional[str] = Field(None, max_length=5)
    horario_comercial_fim: Optional[str] = Field(None, max_length=5)
    dias_funcionamento: Optional[str] = Field(None, max_length=120)
    timezone: Optional[str] = Field(None, max_length=60)
    clinica_sobre: Optional[str] = Field(None, max_length=2000)
    formas_pagamento: Optional[str] = Field(None, max_length=500)
    convenios: Optional[str] = Field(None, max_length=500)


class AgentChatBody(BaseModel):
    mensagem: str = Field(..., min_length=0, max_length=4000)
    operador: Optional[str] = Field("Gerente", max_length=120)
    incluir_metricas: bool = True
    modo_interativo: bool = True
    anexos_ids: Optional[list[str]] = Field(default=None, max_length=5)


class AgentPreferenciasBody(BaseModel):
    operador: Optional[str] = Field("Gerente", max_length=120)
    nome_agente: str = Field("OdontoGPT", min_length=1, max_length=80)
    tom: str = Field("acolhedor", max_length=40)
    habilidades: Optional[dict[str, bool]] = None


class EstudantesChatBody(BaseModel):
    mensagem: str = Field(..., min_length=0, max_length=4000)
    aluno: Optional[str] = Field("Estudante", max_length=120)
    anexos_ids: Optional[list[str]] = Field(default=None, max_length=5)


class VisionAnalyzeBody(BaseModel):
    imagem_data_url: str = Field(..., min_length=32, max_length=6_000_000)
    contexto_clinico: Optional[str] = Field(None, max_length=2000)
    operador: Optional[str] = Field("Estudante", max_length=120)


# ─── V2: orçamentos, financeiro, lista espera ───────────────────────

class OrcamentoItemBody(BaseModel):
    procedimento_id: Optional[int] = None
    descricao: str = Field(..., min_length=1, max_length=300)
    quantidade: float = 1
    valor_unitario: float
    dente_regiao: Optional[str] = None


class OrcamentoCreateBody(BaseModel):
    paciente_id: int
    itens: list[OrcamentoItemBody]
    dentista_id: Optional[int] = None
    desconto_pct: float = 0
    desconto_valor: float = 0
    validade_dias: int = 15
    forma_pagamento_sugerida: Optional[str] = None
    parcelas_max: int = 1
    observacoes: Optional[str] = None


class OrcamentoStatusBody(BaseModel):
    status: str
    motivo_recusa: Optional[str] = None


class PagamentoBody(BaseModel):
    paciente_id: int
    valor: float
    forma: str = Field(..., min_length=1, max_length=40)
    status: str = "pago"
    tipo: str = "recebimento"
    orcamento_id: Optional[int] = None
    agendamento_id: Optional[int] = None
    data_vencimento: Optional[str] = None
    data_pagamento: Optional[str] = None
    parcela_num: Optional[int] = None
    parcela_total: Optional[int] = None
    observacoes: Optional[str] = None
    created_by: Optional[str] = "dashboard"


class ListaEsperaBody(BaseModel):
    paciente_id: int
    procedimento: Optional[str] = None
    dentista_id: Optional[int] = None
    prioridade: int = 50
    periodo_preferido: str = "qualquer"
    notas: Optional[str] = None


class ListaEsperaStatusBody(BaseModel):
    status: str
    ofertado_agendamento_id: Optional[int] = None


class ProcedimentoBody(BaseModel):
    id: Optional[int] = None
    codigo: Optional[str] = None
    nome: str
    categoria: Optional[str] = None
    duracao_min: int = 30
    valor_particular: Optional[float] = None
    ativo: bool = True
    requer_avaliacao: bool = False
    observacoes: Optional[str] = None


class NpsBody(BaseModel):
    paciente_id: int
    score: int = Field(..., ge=0, le=10)
    comentario: Optional[str] = None
    agendamento_id: Optional[int] = None


class ConfirmAgendamentoBody(BaseModel):
    acao: str = Field(..., description="confirmar|cancelar|noshow")
    motivo: Optional[str] = None
