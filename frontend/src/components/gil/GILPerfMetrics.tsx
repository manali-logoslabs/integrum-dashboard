/**
 * GILPerfMetrics.tsx — Annual PLF / CUF / PR / Losses dashboard cards
 */
import React, { useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
const fmt = (v: any) => { const n = n2f(v); if (n >= 1e6) return (n/1e6).toFixed(2)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'k'; return n.toFixed(0) }
const PCT_YEARS = ['2024-2025', '2025-2026', '2026-2027']

export default function GILPerfMetrics({ defaultYear = '2025-2026' }: { defaultYear?: string }) {
  const [year, setYear] = useState(defaultYear)
  const { data, loading } = useApi(() => api.gil.performanceMetrics(year), [year])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Financial Year:</span>
        {PCT_YEARS.map(y => (
          <button key={y} onClick={() => setYear(y)} style={{
            padding: '2px 10px', fontSize: 10, borderRadius: 6, border: '1px solid var(--border)',
            background: year === y ? 'var(--blue)' : 'transparent', color: year === y ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
          }}>{y}</button>
        ))}
      </div>

      {loading && <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}
      {!loading && !data && <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {year}</div>}
      {!loading && data && (
        <>
          {/* PLF Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Overall PLF',  value: data.plf_pct != null ? n2f(data.plf_pct).toFixed(2)+'%' : '—',       color: '#10b981' },
              { label: 'Wind PLF',     value: data.wind_plf_pct != null ? n2f(data.wind_plf_pct).toFixed(2)+'%' : '—', color: '#6ee7b7' },
              { label: 'Solar PLF',    value: data.solar_plf_pct != null ? n2f(data.solar_plf_pct).toFixed(2)+'%' : '—', color: '#fbbf24' },
              { label: 'Total Losses', value: n2f(data.losses_pct).toFixed(2)+'%',     color: '#f87171' },
              { label: 'Wind Losses',  value: n2f(data.wind_losses_pct).toFixed(2)+'%', color: '#f87171' },
              { label: 'Solar Losses', value: n2f(data.solar_losses_pct).toFixed(2)+'%', color: '#fb923c' },
            ].map(c => (
              <div key={c.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Generation breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { label: 'Total Gen (Before)',  value: fmt(data.generation_before_losses_kwh)+' kWh', color: '#60a5fa' },
              { label: 'Total Gen (After)',   value: fmt(data.generation_kwh)+' kWh',               color: '#10b981' },
              { label: 'Total Losses',        value: fmt(data.losses_kwh)+' kWh',                   color: '#f87171' },
              { label: 'Wind Generation',     value: fmt(data.wind_generation_kwh)+' kWh',           color: '#34d399' },
              { label: 'Solar Generation',    value: fmt(data.solar_generation_kwh)+' kWh',          color: '#fbbf24' },
              { label: 'Total Capacity',      value: n2f(data.total_capacity_kw).toFixed(0)+' kW',  color: '#a78bfa' },
            ].map(c => (
              <div key={c.label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{c.label}</div>
              </div>
            ))}
          </div>
          {data.data_source && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
              Data: {data.data_source === 'computed_from_readings' ? '⚠️ Computed from readings (estimated)' : '✅ From performance_metrics table'}
            </div>
          )}
        </>
      )}
    </div>
  )
}
