import { useEffect, useRef, useState } from 'react'
import {
  Mic,
  Paperclip,
  Loader2,
  X,
  CheckCircle2,
  Circle,
  Volume2,
  VolumeX,
  FileText,
  Settings2,
  ArrowUp,
  Image as ImageIcon,
} from 'lucide-react'
import Loading from '../Loading'
import EntregaCard from './EntregaCard'
import MessageContent from './MessageContent'
import { pensamentoPreview } from './workSteps'

function fileKind(f) {
  const name = String(f?.localName || f?.filename || '').toLowerCase()
  const mime = String(f?.mime || f?.content_type || '').toLowerCase()
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(name)) return 'image'
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  return 'file'
}

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

/** Esconde delimitadores AG-UI incompletos durante o stream (evita flash de sintaxe). */
export function scrubStreamingText(raw) {
  let s = String(raw || '')
  // bloco aberto sem fechar :::
  const open = s.lastIndexOf(':::')
  if (open >= 0) {
    const after = s.slice(open + 3)
    if (!after.includes(':::')) {
      s = s.slice(0, open).trimEnd()
    }
  }
  return s
}

/**
 * Workspace principal do agente — timeline, markdown, botões, voz, pensamento.
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
  onCancelSend,
  onRetry,
  statusText = 'Observando a operação',
  workSteps = [],
  emptySuggestions = [],
  inputSuggestions = [],
  onSuggestion,
  onOpenEntrega,
  onPedirAjuste,
  onOpenConfig,
  onOpenEntregas,
  entregasCount = 0,
  voiceMode = false,
  onToggleVoiceMode,
  speaking = false,
  onStopSpeak,
}) {
  const bottomRef = useRef(null)
  const taRef = useRef(null)
  const displayName = (nomeAgente || 'OdontoGPT').trim() || 'OdontoGPT'
  const initials = initialsFromName(displayName)
  const [stepTick, setStepTick] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const canSend = !sending && (!!texto.trim() || pendingFiles.length > 0)

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
    }, 1100)
    return () => clearInterval(id)
  }, [sending, workSteps])

  // Cronômetro honesto: gestor vê que o pedido não travou (sem stream ainda)
  useEffect(() => {
    if (!sending) {
      setElapsedSec(0)
      return
    }
    setElapsedSec(0)
    const id = setInterval(() => setElapsedSec(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [sending])

  // Textarea cresce com o conteúdo (campo de conversa, não caixa fixa)
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 52), 160)}px`
  }, [texto])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (sending) return
      if (!texto.trim() && !pendingFiles.length) return
      e.currentTarget.closest('form')?.requestSubmit()
    }
  }

  const isWorking = sending || listening || speaking
  const thought = pensamentoPreview(workSteps, stepTick)
  const hasStreamingMsg = msgs.some(m => m._streaming)
  // Uma linha de status: trabalho > voz > idle (AG-UI mission status)
  const liveStatus = sending
    ? thought || statusText
    : speaking
      ? `${displayName} está falando…`
      : statusText

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-2 shadow-card max-lg:min-h-[min(100dvh,720px)]">
      {/* Header enxuto: identidade + status de missão + ações úteis */}
      <header className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 md:px-4">
        <div
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white"
          aria-hidden
        >
          {initials}
          <span
            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface-2 ${
              isWorking ? 'animate-pulse bg-accent' : 'bg-success'
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[15px] font-semibold leading-tight text-ink">
            {displayName}
          </h1>
          <p
            className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-secondary"
            role="status"
            aria-live="polite"
          >
            {sending && (
              <Loader2 size={11} className="shrink-0 animate-spin text-accent" aria-hidden />
            )}
            <span className="truncate">{liveStatus}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleVoiceMode}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${
              voiceMode
                ? 'bg-accent/15 text-accent-deep'
                : 'text-ink-tertiary hover:bg-surface-1 hover:text-ink'
            }`}
            title={voiceMode ? 'Desligar modo voz' : 'Modo voz'}
            aria-pressed={voiceMode}
          >
            {voiceMode ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            type="button"
            onClick={onOpenEntregas}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-surface-1 hover:text-ink"
            title="Entregas do agente"
          >
            <FileText size={16} />
            {entregasCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
                {entregasCount > 9 ? '9+' : entregasCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenConfig}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-surface-1 hover:text-ink"
            title="Preferências do agente"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      {error && (
        <div className="px-4 pt-3">
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            <span className="min-w-0 flex-1">{error?.message || String(error)}</span>
            {typeof onRetry === 'function' && (
              <button
                type="button"
                onClick={onRetry}
                disabled={sending}
                className="shrink-0 rounded-lg bg-danger/10 px-2.5 py-1 text-[12px] font-semibold text-danger transition hover:bg-danger/20 disabled:opacity-50"
              >
                Tentar de novo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Steps compactos só enquanto trabalha — sem painel pesado de “pensamento” */}
      {sending && workSteps.length > 0 && (
        <div className="border-b border-border-subtle/80 px-4 py-2">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1">
            {workSteps.map((step, i) => {
              const done = i < stepTick
              const active = i === stepTick
              return (
                <span
                  key={step}
                  className={`inline-flex items-center gap-1 text-[11px] ${
                    active
                      ? 'font-medium text-ink'
                      : done
                        ? 'text-ink-tertiary'
                        : 'text-ink-tertiary/60'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 size={11} className="text-success" />
                  ) : active ? (
                    <Loader2 size={11} className="animate-spin text-accent" />
                  ) : (
                    <Circle size={11} className="opacity-30" />
                  )}
                  {step}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {speaking && (
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-1.5 text-[11px] text-ink-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Volume2 size={13} className="animate-pulse text-accent" />
            Falando…
          </span>
          <button
            type="button"
            onClick={onStopSpeak}
            className="font-medium text-accent-deep hover:underline"
          >
            Parar
          </button>
        </div>
      )}

      {/* Timeline de trabalho */}
      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-3 py-5 md:px-6">
        {loading && <Loading label="Carregando histórico" />}

        {!loading && msgs.length === 0 && !sending && (
          <div className="mx-auto max-w-md px-1 py-12">
            <p className="font-display text-[1.35rem] font-semibold leading-snug tracking-tight text-ink text-balance">
              Olá! Como posso ajudar hoje?
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
              Pode conversar normalmente — resumo, agenda ou relatório só quando você pedir.
            </p>
            {emptySuggestions.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                {emptySuggestions.map((s, i) => (
                  <button
                    key={s.id || s.label || i}
                    type="button"
                    disabled={sending}
                    onClick={() => onSuggestion?.(s.prompt)}
                    className={`rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 ${
                      s.accent
                        ? 'border-warning/40 bg-warning/5 hover:bg-warning/10'
                        : 'border-border-subtle bg-surface-2 hover:border-brand/25 hover:bg-accent-soft/50'
                    }`}
                  >
                    <span className="block text-[12px] font-semibold text-ink">{s.label}</span>
                    {s.hint && (
                      <span className="mt-0.5 block text-[10px] text-ink-tertiary">{s.hint}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <ol className="relative mx-auto max-w-2xl space-y-0">
          {msgs.map((m, idx) => {
            const out = m.role === 'user'
            const isLast = idx === msgs.length - 1
            const acoes = m.meta?.acoes || []
            return (
              <li key={m.id} className="agent-msg-in relative pb-7">
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span
                    className={`text-[12px] font-semibold ${
                      out ? 'text-accent-deep' : 'text-brand'
                    }`}
                  >
                    {out ? 'Você' : displayName}
                  </span>
                  <time className="text-[10px] tabular-nums text-ink-tertiary">
                    {formatTime(m.created_at)}
                  </time>
                </div>

                <div
                  className={
                    out
                      ? 'rounded-xl bg-surface-warm px-3.5 py-3 text-sm text-ink'
                      : 'text-sm text-ink'
                  }
                >
                  {m._streaming ? (
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {scrubStreamingText(m.conteudo)}
                      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" aria-hidden />
                    </p>
                  ) : (
                  <MessageContent
                    text={m.conteudo}
                    acoes={out ? [] : acoes}
                    isUser={out}
                    disabled={sending}
                    onAction={prompt => onSuggestion?.(prompt)}
                  />
                  )}
                  {m.meta?.anexos?.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {m.meta.anexos.map((a, i) => (
                        <span
                          key={a.filename || a.localName || i}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] text-ink-secondary"
                        >
                          <FileText size={11} className="text-ink-tertiary" />
                          {a.filename || a.localName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {m.meta?.entrega && (
                  <div className="mt-3">
                    <EntregaCard
                      entrega={m.meta.entrega}
                      compact
                      onOpen={onOpenEntrega}
                      onPedirAjuste={onPedirAjuste}
                      ajusteDisabled={sending}
                    />
                  </div>
                )}

                {!isLast && (
                  <div className="mt-6 h-px w-full bg-border-subtle/70" aria-hidden />
                )}
              </li>
            )
          })}

          {/* Placeholder só antes do primeiro token — evita bolha duplicada com o stream */}
          {sending && !hasStreamingMsg && (
            <li className="agent-msg-in pb-4">
              <p className="text-[12px] font-semibold text-brand">{displayName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-secondary">
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin text-accent" />
                  {statusText}
                </span>
                <span className="tabular-nums text-[11px] text-ink-tertiary" aria-live="off">
                  {elapsedSec}s
                </span>
                {typeof onCancelSend === 'function' && (
                  <button
                    type="button"
                    onClick={onCancelSend}
                    className="text-[12px] font-medium text-ink-tertiary underline-offset-2 hover:text-danger hover:underline"
                  >
                    Cancelar
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-tertiary">
                {elapsedSec < 8
                  ? 'Lendo o CRM e preparando a resposta…'
                  : elapsedSec < 25
                    ? 'Primeiros tokens chegam em instantes…'
                    : 'Ainda no modelo — cancele se quiser reformular.'}
              </p>
            </li>
          )}
          {sending && hasStreamingMsg && (
            <li className="pb-2">
              <div className="mx-auto flex max-w-2xl items-center gap-2 text-[11px] text-ink-tertiary">
                <span className="tabular-nums">{elapsedSec}s</span>
                <span>· escrevendo</span>
                {typeof onCancelSend === 'function' && (
                  <button
                    type="button"
                    onClick={onCancelSend}
                    className="font-medium text-ink-secondary underline-offset-2 hover:text-danger hover:underline"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </li>
          )}
        </ol>
        <div ref={bottomRef} />
      </div>

      {/* Conversa com o agente — colaboração, não comando hierárquico */}
      <footer className="shrink-0 border-t border-border-subtle bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 md:px-4 md:pb-4">
        {inputSuggestions.length > 0 && !sending && (
          <div className="mx-auto mb-2.5 max-w-2xl">
            <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
              Sugestões
            </p>
            <div className="-mx-0.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {inputSuggestions.map((s, i) => (
                <button
                  key={s.id || s.label || i}
                  type="button"
                  disabled={sending}
                  onClick={() => onSuggestion?.(s.prompt)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left transition disabled:opacity-50 ${
                    s.accent
                      ? 'border-warning/40 bg-warning/5 hover:bg-warning/10'
                      : 'border-border-subtle bg-surface-2 hover:border-brand/25 hover:bg-accent-soft/50'
                  }`}
                >
                  <span className="block whitespace-nowrap text-[12px] font-semibold text-ink">
                    {s.label}
                  </span>
                  {s.hint && (
                    <span className="mt-0.5 block whitespace-nowrap text-[10px] text-ink-tertiary">
                      {s.hint}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <form
          onSubmit={e => {
            e.preventDefault()
            if (!canSend) return
            onSend?.(e)
          }}
          className="mx-auto max-w-2xl"
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.txt,audio/*"
            multiple
            onChange={onPickFiles}
          />

          {pendingFiles.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {pendingFiles.map(f => {
                const kind = fileKind(f)
                return (
                  <li
                    key={f.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-2 py-1 pl-2 pr-1 text-[11px] text-ink"
                  >
                    {kind === 'image' ? (
                      <ImageIcon size={12} className="shrink-0 text-accent-deep" />
                    ) : (
                      <FileText size={12} className="shrink-0 text-ink-tertiary" />
                    )}
                    <span className="truncate">{f.localName || f.filename}</span>
                    <button
                      type="button"
                      aria-label="Remover anexo"
                      onClick={() => onRemoveFile?.(f)}
                      className="rounded-md p-1 text-ink-tertiary transition hover:bg-surface-1 hover:text-ink"
                    >
                      <X size={12} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div
            className={`agent-collab-desk rounded-2xl border bg-surface-2 transition-[border-color,box-shadow] ${
              listening
                ? 'border-accent shadow-[0_0_0_3px_var(--color-accent-muted)]'
                : 'border-border-subtle focus-within:border-brand/30 focus-within:shadow-card'
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
              <p className="font-display text-[12px] font-semibold text-ink">
                {listening ? 'Ditado' : `Com ${displayName}`}
              </p>
              {listening ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-deep">
                  <span className="agent-listen-dot h-1.5 w-1.5 rounded-full bg-accent" />
                  Ouvindo você…
                </span>
              ) : sending ? (
                <span className="text-[11px] text-ink-tertiary">
                  {displayName} está pensando…
                </span>
              ) : null}
            </div>

            <textarea
              ref={taRef}
              value={texto}
              onChange={e => setTexto?.(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                listening
                  ? 'O ditado aparece aqui…'
                  : 'Ex.: me ajuda a ver as confirmações de amanhã e os riscos de falta'
              }
              disabled={sending}
              rows={1}
              className="agent-order-input w-full resize-none border-0 bg-transparent px-3.5 pb-1.5 pt-1 text-[14px] leading-relaxed text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-0 disabled:opacity-60"
              aria-label={`Mensagem para ${displayName}`}
            />

            <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-0.5">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => fileRef?.current?.click()}
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary transition hover:bg-surface-1 hover:text-ink disabled:opacity-40"
                >
                  <Paperclip size={14} strokeWidth={1.75} />
                  Anexar
                </button>
                <button
                  type="button"
                  onClick={onToggleMic}
                  disabled={sending}
                  aria-pressed={listening}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition disabled:opacity-40 ${
                    listening
                      ? 'bg-brand text-white hover:bg-brand-soft'
                      : 'text-ink-secondary hover:bg-surface-1 hover:text-ink'
                  }`}
                >
                  <Mic size={14} strokeWidth={1.75} />
                  {listening ? 'Parar ditado' : 'Ditado'}
                </button>
              </div>

              {sending ? (
                <button
                  type="button"
                  onClick={onCancelSend}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-1 px-3.5 text-[12px] font-semibold text-ink-secondary transition hover:border-danger/30 hover:bg-danger/5 hover:text-danger"
                >
                  <Loader2 size={14} className="animate-spin" />
                  Cancelar
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-[12px] font-semibold text-white transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:bg-border disabled:text-ink-tertiary"
                >
                  Enviar
                  <ArrowUp size={14} strokeWidth={2.25} />
                </button>
              )}
            </div>
          </div>

          <p className="mt-2 px-0.5 text-[11px] text-ink-tertiary">
            <kbd className="rounded border border-border-subtle bg-surface-2 px-1 py-px font-sans text-[10px] text-ink-secondary">
              Enter
            </kbd>{' '}
            envia ·{' '}
            <kbd className="rounded border border-border-subtle bg-surface-2 px-1 py-px font-sans text-[10px] text-ink-secondary">
              Shift+Enter
            </kbd>{' '}
            nova linha
            {voiceMode ? ' · respostas em voz alta' : null}
          </p>
        </form>
      </footer>
    </div>
  )
}
