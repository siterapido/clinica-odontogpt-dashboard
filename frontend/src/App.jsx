import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { getToken, clearToken } from './api'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pacientes from './pages/Pacientes'
import PacienteDetalhe from './pages/PacienteDetalhe'
import Agendamentos from './pages/Agendamentos'
import Prontuarios from './pages/Prontuarios'

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken())

  useEffect(() => {
    setAuthenticated(!!getToken())
  }, [])

  function handleLogin() {
    setAuthenticated(true)
  }

  function handleLogout() {
    clearToken()
    setAuthenticated(false)
  }

  if (!authenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar onLogout={handleLogout} />
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-6xl">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/:id" element={<PacienteDetalhe />} />
            <Route path="/agendamentos" element={<Agendamentos />} />
            <Route path="/prontuarios" element={<Prontuarios />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
