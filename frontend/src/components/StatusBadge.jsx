import { Badge } from "@/components/ui/badge"

const STATUS_MAP = {
  confirmado: { variant: "success", label: "Confirmado" },
  agendado: { variant: "accent", label: "Agendado" },
  realizado: { variant: "neutral", label: "Realizado" },
  cancelado: { variant: "danger", label: "Cancelado" },
}

export default function StatusBadge({ status }) {
  const entry = STATUS_MAP[status?.toLowerCase()]
  return <Badge variant={entry?.variant ?? "neutral"}>{entry?.label ?? status ?? "—"}</Badge>
}
