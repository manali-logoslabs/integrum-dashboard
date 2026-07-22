import React, { useContext } from 'react'
import { MonthContext } from '../App'
import TopBar from '../components/layout/TopBar'
import LoadingState from '../components/ui/LoadingState'
import DailyBarChart from '../components/charts/DailyBarChart'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

export default function DailyPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error } = useApi(() => api.c9.dailySummary(month), [month])

  const totals = data ? {
    gen:     data.reduce((s, r) => s + r.generation_kwh,  0),
    cons:    data.reduce((s, r) => s + r.consumption_kwh, 0),
    matched: data.reduce((s, r) => s + r.matched_kwh,     0),
    grid:    data.reduce((s, r) => s + r.grid_kwh,        0),
  } : null

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="Chart 1 — Daily Generation, Consumption & Settlement" />

      <div style={{ padding: 24 }}>
        {/* Month totals */}
        {totals && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Generation',     val: totals.gen,     c: 'var(--color-green-light)' },
              { label: 'Consumption',    val: totals.cons,    c: 'var(--color-blue)' },
              { label: 'Direct Matched', val: totals.matched, c: '#22d896' },
              { label: 'Grid Import',    val: totals.grid,    c: 'var(--color-red)' },
            ].map(({ label, val, c }) => (
              <div key={label} className="card" style={{ textAlign: 'center' }}>
                <div className="card-title" style={{ marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{fmt(val)}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>kWh</div>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        <div className="card">
          <div className="card-title">Daily Energy Flow — {month}</div>
          {loading  ? <LoadingState height={380} /> :
           error    ? <LoadingState error={error} height={380} /> :
           data     ? <DailyBarChart data={data} /> : null}
        </div>

        {/* Data table */}
        {data && (
          <div className="card" style={{ marginTop: 16, overflowX: 'auto' }}>
            <div className="card-title">Daily Data Table</div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Generation</th>
                  <th style={{ textAlign: 'right' }}>Consumption</th>
                  <th style={{ textAlign: 'right' }}>Matched</th>
                  <th style={{ textAlign: 'right' }}>Grid</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.generation_kwh)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.consumption_kwh)}</td>
                    <td style={{ textAlign: 'right', color: '#22d896' }}>{fmt(r.matched_kwh)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-red)' }}>{fmt(r.grid_kwh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
