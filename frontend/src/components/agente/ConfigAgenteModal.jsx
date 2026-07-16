import { X } from 'lucide-react'
import PreferenciasAgente from './PreferenciasAgente'

/**
 * Configurações do agente (nome, tom, habilidades) — fora do caminho crítico.
 */
export default function ConfigAgenteModal({
  open,
  onClose,
  value,
  onChange,
  onSave,
  saving,
  operador,
  onOperadorChange,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        aria-label="Fechar configurações"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurações do agente"
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border-subtle bg-surface shadow-elev sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Configurações</h2>
            <p className="text-[11px] text-ink-tertiary">
              Personalize o agente sem sair da operação
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-secondary hover:bg-surface-1"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <PreferenciasAgente
            value={value}
            onChange={onChange}
            onSave={async () => {
              await onSave?.()
              onClose?.()
            }}
            saving={saving}
            operador={operador}
            onOperadorChange={onOperadorChange}
          />
        </div>
      </div>
    </div>
  )
}
