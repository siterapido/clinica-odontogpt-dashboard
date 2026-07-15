import { useState, useEffect, useRef } from "react"
import { NavLink } from "react-router-dom"
import { LayoutDashboard, Users, CalendarDays, FileText, MessageSquare, Bell, LogOut, Menu, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import ToothPulse from "./ToothPulse"
import { logout as apiLogout } from "../api"

const NAV_ITEMS = [
  { to: "/",            end: true, label: "Visão Geral",     icon: LayoutDashboard },
  { to: "/pacientes",   end: false, label: "Pacientes",      icon: Users },
  { to: "/agendamentos",end: false, label: "Agenda",         icon: CalendarDays },
  { to: "/prontuarios", end: false, label: "Prontuários",    icon: FileText },
  { to: "/conversas",   end: false, label: "Conversas",      icon: MessageSquare },
  { to: "/lembretes",   end: false, label: "Lembretes",      icon: Bell },
]

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5" aria-label="Navegação principal">
      {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              isActive
                ? "bg-accent-soft text-accent-deep"
                : "text-ink-secondary hover:bg-surface-1 hover:text-ink"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={18}
                strokeWidth={1.9}
                className={isActive ? "text-accent-deep" : "text-ink-tertiary group-hover:text-ink-secondary"}
              />
              <span className="flex-1">{label}</span>
              {isActive && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                  aria-hidden
                />
              )}
            </>
          )}
        </NavLink>
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
        className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-surface-2 text-ink shadow-card md:hidden"
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

      {/* Sidebar (mobile = drawer, desktop = fixed) */}
      <MobileSidebarDrawer
        open={open}
        onClose={() => setOpen(false)}
        onLogout={handleLogout}
      />

      <aside className="sticky top-0 hidden h-screen w-64 flex-shrink-0 flex-col border-r border-border-subtle bg-surface-2 px-5 py-6 md:flex">
        <SidebarContent onLogout={handleLogout} />
      </aside>
    </>
  )
}

function SidebarContent({ onNavigate, onLogout, onClose }) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ToothPulse size={26} className="text-accent" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-tertiary">
            OdontoGPT
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-tertiary hover:bg-surface-1 hover:text-ink"
            aria-label="Fechar menu"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="mb-2 flex items-center gap-2 px-2">
        <span className="font-display text-lg font-semibold tracking-tight text-ink">
          Sua clínica
        </span>
      </div>
      <p className="mb-6 px-2 text-xs text-ink-tertiary">
        Painel operacional
      </p>

      <NavItems onNavigate={onNavigate} />

      <div className="mt-6 border-t border-border-subtle pt-4">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-tertiary transition-all duration-200 hover:bg-surface-1 hover:text-ink"
        >
          <LogOut size={15} strokeWidth={1.9} />
          Sair
        </button>
      </div>
    </>
  )
}


const FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
      if (e.key === "Escape") { onClose(); return }
      if (e.key !== "Tab") return
      const f = Array.from(ref.current?.querySelectorAll(FOCUSABLE_SEL) || [])
      if (f.length === 0) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
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
          className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border-subtle bg-surface-2 px-5 py-6 shadow-elev outline-none md:hidden"
        >
          <SidebarContent onNavigate={onClose} onLogout={onLogout} onClose={onClose} />
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
