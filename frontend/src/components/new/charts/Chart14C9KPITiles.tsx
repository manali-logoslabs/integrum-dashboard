/**
 * Chart14C9KPITiles.tsx — Graph 14
 * C9 KPI Tile Parity
 *
 * 9 KPI tiles in 3×3 grid (month picker)
 * Metrics:
 *  1. Total Consumption (MWh)
 *  2. OA Settled (MWh)
 *  3. BTM Generation (MWh)
 *  4. Grid Drawl (MWh)
 *  5. Portfolio CUF (%)
 *  6. Avg Power Factor
 *  7. Banking Balance (MWh)
 *  8. Net Settled (MWh)
 *  9. CD Utilization (%)
 */
import React, { useState, useMemo } from 'react'

// ── RNG ───────────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function prevMonthStr(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  const dt = new Date(y, (mo ?? 1) - 1, 1)
  return dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

// ── Mock KPI generation ───────────────────────────────────────────────────────
interface KpiSet {
  totalConsumption:  { val: number; mom: number; unit: string }
  oaSettled:         { val: number; mom: number; unit: string }
  btmGeneration:     { val: number; mom: number; unit: string }
  gridDrawl:         { val: number; mom: number; unit: string }
  portfolioCUF:      { val: number; mom: number; unit: string }
  avgPowerFactor:    { val: number; mom: number; unit: string }
  bankingBalance:    { val: number; mom: number; unit: string }
  netSettled:        { val: number; mom: number; unit: string }
  cdUtilization:     { val: number; mom: number; unit: string }
}

function buildKpis(month: string): KpiSet {
  const [y, m] = month.split('-').map(Number)
  const seed = (y ?? 2026) * 100 + (m ?? 6)

  const totalCons   = 830 + rng(seed + 1) * 90
  const oaSett      = totalCons * (0.44 + rng(seed + 2) * 0.06)
  const btmGen      = totalCons * (0.11 + rng(seed + 3) * 0.04)
  const gridD       = Math.max(0, totalCons - oaSett - btmGen)
  const cuf         = 22 + rng(seed + 4) * 10    // %
  const pf          = 0.92 + rng(seed + 5) * 0.06
  const bankBal     = 85  + rng(seed + 6) * 40
  const netSett     = oaSett + btmGen
  const cd          = 820  // kVA contract demand fixed
  const peakDemand  = cd * (0.68 + rng(seed + 7) * 0.22)
  const cdUtil      = (peakDemand / cd) * 100

  // MoM jitter (percentage change)
  const momSeed = seed + 50
  const j = (s: number) => (rng(momSeed + s) * 14 - 7)

  return {
    totalConsumption: { val: +totalCons.toFixed(1),  mom: +j(1).toFixed(1), unit: 'MWh' },
    oaSettled:        { val: +oaSett.toFixed(1),     mom: +j(2).toFixed(1), unit: 'MWh' },
    btmGeneration:    { val: +btmGen.toFixed(1),     mom: +j(3).toFixed(1), unit: 'MWh' },
    gridDrawl:        { val: +gridD.toFixed(1),      mom: +j(4).toFixed(1), unit: 'MWh' },
    portfolioCUF:     { val: +cuf.toFixed(1),        mom: +j(5).toFixed(1), unit: '%' },
    avgPowerFactor:   { val: +pf.toFixed(3),         mom: +(rng(momSeed + 6) * 0.02 - 0.01).toFixed(3), unit: '' },
    bankingBalance:   { val: +bankBal.toFixed(1),    mom: +j(7).toFixed(1), unit: 'MWh' },
    netSettled:       { val: +netSett.toFixed(1),    mom: +j(8).toFixed(1), unit: 'MWh' },
    cdUtilization:    { val: +cdUtil.toFixed(1),     mom: +j(9).toFixed(1), unit: '%' },
  }
}

// ── Threshold rules ───────────────────────────────────────────────────────────
function tileStatus(key: keyof KpiSet, val: number): 'good' | 'warn' | 'bad' | 'neutral' {
  switch (key) {
    case 'portfolioCUF':
      return val >= 25 ? 'good' : val >= 18 ? 'warn' : 'bad'
    case 'avgPowerFactor':
      return val >= 0.96 ? 'good' : val >= 0.90 ? 'warn' : 'bad'
    case 'cdUtilization':
      return val <= 80 ? 'good' : val <= 95 ? 'warn' : 'bad'
    case 'gridDrawl':
      return val <= 150 ? 'good' : val <= 250 ? 'warn' : 'bad'
    case 'bankingBalance':
      return val >= 100 ? 'good' : val >= 50 ? 'warn' : 'bad'
    default:
      return 'neutral'
  }
}

const STATUS_COLOR = {
  good:    { bg: 'rgba(27,175,122,0.10)',  border: 'rgba(27,175,122,0.35)',  text: '#1baf7a' },
  warn:    { bg: 'rgba(237,161,0,0.10)',   border: 'rgba(237,161,0,0.35)',   text: '#eda100' },
  bad:     { bg: 'rgba(231,76,60,0.10)',   border: 'rgba(231,76,60,0.35)',   text: '#e74c3c' },
  neutral: { bg: 'rgba(255,255,255,0.04)', border: 'var(--color-border)',    text: 'var(--color-text-primary)' },
}

// ── Tile metadata ─────────────────────────────────────────────────────────────
interface TileDef {
  key:       keyof KpiSet
  label:     string
  icon:      string
  higherBetter: boolean
  decimals:  number
}

const TILES: TileDef[] = [
  { key: 'totalConsumption', label: 'Total Consumption', icon: '⚡', higherBetter: false, decimals: 1 },
  { key: 'oaSettled',        label: 'OA Settled',        icon: '🔗', higherBetter: true,  decimals: 1 },
  { key: 'btmGeneration',    label: 'BTM Generation',    icon: '☀️', higherBetter: true,  decimals: 1 },
  { key: 'gridDrawl',        label: 'Grid Drawl',        icon: '🏭', higherBetter: false, decimals: 1 },
  { key: 'portfolioCUF',     label: 'Portfolio CUF',     icon: '🔆', higherBetter: true,  decimals: 1 },
  { key: 'avgPowerFactor',   label: 'Avg Power Factor',  icon: '🔋', higherBetter: true,  decimals: 3 },
  { key: 'bankingBalance',   label: 'Banking Balance',   icon: '🏦', higherBetter: true,  decimals: 1 },
  { key: 'netSettled',       label: 'Net Settled',       icon: '✅', higherBetter: true,  decimals: 1 },
  { key: 'cdUtilization',    label: 'CD Utilization',    icon: '📊', higherBetter: false, decimals: 1 },
]

// ── Shared styles ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 12, padding: 20,
}
const SEL: React.CSSProperties = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 6, padding: '4px 8px',
  color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
}

// ── Tile component ────────────────────────────────────────────────────────────
function KpiTile({
  tile, val, mom, unit, prevMonth,
}: {
  tile: TileDef; val: number; mom: number; unit: string; prevMonth: string
}) {
  const status = tileStatus(tile.key, val)
  const colors = STATUS_COLOR[status]

  const momPositive   = mom >= 0
  const momGood = tile.higherBetter ? momPositive : !momPositive
  const momColor = Math.abs(mom) < 0.05
    ? 'var(--color-text-muted)'
    : momGood ? '#1baf7a' : '#e74c3c'

  const momDisplay = unit === ''
    ? `${mom >= 0 ? '+' : ''}${mom}`
    : `${mom >= 0 ? '+' : ''}${mom}${unit}`

  const valStr = tile.key === 'avgPowerFactor'
    ? val.toFixed(tile.decimals)
    : unit === '%' ? `${val.toFixed(tile.decimals)}%` : val.toFixed(tile.decimals)

  return (
    <div style={{
      padding: 16, borderRadius: 10,
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Status bar top */}
      {status !== 'neutral' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: colors.text, borderRadius: '10px 10px 0 0',
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>{tile.icon}</span>
        {status !== 'neutral' && (
          <span style={{
            fontSize: 8, fontWeight: 700, color: colors.text,
            background: `${colors.text}18`,
            border: `1px solid ${colors.text}44`,
            borderRadius: 3, padding: '1px 5px', letterSpacing: 0.5,
          }}>
            {status.toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {tile.label}
      </div>

      <div style={{ fontSize: 22, fontWeight: 800, color: colors.text, lineHeight: 1, marginBottom: 6 }}>
        {valStr}
        {unit && unit !== '%' && (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', marginLeft: 4 }}>
            {unit}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10, color: momColor, fontWeight: 600 }}>
          {mom >= 0 ? '▲' : '▼'} {momDisplay}
        </span>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
          vs {formatMonthLabel(prevMonth)}
        </span>
      </div>
    </div>
  )
}

// ── Threshold legend ──────────────────────────────────────────────────────────
function ThresholdLegend() {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
      {[
        { status: 'good', label: 'On target' },
        { status: 'warn', label: 'Watch' },
        { status: 'bad',  label: 'Action needed' },
      ].map(l => (
        <div key={l.status} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 10, height: 10, borderRadius: 2,
            background: STATUS_COLOR[l.status as keyof typeof STATUS_COLOR].text,
          }} />
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{l.label}</span>
        </div>
      ))}
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 'auto', fontStyle: 'italic' }}>
        Colour = threshold status · ▲▼ = MoM change
      </span>
    </div>
  )
}

// ── Mini sparkline-like bar showing OA share ──────────────────────────────────
function ShareBar({ oaSettled, btmGen, gridDrawl }: { oaSettled: number; btmGen: number; gridDrawl: number }) {
  const total = oaSettled + btmGen + gridDrawl || 1
  const segs = [
    { label: 'OA', pct: oaSettled / total * 100, color: '#2a78d6' },
    { label: 'BTM', pct: btmGen / total * 100,   color: '#1baf7a' },
    { label: 'Grid', pct: gridDrawl / total * 100, color: '#eb6834' },
  ]
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 6 }}>
        Source mix (% of demand)
      </div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
        {segs.map((s, i) => (
          <div key={i} style={{
            flex: `0 0 ${s.pct}%`,
            background: s.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {s.pct > 12 && (
              <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>{s.pct.toFixed(0)}%</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
        {segs.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{s.label} {s.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart14C9KPITiles() {
  const [month, setMonth] = useState(prevMonthStr)

  // Build kpis for selected + previous month
  const kpis = useMemo(() => buildKpis(month), [month])

  // Previous month string for label
  const prevMonth = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date((y ?? 2026), (m ?? 6) - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [month])

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            C9 Key Performance Indicators
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            Portfolio-level KPI tiles · {formatMonthLabel(month)} · MoM delta & threshold status
          </div>
        </div>
        <input
          type="month" value={month} min="2025-04" max={currentMonth()}
          onChange={e => setMonth(e.target.value)} style={SEL}
        />
      </div>

      {/* ── Source mix bar ── */}
      <div style={{
        marginBottom: 20, padding: '12px 14px', borderRadius: 8,
        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)',
      }}>
        <ShareBar
          oaSettled={kpis.oaSettled.val}
          btmGen={kpis.btmGeneration.val}
          gridDrawl={kpis.gridDrawl.val}
        />
      </div>

      {/* ── 3×3 KPI grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        marginBottom: 16,
      }}>
        {TILES.map(tile => {
          const kpi = kpis[tile.key]
          return (
            <KpiTile
              key={tile.key}
              tile={tile}
              val={kpi.val}
              mom={kpi.mom}
              unit={kpi.unit}
              prevMonth={prevMonth}
            />
          )
        })}
      </div>

      {/* ── Threshold legend ── */}
      <ThresholdLegend />
    </div>
  )
}
