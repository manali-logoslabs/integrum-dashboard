/**
 * Chart12BankingScenarioBuilder.tsx — Graph 12
 * Banking Scenario Builder (What-if engine)
 *
 * Scenarios: base / no-banking / monthly-all / CIK-increase
 * Chart: grouped-stacked bars — Base vs Scenario by state
 * KPI delta chips: ΔSettled, ΔLapsed, ΔGrid, Δ₹
 */
import React, { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, Tooltip, Legend,
  type TooltipItem,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

// ── RNG ───────────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ScenarioId = 'no-banking' | 'monthly-all' | 'cik-plus3'

interface ScenarioResult {
  oaSettled:   number   // MWh
  btm:         number   // MWh
  bankingDrawl: number  // MWh
  gridDrawl:   number   // MWh
  lapsed:      number   // MWh
  costLakh:    number   // ₹ lakhs (100k ₹)
}

type StateId = 'KA' | 'MH' | 'TS'

interface StateSummary {
  id:       StateId
  name:     string
  base:     ScenarioResult
  scenario: ScenarioResult
}

// ── Tariff constants (₹/MWh) ─────────────────────────────────────────────────
const TARIFF = {
  oaSolar:  4500,   // typical PPA
  oaWind:   5200,
  btm:      2800,   // effective avoided grid cost
  banking:  4900,   // PPA rate + 5% CIK ≈ 4500×1.05
  grid:     8750,   // BESCOM HT tariff (avg across TOD)
  lapsedOC: 8750,   // opportunity cost: we could have avoided this grid ₹
}

// ── Data generation ───────────────────────────────────────────────────────────
function prevMonthStr(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function buildStateSummary(
  stateId: StateId,
  month: string,
  scenario: ScenarioId | null,
): StateSummary {
  const [y, m] = month.split('-').map(Number)
  const seed = stateId.charCodeAt(0) * 199 + (y ?? 2026) * 100 + (m ?? 6)

  // Base case — June is rainy season: generation < consumption in KA
  const baseConsumption = stateId === 'KA' ? 530 + rng(seed) * 60
    : stateId === 'MH' ? 210 + rng(seed + 1) * 30 : 95 + rng(seed + 2) * 15

  const baseOA         = baseConsumption * (0.44 + rng(seed + 10) * 0.06)
  const baseBTM        = baseConsumption * (0.11 + rng(seed + 11) * 0.04)
  const baseBanking    = baseConsumption * (0.27 + rng(seed + 12) * 0.06)
  const baseGrid       = Math.max(0, baseConsumption - baseOA - baseBTM - baseBanking)
  const baseLapsed     = rng(seed + 13) * 8   // small lapse in deficit month

  const baseCostLakh   = (
    baseOA * TARIFF.oaSolar +
    baseBTM * TARIFF.btm +
    baseBanking * TARIFF.banking +
    baseGrid * TARIFF.grid
  ) / 1e5

  const base: ScenarioResult = {
    oaSettled:    Math.round(baseOA   * 10) / 10,
    btm:          Math.round(baseBTM  * 10) / 10,
    bankingDrawl: Math.round(baseBanking * 10) / 10,
    gridDrawl:    Math.round(baseGrid * 10) / 10,
    lapsed:       Math.round(baseLapsed * 10) / 10,
    costLakh:     Math.round(baseCostLakh * 10) / 10,
  }

  // Scenario modifiers
  let scen: ScenarioResult = { ...base }
  if (scenario === 'no-banking') {
    // All banked units unavailable → full deficit covered by grid
    scen = {
      ...base,
      bankingDrawl: 0,
      gridDrawl:    Math.round((baseGrid + baseBanking) * 10) / 10,
      lapsed:       Math.round((baseLapsed + rng(seed + 20) * 15) * 10) / 10,
      costLakh: Math.round((
        baseOA * TARIFF.oaSolar +
        baseBTM * TARIFF.btm +
        (baseGrid + baseBanking) * TARIFF.grid
      ) / 1e5 * 10) / 10,
    }
  } else if (scenario === 'monthly-all') {
    // Annual banking → monthly: less bank available (20% lapses each month)
    const bankReduction = baseBanking * 0.22
    scen = {
      ...base,
      bankingDrawl: Math.round((baseBanking - bankReduction) * 10) / 10,
      gridDrawl:    Math.round((baseGrid + bankReduction * 0.7) * 10) / 10,
      lapsed:       Math.round((baseLapsed + bankReduction * 0.3) * 10) / 10,
      costLakh: Math.round((
        baseOA * TARIFF.oaSolar +
        baseBTM * TARIFF.btm +
        (baseBanking - bankReduction) * TARIFF.banking +
        (baseGrid + bankReduction * 0.7) * TARIFF.grid
      ) / 1e5 * 10) / 10,
    }
  } else if (scenario === 'cik-plus3') {
    // CIK raised +3% → same physical flow, higher cost on banking drawl
    const newBankingRate = TARIFF.banking * (1 + 0.03)  // approx
    scen = {
      ...base,
      costLakh: Math.round((
        baseOA * TARIFF.oaSolar +
        baseBTM * TARIFF.btm +
        baseBanking * newBankingRate +
        baseGrid * TARIFF.grid
      ) / 1e5 * 10) / 10,
    }
  }

  const names: Record<StateId, string> = { KA: 'Karnataka', MH: 'Maharashtra', TS: 'Telangana' }

  return { id: stateId, name: names[stateId], base, scenario: scen }
}

// ── Scenario metadata ─────────────────────────────────────────────────────────
const SCENARIOS: { id: ScenarioId; label: string; desc: string; color: string }[] = [
  {
    id: 'no-banking',
    label: 'No Banking',
    desc: 'Removes banking entirely — all deficit covered by grid draw; surplus gen lapsed or re-scheduled.',
    color: '#e74c3c',
  },
  {
    id: 'monthly-all',
    label: 'Monthly (all states)',
    desc: 'Converts annual banking (Karnataka) to monthly reset: ~20% carry-forward loss each month.',
    color: '#eb6834',
  },
  {
    id: 'cik-plus3',
    label: 'CIK +3%',
    desc: 'Simulates KERC raising Charge-in-Kind from 5% → 8% for all KA OA plants. Same physical flow, higher ₹ cost.',
    color: '#eda100',
  },
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
const AXIS_C = 'rgba(255,255,255,0.35)'
const GRID_C = 'rgba(255,255,255,0.06)'

// Source colours
const SRC = {
  oa:      { base: 'rgba(42,120,214,0.85)',  scen: 'rgba(42,120,214,0.35)'  },
  btm:     { base: 'rgba(27,175,122,0.85)',  scen: 'rgba(27,175,122,0.35)'  },
  banking: { base: 'rgba(155,89,182,0.85)',  scen: 'rgba(155,89,182,0.35)'  },
  grid:    { base: 'rgba(235,104,52,0.85)',  scen: 'rgba(235,104,52,0.35)'  },
  lapsed:  { base: 'rgba(127,140,141,0.85)', scen: 'rgba(127,140,141,0.35)' },
}

function deltaChip(
  label: string, base: number, scen: number, unit: string, lowerIsBetter = false
) {
  const diff = scen - base
  const better = lowerIsBetter ? diff < 0 : diff > 0
  const color = Math.abs(diff) < 0.5 ? 'var(--color-text-muted)'
    : better ? '#1baf7a' : '#e74c3c'
  const sign = diff >= 0 ? '+' : ''
  return { label, diff, unit, color, sign }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart12BankingScenarioBuilder() {
  const [scenario, setScenario] = useState<ScenarioId>('no-banking')
  const [month, setMonth]       = useState(prevMonthStr)
  const [viewLevel, setViewLevel] = useState<'portfolio' | 'state'>('portfolio')

  const states: StateId[] = ['KA', 'MH', 'TS']
  const stateSummaries = useMemo(
    () => states.map(s => buildStateSummary(s, month, scenario)),
    [scenario, month],
  )

  // Portfolio aggregate
  const portfolio = useMemo(() => ({
    base: {
      oaSettled:    stateSummaries.reduce((a, s) => a + s.base.oaSettled,    0),
      btm:          stateSummaries.reduce((a, s) => a + s.base.btm,          0),
      bankingDrawl: stateSummaries.reduce((a, s) => a + s.base.bankingDrawl, 0),
      gridDrawl:    stateSummaries.reduce((a, s) => a + s.base.gridDrawl,    0),
      lapsed:       stateSummaries.reduce((a, s) => a + s.base.lapsed,       0),
      costLakh:     stateSummaries.reduce((a, s) => a + s.base.costLakh,     0),
    },
    scen: {
      oaSettled:    stateSummaries.reduce((a, s) => a + s.scenario.oaSettled,    0),
      btm:          stateSummaries.reduce((a, s) => a + s.scenario.btm,          0),
      bankingDrawl: stateSummaries.reduce((a, s) => a + s.scenario.bankingDrawl, 0),
      gridDrawl:    stateSummaries.reduce((a, s) => a + s.scenario.gridDrawl,    0),
      lapsed:       stateSummaries.reduce((a, s) => a + s.scenario.lapsed,       0),
      costLakh:     stateSummaries.reduce((a, s) => a + s.scenario.costLakh,     0),
    },
  }), [stateSummaries])

  // Delta chips (portfolio)
  const chips = [
    deltaChip('Banking drawl',  portfolio.base.bankingDrawl, portfolio.scen.bankingDrawl, 'MWh', false),
    deltaChip('Grid drawl',     portfolio.base.gridDrawl,    portfolio.scen.gridDrawl,    'MWh', true),
    deltaChip('Lapsed units',   portfolio.base.lapsed,       portfolio.scen.lapsed,       'MWh', true),
    deltaChip('Cost (₹ lakh)',  portfolio.base.costLakh,     portfolio.scen.costLakh,     'L',   true),
  ]

  // Chart data — grouped stacked bars: each state shows [Base | Scenario]
  const rows = viewLevel === 'portfolio'
    ? [{ name: 'Portfolio', base: portfolio.base, scenario: portfolio.scen }]
    : stateSummaries.map(s => ({ name: s.name, base: s.base, scenario: s.scenario }))

  const labels = rows.flatMap(r => [`${r.name}\n(Base)`, `${r.name}\n(Scenario)`])

  function mkDataset(label: string, valFn: (r: ScenarioResult) => number, baseColor: string, scenColor: string) {
    const data = rows.flatMap(r => [valFn(r.base), valFn(r.scenario)])
    const bgColors = rows.flatMap((_, i) => [baseColor, scenColor])
    return {
      label,
      data,
      backgroundColor: bgColors,
      borderColor:     bgColors.map(c => c.replace(/[\d.]+\)$/, '1)')),
      borderWidth: 1,
      borderRadius: 3,
    }
  }

  const chartData = {
    labels,
    datasets: [
      mkDataset('OA',      r => r.oaSettled,    SRC.oa.base,      SRC.oa.scen),
      mkDataset('BTM',     r => r.btm,           SRC.btm.base,     SRC.btm.scen),
      mkDataset('Banking', r => r.bankingDrawl,  SRC.banking.base, SRC.banking.scen),
      mkDataset('Grid',    r => r.gridDrawl,     SRC.grid.base,    SRC.grid.scen),
      mkDataset('Lapsed',  r => r.lapsed,        SRC.lapsed.base,  SRC.lapsed.scen),
    ],
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false, animation: false as const,
    plugins: {
      legend: { display: true, labels: { color: AXIS_C, font: { size: 10 }, boxWidth: 10 } },
      tooltip: {
        mode: 'index' as const, intersect: false,
        backgroundColor: 'rgba(15,22,38,0.95)',
        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
        titleColor: 'rgba(255,255,255,0.9)', bodyColor: 'rgba(255,255,255,0.7)',
        padding: 10,
        callbacks: {
          label: (item: TooltipItem<'bar'>) =>
            `  ${item.dataset.label}: ${(item.parsed.y ?? 0).toFixed(1)} MWh`,
          footer: (items: TooltipItem<'bar'>[]) => {
            const total = items.reduce((s, i) => s + (i.parsed.y ?? 0), 0)
            return `  Total: ${total.toFixed(1)} MWh`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: AXIS_C, font: { size: 10 }, maxRotation: 0 },
        grid:  { color: GRID_C },
      },
      y: {
        stacked: true,
        ticks: { color: AXIS_C, font: { size: 10 } },
        grid:  { color: GRID_C },
        title: { display: true, text: 'MWh', color: AXIS_C, font: { size: 10 } },
      },
    },
  }

  const activeMeta = SCENARIOS.find(s => s.id === scenario)!

  function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Banking Scenario Builder
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            What-if engine — compare base case vs regulatory / operational scenario · MWh & ₹ impact
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="month" value={month} min="2025-04" max={currentMonth()}
            onChange={e => setMonth(e.target.value)} style={SEL}
          />
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            {(['portfolio', 'state'] as const).map(v => (
              <button key={v} onClick={() => setViewLevel(v)} style={{
                padding: '4px 12px', fontSize: 11, cursor: 'pointer', border: 'none',
                background: viewLevel === v ? '#2a78d6' : 'transparent',
                color: viewLevel === v ? '#fff' : 'var(--color-text-muted)',
                fontWeight: viewLevel === v ? 600 : 400,
                borderRight: v === 'portfolio' ? '1px solid var(--color-border)' : 'none',
              }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scenario selector ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {SCENARIOS.map(sc => (
          <button
            key={sc.id}
            onClick={() => setScenario(sc.id)}
            title={sc.desc}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              background: scenario === sc.id ? `${sc.color}20` : 'transparent',
              border: `1px solid ${scenario === sc.id ? sc.color : 'var(--color-border)'}`,
              color: scenario === sc.id ? sc.color : 'var(--color-text-muted)',
              fontWeight: scenario === sc.id ? 700 : 400,
              transition: 'all 0.15s',
            }}
          >
            {sc.label}
          </button>
        ))}
      </div>

      {/* Active scenario description banner */}
      <div style={{
        marginBottom: 16, padding: '8px 12px', borderRadius: 6,
        background: `${activeMeta.color}0d`, border: `1px solid ${activeMeta.color}30`,
        fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.6,
      }}>
        <strong style={{ color: activeMeta.color }}>Scenario: {activeMeta.label} — </strong>
        {activeMeta.desc}
      </div>

      {/* ── Delta KPI chips ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 20 }}>
        {chips.map(c => {
          const isNeutral = Math.abs(c.diff) < 0.5
          return (
            <div key={c.label} style={{
              padding: '10px 14px', borderRadius: 8,
              background: isNeutral ? 'rgba(255,255,255,0.04)' : c.diff < 0
                ? (c.color === '#1baf7a' ? 'rgba(27,175,122,0.08)' : 'rgba(231,76,60,0.08)')
                : (c.color === '#1baf7a' ? 'rgba(27,175,122,0.08)' : 'rgba(231,76,60,0.08)'),
              border: `1px solid ${isNeutral ? 'var(--color-border)' : `${c.color}44`}`,
            }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                Δ {c.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: isNeutral ? 'var(--color-text-muted)' : c.color, lineHeight: 1 }}>
                {isNeutral ? '—' : `${c.sign}${Math.abs(c.diff).toFixed(1)} ${c.unit}`}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 3 }}>
                Base: {c.label === 'Cost (₹ lakh)'
                  ? `₹${portfolio.base.costLakh.toFixed(1)} L`
                  : `${portfolio.base[c.label === 'Banking drawl' ? 'bankingDrawl' : c.label === 'Grid drawl' ? 'gridDrawl' : 'lapsed'].toFixed(1)} MWh`}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Chart ── */}
      <div style={{ height: 320 }}>
        <Bar data={chartData} options={chartOpts} />
      </div>

      {/* ── State breakdown table ── */}
      {viewLevel === 'state' && (
        <div style={{ marginTop: 18, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['State', 'View', 'OA (MWh)', 'BTM (MWh)', 'Banking (MWh)', 'Grid (MWh)', 'Lapsed (MWh)', 'Cost (₹ L)'].map(h => (
                  <th key={h} style={{
                    padding: '6px 10px',
                    textAlign: h === 'State' || h === 'View' ? 'left' : 'right',
                    color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 10,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stateSummaries.map((s, si) => (
                [s.base, s.scenario].map((r, ri) => {
                  const isScen = ri === 1
                  return (
                    <tr key={`${si}-${ri}`} style={{
                      borderBottom: isScen ? '2px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.03)',
                      background: isScen ? `${activeMeta.color}08` : 'transparent',
                    }}>
                      <td style={{ padding: '6px 10px', fontWeight: isScen ? 400 : 700, color: isScen ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
                        {ri === 0 ? s.name : ''}
                      </td>
                      <td style={{ padding: '6px 10px', color: isScen ? activeMeta.color : 'var(--color-text-secondary)', fontWeight: 600, fontSize: 10 }}>
                        {isScen ? activeMeta.label : 'Base'}
                      </td>
                      {[r.oaSettled, r.btm, r.bankingDrawl, r.gridDrawl, r.lapsed].map((v, ci) => (
                        <td key={ci} style={{
                          padding: '6px 10px', textAlign: 'right',
                          fontFamily: 'monospace',
                          color: isScen && ci === 2 && r.bankingDrawl < s.base.bankingDrawl ? '#e74c3c'
                            : isScen && ci === 3 && r.gridDrawl > s.base.gridDrawl ? '#e74c3c'
                            : 'var(--color-text-secondary)',
                        }}>{v.toFixed(1)}</td>
                      ))}
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace',
                        color: isScen && r.costLakh > s.base.costLakh ? '#e74c3c' : 'var(--color-text-secondary)' }}>
                        {r.costLakh.toFixed(1)}
                      </td>
                    </tr>
                  )
                })
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 14, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          ['OA', SRC.oa.base], ['BTM', SRC.btm.base], ['Banking', SRC.banking.base],
          ['Grid', SRC.grid.base], ['Lapsed', SRC.lapsed.base],
        ].map(([lbl, col]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: col }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{lbl}</span>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          Solid = Base · Faded = {activeMeta.label} scenario
        </span>
      </div>
    </div>
  )
}
