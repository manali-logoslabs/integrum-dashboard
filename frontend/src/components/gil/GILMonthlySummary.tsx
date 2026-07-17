import React from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend } from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend)

const n2f = (v: any) => typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0
const lbl = (ctx: any) => ` ${ctx.dataset.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh`
const scaleCfg: any = (stacked: boolean) => ({
  x: { stacked, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 10 } } },
  y: { stacked, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v/1000).toFixed(0)}k` } },
})
const opts = (stacked: boolean): any => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } }, tooltip: { backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1, titleColor: '#E2EEF9', bodyColor: '#7A9BBF', callbacks: { label: lbl } } },
  scales: scaleCfg(stacked),
})

export default function GILMonthlySummary({ months = 13, chartType = 'bar' }: { months?: number; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.monthlySummary(months), [months])
  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data available</div>

  const totalGen  = data.reduce((s, r) => s + n2f(r.generation_kwh), 0)
  const totalCons = data.reduce((s, r) => s + n2f(r.consumption_kwh), 0)
  const avgRepl   = data.reduce((s, r) => s + n2f(r.replacement_pct), 0) / (data.length || 1)
  const labels    = data.map(r => r.month)
  const isArea    = chartType === 'area'
  const isLine    = chartType === 'line' || isArea

  const lineDs: any[] = [
    { label: 'Wind',        data: data.map(r => r.wind_kwh),        borderColor: '#10b981', backgroundColor: isArea ? 'rgba(16,185,129,.25)' : 'transparent', fill: isArea, tension: 0.3, pointRadius: 2 },
    { label: 'Solar',       data: data.map(r => r.solar_kwh),       borderColor: '#fbbf24', backgroundColor: isArea ? 'rgba(251,191,36,.2)' : 'transparent',  fill: isArea, tension: 0.3, pointRadius: 2 },
    { label: 'Consumption', data: data.map(r => r.consumption_kwh), borderColor: '#60a5fa', backgroundColor: isArea ? 'rgba(96,165,250,.15)' : 'transparent', fill: isArea, tension: 0.3, pointRadius: 2 },
  ]
  const barDs: any[] = [
    { label: 'Wind',  data: data.map(r => r.wind_kwh),  backgroundColor: 'rgba(16,185,129,.85)', stack: 'gen', borderRadius: 3 },
    { label: 'Solar', data: data.map(r => r.solar_kwh), backgroundColor: 'rgba(251,191,36,.85)', stack: 'gen', borderRadius: 3 },
    { type: 'line', label: 'Consumption', data: data.map(r => r.consumption_kwh), borderColor: '#60a5fa', backgroundColor: 'transparent', pointRadius: 3, tension: 0.3 },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Gen: <strong style={{ color: '#10b981' }}>{(totalGen/1e6).toFixed(2)} GWh</strong></span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Cons: <strong style={{ color: '#60a5fa' }}>{(totalCons/1e6).toFixed(2)} GWh</strong></span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg Replacement: <strong style={{ color: '#f59e0b' }}>{avgRepl.toFixed(1)}%</strong></span>
      </div>
      <div style={{ height: 220 }}>
        {isLine ? <Line data={{ labels, datasets: lineDs }} options={opts(false)} /> : <Bar data={{ labels, datasets: barDs }} options={opts(true)} />}
      </div>
    </div>
  )
}
