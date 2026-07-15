import { AlertTriangle } from "lucide-react"

export default function ErrorState({ message = "Algo deu errado" }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft/50 p-4 text-sm text-danger">
      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">Não foi possível carregar</p>
        <p className="mt-0.5 text-danger/80">{message}</p>
      </div>
    </div>
  )
}
