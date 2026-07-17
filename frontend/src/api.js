const API = '/api'
const TOKEN_KEY = 'odontogpt_dash_token'

export function getToken()    { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t)   { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken()  { localStorage.removeItem(TOKEN_KEY) }

async function fetchJSON(url, options = {}) {
  const token = getToken()
  let res
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    })
  } catch (err) {
    if (err?.name === 'AbortError') {
      const e = new Error('Pedido cancelado')
      e.name = 'AbortError'
      throw e
    }
    throw err
  }
  if (res.status === 401) {
    clearToken()
    window.location.reload()
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg = formatApiError(body, res.status, res.statusText)
    throw new Error(msg)
  }
  return res.json()
}

/**
 * Login Supabase (e-mail + senha).
 * Aceita também (password) legado só se a API ainda permitir.
 */
export async function login(emailOrPassword, passwordMaybe) {
  const body =
    typeof passwordMaybe === 'string'
      ? { email: emailOrPassword, password: passwordMaybe }
      : { password: emailOrPassword }

  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const detail = typeof err.detail === 'string' ? err.detail : 'Falha no login'
    throw new Error(detail)
  }
  const data = await res.json()
  setToken(data.token)
  if (data.refresh_token) {
    try {
      localStorage.setItem('odontogpt_dash_refresh', data.refresh_token)
    } catch {}
  }
  if (data.user) {
    try {
      localStorage.setItem('odontogpt_dash_user', JSON.stringify(data.user))
    } catch {}
  }
  return data.token
}

export function getMe() {
  return fetchJSON(`${API}/me`)
}

export async function logout() {
  const token = getToken()
  if (token) {
    try {
      await fetch(`${API}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch {}
  }
  clearToken()
}

function formatApiError(body, status, statusText) {
  if (!body) return `Erro ${status}${statusText ? ` (${statusText})` : ''}`
  // FastAPI 422: { detail: [{type, loc, msg, input}, ...] }
  if (Array.isArray(body.detail)) {
    return body.detail
      .map(e => {
        const where = Array.isArray(e?.loc) ? e.loc.filter(x => x !== 'body').join('.') : ''
        return where ? `${where}: ${e.msg || 'inválido'}` : (e.msg || 'inválido')
      })
      .join('; ') || `Erro ${status}`
  }
  // FastAPI 401/403/404: { detail: "string" }
  if (typeof body.detail === 'string') return body.detail
  // fallback genérico
  if (body.message) return body.message
  try { return JSON.stringify(body) } catch { return `Erro ${status}` }
}

export function getMetricas()           { return fetchJSON(`${API}/metricas`) }
/** Cockpit Visão Geral — shared state da operação agentica */
export function getDashboardCockpit() {
  return fetchJSON(`${API}/dashboard/cockpit`)
}
export function getDentistas()          { return fetchJSON(`${API}/dentistas`) }
export function getDentistasCompleto(params = {}) {
  const q = new URLSearchParams({ completo: 'true' })
  if (params.incluir_inativos) q.set('incluir_inativos', 'true')
  return fetchJSON(`${API}/dentistas?${q}`)
}
export function criarDentista(data) {
  return fetchJSON(`${API}/dentistas`, { method: 'POST', body: JSON.stringify(data) })
}
export function atualizarDentista(id, data) {
  return fetchJSON(`${API}/dentistas/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}
export function excluirDentista(id) {
  return fetchJSON(`${API}/dentistas/${id}`, { method: 'DELETE' })
}
export function getPacientes(params)    { return fetchJSON(`${API}/pacientes?` + new URLSearchParams(params)) }
export function getPaciente(id)         { return fetchJSON(`${API}/pacientes/${id}`) }
export function getAgendamentos(params) { return fetchJSON(`${API}/agendamentos?` + new URLSearchParams(params)) }
export function getProntuarios(params)  { return fetchJSON(`${API}/prontuarios?` + new URLSearchParams(params)) }
export function getInteracoes(params)   { return fetchJSON(`${API}/interacoes?` + new URLSearchParams(params)) }

export function getChatConversas(params = {}) {
  const q = new URLSearchParams()
  if (params.since) q.set('since', params.since)
  if (params.limit) q.set('limit', String(params.limit))
  const qs = q.toString()
  return fetchJSON(`${API}/chat/conversas${qs ? `?${qs}` : ''}`)
}
/** Long-poll: espera mudança no funil (até ~25s). */
export function pollChatConversasEvents(since, params = {}) {
  const q = new URLSearchParams({ since: since || '0' })
  if (params.timeout != null) q.set('timeout', String(params.timeout))
  if (params.limit) q.set('limit', String(params.limit))
  return fetchJSON(`${API}/chat/conversas/events?${q}`)
}
export function getChatCrmStages() {
  return fetchJSON(`${API}/chat/crm/stages`)
}
export function atualizarChatCrm(telefone, body) {
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/crm`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
export function salvarChatRascunho(telefone, mensagem, origem = 'humano') {
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/rascunho`, {
    method: 'POST',
    body: JSON.stringify({ mensagem, origem }),
  })
}
export function descartarChatRascunho(telefone) {
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/rascunho`, {
    method: 'DELETE',
  })
}
export function aprovarChatRascunho(telefone, body = {}) {
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/rascunho/aprovar`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
export function refreshChatPerfil(telefone, force = true) {
  const q = force ? '?force=true' : ''
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/perfil/refresh${q}`, {
    method: 'POST',
    body: '{}',
  })
}
export function getChatHistorico(telefone, limit = 40) {
  return fetchJSON(
    `${API}/chat/conversas/${encodeURIComponent(telefone)}/historico?limit=${limit}`
  )
}
export function createChatFollowup(telefone, body) {
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/followups`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
export function updateChatFollowup(id, status) {
  return fetchJSON(`${API}/chat/followups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}
export function getChatMensagens(telefone, params = {}) {
  const q = new URLSearchParams(params)
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/mensagens?${q}`)
}
export function assumirConversa(telefone, atendente) {
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/assumir`, {
    method: 'POST',
    body: JSON.stringify({ atendente }),
  })
}
export function devolverConversa(telefone) {
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/devolver`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
export function enviarChatMensagem(telefone, mensagem, atendente) {
  return fetchJSON(`${API}/chat/conversas/${encodeURIComponent(telefone)}/enviar`, {
    method: 'POST',
    body: JSON.stringify({ mensagem, atendente }),
  })
}

export function salvarMessageFeedback(interacaoId, body) {
  return fetchJSON(`${API}/chat/mensagens/${interacaoId}/feedback`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function reescreverMensagem(interacaoId, body = {}) {
  return fetchJSON(`${API}/chat/mensagens/${interacaoId}/reescrever`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Chat de teste: operador fala como se fosse o paciente; bot responde. */
export function simularMensagemCliente(mensagem) {
  return fetchJSON(`${API}/chat/teste/simular`, {
    method: 'POST',
    body: JSON.stringify({ mensagem }),
  })
}

export function limparChatTeste() {
  return fetchJSON(`${API}/chat/teste/limpar`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function getChatTesteInfo() {
  return fetchJSON(`${API}/chat/teste`)
}

export function getClinica() {
  return fetchJSON(`${API}/clinica`)
}

export function salvarClinica(data) {
  return fetchJSON(`${API}/clinica`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ─── Marca + biblioteca de entregáveis ─────────────────────────────
export function getClinicaMarca() {
  return fetchJSON(`${API}/clinica/marca`)
}
export function salvarClinicaMarca(data) {
  return fetchJSON(`${API}/clinica/marca`, { method: 'PUT', body: JSON.stringify(data) })
}
export async function uploadClinicaLogo(file) {
  const token = getToken()
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API}/clinica/marca/logo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  })
  if (res.status === 401) {
    clearToken()
    window.location.reload()
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail || res.statusText)
  }
  return res.json()
}
export async function fetchLogoBlobUrl() {
  const token = getToken()
  const res = await fetch(`${API}/clinica/marca/logo-file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return null
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
export function getEntregaveis(params = {}) {
  const q = new URLSearchParams(params)
  return fetchJSON(`${API}/entregaveis?${q}`)
}
export function getEntregavel(id) {
  return fetchJSON(`${API}/entregaveis/${id}`)
}
export function createEntregavel(body) {
  return fetchJSON(`${API}/entregaveis`, { method: 'POST', body: JSON.stringify(body) })
}
export function patchEntregavel(id, body) {
  return fetchJSON(`${API}/entregaveis/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export async function fetchEntregavelPreviewHtml(id) {
  const token = getToken()
  const res = await fetch(`${API}/entregaveis/${id}/preview`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Não abri o preview')
  return res.text()
}

/**
 * Preview branded: biblioteca por id, ou POST ad-hoc com corpo do chat.
 */
export async function fetchEntregaPreviewHtml(entrega) {
  if (!entrega) throw new Error('Entregável inválido')
  const token = getToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const libraryId =
    entrega.biblioteca_id ||
    (entrega.preview_url && entrega.id ? entrega.id : null) ||
    (entrega.thumb_url && entrega.id ? entrega.id : null)

  let res
  if (libraryId) {
    res = await fetch(`${API}/entregaveis/${libraryId}/preview`, { headers })
  } else {
    const corpo = entrega.corpo_md || entrega.corpo || ''
    if (!String(corpo).trim()) throw new Error('Entregável sem conteúdo para pré-visualizar')
    res = await fetch(`${API}/entregaveis/preview`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo: entrega.titulo || 'Entregável',
        corpo_md: corpo,
        tipo: entrega.tipo || 'relatorio_executivo',
        tipo_label: entrega.tipo_label || undefined,
        versao: entrega.versao || undefined,
        created_at: entrega.created_at || undefined,
      }),
    })
  }
  if (res.status === 401) {
    clearToken()
    window.location.reload()
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail || 'Não abri o preview')
  }
  return res.text()
}
export async function fetchEntregavelThumbUrl(id) {
  const token = getToken()
  const res = await fetch(`${API}/entregaveis/${id}/thumb`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return null
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

/**
 * Baixa entregável em PDF ou DOCX.
 * Preferência: biblioteca_id (GET). Fallback: corpo_md via POST ad-hoc.
 */
export async function downloadEntregavelFile(entrega, fmt = 'pdf') {
  const format = fmt === 'docx' ? 'docx' : 'pdf'
  const token = getToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const bibId = entrega?.biblioteca_id || (entrega?.origem === 'biblioteca' ? entrega?.id : null)
  // itens da biblioteca já vêm com id numérico e corpo_md
  const libraryId =
    bibId ||
    (entrega?.id && entrega?.preview_url ? entrega.id : null) ||
    (entrega?.id && entrega?.thumb_url ? entrega.id : null)

  let res
  if (libraryId) {
    res = await fetch(`${API}/entregaveis/${libraryId}/export?fmt=${format}`, { headers })
  } else {
    const corpo = entrega?.corpo_md || entrega?.corpo || ''
    if (!corpo.trim()) throw new Error('Entregável sem conteúdo para exportar')
    res = await fetch(`${API}/entregaveis/export`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo: entrega?.titulo || 'Entregável',
        corpo_md: corpo,
        tipo: entrega?.tipo || 'relatorio_executivo',
        fmt: format,
      }),
    })
  }
  if (res.status === 401) {
    clearToken()
    window.location.reload()
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail || `Falha ao gerar ${format.toUpperCase()}`)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  const match = /filename="?([^";]+)"?/i.exec(cd)
  const fallback = `${String(entrega?.titulo || 'entregavel')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 60)}.${format}`
  const filename = match?.[1] || fallback
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
  return filename
}

export function getAgentMensagens(operador, params = {}) {
  const q = new URLSearchParams({ operador, ...params })
  return fetchJSON(`${API}/agent/mensagens?${q}`)
}

export function enviarAgentChat(
  mensagem,
  operador = 'Gerente',
  incluir_metricas = true,
  anexos_ids = [],
  { signal } = {}
) {
  return fetchJSON(`${API}/agent/chat`, {
    method: 'POST',
    body: JSON.stringify({ mensagem, operador, incluir_metricas, modo_interativo: true, anexos_ids }),
    signal,
  })
}

/**
 * Chat com SSE (tokens em tempo real).
 * onToken(textChunk), onStatus({status}), onDone(result)
 * Fallback automático para POST não-stream se o endpoint falhar cedo.
 */
export async function enviarAgentChatStream(
  mensagem,
  operador = 'Gerente',
  incluir_metricas = true,
  anexos_ids = [],
  { signal, onToken, onStatus, onDone } = {}
) {
  const token = getToken()
  const res = await fetch(`${API}/agent/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ mensagem, operador, incluir_metricas, modo_interativo: true, anexos_ids }),
    signal,
  })
  if (res.status === 401) {
    clearToken()
    window.location.reload()
    throw new Error('Sessão expirada')
  }
  if (!res.ok || !res.body) {
    // fallback legado
    return enviarAgentChat(mensagem, operador, incluir_metricas, anexos_ids, { signal })
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult = null
  let streamError = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const block of parts) {
      const lines = block.split('\n')
      let event = 'message'
      let data = ''
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      let parsed
      try {
        parsed = JSON.parse(data)
      } catch {
        continue
      }
      if (event === 'token' && parsed.t) onToken?.(parsed.t)
      else if (event === 'status') onStatus?.(parsed)
      else if (event === 'done') {
        finalResult = parsed
        onDone?.(parsed)
      } else if (event === 'cancelled') {
        const e = new Error('Pedido cancelado')
        e.name = 'AbortError'
        streamError = e
      } else if (event === 'error') {
        streamError = new Error(parsed.detail || 'Não consegui responder agora.')
      }
    }
  }

  if (streamError) throw streamError
  if (finalResult) return finalResult
  // stream encerrou sem done — fallback
  return enviarAgentChat(mensagem, operador, incluir_metricas, anexos_ids, { signal })
}

export function getAgentBriefing() {
  return fetchJSON(`${API}/agent/briefing`)
}

// ─── Memória / Segundo cérebro ─────────────────────────────────────
export function getAgentMemoria() {
  return fetchJSON(`${API}/agent/memoria`)
}

export function seedAgentMemoria(force = false) {
  const q = force ? '?force=true' : ''
  return fetchJSON(`${API}/agent/memoria/seed${q}`, { method: 'POST' })
}

export function getAgentMemoriaDocs(limit = 50) {
  return fetchJSON(`${API}/agent/memoria/documentos?` + new URLSearchParams({ limit }))
}

export async function uploadMemoriaDoc(file, { titulo, tipo } = {}) {
  const token = getToken()
  const fd = new FormData()
  fd.append('file', file)
  if (titulo) fd.append('titulo', titulo)
  if (tipo) fd.append('tipo', tipo)
  const res = await fetch(`${API}/agent/memoria/documentos`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(formatApiError(body, res.status, res.statusText))
  }
  return res.json()
}

export function addMemoriaNota(body) {
  return fetchJSON(`${API}/agent/memoria/notas`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function deleteMemoriaDoc(id) {
  return fetchJSON(`${API}/agent/memoria/documentos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function uploadAgentFile(file) {
  const token = getToken()
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API}/agent/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(formatApiError(body, res.status, res.statusText))
  }
  return res.json()
}

export function getAgentPreferencias(operador = 'Gerente') {
  return fetchJSON(`${API}/agent/preferencias?` + new URLSearchParams({ operador }))
}

export function salvarAgentPreferencias(body) {
  return fetchJSON(`${API}/agent/preferencias`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function getAgentEntregas(operador = 'Gerente', params = {}) {
  return fetchJSON(`${API}/agent/entregas?` + new URLSearchParams({ operador, ...params }))
}

// ─── Tarefas da clínica + rotinas ──────────────────────────────────
export function getRotinasCatalogo() {
  return fetchJSON(`${API}/agent/rotinas/catalogo`)
}
export function getTarefas(operador = 'Gerente', params = {}) {
  return fetchJSON(`${API}/agent/tarefas?` + new URLSearchParams({ operador, ...params }))
}
export function createTarefa(body) {
  return fetchJSON(`${API}/agent/tarefas`, { method: 'POST', body: JSON.stringify(body) })
}
export function createTarefaFromRotina(operador, rotina_id) {
  return fetchJSON(`${API}/agent/tarefas/from-rotina`, {
    method: 'POST',
    body: JSON.stringify({ operador, rotina_id }),
  })
}
export function updateTarefa(id, body) {
  return fetchJSON(`${API}/agent/tarefas/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export function deleteTarefa(id) {
  return fetchJSON(`${API}/agent/tarefas/${id}`, { method: 'DELETE' })
}
export function getRotinasProgramadas(operador = 'Gerente') {
  return fetchJSON(`${API}/agent/rotinas/programadas?` + new URLSearchParams({ operador }))
}
export function saveRotinaProgramada(body) {
  return fetchJSON(`${API}/agent/rotinas/programadas`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}
export function deleteRotinaProgramada(rotina_id, operador = 'Gerente') {
  return fetchJSON(
    `${API}/agent/rotinas/programadas/${encodeURIComponent(rotina_id)}?` +
      new URLSearchParams({ operador }),
    { method: 'DELETE' }
  )
}
export function runRotina(rotina_id, operador = 'Gerente') {
  return fetchJSON(
    `${API}/agent/rotinas/programadas/${encodeURIComponent(rotina_id)}/run?` +
      new URLSearchParams({ operador }),
    { method: 'POST' }
  )
}

export function getLembretes(params)    { return fetchJSON(`${API}/lembretes?` + new URLSearchParams(params)) }
export function getHealth()             { return fetchJSON(`${API}/health`) }
export function getOperacao()           { return fetchJSON(`${API}/operacao`) }
export function getAgendaDisponibilidade(params = {}) {
  return fetchJSON(`${API}/agenda/disponibilidade?` + new URLSearchParams(params))
}

// ─── V2 ────────────────────────────────────────────────────────────
export function getV2Slots(params) {
  return fetchJSON(`${API}/v2/slots?` + new URLSearchParams(params))
}
export function agendamentoAcao(id, acao, motivo) {
  return fetchJSON(`${API}/v2/agendamentos/${id}/acao`, {
    method: 'POST', body: JSON.stringify({ acao, motivo }),
  })
}
export function getListaEspera(status = 'ativo') {
  return fetchJSON(`${API}/v2/lista-espera?status=${encodeURIComponent(status)}`)
}
export function addListaEspera(body) {
  return fetchJSON(`${API}/v2/lista-espera`, { method: 'POST', body: JSON.stringify(body) })
}
export function patchListaEspera(id, body) {
  return fetchJSON(`${API}/v2/lista-espera/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export function getProcedimentos(incluir_inativos = false) {
  return fetchJSON(`${API}/v2/procedimentos?incluir_inativos=${incluir_inativos}`)
}
export function saveProcedimento(body) {
  return fetchJSON(`${API}/v2/procedimentos`, { method: 'POST', body: JSON.stringify(body) })
}
export function getOrcamentos(params = {}) {
  return fetchJSON(`${API}/v2/orcamentos?` + new URLSearchParams(params))
}
export function getOrcamento(id) {
  return fetchJSON(`${API}/v2/orcamentos/${id}`)
}
export function createOrcamento(body) {
  return fetchJSON(`${API}/v2/orcamentos`, { method: 'POST', body: JSON.stringify(body) })
}
export function enviarOrcamento(id) {
  return fetchJSON(`${API}/v2/orcamentos/${id}/enviar`, { method: 'POST', body: '{}' })
}
export function statusOrcamento(id, status, motivo_recusa) {
  return fetchJSON(`${API}/v2/orcamentos/${id}/status`, {
    method: 'PATCH', body: JSON.stringify({ status, motivo_recusa }),
  })
}
export function getPipeline() {
  return fetchJSON(`${API}/v2/pipeline`)
}
export function getFinanceiroResumo(mes) {
  const q = mes ? `?mes=${encodeURIComponent(mes)}` : ''
  return fetchJSON(`${API}/v2/financeiro/resumo${q}`)
}
export function getCaixa(data) {
  const q = data ? `?data=${encodeURIComponent(data)}` : ''
  return fetchJSON(`${API}/v2/financeiro/caixa${q}`)
}
export function getPagamentos(params = {}) {
  return fetchJSON(`${API}/v2/pagamentos?` + new URLSearchParams(params))
}
export function createPagamento(body) {
  return fetchJSON(`${API}/v2/pagamentos`, { method: 'POST', body: JSON.stringify(body) })
}
export function getNps(dias = 90) {
  return fetchJSON(`${API}/v2/nps?dias=${dias}`)
}
export function createNps(body) {
  return fetchJSON(`${API}/v2/nps`, { method: 'POST', body: JSON.stringify(body) })
}
export function getPreconsultas(status) {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return fetchJSON(`${API}/v2/preconsultas${q}`)
}
export function getSecurityEvents(limit = 50) {
  return fetchJSON(`${API}/v2/security-events?limit=${limit}`)
}

export function createPaciente(body) {
  return fetchJSON(`${API}/pacientes`, { method: 'POST', body: JSON.stringify(body) })
}
export function updatePaciente(id, body) {
  return fetchJSON(`${API}/pacientes/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export function createAgendamento(body) {
  return fetchJSON(`${API}/agendamentos`, { method: 'POST', body: JSON.stringify(body) })
}
export function updateAgendamento(id, body) {
  return fetchJSON(`${API}/agendamentos/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}
export function createProntuario(body) {
  return fetchJSON(`${API}/prontuarios`, { method: 'POST', body: JSON.stringify(body) })
}
export function updateProntuario(id, body) {
  return fetchJSON(`${API}/prontuarios/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

// formata data local YYYY-MM-DD (timezone-safe p/ inputs HTML)
export function todayISO() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function getEstudantesMensagens(aluno, params = {}) {
  const q = new URLSearchParams({ aluno, ...params })
  return fetchJSON(`${API}/estudantes/mensagens?${q}`)
}

export function enviarEstudantesChat(mensagem, aluno = 'Estudante', anexos_ids = []) {
  return fetchJSON(`${API}/estudantes/chat`, { method: 'POST', body: JSON.stringify({ mensagem, aluno, anexos_ids }) })
}

export function analyzeVisionImage(imagem_data_url, contexto_clinico = '', operador = 'Estudante') {
  return fetchJSON(`${API}/vision/analyze`, { method: 'POST', body: JSON.stringify({ imagem_data_url, contexto_clinico, operador }) })
}
