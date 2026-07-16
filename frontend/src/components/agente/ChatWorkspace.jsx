import { useEffect, useRef } from 'react'
import {
  Send,
  Mic,
  MicOff,
  Paperclip,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react'
import Loading from '../Loading'
import { Button } from '@/components/ui/button'
import EntregaCard from './EntregaCard'

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function initialsFromName(name) {
  const parts = String(name || 'A')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return 'A'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Workspace de conversa humanizado (apresentacional).
 *
 * props:
 * - nomeAgente, tomLabel
 * - msgs, loading, sending, error
 * - texto, setTexto
 * - pendingFiles, onPickFiles, onRemoveFile, fileRef
 * - listening, onToggleMic
 * - onSend
 * - statusText  // "Online" | "Organizando..."
 * - emptySuggestions: [{label, prompt}]
 * - onSuggestion(prompt)
 * - onOpenEntrega(entrega)
 * - onPedirAjuste(entrega)
 */
export default function ChatWorkspace({
  nomeAgente = 'Assistente',
  tomLabel = 'Acolhedor',
  msgs = [],
  loading = false,
  sending = false,
  error = null,
  texto = '',
  setTexto,
  pendingFiles = [],
  onPickFiles,
  onRemoveFile,
  fileRef,
  listening = false,
  onToggleMic,
  onSend,
  statusText = 'Online',
  emptySuggestions = [],
  onSuggestion,
  onOpenEntrega,
  onPedirAjuste,
}) {
  const bottomRef = useRef(null)
  const displayName = (nomeAgente || 'Assistente').trim() || 'Assistente'
  const initials = initialsFromName(displayName)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, sending])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (sending) return
      if (!texto.trim() && !pendingFiles.length) return
      const form = e.currentTarget.closest('form')
      if (form) form.requestSubmit()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-2 shadow-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-sm font-semibold text-accent-deep"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold text-ink md:text-xl">
            {displayName}
          </h1>
          <p className="truncate text-xs text-ink-secondary">
            Assistente da clínica · {tomLabel}
          </p>
        </div>
        <p
          className="inline-flex items-center gap-1.5 rounded-full bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-ink-secondary"
          role="status"
          aria-live="polite"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              sending ? 'animate-pulse bg-accent' : 'bg-success'
            }`}
            aria-hidden
          />
          {statusText}
        </p>
      </header>

      {error && (
        <div className="px-4 pt-3">
          <div className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">
            {error?.message || String(error)}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loading && <Loading label="Carregando conversa" />}

        {!loading && msgs.length === 0 && (
          <div className="mx-auto max-w-lg py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
              <Sparkles className="text-accent" size={24} />
            </div>
            <p className="font-display text-base font-semibold text-ink">
              Olá — eu sou {displayName}
            </p>
            <p className="mt-2 text-sm text-ink-secondary">
              Posso ajudar com agenda, reativação de pacientes, lembretes e documentos.
              Escolha uma sugestão ou digite sua pergunta.
            </p>
            {emptySuggestions.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {emptySuggestions.map((s, i) => (
                  <button
                    key={s.label || i}
                    type="button"
                    disabled={sending}
                    onClick={() => onSuggestion?.(s.prompt)}
                    className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-deep transition hover:bg-accent/20 disabled:opacity-50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {msgs.map(m => {
          const out = m.role === 'user'
          return (
            <div
              key={m.id}
              className={`agent-msg-in flex ${out ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[min(92%,720px)] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                  out
                    ? 'rounded-br-md bg-accent text-white'
                    : 'rounded-bl-md border border-border-subtle bg-surface-1 text-ink'
                }`}
              >
                {!out && (
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-accent-deep">
                    {displayName}
                  </span>
                )}
                <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                {m.meta?.anexos?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.meta.anexos.map((a, i) => (
                      <span
                        key={a.filename || a.localName || i}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                          out
                            ? 'bg-white/20 text-white/90'
                            : 'bg-surface-2 text-ink-secondary'
                        }`}
                      >
                        <Paperclip size={10} />
                        {a.filename || a.localName}
                      </span>
                    ))}
                  </div>
                )}
                {m.meta?.entrega && (
                  <div className="mt-2">
                    <EntregaCard
                      entrega={m.meta.entrega}
                      compact
                      onOpen={onOpenEntrega}
                      onPedirAjuste={onPedirAjuste}
                    />
                  </div>
                )}
                <p className={`mt-1 text-[10px] ${out ? 'text-white/70' : 'text-ink-tertiary'}`}>
                  {formatTime(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}

        {sending && (
          <div
            className="flex items-center gap-2 text-xs text-ink-secondary"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="animate-spin" size={14} />
            {statusText && statusText.trim() && statusText.trim() !== 'Online'
              ? statusText
              : 'Organizando o que vi na clínica…'}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <footer className="border-t border-border-subtle p-3 md:p-4">
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map(f => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-1 px-2 py-1 text-[11px] text-ink-secondary"
              >
                <Paperclip size={10} /> {f.localName || f.filename}
                <button
                  type="button"
                  aria-label="Remover anexo"
                  onClick={() => onRemoveFile?.(f)}
                  className="rounded p-0.5 hover:bg-surface-2"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSend?.(e)
          }}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="flex flex-1 gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.txt,audio/*"
              multiple
              onChange={onPickFiles}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => fileRef?.current?.click()}
              disabled={sending}
              title="Anexar imagem, PDF ou áudio"
            >
              <Paperclip size={18} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={`shrink-0 ${listening ? 'border-accent bg-accent/15 text-accent' : ''}`}
              onClick={onToggleMic}
              disabled={sending}
              title="Ditado por voz"
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </Button>
            <textarea
              value={texto}
              onChange={e => setTexto?.(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreva, anexe um arquivo ou use o microfone…"
              disabled={sending}
              rows={2}
              className="min-h-[44px] flex-1 resize-y rounded-xl border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <Button
            type="submit"
            disabled={sending || (!texto.trim() && !pendingFiles.length)}
            className="gap-1 sm:shrink-0"
          >
            {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            Enviar
          </Button>
        </form>
      </footer>
    </div>
  )
}
