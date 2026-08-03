/**
 * Chart3DemandVsCD.tsx — Graph 3
 * Recorded Demand (kVA) vs Contract Demand
 *
 * - 15-min demand line + flat CD reference
 * - Exceedance points coloured by TOD zone (peak / normal / off-peak)
 * - Companion hour-of-day × day heatmap ("when do I peak?")
 * - Click any heatmap column → line chart zooms to that hour; click again to clear
 */
import React, { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Tooltip, Legend,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

// ── Units ─────────────────────────────────────────────────────────────────────
const UNITS = [
  { id:  1, short: 'Old Airport Rd',  cd: 3200 },
  { id:  2, short: 'Electronic City', cd: 2800 },
  { id:  3, short: 'Whitefield',      cd: 4100 },
  { id:  4, short: 'Sahakar Nagar',   cd: 1800 },
  { id:  5, short: 'Malleswaram',     cd: 2200 },
  { id:  6, short: 'Thanisandra',     cd: 2100 },
  { id:  7, short: 'HRBR Unit',       cd: 1600 },
  { id:  8, short: 'Bellandur',       cd: 3600 },
  { id:  9, short: 'Sarjapura',       cd: 1400 },
  { id: 10, short: 'Kanakapura',      cd: 1200 },
  { id: 11, short: 'Bellandur Corp',  cd:  800 },
]

// ── TOD zones (BESCOM Karnataka) ──────────────────────────────────────────────
type TodZone = 'peak' | 'normal' | 'offpeak'

function getTod(h: number): TodZone {
  if ((h >= 6 && h < 10) || (h >= 18 && h < 22)) return 'peak'
  if (h >= 22 || h < 6) return 'offpeak'
  return 'normal'
}

const TOD_COLOR: Record<TodZone, string> = {
  peak:    '#eb6834',
  normal:  '#1baf7a',
  offpeak: '#2a78d6',
}
const TOD_LABEL: Record<TodZone, string> = {
  peak:    'Peak (06-10 / 18-22)',
  normal:  'Normal (10-18)',
  offpeak: 'Off-peak (22-06)',
}

// ── Presets ───────────────────────────────────────────────────────────────────
type Preset = '7d' | '30d' | 'month' | 'FY'

const PRESETS: { id: Preset; label: string }[] = [
  { id: '7d',    label: 'Last 7d'  },
  { id: '30d',   label: 'Last 30d' },
  { id: 'month', label: 'Month'    },
  { id: 'FY',    label: 'FY'       },
]

// ── Mock data ─────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// Typical BESCOM daily load curve (0-1 factor per hour)
const BASE: number[] = [
  0.22, 0.20, 0.18, 0.17, 0.19, 0.28,   // 0-5  night
  0.48, 0.62, 0.76, 0.82, 0.78, 0.73,   // 6-11 morning peak
  0.70, 0.68, 0.70, 0.73, 0.78, 0.85,   // 12-17 day / ramp
  0.91, 0.95, 0.90, 0.80, 0.60, 0.38,   // 18-23 evening peak
]

interface Pt {
  label:        string
  demand:       number
  cd:           number
  todZone:      TodZone
  isExceedance: boolean
  hour:         number
  dayIdx:       number
}

function genDay(uid: number, cd: number, dayIdx: number, totalDays: number): Pt[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(today.getTime() - (totalDays - 1 - dayIdx) * 86_400_000)
  const dl = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

  return Array.from({ length: 96 }, (_, s) => {
    const h   = Math.floor(s / 4)
    const m   = (s % 4) * 15
    const lbl = `${dl} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`

    const base  = BASE[h] ?? 0.3
    const noise = (rng(uid * 1e4 + dayIdx * 96 + s) - 0.5) * 0.20
    const zone  = getTod(h)
    const spike = rng(uid * 777 + dayIdx * 33 + s) < (zone === 'peak' ? 0.13 : 0.03)
                    ? rng(uid + dayIdx * 9 + s) * 0.36 : 0
    const demand = Math.max(Math.round(cd * (base + noise + spike)), Math.round(cd * 0.07))
    return { label: lbl, demand, cd, todZone: zone, isExceedance: demand > cd, hour: h, dayIdx }
  })
}

function buildData(uid: number, cd: number, preset: Preset): Pt[] {
  const nDays   = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === 'month' ? 30 : 24
  const dayStep = preset === 'FY' ? 15 : 1
  const totalVisualDays = nDays * dayStep
  const pts: Pt[] = []
  for (let d = 0; d < nDays; d++) pts.push(...genDay(uid, cd, d, totalVisualDays))
  return pts
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
interface HeatCell { dayIdx: number; hour: number; maxRatio: number }

function buildHeatmap(pts: Pt[]): HeatCell[][] {
  const byDay = new Map<number, Pt[]>()
  for (const p of pts) {
    const arr = byDay.get(p.dayIdx) ?? []
    arr.push(p)
    byDay.set(p.dayIdx, arr)
  }
  return [...byDay.keys()].sort((a, b) => a - b).map(dayIdx =>
    Array.from({ length: 24 }, (_, h) => {
      const hp = (byDay.get(dayIdx) ?? []).filter(p => p.hour === h)
      const mx = hp.length ? Math.max(...hp.map(p => p.demand)) : 0
      return { dayIdx, hour: h, maxRatio: mx / (hp[0]?.cd ?? 1) }
    })
  )
}

function ratioColor(r: number): string {
  if (r >= 1.2)  return 'rgba(192,57,43,0.92)'
  if (r >= 1.0)  return 'rgba(231,76,60,0.88)'
  if (r >= 0.85) return 'rgba(230,126,34,0.75)'
  if (r >= 0.65) return 'rgba(241,196,15,0.55)'
  if (r >= 0.45) return 'rgba(46,204,113,0.38)'
  return 'rgba(52,152,219,0.20)'
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 12, padding: 20,
}
const SEL: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 6, padding: '4px 8px',
  color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
}
const GRID_C  = 'rgba(255,255,255,0.06)'
const AXIS_C  = 'rgba(255,255,255,0.35)'

// ── Main chart ────────────────────────────────────────────────────────────────
export default function Chart3DemandVsCD() {
  const [unitId,  setUnitId]  = useState(1)
  const [preset,  setPreset]  = useState<Preset>('7d')
  const [selHour, setSelHour] = useState<number | null>(null)

  const unit   = UNITS.find(u => u.id === unitId)!
  const allPts = useMemo(() => buildData(unitId, unit.cd, preset), [unitId, unit.cd, preset])
  const heatmap = useMemo(() => buildHeatmap(allPts), [allPts])

  // When an hour is selected, show one (max) point per day for that hour
  const chartPts = useMemo<Pt[]>(() => {
    if (selHour === null) return allPts
    const byDay = new Map<number, Pt[]>()
    for (const p of allPts.filter(p => p.hour === selHour)) {
      const arr = byDay.get(p.dayIdx) ?? []; arr.push(p); byDay.set(p.dayIdx, arr)
    }
    return [...byDay.keys()].sort((a, b) => a - b).map(dayIdx => {
      const hp = byDay.get(dayIdx)!
      return hp.reduce((best, p) => p.demand > best.demand ? p : best, hp[0])
    })
  }, [allPts, selHour])

  // KPI stats (always over full period)
  const excCount  = useMemo(() => allPts.filter(p => p.isExceedance).length, [allPts])
  const maxDemand = useMemo(() => Math.max(...allPts.map(p => p.demand)), [allPts])
  const excPct    = useMemo(() => Math.round((excCount / allPts.length) * 100), [excCount, allPts])

  const ptRadii = chartPts.map(p => p.isExceedance ? 4 : 0)
  const ptColors = chartPts.map(p => p.isExceedance ? TOD_COLOR[p.todZone] : 'transparent')

  const chartData = {
    labels: chartPts.map(p => p.label),
    datasets: [
      {
        label: 'Demand (kVA)',
        data: chartPts.map(p => p.demand),
        borderColor: 'rgba(42,120,214,0.65)',
        borderWidth: 1.5,
        pointRadius: ptRadii,
        pointBackgroundColor: ptColors,
        pointBorderWidth: 0,
        fill: false,
        tension: 0.3,
        order: 2,
      },
      {
        label: `CD — ${unit.cd.toLocaleString()} kVA`,
        data: chartPts.map(() => unit.cd),
        borderColor: '#eda100',
        borderWidth: 1.5,
        borderDash: [6, 3],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 1,
      },
    ],
  }

  const chartOpts = useMemo<ChartOptions<'line'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(15,22,38,0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: 'rgba(255,255,255,0.9)',
        bodyColor: 'rgba(255,255,255,0.7)',
        padding: 10,
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => items[0]?.label ?? '',
          label: (item: TooltipItem<'line'>) => {
            if (item.datasetIndex === 1) return `  CD: ${(item.parsed.y ?? 0).toLocaleString()} kVA`
            const p = chartPts[item.dataIndex]
            if (!p) return ''
            const pct = Math.round((p.demand / p.cd) * 100)
            const lines: string[] = [`  Demand: ${p.demand.toLocaleString()} kVA (${pct}% of CD)`]
            lines.push(`  Zone: ${TOD_LABEL[p.todZone]}`)
            if (p.isExceedance) lines.push('  ⚠ Exceedance')
            return lines
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: AXIS_C, font: { size: 10 }, maxTicksLimit: 10, maxRotation: 0 },
        grid: { color: GRID_C },
      },
      y: {
        ticks: { color: AXIS_C, font: { size: 10 } },
        grid: { color: GRID_C },
        title: { display: true, text: 'kVA', color: AXIS_C, font: { size: 10 } },
      },
    },
  }), [chartPts])

  return (
    <div style={CARD}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
            Recorded Demand vs Contract Demand
          </div>
          <div style={{ fontSize:11, color:'var(--color-text-muted)', marginTop:3 }}>
            15-min kVA · exceedances coloured by TOD zone
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select value={unitId} onChange={e => { setUnitId(+e.target.value); setSelHour(null) }} style={{ ...SEL, minWidth:140 }}>
            {UNITS.map(u => <option key={u.id} value={u.id}>{u.short}</option>)}
          </select>
          <div style={{ display:'flex', gap:4 }}>
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => { setPreset(p.id); setSelHour(null) }} style={{
                padding:'4px 10px', borderRadius:5, fontSize:11, cursor:'pointer',
                background: preset === p.id ? 'rgba(42,120,214,0.20)' : 'transparent',
                border: `1px solid ${preset === p.id ? '#2a78d6' : 'var(--color-border)'}`,
                color: preset === p.id ? '#74b0f5' : 'var(--color-text-muted)',
              }}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display:'flex', gap:28, marginBottom:14, flexWrap:'wrap' }}>
        {([
          { label:'Contract Demand', val:`${unit.cd.toLocaleString()} kVA`,   color:'#eda100' },
          { label:'Peak demand',     val:`${maxDemand.toLocaleString()} kVA`, color:'#eb6834' },
          { label:'Exceedances',     val:`${excCount.toLocaleString()} slots (${excPct}%)`, color: excCount > 0 ? '#e74c3c' : '#1baf7a' },
        ] as { label: string; val: string; color: string }[]).map(({ label, val, color }) => (
          <div key={label}>
            <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:2 }}>{label}</div>
            <div style={{ fontSize:14, fontWeight:700, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:16, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:26, height:2, background:'rgba(42,120,214,0.65)' }} />
          <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>Demand</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <svg width="26" height="4"><line x1="0" y1="2" x2="26" y2="2" stroke="#eda100" strokeWidth="2" strokeDasharray="5,3"/></svg>
          <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>CD reference</span>
        </div>
        {(['peak','normal','offpeak'] as TodZone[]).map(z => (
          <div key={z} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:TOD_COLOR[z] }} />
            <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>
              {z.charAt(0).toUpperCase() + z.slice(1)} exceedance
            </span>
          </div>
        ))}
      </div>

      {/* Hour filter pill */}
      {selHour !== null && (
        <div style={{ marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:'#74b0f5', background:'rgba(42,120,214,0.12)', padding:'3px 10px', borderRadius:20, border:'1px solid rgba(42,120,214,0.3)' }}>
            Hour filter: {String(selHour).padStart(2,'0')}:00–{String(selHour).padStart(2,'0')}:59 · daily peak
          </span>
          <button onClick={() => setSelHour(null)} style={{
            fontSize:10, padding:'2px 8px', borderRadius:4, cursor:'pointer',
            background:'transparent', border:'1px solid var(--color-border)', color:'var(--color-text-muted)',
          }}>✕ Clear</button>
        </div>
      )}

      {/* Line chart */}
      <div style={{ height:280, marginBottom:24 }}>
        <Line data={chartData} options={chartOpts} />
      </div>

      {/* Heatmap */}
      <HeatmapGrid
        heatmap={heatmap}
        selectedHour={selHour}
        onClickHour={h => setSelHour(prev => prev === h ? null : h)}
      />
    </div>
  )
}

// ── Heatmap component ─────────────────────────────────────────────────────────
interface HeatmapProps {
  heatmap:      HeatCell[][]
  selectedHour: number | null
  onClickHour:  (h: number) => void
}

function HeatmapGrid({ heatmap, selectedHour, onClickHour }: HeatmapProps) {
  const CELL_W = 18
  const CELL_H = Math.max(10, Math.min(20, Math.floor(240 / Math.max(heatmap.length, 1))))
  const LABEL_W = 64

  if (heatmap.length === 0) return null

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, alignItems:'center' }}>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text-secondary)' }}>
          Hour-of-day exceedance heatmap
          <span style={{ fontSize:10, color:'var(--color-text-muted)', fontWeight:400, marginLeft:8 }}>
            Click a column to filter chart · red = exceedance
          </span>
        </div>
      </div>

      {/* Hour header */}
      <div style={{ display:'flex', marginLeft:LABEL_W, marginBottom:3 }}>
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            onClick={() => onClickHour(h)}
            title={`Click to filter: ${String(h).padStart(2,'0')}:00`}
            style={{
              width:CELL_W, textAlign:'center', fontSize:9, cursor:'pointer',
              color: selectedHour === h ? '#74b0f5' : 'var(--color-text-muted)',
              fontWeight: selectedHour === h ? 700 : 400,
              visibility: [0,6,12,18,23].includes(h) ? 'visible' : 'hidden',
            }}
          >
            {String(h).padStart(2,'0')}
          </div>
        ))}
      </div>

      {/* Rows (one per day) */}
      <div style={{ overflowY:'auto', maxHeight:280 }}>
        {heatmap.map((row, ri) => {
          const today = new Date(); today.setHours(0,0,0,0)
          const totalRows = heatmap.length
          const ref = new Date(today.getTime() - (totalRows - 1 - ri) * 86_400_000)
          const dayLbl = ref.toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
          return (
            <div key={ri} style={{ display:'flex', alignItems:'center', marginBottom:2 }}>
              <div style={{ width:LABEL_W, fontSize:9, color:'var(--color-text-muted)', textAlign:'right', paddingRight:6, flexShrink:0 }}>
                {dayLbl}
              </div>
              {row.map(cell => (
                <div
                  key={cell.hour}
                  onClick={() => onClickHour(cell.hour)}
                  title={`${String(cell.hour).padStart(2,'0')}:00 → ${Math.round(cell.maxRatio * 100)}% of CD${cell.maxRatio >= 1 ? ' ⚠' : ''}`}
                  style={{
                    width:CELL_W - 1, height:CELL_H,
                    background:ratioColor(cell.maxRatio),
                    marginRight:1, borderRadius:2, cursor:'pointer',
                    outline: selectedHour === cell.hour ? '2px solid #74b0f5' : 'none',
                    outlineOffset: -1,
                    transition:'outline .1s',
                    flexShrink:0,
                  }}
                />
              ))}
            </div>
          )
        })}
      </div>

      {/* Color legend */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>Low demand</span>
        {[0.2, 0.45, 0.65, 0.85, 1.0, 1.1, 1.25].map((r, i) => (
          <div key={i} style={{ width:14, height:10, background:ratioColor(r), borderRadius:2 }} />
        ))}
        <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>Exceedance</span>
        <div style={{ display:'flex', alignItems:'center', gap:4, marginLeft:8 }}>
          <div style={{ width:10, height:10, background:'rgba(231,76,60,0.88)', borderRadius:2 }} />
          <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>{'≥ 100% CD'}</span>
        </div>
      </div>
    </div>
  )
}
