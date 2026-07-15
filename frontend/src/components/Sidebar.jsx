import { NavLink } from "react-router-dom"
import { LayoutDashboard, Users, CalendarDays, FileText, LogOut } from "lucide-react"

const NAV_ITEMS = [
  { to: "/", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/agendamentos", label: "Agendamentos", icon: CalendarDays },
  { to: "/prontuarios", label: "Prontuários", icon: FileText },
]

export default function Sidebar({ onLogout }) {
  return (
    <aside className="flex w-64 flex-shrink-0 flex-col bg-gradient-to-b from-primary-900 to-primary-950 px-5 py-6">
      <div className="mb-8 px-2">
        <img src="/logo-odontogpt-branca.png" alt="OdontoGPT" className="h-auto w-full max-w-[170px]" />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "border-l-2 border-sage-300 bg-white/10 text-white"
                  : "border-l-2 border-transparent text-white/65 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <Icon size={18} strokeWidth={1.9} />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={onLogout}
        className="mt-6 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/60 transition-all duration-200 hover:bg-danger/20 hover:text-white"
      >
        <LogOut size={18} strokeWidth={1.9} />
        Sair
      </button>
    </aside>
  )
}
