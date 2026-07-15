import { useState, useEffect } from 'react'
import { Users, CalendarDays, Clock, Hourglass, FileText, Activity } from 'lucide-react'
import { getMetricas } from '../api'
import PageHeader from '../components/PageHeader'
import MetricCard from '../components/MetricCard'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getMetricas().then(setData).catch(setError)
  }, [])

  if (error) return <ErrorState message={error.message} />
  if (!data) return <Loading label="Carregando métricas" />

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral da clínica" />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard index={0} icon={Users} tone="primary" value={data.total_pacientes} label="Pacientes" />
        <MetricCard index={1} icon={CalendarDays} tone="accent" value={data.total_agendamentos} label="Agendamentos" />
        <MetricCard index={2} icon={Clock} tone="warning" value={data.agendamentos_hoje} label="Hoje" />
        <MetricCard index={3} icon={Hourglass} tone="warning" value={data.agendamentos_pendentes} label="Pendentes" />
        <MetricCard index={4} icon={FileText} tone="primary" value={data.total_prontuarios} label="Prontuários" />
        <MetricCard index={5} icon={Activity} tone="success" value={data.pacientes_ativos_90d} label="Ativos (90d)" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos Agendamentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.ultimos_agendamentos?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent-light/25 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  <th className="px-6 py-3">Paciente</th>
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3">Horário</th>
                  <th className="px-6 py-3">Procedimento</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.ultimos_agendamentos.map(a => (
                  <tr key={a.id} className="border-t border-border transition-colors hover:bg-surface">
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
