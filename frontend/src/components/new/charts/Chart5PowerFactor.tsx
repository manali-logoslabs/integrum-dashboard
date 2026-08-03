/**
 * Chart5PowerFactor.tsx — Graph 5
 * Power Factor Tile + 12-Month Trend
 *
 * - Monthly avg PF (derived = kWh ÷ kVAh) and min-block PF per unit
 * - Toggle to overlay billed PF from DISCOM invoice (reconcile vs derived)
 * - Reference lines: 0.90 penalty threshold · 0.95 incentive threshold
 * - kVA inflation insight: kVA = kW ÷ PF — low PF is the primary CD exceedance driver
 */
import React, { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Tooltip, Legend, Filler,
  type TooltipItem,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

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

// BESCOM PF thresholds
const PF_PENALTY    = 0.90   // below → penalty charge
const PF_INCENTIVE  = 0.95   // above → incentive rebate

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ── Monthly data ──────────────────────────────────────────────────────────────
interface MonthData {
  label:    string   // "Apr '25"
  avgPF:    number   // derived (kWh ÷ kVAh), monthly average
  minPF:    number   // worst 15-min block PF in the month
  billedPF: number   // DISCOM invoice PF (may differ from derived)
}

function buildMonthLabels(): string[] {
  const today = new Date()
  // Latest complete month = previous calendar month
  const end = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const labels: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1)
    const mon = d.toLocaleDateString('en-IN', { month: 'short' })
    const yr  = String(d.getFullYear()).slice(-2)
    labels.push(`${mon} '${yr}`)
  }
  return labels
}
const MONTH_LABELS = buildMonthLabels()

function genMonthly(uid: number): MonthData[] {
  return MONTH_LABELS.map((label, i) => {
    const s     = uid * 1000 + i * 13
    // Derived avg PF: realistic 0.85–0.97 range
    const base  = 0.87 + rng(s) * 0.10
    const noise = (rng(s + 1) - 0.5) * 0.025
    const avgPF = Math.min(0.985, Math.max(0.83, +(base + noise).toFixed(3)))

    // Min-block PF: 8-18 points below avg (capacitors trip at night etc.)
    const minPF = Math.max(0.68, +(avgPF - 0.08 - rng(s + 3) * 0.10).toFixed(3))

    // Billed PF: DISCOM uses different metering window → ±0.01-0.02 variance
    const billedPF = Math.min(0.985, Math.max(0.80, +(avgPF + (rng(s + 5) - 0.5) * 0.025).toFixed(3)))

    return { label, avgPF, minPF, billedPF }
  })
}

// ── PF status ─────────────────────────────────────────────────────────────────
type PFStatus = 'incentive' | 'normal' | 'penalty'

function pfStatus(pf: number): PFStatus {
  if (pf >= PF_INCENTIVE) return 'incentive'
  if (pf >= PF_PENALTY)   return 'normal'
  return 'penalty'
}

const STATUS_COLOR: Record<PFStatus, string> = {
  incentive: '#1baf7a',
  normal:    '#eda100',
  penalty:   '#e74c3c',
}
const STATUS_LABEL: Record<PFStatus, string> = {
  incentive: 'Incentive zone (≥0.95)',
  normal:    'Normal (0.90–0.95)',
  penalty:   'Penalty zone (<0.90)',
}

// ── Shared styles ─────────────────────────────────────────────────────────────
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
export default function Chart5PowerFactor() {
  const [unitId,      setUnitId]      = useState(1)
  const [showBilled,  setShowBilled]  = useState(false)

  const unit   = UNITS.find(u => u.id === unitId)!
  const months = useMemo(() => genMonthly(unitId), [unitId])
  const latest = months[months.length - 1]!

  // KPI derived values
  const latestStatus   = pfStatus(latest.avgPF)
  const kvaInflation   = +((1 / latest.avgPF - 1) * 100).toFixed(1)   // % extra kVA vs unity PF
  const billedDiff     = +(latest.avgPF - latest.billedPF).toFixed(3)

  // Penalty months count
  const penaltyMonths  = months.filter(m => m.avgPF < PF_PENALTY).length

  // Chart datasets
  const chartData = {
    labels: months.map(m => m.label),
    datasets: [
      // 0.90 penalty reference
      {
        label: '0.90 penalty threshold',
        data: months.map(() => PF_PENALTY),
        borderColor: 'rgba(231,76,60,0.65)',
        borderWidth: 1, borderDash: [5, 4],
        pointRadius: 0, fill: false as const, tension: 0, order: 4,
      },
      // 0.95 incentive reference
      {
        label: '0.95 incentive threshold',
        data: months.map(() => PF_INCENTIVE),
        borderColor: 'rgba(237,161,0,0.65)',
        borderWidth: 1, borderDash: [5, 4],
        pointRadius: 0, fill: false as const, tension: 0, order: 3,
      },
      // Min-block PF
      {
        label: 'Min-block PF',
        data: months.map(m => m.minPF),
        borderColor: '#eb6834',
        borderWidth: 1.5,
        pointRadius: 3, pointBackgroundColor: '#eb6834',
        fill: false as const, tension: 0.3, order: 2,
      },
      // Billed PF (conditional)
      ...(showBilled ? [{
        label: 'Billed PF (DISCOM)',
        data: months.map(m => m.billedPF),
        borderColor: '#1baf7a',
        borderWidth: 1.5,
        pointRadius: 3, pointBackgroundColor: '#1baf7a',
        borderDash: [4, 2],
        fill: false as const, tension: 0.3, order: 1,
      }] : []),
      // Avg derived PF (on top)
      {
        label: 'Avg PF (derived)',
        data: months.map(m => m.avgPF),
        borderColor: '#2a78d6',
        borderWidth: 2,
        pointRadius: 4, pointBackgroundColor: months.map(m => STATUS_COLOR[pfStatus(m.avgPF)]),
        pointBorderColor: '#2a78d6', pointBorderWidth: 1,
        fill: false as const, tension: 0.3, order: 0,
      },
    ],
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false, animation: false as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index' as const, intersect: false,
        backgroundColor: 'rgba(15,22,38,0.95)',
        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
        titleColor: 'rgba(255,255,255,0.9)', bodyColor: 'rgba(255,255,255,0.7)',
        padding: 10,
        filter: (item: TooltipItem<'line'>) => item.datasetIndex >= 2,  // hide reference line rows
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => items[0]?.label ?? '',
          label: (item: TooltipItem<'line'>) => {
            const pf = item.parsed.y ?? 0
            const status = pfStatus(pf)
            if (item.dataset.label === 'Min-block PF')
              return `  Min-block PF: ${pf.toFixed(3)}  (worst 15-min slot)`
            if (item.dataset.label === 'Billed PF (DISCOM)')
              return `  Billed PF: ${pf.toFixed(3)}`
            const infl = ((1 / pf - 1) * 100).toFixed(1)
            return [
              `  Avg PF: ${pf.toFixed(3)}`,
              `  Status: ${STATUS_LABEL[status]}`,
              `  kVA inflation: +${infl}% vs unity PF`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: AXIS_C, font: { size: 10 }, maxRotation: 30 },
        grid: { color: GRID_C },
      },
      y: {
        min: 0.65, max: 1.01,
        ticks: {
          color: AXIS_C, font: { size: 10 },
          callback: (v: number | string) => (typeof v === 'number' ? v.toFixed(2) : v),
        },
        grid: { color: GRID_C },
        title: { display: true, text: 'Power Factor (0–1)', color: AXIS_C, font: { size: 10 } },
      },
    },
  }

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
            Power Factor — Monthly Tile + 12-Month Trend
          </div>
          <div style={{ fontSize:11, color:'var(--color-text-muted)', marginTop:3 }}>
            PF = kWh ÷ kVAh per block · low PF inflates kVA = kW ÷ PF (direct CD exceedance driver)
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select value={unitId} onChange={e => setUnitId(+e.target.value)} style={{ ...SEL, minWidth:140 }}>
            {UNITS.map(u => <option key={u.id} value={u.id}>{u.short}</option>)}
          </select>
          {/* Derived vs Billed toggle */}
          <button
            onClick={() => setShowBilled(b => !b)}
            style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'4px 12px', borderRadius:5, fontSize:11, cursor:'pointer',
              background: showBilled ? 'rgba(27,175,122,0.15)' : 'transparent',
              border: `1px solid ${showBilled ? '#1baf7a' : 'var(--color-border)'}`,
              color: showBilled ? '#1baf7a' : 'var(--color-text-muted)',
            }}
          >
            <span style={{
              display:'inline-block', width:10, height:10, borderRadius:'50%',
              background: showBilled ? '#1baf7a' : 'var(--color-border)',
              marginRight:2,
            }} />
            {showBilled ? 'Derived + Billed' : 'Derived only'}
          </button>
        </div>
      </div>

      {/* ── KPI tiles (current month) ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:20 }}>

        {/* Avg PF */}
        <div style={{
          padding:'12px 14px', borderRadius:8,
          background:`${STATUS_COLOR[latestStatus]}18`,
          border:`1px solid ${STATUS_COLOR[latestStatus]}40`,
        }}>
          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Avg PF · {latest.label}
          </div>
          <div style={{ fontSize:26, fontWeight:800, color:STATUS_COLOR[latestStatus], lineHeight:1, marginBottom:6 }}>
            {latest.avgPF.toFixed(3)}
          </div>
          <div style={{
            display:'inline-block', fontSize:9, fontWeight:700,
            color:STATUS_COLOR[latestStatus],
            background:`${STATUS_COLOR[latestStatus]}20`,
            border:`1px solid ${STATUS_COLOR[latestStatus]}40`,
            borderRadius:3, padding:'2px 6px',
          }}>
            {latestStatus === 'incentive' ? '✓ Incentive' : latestStatus === 'penalty' ? '⚠ Penalty' : 'Normal'}
          </div>
        </div>

        {/* Min-block PF */}
        <div style={{ padding:'12px 14px', borderRadius:8, background:'rgba(235,104,52,0.08)', border:'1px solid rgba(235,104,52,0.25)' }}>
          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Min-block PF
          </div>
          <div style={{ fontSize:26, fontWeight:800, color:'#eb6834', lineHeight:1, marginBottom:6 }}>
            {latest.minPF.toFixed(3)}
          </div>
          <div style={{ fontSize:10, color:'var(--color-text-muted)' }}>
            worst 15-min slot
          </div>
        </div>

        {/* kVA inflation */}
        <div style={{ padding:'12px 14px', borderRadius:8, background:'rgba(42,120,214,0.08)', border:'1px solid rgba(42,120,214,0.25)' }}>
          <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>
            kVA inflation
          </div>
          <div style={{ fontSize:26, fontWeight:800, color:'#74b0f5', lineHeight:1, marginBottom:6 }}>
            +{kvaInflation}%
          </div>
          <div style={{ fontSize:10, color:'var(--color-text-muted)' }}>
            vs unity PF · CD = {unit.cd.toLocaleString()} kVA
          </div>
        </div>

        {/* Billed PF reconciliation (shown when toggle on, else penalty count) */}
        {showBilled ? (
          <div style={{
            padding:'12px 14px', borderRadius:8,
            background: Math.abs(billedDiff) > 0.01 ? 'rgba(231,76,60,0.08)' : 'rgba(27,175,122,0.08)',
            border: `1px solid ${Math.abs(billedDiff) > 0.01 ? 'rgba(231,76,60,0.30)' : 'rgba(27,175,122,0.25)'}`,
          }}>
            <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Derived vs Billed
            </div>
            <div style={{ fontSize:26, fontWeight:800, color: Math.abs(billedDiff) > 0.01 ? '#e74c3c' : '#1baf7a', lineHeight:1, marginBottom:6 }}>
              {billedDiff >= 0 ? '+' : ''}{billedDiff.toFixed(3)}
            </div>
            <div style={{ fontSize:10, color:'var(--color-text-muted)' }}>
              Billed: {latest.billedPF.toFixed(3)} · {Math.abs(billedDiff) > 0.01 ? 'gap needs reconciliation' : 'meters aligned'}
            </div>
          </div>
        ) : (
          <div style={{
            padding:'12px 14px', borderRadius:8,
            background: penaltyMonths > 0 ? 'rgba(231,76,60,0.08)' : 'rgba(27,175,122,0.08)',
            border: `1px solid ${penaltyMonths > 0 ? 'rgba(231,76,60,0.25)' : 'rgba(27,175,122,0.25)'}`,
          }}>
            <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Penalty months (FY)
            </div>
            <div style={{ fontSize:26, fontWeight:800, color: penaltyMonths > 0 ? '#e74c3c' : '#1baf7a', lineHeight:1, marginBottom:6 }}>
              {penaltyMonths} / 12
            </div>
            <div style={{ fontSize:10, color:'var(--color-text-muted)' }}>
              months with avg PF {'<'} 0.90
            </div>
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div style={{ display:'flex', gap:16, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
        {[
          { color:'#2a78d6', dash:false, label:'Avg PF (derived)' },
          { color:'#eb6834', dash:false, label:'Min-block PF' },
          ...(showBilled ? [{ color:'#1baf7a', dash:true, label:'Billed PF (DISCOM)' }] : []),
          { color:'rgba(231,76,60,0.70)', dash:true, label:'0.90 penalty' },
          { color:'rgba(237,161,0,0.70)',  dash:true, label:'0.95 incentive' },
        ].map(({ color, dash, label }) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
            {dash
              ? <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke={color} strokeWidth="2" strokeDasharray="5,3"/></svg>
              : <div style={{ width:24, height:2, background:color }} />
            }
            <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>{label}</span>
          </div>
        ))}
        <div style={{ display:'flex', gap:8, marginLeft:'auto' }}>
          {(['incentive','normal','penalty'] as PFStatus[]).map(s => (
            <div key={s} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:STATUS_COLOR[s] }} />
              <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>
                {s === 'incentive' ? '≥0.95' : s === 'normal' ? '0.90-0.95' : '<0.90'}
              </span>
            </div>
          ))}
          <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>(dot colour = month status)</span>
        </div>
      </div>

      {/* ── 12-month trend chart ── */}
      <div style={{ height:280 }}>
        <Line data={chartData} options={chartOpts} />
      </div>

      {/* ── Formula note ── */}
      <div style={{
        marginTop:12, padding:'8px 12px', borderRadius:6,
        background:'rgba(42,120,214,0.06)', border:'1px solid rgba(42,120,214,0.15)',
        fontSize:11, color:'var(--color-text-muted)', lineHeight:1.7,
      }}>
        <strong style={{ color:'var(--color-text-secondary)' }}>Why PF matters for CD:</strong>
        {' '}kVA = kW ÷ PF, so at PF = {latest.avgPF.toFixed(2)} a {unit.cd.toLocaleString()} kVA contract
        carries only{' '}
        <strong style={{ color:'#74b0f5' }}>
          {Math.round(unit.cd * latest.avgPF).toLocaleString()} kW
        </strong>
        {' '}of real load — {kvaInflation}% of capacity consumed by reactive current.
        Improving PF to 0.95 would recover{' '}
        <strong style={{ color:'#1baf7a' }}>
          {Math.abs(Math.round(unit.cd * (latest.avgPF - PF_INCENTIVE))).toLocaleString()} kVA
        </strong>
        {' '}of apparent headroom.
      </div>
    </div>
  )
}
