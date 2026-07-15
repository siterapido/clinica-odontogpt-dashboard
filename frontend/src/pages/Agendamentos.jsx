import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutList } from 'lucide-react'
import { getAgendamentos, getDentistas, todayISO } from '../api'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import Loading from '../components/Loading'
import { Card } from '@/components/ui/card'

function startOfWeek(d) {
  const x = new Date(d)
  const day = x.getDay() // 0=Dom
  const diff = day === 0 ? -6 : 1 - day // segunda como início
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}
function fmtISO(d) { return d.toISOString().slice(0, 10) }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export default function Agendamentos() {
  const isMobile = useIsMobile()
  const [view, setView] = useState(isMobile ? 'lista' : 'semana')  // 'semana' | 'lista'
  // reage a mudança de viewport (ex: tablet rotacionando)
  useEffect(() => { setView(isMobile ? 'lista' : 'semana') }, [isMobile])
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [data, setData] = useState(null)
  const [dentistas, setDentistas] = useState([])
  const [status, setStatus] = useState('')
  const [dentista, setDentista] = useState('')
  const [error, setError] = useState(null)
  const [listPage, setListPage] = useState(0)
  const PAGE_SIZE = 20

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  const fetchData = useCallback(() => {
    // parent só fetcha para a view semanal; lista faz sua própria query paginada
    if (view !== 'semana') return
    setError(null)
    const params = {
      de: fmtISO(weekStart),
      ate: fmtISO(weekEnd),
      limit: 200,
    }
    if (status) params.status = status
    if (dentista) params.dentista = dentista
    getAgendamentos(params).then(d => {
      setData(d)
    }).catch(setError)
  }, [weekStart, weekEnd, status, dentista, view])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    getDentistas().then(d => setDentistas(d.data || [])).catch(() => {})
  }, [])

  const byDay = useMemo(() => {
    const map = Object.fromEntries(WEEKDAYS.map((_, i) => [fmtISO(addDays(weekStart, i)), []]))
    ;(data?.data || []).forEach(a => {
      if (map[a.data]) map[a.data].push(a)
    })
    Object.values(map).forEach(arr => arr.sort((x, y) => (x.horario || '').localeCompare(y.horario || '')))
    return map
  }, [data, weekStart])

  const today = todayISO()

  return (
    <div>
      <PageHeader
        title="Agenda"
        subtitle={isMobile ? "Lista de consultas e procedimentos" : "Consultas e procedimentos da semana"}
        action={
          !isMobile && (
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-border-subtle bg-surface-2 p-0.5">
                <button
                  onClick={() => setView('semana')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'semana' ? 'bg-accent-soft text-accent-deep' : 'text-ink-secondary hover:text-ink'}`}
                >Semana</button>
                <button
                  onClick={() => setView('lista')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'lista' ? 'bg-accent-soft text-accent-deep' : 'text-ink-secondary hover:text-ink'}`}
                >Lista</button>
              </div>
            </div>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-surface-2 text-ink-secondary transition-colors hover:bg-surface-1 hover:text-ink"
          aria-label="Semana anterior"
        ><ChevronLeft size={16} /></button>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm font-medium text-ink hover:bg-surface-1"
        >Esta semana</button>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-surface-2 text-ink-secondary transition-colors hover:bg-surface-1 hover:text-ink"
          aria-label="Próxima semana"
        ><ChevronRight size={16} /></button>
        <span className="text-sm font-medium text-ink">
          {weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — {weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <select
            value={dentista}
            onChange={e => { setDentista(e.target.value); setListPage(0) }}
            className="h-10 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm text-ink outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/15"
            aria-label="Filtrar por dentista"
          >
            <option value="">Todos os dentistas</option>
            {dentistas.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setListPage(0) }}
            className="h-10 rounded-lg border border-border-subtle bg-surface-2 px-3 text-sm text-ink outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/15"
            aria-label="Filtrar por status"
          >
            <option value="">Todos os status</option>
            <option value="agendado">Agendado</option>
            <option value="confirmado">Confirmado</option>
            <option value="realizado">Realizado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </span>
      </div>

      {error && <ErrorState message={error.message} />}
      {!error && !data && view === "semana" && <Loading label="Carregando agenda" />}

      {data && view === 'semana' && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 divide-x divide-border-subtle" role="grid" aria-label="Calendário semanal">
            {WEEKDAYS.map((wd, i) => {
              const d = addDays(weekStart, i)
              const iso = fmtISO(d)
              const items = byDay[iso] || []
              const isToday = iso === today
              return (
                <div key={iso} className="min-h-[200px] p-2" role="gridcell" aria-label={`${d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} - ${items.length} agendamento${items.length === 1 ? "" : "s"}`}>
                  <div className={`mb-2 flex flex-col items-center rounded-lg p-2 ${isToday ? 'bg-accent-soft today-pulse' : ''}`}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">{wd}</span>
                    <span className={`font-display text-lg font-semibold ${isToday ? 'text-accent-deep' : 'text-ink'}`}>
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {items.length === 0 ? (
                      <p className="px-1 py-3 text-center text-[10px] text-ink-tertiary">—</p>
                    ) : items.map(a => (
                      <Link
                        key={a.id}
                        to={`/pacientes/${a.paciente_id}`}
                        className="block rounded-md border border-border-subtle bg-surface-2 p-2 text-xs transition-all hover:border-accent/40 hover:bg-accent-soft/40"
                      >
                        <div className="font-semibold text-accent-deep">{a.horario || '—'}</div>
                        <div className="mt-0.5 truncate font-medium text-ink">{a.paciente_nome || `#${a.paciente_id}`}</div>
                        <div className="mt-1 truncate text-[10px] text-ink-secondary">{a.procedimento || a.dentista || '—'}</div>
                        <div className="mt-1.5"><StatusBadge status={a.status} /></div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {view === 'lista' && (
        <ListaView
          status={status}
          dentista={dentista}
          page={listPage}
          setPage={setListPage}
          pageSize={PAGE_SIZE}
          weekStart={fmtISO(weekStart)}
          weekEnd={fmtISO(weekEnd)}
        />
      )}
    </div>
  )
}

function ListaView({ status, dentista, page, setPage, pageSize, weekStart, weekEnd }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    setError(null)
    const params = { limit: pageSize, offset: page * pageSize, de: weekStart, ate: weekEnd }
    if (status) params.status = status
    if (dentista) params.dentista = dentista
    getAgendamentos(params).then(setItems).catch(setError)
  }, [page, status, dentista, weekStart, weekEnd, pageSize])

  if (error) return <ErrorState message={error.message} />
  if (!items) return <Loading label="Carregando lista" />

  const totalPages = Math.max(1, Math.ceil((items.total || 0) / pageSize))
  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-accent-light text-left text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <th className="px-6 py-3">Paciente</th>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Horário</th>
                <th className="px-6 py-3">Dentista</th>
                <th className="px-6 py-3">Procedimento</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.data.length === 0 ? (
                <tr><td colSpan="6"><EmptyState icon={LayoutList} title="Nenhum agendamento" description="Ajuste os filtros para ver mais resultados." /></td></tr>
              ) : items.data.map(a => (
                <tr key={a.id} className="border-t border-border-subtle transition-colors hover:bg-surface-1">
                  <td className="px-6 py-3 font-medium text-ink">
                    {a.paciente_id
                      ? <Link to={`/pacientes/${a.paciente_id}`} className="text-accent-hover hover:text-accent-deep hover:underline">{a.paciente_nome || `#${a.paciente_id}`}</Link>
                      : <span className="text-ink-tertiary">—</span>}
                  </td>
                  <td className="px-6 py-3 text-ink-secondary">{a.data}</td>
                  <td className="px-6 py-3 text-ink-secondary">{a.horario}</td>
                  <td className="px-6 py-3 text-ink-secondary">{a.dentista || '—'}</td>
                  <td className="px-6 py-3 text-ink-secondary">{a.procedimento || '—'}</td>
                  <td className="px-6 py-3"><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
          <span>{items.total} agendamento{items.total > 1 ? 's' : ''} no total</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-1 disabled:opacity-40">Anterior</button>
            <span className="px-3 py-1.5 text-xs font-medium text-ink-secondary">Página {page + 1} de {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-1 disabled:opacity-40">Próxima</button>
          </div>
        </div>
      )}
    </>
  )
}
