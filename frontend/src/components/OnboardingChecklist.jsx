import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Check } from "lucide-react"

const STORAGE_KEY = "odontogpt.onboarding"

const STEPS = [
  {
    id: "patient",
    n: "1",
    title: "Cadastre seu primeiro paciente",
    desc: "Use o atalho acima ou chame @odontogpt no WhatsApp da clínica.",
  },
  {
    id: "agenda",
    n: "2",
    title: "Sincronize a agenda",
    desc: "O OdontoGPT gerencia seus horários automaticamente.",
  },
  {
    id: "atender",
    n: "3",
    title: "Comece a atender",
    desc: "Prontuários e lembretes funcionam sozinhos.",
  },
]

export default function OnboardingChecklist() {
  const [done, setDone] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done))
    } catch {}
  }, [done])

  function toggle(id) {
    setDone((d) => ({ ...d, [id]: !d[id] }))
  }

  const allDone = STEPS.every((s) => done[s.id])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl border border-border-subtle bg-surface-2 p-8 shadow-card"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          {allDone ? "Tudo pronto" : "Bem-vindo"}
        </p>
      </div>
      <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
        {allDone ? "Sua clínica está operando" : "Primeiros passos"}
      </h2>
      <p className="mt-1 text-sm text-ink-secondary">
        {allDone
          ? "Marque um item como pendente se precisar refazer."
          : "Em menos de 5 minutos sua clínica opera pelo WhatsApp."}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {STEPS.map((step, i) => {
          const isDone = !!done[step.id]
          return (
            <motion.button
              key={step.id}
              type="button"
              onClick={() => toggle(step.id)}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + i * 0.08, ease: "easeOut" }}
              className="flex items-start gap-4 rounded-xl border border-border-subtle bg-surface-1 p-4 text-left transition-all duration-200 hover:border-accent/30 hover:bg-accent-soft/30"
              aria-pressed={isDone}
            >
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold transition-colors ${
                  isDone
                    ? "bg-success text-white"
                    : "bg-sage-soft text-sage"
                }`}
              >
                {isDone ? <Check size={16} strokeWidth={2.5} /> : step.n}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${isDone ? "text-ink-tertiary line-through" : "text-ink"}`}>
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{step.desc}</p>
              </div>
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}
