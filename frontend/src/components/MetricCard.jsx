import { motion } from "framer-motion"
import { Card } from "@/components/ui/card"

const TONES = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent-light/40 text-accent",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
}

export default function MetricCard({ icon: Icon, value, label, tone = "primary", index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
    >
      <Card className="p-5 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-card-lg">
        <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${TONES[tone]}`}>
          <Icon size={22} strokeWidth={1.9} />
        </div>
        <div className="text-3xl font-bold leading-none text-ink">{value ?? 0}</div>
        <div className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-secondary">{label}</div>
      </Card>
    </motion.div>
  )
}
