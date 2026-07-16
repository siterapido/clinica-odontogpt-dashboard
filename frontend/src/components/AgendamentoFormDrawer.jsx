import { useState, useEffect } from 'react'
import Drawer from './Drawer'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createAgendamento, updateAgendamento, todayISO } from '../api'
import PacienteFilter from './PacienteFilter'

const STATUS = ['agendado', 'confirmado', 'realizado', 'cancelado', 'faltou', 'em_atendimento', 'remarcado']

export default function AgendamentoFormDrawer({ open, onClose, agendamento, pacientes = [], onSaved }) {
  const [form, setForm] = useState({
    paciente_id: '',
    data: todayISO(),
    horario: '09:00',
    procedimento: '',
    dentista: '',
    status: 'agendado',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const isEdit = !!agendamento?.id

  useEffect(() => {
    if (!open) return
    setErr(null)
    if (agendamento) {
      setForm({
        paciente_id: String(agendamento.paciente_id || ''),
        data: agendamento.data || todayISO(),
        horario: agendamento.horario || '09:00',
        procedimento: agendamento.procedimento || '',
        dentista: agendamento.dentista || '',
        status: agendamento.status || 'agendado',
      })
    } else {
      setForm({
        paciente_id: '',
        data: todayISO(),
        horario: '09:00',
        procedimento: '',
        dentista: '',
        status: 'agendado',
      })
    }
  }, [open, agendamento])

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      if (isEdit) {
        const saved = await updateAgendamento(agendamento.id, {
          data: form.data,
          horario: form.horario,
          procedimento: form.procedimento.trim(),
          dentista: form.dentista.trim() || null,
          status: form.status,
        })
        onSaved?.(saved)
      } else {
        const pid = parseInt(form.paciente_id, 10)
        if (!pid) throw new Error('Selecione um paciente')
        const saved = await createAgendamento({
          paciente_id: pid,
          data: form.data,
          horario: form.horario,
          procedimento: form.procedimento.trim(),
          dentista: form.dentista.trim() || null,
        })
        onSaved?.(saved)
      }
      onClose()
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar agendamento' : 'Novo agendamento'}
      subtitle={isEdit ? `${agendamento?.paciente_nome || ''}` : 'Marque consulta na agenda'}
    >
      <form onSubmit={submit} className="space-y-4">
        {err && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
        {!isEdit && (
          <PacienteFilter
            pacientes={pacientes}
            value={form.paciente_id}
            onChange={v => set('paciente_id', v)}
            label="Paciente"
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Data</label>
            <Input type="date" value={form.data} onChange={e => set('data', e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Horário</label>
            <Input type="time" value={form.horario} onChange={e => set('horario', e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Procedimento</label>
          <Input value={form.procedimento} onChange={e => set('procedimento', e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Dentista</label>
          <Input value={form.dentista} onChange={e => set('dentista', e.target.value)} />
        </div>
        {isEdit && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Status</label>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className="h-10 w-full rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
            >
              {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Drawer>
  )
}