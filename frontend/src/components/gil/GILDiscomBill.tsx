/**
 * GILDiscomBill.tsx — MSEDCL Bill breakdown (Doughnut + table)
 */
import React from 'react'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Doughnut, Pie, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement)
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(ArcElement, Tooltip, Legend)

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
const inr_fmt = (n: number) => n >= 1e7 ? `₹${(n/1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n/1e5).toFixed(2)}L` : n >= 1e3 ? `₹${(n/1e3).toFixed(1)}K` : `₹${n.toFixed(0)}`

const CHART_COLORS = [
  'rgba(96,165,250,.85)',  'rgba(251,191,36,.85)', 'rgba(248,113,113,.85)',
  'rgba(52,211,153,.85)',  'rgba(167,139,250,.85)', 'rgba(249,115,22,.85)',
  'rgba(236,72,153,.85)',  'rgba(14,165,233,.85)',
]

const PIE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right', labels: { color: '#7A9BBF', font: { size: 10 }, boxWidth: 12, padding: 8 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      callbacks: {
        label: (ctx: any) => ` ${ctx.label}: ${inr_fmt(ctx.raw as number)} (${(ctx.parsed * 100 / (ctx.dataset.data.reduce((a: number, b: number) => a + b, 0))).toFixed(1)}%)`,
      },
    },
  },
}

const BAR_OPTS: any = {
  indexAxis: 'y', responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1, callbacks: { label: (ctx: any) => ` ${inr_fmt(ctx.raw as number)}` } },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 9 }, callback: (v: any) => inr_fmt(v) } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 9 } } },
  },
}

export default function GILDiscomBill({ month, chartType = 'doughnut' }: { month: string; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.discomBill(month), [month])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data || (data as any).no_data) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No bill data for {month}</div>

  const items    = data.line_items ?? []
  const amounts  = items.map(i => n2f(i.amount_inr))
  const totalPay = n2f(data.total_payable_inr)
  const netPay   = n2f(data.net_payable_after_re)
  const savings  = n2f(data.savings_inr)

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Gross Bill',    value: inr_fmt(totalPay), color: '#f87171' },
          { label: 'Net After RE',  value: inr_fmt(netPay),   color: '#60a5fa' },
          { label: 'RE Savings',    value: inr_fmt(savings),  color: '#10b981' },
          { label: 'Source',        value: data.data_source === 'actual_bill' ? '✅ Actual' : '⚠️ Est.', color: data.data_source === 'actual_bill' ? '#10b981' : '#f59e0b' },
        ].map(c => (
          <div key={c.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <div style={{ height: 180 }}>
          {chartType === 'pie' && <Pie data={{ labels: items.map(i => i.charge_head), datasets: [{ data: amounts, backgroundColor: CHART_COLORS, borderWidth: 0 }] }} options={PIE_OPTS} />}
          {chartType !== 'pie' && chartType !== 'bar' && <Doughnut data={{ labels: items.map(i => i.charge_head), datasets: [{ data: amounts, backgroundColor: CHART_COLORS, borderWidth: 0 }] }} options={PIE_OPTS} />}
          {chartType === 'bar' && <Bar data={{ labels: items.map(i => i.charge_head), datasets: [{ data: amounts, backgroundColor: CHART_COLORS, borderRadius: 4 }] }} options={BAR_OPTS} />}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginTop: 10 }}>
        <thead>
          <tr>
            {['Charge Head', 'Units (kWh)', 'Rate', 'Amount'].map(h => (
              <th key={h} style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, padding: '3px 4px', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <td style={{ padding: '3px 4px', color: 'var(--text-sec)' }}>{item.charge_head}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-sec)' }}>{item.quantity != null ? n2f(item.quantity).toFixed(0) : '—'}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', color: 'var(--text-sec)' }}>{item.rate != null ? `₹${n2f(item.rate).toFixed(4)}` : '—'}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>{inr_fmt(n2f(item.amount_inr))}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid var(--border)' }}>
            <td colSpan={3} style={{ padding: '4px 4px', color: 'var(--text)', fontWeight: 700 }}>Net Payable After RE</td>
            <td style={{ padding: '4px 4px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{inr_fmt(netPay)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
