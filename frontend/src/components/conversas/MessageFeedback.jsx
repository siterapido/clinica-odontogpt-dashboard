import { useState, useEffect, useRef } from 'react'
import { Star, RefreshCw } from 'lucide-react'
import { salvarMessageFeedback, reescreverMensagem } from '../../api'
import { Button } from '@/components/ui/button'

export default function MessageFeedback({
  messageId,
  feedback,
  onFeedbackChange,
  onRewriteDone,
  disabled = false,
  variant = 'crm',
}) {
  const [nota, setNota] = useState(feedback?.nota || 0)
  const [comentario, setComentario] = useState(feedback?.comentario || '')
  const [hover, setHover] = useState(0)
  const [saving, setSaving] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [err, setErr] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    setNota(feedback?.nota || 0)
    setComentario(feedback?.comentario || '')
  }, [feedback?.nota, feedback?.comentario, messageId])

  async function persist(nextNota, nextComentario) {
    if (!messageId || !nextNota) return
    setSaving(true)
    setErr(null)
    try {
      const res = await salvarMessageFeedback(messageId, {
        nota: nextNota,
        comentario: nextComentario || undefined,
      })
      onFeedbackChange?.(res.feedback)
    } catch (e) {
      setErr(e.message || 'Falha ao salvar nota')
    } finally {
      setSaving(false)
    }
  }

  function handleStar(n) {
    if (disabled || saving || rewriting) return
    setNota(n)
    persist(n, comentario)
  }

  function handleComentarioChange(v) {
    setComentario(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (nota >= 1) persist(nota, v)
    }, 400)
  }

  async function handleRewrite() {
    if (!messageId || rewriting) return
    if (!(nota >= 1)) {
      setErr('Dê uma nota (1–5) antes de reescrever')
      return
    }
    setRewriting(true)
    setErr(null)
    try {
      const res = await reescreverMensagem(messageId, {
        nota,
        comentario: comentario || undefined,
      })
      if (res.feedback) onFeedbackChange?.(res.feedback)
      onRewriteDone?.(res)
    } catch (e) {
      setErr(e.message || 'Falha ao reescrever')
    } finally {
      setRewriting(false)
    }
  }

  const starColor = variant === 'wa' ? 'text-amber-500' : 'text-amber-500'
  const display = hover || nota

  return (
    <div className="mt-1.5 space-y-1 border-t border-black/5 pt-1.5">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            disabled={disabled || saving || rewriting}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/5 disabled:opacity-40"
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => handleStar(n)}
          >
            <Star
              size={16}
              className={n <= display ? `${starColor} fill-current` : 'text-ink-tertiary'}
            />
          </button>
        ))}
        {nota > 0 && (
          <span className="ml-1 text-[10px] text-ink-tertiary">Nota {nota}/5</span>
        )}
      </div>
      <textarea
        rows={1}
        value={comentario}
        disabled={disabled || rewriting}
        onChange={e => handleComentarioChange(e.target.value)}
        placeholder={nota ? 'O que corrigir…' : 'Avaliar resposta…'}
        className="w-full resize-none rounded-md border border-border-subtle bg-white/80 px-2 py-1 text-[11px] text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        disabled={disabled || rewriting || !(nota >= 1)}
        onClick={handleRewrite}
      >
        <RefreshCw size={12} className={rewriting ? 'animate-spin' : ''} />
        {rewriting ? 'Reescrevendo…' : 'Reescrever'}
      </Button>
      {err && <p className="text-[10px] text-danger">{err}</p>}
    </div>
  )
}

export function isBotReplyMessage(m) {
  if (!m || m.tipo !== 'reply') return false
  const cls = (m.classificacao || '').toLowerCase()
  return !cls.startsWith('atendente:')
}
