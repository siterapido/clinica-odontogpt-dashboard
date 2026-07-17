# Message Feedback (nota + reescrita) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir nota 1–5, comentário e reescrita em cada resposta do OdontoGPT no simulador (nova bolha) e no CRM (rascunho HITL).

**Architecture:** Tabela `message_feedback` no SQLite CRM; store functions em `chat_store.py`; rewrite LLM sem tools em `patient_atendimento.py`; rotas em `main.py`; UI compartilhada `MessageFeedback.jsx` no simulador e no `ChatPaneCRM`.

**Tech Stack:** FastAPI + SQLite (`ODONTO_CRM_DB`), OpenRouter via `_post_chat` / `ask_patient` pattern, React (Vite) dashboard.

**Spec:** `docs/superpowers/specs/2026-07-16-message-feedback-design.md`

## Global Constraints

- Só `interacoes.tipo = 'reply'` e **não** `classificacao` começando com `atendente:`
- Nota **1–5** apenas
- CRM real: reescrita **nunca** chama bridge/WhatsApp; só `salvar_rascunho(..., origem="feedback")`
- Simulador: telefone `chat_store.TEST_CHAT_PHONE` (`5599999000001`); classificação da reescrita `teste:reescrita`
- Rewrite **sem** processar/emitir `:::crm:::`
- Auth: `Depends(require_auth)` em todas as rotas novas
- BRT timestamps via `_now_sql()` existente
- YAGNI: sem dashboard de médias, sem memória global do agente

---

## File map

| Path | Ação | Responsabilidade |
|------|------|------------------|
| `backend/chat_store.py` | Modify | Schema `message_feedback`; CRUD; enrich `listar_mensagens`; limpar feedback no teste |
| `backend/patient_atendimento.py` | Modify | `rewrite_patient_reply(...)` + prompt |
| `backend/models.py` | Modify | `MessageFeedbackBody`, `MessageRewriteBody` |
| `backend/main.py` | Modify | POST/GET feedback, POST reescrever |
| `backend/tests/test_message_feedback.py` | Create | Unit tests store + rewrite destino |
| `frontend/src/api.js` | Modify | `salvarMessageFeedback`, `reescreverMensagem` |
| `frontend/src/components/conversas/MessageFeedback.jsx` | Create | Estrelas + comentário + botão |
| `frontend/src/pages/SimuladorCliente.jsx` | Modify | Render feedback em bolhas bot |
| `frontend/src/components/conversas/ChatPaneCRM.jsx` | Modify | Render feedback em replies bot; refresh rascunho após rewrite |

---

### Task 1: Store — schema + upsert/get feedback

**Files:**
- Create: `backend/tests/test_message_feedback.py`
- Modify: `backend/chat_store.py` (`ensure_schema`, new functions near `registrar_mensagem`)

**Interfaces:**
- Produces:
  - `is_bot_reply(interacao: dict) -> bool`
  - `get_interacao(interacao_id: int) -> dict | None`
  - `upsert_message_feedback(interacao_id: int, nota: int, comentario: str | None = None, operador: str | None = None) -> dict`
  - `get_message_feedback(interacao_id: int) -> dict | None`
  - `feedback_map_for_ids(ids: list[int]) -> dict[int, dict]`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_message_feedback.py
from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import chat_store  # noqa: E402


@pytest.fixture()
def crm_db(tmp_path, monkeypatch):
    db = tmp_path / "crm.db"
    con = sqlite3.connect(db)
    con.executescript(
        """
        CREATE TABLE pacientes (
          id INTEGER PRIMARY KEY, nome TEXT, whatsapp TEXT, telefone TEXT, observacoes TEXT
        );
        CREATE TABLE interacoes (
          id INTEGER PRIMARY KEY, paciente_id INTEGER, tipo TEXT DEFAULT 'envio',
          mensagem TEXT, classificacao TEXT,
          created_at TEXT DEFAULT (datetime('now', '-3 hours')), telefone TEXT
        );
        INSERT INTO pacientes (id, nome, whatsapp, telefone)
          VALUES (1, 'Maria', '5584991111111', '5584991111111');
        INSERT INTO interacoes (id, paciente_id, telefone, tipo, mensagem, classificacao)
          VALUES (10, 1, '5584991111111', 'envio', 'Oi', 'cliente');
        INSERT INTO interacoes (id, paciente_id, telefone, tipo, mensagem, classificacao)
          VALUES (11, 1, '5584991111111', 'reply', 'Olá! Como posso ajudar?', 'bot');
        INSERT INTO interacoes (id, paciente_id, telefone, tipo, mensagem, classificacao)
          VALUES (12, 1, '5584991111111', 'reply', 'Sou a recepção', 'atendente:Ana');
        """
    )
    con.commit()
    con.close()
    monkeypatch.setenv("ODONTO_CRM_DB", str(db))
    chat_store.DB_PATH = str(db)
    chat_store.ensure_schema()
    return str(db)


def test_upsert_feedback_1_a_5(crm_db):
    fb = chat_store.upsert_message_feedback(11, nota=4, comentario="Bom tom", operador="Gerente")
    assert fb["nota"] == 4
    assert fb["comentario"] == "Bom tom"
    assert fb["interacao_id"] == 11
    fb2 = chat_store.upsert_message_feedback(11, nota=2, comentario="Frio")
    assert fb2["nota"] == 2
    assert chat_store.get_message_feedback(11)["nota"] == 2


def test_reject_nota_invalida(crm_db):
    with pytest.raises(ValueError):
        chat_store.upsert_message_feedback(11, nota=0)
    with pytest.raises(ValueError):
        chat_store.upsert_message_feedback(11, nota=6)


def test_reject_envio_e_atendente(crm_db):
    with pytest.raises(ValueError):
        chat_store.upsert_message_feedback(10, nota=3)
    with pytest.raises(ValueError):
        chat_store.upsert_message_feedback(12, nota=3)


def test_listar_mensagens_inclui_feedback(crm_db):
    chat_store.upsert_message_feedback(11, nota=5, comentario="ok")
    msgs = chat_store.listar_mensagens("5584991111111", limit=50)
    bot = next(m for m in msgs if m["id"] == 11)
    assert bot["feedback"]["nota"] == 5
    envio = next(m for m in msgs if m["id"] == 10)
    assert envio.get("feedback") is None
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /root/clinica-odontogpt-dashboard/backend && python -m pytest tests/test_message_feedback.py -v
```

Expected: FAIL (`upsert_message_feedback` missing or AttributeError)

- [ ] **Step 3: Implement schema + functions in `chat_store.py`**

In `ensure_schema()`, after `chat_followups` index block, add:

```python
        c.execute(
            """CREATE TABLE IF NOT EXISTS message_feedback (
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
            )"""
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_message_feedback_telefone "
            "ON message_feedback(telefone)"
        )
```

Add helpers (after `registrar_mensagem` is fine):

```python
def is_bot_reply(row: dict | None) -> bool:
    if not row or (row.get("tipo") or "") != "reply":
        return False
    cls = (row.get("classificacao") or "").lower()
    return not cls.startswith("atendente:")


def get_interacao(interacao_id: int) -> dict | None:
    ensure_schema()
    with _rw() as c:
        row = c.execute(
            "SELECT * FROM interacoes WHERE id = ?", (int(interacao_id),)
        ).fetchone()
        return dict(row) if row else None


def _feedback_row_to_dict(row) -> dict:
    d = dict(row)
    return {
        "id": d.get("id"),
        "interacao_id": d.get("interacao_id"),
        "telefone": d.get("telefone"),
        "nota": d.get("nota"),
        "comentario": d.get("comentario"),
        "operador": d.get("operador"),
        "reescrita_texto": d.get("reescrita_texto"),
        "reescrita_em": d.get("reescrita_em"),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
    }


def get_message_feedback(interacao_id: int) -> dict | None:
    ensure_schema()
    with _rw() as c:
        row = c.execute(
            "SELECT * FROM message_feedback WHERE interacao_id = ?",
            (int(interacao_id),),
        ).fetchone()
        return _feedback_row_to_dict(row) if row else None


def feedback_map_for_ids(ids: list[int]) -> dict[int, dict]:
    if not ids:
        return {}
    ensure_schema()
    placeholders = ",".join("?" * len(ids))
    with _rw() as c:
        rows = c.execute(
            f"SELECT * FROM message_feedback WHERE interacao_id IN ({placeholders})",
            [int(i) for i in ids],
        ).fetchall()
    return {int(r["interacao_id"]): _feedback_row_to_dict(r) for r in rows}


def upsert_message_feedback(
    interacao_id: int,
    nota: int,
    comentario: str | None = None,
    operador: str | None = None,
) -> dict:
    ensure_schema()
    n = int(nota)
    if n < 1 or n > 5:
        raise ValueError("nota deve ser entre 1 e 5")
    inter = get_interacao(interacao_id)
    if not inter:
        raise ValueError("mensagem não encontrada")
    if not is_bot_reply(inter):
        raise ValueError("feedback só em respostas do bot")
    phone = normalize_phone(inter.get("telefone") or "")
    if not phone:
        raise ValueError("telefone inválido na mensagem")
    now = _now_sql()
    com = (comentario or "").strip()[:2000] or None
    op = (operador or "").strip()[:120] or None
    with _rw() as c:
        existing = c.execute(
            "SELECT id FROM message_feedback WHERE interacao_id = ?",
            (int(interacao_id),),
        ).fetchone()
        if existing:
            c.execute(
                """UPDATE message_feedback SET
                     nota = ?, comentario = ?, operador = COALESCE(?, operador),
                     updated_at = ?
                   WHERE interacao_id = ?""",
                (n, com, op, now, int(interacao_id)),
            )
        else:
            c.execute(
                """INSERT INTO message_feedback
                   (interacao_id, telefone, nota, comentario, operador, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (int(interacao_id), phone, n, com, op, now, now),
            )
    return get_message_feedback(interacao_id)  # type: ignore[return-value]
```

Update `listar_mensagens` to attach feedback:

```python
def listar_mensagens(telefone: str, limit: int = 100, after_id: int = 0) -> list[dict]:
    ensure_schema()
    phone = normalize_phone(telefone)
    with _rw() as c:
        pid = resolver_paciente_id(c, phone)
        rows = c.execute(
            """
            SELECT i.*, p.nome AS paciente_nome
            FROM interacoes i
            LEFT JOIN pacientes p ON i.paciente_id = p.id
            WHERE (i.telefone = ? OR (? IS NOT NULL AND i.paciente_id = ?))
              AND i.id > ?
            ORDER BY i.id ASC
            LIMIT ?
            """,
            (phone, pid, pid, after_id, limit),
        ).fetchall()
        msgs = [dict(r) for r in rows]
    fmap = feedback_map_for_ids([int(m["id"]) for m in msgs if m.get("id") is not None])
    for m in msgs:
        m["feedback"] = fmap.get(int(m["id"])) if m.get("id") is not None else None
    return msgs
```

Also update `limpar_chat_teste` to delete feedback for test phone:

```python
        c.execute(
            "DELETE FROM message_feedback WHERE telefone = ?", (phone,)
        )
        cur = c.execute("DELETE FROM interacoes WHERE telefone = ?", (phone,))
```

(place delete feedback **before** delete interacoes)

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /root/clinica-odontogpt-dashboard/backend && python -m pytest tests/test_message_feedback.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /root/clinica-odontogpt-dashboard
git add backend/chat_store.py backend/tests/test_message_feedback.py
git commit -m "feat(chat): store message_feedback schema and upsert"
```

---

### Task 2: Store — attach rewrite result + rascunho origem feedback

**Files:**
- Modify: `backend/chat_store.py` (`salvar_rascunho` allowed origins; `set_feedback_rewrite`)
- Modify: `backend/tests/test_message_feedback.py`

**Interfaces:**
- Produces: `set_feedback_rewrite(interacao_id: int, texto: str) -> dict`
- Modifies: `salvar_rascunho` accepts `origem="feedback"`

- [ ] **Step 1: Failing tests**

Append to `test_message_feedback.py`:

```python
def test_set_feedback_rewrite(crm_db):
    chat_store.upsert_message_feedback(11, nota=2, comentario="melhorar")
    fb = chat_store.set_feedback_rewrite(11, "Oi! Posso te oferecer amanhã às 10h?")
    assert "10h" in (fb.get("reescrita_texto") or "")
    assert fb.get("reescrita_em")


def test_salvar_rascunho_origem_feedback(crm_db):
    # ensure session exists via set_modo or salvar
    chat_store.set_modo("5584991111111", "bot", None)
    sess = chat_store.salvar_rascunho(
        "5584991111111",
        "Texto reescrito para o paciente",
        origem="feedback",
    )
    assert sess.get("rascunho_resposta")
    assert sess.get("rascunho_origem") == "feedback"
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /root/clinica-odontogpt-dashboard/backend && python -m pytest tests/test_message_feedback.py::test_set_feedback_rewrite tests/test_message_feedback.py::test_salvar_rascunho_origem_feedback -v
```

- [ ] **Step 3: Implement**

```python
def set_feedback_rewrite(interacao_id: int, texto: str) -> dict:
    ensure_schema()
    t = (texto or "").strip()[:4000]
    if not t:
        raise ValueError("reescrita vazia")
    fb = get_message_feedback(interacao_id)
    if not fb:
        raise ValueError("salve o feedback antes de reescrever")
    now = _now_sql()
    with _rw() as c:
        c.execute(
            """UPDATE message_feedback SET
                 reescrita_texto = ?, reescrita_em = ?, updated_at = ?
               WHERE interacao_id = ?""",
            (t, now, now, int(interacao_id)),
        )
    return get_message_feedback(interacao_id)  # type: ignore[return-value]
```

In `salvar_rascunho`, change:

```python
    if origem not in ("humano", "agente", "sistema", "feedback"):
        origem = "humano"
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd /root/clinica-odontogpt-dashboard/backend && python -m pytest tests/test_message_feedback.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/chat_store.py backend/tests/test_message_feedback.py
git commit -m "feat(chat): feedback rewrite fields and HITL origem feedback"
```

---

### Task 3: Rewrite LLM helper (no CRM tools)

**Files:**
- Modify: `backend/patient_atendimento.py`
- Modify: `backend/tests/test_message_feedback.py`

**Interfaces:**
- Produces: `rewrite_patient_reply(original: str, nota: int | None, comentario: str | None, history: list[dict] | None = None) -> tuple[bool, str]`
- Uses: `hermes_agent_client._post_chat` (or public wrapper)

- [ ] **Step 1: Unit test with monkeypatch (no network)**

```python
def test_rewrite_strips_crm_tags(crm_db, monkeypatch):
    import patient_atendimento as pa

    def fake_post(messages, session_key):
        return True, "Claro! Temos 10h amanhã.\n:::crm stage stage=agendamento:::"

    monkeypatch.setattr(
        "hermes_agent_client._post_chat",
        fake_post,
    )
    # if rewrite imports _post_chat differently, patch the symbol used inside patient_atendimento
    monkeypatch.setattr(pa, "_post_chat_for_rewrite", fake_post, raising=False)

    ok, text = pa.rewrite_patient_reply(
        original="Ok.",
        nota=2,
        comentario="Ofereça horário",
        history=[{"role": "user", "content": "Quero limpeza"}],
    )
    assert ok
    assert ":::crm" not in text
    assert "10h" in text
```

Implementation should strip CRM tags via existing `CRM_ACTION_RE.sub("", text)` after generation.

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /root/clinica-odontogpt-dashboard/backend && python -m pytest tests/test_message_feedback.py::test_rewrite_strips_crm_tags -v
```

- [ ] **Step 3: Implement in `patient_atendimento.py`**

```python
REWRITE_SYSTEM = """Você reescreve UMA resposta do assistente da clínica odontológica no WhatsApp.
Regras:
- Corrija o que o supervisor pedir (tom, fato, CTA, clareza).
- Mantenha o que já estava certo.
- Texto curto, humano, PT-BR, 2–4 linhas.
- Não invente horário, preço ou procedimento fora do contexto.
- NÃO inclua tags :::crm::: nem meta-comentário.
- Saída: SOMENTE o texto reescrito, pronto para enviar."""


def rewrite_patient_reply(
    original: str,
    nota: int | None = None,
    comentario: str | None = None,
    history: list[dict[str, Any]] | None = None,
) -> tuple[bool, str]:
    orig = (original or "").strip()
    if not orig:
        return False, "resposta original vazia"
    com = (comentario or "").strip()
    n = int(nota) if nota is not None else None
    if n is None and not com:
        return False, "informe nota ou comentário"

    hint = ""
    if n is not None and n <= 3 and not com:
        hint = "Melhore clareza, empatia e um próximo passo concreto."
    elif n is not None and n >= 4 and not com:
        hint = "Faça um polimento leve mantendo o sentido."

    user_parts = [
        f"Resposta original:\n{orig[:4000]}",
        f"Nota do supervisor (1–5): {n if n is not None else '—'}",
        f"Comentário / o que corrigir: {com or hint or '(sem detalhe)'}",
    ]
    if history:
        lines = []
        for h in history[-12:]:
            role = h.get("role") or "user"
            content = (h.get("content") or "").strip()
            if content:
                lines.append(f"{role}: {content[:500]}")
        if lines:
            user_parts.append("Contexto recente:\n" + "\n".join(lines))

    messages = [
        {"role": "system", "content": REWRITE_SYSTEM},
        {"role": "user", "content": "\n\n".join(user_parts)},
    ]

    try:
        from hermes_agent_client import _post_chat
    except Exception as ex:
        return False, f"cliente LLM indisponível: {ex}"

    ok, answer = _post_chat(messages, "paciente-rewrite")
    if not ok:
        return False, answer or "falha LLM"

    text = (answer or "").strip()
    # remove qualquer tag CRM acidental
    text = CRM_ACTION_RE.sub("", text).strip()
    if not text:
        return False, "reescrita vazia"
    return True, text[:4000]
```

Adjust the test monkeypatch to patch `hermes_agent_client._post_chat` before import path used inside function (patch where used: `monkeypatch.setattr("hermes_agent_client._post_chat", fake_post)` works if import is inside function).

- [ ] **Step 4: Run — expect PASS**

```bash
cd /root/clinica-odontogpt-dashboard/backend && python -m pytest tests/test_message_feedback.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/patient_atendimento.py backend/tests/test_message_feedback.py
git commit -m "feat(atendimento): rewrite_patient_reply without CRM tools"
```

---

### Task 4: Store orchestration `apply_message_rewrite` + API routes

**Files:**
- Modify: `backend/chat_store.py` — optional thin orchestrator OR keep logic in `main.py`
- Modify: `backend/models.py`
- Modify: `backend/main.py`
- Modify: `backend/tests/test_message_feedback.py`

**Interfaces:**
- Produces API:
  - `POST /api/chat/mensagens/{id}/feedback`
  - `GET /api/chat/mensagens/{id}/feedback`
  - `POST /api/chat/mensagens/{id}/reescrever`
- Body models: `MessageFeedbackBody`, `MessageRewriteBody`

Prefer pure store function:

```python
def apply_message_rewrite(
    interacao_id: int,
    texto: str,
    *,
    nota: int | None = None,
    comentario: str | None = None,
    operador: str | None = None,
) -> dict:
    """Persists rewrite. Assumes texto already generated.
    Returns {feedback, texto, destino, reply_id?}
    """
```

Logic:
1. If nota provided → upsert; elif no feedback → if only comentario, upsert with nota default **3** OR require nota — **spec: UI always sends nota; API requires existing feedback OR body.nota**. If only comentario without nota and no existing: raise ValueError("nota obrigatória na primeira avaliação").
2. `set_feedback_rewrite`
3. If phone == `TEST_CHAT_PHONE`: `registrar_mensagem(phone, "reply", texto, "teste:reescrita")` → destino `thread`
4. Else: `salvar_rascunho(phone, texto, origem="feedback")`; `registrar_evento` tipo `feedback_rewrite` if helper exists → destino `rascunho`

- [ ] **Step 1: Tests for apply (mock no LLM)**

```python
def test_apply_rewrite_simulador(crm_db):
    # register on test phone
    chat_store.ensure_test_paciente()
    rid = chat_store.registrar_mensagem(
        chat_store.TEST_CHAT_PHONE, "reply", "Oi genérico", "teste:bot"
    )
    chat_store.upsert_message_feedback(rid, nota=2, comentario="mais calor")
    out = chat_store.apply_message_rewrite(
        rid, "Oi! Que bom te ver por aqui 😊 Quer marcar uma avaliação?"
    )
    assert out["destino"] == "thread"
    assert out.get("reply_id")
    msgs = chat_store.listar_mensagens(chat_store.TEST_CHAT_PHONE)
    assert any(m.get("classificacao") == "teste:reescrita" for m in msgs)


def test_apply_rewrite_crm_rascunho(crm_db):
    chat_store.upsert_message_feedback(11, nota=2, comentario="x")
    out = chat_store.apply_message_rewrite(11, "Versão melhor para o paciente")
    assert out["destino"] == "rascunho"
    sess = chat_store.get_modo("5584991111111")
    assert sess.get("rascunho_resposta") == "Versão melhor para o paciente"
    assert sess.get("rascunho_origem") == "feedback"
```

- [ ] **Step 2: Implement `apply_message_rewrite` + models + routes**

`models.py`:

```python
class MessageFeedbackBody(BaseModel):
    nota: int = Field(..., ge=1, le=5)
    comentario: Optional[str] = Field(None, max_length=2000)


class MessageRewriteBody(BaseModel):
    nota: Optional[int] = Field(None, ge=1, le=5)
    comentario: Optional[str] = Field(None, max_length=2000)
```

`main.py` (near chat routes; import bodies):

```python
@app.post("/api/chat/mensagens/{interacao_id}/feedback", dependencies=[Depends(require_auth)])
def chat_message_feedback(interacao_id: int, body: MessageFeedbackBody, user: AuthUser = Depends(require_auth)):
    try:
        op = getattr(user, "email", None) or getattr(user, "id", None) or "operador"
        fb = chat_store.upsert_message_feedback(
            interacao_id, body.nota, body.comentario, operador=str(op)[:120]
        )
        return {"ok": True, "feedback": fb}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/chat/mensagens/{interacao_id}/feedback", dependencies=[Depends(require_auth)])
def chat_get_message_feedback(interacao_id: int):
    fb = chat_store.get_message_feedback(interacao_id)
    if not fb:
        raise HTTPException(status_code=404, detail="sem feedback")
    return {"ok": True, "feedback": fb}


@app.post("/api/chat/mensagens/{interacao_id}/reescrever", dependencies=[Depends(require_auth)])
def chat_reescrever_mensagem(
    interacao_id: int,
    body: MessageRewriteBody,
    user: AuthUser = Depends(require_auth),
):
    inter = chat_store.get_interacao(interacao_id)
    if not inter or not chat_store.is_bot_reply(inter):
        raise HTTPException(status_code=400, detail="mensagem inválida para reescrita")
    op = getattr(user, "email", None) or getattr(user, "id", None) or "operador"
    try:
        if body.nota is not None:
            chat_store.upsert_message_feedback(
                interacao_id, body.nota, body.comentario, operador=str(op)[:120]
            )
        elif body.comentario:
            existing = chat_store.get_message_feedback(interacao_id)
            if existing:
                chat_store.upsert_message_feedback(
                    interacao_id, existing["nota"], body.comentario, operador=str(op)[:120]
                )
            else:
                raise HTTPException(status_code=400, detail="informe a nota (1–5)")
        fb = chat_store.get_message_feedback(interacao_id)
        if not fb:
            raise HTTPException(status_code=400, detail="salve a nota antes de reescrever")

        phone = inter.get("telefone") or ""
        hist_rows = chat_store.listar_mensagens(phone, limit=24, after_id=0)
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
        raise HTTPException(status_code=400, detail=str(e))
```

**Note:** Check how `require_auth` is used elsewhere — if it returns `AuthUser` only when typed as dependency once, avoid double `Depends(require_auth)` on same param. Match existing route style in `main.py` (many use only `dependencies=[Depends(require_auth)]` without injecting user). If operator unavailable, pass `operador="dashboard"`.

```python
# Prefer pattern already used:
@app.post("...", dependencies=[Depends(require_auth)])
def chat_message_feedback(interacao_id: int, body: MessageFeedbackBody):
    fb = chat_store.upsert_message_feedback(
        interacao_id, body.nota, body.comentario, operador="dashboard"
    )
    ...
```

- [ ] **Step 3: Implement `apply_message_rewrite` fully**

```python
def apply_message_rewrite(interacao_id: int, texto: str) -> dict[str, Any]:
    inter = get_interacao(interacao_id)
    if not inter or not is_bot_reply(inter):
        raise ValueError("mensagem inválida")
    phone = normalize_phone(inter.get("telefone") or "")
    fb = set_feedback_rewrite(interacao_id, texto)
    if phone == TEST_CHAT_PHONE:
        reply_id = registrar_mensagem(
            phone, "reply", texto, classificacao="teste:reescrita"
        )
        return {
            "feedback": fb,
            "texto": texto,
            "destino": "thread",
            "reply_id": reply_id,
        }
    salvar_rascunho(phone, texto, origem="feedback")
    try:
        registrar_evento(
            phone,
            tipo="feedback_rewrite",
            titulo="Reescrita por feedback",
            detalhe=f"interacao_id={interacao_id}",
            meta={"interacao_id": interacao_id, "nota": fb.get("nota")},
        )
    except Exception:
        pass
    return {
        "feedback": get_message_feedback(interacao_id),
        "texto": texto,
        "destino": "rascunho",
        "reply_id": None,
    }
```

Verify `registrar_evento` signature in `chat_store` (may be `registrar_chat_evento` or similar) and match it.

- [ ] **Step 4: Run unit tests**

```bash
cd /root/clinica-odontogpt-dashboard/backend && python -m pytest tests/test_message_feedback.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/chat_store.py backend/models.py backend/main.py backend/tests/test_message_feedback.py
git commit -m "feat(api): endpoints feedback e reescrever mensagem"
```

---

### Task 5: Frontend API + MessageFeedback component

**Files:**
- Modify: `frontend/src/api.js`
- Create: `frontend/src/components/conversas/MessageFeedback.jsx`

**Interfaces:**
- `salvarMessageFeedback(id, { nota, comentario })`
- `reescreverMensagem(id, { nota?, comentario? })`
- Component props:
  - `messageId: number`
  - `feedback: object | null`
  - `onFeedbackChange: (fb) => void`
  - `onRewriteDone: (result) => void`  // { destino, texto, feedback }
  - `disabled?: boolean`
  - `variant?: 'wa' | 'crm'`  // cores leves

- [ ] **Step 1: API helpers**

```javascript
export function salvarMessageFeedback(interacaoId, body) {
  return fetchJSON(`${API}/chat/mensagens/${interacaoId}/feedback`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function reescreverMensagem(interacaoId, body = {}) {
  return fetchJSON(`${API}/chat/mensagens/${interacaoId}/reescrever`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
```

- [ ] **Step 2: Component**

```jsx
// frontend/src/components/conversas/MessageFeedback.jsx
import { useState, useEffect, useRef } from 'react'
import { Star, RefreshCw } from 'lucide-react'
import { salvarMessageFeedback, reescreverMensagem } from '../../api'
import { Button } from '@/components/ui/button'

export default function MessageFeedback({
  messageId,
  feedback,
  onFeedbackChange,
  onRewriteDone,
  disabled = false,
  variant = 'crm',
}) {
  const [nota, setNota] = useState(feedback?.nota || 0)
  const [comentario, setComentario] = useState(feedback?.comentario || '')
  const [hover, setHover] = useState(0)
  const [saving, setSaving] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [err, setErr] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    setNota(feedback?.nota || 0)
    setComentario(feedback?.comentario || '')
  }, [feedback?.nota, feedback?.comentario, messageId])

  async function persist(nextNota, nextComentario) {
    if (!messageId || !nextNota) return
    setSaving(true)
    setErr(null)
    try {
      const res = await salvarMessageFeedback(messageId, {
        nota: nextNota,
        comentario: nextComentario || undefined,
      })
      onFeedbackChange?.(res.feedback)
    } catch (e) {
      setErr(e.message || 'Falha ao salvar nota')
    } finally {
      setSaving(false)
    }
  }

  function handleStar(n) {
    if (disabled || saving || rewriting) return
    setNota(n)
    persist(n, comentario)
  }

  function handleComentarioChange(v) {
    setComentario(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (nota >= 1) persist(nota, v)
    }, 400)
  }

  async function handleRewrite() {
    if (!messageId || rewriting) return
    if (!nota && !comentario.trim()) {
      setErr('Dê uma nota ou escreva um comentário')
      return
    }
    setRewriting(true)
    setErr(null)
    try {
      const res = await reescreverMensagem(messageId, {
        nota: nota || undefined,
        comentario: comentario || undefined,
      })
      if (res.feedback) onFeedbackChange?.(res.feedback)
      onRewriteDone?.(res)
    } catch (e) {
      setErr(e.message || 'Falha ao reescrever')
    } finally {
      setRewriting(false)
    }
  }

  const starColor = variant === 'wa' ? 'text-amber-500' : 'text-amber-500'
  const display = hover || nota

  return (
    <div className="mt-1.5 space-y-1 border-t border-black/5 pt-1.5">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            disabled={disabled || saving || rewriting}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5 disabled:opacity-40"
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => handleStar(n)}
          >
            <Star
              size={16}
              className={n <= display ? `${starColor} fill-current` : 'text-ink-tertiary'}
            />
          </button>
        ))}
        {nota > 0 && (
          <span className="ml-1 text-[10px] text-ink-tertiary">Nota {nota}/5</span>
        )}
      </div>
      <textarea
        rows={1}
        value={comentario}
        disabled={disabled || rewriting}
        onChange={e => handleComentarioChange(e.target.value)}
        placeholder={nota ? 'O que corrigir…' : 'Avaliar resposta…'}
        className="w-full resize-none rounded-md border border-border-subtle bg-white/80 px-2 py-1 text-[11px] text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        disabled={disabled || rewriting || (!nota && !comentario.trim())}
        onClick={handleRewrite}
      >
        <RefreshCw size={12} className={rewriting ? 'animate-spin' : ''} />
        {rewriting ? 'Reescrevendo…' : 'Reescrever'}
      </Button>
      {err && <p className="text-[10px] text-danger">{err}</p>}
    </div>
  )
}

export function isBotReplyMessage(m) {
  if (!m || m.tipo !== 'reply') return false
  const cls = (m.classificacao || '').toLowerCase()
  return !cls.startsWith('atendente:')
}
```

- [ ] **Step 3: Visual check** — no automated frontend test required; ensure imports resolve.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js frontend/src/components/conversas/MessageFeedback.jsx
git commit -m "feat(ui): MessageFeedback stars and rewrite control"
```

---

### Task 6: Wire SimuladorCliente

**Files:**
- Modify: `frontend/src/pages/SimuladorCliente.jsx`

- [ ] **Step 1: Import and render**

```jsx
import MessageFeedback, { isBotReplyMessage } from '../components/conversas/MessageFeedback'
```

Inside bot bubble (when `!souEu` and not `_temp` and real numeric id):

```jsx
{!souEu && !m._temp && typeof m.id === 'number' && (
  <MessageFeedback
    messageId={m.id}
    feedback={m.feedback}
    variant="wa"
    onFeedbackChange={fb => {
      setMsgs(prev =>
        prev.map(x => (x.id === m.id ? { ...x, feedback: fb } : x))
      )
    }}
    onRewriteDone={() => {
      loadThread(0)
    }}
  />
)}
```

Place **inside** the white bubble div, after timestamp.

- [ ] **Step 2: Manual smoke** (if backend up)

1. Open `/simulador`
2. Send “quero limpeza”
3. Star 2 + comment “ofereça slot”
4. Reescrever → new bubble appears

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SimuladorCliente.jsx
git commit -m "feat(simulador): rate and rewrite bot replies"
```

---

### Task 7: Wire ChatPaneCRM

**Files:**
- Modify: `frontend/src/components/conversas/ChatPaneCRM.jsx`
- Possibly `frontend/src/pages/Conversas.jsx` if rascunho state is owned by parent

- [ ] **Step 1: Find how `rascunhoEdit` / `temRascunho` is updated**

In `Conversas.jsx`, after rewrite success, parent must set rascunho from response or re-fetch conversa. Pass callback `onRascunhoFromFeedback` if needed.

Pattern:

```jsx
// ChatPaneCRM — inside bot message bubble (out && !atend)
{out && !atend && typeof m.id === 'number' && (
  <div className={out ? 'text-left' : ''}>
    <MessageFeedback
      messageId={m.id}
      feedback={m.feedback}
      variant="crm"
      onFeedbackChange={fb => onMessageFeedback?.(m.id, fb)}
      onRewriteDone={res => {
        if (res.destino === 'rascunho' && res.texto) {
          onRewriteToRascunho?.(res.texto)
        }
      }}
    />
  </div>
)}
```

**Styling note:** bot bubbles in CRM use `bg-accent text-white`. Feedback controls need readable stars on accent — wrap feedback in a nested card:

```jsx
<div className="mt-2 rounded-lg bg-white/95 p-2 text-ink shadow-sm">
  <MessageFeedback ... />
</div>
```

- [ ] **Step 2: Parent `Conversas.jsx`**

```jsx
function handleRewriteToRascunho(texto) {
  setRascunhoEdit(texto)
  // also patch convAtual if held in state
  setConvAtual?.(prev =>
    prev
      ? {
          ...prev,
          rascunho_resposta: texto,
          rascunho_origem: 'feedback',
          tem_rascunho: true,
        }
      : prev
  )
  // optional toast if toast system exists — else setSendErr null and rely on HITL strip
}
```

Update local msgs feedback:

```jsx
function handleMessageFeedback(id, fb) {
  setMsgs(prev => prev.map(m => (m.id === id ? { ...m, feedback: fb } : m)))
}
```

- [ ] **Step 3: Manual smoke CRM**

1. Open real/non-test conversation with bot reply
2. Nota + reescrever
3. HITL strip shows text; Aprovar/Descartar still work
4. Reload — stars persist

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/conversas/ChatPaneCRM.jsx frontend/src/pages/Conversas.jsx
git commit -m "feat(crm): feedback and rewrite into HITL draft"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full unit suite for feature**

```bash
cd /root/clinica-odontogpt-dashboard/backend && python -m pytest tests/test_message_feedback.py tests/test_chat_crm_kanban.py -v
```

Expected: all PASS

- [ ] **Step 2: Spec checklist**

- [ ] Schema + APIs + feedback on GET mensagens
- [ ] UI simulador + CRM
- [ ] Rewrite thread vs rascunho
- [ ] No WhatsApp send on rewrite
- [ ] Tests green

- [ ] **Step 3: Final commit if residual fixes**

```bash
git status
# commit only if needed
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Tabela message_feedback | T1 |
| Upsert 1–5 / reject non-bot | T1 |
| Feedback embutido em listar_mensagens | T1 |
| reescrita_texto fields | T2 |
| origem feedback HITL | T2 |
| rewrite prompt sem :::crm::: | T3 |
| POST feedback / reescrever APIs | T4 |
| Simulador → thread | T4 + T6 |
| CRM → rascunho | T4 + T7 |
| MessageFeedback UI 1–5 | T5 |
| Limpar feedback no limpar teste | T1 |
| Unit tests | T1–T4, T8 |

**Placeholders:** none intentional.

**Type consistency:** `nota` int 1–5; `destino` `"thread" | "rascunho"`; feedback object keys match API.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-16-message-feedback.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, batch with checkpoints  

Which approach?
