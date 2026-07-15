import { Loader2 } from "lucide-react"

export default function Loading({ label = "Carregando" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-secondary">
      <Loader2 className="animate-spin" size={20} />
      <span className="text-sm">{label}</span>
    </div>
  )
}
