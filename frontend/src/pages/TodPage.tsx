/**
 * Chart 4 — TOD Analysis (Time-of-Day slot breakdown)
 */
import React, { useContext } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  ArcElement, Title, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { MonthContext } from '../App'
import TopBar from '../components/layout/TopBar'
import LoadingState from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { api } from '../api/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

const SLOT_COLORS: Record<string, string> = {
  'Morning Peak':   'rgba(245,158,11,0.8)',
  'Day Normal':     'rgba(34,216,150,0.8)',
  'Evening Peak':   'rgba(227,73,72,0.8)',
  'Night Off Peak': 'rgba(59,130,246,0.8)',
}

export default function TodPage() {
  const { month, setMonth } = useContext(MonthContext)
  const { data, loading, error } = useApi(() => api.c9.todAnalysis(month), [month])

  const labels  = data?.map(r => r.tod_slot) ?? []
  const bgColors = labels.map(l => SLOT_COLORS[l] ?? 'rgba(90,122,154,0.7)')

  const barData = data && {
    labels,
    datasets: [
      { label: 'Generation',  data: data.map(r => r.generation_kwh),  backgroundColor: bgColors },
      { label: 'Consumption', data: data.map(r => r.consumption_kwh), backgroundColor: bgColors.map(c => c.replace('0.8','0.4')) },
    ],
  }

  const donutData = data && {
    labels,
    datasets: [{
      data: data.map(r => r.generation_kwh),
      backgroundColor: bgColors,
      borderWidth: 0,
    }],
  }

  const barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#8ba4be', boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: '#5a7a9a' }, grid: { color: '#1e3a5f' } },
      y: {
        ticks: { color: '#8ba4be', callback: (v: any) => `${(v/1000).toFixed(0)}k` },
        grid: { color: '#1e3a5f' },
        title: { display: true, text: 'kWh', color: '#5a7a9a' },
      },
    },
  } as const

  return (
    <div>
      <TopBar month={month} onMonthChange={setMonth} title="Chart 4 — TOD Analysis" />
      <div style={{ padding: 24 }}>
        {loading ? <LoadingState height={380} /> :
         error   ? <LoadingState error={error} height={380} /> :
         data && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-title">Generation & Consumption by TOD Slot</div>
              <div style={{ height: 320 }}>
                <Bar data={barData!} options={barOpts} />
              </div>
            </div>

            <div className="card">
              <div className="card-title">Generation Share by Slot</div>
              <div style={{ height: 200, padding: '12px 0' }}>
                <Doughnut data={donutData!} options={{
                  plugins: { legend: { position: 'bottom', labels: { color: '#8ba4be', boxWidth: 12, padding: 10, font: { size: 11 } } } },
                  cutout: '60%',
                }} />
              </div>

              <div style={{ marginTop: 16 }}>
                {data.map(r => (
                  <div key={r.tod_slot} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{r.tod_slot}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--color-green-light)' }}>{fmt(r.generation_kwh)} kWh</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{fmt(r.consumption_kwh)} cons</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
