/**
 * Chart 2 — Power Cost Analysis: Grid Cost vs Actual Cost per unit
 * Supports: bar (default) | line | area | pie
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler, ArcElement } from 'chart.js'
import { Bar, Line, Pie } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'
import type { ChartType } from '../../pages/DashboardPage'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler, ArcElement)

const BAR_OPTS: any = {
  responsive: true, maintainAspectRatio: false, indexAxis: 'y' as const,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ₹${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
    },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `₹${(v/1000).toFixed(0)}K` } },
    y: { grid: { display: false }, ticks: { color: '#E2EEF9', font: { size: 10 } } },
  },
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
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `₹${(v/1e5).toFixed(1)}L` } },
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

export default function Chart2PowerCost({ month, chartType = 'bar', unitIds }: { month: string; chartType?: ChartType; unitIds?: string }) {
  const { data, loading } = useApi(() => api.c9.unitSavings(month, unitIds ? { unit_ids: unitIds } : undefined), [month, unitIds])

  if (loading) return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const labels = data.map(r => r.unit.replace(' CORP. OFFICE', '').replace('OLD AIRPORT ROAD', 'OAR').split(' ')[0])

  if (chartType === 'pie' || chartType === 'doughnut') {
    const totGrid   = data.reduce((s, r) => s + r.grid_cost, 0)
    const totActual = data.reduce((s, r) => s + r.actual_cost_with_banking, 0)
    return (
      <div style={{ height: 260 }}>
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
      <div style={{ height: 260 }}>
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
    <div style={{ height: 260 }}>
      <Bar
        data={{
          labels,
          datasets: [
            { label: 'Grid Cost (Without Solar)', data: data.map(r => r.grid_cost), backgroundColor: 'rgba(232,72,72,.75)', borderRadius: 4 },
            { label: 'Actual Cost (With Banking)', data: data.map(r => r.actual_cost_with_banking), backgroundColor: 'rgba(29,191,122,.75)', borderRadius: 4 },
          ],
        }}
        options={BAR_OPTS}
      />
    </div>
  )
}
