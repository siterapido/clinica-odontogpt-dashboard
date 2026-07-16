# Spec: Princípios AG-UI no OdontoGPT + Console do Agente

**Data:** 2026-07-16  
**Status:** Aprovado para implementação  
**Produto:** Clinica OdontoGPT Dashboard (`clinica.odontogpt.com`)  
**Referência conceitual:** [AG-UI Protocol](https://docs.ag-ui.com/introduction)  
**Escopo:** Princípios de produto/UX em todo o projeto + redesign da rota `/agente`

---

## 1. Tese

O gestor não interage com um “chatbot”. Interage com um **agente autônomo da operação da clínica** — com estado, trabalho intermediário, entregas e alertas.

[AG-UI](https://docs.ag-ui.com/introduction) formaliza a camada **Agent ↔ User**: stream de eventos, estado compartilhado, tool visibility, generative UI, human-in-the-loop.  
**Nesta fase não adotamos o wire protocol AG-UI completo** (sem CopilotKit/LangGraph obrigatório). Adotamos os **princípios de experiência e o contrato mental de eventos** em toda a superfície do dashboard, começando por `/agente`.

---

## 2. Mapa de princípios AG-UI → OdontoGPT

| Princípio AG-UI | Significado para o gestor | Onde aplicar no projeto |
|-----------------|---------------------------|-------------------------|
| **Streaming / long-running** | O agente trabalha no tempo; a UI mostra progresso | `/agente` timeline; futuro: jobs longos (relatórios) |
| **Shared state** | App e agente leem a mesma “verdade da clínica” | Briefing, métricas, alertas; Dashboard/Agenda alimentam o agente |
| **Thinking steps (sem CoT cru)** | Passos legíveis: “li agenda”, “crucei lembretes” | Timeline do agente ao processar |
| **Backend tool rendering** | Ferramentas viram cards (não JSON) | Entregas, alertas, resumos financeiros |
| **Generative UI (typed)** | Respostas viram componentes tipados | `relatorio`, `alerta`, `acao_sugerida`, `agenda_resumo` |
| **Human-in-the-loop** | Aprovar/editar antes de efeito sensível | Futuro: confirmar reenvio de lembretes, campanhas |
| **Multimodality** | Imagem, PDF, voz como input de trabalho | Composer do agente (já existe) |
| **Agent steering** | Gestor redireciona a missão | Composer “Ordene o agente…” + rotinas |
| **No protocol leak** | Zero Hermes/model/provider na UI | Erros humanizados (já); status de missão |

### 2.1 O que NÃO é AG-UI neste projeto

- Não é terminal dark / DevOps.
- Não é painel de skills Hermes.
- Não é chat WhatsApp copiado para o admin.
- Não é obrigatório instalar `@ag-ui/*` nesta sprint.

### 2.2 Camadas do ecossistema (clareza)

| Camada | Protocolo | No OdontoGPT hoje |
|--------|-----------|-------------------|
| Agent ↔ User | AG-UI (princípios) | Dashboard `/agente` |
| Agent ↔ Tools/Data | MCP / skills / CRM SQLite | Hermes skills + FastAPI read |
| Agent ↔ Agent | A2A | Fora de escopo |

---

## 3. Princípios de produto em **todo** o dashboard

### P1 — Superfície = trabalho, não conversa
Toda área que o agente toca deve priorizar **resultado operacional** (número, alerta, entrega, ação) sobre bolhas de texto.

### P2 — Estado da clínica é shared state
`clinic_briefing`, métricas, ocupação, NPS e financeiro são a “memória operacional” que o agente e as telas compartilham. Não inventar dados na UI.

### P3 — Progresso visível
Operações longas (chat, análise de RX, relatório) mostram **steps** ou skeleton com significado, nunca spinner mudo genérico de “sistema”.

### P4 — Configuração fora do caminho crítico
Preferências (nome, tom, habilidades) existem, mas **não** competem com a missão do dia. Ficam em ⚙ / Configurações.

### P5 — Copy de autonomia
- Evitar: “Online”, “Digite sua mensagem”, “Assistente digitando…”
- Preferir: “Observando a operação”, “Trabalhando em…”, “Ordene o agente…”, “Missão do dia”

### P6 — Entregas = artefatos de primeira classe
Relatórios e pautas são objetos (abrir, baixar, ajustar), não só parágrafos no chat.

### P7 — Human-in-the-loop progressive
Fase atual: orientação e artefatos.  
Fase seguinte: aprovar ações que alteram CRM/WhatsApp.

### P8 — Design system clínica
Tokens surface/teal/navy; humanizado; sem HUD de terminal. AG-UI é comportamento, não skin cyberpunk.

### P9 — Telas satélite
| Tela | Princípio aplicado |
|------|-------------------|
| Dashboard | Shared state + alertas acionáveis (“pedir ao agente”) |
| Agenda | Estado + gap → ordem ao agente |
| Financeiro | Cards tipados; “pedir análise ao agente” |
| Conversas WhatsApp | Separar: canal paciente ≠ console do gestor |
| `/agente` | Console AG-UI-inspired (esta spec §4) |

---

## 4. Redesign `/agente` — Console do Agente Autônomo

### 4.1 Problema da UI anterior
- 3 colunas densas; Identidade + habilidades sempre à vista.
- Metáfora de chat comum (bolhas, “Online”).
- Trabalho do agente invisível entre pergunta e resposta.
- Pouca usabilidade para o fluxo real: ver risco → ordenar → receber entrega.

### 4.2 Layout (desktop ≥ lg)

```
┌──────────────────────────────────────────────────────────────┐
│  {Nome} · Agente da clínica     [● status missão]    [⚙][📄] │
├─────────────────┬────────────────────────────────────────────┤
│ MISSÃO DO DIA   │  LINHA DO TEMPO DE TRABALHO                │
│ pulse + alertas │  eventos: ordem · passo · resposta · artefato│
│ rotinas         │                                            │
│                 │  composer: “Ordene o agente…”              │
└─────────────────┴────────────────────────────────────────────┘
```

| Zona | Largura | Conteúdo |
|------|---------|----------|
| Header | full | Identidade mínima (nome), status de missão, ⚙ config, 📄 entregas (sheet) |
| Esquerda | ~280px | Missão do dia (ex-Observatório): pulse, alertas, rotinas |
| Centro | flex-1 | Timeline de trabalho + composer |
| Direita | **removida** | Preferências e toggles **não** ficam fixos |

Mobile: timeline full; Missão e Config/Entregas em sheets.

### 4.3 O que fica escondido (⚙ Configurações)
- Nome do agente  
- Tom de voz (5 presets)  
- Pacotes de habilidade  
- Nome do gestor no histórico  

Defaults no backend; modal só quando o gestor quiser personalizar.

### 4.4 Status de missão (não “Online”)

| Estado | Label UI |
|--------|----------|
| idle | Observando a operação |
| working | Trabalhando na sua ordem… |
| reading_media | Analisando o que você enviou… |
| building_report | Montando entrega… |
| error | Não concluí — tente de novo |

### 4.5 Timeline (metáfora principal)

Tipos de item:
1. **ordem** (gestor) — pedido + anexos  
2. **passo** (agente) — step legível durante `sending`  
3. **resposta** (agente) — texto  
4. **artefato** (entrega) — card relatorio/apresentacao  

Empty state:
> Estou acompanhando a clínica. Posso rodar o briefing, caçar riscos ou montar um relatório — ou diga o que priorizar.

Composer placeholder: `Ordene o agente… (texto, anexo ou voz)`

### 4.6 Steps durante trabalho (v1)

Enquanto `sending`, a UI mostra 2–4 passos progressivos (client-side, baseados no pedido):

- genérico: “Lendo o estado da clínica” → “Cruzando prioridades” → “Preparando resposta”
- com imagem: “Abrindo anexo” → “Descrevendo achados visíveis” → …
- relatório: “Coletando briefing” → “Estruturando relatório” → …

v2: steps vindos do backend/stream (eventos estilo AG-UI).

### 4.7 APIs
Sem breaking change obrigatório:
- Preferências e entregas já existem; UI só as esconde atrás de ⚙/📄  
- Chat e briefing inalterados no contrato  

Opcional futuro: `activity: [{id, label, status}]` no response.

---

## 5. Critérios de sucesso (avaliação ~9/10)

1. Gestor em `/agente` **não** vê Identidade/habilidades na home — só em ⚙.  
2. Metáfora dominante = **timeline de trabalho**, não chat WhatsApp.  
3. Status de missão legível e autônomo.  
4. Composer e empty state com copy de ordem ao agente.  
5. Alertas da missão disparam ordens na timeline.  
6. Entregas acessíveis (sheet 📄 + cards na timeline).  
7. Tokens do design system; sem terminal.  
8. Deploy em `clinica.odontogpt.com/agente` com bundle novo.  
9. Preferências ainda funcionam no modal.  
10. Spec de princípios documentada para o resto do projeto.

---

## 6. Fora de escopo (esta implementação)

- Wire protocol AG-UI / SSE completo  
- CopilotKit dependency  
- HITL que grava CRM/WhatsApp  
- PPTX nativo  
- Multi-agente  

---

## 7. Implementação (esta entrega)

| Arquivo | Mudança |
|---------|---------|
| `docs/superpowers/specs/2026-07-16-ag-ui-principles-agent-console.md` | Esta spec |
| `frontend/src/pages/AgenteAdmin.jsx` | Console 2 colunas + header ⚙/📄 |
| `frontend/src/components/agente/ChatWorkspace.jsx` | Timeline + steps + copy |
| `frontend/src/components/agente/Observatorio.jsx` | Missão do dia (labels) |
| `frontend/src/components/agente/ConfigAgenteModal.jsx` | Modal prefs escondidas |
| `frontend/src/components/agente/EntregasSheet.jsx` | Sheet de entregas |
| Deploy | `frontend/dist` → `/srv/clinica-odontogpt-dashboard` + restart API se preciso |

---

## 8. Evolução (backlog alinhado AG-UI)

1. SSE token stream no chat admin  
2. Eventos tipados no JSON (`type: tool|step|artifact`)  
3. HITL: aprovar reenvio de lembrete  
4. Deep-links Dashboard → `/agente?ordem=...`  
5. Adapter AG-UI se runtime Hermes emitir tools de forma estável  
