import { AlertTriangle, Calendar, Zap } from 'lucide-react'

function Stat({ label, value, warn }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${warn ? 'bg-warning/15 text-ink' : 'bg-surface-1 text-ink-secondary'}`}>
      <dt className="text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className="font-display text-lg font-semibold text-ink">{value ?? '—'}</dd>
    </div>
  )
}

export default function Observatorio({ briefing, quickPrompts, onPrompt, sending, updatedAt }) {
  const b = briefing || {}
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <Zap className="text-accent" size={18} />
          <h2 className="font-display text-sm font-semibold text-ink">Hoje na clínica</h2>
        </div>
        {updatedAt && (
          <p className="mb-3 text-[10px] text-ink-tertiary">
            Atualizado às {updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Consultas hoje" value={b.agendamentos_hoje} />
          <Stat label="Confirmadas" value={b.confirmados_hoje} />
          <Stat label="Lembretes com problema" value={b.lembretes_falhos} warn={b.lembretes_falhos > 0} />
          <Stat label="Sem retorno há tempo" value={b.pacientes_sem_retorno_120d} />
          <Stat label="Novos (7 dias)" value={b.novos_pacientes_7d} />
          <Stat label="Conversas recentes" value={b.conversas_recentes_48h} />
        </dl>
      </div>

      {(b.alertas || []).length > 0 ? (
        <div className="space-y-2">
          {b.alertas.map((a, i) => (
            <button
              key={i}
              type="button"
              disabled={sending}
              onClick={() =>
                onPrompt(
                  `Sobre o alerta "${a.titulo}": ${a.detalhe || ''}. Me ajude a entender o impacto e o que fazer agora.`
                )
              }
              className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition hover:shadow-card ${
                a.nivel === 'warning'
                  ? 'border-warning/40 bg-warning/10 text-ink'
                  : 'border-border-subtle bg-surface-1 text-ink-secondary'
              }`}
            >
              <p className="flex items-center gap-1 font-semibold text-ink">
                <AlertTriangle size={12} /> {a.titulo}
              </p>
              <p className="mt-0.5">{a.detalhe}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-border-subtle bg-surface-2 px-3 py-2 text-xs text-ink-secondary">
          Nenhum alerta agora — a operação está estável.
        </p>
      )}

      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          <Calendar size={14} /> Próximos hoje
        </h3>
        <ul className="max-h-36 space-y-1.5 overflow-y-auto text-xs">
          {(b.proximos_hoje || []).length === 0 && (
            <li className="text-ink-secondary">Nenhum agendamento hoje.</li>
          )}
          {(b.proximos_hoje || []).map(row => (
            <li key={row.id}>
              <button
                type="button"
                disabled={sending}
                className="w-full rounded-lg bg-surface-1 px-2 py-1.5 text-left hover:bg-accent/10"
                onClick={() =>
                  onPrompt(
                    `Me conte o contexto operacional da consulta das ${row.horario} com ${row.paciente_nome || 'o paciente'} (${row.procedimento || 'procedimento'}).`
                  )
                }
              >
                <span className="font-medium text-ink">{row.horario}</span>{' '}
                <span className="text-ink-secondary">{row.paciente_nome || '—'}</span>
                <span className="block text-[10px] text-ink-tertiary">{row.procedimento}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          Pergunte agora
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {(quickPrompts || []).map(q => (
            <button
              key={q.id}
              type="button"
              disabled={sending}
              onClick={() => onPrompt(q.prompt)}
              className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-deep transition hover:bg-accent/20 disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              onPrompt(
                'Prepare um relatório executivo do dia da clínica com agenda, riscos e 3 ações. Use o formato de entrega formal se possível.'
              )
            }
            className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-deep"
          >
            Relatório do dia
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              onPrompt(
                'Monte um outline de apresentação/pauta semanal para a equipe (agenda, financeiro, reativação). Use formato de entrega apresentação.'
              )
            }
            className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-deep"
          >
            Pauta semanal
          </button>
        </div>
      </div>
    </div>
  )
}
