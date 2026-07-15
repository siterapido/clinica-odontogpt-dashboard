import { Badge } from "@/components/ui/badge"

const STATUS_MAP = {
  confirmado:  { variant: "success", label: "Confirmado" },
  agendado:    { variant: "accent",  label: "Agendado"   },
  realizado:   { variant: "neutral", label: "Realizado"  },
  cancelado:   { variant: "danger",  label: "Cancelado"  },
  pendente:    { variant: "warning", label: "Pendente"   },
  enviado:     { variant: "success", label: "Enviado"    },
  falhou:      { variant: "danger",  label: "Falhou"     },
  envio:       { variant: "accent",  label: "Envio"      },
  reply:       { variant: "neutral", label: "Resposta"   },
}

export default function StatusBadge({ status }) {
  const key = status?.toLowerCase()
  const entry = STATUS_MAP[key]
  return <Badge variant={entry?.variant ?? "neutral"}>{entry?.label ?? status ?? "—"}</Badge>
}
