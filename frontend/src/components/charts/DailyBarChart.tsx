/**
 * Chart 1 — Daily Generation, Consumption & Settlement (31-day stacked bar)
 */
import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import type { DailySummaryRow } from '../../api/client'

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement,
  Title, Tooltip, Legend, Filler,
)

interface Props { data: DailySummaryRow[] }

export default function DailyBarChart({ data }: Props) {
  const labels   = data.map(r => r.date.slice(5))           // MM-DD
  const gen      = data.map(r => r.generation_kwh)
  const matched  = data.map(r => r.matched_kwh)
  const banking  = data.map(r => r.banking_kwh)
  const grid     = data.map(r => r.grid_kwh)
  const cons     = data.map(r => r.consumption_kwh)

  const chartData = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Generation',
        data: gen,
        borderColor: '#1baf7a',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'y',
        fill: false,
      },
      {
        type: 'line' as const,
        label: 'Consumption',
        data: cons,
        borderColor: '#3b82f6',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'y',
        fill: false,
        borderDash: [4,4],
      },
      {
        type: 'bar' as const,
        label: 'Matched (Direct)',
        data: matched,
        backgroundColor: 'rgba(34,216,150,0.75)',
        stack: 'settlement',
        yAxisID: 'y',
      },
      {
        type: 'bar' as const,
        label: 'Banking Settled',
        data: banking,
        backgroundColor: 'rgba(245,158,11,0.75)',
        stack: 'settlement',
        yAxisID: 'y',
      },
      {
        type: 'bar' as const,
        label: 'Grid Import',
        data: grid,
        backgroundColor: 'rgba(227,73,72,0.65)',
        stack: 'settlement',
        yAxisID: 'y',
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        labels: { color: '#8ba4be', boxWidth: 12, padding: 16 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: '#5a7a9a', maxRotation: 45, font: { size: 10 } },
        grid:  { color: '#1e3a5f' },
      },
      y: {
        stacked: false,
        ticks: {
          color: '#8ba4be',
          callback: (v: any) => `${(v/1000).toFixed(0)}k`,
        },
        grid: { color: '#1e3a5f' },
        title: { display: true, text: 'kWh', color: '#5a7a9a' },
      },
    },
  }

  return (
    <div style={{ height: 380 }}>
      <Chart type="bar" data={chartData} options={options} />
    </div>
  )
}
