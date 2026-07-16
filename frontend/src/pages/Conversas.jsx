import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, User, Bot, Send, Headphones } from 'lucide-react'
import {
  getChatConversas,
  getChatMensagens,
  assumirConversa,
  devolverConversa,
  enviarChatMensagem,
} from '../api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const ATENDENTE_KEY = 'odontogpt_atendente_nome'
const POLL_MS = 4000

function formatTel(t) {
  if (!t || t.length < 12) return t
  return `+${t.slice(0, 2)} (${t.slice(2, 4)}) ${t.slice(4)}`
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function Conversas() {
  const [lista, setLista] = useState(null)
  const [sel, setSel] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [sessao, setSessao] = useState({ modo: 'bot' })
  const [lastId, setLastId] = useState(0)
  const [error, setError] = useState(null)
  const [sendErr, setSendErr] = useState(null)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [atendente, setAtendente] = useState(() => localStorage.getItem(ATENDENTE_KEY) || '')
  const bottomRef = useRef(null)

  const loadLista = useCallback(() => {
    getChatConversas().then(d => setLista(d.data || [])).catch(setError)
  }, [])

  const loadThread = useCallback((telefone, after = 0) => {
    if (!telefone) return
    getChatMensagens(telefone, { after_id: after, limit: 200 })
      .then(d => {
        setSessao(d.sessao || { modo: 'bot' })
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

  useEffect(() => { loadLista() }, [loadLista])
  useEffect(() => {
    const t = setInterval(() => {
      loadLista()
      if (sel) loadThread(sel, lastId)
    }, POLL_MS)
    return () => clearInterval(t)
  }, [sel, lastId, loadLista, loadThread])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  function selectConversa(c) {
    setSel(c.telefone)
    setLastId(0)
    setMsgs([])
    setSendErr(null)
    loadThread(c.telefone, 0)
  }

  async function handleAssumir() {
    const nome = atendente.trim() || 'Atendente'
    localStorage.setItem(ATENDENTE_KEY, nome)
    setAtendente(nome)
    await assumirConversa(sel, nome)
    loadThread(sel, 0)
    loadLista()
  }

  async function handleDevolver() {
    await devolverConversa(sel)
    loadThread(sel, 0)
    loadLista()
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!texto.trim() || !sel) return
    setSending(true)
    setSendErr(null)
    try {
      await enviarChatMensagem(sel, texto.trim(), atendente.trim() || 'Atendente')
      setTexto('')
      loadThread(sel, lastId)
      loadLista()
    } catch (ex) {
      setSendErr(ex.message)
    } finally {
      setSending(false)
    }
  }

  const humano = sessao.modo === 'human'
  const convAtual = lista?.find(c => c.telefone === sel)

  return (
    <div className="-mx-4 max-w-none md:-mx-8">
      <PageHeader
        title="Atendimento WhatsApp"
        subtitle="Assuma a conversa para responder pelo dashboard; o bot OdontoGPT pausa nesse número."
      />

      {error && <ErrorState message={error.message} />}

      <div className="grid h-[min(72vh,720px)] grid-cols-1 gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
        <aside className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-2 shadow-card">
          <div className="border-b border-border-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
            Conversas
          </div>
          <div className="flex-1 overflow-y-auto">
            {!lista && !error && <Loading label="Carregando" />}
            {lista?.length === 0 && (
              <div className="p-4">
                <EmptyState icon={MessageSquare} title="Sem conversas" description="Mensagens do WhatsApp aparecem aqui após o bridge registrar interações." />
              </div>
            )}
            {lista?.map(c => (
              <button
                key={c.telefone}
                type="button"
                onClick={() => selectConversa(c)}
                className={`w-full border-b border-border-subtle px-4 py-3 text-left transition-colors hover:bg-surface-1 ${
                  sel === c.telefone ? 'bg-accent-soft/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-ink">
                    {c.paciente_nome || formatTel(c.telefone)}
                  </span>
                  {c.modo === 'human' ? (
                    <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Humano</span>
                  ) : (
                    <span className="flex-shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-deep">Bot</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-secondary">{formatTel(c.telefone)}</p>
                <p className="mt-1 text-[10px] text-ink-tertiary">{formatTime(c.ultima_em)}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-2 shadow-card">
          {!sel ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState icon={Headphones} title="Selecione uma conversa" description="Escolha um contato à esquerda para ver mensagens e assumir o atendimento." />
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-semibold text-ink">
                    {convAtual?.paciente_nome || formatTel(sel)}
                  </h2>
                  <p className="text-xs text-ink-secondary">
                    {formatTel(sel)}
                    {convAtual?.paciente_id && (
                      <> · <Link to={`/pacientes/${convAtual.paciente_id}`} className="text-accent-hover hover:underline">Ver paciente</Link></>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-9 w-36 text-sm"
                    placeholder="Seu nome"
                    value={atendente}
                    onChange={e => setAtendente(e.target.value)}
                  />
                  {!humano ? (
                    <Button type="button" size="sm" onClick={handleAssumir} className="gap-1">
                      <User size={14} /> Assumir
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" onClick={handleDevolver} className="gap-1">
                      <Bot size={14} /> Devolver ao bot
                    </Button>
                  )}
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {msgs.map(m => {
                  const out = m.tipo === 'reply'
                  const atend = m.classificacao?.startsWith('atendente:')
                  return (
                    <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                          out
                            ? 'rounded-br-md bg-accent text-white'
                            : 'rounded-bl-md border border-border-subtle bg-surface-1 text-ink'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.mensagem}</p>
                        <p className={`mt-1 text-[10px] ${out ? 'text-white/70' : 'text-ink-tertiary'}`}>
                          {formatTime(m.created_at)}
                          {atend && ` · ${m.classificacao.replace('atendente:', '')}`}
                          {!atend && out && ' · OdontoGPT'}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              <footer className="border-t border-border-subtle p-4">
                {sendErr && <p className="mb-2 text-sm text-danger">{sendErr}</p>}
                {!humano && (
                  <p className="mb-2 text-xs text-ink-secondary">Clique em <strong>Assumir</strong> para o bot parar de responder e você enviar mensagens.</p>
                )}
                <form onSubmit={handleSend} className="flex gap-2">
                  <Input
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    placeholder={humano ? 'Digite sua mensagem…' : 'Assuma a conversa para enviar'}
                    disabled={!humano || sending}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={!humano || sending || !texto.trim()} className="gap-1">
                    <Send size={16} /> Enviar
                  </Button>
                </form>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  )
}