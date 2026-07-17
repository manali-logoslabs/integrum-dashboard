import React, { useContext } from 'react'
import { MonthContext } from '../App'
import TopBar from '../components/layout/TopBar'
import KpiCard from '../components/ui/KpiCard'
import LoadingState from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'

const fmt  = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
const fmtC = (n: number) => `₹${(n/100000).toFixed(2)}L`

export default function OverviewPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error } = useApi(() => api.c9.kpiSummary(month), [month])

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="Overview — C9 Client" />

      <div style={{ padding: '24px' }}>
        {loading || error || !data ? (
          <LoadingState error={error} height={120} />
        ) : (
          <>
            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
              <KpiCard label="Solar Generation"  value={`${fmt(data.total_generation_kwh)} kWh`}  icon="☀️" color="var(--color-green-light)" />
              <KpiCard label="Total Consumption" value={`${fmt(data.total_consumption_kwh)} kWh`} icon="⚡" />
              <KpiCard label="RE Settled"        value={`${fmt(data.total_matched_kwh)} kWh`}     icon="🔗" color="var(--color-amber)" />
              <KpiCard label="Grid Cost"         value={fmtC(data.total_grid_cost_inr)}            icon="🏭" color="var(--color-red)" />
              <KpiCard label="Actual Cost"       value={fmtC(data.total_actual_cost_inr)}          icon="💰" color="var(--color-blue)" />
              <KpiCard label="Total Savings"     value={fmtC(data.total_savings_inr)}              icon="📈" color="var(--color-green-light)"
                       sub={`${data.savings_pct.toFixed(1)}% savings vs grid`} />
            </div>

            {/* Quick summary card */}
            <div className="card">
              <div className="card-title">August 2025 — Month Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
                <div style={{ color: 'var(--color-text-secondary)' }}>Settlement Month</div>
                <div>August 2025</div>
                <div style={{ color: 'var(--color-text-secondary)' }}>Client</div>
                <div>C9 — Integrum Energy (BESCOM, Karnataka)</div>
                <div style={{ color: 'var(--color-text-secondary)' }}>Units</div>
                <div>11 HT connections (Solar Wheeling)</div>
                <div style={{ color: 'var(--color-text-secondary)' }}>PPA Rate</div>
                <div>₹2.50/kWh</div>
                <div style={{ color: 'var(--color-text-secondary)' }}>Tariff Bands</div>
                <div>₹7.20/kWh (4 units) · ₹5.95/kWh (7 units)</div>
                <div style={{ color: 'var(--color-text-secondary)' }}>Banking Loss</div>
                <div>8% on gross surplus</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
