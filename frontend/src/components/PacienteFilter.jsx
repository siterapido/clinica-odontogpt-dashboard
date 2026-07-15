import { useState, useEffect, useRef } from "react"
import { ChevronDown } from "lucide-react"

export default function PacienteFilter({ pacientes, value, onChange, label = "Todos os pacientes" }) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])
  const filtered = busca
    ? pacientes.filter(p => (p.nome || '').toLowerCase().includes(busca.toLowerCase())).slice(0, 50)
    : pacientes.slice(0, 50)
  const total = pacientes.length
  const showing = filtered.length
  const selected = pacientes.find(p => String(p.id) === String(value))
  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'text-ink-tertiary'}>{selected ? selected.nome : label}</span>
        <ChevronDown size={14} className="text-ink-tertiary" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-hidden rounded-lg border border-border-subtle bg-surface-2 shadow-elev">
          <div className="border-b border-border-subtle p-2">
            <input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar paciente..."
              className="h-8 w-full rounded-md bg-surface-1 px-2 text-sm text-ink outline-none placeholder:text-ink-tertiary"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-surface-1 ${!value ? 'text-accent-deep font-medium' : 'text-ink'}`}
              >
                {label}
              </button>
            </li>
            {filtered.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => { onChange(String(p.id)); setOpen(false) }}
                  className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-surface-1 ${String(p.id) === String(value) ? 'text-accent-deep font-medium' : 'text-ink'}`}
                >
                  {p.nome}
                </button>
              </li>
            ))}
            {total > showing && (
              <li className="px-3 py-2 text-[10px] text-ink-tertiary">
                Mostrando {showing} de {total}. Refine a busca para ver mais.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
