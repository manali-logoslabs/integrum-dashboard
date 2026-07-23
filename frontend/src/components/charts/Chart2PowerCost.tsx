/**
 * Chart 2 — Power Cost Analysis: Grid Cost vs Actual Cost per unit
 * Supports multi-month range aggregation. Vertical grouped bars.
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler, ArcElement } from 'chart.js'
import { Bar, Line, Pie } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'
import type { ChartType } from '../../pages/DashboardPage'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler, ArcElement)

function fmtL(v: number) {
  return v >= 1e5 ? `₹${(v / 1e5).toFixed(1)}L` : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

const BAR_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ₹${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: '#E2EEF9', font: { size: 9 }, maxRotation: 30 } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `₹${(v / 1e5).toFixed(0)}L` } },
  },
  layout: { padding: { top: 40 } },
}

const LINE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ₹${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
    },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 9 } } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `₹${(v / 1e5).toFixed(1)}L` } },
  },
}

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

// Plugin to draw savings label above each bar pair
const savingsLabelPlugin = {
  id: 'savingsLabels',
  afterDatasetsDraw(chart: any) {
    const { ctx, data, scales } = chart
    if (!data?.datasets?.length) return
    const gridDs   = data.datasets.find((d: any) => d.label === 'Grid Cost (Without Solar)')
    const actualDs = data.datasets.find((d: any) => d.label === 'Actual Cost (With Banking)')
    if (!gridDs || !actualDs) return

    ctx.save()
    ctx.font = 'bold 9px Arial'
    ctx.textAlign = 'center'

    data.labels.forEach((_: any, i: number) => {
      const grid   = gridDs.data[i]   as number
      const actual = actualDs.data[i] as number
      if (!grid) return
      const savings = Math.max(0, grid - actual)
      const pct     = grid > 0 ? (savings / grid * 100).toFixed(1) : '0.0'
      const label   = `${fmtL(savings)}\n${pct}%`

      // find meta for grid bar to get x position
      const meta = chart.getDatasetMeta(chart.data.datasets.indexOf(gridDs))
      if (!meta?.data?.[i]) return
      const x = meta.data[i].x + (chart.getDatasetMeta(chart.data.datasets.indexOf(actualDs)).data[i].x - meta.data[i].x) / 2
      const y = scales.y.getPixelForValue(Math.max(grid, actual)) - 6

      ctx.fillStyle = '#26E890'
      label.split('\n').forEach((line: string, li: number) => {
        ctx.fillText(line, x, y - (label.split('\n').length - 1 - li) * 12)
      })
    })
    ctx.restore()
  },
}

export default function Chart2PowerCost({
  month, chartType = 'bar', fromMonth, toMonth, unitIds,
}: {
  month: string; chartType?: ChartType; fromMonth?: string; toMonth?: string; unitIds?: string
}) {
  const from = fromMonth || month
  const to   = toMonth   || month
  const { data, loading } = useApi(
    () => api.c9.unitSavings(from, to, unitIds ? { unit_ids: unitIds } : undefined),
    [from, to, unitIds]
  )

  if (loading) return <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {from} → {to}</div>

  const labels = data.map(r => r.unit.replace(' CORP. OFFICE', '').replace('OLD AIRPORT ROAD', 'OAR').replace(' (', '\n('))

  if (chartType === 'pie' || chartType === 'doughnut') {
    const totGrid   = data.reduce((s, r) => s + r.grid_cost, 0)
    const totActual = data.reduce((s, r) => s + r.actual_cost_with_banking, 0)
    return (
      <div style={{ height: 280 }}>
        <Pie
          data={{
            labels: ['Actual Cost', 'Savings'],
            datasets: [{ data: [totActual, Math.max(0, totGrid - totActual)], backgroundColor: ['rgba(74,158,255,.8)', 'rgba(29,191,122,.8)'], borderColor: '#07111F', borderWidth: 2 }],
          }}
          options={PIE_OPTS}
        />
      </div>
    )
  }

  if (chartType === 'line' || chartType === 'area') {
    const fill = chartType === 'area'
    return (
      <div style={{ height: 280 }}>
        <Line
          data={{
            labels,
            datasets: [
              { label: 'Grid Cost', data: data.map(r => r.grid_cost), borderColor: 'rgba(232,72,72,.9)', backgroundColor: fill ? 'rgba(232,72,72,.1)' : 'transparent', fill: fill ? 'origin' : false, tension: .3, pointRadius: 3 },
              { label: 'Actual Cost', data: data.map(r => r.actual_cost_with_banking), borderColor: 'rgba(29,191,122,.9)', backgroundColor: fill ? 'rgba(29,191,122,.1)' : 'transparent', fill: fill ? 'origin' : false, tension: .3, pointRadius: 3 },
            ],
          }}
          options={LINE_OPTS}
        />
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--blue)', marginBottom: 6 }}>
        Grid Cost vs Actual Cost (With Banking) · {from} → {to}
      </div>
      <div style={{ height: 300 }}>
        <Bar
          plugins={[savingsLabelPlugin]}
          data={{
            labels,
            datasets: [
              { label: 'Grid Cost (Without Solar)',   data: data.map(r => r.grid_cost),                 backgroundColor: 'rgba(232,72,72,.75)',   borderRadius: 4 },
              { label: 'Actual Cost (With Banking)',  data: data.map(r => r.actual_cost_with_banking),  backgroundColor: 'rgba(29,191,122,.75)',  borderRadius: 4 },
            ],
          }}
          options={BAR_OPTS}
        />
      </div>
    </div>
  )
}
