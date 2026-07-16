import EntregaCard from './EntregaCard'

export default function EntregasPanel({ entregas, onOpen, onPedirAjuste, sending = false }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
        Entregas
      </h3>
      {(!entregas || entregas.length === 0) && (
        <p className="text-xs text-ink-secondary">
          Ainda não preparei relatórios ou apresentações nesta conversa. Peça pelo chat ou use um atalho.
        </p>
      )}
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {(entregas || []).map((e, i) => (
          <li key={`${e.id ?? 'e'}-${i}`}>
            <EntregaCard
              entrega={e}
              onOpen={onOpen}
              onPedirAjuste={onPedirAjuste}
              ajusteDisabled={sending}
              compact
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
