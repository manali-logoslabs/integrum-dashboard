/**
 * GILTodAnalysis.tsx — MSEDCL 3-slot TOD breakdown (PEAK / NORMAL / OFF_PEAK)
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js'
import { Bar, Pie, Doughnut } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const SLOT_COLORS: Record<string, string> = {
  PEAK:     'rgba(245,101,101,.85)',
  NORMAL:   'rgba(74,158,255,.85)',
  OFF_PEAK: 'rgba(100,116,139,.75)',
}

const OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: {
        label: (ctx: any) => ` ${ctx.dataset.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh`,
      },
    },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 10 } } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v/1000).toFixed(0)}k` } },
  },
}

const inr_fmt = (n: number) => n >= 1e5 ? `₹${(n/1e5).toFixed(2)}L` : n >= 1e3 ? `₹${(n/1e3).toFixed(1)}K` : `₹${n.toFixed(0)}`
const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0

const ARC_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right', labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
    },
  },
}

export default function GILTodAnalysis({ month, chartType = 'bar' }: { month: string; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.todAnalysis(month), [month])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const labels = data.map(r => r.slot_label ?? r.tod_slot)
  const totalSavings = data.reduce((s, r) => s + n2f(r.cost_savings_inr), 0)
  const isArc = chartType === 'pie' || chartType === 'doughnut'
  const arcData = {
    labels,
    datasets: [{ data: data.map(r => r.generation_kwh), backgroundColor: data.map(r => SLOT_COLORS[r.tod_slot] ?? 'rgba(16,185,129,.8)'), borderWidth: 1 }],
  }

  return (
    <div>
      <div style={{ height: 200 }}>
        {chartType === 'pie'      && <Pie      data={arcData} options={ARC_OPTS} />}
        {chartType === 'doughnut' && <Doughnut data={arcData} options={ARC_OPTS} />}
        {!isArc && <Bar data={{ labels, datasets: [
          { label: 'Generation',  data: data.map(r => r.generation_kwh),  backgroundColor: data.map(r => SLOT_COLORS[r.tod_slot] ?? 'rgba(16,185,129,.8)'), borderRadius: 5 },
          { label: 'Consumption', data: data.map(r => r.consumption_kwh), backgroundColor: 'rgba(96,165,250,.55)', borderRadius: 5 },
        ]}} options={OPTS} />}
      </div>
      {/* Rate + savings row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
        {data.map(r => (
          <div key={r.tod_slot} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${SLOT_COLORS[r.tod_slot] ?? 'var(--border)'}`, borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: SLOT_COLORS[r.tod_slot] ?? '#10b981' }}>{r.slot_label ?? r.tod_slot}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', margin: '2px 0' }}>Rate: ₹{r.tod_multiplier?.toFixed(2) ?? '—'} × base</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>{inr_fmt(r.cost_savings_inr ?? 0)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>savings</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        Total TOD Savings: <strong style={{ color: '#f59e0b' }}>{inr_fmt(totalSavings)}</strong>
      </div>
    </div>
  )
}
