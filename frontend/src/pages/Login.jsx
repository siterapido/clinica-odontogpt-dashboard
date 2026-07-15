import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, Loader2 } from 'lucide-react'
import { login } from '../api'
import ToothPulse from '../components/ToothPulse'
import HeartbeatWave from '../components/HeartbeatWave'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(password)
      onLogin()
    } catch (err) {
      setError(err.message || 'Senha incorreta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-deep px-4">
      {/* Heartbeat wave sutil ao fundo */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-accent/40">
        <HeartbeatWave className="h-32 w-full" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[20%] text-accent/20">
        <HeartbeatWave className="h-20 w-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface-2 p-8 shadow-card-lg"

      >
        <div className="mb-6 flex flex-col items-center gap-3 rounded-xl bg-brand-deep px-6 py-5">
          <ToothPulse size={36} className="text-accent" />
          <img src="/logo-odontogpt-branca.png" alt="OdontoGPT" className="h-auto w-full max-w-[170px]" />
        </div>

        <h1 className="text-center text-lg font-bold text-ink">Acesso da Clínica</h1>
        <p className="mt-1 text-center text-sm text-ink-secondary">OdontoGPT — Clínica do Futuro</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <div className="relative">
            <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              autoFocus
              className="pl-10 text-center"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-center text-sm text-danger">{error}</div>
          )}

          <Button type="submit" disabled={loading || !password} className="mt-1 w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
