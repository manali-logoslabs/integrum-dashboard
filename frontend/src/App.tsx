/**
 * App.tsx
 * Route map:
 *   /                            → redirect → /new (new landing)
 *   /new                         → LandingPage (client selector)
 *   /new/:clientId/select-state  → StateSelectPage (state selector)
 *   /new/c9                      → C9 dashboard v2
 *   /new/c9/*                    → New C9 sub-pages
 *   /old/c9                      → C9 dashboard v1 (reference, do not modify)
 *   /old/gil                     → GIL dashboard v1
 */
import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

// ── Old dashboard (v1, preserved) ──────────────────────────────────────────
import DashboardPage    from './pages/DashboardPage'
import GILDashboardPage from './pages/GILDashboardPage'
import DiscomBillPage   from './pages/DiscomBillPage'

// ── New dashboard (v2) ──────────────────────────────────────────────────────
import LandingPage     from './pages/new/LandingPage'
import StateSelectPage from './pages/new/StateSelectPage'
import NewC9Page       from './pages/new/c9/NewC9Page'

// ── Shared context (used by v1 pages) ──────────────────────────────────────
export const MonthContext = React.createContext<{
  month: string
  setMonth: (m: string) => void
}>({ month: '2025-08', setMonth: () => {} })

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
        {/* Root → new landing */}
        <Route path="/" element={<Navigate to="/new" replace />} />

        {/* ── New dashboard (v2) ── */}
        <Route path="/new"                          element={<LandingPage />} />
        <Route path="/new/:clientId/select-state"   element={<StateSelectPage />} />
        <Route path="/new/c9"                       element={<NewC9Page />} />
        <Route path="/new/c9/*"                     element={<NewC9Page />} />

        {/* ── Old dashboard (v1, preserved) ── */}
        <Route path="/old/c9"             element={<DashboardPage />} />
        <Route path="/old/c9/discom-bill" element={<DiscomBillPage />} />
        <Route path="/old/gil"            element={<GILDashboardPage />} />

        {/* Legacy short routes → redirect */}
        <Route path="/c9"   element={<Navigate to="/old/c9"  replace />} />
        <Route path="/c9/*" element={<Navigate to="/old/c9"  replace />} />
        <Route path="/gil"  element={<Navigate to="/old/gil" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/new" replace />} />
      </Routes>
    </MonthContext.Provider>
  )
}
