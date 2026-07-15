import { motion } from "framer-motion"

const STEPS = [
  {
    n: "1",
    title: "Cadastre seu primeiro paciente",
    desc: "Use o atalho acima ou chame @odontogpt no WhatsApp da clínica.",
  },
  {
    n: "2",
    title: "Sincronize a agenda",
    desc: "O OdontoGPT gerencia seus horários automaticamente.",
  },
  {
    n: "3",
    title: "Comece a atender",
    desc: "Prontuários e lembretes funcionam sozinhos.",
  },
]

export default function OnboardingChecklist() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl border border-border-subtle bg-surface-2 p-8 shadow-card"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sage-500">
        Bem-vindo
      </p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
        Primeiros passos
      </h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Em menos de 5 minutos sua clínica opera pelo WhatsApp.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.n}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.15 + i * 0.08, ease: "easeOut" }}
            className="flex items-start gap-4 rounded-xl border border-border-subtle bg-surface p-4"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sage-100 font-display text-sm font-semibold text-sage-500">
              {step.n}
            </div>
            <div>
              <p className="text-sm font-medium text-ink">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{step.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
