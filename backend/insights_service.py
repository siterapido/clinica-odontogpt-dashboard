"""Insights operacionais para o painel do assistente OdontoGPT."""
from __future__ import annotations

from database import query, query_one

# Janela 7 dias BRT (SQLite: now UTC-3).
_WIN_DATA_7D = "data >= date('now', '-3 hours', '-7 days') AND data <= date('now', '-3 hours')"
_WIN_DT_7D = "datetime('now', '-3 hours', '-7 days')"


def _count(sql: str, params: tuple = ()) -> int:
    row = query_one(sql, params)
    if not row:
        return 0
    return int(row.get("total") or 0)


def _pct(numer: int, denom: int) -> float:
    if denom <= 0:
        return 0.0
    return round(100.0 * numer / denom, 1)


def anti_noshow_kpis() -> dict:
    """KPIs anti-no-show na janela dos últimos 7 dias (BRT).

    taxas: confirmados|no_show / (agendados+confirmados+realizado+no_show) * 100
    """
    agendados_7d = _count(
        f"""SELECT COUNT(*) as total FROM agendamentos
            WHERE status = 'agendado' AND {_WIN_DATA_7D}"""
    )
    confirmados_7d = _count(
        f"""SELECT COUNT(*) as total FROM agendamentos
            WHERE status = 'confirmado' AND {_WIN_DATA_7D}"""
    )
    realizado_7d = _count(
        f"""SELECT COUNT(*) as total FROM agendamentos
            WHERE status = 'realizado' AND {_WIN_DATA_7D}"""
    )
    # status canônico no_show, flag residual, ou legado 'faltou'
    no_show_7d = _count(
        f"""SELECT COUNT(*) as total FROM agendamentos
            WHERE (
                status IN ('no_show', 'faltou')
                OR (IFNULL(no_show, 0) = 1 AND status NOT IN ('agendado','confirmado','realizado','cancelado','remarcado'))
              )
              AND {_WIN_DATA_7D}"""
    )
    denom = agendados_7d + confirmados_7d + realizado_7d + no_show_7d

    taxa_confirmacao_pct = _pct(confirmados_7d, denom)
    taxa_no_show_pct = _pct(no_show_7d, denom)

    lembretes_enviados_7d = _count(
        f"""SELECT COUNT(*) as total FROM lembretes
            WHERE status = 'enviado'
              AND COALESCE(enviado_at, created_at, data_envio) >= {_WIN_DT_7D}"""
    )
    lembretes_falhos_7d = _count(
        f"""SELECT COUNT(*) as total FROM lembretes
            WHERE status = 'falhou'
              AND COALESCE(created_at, data_envio) >= {_WIN_DT_7D}"""
    )

    lista_espera_ativos = 0
    lista_espera_ofertados_7d = 0
    lista_espera_convertidos_7d = 0
    try:
        lista_espera_ativos = _count(
            "SELECT COUNT(*) as total FROM lista_espera WHERE status = 'ativo'"
        )
        lista_espera_ofertados_7d = _count(
            f"""SELECT COUNT(*) as total FROM lista_espera
                WHERE status = 'ofertado'
                  AND updated_at >= {_WIN_DT_7D}"""
        )
        lista_espera_convertidos_7d = _count(
            f"""SELECT COUNT(*) as total FROM lista_espera
                WHERE status = 'convertido'
                  AND updated_at >= {_WIN_DT_7D}"""
        )
    except Exception:
        pass

    return {
        "agendados_7d": agendados_7d,
        "confirmados_7d": confirmados_7d,
        "taxa_confirmacao_pct": taxa_confirmacao_pct,
        "no_show_7d": no_show_7d,
        "taxa_no_show_pct": taxa_no_show_pct,
        "lembretes_enviados_7d": lembretes_enviados_7d,
        "lembretes_falhos_7d": lembretes_falhos_7d,
        "lista_espera_ativos": lista_espera_ativos,
        "lista_espera_ofertados_7d": lista_espera_ofertados_7d,
        "lista_espera_convertidos_7d": lista_espera_convertidos_7d,
        # extras úteis para o agente (não quebram contrato do brief)
        "realizado_7d": realizado_7d,
        "base_agenda_7d": denom,
    }


def clinic_briefing() -> dict:
    """Resumo acionável para dono/dentista (sem PII detalhada na lista)."""
    hoje = _count(
        """SELECT COUNT(*) as total FROM agendamentos
           WHERE data = date('now', '-3 hours')"""
    )
    confirmados_hoje = _count(
        """SELECT COUNT(*) as total FROM agendamentos
           WHERE data = date('now', '-3 hours') AND status IN ('confirmado','agendado')"""
    )
    lembretes_falhos = _count(
        "SELECT COUNT(*) as total FROM lembretes WHERE status = 'falhou'"
    )
    lembretes_pendentes = _count(
        "SELECT COUNT(*) as total FROM lembretes WHERE status = 'pendente'"
    )
    sem_retorno = _count(
        """SELECT COUNT(DISTINCT p.id) as total FROM pacientes p
           WHERE NOT EXISTS (
             SELECT 1 FROM agendamentos a
             WHERE a.paciente_id = p.id AND a.data >= date('now', '-3 hours', '-120 days')
           )"""
    )
    novos_7d = _count(
        """SELECT COUNT(*) as total FROM pacientes
           WHERE created_at >= datetime('now', '-7 days')"""
    )
    proximos = query(
        """SELECT a.id, a.data, a.horario, a.procedimento, a.status, p.nome as paciente_nome
           FROM agendamentos a
           LEFT JOIN pacientes p ON a.paciente_id = p.id
           WHERE a.data = date('now', '-3 hours')
           ORDER BY a.horario ASC LIMIT 8"""
    )
    retornos_atrasados = query(
        """SELECT p.id, p.nome, MAX(a.data) as ultima_consulta
           FROM pacientes p
           JOIN agendamentos a ON a.paciente_id = p.id AND a.status = 'realizado'
           GROUP BY p.id
           HAVING ultima_consulta < date('now', '-3 hours', '-180 days')
           ORDER BY ultima_consulta ASC LIMIT 6"""
    )
    conversas_abertas = 0
    try:
        row = query_one(
            """SELECT COUNT(DISTINCT telefone) as total FROM chat_mensagens
               WHERE created_at >= datetime('now', '-48 hours')"""
        )
        if row:
            conversas_abertas = int(row.get("total") or 0)
    except Exception:
        conversas_abertas = 0

    anti = {}
    try:
        anti = anti_noshow_kpis()
    except Exception:
        anti = {
            "agendados_7d": 0,
            "confirmados_7d": 0,
            "taxa_confirmacao_pct": 0.0,
            "no_show_7d": 0,
            "taxa_no_show_pct": 0.0,
            "lembretes_enviados_7d": 0,
            "lembretes_falhos_7d": 0,
            "lista_espera_ativos": 0,
            "lista_espera_ofertados_7d": 0,
            "lista_espera_convertidos_7d": 0,
            "realizado_7d": 0,
            "base_agenda_7d": 0,
        }

    alertas: list[dict] = []
    if lembretes_falhos > 0:
        alertas.append(
            {
                "nivel": "warning",
                "titulo": "Lembretes WhatsApp falharam",
                "detalhe": f"{lembretes_falhos} envio(s) com falha — revisar em Lembretes.",
            }
        )
    if anti.get("lembretes_falhos_7d", 0) > 0 and lembretes_falhos == 0:
        # falhas só no histórico 7d (já resolvidas no total aberto)
        pass
    if anti.get("taxa_no_show_pct", 0) >= 15 and anti.get("base_agenda_7d", 0) >= 3:
        alertas.append(
            {
                "nivel": "warning",
                "titulo": "No-show elevado (7d)",
                "detalhe": (
                    f"Taxa de no-show {anti['taxa_no_show_pct']}% "
                    f"({anti['no_show_7d']} de {anti['base_agenda_7d']}) — reforçar confirmação."
                ),
            }
        )
    if anti.get("lista_espera_ativos", 0) > 0:
        alertas.append(
            {
                "nivel": "info",
                "titulo": "Lista de espera ativa",
                "detalhe": (
                    f"{anti['lista_espera_ativos']} paciente(s) na fila · "
                    f"{anti.get('lista_espera_ofertados_7d', 0)} oferta(s) em 7d."
                ),
            }
        )
    if sem_retorno > 5:
        alertas.append(
            {
                "nivel": "info",
                "titulo": "Pacientes inativos",
                "detalhe": f"{sem_retorno} pacientes sem consulta nos últimos 120 dias.",
            }
        )
    if hoje == 0:
        alertas.append(
            {
                "nivel": "info",
                "titulo": "Agenda de hoje vazia",
                "detalhe": "Nenhum agendamento para hoje no CRM.",
            }
        )

    fin = {}
    try:
        from v2_service import get_v2
        fin = get_v2().resumo_financeiro()
        if fin.get("atrasado_qtd", 0) > 0:
            alertas.append(
                {
                    "nivel": "warning",
                    "titulo": "Parcelas em atraso",
                    "detalhe": f"{fin['atrasado_qtd']} parcela(s) — R$ {fin.get('atrasado_valor', 0):.2f}.",
                }
            )
        orc = _count(
            """SELECT COUNT(*) as total FROM orcamentos
               WHERE status IN ('enviado','em_negociacao')
               AND validade_ate IS NOT NULL
               AND validade_ate <= date('now', '-3 hours', '+7 days')"""
        )
        if orc > 0:
            alertas.append(
                {
                    "nivel": "info",
                    "titulo": "Orçamentos a vencer",
                    "detalhe": f"{orc} orçamento(s) com validade nos próximos 7 dias.",
                }
            )
    except Exception:
        pass

    return {
        "agendamentos_hoje": hoje,
        "confirmados_hoje": confirmados_hoje,
        "lembretes_falhos": lembretes_falhos,
        "lembretes_pendentes": lembretes_pendentes,
        "pacientes_sem_retorno_120d": sem_retorno,
        "novos_pacientes_7d": novos_7d,
        "proximos_hoje": proximos,
        "retornos_atrasados": retornos_atrasados,
        "conversas_recentes_48h": conversas_abertas,
        "faturamento_mes": fin.get("faturamento_mes", 0),
        "a_receber": fin.get("a_receber", 0),
        "atrasado_valor": fin.get("atrasado_valor", 0),
        "anti_noshow": anti,
        "alertas": alertas,
    }


QUICK_PROMPTS = [
    {
        "id": "briefing",
        "label": "Briefing do dia",
        "prompt": "Monte um briefing executivo da clínica para hoje: agenda, riscos, lembretes e 3 ações prioritárias.",
    },
    {
        "id": "retornos",
        "label": "Quem precisa retornar",
        "prompt": "Com base nas métricas e pacientes inativos, sugira uma lista de ações de reativação (sem expor telefone na resposta).",
    },
    {
        "id": "lembretes",
        "label": "Lembretes falhos",
        "prompt": "Explique o que fazer quando há lembretes WhatsApp falhos e como priorizar reenvio.",
    },
    {
        "id": "agenda",
        "label": "Otimizar agenda",
        "prompt": "Dê dicas práticas para reduzir faltas e preencher buracos na agenda desta semana.",
    },
    {
        "id": "confirmacao_noshow",
        "label": "Confirmação e no-show 7d",
        "prompt": "Como está nossa taxa de confirmação e no-show nos últimos 7 dias?",
    },
    {
        "id": "lista_espera",
        "label": "Lista de espera",
        "prompt": "Quem está na lista de espera ativa e o que ofertar hoje?",
    },
    {
        "id": "prontuario",
        "label": "Resumo clínico",
        "prompt": "Como usar o painel para registrar prontuário rápido após o atendimento?",
    },
    {
        "id": "radiografia",
        "label": "Analisar imagem",
        "prompt": "Vou anexar uma radiografia ou foto clínica. Descreva achados visíveis, limitações e quando encaminhar ao especialista. Não substitua diagnóstico presencial.",
    },
    {
        "id": "orcamentos",
        "label": "Orçamentos abertos",
        "prompt": "Com base no briefing, priorize follow-up de orçamentos e 3 frases prontas para WhatsApp (sem inventar preços).",
    },
    {
        "id": "caixa",
        "label": "Caixa e a receber",
        "prompt": "Resuma a situação financeira da clínica no briefing e sugira ações de cobrança educadas.",
    },
]