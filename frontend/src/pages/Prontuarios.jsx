import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Hash } from 'lucide-react'
import { getProntuarios } from '../api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const PAGE_SIZE = 30

export default function Prontuarios() {
  const [data, setData] = useState(null)
  const [pacienteId, setPacienteId] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)

  const fetchData = useCallback(() => {
    setError(null)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    const pid = parseInt(pacienteId)
    if (pid > 0) params.paciente_id = pid
    getProntuarios(params).then(setData).catch(setError)
  }, [pacienteId, page])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div>
      <PageHeader title="Prontuários" subtitle="Histórico de atendimentos" />

      <div className="relative mb-5 max-w-xs">
        <Hash size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary" />
        <Input
          type="number"
          placeholder="Filtrar por ID do paciente..."
          value={pacienteId}
          onChange={e => { setPacienteId(e.target.value); setPage(0) }}
          className="pl-10"
        />
      </div>

      {error && <ErrorState message={error.message} />}
      {!error && !data && <Loading label="Carregando prontuários" />}

      {data && data.data.length === 0 && (
        <Card>
          <EmptyState
            icon={FileText}
            title="Nenhum prontuário"
            description="Os prontuários registrados pelo OdontoGPT aparecerão aqui."
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
                <th className="px-6 py-3">Dentista</th>
                <th className="px-6 py-3">Procedimento</th>
                <th className="px-6 py-3">Diagnóstico</th>
                <th className="px-6 py-3">Próx. Retorno</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map(p => (
                <tr key={p.id} className="border-t border-border transition-colors hover:bg-surface">
                  <td className="px-6 py-3">
                    {p.paciente_id
                      ? <Link to={`/pacientes/${p.paciente_id}`} className="font-semibold text-primary hover:text-accent">{p.paciente_nome || `#${p.paciente_id}`}</Link>
                      : <span className="text-ink-secondary">—</span>}
                  </td>
                  <td className="px-6 py-3 text-ink-secondary">{p.data_atendimento}</td>
                  <td className="px-6 py-3 text-ink-secondary">{p.dentista || '—'}</td>
                  <td className="px-6 py-3 text-ink-secondary">{p.procedimento || '—'}</td>
                  <td className="max-w-[240px] truncate px-6 py-3 text-ink-secondary">{p.diagnostico || '—'}</td>
                  <td className="px-6 py-3 text-ink-secondary">{p.proximo_retorno_dias ? `${p.proximo_retorno_dias} dias` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
