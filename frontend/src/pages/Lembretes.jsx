import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Calendar, FileText } from 'lucide-react'
import { getLembretes } from '../api'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Card } from '@/components/ui/card'

const PAGE_SIZE = 30

const TIPO_LABEL = {
  d1: 'Lembrete D-1',
  d0: 'Lembrete D-0',
  retorno: 'Retorno',
  pos_consulta: 'Pós-consulta',
}

export default function Lembretes() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('')
  const [tipo, setTipo] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)

  const fetchData = useCallback(() => {
    setError(null)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    if (status) params.status = status
    if (tipo) params.tipo = tipo
    getLembretes(params).then(setData).catch(setError)
  }, [status, tipo, page])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div>
      <PageHeader
        title="Lembretes"
        subtitle="Status dos envios automáticos via WhatsApp"
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(0) }} className="h-10 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" aria-label="Status">
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="enviado">Enviado</option>
          <option value="falhou">Falhou</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select value={tipo} onChange={e => { setTipo(e.target.value); setPage(0) }} className="h-10 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" aria-label="Tipo">
          <option value="">Todos os tipos</option>
          <option value="d1">D-1 (24h antes)</option>
          <option value="d0">D-0 (no dia)</option>
          <option value="retorno">Retorno</option>
          <option value="pos_consulta">Pós-consulta</option>
        </select>
      </div>

      {error && <ErrorState message={error.message} />}
      {!error && !data && <Loading label="Carregando lembretes" />}

      {data && data.data.length === 0 && (
        <Card>
          <EmptyState icon={Bell} title="Nenhum lembrete" description="Os lembretes disparados pelo OdontoGPT aparecerão aqui." />
        </Card>
      )}

      {data && data.data.length > 0 && (
        <div className="space-y-3">
          {data.data.map(l => (
            <Card key={l.id} className="p-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
                  <Bell size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    {l.paciente_id ? (
                      <Link to={`/pacientes/${l.paciente_id}`} className="font-semibold text-ink hover:text-accent-deep">
                        {l.paciente_nome || `Paciente #${l.paciente_id}`}
                      </Link>
                    ) : <span className="text-ink-tertiary">—</span>}
                    <span className="rounded-full bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-ink-secondary">
                      {TIPO_LABEL[l.tipo] || l.tipo}
                    </span>
                    <StatusBadge status={l.status} />
                    <span className="ml-auto text-ink-tertiary">
                      <Calendar size={11} className="mr-1 inline" />
                      {l.data_envio}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-ink">{l.mensagem || '—'}</p>
                  {l.erro && (
                    <p className="mt-2 rounded-lg bg-danger-soft/50 px-3 py-2 text-xs text-danger">
                      <strong>Erro:</strong> {l.erro}
                    </p>
                  )}
                  {l.tentativas > 0 && (
                    <p className="mt-1 text-[10px] text-ink-tertiary">{l.tentativas} tentativa{l.tentativas > 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && data && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
          <span>{data.total} lembrete{data.total > 1 ? 's' : ''}</span>
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
