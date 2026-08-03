/**
 * GlobalFilterBar.tsx
 *
 * Persistent filter bar pinned below the page header.
 * Controls: period (month picker) · state chips · unit dropdown · source chips
 * All state is managed by GlobalFilterContext.
 */
import React, { useState } from 'react'
import {
  useGlobalFilters,
  ALL_STATES, ALL_SOURCES, ALL_UNITS,
  STATE_LABELS, SOURCE_LABELS,
  type StateId, type SourceId,
} from './GlobalFilterContext'

// ── Styles ────────────────────────────────────────────────────────────────────
const BAR: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  padding: '8px 24px',
  background: 'var(--color-surface)',
  borderBottom: '1px solid var(--color-border)',
  position: 'sticky',
  top: 0,
  zIndex: 50,
}
const LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.07em',
  whiteSpace: 'nowrap' as const,
}
const SEL: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  padding: '3px 7px',
  color: 'var(--color-text-primary)',
  fontSize: 11,
  outline: 'none',
  cursor: 'pointer',
}
const DIVIDER: React.CSSProperties = {
  width: 1, height: 20,
  background: 'var(--color-border)',
  flexShrink: 0,
}

function Chip({
  label, active, color = '#2a78d6', onClick,
}: {
  label: string; active: boolean; color?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 99,
        fontSize: 11,
        cursor: 'pointer',
        border: `1px solid ${active ? color : 'var(--color-border)'}`,
        background: active ? `${color}18` : 'transparent',
        color: active ? color : 'var(--color-text-muted)',
        fontWeight: active ? 700 : 400,
        transition: 'all 0.12s',
        whiteSpace: 'nowrap' as const,
        lineHeight: '18px',
      }}
    >
      {label}
    </button>
  )
}

const STATE_COLORS: Record<StateId, string> = {
  KA: '#1baf7a',
  MH: '#2a78d6',
  TS: '#9b59b6',
}
const SOURCE_COLORS: Record<SourceId, string> = {
  OA:      '#2a78d6',
  BTM:     '#1baf7a',
  Grid:    '#eb6834',
  Banking: '#9b59b6',
}

// Unit dropdown (multi-select via checkboxes in a pop-over)
function UnitDropdown() {
  const { filters, toggleUnit } = useGlobalFilters()
  const [open, setOpen] = useState(false)

  const activeUnits  = filters.units
  const visibleUnits = ALL_UNITS.filter(u => filters.states.includes(u.state))
  const label        = activeUnits.length === 0
    ? 'All units'
    : `${activeUnits.length} unit${activeUnits.length > 1 ? 's' : ''}`

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...SEL,
          display: 'flex', alignItems: 'center', gap: 5,
          borderColor: activeUnits.length > 0 ? '#2a78d6' : 'var(--color-border)',
          color: activeUnits.length > 0 ? '#74b0f5' : 'var(--color-text-secondary)',
          fontWeight: activeUnits.length > 0 ? 700 : 400,
        }}
      >
        {label}
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 200,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8, padding: 8, minWidth: 180,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
          onMouseLeave={() => setOpen(false)}
        >
          {visibleUnits.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: '4px 8px' }}>
              No units for selected states
            </div>
          )}
          {visibleUnits.map(u => {
            const on = activeUnits.includes(u.id) || activeUnits.length === 0
            const checked = activeUnits.includes(u.id)
            return (
              <label
                key={u.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 8px', cursor: 'pointer', borderRadius: 4,
                  background: checked ? 'rgba(42,120,214,0.1)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleUnit(u.id)}
                  style={{ accentColor: '#2a78d6', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 11, color: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  {u.label}
                </span>
                <span style={{
                  marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                  color: STATE_COLORS[u.state], opacity: 0.7,
                }}>{u.state}</span>
              </label>
            )
          })}
          {activeUnits.length > 0 && (
            <button
              onClick={() => { filters.units.forEach(u => toggleUnit(u)) }}
              style={{
                marginTop: 6, width: '100%', padding: '4px 0',
                background: 'transparent', border: '1px dashed var(--color-border)',
                borderRadius: 4, fontSize: 10, cursor: 'pointer',
                color: 'var(--color-text-muted)',
              }}
            >
              Clear (show all)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatPeriodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1)
    .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GlobalFilterBar() {
  const {
    filters, setPeriod, toggleState, toggleSource, resetFilters,
    allStates, allSources,
  } = useGlobalFilters()

  const isDirty = !allStates || !allSources
    || filters.units.length > 0
    || filters.period !== (() => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()

  return (
    <div style={BAR}>
      {/* Period */}
      <span style={LABEL}>Period</span>
      <input
        type="month"
        value={filters.period}
        min="2025-04"
        max={currentMonthStr()}
        onChange={e => setPeriod(e.target.value)}
        style={{
          ...SEL,
          fontSize: 11,
          color: 'var(--color-text-primary)',
        }}
        title={`Showing: ${formatPeriodLabel(filters.period)}`}
      />

      <div style={DIVIDER} />

      {/* States */}
      <span style={LABEL}>State</span>
      {ALL_STATES.map(s => (
        <Chip
          key={s}
          label={STATE_LABELS[s]}
          active={filters.states.includes(s)}
          color={STATE_COLORS[s]}
          onClick={() => toggleState(s)}
        />
      ))}

      <div style={DIVIDER} />

      {/* Units */}
      <span style={LABEL}>Unit</span>
      <UnitDropdown />

      <div style={DIVIDER} />

      {/* Sources */}
      <span style={LABEL}>Source</span>
      {ALL_SOURCES.map(s => (
        <Chip
          key={s}
          label={SOURCE_LABELS[s]}
          active={filters.sources.includes(s)}
          color={SOURCE_COLORS[s]}
          onClick={() => toggleSource(s)}
        />
      ))}

      {/* Reset */}
      {isDirty && (
        <>
          <div style={DIVIDER} />
          <button
            onClick={resetFilters}
            title="Reset all filters to defaults"
            style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 10,
              cursor: 'pointer', border: '1px solid rgba(231,76,60,0.35)',
              background: 'rgba(231,76,60,0.08)',
              color: '#e74c3c', fontWeight: 600,
              transition: 'all 0.12s',
            }}
          >
            ✕ Reset
          </button>
        </>
      )}

      {/* Active filter summary (right-aligned) */}
      <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
        {formatPeriodLabel(filters.period)}
        {!allStates && ` · ${filters.states.join(', ')}`}
        {filters.units.length > 0 && ` · ${filters.units.length} unit${filters.units.length > 1 ? 's' : ''}`}
        {!allSources && ` · ${filters.sources.join(', ')}`}
      </div>
    </div>
  )
}
