/**
 * Chart8SettledConsumption.tsx — Graph 8
 * Settled Consumption by Source  (State → Unit)
 *
 * L1: State-wise consumption stacked by settled source (OA / BTM / Grid).
 * L2: Click a state bar → unit-level breakdown within that state.
 * Toggle: pre-banking (shows gross Grid + Banking credit visible on top)
 *       ↔ post-banking default (Grid already net of banking — effect hidden).
 * Period: prev calendar month default; month picker.
 * Y = MWh   X = state / unit
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

// ── Unit reference data ───────────────────────────────────────────────────────
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

const STATES_META = [
  { id: 'KA', name: 'Karnataka'    },
  { id: 'MH', name: 'Maharashtra'  },
  { id: 'TS', name: 'Telangana'    },
]

// ── RNG ───────────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ── Data generation ───────────────────────────────────────────────────────────
interface UnitRow {
  unitId:   number
  unitName: string
  stateId:  string
  oa:       number  // MWh
  btm:      number  // MWh
  gridNet:  number  // MWh (post-banking net grid)
  banking:  number  // MWh credit (positive = benefit drawn from bank)
  // pre-banking gross grid = gridNet + banking
}

function buildData(monthStr: string): UnitRow[] {
  const [yr, mon] = monthStr.split('-').map(Number)
  const mSeed = (yr ?? 2026) * 100 + (mon ?? 6)

  return UNIT_REFS.map(u => {
    const s = u.id * 10000 + mSeed
    const total     = u.cd * 0.28 * (0.88 + rng(s + 2) * 0.24)  // MWh/month
    const oaSh      = 0.28 + rng(s + 3) * 0.12   // 28-40%
    const btmSh     = 0.13 + rng(s + 4) * 0.10   // 13-23%
    const bankingSh = 0.08 + rng(s + 5) * 0.10   // 8-18% credit drawn
    const gridNetSh = Math.max(0.05, 1 - oaSh - btmSh - bankingSh)

    return {
      unitId:   u.id,
      unitName: u.name,
      stateId:  u.stateId,
      oa:       Math.round(total * oaSh      * 10) / 10,
      btm:      Math.round(total * btmSh     * 10) / 10,
      gridNet:  Math.round(total * gridNetSh * 10) / 10,
      banking:  Math.round(total * bankingSh * 10) / 10,
    }
  })
}

// ── Aggregate by state ────────────────────────────────────────────────────────
interface StateRow {
  id:      string
  name:    string
  oa:      number
  btm:     number
  gridNet: number
  banking: number
}

function byState(rows: UnitRow[]): StateRow[] {
  return STATES_META.map(st => {
    const units = rows.filter(u => u.stateId === st.id)
    return {
      id:      st.id,
      name:    st.name,
      oa:      Math.round(units.reduce((s, u) => s + u.oa,      0) * 10) / 10,
      btm:     Math.round(units.reduce((s, u) => s + u.btm,     0) * 10) / 10,
      gridNet: Math.round(units.reduce((s, u) => s + u.gridNet, 0) * 10) / 10,
      banking: Math.round(units.reduce((s, u) => s + u.banking, 0) * 10) / 10,
    }
  })
}

// ── Chart dataset builder ─────────────────────────────────────────────────────
type BarRow = { name: string; oa: number; btm: number; gridNet: number; banking: number }

function buildChartData(rows: BarRow[], mode: 'pre' | 'post') {
  const base = [
    { label: 'OA',              data: rows.map(r => r.oa),      bg: 'rgba(42,120,214,0.82)',  border: '#2a78d6' },
    { label: 'BTM',             data: rows.map(r => r.btm),     bg: 'rgba(27,175,122,0.82)',  border: '#1baf7a' },
    { label: mode === 'post' ? 'Grid (net of banking)' : 'Grid (net)',
                                data: rows.map(r => r.gridNet),  bg: 'rgba(235,104,52,0.82)',  border: '#eb6834' },
  ]
  if (mode === 'pre') {
    base.push({ label: 'Banking credit ↑', data: rows.map(r => r.banking), bg: 'rgba(155,89,182,0.82)', border: '#9b59b6' })
  }
  return {
    labels: rows.map(r => r.name),
    datasets: base.map(d => ({ ...d, backgroundColor: d.bg, borderColor: d.border, borderWidth: 1, borderRadius: 3 })),
  }
}

// ── Shared chart options factory ──────────────────────────────────────────────
const GRID_C = 'rgba(255,255,255,0.06)'
const AXIS_C = 'rgba(255,255,255,0.35)'

function makeOpts(
  xLabel: string,
  mode: 'pre' | 'post',
  onClickFn?: (_: object, els: { index: number }[]) => void,
) {
  return {
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
          label: (item: TooltipItem<'bar'>) => {
            const v = (item.parsed.y ?? 0).toFixed(1)
            const extra = item.dataset.label === 'Banking credit ↑'
              ? '  (banked energy drawn — deducted in post-banking view)'
              : ''
            return `  ${item.dataset.label}: ${v} MWh${extra}`
          },
          footer: (items: TooltipItem<'bar'>[]) => {
            const total = items.reduce((s, i) => s + (i.parsed.y ?? 0), 0)
            const label = mode === 'pre' ? 'Gross (pre-banking)' : 'Settled (post-banking)'
            return `  Total ${label}: ${total.toFixed(1)} MWh`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: AXIS_C, font: { size: 11 }, maxRotation: 30 },
        grid: { display: false },
        title: { display: true, text: xLabel, color: AXIS_C, font: { size: 10 } },
      },
      y: {
        stacked: true,
        ticks: { color: AXIS_C, font: { size: 10 } },
        grid: { color: GRID_C },
        title: { display: true, text: 'MWh', color: AXIS_C, font: { size: 10 } },
      },
    },
    onClick: onClickFn,
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart8SettledConsumption() {
  const [mode,       setMode]       = useState<'pre' | 'post'>('post')
  const [month,      setMonth]      = useState(prevMonth)
  const [drillState, setDrillState] = useState<string | null>(null)

  const allData    = useMemo(() => buildData(month), [month])
  const stateRows  = useMemo(() => byState(allData),  [allData])

  // L1 chart data
  const l1Rows: BarRow[] = stateRows.map(s => ({ name: s.name, oa: s.oa, btm: s.btm, gridNet: s.gridNet, banking: s.banking }))
  const l1Data = useMemo(() => buildChartData(l1Rows, mode), [l1Rows, mode])
  const l1Opts = useMemo(() => makeOpts('State', mode, (_: object, els: { index: number }[]) => {
    if (els.length > 0) {
      const sid = STATES_META[els[0].index]?.id ?? null
      setDrillState(sid)
    }
  }), [mode])

  // L2 chart data (units in selected state)
  const unitRows: BarRow[] = useMemo(() => {
    if (!drillState) return []
    return allData
      .filter(u => u.stateId === drillState)
      .map(u => ({ name: u.unitName, oa: u.oa, btm: u.btm, gridNet: u.gridNet, banking: u.banking }))
  }, [allData, drillState])
  const l2Data = useMemo(() => buildChartData(unitRows, mode), [unitRows, mode])
  const l2Opts = useMemo(() => makeOpts('Unit', mode), [mode])

  const curStateName = STATES_META.find(s => s.id === drillState)?.name ?? ''

  // Month display label
  const [yr, mon] = month.split('-')
  const _d = new Date(+yr, +(mon ?? 1) - 1, 1)
  const monthLabel = `${_d.toLocaleDateString('en-IN', { month: 'short' })} '${String(_d.getFullYear()).slice(-2)}`

  // Banking totals for summary badge
  const totalBanking = stateRows.reduce((s, r) => s + r.banking, 0)

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Settled Consumption by Source {drillState ? `— ${curStateName}` : '— States'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            {mode === 'post'
              ? 'Post-banking · grid shown net of banking credits · banking effect hidden'
              : 'Pre-banking · gross grid shown · banking credit visible as separate segment'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Month picker */}
          <input
            type="month" value={month} min="2025-04" max={currentMonth()}
            onChange={e => setMonth(e.target.value)}
            style={SEL}
          />
          {/* Pre/Post toggle */}
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            {(['post', 'pre'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: '5px 12px', fontSize: 11, cursor: 'pointer', border: 'none',
                background: mode === m ? '#2a78d6' : 'transparent',
                color: mode === m ? '#fff' : 'var(--color-text-muted)',
                fontWeight: mode === m ? 600 : 400,
              }}>
                {m === 'post' ? 'Post-banking' : 'Pre-banking'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Banking summary badge (pre mode) */}
      {mode === 'pre' && (
        <div style={{
          marginBottom: 12, padding: '7px 12px', borderRadius: 6,
          background: 'rgba(155,89,182,0.10)', border: '1px solid rgba(155,89,182,0.30)',
          fontSize: 11, color: 'rgba(155,89,182,0.9)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span>●</span>
          <span>
            Banking credits drawn this month: <strong>{totalBanking.toFixed(0)} MWh</strong> (purple segment) —
            post-banking view nets this against grid drawl
          </span>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          ['OA (Open Access)',  '#2a78d6'],
          ['BTM (Behind-meter)', '#1baf7a'],
          [mode === 'post' ? 'Grid (net)' : 'Grid (gross)', '#eb6834'],
          ...(mode === 'pre' ? [['Banking credit ↑', '#9b59b6'] as [string, string]] : []),
        ].map(([lbl, col]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: col }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{lbl}</span>
          </div>
        ))}
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 'auto', opacity: 0.7 }}>
          {monthLabel} · {mode === 'pre' ? 'gross (pre-banking)' : 'settled (post-banking)'}
        </span>
      </div>

      {/* ── L1: State view ── */}
      {!drillState && (
        <>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 8, opacity: 0.7 }}>
            Click a state bar to drill into units ↓
          </div>
          <div style={{ height: 320 }}>
            <Bar data={l1Data} options={l1Opts} />
          </div>

          {/* State summary table */}
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['State', 'OA (MWh)', 'BTM (MWh)', 'Grid net (MWh)', ...(mode === 'pre' ? ['Banking (MWh)'] : []), 'Total (MWh)'].map(h => (
                    <th key={h} style={{ padding: '6px 12px', textAlign: h === 'State' ? 'left' : 'right', color: 'var(--color-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stateRows.map((r, i) => {
                  const total = r.oa + r.btm + r.gridNet + (mode === 'pre' ? r.banking : 0)
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <td style={{ padding: '6px 12px', color: 'var(--color-text-secondary)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => setDrillState(r.id)}>{r.name}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', color: '#74b0f5' }}>{r.oa.toFixed(0)}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', color: '#1baf7a' }}>{r.btm.toFixed(0)}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', color: '#eb6834' }}>{r.gridNet.toFixed(0)}</td>
                      {mode === 'pre' && <td style={{ padding: '6px 12px', textAlign: 'right', color: '#9b59b6' }}>{r.banking.toFixed(0)}</td>}
                      <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 600 }}>{total.toFixed(0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── L2: Unit view ── */}
      {drillState && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button onClick={() => setDrillState(null)} style={{
              padding: '5px 12px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
            }}>
              ← All States
            </button>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {curStateName} · {unitRows.length} units
            </span>
          </div>
          <div style={{ height: 340 }}>
            <Bar data={l2Data} options={l2Opts} />
          </div>

          {/* Unit table */}
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Unit', 'OA (MWh)', 'BTM (MWh)', 'Grid net (MWh)', ...(mode === 'pre' ? ['Banking (MWh)'] : []), 'Total (MWh)'].map(h => (
                    <th key={h} style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unitRows.map((r, i) => {
                  const total = r.oa + r.btm + r.gridNet + (mode === 'pre' ? r.banking : 0)
                  return (
                    <tr key={r.name} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <td style={{ padding: '5px 10px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{r.name}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: '#74b0f5' }}>{r.oa.toFixed(1)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: '#1baf7a' }}>{r.btm.toFixed(1)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: '#eb6834' }}>{r.gridNet.toFixed(1)}</td>
                      {mode === 'pre' && <td style={{ padding: '5px 10px', textAlign: 'right', color: '#9b59b6' }}>{r.banking.toFixed(1)}</td>}
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 600 }}>{total.toFixed(1)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
