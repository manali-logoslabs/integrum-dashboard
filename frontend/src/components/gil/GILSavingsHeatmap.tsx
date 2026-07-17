/**
 * GILSavingsHeatmap.tsx — All months savings % + cost summary
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
const inr = (n: number) => n >= 1e7 ? `₹${(n/1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n/1e5).toFixed(2)}L` : n >= 1e3 ? `₹${(n/1e3).toFixed(1)}K` : `₹${n.toFixed(0)}`

const OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: {
        label: (ctx: any) => ctx.dataset.label === 'Savings %'
          ? ` Savings: ${(ctx.raw as number).toFixed(1)}%`
          : ` ${ctx.dataset.label}: ${inr(ctx.raw as number)}`,
      },
    },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 9 }, maxRotation: 45 } },
    y:  { type: 'linear', position: 'left',  grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => inr(v) } },
    y1: { type: 'linear', position: 'right', grid: { display: false }, ticks: { color: '#10b981', font: { size: 10 }, callback: (v: any) => `${v}%` }, min: 0, max: 100 },
  },
}

export default function GILSavingsHeatmap() {
  const { data, loading } = useApi(() => api.gil.savingsHeatmap(), [])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No savings data available</div>

  const totalSavings  = data.reduce((s, r) => s + n2f(r.savings_inr), 0)
  const avgSavingsPct = data.reduce((s, r) => s + n2f(r.savings_pct), 0) / (data.length || 1)

  const chartData: any = {
    labels: data.map(r => r.month),
    datasets: [
      { label: 'Grid Cost',   data: data.map(r => r.grid_cost_inr),   backgroundColor: 'rgba(248,113,113,.5)', borderRadius: 3, yAxisID: 'y' },
      { label: 'Actual Cost', data: data.map(r => r.actual_cost_inr), backgroundColor: 'rgba(96,165,250,.6)',  borderRadius: 3, yAxisID: 'y' },
      { type: 'line', label: 'Savings %', data: data.map(r => r.savings_pct ?? 0),
        borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.15)',
        pointBackgroundColor: '#10b981', pointRadius: 3, tension: 0.35, yAxisID: 'y1', fill: true },
    ],
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cumulative Savings: <strong style={{ color: '#10b981' }}>{inr(totalSavings)}</strong></span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg Savings %: <strong style={{ color: '#f59e0b' }}>{avgSavingsPct.toFixed(1)}%</strong></span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{data.length} months</span>
      </div>
      <div style={{ height: 220 }}>
        <Bar data={chartData} options={OPTS} />
      </div>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr>{['Month','Grid Cost','Actual Cost','Savings','Savings %','Replacement%'].map(h => (
              <th key={h} style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, padding: '3px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {[...data].reverse().slice(0, 6).map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                <td style={{ padding: '3px 6px', color: 'var(--text-sec)', textAlign: 'right' }}>{r.month}</td>
                <td style={{ padding: '3px 6px', color: '#f87171', textAlign: 'right' }}>{inr(n2f(r.grid_cost_inr))}</td>
                <td style={{ padding: '3px 6px', color: '#60a5fa', textAlign: 'right' }}>{inr(n2f(r.actual_cost_inr))}</td>
                <td style={{ padding: '3px 6px', color: '#10b981', textAlign: 'right', fontWeight: 600 }}>{inr(n2f(r.savings_inr))}</td>
                <td style={{ padding: '3px 6px', color: '#f59e0b', textAlign: 'right', fontWeight: 600 }}>{n2f(r.savings_pct).toFixed(1)}%</td>
                <td style={{ padding: '3px 6px', color: '#a78bfa', textAlign: 'right' }}>{n2f(r.replacement_pct).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
