/**
 * Chart 8 — Banking Loss Analysis per unit
 * Supports: bar (default) | pie | doughnut
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement } from 'chart.js'
import { Bar, Pie, Doughnut } from 'react-chartjs-2'
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
    x: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#E2EEF9', font: { size: 10 } } },
    y: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v/1000).toFixed(0)}k` } },
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

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0

export default function Chart8BankingLoss({ month, chartType = 'bar', unitIds }: { month: string; chartType?: ChartType; unitIds?: string }) {
  const { data, loading } = useApi(() => api.c9.bankingLoss(month, unitIds ? { unit_ids: unitIds } : undefined), [month, unitIds])

  if (loading) return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No banking data for {month}</div>

  const withGross = data.filter(r => r.gross_banked_kwh > 0)
  if (!withGross.length) return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      No banking transactions this month — all generation directly matched.
    </div>
  )

  const totalLoss    = data.reduce((s, r) => s + n2f(r.banking_loss_kwh), 0)
  const totalLossInr = data.reduce((s, r) => s + n2f(r.loss_inr), 0)

  const kpiBar = (
    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
      <div style={{ background: 'rgba(232,72,72,.1)', border: '1px solid rgba(232,72,72,.3)', borderRadius: 8, padding: '6px 12px' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total Banking Loss</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{(totalLoss / 1000).toFixed(1)} MWh</div>
      </div>
      <div style={{ background: 'rgba(232,72,72,.1)', border: '1px solid rgba(232,72,72,.3)', borderRadius: 8, padding: '6px 12px' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Loss Value</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>₹{(totalLossInr / 1e5).toFixed(2)} L</div>
      </div>
    </div>
  )

  if (chartType === 'pie' || chartType === 'doughnut') {
    const totLoss    = withGross.reduce((s, r) => s + n2f(r.banking_loss_kwh), 0)
    const totSettled = withGross.reduce((s, r) => s + n2f(r.settled_kwh), 0)
    const totExpired = withGross.reduce((s, r) => s + n2f(r.expired_kwh), 0)
    const PieComp = chartType === 'doughnut' ? Doughnut : Pie
    return (
      <div>
        {kpiBar}
        <div style={{ height: 200 }}>
          <PieComp data={{
            labels: ['Banking Loss (8%)', 'Settled', 'Lapsed/Expired'],
            datasets: [{ data: [totLoss, totSettled, totExpired], backgroundColor: ['rgba(232,72,72,.8)', 'rgba(29,191,122,.8)', 'rgba(245,166,35,.8)'], borderColor: '#07111F', borderWidth: 2 }],
          }} options={PIE_OPTS} />
        </div>
      </div>
    )
  }

  const labels = withGross.map(r => r.unit.split(' ')[0])
  return (
    <div>
      {kpiBar}
      <div style={{ height: 200 }}>
        <Bar data={{
          labels,
          datasets: [
            { label: 'Banking Loss (8%)', data: withGross.map(r => r.banking_loss_kwh), backgroundColor: 'rgba(232,72,72,.8)', stack: 's', borderRadius: 4 },
            { label: 'Banking Settled',   data: withGross.map(r => r.settled_kwh),      backgroundColor: 'rgba(29,191,122,.8)', stack: 's' },
            { label: 'Lapsed/Expired',    data: withGross.map(r => r.expired_kwh),      backgroundColor: 'rgba(245,166,35,.7)', stack: 's' },
          ],
        }} options={BAR_OPTS} />
      </div>
    </div>
  )
}
