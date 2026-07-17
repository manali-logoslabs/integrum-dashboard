/**
 * GILDailyGen.tsx — Daily Generation (Wind + Solar stacked) vs Consumption
 * Supports chartType: 'bar' | 'line' | 'area'
 */
import React from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, Filler, Tooltip, Legend,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend)

const baseScales: any = {
  x: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 9 }, maxRotation: 45 } },
  y: { grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v / 1000).toFixed(0)}k` } },
}

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
    x: { ...baseScales.x, stacked },
    y: { ...baseScales.y, stacked },
  },
})

export default function GILDailyGen({ month, chartType = 'bar' }: { month: string; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.dailySummary(month), [month])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data for {month}</div>

  const labels    = data.map(r => r.date.slice(5))
  const totalGen  = data.reduce((s, r) => s + r.generation_kwh, 0)
  const totalCons = data.reduce((s, r) => s + r.consumption_kwh, 0)
  const isArea = chartType === 'area'
  const isLine = chartType === 'line' || isArea

  const lineDs: any[] = [
    { label: 'Wind',        data: data.map(r => r.wind_kwh),        borderColor: '#10b981', backgroundColor: isArea ? 'rgba(16,185,129,.2)'  : 'rgba(16,185,129,.8)',  fill: isArea, tension: 0.3, pointRadius: 1 },
    { label: 'Solar',       data: data.map(r => r.solar_kwh),       borderColor: '#fbbf24', backgroundColor: isArea ? 'rgba(251,191,36,.15)' : 'rgba(251,191,36,.8)',  fill: isArea, tension: 0.3, pointRadius: 1 },
    { label: 'Consumption', data: data.map(r => r.consumption_kwh), borderColor: '#60a5fa', backgroundColor: isArea ? 'rgba(96,165,250,.1)'  : 'rgba(96,165,250,.8)',  fill: isArea, tension: 0.3, pointRadius: 1 },
  ]

  const barDs: any[] = [
    { label: 'Wind',        data: data.map(r => r.wind_kwh),        backgroundColor: 'rgba(16,185,129,.85)', borderRadius: 3 },
    { label: 'Solar',       data: data.map(r => r.solar_kwh),       backgroundColor: 'rgba(251,191,36,.85)', borderRadius: 3 },
    { label: 'Consumption', data: data.map(r => r.consumption_kwh), type: 'line' as any, borderColor: '#60a5fa', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2, borderWidth: 2, order: -1 },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Generation', value: `${(totalGen / 1000).toFixed(0)} MWh`,  color: '#10b981' },
          { label: 'Consumption',      value: `${(totalCons / 1000).toFixed(0)} MWh`, color: '#60a5fa' },
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
