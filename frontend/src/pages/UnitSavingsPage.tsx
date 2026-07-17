/**
 * UnitSavingsPage — Charts 2, 5, 7
 * Tabs: Grid vs Actual (Chart 2) | With/Without Banking (Chart 5) | Summary Table (Chart 7)
 */
import React, { useContext, useState } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { MonthContext } from '../App'
import TopBar from '../components/layout/TopBar'
import LoadingState from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { api, type UnitSavingsRow } from '../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const fmtL = (n: number) => `₹${(n/100000).toFixed(2)}L`
const fmt  = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
const SHORT: Record<string,string> = {
  'BELLANDUR': 'BLDR', 'BELLANDUR CORP. OFFICE': 'BLDR Corp', 'ELECTRONIC CITY': 'Elec City',
  'HRBR UNIT': 'HRBR', 'KANAKAPURA': 'Kanaka', 'MALLESWARAM': 'Malles',
  'OLD AIRPORT ROAD': 'Old Airport', 'SAHAKAR NAGAR': 'Sahakar', 'SARJAPURA': 'Sarjapur',
  'THANISANDRA': 'Thanis', 'WHITEFIELD': 'White'
}

const OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#8ba4be', boxWidth: 12 } },
    tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${fmtL(c.raw)}` } },
  },
  scales: {
    x: { ticks: { color: '#5a7a9a', font: { size: 10 } }, grid: { color: '#1e3a5f' } },
    y: {
      ticks: { color: '#8ba4be', callback: (v: any) => fmtL(v) },
      grid: { color: '#1e3a5f' },
    },
  },
} as const

type Tab = 'cost' | 'banking' | 'table'

export default function UnitSavingsPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error } = useApi(() => api.c9.unitSavings(month), [month])
  const [tab, setTab] = useState<Tab>('cost')

  const labels = data?.map(r => SHORT[r.unit] ?? r.unit) ?? []

  const chart2 = data && {
    labels,
    datasets: [
      { label: 'Grid Cost',        data: data.map(r => r.grid_cost),                backgroundColor: 'rgba(227,73,72,0.7)' },
      { label: 'Actual Cost (w/ Banking)', data: data.map(r => r.actual_cost_with_banking), backgroundColor: 'rgba(59,130,246,0.7)' },
    ],
  }

  const chart5 = data && {
    labels,
    datasets: [
      { label: 'With Banking',    data: data.map(r => r.actual_cost_with_banking),  backgroundColor: 'rgba(34,216,150,0.75)' },
      { label: 'Without Banking', data: data.map(r => r.actual_cost_without_banking), backgroundColor: 'rgba(245,158,11,0.75)' },
    ],
  }

  const TAB_BTN = (t: Tab, label: string) => (
    <button key={t} onClick={() => setTab(t)} style={{
      padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
      background: tab === t ? 'var(--color-green)' : 'var(--color-card)',
      color: tab === t ? '#fff' : 'var(--color-text-secondary)',
    }}>{label}</button>
  )

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="Charts 2/5/7 — Unit Cost Analysis" />
      <div style={{ padding: 24 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {TAB_BTN('cost',    'Chart 2 — Grid vs Actual')}
          {TAB_BTN('banking', 'Chart 5 — With/Without Banking')}
          {TAB_BTN('table',   'Chart 7 — Summary Table')}
        </div>

        {loading ? <LoadingState height={380} /> :
         error   ? <LoadingState error={error} height={380} /> :
         data && (
          <>
            {tab === 'cost' && (
              <div className="card">
                <div className="card-title">Grid Cost vs Actual Cost with Banking — per Unit</div>
                <div style={{ height: 360 }}>
                  <Bar data={chart2!} options={OPTS} />
                </div>
              </div>
            )}

            {tab === 'banking' && (
              <div className="card">
                <div className="card-title">Actual Cost: With Banking vs Without Banking</div>
                <div style={{ height: 360 }}>
                  <Bar data={chart5!} options={OPTS} />
                </div>
              </div>
            )}

            {tab === 'table' && (
              <div className="card" style={{ overflowX: 'auto' }}>
                <div className="card-title">Unit-wise Cost Summary — {month}</div>
                <table>
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th style={{ textAlign: 'right' }}>Consumption</th>
                      <th style={{ textAlign: 'right' }}>Matched</th>
                      <th style={{ textAlign: 'right' }}>Grid Cost</th>
                      <th style={{ textAlign: 'right' }}>Actual Cost</th>
                      <th style={{ textAlign: 'right' }}>Savings</th>
                      <th style={{ textAlign: 'right' }}>Savings %</th>
                      <th style={{ textAlign: 'right' }}>RE %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map(r => (
                      <tr key={r.unit}>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.unit}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.consumption_kwh)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.matched_kwh)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtL(r.grid_cost)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtL(r.actual_cost_with_banking)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-green-light)' }}>{fmtL(r.savings_with_banking)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-green-light)' }}>{r.savings_pct_with_banking?.toFixed(1)}%</td>
                        <td style={{ textAlign: 'right' }}>{r.replacement_pct?.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
