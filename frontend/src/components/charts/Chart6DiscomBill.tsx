/**
 * Chart 6 — DISCOM Bill Breakdown per unit (stacked bar)
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
    x: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#E2EEF9', font: { size: 10 } } },
    y: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `₹${(v/1e5).toFixed(1)}L` } },
  },
}

const LINE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: { backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1 },
  },
  scales: {
    x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#E2EEF9', font: { size: 9 } } },
    y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `₹${(v/1e5).toFixed(1)}L` } },
  },
}

const PIE_OPTS: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: { backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1 },
  },
}

export default function Chart6DiscomBill({ month, chartType = 'bar', unitIds }: { month: string; chartType?: ChartType; unitIds?: string }) {
  const { data, loading } = useApi(() => api.c9.discomBill(month, unitIds ? { unit_ids: unitIds } : undefined), [month, unitIds])

  if (loading) return <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const labels = data.map(r => r.unit_name.split(' ')[0])

  const miniCards = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6, marginTop: 10 }}>
      {data.slice(0, 4).map(r => (
        <div key={r.unit_code} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.unit_name.split(' ')[0]}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-l)', marginTop: 2 }}>
            ₹{(parseFloat(String(r.savings_inr ?? 0)) / 1e5).toFixed(2)}L saved
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>₹{r.energy_rate_per_kwh}/kWh</div>
        </div>
      ))}
    </div>
  )

  if (chartType === 'pie' || chartType === 'doughnut') {
    const totGross   = data.reduce((s, r) => s + r.gross_amount_inr, 0)
    const totSavings = data.reduce((s, r) => s + r.savings_inr, 0)
    return (
      <div>
        <div style={{ height: 220 }}>
          <Pie data={{
            labels: ['Net Payable', 'Savings'],
            datasets: [{ data: [totGross - totSavings, totSavings], backgroundColor: ['rgba(74,158,255,.8)', 'rgba(29,191,122,.8)'], borderColor: '#07111F', borderWidth: 2 }],
          }} options={PIE_OPTS} />
        </div>
        {miniCards}
      </div>
    )
  }

  if (chartType === 'line' || chartType === 'area') {
    return (
      <div>
        <div style={{ height: 220 }}>
          <Line data={{
            labels,
            datasets: [
              { label: 'Gross Bill', data: data.map(r => r.gross_amount_inr), borderColor: 'rgba(232,72,72,.9)', tension: .3, pointRadius: 3 },
              { label: 'Net Payable', data: data.map(r => r.net_payable_inr), borderColor: 'rgba(74,158,255,.9)', tension: .3, pointRadius: 3 },
            ],
          }} options={LINE_OPTS} />
        </div>
        {miniCards}
      </div>
    )
  }

  return (
    <div>
      <div style={{ height: 240 }}>
        <Bar data={{
          labels,
          datasets: [
            { label: 'Energy Charge',  data: data.map(r => r.energy_charge_inr ?? 0),    backgroundColor: 'rgba(74,158,255,.8)', borderRadius: 4, stack: 'gross' },
            { label: 'Demand Charge',  data: data.map(r => r.demand_charge_inr ?? 0),    backgroundColor: 'rgba(155,125,255,.8)', stack: 'gross' },
            { label: 'FAC',            data: data.map(r => r.fac_inr ?? 0),              backgroundColor: 'rgba(245,166,35,.8)',  stack: 'gross' },
            { label: 'Tax',            data: data.map(r => r.tax_inr ?? 0),              backgroundColor: 'rgba(232,72,72,.6)',   stack: 'gross' },
            { label: 'PG Surcharge',   data: data.map(r => r.pg_surcharge_inr ?? 0),    backgroundColor: 'rgba(232,72,72,.9)',   stack: 'gross' },
            { label: 'Wheeling',       data: data.map(r => r.wheeling_charge_inr ?? 0), backgroundColor: 'rgba(29,191,122,.7)', stack: 'gross' },
          ],
        }} options={BAR_OPTS} />
      </div>
      {miniCards}
    </div>
  )
}
