# Clinica OdontoGPT Dashboard

## Contexto do Projeto

**OdontoGPT** é um agente Hermes que gerencia uma clínica odontológica via WhatsApp (Evolution API).
Este projeto é o **dashboard web** da clínica, acessível em `clinica.odontogpt.com`.

## Stack

- **Backend**: Python FastAPI lendo SQLite direto
- **Frontend**: React + Vite (SPA)
- **Banco**: SQLite em `/root/.hermes-docker/odonto_gpt/data/crm.db`

## Schema do Banco (SQLite)

```sql
pacientes (id, nome, telefone, whatsapp, data_nascimento, indicacao, observacoes, created_at)
agendamentos (id, paciente_id, dentista, data, horario, status, procedimento, created_at)
prontuario (id, paciente_id, data_atendimento, dentista, procedimento, queixa_principal, exame_clinico, diagnostico, plano_tratamento, observacoes, proximo_retorno_dias, created_at)
interacoes (id, paciente_id, tipo, mensagem, classificacao, created_at)
lembretes (id, agendamento_id, paciente_id, tipo, data_envio, mensagem, status, tentativas, erro, created_at, enviado_at)
```

## Identidade Visual (do SOUL.md OdontoGPT)

- **Nome**: OdontoGPT — Clínica do Futuro
- **Tom**: Acolhedor, profissional, claro
- **Cores sugeridas**: Branco (clean, clínica), com toques de azul/sage (saúde, confiança)
- **Público**: Donos/gerentes de clínica (dashboard operacional)
- **Não usar**: Temas escuros pesados, cores agressivas, design "tech" demais

## Funcionalidades do Dashboard

1. **Lista de Pacientes** — tabela com busca, filtros, visualização de detalhes
2. **Agendamentos** — calendário/lista de consultas, status (confirmado, realizado, cancelado)
3. **Prontuários** — visualização por paciente, histórico de atendimentos
4. **Métricas rápidas** — cards com total de pacientes, agendamentos do dia, etc.

## Arquitetura

```
/root/clinica-odontogpt-dashboard/
├── backend/
│   ├── main.py          # FastAPI app
│   ├── database.py      # SQLite connection
│   ├── models.py        # Pydantic models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── api.js       # Fetch wrapper
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
```

## Requisitos técnicos

- Backend roda na porta 8000 (localhost)
- Frontend build vai pra `frontend/dist/`
- Nginx/Caddy serve o estático em `clinica.odontogpt.com` com proxy `/api/*` → `localhost:8000`
- Banco é acessado em modo leitura (read-only) do path do host

## Design Direction

Aplicar os princípios de **frontend-design** + **premium-web-visuals**:
- **Anchor**: Organic — clínica de saúde, cores terra suaves, tipografia humanista
  - Superfície: off-white `#FAFAF8` com toques sage `#8B9D83`
  - Tipografia: Inter (limpa, profissional) para dados; opcional serif para títulos
  - Cantos arredondados 12-16px, sombras suaves
  - Sem cores escuras pesadas — é uma clínica, não um terminal
- **Content discipline**: Usar labels reais (Nome, Telefone, Status, Data). Nada de "lorem ipsum" ou dados fabricados. Se não há dados reais, mostrar estado vazio com mensagem clara.
- **Abstract > Literal**: Nada de clipart de dente. Usar formas geométricas abstratas, gradientes suaves em tons sage/off-white.
- **Differentiator**: Cards com micro-interação de hover (elevação suave + borda colorida), transições de 300ms ease.

## Comandos

```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev

# Build produção
cd frontend && npm run build
```
