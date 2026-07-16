"""Proxy seguro para chat administrador → Hermes API / OpenRouter free."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Tuple

HERMES_API_URL = os.environ.get("ODONTO_HERMES_API_URL", "http://127.0.0.1:8643").rstrip("/")
HERMES_API_KEY = os.environ.get("ODONTO_HERMES_API_KEY", "").strip()
HERMES_MODEL = os.environ.get(
    "ODONTO_HERMES_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free"
).strip()

# OpenRouter direto — free models não suportam tool calling do Hermes agent
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
OPENROUTER_URL = os.environ.get("OPENROUTER_API_URL", "https://openrouter.ai/api/v1").rstrip("/")
# Prefer env ODONTO_OPENROUTER_DIRECT=1 or free-model auto
USE_OPENROUTER_DIRECT = os.environ.get("ODONTO_OPENROUTER_DIRECT", "1").strip() not in ("0", "false", "no")

ADMIN_SESSION_PREFIX = "admin-dashboard-"

ADMIN_SYSTEM = (
    "Você é a OdontoGPT no painel administrativo da clínica (modo interativo para dono/dentista). "
    "Pode analisar imagens clínicas/radiografias anexadas, resumir documentos PDF e apoiar operação "
    "(agenda, lembretes, CRM, prontuário). Tom profissional e acolhedor em PT-BR. "
    "Em imagens: descreva achados visíveis, limitações e sempre recomende avaliação presencial — "
    "não substitua diagnóstico. "
    "NUNCA invente dados de pacientes. Use métricas do contexto quando fornecidas. "
    "Não revele telefone/PII de pacientes não citados pelo operador. "
    "Sugira ações práticas (reativação, confirmação de consulta, revisão de lembretes). "
    "Nunca diga qual modelo, provedor ou IA você está usando."
)

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


def admin_session_id(operator: str) -> str:
    op = (operator or "admin").strip()[:64]
    return f"{ADMIN_SESSION_PREFIX}{op}"


def _is_free_model(model: str) -> bool:
    m = (model or "").lower()
    return m.endswith(":free") or m == "openrouter/free" or "/free" in m


def _post_openrouter(messages: list[dict[str, Any]], model: str) -> Tuple[bool, str]:
    key = OPENROUTER_API_KEY
    if not key:
        return False, "OPENROUTER_API_KEY não configurada no backend"
    url = f"{OPENROUTER_URL}/chat/completions"
    models = []
    primary = model or HERMES_MODEL
    models.append(primary)
    for m in (
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "meta-llama/llama-3.2-3b-instruct:free",
        "openrouter/free",
    ):
        if m not in models:
            models.append(m)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
        "HTTP-Referer": "https://clinica.odontogpt.com",
        "X-Title": "OdontoGPT Dashboard",
    }
    last_err = "sem resposta"
    for m in models:
        body = {
            "model": m,
            "messages": messages,
            "max_tokens": int(os.environ.get("ODONTO_OR_MAX_TOKENS", "512")),
            "temperature": 0.4,
        }
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                payload = json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            try:
                err = json.loads(raw)
                msg = err.get("error", {}).get("message") if isinstance(err.get("error"), dict) else err.get("message") or raw
            except json.JSONDecodeError:
                msg = raw or str(e)
            last_err = f"HTTP {e.code}: {msg}"[:500]
            # tenta próximo free model em 429/404
            if e.code in (429, 404, 502, 503):
                continue
            return False, last_err
        except Exception as e:
            last_err = str(e)[:500]
            continue
        if isinstance(payload, dict):
            choices = payload.get("choices") or []
            if choices:
                content = choices[0].get("message", {}).get("content", "")
                if content:
                    return True, content.strip()
        last_err = f"resposta vazia do OpenRouter ({m})"
    return False, last_err


def _post_hermes(messages: list[dict[str, Any]], session_key: str) -> Tuple[bool, str]:
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
            # Hermes sometimes returns error text as content
            hermes_meta = payload.get("hermes") or {}
            if hermes_meta.get("failed") or choices[0].get("finish_reason") == "error":
                return False, (content or hermes_meta.get("error") or "falha hermes")[:500]
            if content:
                return True, content.strip()
    return False, "resposta vazia do Hermes"


def _post_chat(messages: list[dict[str, Any]], session_key: str) -> Tuple[bool, str]:
    model = HERMES_MODEL
    if USE_OPENROUTER_DIRECT and (_is_free_model(model) or OPENROUTER_API_KEY):
        # free model → OpenRouter direto (sem tools, sem rate-limit do agent loop)
        if OPENROUTER_API_KEY and _is_free_model(model):
            return _post_openrouter(messages, model)
    return _post_hermes(messages, session_key)


def ask_admin(
    session_key: str,
    user_text: str,
    metrics_hint: str | None = None,
    history: list[dict[str, Any]] | None = None,
    content_parts: list[dict[str, Any]] | None = None,
    prefs: dict[str, Any] | None = None,
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

    system = build_admin_system(prefs)
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    if history:
        for h in history[-10:]:
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_content})

    return _post_chat(messages, session_key)


# ─── Atendimento paciente (simulador WhatsApp no dashboard) ─────────

PATIENT_SESSION_PREFIX = "paciente-sim-"

PATIENT_SYSTEM = (
    "Você é a OdontoGPT, assistente da clínica odontológica no WhatsApp. "
    "Atenda o paciente de forma acolhedora em português do Brasil: agendamento, "
    "confirmação, remarcação, lembretes e dúvidas gerais sobre a clínica. "
    "Responda só em texto natural (sem JSON, sem function calls, sem tags de tool). "
    "Não faça diagnóstico nem prescrição — oriente avaliação presencial quando couber. "
    "Nunca diga qual modelo, provedor ou IA você está usando. "
    "Nunca invente dados de outros pacientes. "
    "Use os dados cadastrados da clínica (nome, endereço, horários) quando fornecidos no contexto."
)


def patient_session_id(telefone: str) -> str:
    digits = "".join(ch for ch in (telefone or "") if ch.isdigit())[:20]
    return f"{PATIENT_SESSION_PREFIX}{digits or 'anon'}"


def ask_patient(
    session_key: str,
    user_text: str,
    history: list[dict[str, Any]] | None = None,
    telefone: str | None = None,
) -> Tuple[bool, str]:
    """Mesmo tom do bot WhatsApp — usado no chat de teste do dashboard."""
    text = (user_text or "").strip()
    if not text:
        return False, "mensagem vazia"
    if len(text) > 4000:
        text = text[:4000]

    phone = "".join(ch for ch in (telefone or "") if ch.isdigit())
    ctx = ""
    if phone:
        ctx = (
            f"[Sessão WhatsApp (simulador dashboard) — telefone do paciente: {phone}. "
            f"Responda em PT-BR, texto natural.]\n\n"
        )

    clinic_ctx = ""
    try:
        from clinic_config import clinic_context_for_bot
        clinic_ctx = clinic_context_for_bot()
    except Exception:
        clinic_ctx = ""
    system = PATIENT_SYSTEM
    if clinic_ctx:
        system = PATIENT_SYSTEM + "\n\n" + clinic_ctx

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    if history:
        for h in history[-12:]:
            role = h.get("role") or "user"
            content = h.get("content") or ""
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": ctx + f"Mensagem do paciente: {text}"})

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
