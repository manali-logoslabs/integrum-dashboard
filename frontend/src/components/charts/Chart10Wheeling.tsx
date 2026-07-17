/**
 * Chart 10 — Wheeling Reconciliation
 * Supports: bar (default) | pie
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement } from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'
import type { ChartType } from '../../pages/DashboardPage'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement)

const BAR_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 }, position: 'bottom' as const },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh` },
    },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v/1000).toFixed(0)}k` } },
    y: { grid: { display: false }, ticks: { color: '#E2EEF9', font: { size: 10 } } },
    indexAxis: 'y',
  },
  indexAxis: 'y' as const,
}

const PIE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: { backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1 },
  },
}

export default function Chart10Wheeling({ month, chartType = 'bar', unitIds }: { month: string; chartType?: ChartType; unitIds?: string }) {
  const { data, loading } = useApi(() => api.c9.wheelingRecon(month, unitIds ? { unit_ids: unitIds } : undefined), [month, unitIds])

  if (loading) return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const labels = data.map(r => r.unit.split(' ')[0])

  if (chartType === 'pie' || chartType === 'doughnut') {
    const totProp   = data.reduce((s, r) => s + r.proposed_kwh, 0)
    const totActual = data.reduce((s, r) => s + r.actual_kwh,   0)
    return (
      <div style={{ height: 260 }}>
        <Pie data={{
          labels: ['Proposed', 'Actual Wheeled'],
          datasets: [{ data: [totProp, totActual], backgroundColor: ['rgba(74,158,255,.8)', 'rgba(29,191,122,.8)'], borderColor: '#07111F', borderWidth: 2 }],
        }} options={PIE_OPTS} />
      </div>
    )
  }

  const okRows   = data.filter(r => r.status === 'OK')
  const overRows = data.filter(r => r.status === 'OVER')
  const underRows= data.filter(r => r.status === 'UNDER')

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {[
          { l: `✓ ${okRows.length} On-track`, c: 'var(--green-l)' },
          { l: `▲ ${overRows.length} Over-wheeled`, c: 'var(--amber)' },
          { l: `▼ ${underRows.length} Under-wheeled`, c: 'var(--red)' },
        ].map(b => (
          <div key={b.l} style={{ fontSize: 10, color: b.c, background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>{b.l}</div>
        ))}
      </div>
      <div style={{ height: 240 }}>
        <Bar data={{
          labels,
          datasets: [
            { label: 'Proposed (kWh)', data: data.map(r => r.proposed_kwh), backgroundColor: 'rgba(74,158,255,.7)', borderRadius: 4 },
            { label: 'Actual (kWh)',   data: data.map(r => r.actual_kwh),   backgroundColor: data.map(r => r.gap_kwh < 0 ? 'rgba(232,72,72,.75)' : 'rgba(29,191,122,.75)'), borderRadius: 4 },
          ],
        }} options={BAR_OPTS} />
      </div>
    </div>
  )
}
