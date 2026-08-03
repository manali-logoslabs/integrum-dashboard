/**
 * Chart16GlobalFilters.tsx — Graph 16
 * Global Defaults & Filters (standalone canvas tile)
 *
 * Surfaces and controls the GlobalFilterContext so users can
 * set period / state / unit / source from within the canvas.
 * The same state is read by every other chart on the dashboard.
 *
 * Note: a compact sticky variant (GlobalFilterBar.tsx) is pinned
 * below the page header. This tile provides a larger, labelled
 * control panel for power-users who prefer in-canvas configuration.
 */
import React from 'react'
import {
  useGlobalFilters,
  ALL_STATES, ALL_SOURCES, ALL_UNITS,
  STATE_LABELS, SOURCE_LABELS,
  type StateId, type SourceId,
} from '../GlobalFilterContext'

// ── Styles ────────────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 12, padding: 20,
}
const SEL: React.CSSProperties = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 6, padding: '5px 10px',
  color: 'var(--color-text-primary)', fontSize: 12, outline: 'none', cursor: 'pointer',
  width: '100%',
}
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8,
}

const STATE_COLORS: Record<StateId, string> = {
  KA: '#1baf7a', MH: '#2a78d6', TS: '#9b59b6',
}
const SOURCE_COLORS: Record<SourceId, string> = {
  OA: '#2a78d6', BTM: '#1baf7a', Grid: '#eb6834', Banking: '#9b59b6',
}

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatPeriodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// ── Filter chip ───────────────────────────────────────────────────────────────
function FilterChip({
  label, active, color, onClick,
}: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px', borderRadius: 99, fontSize: 11, cursor: 'pointer',
        border: `1px solid ${active ? color : 'var(--color-border)'}`,
        background: active ? `${color}18` : 'transparent',
        color: active ? color : 'var(--color-text-muted)',
        fontWeight: active ? 700 : 400,
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  )
}

// ── Active filter summary row ─────────────────────────────────────────────────
function ActiveFilterSummary() {
  const { filters, allStates, allSources, resetFilters } = useGlobalFilters()

  const chips: { label: string; color: string }[] = []
  chips.push({ label: `📅 ${formatPeriodLabel(filters.period)}`, color: 'var(--color-text-secondary)' })

  if (!allStates) {
    chips.push(...filters.states.map(s => ({
      label: STATE_LABELS[s],
      color: STATE_COLORS[s],
    })))
  } else {
    chips.push({ label: 'All states', color: 'var(--color-text-muted)' })
  }

  if (filters.units.length > 0) {
    const labels = filters.units.map(uid => ALL_UNITS.find(u => u.id === uid)?.label ?? uid)
    chips.push({ label: labels.join(', '), color: '#74b0f5' })
  }

  if (!allSources) {
    chips.push(...filters.sources.map(s => ({
      label: SOURCE_LABELS[s],
      color: SOURCE_COLORS[s],
    })))
  }

  const isDirty = !allStates || !allSources || filters.units.length > 0

  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, marginBottom: 20,
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)',
    }}>
      <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>Active filters</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {chips.map((c, i) => (
          <span key={i} style={{
            padding: '3px 10px', borderRadius: 99, fontSize: 11,
            background: `${c.color}18`,
            border: `1px solid ${c.color}40`,
            color: c.color,
          }}>
            {c.label}
          </span>
        ))}
        {isDirty && (
          <button onClick={resetFilters} style={{
            marginLeft: 'auto', padding: '4px 12px', borderRadius: 6, fontSize: 10,
            cursor: 'pointer', background: 'rgba(231,76,60,0.08)',
            border: '1px solid rgba(231,76,60,0.3)', color: '#e74c3c', fontWeight: 600,
          }}>
            ✕ Reset all
          </button>
        )}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart16GlobalFilters() {
  const {
    filters, setPeriod,
    toggleState, toggleSource, toggleUnit,
    allStates, allSources,
    resetFilters,
  } = useGlobalFilters()

  const visibleUnits = ALL_UNITS.filter(u => filters.states.includes(u.state))

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            🎛️ Global Defaults & Filters
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            Controls apply to all charts on this canvas · Default: previous calendar month · all states · all sources
          </div>
        </div>
        <button onClick={resetFilters} style={{
          padding: '5px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.3)',
          color: '#e74c3c', fontWeight: 600,
        }}>
          Reset to defaults
        </button>
      </div>

      {/* ── Active filter summary ── */}
      <ActiveFilterSummary />

      {/* ── Two-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Period */}
        <div>
          <div style={SECTION_LABEL}>Period (month)</div>
          <input
            type="month"
            value={filters.period}
            min="2025-04"
            max={currentMonthStr()}
            onChange={e => setPeriod(e.target.value)}
            style={SEL}
          />
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 5 }}>
            Default: previous calendar month ({formatPeriodLabel(
              (() => {
                const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              })()
            )})
          </div>
        </div>

        {/* Source */}
        <div>
          <div style={SECTION_LABEL}>Source</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <FilterChip
              label="All" active={allSources} color="var(--color-text-secondary)"
              onClick={() => { if (!allSources) ALL_SOURCES.forEach(s => { if (!filters.sources.includes(s)) toggleSource(s) }) }}
            />
            {ALL_SOURCES.map(s => (
              <FilterChip
                key={s} label={SOURCE_LABELS[s]}
                active={filters.sources.includes(s)}
                color={SOURCE_COLORS[s]}
                onClick={() => toggleSource(s)}
              />
            ))}
          </div>
        </div>

        {/* State */}
        <div>
          <div style={SECTION_LABEL}>State</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <FilterChip
              label="All" active={allStates} color="var(--color-text-secondary)"
              onClick={() => { if (!allStates) ALL_STATES.forEach(s => { if (!filters.states.includes(s)) toggleState(s) }) }}
            />
            {ALL_STATES.map(s => (
              <FilterChip
                key={s} label={`${STATE_LABELS[s]} (${s})`}
                active={filters.states.includes(s)}
                color={STATE_COLORS[s]}
                onClick={() => toggleState(s)}
              />
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 5 }}>
            Selecting a state also filters the Unit list below.
          </div>
        </div>

        {/* Unit */}
        <div>
          <div style={SECTION_LABEL}>Unit</div>
          {visibleUnits.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No units for selected state(s).
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibleUnits.map(u => {
                const checked = filters.units.includes(u.id)
                return (
                  <label key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    padding: '6px 10px', borderRadius: 6,
                    background: checked ? `${STATE_COLORS[u.state]}10` : 'transparent',
                    border: `1px solid ${checked ? STATE_COLORS[u.state] + '40' : 'var(--color-border)'}`,
                    transition: 'all 0.12s',
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleUnit(u.id)}
                      style={{ accentColor: STATE_COLORS[u.state], cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: checked ? 700 : 400 }}>
                        {u.label}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{u.id}</div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: STATE_COLORS[u.state],
                      background: `${STATE_COLORS[u.state]}18`,
                      border: `1px solid ${STATE_COLORS[u.state]}40`,
                      borderRadius: 3, padding: '1px 5px',
                    }}>
                      {u.state}
                    </span>
                  </label>
                )
              })}
              {filters.units.length > 0 && (
                <button
                  onClick={() => { filters.units.forEach(uid => toggleUnit(uid)) }}
                  style={{
                    marginTop: 4, padding: '4px 0', background: 'transparent',
                    border: '1px dashed var(--color-border)', borderRadius: 4,
                    fontSize: 10, cursor: 'pointer', color: 'var(--color-text-muted)',
                  }}
                >
                  Clear unit selection (show all)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Drill gesture info ── */}
      <div style={{
        marginTop: 20, padding: '10px 14px', borderRadius: 8,
        background: 'rgba(42,120,214,0.07)', border: '1px solid rgba(42,120,214,0.22)',
        fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: '#74b0f5' }}>Drill gesture: </strong>
        Double-tap (mobile) · Click (web) — consistent across all charts.
        Charts that support the global period will update automatically.
        Charts with their own period picker override the global default for that instance.
      </div>
    </div>
  )
}
