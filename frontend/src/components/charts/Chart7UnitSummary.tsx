/**
 * Chart 7 - Financial Performance Summary Table (all 11 units)
 */
import React from 'react'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

const n2f = (n: any): number => typeof n === 'number' ? n : parseFloat(String(n ?? 0)) || 0
const f   = (n: any) => n2f(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const inr = (n: any) => '₹' + (n2f(n) / 1e5).toFixed(2) + 'L'
const pct = (n: any) => n2f(n).toFixed(1) + '%'

export default function Chart7UnitSummary({ month, unitIds }: { month: string; unitIds?: string }) {
  const { data, loading } = useApi(() => api.c9.unitSavings(month, unitIds ? { unit_ids: unitIds } : undefined), [month, unitIds])

  if (loading) return <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const totals = {
    cons:   data.reduce((s, r) => s + r.consumption_kwh, 0),
    grid:   data.reduce((s, r) => s + r.grid_cost, 0),
    actual: data.reduce((s, r) => s + r.actual_cost_with_banking, 0),
    saved:  data.reduce((s, r) => s + r.savings_with_banking, 0),
    match:  data.reduce((s, r) => s + r.matched_kwh, 0),
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>Unit</th>
            <th style={{ textAlign: 'right' }}>Consumption</th>
            <th style={{ textAlign: 'right' }}>Grid Cost</th>
            <th style={{ textAlign: 'right' }}>Actual Cost</th>
            <th style={{ textAlign: 'right' }}>Savings</th>
            <th style={{ textAlign: 'right' }}>Match kWh</th>
            <th style={{ textAlign: 'right' }}>Replace %</th>
            <th style={{ textAlign: 'right' }}>Savings %</th>
          </tr>
        </thead>
        <tbody>
          {data.map(r => (
            <tr key={r.unit_code}>
              <td style={{ color: 'var(--text)' }}>{r.unit}</td>
              <td style={{ textAlign: 'right', color: 'var(--text-sec)' }}>{f(r.consumption_kwh)} kWh</td>
              <td style={{ textAlign: 'right', color: 'var(--red)' }}>{inr(r.grid_cost)}</td>
              <td style={{ textAlign: 'right', color: 'var(--blue)' }}>{inr(r.actual_cost_with_banking)}</td>
              <td style={{ textAlign: 'right', color: 'var(--green-l)', fontWeight: 700 }}>{inr(r.savings_with_banking)}</td>
              <td style={{ textAlign: 'right', color: 'var(--text-sec)' }}>{f(r.matched_kwh)}</td>
              <td style={{ textAlign: 'right' }}>
                <span className={r.replacement_pct >= 40 ? 'num-positive' : 'num-neutral'}>{pct(r.replacement_pct)}</span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <span className={r.savings_pct_with_banking >= 30 ? 'num-positive' : 'num-neutral'}>{pct(r.savings_pct_with_banking)}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid var(--border-light)', background: 'rgba(29,191,122,.06)' }}>
            <td style={{ fontWeight: 700, color: 'var(--text)' }}>TOTAL</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{f(totals.cons)} kWh</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{inr(totals.grid)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--blue)' }}>{inr(totals.actual)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green-l)' }}>{inr(totals.saved)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{f(totals.match)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green-l)' }}>{pct(totals.match / totals.cons * 100)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green-l)' }}>{pct(totals.saved / totals.grid * 100)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
