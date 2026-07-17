/**
 * Chart 8 — Banking Loss per Unit
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

const SHORT: Record<string,string> = {
  'BELLANDUR':'BLDR','BELLANDUR CORP. OFFICE':'BLDR Corp','ELECTRONIC CITY':'Elec City',
  'HRBR UNIT':'HRBR','KANAKAPURA':'Kanaka','MALLESWARAM':'Malles',
  'OLD AIRPORT ROAD':'Old Airport','SAHAKAR NAGAR':'Sahakar','SARJAPURA':'Sarjapur',
  'THANISANDRA':'Thanis','WHITEFIELD':'White',
}

export default function BankingPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error } = useApi(() => api.c9.bankingLoss(month), [month])

  const labels = data?.map(r => SHORT[r.unit] ?? r.unit) ?? []

  const chartData = data && {
    labels,
    datasets: [
      { label: 'Gross Banked',    data: data.map(r => r.gross_banked_kwh),  backgroundColor: 'rgba(59,130,246,0.7)'  },
      { label: '8% Loss',         data: data.map(r => r.banking_loss_kwh),  backgroundColor: 'rgba(227,73,72,0.75)' },
      { label: 'Net Settled',     data: data.map(r => r.settled_kwh),       backgroundColor: 'rgba(34,216,150,0.75)' },
    ],
  }

  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#8ba4be', boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: '#5a7a9a', font: { size: 10 } }, grid: { color: '#1e3a5f' } },
      y: {
        ticks: { color: '#8ba4be', callback: (v: any) => `${(v/1000).toFixed(0)}k` },
        grid: { color: '#1e3a5f' },
        title: { display: true, text: 'kWh', color: '#5a7a9a' },
      },
    },
  } as const

  const totGross  = data?.reduce((s, r) => s + r.gross_banked_kwh,  0) ?? 0
  const totLoss   = data?.reduce((s, r) => s + r.banking_loss_kwh,  0) ?? 0
  const totSettled= data?.reduce((s, r) => s + r.settled_kwh,       0) ?? 0
  const totLossINR= data?.reduce((s, r) => s + r.loss_inr,          0) ?? 0

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="Chart 8 — Banking Loss Analysis" />
      <div style={{ padding: 24 }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Gross Surplus Banked', val: `${fmt(totGross)} kWh`,   c: 'var(--color-blue)' },
            { label: '8% Banking Loss',      val: `${fmt(totLoss)} kWh`,    c: 'var(--color-red)' },
            { label: 'Net Settled',          val: `${fmt(totSettled)} kWh`, c: 'var(--color-green-light)' },
            { label: 'Loss Value',           val: fmtL(totLossINR),         c: 'var(--color-red)' },
          ].map(({ label, val, c }) => (
            <div key={label} className="card" style={{ textAlign: 'center' }}>
              <div className="card-title">{label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: c }}>{val}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Banking Flow per Unit</div>
          {loading ? <LoadingState height={320} /> :
           error   ? <LoadingState error={error} height={320} /> :
           data    ? <div style={{ height: 320 }}><Bar data={chartData!} options={opts} /></div> : null}
        </div>

        {data && (
          <div className="card" style={{ overflowX: 'auto' }}>
            <div className="card-title">Unit-wise Banking Detail</div>
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Gross Banked</th>
                  <th style={{ textAlign: 'right' }}>8% Loss (kWh)</th>
                  <th style={{ textAlign: 'right' }}>Net Available</th>
                  <th style={{ textAlign: 'right' }}>Settled</th>
                  <th style={{ textAlign: 'right' }}>Expired</th>
                  <th style={{ textAlign: 'right' }}>Loss (₹)</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.unit}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.unit}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.gross_banked_kwh)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-red)' }}>{fmt(r.banking_loss_kwh)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.net_banked_kwh)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-green-light)' }}>{fmt(r.settled_kwh)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.expired_kwh)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-red)' }}>₹{r.loss_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
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
