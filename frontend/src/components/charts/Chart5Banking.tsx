/**
 * Chart 5 — Banking Cost Comparison
 * Supports: bar (default) | line | pie
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, ArcElement } from 'chart.js'
import { Bar, Line, Pie } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'
import type { ChartType } from '../../pages/DashboardPage'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, ArcElement)

const BAR_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 }, position: 'bottom' as const },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ₹${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
    },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#E2EEF9', font: { size: 10 } } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `₹${(v/1e5).toFixed(1)}L` } },
  },
}

const LINE_OPTS: any = { ...BAR_OPTS }

const PIE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      callbacks: { label: (ctx: any) => ` ${ctx.label}: ₹${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
    },
  },
}

export default function Chart5Banking({ month, chartType = 'bar', unitIds }: { month: string; chartType?: ChartType; unitIds?: string }) {
  const { data, loading } = useApi(() => api.c9.unitSavings(month, unitIds ? { unit_ids: unitIds } : undefined), [month, unitIds])

  if (loading) return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const labels = data.map(r => r.unit.split(' ')[0])

  if (chartType === 'pie') {
    const totWith    = data.reduce((s, r) => s + r.actual_cost_with_banking, 0)
    const totWithout = data.reduce((s, r) => s + r.actual_cost_without_banking, 0)
    return (
      <div style={{ height: 260 }}>
        <Pie data={{
          labels: ['Cost With Banking', 'Cost Without Banking'],
          datasets: [{ data: [totWith, totWithout], backgroundColor: ['rgba(29,191,122,.8)', 'rgba(74,158,255,.8)'], borderColor: '#07111F', borderWidth: 2 }],
        }} options={PIE_OPTS} />
      </div>
    )
  }

  const datasets = [
    { label: 'Without Banking', data: data.map(r => r.actual_cost_without_banking), backgroundColor: 'rgba(74,158,255,.7)', borderColor: 'rgba(74,158,255,.9)', borderRadius: 4, tension: .3, pointRadius: 3 },
    { label: 'With Banking',    data: data.map(r => r.actual_cost_with_banking),    backgroundColor: 'rgba(29,191,122,.7)', borderColor: 'rgba(29,191,122,.9)', borderRadius: 4, tension: .3, pointRadius: 3 },
  ]

  if (chartType === 'line' || chartType === 'area') {
    return <div style={{ height: 260 }}><Line data={{ labels, datasets }} options={LINE_OPTS} /></div>
  }

  return <div style={{ height: 260 }}><Bar data={{ labels, datasets }} options={BAR_OPTS} /></div>
}
