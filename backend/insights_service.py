"""Insights operacionais para o painel do assistente OdontoGPT."""
from __future__ import annotations

from database import query, query_one


def _count(sql: str, params: tuple = ()) -> int:
    row = query_one(sql, params)
    if not row:
        return 0
    return int(row.get("total") or 0)


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

    alertas: list[dict] = []
    if lembretes_falhos > 0:
        alertas.append(
            {
                "nivel": "warning",
                "titulo": "Lembretes WhatsApp falharam",
                "detalhe": f"{lembretes_falhos} envio(s) com falha — revisar em Lembretes.",
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
        "id": "prontuario",
        "label": "Resumo clínico",
        "prompt": "Como usar o painel para registrar prontuário rápido após o atendimento?",
    },
    {
        "id": "radiografia",
        "label": "Analisar imagem",
        "prompt": "Vou anexar uma radiografia ou foto clínica. Descreva achados visíveis, limitações e quando encaminhar ao especialista. Não substitua diagnóstico presencial.",
    },
]