/**
 * GILGenLosses.tsx — Before-loss vs After-loss generation, Wind + Solar breakdown
 * Supports chartType: 'bar' | 'line'
 */
import React from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, Tooltip, Legend,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0

const mkOpts = (stacked: boolean): any => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1,
      titleColor: '#E2EEF9', bodyColor: '#7A9BBF',
      callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh` },
    },
  },
  scales: {
    x: { stacked, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 10 } } },
    y: { stacked, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v / 1000).toFixed(0)}k` } },
  },
})

export default function GILGenLosses({ months = 13, chartType = 'bar' }: { months?: number; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.generationLosses(months), [months])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data available</div>

  const labels      = data.map(r => r.month)
  const totalBefore = data.reduce((s, r) => s + n2f(r.total_before_losses_kwh), 0)
  const totalAfter  = data.reduce((s, r) => s + n2f(r.total_after_losses_kwh), 0)
  const totalLoss   = totalBefore - totalAfter
  const avgLossPct  = totalBefore > 0 ? (totalLoss / totalBefore * 100).toFixed(2) : '0'
  const isLine = chartType === 'line'

  const lineDs: any[] = [
    { label: 'Before Losses', data: data.map(r => r.total_before_losses_kwh), borderColor: '#60a5fa', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
    { label: 'After Losses',  data: data.map(r => r.total_after_losses_kwh),  borderColor: '#10b981', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
    { label: 'Losses',        data: data.map(r => r.total_losses_kwh),         borderColor: '#f87171', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
  ]

  const barDs: any[] = [
    { label: 'Wind Delivered',  data: data.map(r => r.wind_after_losses_kwh),  backgroundColor: 'rgba(16,185,129,.85)', borderRadius: 3, stack: 'a' },
    { label: 'Solar Delivered', data: data.map(r => r.solar_after_losses_kwh), backgroundColor: 'rgba(251,191,36,.85)', borderRadius: 3, stack: 'a' },
    { label: 'Total Losses',    data: data.map(r => r.total_losses_kwh),        backgroundColor: 'rgba(248,113,113,.7)', borderRadius: 3, stack: 'a' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Before Losses', value: `${(totalBefore / 1000).toFixed(0)} MWh`, color: '#60a5fa' },
          { label: 'Total After Losses',  value: `${(totalAfter  / 1000).toFixed(0)} MWh`, color: '#10b981' },
          { label: 'Avg Loss %',          value: `${avgLossPct}%`,                          color: '#f87171' },
        ].map(k => (
          <div key={k.label}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 220 }}>
        {isLine
          ? <Line data={{ labels, datasets: lineDs }} options={mkOpts(false)} />
          : <Bar  data={{ labels, datasets: barDs  }} options={mkOpts(true)} />
        }
      </div>
    </div>
  )
}
