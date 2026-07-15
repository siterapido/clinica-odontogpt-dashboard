import { useState, useEffect } from 'react'
import { Users, CalendarDays, Clock, Hourglass, FileText, Activity } from 'lucide-react'
import { getMetricas } from '../api'
import PageHeader from '../components/PageHeader'
import MetricCard from '../components/MetricCard'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import QuickActions from '../components/QuickActions'
import OnboardingChecklist from '../components/OnboardingChecklist'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getMetricas().then(setData).catch(setError)
  }, [])

  if (error) return <ErrorState message={error.message} />
  if (!data) return <Loading label="Carregando métricas" />

  const isEmpty = (data.total_pacientes ?? 0) === 0 && (data.total_agendamentos ?? 0) === 0

  if (isEmpty) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          subtitle="Visão geral da clínica em tempo real"
        />
        <QuickActions />
        <div className="mt-10">
          <OnboardingChecklist />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da clínica em tempo real"
      />

      <QuickActions />

      {/* HOJE EM DESTAQUE — hero metrics */}
      <section className="mt-10">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">
          Hoje em destaque
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Hoje */}
          <Card className="bg-primary-50/50 p-6">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
              <Clock size={24} strokeWidth={1.9} />
            </div>
            <div className="font-display text-5xl font-semibold leading-none tracking-tight text-primary-900">
              {data.agendamentos_hoje ?? 0}
            </div>
            <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-primary-700">
              Consultas hoje
            </div>
            <p className="mt-1 text-xs text-primary-700/70">
              Programadas para esta data
            </p>
          </Card>

          {/* Pendentes */}
          <Card className="p-6">
            <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${
              (data.agendamentos_pendentes ?? 0) > 0
                ? 'bg-warning/10 text-warning'
                : 'bg-surface-1 text-ink-tertiary'
            }`}>
              <Hourglass size={24} strokeWidth={1.9} />
            </div>
            <div className="font-display text-5xl font-semibold leading-none tracking-tight text-ink">
              {data.agendamentos_pendentes ?? 0}
            </div>
            <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
              Pendentes
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              {(data.agendamentos_pendentes ?? 0) > 0
                ? 'Aguardando confirmação do paciente'
                : 'Tudo confirmado'}
            </p>
          </Card>
        </div>
      </section>

      {/* VISÃO GERAL — métricas secundárias */}
      <section className="mt-10">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">
          Visão geral
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard compact index={0} icon={Users} tone="primary" value={data.total_pacientes} label="Pacientes" />
          <MetricCard compact index={1} icon={CalendarDays} tone="accent" value={data.total_agendamentos} label="Agendamentos" />
          <MetricCard compact index={2} icon={FileText} tone="primary" value={data.total_prontuarios} label="Prontuários" />
          <MetricCard compact index={3} icon={Activity} tone="success" value={data.pacientes_ativos_90d} label="Ativos (90d)" />
        </div>
      </section>

      {/* ÚLTIMOS AGENDAMENTOS */}
      <Card className="mt-10">
        <CardHeader>
          <CardTitle>Últimos Agendamentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.ultimos_agendamentos?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  <th className="px-6 py-3">Paciente</th>
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3">Horário</th>
                  <th className="px-6 py-3">Procedimento</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.ultimos_agendamentos.map(a => (
                  <tr key={a.id} className="border-t border-border-subtle transition-colors hover:bg-surface-1">
                    <td className="px-6 py-3 font-medium text-ink">{a.paciente_nome || `#${a.paciente_id}`}</td>
                    <td className="px-6 py-3 text-ink-secondary">{a.data}</td>
                    <td className="px-6 py-3 text-ink-secondary">{a.horario}</td>
                    <td className="px-6 py-3 text-ink-secondary">{a.procedimento || '—'}</td>
                    <td className="px-6 py-3"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Nenhum agendamento"
              description="Os agendamentos aparecerão aqui conforme forem criados pelo OdontoGPT."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
