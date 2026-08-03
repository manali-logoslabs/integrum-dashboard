/**
 * Chart2TimeSeries.tsx
 * Graph 2 — Unit Consumption Time Series
 *
 * - Unit selector (11 Karnataka units)
 * - Granularity: hourly | daily
 * - Presets: monthly, FY, 5-year | custom from–to (max 3 months)
 * - Y auto-switches kWh (hourly) ↔ MWh (daily / monthly+)
 * - X = time labels
 */
import React, { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, LineElement,
  PointElement, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler)

// ── Units ─────────────────────────────────────────────────────────────────────
const UNITS = [
  { id: 1,  name: 'OLD AIRPORT ROAD (E6HT209)',          short: 'Old Airport Rd'    },
  { id: 2,  name: 'ELECTRONIC CITY (S13HT-87)',           short: 'Electronic City'   },
  { id: 3,  name: 'WHITEFIELD (E4HT-355)',                short: 'Whitefield'        },
  { id: 4,  name: 'SAHAKAR NAGAR (C8HT-111)',             short: 'Sahakar Nagar'     },
  { id: 5,  name: 'MALLESWARAM (C2HT-136)',               short: 'Malleswaram'       },
  { id: 6,  name: 'THANISANDRA (C8HT-135)',               short: 'Thanisandra'       },
  { id: 7,  name: 'HRBR UNIT (E8HT-203)',                 short: 'HRBR Unit'         },
  { id: 8,  name: 'BELLANDUR (S11HT-124)',                short: 'Bellandur'         },
  { id: 9,  name: 'SARJAPURA (S11HT-419)',                short: 'Sarjapura'         },
  { id: 10, name: 'KANAKAPURA (S12HT-99)',                short: 'Kanakapura'        },
  { id: 11, name: 'BELLANDUR CORP. OFFICE (S11BHT 406)', short: 'Bellandur Corp'    },
]

// ── Granularity / preset types ────────────────────────────────────────────────
type Granularity = 'hourly' | 'daily'
type Preset      = 'monthly' | 'FY' | '5y' | 'custom'

// ── Colour tokens ─────────────────────────────────────────────────────────────
const BLUE       = '#2a78d6'
const BLUE_FILL  = 'rgba(42,120,214,0.10)'
const GRID_LINE  = 'rgba(255,255,255,0.06)'
const AXIS_COLOR = 'rgba(255,255,255,0.35)'

// ── Mock data generators ──────────────────────────────────────────────────────
function seeded(seed: number, min: number, max: number): number {
  // deterministic pseudo-random based on seed
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return min + (x - Math.floor(x)) * (max - min)
}

/** base consumption kWh/15min for a unit (varies by unit id, time of day) */
function baseKwh(unitId: number, slotIndex: number): number {
  const base = 20 + unitId * 3.5          // units with higher id have more load
  const tod  = Math.sin((slotIndex / 96) * 2 * Math.PI - 1.2) * 8  // daily curve
  const noise = seeded(unitId * 1000 + slotIndex, -3, 3)
  return Math.max(2, base + tod + noise)
}

/** Hourly — aggregate 4 × 15min per hour */
function genHourly(unitId: number, days: number): { labels: string[]; values: number[] } {
  const hours = days * 24
  const labels: string[] = []
  const values: number[] = []
  const now = new Date()
  now.setMinutes(0, 0, 0)
  for (let i = hours - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600_000)
    labels.push(
      days <= 3
        ? t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
          ' ' + t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    )
    // sum 4 slots
    let sum = 0
    for (let s = 0; s < 4; s++) sum += seeded(unitId * 10000 + (hours - 1 - i) * 4 + s,
      baseKwh(unitId, (hours - 1 - i) % 24 * 4 + s) * 0.85,
      baseKwh(unitId, (hours - 1 - i) % 24 * 4 + s) * 1.15)
    values.push(+sum.toFixed(1))
  }
  return { labels, values }
}

/** Daily — in MWh */
function genDaily(unitId: number, days: number): { labels: string[]; values: number[] } {
  const labels: string[] = []
  const values: number[] = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 86_400_000)
    labels.push(t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: days > 365 ? '2-digit' : undefined }))
    // sum 96 slots, convert to MWh
    let sum = 0
    for (let s = 0; s < 96; s++) sum += seeded(unitId * 10000 + (days - 1 - i) * 96 + s,
      baseKwh(unitId, s) * 0.85, baseKwh(unitId, s) * 1.15)
    values.push(+(sum / 1000).toFixed(2))
  }
  return { labels, values }
}

// ── Preset → { granularity, days } ────────────────────────────────────────────
function fyDays(): number {
  // Days since 1 Apr of the current FY
  const today = new Date()
  const fyYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  const fyStart = new Date(fyYear, 3, 1)   // Apr 1
  return Math.max(1, Math.ceil((today.getTime() - fyStart.getTime()) / 86_400_000) + 1)
}

function thisMonthDays(): number {
  const today = new Date()
  return today.getDate()   // days elapsed in current calendar month
}

const PRESET_CONFIG: Record<Exclude<Preset, 'custom'>, { gran: Granularity; days: number; label: string }> = {
  'monthly': { gran: 'daily',   days: thisMonthDays(), label: 'This month'     },
  'FY':      { gran: 'daily',   days: fyDays(),        label: 'Financial Year' },
  '5y':      { gran: 'daily',   days: 1825,            label: '5 Years'        },
}

function daysForCustom(from: string, to: string): number {
  if (!from || !to) return 30
  const diff = new Date(to).getTime() - new Date(from).getTime()
  if (isNaN(diff)) return 30
  return Math.max(1, Math.round(diff / 86_400_000) + 1)
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtVal(v: number, unit: 'kWh' | 'MWh') {
  return unit === 'kWh' ? v.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' kWh'
                        : v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' MWh'
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysAgoStr(n: number) {
  const d = new Date(Date.now() - n * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────
// Max 3-month span helper — safe against empty / invalid date strings
function addMonths(dateStr: string, n: number): string {
  if (!dateStr) return todayStr()
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return todayStr()
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export default function Chart2TimeSeries() {
  const [unitId,   setUnitId]   = useState(1)
  const [preset,   setPreset]   = useState<Preset>('monthly')
  const [gran,     setGran]     = useState<Granularity>('daily')
  const [fromDate, setFromDate] = useState(() => {
    // Default custom range: start of current month
    const d = new Date(); d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(todayStr)

  // When preset changes, sync granularity
  function handlePreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') setGran(PRESET_CONFIG[p].gran)
  }

  function handleGran(g: Granularity) { setGran(g) }

  // Custom date handlers — enforce max 3-month span; ignore clear (empty string)
  function handleFromDate(v: string) {
    if (!v) return          // user hit "clear" — keep previous valid date
    setFromDate(v)
    const maxTo = addMonths(v, 3)
    if (toDate > maxTo) setToDate(maxTo)
  }
  function handleToDate(v: string) {
    if (!v) return          // user hit "clear" — keep previous valid date
    setToDate(v)
    const minFrom = addMonths(v, -3)
    if (fromDate < minFrom) setFromDate(minFrom)
  }

  // Derive days
  const days = useMemo(() => {
    if (preset === 'custom') return daysForCustom(fromDate, toDate)
    return PRESET_CONFIG[preset].days
  }, [preset, fromDate, toDate])

  // Generate series data
  const { labels, values } = useMemo(() => {
    if (gran === 'hourly') return genHourly(unitId, Math.min(days, 30))  // cap hourly to 30 days
    return genDaily(unitId, days)
  }, [unitId, gran, days])

  // Auto Y-axis unit
  const yUnit: 'kWh' | 'MWh' = gran === 'daily' ? 'MWh' : 'kWh'

  // KPIs
  const total    = values.reduce((a, b) => a + b, 0)
  const peak     = Math.max(...values)
  const avg      = total / values.length
  const peakIdx  = values.indexOf(peak)
  const peakLabel = labels[peakIdx] ?? '—'

  const chartData = {
    labels,
    datasets: [{
      label: `Consumption (${yUnit})`,
      data: values,
      borderColor: BLUE,
      backgroundColor: BLUE_FILL,
      borderWidth: 2,
      pointRadius: labels.length > 200 ? 0 : labels.length > 60 ? 1 : 3,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: true,
    }],
  }

  const options: Parameters<typeof Line>[0]['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a2035',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (item) => ` ${fmtVal(item.raw as number, yUnit)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: GRID_LINE },
        ticks: {
          color: AXIS_COLOR,
          font: { size: 10 },
          maxTicksLimit: 12,
          maxRotation: 35,
        },
      },
      y: {
        grid: { color: GRID_LINE },
        ticks: { color: AXIS_COLOR, font: { size: 11 } },
        title: { display: true, text: yUnit, color: AXIS_COLOR, font: { size: 11 } },
      },
    },
  }

  const unit = UNITS.find(u => u.id === unitId)!

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 6, padding: '4px 8px',
    color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Unit Consumption Time Series
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
          Single-unit view · {yUnit} · {labels.length.toLocaleString()} data points
        </div>
      </div>

      {/* ── Controls row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
        padding: '10px 20px',
        borderBottom: '1px solid var(--color-border)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        {/* Unit selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Unit</span>
          <select
            value={unitId}
            onChange={e => setUnitId(Number(e.target.value))}
            style={{ ...inputStyle, minWidth: 190 }}
          >
            {UNITS.map(u => (
              <option key={u.id} value={u.id}>{u.short}</option>
            ))}
          </select>
        </div>

        {/* Granularity switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>View</span>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            {(['hourly', 'daily'] as Granularity[]).map((g, idx) => (
              <button
                key={g}
                onClick={() => handleGran(g)}
                style={{
                  padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                  background: gran === g ? 'rgba(42,120,214,0.25)' : 'var(--color-bg)',
                  color: gran === g ? '#60a5fa' : 'var(--color-text-secondary)',
                  border: 'none',
                  borderRight: idx === 0 ? '1px solid var(--color-border)' : 'none',
                  fontWeight: gran === g ? 700 : 400,
                }}
              >
                {g === 'hourly' ? 'Hourly' : 'Daily'}
              </button>
            ))}
          </div>
        </div>

        {/* Range presets */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['monthly', 'FY', '5y'] as Preset[]).map(p => (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              style={{
                padding: '4px 9px', fontSize: 11, cursor: 'pointer', borderRadius: 5,
                background: preset === p ? 'rgba(27,175,122,0.2)' : 'transparent',
                color: preset === p ? '#1baf7a' : 'var(--color-text-muted)',
                border: `1px solid ${preset === p ? 'rgba(27,175,122,0.4)' : 'var(--color-border)'}`,
                fontWeight: preset === p ? 700 : 400,
              }}
            >
              {p === 'monthly' ? 'Month' : p === '5y' ? '5Y' : 'FY'}
            </button>
          ))}

          {/* Custom range */}
          <button
            onClick={() => handlePreset('custom')}
            style={{
              padding: '4px 9px', fontSize: 11, cursor: 'pointer', borderRadius: 5,
              background: preset === 'custom' ? 'rgba(237,161,0,0.15)' : 'transparent',
              color: preset === 'custom' ? '#eda100' : 'var(--color-text-muted)',
              border: `1px solid ${preset === 'custom' ? 'rgba(237,161,0,0.35)' : 'var(--color-border)'}`,
            }}
          >
            Custom
          </button>
        </div>

        {/* Custom date pickers — max 3-month span enforced */}
        {preset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <input
              type="date" value={fromDate}
              max={todayStr()}
              onChange={e => handleFromDate(e.target.value)}
              style={inputStyle}
            />
            <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>→</span>
            <input
              type="date" value={toDate}
              min={fromDate}
              max={addMonths(fromDate, 3)}
              onChange={e => handleToDate(e.target.value)}
              style={inputStyle}
            />
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>max 3 months</span>
          </div>
        )}
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
        {[
          { label: 'Total',       value: fmtVal(total, yUnit) },
          { label: 'Peak',        value: fmtVal(peak, yUnit)  },
          { label: 'Avg / period', value: fmtVal(avg, yUnit)  },
          { label: 'Peak at',     value: peakLabel            },
        ].map((k, i) => (
          <div key={k.label} style={{
            flex: 1, padding: '10px 16px', textAlign: 'center',
            borderRight: i < 3 ? '1px solid var(--color-border)' : 'none',
          }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {k.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 3 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Chart ── */}
      <div style={{ padding: '16px 20px 20px' }}>
        {/* Unit badge */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontSize: 12, color: '#60a5fa',
            background: 'rgba(42,120,214,0.12)',
            border: '1px solid rgba(42,120,214,0.3)',
            borderRadius: 5, padding: '3px 10px', fontWeight: 600,
          }}>
            {unit.name}
          </div>
        </div>

        <div style={{ position: 'relative', height: 320 }}>
          <Line data={chartData} options={options} />
        </div>
      </div>
    </div>
  )
}
