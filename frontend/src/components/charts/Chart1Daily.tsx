/**
 * Chart 1 — Daily Generation, Consumption & Settlement
 * Supports: monthly (default) | bar | line | area | pie
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler, ArcElement } from 'chart.js'
import { Chart, Pie } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'
import type { ChartType } from '../../pages/DashboardPage'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler, ArcElement)

const BASE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12, padding: 14 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh` },
    },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 } } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v/1000).toFixed(0)}k` } },
  },
}

const PIE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      callbacks: { label: (ctx: any) => ` ${ctx.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh` },
    },
  },
}

function monthMinus(month: string, n: number): string {
  const d = new Date(month + '-01')
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 7)
}

function Chart1Monthly({ fromMonth, toMonth, anchorMonth, unitIds }: {
  fromMonth?: string; toMonth?: string; anchorMonth: string; unitIds?: string
}) {
  // Default: last 12 months ending at anchorMonth
  const to   = toMonth   || anchorMonth
  const from = fromMonth || monthMinus(to, 11)

  const { data, loading } = useApi(
    () => api.c9.monthlyAggregate(from, to, unitIds ? { unit_ids: unitIds } : undefined),
    [from, to, unitIds]
  )
  if (loading) return <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {from} → {to}</div>

  // Live chart structure: two bar groups per month (stack: 'gen' on left, stack: 'cons' on right).
  // Generation is a standalone bar on the left; settlement breakdown is a stacked bar on the right.
  // Lapsed (surplus months) stacks before Grid (deficit months) — mutually exclusive.
  const chartData = {
    labels: data.map(r => r.month),
    datasets: [
      // Generation — standalone bar (left group), matches live chart's green left bar
      { type: 'bar' as const, label: 'Generation',  data: data.map(r => r.generation_kwh),
        backgroundColor: 'rgba(29,191,122,.85)', borderWidth: 0, stack: 'gen', order: 1 },
      // Consumption — subtle dashed line so the consumption target remains visible
      { type: 'line' as const, label: 'Consumption', data: data.map(r => r.consumption_kwh),
        borderColor: 'rgba(74,158,255,.55)', borderWidth: 1.5, pointRadius: 2, tension: .3,
        fill: false, backgroundColor: 'transparent', borderDash: [4, 3], order: 0 },
      // Settlement breakdown — stacked bar (right group)
      { type: 'bar' as const, label: 'Matched Settlement',      data: data.map(r => r.matched_kwh),
        backgroundColor: 'rgba(38,232,144,.75)', borderWidth: 0, stack: 'cons', order: 1 },
      { type: 'bar' as const, label: 'Settlement with Banking', data: data.map(r => r.banking_kwh),
        backgroundColor: 'rgba(29,80,180,.8)',   borderWidth: 0, stack: 'cons', order: 1 },
      { type: 'bar' as const, label: 'Lapsed Units',            data: data.map(r => r.lapsed_kwh || 0),
        backgroundColor: 'rgba(245,166,35,.75)', borderWidth: 0, stack: 'cons', order: 1 },
      { type: 'bar' as const, label: 'Grid Consumption',        data: data.map(r => r.grid_kwh),
        backgroundColor: 'rgba(232,72,72,.8)',   borderWidth: 0, stack: 'cons', order: 1 },
    ],
  }
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--blue)', marginBottom: 6 }}>Generation, Consumption & Settlement Breakdown · {from} → {to}</div>
      <div style={{ height: 280 }}><Chart type="bar" data={chartData} options={BASE_OPTS} /></div>
    </div>
  )
}

export default function Chart1Daily({ month, chartType = 'monthly', fromMonth, toMonth, unitIds }: {
  month: string; chartType?: ChartType; fromMonth?: string; toMonth?: string; unitIds?: string
}) {
  // Monthly trend view — default and primary mode
  if (chartType === 'monthly') {
    return <Chart1Monthly anchorMonth={month} fromMonth={fromMonth} toMonth={toMonth} unitIds={unitIds} />
  }

  const { data, loading, error } = useApi(() => api.c9.dailySummary(month), [month])

  if (loading) return <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (error || !data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const labels = data.map(r => r.date.slice(5))
  const isLine = chartType === 'line' || chartType === 'area'
  const isFill = chartType === 'area'

  if (chartType === 'pie' || chartType === 'doughnut') {
    const totGen    = data.reduce((s, r) => s + (r.generation_kwh || 0), 0)
    const totMatch  = data.reduce((s, r) => s + (r.matched_kwh || 0), 0)
    const totBank   = data.reduce((s, r) => s + (r.banking_kwh || 0), 0)
    const totGrid   = data.reduce((s, r) => s + (r.grid_kwh || 0), 0)
    const totLapsed = Math.max(0, totGen - totMatch - totBank)
    return (
      <div style={{ height: 280 }}>
        <Pie
          data={{
            labels: ['Direct Match', 'Banking Used', 'Grid Drawl', 'Lapsed Units'],
            datasets: [{
              data: [totMatch, totBank, totGrid, totLapsed],
              backgroundColor: ['rgba(38,232,144,.8)', 'rgba(245,166,35,.8)', 'rgba(232,72,72,.8)', 'rgba(245,100,35,.8)'],
              borderColor: '#07111F', borderWidth: 2,
            }],
          }}
          options={PIE_OPTS}
        />
      </div>
    )
  }

  // Lapsed Units = generation surplus that expired (not consumed or banked)
  const lapsedData = data.map(r =>
    Math.max(0, (r.generation_kwh || 0) - (r.matched_kwh || 0) - (r.banking_kwh || 0))
  )

  const chartData = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Generation',
        data: data.map(r => r.generation_kwh),
        borderColor: '#1DBF7A', borderWidth: 2, pointRadius: 0, tension: .3,
        fill: isFill ? 'origin' : false,
        backgroundColor: isFill ? 'rgba(29,191,122,.12)' : 'transparent',
        order: 0,
      },
      {
        type: 'line' as const,
        label: 'Consumption',
        data: data.map(r => r.consumption_kwh),
        borderColor: 'rgba(74,158,255,.9)', borderWidth: 2, pointRadius: 0, tension: .3,
        borderDash: [6, 3],
        fill: false,
        backgroundColor: 'transparent',
        order: 0,
      },
      {
        type: (isLine ? 'line' : 'bar') as any,
        label: 'Direct Match',
        data: data.map(r => r.matched_kwh),
        borderColor: 'rgba(38,232,144,.9)', backgroundColor: 'rgba(38,232,144,.7)',
        borderWidth: isLine ? 2 : 0, pointRadius: 0, tension: .3,
        fill: isFill ? 'origin' : false,
        stack: isLine ? undefined : 'cons', order: 1,
      },
      {
        type: (isLine ? 'line' : 'bar') as any,
        label: 'Banking Used',
        data: data.map(r => r.banking_kwh),
        borderColor: 'rgba(245,166,35,.9)', backgroundColor: 'rgba(245,166,35,.7)',
        borderWidth: isLine ? 2 : 0, pointRadius: 0, tension: .3,
        fill: isFill ? 'origin' : false,
        stack: isLine ? undefined : 'cons', order: 1,
      },
      {
        type: (isLine ? 'line' : 'bar') as any,
        label: 'Grid Drawl',
        data: data.map(r => r.grid_kwh),
        borderColor: 'rgba(232,72,72,.9)', backgroundColor: 'rgba(232,72,72,.7)',
        borderWidth: isLine ? 2 : 0, pointRadius: 0, tension: .3,
        fill: isFill ? 'origin' : false,
        stack: isLine ? undefined : 'cons', order: 1,
      },
      {
        type: (isLine ? 'line' : 'bar') as any,
        label: 'Lapsed Units',
        data: lapsedData,
        borderColor: 'rgba(245,100,35,.9)', backgroundColor: 'rgba(245,100,35,.65)',
        borderWidth: isLine ? 2 : 0, pointRadius: 0, tension: .3,
        fill: isFill ? 'origin' : false,
        stack: isLine ? undefined : 'cons', order: 1,
      },
    ],
  }

  return <div style={{ height: 280 }}><Chart type="bar" data={chartData} options={BASE_OPTS} /></div>
}
