export default function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-ink-secondary">
        <Icon size={26} strokeWidth={1.75} />
      </div>
      <div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {description && <p className="mt-1 max-w-sm text-sm text-ink-secondary">{description}</p>}
      </div>
    </div>
  )
}
