/**
 * GILRECosts.tsx — RE Plant Cost Components (ASSET_MC, OPERATING_CHARGES_MSEDCL, etc.)
 */
import React from 'react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(ArcElement, Tooltip, Legend)

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
const inr_fmt = (n: number) => n >= 1e7 ? `₹${(n/1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n/1e5).toFixed(2)}L` : n >= 1e3 ? `₹${(n/1e3).toFixed(1)}K` : `₹${n.toFixed(0)}`

const COLORS = ['rgba(16,185,129,.85)', 'rgba(251,191,36,.85)', 'rgba(96,165,250,.85)', 'rgba(248,113,113,.85)', 'rgba(167,139,250,.85)', 'rgba(249,115,22,.85)']

const PIE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right', labels: { color: '#7A9BBF', font: { size: 10 }, boxWidth: 12, padding: 8 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      callbacks: {
        label: (ctx: any) => ` ${ctx.label}: ${inr_fmt(ctx.raw as number)}`,
      },
    },
  },
}

export default function GILRECosts({ month, chartType = 'doughnut' }: { month: string; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.reCosts(month), [month])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No RE cost data for {month}</div>

  const items = data.line_items ?? []

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Total RE Cost', value: inr_fmt(n2f(data.total_re_cost_inr)), color: '#f87171' },
          { label: 'Per Unit',      value: data.per_unit_cost != null ? `₹${n2f(data.per_unit_cost).toFixed(4)}/kWh` : '—', color: '#60a5fa' },
          { label: 'Generation',   value: `${(n2f(data.generation_kwh)/1000).toFixed(1)} MWh`, color: '#10b981' },
          { label: 'Source',       value: data.data_source === 'actual_bill' ? '✅ Actual' : '⚠️ Est.', color: data.data_source === 'actual_bill' ? '#10b981' : '#f59e0b' },
        ].map(c => (
          <div key={c.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <div style={{ height: 180 }}>
          <Doughnut data={{
            labels: items.map(i => i.charge_head),
            datasets: [{ data: items.map(i => n2f(i.amount_inr)), backgroundColor: COLORS, borderWidth: 0 }],
          }} options={PIE_OPTS} />
        </div>
      )}
      {/* chartType prop accepted for API consistency; Doughnut is always used for this component */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 10 }}>
        <thead>
          <tr>
            {['Cost Component', 'Amount'].map(h => (
              <th key={h} style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, padding: '3px 4px', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              <td style={{ padding: '3px 4px', textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>{inr_fmt(n2f(item.amount_inr))}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid var(--border)' }}>
            <td style={{ padding: '4px 4px', color: 'var(--text)', fontWeight: 700 }}>Total RE Cost</td>
            <td style={{ padding: '4px 4px', textAlign: 'right', color: '#f87171', fontWeight: 700 }}>{inr_fmt(n2f(data.total_re_cost_inr))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
