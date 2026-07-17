/**
 * GILCostComparison.tsx — Grid cost vs Actual RE cost trend
 * Supports chartType: 'bar' | 'line' | 'area'
 */
import React from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  LineElement, PointElement, BarElement,
  Filler, Tooltip, Legend,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, BarElement, Filler, Tooltip, Legend)

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
const inr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr` :
  n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L`  :
  n >= 1e3 ? `₹${(n / 1e3).toFixed(1)}K`  :
  `₹${n.toFixed(0)}`

const opts: any = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${inr(ctx.raw as number)}` },
    },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 10 } } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => inr(v) } },
  },
}

export default function GILCostComparison({ months = 13, chartType = 'bar' }: { months?: number; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.costComparison(months), [months])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data available</div>

  const labels       = data.map(r => r.month)
  const totalGrid    = data.reduce((s, r) => s + n2f(r.grid_cost_inr), 0)
  const totalActual  = data.reduce((s, r) => s + n2f(r.actual_cost_inr), 0)
  const totalSavings = totalGrid - totalActual
  const isArea = chartType === 'area'
  const isLine = chartType === 'line' || isArea

  const lineDs: any[] = [
    { label: 'Grid Cost (Base)',  data: data.map(r => r.grid_cost_inr),              borderColor: '#f87171', backgroundColor: isArea ? 'rgba(248,113,113,.15)' : 'rgba(248,113,113,.8)', fill: isArea, tension: 0.3, pointRadius: 2 },
    { label: 'Actual RE Cost',    data: data.map(r => r.actual_cost_inr),             borderColor: '#60a5fa', backgroundColor: isArea ? 'rgba(96,165,250,.12)'  : 'rgba(96,165,250,.8)',  fill: isArea, tension: 0.3, pointRadius: 2 },
    { label: 'Savings',           data: data.map(r => r.savings_with_banking_inr),    borderColor: '#10b981', backgroundColor: isArea ? 'rgba(16,185,129,.15)'  : 'rgba(16,185,129,.8)',  fill: isArea, tension: 0.3, pointRadius: 2 },
  ]

  const barDs: any[] = [
    { label: 'Grid Cost (Base)', data: data.map(r => r.grid_cost_inr),           backgroundColor: 'rgba(248,113,113,.8)', borderRadius: 3 },
    { label: 'Actual RE Cost',   data: data.map(r => r.actual_cost_inr),          backgroundColor: 'rgba(96,165,250,.8)',  borderRadius: 3 },
    { label: 'Savings',          data: data.map(r => r.savings_with_banking_inr), backgroundColor: 'rgba(16,185,129,.8)',  borderRadius: 3 },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Cumulative Grid Cost',   value: inr(totalGrid),    color: '#f87171' },
          { label: 'Cumulative RE Cost',     value: inr(totalActual),  color: '#60a5fa' },
          { label: 'Total Savings',          value: inr(totalSavings), color: '#10b981' },
        ].map(k => (
          <div key={k.label}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 220 }}>
        {isLine
          ? <Line data={{ labels, datasets: lineDs }} options={opts} />
          : <Bar  data={{ labels, datasets: barDs  }} options={opts} />
        }
      </div>
    </div>
  )
}
