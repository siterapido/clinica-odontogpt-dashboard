import { motion } from "framer-motion"
import { CalendarPlus, UserPlus, CalendarCheck } from "lucide-react"

const ACTIONS = [
  {
    icon: CalendarPlus,
    title: "Novo agendamento",
    subtitle: "Criar consulta manualmente",
    tone: "bg-primary-50 text-primary-700",
  },
  {
    icon: UserPlus,
    title: "Cadastrar paciente",
    subtitle: "Adicionar novo paciente",
    tone: "bg-sage-100 text-sage-500",
  },
  {
    icon: CalendarCheck,
    title: "Ver agenda de hoje",
    subtitle: "Consultas do dia em ordem",
    tone: "bg-primary-100 text-primary-600",
  },
]

export default function QuickActions() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {ACTIONS.map(({ icon: Icon, title, subtitle, tone }, i) => (
        <motion.button
          key={title}
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 + i * 0.06, ease: "easeOut" }}
          whileHover={{ y: -2 }}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-4 text-left shadow-card transition-all duration-200 hover:border-primary-300 hover:shadow-card-lg"
        >
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tone}`}>
            <Icon size={18} strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{title}</p>
            <p className="truncate text-xs text-ink-secondary">{subtitle}</p>
          </div>
        </motion.button>
      ))}
    </div>
  )
}
