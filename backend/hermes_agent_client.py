"""Proxy seguro para chat administrador → Hermes API (perfil odonto-gpt)."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Tuple

HERMES_API_URL = os.environ.get("ODONTO_HERMES_API_URL", "http://127.0.0.1:8643").rstrip("/")
HERMES_API_KEY = os.environ.get("ODONTO_HERMES_API_KEY", "").strip()
HERMES_MODEL = os.environ.get("ODONTO_HERMES_MODEL", "grok-3-mini").strip()
ADMIN_SESSION_PREFIX = "admin-dashboard-"

ADMIN_SYSTEM = (
    "Você é a OdontoGPT no painel administrativo da clínica (modo interativo para dono/dentista). "
    "Pode analisar imagens clínicas/radiografias anexadas, resumir documentos PDF e apoiar operação "
    "(agenda, lembretes, CRM, prontuário). Tom profissional e acolhedor em PT-BR. "
    "Em imagens: descreva achados visíveis, limitações e sempre recomende avaliação presencial — "
    "não substitua diagnóstico. "
    "NUNCA invente dados de pacientes. Use métricas do contexto quando fornecidas. "
    "Não revele telefone/PII de pacientes não citados pelo operador. "
    "Sugira ações práticas (reativação, confirmação de consulta, revisão de lembretes)."
)


def admin_session_id(operator: str) -> str:
    op = (operator or "admin").strip()[:64]
    return f"{ADMIN_SESSION_PREFIX}{op}"


def _post_chat(messages: list[dict[str, Any]], session_key: str) -> Tuple[bool, str]:
    if not HERMES_API_KEY:
        return False, "ODONTO_HERMES_API_KEY não configurada no backend do dashboard"
    url = f"{HERMES_API_URL}/v1/chat/completions"
    body = {
        "model": HERMES_MODEL,
        "user": session_key,
        "messages": messages,
    }
    data = json.dumps(body).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {HERMES_API_KEY}",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            err = json.loads(raw)
            msg = err.get("message") or err.get("error") or raw
        except json.JSONDecodeError:
            msg = raw or str(e)
        return False, f"HTTP {e.code}: {msg}"[:500]
    except Exception as e:
        return False, str(e)[:500]

    if isinstance(payload, dict):
        choices = payload.get("choices") or []
        if choices:
            content = choices[0].get("message", {}).get("content", "")
            if content:
                return True, content.strip()
    return False, "resposta vazia do Hermes"


def ask_admin(
    session_key: str,
    user_text: str,
    metrics_hint: str | None = None,
    history: list[dict[str, Any]] | None = None,
    content_parts: list[dict[str, Any]] | None = None,
) -> Tuple[bool, str]:
    text = (user_text or "").strip()
    if not text and not content_parts:
        return False, "mensagem vazia"
    if len(text) > 4000:
        text = text[:4000]

    prefix = ""
    if metrics_hint:
        prefix = f"[Contexto métricas dashboard]\n{metrics_hint[:2500]}\n\n"

    if content_parts:
        user_content: Any = [{"type": "text", "text": prefix + (text or "Analise os anexos.")}]
        user_content.extend(content_parts)
    else:
        user_content = prefix + text

    messages: list[dict[str, Any]] = [{"role": "system", "content": ADMIN_SYSTEM}]
    if history:
        for h in history[-10:]:
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_content})

    return _post_chat(messages, session_key)

STUDENT_SESSION_PREFIX = "estudante-dashboard-"
VISION_SESSION_PREFIX = "vision-dashboard-"

STUDENT_SYSTEM = (
    "Você é o Odonto GPT, tutor de Odontologia para estudantes e profissionais em formação. "
    "Responda em PT-BR, didático, com método socrático quando couber. "
    "Baseie-se em evidências; não invente referências. "
    "Não diagnostique pacientes reais nem prescreva — contexto é educacional. "
    "Se receber imagem/PDF, descreva achados visíveis e limitações, sempre como apoio ao estudo."
)

VISION_SYSTEM = (
    "Você é o Odonto Vision (modo educacional). Analise imagens radiográficas ou clínicas anexadas. "
    "Responda em PT-BR com seções: Resumo, Achados, Hipóteses diferenciais, Limitações, Próximos passos de estudo. "
    "Tom assistivo — não substitui diagnóstico nem laudo oficial. "
    "Se a imagem for inadequada, diga o que falta (contraste, campo, projeção)."
)


def estudante_session_id(aluno: str) -> str:
    key = (aluno or "aluno").strip()[:64]
    return f"{STUDENT_SESSION_PREFIX}{key}"


def vision_session_id(operator: str) -> str:
    key = (operator or "estudante").strip()[:64]
    return f"{VISION_SESSION_PREFIX}{key}"


def ask_student(
    session_key: str,
    user_text: str,
    history: list[dict[str, Any]] | None = None,
    content_parts: list[dict[str, Any]] | None = None,
) -> Tuple[bool, str]:
    text = (user_text or "").strip()
    if not text and not content_parts:
        return False, "mensagem vazia"
    if len(text) > 4000:
        text = text[:4000]
    if content_parts:
        user_content: Any = [{"type": "text", "text": text or "Analise os anexos no contexto de estudo."}]
        user_content.extend(content_parts)
    else:
        user_content = text
    messages: list[dict[str, Any]] = [{"role": "system", "content": STUDENT_SYSTEM}]
    if history:
        for h in history[-10:]:
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_content})
    return _post_chat(messages, session_key)


def ask_vision(
    session_key: str,
    image_data_url: str,
    clinical_context: str | None = None,
    history: list[dict[str, Any]] | None = None,
) -> Tuple[bool, str]:
    img = (image_data_url or "").strip()
    if not img.startswith("data:image"):
        return False, "imagem inválida (esperado data URL base64)"
    ctx = (clinical_context or "").strip()[:2000]
    prompt = "Analise a imagem anexa para fins educacionais."
    if ctx:
        prompt += f"\n\nContexto clínico informado pelo usuário:\n{ctx}"
    user_content: Any = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": img}},
    ]
    messages: list[dict[str, Any]] = [{"role": "system", "content": VISION_SYSTEM}]
    if history:
        for h in history[-6:]:
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_content})
    return _post_chat(messages, session_key)

