import { NavLink } from "react-router-dom"
import { LayoutDashboard, Users, CalendarDays, FileText, LogOut } from "lucide-react"
import { motion } from "framer-motion"

const NAV_ITEMS = [
  { to: "/", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/agendamentos", label: "Agendamentos", icon: CalendarDays },
  { to: "/prontuarios", label: "Prontuários", icon: FileText },
]

export default function Sidebar({ onLogout }) {
  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-border-subtle bg-surface-1 px-5 py-6">
      <div className="px-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-tertiary">
          OdontoGPT
        </p>
        <img src="/logo-odontogpt-branca.png" alt="OdontoGPT" className="h-auto w-full max-w-[170px]" />
      </div>

      <div className="my-6 h-px bg-border-subtle" />

      <nav className="flex flex-1 flex-col gap-1" aria-label="Navegação principal">
        {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-ink-secondary hover:bg-surface-2 hover:text-ink"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={1.9} className={isActive ? "text-primary-600" : "text-ink-tertiary group-hover:text-ink-secondary"} />
                <span className="flex-1">{label}</span>
                {isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sage-400" aria-hidden />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 rounded-xl border border-border-subtle bg-surface-2 p-3">
        <div className="flex items-center gap-2">
          <motion.span
            className="h-2 w-2 rounded-full bg-success"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="text-xs font-medium text-ink">WhatsApp sincronizado</span>
        </div>
      </div>

      <button
        onClick={onLogout}
        className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-ink-secondary transition-all duration-200 hover:bg-surface-2 hover:text-ink"
      >
        <LogOut size={15} strokeWidth={1.9} />
        Sair
      </button>
    </aside>
  )
}
