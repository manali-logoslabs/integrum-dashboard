/**
 * Chart 4 — TOD Slot Analysis
 * Supports: bar (default) | pie | doughnut
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement } from 'chart.js'
import { Bar, Pie, Doughnut } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'
import type { ChartType } from '../../pages/DashboardPage'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement)

const SLOT_LABELS: Record<string, string> = {
  MORNING_PEAK:   'Morning Peak 06–09h (×1.5)',
  DAY_NORMAL:     'Day Normal 09–18h (×1.0)',
  EVENING_PEAK:   'Evening Peak 18–22h (×1.5)',
  NIGHT_OFF_PEAK: 'Night Off-Peak 22–06h (×0.75)',
}

const BAR_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh` },
    },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 10 } } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v/1000).toFixed(0)}k` } },
  },
}

const PIE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: '#7A9BBF', font: { size: 10 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      callbacks: { label: (ctx: any) => ` ${ctx.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh` },
    },
  },
}

const SLOT_COLORS = ['rgba(245,166,35,.85)', 'rgba(74,158,255,.85)', 'rgba(245,50,50,.85)', 'rgba(29,191,122,.85)']

export default function Chart4Tod({ month, chartType = 'bar', unitIds }: { month: string; chartType?: ChartType; unitIds?: string }) {
  const { data, loading } = useApi(() => api.c9.todAnalysis(month, unitIds ? { unit_ids: unitIds } : undefined), [month, unitIds])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const ORDER = ['MORNING_PEAK', 'DAY_NORMAL', 'EVENING_PEAK', 'NIGHT_OFF_PEAK']
  const sorted = ORDER.map(code => data.find(r => r.tod_slot === code)).filter(Boolean) as typeof data
  const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
  const total_gen  = sorted.reduce((s, r) => s + n2f(r.generation_kwh), 0)
  const total_cons = sorted.reduce((s, r) => s + n2f(r.consumption_kwh), 0)
  const slotLabels = sorted.map(r => (r as any).slot_label ?? SLOT_LABELS[r.tod_slot] ?? r.tod_slot)

  const total_savings = sorted.reduce((s, r) => s + ((r as any).cost_savings_inr ?? 0), 0)
  const n2f_inr = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
  const inr_fmt = (n: number) => n >= 1e5 ? `₹${(n/1e5).toFixed(2)}L` : n >= 1e3 ? `₹${(n/1e3).toFixed(1)}K` : `₹${n.toFixed(0)}`

  const summary = (
    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Gen: <strong style={{ color: 'var(--green-l)' }}>{(total_gen / 1000).toFixed(1)} MWh</strong></div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Cons: <strong style={{ color: 'var(--blue)' }}>{(total_cons / 1000).toFixed(1)} MWh</strong></div>
      {total_savings > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Est. Cost Savings: <strong style={{ color: 'var(--amber)' }}>{inr_fmt(total_savings)}</strong></div>
      )}
    </div>
  )

  const costRow = total_savings > 0 ? (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
      {sorted.map((r, i) => (
        <div key={r.tod_slot} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${SLOT_COLORS[i]}`, borderRadius: 6, padding: '5px 8px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.tod_slot.replace('_', ' ')}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)' }}>{inr_fmt(n2f_inr((r as any).cost_savings_inr))}</div>
        </div>
      ))}
    </div>
  ) : null

  return (
    <div>
      <div style={{ height: 210 }}>
        <Bar data={{ labels: slotLabels, datasets: [
          { label: 'Generation', data: sorted.map(r => r.generation_kwh), backgroundColor: 'rgba(29,191,122,.8)', borderRadius: 5 },
          { label: 'Consumption', data: sorted.map(r => r.consumption_kwh), backgroundColor: 'rgba(74,158,255,.8)', borderRadius: 5 },
        ]}} options={BAR_OPTS} />
      </div>
      {summary}
      {costRow}
    </div>
  )
}
