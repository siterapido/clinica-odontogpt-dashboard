import { AlertTriangle } from "lucide-react"

function stringifyMessage(m) {
  if (m == null) return "Tente recarregar a página."
  if (typeof m === "string") return m
  if (Array.isArray(m)) return m.map(stringifyMessage).filter(Boolean).join("; ") || "Erro desconhecido"
  if (m instanceof Error) return m.message || "Erro desconhecido"
  if (typeof m === "object") {
    // FastAPI 422: { type, loc, msg, input }
    if (m.msg) {
      const where = Array.isArray(m.loc) ? m.loc.filter(x => x !== "body").join(".") : ""
      return where ? `${where}: ${m.msg}` : m.msg
    }
    if (m.detail !== undefined) return stringifyMessage(m.detail)
    if (m.message) return String(m.message)
    try { return JSON.stringify(m) } catch { return "Erro desconhecido" }
  }
  return String(m)
}

export default function ErrorState({ message = "Algo deu errado" }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft/50 p-4 text-sm text-danger">
      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">Não foi possível carregar</p>
        <p className="mt-0.5 text-danger/80">{stringifyMessage(message)}</p>
      </div>
    </div>
  )
}
