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


class AgentChatBody(BaseModel):
    mensagem: str = Field(..., min_length=0, max_length=4000)
    operador: Optional[str] = Field("Gerente", max_length=120)
    incluir_metricas: bool = True
    modo_interativo: bool = True
    anexos_ids: Optional[list[str]] = Field(default=None, max_length=5)

class EstudantesChatBody(BaseModel):
    mensagem: str = Field(..., min_length=0, max_length=4000)
    aluno: Optional[str] = Field("Estudante", max_length=120)
    anexos_ids: Optional[list[str]] = Field(default=None, max_length=5)


class VisionAnalyzeBody(BaseModel):
    imagem_data_url: str = Field(..., min_length=32, max_length=6_000_000)
    contexto_clinico: Optional[str] = Field(None, max_length=2000)
    operador: Optional[str] = Field("Estudante", max_length=120)
