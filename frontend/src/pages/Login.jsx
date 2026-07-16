import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, Loader2 } from 'lucide-react'
import { login } from '../api'
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      {/* Heartbeat fade one-shot — não loopa "carregando" enganoso */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-accent">
        <HeartbeatWave className="h-32 w-full" delay={0.2} opacity={0.28} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[20%] text-accent">
        <HeartbeatWave className="h-20 w-full" delay={0.6} opacity={0.14} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-brand-deep p-8 shadow-card-lg"
      >
        <div className="mb-6 flex flex-col items-center gap-1">
          <img
            src="/logo-odontogpt-branca.png"
            alt="OdontoGPT"
            className="h-10 w-auto"
          />
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">
            Dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              autoFocus
              className="pl-10 border-white/15 bg-white/10 text-white placeholder:text-white/30 focus:bg-white/15"
              aria-label="Senha de acesso"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-center text-sm text-danger">
              {error}
            </div>
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
