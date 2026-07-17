import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MessageSquare,
  User,
  Bot,
  Send,
  Headphones,
  LayoutGrid,
  List,
  Sparkles,
  Search,
  GripVertical,
  Calendar,
  AlertCircle,
  StickyNote,
  ArrowRight,
  Filter,
  Clock,
  Tag,
  X,
  Check,
  ShieldCheck,
  Radio,
} from 'lucide-react'
import {
  getChatConversas,
  pollChatConversasEvents,
  getChatMensagens,
  assumirConversa,
  devolverConversa,
  enviarChatMensagem,
  atualizarChatCrm,
  salvarChatRascunho,
  descartarChatRascunho,
  aprovarChatRascunho,
  refreshChatPerfil,
  getChatHistorico,
  updateChatFollowup,
} from '../api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import ChatPaneCRM, { Avatar } from '../components/conversas/ChatPaneCRM'
import { LeadScoreBadge } from '../components/conversas/LeadScorePicker'

const ATENDENTE_KEY = 'odontogpt_atendente_nome'
const VIEW_KEY = 'odontogpt_conversas_view'
const THREAD_POLL_MS = 3500

const DEFAULT_STAGES = [
  { id: 'entrada', label: 'Entrada', hint: 'Primeiro contato / triagem' },
  { id: 'agente', label: 'OdontoGPT', hint: 'Agente atendendo no WhatsApp' },
  { id: 'humano', label: 'Humano', hint: 'Equipe assumiu o atendimento' },
  { id: 'agendamento', label: 'Agendamento', hint: 'Marcando ou confirmando consulta' },
  { id: 'followup', label: 'Follow-up', hint: 'Pós-consulta, orçamento, retorno' },
  { id: 'concluido', label: 'Concluído', hint: 'Resolvido ou arquivado' },
]

const DEFAULT_TAGS = [
  'novo',
  'retorno',
  'urgencia',
  'orcamento',
  'confirmacao',
  'noshow',
  'vip',
  'implante',
  'ortodontia',
  'avaliacao',
]

const PRI_META = {
  alta: { label: 'Alta', variant: 'danger', ring: 'ring-danger/30' },
  media: { label: 'Média', variant: 'warning', ring: 'ring-warning/20' },
  baixa: { label: 'Baixa', variant: 'neutral', ring: 'ring-border-subtle' },
}

const SLA_META = {
  ok: { label: 'No prazo', variant: 'success' },
  atencao: { label: 'Atenção', variant: 'warning' },
  critico: { label: 'SLA crítico', variant: 'danger' },
  'n/a': null,
}

function formatTel(t) {
  if (!t || t.length < 12) return t
  return `+${t.slice(0, 2)} (${t.slice(2, 4)}) ${t.slice(4)}`
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

function formatShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function formatWait(min) {
  if (min == null) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function displayName(c) {
  return c?.wa_nome || c?.paciente_nome || formatTel(c?.telefone) || 'Contato'
}

function buildAgentPedido(c) {
  const nome = displayName(c)
  const trecho = (c.ultima_mensagem || '').slice(0, 160)
  const stage = c.stage || 'entrada'
  const nota = c.notas_crm ? ` Notas: ${c.notas_crm}.` : ''
  const tags = c.tags?.length ? ` Tags: ${c.tags.join(', ')}.` : ''
  const wait =
    c.minutos_espera != null
      ? ` Paciente aguarda há ${formatWait(c.minutos_espera)} (SLA ${c.sla_status}).`
      : ''
  const agenda = c.proxima_consulta
    ? ` Próxima consulta: ${c.proxima_consulta.data} ${c.proxima_consulta.horario || ''} (${c.proxima_consulta.status}).`
    : ''
  return (
    `Missão CRM WhatsApp — ${nome} (${formatTel(c.telefone)}), estágio "${stage}".` +
    `${wait} Última mensagem: "${trecho}".${agenda}${nota}${tags}` +
    ` Sugira o próximo passo e um texto de resposta WhatsApp pronto para a equipe aprovar (HITL).`
  )
}

function CrmCard({ c, active, onOpen, onDragStart }) {
  const pri = PRI_META[c.prioridade] || PRI_META.media
  const sla = SLA_META[c.sla_status]
  const nome = displayName(c)
  return (
    <article
      draggable
      onDragStart={e => onDragStart(e, c)}
      onClick={() => onOpen(c)}
      className={`group cursor-pointer rounded-xl border bg-surface-2 p-3 text-left shadow-card transition
        hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-lg
        ${active ? 'border-accent ring-2 ring-accent/25' : 'border-border-subtle'}
        ${c.sla_status === 'critico' ? 'ring-1 ring-danger/35' : c.prioridade === 'alta' ? 'ring-1 ' + pri.ring : ''}
      `}
    >
      <div className="flex items-start gap-2">
        <GripVertical
          size={14}
          className="mt-0.5 shrink-0 text-ink-tertiary opacity-40 group-hover:opacity-80"
          aria-hidden
        />
        <Avatar nome={nome} foto={c.wa_foto_url} telefone={c.telefone} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{nome}</h3>
            <span className="shrink-0 text-[10px] tabular-nums text-ink-tertiary">
              {formatShort(c.ultima_em)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-tertiary">{formatTel(c.telefone)}</p>
          {c.ultima_mensagem && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-ink-secondary">
              {c.ultima_tipo === 'reply' ? '↳ ' : ''}
              {c.ultima_mensagem}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <LeadScoreBadge score={c.lead_score} />
            {c.modo === 'human' ? (
              <Badge variant="warning">Humano</Badge>
            ) : (
              <Badge variant="accent">OdontoGPT</Badge>
            )}
            {c.aguardando_resposta && sla && (
              <Badge variant={sla.variant}>
                <Clock size={10} /> {formatWait(c.minutos_espera)}
              </Badge>
            )}
            {c.tem_rascunho && (
              <Badge variant="accent">
                <ShieldCheck size={10} /> HITL
              </Badge>
            )}
            {c.followups_pendentes > 0 && (
              <Badge variant="warning">{c.followups_pendentes} FU</Badge>
            )}
            {c.proxima_consulta && (
              <Badge variant="success">
                <Calendar size={10} /> {c.proxima_consulta.data}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function TagEditor({ tags = [], presets = DEFAULT_TAGS, onChange, disabled }) {
  const [draft, setDraft] = useState('')
  const set = useMemo(() => new Set(tags), [tags])

  function add(tag) {
    const t = String(tag || draft)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .slice(0, 40)
    if (!t || set.has(t)) {
      setDraft('')
      return
    }
    onChange([...tags, t])
    setDraft('')
  }

  function remove(tag) {
    onChange(tags.filter(x => x !== tag))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <span className="text-[11px] text-ink-tertiary">Sem tags — escolha ou digite</span>
        )}
        {tags.map(t => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => remove(t)}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-deep hover:bg-danger-soft hover:text-danger"
            title="Remover tag"
          >
            #{t} <X size={10} />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Nova tag…"
          className="h-8 flex-1 text-xs"
          disabled={disabled}
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled || !draft.trim()} onClick={() => add()}>
          <Tag size={12} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {presets
          .filter(p => !set.has(p))
          .slice(0, 8)
          .map(p => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => add(p)}
              className="rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-secondary hover:border-accent/40 hover:text-accent-deep"
            >
              + {p}
            </button>
          ))}
      </div>
    </div>
  )
}

export default function Conversas() {
  const navigate = useNavigate()
  const [lista, setLista] = useState(null)
  const [stages, setStages] = useState(DEFAULT_STAGES)
  const [resumo, setResumo] = useState(null)
  const [tagPresets, setTagPresets] = useState(DEFAULT_TAGS)
  const [version, setVersion] = useState(null)
  const [live, setLive] = useState('idle') // idle | live | paused
  const [sel, setSel] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [sessao, setSessao] = useState({ modo: 'bot' })
  const [lastId, setLastId] = useState(0)
  const [error, setError] = useState(null)
  const [sendErr, setSendErr] = useState(null)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [atendente, setAtendente] = useState(() => localStorage.getItem(ATENDENTE_KEY) || '')
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'kanban')
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [notasDraft, setNotasDraft] = useState('')
  const [rascunhoEdit, setRascunhoEdit] = useState('')
  const [savingCrm, setSavingCrm] = useState(false)
  const [dragOverStage, setDragOverStage] = useState(null)
  const [tick, setTick] = useState(0)
  const [leadScores, setLeadScores] = useState([])
  const [scriptFluxos, setScriptFluxos] = useState([])
  const [historico, setHistorico] = useState([])
  const [followups, setFollowups] = useState([])
  const [sideTab, setSideTab] = useState('hist')
  const [refreshingPerfil, setRefreshingPerfil] = useState(false)
  const bottomRef = useRef(null)
  const dragPhoneRef = useRef(null)
  const versionRef = useRef(null)
  const abortLiveRef = useRef(false)

  const applyPayload = useCallback(d => {
    if (!d) return
    if (d.version) {
      setVersion(d.version)
      versionRef.current = d.version
    }
    if (d.changed === false) return
    if (Array.isArray(d.data)) setLista(d.data)
    if (d.stages?.length) setStages(d.stages)
    if (d.resumo) setResumo(d.resumo)
    if (d.tag_presets?.length) setTagPresets(d.tag_presets)
    else if (d.resumo?.tag_presets?.length) setTagPresets(d.resumo.tag_presets)
    if (d.resumo?.lead_scores?.length) setLeadScores(d.resumo.lead_scores)
    if (d.resumo?.script_fluxos?.length) setScriptFluxos(d.resumo.script_fluxos)
    setError(null)
  }, [])

  const loadLista = useCallback(
    async (opts = {}) => {
      try {
        const d = await getChatConversas(opts.full ? {} : { since: versionRef.current || undefined })
        applyPayload(d)
        if (d.changed === false && !lista) {
          const full = await getChatConversas({})
          applyPayload(full)
        }
      } catch (ex) {
        setError(ex)
      }
    },
    [applyPayload, lista]
  )

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
        const r = d.sessao?.rascunho_resposta
        if (r != null) setRascunhoEdit(r)
      })
      .catch(setError)
  }, [])

  // Carga inicial
  useEffect(() => {
    getChatConversas({})
      .then(applyPayload)
      .catch(setError)
  }, [applyPayload])

  // Long-poll em tempo real (pausa com aba oculta)
  useEffect(() => {
    abortLiveRef.current = false
    let cancelled = false

    async function loop() {
      while (!cancelled && !abortLiveRef.current) {
        if (document.visibilityState === 'hidden') {
          setLive('paused')
          await new Promise(r => setTimeout(r, 1500))
          continue
        }
        setLive('live')
        const since = versionRef.current || '0'
        try {
          const d = await pollChatConversasEvents(since, { timeout: 22 })
          if (cancelled) break
          applyPayload(d)
        } catch {
          if (cancelled) break
          await new Promise(r => setTimeout(r, 2500))
        }
      }
    }
    loop()

    function onVis() {
      if (document.visibilityState === 'visible') {
        getChatConversas({}).then(applyPayload).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      abortLiveRef.current = true
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [applyPayload])

  // Thread polling
  useEffect(() => {
    if (!sel) return undefined
    const t = setInterval(() => loadThread(sel, lastId), THREAD_POLL_MS)
    return () => clearInterval(t)
  }, [sel, lastId, loadThread])

  // Relógio SLA (re-render a cada 30s para minutos de espera “vivos”)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view)
  }, [view])

  const convAtual = useMemo(() => {
    const base = lista?.find(c => c.telefone === sel) || null
    if (!base || tick < 0) return base
    // recompute local wait display from ultima_em
    if (base.aguardando_resposta && base.ultima_em) {
      const mins = Math.max(
        0,
        Math.floor((Date.now() - new Date(base.ultima_em.replace(' ', 'T')).getTime()) / 60000)
      )
      // only adjust if parse worked
      if (!Number.isNaN(mins)) {
        return { ...base, minutos_espera: mins }
      }
    }
    return base
  }, [lista, sel, tick])

  useEffect(() => {
    setNotasDraft(convAtual?.notas_crm || '')
    if (convAtual?.rascunho_resposta != null) {
      setRascunhoEdit(convAtual.rascunho_resposta)
    } else if (sessao?.rascunho_resposta) {
      setRascunhoEdit(sessao.rascunho_resposta)
    } else {
      setRascunhoEdit('')
    }
  }, [convAtual?.telefone, convAtual?.notas_crm, convAtual?.rascunho_resposta, sessao?.rascunho_resposta])

  const listaComTick = useMemo(() => {
    if (!lista) return null
    return lista.map(c => {
      if (!c.aguardando_resposta || !c.ultima_em) return c
      const mins = Math.max(
        0,
        Math.floor((Date.now() - new Date(String(c.ultima_em).replace(' ', 'T')).getTime()) / 60000)
      )
      if (Number.isNaN(mins)) return c
      let sla = c.sla_status
      const pri = c.prioridade || 'media'
      const crit = pri === 'alta' ? 20 : 45
      const aten = pri === 'alta' ? 8 : 15
      if (mins >= crit) sla = 'critico'
      else if (mins >= aten) sla = 'atencao'
      else sla = 'ok'
      return { ...c, minutos_espera: mins, sla_status: sla }
    })
  }, [lista, tick])

  const filtradas = useMemo(() => {
    let items = listaComTick || []
    const term = q.trim().toLowerCase()
    if (term) {
      items = items.filter(c => {
        const blob = [c.paciente_nome, c.telefone, c.ultima_mensagem, c.notas_crm, ...(c.tags || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return blob.includes(term)
      })
    }
    if (filtro === 'aguardando') items = items.filter(c => c.aguardando_resposta)
    if (filtro === 'humano') items = items.filter(c => c.modo === 'human')
    if (filtro === 'alta') items = items.filter(c => c.prioridade === 'alta')
    if (filtro === 'sla') items = items.filter(c => c.sla_status === 'critico' || c.sla_status === 'atencao')
    if (filtro === 'rascunho') items = items.filter(c => c.tem_rascunho)
    return items
  }, [listaComTick, q, filtro])

  const byStage = useMemo(() => {
    const map = Object.fromEntries(stages.map(s => [s.id, []]))
    for (const c of filtradas) {
      const st = map[c.stage] ? c.stage : 'entrada'
      map[st].push(c)
    }
    return map
  }, [filtradas, stages])

  const loadHistorico = useCallback(tel => {
    if (!tel) return
    getChatHistorico(tel)
      .then(d => {
        setHistorico(d.eventos || [])
        setFollowups(d.followups || [])
        if (d.sessao) setSessao(prev => ({ ...prev, ...d.sessao }))
      })
      .catch(() => {})
  }, [])

  function selectConversa(c) {
    const tel = typeof c === 'string' ? c : c.telefone
    setSel(tel)
    setLastId(0)
    setMsgs([])
    setSendErr(null)
    loadThread(tel, 0)
    loadHistorico(tel)
    // captura nome/foto em background
    refreshChatPerfil(tel, false)
      .then(() => loadLista({ full: true }))
      .catch(() => {})
  }

  async function handleRefreshPerfil() {
    if (!sel) return
    setRefreshingPerfil(true)
    try {
      await refreshChatPerfil(sel, true)
      await loadLista({ full: true })
      loadHistorico(sel)
    } catch (ex) {
      setSendErr(ex.message)
    } finally {
      setRefreshingPerfil(false)
    }
  }

  async function handleAssumir() {
    const nome = atendente.trim() || 'Atendente'
    localStorage.setItem(ATENDENTE_KEY, nome)
    setAtendente(nome)
    await assumirConversa(sel, nome)
    loadThread(sel, 0)
    loadLista({ full: true })
  }

  async function handleDevolver() {
    await devolverConversa(sel)
    loadThread(sel, 0)
    loadLista({ full: true })
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
      loadLista({ full: true })
    } catch (ex) {
      setSendErr(ex.message)
    } finally {
      setSending(false)
    }
  }

  async function patchCrm(telefone, body) {
    setSavingCrm(true)
    try {
      setLista(prev =>
        (prev || []).map(c =>
          c.telefone === telefone
            ? {
                ...c,
                ...body,
                tem_rascunho: body.rascunho_resposta != null ? !!body.rascunho_resposta : c.tem_rascunho,
                modo:
                  body.stage === 'humano'
                    ? 'human'
                    : body.stage === 'agente' || body.stage === 'entrada'
                      ? 'bot'
                      : c.modo,
              }
            : c
        )
      )
      await atualizarChatCrm(telefone, body)
      await loadLista({ full: true })
      if (sel === telefone) loadThread(telefone, 0)
    } catch (ex) {
      setError(ex)
      loadLista({ full: true })
    } finally {
      setSavingCrm(false)
    }
  }

  async function handleSaveRascunho() {
    if (!sel || !rascunhoEdit.trim()) return
    setSavingCrm(true)
    setSendErr(null)
    try {
      await salvarChatRascunho(sel, rascunhoEdit.trim(), 'humano')
      await loadLista({ full: true })
      loadThread(sel, 0)
    } catch (ex) {
      setSendErr(ex.message)
    } finally {
      setSavingCrm(false)
    }
  }

  async function handleAprovarRascunho() {
    if (!sel) return
    setSending(true)
    setSendErr(null)
    try {
      const nome = atendente.trim() || 'Atendente'
      localStorage.setItem(ATENDENTE_KEY, nome)
      await aprovarChatRascunho(sel, {
        atendente: nome,
        mensagem: rascunhoEdit.trim() || undefined,
      })
      setRascunhoEdit('')
      loadThread(sel, 0)
      await loadLista({ full: true })
    } catch (ex) {
      setSendErr(ex.message)
    } finally {
      setSending(false)
    }
  }

  async function handleDescartarRascunho() {
    if (!sel) return
    setSavingCrm(true)
    try {
      await descartarChatRascunho(sel)
      setRascunhoEdit('')
      await loadLista({ full: true })
      loadThread(sel, 0)
    } catch (ex) {
      setSendErr(ex.message)
    } finally {
      setSavingCrm(false)
    }
  }

  function onDragStart(e, c) {
    dragPhoneRef.current = c.telefone
    e.dataTransfer.setData('text/plain', c.telefone)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e, stageId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stageId)
  }

  function onDragLeave(stageId) {
    setDragOverStage(prev => (prev === stageId ? null : prev))
  }

  async function onDrop(e, stageId) {
    e.preventDefault()
    setDragOverStage(null)
    const phone = e.dataTransfer.getData('text/plain') || dragPhoneRef.current
    if (!phone) return
    const card = lista?.find(c => c.telefone === phone)
    if (!card || card.stage === stageId) return
    await patchCrm(phone, { stage: stageId })
  }

  function pedirAoAgente(c) {
    navigate(`/agente?pedido=${encodeURIComponent(buildAgentPedido(c))}`)
  }

  function handleMessageFeedback(id, fb) {
    setMsgs(prev => prev.map(m => (m.id === id ? { ...m, feedback: fb } : m)))
  }

  function handleRewriteToRascunho(texto) {
    setRascunhoEdit(texto)
    setSendErr(null)
    setLista(prev =>
      prev
        ? prev.map(c =>
            c.telefone === sel
              ? {
                  ...c,
                  rascunho_resposta: texto,
                  rascunho_origem: 'feedback',
                  tem_rascunho: true,
                }
              : c
          )
        : prev
    )
    setSessao(prev => ({
      ...prev,
      rascunho_resposta: texto,
      tem_rascunho: true,
    }))
  }

  const humano = sessao.modo === 'human'
  const metrics = {
    total: resumo?.total ?? listaComTick?.length ?? 0,
    aguardando_resposta:
      resumo?.aguardando_resposta ?? listaComTick?.filter(c => c.aguardando_resposta).length ?? 0,
    em_humano: resumo?.em_humano ?? listaComTick?.filter(c => c.modo === 'human').length ?? 0,
    prioridade_alta: resumo?.prioridade_alta ?? listaComTick?.filter(c => c.prioridade === 'alta').length ?? 0,
    sla_critico: resumo?.sla_critico ?? listaComTick?.filter(c => c.sla_status === 'critico').length ?? 0,
    com_rascunho: resumo?.com_rascunho ?? listaComTick?.filter(c => c.tem_rascunho).length ?? 0,
  }

  const chatProps = {
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
    onAssumir: handleAssumir,
    onDevolver: handleDevolver,
    onSend: handleSend,
    onPedirAgente: () => convAtual && pedirAoAgente(convAtual),
    stages,
    onStage: stage => sel && patchCrm(sel, { stage }).then(() => loadHistorico(sel)),
    onPrioridade: prioridade => sel && patchCrm(sel, { prioridade }),
    notasDraft,
    setNotasDraft,
    onSaveNotas: () => sel && patchCrm(sel, { notas_crm: notasDraft }),
    tags: convAtual?.tags || [],
    tagPresets,
    onTags: tags => sel && patchCrm(sel, { tags }),
    rascunhoEdit,
    setRascunhoEdit,
    onSaveRascunho: handleSaveRascunho,
    onAprovarRascunho: handleAprovarRascunho,
    onDescartarRascunho: handleDescartarRascunho,
    savingCrm,
    leadScores,
    onLeadScore: score =>
      sel &&
      patchCrm(sel, score == null ? { lead_score: undefined } : { lead_score: score }).then(() =>
        loadHistorico(sel)
      ),
    scriptFluxos,
    onScript: (fluxo, passo = 0) => {
      if (!sel) return
      if (fluxo == null) return patchCrm(sel, { clear_script: true }).then(() => loadHistorico(sel))
      return patchCrm(sel, { script_fluxo: fluxo, script_passo: passo }).then(() => loadHistorico(sel))
    },
    historico,
    followups,
    onFollowupStatus: async (id, status) => {
      await updateChatFollowup(id, status)
      loadHistorico(sel)
      loadLista({ full: true })
    },
    onRefreshPerfil: handleRefreshPerfil,
    refreshingPerfil,
    sideTab,
    setSideTab,
    onMessageFeedback: handleMessageFeedback,
    onRewriteToRascunho: handleRewriteToRascunho,
  }

  return (
    <div className="-mx-4 max-w-none md:-mx-8">
      <PageHeader
        title="CRM de Conversas"
        subtitle="Funil WhatsApp agentico — SLA, HITL e OdontoGPT na mesma superfície de trabalho."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                live === 'live'
                  ? 'bg-success-soft text-success'
                  : live === 'paused'
                    ? 'bg-warning-soft text-warning'
                    : 'bg-surface-1 text-ink-tertiary'
              }`}
              title={version ? `versão ${version}` : 'sincronizando'}
            >
              <Radio size={10} className={live === 'live' ? 'animate-pulse' : ''} />
              {live === 'live' ? 'Ao vivo' : live === 'paused' ? 'Pausado' : '…'}
            </span>
            <div className="flex rounded-xl border border-border-subtle bg-surface-2 p-0.5 shadow-card">
              <button
                type="button"
                onClick={() => setView('kanban')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  view === 'kanban' ? 'bg-brand text-white' : 'text-ink-secondary hover:bg-surface-1'
                }`}
              >
                <LayoutGrid size={14} /> Kanban
              </button>
              <button
                type="button"
                onClick={() => setView('lista')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  view === 'lista' ? 'bg-brand text-white' : 'text-ink-secondary hover:bg-surface-1'
                }`}
              >
                <List size={14} /> Atendimento
              </button>
            </div>
          </div>
        }
      />

      {error && <ErrorState message={error.message} />}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Ativas', value: metrics.total, tone: 'text-ink' },
          {
            label: 'Aguardando',
            value: metrics.aguardando_resposta,
            tone: metrics.aguardando_resposta ? 'text-danger' : 'text-ink',
          },
          {
            label: 'SLA crítico',
            value: metrics.sla_critico,
            tone: metrics.sla_critico ? 'text-danger' : 'text-ink',
          },
          { label: 'Humano', value: metrics.em_humano, tone: 'text-warning' },
          { label: 'Prioridade alta', value: metrics.prioridade_alta, tone: 'text-danger' },
          {
            label: 'Rascunhos HITL',
            value: metrics.com_rascunho,
            tone: metrics.com_rascunho ? 'text-accent-deep' : 'text-ink',
          },
        ].map(m => (
          <div
            key={m.label}
            className="rounded-2xl border border-border-subtle bg-surface-2 px-3 py-2.5 shadow-card"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">{m.label}</p>
            <p className={`mt-0.5 font-display text-xl font-semibold tabular-nums ${m.tone}`}>
              {listaComTick === null ? '—' : m.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
          />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar nome, telefone, mensagem, nota ou tag…"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter size={14} className="text-ink-tertiary" aria-hidden />
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'aguardando', label: 'Aguardando' },
            { id: 'sla', label: 'SLA' },
            { id: 'humano', label: 'Humano' },
            { id: 'alta', label: 'Alta' },
            { id: 'rascunho', label: 'HITL' },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                filtro === f.id
                  ? 'bg-accent-soft text-accent-deep'
                  : 'bg-surface-1 text-ink-secondary hover:bg-surface-warm'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {listaComTick === null && !error && <Loading label="Carregando funil de conversas" />}

      {listaComTick && view === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map(col => {
            const cards = byStage[col.id] || []
            const over = dragOverStage === col.id
            return (
              <section
                key={col.id}
                onDragOver={e => onDragOver(e, col.id)}
                onDragLeave={() => onDragLeave(col.id)}
                onDrop={e => onDrop(e, col.id)}
                className={`flex w-[min(280px,85vw)] shrink-0 flex-col rounded-2xl border bg-surface-1/80 shadow-card transition ${
                  over ? 'border-accent bg-accent-soft/40 ring-2 ring-accent/20' : 'border-border-subtle'
                }`}
                style={{ maxHeight: 'min(68vh, 720px)' }}
              >
                <header className="sticky top-0 z-[1] border-b border-border-subtle bg-surface-1/95 px-3 py-2.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-sm font-semibold text-ink">{col.label}</h2>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold tabular-nums text-ink-secondary">
                      {cards.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-snug text-ink-tertiary">{col.hint}</p>
                </header>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {cards.length === 0 && (
                    <p className="px-2 py-6 text-center text-[11px] text-ink-tertiary">
                      Arraste conversas para cá
                    </p>
                  )}
                  {cards.map(c => (
                    <CrmCard
                      key={c.telefone}
                      c={c}
                      active={sel === c.telefone}
                      onOpen={selectConversa}
                      onDragStart={onDragStart}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {listaComTick && view === 'lista' && (
        <div className="grid h-[min(72vh,720px)] grid-cols-1 gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
          <aside className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-2 shadow-card">
            <div className="border-b border-border-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
              Conversas ({filtradas.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtradas.length === 0 && (
                <div className="p-4">
                  <EmptyState
                    icon={MessageSquare}
                    title="Nenhuma conversa"
                    description="Ajuste filtros ou aguarde novas mensagens do WhatsApp."
                  />
                </div>
              )}
              {filtradas.map(c => (
                <button
                  key={c.telefone}
                  type="button"
                  onClick={() => selectConversa(c)}
                  className={`w-full border-b border-border-subtle px-4 py-3 text-left transition-colors hover:bg-surface-1 ${
                    sel === c.telefone ? 'bg-accent-soft/50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{displayName(c)}</span>
                    {c.sla_status === 'critico' ? (
                      <span className="flex-shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-bold text-danger">
                        SLA
                      </span>
                    ) : c.modo === 'human' ? (
                      <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        Humano
                      </span>
                    ) : (
                      <span className="flex-shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-deep">
                        Bot
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-secondary">
                    {stages.find(s => s.id === c.stage)?.label || c.stage}
                    {c.aguardando_resposta ? ` · espera ${formatWait(c.minutos_espera)}` : ''}
                  </p>
                  <p className="mt-1 text-[10px] text-ink-tertiary">{formatTime(c.ultima_em)}</p>
                </button>
              ))}
            </div>
          </aside>
          <ChatPaneCRM {...chatProps} />
        </div>
      )}

      {view === 'kanban' && sel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            aria-label="Fechar painel"
            onClick={() => setSel(null)}
          />
          <div className="relative flex h-full w-full max-w-2xl flex-col border-l border-border-subtle bg-surface shadow-elev">
            <ChatPaneCRM {...chatProps} onClose={() => setSel(null)} fill />
          </div>
        </div>
      )}

      {listaComTick?.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={MessageSquare}
            title="Funil vazio"
            description="Mensagens do WhatsApp aparecem aqui após o bridge registrar interações com pacientes."
          />
        </div>
      )}
    </div>
  )
}

