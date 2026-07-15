export default function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-50 text-sage-500">
        <Icon size={26} strokeWidth={1.75} />
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
        {description && (
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-secondary">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
