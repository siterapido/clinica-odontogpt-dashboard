import { useState, useEffect } from "react"
import { Routes, Route } from "react-router-dom"
import { getToken } from "./api"
import Sidebar from "./components/Sidebar"
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import Pacientes from "./pages/Pacientes"
import PacienteDetalhe from "./pages/PacienteDetalhe"
import Agendamentos from "./pages/Agendamentos"
import Prontuarios from "./pages/Prontuarios"
import Conversas from "./pages/Conversas"
import Lembretes from "./pages/Lembretes"

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken())

  useEffect(() => {
    setAuthenticated(!!getToken())
  }, [])

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-2 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-card"
      >
        Pular para conteúdo
      </a>
      <Sidebar />
      <main id="main-content" className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <Routes>
            <Route path="/"               element={<Dashboard />} />
            <Route path="/pacientes"      element={<Pacientes />} />
            <Route path="/pacientes/:id"  element={<PacienteDetalhe />} />
            <Route path="/agendamentos"   element={<Agendamentos />} />
            <Route path="/prontuarios"    element={<Prontuarios />} />
            <Route path="/conversas"      element={<Conversas />} />
            <Route path="/lembretes"      element={<Lembretes />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
