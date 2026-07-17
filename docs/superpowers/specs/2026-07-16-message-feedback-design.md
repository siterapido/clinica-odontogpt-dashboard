# Design: Feedback de resposta (nota + comentário + reescrita)

**Data:** 2026-07-16  
**Status:** Aprovado (abordagem B)  
**Produto:** `clinica.odontogpt.com`  
**Escopo:** Treinar atendente (`/simulador`) + Inbox CRM (`/conversas`)

---

## 1. Problema

Hoje o gestor pode:

- Treinar o bot no simulador (modo paciente), sem avaliar cada resposta.
- Operar conversas reais no CRM (lead score, notas de conversa, HITL), sem avaliar a qualidade de cada reply do OdontoGPT.

Não há como marcar “esta resposta foi ruim”, comentar o que corrigir e pedir uma reescrita orientada.

## 2. Objetivo

Permitir, em **cada resposta do bot**:

1. Dar **nota 1–5 estrelas**
2. **Comentar** o que deve melhorar
3. Pedir **reescrever** com base nesse feedback

Comportamento por contexto:

| Contexto | Destino da reescrita |
|----------|----------------------|
| Treinar atendente | Nova bolha `reply` na thread do simulador |
| CRM (conversa real) | Rascunho HITL existente (`salvar_rascunho`, origem `feedback`) — **não** envia WhatsApp sozinho |

## 3. Decisões de produto

| Item | Decisão |
|------|----------|
| Abordagem | **B** — tabela `message_feedback` + endpoints dedicados |
| Escala | 1–5 estrelas |
| Alvo | Só respostas do **OdontoGPT** (`interacoes.tipo = reply` e **não** `classificacao` `atendente:*`) |
| CRM | Reescrita → rascunho HITL; operador aprova/envia ou descarta |
| Simulador | Reescrita → nova mensagem na thread |
| Fora de escopo | Memória global do agente a partir de notas; dashboard de médias; avaliar mensagens humanas/paciente |

## 4. Modelo de dados

Tabela SQLite no CRM DB (`ODONTO_CRM_DB`), criada/migrada em `chat_store` (mesmo padrão de `ensure_*` das outras tabelas):

```sql
CREATE TABLE IF NOT EXISTS message_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  interacao_id INTEGER NOT NULL UNIQUE,
  telefone TEXT NOT NULL,
  nota INTEGER NOT NULL CHECK(nota >= 1 AND nota <= 5),
  comentario TEXT,
  operador TEXT,
  reescrita_texto TEXT,
  reescrita_em TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_message_feedback_telefone
  ON message_feedback(telefone);
```

- 1 feedback por `interacao_id` (upsert).
- `telefone` denormalizado para listagem/filtro futuro.
- `reescrita_texto` guarda a **última** reescrita gerada (auditoria).

## 5. APIs

Auth: mesmo `require_auth` das rotas de chat.

### 5.1 Salvar / atualizar feedback

`POST /api/chat/mensagens/{id}/feedback`

```json
{ "nota": 3, "comentario": "Tom frio; oferecer slot real" }
```

- Valida interação: existe, `tipo=reply`, não atendente humano.
- Upsert por `interacao_id`.
- Retorna o registro de feedback.

### 5.2 Ler feedback (opcional se embutido)

`GET /api/chat/mensagens/{id}/feedback` → feedback ou 404.

### 5.3 Embutir no thread

`GET` de mensagens da conversa (já usado por simulador e CRM) passa a incluir em cada item:

```json
"feedback": {
  "nota": 3,
  "comentario": "...",
  "reescrita_texto": "...",
  "reescrita_em": "...",
  "operador": "...",
  "updated_at": "..."
}
```

ou `null`. Carregar em batch por IDs da página (evitar N+1).

### 5.4 Reescrever

`POST /api/chat/mensagens/{id}/reescrever`

```json
{ "nota": 2, "comentario": "..." }
```

(`nota`/`comentario` opcionais se já salvos; se enviados, upsert antes.)

Fluxo:

1. Validar mensagem bot.
2. Garantir feedback (salvo ou body); rejeitar se não houver nota nem comentário utilizável (mínimo: `nota` 1–5 **ou** comentário não vazio; preferência: nota sempre no fluxo de UI).
3. Montar contexto: últimas ~12 mensagens + original + nota + comentário.
4. Chamar LLM em modo **rewrite** (sem tools / sem parse `:::crm:::`).
5. Destino:
   - **Simulador** (telefone de teste configurado, ex. `5599999000001`): `registrar_mensagem(..., tipo=reply, classificacao=teste:reescrita)`; atualiza `reescrita_texto` / `reescrita_em`.
   - **CRM real**: `salvar_rascunho(phone, texto, origem="feedback")`; atualiza `reescrita_*`; evento `chat_eventos` tipo `feedback_rewrite`.
6. Resposta:

```json
{
  "feedback": { "...": "..." },
  "texto": "mensagem reescrita",
  "destino": "thread" | "rascunho"
}
```

Erros: 400 (mensagem inválida / sem feedback), 404, 502 (LLM).

## 6. Prompt de reescrita

Essência (implementação em helper próximo a `patient_atendimento` ou função dedicada):

- Entrada: resposta original, nota 1–5, comentário do supervisor, histórico recente.
- Regras: corrigir o pedido; manter o que já estava certo; tom WhatsApp curto; não inventar horário/preço/procedimento fora do contexto; **sem** tags `:::crm:::`; saída = só o texto final.
- Comentário vazio + nota ≤ 3: melhorar clareza, empatia e próximo passo.
- Nota ≥ 4 sem comentário: polimento leve.

## 7. UI

### Componente compartilhado

`frontend/src/components/conversas/MessageFeedback.jsx` (ou `components/MessageFeedback.jsx`).

Usado em:

- `SimuladorCliente.jsx` — bolhas do bot (não `tipo === 'envio'`)
- `ChatPaneCRM.jsx` — `tipo === 'reply'` e classificação **não** começa com `atendente:`

### Layout sob a bolha

1. Estrelas 1–5 (hover/clique; área tocável ≥ 32px no mobile)
2. Textarea de comentário (1 linha, expande no foco)
3. Botão **Reescrever** (loading + disabled durante request)

### Comportamento

| Ação | Efeito |
|------|--------|
| Clique estrela | `POST …/feedback` imediato |
| Blur / debounce comentário | Atualiza feedback |
| Reescrever | `POST …/reescrever` |
| Simulador + sucesso | Reload/poll da thread; nova bolha; scroll |
| CRM + sucesso | Toast “Rascunho HITL atualizado”; strip HITL com texto (`origem=feedback`) |
| Erro | Mensagem sob o botão; nota/comentário permanecem |

Rascunho HITL já existente no CRM: **sobrescrito** pela reescrita (operador ainda pode editar/descartar).

## 8. Arquivos principais

| Camada | Arquivos |
|--------|----------|
| Backend | `chat_store.py`, `models.py`, `main.py`, helper rewrite (`patient_atendimento.py` ou módulo fino), `tests/test_message_feedback.py` |
| Frontend | `MessageFeedback.jsx`, `SimuladorCliente.jsx`, `ChatPaneCRM.jsx`, `api.js` |

## 9. Testes

**Unit:**

- Upsert feedback 1–5; rejeita 0 e 6
- Rejeita feedback em `envio` e em `atendente:*`
- Rewrite simulador → nova `interacoes` + `reescrita_texto`
- Rewrite CRM → `rascunho_resposta` setado; **sem** chamada de envio WhatsApp

**Manual / smoke:**

1. Simulador: nota 2 + comentário → reescrever → nova bolha
2. CRM: reescrever → HITL preenchido → aprovar envia / descartar limpa
3. Reload → estrelas e comentário persistem

## 10. Critério de pronto

- [ ] Schema + APIs + join de feedback no GET de mensagens
- [ ] UI compartilhada no simulador e no CRM
- [ ] Reescrita simulador na thread; CRM só rascunho HITL
- [ ] Testes unitários passando
- [ ] Smoke manual dos 3 fluxos acima

## 11. Não fazer nesta entrega

- Injetar feedbacks baixos na memória permanente do agente
- Relatório/média de notas por período
- Auto-envio da reescrita no WhatsApp real
- Avaliar mensagens da equipe ou do paciente
