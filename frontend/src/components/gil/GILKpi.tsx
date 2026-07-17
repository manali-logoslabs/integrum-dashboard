/**
 * GILKpi.tsx — KPI Overview Cards for GIL (Wind + Solar hybrid)
 */
import React from 'react'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

const n2f = (n: any): number => typeof n === 'number' ? n : parseFloat(String(n ?? 0)) || 0

function fmt(raw: any) {
  const n = n2f(raw)
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + ' k'
  return n.toFixed(0)
}
function inr(raw: any) {
  const n = n2f(raw)
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L'
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1) + 'K'
  return '₹' + n.toFixed(0)
}

export default function GILKpi({ month }: { month: string }) {
  const { data, loading, error } = useApi(() => api.gil.kpiSummary(month), [month])

  if (loading) return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (error || !data) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>No data for {month}</div>

  const cards = [
    { label: 'Total Generation',   value: fmt(data.total_generation_kwh) + ' kWh',  icon: '⚡', color: '#10b981' },
    { label: 'Wind Generation',    value: fmt(data.wind_generation_kwh) + ' kWh',   icon: '🌬️', color: '#6ee7b7' },
    { label: 'Solar Generation',   value: fmt(data.solar_generation_kwh) + ' kWh',  icon: '☀️', color: '#fbbf24' },
    { label: 'Consumption',        value: fmt(data.total_consumption_kwh) + ' kWh', icon: '🏭', color: '#60a5fa' },
    { label: 'Matched',            value: fmt(data.total_matched_kwh) + ' kWh',     icon: '✅', color: '#34d399' },
    { label: 'Banking Used',       value: fmt(data.banking_utilised_kwh ?? 0) + ' kWh', icon: '🏦', color: '#f59e0b' },
    { label: 'Total Savings',      value: inr(data.total_savings_inr),              icon: '💰', color: '#f59e0b' },
    { label: 'Grid Cost (Base)',   value: inr(data.total_grid_cost_inr),            icon: '🔌', color: 'var(--text-sec)' },
    { label: 'Actual RE Cost',     value: inr(data.total_actual_cost_inr),          icon: '🧾', color: 'var(--text-sec)' },
    { label: 'Savings %',          value: n2f(data.savings_pct).toFixed(1) + '%',  icon: '📈', color: '#6ee7b7' },
    { label: 'Replacement %',      value: n2f(data.replacement_pct).toFixed(1) + '%', icon: '🌿', color: '#10b981' },
    { label: 'CO₂ Saved',          value: n2f(data.co2_saved_tonnes).toFixed(1) + ' t', icon: '🌳', color: '#34d399' },
    { label: 'Gen Losses',         value: fmt(data.generation_losses_kwh) + ' kWh', icon: '📉', color: '#f87171' },
    { label: 'Loss %',             value: n2f(data.generation_losses_pct).toFixed(1) + '%', icon: '⚠️', color: '#f87171' },
  ]

  return (
    <div>
      {/* Wind / Solar pill */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ background: 'rgba(16,185,129,.12)', border: '1px solid #10b981', borderRadius: 20, padding: '3px 12px', fontSize: 11, color: '#10b981', fontWeight: 600 }}>
          🌬️ Wind {n2f(data.wind_pct).toFixed(1)}%
        </div>
        <div style={{ background: 'rgba(251,191,36,.12)', border: '1px solid #fbbf24', borderRadius: 20, padding: '3px 12px', fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>
          ☀️ Solar {n2f(data.solar_pct).toFixed(1)}%
        </div>
        <div style={{ background: 'rgba(248,113,113,.10)', border: '1px solid #f87171', borderRadius: 20, padding: '3px 12px', fontSize: 11, color: '#f87171', fontWeight: 600 }}>
          ⚡ Plant Losses {n2f(data.generation_losses_pct).toFixed(2)}%
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{c.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
