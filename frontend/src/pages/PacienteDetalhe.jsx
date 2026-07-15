import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarDays, FileText } from 'lucide-react'
import { getPaciente } from '../api'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

function DetailItem({ label, value, wide = false }) {
  return (
    <div className={wide ? 'col-span-full' : ''}>
      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-secondary">{label}</label>
      <span className="mt-0.5 block text-sm font-medium text-ink">{value || '—'}</span>
    </div>
  )
}

export default function PacienteDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [paciente, setPaciente] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getPaciente(id).then(setPaciente).catch(setError)
  }, [id])

  if (error) return <ErrorState message={error.message} />
  if (!paciente) return <Loading label="Carregando paciente" />

  return (
    <div>
      <button
        onClick={() => navigate('/pacientes')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-accent"
      >
        <ArrowLeft size={16} /> Voltar para Pacientes
      </button>

      <PageHeader title={paciente.nome} subtitle={`Paciente #${paciente.id}`} />

      <Card className="mb-6">
        <CardHeader><CardTitle>Dados do Paciente</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label="Telefone" value={paciente.telefone} />
          <DetailItem label="WhatsApp" value={paciente.whatsapp} />
          <DetailItem label="Data Nascimento" value={paciente.data_nascimento} />
          <DetailItem label="Indicação" value={paciente.indicacao} />
          {paciente.observacoes && <DetailItem label="Observações" value={paciente.observacoes} wide />}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Histórico de Agendamentos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {paciente.agendamentos?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent-light/25 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3">Horário</th>
                  <th className="px-6 py-3">Dentista</th>
                  <th className="px-6 py-3">Procedimento</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {paciente.agendamentos.map(a => (
                  <tr key={a.id} className="border-t border-border transition-colors hover:bg-surface">
                    <td className="px-6 py-3 text-ink-secondary">{a.data}</td>
                    <td className="px-6 py-3 text-ink-secondary">{a.horario}</td>
                    <td className="px-6 py-3 text-ink-secondary">{a.dentista || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{a.procedimento || '—'}</td>
                    <td className="px-6 py-3"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={CalendarDays} title="Sem agendamentos" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Prontuários</CardTitle></CardHeader>
        <CardContent className="p-0">
          {paciente.prontuarios?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent-light/25 text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3">Dentista</th>
                  <th className="px-6 py-3">Procedimento</th>
                  <th className="px-6 py-3">Diagnóstico</th>
                  <th className="px-6 py-3">Próx. Retorno</th>
                </tr>
              </thead>
              <tbody>
                {paciente.prontuarios.map(p => (
                  <tr key={p.id} className="border-t border-border transition-colors hover:bg-surface">
                    <td className="px-6 py-3 text-ink-secondary">{p.data_atendimento}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.dentista || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.procedimento || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.diagnostico || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.proximo_retorno_dias ? `${p.proximo_retorno_dias} dias` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={FileText} title="Sem prontuários" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
