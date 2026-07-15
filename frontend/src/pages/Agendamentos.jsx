import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { getAgendamentos } from '../api'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const PAGE_SIZE = 30

export default function Agendamentos() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('')
  const [dataFiltro, setDataFiltro] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)

  const fetchData = useCallback(() => {
    setError(null)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    if (status) params.status = status
    if (dataFiltro) params.data = dataFiltro
    getAgendamentos(params).then(setData).catch(setError)
  }, [status, dataFiltro, page])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div>
      <PageHeader title="Agendamentos" subtitle="Consultas e procedimentos" />

      <div className="mb-5 flex flex-wrap gap-3">
        <Input
          type="date"
          value={dataFiltro}
          onChange={e => { setDataFiltro(e.target.value); setPage(0) }}
          className="max-w-[200px]"
        />
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(0) }}
          className="h-10 rounded-xl border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        >
          <option value="">Todos os status</option>
          <option value="agendado">Agendado</option>
          <option value="confirmado">Confirmado</option>
          <option value="realizado">Realizado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {error && <ErrorState message={error.message} />}
      {!error && !data && <Loading label="Carregando agendamentos" />}

      {data && data.data.length === 0 && (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="Nenhum agendamento"
            description="Os agendamentos gerenciados pelo OdontoGPT aparecerão aqui."
          />
        </Card>
      )}

      {data && data.data.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-accent-light/25 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <th className="px-6 py-3">Paciente</th>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Horário</th>
                <th className="px-6 py-3">Dentista</th>
                <th className="px-6 py-3">Procedimento</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(a => (
                <tr key={a.id} className="border-t border-border transition-colors hover:bg-surface">
                  <td className="px-6 py-3">
                    {a.paciente_id
                      ? <Link to={`/pacientes/${a.paciente_id}`} className="font-semibold text-primary hover:text-accent">{a.paciente_nome || `#${a.paciente_id}`}</Link>
                      : <span className="text-ink-secondary">—</span>}
                  </td>
                  <td className="px-6 py-3 text-ink-secondary">{a.data}</td>
                  <td className="px-6 py-3 text-ink-secondary">{a.horario}</td>
                  <td className="px-6 py-3 text-ink-secondary">{a.dentista || '—'}</td>
                  <td className="px-6 py-3 text-ink-secondary">{a.procedimento || '—'}</td>
                  <td className="px-6 py-3"><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
