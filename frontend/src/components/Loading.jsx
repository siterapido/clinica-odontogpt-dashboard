import { Skeleton } from "./Skeleton"

export default function Loading({ label = "Carregando", variant = "default" }) {
  if (variant === "list") {
    return (
      <div className="space-y-3" role="status" aria-live="polite" aria-label={label}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border-subtle bg-surface-2 p-4">
            <Skeleton className="mb-2 h-4 w-32" />
            <Skeleton className="mb-1 h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-label={label}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}
