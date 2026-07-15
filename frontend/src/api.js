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
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `Erro ${res.status}`)
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

export function getMetricas()          { return fetchJSON(`${API}/metricas`) }
export function getPacientes(params)   { return fetchJSON(`${API}/pacientes?` + new URLSearchParams(params)) }
export function getPaciente(id)        { return fetchJSON(`${API}/pacientes/${id}`) }
export function getAgendamentos(params){ return fetchJSON(`${API}/agendamentos?` + new URLSearchParams(params)) }
export function getProntuarios(params) { return fetchJSON(`${API}/prontuarios?` + new URLSearchParams(params)) }
export function getHealth()            { return fetchJSON(`${API}/health`) }
