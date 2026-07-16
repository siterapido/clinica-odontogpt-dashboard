"""Smoke tests for estudantes/vision Hermes routes (no live Hermes call)."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path("/root/clinica-odontogpt-dashboard/backend")
sys.path.insert(0, str(ROOT))

def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

hc = _load("hermes_agent_client", "hermes_agent_client.py")

def test_session_ids():
    assert hc.estudante_session_id(" Ana ").startswith("estudante-dashboard-")
    assert hc.vision_session_id("x").startswith("vision-dashboard-")

def test_ask_student_empty():
    ok, msg = hc.ask_student("estudante-dashboard-t", "", None, None)
    assert not ok
    assert "vazia" in msg.lower()
