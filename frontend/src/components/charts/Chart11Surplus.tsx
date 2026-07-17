/**
 * Chart 11 — Surplus & Absorption Energy Flow per unit
 * Supports: bar (default) | line
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'
import type { ChartType } from '../../pages/DashboardPage'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

const BASE_OPTS: any = {
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
    x: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#E2EEF9', font: { size: 10 } } },
    y: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v/1000).toFixed(0)}k` } },
  },
}

const LINE_OPTS: any = {
  ...BASE_OPTS,
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#E2EEF9', font: { size: 10 } } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v/1000).toFixed(0)}k` } },
  },
}

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0

export default function Chart11Surplus({ month, chartType = 'bar', unitIds }: { month: string; chartType?: ChartType; unitIds?: string }) {
  const { data, loading } = useApi(() => api.c9.surplusAbsorption(month, unitIds ? { unit_ids: unitIds } : undefined), [month, unitIds])

  if (loading) return <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const labels = data.map(r => r.unit.split(' ')[0])
  const totals = {
    gen:     data.reduce((s, r) => s + n2f(r.generation_kwh), 0),
    cons:    data.reduce((s, r) => s + n2f(r.consumption_kwh), 0),
    match:   data.reduce((s, r) => s + n2f(r.total_matched_kwh), 0),
    expired: data.reduce((s, r) => s + n2f((r as any).banking_expired_kwh ?? 0), 0),
  }

  const kpiRow = (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
      {[
        { l: 'Generation',        v: (totals.gen/1000).toFixed(1) + ' MWh',   c: 'var(--green-l)' },
        { l: 'Total Matched',     v: (totals.match/1000).toFixed(1) + ' MWh', c: 'var(--c-match)' },
        { l: 'Banking Expired',   v: (totals.expired/1000).toFixed(1) + ' MWh', c: 'var(--red)' },
        { l: 'Avg Replacement',   v: (data.reduce((s,r)=>s+n2f(r.replacement_pct),0)/data.length).toFixed(1)+'%', c: 'var(--amber)' },
      ].map(kpi => (
        <div key={kpi.l} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', minWidth: 100 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{kpi.l}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: kpi.c }}>{kpi.v}</div>
        </div>
      ))}
    </div>
  )

  if (chartType === 'line' || chartType === 'area') {
    return (
      <div>
        {kpiRow}
        <div style={{ height: 220 }}>
          <Line data={{
            labels,
            datasets: [
              { label: 'Direct Matched',  data: data.map(r => r.direct_matched_kwh),   borderColor: 'rgba(38,232,144,.9)',  tension: .3, pointRadius: 3 },
              { label: 'Banking Settled', data: data.map(r => r.banking_settled_kwh),  borderColor: 'rgba(245,166,35,.9)',  tension: .3, pointRadius: 3 },
              { label: 'Grid Drawl',      data: data.map(r => r.grid_drawl_kwh),       borderColor: 'rgba(74,158,255,.9)',  tension: .3, pointRadius: 3 },
            ],
          }} options={LINE_OPTS} />
        </div>
      </div>
    )
  }

  return (
    <div>
      {kpiRow}
      <div style={{ height: 220 }}>
        <Bar data={{
          labels,
          datasets: [
            { label: 'Direct Matched',  data: data.map(r => r.direct_matched_kwh),   backgroundColor: 'rgba(38,232,144,.8)', stack: 'flow' },
            { label: 'Banking Settled', data: data.map(r => r.banking_settled_kwh),  backgroundColor: 'rgba(245,166,35,.8)', stack: 'flow' },
            { label: 'Banking Expired', data: data.map(r => (r as any).banking_expired_kwh ?? 0), backgroundColor: 'rgba(232,72,72,.7)', stack: 'flow' },
            { label: 'Grid Drawl',      data: data.map(r => r.grid_drawl_kwh),       backgroundColor: 'rgba(74,158,255,.7)', stack: 'grid' },
          ],
        }} options={BASE_OPTS} />
      </div>
    </div>
  )
}
