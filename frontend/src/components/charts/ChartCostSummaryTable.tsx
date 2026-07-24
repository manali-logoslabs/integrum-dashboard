/**
 * ChartCostSummaryTable
 * =====================
 * Unit-wise Cost Summary Table — matches the old dashboard's
 * "Unit-wise Cost Summary Table" (Tab 1, below the heatmap).
 *
 * Columns: Consumption Unit | Grid Cost (₹) | Actual Cost (₹) | Savings (₹) | Savings (%)
 * Uses the same /unit-savings endpoint as Chart2PowerCost with fromMonth/toMonth range.
 */
import React from 'react'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

const inr = (n: number) => '₹' + (n / 1e5).toFixed(2) + 'L'
const pct = (n: number) => n.toFixed(1) + '%'

interface Props {
  month: string
  fromMonth?: string
  toMonth?: string
  unitIds?: string
}

export default function ChartCostSummaryTable({ month, fromMonth, toMonth, unitIds }: Props) {
  const fromM = fromMonth || month
  const toM   = toMonth   || month

  const params = unitIds ? { unit_ids: unitIds } : undefined
  const { data, loading } = useApi(
    () => api.c9.unitSavings(fromM, toM, params),
    [fromM, toM, unitIds]
  )

  if (loading) return (
    <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )
  if (!data?.length) return (
    <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
      No data for {fromM} – {toM}
    </div>
  )

  const totGrid   = data.reduce((s, r) => s + r.grid_cost, 0)
  const totActual = data.reduce((s, r) => s + r.actual_cost_with_banking, 0)
  const totSaved  = data.reduce((s, r) => s + r.savings_with_banking, 0)
  const totPct    = totGrid > 0 ? totSaved / totGrid * 100 : 0

  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-sec)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    borderBottom: '2px solid var(--border)',
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '7px 12px',
    fontSize: 12,
    borderBottom: '1px solid var(--border)',
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-elevated)' }}>
            <th style={{ ...thStyle, textAlign: 'left' }}>Consumption Unit</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Grid Cost (₹)</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Actual Cost (₹)</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Savings (₹)</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Savings (%)</th>
          </tr>
        </thead>
        <tbody>
          {data.map(r => {
            const sp = r.savings_pct_with_banking
            const pctColor = sp >= 75 ? 'var(--green-l)' : sp >= 50 ? 'var(--amber)' : 'var(--red)'
            return (
              <tr
                key={r.unit_code}
                style={{ transition: 'background .1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--card)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
              >
                <td style={{ ...tdStyle, color: 'var(--blue)', fontWeight: 600 }}>{r.unit}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--red)' }}>{inr(r.grid_cost)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-sec)' }}>{inr(r.actual_cost_with_banking)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--green-l)', fontWeight: 700 }}>{inr(r.savings_with_banking)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <span style={{
                    display: 'inline-block',
                    minWidth: 48,
                    padding: '2px 7px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    color: pctColor,
                    background: pctColor === 'var(--green-l)'
                      ? 'rgba(29,191,122,.12)'
                      : pctColor === 'var(--amber)'
                      ? 'rgba(251,191,36,.12)'
                      : 'rgba(239,68,68,.12)',
                    textAlign: 'center',
                  }}>
                    {pct(sp)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'rgba(29,191,122,.07)', borderTop: '2px solid var(--border)' }}>
            <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--text)', borderBottom: 'none' }}>GRAND TOTAL</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--red)', borderBottom: 'none' }}>{inr(totGrid)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--text-sec)', borderBottom: 'none' }}>{inr(totActual)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: 'var(--green-l)', borderBottom: 'none' }}>{inr(totSaved)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', borderBottom: 'none' }}>
              <span style={{
                display: 'inline-block',
                minWidth: 48,
                padding: '2px 7px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--green-l)',
                background: 'rgba(29,191,122,.18)',
                textAlign: 'center',
              }}>
                {pct(totPct)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
