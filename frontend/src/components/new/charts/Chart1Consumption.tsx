/**
 * Chart1Consumption.tsx
 * Graph 1 — Portfolio Consumption by State (drillable)
 *
 * State view:  stacked bar (OA + BTM + Grid MWh) per state  +  avg CD (kVA) line on Y2
 * Drill view:  click any state bar → shows units within that state
 * Month:       single-month picker; defaults to previous calendar month
 */
import React, { useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

// ── Types ─────────────────────────────────────────────────────────────────────
interface UnitRow {
  name: string        // display name (truncated in chart)
  fullName: string    // tooltip full name
  oa: number          // MWh Open Access
  btm: number         // MWh Behind the Meter
  grid: number        // MWh Grid drawl
  cd: number          // kVA Contract Demand
}

interface StateRow {
  oa: number
  btm: number
  grid: number
  cd: number          // avg CD across units
  units: UnitRow[]
}

// ── Mock data ─────────────────────────────────────────────────────────────────
// Month keys: YYYY-MM
const MOCK_DATA: Record<string, Record<string, StateRow>> = {
  '2025-04': {
    Karnataka: {
      oa: 418, btm: 336, grid: 92, cd: 2310,
      units: [
        { name: 'Old Airport Rd',    fullName: 'OLD AIRPORT ROAD (E6HT209)',         oa: 52, btm: 40, grid: 10, cd: 310 },
        { name: 'Electronic City',   fullName: 'ELECTRONIC CITY (S13HT-87)',          oa: 46, btm: 34, grid: 8,  cd: 280 },
        { name: 'Whitefield',        fullName: 'WHITEFIELD (E4HT-355)',               oa: 44, btm: 33, grid: 9,  cd: 260 },
        { name: 'Sahakar Nagar',     fullName: 'SAHAKAR NAGAR (C8HT-111)',            oa: 38, btm: 30, grid: 7,  cd: 220 },
        { name: 'Malleswaram',       fullName: 'MALLESWARAM (C2HT-136)',              oa: 36, btm: 28, grid: 8,  cd: 210 },
        { name: 'Thanisandra',       fullName: 'THANISANDRA (C8HT-135)',              oa: 40, btm: 31, grid: 9,  cd: 230 },
        { name: 'HRBR Unit',         fullName: 'HRBR UNIT (E8HT-203)',               oa: 34, btm: 27, grid: 7,  cd: 195 },
        { name: 'Bellandur',         fullName: 'BELLANDUR (S11HT-124)',               oa: 42, btm: 35, grid: 10, cd: 250 },
        { name: 'Sarjapura',         fullName: 'SARJAPURA (S11HT-419)',               oa: 35, btm: 28, grid: 8,  cd: 200 },
        { name: 'Kanakapura',        fullName: 'KANAKAPURA (S12HT-99)',               oa: 30, btm: 24, grid: 7,  cd: 175 },
        { name: 'Bellandur Corp',    fullName: 'BELLANDUR CORP. OFFICE (S11BHT 406)', oa: 21, btm: 26, grid: 9,  cd: 180 },
      ],
    },
    Maharashtra: {
      oa: 185, btm: 122, grid: 54, cd: 890,
      units: [
        { name: 'Pune Hinjewadi',    fullName: 'PUNE HINJEWADI (MH-HNJ-01)',  oa: 62, btm: 40, grid: 18, cd: 300 },
        { name: 'Pune Wakad',        fullName: 'PUNE WAKAD (MH-WKD-02)',       oa: 58, btm: 38, grid: 16, cd: 290 },
        { name: 'Nashik Unit 1',     fullName: 'NASHIK UNIT 1 (MH-NSK-01)',   oa: 40, btm: 26, grid: 12, cd: 185 },
        { name: 'Aurangabad',        fullName: 'AURANGABAD (MH-ANG-01)',       oa: 25, btm: 18, grid: 8,  cd: 115 },
      ],
    },
    Telangana: {
      oa: 95, btm: 68, grid: 28, cd: 520,
      units: [
        { name: 'Hyderabad Kondapur', fullName: 'HYDERABAD KONDAPUR (TG-KDP-01)', oa: 48, btm: 36, grid: 14, cd: 270 },
        { name: 'Hyderabad Gachibowli', fullName: 'HYDERABAD GACHIBOWLI (TG-GCB-02)', oa: 47, btm: 32, grid: 14, cd: 250 },
      ],
    },
  },
}

// Seeded RNG — same formula used across all charts for consistency
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// Fill missing months by copying the closest available month with ±7% seeded jitter
function getMonthData(month: string): Record<string, StateRow> {
  if (MOCK_DATA[month]) return MOCK_DATA[month]
  const [yr, mo] = month.split('-').map(Number)
  const mSeed = (yr ?? 2025) * 100 + (mo ?? 4)
  const base = MOCK_DATA['2025-04']!
  const jitter = (v: number, salt: number) =>
    Math.round(v * (0.93 + rng(mSeed * 31 + salt) * 0.14))
  const result: Record<string, StateRow> = {}
  for (const [state, row] of Object.entries(base)) {
    const stateSalt = state.charCodeAt(0) * 7
    result[state] = {
      oa:   jitter(row.oa,   stateSalt + 1),
      btm:  jitter(row.btm,  stateSalt + 2),
      grid: jitter(row.grid, stateSalt + 3),
      cd:   jitter(row.cd,   stateSalt + 4),
      units: row.units.map((u, ui) => ({
        ...u,
        oa:   jitter(u.oa,   stateSalt + ui * 10 + 5),
        btm:  jitter(u.btm,  stateSalt + ui * 10 + 6),
        grid: jitter(u.grid, stateSalt + ui * 10 + 7),
        cd:   jitter(u.cd,   stateSalt + ui * 10 + 8),
      })),
    }
  }
  return result
}

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  oa:   '#2a78d6',   // blue  — Open Access
  btm:  '#1baf7a',   // green — BTM solar
  grid: '#eb6834',   // orange — Grid drawl
  cd:   '#eda100',   // amber — Contract Demand line
  gridLine: 'rgba(255,255,255,0.06)',
  axis: 'rgba(255,255,255,0.35)',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function prevMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmt(v: number) { return v.toLocaleString('en-IN', { maximumFractionDigits: 1 }) }

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  /** page-level unit filter: '' = all, '1' = unit1, etc. — reserved for future wiring */
  unitFilter?: string
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart1Consumption({ unitFilter = '' }: Props) {
  const [month, setMonth]         = useState(prevMonth)
  const [drillState, setDrillState] = useState<string | null>(null)
  const chartRef = React.useRef<ChartJS | null>(null)

  const monthData = getMonthData(month)
  const states    = Object.keys(monthData)

  // ── Build chart datasets ────────────────────────────────────────────────────
  let labels: string[]
  let oaData:   number[]
  let btmData:  number[]
  let gridData: number[]
  let cdData:   number[]

  if (drillState === null) {
    // State-level view
    labels   = states
    oaData   = states.map(s => monthData[s].oa)
    btmData  = states.map(s => monthData[s].btm)
    gridData = states.map(s => monthData[s].grid)
    cdData   = states.map(s => monthData[s].cd)
  } else {
    // Unit drill-down
    const units = monthData[drillState]?.units ?? []
    labels   = units.map(u => u.name)
    oaData   = units.map(u => u.oa)
    btmData  = units.map(u => u.btm)
    gridData = units.map(u => u.grid)
    cdData   = units.map(u => u.cd)
  }

  const chartData = {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'OA (MWh)',
        data: oaData,
        backgroundColor: C.oa,
        stack: 'cons',
        yAxisID: 'y',
        borderRadius: 0,
        borderSkipped: false,
      },
      {
        type: 'bar' as const,
        label: 'BTM (MWh)',
        data: btmData,
        backgroundColor: C.btm,
        stack: 'cons',
        yAxisID: 'y',
        borderRadius: 0,
        borderSkipped: false,
      },
      {
        type: 'bar' as const,
        label: 'Grid (MWh)',
        data: gridData,
        backgroundColor: C.grid,
        stack: 'cons',
        yAxisID: 'y',
        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: false,
      },
      {
        type: 'line' as const,
        label: drillState ? 'CD (kVA)' : 'Avg CD (kVA)',
        data: cdData,
        borderColor: C.cd,
        backgroundColor: 'transparent',
        pointBackgroundColor: C.cd,
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2,
        tension: 0.25,
        yAxisID: 'y2',
      },
    ],
  }

  const options: Parameters<typeof Chart>[0]['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    onClick: (_evt, elements) => {
      if (drillState !== null) return          // already drilled — no further drill
      if (!elements.length) return
      const idx = elements[0].index
      const state = states[idx]
      setDrillState(state)
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a2035',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 10,
        titleFont: { size: 12, weight: 'bold' },
        bodyFont: { size: 12 },
        callbacks: {
          title: (items) => {
            const idx = items[0].dataIndex
            if (drillState) {
              const u = monthData[drillState]?.units[idx]
              return u?.fullName ?? labels[idx]
            }
            return labels[idx]
          },
          label: (item) => {
            const v = item.raw as number
            if (item.dataset.label?.includes('CD')) return ` ${item.dataset.label}: ${fmt(v)} kVA`
            return ` ${item.dataset.label}: ${fmt(v)} MWh`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: C.gridLine },
        ticks: {
          color: C.axis,
          font: { size: 11 },
          maxRotation: labels.length > 5 ? 35 : 0,
          autoSkip: false,
        },
      },
      y: {
        stacked: true,
        position: 'left' as const,
        grid: { color: C.gridLine },
        ticks: { color: C.axis, font: { size: 11 } },
        title: { display: true, text: 'MWh', color: C.axis, font: { size: 11 } },
      },
      y2: {
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        ticks: { color: C.cd, font: { size: 11 } },
        title: { display: true, text: 'CD (kVA)', color: C.cd, font: { size: 11 } },
      },
    },
    // cursor: pointer on state bars in state view
    ...(drillState === null && { cursor: 'pointer' }),
  }

  // ── Totals for KPI row ──────────────────────────────────────────────────────
  const totalOA   = oaData.reduce((a, b) => a + b, 0)
  const totalBTM  = btmData.reduce((a, b) => a + b, 0)
  const totalGrid = gridData.reduce((a, b) => a + b, 0)
  const totalMWh  = totalOA + totalBTM + totalGrid
  const avgCD     = Math.round(cdData.reduce((a, b) => a + b, 0) / cdData.length)

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* ── Card header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: '1px solid var(--color-border)',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {drillState && (
            <button
              onClick={() => setDrillState(null)}
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid var(--color-border)',
                borderRadius: 6, padding: '4px 10px',
                color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer',
              }}
            >
              ← States
            </button>
          )}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {drillState
                ? `${drillState} — Units`
                : 'Portfolio Consumption by State'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {drillState
                ? 'Click ← to return to state view'
                : 'Stacked: OA + BTM + Grid · Click a state to drill into units'}
            </div>
          </div>
        </div>

        {/* Month picker */}
        <input
          type="month"
          value={month}
          onChange={e => { setMonth(e.target.value); setDrillState(null) }}
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '4px 8px',
            color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
          }}
        />
      </div>

      {/* ── KPI row ── */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--color-border)',
      }}>
        {[
          { label: 'Total',   value: `${fmt(totalMWh)} MWh`, color: 'var(--color-text-primary)' },
          { label: 'OA',      value: `${fmt(totalOA)} MWh`,   color: C.oa   },
          { label: 'BTM',     value: `${fmt(totalBTM)} MWh`,  color: C.btm  },
          { label: 'Grid',    value: `${fmt(totalGrid)} MWh`, color: C.grid },
          { label: 'Avg CD',  value: `${fmt(avgCD)} kVA`,     color: C.cd   },
        ].map((kpi, i) => (
          <div key={kpi.label} style={{
            flex: 1, padding: '10px 16px', textAlign: 'center',
            borderRight: i < 4 ? '1px solid var(--color-border)' : 'none',
          }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: kpi.color, marginTop: 3 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Chart area ── */}
      <div style={{ padding: '16px 20px 20px' }}>
        {/* Custom legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { color: C.oa,   label: 'Open Access (OA)' },
            { color: C.btm,  label: 'Behind the Meter (BTM)' },
            { color: C.grid, label: 'Grid Drawl' },
            { color: C.cd,   label: drillState ? 'CD (kVA)' : 'Avg CD (kVA)', dot: true },
          ].map(item => (
            <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {item.dot
                ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
                : <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, display: 'inline-block' }} />
              }
              {item.label}
            </span>
          ))}
        </div>

        {/* Canvas */}
        <div style={{ position: 'relative', height: 340 }}>
          <Chart
            ref={chartRef as React.RefObject<ChartJS>}
            type="bar"
            data={chartData}
            options={options}
          />
        </div>

        {/* Drill hint */}
        {drillState === null && (
          <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Click any bar to drill into units within that state
          </div>
        )}
      </div>
    </div>
  )
}
