#!/usr/bin/env python3
"""Quality score OdontoGPT dashboard + agente (0–1000). Meta: >= 900."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request

ROOT = "/root/clinica-odontogpt-dashboard"
SCORE = 0
MAX = 1000
NOTES: list[str] = []


def add(points: int, ok: bool, label: str) -> None:
    global SCORE
    if ok:
        SCORE += points
        NOTES.append(f"+{points} {label}")
    else:
        NOTES.append(f" 0 {label}")


def http_ok(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            return 200 <= r.status < 300
    except Exception:
        return False


def _hermes_models_ok() -> bool:
    key = os.environ.get("ODONTO_HERMES_API_KEY", "").strip()
    if not key:
        env_path = f"{ROOT}/backend/.env"
        if os.path.isfile(env_path):
            for line in open(env_path, encoding="utf-8"):
                if line.startswith("ODONTO_HERMES_API_KEY="):
                    key = line.split("=", 1)[1].strip()
                    break
    if not key:
        return False
    req = urllib.request.Request(
        "http://127.0.0.1:8643/v1/models",
        headers={"Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return 200 <= r.status < 300
    except Exception:
        return False


def file_exists(p: str) -> bool:
    return os.path.isfile(p)


def main() -> int:
    add(80, file_exists(f"{ROOT}/backend/main.py"), "API FastAPI")
    add(60, file_exists(f"{ROOT}/backend/hermes_agent_client.py"), "Chat admin Hermes client")
    add(60, file_exists(f"{ROOT}/backend/agent_store.py"), "Histórico admin SQLite")
    add(60, file_exists(f"{ROOT}/frontend/src/pages/Conversas.jsx"), "UI chat atendente")
    add(80, file_exists(f"{ROOT}/frontend/src/pages/AgenteAdmin.jsx"), "UI chat administrador")
    add(40, file_exists("/root/.hermes-docker/profiles/odonto-gpt/skills/odonto_crm/SKILL.md"), "Skill odonto_crm")
    add(40, file_exists("/root/.hermes-docker/profiles/odonto-gpt/scripts/odonto_crm_mcp.py"), "MCP odonto-crm")
    add(50, http_ok("http://127.0.0.1:8001/api/health"), "Backend :8001 health")
    add(40, http_ok("http://127.0.0.1:8794/health"), "Bridge :8794 health")
    add(50, http_ok("http://127.0.0.1:8643/v1/models") or _hermes_models_ok(), "Hermes API :8643")
    dist = f"{ROOT}/frontend/dist/index.html"
    add(40, file_exists(dist), "Frontend build dist")
    add(30, file_exists(f"{ROOT}/Caddyfile"), "Caddyfile clinica (host)")
    # DNS/site público
    add(70, http_ok("https://clinica.odontogpt.com/api/health"), "Site público clinica.odontogpt.com")
    add(50, os.path.isfile("/root/.hermes-docker/odonto_gpt/data/crm.db"), "CRM SQLite")
    # Bridge system message (inspect running container)
    try:
        out = subprocess.check_output(
            ["docker", "inspect", "hermes-evolution-bridge", "--format", "{{range .Config.Env}}{{println .}}{{end}}"],
            text=True,
            timeout=15,
        )
        add(50, "HERMES_SYSTEM_MESSAGE=" not in out or any(
            line.startswith("HERMES_SYSTEM_MESSAGE=") and len(line) > 25 for line in out.splitlines()
        ), "Bridge HERMES_SYSTEM_MESSAGE não vazio")
        add(30, any("HERMES_MODEL=grok" in line for line in out.splitlines()), "Bridge modelo Grok/xAI")
    except Exception:
        NOTES.append(" ? bridge inspect falhou")


    add(30, subprocess.run(["systemctl", "is-active", "odontogpt-api"], capture_output=True, text=True).stdout.strip() == "active", "odontogpt-api systemd ativo")

    def _agent_smoke() -> bool:
        try:
            import json as _json
            import urllib.request as _ur
            pw = os.environ.get("ODONTOGPT_DASH_PASSWORD", "odontogpt2026")
            data = _json.dumps({"password": pw}).encode()
            req = _ur.Request("http://127.0.0.1:8001/api/login", data=data, headers={"Content-Type": "application/json"})
            with _ur.urlopen(req, timeout=10) as r:
                tok = _json.loads(r.read())["token"]
            req2 = _ur.Request("http://127.0.0.1:8001/api/agent/mensagens", headers={"Authorization": f"Bearer {tok}"})
            with _ur.urlopen(req2, timeout=15) as r2:
                return 200 <= r2.status < 300
        except Exception:
            return False

    add(40, _agent_smoke(), "API agent mensagens autenticada")

    pct = round(SCORE / MAX * 100, 1)
    report = {
        "score": SCORE,
        "max": MAX,
        "percent": pct,
        "target_met": SCORE >= 900,
        "notes": NOTES,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if SCORE >= 900 else 1


if __name__ == "__main__":
    sys.exit(main())