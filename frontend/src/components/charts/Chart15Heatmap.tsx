/**
 * Chart 15 — 24h × 7-day Energy Heatmap
 */
import React, { useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

type Mode = 'net' | 'gen' | 'cons'

function hmColor(v: number | null, mode: Mode): string {
  if (v === null) return 'rgba(24,45,71,.4)'
  if (mode === 'net') {
    if (v > 0) {
      const i = Math.min(v / 2000, 1)
      return `rgba(29,191,122,${(.12 + i * .82).toFixed(2)})`
    }
    const i = Math.min(-v / 1000, 1)
    return `rgba(232,72,72,${(.12 + i * .82).toFixed(2)})`
  }
  if (mode === 'gen') {
    const i = Math.min(v / 2500, 1)
    return `rgba(29,191,122,${(.08 + i * .88).toFixed(2)})`
  }
  const i = Math.min(v / 1000, 1)
  return `rgba(74,158,255,${(.08 + i * .88).toFixed(2)})`
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`)
const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CELL  = 32

export default function Chart15Heatmap({ month }: { month: string }) {
  const { data, loading } = useApi(() => api.c9.heatmap(month), [month])
  const [mode, setMode] = useState<Mode>('net')
  const [hovered, setHovered] = useState<{ h: number; d: number; v: number | null } | null>(null)

  const matrix = data
    ? (mode === 'net' ? data.net_matrix : mode === 'gen' ? data.gen_matrix : data.cons_matrix)
    : null

  if (loading) return <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data || !matrix) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  return (
    <div>
      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['net', 'gen', 'cons'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} className={`btn${mode === m ? ' btn-active' : ''}`} style={{ fontSize: 11 }}>
            {m === 'net' ? '⚡ Net' : m === 'gen' ? '☀️ Gen' : '🏭 Cons'}
          </button>
        ))}
        {hovered && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10, alignSelf: 'center' }}>
            {HOURS[hovered.h]} · {DAYS[hovered.d]} →{' '}
            <strong style={{ color: hovered.v !== null && hovered.v > 0 ? 'var(--green-l)' : 'var(--red)' }}>
              {hovered.v !== null ? `${hovered.v > 0 ? '+' : ''}${hovered.v.toFixed(1)} kWh` : 'no data'}
            </strong>
          </span>
        )}
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'inline-block' }}>
          {/* Day headers */}
          <div style={{ display: 'flex', marginLeft: 44 }}>
            {DAYS.map(d => (
              <div key={d} style={{ width: CELL, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', paddingBottom: 4 }}>{d}</div>
            ))}
          </div>
          {/* Hour rows */}
          {HOURS.map((hr, h) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', marginBottom: 1 }}>
              <div style={{ width: 44, fontSize: 9, color: 'var(--text-muted)', textAlign: 'right', paddingRight: 6, flexShrink: 0 }}>{hr}</div>
              {DAYS.map((_, d) => {
                const v = matrix[h]?.[d] ?? null
                return (
                  <div key={d}
                    onMouseEnter={() => setHovered({ h, d, v })}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      width: CELL - 1, height: CELL - 1, margin: '0 1px 0 0',
                      borderRadius: 3,
                      background: hmColor(v, mode),
                      cursor: 'default',
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        {mode === 'net' ? (
          <>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(232,72,72,.9)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Deficit</span>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(29,191,122,.9)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Surplus</span>
          </>
        ) : (
          <>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: mode === 'gen' ? 'rgba(29,191,122,.9)' : 'rgba(74,158,255,.9)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>High</span>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: mode === 'gen' ? 'rgba(29,191,122,.15)' : 'rgba(74,158,255,.15)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Low</span>
          </>
        )}
      </div>
    </div>
  )
}
