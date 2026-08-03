/**
 * Chart7CUFTiles.tsx — Graph 7
 * CUF / PLF Tiles
 *
 * Tile 1: previous-month CUF.  Tile 2: FY-till-date CUF.
 * Per unit and portfolio.
 * Formula: net generation ÷ (installed capacity × hours in period)
 * Label reads "CUF" for RE assets; switches to "PLF" if conventional assets are onboarded.
 * Y = % (one decimal)
 */
import React, { useMemo } from 'react'

// ── Units + installed capacity ────────────────────────────────────────────────
const UNITS = [
  { id:  1, name: 'Old Airport Rd',  capacity: 1.20 },  // MWp
  { id:  2, name: 'Electronic City', capacity: 0.85 },
  { id:  3, name: 'Whitefield',      capacity: 1.50 },
  { id:  4, name: 'Sahakar Nagar',   capacity: 0.45 },
  { id:  5, name: 'Malleswaram',     capacity: 0.60 },
  { id:  6, name: 'Thanisandra',     capacity: 0.50 },
  { id:  7, name: 'HRBR Unit',       capacity: 0.35 },
  { id:  8, name: 'Bellandur',       capacity: 1.10 },
  { id:  9, name: 'Sarjapura',       capacity: 0.30 },
  { id: 10, name: 'Kanakapura',      capacity: 0.25 },
  { id: 11, name: 'Bellandur Corp',  capacity: 0.20 },
]
const TOTAL_CAPACITY = UNITS.reduce((s, u) => s + u.capacity, 0)

// ── Seasonal base CUF for Bangalore solar (FY 2026-27) ───────────────────────
// month numbers: 4=Apr, 5=May, 6=Jun, 7=Jul (partial — days elapsed dynamically)
const BASE_CUF: Record<number, number> = { 4: 0.215, 5: 0.220, 6: 0.165, 7: 0.152 }

// Compute hours dynamically — current partial month uses days elapsed, else days in month
function monthHours(monthNum: number): number {
  const today = new Date()
  const curM = today.getMonth() + 1   // 1-based
  const curY = today.getFullYear()
  // We're in FY 2026-27 (year = 2026 for Apr-Dec, 2027 for Jan-Mar)
  const fyYear = monthNum >= 4 ? 2026 : 2027
  if (fyYear === curY && monthNum === curM) {
    return today.getDate() * 24                        // days elapsed this month
  }
  return new Date(fyYear, monthNum, 0).getDate() * 24  // days in full month
}

const MONTH_HOURS: Record<number, number> = {
  4: monthHours(4), 5: monthHours(5), 6: monthHours(6), 7: monthHours(7),
}

const PREV_MONTH   = { num: 6,  label: "Jun '26",  hours: MONTH_HOURS[6] }
const PREV2_MONTH  = { num: 5,  label: "May '26",  hours: MONTH_HOURS[5] }
const FY_MONTHS    = [4, 5, 6, 7]                          // Apr-Jul '26
const FY_TOT_HOURS = FY_MONTHS.reduce((s, m) => s + MONTH_HOURS[m], 0)

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function unitCUF(uid: number, month: number): number {
  const base  = BASE_CUF[month] ?? 0.18
  const noise = (rng(uid * 100 + month) - 0.5) * 0.12   // ±6 pp variation
  return Math.max(0.10, Math.min(0.28, base + noise))
}

// ── Data generation ───────────────────────────────────────────────────────────
interface UnitRow {
  id:            number
  name:          string
  capacity:      number
  prevCUF:       number  // Jun '26 CUF (%)
  prev2CUF:      number  // May '26 CUF (%) — for trend arrow
  fyCUF:         number  // FY '26-27 to date (%)
  assetType:     'RE' | 'Conventional'
}

function buildData(): UnitRow[] {
  return UNITS.map(u => {
    const cuf = (m: number) => unitCUF(u.id, m)
    const prevCUFVal = cuf(PREV_MONTH.num)
    const prev2CUFVal = cuf(PREV2_MONTH.num)

    // FY energy-weighted CUF
    const fyGenTotal   = FY_MONTHS.reduce((s, m) => s + u.capacity * MONTH_HOURS[m] * cuf(m), 0)
    const fyCapHrs     = u.capacity * FY_TOT_HOURS
    const fyVal        = fyGenTotal / fyCapHrs

    return {
      id:        u.id,
      name:      u.name,
      capacity:  u.capacity,
      prevCUF:   +(prevCUFVal  * 100).toFixed(1),
      prev2CUF:  +(prev2CUFVal * 100).toFixed(1),
      fyCUF:     +(fyVal       * 100).toFixed(1),
      assetType: 'RE',
    }
  })
}

// ── CUF colour helpers ────────────────────────────────────────────────────────
function cufColor(v: number)  { return v >= 20 ? '#1baf7a' : v >= 16 ? '#eda100' : '#e74c3c' }
function cufBg(v: number)     { return v >= 20 ? 'rgba(27,175,122,0.10)' : v >= 16 ? 'rgba(237,161,0,0.08)' : 'rgba(231,76,60,0.10)' }
function cufBorder(v: number) { return v >= 20 ? 'rgba(27,175,122,0.30)' : v >= 16 ? 'rgba(237,161,0,0.22)' : 'rgba(231,76,60,0.28)' }

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart7CUFTiles() {
  const rows = useMemo(buildData, [])

  // Portfolio aggregates (capacity-weighted)
  const portPrev = +(rows.reduce((s, r) => s + r.capacity * r.prevCUF, 0) / TOTAL_CAPACITY).toFixed(1)
  const portPrev2= +(rows.reduce((s, r) => s + r.capacity * r.prev2CUF, 0) / TOTAL_CAPACITY).toFixed(1)
  const portFY   = +(rows.reduce((s, r) => s + r.capacity * r.fyCUF,   0) / TOTAL_CAPACITY).toFixed(1)

  const metricLabel = (type: 'RE' | 'Conventional') => type === 'RE' ? 'CUF' : 'PLF'

  return (
    <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:12, padding:20 }}>

      {/* Header */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
          CUF / PLF Tiles
        </div>
        <div style={{ fontSize:11, color:'var(--color-text-muted)', marginTop:3 }}>
          Net generation ÷ (installed capacity × hours) · RE assets labelled CUF · % (1 decimal)
        </div>
      </div>

      {/* Colour key */}
      <div style={{ display:'flex', gap:16, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
        {[['≥ 20 %', '#1baf7a', 'rgba(27,175,122,0.10)'], ['16–20 %', '#eda100', 'rgba(237,161,0,0.08)'], ['< 16 %', '#e74c3c', 'rgba(231,76,60,0.10)']].map(([lbl, col, bg]) => (
          <div key={lbl} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:2, background:col, opacity:.85 }} />
            <span style={{ fontSize:10, color:'var(--color-text-muted)' }}>{lbl}</span>
          </div>
        ))}
        <span style={{ fontSize:10, color:'var(--color-text-muted)', marginLeft:'auto' }}>
          ↑↓ = vs {PREV2_MONTH.label} · FY = Apr–Jul '26 (partial)
        </span>
      </div>

      {/* ── Portfolio banner ── */}
      <div style={{
        display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
        gap:12, marginBottom:16, padding:'14px 18px',
        background: cufBg(portPrev),
        border:`1px solid ${cufBorder(portPrev)}`,
        borderRadius:10,
      }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--color-text-secondary)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>
            Portfolio · {TOTAL_CAPACITY.toFixed(2)} MWp
          </div>
          <div style={{ fontSize:10, color:'var(--color-text-muted)' }}>
            11 RE units · OA + BTM solar
          </div>
        </div>
        <MetricBox
          label={`Prev month — ${PREV_MONTH.label}`}
          cuf={portPrev}
          trend={portPrev - portPrev2}
          assetType="RE"
        />
        <MetricBox
          label="FY '26-27 to date"
          cuf={portFY}
          assetType="RE"
          sub={`${FY_TOT_HOURS.toLocaleString()} h · ${(FY_TOT_HOURS / 24).toFixed(0)} days`}
        />
      </div>

      {/* ── Unit tiles grid ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:10 }}>
        {rows.map(row => (
          <UnitTile key={row.id} row={row} metricLabel={metricLabel(row.assetType)} />
        ))}
      </div>

      {/* Footer formula */}
      <div style={{
        marginTop:14, padding:'8px 12px', borderRadius:6,
        background:'rgba(42,120,214,0.05)', border:'1px solid rgba(42,120,214,0.15)',
        fontSize:11, color:'var(--color-text-muted)',
      }}>
        <strong style={{ color:'var(--color-text-secondary)' }}>Formula:</strong>
        {' '}CUF (%) = Net Generation (MWh) ÷ [Installed Capacity (MW) × Period Hours] × 100
        {' '}· Threshold: ≥ 20 % = good · 16–19.9 % = acceptable · &lt; 16 % = review
      </div>
    </div>
  )
}

// ── MetricBox sub-component ───────────────────────────────────────────────────
function MetricBox({ label, cuf, trend, assetType, sub }: {
  label:     string
  cuf:       number
  trend?:    number
  assetType: string
  sub?:      string
}) {
  const col = cufColor(cuf)
  const trendIcon = trend === undefined ? null
    : trend > 0.5 ? '↑' : trend < -0.5 ? '↓' : '→'
  const trendCol  = trend === undefined ? ''
    : trend > 0.5 ? '#1baf7a' : trend < -0.5 ? '#e74c3c' : 'var(--color-text-muted)'

  return (
    <div>
      <div style={{ fontSize:10, color:'var(--color-text-muted)', marginBottom:6 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
        <span style={{ fontSize:26, fontWeight:800, color:col, lineHeight:1 }}>
          {cuf.toFixed(1)}%
        </span>
        <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>
          {assetType === 'RE' ? 'CUF' : 'PLF'}
        </span>
        {trendIcon && (
          <span style={{ fontSize:13, color:trendCol, fontWeight:700 }}>
            {trendIcon} {Math.abs(trend!).toFixed(1)} pp
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize:9, color:'var(--color-text-muted)', marginTop:3 }}>{sub}</div>}
    </div>
  )
}

// ── UnitTile sub-component ────────────────────────────────────────────────────
function UnitTile({ row, metricLabel }: { row: UnitRow; metricLabel: string }) {
  return (
    <div style={{
      padding:'12px 14px', borderRadius:9,
      background: cufBg(row.prevCUF),
      border: `1px solid ${cufBorder(row.prevCUF)}`,
    }}>
      {/* Tile header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--color-text-primary)', lineHeight:1.3 }}>
            {row.name}
          </div>
          <div style={{ fontSize:9, color:'var(--color-text-muted)', marginTop:3 }}>
            {row.capacity.toFixed(2)} MWp · Solar · {metricLabel}
          </div>
        </div>
        {/* Status dot */}
        <div style={{
          width:8, height:8, borderRadius:'50%', marginTop:2, flexShrink:0,
          background: cufColor(row.prevCUF),
        }} />
      </div>

      {/* Two metrics side by side */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>

        {/* Prev month */}
        <div style={{ padding:'8px 10px', borderRadius:6, background:'rgba(0,0,0,0.15)' }}>
          <div style={{ fontSize:9, color:'var(--color-text-muted)', marginBottom:5 }}>
            {PREV_MONTH.label}
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:cufColor(row.prevCUF), lineHeight:1 }}>
            {row.prevCUF.toFixed(1)}%
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:3, marginTop:4 }}>
            {(() => {
              const diff = row.prevCUF - row.prev2CUF
              const icon = diff > 0.5 ? '↑' : diff < -0.5 ? '↓' : '→'
              const col  = diff > 0.5 ? '#1baf7a' : diff < -0.5 ? '#e74c3c' : 'var(--color-text-muted)'
              return (
                <span style={{ fontSize:10, color:col, fontWeight:600 }}>
                  {icon} {Math.abs(diff).toFixed(1)} pp vs {PREV2_MONTH.label}
                </span>
              )
            })()}
          </div>
        </div>

        {/* FY to date */}
        <div style={{ padding:'8px 10px', borderRadius:6, background:'rgba(0,0,0,0.15)' }}>
          <div style={{ fontSize:9, color:'var(--color-text-muted)', marginBottom:5 }}>
            FY '26-27 to date
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:cufColor(row.fyCUF), lineHeight:1 }}>
            {row.fyCUF.toFixed(1)}%
          </div>
          <div style={{ marginTop:4 }}>
            <span style={{ fontSize:9, color:'var(--color-text-muted)' }}>
              Apr–Jul · {FY_TOT_HOURS.toLocaleString()} h
            </span>
          </div>
        </div>
      </div>

      {/* Mini generation estimate */}
      {(() => {
        const genPrev = +(row.capacity * PREV_MONTH.hours * row.prevCUF / 100).toFixed(1)
        const genFY   = +(row.capacity * FY_TOT_HOURS    * row.fyCUF   / 100).toFixed(0)
        return (
          <div style={{ marginTop:8, fontSize:9, color:'var(--color-text-muted)', display:'flex', justifyContent:'space-between' }}>
            <span>Gen {PREV_MONTH.label}: <strong style={{ color:'var(--color-text-secondary)' }}>{genPrev} MWh</strong></span>
            <span>FY gen: <strong style={{ color:'var(--color-text-secondary)' }}>{genFY} MWh</strong></span>
          </div>
        )
      })()}
    </div>
  )
}
