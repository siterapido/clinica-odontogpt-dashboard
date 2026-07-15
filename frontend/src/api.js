const API = '/api'
const TOKEN_KEY = 'odontogpt_dash_token'

export function getToken()    { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t)   { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken()  { localStorage.removeItem(TOKEN_KEY) }

async function fetchJSON(url) {
  const token = getToken()
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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
export function getLembretes(params)    { return fetchJSON(`${API}/lembretes?` + new URLSearchParams(params)) }
export function getHealth()             { return fetchJSON(`${API}/health`) }

// formata data local YYYY-MM-DD (timezone-safe p/ inputs HTML)
export function todayISO() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
