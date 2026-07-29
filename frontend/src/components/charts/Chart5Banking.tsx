/**
 * Chart 5 — Monthly Cost Comparison: Grid vs With/Without Banking
 * Matches old dashboard's stacked bar chart style.
 *
 * Each month shows two bars:
 *   Bar 1 (left):  Grid Cost (orange)
 *   Bar 2 (right): Stacked — Actual w/ Banking (green) | Incremental Banking Savings (blue) | Savings w/o Banking (teal)
 *
 * Supports multi-month range via fromMonth / toMonth props.
 */
import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'
import type { ChartType } from '../../pages/DashboardPage'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const inrL = (v: number) => `₹${(v / 1e5).toFixed(1)}L`

const OPTS: any = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { color: '#7A9BBF', font: { size: 10 }, boxWidth: 12, padding: 14 },
    },
    tooltip: {
      backgroundColor: '#0C1A2E',
      borderColor: '#182D47',
      borderWidth: 1,
      titleColor: '#E2EEF9',
      bodyColor: '#7A9BBF',
      callbacks: {
        label: (ctx: any) => ` ${ctx.dataset.label}: ${inrL(ctx.raw as number)}`,
      },
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(24,45,71,.5)' },
      ticks: { color: '#E2EEF9', font: { size: 10 } },
    },
    y: {
      stacked: false,
      grid: { color: 'rgba(24,45,71,.6)' },
      ticks: {
        color: '#4A6A8A',
        font: { size: 10 },
        callback: (v: any) => `₹${(v / 1e5).toFixed(0)}L`,
      },
    },
  },
}

// Stacked y-axis config for the second bar group
const OPTS_STACKED: any = {
  ...OPTS,
  scales: {
    ...OPTS.scales,
    y: { ...OPTS.scales.y, stacked: true },
  },
}

interface Props {
  month:      string
  chartType?: ChartType
  unitIds?:   string
  fromMonth?: string
  toMonth?:   string
}

export default function Chart5Banking({ month, chartType = 'bar', unitIds, fromMonth, toMonth }: Props) {
  const from = fromMonth ?? month
  const to   = toMonth   ?? month

  const { data, loading } = useApi(
    () => api.c9.monthlyCost(from, to, unitIds ? { unit_ids: unitIds } : undefined),
    [from, to, unitIds]
  )

  if (loading) return (
    <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )
  if (!data?.length) return (
    <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
      No data for {from} → {to}
    </div>
  )

  // Month labels: "Aug 25"
  const labels = data.map(r => {
    const dt = new Date(r.month + '-01T00:00:00')
    return dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
  })

  // Stacked chart matching old dashboard:
  // Stack order (bottom→top): Actual w/ Banking | Incremental Banking Savings | Savings w/o Banking
  // Plus a non-stacked Grid Cost bar for comparison
  const datasets = [
    {
      label: 'Grid Cost',
      data: data.map(r => r.grid_cost),
      backgroundColor: 'rgba(239,68,68,.85)',
      borderRadius: 3,
      stack: 'grid',
      order: 1,
    },
    {
      label: 'Actual Cost (With Banking)',
      data: data.map(r => r.actual_cost_with_banking),
      backgroundColor: 'rgba(29,191,122,.82)',
      borderRadius: 0,
      stack: 'breakdown',
      order: 2,
    },
    {
      label: 'Savings (Banking Benefit)',
      data: data.map(r => r.incremental_banking_savings),
      backgroundColor: 'rgba(59,130,246,.82)',
      borderRadius: 0,
      stack: 'breakdown',
      order: 2,
    },
    {
      label: 'Savings (Without Banking)',
      data: data.map(r => r.savings_without_banking),
      backgroundColor: 'rgba(20,184,166,.82)',
      borderRadius: 3,
      stack: 'breakdown',
      order: 2,
    },
  ]

  // Summary totals
  const totalGrid  = data.reduce((s, r) => s + r.grid_cost, 0)
  const totalActWB = data.reduce((s, r) => s + r.actual_cost_with_banking, 0)
  const totalSavWB = data.reduce((s, r) => s + r.savings_with_banking, 0)
  const savPct     = totalGrid > 0 ? ((totalSavWB / totalGrid) * 100).toFixed(1) : '0'

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Grid Cost: <strong style={{ color: '#EF4444' }}>{inrL(totalGrid)}</strong>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Actual (w/ Banking): <strong style={{ color: '#1DBF7A' }}>{inrL(totalActWB)}</strong>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Total Savings: <strong style={{ color: '#3B82F6' }}>{inrL(totalSavWB)}</strong>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Savings %: <strong style={{ color: '#14B8A6' }}>{savPct}%</strong>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 240 }}>
        <Bar
          data={{ labels, datasets }}
          options={{
            ...OPTS,
            scales: {
              x: OPTS.scales.x,
              y: { ...OPTS.scales.y, stacked: true },
            },
          }}
        />
      </div>
    </div>
  )
}
