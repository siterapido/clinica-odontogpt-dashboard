import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const TONS = [
  { id: 'acolhedor', label: 'Acolhedor', preview: 'Hoje você tem 12 consultas; 2 ainda sem confirmação. Quer que eu priorize o follow-up?' },
  { id: 'executivo', label: 'Direto & executivo', preview: 'Prioridades: (1) confirmar 2 lacunas (2) reenviar lembretes falhos (3) 3 reativações.' },
  { id: 'clinico', label: 'Técnico-clínico', preview: 'Pelos dados de agenda, a ocupação está estável; em imagens, descrevo achados visíveis com ressalva de avaliação presencial.' },
  { id: 'didatico', label: 'Didático', preview: 'Lembretes falhos costumam ser WhatsApp offline ou número inválido. Vamos checar o mais antigo primeiro porque…' },
  { id: 'proativo', label: 'Proativo', preview: 'Risco: 4 lembretes falhos. Próximos passos: revisar falhas, reenviar prioritários, avisar a recepção.' },
]

export const SKILL_PACKS = [
  { id: 'agenda', label: 'Agenda & ocupação', desc: 'Consultas, confirmações e encaixes' },
  { id: 'financeiro', label: 'Financeiro', desc: 'Caixa, a receber e cobrança educada' },
  { id: 'reativacao', label: 'Reativação de pacientes', desc: 'Quem sumiu e vale retomar' },
  { id: 'imagens', label: 'Análise de imagens / docs', desc: 'RX, fotos e PDF' },
  { id: 'relatorios', label: 'Relatórios executivos', desc: 'Resumos prontos para o gestor' },
  { id: 'apresentacoes', label: 'Apresentações', desc: 'Pauta e outline de slides' },
  { id: 'alertas', label: 'Alertas proativos', desc: 'Problemas nas áreas da clínica' },
]

export default function PreferenciasAgente({ value, onChange, onSave, saving, operador, onOperadorChange }) {
  const v = value || {}
  const hab = v.habilidades || {}
  const tomId = v.tom || TONS[0].id
  const tomMeta = TONS.find(t => t.id === tomId) || TONS[0]

  function setField(patch) {
    onChange({ ...v, ...patch })
  }

  function toggleSkill(id) {
    setField({ habilidades: { ...hab, [id]: !hab[id] } })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          Identidade
        </h3>
        <label className="mb-1 block text-xs text-ink-secondary">Nome do agente</label>
        <Input
          value={v.nome_agente || ''}
          onChange={e => setField({ nome_agente: e.target.value })}
          placeholder="Ex.: Luna"
          className="mb-3"
        />
        <label className="mb-1 block text-xs text-ink-secondary">Seu nome no histórico</label>
        <Input
          value={operador || ''}
          onChange={e => onOperadorChange?.(e.target.value)}
          placeholder="Gerente"
          className="mb-3"
        />
        <p className="mb-2 text-xs text-ink-secondary">Tom de conversa</p>
        <div className="space-y-1.5">
          {TONS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setField({ tom: t.id })}
              className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                tomId === t.id
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-border-subtle bg-surface-1 text-ink-secondary hover:border-accent/30'
              }`}
            >
              <span className="font-medium text-ink">{t.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 rounded-lg bg-surface-1 px-2 py-1.5 text-[11px] text-ink-secondary italic">
          Ex.: “{tomMeta.preview}”
        </p>
        <Button type="button" className="mt-3 w-full" disabled={saving} onClick={onSave}>
          {saving ? 'Salvando…' : 'Salvar preferências'}
        </Button>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          O que {v.nome_agente || 'o agente'} pode fazer
        </h3>
        <p className="mb-3 text-[11px] text-ink-tertiary">Pacotes da clínica — não são controles técnicos internos.</p>
        <ul className="space-y-2">
          {SKILL_PACKS.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-1 px-2 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">{s.label}</p>
                <p className="text-[10px] text-ink-tertiary">{s.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label={s.label}
                aria-checked={!!hab[s.id]}
                onClick={() => toggleSkill(s.id)}
                className={`relative h-6 w-10 shrink-0 rounded-full transition ${
                  hab[s.id] ? 'bg-accent' : 'bg-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    hab[s.id] ? 'translate-x-4' : ''
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" className="mt-3 w-full" disabled={saving} onClick={onSave}>
          Aplicar habilidades
        </Button>
      </div>
    </div>
  )
}
