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
  const labels  = data.map(r => r.date.slice(5))  // MM-DD

  // Lapsed = generation surplus not consumed or banked (expires from banking pool).
  // Grid   = demand that couldn't be met by generation or banking.
  // Exactly one of the two is non-zero on any given day.
  const lapsedData = data.map(r =>
    r.lapsed_kwh != null
      ? r.lapsed_kwh
      : Math.max(0, r.generation_kwh - r.matched_kwh - r.banking_kwh)
  )
  const hasGrid   = data.some(r => r.grid_kwh   > 0)
  const hasLapsed = lapsedData.some(v => v > 0)

  const chartData = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Generation',
        data: data.map(r => r.generation_kwh),
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
        data: data.map(r => r.consumption_kwh),
        borderColor: '#3b82f6',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        yAxisID: 'y',
        fill: false,
        borderDash: [4, 4],
      },
      {
        type: 'bar' as const,
        label: 'Matched (Direct)',
        data: data.map(r => r.matched_kwh),
        backgroundColor: 'rgba(34,216,150,0.75)',
        stack: 'settlement',
        yAxisID: 'y',
      },
      {
        type: 'bar' as const,
        label: 'Banking Used',
        data: data.map(r => r.banking_kwh),
        backgroundColor: 'rgba(245,166,35,0.75)',
        stack: 'settlement',
        yAxisID: 'y',
      },
      // In surplus months (no grid drawl) show Lapsed Units; in deficit months show Grid Import.
      ...(hasGrid ? [{
        type: 'bar' as const,
        label: 'Grid Import',
        data: data.map(r => r.grid_kwh),
        backgroundColor: 'rgba(227,73,72,0.65)',
        stack: 'settlement',
        yAxisID: 'y',
      }] : []),
      ...(hasLapsed ? [{
        type: 'bar' as const,
        label: 'Lapsed Units',
        data: lapsedData,
        backgroundColor: 'rgba(245,100,35,0.65)',
        stack: 'settlement',
        yAxisID: 'y',
      }] : []),
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
