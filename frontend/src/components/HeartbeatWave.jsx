import { motion } from "framer-motion"

export default function HeartbeatWave({ className = "", delay = 0, opacity = 0.3 }) {
  return (
    <svg
      viewBox="0 0 1200 200"
      preserveAspectRatio="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <motion.path
        d="M 0 100 L 200 100 L 230 70 L 260 130 L 290 40 L 320 100 L 600 100 L 630 70 L 660 130 L 690 40 L 720 100 L 1200 100"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity }}
        transition={{ duration: 1.4, delay, ease: "easeOut" }}
      />
    </svg>
  )
}
