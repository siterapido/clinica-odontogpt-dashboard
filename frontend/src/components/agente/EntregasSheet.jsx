import { X, FileStack } from 'lucide-react'
import EntregasPanel from './EntregasPanel'

/**
 * Painel de entregas (artefatos) — sheet lateral, não coluna fixa.
 */
export default function EntregasSheet({
  open,
  onClose,
  entregas,
  onOpen,
  onPedirAjuste,
  sending,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        aria-label="Fechar entregas"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Entregas do agente"
        className="relative flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-border-subtle bg-surface p-4 shadow-elev"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileStack size={18} className="text-accent-deep" />
            <h2 className="font-display text-sm font-semibold text-ink">Entregas</h2>
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
        <p className="mb-3 text-xs text-ink-secondary">
          Relatórios e pautas que o agente preparou para você — artefatos de trabalho, não mensagens soltas.
        </p>
        <EntregasPanel
          entregas={entregas}
          onOpen={e => {
            onOpen?.(e)
            onClose?.()
          }}
          onPedirAjuste={e => {
            onPedirAjuste?.(e)
            onClose?.()
          }}
          sending={sending}
        />
      </div>
    </div>
  )
}
