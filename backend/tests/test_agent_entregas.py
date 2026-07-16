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


def test_parse_entrega_flexible_quotes_and_whitespace(agent_store):
    raw = '''Aqui vai.

:::entrega  tipo = 'apresentacao'  titulo = "Pauta reunião"
## Slide 1
- item
:::

Fim.'''
    display, ent = agent_store.parse_entrega(raw)
    assert ent is not None
    assert ent["tipo"] == "apresentacao"
    assert ent["titulo"] == "Pauta reunião"
    assert "## Slide 1" in ent["corpo_md"]
    assert ":::entrega" not in display
    assert "Fim." in display


def test_save_and_list_entregas(agent_store):
    mid = agent_store.append("admin-dashboard-Gerente", "assistant", "texto com entrega")
    ent = agent_store.save_entrega(
        "admin-dashboard-Gerente", mid, "relatorio", "Título", "## corpo"
    )
    assert ent["id"] > 0
    rows = agent_store.list_entregas("admin-dashboard-Gerente")
    assert len(rows) == 1
    assert rows[0]["titulo"] == "Título"
