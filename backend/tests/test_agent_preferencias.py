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
