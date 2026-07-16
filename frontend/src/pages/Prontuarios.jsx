import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Calendar } from 'lucide-react'
import { getProntuarios, getDentistas, getPacientes, createProntuario, updateProntuario } from '../api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import Drawer from '../components/Drawer'
import { Card } from '@/components/ui/card'
import PacienteFilter from '../components/PacienteFilter'
import { Button } from '@/components/ui/button'

function ProntuarioCreateModal({ pacientes, onClose, onCreated }) {
  const [paciente_id, setPaciente_id] = useState('')
  const [procedimento, setProcedimento] = useState('')
  const [err, setErr] = useState(null)
  const [saving, setSaving] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const pid = parseInt(paciente_id, 10)
    if (!pid || !procedimento.trim()) return
    setSaving(true)
    try {
      await createProntuario({ paciente_id: pid, procedimento: procedimento.trim() })
      onCreated()
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface-2 p-6 shadow-elev">
        <h3 className="font-display text-lg font-semibold text-ink">Novo atendimento</h3>
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <div className="mt-4 space-y-3">
          <PacienteFilter pacientes={pacientes} value={paciente_id} onChange={setPaciente_id} label="Selecione o paciente" />
          <input
            required
            value={procedimento}
            onChange={e => setProcedimento(e.target.value)}
            placeholder="Procedimento"
            className="h-10 w-full rounded-lg border border-border-subtle bg-surface-1 px-3 text-sm"
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? '…' : 'Criar'}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}

const PAGE_SIZE = 20

function Field({ label, value, wide = false }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-tertiary">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink">{value || '—'}</p>
    </div>
  )
}

export default function Prontuarios() {
  const [data, setData] = useState(null)
  const [dentistas, setDentistas] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [pacienteId, setPacienteId] = useState('')
  const [dentista, setDentista] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [editForm, setEditForm] = useState(null)

  const fetchData = useCallback(() => {
    setError(null)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    const pid = parseInt(pacienteId)
    if (pid > 0) params.paciente_id = pid
    if (dentista) params.dentista = dentista
    if (de) params.de = de
    if (ate) params.ate = ate
    getProntuarios(params).then(setData).catch(setError)
  }, [pacienteId, dentista, de, ate, page])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { getDentistas().then(d => setDentistas(d.data || [])).catch(() => {}) }, [])
  useEffect(() => { getPacientes({ limit: 200 }).then(d => setPacientes(d.data || [])).catch(() => {}) }, [])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  useEffect(() => {
    if (!selected) { setEditForm(null); return }
    setEditForm({
      procedimento: selected.procedimento || '',
      data_atendimento: selected.data_atendimento || '',
      dentista: selected.dentista || '',
      queixa_principal: selected.queixa_principal || '',
      exame_clinico: selected.exame_clinico || '',
      diagnostico: selected.diagnostico || '',
      plano_tratamento: selected.plano_tratamento || '',
      observacoes: selected.observacoes || '',
      proximo_retorno_dias: selected.proximo_retorno_dias ?? '',
    })
    setSaveErr(null)
  }, [selected])

  async function saveProntuario() {
    if (!selected?.id || !editForm) return
    setSaving(true)
    setSaveErr(null)
    try {
      const body = { ...editForm }
      if (body.proximo_retorno_dias === '') body.proximo_retorno_dias = null
      else body.proximo_retorno_dias = parseInt(body.proximo_retorno_dias, 10) || null
      await updateProntuario(selected.id, body)
      fetchData()
      setSelected(null)
    } catch (e) {
      setSaveErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Prontuários"
        subtitle="Histórico de atendimentos"
        action={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-card hover:bg-accent-hover"
          >
            Novo atendimento
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <PacienteFilter pacientes={pacientes} value={pacienteId} onChange={(v) => { setPacienteId(v); setPage(0) }} />
        <select
          value={dentista} onChange={e => { setDentista(e.target.value); setPage(0) }}
          className="h-10 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          aria-label="Dentista"
        >
          <option value="">Todos os dentistas</option>
          {dentistas.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-ink-secondary">
          <Calendar size={14} className="text-ink-tertiary" />
          <input type="date" value={de} onChange={e => { setDe(e.target.value); setPage(0) }} className="border-0 bg-transparent text-sm text-ink outline-none" aria-label="De" />
          <span className="text-ink-tertiary">→</span>
          <input type="date" value={ate} onChange={e => { setAte(e.target.value); setPage(0) }} className="border-0 bg-transparent text-sm text-ink outline-none" aria-label="Até" />
        </div>
      </div>

      {error && <ErrorState message={error.message} />}
      {!error && !data && <Loading label="Carregando prontuários" />}

      {data && data.data.length === 0 && (
        <Card>
          <EmptyState icon={FileText} title="Nenhum prontuário" description="Os atendimentos registrados pelo OdontoGPT aparecerão aqui." />
        </Card>
      )}

      {data && data.data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent-light text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  <th className="px-6 py-3">Paciente</th>
                  <th className="px-6 py-3">Data</th>
                  <th className="px-6 py-3">Dentista</th>
                  <th className="px-6 py-3">Procedimento</th>
                  <th className="px-6 py-3">Diagnóstico</th>
                  <th className="px-6 py-3">Próx. retorno</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map(p => (
                  <tr key={p.id} className="border-t border-border-subtle transition-colors hover:bg-surface-1">
                    <td className="px-6 py-3 font-medium text-ink">
                      {p.paciente_id
                        ? <Link to={`/pacientes/${p.paciente_id}`} className="text-accent-hover hover:text-accent-deep hover:underline">{p.paciente_nome || `#${p.paciente_id}`}</Link>
                        : <span className="text-ink-tertiary">—</span>}
                    </td>
                    <td className="px-6 py-3 text-ink-secondary">{p.data_atendimento}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.dentista || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.procedimento || '—'}</td>
                    <td className="max-w-[240px] truncate px-6 py-3 text-ink-secondary">{p.diagnostico || '—'}</td>
                    <td className="px-6 py-3 text-ink-secondary">{p.proximo_retorno_dias ? `${p.proximo_retorno_dias} dias` : '—'}</td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => setSelected(p)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-accent-hover transition-colors hover:bg-accent-soft hover:text-accent-deep"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && data && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
          <span>{data.total} prontuário{data.total > 1 ? 's' : ''} no total</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-1 disabled:opacity-40">Anterior</button>
            <span className="px-3 py-1.5 text-xs font-medium">Página {page + 1} de {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-1 disabled:opacity-40">Próxima</button>
          </div>
        </div>
      )}

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.procedimento || 'Prontuário'}
        subtitle={selected ? `${selected.paciente_nome || `Paciente #${selected.paciente_id}`} · ${selected.data_atendimento}` : ''}
        width="max-w-2xl"
      >
        {selected && editForm && (
          <div className="space-y-4">
            {saveErr && <p className="text-sm text-danger">{saveErr}</p>}
            {[
              ['procedimento', 'Procedimento'],
              ['data_atendimento', 'Data atendimento'],
              ['dentista', 'Dentista'],
              ['proximo_retorno_dias', 'Próx. retorno (dias)'],
            ].map(([k, label]) => (
              <div key={k}>
                <label className="mb-1 block text-xs font-semibold uppercase text-ink-tertiary">{label}</label>
                <input
                  value={editForm[k]}
                  onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent"
                />
              </div>
            ))}
            {[
              ['queixa_principal', 'Queixa principal'],
              ['exame_clinico', 'Exame clínico'],
              ['diagnostico', 'Diagnóstico'],
              ['plano_tratamento', 'Plano de tratamento'],
              ['observacoes', 'Observações'],
            ].map(([k, label]) => (
              <div key={k}>
                <label className="mb-1 block text-xs font-semibold uppercase text-ink-tertiary">{label}</label>
                <textarea
                  value={editForm[k]}
                  onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </div>
            ))}
            <button
              type="button"
              disabled={saving}
              onClick={saveProntuario}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        )}
      </Drawer>
      {createOpen && (
        <ProntuarioCreateModal
          pacientes={pacientes}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); fetchData() }}
        />
      )}
    </div>
  )
}
