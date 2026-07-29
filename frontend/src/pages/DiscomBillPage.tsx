/**
 * Chart 6 — DISCOM Bill Breakdown per Unit
 * Includes: per-unit bill summary + Electricity Consumption Summary (all months)
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

const TH: React.CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { textAlign: 'right' }

export default function DiscomBillPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error }     = useApi(() => api.c9.discomBill(month), [month])
  const { data: summary, loading: sumLoading } = useApi(() => api.c9.consumptionSummary(), [])

  const totalSavings = data?.reduce((s, r) => s + (r.savings_inr ?? 0), 0)
  const totalGrid    = data?.reduce((s, r) => s + (r.gross_amount_inr ?? 0), 0)
  const totalActual  = data?.reduce((s, r) => s + (r.net_payable_inr ?? 0), 0)

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="DISCOM Bill – All Units" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── KPI strip ─────────────────────────────────────────────────── */}
        {totalSavings != null && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {[
              { label: 'Total Grid Bill (Without RE)', val: fmtL(totalGrid!),    c: 'var(--color-red)' },
              { label: 'Total Actual (With RE)',        val: fmtL(totalActual!),  c: 'var(--color-blue)' },
              { label: 'Total RE Savings',              val: fmtL(totalSavings!), c: 'var(--color-green-light)' },
            ].map(({ label, val, c }) => (
              <div key={label} className="card" style={{ textAlign: 'center' }}>
                <div className="card-title">{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── DISCOM Bill per unit (selected month) ─────────────────────── */}
        {loading  ? <LoadingState height={280} /> :
         error    ? <LoadingState error={error} height={280} /> :
         data && (
          <div className="card" style={{ overflowX: 'auto' }}>
            <div className="card-title">DISCOM Bill per Unit — {month}</div>
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th style={TH}>Consumption (kWh)</th>
                  <th style={TH}>Peak Demand (kVA)</th>
                  <th style={TH}>Grid Bill (₹)</th>
                  <th style={TH}>DISCOM Bill (₹)</th>
                  <th style={TH}>PPA Cost (₹)</th>
                  <th style={TH}>RE Savings (₹)</th>
                  <th style={TH}>Rate (₹/kWh)</th>
                  <th style={TH}>Wheeling (kWh)</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.unit_code}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.unit_name}</td>
                    <td style={TD}>{fmt(r.total_units_kwh)}</td>
                    <td style={TD}>{(r.peak_demand_kva ?? 0).toFixed(1)}</td>
                    <td style={{ ...TD, color: 'var(--color-red)' }}>{fmtL(r.gross_amount_inr)}</td>
                    <td style={{ ...TD, color: 'var(--color-blue)' }}>{fmtL(r.net_payable_inr)}</td>
                    <td style={TD}>{fmtL(r.ppa_cost_inr ?? 0)}</td>
                    <td style={{ ...TD, color: 'var(--color-green-light)' }}>{fmtL(r.savings_inr)}</td>
                    <td style={TD}>{fmtR(r.energy_rate_per_kwh)}</td>
                    <td style={TD}>{fmt(r.wheeling_energy_kwh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Electricity Consumption Summary (all months) ──────────────── */}
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="card-title">⚡ Electricity Consumption Summary</div>
          {sumLoading ? <LoadingState height={200} /> : (
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Location</th>
                  <th style={TH}>Total Units Consumed (kWh)</th>
                  <th style={TH}>Bill Without Solar Credit (₹)</th>
                  <th style={TH}>Effective Rate / Unit (₹/kWh)</th>
                </tr>
              </thead>
              <tbody>
                {(summary ?? []).map((r, i) => (
                  <tr key={`${r.month}-${r.unit_code}`}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.month}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.unit_code}</td>
                    <td style={TD}>{r.consumption_kwh.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ ...TD, color: 'var(--color-red)' }}>
                      ₹{r.gross_bill_inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...TD, color: r.effective_rate >= 8 ? 'var(--color-red)' : 'inherit' }}>
                      ₹{r.effective_rate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
