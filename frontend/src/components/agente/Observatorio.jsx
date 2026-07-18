import { ArrowRight, ChevronRight } from 'lucide-react'

function formatUpdatedAt(updatedAt) {
  if (!updatedAt) return null
  const d = updatedAt instanceof Date ? updatedAt : new Date(updatedAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatPct(v) {
  if (v == null || Number.isNaN(Number(v))) return null
  const n = Number(v)
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`
}

/**
 * Ações contextuais a partir do briefing + quick_prompts.
 * Prioriza risco operacional; evita catálogo/programação (AG-UI: steering simples).
 */
export function buildMissionActions(briefing, quickPrompts = []) {
  const b = briefing || {}
  const anti = b.anti_noshow || {}
  const scored = []

  const push = (id, label, prompt, score, detail = null) => {
    if (!prompt || !label) return
    scored.push({ id, label, prompt, score, detail })
  }

  if ((b.lembretes_falhos || 0) > 0) {
    push(
      'lembretes',
      'Corrigir lembretes',
      'Analise lembretes com problema/falha. Explique o impacto na agenda de hoje e diga o que a equipe deve fazer agora.',
      100,
      `${b.lembretes_falhos} com falha`
    )
  }
  if (Number(anti.taxa_no_show_pct) >= 15) {
    push(
      'noshow',
      'Reduzir no-show',
      'Como está nossa taxa de confirmação e no-show? O que fazer agora para reduzir faltas?',
      90,
      `${formatPct(anti.taxa_no_show_pct)} em 7 dias`
    )
  }
  const confHoje = b.agendamentos_hoje || 0
  const confOk = b.confirmados_hoje || 0
  const semConf = Math.max(0, confHoje - confOk)
  if (confHoje > 0 && semConf > 0) {
    push(
      'confirmacoes',
      'Confirmações pendentes',
      'Rode a rotina de confirmações: liste consultas de hoje sem confirmação, priorize riscos de falta e sugira 3 ações práticas para a equipe.',
      85,
      `${semConf} sem confirmar`
    )
  }
  if ((anti.lista_espera_ativos || 0) > 0) {
    push(
      'espera',
      'Ofertar lista de espera',
      'Quem está na lista de espera ativa? Quais slots de hoje/amanhã podem ser ofertados e em que ordem de prioridade?',
      80,
      `${anti.lista_espera_ativos} na fila`
    )
  }
  if ((b.pacientes_sem_retorno_120d || 0) > 10) {
    push(
      'recall',
      'Reativar inativos',
      'Prepare uma rotina de reativação: quantos pacientes sem retorno há 120+ dias, qual mensagem sugerida e critérios de prioridade.',
      70,
      `${b.pacientes_sem_retorno_120d} sem retorno`
    )
  }

  for (const q of quickPrompts || []) {
    push(`qp-${q.id || q.label}`, q.label, q.prompt, 40)
  }

  push(
    'relatorio',
    'Relatório executivo',
    'Gere um entregável relatorio_executivo do dia: resumo, métricas do snapshot (sem inventar), riscos e tabela de exatamente 3 ações (Ação|Por quê|Responsável|Prazo). Use o bloco :::entrega com headings exactos da skill.',
    15
  )
  push(
    'pauta',
    'Pauta semanal',
    'Gere um entregável apresentacao (pauta semanal da equipe): objetivo, slides numerados (agenda, reativação, decisões), próximos passos. Use :::entrega tipo="apresentacao" com headings da skill.',
    10
  )

  const seen = new Set()
  return scored
    .sort((a, c) => c.score - a.score)
    .filter(a => {
      const key = a.label.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 6)
}

const _CASUAL_RE =
  /^(?:oi|olá|ola|hey|e\s*aí|e\s*ai|bom\s*dia|boa\s*tarde|boa\s*noite|tudo\s*bem|tudo\s*bom|obrigad\w*|valeu|vlw|ok+|blz|beleza|show|legal|entendi|perfeito|combinado|até\s*mais|ate\s*mais|tchau|falou|como\s*vai|tudo\s*certo|opa)[\s!.?…]*$/i

const _OPERATIONAL_KW =
  /relat[oó]rio|briefing|resumo|agenda|lembrete|confirma|no-?show|paciente|consulta|reativa|lista de espera|orçamento|orcamento|tarefa|crm|métrica|metrica|entreg[aá]vel|pauta|apresenta|rotina|fila|amanh[aã]|semana|falta|analis|insight|executivo|pr[oó]xim/i

/** Detecta saudação ou papo leve — não força snapshot completo do CRM. */
export function isCasualMessage(text) {
  const t = String(text || '').trim()
  if (!t) return true
  if (_OPERATIONAL_KW.test(t)) return false
  if (_CASUAL_RE.test(t)) return true
  if (t.length <= 28 && !t.includes('?')) return true
  return false
}

/**
 * Cards de sugestão para o chat — contextuais ao dia, acima do input.
 */
export function buildChatSuggestions(briefing, quickPrompts = [], abertasCount = 0) {
  const b = briefing || {}
  const anti = b.anti_noshow || {}
  const scored = []

  const push = (id, label, hint, prompt, score, accent = false) => {
    if (!label || !prompt) return
    scored.push({ id, label, hint, prompt, score, accent })
  }

  const hoje = b.agendamentos_hoje ?? 0
  const confOk = b.confirmados_hoje ?? 0
  const semConf = Math.max(0, hoje - confOk)
  const proximos = b.proximos_hoje || []

  push(
    'resumo',
    'Resumo do dia',
    hoje > 0 ? `${hoje} consulta${hoje === 1 ? '' : 's'} · ${confOk} conf.` : 'Agenda livre',
    'Me dá um resumo objetivo do dia: o essencial da agenda, 1 risco e 1 oportunidade. Conversa direta, sem relatório formal.',
    80
  )

  if (proximos.length > 0 || abertasCount > 0) {
    push(
      'proximas',
      'Próximas tarefas',
      proximos.length > 0
        ? `Próxima ${proximos[0]?.horario || ''}`
        : `${abertasCount} na fila`,
      proximos.length > 0
        ? 'Quais são as próximas consultas de hoje e o que devo preparar antes de cada uma?'
        : 'O que está na fila de tarefas e o que priorizar agora?',
      75
    )
  }

  if ((b.lembretes_falhos || 0) > 0) {
    push(
      'lembretes',
      'Lembretes',
      `${b.lembretes_falhos} com falha`,
      'O que fazer com os lembretes que falharam? Priorize o que impacta a agenda de hoje.',
      95,
      true
    )
  }

  if (hoje > 0 && semConf > 0) {
    push(
      'confirmacoes',
      'Confirmações',
      `${semConf} pendente${semConf === 1 ? '' : 's'}`,
      'Quais consultas de hoje ainda não confirmaram? O que a equipe faz agora?',
      90,
      true
    )
  }

  if (Number(anti.taxa_no_show_pct) >= 15) {
    push(
      'noshow',
      'No-show 7d',
      formatPct(anti.taxa_no_show_pct) || 'elevado',
      'Nossa taxa de no-show subiu — qual o diagnóstico rápido e 2 ações práticas?',
      85,
      true
    )
  }

  if ((anti.lista_espera_ativos || 0) > 0) {
    push(
      'espera',
      'Lista de espera',
      `${anti.lista_espera_ativos} na fila`,
      'Quem está na lista de espera e qual slot ofertar primeiro?',
      70
    )
  }

  if ((b.pacientes_sem_retorno_120d || 0) > 5) {
    push(
      'recall',
      'Reativação',
      `${b.pacientes_sem_retorno_120d} inativos`,
      'Quantos pacientes sem retorno há 120+ dias? Sugira critério de prioridade para recall.',
      65
    )
  }

  const novos = b.novos_pacientes_7d || 0
  const firstAlerta = (b.alertas || [])[0]
  if (novos > 0 || firstAlerta) {
    push(
      'insight',
      'Insight do dia',
      firstAlerta?.titulo || (novos > 0 ? `+${novos} novos` : 'Operação'),
      firstAlerta
        ? `Sobre "${firstAlerta.titulo}": ${firstAlerta.detalhe || ''}. Me ajude com impacto e próximo passo.`
        : 'Me dá um insight rápido da semana: o que melhorou, o que piorou e uma sugestão concreta.',
      60
    )
  }

  push(
    'relatorio',
    'Relatório executivo',
    'PDF na biblioteca',
    'Gere um entregável relatorio_executivo do dia com métricas do snapshot (sem inventar), riscos e tabela de 3 ações. Use :::entrega.',
    25
  )

  for (const q of quickPrompts || []) {
    push(`qp-${q.id || q.label}`, q.label, null, q.prompt, 35)
  }

  const seen = new Set()
  return scored
    .sort((a, c) => c.score - a.score)
    .filter(s => {
      const key = s.label.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 5)
}

/** Uma frase de status — agentica, não dashboard. */
function missionNarrative(briefing, primary) {
  const b = briefing || {}
  const hoje = b.agendamentos_hoje ?? 0
  if (primary?.score >= 70) {
    return primary.detail
      ? `Foque em: ${primary.label.toLowerCase()} (${primary.detail}).`
      : `Foque em: ${primary.label.toLowerCase()}.`
  }
  if (hoje === 0) return 'Agenda livre hoje. Posso olhar reativação, fila ou o relatório.'
  return `Operação estável · ${hoje} consulta${hoje === 1 ? '' : 's'} no radar.`
}

/**
 * Missão do dia — painel limpo e agentico.
 * Hierarquia: prioridade → pedir ao agente → pulse mínimo → próximos → atalhos.
 */
export default function Observatorio({
  briefing,
  quickPrompts,
  onPrompt,
  sending,
  updatedAt,
  devidas = [],
  abertasCount = 0,
  onOpenFila,
  onOpenRotinas,
  onRunDue,
}) {
  const b = briefing || {}
  const anti = b.anti_noshow || {}
  const fire = p => {
    if (typeof onPrompt === 'function') onPrompt(p)
  }
  const updatedLabel = formatUpdatedAt(updatedAt)
  const actions = buildMissionActions(b, quickPrompts)
  const primary = actions[0]
  const secondary = actions.slice(1, 4)
  const narrative = missionNarrative(b, primary)
  const hasRisk = primary && primary.score >= 70
  const proximos = (b.proximos_hoje || []).slice(0, 4)
  const confPct = formatPct(anti.taxa_confirmacao_pct)
  const noShowPct = formatPct(anti.taxa_no_show_pct)
  const noShowWarn = Number(anti.taxa_no_show_pct) >= 15
  const firstAlerta = (b.alertas || [])[0]
  const dueFirst = (devidas || [])[0]

  return (
    <div className="flex flex-col gap-5 px-0.5">
      {/* Header mínimo */}
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            Missão do dia
          </h2>
          {updatedLabel && (
            <span className="text-[10px] tabular-nums text-ink-tertiary">{updatedLabel}</span>
          )}
        </div>
        <p className="text-[13px] leading-snug text-ink-secondary">{narrative}</p>
      </header>

      {/* Prioridade principal — CTA agentico */}
      {primary && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
            {hasRisk ? 'Prioridade' : 'Sugestão'}
          </p>
          <button
            type="button"
            disabled={sending}
            onClick={() => fire(primary.prompt)}
            className={`group w-full rounded-2xl px-3.5 py-3.5 text-left transition disabled:opacity-50 ${
              hasRisk
                ? 'bg-brand text-white shadow-card hover:bg-brand-soft'
                : 'bg-accent-soft text-ink hover:bg-accent-muted'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`font-display text-[15px] font-semibold leading-snug ${
                    hasRisk ? 'text-white' : 'text-ink'
                  }`}
                >
                  {primary.label}
                </p>
                {primary.detail && (
                  <p
                    className={`mt-0.5 text-[11px] ${
                      hasRisk ? 'text-white/75' : 'text-ink-secondary'
                    }`}
                  >
                    {primary.detail}
                  </p>
                )}
              </div>
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition group-hover:translate-x-0.5 ${
                  hasRisk ? 'bg-white/15 text-white' : 'bg-accent/20 text-accent-deep'
                }`}
              >
                <ArrowRight size={16} strokeWidth={2.2} />
              </span>
            </div>
            <p
              className={`mt-2 text-[11px] font-medium ${
                hasRisk ? 'text-white/80' : 'text-accent-deep'
              }`}
            >
              Ver com o agente
            </p>
          </button>
        </section>
      )}

      {/* Lembrete de rotina / alerta — uma linha, sem card pesado */}
      {dueFirst && (
        <button
          type="button"
          disabled={sending}
          onClick={() => onRunDue?.(dueFirst)}
          className="flex w-full items-center gap-2 border-l-2 border-warning pl-3 text-left text-[12px] text-ink disabled:opacity-50"
        >
          <span className="min-w-0 flex-1">
            <span className="font-medium">Lembrete · </span>
            {dueFirst.label || dueFirst.rotina_id}
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-accent-deep">Rodar</span>
        </button>
      )}

      {firstAlerta && !dueFirst && (
        <button
          type="button"
          disabled={sending}
          onClick={() =>
            fire(
              `Sobre o alerta "${firstAlerta.titulo}": ${firstAlerta.detalhe || ''}. Me ajude a entender o impacto e o que fazer agora.`
            )
          }
          className="flex w-full items-start gap-2 border-l-2 border-warning pl-3 text-left disabled:opacity-50"
        >
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-ink">{firstAlerta.titulo}</span>
            {firstAlerta.detalhe && (
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-secondary line-clamp-2">
                {firstAlerta.detalhe}
              </span>
            )}
          </span>
        </button>
      )}

      {/* Pulse — uma linha, só o essencial */}
      <section data-testid="anti-noshow-chips">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-ink-secondary">
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              fire(
                'Resuma a agenda de hoje: quantas consultas, quantas confirmadas e o que priorizar.'
              )
            }
            className="tabular-nums transition hover:text-ink disabled:opacity-50"
          >
            <span className="font-display text-lg font-semibold text-ink">
              {b.agendamentos_hoje ?? '—'}
            </span>
            <span className="ml-1 text-[11px]">hoje</span>
          </button>
          <span className="text-border-strong" aria-hidden>
            ·
          </span>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              fire(
                'Rode a rotina de confirmações: liste consultas de hoje sem confirmação e sugira 3 ações.'
              )
            }
            className="tabular-nums transition hover:text-ink disabled:opacity-50"
          >
            <span className="font-semibold text-ink">{b.confirmados_hoje ?? '—'}</span>
            <span className="ml-1 text-[11px]">conf.</span>
          </button>
          {confPct && (
            <>
              <span className="text-border-strong" aria-hidden>
                ·
              </span>
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  fire('Como está nossa taxa de confirmação e no-show nos últimos 7 dias?')
                }
                className="tabular-nums transition hover:text-ink disabled:opacity-50"
              >
                <span className="font-semibold text-ink">{confPct}</span>
                <span className="ml-1 text-[11px]">conf 7d</span>
              </button>
            </>
          )}
          {noShowPct && (
            <>
              <span className="text-border-strong" aria-hidden>
                ·
              </span>
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  fire('Como está nossa taxa de confirmação e no-show nos últimos 7 dias?')
                }
                className={`tabular-nums transition hover:text-ink disabled:opacity-50 ${
                  noShowWarn ? 'text-warning' : ''
                }`}
              >
                <span className={`font-semibold ${noShowWarn ? 'text-warning' : 'text-ink'}`}>
                  {noShowPct}
                </span>
                <span className="ml-1 text-[11px]">no-show</span>
              </button>
            </>
          )}
          {(b.lembretes_falhos || 0) > 0 && (
            <>
              <span className="text-border-strong" aria-hidden>
                ·
              </span>
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  fire(
                    'Analise lembretes com problema/falha e diga o que a equipe deve fazer agora.'
                  )
                }
                className="font-medium text-warning transition hover:underline disabled:opacity-50"
              >
                {b.lembretes_falhos} lembrete{b.lembretes_falhos === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Próximos — lista fluida */}
      {proximos.length > 0 && (
        <section>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
            Em seguida
          </p>
          <ul className="divide-y divide-border-subtle/80">
            {proximos.map(row => (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={sending}
                  className="flex w-full items-baseline gap-2 py-2 text-left transition hover:bg-accent-soft/40 disabled:opacity-50 -mx-1 px-1 rounded-lg"
                  onClick={() =>
                    fire(
                      `Me conte o contexto operacional da consulta das ${row.horario} com ${row.paciente_nome || 'o paciente'} (${row.procedimento || 'procedimento'}).`
                    )
                  }
                >
                  <span className="w-10 shrink-0 font-display text-[13px] font-semibold tabular-nums text-ink">
                    {row.horario}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                    {row.paciente_nome || '—'}
                  </span>
                  {row.procedimento && (
                    <span className="max-w-[40%] truncate text-[11px] text-ink-tertiary">
                      {row.procedimento}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ações secundárias — texto, sem chips em caixa */}
      {secondary.length > 0 && (
        <section>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
            Também posso
          </p>
          <ul className="space-y-0.5">
            {secondary.map(a => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => fire(a.prompt)}
                  className="group flex w-full items-center gap-1.5 rounded-lg py-1.5 text-left text-[12px] text-ink-secondary transition hover:text-accent-deep disabled:opacity-50"
                >
                  <ChevronRight
                    size={14}
                    className="shrink-0 text-ink-tertiary transition group-hover:text-accent-deep"
                  />
                  <span className="font-medium text-ink group-hover:text-accent-deep">
                    {a.label}
                  </span>
                  {a.detail && (
                    <span className="truncate text-[11px] text-ink-tertiary">· {a.detail}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Links leves para abas irmãs */}
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle/70 pt-3 text-[11px]">
        {abertasCount > 0 && onOpenFila && (
          <button
            type="button"
            onClick={onOpenFila}
            className="font-medium text-ink-secondary transition hover:text-accent-deep"
          >
            {abertasCount} na fila
          </button>
        )}
        {(devidas || []).length > 0 && onOpenRotinas && (
          <button
            type="button"
            onClick={onOpenRotinas}
            className="font-medium text-ink-secondary transition hover:text-accent-deep"
          >
            {(devidas || []).length} rotina{(devidas || []).length === 1 ? '' : 's'} devida
            {(devidas || []).length === 1 ? '' : 's'}
          </button>
        )}
        {abertasCount === 0 && (devidas || []).length === 0 && (
          <span className="text-ink-tertiary">Fila e rotinas nas abas acima</span>
        )}
      </footer>
    </div>
  )
}
