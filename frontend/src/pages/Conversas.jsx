import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import PacienteFilter from '../components/PacienteFilter'
import { getInteracoes, getPacientes } from '../api'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Card } from '@/components/ui/card'

const PAGE_SIZE = 30

export default function Conversas() {
  const [data, setData] = useState(null)
  const [pacientes, setPacientes] = useState([])
  const [pacienteId, setPacienteId] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)

  // carrega lista de pacientes pro filtro
  useEffect(() => {
    getPacientes({ limit: 200 }).then(d => setPacientes(d.data || [])).catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setError(null)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    const pid = parseInt(pacienteId)
    if (pid > 0) params.paciente_id = pid
    getInteracoes(params).then(setData).catch(setError)
  }, [pacienteId, page])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div>
      <PageHeader
        title="Conversas"
        subtitle="Linha do tempo das mensagens trocadas via WhatsApp"
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <PacienteFilter
          pacientes={pacientes}
          value={pacienteId}
          onChange={v => { setPacienteId(v); setPage(0) }}
        />
      </div>

      {error && <ErrorState message={error.message} />}
      {!error && !data && <Loading label="Carregando conversas" />}

      {data && data.data.length === 0 && (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma conversa registrada"
            description="As trocas de mensagens via WhatsApp gerenciadas pelo OdontoGPT aparecerão aqui."
          />
        </Card>
      )}

      {data && data.data.length > 0 && (
        <div className="space-y-3">
          {data.data.map(i => (
            <Card key={i.id} className="p-4">
              <div className="flex items-start gap-4">
                <div className={`mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                  i.tipo === 'envio' ? 'bg-accent-soft text-accent-deep' : 'bg-surface-1 text-ink-secondary'
                }`}>
                  <MessageSquare size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    {i.paciente_id ? (
                      <Link to={`/pacientes/${i.paciente_id}`} className="font-semibold text-ink hover:text-accent-deep">
                        {i.paciente_nome || `Paciente #${i.paciente_id}`}
                      </Link>
                    ) : <span className="text-ink-tertiary">—</span>}
                    <StatusBadge status={i.tipo} />
                    {i.classificacao && (
                      <span className="rounded-full bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
                        {i.classificacao}
                      </span>
                    )}
                    <span className="ml-auto text-ink-tertiary">
                      {new Date(i.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-ink">
                    {i.mensagem || <span className="text-ink-tertiary">—</span>}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && data && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
          <span>{data.total} mensagem{data.total > 1 ? 's' : ''}</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-1 disabled:opacity-40">Anterior</button>
            <span className="px-3 py-1.5 text-xs font-medium">Página {page + 1} de {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-1 disabled:opacity-40">Próxima</button>
          </div>
        </div>
      )}
    </div>
  )
}
