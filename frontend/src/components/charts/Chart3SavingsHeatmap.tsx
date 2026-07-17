/**
 * Chart 3 — Monthly Savings Heatmap (unit x month grid)
 * Uses the dedicated /c9/savings-heatmap endpoint (single call, all months).
 */
import React, { useEffect, useState } from 'react'
import { api, SavingsHeatmapRow } from '../../api/client'

function pctColor(pct: number | null): string {
  if (pct === null) return 'rgba(24,45,71,.4)'
  const t = Math.min(pct / 70, 1)
  const r = Math.round(29 + (232 - 29) * (1 - t))
  const g = Math.round(191 + (72 - 191) * (1 - t))
  const b = Math.round(122 + (72 - 122) * (1 - t))
  return `rgb(${r},${g},${b})`
}

type Grid = Record<string, Record<string, number | null>>

export default function Chart3SavingsHeatmap({ month: _month }: { month: string }) {
  const [grid, setGrid]     = useState<Grid>({})
  const [units, setUnits]   = useState<string[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(false)

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(false)
    api.c9.savingsHeatmap()
      .then((rows: SavingsHeatmapRow[]) => {
        if (!live) return
        const g: Grid = {}
        const unitSet  = new Set<string>()
        const monthSet = new Set<string>()
        rows.forEach(r => {
          unitSet.add(r.unit)
          monthSet.add(r.month)
          if (!g[r.unit]) g[r.unit] = {}
          g[r.unit][r.month] = r.savings_pct ?? null
        })
        const sortedMonths = [...monthSet].sort()
        setUnits([...unitSet].sort())
        setMonths(sortedMonths)
        setGrid(g)
        setLoading(false)
      })
      .catch(() => { if (live) { setError(true); setLoading(false) } })
    return () => { live = false }
  }, [])

  if (loading) return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (error)   return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Could not load savings data.</div>
  if (!units.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data available.</div>

  const CELL = 38
  const shortLabel = (m: string) => {
    const [, mm] = m.split('-')
    return ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mm, 10)] ?? m
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${months.length}, ${CELL}px)`, gap: 2, minWidth: 'max-content' }}>
        <div />
        {months.map(m => (
          <div key={m} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{shortLabel(m)}</div>
        ))}
        {units.map(unit => (
          <React.Fragment key={unit}>
            <div style={{ fontSize: 10, color: 'var(--text-sec)', display: 'flex', alignItems: 'center', paddingRight: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {unit.replace(' CORP. OFFICE', '').replace('OLD AIRPORT ROAD', 'OAR')}
            </div>
            {months.map(m => {
              const pct = grid[unit]?.[m] ?? null
              return (
                <div key={m} title={`${unit} | ${m} | ${pct !== null ? pct.toFixed(1) + '%' : 'no data'}`}
                  style={{
                    height: CELL, borderRadius: 4,
                    background: pctColor(pct),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700,
                    color: pct !== null && pct > 30 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.5)',
                    cursor: 'default',
                  }}>
                  {pct !== null ? pct.toFixed(0) + '%' : '—'}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Low savings</span>
        {[0, 20, 40, 60, 80].map(p => (
          <div key={p} style={{ width: 24, height: 14, borderRadius: 3, background: pctColor(p) }} title={`${p}%`} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>High savings</span>
      </div>
    </div>
  )
}
