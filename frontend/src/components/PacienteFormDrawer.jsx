import { useState, useEffect } from 'react'
import Drawer from './Drawer'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createPaciente, updatePaciente } from '../api'

const empty = { nome: '', telefone: '', data_nascimento: '', indicacao: '', observacoes: '' }

export default function PacienteFormDrawer({ open, onClose, paciente, onSaved }) {
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const isEdit = !!paciente?.id

  useEffect(() => {
    if (!open) return
    setErr(null)
    if (paciente) {
      setForm({
        nome: paciente.nome || '',
        telefone: paciente.telefone || paciente.whatsapp || '',
        data_nascimento: paciente.data_nascimento || '',
        indicacao: paciente.indicacao || '',
        observacoes: paciente.observacoes || '',
      })
    } else {
      setForm(empty)
    }
  }, [open, paciente])

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    const body = {
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      data_nascimento: form.data_nascimento.trim() || null,
      indicacao: form.indicacao.trim() || null,
      observacoes: form.observacoes.trim() || null,
    }
    try {
      const saved = isEdit
        ? await updatePaciente(paciente.id, body)
        : await createPaciente(body)
      onSaved?.(saved)
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
      title={isEdit ? 'Editar paciente' : 'Novo paciente'}
      subtitle="Dados cadastrais da clínica"
    >
      <form onSubmit={submit} className="space-y-4">
        {err && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Nome completo</label>
          <Input value={form.nome} onChange={e => set('nome', e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Telefone / WhatsApp</label>
          <Input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="5584999999999" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Data de nascimento</label>
          <Input value={form.data_nascimento} onChange={e => set('data_nascimento', e.target.value)} placeholder="DD/MM/AAAA" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Indicação</label>
          <Input value={form.indicacao} onChange={e => set('indicacao', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Observações</label>
          <textarea
            value={form.observacoes}
            onChange={e => set('observacoes', e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Drawer>
  )
}