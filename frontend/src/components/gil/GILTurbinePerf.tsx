/**
 * GILTurbinePerf.tsx — Per-turbine & inverter annual performance
 */
import React, { useState } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
const fmt = (v: any) => { const n = n2f(v); if (n >= 1e6) return (n/1e6).toFixed(2)+'M'; if (n >= 1e3) return (n/1e3).toFixed(0)+'k'; return n.toFixed(0) }

export default function GILTurbinePerf({ financialYear = '2025-2026', chartType = 'bar' }: { financialYear?: string; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.turbinePerformance(financialYear), [financialYear])
  const [view, setView] = useState<'chart' | 'table'>('chart')

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No turbine data for {financialYear}</div>

  const wind  = data.filter(d => d.source_type === 'WIND')
  const solar = data.filter(d => d.source_type === 'SOLAR')
  const allDevices = [...wind, ...solar]

  const OPTS: any = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#7A9BBF', font: { size: 10 }, boxWidth: 12 } },
      tooltip: {
        backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
        titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
        callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh` },
      },
    },
    scales: {
      x: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 9 } } },
      y: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => fmt(v) } },
    },
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {['chart', 'table'].map(v => (
          <button key={v} onClick={() => setView(v as any)} style={{
            padding: '3px 10px', fontSize: 10, borderRadius: 6, border: '1px solid var(--border)',
            background: view === v ? 'var(--blue)' : 'transparent',
            color: view === v ? '#fff' : 'var(--text-muted)', cursor: 'pointer',
          }}>
            {v === 'chart' ? '📊 Chart' : '📋 Table'}
          </button>
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>{financialYear}</span>
      </div>

      {view === 'chart' ? (
        <div style={{ height: 210 }}>
          <Bar
            data={{ labels: allDevices.map(d => d.device_code), datasets: [
              { label: 'Generation', data: allDevices.map(d => d.generation_kwh), backgroundColor: allDevices.map(d => d.source_type === 'WIND' ? 'rgba(16,185,129,.85)' : 'rgba(251,191,36,.85)'), borderRadius: 4 },
              { label: 'Losses',     data: allDevices.map(d => d.losses_kwh),     backgroundColor: 'rgba(248,113,113,.5)', borderRadius: 4 },
            ]}}
            options={OPTS}
          />
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                {['Device', 'Type', 'Capacity (kW)', 'Generation (kWh)', 'Losses (kWh)', 'Loss %', 'PLF %'].map(h => (
                  <th key={h} style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, padding: '3px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allDevices.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                  <td style={{ padding: '3px 6px', color: d.source_type === 'WIND' ? '#10b981' : '#fbbf24', fontWeight: 600 }}>{d.device_code}</td>
                  <td style={{ padding: '3px 6px', color: 'var(--text-muted)', textAlign: 'right' }}>{d.source_type}</td>
                  <td style={{ padding: '3px 6px', color: 'var(--text-sec)',   textAlign: 'right' }}>{n2f(d.rated_capacity_kw).toFixed(0)}</td>
                  <td style={{ padding: '3px 6px', color: 'var(--text-sec)',   textAlign: 'right' }}>{fmt(d.generation_kwh)}</td>
                  <td style={{ padding: '3px 6px', color: '#f87171',           textAlign: 'right' }}>{fmt(d.losses_kwh)}</td>
                  <td style={{ padding: '3px 6px', color: '#f87171',           textAlign: 'right' }}>{n2f(d.losses_pct).toFixed(2)}%</td>
                  <td style={{ padding: '3px 6px', color: '#f59e0b',           textAlign: 'right' }}>{d.plf_pct != null ? n2f(d.plf_pct).toFixed(2) + '%' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
