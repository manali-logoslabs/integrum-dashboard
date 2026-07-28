/**
 * ChartTodDaily
 * =============
 * Daily / 60min Generation vs Consumption per ToD slot.
 * Mirrors the old dashboard's "ToD Hourly/Daily/Monthly (Without Banking)".
 *
 * Daily  — /tod-daily  (15-min tables aggregated to daily per slot)
 * 60min  — /tod-hourly (15-min tables aggregated to 1-hour buckets per slot)
 *
 * Daily chart : Line — Generation (solid) & Consumption (dashed) per slot.
 * 60min chart : Bar  — Generation bars colored by TOD slot (stacked, one slot
 *               per hour), plus a Total Consumption line overlay.
 */
import React, { useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarController, BarElement,
  LineController, LineElement, PointElement,
  Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { Line } from 'react-chartjs-2'
import { useApi } from '../../hooks/useApi'
import { api } from '../../api/client'

ChartJS.register(
  CategoryScale, LinearScale,
  BarController, BarElement,
  LineController, LineElement, PointElement,
  Tooltip, Legend,
)

// ── Slot config ───────────────────────────────────────────────────────────────

const SLOTS = [
  { key: 'Morning_Peak',  label: 'Morning Peak (06-09h)',    color: '#F59E0B' },
  { key: 'Day_Normal',    label: 'Day Normal (09-18h)',      color: '#3B82F6' },
  { key: 'Evening_Peak',  label: 'Evening Peak (18-22h)',   color: '#EF4444' },
  { key: 'Night_Offpeak', label: 'Night Off-Peak (22-06h)', color: '#8B5CF6' },
]

// hex → rgba helper
const rgba = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

type Granularity = 'daily' | '60min'

// ── Chart options factory ─────────────────────────────────────────────────────

function makeDailyOpts(): any {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'right',
        labels: { color: '#7A9BBF', font: { size: 10 }, boxWidth: 24, boxHeight: 2, padding: 10 },
      },
      tooltip: {
        backgroundColor: '#0C1A2E',
        borderColor: '#182D47',
        borderWidth: 1,
        titleColor: '#E2EEF9',
        bodyColor: '#7A9BBF',
        callbacks: {
          label: (ctx: any) =>
            ` ${ctx.dataset.label}: ${(ctx.raw as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(24,45,71,.5)' },
        ticks: {
          color: '#7A9BBF',
          font: { size: 9 },
          maxTicksLimit: 10,
          callback: (_: any, i: number, ticks: any[]) => {
            if (i === 0 || i === ticks.length - 1 || i % 3 === 0) return ticks[i]?.label ?? ''
            return ''
          },
        },
      },
      y: {
        grid: { color: 'rgba(24,45,71,.6)' },
        ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v / 1000).toFixed(0)}k` },
      },
    },
  }
}

function makeHourlyOpts(hours: string[]): any {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'right',
        labels: { color: '#7A9BBF', font: { size: 10 }, boxWidth: 24, boxHeight: 2, padding: 10 },
      },
      tooltip: {
        backgroundColor: '#0C1A2E',
        borderColor: '#182D47',
        borderWidth: 1,
        titleColor: '#E2EEF9',
        bodyColor: '#7A9BBF',
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.raw as number ?? 0
            if (val === 0) return null
            return ` ${ctx.dataset.label}: ${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: 'rgba(24,45,71,.3)' },
        ticks: {
          color: '#7A9BBF',
          font: { size: 9 },
          autoSkip: false,
          maxRotation: 45,
          callback: (_: any, i: number) => {
            const label = hours[i] ?? ''
            if (label.endsWith('T00:00')) {
              // Midnight — show date
              const dt = new Date(label.replace('T', ' ') + ':00')
              return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            }
            return ''
          },
        },
      },
      y: {
        stacked: true,
        grid: { color: 'rgba(24,45,71,.6)' },
        ticks: { color: '#4A6A8A', font: { size: 10 }, callback: (v: any) => `${(v / 1000).toFixed(0)}k` },
      },
    },
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  month:      string    // used for daily view (single month)
  fromMonth?: string    // unused, kept for API compatibility
  toMonth?:   string    // unused, kept for API compatibility
}

export default function ChartTodDaily({ month }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [visibleSlots, setVisibleSlots] = useState<Set<string>>(
    () => new Set(SLOTS.map(s => s.key))
  )

  const dailyFetch  = useApi(() => api.c9.todDaily(month),  [month])
  const hourlyFetch = useApi(() => api.c9.todHourly(month), [month])

  const loading = granularity === 'daily' ? dailyFetch.loading : hourlyFetch.loading

  if (loading) return (
    <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  // ── Daily view ────────────────────────────────────────────────────────────
  if (granularity === 'daily') {
    const data = dailyFetch.data ?? []
    if (!data.length) return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
        No 15-min slot data for {month}
      </div>
    )

    const dates = [...new Set(data.map(r => r.date))].sort()
    const lookup: Record<string, Record<string, { generation_kwh: number; consumption_kwh: number }>> = {}
    for (const r of data) {
      ;(lookup[r.date] ??= {})[r.tod_slot] = { generation_kwh: r.generation_kwh, consumption_kwh: r.consumption_kwh }
    }

    const labels = dates.map(d => {
      const dt = new Date(d + 'T00:00:00')
      return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    })

    const datasets: any[] = []
    for (const slot of SLOTS) {
      if (!visibleSlots.has(slot.key)) continue
      datasets.push({
        label: `${slot.label} — Gen`,
        data: dates.map(d => lookup[d]?.[slot.key]?.generation_kwh ?? 0),
        borderColor: slot.color,
        backgroundColor: rgba(slot.color, 0.08),
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: false,
      })
      datasets.push({
        label: `${slot.label} — Cons`,
        data: dates.map(d => lookup[d]?.[slot.key]?.consumption_kwh ?? 0),
        borderColor: slot.color,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 3],
        tension: 0.3,
        pointRadius: 1,
        pointHoverRadius: 4,
        fill: false,
      })
    }

    const slotTotals = SLOTS.map(s => ({
      ...s,
      gen:  data.filter(r => r.tod_slot === s.key).reduce((a, r) => a + r.generation_kwh, 0),
      cons: data.filter(r => r.tod_slot === s.key).reduce((a, r) => a + r.consumption_kwh, 0),
    }))
    const fmtK = (n: number) => `${(n / 1000).toFixed(1)}k`

    return (
      <div>
        {renderControls(granularity, setGranularity, visibleSlots, setVisibleSlots)}
        <div style={{ height: 240 }}>
          <Line data={{ labels, datasets }} options={makeDailyOpts()} />
        </div>
        {renderSummaryCards(slotTotals, fmtK)}
      </div>
    )
  }

  // ── 60min view ────────────────────────────────────────────────────────────
  const hdata = hourlyFetch.data ?? []
  if (!hdata.length) return (
    <div>
      {renderControls(granularity, setGranularity, visibleSlots, setVisibleSlots)}
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
        No hourly slot data for {month}
      </div>
    </div>
  )

  const hours = [...new Set(hdata.map(r => r.hour_ts))].sort()
  const hlookup: Record<string, Record<string, { generation_kwh: number; consumption_kwh: number }>> = {}
  for (const r of hdata) {
    ;(hlookup[r.hour_ts] ??= {})[r.tod_slot] = { generation_kwh: r.generation_kwh, consumption_kwh: r.consumption_kwh }
  }

  const hdatasets: any[] = []

  // Generation bars — one dataset per slot (stacked, null for hours not in this slot)
  for (const slot of SLOTS) {
    if (!visibleSlots.has(slot.key)) continue
    hdatasets.push({
      type: 'bar' as const,
      label: `${slot.label} — Gen`,
      data: hours.map(h => hlookup[h]?.[slot.key]?.generation_kwh ?? null),
      backgroundColor: rgba(slot.color, 0.8),
      borderColor: slot.color,
      borderWidth: 0,
      stack: 'gen',
      order: 2,
    })
  }

  // Total consumption line overlay
  hdatasets.push({
    type: 'line' as const,
    label: 'Total Consumption',
    data: hours.map(h => {
      if (!hlookup[h]) return 0
      return Object.values(hlookup[h]).reduce((sum, v) => sum + v.consumption_kwh, 0)
    }),
    borderColor: '#FF4D4D',
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.2,
    stack: undefined,
    order: 1,
  })

  const hSlotTotals = SLOTS.map(s => ({
    ...s,
    gen:  hdata.filter(r => r.tod_slot === s.key).reduce((a, r) => a + r.generation_kwh, 0),
    cons: hdata.filter(r => r.tod_slot === s.key).reduce((a, r) => a + r.consumption_kwh, 0),
  }))
  const fmtKH = (n: number) => `${(n / 1000).toFixed(1)}k`

  return (
    <div>
      {renderControls(granularity, setGranularity, visibleSlots, setVisibleSlots)}
      <div style={{ height: 240 }}>
        <Bar data={{ labels: hours, datasets: hdatasets }} options={makeHourlyOpts(hours)} />
      </div>
      {renderSummaryCards(hSlotTotals, fmtKH)}
    </div>
  )
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function renderControls(
  granularity: Granularity,
  setGranularity: (g: Granularity) => void,
  visibleSlots: Set<string>,
  setVisibleSlots: (fn: (prev: Set<string>) => Set<string>) => void,
) {
  const toggleSlot = (key: string) => {
    setVisibleSlots(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
      {/* Granularity toggle */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,.04)', borderRadius: 6, padding: 2 }}>
        {(['daily', '60min'] as Granularity[]).map(g => (
          <button
            key={g}
            onClick={() => setGranularity(g)}
            style={{
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 4,
              border: 'none',
              background: granularity === g ? 'rgba(74,158,255,.25)' : 'transparent',
              color: granularity === g ? '#4A9EFF' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: granularity === g ? 700 : 400,
              textTransform: 'capitalize',
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Slot toggle pills */}
      {SLOTS.map(s => {
        const on = visibleSlots.has(s.key)
        return (
          <button
            key={s.key}
            onClick={() => toggleSlot(s.key)}
            style={{
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 20,
              border: `1px solid ${s.color}`,
              background: on ? `rgba(${parseInt(s.color.slice(1,3),16)},${parseInt(s.color.slice(3,5),16)},${parseInt(s.color.slice(5,7),16)},0.2)` : 'transparent',
              color: on ? s.color : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: on ? 700 : 400,
              transition: 'all .15s',
            }}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

function renderSummaryCards(
  slotTotals: Array<{ key: string; label: string; color: string; gen: number; cons: number }>,
  fmtK: (n: number) => string,
) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 10 }}>
      {slotTotals.map(s => (
        <div
          key={s.key}
          style={{
            background: 'rgba(255,255,255,.03)',
            border: `1px solid rgba(${parseInt(s.color.slice(1,3),16)},${parseInt(s.color.slice(3,5),16)},${parseInt(s.color.slice(5,7),16)},0.4)`,
            borderRadius: 6,
            padding: '5px 8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>{s.label}</div>
          <div style={{ fontSize: 11, color: s.color, fontWeight: 700 }}>
            ⚡ {fmtK(s.gen)} kWh
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-sec)' }}>
            🔌 {fmtK(s.cons)} kWh
          </div>
        </div>
      ))}
    </div>
  )
}
