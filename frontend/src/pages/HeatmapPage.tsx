/**
 * Chart 15 — 24h × 7-day Energy Heatmap
 */
import React, { useContext, useState } from 'react'
import { MonthContext } from '../App'
import TopBar from '../components/layout/TopBar'
import LoadingState from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'

type Mode = 'net' | 'gen' | 'cons'

function hmColor(net: number | null, mode: Mode): string {
  if (net === null) return 'var(--color-border)'
  if (mode === 'net') {
    if (net > 0) {
      const i = Math.min(net / 1894, 1)
      return `rgba(27,175,122,${(0.12 + i * 0.82).toFixed(2)})`
    } else {
      const i = Math.min(-net / 1040, 1)
      return `rgba(227,73,72,${(0.12 + i * 0.82).toFixed(2)})`
    }
  }
  if (mode === 'gen') {
    const i = Math.min(net / 2000, 1)
    return `rgba(27,175,122,${(0.08 + i * 0.88).toFixed(2)})`
  }
  // cons
  const i = Math.min(net / 2000, 1)
  return `rgba(59,130,246,${(0.08 + i * 0.88).toFixed(2)})`
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2,'0')}:00`)
const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function HeatmapPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error } = useApi(() => api.c9.heatmap(month), [month])
  const [mode, setMode] = useState<Mode>('net')
  const [hovered, setHovered] = useState<{ h: number; d: number; v: number | null } | null>(null)

  const matrix = data
    ? (mode === 'net'  ? data.net_matrix
     : mode === 'gen'  ? data.gen_matrix
     :                   data.cons_matrix)
    : null

  const CELL = 34
  const LEFT = 52   // hour label width
  const TOP  = 28   // day label height

  const allVals = matrix?.flat().filter(v => v !== null) as number[] | undefined
  const minVal  = allVals ? Math.min(...allVals) : 0
  const maxVal  = allVals ? Math.max(...allVals) : 0

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="Chart 15 — 24h × 7-day Energy Heatmap" />
      <div style={{ padding: 24 }}>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['net','gen','cons'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
              background: mode === m ? 'var(--color-green)' : 'var(--color-card)',
              color: mode === m ? '#fff' : 'var(--color-text-secondary)',
            }}>
              {m === 'net' ? '⚡ Net (Gen − Cons)' : m === 'gen' ? '☀️ Generation' : '🏭 Consumption'}
            </button>
          ))}
        </div>

        {loading ? <LoadingState height={500} /> :
         error   ? <LoadingState error={error} height={500} /> :
         matrix && (
          <div className="card">
            <div className="card-title">
              Avg {mode === 'net' ? 'Net Energy (Gen − Cons)' : mode === 'gen' ? 'Generation' : 'Consumption'} per Hour × Day-of-Week — {month}
            </div>

            {/* Tooltip */}
            {hovered && (
              <div style={{
                fontSize: 12, marginBottom: 12, color: 'var(--color-text-secondary)',
                minHeight: 18,
              }}>
                {HOURS[hovered.h]} · {DAYS[hovered.d]} → {' '}
                <span style={{ color: hovered.v !== null && hovered.v > 0 ? 'var(--color-green-light)' : 'var(--color-red)', fontWeight: 600 }}>
                  {hovered.v !== null ? `${hovered.v > 0 ? '+' : ''}${hovered.v.toFixed(1)} kWh` : 'no data'}
                </span>
              </div>
            )}

            {/* Heatmap grid */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ position: 'relative', width: LEFT + DAYS.length * CELL, minWidth: 300 }}>
                {/* Day headers */}
                <div style={{ display: 'flex', marginLeft: LEFT }}>
                  {DAYS.map(d => (
                    <div key={d} style={{
                      width: CELL, textAlign: 'center', fontSize: 11,
                      color: 'var(--color-text-secondary)', paddingBottom: 6,
                    }}>{d}</div>
                  ))}
                </div>
                {/* Hour rows */}
                {HOURS.map((hr, h) => (
                  <div key={h} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      width: LEFT, fontSize: 10, color: 'var(--color-text-muted)',
                      textAlign: 'right', paddingRight: 8, flexShrink: 0,
                    }}>{hr}</div>
                    {DAYS.map((_, d) => {
                      const v = matrix[h]?.[d] ?? null
                      return (
                        <div
                          key={d}
                          onMouseEnter={() => setHovered({ h, d, v })}
                          onMouseLeave={() => setHovered(null)}
                          style={{
                            width: CELL - 2, height: CELL - 2, margin: 1,
                            borderRadius: 3,
                            background: hmColor(v, mode),
                            cursor: 'default',
                            transition: 'filter 0.1s',
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 16 }}>
              {mode === 'net' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(227,73,72,0.9)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Deficit (net consumer)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(27,175,122,0.9)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Surplus (net producer)</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Range: {minVal.toFixed(0)} → +{maxVal.toFixed(0)} kWh
                  </span>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, background: mode === 'gen' ? 'rgba(27,175,122,0.9)' : 'rgba(59,130,246,0.9)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>High</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Range: {minVal.toFixed(0)} → {maxVal.toFixed(0)} kWh
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
