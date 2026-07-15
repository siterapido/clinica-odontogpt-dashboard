import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Users, CalendarDays, Clock, Hourglass, FileText, Activity, MessageSquare, Bell, AlertCircle } from 'lucide-react'
import { getMetricas, getHealth } from '../api'
import PageHeader from '../components/PageHeader'
import MetricCard from '../components/MetricCard'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import OnboardingChecklist from '../components/OnboardingChecklist'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

const REFRESH_MS = 60_000

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [health, setHealth] = useState(null)
  const [lastSync, setLastSync] = useState(null)

  async function load(silent = false) {
    if (!silent) setError(null)
    try {
      const [m, h] = await Promise.all([getMetricas(), getHealth().catch(() => null)])
      setData(m)
      setHealth(h)
      setLastSync(new Date())
    } catch (e) {
      if (!silent) setError(e)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(t)
  }, [])

  if (error) return <ErrorState message={error.message} />
  if (!data) return <Loading label="Carregando métricas" />

  const isEmpty = (data.total_pacientes ?? 0) === 0 && (data.total_agendamentos ?? 0) === 0

  return (
    <div>
      <PageHeader
        title="Visão geral"
        subtitle={
          lastSync
            ? `Atualizado às ${lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : "Visão geral da clínica"
        }
        action={
          <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                health?.status === 'ok' ? 'bg-success' : 'bg-warning'
              }`}
              aria-hidden
            />
            <span className="text-ink-secondary">
              {health?.status === 'ok' ? 'Banco conectado' : 'Verificando conexão'}
            </span>
          </div>
        }
      />

      {isEmpty ? (
        <OnboardingChecklist hasPatients={data.total_pacientes > 0} hasAppointments={data.total_agendamentos > 0} />
      ) : (
        <>
          {/* HOJE */}
          <section className="mb-10">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
              Hoje
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="p-6">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white shadow-card">
                  <Clock size={24} strokeWidth={1.9} />
                </div>
                <div className="font-display text-5xl font-semibold leading-none tracking-tight text-brand-deep">
                  {data.agendamentos_hoje ?? 0}
                </div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-accent-hover">
                  Consultas hoje
                </div>
                <p className="mt-1 text-xs text-ink-secondary">
                  Programadas para esta data
                </p>
              </Card>

              <Card className="p-6">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${
                  (data.agendamentos_pendentes ?? 0) > 0 ? 'bg-warning-soft text-warning' : 'bg-surface-1 text-ink-tertiary'
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

          {/* VISÃO GERAL */}
          <section className="mb-10">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
              Visão geral
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard compact index={0} icon={Users}         tone="primary" value={data.total_pacientes}      label="Pacientes" />
              <MetricCard compact index={1} icon={CalendarDays}  tone="accent"  value={data.total_agendamentos}    label="Agendamentos" />
              <MetricCard compact index={2} icon={FileText}      tone="primary" value={data.total_prontuarios}     label="Prontuários" />
              <MetricCard compact index={3} icon={Activity}      tone="success" value={data.pacientes_ativos_90d} label="Ativos (90d)" />
            </div>
          </section>

          {/* ALERTAS OPERACIONAIS */}
          {((data.lembretes_pendentes ?? 0) > 0 || (data.lembretes_falhos ?? 0) > 0) && (
            <section className="mb-10">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
                Alertas
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.lembretes_falhos > 0 && (
                  <Link
                    to="/lembretes?status=falhou"
                    className="flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft/30 p-4 transition-all hover:border-danger/50 hover:bg-danger-soft/60"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger/15 text-danger">
                      <AlertCircle size={18} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {data.lembretes_falhos} lembrete{data.lembretes_falhos > 1 ? 's' : ''} com falha
                      </p>
                      <p className="text-xs text-ink-secondary">
                        Verifique conexão do WhatsApp
                      </p>
                    </div>
                  </Link>
                )}
                {data.lembretes_pendentes > 0 && (
                  <Link
                    to="/lembretes?status=pendente"
                    className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft/30 p-4 transition-all hover:border-warning/50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/15 text-warning">
                      <Bell size={18} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {data.lembretes_pendentes} pendente{data.lembretes_pendentes > 1 ? 's' : ''} de envio
                      </p>
                      <p className="text-xs text-ink-secondary">
                        Aguardando disparo
                      </p>
                    </div>
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* ATALHOS */}
          <section className="mb-10">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-ink-tertiary">
              Atalhos
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QuickLink to="/agendamentos"  icon={CalendarDays}  label="Agenda" />
              <QuickLink to="/prontuarios"   icon={FileText}      label="Prontuários" />
              <QuickLink to="/conversas"     icon={MessageSquare} label="Conversas" />
              <QuickLink to="/lembretes"     icon={Bell}          label="Lembretes" />
            </div>
          </section>

          {/* ÚLTIMOS AGENDAMENTOS */}
          <Card>
            <CardHeader>
              <CardTitle>Últimos agendamentos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.ultimos_agendamentos?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle bg-accent-light text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
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
                          <td className="px-6 py-3 font-medium text-ink">
                            {a.paciente_id
                              ? <Link to={`/pacientes/${a.paciente_id}`} className="text-accent-hover hover:text-accent-deep hover:underline">{a.paciente_nome || `#${a.paciente_id}`}</Link>
                              : <span className="text-ink-tertiary">—</span>}
                          </td>
                          <td className="px-6 py-3 text-ink-secondary">{a.data}</td>
                          <td className="px-6 py-3 text-ink-secondary">{a.horario}</td>
                          <td className="px-6 py-3 text-ink-secondary">{a.procedimento || '—'}</td>
                          <td className="px-6 py-3"><StatusBadge status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="Nenhum agendamento ainda"
                  description="Os agendamentos gerenciados pelo OdontoGPT aparecerão aqui."
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function QuickLink({ to, icon: Icon, label }) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-start gap-2 rounded-2xl border border-border-subtle bg-surface-2 p-4 transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-card"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-deep transition-transform group-hover:scale-105">
        <Icon size={16} />
      </div>
      <span className="text-sm font-medium text-ink">{label}</span>
    </Link>
  )
}
