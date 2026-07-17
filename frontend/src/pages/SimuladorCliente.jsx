import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Trash2, UserRound, Bot, Smartphone } from 'lucide-react'
import {
  getChatMensagens,
  simularMensagemCliente,
  limparChatTeste,
} from '../api'
import PageHeader from '../components/PageHeader'
import ErrorState from '../components/ErrorState'
import WhatsAppText from '../components/WhatsAppText'
import MessageFeedback, { isBotReplyMessage } from '../components/conversas/MessageFeedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const TEST_PHONE = '5599999000001'
const POLL_MS = 5000

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Página isolada: você é o paciente.
 * O bot OdontoGPT responde como no WhatsApp (sem enviar mensagem real).
 * Separado de Conversas (atendimento real / handoff humano).
 */
export default function SimuladorCliente() {
  const [msgs, setMsgs] = useState([])
  const [lastId, setLastId] = useState(0)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sendErr, setSendErr] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const loadThread = useCallback((after = 0) => {
    return getChatMensagens(TEST_PHONE, { after_id: after, limit: 200 })
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
  }, [])

  useEffect(() => {
    loadThread(0)
  }, [loadThread])

  useEffect(() => {
    const t = setInterval(() => loadThread(lastId), POLL_MS)
    return () => clearInterval(t)
  }, [lastId, loadThread])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, sending])

  async function handleSend(e) {
    e.preventDefault()
    const msg = texto.trim()
    if (!msg || sending) return
    setSending(true)
    setSendErr(null)
    setError(null)
    // Optimistic: mostra bolha do cliente na hora
    const tempId = `tmp-${Date.now()}`
    setMsgs(prev => [
      ...prev,
      {
        id: tempId,
        tipo: 'envio',
        mensagem: msg,
        created_at: new Date().toISOString(),
        classificacao: 'teste:cliente',
        _temp: true,
      },
    ])
    setTexto('')
    try {
      const res = await simularMensagemCliente(msg)
      if (res?.aviso) setSendErr(res.aviso)
      await loadThread(0)
      inputRef.current?.focus()
    } catch (ex) {
      setSendErr(ex.message)
      setMsgs(prev => prev.filter(m => m.id !== tempId))
    } finally {
      setSending(false)
    }
  }

  async function handleLimpar() {
    if (!window.confirm('Apagar todo o histórico deste simulador?')) return
    setSending(true)
    try {
      await limparChatTeste()
      setMsgs([])
      setLastId(0)
      setSendErr(null)
    } catch (ex) {
      setSendErr(ex.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Simulador de cliente"
        subtitle="Você é o paciente. O OdontoGPT responde como no WhatsApp — separado das Conversas reais."
      />

      {error && <ErrorState message={error.message} />}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-800">
          <Smartphone size={12} /> Modo paciente
        </span>
        <span>Não envia WhatsApp real · só treino do atendimento</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto gap-1"
          onClick={handleLimpar}
          disabled={sending}
        >
          <Trash2 size={14} /> Limpar conversa
        </Button>
      </div>

      {/* Tela estilo chat (você = esquerda = cliente) */}
      <section className="flex h-[min(70vh,640px)] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-[#e5ddd5] shadow-card">
        <header className="flex items-center gap-3 border-b border-black/5 bg-[#075e54] px-4 py-3 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <Bot size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">OdontoGPT</p>
            <p className="text-[11px] text-white/80">Assistente da clínica · simulador</p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10px] font-medium">
            <UserRound size={12} /> Você = cliente
          </div>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
          {msgs.length === 0 && !sending && (
            <div className="mx-auto max-w-sm rounded-xl bg-white/90 px-4 py-3 text-center text-sm text-ink-secondary shadow-sm">
              Escreva como se fosse um paciente. Ex.: <em>“Oi, quero marcar uma consulta”</em>
            </div>
          )}

          {msgs.map(m => {
            // envio = paciente (você) → direita, estilo WhatsApp outbound
            // reply = bot → esquerda
            const souEu = m.tipo === 'envio'
            return (
              <div key={m.id} className={`flex ${souEu ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                    souEu
                      ? 'rounded-tr-sm bg-[#dcf8c6] text-ink'
                      : 'rounded-tl-sm bg-white text-ink'
                  } ${m._temp ? 'opacity-70' : ''}`}
                >
                  <WhatsAppText text={m.mensagem} />
                  <p className="mt-1 text-right text-[10px] text-ink-tertiary">
                    {formatTime(m.created_at)}
                    {souEu ? ' · você' : ' · OdontoGPT'}
                  </p>
                  {!souEu && !m._temp && typeof m.id === 'number' && isBotReplyMessage(m) && (
                    <MessageFeedback
                      messageId={m.id}
                      feedback={m.feedback}
                      variant="wa"
                      onFeedbackChange={fb => {
                        setMsgs(prev =>
                          prev.map(x => (x.id === m.id ? { ...x, feedback: fb } : x))
                        )
                      }}
                      onRewriteDone={() => {
                        loadThread(0)
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-lg rounded-tl-sm bg-white px-3 py-2 text-xs text-ink-tertiary shadow-sm">
                OdontoGPT está digitando…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <footer className="border-t border-black/5 bg-[#f0f0f0] p-3">
          {sendErr && <p className="mb-2 text-sm text-danger">{sendErr}</p>}
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              ref={inputRef}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Mensagem do paciente…"
              disabled={sending}
              className="flex-1 border-0 bg-white shadow-sm"
              autoFocus
            />
            <Button type="submit" disabled={sending || !texto.trim()} className="gap-1 bg-[#075e54] hover:bg-[#064e46]">
              <Send size={16} /> Enviar
            </Button>
          </form>
        </footer>
      </section>
    </div>
  )
}
