import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  User,
  Bot,
  Send,
  Headphones,
  Sparkles,
  Calendar,
  Clock,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  ListChecks,
  RefreshCw,
  Paperclip,
  Smile,
  ArrowRight,
  X,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import EmptyState from '../EmptyState'
import LeadScorePicker, { LeadScoreBadge } from './LeadScorePicker'
import MessageFeedback, { isBotReplyMessage } from './MessageFeedback'

function formatTel(t) {
  if (!t || t.length < 12) return t
  return `+${t.slice(0, 2)} (${t.slice(2, 4)}) ${t.slice(4)}`
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(String(iso).replace(' ', 'T')).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatWait(min) {
  if (min == null) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function initials(name, tel) {
  const n = (name || '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }
  return (tel || '?').slice(-2)
}

function Avatar({ nome, foto, telefone, size = 'md' }) {
  const dim = size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm'
  if (foto) {
    return (
      <img
        src={foto}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-accent/20 shadow-card`}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-deep font-semibold text-white shadow-card`}
      aria-hidden
    >
      {initials(nome, telefone)}
    </div>
  )
}

const SLA_META = {
  ok: { label: 'No prazo', variant: 'success' },
  atencao: { label: 'Atenção', variant: 'warning' },
  critico: { label: 'SLA crítico', variant: 'danger' },
}

/**
 * Painel de conversa CRM — avatar WA, score, config compacta, scripts, histórico, composer.
 */
export default function ChatPaneCRM({
  sel,
  convAtual,
  sessao,
  msgs,
  humano,
  atendente,
  setAtendente,
  texto,
  setTexto,
  sending,
  sendErr,
  bottomRef,
  onAssumir,
  onDevolver,
  onSend,
  onPedirAgente,
  stages = [],
  onStage,
  onPrioridade,
  notasDraft,
  setNotasDraft,
  onSaveNotas,
  tags = [],
  tagPresets = [],
  onTags,
  rascunhoEdit,
  setRascunhoEdit,
  onSaveRascunho,
  onAprovarRascunho,
  onDescartarRascunho,
  savingCrm,
  onClose,
  fill,
  leadScores = [],
  onLeadScore,
  scriptFluxos = [],
  onScript,
  historico = [],
  followups = [],
  onFollowupStatus,
  onRefreshPerfil,
  refreshingPerfil,
  sideTab,
  setSideTab,
  onMessageFeedback,
  onRewriteToRascunho,
}) {
  const [cfgOpen, setCfgOpen] = useState(false)
  const [tagDraft, setTagDraft] = useState('')

  const nome =
    convAtual?.wa_nome || convAtual?.paciente_nome || sessao?.wa_nome || formatTel(sel)
  const foto = convAtual?.wa_foto_url || sessao?.wa_foto_url
  const sla = SLA_META[convAtual?.sla_status]
  const fluxoId = convAtual?.script_fluxo || sessao?.script_fluxo
  const passo = convAtual?.script_passo ?? sessao?.script_passo ?? 0
  const fluxo = scriptFluxos.find(f => f.id === fluxoId)
  const passoAtual = fluxo?.passos?.[passo]
  const temRascunho = !!(rascunhoEdit?.trim() || convAtual?.tem_rascunho)

  useEffect(() => {
    // fecha config ao trocar conversa
    setCfgOpen(false)
  }, [sel])

  if (!sel) {
    return (
      <section className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-2 shadow-card">
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            icon={Headphones}
            title="Selecione uma conversa"
            description="Abra um card: perfil WhatsApp, qualidade do lead, script e histórico na mesma visão."
          />
        </div>
      </section>
    )
  }

  function addTag(raw) {
    const t = String(raw || tagDraft)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .slice(0, 40)
    if (!t || tags.includes(t)) {
      setTagDraft('')
      return
    }
    onTags?.([...tags, t])
    setTagDraft('')
  }

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden bg-surface-2 ${
        fill ? 'h-full' : 'rounded-2xl border border-border-subtle shadow-card'
      }`}
    >
      {/* Header identidade */}
      <header className="shrink-0 border-b border-border-subtle bg-surface-2 px-3 py-2.5">
        <div className="flex items-start gap-3">
          <Avatar nome={nome} foto={foto} telefone={sel} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-base font-semibold text-ink md:text-lg">
                {nome}
              </h2>
              <LeadScoreBadge score={convAtual?.lead_score} scores={leadScores} />
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-auto rounded-lg p-1 text-ink-tertiary hover:bg-surface-1 hover:text-ink"
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <p className="truncate text-[11px] text-ink-tertiary">
              {formatTel(sel)}
              {convAtual?.paciente_id && (
                <>
                  {' · '}
                  <Link
                    to={`/pacientes/${convAtual.paciente_id}`}
                    className="text-accent-hover hover:underline"
                  >
                    Prontuário
                  </Link>
                </>
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {convAtual?.aguardando_resposta && sla && (
                <Badge variant={sla.variant}>
                  <Clock size={10} /> {formatWait(convAtual.minutos_espera)} · {sla.label}
                </Badge>
              )}
              {convAtual?.proxima_consulta && (
                <Badge variant="success">
                  <Calendar size={10} /> {convAtual.proxima_consulta.data}
                </Badge>
              )}
              {fluxo && (
                <Badge variant="accent">
                  <ListChecks size={10} /> {fluxo.label} · {passo + 1}/{fluxo.passos?.length || 0}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Ações principais — sempre visíveis, compactas */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {!humano ? (
            <Button type="button" size="sm" onClick={onAssumir} className="h-8 gap-1 px-2.5">
              <User size={13} /> Assumir
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={onDevolver} className="h-8 gap-1 px-2.5">
              <Bot size={13} /> Bot
            </Button>
          )}
          <Button type="button" size="sm" variant="brand" onClick={onPedirAgente} className="h-8 gap-1 px-2.5">
            <Sparkles size={13} /> OdontoGPT
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2"
            disabled={refreshingPerfil}
            onClick={onRefreshPerfil}
            title="Atualizar nome e foto do WhatsApp"
          >
            <RefreshCw size={13} className={refreshingPerfil ? 'animate-spin' : ''} />
          </Button>
          <button
            type="button"
            onClick={() => setCfgOpen(v => !v)}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-border-subtle bg-surface-1 px-2.5 text-[11px] font-semibold text-ink-secondary hover:border-accent/30"
          >
            CRM {cfgOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Config colapsável — não compete com o chat */}
        {cfgOpen && (
          <div className="mt-2 space-y-2.5 rounded-xl border border-border-subtle bg-surface-1/80 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-8 w-28 text-xs"
                placeholder="Seu nome"
                value={atendente}
                onChange={e => setAtendente(e.target.value)}
              />
              <select
                value={convAtual?.stage || 'entrada'}
                onChange={e => onStage(e.target.value)}
                disabled={savingCrm}
                className="h-8 rounded-lg border border-border-subtle bg-surface-2 px-2 text-xs"
              >
                {stages.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                value={convAtual?.prioridade || 'media'}
                onChange={e => onPrioridade(e.target.value)}
                disabled={savingCrm}
                className="h-8 rounded-lg border border-border-subtle bg-surface-2 px-2 text-xs"
              >
                <option value="alta">Prioridade alta</option>
                <option value="media">Prioridade média</option>
                <option value="baixa">Prioridade baixa</option>
              </select>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">
                Qualidade do lead
              </p>
              <LeadScorePicker
                value={convAtual?.lead_score}
                scores={leadScores}
                onChange={onLeadScore}
                disabled={savingCrm}
              />
            </div>

            <div className="flex gap-1.5">
              <Input
                value={notasDraft}
                onChange={e => setNotasDraft(e.target.value)}
                placeholder="Nota rápida da equipe…"
                className="h-8 flex-1 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={savingCrm || notasDraft === (convAtual?.notas_crm || '')}
                onClick={onSaveNotas}
              >
                OK
              </Button>
            </div>

            <div className="flex flex-wrap gap-1">
              {tags.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTags?.(tags.filter(x => x !== t))}
                  className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-deep"
                >
                  #{t} ×
                </button>
              ))}
              <div className="flex gap-1">
                <input
                  value={tagDraft}
                  onChange={e => setTagDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="+ tag"
                  className="h-6 w-20 rounded-full border border-border-subtle bg-surface-2 px-2 text-[10px]"
                />
                {tagPresets
                  .filter(p => !tags.includes(p))
                  .slice(0, 4)
                  .map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => addTag(p)}
                      className="rounded-full border border-dashed border-border-subtle px-1.5 text-[10px] text-ink-tertiary hover:border-accent"
                    >
                      {p}
                    </button>
                  ))}
              </div>
            </div>

            {/* Scripts */}
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">
                Fluxo de conversa
              </p>
              <div className="flex flex-wrap gap-1">
                {scriptFluxos.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onScript?.(f.id, 0)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      fluxoId === f.id
                        ? 'bg-brand text-white'
                        : 'bg-surface-2 text-ink-secondary ring-1 ring-border-subtle'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                {fluxoId && (
                  <button
                    type="button"
                    onClick={() => onScript?.(null)}
                    className="rounded-full px-2 py-1 text-[10px] text-ink-tertiary hover:text-danger"
                  >
                    limpar
                  </button>
                )}
              </div>
              {fluxo && (
                <div className="mt-2 rounded-lg border border-accent/20 bg-accent-soft/30 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-ink">
                      Passo {passo + 1}: {passoAtual?.label}
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={passo <= 0}
                        onClick={() => onScript?.(fluxoId, Math.max(0, passo - 1))}
                        className="rounded px-1.5 text-[10px] font-bold text-ink-secondary disabled:opacity-30"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={passo >= (fluxo.passos?.length || 1) - 1}
                        onClick={() =>
                          onScript?.(fluxoId, Math.min((fluxo.passos?.length || 1) - 1, passo + 1))
                        }
                        className="rounded px-1.5 text-[10px] font-bold text-ink-secondary disabled:opacity-30"
                      >
                        →
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] leading-snug text-ink-secondary">{passoAtual?.template}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-1.5 h-7 text-[11px]"
                    onClick={() => {
                      if (passoAtual?.template) setTexto(passoAtual.template)
                    }}
                  >
                    Usar no compositor
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Corpo: thread + rail lateral */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* HITL strip */}
          {(temRascunho || rascunhoEdit) && (
            <div className="shrink-0 border-b border-accent/20 bg-accent-soft/40 px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                <ShieldCheck size={12} className="text-accent-deep" /> Rascunho HITL
              </div>
              <textarea
                value={rascunhoEdit}
                onChange={e => setRascunhoEdit(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="Texto a aprovar antes do WhatsApp…"
              />
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={onSaveRascunho}>
                  Guardar
                </Button>
                <Button type="button" size="sm" className="h-7 gap-1 text-[11px]" onClick={onAprovarRascunho} disabled={sending}>
                  <Check size={12} /> Aprovar e enviar
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onDescartarRascunho}>
                  Descartar
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 space-y-2.5 overflow-y-auto bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-surface-2)_48%)] px-3 py-3">
            {msgs.map(m => {
              const out = m.tipo === 'reply'
              const isBot = isBotReplyMessage(m)
              return (
                <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'} gap-2`}>
                  {!out && (
                    <Avatar nome={nome} foto={foto} telefone={sel} size="sm" />
                  )}
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm ${
                      out
                        ? 'rounded-br-md bg-accent text-white'
                        : 'rounded-bl-md border border-border-subtle bg-surface-2 text-ink'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.mensagem}</p>
                    <p className={`mt-1 text-[10px] ${out ? 'text-white/65' : 'text-ink-tertiary'}`}>
                      {formatTime(m.created_at)}
                      {out && !isBot && ` · ${(m.classificacao || '').replace(/^atendente:/i, '')}`}
                      {isBot && ' · OdontoGPT'}
                    </p>
                    {isBot && typeof m.id === 'number' && (
                      <div className="mt-2 rounded-lg bg-white/95 p-2 text-left text-ink shadow-sm">
                        <MessageFeedback
                          messageId={m.id}
                          feedback={m.feedback}
                          variant="crm"
                          onFeedbackChange={fb => onMessageFeedback?.(m.id, fb)}
                          onRewriteDone={res => {
                            if (res.destino === 'rascunho' && res.texto) {
                              onRewriteToRascunho?.(res.texto)
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Composer premium */}
          <footer className="shrink-0 border-t border-border-subtle bg-surface-2 p-3">
            {sendErr && <p className="mb-1.5 text-xs text-danger">{sendErr}</p>}
            {!humano && (
              <p className="mb-1.5 flex items-center gap-1 text-[11px] text-ink-tertiary">
                <ArrowRight size={11} className="text-accent-deep" />
                Assuma ou use HITL · OdontoGPT no console do agente
              </p>
            )}
            <form
              onSubmit={onSend}
              className="flex items-end gap-2 rounded-2xl border border-border-subtle bg-surface-1 p-1.5 shadow-card focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/15"
            >
              <button
                type="button"
                className="mb-0.5 rounded-xl p-2 text-ink-tertiary hover:bg-surface-2 hover:text-ink"
                title="Em breve: anexos"
                disabled
              >
                <Paperclip size={16} />
              </button>
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (humano && texto.trim()) onSend?.(e)
                  }
                }}
                rows={1}
                placeholder={
                  humano
                    ? 'Mensagem ao paciente… (Enter envia, Shift+Enter quebra linha)'
                    : 'Assuma a conversa para digitar…'
                }
                disabled={!humano || sending}
                className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                className="mb-0.5 rounded-xl p-2 text-ink-tertiary hover:bg-surface-2"
                disabled
                title="Em breve"
              >
                <Smile size={16} />
              </button>
              <Button
                type="submit"
                size="sm"
                disabled={!humano || sending || !texto.trim()}
                className="mb-0.5 h-10 w-10 shrink-0 rounded-xl p-0"
                aria-label="Enviar"
              >
                <Send size={16} />
              </Button>
            </form>
          </footer>
        </div>

        {/* Rail: histórico + follow-ups */}
        <aside className="hidden w-[200px] shrink-0 flex-col border-l border-border-subtle bg-surface-1/60 md:flex">
          <div className="flex border-b border-border-subtle">
            {[
              { id: 'hist', label: 'Histórico', icon: History },
              { id: 'fu', label: 'Follow-ups', icon: ListChecks },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSideTab?.(t.id)}
                className={`flex flex-1 items-center justify-center gap-1 py-2 text-[10px] font-semibold ${
                  sideTab === t.id ? 'border-b-2 border-accent text-accent-deep' : 'text-ink-tertiary'
                }`}
              >
                <t.icon size={11} /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {sideTab === 'hist' && (
              <ul className="space-y-2">
                {historico.length === 0 && (
                  <li className="px-1 py-4 text-center text-[10px] text-ink-tertiary">
                    Eventos da conversa aparecem aqui (estágio, score, scripts, perfil).
                  </li>
                )}
                {historico.map(ev => (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-border-subtle bg-surface-2 px-2 py-1.5"
                  >
                    <p className="text-[10px] font-semibold text-ink">{ev.titulo}</p>
                    {ev.detalhe && (
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-ink-secondary">{ev.detalhe}</p>
                    )}
                    <p className="mt-0.5 text-[9px] text-ink-tertiary">{formatTime(ev.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
            {sideTab === 'fu' && (
              <ul className="space-y-2">
                {followups.length === 0 && (
                  <li className="px-1 py-4 text-center text-[10px] text-ink-tertiary">
                    Follow-ups automáticos ao mudar estágio ou score.
                  </li>
                )}
                {followups.map(f => (
                  <li
                    key={f.id}
                    className="rounded-lg border border-border-subtle bg-surface-2 px-2 py-1.5"
                  >
                    <p className="text-[10px] font-semibold text-ink">{f.titulo}</p>
                    <p className="text-[9px] text-ink-tertiary">
                      {f.status} · até {formatTime(f.due_at)}
                    </p>
                    {f.status === 'pendente' && (
                      <div className="mt-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => onFollowupStatus?.(f.id, 'feito')}
                          className="rounded bg-success-soft px-1.5 py-0.5 text-[9px] font-bold text-success"
                        >
                          Feito
                        </button>
                        <button
                          type="button"
                          onClick={() => onFollowupStatus?.(f.id, 'cancelado')}
                          className="rounded bg-surface-1 px-1.5 py-0.5 text-[9px] text-ink-tertiary"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

export { Avatar, formatTel, formatWait }
