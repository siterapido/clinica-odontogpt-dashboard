import { useEffect, useRef, useState } from 'react'
import {
  Send,
  Mic,
  MicOff,
  Paperclip,
  Loader2,
  X,
  Sparkles,
  Bot,
  User,
  CheckCircle2,
  Circle,
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
 * Timeline de trabalho do agente (metáfora AG-UI: eventos, não chat WhatsApp).
 */
export default function ChatWorkspace({
  nomeAgente = 'OdontoGPT',
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
  statusText = 'Observando a operação',
  workSteps = [],
  emptySuggestions = [],
  onSuggestion,
  onOpenEntrega,
  onPedirAjuste,
  onOpenConfig,
  onOpenEntregas,
  entregasCount = 0,
}) {
  const bottomRef = useRef(null)
  const displayName = (nomeAgente || 'OdontoGPT').trim() || 'OdontoGPT'
  const initials = initialsFromName(displayName)
  const [stepTick, setStepTick] = useState(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, sending, stepTick, workSteps])

  useEffect(() => {
    if (!sending || !workSteps?.length) {
      setStepTick(0)
      return
    }
    setStepTick(0)
    const id = setInterval(() => {
      setStepTick(t => Math.min(t + 1, workSteps.length - 1))
    }, 900)
    return () => clearInterval(id)
  }, [sending, workSteps])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (sending) return
      if (!texto.trim() && !pendingFiles.length) return
      e.currentTarget.closest('form')?.requestSubmit()
    }
  }

  const isWorking = sending || listening

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-2 shadow-card">
      {/* Mission header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border-subtle bg-gradient-to-r from-accent-soft/40 via-surface-2 to-surface-2 px-4 py-3">
        <div
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-sm font-semibold text-white shadow-card"
          aria-hidden
        >
          {initials}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-2 ${
              isWorking ? 'animate-pulse bg-accent' : 'bg-success'
            }`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-display text-lg font-semibold text-ink md:text-xl">
              {displayName}
            </h1>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
              Agente autônomo
            </span>
          </div>
          <p className="text-xs text-ink-secondary">
            Console da operação · não é um chat comum
          </p>
        </div>
        <p
          className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-1 px-2.5 py-1 text-[11px] font-medium text-ink"
          role="status"
          aria-live="polite"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isWorking ? 'animate-pulse bg-accent' : 'bg-success'
            }`}
            aria-hidden
          />
          {statusText}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={onOpenEntregas}
            title="Entregas preparadas"
          >
            Entregas
            {entregasCount > 0 && (
              <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold text-accent-deep">
                {entregasCount}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onOpenConfig}
            title="Configurações do agente"
          >
            Config
          </Button>
        </div>
      </header>

      {error && (
        <div className="px-4 pt-3">
          <div
            className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {error?.message || String(error)}
          </div>
        </div>
      )}

      {/* Work timeline */}
      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-3 py-4 md:px-5">
        {loading && <Loading label="Carregando linha do tempo" />}

        {!loading && msgs.length === 0 && !sending && (
          <div className="mx-auto max-w-lg px-2 py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
              <Sparkles className="text-accent-deep" size={28} />
            </div>
            <p className="font-display text-lg font-semibold text-ink">
              {displayName} está no posto
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
              Acompanho a clínica de forma autônoma: agenda, riscos, reativação e
              entregas para o gestor. Ordene uma missão ou use uma rotina abaixo.
            </p>
            {emptySuggestions.length > 0 && (
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {emptySuggestions.map((s, i) => (
                  <button
                    key={s.label || i}
                    type="button"
                    disabled={sending}
                    onClick={() => onSuggestion?.(s.prompt)}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-deep transition hover:bg-accent/20 disabled:opacity-50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <ol className="relative mx-auto max-w-3xl space-y-0">
          {msgs.map((m, idx) => {
            const out = m.role === 'user'
            const isLast = idx === msgs.length - 1
            return (
              <li key={m.id} className="agent-msg-in relative flex gap-3 pb-6">
                {/* rail */}
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                      out
                        ? 'border-accent/40 bg-accent text-white'
                        : 'border-brand/20 bg-brand text-white'
                    }`}
                  >
                    {out ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  {!isLast || sending ? (
                    <div className="mt-1 w-px flex-1 bg-border-subtle" aria-hidden />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="mb-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
                      {out ? 'Sua ordem' : `Trabalho · ${displayName}`}
                    </span>
                    <span className="text-[10px] text-ink-tertiary">{formatTime(m.created_at)}</span>
                  </div>

                  <div
                    className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      out
                        ? 'border border-accent/20 bg-accent/10 text-ink'
                        : 'border border-border-subtle bg-surface-1 text-ink'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{m.conteudo}</p>
                    {m.meta?.anexos?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.meta.anexos.map((a, i) => (
                          <span
                            key={a.filename || a.localName || i}
                            className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-ink-secondary"
                          >
                            <Paperclip size={10} />
                            {a.filename || a.localName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {m.meta?.entrega && (
                    <div className="mt-2">
                      <EntregaCard
                        entrega={m.meta.entrega}
                        compact
                        onOpen={onOpenEntrega}
                        onPedirAjuste={onPedirAjuste}
                        ajusteDisabled={sending}
                      />
                    </div>
                  )}
                </div>
              </li>
            )
          })}

          {/* Live work steps */}
          {sending && (
            <li className="relative flex gap-3 pb-2">
              <div className="flex w-8 shrink-0 flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/30 bg-accent/15 text-accent-deep">
                  <Loader2 size={14} className="animate-spin" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-accent-deep">
                  Em andamento
                </p>
                <ul className="space-y-2 rounded-2xl border border-accent/20 bg-accent-soft/50 px-4 py-3">
                  {(workSteps.length
                    ? workSteps
                    : ['Trabalhando na sua ordem…']
                  ).map((step, i) => {
                    const done = i < stepTick
                    const active = i === stepTick
                    return (
                      <li
                        key={step}
                        className={`flex items-start gap-2 text-sm ${
                          active
                            ? 'font-medium text-ink'
                            : done
                              ? 'text-ink-secondary'
                              : 'text-ink-tertiary'
                        }`}
                      >
                        {done ? (
                          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                        ) : active ? (
                          <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-accent" />
                        ) : (
                          <Circle size={16} className="mt-0.5 shrink-0 opacity-40" />
                        )}
                        <span>{step}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </li>
          )}
        </ol>
        <div ref={bottomRef} />
      </div>

      {/* Order composer */}
      <footer className="border-t border-border-subtle bg-surface-1/50 p-3 md:p-4">
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map(f => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[11px] text-ink-secondary"
              >
                <Paperclip size={10} /> {f.localName || f.filename}
                <button
                  type="button"
                  aria-label="Remover anexo"
                  onClick={() => onRemoveFile?.(f)}
                  className="rounded p-0.5 hover:bg-surface-1"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          onSubmit={e => {
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
              title="Anexar material de trabalho"
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
              title="Ordem por voz"
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </Button>
            <textarea
              value={texto}
              onChange={e => setTexto?.(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ordene o agente… (texto, anexo ou voz)"
              disabled={sending}
              rows={2}
              className="min-h-[48px] flex-1 resize-y rounded-xl border border-border-subtle bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          <Button
            type="submit"
            disabled={sending || (!texto.trim() && !pendingFiles.length)}
            className="gap-1 sm:shrink-0"
          >
            {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            Ordenar
          </Button>
        </form>
        <p className="mt-2 text-[10px] text-ink-tertiary">
          O agente usa o estado da clínica (agenda, alertas, métricas) para trabalhar — não é só um chat.
        </p>
      </footer>
    </div>
  )
}
