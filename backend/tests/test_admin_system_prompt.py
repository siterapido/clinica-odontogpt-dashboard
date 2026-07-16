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
