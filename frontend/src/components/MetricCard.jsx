import { motion } from "framer-motion"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const TONES = {
  primary: "bg-accent-soft text-accent",
  accent: "bg-brand text-white",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-surface-1 text-ink-secondary",
}

export default function MetricCard({ icon: Icon, value, label, tone = "primary", index = 0, compact = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
    >
      <Card className={cn("p-5 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-card-lg hover:border-accent/30", compact && "p-4")}>
        <div className={cn("mb-4 flex h-11 w-11 items-center justify-center rounded-xl", TONES[tone])}>
          <Icon size={22} strokeWidth={1.9} />
        </div>
        <div className={cn("font-bold leading-none tracking-tight text-ink", compact ? "text-2xl" : "text-3xl")}>
          {value ?? 0}
        </div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          {label}
        </div>
      </Card>
    </motion.div>
  )
}
