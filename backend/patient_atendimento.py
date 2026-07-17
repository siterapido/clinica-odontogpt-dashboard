"""Atendimento paciente (WhatsApp / simulador): prompt, slots reais e ações CRM.

O modelo free no OpenRouter NÃO tem tools. Sem este módulo o bot inventava
"consulta marcada" sem gravar no CRM. Aqui:
1. Contexto com slots/dentistas reais
2. Protocolo :::crm ...::: na resposta
3. Execução determinística no SQLite via OdontoCRM
4. Sanitização se o modelo "confirmar" sem tag
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Optional

TZ_BRT = timedelta(hours=-3)

# Ação embutida na resposta (o paciente NÃO vê — removemos antes de enviar)
# Não use [^\n:]+ — data/hora têm ":" (ex: 09:00).
CRM_ACTION_RE = re.compile(
    r":::crm\s+(.+?):::",
    re.IGNORECASE | re.DOTALL,
)

# Frases que soam como confirmação falsa (sem ação CRM)
FALSE_CONFIRM_RE = re.compile(
    r"\b("
    r"confirmad[oa]|confirm[ei]|marcamos|marquei|agendei|reservei|"
    r"foi\s+marcado|agendamento\s+(ficou|est[aá])|"
    r"reservad[oa]|te\s+espero|te\s+esperamos|consulta\s+marcada|"
    r"seu\s+agendamento\s+ficou|j[aá]\s+est[aá]\s+agendad"
    r")\b",
    re.IGNORECASE,
)

PATIENT_SYSTEM = """Você é a OdontoGPT, atendente virtual da clínica no WhatsApp.

## Identidade
- Acolhedora, clara, objetiva. PT-BR. Você NÃO é dentista.
- Não diagnostica, não prescreve, não inventa preço.
- Nunca diga qual modelo/IA você é. Nunca cite JSON ou tools ao paciente.

## Formato WhatsApp (obrigatório)
- 2 a 4 linhas por mensagem. Máximo 6 se for confirmação com detalhes.
- 1 pergunta aberta por turno (nunca 3 de uma vez).
- 0–1 emoji. Sem markdown pesado (evite ** e listas longas no celular).
- CTA no fim quando fizer sentido.

## Conversão (do “oi” à cadeira)
1. Escuta a queixa/pedido em 1 frase.
2. Oferece valor da avaliação (sem inventar preço se não estiver no contexto).
3. Oferece 2 horários CONCRETOS do bloco [Slots reais] — nunca invente horário.
4. Fecha: nome se faltar + confirmação do slot.
5. Só então emite a ação CRM (ver abaixo).

Objeções comuns:
- “Vou pensar” → acolhe, pergunta o que trava (preço/horário/medo), oferece encaixe ou lista de espera.
- “Quanto custa” → avaliação depende do caso; valor fecha com o dentista; convide a marcar.
- Urgência/dor → acolhe, classifica leve, tenta encaixe HOJE com slots reais; se grave, oriente ir presencial/emergência.

## Agenda — regra de ouro (anti-alucinação)
- Horários válidos = APENAS os listados em [Slots reais] no contexto.
- Se não houver slots no contexto: diga que vai verificar com a recepção — NÃO invente.
- NUNCA diga que marcou/confirmou/reservou sem emitir a tag :::crm::: no FINAL da mensagem.
- Se o paciente escolher horário fora da lista: diga que não está livre e ofereça 2 da lista.

## Ações CRM (invisíveis ao paciente — sempre no FINAL)
Quando for REALMENTE gravar algo, acrescente UMA linha no final:

:::crm criar_agendamento data=YYYY-MM-DD horario=HH:MM procedimento=Limpeza dentista=Nome do dentista:::
:::crm confirmar_agendamento id=123:::
:::crm cancelar_agendamento id=123 motivo=paciente pediu:::
:::crm lista_espera procedimento=Limpeza preferencia=manhã:::
:::crm followup titulo=Retomar orçamento tipo=comercial:::
:::crm stage stage=agendamento lead_score=4:::

Regras da tag:
- Atributos: chave=valor separados por espaço. Valores com espaço OK até o próximo chave= ou :::.
- procedimento e dentista obrigatórios em criar_agendamento.
- data e horario no formato acima (ISO).
- Você pode combinar texto humano + tag; a tag será removida antes de enviar ao paciente.

## O que NÃO fazer
- Inventar dentista, endereço, convênio ou preço.
- Confirmar consulta só no texto.
- Pedir senha, cartão ou dados de outro paciente.
- Diagnosticar (“parece cárie”).
"""


def _now_brt() -> datetime:
    return datetime.utcnow() + TZ_BRT


def _parse_attrs(raw: str) -> dict[str, str]:
    """Parse `acao chave=valor ...`. Ação em `acao` (tipo= de follow-up não sobrescreve)."""
    raw = (raw or "").strip()
    if not raw:
        return {}
    parts = raw.split(None, 1)
    acao = parts[0].strip().lower()
    rest = parts[1] if len(parts) > 1 else ""
    attrs: dict[str, str] = {"acao": acao, "tipo": acao}
    if not rest:
        return attrs
    keys = list(re.finditer(r"([a-zA-Z_][a-zA-Z0-9_]*)=", rest))
    for i, m in enumerate(keys):
        key = m.group(1).lower()
        start = m.end()
        end = keys[i + 1].start() if i + 1 < len(keys) else len(rest)
        val = rest[start:end].strip().replace("\n", " ")
        if key == "tipo" and acao == "followup":
            attrs["followup_tipo"] = val
            attrs["tipo_fu"] = val
        else:
            attrs[key] = val
    attrs["acao"] = acao
    return attrs


def parse_crm_actions(text: str) -> tuple[str, list[dict[str, str]]]:
    """Remove tags :::crm ...::: e retorna (texto_limpo, ações)."""
    actions: list[dict[str, str]] = []
    if not text:
        return "", actions

    def _repl(m: re.Match) -> str:
        actions.append(_parse_attrs(m.group(1)))
        return ""

    clean = CRM_ACTION_RE.sub(_repl, text)
    # limpa linhas vazias extras
    clean = re.sub(r"\n{3,}", "\n\n", clean).strip()
    return clean, actions


def slots_context(limite: int = 12) -> str:
    """Monta bloco de slots reais dos próximos 7 dias."""
    try:
        from v2_service import get_v2

        hoje = _now_brt().date()
        fim = hoje + timedelta(days=7)
        rows = get_v2().listar_slots(
            hoje.isoformat(),
            fim.isoformat(),
            None,
            30,
            limite,
        )
    except Exception as exc:
        return f"[Slots reais]\nIndisponível no momento ({exc}). Não invente horários."

    if not rows:
        return (
            "[Slots reais]\nNenhum horário livre nos próximos 7 dias no sistema. "
            "Ofereça lista de espera ou diga que a recepção vai retornar."
        )

    lines = ["[Slots reais — use SOMENTE estes]"]
    for s in rows[:limite]:
        lines.append(
            f"- {s.get('data')} {s.get('horario')} · {s.get('dentista_nome') or 'Dentista'}"
            + (f" (id {s.get('dentista_id')})" if s.get("dentista_id") else "")
        )
    lines.append("Ofereça no máximo 2 opções por mensagem.")
    return "\n".join(lines)


def patient_crm_snapshot(telefone: str) -> str:
    """Resumo do paciente da sessão (1 paciente) para o prompt."""
    digits = "".join(ch for ch in (telefone or "") if ch.isdigit())
    if not digits:
        return ""
    try:
        from crm_service import get_crm

        crm = get_crm()
        pac = crm.buscar_paciente(digits)
        if not pac:
            # tenta últimos dígitos
            pac = crm.buscar_paciente(digits[-11:]) if len(digits) >= 11 else None
        if not pac:
            return f"[Paciente]\nTelefone sessão: {digits}. Ainda sem cadastro completo."
        pid = pac["id"]
        ags = crm.listar_agendamentos(pid) or []
        futuros = [
            a
            for a in ags
            if (a.get("status") or "") in ("agendado", "confirmado")
        ][:3]
        lines = [
            "[Paciente da sessão]",
            f"id={pid} nome={pac.get('nome') or '—'} tel={pac.get('whatsapp') or pac.get('telefone') or digits}",
        ]
        if futuros:
            lines.append("Próximas consultas:")
            for a in futuros:
                lines.append(
                    f"- id={a.get('id')} {a.get('data')} {a.get('horario')} "
                    f"{a.get('procedimento')} ({a.get('status')}) dentista={a.get('dentista') or '—'}"
                )
        else:
            lines.append("Sem consulta futura no CRM.")
        return "\n".join(lines)
    except Exception as exc:
        return f"[Paciente]\nContexto indisponível: {exc}"


def build_patient_system() -> str:
    clinic = ""
    try:
        from clinic_config import clinic_context_for_bot

        clinic = clinic_context_for_bot() or ""
    except Exception:
        clinic = ""
    parts = [PATIENT_SYSTEM]
    if clinic:
        parts.append(clinic)
    parts.append(slots_context())
    return "\n\n".join(parts)


def build_patient_user_prefix(telefone: str) -> str:
    snap = patient_crm_snapshot(telefone)
    phone = "".join(ch for ch in (telefone or "") if ch.isdigit())
    bits = [
        f"[Sessão WhatsApp — telefone: {phone}]",
        "Responda em PT-BR, texto natural curto.",
    ]
    if snap:
        bits.append(snap)
    return "\n".join(bits) + "\n\n"


def _resolve_paciente_id(telefone: str) -> Optional[int]:
    from crm_service import get_crm

    crm = get_crm()
    digits = "".join(ch for ch in (telefone or "") if ch.isdigit())
    pac = crm.buscar_paciente(digits)
    if not pac and len(digits) >= 11:
        pac = crm.buscar_paciente(digits[-11:])
    if pac:
        return int(pac["id"])
    # cria cadastro mínimo no simulador/lead novo
    try:
        created = crm.criar_paciente(
            nome="Paciente WhatsApp",
            telefone=digits,
            observacoes="criado no atendimento automático",
        )
        if isinstance(created, dict):
            return int(created.get("id") or 0) or None
        return int(created) if created else None
    except Exception:
        return None


def apply_crm_actions(
    telefone: str, actions: list[dict[str, str]]
) -> list[dict[str, Any]]:
    """Executa ações parseadas. Retorna log por ação."""
    results: list[dict[str, Any]] = []
    if not actions:
        return results

    from crm_service import get_crm
    import chat_store

    crm = get_crm()
    phone = "".join(ch for ch in (telefone or "") if ch.isdigit())
    pid = _resolve_paciente_id(phone)

    for act in actions:
        tipo = (act.get("acao") or act.get("tipo") or "").lower()
        entry: dict[str, Any] = {"tipo": tipo, "ok": False}
        try:
            if tipo == "criar_agendamento":
                if not pid:
                    raise ValueError("paciente não resolvido")
                data = act.get("data") or ""
                horario = act.get("horario") or ""
                proc = act.get("procedimento") or "Consulta"
                dentista = act.get("dentista") or None
                if not re.match(r"^\d{4}-\d{2}-\d{2}$", data):
                    raise ValueError("data inválida (use YYYY-MM-DD)")
                if not re.match(r"^\d{1,2}:\d{2}$", horario):
                    raise ValueError("horario inválido (use HH:MM)")
                # normaliza HH:MM
                hh, mm = horario.split(":")
                horario = f"{int(hh):02d}:{int(mm):02d}"
                aid = crm.criar_agendamento(pid, data, horario, proc, dentista)
                entry.update(
                    {
                        "ok": True,
                        "agendamento_id": aid,
                        "data": data,
                        "horario": horario,
                        "procedimento": proc,
                        "dentista": dentista,
                    }
                )
                try:
                    chat_store.atualizar_crm(
                        phone,
                        stage="agendamento",
                        lead_score=4,
                        tags=["avaliacao"],
                    )
                except Exception:
                    pass

            elif tipo == "confirmar_agendamento":
                aid = int(act.get("id") or 0)
                if not aid:
                    raise ValueError("id do agendamento obrigatório")
                # update status
                with crm._conn() as c:  # noqa: SLF001
                    c.execute(
                        "UPDATE agendamentos SET status='confirmado', confirmado_em=datetime('now','-3 hours') WHERE id=?",
                        (aid,),
                    )
                entry.update({"ok": True, "agendamento_id": aid})

            elif tipo == "cancelar_agendamento":
                aid = int(act.get("id") or 0)
                motivo = act.get("motivo") or "cancelado pelo paciente"
                if not aid:
                    raise ValueError("id do agendamento obrigatório")
                ok = crm.cancelar_agendamento(aid, motivo)
                entry.update({"ok": bool(ok), "agendamento_id": aid})

            elif tipo == "lista_espera":
                if not pid:
                    raise ValueError("paciente não resolvido")
                proc = act.get("procedimento") or "Consulta"
                pref = act.get("preferencia") or act.get("periodo_preferido") or "qualquer"
                try:
                    from v2_service import get_v2

                    item_id = get_v2().lista_espera_add(
                        pid,
                        procedimento=proc,
                        periodo_preferido=pref,
                        notas=act.get("notas"),
                    )
                    entry.update({"ok": True, "lista_espera_id": item_id})
                except Exception as exc:
                    entry.update({"ok": False, "erro": f"lista_espera: {exc}"[:200]})

            elif tipo == "followup":
                titulo = act.get("titulo") or "Follow-up automático"
                ftipo = act.get("tipo_fu") or act.get("followup_tipo") or "comercial"
                row = chat_store.criar_followup(
                    phone,
                    titulo=titulo,
                    descricao=act.get("descricao") or "",
                    tipo=ftipo,
                    due_hours=int(act.get("due_hours") or 24),
                )
                entry.update({"ok": True, "followup": row})

            elif tipo == "stage":
                stage = act.get("stage")
                score = act.get("lead_score")
                kwargs: dict[str, Any] = {}
                if stage:
                    kwargs["stage"] = stage
                if score and str(score).isdigit():
                    kwargs["lead_score"] = int(score)
                if kwargs:
                    chat_store.atualizar_crm(phone, **kwargs)
                entry.update({"ok": True, **kwargs})

            else:
                entry["erro"] = f"ação desconhecida: {tipo}"
        except Exception as exc:
            entry["erro"] = str(exc)[:240]
        results.append(entry)
    return results


def sanitize_patient_reply(
    clean_text: str, action_results: list[dict[str, Any]]
) -> str:
    """Se o modelo 'confirmou' sem ação OK, corrige o texto."""
    text = (clean_text or "").strip()
    any_ok = any(r.get("ok") for r in action_results)
    created = next(
        (r for r in action_results if r.get("tipo") == "criar_agendamento" and r.get("ok")),
        None,
    )

    if created:
        # reforça confirmação factual se o texto ficou fraco
        if not FALSE_CONFIRM_RE.search(text):
            text = (
                (text + "\n\n" if text else "")
                + f"Pronto! Ficou marcado: {created.get('data')} às {created.get('horario')}"
                + (f" com {created['dentista']}" if created.get("dentista") else "")
                + f" ({created.get('procedimento')}). Te mando lembrete antes, ok?"
            )
        return text.strip()

    if FALSE_CONFIRM_RE.search(text) and not any_ok:
        # remove falsa confirmação
        text = (
            "Ainda não consegui reservar no sistema. "
            "Me confirma de novo o dia e horário (entre as opções que te passei) "
            "que eu finalizo pra você?"
        )
    return text.strip()


def process_patient_reply(
    telefone: str, raw_answer: str
) -> tuple[str, list[dict[str, Any]]]:
    """Pipeline completo: parse → apply → sanitize."""
    clean, actions = parse_crm_actions(raw_answer or "")
    results = apply_crm_actions(telefone, actions) if actions else []
    final = sanitize_patient_reply(clean, results)
    return final, results


REWRITE_SYSTEM = """Você reescreve UMA resposta do assistente da clínica odontológica no WhatsApp.
Regras:
- Corrija o que o supervisor pedir (tom, fato, CTA, clareza).
- Mantenha o que já estava certo.
- Texto curto, humano, PT-BR, 2–4 linhas.
- Não invente horário, preço ou procedimento fora do contexto.
- NÃO inclua tags :::crm::: nem meta-comentário.
- Saída: SOMENTE o texto reescrito, pronto para enviar."""


def rewrite_patient_reply(
    original: str,
    nota: int | None = None,
    comentario: str | None = None,
    history: list[dict[str, Any]] | None = None,
) -> tuple[bool, str]:
    """Reescreve resposta do bot via LLM puro — sem tools CRM / process_patient_reply."""
    orig = (original or "").strip()
    if not orig:
        return False, "resposta original vazia"
    com = (comentario or "").strip()
    n = int(nota) if nota is not None else None
    if n is None and not com:
        return False, "informe nota ou comentário"

    hint = ""
    if n is not None and n <= 3 and not com:
        hint = "Melhore clareza, empatia e um próximo passo concreto."
    elif n is not None and n >= 4 and not com:
        hint = "Faça um polimento leve mantendo o sentido."

    user_parts = [
        f"Resposta original:\n{orig[:4000]}",
        f"Nota do supervisor (1–5): {n if n is not None else '—'}",
        f"Comentário / o que corrigir: {com or hint or '(sem detalhe)'}",
    ]
    if history:
        lines = []
        for h in history[-12:]:
            role = h.get("role") or "user"
            content = (h.get("content") or "").strip()
            if content:
                lines.append(f"{role}: {content[:500]}")
        if lines:
            user_parts.append("Contexto recente:\n" + "\n".join(lines))

    messages = [
        {"role": "system", "content": REWRITE_SYSTEM},
        {"role": "user", "content": "\n\n".join(user_parts)},
    ]

    try:
        from hermes_agent_client import _post_chat
    except Exception as ex:
        return False, f"cliente LLM indisponível: {ex}"

    ok, answer = _post_chat(messages, "paciente-rewrite")
    if not ok:
        return False, answer or "falha LLM"

    text = (answer or "").strip()
    # remove qualquer tag CRM acidental — nunca executar tools
    text = CRM_ACTION_RE.sub("", text).strip()
    if not text:
        return False, "reescrita vazia"
    return True, text[:4000]
