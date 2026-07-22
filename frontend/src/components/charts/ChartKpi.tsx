/**
 * ChartKpi.tsx - KPI Overview Cards
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

export default function ChartKpi({ month, unitIds }: { month: string; unitIds?: string }) {
  const { data, loading, error } = useApi(() => api.c9.kpiSummary(month, unitIds ? { unit_ids: unitIds } : undefined), [month, unitIds])

  if (loading) return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (error || !data) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>No data</div>

  const cards = [
    { label: 'Generation',      value: fmt(data.total_generation_kwh) + ' kWh', icon: '⚡', color: 'var(--green)' },
    { label: 'Consumption',     value: fmt(data.total_consumption_kwh) + ' kWh', icon: '\U0001f3ed', color: 'var(--blue)' },
    { label: 'Matched',         value: fmt(data.total_matched_kwh) + ' kWh', icon: '✅', color: 'var(--c-match)' },
    { label: 'Banking Used',    value: fmt(data.total_banking_kwh ?? 0) + ' kWh', icon: '\U0001f3e6', color: 'var(--amber)' },
    { label: 'Total Savings',   value: inr(data.total_savings_inr), icon: '\U0001f4b0', color: 'var(--amber)' },
    { label: 'Grid Cost (Base)',value: inr(data.total_grid_cost_inr), icon: '\U0001f50c', color: 'var(--text-sec)' },
    { label: 'Actual Cost',     value: inr(data.total_actual_cost_inr), icon: '\U0001f9fe', color: 'var(--text-sec)' },
    { label: 'Savings %',       value: n2f(data.savings_pct).toFixed(1) + '%', icon: '\U0001f4c8', color: 'var(--green-l)' },
    { label: 'Replacement %',   value: n2f(data.replacement_pct ?? 0).toFixed(1) + '%', icon: '\U0001f31e', color: 'var(--green)' },
    { label: 'CO₂ Saved',  value: n2f(data.co2_saved_tonnes ?? 0).toFixed(1) + ' t', icon: '\U0001f333', color: 'var(--green-l)' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 16, marginBottom: 4 }}>{c.icon}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
        </div>
      ))}
    </div>
  )
}
