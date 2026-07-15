import { AlertTriangle } from "lucide-react"

export default function ErrorState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-100 bg-red-50/50 px-6 py-12 text-center">
      <AlertTriangle className="text-danger" size={28} strokeWidth={1.75} />
      <div>
        <h3 className="text-base font-semibold text-ink">Erro ao carregar</h3>
        <p className="mt-1 text-sm text-ink-secondary">{message}</p>
      </div>
    </div>
  )
}
