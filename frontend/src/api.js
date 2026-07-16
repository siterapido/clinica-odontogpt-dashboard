const API = '/api'
const TOKEN_KEY = 'odontogpt_dash_token'

export function getToken()    { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t)   { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken()  { localStorage.removeItem(TOKEN_KEY) }

async function fetchJSON(url, options = {}) {
  const token = getToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
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

export async function login(password) {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Senha incorreta')
  }
  const { token } = await res.json()
  setToken(token)
  return token
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
export function getDentistas()          { return fetchJSON(`${API}/dentistas`) }
export function getPacientes(params)    { return fetchJSON(`${API}/pacientes?` + new URLSearchParams(params)) }
export function getPaciente(id)         { return fetchJSON(`${API}/pacientes/${id}`) }
export function getAgendamentos(params) { return fetchJSON(`${API}/agendamentos?` + new URLSearchParams(params)) }
export function getProntuarios(params)  { return fetchJSON(`${API}/prontuarios?` + new URLSearchParams(params)) }
export function getInteracoes(params)   { return fetchJSON(`${API}/interacoes?` + new URLSearchParams(params)) }

export function getChatConversas() {
  return fetchJSON(`${API}/chat/conversas`)
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

export function getAgentMensagens(operador, params = {}) {
  const q = new URLSearchParams({ operador, ...params })
  return fetchJSON(`${API}/agent/mensagens?${q}`)
}

export function enviarAgentChat(mensagem, operador = 'Gerente', incluir_metricas = true, anexos_ids = []) {
  return fetchJSON(`${API}/agent/chat`, {
    method: 'POST',
    body: JSON.stringify({ mensagem, operador, incluir_metricas, modo_interativo: true, anexos_ids }),
  })
}

export function getAgentBriefing() {
  return fetchJSON(`${API}/agent/briefing`)
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

export function getLembretes(params)    { return fetchJSON(`${API}/lembretes?` + new URLSearchParams(params)) }
export function getHealth()             { return fetchJSON(`${API}/health`) }

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
