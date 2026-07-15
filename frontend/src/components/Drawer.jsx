import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Drawer({ open, onClose, title, subtitle, children, width = "max-w-xl" }) {
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement
    // foca o painel
    const t = setTimeout(() => {
      const focusables = panelRef.current?.querySelectorAll(FOCUSABLE)
      if (focusables?.length) focusables[0].focus()
      else panelRef.current?.focus()
    }, 80)

    function onKey(e) {
      if (e.key === "Escape") { onClose(); return }
      if (e.key !== "Tab") return
      // focus trap
      const focusables = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE) || [])
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
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
      // restaura foco
      previousFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={`fixed inset-y-0 right-0 z-50 flex w-full ${width} flex-col border-l border-border-subtle bg-surface-2 shadow-elev outline-none`}
          >
            <header className="flex items-start justify-between border-b border-border-subtle px-6 py-5">
              <div>
                <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-ink-tertiary transition-colors hover:bg-surface-1 hover:text-ink"
                aria-label="Fechar painel"
              >
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
