/**
 * Chart4DemandDuration.tsx — Graph 4
 * Demand Duration Curve + Exceedance Histogram
 *
 * DDC tab   : sorted 15-min blocks (kVA) descending vs flat CD reference.
 *             Area above CD shaded red (exceedance region).
 * Histo tab : blocks binned by % of CD; bins are configurable.
 * BESS KPIs : exceedance count · excursion energy (kVAh) · max excursion (kVA)
 *             · longest contiguous excursion (min).
 * Horizon   : Month (~2,880 blocks) or FY (35,040 blocks).
 */
import React, { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Tooltip, Legend, Filler,
  type TooltipItem,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Tooltip, Legend, Filler,
)

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

type Horizon = 'month' | 'FY'
type View    = 'ddc' | 'histogram'

// ── Seeded RNG + daily load curve (same params as Chart3 for data consistency)
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

const BASE: number[] = [
  0.22, 0.20, 0.18, 0.17, 0.19, 0.28,   // 0-5  night
  0.48, 0.62, 0.76, 0.82, 0.78, 0.73,   // 6-11 morning peak
  0.70, 0.68, 0.70, 0.73, 0.78, 0.85,   // 12-17 daytime / ramp
  0.91, 0.95, 0.90, 0.80, 0.60, 0.38,   // 18-23 evening peak
]

function getTod(h: number): 'peak' | 'offpeak' | 'normal' {
  if ((h >= 6 && h < 10) || (h >= 18 && h < 22)) return 'peak'
  if (h >= 22 || h < 6) return 'offpeak'
  return 'normal'
}

function genDemand(uid: number, cd: number, dayIdx: number, slot: number): number {
  const h     = Math.floor(slot / 4)
  const base  = BASE[h] ?? 0.3
  const noise = (rng(uid * 1e4 + dayIdx * 96 + slot) - 0.5) * 0.20
  const zone  = getTod(h)
  const spike = rng(uid * 777 + dayIdx * 33 + slot) < (zone === 'peak' ? 0.13 : 0.03)
                  ? rng(uid + dayIdx * 9 + slot) * 0.36 : 0
  return Math.max(Math.round(cd * (base + noise + spike)), Math.round(cd * 0.07))
}

function buildRaw(uid: number, cd: number, horizon: Horizon): number[] {
  const nDays = horizon === 'month' ? 30 : 365
  const out: number[] = []
  for (let d = 0; d < nDays; d++)
    for (let s = 0; s < 96; s++)
      out.push(genDemand(uid, cd, d, s))
  return out
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MAX_DISPLAY = 1500

function downsample(arr: number[]): number[] {
  if (arr.length <= MAX_DISPLAY) return arr
  const f = arr.length / MAX_DISPLAY
  return Array.from({ length: MAX_DISPLAY }, (_, i) => arr[Math.floor(i * f)])
}

function longestRun(raw: number[], cd: number): number {
  let best = 0, cur = 0
  for (const b of raw) { if (b > cd) { cur++; if (cur > best) best = cur } else cur = 0 }
  return best
}

// ── Histogram bins ────────────────────────────────────────────────────────────
interface Bin { label: string; count: number; bg: string; border: string }

function buildBins(raw: number[], cd: number, t: [number, number, number]): Bin[] {
  const pct = (b: number) => (b / cd) * 100
  return [
    { label:`≤${t[0]}%`,      count:raw.filter(b => pct(b) <= t[0]).length,                          bg:'rgba(27,175,122,0.70)',  border:'#1baf7a' },
    { label:`${t[0]}–${t[1]}%`,count:raw.filter(b => { const p=pct(b); return p>t[0]&&p<=t[1] }).length, bg:'rgba(237,161,0,0.75)',   border:'#eda100' },
    { label:`${t[1]}–${t[2]}%`,count:raw.filter(b => { const p=pct(b); return p>t[1]&&p<=t[2] }).length, bg:'rgba(235,104,52,0.75)',  border:'#eb6834' },
    { label:`>${t[2]}%`,       count:raw.filter(b => pct(b) > t[2]).length,                           bg:'rgba(231,76,60,0.80)',   border:'#e74c3c' },
  ]
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background:'var(--color-surface)', border:'1px solid var(--color-border)',
  borderRadius:12, padding:20,
}
const SEL: React.CSSProperties = {
  background:'var(--color-bg)', border:'1px solid var(--color-border)',
  borderRadius:6, padding:'4px 8px',
  color:'var(--color-text-primary)', fontSize:12, outline:'none',
}
const GRID_C = 'rgba(255,255,255,0.06)'
const AXIS_C = 'rgba(255,255,255,0.35)'

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart4DemandDuration() {
  const [unitId,     setUnitId]     = useState(1)
  const [horizon,    setHorizon]    = useState<Horizon>('month')
  const [view,       setView]       = useState<View>('ddc')
  const [thresholds, setThresholds] = useState<[number, number, number]>([100, 110, 120])

  const unit = UNITS.find(u => u.id === unitId)!

  const raw     = useMemo(() => buildRaw(unitId, unit.cd, horizon), [unitId, unit.cd, horizon])
  const sorted  = useMemo(() => [...raw].sort((a, b) => b - a), [raw])
  const display = useMemo(() => downsample(sorted), [sorted])
  const bins    = useMemo(() => buildBins(raw, unit.cd, thresholds), [raw, unit.cd, thresholds])

  // BESS metrics
  const excBlocks  = useMemo(() => raw.filter(b => b > unit.cd), [raw, unit.cd])
  const excCount   = excBlocks.length
  const excEnergy  = useMemo(
    () => Math.round(excBlocks.reduce((s, b) => s + (b - unit.cd) * 0.25, 0)),
    [excBlocks, unit.cd],
  )
  const maxExc     = useMemo(
    () => excBlocks.reduce((mx, b) => Math.max(mx, b - unit.cd), 0),
    [excBlocks, unit.cd],
  )
  const longestMin = useMemo(() => longestRun(raw, unit.cd) * 15, [raw, unit.cd])

  const fmtPct = (n: number) => `${((n / raw.length) * 100).toFixed(1)}%`

  // ── DDC chart data ──
  const ddcData = {
    labels: display.map((_, i) => i),
    datasets: [
      {
        label: 'Demand (kVA)',
        data: display,
        borderColor: '#2a78d6',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: { target: 1, above: 'rgba(231,76,60,0.18)', below: 'rgba(0,0,0,0)' },
        tension: 0,
        order: 2,
      },
      {
        label: `CD — ${unit.cd.toLocaleString()} kVA`,
        data: display.map(() => unit.cd),
        borderColor: '#eda100',
        borderWidth: 1.5,
        borderDash: [6, 3],
        pointRadius: 0,
        fill: false as const,
        tension: 0,
        order: 1,
      },
    ],
  }

  const ddcOpts = {
    responsive: true, maintainAspectRatio: false, animation: false as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index' as const, intersect: false,
        backgroundColor: 'rgba(15,22,38,0.95)',
        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
        titleColor: 'rgba(255,255,255,0.9)', bodyColor: 'rgba(255,255,255,0.7)',
        padding: 10,
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => {
            const idx = items[0]?.dataIndex ?? 0
            const blk = Math.floor(idx * sorted.length / display.length)
            const pct = ((blk / sorted.length) * 100).toFixed(1)
            return `Block ${blk.toLocaleString()} — exceeded ${pct}% of time`
          },
          label: (item: TooltipItem<'line'>) => {
            if (item.datasetIndex === 1) return `  CD: ${unit.cd.toLocaleString()} kVA`
            const v = item.parsed.y ?? 0
            const p = Math.round((v / unit.cd) * 100)
            return `  Demand: ${v.toLocaleString()} kVA (${p}% of CD)${v > unit.cd ? ' ⚠' : ''}`
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: AXIS_C, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0,
          callback: (_: unknown, idx: number) => {
            const blk = Math.floor(idx * sorted.length / display.length)
            return `${((blk / sorted.length) * 100).toFixed(0)}%`
          },
        },
        grid: { color: GRID_C },
        title: { display: true, text: '% of time (sorted highest → lowest)', color: AXIS_C, font: { size: 10 } },
      },
      y: {
        ticks: { color: AXIS_C, font: { size: 10 } },
        grid: { color: GRID_C },
        title: { display: true, text: 'kVA', color: AXIS_C, font: { size: 10 } },
      },
    },
  }

  // ── Histogram chart data ──
  const histData = {
    labels: bins.map(b => b.label),
    datasets: [{
      label: 'Blocks',
      data: bins.map(b => b.count),
      backgroundColor: bins.map(b => b.bg),
      borderColor: bins.map(b => b.border),
      borderWidth: 1, borderRadius: 5,
    }],
  }

  const histOpts = {
    responsive: true, maintainAspectRatio: false, animation: false as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,22,38,0.95)',
        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
        titleColor: 'rgba(255,255,255,0.9)', bodyColor: 'rgba(255,255,255,0.7)',
        padding: 10,
        callbacks: {
          label: (item: TooltipItem<'bar'>) => {
            const cnt = item.parsed.y ?? 0
            const hrs = (cnt * 0.25).toFixed(1)
            const pct = ((cnt / raw.length) * 100).toFixed(1)
            return [`  ${cnt.toLocaleString()} blocks`, `  ${hrs} hrs (${pct}% of period)`]
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: AXIS_C, font: { size: 12 } },
        grid: { display: false },
        title: { display: true, text: '% of Contract Demand', color: AXIS_C, font: { size: 10 } },
      },
      y: {
        ticks: { color: AXIS_C, font: { size: 10 } },
        grid: { color: GRID_C },
        title: { display: true, text: '15-min blocks', color: AXIS_C, font: { size: 10 } },
      },
    },
  }

  const updateThreshold = (i: number, val: number) =>
    setThresholds(prev => {
      const n = [...prev] as [number, number, number]
      n[i] = val
      return n
    })

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
            Demand Duration Curve + Exceedance Histogram
          </div>
          <div style={{ fontSize:11, color:'var(--color-text-muted)', marginTop:3 }}>
            Sorted 15-min blocks vs CD · BESS-sizing metrics
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select value={unitId} onChange={e => setUnitId(+e.target.value)} style={{ ...SEL, minWidth:140 }}>
            {UNITS.map(u => <option key={u.id} value={u.id}>{u.short}</option>)}
          </select>
          <div style={{ display:'flex', gap:4 }}>
            {(['month','FY'] as Horizon[]).map(h => (
              <button key={h} onClick={() => setHorizon(h)} style={{
                padding:'4px 10px', borderRadius:5, fontSize:11, cursor:'pointer',
                background: horizon === h ? 'rgba(42,120,214,0.20)' : 'transparent',
                border: `1px solid ${horizon === h ? '#2a78d6' : 'var(--color-border)'}`,
                color: horizon === h ? '#74b0f5' : 'var(--color-text-muted)',
              }}>
                {h === 'month' ? 'Month (~2,880 blks)' : 'Full Year (35,040 blks)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BESS metrics ── */}
      <div style={{
        display:'flex', marginBottom:18,
        background:'rgba(27,175,122,0.05)',
        border:'1px solid rgba(27,175,122,0.20)',
        borderRadius:8, overflow:'hidden',
      }}>
        {([
          {
            label:'Exceedance blocks',
            val:  `${excCount.toLocaleString()}`,
            sub:  `${(excCount * 0.25).toFixed(1)} hrs · ${fmtPct(excCount)}`,
            color: excCount > 0 ? '#e74c3c' : '#1baf7a',
          },
          {
            label:'Excursion energy',
            val:  `${excEnergy.toLocaleString()} kVAh`,
            sub:  'cumulative above CD',
            color:'#eb6834',
          },
          {
            label:'Max excursion',
            val:  maxExc > 0 ? `+${maxExc.toLocaleString()} kVA` : '—',
            sub:  maxExc > 0 ? `${Math.round((maxExc / unit.cd) * 100)}% above CD` : 'no exceedance',
            color:'#eda100',
          },
          {
            label:'Longest run',
            val:  longestMin > 0 ? `${longestMin} min` : '—',
            sub:  longestMin > 0 ? `${longestMin / 15} consecutive blocks` : 'no exceedance',
            color:'#eda100',
          },
        ] as { label:string; val:string; sub:string; color:string }[]).map(({ label, val, sub, color }, i, a) => (
          <div key={label} style={{
            flex:1, padding:'10px 14px',
            borderRight: i < a.length - 1 ? '1px solid rgba(27,175,122,0.15)' : 'none',
            minWidth: 120,
          }}>
            <div style={{ fontSize:10, color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>
              {label}
            </div>
            <div style={{ fontSize:15, fontWeight:700, color }}>{val}</div>
            <div style={{ fontSize:10, color:'var(--color-text-muted)', marginTop:2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── View tabs + threshold config ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:4 }}>
          {([['ddc','Duration Curve'], ['histogram','Exceedance Histogram']] as [View, string][]).map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding:'5px 14px', borderRadius:6, fontSize:12, cursor:'pointer',
              background: view === v ? 'rgba(42,120,214,0.20)' : 'transparent',
              border: `1px solid ${view === v ? '#2a78d6' : 'var(--color-border)'}`,
              color: view === v ? '#74b0f5' : 'var(--color-text-muted)',
              fontWeight: view === v ? 600 : 400,
            }}>{lbl}</button>
          ))}
        </div>

        {view === 'histogram' && (
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>Bin thresholds:</span>
            {thresholds.map((t, i) => (
              <React.Fragment key={i}>
                <input
                  type="number" value={t} min={100} max={200} step={5}
                  onChange={e => updateThreshold(i, +e.target.value)}
                  style={{ ...SEL, width:54, textAlign:'center', padding:'3px 5px' }}
                />
                <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>%</span>
                {i < 2 && <span style={{ fontSize:11, color:'var(--color-border)' }}>·</span>}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* ── Chart ── */}
      {view === 'ddc' ? (
        <>
          <div style={{ display:'flex', gap:16, marginBottom:8, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:24, height:2, background:'#2a78d6' }} />
              <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>Demand</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#eda100" strokeWidth="2" strokeDasharray="5,3"/></svg>
              <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>CD</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:14, height:10, background:'rgba(231,76,60,0.25)', border:'1px solid rgba(231,76,60,0.4)', borderRadius:2 }} />
              <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>Exceedance region</span>
            </div>
          </div>
          <div style={{ height:268 }}>
            <Line data={ddcData} options={ddcOpts} />
          </div>
        </>
      ) : (
        <div style={{ height:300 }}>
          <Bar data={histData} options={histOpts} />
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize:10, color:'var(--color-text-muted)', marginTop:10 }}>
        {raw.length.toLocaleString()} blocks · {(raw.length * 0.25 / 24).toFixed(1)} days ·
        {horizon === 'FY' ? ' FY 2026-27' : ' Month'} · {unit.short} · CD = {unit.cd.toLocaleString()} kVA
        {display.length < sorted.length && ` · chart downsampled to ${MAX_DISPLAY.toLocaleString()} pts`}
      </div>
    </div>
  )
}
