import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users } from 'lucide-react'
import { getPacientes } from '../api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import Pagination from '../components/Pagination'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const PAGE_SIZE = 30

export default function Pacientes() {
  const [data, setData] = useState(null)
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)

  const fetchData = useCallback(() => {
    setError(null)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    if (busca.trim()) params.busca = busca.trim()
    getPacientes(params).then(setData).catch(setError)
  }, [busca, page])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  return (
    <div>
      <PageHeader title="Pacientes" subtitle={data ? `${data.total} paciente(s) cadastrado(s)` : 'Carregando...'} />

      <div className="relative mb-5 max-w-md">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary" />
        <Input
          type="text"
          placeholder="Buscar por nome ou telefone..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPage(0) }}
          className="pl-10"
        />
      </div>

      {error && <ErrorState message={error.message} />}
      {!error && !data && <Loading label="Carregando pacientes" />}

      {data && data.data.length === 0 && (
        <Card>
          <EmptyState
            icon={Users}
            title="Nenhum paciente encontrado"
            description={busca ? 'Tente outro termo de busca.' : 'Os pacientes cadastrados pelo OdontoGPT aparecerão aqui.'}
          />
        </Card>
      )}

      {data && data.data.length > 0 && (
        <>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent-light/25 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  <th className="px-6 py-3">Nome</th>
                  <th className="px-6 py-3">Telefone</th>
                  <th className="px-6 py-3">WhatsApp</th>
                  <th className="px-6 py-3">Data Nasc.</th>
                  <th className="px-6 py-3">Indicação</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map(p => (
                  <tr key={p.id} className="border-t border-border transition-colors hover:bg-surface">
                    <td className="px-6 py-3">
                      <Link to={`/pacientes/${p.id}`} className="font-semibold text-primary hover:text-accent">{p.nome}</Link>
                    </td>
                    <td className="px-6 py-3 text-ink-secondary">{p.telefone || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.whatsapp || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.data_nascimento || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.indicacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  )
}
