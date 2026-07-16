import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bot,
  Send,
  Sparkles,
  Mic,
  MicOff,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Calendar,
  AlertTriangle,
  Zap,
  Loader2,
  X,
} from 'lucide-react'
import {
  getAgentMensagens,
  enviarAgentChat,
  getAgentBriefing,
  uploadAgentFile,
} from '../api'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const OPERADOR_KEY = 'odontogpt_admin_operador'

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AgenteAdmin() {
  const [msgs, setMsgs] = useState([])
  const [lastId, setLastId] = useState(0)
  const [error, setError] = useState(null)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [operador, setOperador] = useState(() => localStorage.getItem(OPERADOR_KEY) || 'Gerente')
  const [loading, setLoading] = useState(true)
  const [briefing, setBriefing] = useState(null)
  const [quickPrompts, setQuickPrompts] = useState([])
  const [pendingFiles, setPendingFiles] = useState([])
  const [listening, setListening] = useState(false)
  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  const recognitionRef = useRef(null)

  const load = useCallback(
    (after = 0) => {
      return getAgentMensagens(operador, { after_id: after, limit: 120 })
        .then(d => {
          const batch = d.data || []
          if (after > 0) {
            setMsgs(prev => {
              const ids = new Set(prev.map(m => m.id))
              return [...prev, ...batch.filter(m => !ids.has(m.id))]
            })
          } else {
            setMsgs(batch)
          }
          if (batch.length) {
            setLastId(Math.max(...batch.map(m => m.id), after))
          }
        })
        .catch(setError)
        .finally(() => setLoading(false))
    },
    [operador]
  )

  useEffect(() => {
    setLoading(true)
    setMsgs([])
    setLastId(0)
    load(0)
    getAgentBriefing()
      .then(d => {
        setBriefing(d.briefing)
        setQuickPrompts(d.quick_prompts || [])
      })
      .catch(() => {})
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, sending])

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = e => {
      let chunk = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        chunk += e.results[i][0].transcript
      }
      if (chunk) setTexto(t => (t ? `${t} ${chunk}` : chunk).trim())
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
  }, [])

  function toggleMic() {
    const rec = recognitionRef.current
    if (!rec) {
      setError(new Error('Microfone por voz não suportado neste navegador. Use Chrome/Edge.'))
      return
    }
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      setError(null)
      setListening(true)
      rec.start()
    }
  }

  async function onPickFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setError(null)
    const next = [...pendingFiles]
    for (const f of files.slice(0, 5 - next.length)) {
      try {
        const up = await uploadAgentFile(f)
        next.push({ ...up.anexo, localName: f.name })
      } catch (ex) {
        setError(ex)
      }
    }
    setPendingFiles(next)
  }

  async function sendMessage(textOverride) {
    const text = (textOverride ?? texto).trim()
    const ids = pendingFiles.map(f => f.id)
    if (!text && !ids.length) return
    localStorage.setItem(OPERADOR_KEY, operador.trim() || 'Gerente')
    if (listening) recognitionRef.current?.stop()
    setListening(false)
    setSending(true)
    setError(null)
    try {
      await enviarAgentChat(text, operador.trim() || 'Gerente', true, ids)
      setTexto('')
      setPendingFiles([])
      await load(lastId)
    } catch (ex) {
      setError(ex)
    } finally {
      setSending(false)
    }
  }

  async function handleSend(e) {
    e.preventDefault()
    await sendMessage()
  }

  const b = briefing || {}

  return (
    <div className="flex h-full min-h-[640px] flex-col gap-3 lg:flex-row lg:gap-4">
      {/* Painel operacional */}
      <aside className="order-2 flex w-full flex-col gap-3 lg:order-1 lg:w-72 lg:shrink-0 xl:w-80">
        <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="text-accent" size={18} />
            <h2 className="font-display text-sm font-semibold text-ink">Pulse da clínica</h2>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Hoje" value={b.agendamentos_hoje} />
            <Stat label="Confirmados" value={b.confirmados_hoje} />
            <Stat label="Lembretes falhos" value={b.lembretes_falhos} warn={b.lembretes_falhos > 0} />
            <Stat label="Inativos 120d" value={b.pacientes_sem_retorno_120d} />
            <Stat label="Novos 7d" value={b.novos_pacientes_7d} />
            <Stat label="WhatsApp 48h" value={b.conversas_recentes_48h} />
          </dl>
        </div>

        {(b.alertas || []).length > 0 && (
          <div className="space-y-2">
            {b.alertas.map((a, i) => (
              <div
                key={i}
                className={`rounded-xl border px-3 py-2 text-xs ${
                  a.nivel === 'warning'
                    ? 'border-warning/40 bg-warning/10 text-ink'
                    : 'border-border-subtle bg-surface-1 text-ink-secondary'
                }`}
              >
                <p className="font-semibold flex items-center gap-1">
                  <AlertTriangle size={12} /> {a.titulo}
                </p>
                <p className="mt-0.5">{a.detalhe}</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
            <Calendar size={14} /> Próximos hoje
          </h3>
          <ul className="max-h-36 space-y-1.5 overflow-y-auto text-xs">
            {(b.proximos_hoje || []).length === 0 && (
              <li className="text-ink-secondary">Nenhum agendamento hoje.</li>
            )}
            {(b.proximos_hoje || []).map(row => (
              <li key={row.id} className="rounded-lg bg-surface-1 px-2 py-1.5">
                <span className="font-medium text-ink">{row.horario}</span>{' '}
                <span className="text-ink-secondary">{row.paciente_nome || '—'}</span>
                <span className="block text-[10px] text-ink-tertiary">{row.procedimento}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border-subtle bg-surface-2 p-4 shadow-card">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
            Ações rápidas
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map(q => (
              <button
                key={q.id}
                type="button"
                disabled={sending}
                onClick={() => sendMessage(q.prompt)}
                className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-deep transition hover:bg-accent/20 disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Chat principal */}
      <section className="order-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-2 shadow-card lg:order-2">
        <header className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3">
          <Sparkles className="text-accent" size={22} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold text-ink">Assistente OdontoGPT</h1>
            <p className="text-xs text-ink-secondary">
              Modo interativo · texto, voz, imagem, PDF · contexto da clínica em tempo real
            </p>
          </div>
          <Input
            className="h-9 w-36 text-sm"
            placeholder="Seu nome"
            value={operador}
            onChange={e => setOperador(e.target.value)}
            aria-label="Nome do operador"
          />
        </header>

        {error && (
          <div className="px-4 pt-3">
            <ErrorState message={error.message} />
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loading && <Loading label="Carregando histórico" />}
          {!loading && msgs.length === 0 && (
            <div className="mx-auto max-w-lg py-12 text-center">
              <Bot className="mx-auto mb-3 text-accent" size={40} />
              <p className="text-sm text-ink-secondary">
                Pergunte sobre agenda, reativação de pacientes, lembretes ou anexe radiografias e
                documentos para análise assistida.
              </p>
            </div>
          )}
          {msgs.map(m => {
            const out = m.role === 'user'
            return (
              <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[min(92%,720px)] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                    out
                      ? 'rounded-br-md bg-accent text-white'
                      : 'rounded-bl-md border border-border-subtle bg-surface-1 text-ink'
                  }`}
                >
                  {!out && (
                    <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-accent-deep">
                      <Bot size={12} /> OdontoGPT
                    </span>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                  {m.meta?.anexos?.length > 0 && (
                    <p className={`mt-1 text-[10px] ${out ? 'text-white/80' : 'text-ink-tertiary'}`}>
                      Anexos: {m.meta.anexos.map(a => a.filename).join(', ')}
                    </p>
                  )}
                  <p className={`mt-1 text-[10px] ${out ? 'text-white/70' : 'text-ink-tertiary'}`}>
                    {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            )
          })}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-ink-secondary">
              <Loader2 className="animate-spin" size={14} /> Pensando…
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
                    onClick={() => setPendingFiles(p => p.filter(x => x.id !== f.id))}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={handleSend} className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
                onClick={() => fileRef.current?.click()}
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
                onClick={toggleMic}
                disabled={sending}
                title="Ditado por voz (modo interativo)"
              >
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </Button>
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder="Digite ou dite sua pergunta…"
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
          <p className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-ink-tertiary">
            <span className="inline-flex items-center gap-1">
              <ImageIcon size={10} /> Imagens / RX
            </span>
            <span className="inline-flex items-center gap-1">
              <FileText size={10} /> PDF e laudos
            </span>
            <span className="inline-flex items-center gap-1">
              <Mic size={10} /> Ditado ao vivo
            </span>
          </p>
        </footer>
      </section>
    </div>
  )
}

function Stat({ label, value, warn }) {
  return (
    <div
      className={`rounded-lg px-2 py-1.5 ${
        warn ? 'bg-warning/15 text-ink' : 'bg-surface-1 text-ink-secondary'
      }`}
    >
      <dt className="text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className="font-display text-lg font-semibold text-ink">{value ?? '—'}</dd>
    </div>
  )
}