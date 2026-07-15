import { motion } from "framer-motion"

export default function PageHeader({ title, subtitle }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mb-8"
    >
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-ink-secondary">{subtitle}</p>}
    </motion.div>
  )
}
