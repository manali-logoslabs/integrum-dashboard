/**
 * GILWindSolarSplit.tsx — Monthly Wind vs Solar generation split
 * Supports chartType: 'bar' | 'pie' | 'doughnut'
 */
import React from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, ArcElement, Tooltip, Legend,
} from 'chart.js'
import { Bar, Pie, Doughnut } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const barOpts: any = {
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
    x: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#7A9BBF', font: { size: 10 } } },
    y: { stacked: true, grid: { color: 'rgba(24,45,71,.6)' }, ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v / 1000).toFixed(0)}k` } },
  },
}

const arcOpts: any = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right', labels: { color: '#7A9BBF', font: { size: 11 }, boxWidth: 12 } },
    tooltip: { backgroundColor: '#0C1A2E', borderColor: '#182D47', borderWidth: 1, titleColor: '#E2EEF9', bodyColor: '#7A9BBF' },
  },
}

export default function GILWindSolarSplit({ months = 13, chartType = 'bar' }: { months?: number; chartType?: string }) {
  const { data, loading } = useApi(() => api.gil.windSolarSplit(months), [months])

  if (loading) return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
  if (!data?.length) return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No data available</div>

  const totalWind  = data.reduce((s, r) => s + r.wind_kwh, 0)
  const totalSolar = data.reduce((s, r) => s + r.solar_kwh, 0)
  const total      = totalWind + totalSolar
  const isArc      = chartType === 'pie' || chartType === 'doughnut'

  const arcData = {
    labels: ['Wind', 'Solar'],
    datasets: [{
      data: [totalWind, totalSolar],
      backgroundColor: ['rgba(16,185,129,.85)', 'rgba(251,191,36,.85)'],
      borderColor: ['#10b981', '#fbbf24'],
      borderWidth: 1,
    }],
  }

  const barData = {
    labels: data.map(r => r.month),
    datasets: [
      { label: 'Wind',  data: data.map(r => r.wind_kwh),  backgroundColor: 'rgba(16,185,129,.85)', borderRadius: 3 },
      { label: 'Solar', data: data.map(r => r.solar_kwh), backgroundColor: 'rgba(251,191,36,.85)', borderRadius: 3 },
    ],
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
        {[
          { label: 'Wind',       value: `${(totalWind  / 1000).toFixed(0)} MWh`, pct: total > 0 ? (totalWind  / total * 100).toFixed(1) : '0', color: '#10b981' },
          { label: 'Solar',      value: `${(totalSolar / 1000).toFixed(0)} MWh`, pct: total > 0 ? (totalSolar / total * 100).toFixed(1) : '0', color: '#fbbf24' },
          { label: 'Total',      value: `${(total      / 1000).toFixed(0)} MWh`, pct: '100',                                                    color: 'var(--text)' },
        ].map(k => (
          <div key={k.label}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{k.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{k.pct}%</div>
          </div>
        ))}
      </div>
      <div style={{ height: 220 }}>
        {isArc
          ? (chartType === 'doughnut'
              ? <Doughnut data={arcData} options={arcOpts} />
              : <Pie      data={arcData} options={arcOpts} />)
          : <Bar data={barData} options={barOpts} />
        }
      </div>
    </div>
  )
}
