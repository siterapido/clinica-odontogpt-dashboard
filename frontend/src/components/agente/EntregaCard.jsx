import { FileText, Presentation, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

function downloadMd(titulo, corpo) {
  const blob = new Blob([corpo || ''], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(titulo || 'entrega').replace(/[^\w\-]+/g, '_').slice(0, 60)}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function EntregaCard({ entrega, onOpen, onPedirAjuste, compact, ajusteDisabled = false }) {
  if (!entrega) return null
  const Icon = entrega.tipo === 'apresentacao' ? Presentation : FileText
  return (
    <div className={`rounded-xl border border-accent/20 bg-accent-soft/40 ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-start gap-2">
        <Icon size={16} className="mt-0.5 shrink-0 text-accent-deep" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">{entrega.titulo}</p>
          <p className="text-[10px] uppercase tracking-wide text-ink-tertiary">
            {entrega.tipo === 'apresentacao' ? 'Apresentação' : 'Relatório'}
            {entrega.created_at ? ` · ${new Date(entrega.created_at).toLocaleString('pt-BR')}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {onOpen && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpen(entrega)}>
            Abrir
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => downloadMd(entrega.titulo, entrega.corpo_md)}
        >
          <Download size={12} /> Baixar
        </Button>
        {onPedirAjuste && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={ajusteDisabled}
            onClick={() => onPedirAjuste(entrega)}
          >
            Pedir ajuste
          </Button>
        )}
      </div>
    </div>
  )
}
