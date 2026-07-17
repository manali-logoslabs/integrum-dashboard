/**
 * Chart 11 — Surplus & Absorption Flow per Unit
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

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

const SHORT: Record<string,string> = {
  'BELLANDUR':'BLDR','BELLANDUR CORP. OFFICE':'BLDR Corp','ELECTRONIC CITY':'Elec City',
  'HRBR UNIT':'HRBR','KANAKAPURA':'Kanaka','MALLESWARAM':'Malles',
  'OLD AIRPORT ROAD':'Old Airport','SAHAKAR NAGAR':'Sahakar','SARJAPURA':'Sarjapur',
  'THANISANDRA':'Thanis','WHITEFIELD':'White',
}

export default function SurplusPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error } = useApi(() => api.c9.surplusAbsorption(month), [month])

  const labels = data?.map(r => SHORT[r.unit] ?? r.unit) ?? []

  const stackedData = data && {
    labels,
    datasets: [
      { label: 'Direct Matched', data: data.map(r => r.direct_matched_kwh),  backgroundColor: 'rgba(34,216,150,0.8)',  stack: 'absorbed' },
      { label: 'Banking Settled',data: data.map(r => r.banking_settled_kwh), backgroundColor: 'rgba(245,158,11,0.8)',  stack: 'absorbed' },
      { label: 'Grid Drawl',     data: data.map(r => r.grid_drawl_kwh),      backgroundColor: 'rgba(227,73,72,0.65)',  stack: 'cons' },
      { label: 'Banking Expired', data: data.map(r => r.banking_expired_kwh),  backgroundColor: 'rgba(139,92,246,0.7)',  stack: 'gen' },
    ],
  }

  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#8ba4be', boxWidth: 12 } } },
    scales: {
      x: { stacked: true, ticks: { color: '#5a7a9a', font: { size: 10 } }, grid: { color: '#1e3a5f' } },
      y: {
        stacked: false,
        ticks: { color: '#8ba4be', callback: (v: any) => `${(v/1000).toFixed(0)}k` },
        grid: { color: '#1e3a5f' },
        title: { display: true, text: 'kWh', color: '#5a7a9a' },
      },
    },
  } as const

  const totals = data && {
    gen:     data.reduce((s,r) => s + r.generation_kwh,      0),
    matched: data.reduce((s,r) => s + r.direct_matched_kwh,  0),
    banking: data.reduce((s,r) => s + r.banking_settled_kwh, 0),
    lapsed:  data.reduce((s,r) => s + r.banking_expired_kwh,  0),
    grid:    data.reduce((s,r) => s + r.grid_drawl_kwh,      0),
  }

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="Chart 11 — Surplus & Absorption Flow" />
      <div style={{ padding: 24 }}>

        {totals && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Generation',     val: fmt(totals.gen),     c: 'var(--color-green-light)' },
              { label: 'Direct Matched', val: fmt(totals.matched), c: '#22d896' },
              { label: 'Banking Settled',val: fmt(totals.banking), c: 'var(--color-amber)' },
              { label: 'Banking Expired', val: fmt(totals.lapsed),  c: 'var(--color-purple)' },
              { label: 'Grid Drawl',     val: fmt(totals.grid),    c: 'var(--color-red)' },
            ].map(({label,val,c}) => (
              <div key={label} className="card" style={{ textAlign:'center' }}>
                <div className="card-title">{label}</div>
                <div style={{ fontSize:17, fontWeight:700, color:c }}>{val}</div>
                <div style={{ fontSize:11, color:'var(--color-text-muted)' }}>kWh</div>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Energy Flow per Unit</div>
          {loading ? <LoadingState height={320} /> :
           error   ? <LoadingState error={error} height={320} /> :
           data    ? <div style={{ height: 320 }}><Bar data={stackedData!} options={opts} /></div> : null}
        </div>

        {data && (
          <div className="card" style={{ overflowX: 'auto' }}>
            <div className="card-title">Unit-wise Surplus Absorption</div>
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th style={{ textAlign:'right' }}>Generation</th>
                  <th style={{ textAlign:'right' }}>Consumption</th>
                  <th style={{ textAlign:'right' }}>Direct Match</th>
                  <th style={{ textAlign:'right' }}>Banking</th>
                  <th style={{ textAlign:'right' }}>Lapsed</th>
                  <th style={{ textAlign:'right' }}>Grid Drawl</th>
                  <th style={{ textAlign:'right' }}>RE %</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.unit}>
                    <td style={{ whiteSpace:'nowrap' }}>{r.unit}</td>
                    <td style={{ textAlign:'right' }}>{fmt(r.generation_kwh)}</td>
                    <td style={{ textAlign:'right' }}>{fmt(r.consumption_kwh)}</td>
                    <td style={{ textAlign:'right', color:'#22d896' }}>{fmt(r.direct_matched_kwh)}</td>
                    <td style={{ textAlign:'right', color:'var(--color-amber)' }}>{fmt(r.banking_settled_kwh)}</td>
                    <td style={{ textAlign:'right', color:'var(--color-purple)' }}>{fmt(r.banking_expired_kwh)}</td>
                    <td style={{ textAlign:'right', color:'var(--color-red)' }}>{fmt(r.grid_drawl_kwh)}</td>
                    <td style={{ textAlign:'right', color:'var(--color-green-light)' }}>{r.replacement_pct?.toFixed(1)}%</td>
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
