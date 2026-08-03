/**
 * Chart13OptimumSettlement.tsx — Graph 13
 * Optimum Settlement Scenario (indicative)
 *
 * Objective selector: Min cost / Max banking / Min lapse
 * Horizontal allocation bar + cost breakdown table
 * Savings vs sub-optimal scenario
 *
 * Costs (₹/MWh): BTM 2800, OA Solar 4500, OA Wind 5200, Banking 4900, Grid 8750
 */
import React, { useState, useMemo } from 'react'

// ── RNG ───────────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ── Constants ─────────────────────────────────────────────────────────────────
const COST = {
  btm:         2800,   // ₹/MWh
  oaSolar:     4500,
  oaWind:      5200,
  banking:     4900,   // incl. CIK
  grid:        8750,
  lapseOpCost: 8750,   // opportunity cost per MWh lapsed
}

type ObjectiveId = 'min-cost' | 'max-banking' | 'min-lapse'

const OBJECTIVES: { id: ObjectiveId; label: string; icon: string; desc: string; color: string }[] = [
  {
    id: 'min-cost', label: 'Min Landed Cost', icon: '₹',
    desc: 'Maximises use of cheapest sources first: BTM → OA Solar → OA Wind → Banking → Grid',
    color: '#1baf7a',
  },
  {
    id: 'max-banking', label: 'Max Banking Drawl', icon: '🏦',
    desc: 'Prioritises drawdown of accumulated banking balance before it lapses at FY end',
    color: '#2a78d6',
  },
  {
    id: 'min-lapse', label: 'Min Lapse', icon: '↩',
    desc: 'Routes excess generation into banking; reduces grid drawl to maximum permissible',
    color: '#9b59b6',
  },
]

type UnitId = 'U-KA-01' | 'U-KA-02' | 'U-MH-01'

const UNITS: { id: UnitId; label: string; state: string }[] = [
  { id: 'U-KA-01', label: 'Pavagada Solar (KA)', state: 'Karnataka' },
  { id: 'U-KA-02', label: 'Bellary Wind (KA)',   state: 'Karnataka' },
  { id: 'U-MH-01', label: 'Nanded Wind (MH)',    state: 'Maharashtra' },
]

interface AllocationResult {
  demand:      number   // MWh total demand
  btm:         number
  oaSolar:     number
  oaWind:      number
  banking:     number
  grid:        number
  lapsed:      number
  bankBalance: number   // remaining after drawl (MWh)
  totalCostLakh: number
}

// ── Data generation ───────────────────────────────────────────────────────────
function prevMonthStr(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function buildAllocation(unit: UnitId, month: string, obj: ObjectiveId): AllocationResult {
  const [y, m] = month.split('-').map(Number)
  const seed = unit.charCodeAt(2) * 37 + (y ?? 2026) * 100 + (m ?? 6)

  // Availability pools (MWh)
  const btmAvail    = 15  + rng(seed + 1) * 10   // rooftop
  const solarAvail  = unit === 'U-KA-01' ? 140 + rng(seed + 2) * 20 : 0
  const windAvail   = unit === 'U-KA-02' ? 95  + rng(seed + 3) * 18
    : unit === 'U-MH-01' ? 70 + rng(seed + 4) * 12 : 0
  const bankBalance = 55  + rng(seed + 5) * 30   // balance in account
  const demand      = 230 + rng(seed + 6) * 40

  let btm = 0, oaSolar = 0, oaWind = 0, banking = 0, grid = 0, lapsed = 0

  if (obj === 'min-cost') {
    // Cheapest first: BTM → OA Solar → OA Wind → Banking → Grid
    let rem = demand
    btm     = Math.min(btmAvail, rem);   rem -= btm
    oaSolar = Math.min(solarAvail, rem); rem -= oaSolar
    oaWind  = Math.min(windAvail, rem);  rem -= oaWind
    banking = Math.min(bankBalance, rem); rem -= banking
    grid    = Math.max(0, rem)
    // Excess generation → lapsed if banking capped
    lapsed = Math.max(0, (solarAvail - oaSolar) + (windAvail - oaWind) - banking * 0.05)
  } else if (obj === 'max-banking') {
    // Drawl all banking first, then cheapest
    let rem = demand
    btm     = Math.min(btmAvail, rem);   rem -= btm
    banking = Math.min(bankBalance, rem); rem -= banking
    oaSolar = Math.min(solarAvail, rem); rem -= oaSolar
    oaWind  = Math.min(windAvail, rem);  rem -= oaWind
    grid    = Math.max(0, rem)
    lapsed  = Math.max(0, solarAvail - oaSolar + windAvail - oaWind - banking * 0.05) * 0.5
  } else {
    // min-lapse: bank everything possible
    let rem = demand
    btm     = Math.min(btmAvail, rem);   rem -= btm
    oaSolar = Math.min(solarAvail, rem); rem -= oaSolar
    oaWind  = Math.min(windAvail, rem);  rem -= oaWind
    // Route extra gen into banking rather than settling directly
    const excessGen = Math.max(0, solarAvail - oaSolar + windAvail - oaWind)
    banking = Math.min(bankBalance, rem); rem -= banking
    grid    = Math.max(0, rem - excessGen * 0.6)
    lapsed  = Math.max(0, excessGen - excessGen * 0.6 - 5)
  }

  const netBank = Math.max(0, bankBalance - banking)

  const totalCostLakh = (
    btm * COST.btm + oaSolar * COST.oaSolar + oaWind * COST.oaWind +
    banking * COST.banking + grid * COST.grid
  ) / 1e5

  return {
    demand:        Math.round(demand * 10) / 10,
    btm:           Math.round(btm * 10) / 10,
    oaSolar:       Math.round(oaSolar * 10) / 10,
    oaWind:        Math.round(oaWind * 10) / 10,
    banking:       Math.round(banking * 10) / 10,
    grid:          Math.round(grid * 10) / 10,
    lapsed:        Math.round(lapsed * 10) / 10,
    bankBalance:   Math.round(netBank * 10) / 10,
    totalCostLakh: Math.round(totalCostLakh * 10) / 10,
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 12, padding: 20,
}
const SEL: React.CSSProperties = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 6, padding: '4px 8px',
  color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
}

const STACK_COLORS: Record<string, string> = {
  btm:     '#1baf7a',
  oaSolar: '#2a78d6',
  oaWind:  '#74b0f5',
  banking: '#9b59b6',
  grid:    '#eb6834',
  lapsed:  '#636e72',
}

interface SegmentProps {
  label: string; key: string; value: number; total: number
}

function AllocationBar({ segments }: { segments: SegmentProps[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  return (
    <div>
      {/* Bar */}
      <div style={{ display: 'flex', height: 36, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100
          if (pct < 0.5) return null
          return (
            <div key={i} title={`${s.label}: ${s.value.toFixed(1)} MWh (${pct.toFixed(1)}%)`}
              style={{
                flex: `0 0 ${pct}%`,
                background: STACK_COLORS[s.key] ?? '#555',
                transition: 'flex 0.4s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {pct > 8 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          )
        })}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: STACK_COLORS[s.key] ?? '#555', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
              {s.label}: <strong style={{ color: 'var(--color-text-secondary)' }}>{s.value.toFixed(1)}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart13OptimumSettlement() {
  const [objective, setObjective] = useState<ObjectiveId>('min-cost')
  const [unit, setUnit]           = useState<UnitId>('U-KA-01')
  const [month, setMonth]         = useState(prevMonthStr)

  const result = useMemo(() => buildAllocation(unit, month, objective), [unit, month, objective])

  // Sub-optimal = grid-first (worst case for cost)
  const suboptimal = useMemo(() => buildAllocation(unit, month, 'max-banking'), [unit, month])

  const activeMeta = OBJECTIVES.find(o => o.id === objective)!

  const savingsLakh = +(objective !== 'min-cost'
    ? 0
    : suboptimal.totalCostLakh - result.totalCostLakh
  ).toFixed(1)

  const settlementRows: { label: string; key: string; mwh: number; rate: number }[] = [
    { label: 'BTM Solar',     key: 'btm',     mwh: result.btm,     rate: COST.btm },
    { label: 'OA Solar',      key: 'oaSolar', mwh: result.oaSolar, rate: COST.oaSolar },
    { label: 'OA Wind',       key: 'oaWind',  mwh: result.oaWind,  rate: COST.oaWind },
    { label: 'Banking drawl', key: 'banking', mwh: result.banking, rate: COST.banking },
    { label: 'Grid drawl',    key: 'grid',    mwh: result.grid,    rate: COST.grid },
  ].filter(r => r.mwh > 0)

  const segments: SegmentProps[] = [
    { label: 'BTM',     key: 'btm',     value: result.btm,     total: result.demand },
    { label: 'OA Sol',  key: 'oaSolar', value: result.oaSolar, total: result.demand },
    { label: 'OA Wind', key: 'oaWind',  value: result.oaWind,  total: result.demand },
    { label: 'Banking', key: 'banking', value: result.banking, total: result.demand },
    { label: 'Grid',    key: 'grid',    value: result.grid,    total: result.demand },
    { label: 'Lapsed',  key: 'lapsed',  value: result.lapsed,  total: result.demand },
  ]

  return (
    <div style={CARD}>

      {/* ── Indicative banner ── */}
      <div style={{
        marginBottom: 16, padding: '7px 12px', borderRadius: 6,
        background: 'rgba(237,161,0,0.08)', border: '1px solid rgba(237,161,0,0.3)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>⚠️</span>
        <span style={{ fontSize: 10, color: '#eda100', lineHeight: 1.5 }}>
          <strong>Indicative only.</strong> Results are based on simplified heuristic rules.
          Actual settlement is subject to DISCOM scheduling, metering revisions, and regulatory limits.
        </span>
      </div>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Optimum Settlement Scenario
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            Greedy allocation engine · Minimize landed cost of power
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={unit} onChange={e => setUnit(e.target.value as UnitId)} style={SEL}>
            {UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <input
            type="month" value={month} min="2025-04" max={currentMonth()}
            onChange={e => setMonth(e.target.value)} style={SEL}
          />
        </div>
      </div>

      {/* ── Objective selector ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {OBJECTIVES.map(ob => (
          <button
            key={ob.id}
            onClick={() => setObjective(ob.id)}
            title={ob.desc}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
              background: objective === ob.id ? `${ob.color}18` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${objective === ob.id ? ob.color : 'var(--color-border)'}`,
              color: objective === ob.id ? ob.color : 'var(--color-text-muted)',
              fontWeight: objective === ob.id ? 700 : 400,
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>{ob.icon}</span>
            {ob.label}
          </button>
        ))}
      </div>

      {/* Active objective desc */}
      <div style={{
        marginBottom: 18, padding: '8px 12px', borderRadius: 6,
        background: `${activeMeta.color}0c`, border: `1px solid ${activeMeta.color}28`,
        fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.6,
      }}>
        {activeMeta.desc}
      </div>

      {/* ── Summary KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Demand',  value: `${result.demand.toFixed(1)} MWh`, color: 'var(--color-text-primary)' },
          { label: 'Landed Cost',   value: `₹${result.totalCostLakh.toFixed(1)} L`, color: activeMeta.color },
          { label: 'Grid Drawl',    value: `${result.grid.toFixed(1)} MWh`, color: result.grid > 80 ? '#e74c3c' : '#1baf7a' },
          { label: 'Lapsed',        value: `${result.lapsed.toFixed(1)} MWh`, color: result.lapsed > 5 ? '#eda100' : '#1baf7a' },
          { label: 'Bank Balance',  value: `${result.bankBalance.toFixed(1)} MWh`, color: '#9b59b6' },
          ...(savingsLakh > 0 ? [{ label: 'Savings vs Sub-opt', value: `₹${savingsLakh.toFixed(1)} L`, color: '#1baf7a' }] : []),
        ].map((k, i) => (
          <div key={i} style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.color, lineHeight: 1 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Allocation bar ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
          Settlement Allocation ({result.demand.toFixed(1)} MWh demand)
        </div>
        <AllocationBar segments={segments} />
      </div>

      {/* ── Cost breakdown table ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>
          Cost Breakdown
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Source', 'MWh', '₹/MWh', '₹ Total (L)', 'Share %'].map(h => (
                  <th key={h} style={{
                    padding: '6px 10px',
                    textAlign: h === 'Source' ? 'left' : 'right',
                    color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 10,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {settlementRows.map((r, i) => {
                const cost = (r.mwh * r.rate) / 1e5
                const share = (cost / result.totalCostLakh) * 100
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: STACK_COLORS[r.key], flexShrink: 0 }} />
                      <span style={{ color: 'var(--color-text-secondary)' }}>{r.label}</span>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                      {r.mwh.toFixed(1)}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                      {r.rate.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {cost.toFixed(2)}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                      {share.toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.03)' }}>
                <td colSpan={2} style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Total
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right' }} />
                <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: activeMeta.color, fontSize: 13 }}>
                  {result.totalCostLakh.toFixed(2)}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-muted)' }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Savings callout (min-cost only) ── */}
      {objective === 'min-cost' && savingsLakh > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(27,175,122,0.08)', border: '1px solid rgba(27,175,122,0.3)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>💡</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1baf7a' }}>
              ₹{savingsLakh.toFixed(1)} L indicative savings vs grid-first dispatch
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 3 }}>
              Grid-first cost: ₹{suboptimal.totalCostLakh.toFixed(1)} L → Optimum: ₹{result.totalCostLakh.toFixed(1)} L
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
