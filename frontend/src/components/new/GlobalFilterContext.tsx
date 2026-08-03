/**
 * GlobalFilterContext.tsx
 *
 * Shared filter state for the C9 dashboard (v2).
 * All charts can consume this context to stay in sync.
 *
 * Filters:
 *   period  — YYYY-MM (default: previous calendar month)
 *   states  — subset of ['KA','MH','TS'] (default: all)
 *   units   — subset of unit IDs (default: all)
 *   sources — subset of ['OA','BTM','Grid','Banking'] (default: all)
 */
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
export type StateId  = 'KA' | 'MH' | 'TS'
export type SourceId = 'OA' | 'BTM' | 'Grid' | 'Banking'

export const ALL_STATES:  StateId[]  = ['KA', 'MH', 'TS']
export const ALL_SOURCES: SourceId[] = ['OA', 'BTM', 'Grid', 'Banking']

export const STATE_LABELS:  Record<StateId,  string> = { KA: 'Karnataka', MH: 'Maharashtra', TS: 'Telangana' }
export const SOURCE_LABELS: Record<SourceId, string> = { OA: 'OA', BTM: 'BTM', Grid: 'Grid', Banking: 'Banking' }

export const ALL_UNITS = [
  { id: 'U-KA-01', label: 'Pavagada Solar',  state: 'KA' as StateId },
  { id: 'U-KA-02', label: 'Bellary Wind',    state: 'KA' as StateId },
  { id: 'U-MH-01', label: 'Nanded Wind',     state: 'MH' as StateId },
  { id: 'U-TS-01', label: 'Hyderabad BTM',   state: 'TS' as StateId },
]

export interface GlobalFilters {
  period:  string       // YYYY-MM
  states:  StateId[]
  units:   string[]     // unit IDs, [] = all
  sources: SourceId[]
}

interface GlobalFilterCtx {
  filters:      GlobalFilters
  setPeriod:    (p: string) => void
  toggleState:  (s: StateId)  => void
  toggleUnit:   (u: string)   => void
  toggleSource: (s: SourceId) => void
  resetFilters: () => void
  // Convenience: true when all items in that dimension are selected
  allStates:    boolean
  allSources:   boolean
}

// ── Defaults ──────────────────────────────────────────────────────────────────
function prevMonthStr(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const DEFAULT_FILTERS: GlobalFilters = {
  period:  prevMonthStr(),
  states:  [...ALL_STATES],
  units:   [],             // empty = all
  sources: [...ALL_SOURCES],
}

// ── Context ───────────────────────────────────────────────────────────────────
const Ctx = createContext<GlobalFilterCtx | null>(null)

export function GlobalFilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS)

  const setPeriod = useCallback((p: string) =>
    setFilters(f => ({ ...f, period: p })), [])

  const toggleState = useCallback((s: StateId) =>
    setFilters(f => {
      const next = f.states.includes(s)
        ? f.states.filter(x => x !== s)
        : [...f.states, s]
      return { ...f, states: next.length === 0 ? [...ALL_STATES] : next }
    }), [])

  const toggleUnit = useCallback((u: string) =>
    setFilters(f => {
      const next = f.units.includes(u)
        ? f.units.filter(x => x !== u)
        : [...f.units, u]
      return { ...f, units: next }
    }), [])

  const toggleSource = useCallback((s: SourceId) =>
    setFilters(f => {
      const next = f.sources.includes(s)
        ? f.sources.filter(x => x !== s)
        : [...f.sources, s]
      return { ...f, sources: next.length === 0 ? [...ALL_SOURCES] : next }
    }), [])

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), [])

  const value = useMemo<GlobalFilterCtx>(() => ({
    filters,
    setPeriod, toggleState, toggleUnit, toggleSource, resetFilters,
    allStates:  filters.states.length  === ALL_STATES.length,
    allSources: filters.sources.length === ALL_SOURCES.length,
  }), [filters, setPeriod, toggleState, toggleUnit, toggleSource, resetFilters])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGlobalFilters(): GlobalFilterCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGlobalFilters must be used inside GlobalFilterProvider')
  return ctx
}
