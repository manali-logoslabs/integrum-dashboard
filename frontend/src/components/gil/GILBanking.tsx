/**
 * GILBanking.tsx — 3-Tier Banking Settlement Waterfall
 * Tier 1: Daily TOD banking
 * Tier 2: Monthly TOD banking
 * Tier 3: Intra-monthly banking
 */
import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
const kwh = (v: any) => `${(n2f(v)/1000).toFixed(1)} MWh`
const inr_fmt = (n: number) => n >= 1e5 ? `₹${(n/1e5).toFixed(2)}L` : n >= 1e3 ? `₹${(n/1e3).toFixed(1)}K` : `₹${n.toFixed(0)}`

export default function GILBanking({ month, chartType = 'bar' }: { month: string; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.bankingSettlement(month), [month])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data || (data as any).no_data) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No banking data for {month}</div>

  const tiers = [
    { label: 'Tier 1\nDaily TOD',    kwh: data.tier1_tod_daily_kwh,     savings: data.tier1_savings_inr,     color: 'rgba(16,185,129,.85)' },
    { label: 'Tier 2\nMonthly TOD',  kwh: data.tier2_tod_monthly_kwh,   savings: data.tier2_savings_inr,     color: 'rgba(251,191,36,.85)' },
    { label: 'Tier 3\nIntra-Month',  kwh: data.tier3_intra_monthly_kwh, savings: data.tier3_savings_inr,     color: 'rgba(96,165,250,.85)' },
    { label: 'Expired\nBanking',     kwh: data.banking_expired_kwh,      savings: 0,                          color: 'rgba(248,113,113,.6)' },
  ]

  const OPTS: any = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
        titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
        callbacks: {
          label: (ctx: any) => ` ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh`,
        },
      },
    },
    scales: {
      x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 9 } } },
      y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v/1000).toFixed(0)}k` } },
    },
  }

  return (
    <div>
      {/* Flow summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
        {[
          { label: 'Surplus',         value: kwh(data.surplus_before_banking_kwh), color: '#60a5fa' },
          { label: 'Total Used',      value: kwh(data.total_banking_utilised_kwh), color: '#10b981' },
          { label: 'Efficiency',      value: `${n2f(data.banking_efficiency_pct).toFixed(1)}%`,   color: '#f59e0b' },
          { label: 'Direct Match',    value: kwh(data.direct_matched_kwh),          color: '#34d399' },
          { label: 'Expired',         value: kwh(data.banking_expired_kwh),         color: '#f87171' },
          { label: 'Replacement%',    value: `${n2f(data.replacement_pct).toFixed(1)}%`,          color: '#a78bfa' },
        ].map(c => (
          <div key={c.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
      {/* 3-tier bar chart */}
      <div style={{ height: 160 }}>
        <Bar data={{ labels: tiers.map(t => t.label), datasets: [{
          label: 'kWh', data: tiers.map(t => t.kwh),
          backgroundColor: tiers.map(t => t.color), borderRadius: 6,
        }]}} options={OPTS} />
      </div>
      {/* Tier savings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
        {tiers.slice(0, 3).map((t, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${t.color}`, borderRadius: 6, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>Tier {i+1} Savings</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>{inr_fmt(n2f(t.savings))}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        Total Banking Savings: <strong style={{ color: '#f59e0b' }}>{inr_fmt(n2f(data.total_banking_savings_inr))}</strong>
      </div>
    </div>
  )
}
