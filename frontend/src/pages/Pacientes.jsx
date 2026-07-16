import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users, UserPlus } from 'lucide-react'
import { getPacientes } from '../api'
import PageHeader from '../components/PageHeader'
import PacienteFormDrawer from '../components/PacienteFormDrawer'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const PAGE_SIZE = 30

export default function Pacientes() {
  const [data, setData] = useState(null)
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editPaciente, setEditPaciente] = useState(null)

  const fetchData = useCallback(() => {
    setError(null)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    if (busca) params.busca = busca
    getPacientes(params).then(setData).catch(setError)
  }, [busca, page])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div>
      <PageHeader
        title="Pacientes"
        subtitle="Base de pacientes da clínica"
        action={
          <button
            type="button"
            onClick={() => { setEditPaciente(null); setFormOpen(true) }}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-card transition-all hover:bg-accent-hover"
          >
            <UserPlus size={16} /> Novo paciente
          </button>
        }
      />

      <div className="relative mb-5 max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-tertiary" />
        <Input
          type="search"
          placeholder="Buscar por nome, telefone..."
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
            title={busca ? "Nenhum resultado" : "Nenhum paciente cadastrado"}
            description={busca ? "Tente outro termo de busca." : "Os pacientes cadastrados via WhatsApp aparecerão aqui."}
          />
        </Card>
      )}

      {data && data.data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent-light text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  <th className="px-6 py-3">Nome</th>
                  <th className="px-6 py-3">Telefone</th>
                  <th className="px-6 py-3">WhatsApp</th>
                  <th className="px-6 py-3">Nascimento</th>
                  <th className="px-6 py-3">Indicação</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map(p => (
                  <tr key={p.id} className="border-t border-border-subtle transition-colors hover:bg-surface-1">
                    <td className="px-6 py-3 font-medium text-ink">
                      <Link to={`/pacientes/${p.id}`} className="text-accent-hover hover:text-accent-deep hover:underline">
                        {p.nome}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-ink-secondary">{p.telefone || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.whatsapp || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.data_nascimento || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.indicacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && data && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
          <span>{data.total} paciente{data.total > 1 ? 's' : ''} no total</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-1 disabled:opacity-40">Anterior</button>
            <span className="px-3 py-1.5 text-xs font-medium">Página {page + 1} de {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-1 disabled:opacity-40">Próxima</button>
          </div>
        </div>
      )}
      <PacienteFormDrawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        paciente={editPaciente}
        onSaved={() => fetchData()}
      />
    </div>
  )
}
