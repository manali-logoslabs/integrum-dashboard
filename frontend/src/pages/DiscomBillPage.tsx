/**
 * Chart 6 — DISCOM Bill Breakdown per Unit
 */
import React, { useContext } from 'react'
import { MonthContext } from '../App'
import TopBar from '../components/layout/TopBar'
import LoadingState from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'

const fmtL  = (n: number | null) => n != null ? `₹${(n/100000).toFixed(2)}L` : '—'
const fmt   = (n: number | null) => n != null ? n.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'
const fmtR  = (n: number | null) => n != null ? `₹${n.toFixed(2)}` : '—'

export default function DiscomBillPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error } = useApi(() => api.c9.discomBill(month), [month])

  const totalSavings   = data?.reduce((s, r) => s + (r.savings_inr ?? 0), 0)
  const totalGrid      = data?.reduce((s, r) => s + (r.gross_amount_inr ?? 0), 0)
  const totalActual    = data?.reduce((s, r) => s + (r.net_payable_inr ?? 0), 0)

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="Chart 6 — DISCOM Bill Breakdown" />
      <div style={{ padding: 24 }}>

        {totalSavings != null && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Total Grid Bill (Without RE)', val: fmtL(totalGrid!),   c: 'var(--color-red)' },
              { label: 'Total Actual (With RE)',       val: fmtL(totalActual!),  c: 'var(--color-blue)' },
              { label: 'Total RE Savings',             val: fmtL(totalSavings!), c: 'var(--color-green-light)' },
            ].map(({ label, val, c }) => (
              <div key={label} className="card" style={{ textAlign: 'center' }}>
                <div className="card-title">{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {loading ? <LoadingState height={380} /> :
         error   ? <LoadingState error={error} height={380} /> :
         data && (
          <div className="card" style={{ overflowX: 'auto' }}>
            <div className="card-title">DISCOM Bill per Unit — {month}</div>
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Consumption</th>
                  <th style={{ textAlign: 'right' }}>Grid Bill</th>
                  <th style={{ textAlign: 'right' }}>Actual Bill</th>
                  <th style={{ textAlign: 'right' }}>RE Savings</th>
                  <th style={{ textAlign: 'right' }}>Energy Rate</th>
                  <th style={{ textAlign: 'right' }}>Wheeling (kWh)</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.unit_name}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.unit_name}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.total_units_kwh)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-red)' }}>{fmtL(r.gross_amount_inr)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-blue)' }}>{fmtL(r.net_payable_inr)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-green-light)' }}>{fmtL(r.savings_inr)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtR(r.energy_rate_per_kwh)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.wheeling_energy_kwh)}</td>
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
