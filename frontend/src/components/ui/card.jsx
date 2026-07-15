import { cn } from "@/lib/utils"

function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-white shadow-card",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }) {
  return <div className={cn("flex items-center justify-between border-b border-border px-6 py-5", className)} {...props} />
}

function CardTitle({ className, ...props }) {
  return <h2 className={cn("text-base font-semibold text-ink", className)} {...props} />
}

function CardContent({ className, ...props }) {
  return <div className={cn("p-6", className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardContent }
