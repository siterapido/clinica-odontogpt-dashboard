import { useState, useEffect, useRef } from "react"
import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  FileText,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Sparkles,
  Smartphone,
  Building2,
  Stethoscope,
  FileSpreadsheet,
  Wallet,
  Shield,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { logout as apiLogout } from "../api"

/**
 * Navegação em 3 áreas: Atendimento · Comercial · Gestão
 */
const NAV_GROUPS = [
  {
    id: "atendimento",
    label: "Atendimento",
    items: [
      { to: "/pacientes", end: false, label: "Pacientes", icon: Users },
      { to: "/agendamentos", end: false, label: "Agenda", icon: CalendarDays },
      { to: "/conversas", end: false, label: "Conversas", icon: MessageSquare },
      { to: "/prontuarios", end: false, label: "Prontuários", icon: FileText },
      { to: "/simulador", end: false, label: "Simular cliente", icon: Smartphone },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    items: [
      { to: "/orcamentos", end: false, label: "Orçamentos", icon: FileSpreadsheet },
      { to: "/financeiro", end: false, label: "Financeiro", icon: Wallet },
    ],
  },
  {
    id: "gestao",
    label: "Gestão",
    items: [
      { to: "/", end: true, label: "Visão geral", icon: LayoutDashboard },
      { to: "/agente", end: false, label: "Agente", icon: Sparkles },
      { to: "/operacao", end: false, label: "NPS / Segurança", icon: Shield },
      { to: "/dentistas", end: false, label: "Dentistas", icon: Stethoscope },
      { to: "/clinica", end: false, label: "Dados da clínica", icon: Building2 },
    ],
  },
]

function NavLinkItem({ to, end, label, icon: Icon, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-accent/15 text-accent"
            : "text-white/60 hover:bg-white/10 hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={17}
            strokeWidth={1.9}
            className={isActive ? "text-accent" : "text-white/40 group-hover:text-white/70"}
          />
          <span className="flex-1 truncate">{label}</span>
          {isActive && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          )}
        </>
      )}
    </NavLink>
  )
}

function NavItems({ onNavigate }) {
  return (
    <nav
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]"
      aria-label="Navegação principal"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.id} role="group" aria-labelledby={`nav-group-${group.id}`}>
          <p
            id={`nav-group-${group.id}`}
            className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35"
          >
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLinkItem key={item.to} {...item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

export default function Sidebar() {
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    await apiLogout()
    window.location.reload()
  }

  return (
    <>
      {/* Mobile trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-brand-deep text-white shadow-card md:hidden"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm md:hidden"
            aria-hidden
          />
        )}
      </AnimatePresence>

      <MobileSidebarDrawer
        open={open}
        onClose={() => setOpen(false)}
        onLogout={handleLogout}
      />

      <aside className="sticky top-0 hidden h-screen w-64 flex-shrink-0 flex-col border-none bg-brand-deep px-5 py-6 md:flex">
        <SidebarContent onLogout={handleLogout} />
      </aside>
    </>
  )
}

function SidebarContent({ onNavigate, onLogout, onClose }) {
  return (
    <>
      <div className="mb-5 flex shrink-0 items-center justify-between">
        <img
          src="/logo-odontogpt-branca.png"
          alt="OdontoGPT"
          className="h-7 w-auto"
        />
        {onClose && (
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white"
            aria-label="Fechar menu"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="mb-1 flex shrink-0 items-center gap-2 px-2">
        <span className="font-display text-lg font-semibold tracking-tight text-white">
          Sua clínica
        </span>
      </div>
      <p className="mb-4 shrink-0 px-2 text-xs text-white/50">
        Painel operacional
      </p>

      <NavItems onNavigate={onNavigate} />

      <div className="mt-4 shrink-0 border-t border-white/10 pt-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/40 transition-all duration-200 hover:bg-white/10 hover:text-white"
        >
          <LogOut size={15} strokeWidth={1.9} />
          Sair
        </button>
      </div>
    </>
  )
}

const FOCUSABLE_SEL =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function MobileSidebarDrawer({ open, onClose, onLogout }) {
  const ref = useRef(null)
  const prevFocus = useRef(null)
  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement
    const t = setTimeout(() => {
      const f = ref.current?.querySelectorAll(FOCUSABLE_SEL)
      if (f?.length) f[0].focus()
      else ref.current?.focus()
    }, 80)
    function onKey(e) {
      if (e.key === "Escape") {
        onClose()
        return
      }
      if (e.key !== "Tab") return
      const f = Array.from(ref.current?.querySelectorAll(FOCUSABLE_SEL) || [])
      if (f.length === 0) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      clearTimeout(t)
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
      prevFocus.current?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          ref={ref}
          initial={{ x: -256 }}
          animate={{ x: 0 }}
          exit={{ x: -256 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          tabIndex={-1}
          className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-none bg-brand-deep px-5 py-6 shadow-elev outline-none md:hidden"
        >
          <SidebarContent onNavigate={onClose} onLogout={onLogout} onClose={onClose} />
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
