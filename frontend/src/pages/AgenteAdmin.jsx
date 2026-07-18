import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X, Target, ListTodo, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getAgentMensagens,
  enviarAgentChatStream,
  getAgentBriefing,
  uploadAgentFile,
  getAgentPreferencias,
  salvarAgentPreferencias,
  getAgentEntregas,
  getRotinasCatalogo,
  getTarefas,
  createTarefa,
  createTarefaFromRotina,
  updateTarefa,
  deleteTarefa,
  getRotinasProgramadas,
  saveRotinaProgramada,
  deleteRotinaProgramada,
  runRotina,
} from '../api'
import Observatorio, { buildMissionActions, buildChatSuggestions, isCasualMessage } from '../components/agente/Observatorio'
import ChatWorkspace from '../components/agente/ChatWorkspace'
import ConfigAgenteModal from '../components/agente/ConfigAgenteModal'
import EntregasSheet from '../components/agente/EntregasSheet'
import EntregaPreviewModal from '../components/agente/EntregaPreviewModal'
import TarefasClinica from '../components/agente/TarefasClinica'
import RotinasPanel from '../components/agente/RotinasPanel'
import { buildWorkSteps, missionStatusLabel, pensamentoPreview } from '../components/agente/workSteps'
import { Button } from '@/components/ui/button'

const OPERADOR_KEY = 'odontogpt_admin_operador'
const SIDE_PANEL_KEY = 'odontogpt_agent_side_panel'
const SIDE_TAB_KEY = 'odontogpt_agent_side_tab'
const VOICE_KEY = 'odontogpt_agent_voice'

const DEFAULT_PREFS = {
  nome_agente: 'OdontoGPT',
  tom: 'acolhedor',
  habilidades: {
    agenda: true,
    reativacao: true,
    imagens: true,
    relatorios: true,
    apresentacoes: true,
    alertas: true,
  },
}

function normalizeOperador(value) {
  return (value || 'Gerente').trim() || 'Gerente'
}

function isImageAnexo(f) {
  const mime = String(f?.mime || f?.content_type || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  const name = String(f?.localName || f?.filename || '')
  return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(name)
}

function stripForSpeech(text) {
  return String(text || '')
    .replace(/:::[\s\S]*?:::/g, ' ')
    .replace(/[#*_`>]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)
}

/**
 * Cockpit AG-UI:
 * - Hoje = missão (estado + ordens)
 * - Fila = tarefas de acompanhamento
 * - Rotinas = playbooks (rodar / enfileirar / lembrete no painel)
 */
export default function AgenteAdmin() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [msgs, setMsgs] = useState([])
  const [lastId, setLastId] = useState(0)
  const [error, setError] = useState(null)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [operador, setOperador] = useState(() =>
    normalizeOperador(localStorage.getItem(OPERADOR_KEY))
  )
  const [operadorDraft, setOperadorDraft] = useState(() =>
    normalizeOperador(localStorage.getItem(OPERADOR_KEY))
  )
  const [loading, setLoading] = useState(true)
  const [briefing, setBriefing] = useState(null)
  const [quickPrompts, setQuickPrompts] = useState([])
  const [briefUpdatedAt, setBriefUpdatedAt] = useState(null)
  const [pendingFiles, setPendingFiles] = useState([])
  const [listening, setListening] = useState(false)
  const [prefs, setPrefs] = useState(DEFAULT_PREFS)
  const [prefsDraft, setPrefsDraft] = useState(DEFAULT_PREFS)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [entregas, setEntregas] = useState([])
  const [drawer, setDrawer] = useState(null) // null | 'hoje' | 'fila' | 'rotinas'
  const [configOpen, setConfigOpen] = useState(false)
  const [entregasOpen, setEntregasOpen] = useState(false)
  const [openEntrega, setOpenEntrega] = useState(null)
  const [statusHint, setStatusHint] = useState(null)
  const [workSteps, setWorkSteps] = useState([])
  const [stepTick, setStepTick] = useState(0)
  const [sidePanelOpen, setSidePanelOpen] = useState(
    () => localStorage.getItem(SIDE_PANEL_KEY) !== '0'
  )
  const [sideTab, setSideTab] = useState(() => {
    const t = localStorage.getItem(SIDE_TAB_KEY)
    return t === 'fila' || t === 'rotinas' ? t : 'hoje'
  })
  const [tarefas, setTarefas] = useState([])
  const [tarefasLoading, setTarefasLoading] = useState(false)
  const [catalogo, setCatalogo] = useState([])
  const [programadas, setProgramadas] = useState([])
  const [devidas, setDevidas] = useState([])
  const [savingRotinaId, setSavingRotinaId] = useState(null)
  const [voiceMode, setVoiceMode] = useState(() => localStorage.getItem(VOICE_KEY) === '1')
  const [speaking, setSpeaking] = useState(false)
  const [canRetry, setCanRetry] = useState(false)

  const fileRef = useRef(null)
  const recognitionRef = useRef(null)
  const lastIdRef = useRef(0)
  const voiceInterimRef = useRef('')
  const abortRef = useRef(null)
  const lastFailedSendRef = useRef(null)

  const opKey = useMemo(() => normalizeOperador(operador), [operador])

  const abertasCount = useMemo(
    () =>
      tarefas.filter(t => t.status === 'pendente' || t.status === 'em_andamento').length,
    [tarefas]
  )

  useEffect(() => {
    lastIdRef.current = lastId
  }, [lastId])

  useEffect(() => {
    localStorage.setItem(SIDE_PANEL_KEY, sidePanelOpen ? '1' : '0')
  }, [sidePanelOpen])

  useEffect(() => {
    localStorage.setItem(SIDE_TAB_KEY, sideTab)
  }, [sideTab])

  useEffect(() => {
    localStorage.setItem(VOICE_KEY, voiceMode ? '1' : '0')
  }, [voiceMode])

  useEffect(() => {
    if (!drawer && !configOpen && !entregasOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [drawer, configOpen, entregasOpen])

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

  useEffect(() => {
    try {
      const payload = {
        sending,
        listening,
        speaking,
        nome: prefs?.nome_agente || 'OdontoGPT',
        status: missionStatusLabel({
          sending,
          statusHint,
          listening,
          voiceMode,
        }),
        pensamento: pensamentoPreview(workSteps, stepTick),
        steps: workSteps,
        stepIndex: stepTick,
      }
      sessionStorage.setItem('odontogpt_agent_working', JSON.stringify(payload))
      window.dispatchEvent(new CustomEvent('odontogpt-agent-working', { detail: payload }))
    } catch {
      /* ignore */
    }
  }, [sending, listening, speaking, prefs, statusHint, voiceMode, workSteps, stepTick])

  const load = useCallback(
    (after = 0) => {
      return getAgentMensagens(opKey, { after_id: after, limit: 120 })
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
            const maxId = Math.max(...batch.map(m => m.id), after)
            setLastId(maxId)
            lastIdRef.current = maxId
          }
          return batch
        })
        .catch(setError)
        .finally(() => setLoading(false))
    },
    [opKey]
  )

  const refreshEntregas = useCallback(() => {
    return getAgentEntregas(opKey)
      .then(d => setEntregas(d.data || []))
      .catch(() => {})
  }, [opKey])

  const refreshTarefas = useCallback(() => {
    setTarefasLoading(true)
    return getTarefas(opKey)
      .then(d => setTarefas(d.data || []))
      .catch(() => {})
      .finally(() => setTarefasLoading(false))
  }, [opKey])

  const refreshRotinas = useCallback(() => {
    return Promise.all([
      getRotinasCatalogo()
        .then(d => setCatalogo(d.data || []))
        .catch(() => {}),
      getRotinasProgramadas(opKey)
        .then(d => {
          setProgramadas(d.data || [])
          setDevidas(d.devidas || [])
        })
        .catch(() => {}),
    ])
  }, [opKey])

  const refreshBriefing = useCallback((silent = false) => {
    return getAgentBriefing()
      .then(d => {
        setBriefing(d.briefing)
        setQuickPrompts(d.quick_prompts || [])
        setBriefUpdatedAt(new Date())
      })
      .catch(() => {
        if (!silent) {
          /* optional */
        }
      })
  }, [])

  useEffect(() => {
    setLoading(true)
    setMsgs([])
    setLastId(0)
    lastIdRef.current = 0
    load(0)
    getAgentPreferencias(opKey)
      .then(p => {
        setPrefs(p)
        setPrefsDraft(p)
        setOperadorDraft(normalizeOperador(p.operador || opKey))
      })
      .catch(() => {
        setPrefs(DEFAULT_PREFS)
        setPrefsDraft(DEFAULT_PREFS)
      })
    refreshEntregas()
    refreshBriefing()
    refreshTarefas()
    refreshRotinas()
  }, [load, opKey, refreshEntregas, refreshBriefing, refreshTarefas, refreshRotinas])

  useEffect(() => {
    const t = setInterval(() => {
      refreshBriefing(true)
      refreshRotinas()
    }, 60000)
    return () => clearInterval(t)
  }, [refreshBriefing, refreshRotinas])

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = e => {
      let finalChunk = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalChunk += t
        else interim += t
      }
      voiceInterimRef.current = interim
      if (finalChunk) {
        setTexto(prev => {
          const base = prev.replace(voiceInterimRef.current, '').trim()
          return (base ? `${base} ${finalChunk}` : finalChunk).trim()
        })
        voiceInterimRef.current = ''
      } else if (interim) {
        setTexto(prev => {
          const cleaned = prev.replace(/\s*…$/, '')
          return `${cleaned}${cleaned ? ' ' : ''}${interim}…`.trim()
        })
      }
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (openEntrega) setOpenEntrega(null)
      else if (configOpen) setConfigOpen(false)
      else if (entregasOpen) setEntregasOpen(false)
      else if (drawer) setDrawer(null)
      else if (speaking) stopSpeak()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer, openEntrega, configOpen, entregasOpen, speaking])

  function stopSpeak() {
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* ignore */
    }
    setSpeaking(false)
  }

  function speakText(text) {
    if (!voiceMode || !text) return
    if (!window.speechSynthesis) return
    stopSpeak()
    const u = new SpeechSynthesisUtterance(stripForSpeech(text))
    u.lang = 'pt-BR'
    u.rate = 1.02
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    const voices = window.speechSynthesis.getVoices?.() || []
    const pt = voices.find(v => /pt-BR|pt_BR|Portuguese/.test(v.lang + v.name))
    if (pt) u.voice = pt
    window.speechSynthesis.speak(u)
  }

  function toggleMic() {
    const rec = recognitionRef.current
    if (!rec) {
      setError(
        new Error(
          'Microfone por voz não está disponível neste navegador. Use Chrome ou Edge, ou digite sua mensagem.'
        )
      )
      return
    }
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      setError(null)
      setListening(true)
      try {
        rec.start()
      } catch {
        setListening(false)
      }
    }
  }

  function toggleVoiceMode() {
    setVoiceMode(v => {
      const next = !v
      if (!next) stopSpeak()
      return next
    })
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

  function cancelSend() {
    try {
      abortRef.current?.abort()
    } catch {
      /* ignore */
    }
  }

  async function retryLastSend() {
    const last = lastFailedSendRef.current
    if (!last || sending) return
    setError(null)
    if (last.files?.length) setPendingFiles(last.files)
    await sendMessage(last.text, { afterOk: last.afterOk, retrying: true })
  }

  async function sendMessage(textOverride, { afterOk, retrying = false } = {}) {
    if (sending) return
    const text = (textOverride ?? texto).trim().replace(/…$/g, '').trim()
    const filesSnapshot = retrying && lastFailedSendRef.current?.files
      ? lastFailedSendRef.current.files
      : [...pendingFiles]
    const ids = filesSnapshot.map(f => f.id)
    if (!text && !ids.length) return
    localStorage.setItem(OPERADOR_KEY, opKey)
    if (listening) recognitionRef.current?.stop()
    setListening(false)
    stopSpeak()

    const hadImages = filesSnapshot.some(isImageAnexo)
    const hadFiles = filesSnapshot.length > 0
    const aboutRelatorio = /relat[oó]rio|apresenta(ção|cao)?|pauta|checklist|briefing|entreg[aá]vel|executivo/i.test(
      text
    )
    const casual = isCasualMessage(text) && !hadFiles
    const incluirMetricas = !casual || aboutRelatorio
    if (hadImages) setStatusHint('Analisando o que você enviou…')
    else if (aboutRelatorio) setStatusHint('Montando a entrega com você…')
    else if (casual) setStatusHint('Preparando resposta…')
    else setStatusHint('Consultando o CRM e preparando a resposta…')

    setWorkSteps(buildWorkSteps({ text, hasImage: hadImages, hasFiles: hadFiles }))
    setSending(true)
    setError(null)

    // Mensagens otimistas: pedido do gestor + rascunho do agente com stream
    const tempUserId = `tmp-u-${Date.now()}`
    const tempAsstId = `tmp-a-${Date.now()}`
    const optimisticUser = {
      id: tempUserId,
      role: 'user',
      conteudo: text || '(anexos enviados)',
      created_at: new Date().toISOString(),
      meta: filesSnapshot.length
        ? { anexos: filesSnapshot.map(f => ({ filename: f.localName || f.filename })) }
        : null,
      _optimistic: true,
    }
    setMsgs(prev => [...prev, optimisticUser])
    if (!retrying) {
      setTexto('')
      setPendingFiles([])
    }

    const controller = new AbortController()
    abortRef.current = controller
    lastFailedSendRef.current = { text, files: filesSnapshot, afterOk }

    let streamStarted = false
    let tokenBuf = ''
    let rafId = null
    const flushTokens = () => {
      rafId = null
      if (!tokenBuf) return
      const piece = tokenBuf
      tokenBuf = ''
      if (!streamStarted) {
        streamStarted = true
        setStatusHint('Escrevendo a resposta…')
        setMsgs(prev => [
          ...prev.filter(m => m.id !== tempAsstId),
          {
            id: tempAsstId,
            role: 'assistant',
            conteudo: piece,
            created_at: new Date().toISOString(),
            meta: null,
            _streaming: true,
          },
        ])
      } else {
        setMsgs(prev =>
          prev.map(m =>
            m.id === tempAsstId ? { ...m, conteudo: (m.conteudo || '') + piece } : m
          )
        )
      }
    }
    try {
      const res = await enviarAgentChatStream(text, opKey, incluirMetricas, ids, {
        signal: controller.signal,
        onStatus: () => {
          setStatusHint('CRM lido · redigindo com você…')
          setWorkSteps(prev =>
            prev?.length
              ? prev
              : ['CRM consultado', 'Redigindo a resposta', 'Finalizando']
          )
          setStepTick(1)
        },
        onToken: chunk => {
          tokenBuf += chunk
          if (rafId == null) {
            rafId = requestAnimationFrame(flushTokens)
          }
        },
      })
      if (rafId != null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      flushTokens()
      lastFailedSendRef.current = null
      setCanRetry(false)
      // Congela o stream com parse final (entrega/ações) e reconcilia IDs no servidor
      if (res?.resposta) {
        setMsgs(prev =>
          prev.map(m => {
            if (m.id === tempAsstId) {
              return {
                id: res.message_id || tempAsstId,
                role: 'assistant',
                conteudo: res.resposta,
                created_at: m.created_at,
                meta: {
                  ...(res.entrega ? { entrega: res.entrega } : {}),
                  ...(res.acoes?.length ? { acoes: res.acoes } : {}),
                },
              }
            }
            return m
          })
        )
      }
      // load(0) troca temps/IDs pelos registros reais (sem duplicar)
      await load(0)
      await refreshEntregas()
      if (typeof afterOk === 'function') await afterOk(res)
      if (voiceMode && res?.resposta) {
        speakText(res.resposta)
      }
    } catch (ex) {
      setMsgs(prev => prev.filter(m => m.id !== tempUserId && m.id !== tempAsstId))
      // Devolve rascunho se cancelou ou falhou — o gestor não perde o texto
      if (!texto.trim()) setTexto(text)
      if (filesSnapshot.length) setPendingFiles(filesSnapshot)
      if (ex?.name === 'AbortError' || ex?.message === 'Pedido cancelado') {
        setCanRetry(false)
        lastFailedSendRef.current = null
        setError(new Error('Pedido cancelado. Ajuste o texto e envie de novo quando quiser.'))
      } else {
        setCanRetry(true)
        setError(
          ex?.message?.includes('Não consegui')
            ? ex
            : new Error('Não consegui responder agora. Use Tentar de novo ou envie outra mensagem.')
        )
      }
    } finally {
      abortRef.current = null
      setSending(false)
      setStatusHint(null)
      setWorkSteps([])
    }
  }

  async function savePrefs() {
    setSavingPrefs(true)
    setError(null)
    const nextOp = normalizeOperador(operadorDraft)
    try {
      const saved = await salvarAgentPreferencias({
        operador: nextOp,
        nome_agente: prefsDraft?.nome_agente || DEFAULT_PREFS.nome_agente,
        tom: prefsDraft?.tom || DEFAULT_PREFS.tom,
        habilidades: prefsDraft?.habilidades || DEFAULT_PREFS.habilidades,
      })
      setOperador(nextOp)
      localStorage.setItem(OPERADOR_KEY, nextOp)
      setPrefs(saved)
      setPrefsDraft(saved)
    } catch {
      setError(new Error('Não salvei as preferências.'))
    } finally {
      setSavingPrefs(false)
    }
  }

  function handlePedirAjuste(entrega) {
    if (sending) return
    const titulo = entrega?.titulo || 'sem título'
    const tipo = entrega?.tipo || 'relatorio_executivo'
    const bib = entrega?.biblioteca_id ? ` (biblioteca #${entrega.biblioteca_id})` : ''
    sendMessage(
      `Vamos atualizar o entregável "${titulo}"${bib}. Refine com a identidade e o tom da clínica e gere nova versão com :::entrega tipo="${tipo}" titulo="...".`
    )
  }

  // Deep-link: /agente?atualizar=ID&pedido=... | /agente?prompt=... (ex.: vindo de /memoria)
  useEffect(() => {
    const pedido = searchParams.get('pedido')
    const atualizar = searchParams.get('atualizar')
    const promptQ = searchParams.get('prompt')
    let pending = null
    try {
      pending = sessionStorage.getItem('odontogpt_agent_pending_prompt')
      if (pending) sessionStorage.removeItem('odontogpt_agent_pending_prompt')
    } catch {
      /* ignore */
    }
    if (!pedido && !atualizar && !promptQ && !pending) return
    if (pedido) {
      try {
        setTexto(decodeURIComponent(pedido))
      } catch {
        setTexto(pedido)
      }
    } else if (promptQ || pending) {
      const raw = promptQ || pending
      try {
        setTexto(promptQ ? decodeURIComponent(raw) : raw)
      } catch {
        setTexto(raw)
      }
    } else if (atualizar) {
      setTexto(
        `Vamos atualizar o entregável da biblioteca #${atualizar}. Use a identidade da clínica e gere nova versão com :::entrega.`
      )
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  async function handleCreateTarefa({ titulo, runNow }) {
    const created = await createTarefa({
      operador: opKey,
      titulo,
      prompt: `Execute a tarefa da clínica: ${titulo}`,
    })
    await refreshTarefas()
    if (runNow && created?.id) {
      await handleRunTarefa(created)
    }
  }

  async function handleUpdateTarefaStatus(id, status) {
    await updateTarefa(id, { status })
    await refreshTarefas()
  }

  async function handleDeleteTarefa(id) {
    await deleteTarefa(id)
    await refreshTarefas()
  }

  async function handleRunTarefa(t) {
    if (!t || sending) return
    const prompt =
      t.prompt ||
      `Execute a tarefa da clínica: ${t.titulo}. Dê contexto operacional e 3 próximos passos.`
    if (t.id) {
      try {
        await updateTarefa(t.id, { status: 'em_andamento' })
        await refreshTarefas()
      } catch {
        /* ignore */
      }
    }
    await sendMessage(prompt, {
      afterOk: async () => {
        if (t.id) {
          try {
            await updateTarefa(t.id, { status: 'feito' })
            await refreshTarefas()
          } catch {
            /* ignore */
          }
        }
      },
    })
  }

  async function handleRunRotina(r) {
    if (sending) return
    const rotinaId = r.id || r.rotina_id
    try {
      const res = await runRotina(rotinaId, opKey)
      await refreshRotinas()
      const prompt = res?.prompt || r.prompt
      if (prompt) await sendMessage(prompt)
    } catch (ex) {
      if (r.prompt) await sendMessage(r.prompt)
      else setError(ex)
    }
  }

  async function handleEnqueueRotina(r) {
    try {
      await createTarefaFromRotina(opKey, r.id || r.rotina_id)
      await refreshTarefas()
      setSideTab('fila')
    } catch (ex) {
      setError(ex)
    }
  }

  async function handleSchedule(rotina_id, opts) {
    setSavingRotinaId(rotina_id)
    try {
      await saveRotinaProgramada({
        operador: opKey,
        rotina_id,
        ...opts,
      })
      await refreshRotinas()
    } catch (ex) {
      setError(ex)
    } finally {
      setSavingRotinaId(null)
    }
  }

  async function handleUnschedule(rotina_id) {
    setSavingRotinaId(rotina_id)
    try {
      await deleteRotinaProgramada(rotina_id, opKey)
      await refreshRotinas()
    } catch (ex) {
      setError(ex)
    } finally {
      setSavingRotinaId(null)
    }
  }

  const statusText = missionStatusLabel({
    sending,
    statusHint,
    listening,
    voiceMode,
  })

  const nomeAgente = prefs?.nome_agente || prefsDraft?.nome_agente || 'OdontoGPT'

  const chatSuggestions = useMemo(() => {
    return buildChatSuggestions(briefing, quickPrompts, abertasCount)
  }, [briefing, quickPrompts, abertasCount])

  const emptySuggestions = useMemo(() => chatSuggestions.slice(0, 4), [chatSuggestions])

  const tabs = [
    { id: 'hoje', label: 'Hoje', icon: Target, badge: devidas.length || null },
    {
      id: 'fila',
      label: 'Fila',
      icon: ListTodo,
      badge: abertasCount || null,
    },
    {
      id: 'rotinas',
      label: 'Rotinas',
      icon: Sparkles,
      badge: devidas.length || null,
    },
  ]

  function renderSideContent(mode = 'desktop') {
    const active = mode === 'mobile' ? drawer || sideTab : sideTab
    const prompt = p => {
      if (mode === 'mobile') setDrawer(null)
      sendMessage(p)
    }
    if (active === 'fila') {
      return (
        <TarefasClinica
          tarefas={tarefas}
          loading={tarefasLoading}
          sending={sending}
          onCreate={handleCreateTarefa}
          onUpdateStatus={handleUpdateTarefaStatus}
          onDelete={handleDeleteTarefa}
          onRun={async t => {
            if (mode === 'mobile') setDrawer(null)
            await handleRunTarefa(t)
          }}
        />
      )
    }
    if (active === 'rotinas') {
      return (
        <RotinasPanel
          catalogo={catalogo}
          programadas={programadas}
          devidas={devidas}
          sending={sending}
          savingId={savingRotinaId}
          onRun={async r => {
            if (mode === 'mobile') setDrawer(null)
            await handleRunRotina(r)
          }}
          onEnqueue={async r => {
            await handleEnqueueRotina(r)
            if (mode === 'mobile') setDrawer('fila')
          }}
          onSchedule={handleSchedule}
          onUnschedule={handleUnschedule}
        />
      )
    }
    return (
      <Observatorio
        briefing={briefing}
        quickPrompts={quickPrompts}
        onPrompt={prompt}
        sending={sending}
        updatedAt={briefUpdatedAt}
        devidas={devidas}
        abertasCount={abertasCount}
        onOpenFila={() => {
          setSideTab('fila')
          if (mode === 'mobile') setDrawer('fila')
        }}
        onOpenRotinas={() => {
          setSideTab('rotinas')
          if (mode === 'mobile') setDrawer('rotinas')
        }}
        onRunDue={async d => {
          if (mode === 'mobile') setDrawer(null)
          await handleRunRotina(d)
        }}
      />
    )
  }

  const sidePanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 gap-1 rounded-xl bg-surface-1 p-1">
        {tabs.map(tab => {
          const Icon = tab.icon
          const active = sideTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSideTab(tab.id)}
              className={`relative flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                active
                  ? 'bg-surface-2 text-ink shadow-sm'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              <Icon size={12} />
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span
                  className={`ml-0.5 min-w-[1rem] rounded-full px-1 text-[9px] font-bold ${
                    tab.id === 'hoje' || tab.id === 'rotinas'
                      ? 'bg-warning/30 text-ink'
                      : 'bg-accent/20 text-accent-deep'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{renderSideContent('desktop')}</div>
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-0 lg:min-h-[640px]">
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
        <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto pb-0.5 lg:hidden">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <Button
                key={tab.id}
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1"
                onClick={() => {
                  setSideTab(tab.id)
                  setDrawer(tab.id)
                }}
              >
                <Icon size={14} />
                {tab.label}
                {tab.badge != null && tab.badge > 0 ? ` (${tab.badge})` : ''}
              </Button>
            )
          })}
        </div>

        {sidePanelOpen ? (
          <div className="relative hidden min-h-0 shrink-0 lg:flex">
            <aside className="flex w-80 min-h-0 flex-col overflow-hidden xl:w-[22rem]">
              {sidePanel}
            </aside>
            {/* Trilho na borda — não compete com abas nem com o header do chat */}
            <button
              type="button"
              onClick={() => setSidePanelOpen(false)}
              className="group absolute -right-3 top-1/2 z-10 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border-subtle bg-surface-2 text-ink-tertiary shadow-card transition hover:border-accent/40 hover:text-accent-deep"
              title="Recolher painel"
              aria-label="Recolher painel da missão"
            >
              <ChevronLeft size={14} className="transition group-hover:-translate-x-px" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSidePanelOpen(true)}
            className="hidden shrink-0 flex-col items-center justify-center gap-2 self-stretch rounded-2xl border border-border-subtle bg-surface-2 px-1.5 py-4 text-ink-tertiary shadow-card transition hover:border-accent/40 hover:bg-accent-soft/50 hover:text-accent-deep lg:flex"
            title="Mostrar missão, fila e rotinas"
            aria-label="Expandir painel da missão"
          >
            <ChevronRight size={14} />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Missão
            </span>
            {(devidas.length > 0 || abertasCount > 0) && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
                {devidas.length + abertasCount > 9 ? '9+' : devidas.length + abertasCount}
              </span>
            )}
          </button>
        )}

        <section className="flex min-h-0 flex-1 flex-col">
          <ChatWorkspace
            nomeAgente={nomeAgente}
            msgs={msgs}
            loading={loading}
            sending={sending}
            error={error}
            texto={texto}
            setTexto={setTexto}
            pendingFiles={pendingFiles}
            onPickFiles={onPickFiles}
            onRemoveFile={f => setPendingFiles(p => p.filter(x => x.id !== f.id))}
            fileRef={fileRef}
            listening={listening}
            onToggleMic={toggleMic}
            onSend={() => sendMessage()}
            onCancelSend={cancelSend}
            onRetry={canRetry ? retryLastSend : null}
            statusText={statusText}
            workSteps={workSteps}
            emptySuggestions={emptySuggestions}
            inputSuggestions={chatSuggestions}
            onSuggestion={prompt => sendMessage(prompt)}
            onOpenEntrega={setOpenEntrega}
            onPedirAjuste={handlePedirAjuste}
            onOpenConfig={() => setConfigOpen(true)}
            onOpenEntregas={() => setEntregasOpen(true)}
            entregasCount={entregas.length}
            voiceMode={voiceMode}
            onToggleVoiceMode={toggleVoiceMode}
            speaking={speaking}
            onStopSpeak={stopSpeak}
          />
        </section>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
            aria-label="Fechar painel"
            onClick={() => setDrawer(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="absolute top-0 bottom-0 left-0 flex w-[min(100%,22rem)] flex-col overflow-y-auto bg-surface p-4 shadow-elev"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-sm font-semibold text-ink">
                {drawer === 'hoje' && 'Hoje na clínica'}
                {drawer === 'fila' && 'Fila de trabalho'}
                {drawer === 'rotinas' && 'Rotinas prontas'}
              </p>
              <button
                type="button"
                onClick={() => setDrawer(null)}
                className="rounded-lg p-1.5 text-ink-secondary hover:bg-surface-1"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mb-3 flex gap-1 rounded-xl bg-surface-1 p-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSideTab(tab.id)
                    setDrawer(tab.id)
                  }}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
                    drawer === tab.id
                      ? 'bg-surface-2 text-ink shadow-sm'
                      : 'text-ink-secondary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {renderSideContent('mobile')}
          </div>
        </div>
      )}

      <ConfigAgenteModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        value={prefsDraft}
        onChange={setPrefsDraft}
        onSave={savePrefs}
        saving={savingPrefs}
        operador={operadorDraft}
        onOperadorChange={setOperadorDraft}
      />

      <EntregasSheet
        open={entregasOpen}
        onClose={() => setEntregasOpen(false)}
        entregas={entregas}
        onOpen={setOpenEntrega}
        onPedirAjuste={handlePedirAjuste}
        sending={sending}
      />

      <EntregaPreviewModal
        open={!!openEntrega}
        entrega={openEntrega}
        onClose={() => setOpenEntrega(null)}
        onPedirAjuste={handlePedirAjuste}
        ajusteDisabled={sending}
      />
    </div>
  )
}
