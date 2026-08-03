/**
 * Chart9ConsumptionSettlement.tsx — Graph 9
 * Consumption ↔ Generation Settlement Mapping
 *
 * Default view: For selected unit + month — "Consumption" reference bar alongside
 *   contributing generation bars per source (OA plants, BTM, Banking, Grid).
 *   Source bars sum to total consumption.
 *
 * TOD-split toggle: each source bar becomes a 3-stack (Peak / Normal / Off-peak),
 *   revealing which source settled at which time-of-day block.
 *
 * Historical mode: X = months over a custom period; stacked bars by source showing
 *   how settlement composition has evolved. Source filter highlights one plant.
 *
 * Y = MWh   X = source / TOD / month
 */
import React, { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Tooltip, Legend, type TooltipItem,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

// ── Unit reference ────────────────────────────────────────────────────────────
const UNIT_REFS = [
  { id:  1, name: 'Old Airport Rd',  stateId: 'KA', cd: 3200 },
  { id:  2, name: 'Electronic City', stateId: 'KA', cd: 2800 },
  { id:  3, name: 'Whitefield',      stateId: 'KA', cd: 4100 },
  { id:  4, name: 'Sahakar Nagar',   stateId: 'KA', cd: 1800 },
  { id:  5, name: 'Malleswaram',     stateId: 'KA', cd: 2200 },
  { id:  6, name: 'Thanisandra',     stateId: 'KA', cd: 2100 },
  { id:  7, name: 'HRBR Unit',       stateId: 'KA', cd: 1600 },
  { id:  8, name: 'Bellandur',       stateId: 'KA', cd: 3600 },
  { id:  9, name: 'Sarjapura',       stateId: 'KA', cd: 1400 },
  { id: 10, name: 'Kanakapura',      stateId: 'KA', cd: 1200 },
  { id: 11, name: 'Bellandur Corp',  stateId: 'KA', cd:  800 },
  { id: 12, name: 'Pune Unit 1',     stateId: 'MH', cd: 2400 },
  { id: 13, name: 'Pune Unit 2',     stateId: 'MH', cd: 1900 },
  { id: 14, name: 'Nashik',          stateId: 'MH', cd: 2100 },
  { id: 15, name: 'Aurangabad',      stateId: 'MH', cd: 1600 },
  { id: 16, name: 'Hyderabad 1',     stateId: 'TS', cd: 2800 },
  { id: 17, name: 'Hyderabad 2',     stateId: 'TS', cd: 2200 },
]

// ── OA plants in portfolio ────────────────────────────────────────────────────
const OA_PLANTS = [
  { id: 'pav-sol', name: 'Pavagada Solar',  state: 'KA', type: 'Solar', color: '#e5a50a', bg: 'rgba(229,165,10,0.82)'  },
  { id: 'bel-wnd', name: 'Bellary Wind',    state: 'KA', type: 'Wind',  color: '#27ae60', bg: 'rgba(39,174,96,0.82)'   },
  { id: 'raj-sol', name: 'Rajasthan Solar', state: 'RJ', type: 'Solar', color: '#e67e22', bg: 'rgba(230,126,34,0.82)'  },
  { id: 'nan-wnd', name: 'Nanded Wind',     state: 'MH', type: 'Wind',  color: '#16a085', bg: 'rgba(22,160,133,0.82)'  },
]

// Sources (OA plants + BTM + Banking + Grid)
const SOURCES_META = [
  ...OA_PLANTS.map(p => ({ id: p.id, name: p.name, color: p.color, bg: p.bg })),
  { id: 'btm',     name: 'BTM Solar',        color: '#1baf7a', bg: 'rgba(27,175,122,0.82)'  },
  { id: 'banking', name: 'Banking credit',   color: '#9b59b6', bg: 'rgba(155,89,182,0.82)'  },
  { id: 'grid',    name: 'Grid (DISCOM)',     color: '#eb6834', bg: 'rgba(235,104,52,0.82)'  },
]

// Consumption reference color
const CONS_COLOR = { color: '#5d7ba8', bg: 'rgba(93,123,168,0.82)' }

// ── TOD zones (BESCOM Karnataka) ──────────────────────────────────────────────
// Peak: 06-10, 18-22 | Normal: 10-18 | Off-peak: 22-06
// Each source has a characteristic TOD generation/drawl profile
const TOD_PROFILE: Record<string, [number, number, number]> = {
  // [peak%, normal%, offpeak%]  — must sum to 1
  'pav-sol':     [0.06, 0.90, 0.04],  // solar: almost entirely normal hours
  'bel-wnd':     [0.28, 0.37, 0.35],  // wind: spread, more in off-peak
  'raj-sol':     [0.05, 0.92, 0.03],  // inter-state solar: strong normal
  'nan-wnd':     [0.26, 0.40, 0.34],  // wind
  'btm':         [0.09, 0.89, 0.02],  // rooftop solar: normal hours
  'banking':     [0.22, 0.28, 0.50],  // banking: drawn more in off-peak
  'grid':        [0.38, 0.37, 0.25],  // grid: peaks at peak hours
  'consumption': [0.32, 0.46, 0.22],  // office building consumption pattern
}

const TOD_COLORS = {
  peak:    { color: '#e74c3c', bg: 'rgba(231,76,60,0.82)',  label: 'Peak (06-10, 18-22)' },
  normal:  { color: '#2a78d6', bg: 'rgba(42,120,214,0.82)', label: 'Normal (10-18)'        },
  offpeak: { color: '#6c757d', bg: 'rgba(108,117,125,0.82)',label: 'Off-peak (22-06)'      },
}

// ── RNG ───────────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ── Data generation ───────────────────────────────────────────────────────────
interface SourceSettlement { id: string; mwh: number }

interface SettlementData {
  total:   number
  sources: SourceSettlement[]            // ordered: OA plants, BTM, Banking, Grid
  byTOD:   Record<string, { peak: number; normal: number; offpeak: number }>
}

function buildSettlement(unitId: number, monthStr: string): SettlementData {
  const [yr, mon] = monthStr.split('-').map(Number)
  const seed  = unitId * 10000 + (yr ?? 2026) * 100 + (mon ?? 6)
  const unit  = UNIT_REFS.find(u => u.id === unitId) ?? UNIT_REFS[0]!
  const total = unit.cd * 0.28 * (0.88 + rng(seed + 1) * 0.24)

  // OA allocation based on state / plant eligibility
  const oaShares: Record<string, number> = {}
  OA_PLANTS.forEach(p => {
    const s = seed + p.id.charCodeAt(0) * 17
    if (p.id === 'pav-sol' && unit.stateId === 'KA')
      oaShares[p.id] = 0.22 + rng(s) * 0.10
    else if (p.id === 'bel-wnd' && unit.stateId === 'KA')
      oaShares[p.id] = 0.10 + rng(s) * 0.08
    else if (p.id === 'raj-sol' && unit.stateId === 'MH')
      oaShares[p.id] = 0.18 + rng(s) * 0.10
    else if (p.id === 'nan-wnd' && (unit.stateId === 'MH' || unit.stateId === 'TS'))
      oaShares[p.id] = 0.11 + rng(s) * 0.08
    else
      oaShares[p.id] = 0
  })

  const oaTotal  = Object.values(oaShares).reduce((s, v) => s + v, 0)
  const btmSh    = 0.12 + rng(seed + 7)  * 0.08
  const bankSh   = 0.08 + rng(seed + 8)  * 0.07
  const gridSh   = Math.max(0.05, 1 - oaTotal - btmSh - bankSh)

  const sources: SourceSettlement[] = [
    ...OA_PLANTS.map(p => ({ id: p.id, mwh: Math.round(total * oaShares[p.id]! * 10) / 10 })),
    { id: 'btm',     mwh: Math.round(total * btmSh  * 10) / 10 },
    { id: 'banking', mwh: Math.round(total * bankSh * 10) / 10 },
    { id: 'grid',    mwh: Math.round(total * gridSh * 10) / 10 },
  ]

  // TOD breakdown per source
  const byTOD: Record<string, { peak: number; normal: number; offpeak: number }> = {}
  sources.forEach(src => {
    const [pk, nm, op] = TOD_PROFILE[src.id] ?? [0.33, 0.34, 0.33]
    byTOD[src.id] = {
      peak:    Math.round(src.mwh * pk * 10) / 10,
      normal:  Math.round(src.mwh * nm * 10) / 10,
      offpeak: Math.round(src.mwh * op * 10) / 10,
    }
  })
  // Consumption TOD
  const [ck, cn, co] = TOD_PROFILE['consumption']!
  byTOD['consumption'] = {
    peak:    Math.round(total * ck * 10) / 10,
    normal:  Math.round(total * cn * 10) / 10,
    offpeak: Math.round(total * co * 10) / 10,
  }

  return { total: Math.round(total * 10) / 10, sources, byTOD }
}

// Historical: generate settlement for each month in range
interface HistMonthRow { label: string; total: number; sources: SourceSettlement[] }

function buildHistorical(unitId: number, fromStr: string, toStr: string): HistMonthRow[] {
  const [fy, fm] = fromStr.split('-').map(Number)
  const [ty, tm] = toStr.split('-').map(Number)
  const rows: HistMonthRow[] = []
  let y = fy ?? 2025, m = fm ?? 8
  const endY = ty ?? 2026, endM = tm ?? 6
  while (y < endY || (y === endY && m <= endM)) {
    const str = `${y}-${String(m).padStart(2, '0')}`
    const d   = buildSettlement(unitId, str)
    rows.push({
      label: (() => { const _d = new Date(y, m - 1, 1); return `${_d.toLocaleDateString('en-IN', { month: 'short' })} '${String(_d.getFullYear()).slice(-2)}`; })(),
      total: d.total,
      sources: d.sources,
    })
    m++; if (m > 12) { m = 1; y++ }
    if (rows.length > 24) break  // cap at 24 months
  }
  return rows
}

// ── Chart data builders ───────────────────────────────────────────────────────
const ALL_LABELS = ['Consumption', ...SOURCES_META.map(s => s.name)]

function makeDefaultData(data: SettlementData) {
  return {
    labels: ALL_LABELS,
    datasets: [{
      label: 'MWh',
      data: [
        data.total,
        ...data.sources.map(s => s.mwh),
      ],
      backgroundColor: [
        CONS_COLOR.bg,
        ...SOURCES_META.map(s => s.bg),
      ],
      borderColor: [
        CONS_COLOR.color,
        ...SOURCES_META.map(s => s.color),
      ],
      borderWidth: 1,
      borderRadius: 3,
    }],
  }
}

function makeTODData(data: SettlementData) {
  const srcIds = ['consumption', ...SOURCES_META.map(s => s.id)]
  return {
    labels: ALL_LABELS,
    datasets: (
      (['peak', 'normal', 'offpeak'] as const).map(zone => ({
        label: TOD_COLORS[zone].label,
        data: srcIds.map(id => data.byTOD[id]?.[zone] ?? 0),
        backgroundColor: TOD_COLORS[zone].bg,
        borderColor:     TOD_COLORS[zone].color,
        borderWidth: 1,
        borderRadius: 2,
      }))
    ),
  }
}

function makeHistData(rows: HistMonthRow[], highlightId: string) {
  return {
    labels: rows.map(r => r.label),
    datasets: SOURCES_META.map(sm => ({
      label: sm.name,
      data: rows.map(r => {
        const src = r.sources.find(s => s.id === sm.id)
        return src?.mwh ?? 0
      }),
      backgroundColor: highlightId === '' || highlightId === sm.id
        ? sm.bg
        : sm.bg.replace(/[\d.]+\)$/, '0.18)'),  // dim non-highlighted
      borderColor: sm.color,
      borderWidth: 1,
      borderRadius: 2,
    })),
  }
}

// ── Shared chart options ───────────────────────────────────────────────────────
const GRID_C = 'rgba(255,255,255,0.06)'
const AXIS_C = 'rgba(255,255,255,0.35)'

function makeOpts(stacked: boolean, xTitle: string) {
  return {
    responsive: true, maintainAspectRatio: false, animation: false as const,
    plugins: {
      legend: { display: stacked, labels: { color: AXIS_C, font: { size: 10 }, boxWidth: 10 } },
      tooltip: {
        mode: 'index' as const, intersect: false,
        backgroundColor: 'rgba(15,22,38,0.95)',
        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
        titleColor: 'rgba(255,255,255,0.9)', bodyColor: 'rgba(255,255,255,0.7)',
        padding: 10,
        callbacks: {
          label: (item: TooltipItem<'bar'>) =>
            `  ${item.dataset.label}: ${(item.parsed.y ?? 0).toFixed(1)} MWh`,
          footer: stacked
            ? (items: TooltipItem<'bar'>[]) => {
                const total = items.reduce((s, i) => s + (i.parsed.y ?? 0), 0)
                return total > 0 ? `  Total: ${total.toFixed(1)} MWh` : ''
              }
            : undefined,
        },
      },
    },
    scales: {
      x: {
        stacked,
        ticks: { color: AXIS_C, font: { size: 10 }, maxRotation: 30 },
        grid:  { display: false },
        title: { display: true, text: xTitle, color: AXIS_C, font: { size: 10 } },
      },
      y: {
        stacked,
        ticks: { color: AXIS_C, font: { size: 10 } },
        grid:  { color: GRID_C },
        title: { display: true, text: 'MWh', color: AXIS_C, font: { size: 10 } },
      },
    },
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function prevMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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
const TOGGLE_BTN = (active: boolean): React.CSSProperties => ({
  padding: '5px 12px', fontSize: 11, cursor: 'pointer', border: 'none',
  background: active ? '#2a78d6' : 'transparent',
  color: active ? '#fff' : 'var(--color-text-muted)',
  fontWeight: active ? 600 : 400,
})

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart9ConsumptionSettlement() {
  const [unitId,     setUnitId]     = useState(1)
  const [month,      setMonth]      = useState(prevMonth)
  const [todSplit,   setTodSplit]   = useState(false)
  const [histMode,   setHistMode]   = useState(false)
  const [histFrom,   setHistFrom]   = useState('2025-08')
  const [histTo,     setHistTo]     = useState(prevMonth)
  const [histFilter, setHistFilter] = useState('')  // '' = all sources

  const unit = UNIT_REFS.find(u => u.id === unitId) ?? UNIT_REFS[0]!
  const data  = useMemo(() => buildSettlement(unitId, month), [unitId, month])
  const hRows = useMemo(
    () => histMode ? buildHistorical(unitId, histFrom, histTo) : [],
    [histMode, unitId, histFrom, histTo],
  )

  const chartData = useMemo(() => {
    if (histMode) return makeHistData(hRows, histFilter)
    return todSplit ? makeTODData(data) : makeDefaultData(data)
  }, [histMode, hRows, histFilter, todSplit, data])

  const chartOpts = useMemo(() => {
    if (histMode) return makeOpts(true, 'Month')
    return makeOpts(todSplit, todSplit ? 'Source / TOD zone' : 'Source')
  }, [histMode, todSplit])

  const [yr, mon] = month.split('-')
  const _md = new Date(+(yr ?? 2026), +(mon ?? 6) - 1, 1)
  const monthLabel = `${_md.toLocaleDateString('en-IN', { month: 'short' })} '${String(_md.getFullYear()).slice(-2)}`

  // Compute %age share for summary chips
  const settlementTotal = data.sources.reduce((s, r) => s + r.mwh, 0)

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Consumption ↔ Settlement Mapping
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            {histMode
              ? `${unit.name} · ${histFrom} – ${histTo} · source composition over time`
              : `${unit.name} · ${monthLabel} · how each source covered this unit's consumption`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Unit selector */}
          <select value={unitId} onChange={e => setUnitId(+e.target.value)} style={SEL}>
            {UNIT_REFS.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          {/* Month picker (hidden in hist mode) */}
          {!histMode && (
            <input type="month" value={month} min="2025-04" max={currentMonth()}
              onChange={e => setMonth(e.target.value)} style={SEL} />
          )}

          {/* TOD-split toggle (hidden in hist mode) */}
          {!histMode && (
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              <button onClick={() => setTodSplit(false)} style={TOGGLE_BTN(!todSplit)}>By source</button>
              <button onClick={() => setTodSplit(true)}  style={TOGGLE_BTN(todSplit)}>TOD split</button>
            </div>
          )}

          {/* Historical mode toggle */}
          <button onClick={() => setHistMode(h => !h)} style={{
            padding: '5px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: histMode ? 'rgba(155,89,182,0.15)' : 'transparent',
            color: histMode ? '#9b59b6' : 'var(--color-text-muted)',
            fontWeight: histMode ? 600 : 400,
          }}>
            {histMode ? '← Settlement' : 'History →'}
          </button>
        </div>
      </div>

      {/* ── Historical controls ── */}
      {histMode && (
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 12, padding: '10px 14px',
          background: 'rgba(155,89,182,0.06)', borderRadius: 8,
          border: '1px solid rgba(155,89,182,0.18)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>Period</span>
          <input type="month" value={histFrom} min="2024-04" max={histTo}
            onChange={e => setHistFrom(e.target.value)} style={SEL} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>to</span>
          <input type="month" value={histTo} min={histFrom} max={currentMonth()}
            onChange={e => setHistTo(e.target.value)} style={SEL} />

          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginLeft: 8 }}>Highlight source</span>
          <select value={histFilter} onChange={e => setHistFilter(e.target.value)} style={{ ...SEL, minWidth: 140 }}>
            <option value="">All sources</option>
            {SOURCES_META.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Settlement summary chips (settlement view only) ── */}
      {!histMode && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {/* Consumption total */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 6,
            background: 'rgba(93,123,168,0.10)', border: '1px solid rgba(93,123,168,0.25)',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: CONS_COLOR.color }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              Total consumption: <strong>{data.total.toFixed(0)} MWh</strong>
            </span>
          </div>

          {/* Per-source chips */}
          {data.sources.filter(s => s.mwh > 0).map(s => {
            const meta = SOURCES_META.find(m => m.id === s.id)!
            const pct  = settlementTotal > 0 ? (s.mwh / settlementTotal * 100).toFixed(0) : '0'
            return (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6,
                background: `${meta.color}18`, border: `1px solid ${meta.color}44`,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: meta.color }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {meta.name}: <strong style={{ color: meta.color }}>{s.mwh.toFixed(0)} MWh ({pct}%)</strong>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Chart ── */}
      <div style={{ height: histMode ? 340 : 320 }}>
        <Bar data={chartData} options={chartOpts} />
      </div>

      {/* ── TOD info banner ── */}
      {!histMode && todSplit && (
        <div style={{
          marginTop: 10, padding: '7px 12px', borderRadius: 6,
          background: 'rgba(42,120,214,0.06)', border: '1px solid rgba(42,120,214,0.18)',
          fontSize: 11, color: 'var(--color-text-muted)',
          display: 'flex', gap: 16, flexWrap: 'wrap',
        }}>
          {(Object.entries(TOD_COLORS) as [string, { color: string; label: string }][]).map(([k, v]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: v.color, fontWeight: 700 }}>●</span> {v.label}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
            BESCOM Karnataka TOD zones · source profiles reflect typical generation timing
          </span>
        </div>
      )}

      {/* ── Settlement breakdown table (settlement view) ── */}
      {!histMode && (
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Source', 'Plant / Type', 'MWh', 'Share (%)',
                  ...(todSplit ? ['Peak (MWh)', 'Normal (MWh)', 'Off-peak (MWh)'] : [])
                ].map(h => (
                  <th key={h} style={{
                    padding: '6px 10px', textAlign: h === 'Source' || h === 'Plant / Type' ? 'left' : 'right',
                    color: 'var(--color-text-muted)', fontWeight: 600,
                    borderBottom: '1px solid var(--color-border)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sources.filter(s => s.mwh > 0).map((s, i) => {
                const meta   = SOURCES_META.find(m => m.id === s.id)!
                const oaMeta = OA_PLANTS.find(p => p.id === s.id)
                const pct    = settlementTotal > 0 ? (s.mwh / settlementTotal * 100).toFixed(1) : '0'
                const tod    = data.byTOD[s.id]
                return (
                  <tr key={s.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                    <td style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{meta.name}</span>
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--color-text-muted)' }}>
                      {oaMeta ? `${oaMeta.type} OA · ${oaMeta.state}` : s.id === 'btm' ? 'Rooftop Solar' : s.id === 'banking' ? 'Banking account' : 'DISCOM grid'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: meta.color, fontWeight: 600 }}>{s.mwh.toFixed(1)}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--color-text-muted)' }}>{pct}%</td>
                    {todSplit && tod && (
                      <>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: TOD_COLORS.peak.color }}>{tod.peak.toFixed(1)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: TOD_COLORS.normal.color }}>{tod.normal.toFixed(1)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: TOD_COLORS.offpeak.color }}>{tod.offpeak.toFixed(1)}</td>
                      </>
                    )}
                  </tr>
                )
              })}
              {/* Total row */}
              <tr style={{ borderTop: '1px solid var(--color-border)', fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: '6px 10px', color: 'var(--color-text-secondary)' }}>Total settled</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--color-text-primary)' }}>{settlementTotal.toFixed(1)}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--color-text-primary)' }}>100%</td>
                {todSplit && (() => {
                  const tot = data.sources.reduce(
                    (acc, s) => {
                      const t = data.byTOD[s.id]
                      return { peak: acc.peak + (t?.peak ?? 0), normal: acc.normal + (t?.normal ?? 0), offpeak: acc.offpeak + (t?.offpeak ?? 0) }
                    },
                    { peak: 0, normal: 0, offpeak: 0 },
                  )
                  return (
                    <>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: TOD_COLORS.peak.color }}>{tot.peak.toFixed(1)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: TOD_COLORS.normal.color }}>{tot.normal.toFixed(1)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: TOD_COLORS.offpeak.color }}>{tot.offpeak.toFixed(1)}</td>
                    </>
                  )
                })()}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
