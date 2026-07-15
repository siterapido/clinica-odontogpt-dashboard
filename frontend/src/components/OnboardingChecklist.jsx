import { motion } from "framer-motion"
import { Check, MessageCircle, CalendarPlus, Stethoscope } from "lucide-react"
import ToothPulse from "./ToothPulse"

export default function OnboardingChecklist({ hasPatients = false, hasAppointments = false }) {
  const steps = [
    {
      n: "1",
      title: "Primeiro paciente chegou",
      desc: "Quando alguém mandar mensagem no WhatsApp da clínica, o OdontoGPT cria o cadastro automaticamente.",
      done: hasPatients,
      icon: MessageCircle,
    },
    {
      n: "2",
      title: "Agenda organizada",
      desc: "Os agendamentos são confirmados, remarcados e lembrados pelo agente.",
      done: hasAppointments,
      icon: CalendarPlus,
    },
    {
      n: "3",
      title: "Comece a atender",
      desc: "Prontuários e lembretes de retorno funcionam sozinhos a partir dos atendimentos.",
      done: hasPatients && hasAppointments,
      icon: Stethoscope,
    },
  ]

  const allDone = steps.every(s => s.done)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl border border-border-subtle bg-surface-2 p-8 shadow-card"
    >
      <div className="flex items-center gap-2.5">
        <ToothPulse size={26} className="text-accent" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
          {allDone ? "Tudo pronto" : "Primeiros passos"}
        </p>
      </div>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
        {allDone ? "Sua clínica está operando" : "Como o OdontoGPT funciona"}
      </h2>
      <p className="mt-1 text-sm text-ink-secondary">
        {allDone
          ? "Todos os pilares estão ativos. Use o menu à esquerda para explorar."
          : "Em menos de 5 minutos sua clínica opera pelo WhatsApp — sem configurar nada."}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {steps.map((step, i) => {
          const Icon = step.icon
          return (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + i * 0.08, ease: "easeOut" }}
              className="flex items-start gap-4 rounded-xl border border-border-subtle bg-surface-1 p-4"
            >
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                  step.done ? "bg-success text-white" : "bg-accent-soft text-accent-deep"
                }`}
                aria-hidden
              >
                {step.done ? <Check size={16} strokeWidth={2.5} /> : <Icon size={16} strokeWidth={1.9} />}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${step.done ? "text-ink-secondary" : "text-ink"}`}>
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{step.desc}</p>
              </div>
              {step.done && (
                <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
                  Ativo
                </span>
              )}
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
