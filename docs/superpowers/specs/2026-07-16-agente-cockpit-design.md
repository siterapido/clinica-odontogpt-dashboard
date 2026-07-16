# Design: Cockpit do Agente (`/agente`)

**Data:** 2026-07-16  
**Produto:** Clinica OdontoGPT Dashboard (`clinica.odontogpt.com`)  
**Status:** Aprovado em brainstorming — aguardando revisão final do gestor antes do plano de implementação  
**Rota:** `/agente` (label na sidebar: Assistente / Agente)

---

## 1. Problema e objetivo

A aba atual já oferece chat admin com anexos, ditado e briefing lateral, mas parece um assistente genérico. O gestor precisa de um **posto de comando humanizado**: um agente especializado nos dados e na operação da clínica, proativo no dia a dia, capaz de entregar relatórios e apresentações — sem expor o backend Hermes e sem virar terminal/dark-tech.

### Objetivos

1. Interface **humanizada** (conversa com um colega de confiança), não terminal.
2. Layout **cockpit em 3 colunas**: Observatório · Conversa · Seu agente.
3. Preferências de **nome + tom de voz** (presets) e **habilidades por área de negócio**.
4. **Entregas** (relatórios / outlines de apresentação) no chat + painel + download `.md`.
5. Manter tokens e UIUX do projeto (surface, navy, teal, clínica premium).
6. Proxy seguro: preferências e chat via API do dashboard; Hermes/OpenRouter só no backend.

### Não-objetivos (esta versão)

- Controle direto do Hermes (start/stop, logs, tools raw, profiles)
- TTS / prévia de voz real
- Geração nativa de `.pptx` / PDF tipográfico
- Multi-agente ou handoff entre perfis
- Write no CRM via chat (orientação/leitura; mutações nas telas próprias)
- Notificações push fora do dashboard
- Tema dark exclusivo na rota

---

## 2. Decisões de design (aprovadas)

| Tema | Decisão |
|------|----------|
| Layout | **Cockpit 3 colunas** (não hub de abas, não chat full-bleed puro, não dashboard-first) |
| Habilidades | **Pacotes por área de negócio** (não checklist fino Hermes, não só presets) |
| Personalidade | **Nome + 4–5 tons pré-configurados** (sem sliders, sem TTS) |
| Entregas | **Chat + painel de artefatos**; markdown + download `.md`; sem PPTX nativo |
| Visual | **Chat humanizado** dentro do design system; sem estética de terminal |

---

## 3. Shell visual e arquitetura da página

### Layout desktop (≥ lg)

| Zona | Largura | Papel |
|------|---------|--------|
| **Esquerda — Observatório** | ~280–320px | Pulse, alertas proativos, próximos do dia, atalhos de conversa |
| **Centro — Conversa** | flex-1 | Header de identidade, thread, composer multimídia |
| **Direita — Seu agente** | ~300–340px, colapsável | Nome, tom, habilidades, entregas |

### Layout mobile / tablet

- Centro em full height
- Observatório e “Seu agente” em **drawers** acionados por ícones no header

### Linguagem visual (humanizada)

- **Usar:** bolhas suaves, avatar com iniciais do nome do agente, Inter no corpo, Fraunces em títulos/números, cards do design system, motion de entrada leve nas mensagens.
- **Evitar:** grid cyber, mono no corpo do chat, glow de HUD/console, logs, IDs de sessão, menção a modelo/provider/Hermes.
- **Tokens:** `surface`, `surface-2`, `brand`, `accent` teal, borders warm — alinhado a `index.css` e PRODUCT.md.
- **Acessibilidade:** status nunca só por cor; `prefers-reduced-motion` desliga animações.

### Princípio de produto (não-Hermes)

Labels de negócio apenas: “Habilidades da clínica”, “Tom de conversa”, “Entregas”. Preferências do gestor são **contexto de produto** injetado no system prompt admin no backend.

### App shell

- Manter full-height na rota `/agente` (`App.jsx` já trata `isAssistente`).
- Opcional no plano de implementação: renomear item da sidebar de “Assistente” para “Agente” (copy).

---

## 4. Observatório (coluna esquerda)

### Blocos

1. **Cabeçalho** — “Hoje na clínica” + “Atualizado às HH:mm”
2. **Pulse** — cards a partir de `clinic_briefing()`:

| Campo briefing | Label UI | Destaque |
|----------------|----------|----------|
| `agendamentos_hoje` | Consultas hoje | — |
| `confirmados_hoje` | Confirmadas | — |
| `lembretes_falhos` | Lembretes com problema | > 0 → warning |
| `pacientes_sem_retorno_120d` | Sem retorno há tempo | atenção suave se alto |
| `novos_pacientes_7d` | Novos pacientes (7 dias) | — |
| `conversas_recentes_48h` | Conversas recentes | — |

3. **Alertas proativos** — `briefing.alertas`; cartões acionáveis (info | warning) com ícone + texto; clique envia/preenche prompt natural no chat. Empty: “Nenhum alerta agora — a operação está estável.”
4. **Próximos de hoje** — lista compacta; clique opcional pede contexto da consulta.
5. **Atalhos** — `quick_prompts` + chips de entrega (“Preparar relatório do dia”, “Rascunho de apresentação semanal”).

### Comportamento

- `GET /api/agent/briefing` ao montar; refresh silencioso ~60s
- Cliques **não** navegam para outras rotas — só conversam com o agente

---

## 5. Workspace do chat (centro)

### Header

- Avatar (iniciais do nome do agente, fundo `accent-soft`)
- Nome + “Assistente da clínica · {label do tom}”
- Status natural: `Online` | `Lendo o que você enviou…` | `Pensando na operação…` | textos contextuais (imagem / relatório)

### Thread

- Gestor à direita (bolha accent); agente à esquerda (surface-1 + borda), com **nome do agente** acima do texto
- Anexos como chips; entregas como **cards embutidos**
- Empty state: convite com nome + 2–3 sugestões clicáveis

### Composer

- Placeholder: “Escreva, anexe um arquivo ou use o microfone…”
- Anexar: `image/*`, `.pdf`, `.txt`, `audio/*` (máx. 5, API atual)
- Microfone: Web Speech API; fallback amigável se sem suporte
- Enter envia; Shift+Enter nova linha
- Prévia de anexos pendentes com remover

### Fluxo técnico (essência atual)

1. `uploadAgentFile` → `anexos_ids`
2. `enviarAgentChat` com preferências injetadas no backend
3. Histórico por **operador** (gestor); nome do **agente** = identidade UI + system prompt

### Estados de espera humanizados

- Sem anexo: “Organizando o que vi na clínica…”
- Com imagem: “Olhando o que você anexou…”
- Relatório: “Montando o relatório…”

---

## 6. Controles do gestor (coluna direita)

### 6.1 Identidade

| Campo | UI | Default |
|-------|-----|---------|
| Nome do agente | Input texto | `OdontoGPT` ou último salvo |
| Tom | 5 opções tipo radio/cards | `acolhedor` |

**Tons**

| id | Label | Comportamento no prompt |
|----|--------|-------------------------|
| `acolhedor` | Acolhedor | Caloroso, claro, empoderador |
| `executivo` | Direto & executivo | Bullets, priorização, pouca prosa |
| `clinico` | Técnico-clínico | Preciso, cautela diagnóstica |
| `didatico` | Didático | Explica o porquê |
| `proativo` | Proativo | Antecipa riscos, sugere 3 próximos passos |

Preview estático sob o tom (texto de exemplo fixo, sem TTS).

Campo discreto **“Seu nome no histórico”** (operador) — identifica sessão do gestor, distinto do nome do agente.

### 6.2 Habilidades (pacotes)

| id | Label | Efeito no contexto |
|----|--------|--------------------|
| `agenda` | Agenda & ocupação | Agenda, confirmações, encaixes |
| `financeiro` | Financeiro | Caixa / a receber / métricas financeiras |
| `reativacao` | Reativação de pacientes | Inativos e retorno |
| `imagens` | Análise de imagens / documentos | RX, fotos, PDF |
| `relatorios` | Relatórios executivos | Artefato relatório |
| `apresentacoes` | Apresentações | Outline / pauta |
| `alertas` | Alertas proativos | Ênfase em alertas do observatório |

- Default: todos **habilitados** (ou: agenda, alertas, imagens, relatorios, reativacao on; demais on por simplicidade — **default = todos on**)
- Desligado: prompt instrui a não propor a área e explicar que está desligada nas preferências

### 6.3 Entregas

Lista da sessão do operador:

- Tipo: `relatorio` | `apresentacao`
- Título, timestamp, preview
- Ações: Abrir (markdown simples), Baixar `.md`, Pedir ajuste no chat

**Formato de extração (LLM)**

```
:::entrega tipo="relatorio" titulo="Resumo operacional — 16/07"
... markdown ...
:::
```

- Parser resiliente no backend (preferencial) ou front
- Persistir em `meta_json` da mensagem + store de entregas
- Se o modelo ignorar o delimitador: mensagem normal (sem quebrar chat)

---

## 7. APIs e persistência

### Novas rotas

```
GET  /api/agent/preferencias?operador=
PUT  /api/agent/preferencias
     body: {
       "operador": "Gerente",
       "nome_agente": "Luna",
       "tom": "acolhedor",
       "habilidades": {
         "agenda": true,
         "financeiro": true,
         "reativacao": true,
         "imagens": true,
         "relatorios": true,
         "apresentacoes": true,
         "alertas": true
       }
     }

GET  /api/agent/entregas?operador=
```

Resposta de preferências deve incluir defaults se não houver registro.

### Rotas existentes (extensões)

| Endpoint | Mudança |
|----------|---------|
| `POST /api/agent/chat` | Carrega preferências; monta system prompt (nome, tom, skills); tenta extrair `:::entrega`; grava meta/entrega |
| `GET /api/agent/mensagens` | `meta` pode incluir objeto `entrega` |
| `GET /api/agent/briefing` | Sem mudança de contrato |
| `POST /api/agent/upload` | Sem mudança |

### Storage (SQLite do dashboard)

- Estender `agent_store.py`:
  - `admin_agent_preferencias` (operador PK, nome_agente, tom, habilidades_json, updated_at)
  - `admin_agent_entregas` (id, session_id, message_id, tipo, titulo, corpo_md, created_at) **ou** só meta nas mensagens se for suficiente — **preferência: tabela dedicada + meta na mensagem** para o painel listar sem parsear todo o histórico
- **Não** gravar em profile Hermes / filesystem de skills

### System prompt dinâmico

Base atual de `hermes_agent_client.ADMIN_SYSTEM` + blocos:

1. “Seu nome nesta conversa é {nome_agente}.”
2. Instruções do tom selecionado
3. Lista de áreas habilitadas / desabilitadas
4. Instrução de formato `:::entrega` quando relatorios/apresentacoes estiverem on e o usuário pedir entrega formal
5. Manter: PT-BR, não inventar dados, não revelar PII, não citar modelo/provider

---

## 8. Frontend — estrutura de arquivos

```
frontend/src/
  pages/AgenteAdmin.jsx                 # orquestra cockpit + drawers mobile
  components/agente/
    Observatorio.jsx
    ChatWorkspace.jsx
    PreferenciasAgente.jsx
    EntregasPanel.jsx
    EntregaCard.jsx
  api.js                                # get/put preferencias, get entregas
```

CSS: keyframes mínimas (entrada de mensagem, pulse suave de status) em `index.css`, com `prefers-reduced-motion`.

---

## 9. Estados de erro (copy humanizada)

| Situação | Mensagem |
|----------|----------|
| LLM 502 | “Não consegui responder agora. Tente de novo em instantes.” |
| Upload inválido | Mensagem amigável a partir do detail da API |
| Mic sem suporte | “Neste navegador o microfone não está disponível. Use Chrome ou Edge, ou digite.” |
| Preferências falham | “Não salvei as preferências.” + retry; estado local mantido |
| Carregando | “Carregando conversa…” / skeletons |

Nunca: stack trace, nome de modelo, URL Hermes, path de skill.

---

## 10. Critérios de sucesso

1. Em &lt; 3 s ao abrir `/agente`: conversa + pulse + “Seu agente” visíveis (desktop).
2. Renomear agente e trocar tom → **próxima** resposta reflete o tom/nome.
3. Desligar pacote (ex. Financeiro) → agente recusa/redireciona com elegância.
4. Anexar imagem/PDF e perguntar o que vê → funciona como hoje.
5. “Relatório do dia” → card no thread + item no painel + download `.md`.
6. Clique em alerta → conversa útil, permanece em `/agente`.
7. Visual humanizado, tokens do projeto, sem cara de terminal.
8. Mobile: chat full + drawers Observatório e Seu agente.
9. Smokes das APIs agent existentes continuam OK; novas rotas autenticadas respondem.

---

## 11. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| LLM ignora `:::entrega` | Fallback texto normal; re-prompt via atalho |
| Prompt inchado | Uma linha por pacote no system |
| Preferências só no client | Persistência server-side por operador |
| Escopo de UI | Subcomponentes; sem lib nova de chat |
| Conflito “tech” vs clínica | Humanizado + tokens do projeto (decisão explícita) |

---

## 12. Plano de implementação (alto nível)

Ordem sugerida para o skill `writing-plans` detalhar:

1. Schema + API preferências e entregas (`agent_store`, `main.py`)
2. System prompt dinâmico + parser de entrega no chat (`hermes_agent_client` / `agent_chat`)
3. Componentes Observatório / Chat / Preferências / Entregas
4. Orquestração `AgenteAdmin` + drawers mobile
5. API client frontend
6. Testes manuais + smoke quality_score se aplicável
7. Build frontend

---

## 13. Referências no código atual

- `frontend/src/pages/AgenteAdmin.jsx` — UI atual a substituir/refatorar
- `frontend/src/api.js` — `getAgentMensagens`, `enviarAgentChat`, `getAgentBriefing`, `uploadAgentFile`
- `backend/agent_store.py` — histórico admin
- `backend/hermes_agent_client.py` — `ADMIN_SYSTEM`, `ask_admin`
- `backend/insights_service.py` — `clinic_briefing`, `QUICK_PROMPTS`
- `backend/main.py` — rotas `/api/agent/*`
- `frontend/src/index.css` — design tokens
- `CLAUDE.md` / `PRODUCT.md` — identidade visual e tom de produto
