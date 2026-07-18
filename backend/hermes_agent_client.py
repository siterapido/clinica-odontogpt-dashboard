"""Proxy seguro para chat administrador → OpenRouter (flash) / Hermes API."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Tuple

HERMES_API_URL = os.environ.get("ODONTO_HERMES_API_URL", "http://127.0.0.1:8643").rstrip("/")
HERMES_API_KEY = os.environ.get("ODONTO_HERMES_API_KEY", "").strip()
HERMES_MODEL = os.environ.get(
    "ODONTO_HERMES_MODEL", "deepseek/deepseek-v4-flash"
).strip()

# OpenRouter direto — free models não suportam tool calling do Hermes agent
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
OPENROUTER_URL = os.environ.get("OPENROUTER_API_URL", "https://openrouter.ai/api/v1").rstrip("/")
# Prefer env ODONTO_OPENROUTER_DIRECT=1 or free-model auto
USE_OPENROUTER_DIRECT = os.environ.get("ODONTO_OPENROUTER_DIRECT", "1").strip() not in ("0", "false", "no")

ADMIN_SESSION_PREFIX = "admin-dashboard-"

# Core de segurança e idioma — identidade, tom e skills ficam só em build_admin_system.
ADMIN_SYSTEM = (
    "Assistente no painel administrativo da clínica (modo interativo para dono/dentista). "
    "Responda sempre em português do Brasil (PT-BR). "
    "NUNCA invente dados de pacientes. "
    "Quando houver bloco [Contexto operacional CRM] / snapshot, USE as listas "
    "(nomes, horários, tipos de lembrete, agenda). "
    "Não diga que 'só tem contagem' se o snapshot listar itens. "
    "Telefones vêm mascarados (***1234): cite assim ou diga 'ver no CRM'; "
    "não invente número completo. "
    "Em imagens clínicas/radiografias (quando o gestor anexar e a habilidade estiver habilitada): "
    "descreva achados visíveis, limitações e sempre recomende avaliação presencial — "
    "não substitua diagnóstico. "
    "Nunca diga qual modelo, provedor ou IA você está usando."
)

TOM_INSTRUCTIONS = {
    "acolhedor": (
        "Tom acolhedor e conversacional: caloroso, breve, como colega de confiança — "
        "não como relatório automático."
    ),
    "executivo": "Tom direto e executivo: priorize bullets, números e 3 ações no máximo; pouca prosa.",
    "clinico": "Tom técnico-clínico: preciso, linguagem da área, sempre ressalte limites e avaliação presencial.",
    "didatico": "Tom didático: explique o porquê de cada recomendação, útil para treinar a equipe.",
    "proativo": "Tom proativo: antecipe riscos e termine com até 3 próximos passos concretos.",
}

SKILL_LABELS = {
    "agenda": "Agenda e ocupação",
    "reativacao": "Reativação de pacientes",
    "imagens": "Análise de imagens e documentos",
    "relatorios": "Relatórios executivos",
    "apresentacoes": "Apresentações / pautas",
    "alertas": "Alertas proativos da operação",
}


def build_admin_system(prefs: dict | None = None) -> str:
    prefs = prefs or {}
    nome = (prefs.get("nome_agente") or "OdontoGPT").strip()[:80] or "OdontoGPT"
    tom = prefs.get("tom") or "acolhedor"
    hab = prefs.get("habilidades") or {}
    tom_line = TOM_INSTRUCTIONS.get(tom, TOM_INSTRUCTIONS["acolhedor"])
    on = [SKILL_LABELS[k] for k, v in hab.items() if v and k in SKILL_LABELS]
    off = [SKILL_LABELS[k] for k, v in hab.items() if not v and k in SKILL_LABELS]
    on_s = ", ".join(on) if on else "nenhuma área extra"
    off_s = ", ".join(off) if off else "nenhuma"
    conversational_rule = (
        "## Modo de conversa (prioridade sobre formatação longa)\n"
        "Padrão: conversa natural com o gestor — não despeje dados nem relatórios sem pedido.\n"
        "- Saudações e papo leve (ex.: 'bom dia', 'obrigado'): 1–3 frases calorosas. "
        "Pergunte como pode ajudar; NÃO monte briefing, agenda completa nem métricas.\n"
        "- Perguntas pontuais: responda só o que foi perguntado, em até 8 linhas.\n"
        "- Relatórios, tabelas, títulos ##, bloco :::entrega e planos estruturados: "
        "SOMENTE quando o gestor pedir explicitamente (relatório, briefing, resumo executivo, "
        "pauta, entregável) OU ao gerar :::entrega.\n"
        "- Snapshot CRM no contexto: use internamente; cite dados só quando relevantes à pergunta. "
        "Nunca devolva o snapshot inteiro.\n"
        "- Respostas casuais: sem tabelas, sem listas longas; no máximo 1 :::acao opcional.\n"
    )
    entrega_rule = (
        "Somente quando o gestor pedir um entregável formal (relatório, pauta, proposta, laudo descritivo, "
        "scripts, checklist, e-mail, post), inclua:\n"
        "1) No chat: 2–5 linhas com o que contém o material + 1 próximo passo (não só 'Preparei: título').\n"
        "2) UM único bloco de entrega (nunca dois):\n"
        ":::entrega tipo=\"<id>\" titulo=\"...\"\nconteúdo estruturado em markdown (fonte interna)\n:::\n"
        "Tipos: relatorio_executivo, apresentacao, proposta, laudo, script_campanha, "
        "checklist, email_paciente, post_redes. "
        "Siga a skill do tipo injetada no prompt (headings ## exactos, barra de qualidade, "
        "anti-patterns e identidade de marca). "
        "Não mencione o delimitador ao gestor. O painel grava na Biblioteca e o gestor baixa em "
        "PDF ou DOCX (nunca entregue .md puro como arquivo final). "
        "No chat, diga que o material está pronto para abrir/baixar em PDF/DOCX. "
        "Encerre com 1–2 :::acao contextuais quando fizer sentido.\n"
    )
    acao_rule = (
        "Quando fizer sentido oferecer 1 a 4 próximos passos clicáveis, inclua no final (sem explicar a sintaxe):\n"
        ':::acao label="Texto curto do botão" prompt="Pedido completo que o gestor enviaria se clicasse":::\n'
        "Use português brasileiro claro. Prefira ações concretas da clínica.\n"
    )
    fmt_rule = (
        "Respostas em português do Brasil, claras para o gestor. "
        "Nesta versão: NÃO trate financeiro, caixa, cobrança, parcelas nem orçamentos — "
        "se pedirem, diga que está fora do escopo desta versão e foque em agenda/CRM.\n"
        "Formate para o painel do gestor (não para terminal).\n"
        "Conversa normal: texto corrido ou 1–3 bullets curtos; evite headings e tabelas.\n"
        "Markdown simples quando necessário: **negrito**, listas com - ou 1.\n"
        "Planos de ação (só quando pedidos): tabela Passo | Script | Responsável com título 'Ação agora'.\n"
        "Tom colaborativo (colega de confiança).\n"
    )
    brand_block = ""
    catalog_block = ""
    memory_block = ""
    try:
        import brand_store
        import clinic_config
        import entregaveis_store

        clinica = clinic_config.get_clinica()
        brand_block = brand_store.brand_prompt_block(clinica.get("clinica_nome"))
        catalog_block = entregaveis_store.catalog_for_prompt()
    except Exception:
        brand_block = ""
        catalog_block = ""
    try:
        import memory_service

        memory_block = memory_service.memory_prompt_block()
    except Exception:
        memory_block = ""
    # Memória de longa duração Hermes (Supabase + arquivos locais por clínica)
    hermes_mem = ""
    try:
        import clinic_context as cx
        from pathlib import Path

        for name in ("MEMORY.md", "USER.md"):
            fp = cx.clinic_memory_dir() / name
            if fp.is_file():
                text = fp.read_text(encoding="utf-8", errors="replace").strip()
                if text:
                    hermes_mem += f"\n### {name}\n{text[:6000]}\n"
        if hermes_mem:
            hermes_mem = (
                f"\n## Memória operacional da clínica ({cx.clinic_slug()})\n"
                f"{hermes_mem}\n"
            )
    except Exception:
        hermes_mem = ""
    return (
        f"{ADMIN_SYSTEM}\n\n"
        f"Seu nome nesta conversa com o gestor é {nome}. Apresente-se e assine mentalmente como {nome}.\n"
        f"{tom_line}\n"
        f"Áreas habilitadas: {on_s}.\n"
        f"Áreas desligadas nas preferências do gestor (não proponha ações nessas áreas; se pedirem, explique "
        f"com elegância que está desligada em 'Seu agente'): {off_s}.\n"
        f"{conversational_rule}\n"
        f"{fmt_rule}\n"
        f"{brand_block}\n"
        f"{catalog_block}\n"
        f"{memory_block}\n"
        f"{hermes_mem}"
        f"{entrega_rule}"
        f"{acao_rule}"
    )


def admin_session_id(operator: str) -> str:
    op = (operator or "admin").strip()[:120]
    try:
        import clinic_context as cx
        return cx.hermes_session_key("admin", op)
    except Exception:
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
        "deepseek/deepseek-v4-pro",
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
            "max_tokens": int(os.environ.get("ODONTO_OR_MAX_TOKENS", "4000")),
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
            # tenta próximo modelo em 429/404/5xx
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
    # Dashboard: OpenRouter direto (flash pago / free) — evita loop de tools do Hermes
    if USE_OPENROUTER_DIRECT and OPENROUTER_API_KEY:
        return _post_openrouter(messages, HERMES_MODEL)
    return _post_hermes(messages, session_key)


def _build_admin_messages(
    user_text: str,
    metrics_hint: str | None = None,
    history: list[dict[str, Any]] | None = None,
    content_parts: list[dict[str, Any]] | None = None,
    prefs: dict[str, Any] | None = None,
) -> Tuple[bool, str | list[dict[str, Any]]]:
    text = (user_text or "").strip()
    if not text and not content_parts:
        return False, "mensagem vazia"
    if len(text) > 4000:
        text = text[:4000]

    prefix = ""
    if metrics_hint:
        # Snapshot operacional pode ser longo (listas de lembretes/agenda)
        prefix = f"[Contexto operacional CRM — dados reais, use na resposta]\n{metrics_hint[:6000]}\n\n"

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
    return True, messages


def ask_admin(
    session_key: str,
    user_text: str,
    metrics_hint: str | None = None,
    history: list[dict[str, Any]] | None = None,
    content_parts: list[dict[str, Any]] | None = None,
    prefs: dict[str, Any] | None = None,
) -> Tuple[bool, str]:
    ok, messages = _build_admin_messages(
        user_text,
        metrics_hint=metrics_hint,
        history=history,
        content_parts=content_parts,
        prefs=prefs,
    )
    if not ok:
        return False, str(messages)
    return _post_chat(messages, session_key)


def _stream_openrouter(messages: list[dict[str, Any]], model: str):
    """Gera deltas de texto do OpenRouter (stream=true). Yields str chunks; raises on hard fail.

    Suporta GeneratorExit (cliente cancelou) fechando a conexão HTTP.
    """
    key = OPENROUTER_API_KEY
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY não configurada no backend")
    url = f"{OPENROUTER_URL}/chat/completions"
    models = []
    primary = model or HERMES_MODEL
    models.append(primary)
    for m in (
        "deepseek/deepseek-v4-pro",
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
        "Accept": "text/event-stream",
    }
    last_err = "sem resposta"
    for m in models:
        body = {
            "model": m,
            "messages": messages,
            "max_tokens": int(os.environ.get("ODONTO_OR_MAX_TOKENS", "4000")),
            "temperature": 0.4,
            "stream": True,
        }
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        resp = None
        try:
            resp = urllib.request.urlopen(req, timeout=120)
            got_any = False
            while True:
                line = resp.readline()
                if not line:
                    break
                line = line.decode("utf-8", errors="replace").strip()
                if not line or line.startswith(":"):
                    continue
                if line.startswith("data:"):
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        obj = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    choices = obj.get("choices") or []
                    if not choices:
                        continue
                    delta = (choices[0].get("delta") or {}).get("content") or ""
                    if delta:
                        got_any = True
                        yield delta
            if got_any:
                return
            last_err = f"stream vazio do OpenRouter ({m})"
        except GeneratorExit:
            # cliente cancelou — fecha socket do provider
            try:
                if resp is not None:
                    resp.close()
            except Exception:
                pass
            raise
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            try:
                err = json.loads(raw)
                msg = (
                    err.get("error", {}).get("message")
                    if isinstance(err.get("error"), dict)
                    else err.get("message") or raw
                )
            except json.JSONDecodeError:
                msg = raw or str(e)
            last_err = f"HTTP {e.code}: {msg}"[:500]
            if e.code in (429, 404, 502, 503):
                continue
            raise RuntimeError(last_err)
        except Exception as e:
            last_err = str(e)[:500]
            continue
        finally:
            try:
                if resp is not None:
                    resp.close()
            except Exception:
                pass
    raise RuntimeError(last_err)


def ask_admin_stream(
    session_key: str,
    user_text: str,
    metrics_hint: str | None = None,
    history: list[dict[str, Any]] | None = None,
    content_parts: list[dict[str, Any]] | None = None,
    prefs: dict[str, Any] | None = None,
):
    """Yields str token chunks. Falls back to non-stream if stream path unavailable."""
    ok, messages = _build_admin_messages(
        user_text,
        metrics_hint=metrics_hint,
        history=history,
        content_parts=content_parts,
        prefs=prefs,
    )
    if not ok:
        raise RuntimeError(str(messages))

    model = HERMES_MODEL
    can_stream = USE_OPENROUTER_DIRECT and OPENROUTER_API_KEY and (
        _is_free_model(model) or True
    )
    if can_stream and not content_parts:
        # streaming text-only (multimodal costuma ser mais estável non-stream)
        try:
            yield from _stream_openrouter(messages, model)
            return
        except Exception as ex:
            print(f"[ask_admin_stream] stream fail, fallback: {ex}")

    ok2, answer = _post_chat(messages, session_key)
    if not ok2:
        raise RuntimeError(answer)
    # pseudo-stream: envia em pedaços para a UI não ficar muda
    chunk = 48
    for i in range(0, len(answer), chunk):
        yield answer[i : i + chunk]


# ─── Atendimento paciente (simulador WhatsApp no dashboard) ─────────

PATIENT_SESSION_PREFIX = "paciente-sim-"

# Mantido por compat; o prompt canônico vive em patient_atendimento.PATIENT_SYSTEM
PATIENT_SYSTEM = (
    "Você é a OdontoGPT, assistente da clínica odontológica no WhatsApp. "
    "Atenda o paciente de forma acolhedora em português do Brasil. "
    "Nunca invente agendamento — use o protocolo :::crm::: e slots reais do contexto."
)


def patient_session_id(telefone: str) -> str:
    digits = "".join(ch for ch in (telefone or "") if ch.isdigit())[:20]
    try:
        import clinic_context as cx
        return cx.hermes_session_key("patient", digits or "anon")
    except Exception:
        return f"{PATIENT_SESSION_PREFIX}{digits or 'anon'}"


def ask_patient(
    session_key: str,
    user_text: str,
    history: list[dict[str, Any]] | None = None,
    telefone: str | None = None,
) -> Tuple[bool, str]:
    """Atendimento paciente com slots reais + protocolo CRM (post-process no caller)."""
    text = (user_text or "").strip()
    if not text:
        return False, "mensagem vazia"
    if len(text) > 4000:
        text = text[:4000]

    phone = "".join(ch for ch in (telefone or "") if ch.isdigit())

    try:
        from patient_atendimento import build_patient_system, build_patient_user_prefix

        system = build_patient_system()
        prefix = build_patient_user_prefix(phone) if phone else ""
    except Exception as ex:
        print(f"[ask_patient] patient_atendimento fallback: {ex}")
        system = PATIENT_SYSTEM
        prefix = f"[Sessão telefone={phone}]\n" if phone else ""

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    if history:
        for h in history[-12:]:
            role = h.get("role") or "user"
            content = h.get("content") or ""
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": prefix + f"Mensagem do paciente: {text}"})

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
    "Você é o OdontoVision (modo educacional/assistivo). Analise imagens radiográficas ou clínicas. "
    "PT-BR. NUNCA diagnóstico definitivo, laudo oficial ou prescrição. "
    "Seções EXATAS em markdown: ## Modalidade | ## Qualidade da imagem | ## Resumo | "
    "## Achados | ## Hipóteses diferenciais | ## Limitações | ## Próximos passos. "
    "Depois :::vision_json com modalidade, qualidade_tecnica, resumo, "
    'achados[{texto,label,ponto:[x,y],bbox?,tom}], hipoteses[], limitacoes[], proximos_passos[], flags[]. '
    "ponto [x,y] 0–1 é OBRIGATÓRIO em cada achado. "
    "Se inadequada, diga o que falta. Nunca mencione modelo/provedor/stack."
)


def estudante_session_id(aluno: str) -> str:
    key = (aluno or "aluno").strip()[:64]
    try:
        import clinic_context as cx
        return cx.hermes_session_key("estudante", key)
    except Exception:
        return f"{STUDENT_SESSION_PREFIX}{key}"


def vision_session_id(operator: str) -> str:
    key = (operator or "estudante").strip()[:64]
    try:
        import clinic_context as cx
        return cx.hermes_session_key("vision", key)
    except Exception:
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
    system_prompt: str | None = None,
) -> Tuple[bool, str]:
    img = (image_data_url or "").strip()
    if not img.startswith("data:image"):
        return False, "imagem inválida (esperado data URL base64)"
    # Contexto clínico curto; schema vai no system (não truncar pipeline)
    ctx = (clinical_context or "").strip()[:4000]
    prompt = "Analise a imagem anexa (OdontoVision — educacional)."
    if ctx:
        prompt += f"\n\nContexto do operador / metadados:\n{ctx}"
    user_content: Any = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": img}},
    ]
    system = (system_prompt or "").strip() or VISION_SYSTEM
    if len(system) > 12000:
        system = system[:12000]
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    if history:
        for h in history[-6:]:
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_content})
    return _post_chat(messages, session_key)
