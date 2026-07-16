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


def test_no_entrega_when_relatorios_and_apresentacoes_off():
    s = build_admin_system({
        "nome_agente": "Luna",
        "tom": "acolhedor",
        "habilidades": {
            "agenda": True,
            "financeiro": True,
            "reativacao": True,
            "imagens": True,
            "relatorios": False,
            "apresentacoes": False,
            "alertas": True,
        },
    })
    assert ":::entrega" not in s
    assert "Hermes" not in s
    assert "OpenRouter" not in s


def test_whitespace_or_empty_nome_falls_back_to_odontogpt():
    for nome in ("   ", "", None):
        s = build_admin_system({
            "nome_agente": nome,
            "tom": "acolhedor",
            "habilidades": {},
        })
        assert "OdontoGPT" in s
        assert "Hermes" not in s
        assert "OpenRouter" not in s


def test_never_leaks_provider_names():
    s = build_admin_system(None)
    assert "Hermes" not in s
    assert "OpenRouter" not in s
    assert "openrouter" not in s.lower()
