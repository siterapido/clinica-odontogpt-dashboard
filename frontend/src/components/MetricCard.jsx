import { motion } from "framer-motion"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const TONES = {
  primary: "bg-accent-soft text-accent-deep",
  accent:  "bg-accent-muted text-accent-deep",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-surface-1 text-ink-secondary",
}

export default function MetricCard({ icon: Icon, value, label, tone = "primary", index = 0, compact = false, trend }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
    >
      <Card className={cn(
        "p-5 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-card-lg",
        compact && "p-4"
      )}>
        <div className="flex items-start justify-between">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", TONES[tone])}>
            <Icon size={20} strokeWidth={1.9} />
          </div>
          {trend && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              trend.positive ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
            )}>
              {trend.label}
            </span>
          )}
        </div>
        <div className={cn(
          "mt-4 font-bold leading-none tracking-tight text-ink",
          compact ? "text-2xl" : "text-3xl"
        )}>
          {value ?? 0}
        </div>
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          {label}
        </div>
      </Card>
    </motion.div>
  )
}
