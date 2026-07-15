import { motion } from "framer-motion"

export default function PageHeader({ clinicName = "Clínica Sorria", userName = "Dra. Ana Costa", title, subtitle }) {
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mb-8 border-b border-border-subtle pb-6"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
          {clinicName}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-secondary">Olá, <span className="font-medium text-ink">{userName.split(" ")[0]}</span></span>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sage-300 to-sage-500 font-display text-sm font-semibold text-white">
            {initials}
          </div>
        </div>
      </div>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2 text-sm text-ink-secondary">{subtitle}</p>
      )}
    </motion.header>
  )
}
