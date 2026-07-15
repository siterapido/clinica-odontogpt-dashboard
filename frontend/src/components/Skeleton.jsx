export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-2 p-5">
      <Skeleton className="mb-4 h-11 w-11 rounded-xl" />
      <Skeleton className="mb-2 h-7 w-20" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-2 p-6">
      <div className="mb-4 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-t border-border-subtle py-3">
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
