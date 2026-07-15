import { cn } from "@/lib/utils"

function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-white px-3.5 text-sm text-ink placeholder:text-ink-secondary/70 transition-all duration-200 outline-none focus:border-accent focus:ring-4 focus:ring-accent/15",
        className
      )}
      {...props}
    />
  )
}

export { Input }
