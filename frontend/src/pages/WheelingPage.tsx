/**
 * Chart 10 — Wheeling Reconciliation (Proposed vs Actual)
 */
import React, { useContext } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { MonthContext } from '../App'
import TopBar from '../components/layout/TopBar'
import LoadingState from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const fmt  = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
const fmtL = (n: number) => `₹${(n/100000).toFixed(2)}L`

const STATUS_COLOR: Record<string,string> = {
  OK:    'var(--color-green-light)',
  OVER:  'var(--color-amber)',
  UNDER: 'var(--color-red)',
  INFO:  'var(--color-blue)',
}

const SHORT: Record<string,string> = {
  'BELLANDUR':'BLDR','BELLANDUR CORP. OFFICE':'BLDR Corp','ELECTRONIC CITY':'Elec City',
  'HRBR UNIT':'HRBR','KANAKAPURA':'Kanaka','MALLESWARAM':'Malles',
  'OLD AIRPORT ROAD':'Old Airport','SAHAKAR NAGAR':'Sahakar','SARJAPURA':'Sarjapur',
  'THANISANDRA':'Thanis','WHITEFIELD':'White',
}

export default function WheelingPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error } = useApi(() => api.c9.wheelingRecon(month), [month])

  const labels = data?.map(r => SHORT[r.unit] ?? r.unit) ?? []
  const gapColors = data?.map(r => r.gap_kwh > 0 ? 'rgba(245,158,11,0.8)' : r.gap_kwh < 0 ? 'rgba(227,73,72,0.75)' : 'rgba(34,216,150,0.75)') ?? []

  const chartData = data && {
    labels,
    datasets: [
      { label: 'Proposed (kWh)', data: data.map(r => r.proposed_kwh), backgroundColor: 'rgba(59,130,246,0.7)' },
      { label: 'Actual (kWh)',   data: data.map(r => r.actual_kwh),   backgroundColor: 'rgba(34,216,150,0.7)' },
    ],
  }

  const gapChart = data && {
    labels,
    datasets: [{ label: 'Gap (kWh)', data: data.map(r => r.gap_kwh), backgroundColor: gapColors }],
  }

  const totalGap    = data?.reduce((s, r) => s + r.gap_kwh,  0) ?? 0
  const totalGapINR = data?.reduce((s, r) => s + r.gap_inr,  0) ?? 0
  const overCount   = data?.filter(r => r.status === 'OVER').length ?? 0
  const underCount  = data?.filter(r => r.status === 'UNDER').length ?? 0

  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#8ba4be', boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: '#5a7a9a', font: { size: 10 } }, grid: { color: '#1e3a5f' } },
      y: { ticks: { color: '#8ba4be', callback: (v: any) => `${(v/1000).toFixed(0)}k` }, grid: { color: '#1e3a5f' } },
    },
  } as const

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="Chart 10 — Wheeling Reconciliation" />
      <div style={{ padding: 24 }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Net Gap (kWh)',  val: `${fmt(totalGap)} kWh`,  c: totalGap > 0 ? 'var(--color-amber)' : 'var(--color-red)' },
            { label: 'Net Gap (₹)',   val: fmtL(totalGapINR),        c: totalGapINR > 0 ? 'var(--color-amber)' : 'var(--color-red)' },
            { label: 'Over-stated',   val: `${overCount} units`,     c: 'var(--color-amber)' },
            { label: 'Under-stated',  val: `${underCount} units`,    c: 'var(--color-red)' },
          ].map(({ label, val, c }) => (
            <div key={label} className="card" style={{ textAlign: 'center' }}>
              <div className="card-title">{label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: c }}>{val}</div>
            </div>
          ))}
        </div>

        {loading ? <LoadingState height={320} /> :
         error   ? <LoadingState error={error} height={320} /> :
         data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 16 }}>
              <div className="card">
                <div className="card-title">Proposed vs Actual Wheeling</div>
                <div style={{ height: 280 }}><Bar data={chartData!} options={opts} /></div>
              </div>
              <div className="card">
                <div className="card-title">Gap per Unit (kWh)</div>
                <div style={{ height: 280 }}><Bar data={gapChart!} options={opts} /></div>
              </div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
              <div className="card-title">Reconciliation Detail</div>
              <table>
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>Proposed (kWh)</th>
                    <th style={{ textAlign: 'right' }}>Actual (kWh)</th>
                    <th style={{ textAlign: 'right' }}>Gap (kWh)</th>
                    <th style={{ textAlign: 'right' }}>Gap (₹)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(r => (
                    <tr key={r.unit}>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.unit}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.proposed_kwh)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.actual_kwh)}</td>
                      <td style={{ textAlign: 'right', color: r.gap_kwh > 0 ? 'var(--color-amber)' : r.gap_kwh < 0 ? 'var(--color-red)' : 'var(--color-green-light)' }}>
                        {r.gap_kwh > 0 ? '+' : ''}{fmt(r.gap_kwh)}
                      </td>
                      <td style={{ textAlign: 'right', color: r.gap_inr > 0 ? 'var(--color-amber)' : 'var(--color-red)' }}>
                        {r.gap_inr !== 0 ? (r.gap_inr > 0 ? '+' : '') + fmtL(r.gap_inr) : '—'}
                      </td>
                      <td>
                        <span className="badge" style={{ background: `${STATUS_COLOR[r.status]}22`, color: STATUS_COLOR[r.status] }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
