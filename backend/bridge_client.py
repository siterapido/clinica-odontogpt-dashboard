"""Envio WhatsApp via bridge (Evolution só na rede Docker)."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Tuple

BRIDGE_URL = os.environ.get("CHAT_BRIDGE_URL", "http://127.0.0.1:8794").rstrip("/")
BRIDGE_TOKEN = os.environ.get("CHAT_BRIDGE_TOKEN", os.environ.get("WEBHOOK_SECRET", "")).strip()


def send_text(telefone: str, texto: str, atendente: str | None = None) -> Tuple[bool, str]:
    if not texto.strip():
        return False, "mensagem vazia"
    url = f"{BRIDGE_URL}/api/atendente/enviar"
    body = {"telefone": telefone, "texto": texto.strip(), "atendente": atendente or "Dashboard"}
    data = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if BRIDGE_TOKEN:
        headers["X-Bridge-Token"] = BRIDGE_TOKEN
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            payload = json.loads(resp.read().decode("utf-8") or "{}")
            if payload.get("ok"):
                return True, str(payload.get("message_id") or "ok")
            return False, payload.get("error") or "erro desconhecido"
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode("utf-8"))
            return False, err.get("error") or str(e)
        except Exception:
            return False, f"HTTP {e.code}"
    except Exception as e:
        return False, str(e)