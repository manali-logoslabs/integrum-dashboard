/**
 * Chart10LossesWaterfall.tsx — Graph 10
 * Waterfall: Gross generation → Net settled units
 *
 * Loss stages: Transmission loss · Wheeling loss · Banking CIK · Lapsed units · Other
 * Scope:  Portfolio / State / Unit  (toggle + dropdown)
 * Period: Live / Monthly (default) / FY '26-27 to date
 * Y = MWh  ·  each bar labelled with % of gross
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

// ── Portfolio units ───────────────────────────────────────────────────────────
const UNITS = [
  { id:  1, name: 'Old Airport Rd',  stateId: 'KA', mwp: 1.20 },
  { id:  2, name: 'Electronic City', stateId: 'KA', mwp: 0.85 },
  { id:  3, name: 'Whitefield',      stateId: 'KA', mwp: 1.50 },
  { id:  4, name: 'Sahakar Nagar',   stateId: 'KA', mwp: 0.45 },
  { id:  5, name: 'Malleswaram',     stateId: 'KA', mwp: 0.60 },
  { id:  6, name: 'Thanisandra',     stateId: 'KA', mwp: 0.55 },
  { id:  7, name: 'HRBR Unit',       stateId: 'KA', mwp: 0.40 },
  { id:  8, name: 'Bellandur',       stateId: 'KA', mwp: 0.80 },
  { id:  9, name: 'Sarjapura',       stateId: 'KA', mwp: 0.35 },
  { id: 10, name: 'Kanakapura',      stateId: 'KA', mwp: 0.30 },
  { id: 11, name: 'Bellandur Corp',  stateId: 'KA', mwp: 0.20 },
  { id: 12, name: 'Pune Unit 1',     stateId: 'MH', mwp: 0.80 },
  { id: 13, name: 'Pune Unit 2',     stateId: 'MH', mwp: 0.65 },
  { id: 14, name: 'Nashik',          stateId: 'MH', mwp: 0.50 },
  { id: 15, name: 'Aurangabad',      stateId: 'MH', mwp: 0.45 },
  { id: 16, name: 'Hyderabad 1',     stateId: 'TS', mwp: 0.50 },
  { id: 17, name: 'Hyderabad 2',     stateId: 'TS', mwp: 0.40 },
]

const STATES = [
  { id: 'KA', name: 'Karnataka'   },
  { id: 'MH', name: 'Maharashtra' },
  { id: 'TS', name: 'Telangana'   },
]

// ── Loss categories ───────────────────────────────────────────────────────────
const LOSSES = [
  { id: 'tx',     label: 'Transmission Loss',      short: 'Tx Loss',   color: 'rgba(231,76,60,0.88)'   },
  { id: 'whl',    label: 'Wheeling Loss',           short: 'Wheeling',  color: 'rgba(235,104,52,0.88)'  },
  { id: 'bkg',    label: 'Banking Charge-in-Kind',  short: 'Bank CIK',  color: 'rgba(243,156,18,0.88)'  },
  { id: 'lapsed', label: 'Lapsed Units',            short: 'Lapsed',    color: 'rgba(155,89,182,0.88)'  },
  { id: 'other',  label: 'Other Losses',            short: 'Other',     color: 'rgba(127,140,141,0.88)' },
]
const GROSS_COLOR = 'rgba(27,175,122,0.90)'
const NET_COLOR   = 'rgba(42,120,214,0.90)'

// ── Waterfall step ────────────────────────────────────────────────────────────
interface WFStep {
  label: string            // X-axis label (may contain \n)
  bar:   [number, number]  // [bottom, top] floating bar
  type:  'start' | 'loss' | 'end'
  mwh:   number            // magnitude (positive)
  pct:   number            // % of gross
  color: string
  lossIdx?: number         // index into LOSSES array
}

// ── Seed helper ───────────────────────────────────────────────────────────────
type Scope = 'portfolio' | 'state' | 'unit'

function makeSeed(scope: Scope, id: number | string, month: string): number {
  const [y, m] = month.split('-').map(Number)
  const mn = (y - 2025) * 12 + (m - 1)
  const idN = typeof id === 'number' ? id
    : (id as string).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return idN * 37 + mn * 100 + (scope === 'portfolio' ? 0 : scope === 'state' ? 500 : 1000)
}

// ── Month helpers ─────────────────────────────────────────────────────────────
function prevMonthStr(): string {
  const d = new Date()
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1, 1)
  return `${d.toLocaleDateString('en-IN', { month: 'short' })} '${String(y).slice(-2)}`
}

function daysInMonth(m: string): number {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo, 0).getDate()
}

// ── Gross MWh generation ──────────────────────────────────────────────────────
function genGross(scope: Scope, id: number | string, month: string): number {
  const s = makeSeed(scope, id, month)
  const days = daysInMonth(month)

  if (scope === 'portfolio') {
    const mwp = UNITS.reduce((a, u) => a + u.mwp, 0)    // 7.30 MWp total
    const cuf = 0.17 + rng(s + 7) * 0.07               // 17–24% CUF
    return Math.round(mwp * cuf * days * 24)
  }
  if (scope === 'state') {
    const mwp = UNITS.filter(u => u.stateId === id).reduce((a, u) => a + u.mwp, 0)
    const cuf = 0.17 + rng(s + 5) * 0.08
    return Math.round(mwp * cuf * days * 24)
  }
  const u = UNITS.find(u => u.id === id)!
  const cuf = 0.16 + rng(s + 3) * 0.10
  return Math.round(u.mwp * cuf * days * 24)
}

// ── Loss percentages ──────────────────────────────────────────────────────────
function genLossPcts(scope: Scope, id: number | string, month: string): number[] {
  const s = makeSeed(scope, id, month)
  const stId = scope === 'unit' ? UNITS.find(u => u.id === id)!.stateId
             : scope === 'state' ? (id as string)
             : 'MIX'

  // Transmission: Karnataka ~4%, MH ~4.5%, TS ~3.8%, portfolio ~4.1%
  const txBase = stId === 'KA' ? 0.036 : stId === 'MH' ? 0.042 : stId === 'TS' ? 0.035 : 0.038
  return [
    txBase  + rng(s + 11) * 0.018,   // Tx:      3.5–5.5%
    0.012   + rng(s + 21) * 0.018,   // Wheeling: 1.2–3.0%
    0.018   + rng(s + 31) * 0.032,   // Bank CIK: 1.8–5.0%
    0.003   + rng(s + 41) * 0.012,   // Lapsed:   0.3–1.5%
    0.002   + rng(s + 51) * 0.008,   // Other:    0.2–1.0%
  ]
}

// ── Build waterfall steps ─────────────────────────────────────────────────────
function buildSteps(gross: number, pcts: number[]): WFStep[] {
  const steps: WFStep[] = []
  let run = gross

  steps.push({
    label: 'Gross\nGeneration',
    bar: [0, gross], type: 'start',
    mwh: gross, pct: 100,
    color: GROSS_COLOR,
  })

  pcts.forEach((p, i) => {
    const loss = Math.round(gross * p * 10) / 10
    const top = run
    const bot = Math.round((run - loss) * 10) / 10
    steps.push({
      label: LOSSES[i].short,
      bar: [bot, top], type: 'loss',
      mwh: loss, pct: +((p * 100).toFixed(2)),
      color: LOSSES[i].color, lossIdx: i,
    })
    run = bot
  })

  const net = Math.round(run * 10) / 10
  steps.push({
    label: 'Net\nSettled',
    bar: [0, net], type: 'end',
    mwh: net, pct: +((net / gross * 100).toFixed(1)),
    color: NET_COLOR,
  })

  return steps
}

// ── FY aggregate data ─────────────────────────────────────────────────────────
// FY '26-27: Apr '26 · May '26 · Jun '26 · Jul '26 (to date)
const FY_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07']

function fyAggregate(scope: Scope, id: number | string): { gross: number; pcts: number[] } {
  let totalGross = 0
  const totalLoss = [0, 0, 0, 0, 0]

  FY_MONTHS.forEach(m => {
    const g = genGross(scope, id, m)
    const p = genLossPcts(scope, id, m)
    totalGross += g
    p.forEach((pp, i) => { totalLoss[i] += g * pp })
  })
  return {
    gross: Math.round(totalGross),
    pcts: totalLoss.map(l => l / totalGross),
  }
}

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

// Strip rgba alpha for KPI color usage
function solidColor(rgba: string): string {
  return rgba.replace(/[\d.]+\)$/, '1)')
}

type Period = 'live' | 'monthly' | 'fy'

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart10LossesWaterfall() {
  const [scope,   setScope]   = useState<Scope>('unit')
  const [unitId,  setUnitId]  = useState(1)
  const [stateId, setStateId] = useState('KA')
  const [period,  setPeriod]  = useState<Period>('monthly')
  const [month,   setMonth]   = useState(prevMonthStr)

  // Resolve scope ID
  const scopeId: number | string =
    scope === 'unit' ? unitId : scope === 'state' ? stateId : 'portfolio'

  // Build gross + loss pcts for the selected period
  const { gross, pcts } = useMemo(() => {
    if (period === 'fy') return fyAggregate(scope, scopeId)
    // Live: current (partial) month, scale by day-of-month fraction
    if (period === 'live') {
      const today = new Date()
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      const totalDays = daysInMonth(curMonth)
      const dayOfMonth = today.getDate()
      const scaledGross = Math.round(genGross(scope, scopeId, curMonth) * dayOfMonth / totalDays)
      return { gross: scaledGross, pcts: genLossPcts(scope, scopeId, curMonth) }
    }
    return { gross: genGross(scope, scopeId, month), pcts: genLossPcts(scope, scopeId, month) }
  }, [scope, scopeId, period, month])

  const steps = useMemo(() => buildSteps(gross, pcts), [gross, pcts])

  // KPI summary
  const lossSteps = steps.filter(s => s.type === 'loss')
  const totalLoss = lossSteps.reduce((a, s) => a + s.mwh, 0)
  const netMwh    = steps[steps.length - 1].mwh
  const effPct    = steps[steps.length - 1].pct

  // Label for header breadcrumb
  const scopeName =
    scope === 'portfolio' ? 'Portfolio'
    : scope === 'state'   ? STATES.find(s => s.id === stateId)!.name
    :                       UNITS.find(u => u.id === unitId)!.name

  const periodLabel =
    period === 'live'    ? `Live · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
    : period === 'fy'    ? "FY '26-27 to date (Apr–Jul)"
    :                      monthLabel(month)

  // Chart.js data — floating bar: data = [[bottom, top], ...]
  const chartData = {
    labels: steps.map(s => s.label),
    datasets: [{
      label: 'Generation / Loss',
      data: steps.map(s => s.bar),
      backgroundColor: steps.map(s => s.color),
      borderColor: steps.map(s => solidColor(s.color)),
      borderWidth: 1,
      borderRadius: 4,
      barPercentage: 0.60,
    }],
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false, animation: false as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,22,38,0.95)',
        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
        titleColor: 'rgba(255,255,255,0.85)', bodyColor: 'rgba(255,255,255,0.65)',
        padding: 10,
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => {
            const i = items[0]?.dataIndex ?? 0
            const s = steps[i]
            if (!s) return ''
            if (s.type === 'start') return 'Gross Generation'
            if (s.type === 'end')   return 'Net Settled Units'
            return LOSSES[s.lossIdx ?? 0].label
          },
          label: (item: TooltipItem<'bar'>) => {
            const raw = item.raw as [number, number]
            const s = steps[item.dataIndex]
            if (!s) return ''
            const barH = Math.abs(raw[1] - raw[0])
            if (s.type === 'start') return `  ${raw[1].toLocaleString()} MWh  (gross)`
            if (s.type === 'end')   return `  ${raw[1].toLocaleString()} MWh  (${s.pct}% of gross)`
            return `  −${barH.toFixed(1)} MWh  (${s.pct}% of gross)`
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: AXIS_C, font: { size: 10 } },
        grid:  { color: GRID_C },
      },
      y: {
        ticks: {
          color: AXIS_C, font: { size: 10 },
          callback: (v: number | string) =>
            typeof v === 'number' ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toString()) : v,
        },
        grid:  { color: GRID_C },
        title: { display: true, text: 'MWh', color: AXIS_C, font: { size: 10 } },
      },
    },
  }

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Losses Waterfall
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            Gross generation → Net settled · MWh and % per loss category
          </div>
        </div>

        {/* Scope toggle + dropdown */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['portfolio', 'state', 'unit'] as Scope[]).map(sc => (
            <button
              key={sc}
              onClick={() => setScope(sc)}
              style={{
                padding: '4px 11px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                background: scope === sc ? 'rgba(27,175,122,0.15)' : 'transparent',
                border: `1px solid ${scope === sc ? '#1baf7a' : 'var(--color-border)'}`,
                color: scope === sc ? '#1baf7a' : 'var(--color-text-muted)',
              }}
            >
              {sc.charAt(0).toUpperCase() + sc.slice(1)}
            </button>
          ))}
          {scope === 'unit' && (
            <select value={unitId} onChange={e => setUnitId(+e.target.value)} style={{ ...SEL, minWidth: 140 }}>
              {UNITS.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {scope === 'state' && (
            <select value={stateId} onChange={e => setStateId(e.target.value)} style={{ ...SEL, minWidth: 130 }}>
              {STATES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* ── Period tabs + month picker ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {([['live', 'Live'], ['monthly', 'Monthly'], ['fy', "FY '26-27"]] as [Period, string][]).map(([p, lbl]) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              background: period === p ? 'var(--color-text-muted)' : 'transparent',
              border: '1px solid var(--color-border)',
              color: period === p ? '#0f1626' : 'var(--color-text-muted)',
              fontWeight: period === p ? 700 : 400,
            }}
          >
            {lbl}
          </button>
        ))}
        {period === 'monthly' && (
          <input
            type="month" value={month}
            onChange={e => setMonth(e.target.value)}
            style={{
              background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 4, padding: '3px 8px', fontSize: 11,
              color: 'var(--color-text-primary)', outline: 'none',
            }}
          />
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)' }}>
          {scopeName} · {periodLabel}
        </span>
      </div>

      {/* ── KPI chips ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
        {([
          { label: 'Gross Generation', value: `${gross.toLocaleString()} MWh`,              sub: '100.0%',                                    textColor: '#1baf7a', bg: 'rgba(27,175,122,0.08)',  border: 'rgba(27,175,122,0.28)'  },
          { label: 'Total Losses',     value: `−${Math.round(totalLoss).toLocaleString()} MWh`, sub: `${(totalLoss / gross * 100).toFixed(1)}% of gross`, textColor: '#e74c3c', bg: 'rgba(231,76,60,0.08)',  border: 'rgba(231,76,60,0.28)'   },
          { label: 'Net Settled',      value: `${Math.round(netMwh).toLocaleString()} MWh`, sub: `${effPct}% efficiency`,                      textColor: '#2a78d6', bg: 'rgba(42,120,214,0.08)', border: 'rgba(42,120,214,0.28)'  },
        ] as { label: string; value: string; sub: string; textColor: string; bg: string; border: string }[]).map(({ label, value, sub, textColor, bg, border }) => (
          <div key={label} style={{ padding: '10px 14px', borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
              {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: textColor, lineHeight: 1, marginBottom: 3 }}>
              {value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Waterfall chart ── */}
      <div style={{ height: 300 }}>
        <Bar data={chartData} options={chartOpts} />
      </div>

      {/* ── Colour legend ── */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
        {[
          { color: solidColor(GROSS_COLOR), label: 'Gross Generation' },
          ...LOSSES.map(l => ({ color: solidColor(l.color), label: l.label })),
          { color: solidColor(NET_COLOR),   label: 'Net Settled' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Summary table ── */}
      <div style={{ marginTop: 18, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Loss Category', 'MWh Lost', '% of Gross'].map(h => (
                <th key={h} style={{
                  padding: '5px 8px', fontSize: 10, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: 'var(--color-text-muted)',
                  textAlign: h === 'Loss Category' ? 'left' : 'right',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lossSteps.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px', color: 'var(--color-text-primary)' }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                    background: solidColor(s.color), marginRight: 7, verticalAlign: 'middle',
                  }} />
                  {LOSSES[s.lossIdx ?? i].label}
                </td>
                <td style={{
                  padding: '6px 8px', textAlign: 'right',
                  color: '#e97070', fontFamily: 'monospace',
                }}>
                  −{s.mwh.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </td>
                <td style={{
                  padding: '6px 8px', textAlign: 'right',
                  color: 'var(--color-text-secondary)', fontFamily: 'monospace',
                }}>
                  {s.pct.toFixed(2)}%
                </td>
              </tr>
            ))}
            {/* Total losses */}
            <tr style={{ borderTop: '2px solid var(--color-border)' }}>
              <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Total Losses
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#e97070', fontFamily: 'monospace' }}>
                −{Math.round(totalLoss).toLocaleString()}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                {(totalLoss / gross * 100).toFixed(2)}%
              </td>
            </tr>
            {/* Net settled */}
            <tr>
              <td style={{ padding: '6px 8px', fontWeight: 700, color: solidColor(NET_COLOR) }}>
                Net Settled Units
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: solidColor(NET_COLOR), fontFamily: 'monospace' }}>
                {Math.round(netMwh).toLocaleString()}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: solidColor(NET_COLOR), fontFamily: 'monospace' }}>
                {effPct.toFixed(1)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
