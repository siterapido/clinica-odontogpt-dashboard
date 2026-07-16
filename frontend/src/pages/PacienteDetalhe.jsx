import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, CalendarDays, FileText, MessageSquare } from 'lucide-react'
import { getPaciente } from '../api'
import PageHeader from '../components/PageHeader'
import PacienteFormDrawer from '../components/PacienteFormDrawer'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

function DetailItem({ label, value, wide = false }) {
  return (
    <div className={wide ? 'col-span-full' : ''}>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">{label}</label>
      <span className="mt-1 block text-sm font-medium text-ink">{value || '—'}</span>
    </div>
  )
}

export default function PacienteDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [paciente, setPaciente] = useState(null)
  const [error, setError] = useState(null)
  const [editOpen, setEditOpen] = useState(false)

  const reload = () => getPaciente(id).then(setPaciente).catch(setError)

  useEffect(() => {
    reload()
  }, [id])

  if (error) return <ErrorState message={error.message} />
  if (!paciente) return <Loading label="Carregando paciente" />

  return (
    <div>
      <button
        onClick={() => navigate('/pacientes')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-secondary transition-colors hover:text-accent-deep"
      >
        <ArrowLeft size={16} /> Pacientes
      </button>

      <PageHeader
        title={paciente.nome}
        subtitle={`Paciente #${paciente.id}${paciente.telefone ? ` · ${paciente.telefone}` : ''}`}
        action={
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-xl border border-border-subtle bg-surface-2 px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent"
          >
            Editar dados
          </button>
        }
      />

      <Card className="mb-6">
        <CardHeader><CardTitle>Dados</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label="Telefone" value={paciente.telefone} />
          <DetailItem label="WhatsApp" value={paciente.whatsapp} />
          <DetailItem label="Data de nascimento" value={paciente.data_nascimento} />
          <DetailItem label="Indicação" value={paciente.indicacao} />
          {paciente.observacoes && <DetailItem label="Observações" value={paciente.observacoes} wide />}
        </CardContent>
      </Card>

      {paciente.ultimas_interacoes?.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Últimas mensagens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {paciente.ultimas_interacoes.map(i => (
              <div key={i.id} className="flex items-start gap-3 rounded-lg bg-surface-1 p-3 text-sm">
                <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                  i.tipo === 'envio' ? 'bg-accent-soft text-accent-deep' : 'bg-surface-2 text-ink-secondary'
                }`}>
                  <MessageSquare size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2 text-[10px]">
                    <StatusBadge status={i.tipo} />
                    {i.classificacao && <span className="text-ink-tertiary">{i.classificacao}</span>}
                    <span className="ml-auto text-ink-tertiary">
                      {new Date(i.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-ink">{i.mensagem || '—'}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader><CardTitle>Agendamentos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {paciente.agendamentos?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-accent-light text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                    <th className="px-6 py-3">Data</th>
                    <th className="px-6 py-3">Horário</th>
                    <th className="px-6 py-3">Dentista</th>
                    <th className="px-6 py-3">Procedimento</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paciente.agendamentos.map(a => (
                    <tr key={a.id} className="border-t border-border-subtle transition-colors hover:bg-surface-1">
                      <td className="px-6 py-3 text-ink-secondary">{a.data}</td>
                      <td className="px-6 py-3 text-ink-secondary">{a.horario}</td>
                      <td className="px-6 py-3 text-ink-secondary">{a.dentista || '—'}</td>
                      <td className="px-6 py-3 text-ink-secondary">{a.procedimento || '—'}</td>
                      <td className="px-6 py-3"><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={CalendarDays} title="Sem agendamentos" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prontuários</CardTitle></CardHeader>
        <CardContent className="p-0">
          {paciente.prontuarios?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-accent-light text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                    <th className="px-6 py-3">Data</th>
                    <th className="px-6 py-3">Dentista</th>
                    <th className="px-6 py-3">Procedimento</th>
                    <th className="px-6 py-3">Diagnóstico</th>
                    <th className="px-6 py-3">Próx. retorno</th>
                  </tr>
                </thead>
                <tbody>
                  {paciente.prontuarios.map(p => (
                    <tr key={p.id} className="border-t border-border-subtle transition-colors hover:bg-surface-1">
                      <td className="px-6 py-3 text-ink-secondary">{p.data_atendimento}</td>
                      <td className="px-6 py-3 text-ink-secondary">{p.dentista || '—'}</td>
                      <td className="px-6 py-3 text-ink-secondary">{p.procedimento || '—'}</td>
                      <td className="px-6 py-3 text-ink-secondary">{p.diagnostico || '—'}</td>
                      <td className="px-6 py-3 text-ink-secondary">{p.proximo_retorno_dias ? `${p.proximo_retorno_dias} dias` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={FileText} title="Sem prontuários" />
          )}
        </CardContent>
      </Card>
      <PacienteFormDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        paciente={paciente}
        onSaved={reload}
      />
    </div>
  )
}
