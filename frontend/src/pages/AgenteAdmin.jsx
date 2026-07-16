import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Target } from 'lucide-react'
import {
  getAgentMensagens,
  enviarAgentChat,
  getAgentBriefing,
  uploadAgentFile,
  getAgentPreferencias,
  salvarAgentPreferencias,
  getAgentEntregas,
} from '../api'
import Observatorio from '../components/agente/Observatorio'
import ChatWorkspace from '../components/agente/ChatWorkspace'
import ConfigAgenteModal from '../components/agente/ConfigAgenteModal'
import EntregasSheet from '../components/agente/EntregasSheet'
import { buildWorkSteps, missionStatusLabel } from '../components/agente/workSteps'
import { Button } from '@/components/ui/button'

const OPERADOR_KEY = 'odontogpt_admin_operador'

const DEFAULT_PREFS = {
  nome_agente: 'OdontoGPT',
  tom: 'acolhedor',
  habilidades: {
    agenda: true,
    financeiro: true,
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

/**
 * Console do Agente Autônomo — princípios AG-UI (timeline, estado, steps).
 * Identidade e habilidades ficam em Config (⚙), fora do caminho crítico.
 */
export default function AgenteAdmin() {
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
  const [drawer, setDrawer] = useState(null) // null | 'mission'
  const [configOpen, setConfigOpen] = useState(false)
  const [entregasOpen, setEntregasOpen] = useState(false)
  const [openEntrega, setOpenEntrega] = useState(null)
  const [statusHint, setStatusHint] = useState(null)
  const [workSteps, setWorkSteps] = useState([])

  const fileRef = useRef(null)
  const recognitionRef = useRef(null)
  const lastIdRef = useRef(0)

  const opKey = useMemo(() => normalizeOperador(operador), [operador])

  useEffect(() => {
    lastIdRef.current = lastId
  }, [lastId])

  useEffect(() => {
    if (!drawer && !configOpen && !entregasOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [drawer, configOpen, entregasOpen])

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

  const refreshBriefing = useCallback((silent = false) => {
    return getAgentBriefing()
      .then(d => {
        setBriefing(d.briefing)
        setQuickPrompts(d.quick_prompts || [])
        setBriefUpdatedAt(new Date())
      })
      .catch(() => {
        if (!silent) {
          /* briefing optional for console */
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
  }, [load, opKey, refreshEntregas, refreshBriefing])

  useEffect(() => {
    const t = setInterval(() => refreshBriefing(true), 60000)
    return () => clearInterval(t)
  }, [refreshBriefing])

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

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (openEntrega) setOpenEntrega(null)
      else if (configOpen) setConfigOpen(false)
      else if (entregasOpen) setEntregasOpen(false)
      else if (drawer) setDrawer(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer, openEntrega, configOpen, entregasOpen])

  function toggleMic() {
    const rec = recognitionRef.current
    if (!rec) {
      setError(
        new Error(
          'Microfone por voz não está disponível neste navegador. Use Chrome ou Edge, ou digite a ordem.'
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
    if (sending) return
    const text = (textOverride ?? texto).trim()
    const ids = pendingFiles.map(f => f.id)
    if (!text && !ids.length) return
    localStorage.setItem(OPERADOR_KEY, opKey)
    if (listening) recognitionRef.current?.stop()
    setListening(false)

    const hadImages = pendingFiles.some(isImageAnexo)
    const hadFiles = pendingFiles.length > 0
    const aboutRelatorio = /relat[oó]rio|apresenta(ção|cao)?|pauta/i.test(text)
    if (hadImages) setStatusHint('Analisando o que você enviou…')
    else if (aboutRelatorio) setStatusHint('Montando entrega…')
    else setStatusHint('Trabalhando na sua ordem…')

    setWorkSteps(
      buildWorkSteps({ text, hasImage: hadImages, hasFiles: hadFiles })
    )
    setSending(true)
    setError(null)
    try {
      await enviarAgentChat(text, opKey, true, ids)
      setTexto('')
      setPendingFiles([])
      await load(lastIdRef.current)
      await refreshEntregas()
    } catch (ex) {
      setError(
        ex?.message?.includes('Não consegui')
          ? ex
          : new Error('Não consegui responder agora. Tente de novo em instantes.')
      )
    } finally {
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
    sendMessage(
      `Ajuste a entrega "${titulo}": refine o conteúdo, melhore clareza e mantenha o formato de entrega formal.`
    )
  }

  const statusText = missionStatusLabel({
    sending,
    statusHint,
    listening,
  })

  const nomeAgente = prefs?.nome_agente || prefsDraft?.nome_agente || 'OdontoGPT'

  const emptySuggestions = useMemo(() => {
    const fromApi = (quickPrompts || []).slice(0, 2).map(q => ({
      label: q.label,
      prompt: q.prompt,
    }))
    return [
      ...fromApi,
      {
        label: 'Relatório do dia',
        prompt:
          'Prepare um relatório executivo do dia da clínica com agenda, riscos e 3 ações. Use o formato de entrega formal se possível.',
      },
    ].slice(0, 4)
  }, [quickPrompts])

  return (
    <div className="flex h-full min-h-[640px] flex-col gap-3 lg:flex-row lg:gap-4">
      {/* Mobile: missão */}
      <div className="flex shrink-0 gap-2 lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => setDrawer('mission')}
        >
          <Target size={14} />
          Missão do dia
        </Button>
      </div>

      {/* Left: Mission panel */}
      <aside className="hidden shrink-0 overflow-y-auto lg:flex lg:w-72 lg:flex-col xl:w-80">
        <Observatorio
          briefing={briefing}
          quickPrompts={quickPrompts}
          onPrompt={sendMessage}
          sending={sending}
          updatedAt={briefUpdatedAt}
        />
      </aside>

      {/* Center: work timeline */}
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
          statusText={statusText}
          workSteps={workSteps}
          emptySuggestions={emptySuggestions}
          onSuggestion={prompt => sendMessage(prompt)}
          onOpenEntrega={setOpenEntrega}
          onPedirAjuste={handlePedirAjuste}
          onOpenConfig={() => setConfigOpen(true)}
          onOpenEntregas={() => setEntregasOpen(true)}
          entregasCount={entregas.length}
        />
      </section>

      {/* Mobile mission drawer */}
      {drawer === 'mission' && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
            aria-label="Fechar missão"
            onClick={() => setDrawer(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Missão do dia"
            className="absolute top-0 bottom-0 left-0 flex w-[min(100%,22rem)] flex-col overflow-y-auto bg-surface p-4 shadow-elev"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-sm font-semibold text-ink">Missão do dia</p>
              <button
                type="button"
                onClick={() => setDrawer(null)}
                className="rounded-lg p-1.5 text-ink-secondary hover:bg-surface-1"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <Observatorio
              briefing={briefing}
              quickPrompts={quickPrompts}
              onPrompt={p => {
                setDrawer(null)
                sendMessage(p)
              }}
              sending={sending}
              updatedAt={briefUpdatedAt}
            />
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

      {openEntrega && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            aria-label="Fechar entrega"
            onClick={() => setOpenEntrega(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={openEntrega.titulo || 'Entrega'}
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border-subtle bg-surface-2 p-5 shadow-elev"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-deep">
                  Artefato do agente
                </p>
                <h2 className="font-display text-lg font-semibold text-ink">
                  {openEntrega.titulo || 'Entrega'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpenEntrega(null)}
                className="rounded-lg p-1.5 text-ink-secondary hover:bg-surface-1"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
              {openEntrega.corpo_md || ''}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
