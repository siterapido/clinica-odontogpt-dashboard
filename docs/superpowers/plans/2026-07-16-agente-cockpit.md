# Cockpit do Agente (`/agente`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/agente` num cockpit humanizado de 3 colunas (Observatório · Conversa · Seu agente) com preferências (nome/tom/habilidades), entregas markdown e APIs de produto — sem expor Hermes.

**Architecture:** Preferências e entregas em SQLite via `agent_store`; system prompt dinâmico em `ask_admin`; parser `:::entrega` no `POST /api/agent/chat`; frontend React split em `components/agente/*` orquestrado por `AgenteAdmin.jsx`. Tokens e UI do design system atual (surface/teal/navy).

**Tech Stack:** FastAPI + SQLite, React + Vite + Tailwind v4, lucide-react, framer-motion (já no projeto), pytest.

**Spec:** `docs/superpowers/specs/2026-07-16-agente-cockpit-design.md`

## Global Constraints

- Chat **humanizado**, nunca estética de terminal/dark HUD
- Labels de negócio apenas; zero menção a modelo, provider, Hermes, paths de skill
- Tokens: `surface`, `accent` `#24B5CD`, `brand` navy, borders warm
- Preferências por **operador** (gestor); nome do **agente** é identidade separada
- Entregas: markdown + download `.md` apenas (sem PPTX/PDF nativo)
- Habilidades = pacotes de área (`agenda`, `financeiro`, `reativacao`, `imagens`, `relatorios`, `apresentacoes`, `alertas`)
- Tons: `acolhedor` | `executivo` | `clinico` | `didatico` | `proativo`
- Manter upload/chat/briefing existentes funcionando
- `prefers-reduced-motion` respeitado
- Commits frequentes e atômicos; TDD no backend

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/agent_store.py` | Schema + CRUD mensagens, preferências, entregas; parse entrega |
| `backend/hermes_agent_client.py` | `build_admin_system(prefs)`, `ask_admin(..., system_override=)` |
| `backend/models.py` | `AgentPreferenciasBody` |
| `backend/main.py` | `GET/PUT /api/agent/preferencias`, `GET /api/agent/entregas`; wire chat |
| `backend/tests/test_agent_preferencias.py` | Preferências + defaults |
| `backend/tests/test_agent_entregas.py` | Parser + store entregas |
| `backend/tests/test_admin_system_prompt.py` | Tom/skills no system |
| `frontend/src/api.js` | Client preferências/entregas |
| `frontend/src/components/agente/Observatorio.jsx` | Pulse, alertas, atalhos |
| `frontend/src/components/agente/ChatWorkspace.jsx` | Header, thread, composer |
| `frontend/src/components/agente/PreferenciasAgente.jsx` | Nome, tom, skills |
| `frontend/src/components/agente/EntregasPanel.jsx` | Lista entregas |
| `frontend/src/components/agente/EntregaCard.jsx` | Card reutilizável (thread + painel) |
| `frontend/src/pages/AgenteAdmin.jsx` | Cockpit 3 colunas + drawers mobile |
| `frontend/src/index.css` | Keyframes suaves + reduced-motion |
| `frontend/src/components/Sidebar.jsx` | Label “Agente” (opcional copy) |

---

### Task 1: Store de preferências + testes

**Files:**
- Modify: `backend/agent_store.py`
- Create: `backend/tests/test_agent_preferencias.py`
- Test: `backend/tests/test_agent_preferencias.py`

**Interfaces:**
- Consumes: `_rw()`, `_now_sql()`, `DB_PATH` existentes
- Produces:
  - `DEFAULT_HABILIDADES: dict[str, bool]`
  - `DEFAULT_TOM = "acolhedor"`
  - `DEFAULT_NOME_AGENTE = "OdontoGPT"`
  - `ensure_schema()` cria tabela `admin_agent_preferencias`
  - `get_preferencias(operador: str) -> dict`
  - `save_preferencias(operador: str, *, nome_agente: str, tom: str, habilidades: dict) -> dict`
  - `VALID_TONS = frozenset({...})`
  - `VALID_SKILL_KEYS = frozenset({...})`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_agent_preferencias.py`:

```python
import os
import tempfile
import pytest

# Isola DB antes de importar agent_store
@pytest.fixture()
def agent_store(monkeypatch, tmp_path):
    db = tmp_path / "test_crm.db"
    monkeypatch.setenv("ODONTO_CRM_DB", str(db))
    import importlib
    import agent_store
    importlib.reload(agent_store)
    agent_store.ensure_schema()
    return agent_store


def test_preferencias_default(agent_store):
    p = agent_store.get_preferencias("Gerente")
    assert p["nome_agente"] == "OdontoGPT"
    assert p["tom"] == "acolhedor"
    assert p["habilidades"]["agenda"] is True
    assert p["habilidades"]["financeiro"] is True
    assert set(p["habilidades"].keys()) == agent_store.VALID_SKILL_KEYS


def test_preferencias_save_and_get(agent_store):
    saved = agent_store.save_preferencias(
        "Ana",
        nome_agente="Luna",
        tom="executivo",
        habilidades={"agenda": True, "financeiro": False, "reativacao": True,
                      "imagens": True, "relatorios": True, "apresentacoes": False,
                      "alertas": True},
    )
    assert saved["nome_agente"] == "Luna"
    assert saved["tom"] == "executivo"
    assert saved["habilidades"]["financeiro"] is False
    again = agent_store.get_preferencias("Ana")
    assert again["nome_agente"] == "Luna"
    assert again["habilidades"]["apresentacoes"] is False


def test_preferencias_invalid_tom_raises(agent_store):
    with pytest.raises(ValueError):
        agent_store.save_preferencias("X", nome_agente="A", tom="robot", habilidades=dict(agent_store.DEFAULT_HABILIDADES))
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /root/clinica-odontogpt-dashboard/backend && ./venv/bin/pytest tests/test_agent_preferencias.py -v
```

Expected: FAIL (functions missing or import error)

- [ ] **Step 3: Implement schema + functions in `agent_store.py`**

Add after existing constants / before or inside `ensure_schema`:

```python
VALID_TONS = frozenset({"acolhedor", "executivo", "clinico", "didatico", "proativo"})
VALID_SKILL_KEYS = frozenset({
    "agenda", "financeiro", "reativacao", "imagens",
    "relatorios", "apresentacoes", "alertas",
})
DEFAULT_NOME_AGENTE = "OdontoGPT"
DEFAULT_TOM = "acolhedor"
DEFAULT_HABILIDADES = {k: True for k in sorted(VALID_SKILL_KEYS)}


def _normalize_habilidades(raw: dict | None) -> dict[str, bool]:
    base = dict(DEFAULT_HABILIDADES)
    if not raw:
        return base
    for k in VALID_SKILL_KEYS:
        if k in raw:
            base[k] = bool(raw[k])
    return base
```

In `ensure_schema()`, after mensagens table:

```python
        c.execute(
            """CREATE TABLE IF NOT EXISTS admin_agent_preferencias (
                operador TEXT PRIMARY KEY,
                nome_agente TEXT NOT NULL,
                tom TEXT NOT NULL,
                habilidades_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
```

Add:

```python
def get_preferencias(operador: str) -> dict[str, Any]:
    op = (operador or "Gerente").strip()[:120] or "Gerente"
    ensure_schema()
    with _rw() as c:
        row = c.execute(
            "SELECT operador, nome_agente, tom, habilidades_json, updated_at FROM admin_agent_preferencias WHERE operador = ?",
            (op,),
        ).fetchone()
    if not row:
        return {
            "operador": op,
            "nome_agente": DEFAULT_NOME_AGENTE,
            "tom": DEFAULT_TOM,
            "habilidades": dict(DEFAULT_HABILIDADES),
            "updated_at": None,
        }
    try:
        hab = json.loads(row["habilidades_json"] or "{}")
    except json.JSONDecodeError:
        hab = {}
    return {
        "operador": op,
        "nome_agente": row["nome_agente"] or DEFAULT_NOME_AGENTE,
        "tom": row["tom"] if row["tom"] in VALID_TONS else DEFAULT_TOM,
        "habilidades": _normalize_habilidades(hab),
        "updated_at": row["updated_at"],
    }


def save_preferencias(
    operador: str,
    *,
    nome_agente: str,
    tom: str,
    habilidades: dict | None,
) -> dict[str, Any]:
    op = (operador or "Gerente").strip()[:120] or "Gerente"
    nome = (nome_agente or DEFAULT_NOME_AGENTE).strip()[:80] or DEFAULT_NOME_AGENTE
    if tom not in VALID_TONS:
        raise ValueError(f"tom inválido: {tom}")
    hab = _normalize_habilidades(habilidades)
    ensure_schema()
    now = _now_sql()
    with _rw() as c:
        c.execute(
            """INSERT INTO admin_agent_preferencias (operador, nome_agente, tom, habilidades_json, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(operador) DO UPDATE SET
                 nome_agente=excluded.nome_agente,
                 tom=excluded.tom,
                 habilidades_json=excluded.habilidades_json,
                 updated_at=excluded.updated_at""",
            (op, nome, tom, json.dumps(hab, ensure_ascii=False), now),
        )
    return get_preferencias(op)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/clinica-odontogpt-dashboard/backend && ./venv/bin/pytest tests/test_agent_preferencias.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /root/clinica-odontogpt-dashboard
git add backend/agent_store.py backend/tests/test_agent_preferencias.py
git commit -m "feat(agent): store de preferências do agente por operador"
```

---

### Task 2: Parser de entrega + store de entregas

**Files:**
- Modify: `backend/agent_store.py`
- Create: `backend/tests/test_agent_entregas.py`
- Test: `backend/tests/test_agent_entregas.py`

**Interfaces:**
- Produces:
  - `parse_entrega(text: str) -> tuple[str, dict | None]` → `(display_text, entrega_or_none)`
  - `save_entrega(session_id, message_id, tipo, titulo, corpo_md) -> dict`
  - `list_entregas(session_id, limit=40) -> list[dict]`
  - Schema `admin_agent_entregas`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_agent_entregas.py`:

```python
import importlib
import pytest

@pytest.fixture()
def agent_store(monkeypatch, tmp_path):
    monkeypatch.setenv("ODONTO_CRM_DB", str(tmp_path / "t.db"))
    import agent_store
    importlib.reload(agent_store)
    agent_store.ensure_schema()
    return agent_store


SAMPLE = '''Segue o relatório.

:::entrega tipo="relatorio" titulo="Resumo do dia"
## Agenda
- 12 consultas
:::

Qualquer dúvida, é só pedir.'''


def test_parse_entrega_extracts_block(agent_store):
    display, ent = agent_store.parse_entrega(SAMPLE)
    assert ent is not None
    assert ent["tipo"] == "relatorio"
    assert ent["titulo"] == "Resumo do dia"
    assert "## Agenda" in ent["corpo_md"]
    assert ":::entrega" not in display
    assert "Qualquer dúvida" in display


def test_parse_entrega_none(agent_store):
    display, ent = agent_store.parse_entrega("Só um oi")
    assert ent is None
    assert display == "Só um oi"


def test_save_and_list_entregas(agent_store):
    mid = agent_store.append("admin-dashboard-Gerente", "assistant", "texto com entrega")
    ent = agent_store.save_entrega(
        "admin-dashboard-Gerente", mid, "relatorio", "Título", "## corpo"
    )
    assert ent["id"] > 0
    rows = agent_store.list_entregas("admin-dashboard-Gerente")
    assert len(rows) == 1
    assert rows[0]["titulo"] == "Título"
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /root/clinica-odontogpt-dashboard/backend && ./venv/bin/pytest tests/test_agent_entregas.py -v
```

- [ ] **Step 3: Implement**

Add to `agent_store.py`:

```python
import re

_ENTREGA_RE = re.compile(
    r":::entrega\s+tipo=\"(?P<tipo>relatorio|apresentacao)\"\s+titulo=\"(?P<titulo>[^\"]+)\"\s*\n(?P<body>.*?)\n:::",
    re.DOTALL | re.IGNORECASE,
)


def parse_entrega(text: str) -> tuple[str, dict[str, Any] | None]:
    raw = text or ""
    m = _ENTREGA_RE.search(raw)
    if not m:
        return raw, None
    tipo = m.group("tipo").lower()
    titulo = m.group("titulo").strip()[:200]
    corpo = m.group("body").strip()
    display = (raw[: m.start()] + raw[m.end() :]).strip()
    if not display:
        display = f"Preparei: {titulo}"
    return display, {"tipo": tipo, "titulo": titulo, "corpo_md": corpo}


def ensure_schema() -> None:
    # ... existing mensagens + preferencias ...
    with _rw() as c:
        # ... existing ...
        c.execute(
            """CREATE TABLE IF NOT EXISTS admin_agent_entregas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                message_id INTEGER,
                tipo TEXT NOT NULL,
                titulo TEXT NOT NULL,
                corpo_md TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_admin_agent_ent_sess ON admin_agent_entregas(session_id, id DESC)"
        )


def save_entrega(
    session_id: str,
    message_id: int | None,
    tipo: str,
    titulo: str,
    corpo_md: str,
) -> dict[str, Any]:
    if tipo not in ("relatorio", "apresentacao"):
        raise ValueError("tipo inválido")
    ensure_schema()
    now = _now_sql()
    with _rw() as c:
        cur = c.execute(
            """INSERT INTO admin_agent_entregas
               (session_id, message_id, tipo, titulo, corpo_md, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (session_id, message_id, tipo, (titulo or "")[:200], (corpo_md or "")[:50000], now),
        )
        eid = int(cur.lastrowid or 0)
    return {
        "id": eid,
        "session_id": session_id,
        "message_id": message_id,
        "tipo": tipo,
        "titulo": titulo[:200],
        "corpo_md": corpo_md,
        "created_at": now,
    }


def list_entregas(session_id: str, limit: int = 40) -> list[dict[str, Any]]:
    ensure_schema()
    with _rw() as c:
        rows = c.execute(
            """SELECT id, session_id, message_id, tipo, titulo, corpo_md, created_at
               FROM admin_agent_entregas
               WHERE session_id = ?
               ORDER BY id DESC LIMIT ?""",
            (session_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]
```

Note: merge the new `CREATE TABLE` into the existing single `ensure_schema` body (do not define `ensure_schema` twice).

- [ ] **Step 4: Run tests — PASS**

```bash
cd /root/clinica-odontogpt-dashboard/backend && ./venv/bin/pytest tests/test_agent_entregas.py tests/test_agent_preferencias.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/agent_store.py backend/tests/test_agent_entregas.py
git commit -m "feat(agent): parser e store de entregas markdown"
```

---

### Task 3: System prompt dinâmico

**Files:**
- Modify: `backend/hermes_agent_client.py`
- Create: `backend/tests/test_admin_system_prompt.py`

**Interfaces:**
- Produces: `build_admin_system(prefs: dict) -> str`
- Modifies: `ask_admin(..., prefs: dict | None = None)` uses `build_admin_system(prefs or defaults)`

- [ ] **Step 1: Failing tests**

```python
from hermes_agent_client import build_admin_system

def test_build_includes_name_and_tone():
    s = build_admin_system({
        "nome_agente": "Luna",
        "tom": "executivo",
        "habilidades": {
            "agenda": True, "financeiro": False, "reativacao": True,
            "imagens": True, "relatorios": True, "apresentacoes": True,
            "alertas": True,
        },
    })
    assert "Luna" in s
    assert "executivo" in s.lower() or "Direto" in s or "bullet" in s.lower()
    assert "financeiro" in s.lower()
    assert "desligada" in s.lower() or "não proponha" in s.lower() or "nao proponha" in s.lower()
    assert ":::entrega" in s
    assert "Hermes" not in s
    assert "OpenRouter" not in s
```

- [ ] **Step 2: Run — FAIL**

```bash
cd /root/clinica-odontogpt-dashboard/backend && ./venv/bin/pytest tests/test_admin_system_prompt.py -v
```

- [ ] **Step 3: Implement `build_admin_system` and wire `ask_admin`**

```python
TOM_INSTRUCTIONS = {
    "acolhedor": "Tom acolhedor: caloroso, frases claras, empodera o gestor sem rodeios excessivos.",
    "executivo": "Tom direto e executivo: priorize bullets, números e 3 ações no máximo; pouca prosa.",
    "clinico": "Tom técnico-clínico: preciso, linguagem da área, sempre ressalte limites e avaliação presencial.",
    "didatico": "Tom didático: explique o porquê de cada recomendação, útil para treinar a equipe.",
    "proativo": "Tom proativo: antecipe riscos e termine com até 3 próximos passos concretos.",
}

SKILL_LABELS = {
    "agenda": "Agenda e ocupação",
    "financeiro": "Financeiro",
    "reativacao": "Reativação de pacientes",
    "imagens": "Análise de imagens e documentos",
    "relatorios": "Relatórios executivos",
    "apresentacoes": "Apresentações / pautas",
    "alertas": "Alertas proativos da operação",
}


def build_admin_system(prefs: dict | None = None) -> str:
    prefs = prefs or {}
    nome = (prefs.get("nome_agente") or "OdontoGPT").strip()[:80]
    tom = prefs.get("tom") or "acolhedor"
    hab = prefs.get("habilidades") or {}
    tom_line = TOM_INSTRUCTIONS.get(tom, TOM_INSTRUCTIONS["acolhedor"])
    on = [SKILL_LABELS[k] for k, v in hab.items() if v and k in SKILL_LABELS]
    off = [SKILL_LABELS[k] for k, v in hab.items() if not v and k in SKILL_LABELS]
    on_s = ", ".join(on) if on else "nenhuma área extra"
    off_s = ", ".join(off) if off else "nenhuma"
    entrega_rule = ""
    if hab.get("relatorios") or hab.get("apresentacoes"):
        entrega_rule = (
            "Quando o gestor pedir relatório formal ou apresentação/pauta, além do texto conversacional "
            "inclua UM bloco no formato exato:\n"
            ":::entrega tipo=\"relatorio\" titulo=\"...\"\nmarkdown\n:::\n"
            "Use tipo=\"apresentacao\" para outlines de slides/pauta. "
            "Não mencione o delimitador ao gestor."
        )
    return (
        f"{ADMIN_SYSTEM}\n\n"
        f"Seu nome nesta conversa com o gestor é {nome}. Apresente-se e assine mentalmente como {nome}.\n"
        f"{tom_line}\n"
        f"Áreas habilitadas: {on_s}.\n"
        f"Áreas desligadas nas preferências do gestor (não proponha ações nessas áreas; se pedirem, explique "
        f"com elegância que está desligada em 'Seu agente'): {off_s}.\n"
        f"{entrega_rule}"
    )
```

Update `ask_admin` signature:

```python
def ask_admin(
    session_key: str,
    user_text: str,
    metrics_hint: str | None = None,
    history: list[dict[str, Any]] | None = None,
    content_parts: list[dict[str, Any]] | None = None,
    prefs: dict[str, Any] | None = None,
) -> Tuple[bool, str]:
    ...
    system = build_admin_system(prefs)
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    ...
```

- [ ] **Step 4: Run tests PASS**

```bash
./venv/bin/pytest tests/test_admin_system_prompt.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/hermes_agent_client.py backend/tests/test_admin_system_prompt.py
git commit -m "feat(agent): system prompt com nome, tom e habilidades"
```

---

### Task 4: Rotas API + wire do chat

**Files:**
- Modify: `backend/models.py` — add `AgentPreferenciasBody`
- Modify: `backend/main.py` — routes + `agent_chat` parse/save
- Optional smoke: extend `scripts/quality_score.py` lightly

**Interfaces:**
- `GET /api/agent/preferencias?operador=`
- `PUT /api/agent/preferencias`
- `GET /api/agent/entregas?operador=`
- Chat returns optional `entrega` in response

- [ ] **Step 1: Add Pydantic model**

In `backend/models.py`:

```python
class AgentPreferenciasBody(BaseModel):
    operador: Optional[str] = Field("Gerente", max_length=120)
    nome_agente: str = Field("OdontoGPT", min_length=1, max_length=80)
    tom: str = Field("acolhedor", max_length=40)
    habilidades: Optional[dict[str, bool]] = None
```

- [ ] **Step 2: Add routes in `main.py`**

Import `AgentPreferenciasBody`. After existing agent routes:

```python
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
```

- [ ] **Step 3: Wire `agent_chat`**

Inside `agent_chat`, before `ask_admin`:

```python
    prefs = agent_store.get_preferencias(body.operador or "Gerente")
```

Call:

```python
    ok, answer = ask_admin(
        sid,
        text,
        metrics_hint=metrics_hint,
        history=history,
        content_parts=content_parts if content_parts else None,
        prefs=prefs,
    )
```

After success:

```python
    display, entrega = agent_store.parse_entrega(answer)
    meta = {"entrega": entrega} if entrega else None
    msg_id = agent_store.append(sid, "assistant", display, meta=meta)
    saved_ent = None
    if entrega:
        saved_ent = agent_store.save_entrega(
            sid, msg_id, entrega["tipo"], entrega["titulo"], entrega["corpo_md"]
        )
    return {
        "ok": True,
        "resposta": display,
        "session_id": sid,
        "entrega": saved_ent,
    }
```

(Replace the previous single `append` of raw `answer`.)

- [ ] **Step 4: Manual smoke (auth token required)**

```bash
# com backend rodando e token válido:
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8001/api/agent/preferencias?operador=Gerente" | head
```

Expected: JSON com `nome_agente`, `tom`, `habilidades`.

If backend port differs, use the port from the running service (8000/8001).

- [ ] **Step 5: Unit tests still pass + commit**

```bash
cd /root/clinica-odontogpt-dashboard/backend && ./venv/bin/pytest tests/test_agent_preferencias.py tests/test_agent_entregas.py tests/test_admin_system_prompt.py -v
git add backend/models.py backend/main.py
git commit -m "feat(agent): APIs preferencias/entregas e chat com artefatos"
```

---

### Task 5: Frontend API client

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add functions after `uploadAgentFile`**

```javascript
export function getAgentPreferencias(operador = 'Gerente') {
  return fetchJSON(`${API}/agent/preferencias?` + new URLSearchParams({ operador }))
}

export function salvarAgentPreferencias(body) {
  return fetchJSON(`${API}/agent/preferencias`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function getAgentEntregas(operador = 'Gerente', params = {}) {
  return fetchJSON(`${API}/agent/entregas?` + new URLSearchParams({ operador, ...params }))
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(agent): client API preferencias e entregas"
```

---

### Task 6: `EntregaCard` + `EntregasPanel`

**Files:**
- Create: `frontend/src/components/agente/EntregaCard.jsx`
- Create: `frontend/src/components/agente/EntregasPanel.jsx`

- [ ] **Step 1: Create `EntregaCard.jsx`**

```jsx
import { FileText, Presentation, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

function downloadMd(titulo, corpo) {
  const blob = new Blob([corpo || ''], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(titulo || 'entrega').replace(/[^\w\-]+/g, '_').slice(0, 60)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export default function EntregaCard({ entrega, onOpen, onPedirAjuste, compact }) {
  if (!entrega) return null
  const Icon = entrega.tipo === 'apresentacao' ? Presentation : FileText
  return (
    <div className={`rounded-xl border border-accent/20 bg-accent-soft/40 ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-start gap-2">
        <Icon size={16} className="mt-0.5 shrink-0 text-accent-deep" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">{entrega.titulo}</p>
          <p className="text-[10px] uppercase tracking-wide text-ink-tertiary">
            {entrega.tipo === 'apresentacao' ? 'Apresentação' : 'Relatório'}
            {entrega.created_at ? ` · ${new Date(entrega.created_at).toLocaleString('pt-BR')}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {onOpen && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpen(entrega)}>
            Abrir
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => downloadMd(entrega.titulo, entrega.corpo_md)}
        >
          <Download size={12} /> Baixar
        </Button>
        {onPedirAjuste && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onPedirAjuste(entrega)}>
            Pedir ajuste
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `EntregasPanel.jsx`**

```jsx
import EntregaCard from './EntregaCard'

export default function EntregasPanel({ entregas, onOpen, onPedirAjuste }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
        Entregas
      </h3>
      {(!entregas || entregas.length === 0) && (
        <p className="text-xs text-ink-secondary">
          Ainda não preparei relatórios ou apresentações nesta conversa. Peça pelo chat ou use um atalho.
        </p>
      )}
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {(entregas || []).map(e => (
          <li key={e.id}>
            <EntregaCard entrega={e} onOpen={onOpen} onPedirAjuste={onPedirAjuste} compact />
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/agente/EntregaCard.jsx frontend/src/components/agente/EntregasPanel.jsx
git commit -m "feat(agent): cards e painel de entregas"
```

---

### Task 7: `PreferenciasAgente.jsx`

**Files:**
- Create: `frontend/src/components/agente/PreferenciasAgente.jsx`

- [ ] **Step 1: Implement**

Constants and component:

```jsx
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const TONS = [
  { id: 'acolhedor', label: 'Acolhedor', preview: 'Hoje você tem 12 consultas; 2 ainda sem confirmação. Quer que eu priorize o follow-up?' },
  { id: 'executivo', label: 'Direto & executivo', preview: 'Prioridades: (1) confirmar 2 lacunas (2) reenviar lembretes falhos (3) 3 reativações.' },
  { id: 'clinico', label: 'Técnico-clínico', preview: 'Pelos dados de agenda, a ocupação está estável; em imagens, descrevo achados visíveis com ressalva de avaliação presencial.' },
  { id: 'didatico', label: 'Didático', preview: 'Lembretes falhos costumam ser WhatsApp offline ou número inválido. Vamos checar o mais antigo primeiro porque…' },
  { id: 'proativo', label: 'Proativo', preview: 'Risco: 4 lembretes falhos. Próximos passos: revisar falhas, reenviar prioritários, avisar a recepção.' },
]

export const SKILL_PACKS = [
  { id: 'agenda', label: 'Agenda & ocupação', desc: 'Consultas, confirmações e encaixes' },
  { id: 'financeiro', label: 'Financeiro', desc: 'Caixa, a receber e cobrança educada' },
  { id: 'reativacao', label: 'Reativação de pacientes', desc: 'Quem sumiu e vale retomar' },
  { id: 'imagens', label: 'Análise de imagens / docs', desc: 'RX, fotos e PDF' },
  { id: 'relatorios', label: 'Relatórios executivos', desc: 'Resumos prontos para o gestor' },
  { id: 'apresentacoes', label: 'Apresentações', desc: 'Pauta e outline de slides' },
  { id: 'alertas', label: 'Alertas proativos', desc: 'Problemas nas áreas da clínica' },
]

export default function PreferenciasAgente({ value, onChange, onSave, saving, operador, onOperadorChange }) {
  const v = value || {}
  const hab = v.habilidades || {}
  const tomMeta = TONS.find(t => t.id === v.tom) || TONS[0]

  function setField(patch) {
    onChange({ ...v, ...patch })
  }

  function toggleSkill(id) {
    setField({ habilidades: { ...hab, [id]: !hab[id] } })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          Identidade
        </h3>
        <label className="mb-1 block text-xs text-ink-secondary">Nome do agente</label>
        <Input
          value={v.nome_agente || ''}
          onChange={e => setField({ nome_agente: e.target.value })}
          placeholder="Ex.: Luna"
          className="mb-3"
        />
        <label className="mb-1 block text-xs text-ink-secondary">Seu nome no histórico</label>
        <Input
          value={operador || ''}
          onChange={e => onOperadorChange?.(e.target.value)}
          placeholder="Gerente"
          className="mb-3"
        />
        <p className="mb-2 text-xs text-ink-secondary">Tom de conversa</p>
        <div className="space-y-1.5">
          {TONS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setField({ tom: t.id })}
              className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                v.tom === t.id
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-border-subtle bg-surface-1 text-ink-secondary hover:border-accent/30'
              }`}
            >
              <span className="font-medium text-ink">{t.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 rounded-lg bg-surface-1 px-2 py-1.5 text-[11px] text-ink-secondary italic">
          Ex.: “{tomMeta.preview}”
        </p>
        <Button type="button" className="mt-3 w-full" disabled={saving} onClick={onSave}>
          {saving ? 'Salvando…' : 'Salvar preferências'}
        </Button>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          O que {v.nome_agente || 'o agente'} pode fazer
        </h3>
        <p className="mb-3 text-[11px] text-ink-tertiary">Pacotes da clínica — não são controles técnicos internos.</p>
        <ul className="space-y-2">
          {SKILL_PACKS.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-1 px-2 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">{s.label}</p>
                <p className="text-[10px] text-ink-tertiary">{s.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!hab[s.id]}
                onClick={() => toggleSkill(s.id)}
                className={`relative h-6 w-10 shrink-0 rounded-full transition ${
                  hab[s.id] ? 'bg-accent' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    hab[s.id] ? 'translate-x-4' : ''
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" className="mt-3 w-full" disabled={saving} onClick={onSave}>
          Aplicar habilidades
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/agente/PreferenciasAgente.jsx
git commit -m "feat(agent): painel de identidade, tom e habilidades"
```

---

### Task 8: `Observatorio.jsx`

**Files:**
- Create: `frontend/src/components/agente/Observatorio.jsx`

- [ ] **Step 1: Implement**

```jsx
import { AlertTriangle, Calendar, Zap } from 'lucide-react'

function Stat({ label, value, warn }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${warn ? 'bg-warning/15 text-ink' : 'bg-surface-1 text-ink-secondary'}`}>
      <dt className="text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className="font-display text-lg font-semibold text-ink">{value ?? '—'}</dd>
    </div>
  )
}

export default function Observatorio({ briefing, quickPrompts, onPrompt, sending, updatedAt }) {
  const b = briefing || {}
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <Zap className="text-accent" size={18} />
          <h2 className="font-display text-sm font-semibold text-ink">Hoje na clínica</h2>
        </div>
        {updatedAt && (
          <p className="mb-3 text-[10px] text-ink-tertiary">
            Atualizado às {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Consultas hoje" value={b.agendamentos_hoje} />
          <Stat label="Confirmadas" value={b.confirmados_hoje} />
          <Stat label="Lembretes com problema" value={b.lembretes_falhos} warn={b.lembretes_falhos > 0} />
          <Stat label="Sem retorno há tempo" value={b.pacientes_sem_retorno_120d} />
          <Stat label="Novos (7 dias)" value={b.novos_pacientes_7d} />
          <Stat label="Conversas recentes" value={b.conversas_recentes_48h} />
        </dl>
      </div>

      {(b.alertas || []).length > 0 ? (
        <div className="space-y-2">
          {b.alertas.map((a, i) => (
            <button
              key={i}
              type="button"
              disabled={sending}
              onClick={() =>
                onPrompt(
                  `Sobre o alerta "${a.titulo}": ${a.detalhe || ''}. Me ajude a entender o impacto e o que fazer agora.`
                )
              }
              className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition hover:shadow-card ${
                a.nivel === 'warning'
                  ? 'border-warning/40 bg-warning/10 text-ink'
                  : 'border-border-subtle bg-surface-1 text-ink-secondary'
              }`}
            >
              <p className="flex items-center gap-1 font-semibold text-ink">
                <AlertTriangle size={12} /> {a.titulo}
              </p>
              <p className="mt-0.5">{a.detalhe}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-border-subtle bg-surface-2 px-3 py-2 text-xs text-ink-secondary">
          Nenhum alerta agora — a operação está estável.
        </p>
      )}

      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          <Calendar size={14} /> Próximos hoje
        </h3>
        <ul className="max-h-36 space-y-1.5 overflow-y-auto text-xs">
          {(b.proximos_hoje || []).length === 0 && (
            <li className="text-ink-secondary">Nenhum agendamento hoje.</li>
          )}
          {(b.proximos_hoje || []).map(row => (
            <li key={row.id}>
              <button
                type="button"
                disabled={sending}
                className="w-full rounded-lg bg-surface-1 px-2 py-1.5 text-left hover:bg-accent/10"
                onClick={() =>
                  onPrompt(
                    `Me conte o contexto operacional da consulta das ${row.horario} com ${row.paciente_nome || 'o paciente'} (${row.procedimento || 'procedimento'}).`
                  )
                }
              >
                <span className="font-medium text-ink">{row.horario}</span>{' '}
                <span className="text-ink-secondary">{row.paciente_nome || '—'}</span>
                <span className="block text-[10px] text-ink-tertiary">{row.procedimento}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          Pergunte agora
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {(quickPrompts || []).map(q => (
            <button
              key={q.id}
              type="button"
              disabled={sending}
              onClick={() => onPrompt(q.prompt)}
              className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-deep transition hover:bg-accent/20 disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              onPrompt(
                'Prepare um relatório executivo do dia da clínica com agenda, riscos e 3 ações. Use o formato de entrega formal se possível.'
              )
            }
            className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-deep"
          >
            Relatório do dia
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              onPrompt(
                'Monte um outline de apresentação/pauta semanal para a equipe (agenda, financeiro, reativação). Use formato de entrega apresentação.'
              )
            }
            className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-deep"
          >
            Pauta semanal
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/agente/Observatorio.jsx
git commit -m "feat(agent): observatório humanizado da clínica"
```

---

### Task 9: `ChatWorkspace.jsx`

**Files:**
- Create: `frontend/src/components/agente/ChatWorkspace.jsx`

- [ ] **Step 1: Port chat UI from current `AgenteAdmin.jsx` into humanized workspace**

Key props:

```jsx
/**
 * props:
 * - nomeAgente, tomLabel
 * - msgs, loading, sending, error
 * - texto, setTexto
 * - pendingFiles, onPickFiles, onRemoveFile, fileRef
 * - listening, onToggleMic
 * - onSend
 * - statusText  // "Online" | "Organizando..."
 * - emptySuggestions: [{label, prompt}]
 * - onSuggestion(prompt)
 * - onOpenEntrega(entrega)
 * - onPedirAjuste(entrega)
 */
```

Requirements:
- Header with initials avatar from `nomeAgente`
- Status line with `statusText`
- Bubbles: user accent right; agent left with name label
- Render `m.meta?.entrega` via `EntregaCard`
- Empty state humanized with suggestions
- Composer: attach, mic, textarea, Enter to send / Shift+Enter newline
- No terminal aesthetics

Implement by extracting and adapting logic already in `AgenteAdmin.jsx` (SpeechRecognition stays in parent or here — prefer **parent** for send/load, child presentational + local mic optional). **Recommendation:** keep mic/send state in `AgenteAdmin` and pass handlers; `ChatWorkspace` is mostly presentational + form.

Include `formatTime` helper (same as current).

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/agente/ChatWorkspace.jsx
git commit -m "feat(agent): workspace de conversa humanizado"
```

---

### Task 10: Orquestrar `AgenteAdmin.jsx` + CSS + Sidebar

**Files:**
- Rewrite: `frontend/src/pages/AgenteAdmin.jsx`
- Modify: `frontend/src/index.css` (keyframes)
- Modify: `frontend/src/components/Sidebar.jsx` — label `Assistente` → `Agente`

- [ ] **Step 1: CSS**

Add to `index.css` (before reduced-motion block if possible):

```css
@keyframes agent-msg-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.agent-msg-in {
  animation: agent-msg-in 0.28s ease-out;
}
```

Inside `@media (prefers-reduced-motion: reduce)` ensure:

```css
  .agent-msg-in { animation: none; }
```

- [ ] **Step 2: Rewrite `AgenteAdmin.jsx`**

Structure:

```jsx
// state: msgs, lastId, error, texto, sending, operador, loading, briefing,
//        quickPrompts, pendingFiles, listening, prefs, prefsDraft, savingPrefs,
//        entregas, drawer ('obs'|'prefs'|null), briefUpdatedAt, openEntrega modal

// load messages + preferencias + entregas + briefing on operador/load
// poll briefing every 60s
// save prefs -> salvarAgentPreferencias -> setPrefs
// sendMessage as today + reload entregas after send
// statusText derived from sending + pendingFiles

return (
  <div className="flex h-full min-h-[640px] flex-col gap-3 lg:flex-row lg:gap-4">
    {/* mobile header buttons for drawers */}
    <aside className="hidden lg:flex lg:w-72 xl:w-80 ...">
      <Observatorio ... />
    </aside>
    <section className="flex min-h-0 flex-1 ...">
      <ChatWorkspace ... />
    </section>
    <aside className="hidden lg:flex lg:w-80 ... overflow-y-auto">
      <PreferenciasAgente ... />
      <div className="mt-3">
        <EntregasPanel ... />
      </div>
    </aside>
    {/* drawers for mobile with same components */}
    {/* simple modal for open entrega: pre whitespace-pre-wrap corpo_md */}
  </div>
)
```

`OPERADOR_KEY` localStorage keep. After `save` prefs, also `localStorage.setItem(OPERADOR_KEY, operador)`.

TON label map: use `TONS` from PreferenciasAgente.

- [ ] **Step 3: Sidebar label**

```jsx
{ to: "/agente", end: false, label: "Agente", icon: Sparkles },
```

- [ ] **Step 4: Build**

```bash
cd /root/clinica-odontogpt-dashboard/frontend && npm run build
```

Expected: success, no errors.

- [ ] **Step 5: Manual UI checklist**

1. Desktop 3 colunas visíveis
2. Salvar nome Luna + tom executivo → próxima msg reflete
3. Toggle financeiro off → save → pedir caixa → recusa elegante
4. Atalho relatório → card + painel + download
5. Mobile drawers

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AgenteAdmin.jsx frontend/src/index.css frontend/src/components/Sidebar.jsx frontend/src/components/agente/
git commit -m "feat(agent): cockpit humanizado 3 colunas na /agente"
```

---

### Task 11: Quality score + regressão

**Files:**
- Modify: `scripts/quality_score.py` (optional +20–40 pts for new endpoints if pattern exists)

- [ ] **Step 1: Add checks if easy**

Near existing agent checks:

```python
add(20, _http_json_ok("http://127.0.0.1:8001/api/agent/preferencias?operador=Gerente", auth=True), "API agent preferencias")
```

(Adjust port to match project.)

- [ ] **Step 2: Run backend unit tests full agent suite**

```bash
cd /root/clinica-odontogpt-dashboard/backend && ./venv/bin/pytest tests/test_agent_preferencias.py tests/test_agent_entregas.py tests/test_admin_system_prompt.py -v
```

- [ ] **Step 3: Final commit if score script changed**

```bash
git add scripts/quality_score.py
git commit -m "chore(score): smoke preferencias do agente"
```

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
|------------------|------|
| Cockpit 3 colunas humanizado | 10 |
| Observatório pulse/alertas/atalhos | 8, 10 |
| Chat multimídia humanizado | 9, 10 |
| Nome + 5 tons | 1, 3, 4, 7 |
| Pacotes de habilidade | 1, 3, 4, 7 |
| Entregas chat + painel + .md | 2, 4, 6, 9, 10 |
| APIs preferencias/entregas | 4, 5 |
| System prompt dinâmico | 3, 4 |
| Sem Hermes exposto | 3, 7, 9 (copy) |
| Mobile drawers | 10 |
| Tokens projeto / reduced-motion | 10 |
| Sidebar “Agente” | 10 |

## Placeholder scan

Nenhum TBD/TODO residual nas tasks. Signatures alinhadas: `get_preferencias` / `save_preferencias` / `parse_entrega` / `build_admin_system` / `ask_admin(..., prefs=)`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-agente-cockpit.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
