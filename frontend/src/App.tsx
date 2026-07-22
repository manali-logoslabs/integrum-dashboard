/**
 * App.tsx — Routes /c9 to C9 Dashboard, /gil to GIL Dashboard.
 */
import React, { useState } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import GILDashboardPage from './pages/GILDashboardPage'

export const MonthContext = React.createContext<{
  month: string
  setMonth: (m: string) => void
}>({ month: '2025-08', setMonth: () => {} })

const cardBase: React.CSSProperties = {
  borderRadius: '1rem',
  padding: '2rem 3rem',
  cursor: 'pointer',
  color: '#fff',
  textAlign: 'center',
  minWidth: '240px',
  transition: 'transform 0.15s',
}

function ClientChooser() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a', gap: '2rem' }}>
      <div style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#f8fafc', fontWeight: 700, margin: 0 }}>
          Integrum Intelligence Dashboard
        </h1>
        <p style={{ margin: '0.5rem 0 0', fontSize: '1rem' }}>
          Select a client dashboard to continue
        </p>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/c9" style={{ textDecoration: 'none' }}>
          <div style={{ ...cardBase, background: '#1d4ed8', boxShadow: '0 4px 24px rgba(59,130,246,0.35)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>☀️</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>C9 Dashboard</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: '0.4rem' }}>
              BESCOM · Solar · Karnataka
            </div>
          </div>
        </Link>
        <Link to="/gil" style={{ textDecoration: 'none' }}>
          <div style={{ ...cardBase, background: '#065f46', boxShadow: '0 4px 24px rgba(16,185,129,0.35)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🌬️</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>GIL Dashboard</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: '0.4rem' }}>
              MSEDCL · Wind+Solar · Maharashtra
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}

export default function App() {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    const y = d.getFullYear() > 2025 ? 2025 : d.getFullYear()
    const m = d.getFullYear() > 2025 ? 11 : Math.min(d.getMonth() + 1, 11)
    return `${y}-${String(m).padStart(2, '0')}`
  })

  return (
    <MonthContext.Provider value={{ month, setMonth }}>
      <Routes>
        <Route path="/"    element={<ClientChooser />} />
        <Route path="/c9"  element={<DashboardPage />} />
        <Route path="/gil" element={<GILDashboardPage />} />
        <Route path="*"    element={<Navigate to="/" replace />} />
      </Routes>
    </MonthContext.Provider>
  )
}
