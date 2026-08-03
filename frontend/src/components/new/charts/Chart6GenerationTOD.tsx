/**
 * Chart6GenerationTOD.tsx — Graph 6
 * Portfolio Generation by TOD × Source  (3-level drill)
 *
 * L1 (Portfolio)  – stacked bar by normalised TOD bucket (0-6 / 6-9 / 9-12 / 12-16 / 16-20 / 20-24)
 *                   sources: OA · BTM · Grid   Click a bucket → L2
 * L2 (State)      – native TOD slots for selected state; unit × source stacks
 *                   Click a state bar → L3
 * L3 (Unit)       – historical generation for selected unit; period: 7d / 30d / monthly / annual
 *
 * Y = MWh   X = TOD bucket / slot / time
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

// ── Colours ───────────────────────────────────────────────────────────────────
const OA_COLOR   = '#2a78d6'
const BTM_COLOR  = '#1baf7a'
const GRID_COLOR = '#eb6834'
const OA_BG      = 'rgba(42,120,214,0.82)'
const BTM_BG     = 'rgba(27,175,122,0.82)'
const GRID_BG    = 'rgba(235,104,52,0.82)'

// ── TOD Buckets (normalised, for L1 portfolio) ────────────────────────────────
const BUCKETS = [
  { id: '0-6',   label: '0–6h',   name: 'Night I'   },
  { id: '6-9',   label: '6–9h',   name: 'Morning'   },
  { id: '9-12',  label: '9–12h',  name: 'Mid-day'   },
  { id: '12-16', label: '12–16h', name: 'Afternoon' },
  { id: '16-20', label: '16–20h', name: 'Evening'   },
  { id: '20-24', label: '20–24h', name: 'Night II'  },
]

// ── States (C9 portfolio) ─────────────────────────────────────────────────────
const STATES = [
  {
    id: 'KA', name: 'Karnataka', share: 0.60,
    todSlots: [
      { id: 'offpeak', label: 'Off-peak (22–6h)',       share: 0.25, srcOa: 0.05, srcBtm: 0.00, srcGrid: 0.95 },
      { id: 'normal',  label: 'Normal (10–18h)',         share: 0.40, srcOa: 0.42, srcBtm: 0.35, srcGrid: 0.23 },
      { id: 'peak',    label: 'Peak (6–10 & 18–22h)',    share: 0.35, srcOa: 0.28, srcBtm: 0.12, srcGrid: 0.60 },
    ],
    units: [
      { id:  1, name: 'Old Airport Rd'  }, { id:  2, name: 'Electronic City' },
      { id:  3, name: 'Whitefield'      }, { id:  4, name: 'Sahakar Nagar'   },
      { id:  5, name: 'Malleswaram'     }, { id:  6, name: 'Thanisandra'     },
      { id:  7, name: 'HRBR Unit'       }, { id:  8, name: 'Bellandur'       },
      { id:  9, name: 'Sarjapura'       }, { id: 10, name: 'Kanakapura'      },
      { id: 11, name: 'Bellandur Corp'  },
    ],
  },
  {
    id: 'MH', name: 'Maharashtra', share: 0.25,
    todSlots: [
      { id: 'offpeak', label: 'Off-peak (22–6h)',     share: 0.22, srcOa: 0.05, srcBtm: 0.00, srcGrid: 0.95 },
      { id: 'normal',  label: 'Normal (8–18h)',        share: 0.42, srcOa: 0.40, srcBtm: 0.30, srcGrid: 0.30 },
      { id: 'peak',    label: 'Peak (6–8 & 18–22h)',   share: 0.36, srcOa: 0.25, srcBtm: 0.10, srcGrid: 0.65 },
    ],
    units: [
      { id: 12, name: 'Pune Unit 1' }, { id: 13, name: 'Pune Unit 2' },
      { id: 14, name: 'Nashik'      }, { id: 15, name: 'Aurangabad'  },
    ],
  },
  {
    id: 'TS', name: 'Telangana', share: 0.15,
    todSlots: [
      { id: 'offpeak', label: 'Off-peak (23–6h)',       share: 0.22, srcOa: 0.05, srcBtm: 0.00, srcGrid: 0.95 },
      { id: 'normal',  label: 'Normal (9–17h)',          share: 0.40, srcOa: 0.38, srcBtm: 0.28, srcGrid: 0.34 },
      { id: 'peak',    label: 'Peak (6–9 & 17–23h)',     share: 0.38, srcOa: 0.22, srcBtm: 0.08, srcGrid: 0.70 },
    ],
    units: [
      { id: 16, name: 'Hyderabad 1' }, { id: 17, name: 'Hyderabad 2' },
    ],
  },
]

// ── L1 base data: portfolio MWh/day by TOD bucket ─────────────────────────────
const L1: Record<string, { oa: number; btm: number; grid: number }> = {
  '0-6':   { oa:  1.8, btm:  0.0, grid: 14.2 },
  '6-9':   { oa:  5.5, btm:  3.5, grid:  5.0 },
  '9-12':  { oa:  9.0, btm:  6.8, grid:  2.2 },
  '12-16': { oa: 10.5, btm:  7.5, grid:  1.0 },
  '16-20': { oa:  5.0, btm:  2.8, grid:  6.2 },
  '20-24': { oa:  2.0, btm:  0.0, grid: 15.0 },
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ── L2 data: state breakdown of a bucket ─────────────────────────────────────
function genL2(bucketId: string) {
  const base = L1[bucketId] ?? { oa: 0, btm: 0, grid: 0 }
  return STATES.map((st, si) => ({
    name: st.name,
    id:   st.id,
    oa:   Math.round(base.oa   * st.share * (0.88 + rng(si * 11 + 1) * 0.24) * 10) / 10,
    btm:  Math.round(base.btm  * st.share * (0.88 + rng(si * 11 + 2) * 0.24) * 10) / 10,
    grid: Math.round(base.grid * st.share * (0.88 + rng(si * 11 + 3) * 0.24) * 10) / 10,
  }))
}

// ── L2b: state's native TOD slot breakdown (shown once state selected) ────────
function genNativeTOD(stateId: string) {
  const st = STATES.find(s => s.id === stateId)!
  const totalMwh = (L1['0-6'].oa + L1['0-6'].btm + L1['0-6'].grid +
    L1['6-9'].oa + L1['6-9'].btm + L1['6-9'].grid +
    L1['9-12'].oa + L1['9-12'].btm + L1['9-12'].grid +
    L1['12-16'].oa + L1['12-16'].btm + L1['12-16'].grid +
    L1['16-20'].oa + L1['16-20'].btm + L1['16-20'].grid +
    L1['20-24'].oa + L1['20-24'].btm + L1['20-24'].grid) * st.share

  return st.todSlots.map(slot => {
    const slotTotal = totalMwh * slot.share
    return {
      label: slot.label,
      oa:    Math.round(slotTotal * slot.srcOa   * 10) / 10,
      btm:   Math.round(slotTotal * slot.srcBtm  * 10) / 10,
      grid:  Math.round(slotTotal * slot.srcGrid * 10) / 10,
    }
  })
}

// ── L3 data: unit time series ─────────────────────────────────────────────────
interface L3Pt { label: string; oa: number; btm: number; grid: number }
type L3Period = '7d' | '30d' | 'monthly' | 'annual'

function genL3(unitId: number, period: L3Period): L3Pt[] {
  const base    = 3.0 + rng(unitId * 17) * 2.0   // 3–5 MWh/day baseline
  const oaShare = 0.35 + rng(unitId * 23) * 0.15
  const btmShare = 0.20 + rng(unitId * 31) * 0.10
  const gShare  = Math.max(0.05, 1 - oaShare - btmShare)

  function dayPt(d: number, baseScale = 1): L3Pt {
    const today = new Date()
    const nDays = period === '30d' ? 29 : 6
    const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate() - nDays + d)
    const label = ref.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    const n = base * (0.80 + rng(unitId * 100 + d) * 0.40) * baseScale
    return {
      label,
      oa:   +(n * oaShare ).toFixed(1),
      btm:  +(n * btmShare).toFixed(1),
      grid: +(n * gShare  ).toFixed(1),
    }
  }

  if (period === '7d')  return Array.from({ length:  7 }, (_, d) => dayPt(d))
  if (period === '30d') return Array.from({ length: 30 }, (_, d) => dayPt(d))

  if (period === 'monthly') {
    return Array.from({ length: 12 }, (_, m) => {
      const today = new Date()
      // 12 months ending at previous complete month
      const ref = new Date(today.getFullYear(), today.getMonth() - 12 + m, 1)
      const label = `${ref.toLocaleDateString('en-IN', { month: 'short' })} '${String(ref.getFullYear()).slice(-2)}`
      const days  = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
      const n = base * days * (0.85 + rng(unitId * 200 + m) * 0.30)
      return { label, oa:+(n*oaShare).toFixed(0), btm:+(n*btmShare).toFixed(0), grid:+(n*gShare).toFixed(0) }
    })
  }

  // annual (5 FY)
  return Array.from({ length: 5 }, (_, y) => ({
    label: `FY ${2021+y}-${String(2022+y).slice(2)}`,
    oa:   +(base * 365 * (0.90 + rng(unitId*300+y)*0.20) * oaShare ).toFixed(0),
    btm:  +(base * 365 * (0.90 + rng(unitId*300+y)*0.20) * btmShare).toFixed(0),
    grid: +(base * 365 * (0.90 + rng(unitId*300+y)*0.20) * gShare  ).toFixed(0),
  }))
}

// ── Shared chart options factory ──────────────────────────────────────────────
function makeBarOpts(
  yLabel: string,
  tooltipExtra: (item: TooltipItem<'bar'>) => string[],
  onClickFn?: (_: object, elements: { index: number }[]) => void,
) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(15,22,38,0.95)',
        borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
        titleColor: 'rgba(255,255,255,0.9)', bodyColor: 'rgba(255,255,255,0.7)',
        padding: 10,
        callbacks: {
          label: (item: TooltipItem<'bar'>) => {
            const v = (item.parsed.y ?? 0).toFixed(1)
            return [`  ${item.dataset.label}: ${v} MWh`, ...tooltipExtra(item)]
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 11 }, maxRotation: 30 },
        grid: { display: false },
      },
      y: {
        stacked: true,
        ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.06)' },
        title: { display: true, text: yLabel, color: 'rgba(255,255,255,0.35)', font: { size: 10 } },
      },
    },
    onClick: onClickFn,
    cursor: onClickFn ? 'pointer' : undefined,
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
const PILL_BASE: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
  border: '1px solid var(--color-border)', background: 'transparent',
  color: 'var(--color-text-muted)',
}
const ACTIVE_PILL: React.CSSProperties = {
  ...PILL_BASE,
  background: 'rgba(42,120,214,0.20)',
  border: '1px solid #2a78d6',
  color: '#74b0f5', fontWeight: 600,
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Crumb({ items, onNav }: { items: string[]; onNav: (idx: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 14 }}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          <span
            onClick={() => onNav(i)}
            style={{ cursor: i < items.length - 1 ? 'pointer' : 'default', color: i < items.length - 1 ? '#74b0f5' : 'var(--color-text-secondary)', fontWeight: i === items.length - 1 ? 600 : 400 }}
          >{item}</span>
          {i < items.length - 1 && <span style={{ opacity: 0.4 }}>›</span>}
        </React.Fragment>
      ))}
    </div>
  )
}

// ── Source legend ─────────────────────────────────────────────────────────────
function SrcLegend() {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {[['OA (Open Access)', OA_COLOR], ['BTM (Behind-meter)', BTM_COLOR], ['Grid', GRID_COLOR]].map(([lbl, col]) => (
        <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, background: col, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{lbl}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Chart6GenerationTOD() {
  const [level,    setLevel]    = useState<1 | 2 | 3>(1)
  const [bucketId, setBucketId] = useState('9-12')
  const [stateId,  setStateId]  = useState('KA')
  const [unitId,   setUnitId]   = useState(1)
  const [period,   setPeriod]   = useState<L3Period>('30d')

  const curState = STATES.find(s => s.id === stateId)!
  const curBucket = BUCKETS.find(b => b.id === bucketId)!

  const l1ChartData = useMemo(() => ({
    labels: BUCKETS.map(b => b.label),
    datasets: [
      { label: 'OA',   data: BUCKETS.map(b => L1[b.id]?.oa   ?? 0), backgroundColor: OA_BG,   borderRadius: 3 },
      { label: 'BTM',  data: BUCKETS.map(b => L1[b.id]?.btm  ?? 0), backgroundColor: BTM_BG,  borderRadius: 3 },
      { label: 'Grid', data: BUCKETS.map(b => L1[b.id]?.grid ?? 0), backgroundColor: GRID_BG, borderRadius: 3 },
    ],
  }), [])

  const l2ChartData = useMemo(() => {
    const rows = genL2(bucketId)
    return {
      labels: rows.map(r => r.name),
      datasets: [
        { label: 'OA',   data: rows.map(r => r.oa),   backgroundColor: OA_BG,   borderRadius: 3 },
        { label: 'BTM',  data: rows.map(r => r.btm),  backgroundColor: BTM_BG,  borderRadius: 3 },
        { label: 'Grid', data: rows.map(r => r.grid),  backgroundColor: GRID_BG, borderRadius: 3 },
      ],
    }
  }, [bucketId])

  // Native TOD breakdown for selected state
  const nativeTODData = useMemo(() => {
    const rows = genNativeTOD(stateId)
    return {
      labels: rows.map(r => r.label),
      datasets: [
        { label: 'OA',   data: rows.map(r => r.oa),   backgroundColor: OA_BG,   borderRadius: 3 },
        { label: 'BTM',  data: rows.map(r => r.btm),  backgroundColor: BTM_BG,  borderRadius: 3 },
        { label: 'Grid', data: rows.map(r => r.grid),  backgroundColor: GRID_BG, borderRadius: 3 },
      ],
    }
  }, [stateId])

  const l3ChartData = useMemo(() => {
    const pts = genL3(unitId, period)
    return {
      labels: pts.map(p => p.label),
      datasets: [
        { label: 'OA',   data: pts.map(p => p.oa),   backgroundColor: OA_BG,   borderRadius: 2 },
        { label: 'BTM',  data: pts.map(p => p.btm),  backgroundColor: BTM_BG,  borderRadius: 2 },
        { label: 'Grid', data: pts.map(p => p.grid),  backgroundColor: GRID_BG, borderRadius: 2 },
      ],
    }
  }, [unitId, period])

  // Chart options per level
  const l1Opts = useMemo(() => makeBarOpts(
    'MWh (daily)',
    () => [],
    (_: object, els: { index: number }[]) => {
      if (els.length > 0) {
        const bkt = BUCKETS[els[0].index]
        if (bkt) { setBucketId(bkt.id); setLevel(2) }
      }
    },
  ), [])

  const l2Opts = useMemo(() => makeBarOpts(
    'MWh (daily)',
    () => [],
    (_: object, els: { index: number }[]) => {
      if (els.length > 0) {
        const st = STATES[els[0].index]
        if (st) {
          setStateId(st.id)
          setUnitId(st.units[0]?.id ?? 1)
          setLevel(3)
        }
      }
    },
  ), [])

  const nativeOpts = useMemo(() => makeBarOpts('MWh (daily)', () => []), [])
  const l3Opts     = useMemo(() => makeBarOpts(period === 'annual' ? 'MWh (annual)' : period === 'monthly' ? 'MWh (monthly)' : 'MWh (daily)', () => []), [period])

  // Breadcrumb navigation
  const crumbs: string[] = level === 1
    ? ['Portfolio']
    : level === 2
    ? ['Portfolio', curBucket.name + ' (' + curBucket.label + ')']
    : ['Portfolio', curBucket.name, curState.name]

  function onNav(idx: number) {
    if (idx === 0) setLevel(1)
    if (idx === 1 && level === 3) setLevel(2)
  }

  const PERIODS: { id: L3Period; label: string }[] = [
    { id: '7d', label: 'Last 7d' }, { id: '30d', label: 'Last 30d' },
    { id: 'monthly', label: 'Monthly' }, { id: 'annual', label: 'Annual' },
  ]

  return (
    <div style={CARD}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Portfolio Generation by TOD × Source
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            {level === 1 ? 'Normalised TOD buckets · click a bar to drill into state breakdown'
              : level === 2 ? `TOD ${curBucket.label} · click a state bar to drill into unit detail`
              : `${curState.name} · native TOD slots + unit time series`}
          </div>
        </div>
        {level === 3 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={unitId} onChange={e => setUnitId(+e.target.value)} style={{ ...SEL, minWidth: 140 }}>
              {curState.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 3 }}>
              {PERIODS.map(p => (
                <button key={p.id} onClick={() => setPeriod(p.id)} style={period === p.id ? ACTIVE_PILL : PILL_BASE}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      {level > 1 && <Crumb items={crumbs} onNav={onNav} />}

      <SrcLegend />

      {/* ── L1 — Portfolio ── */}
      {level === 1 && (
        <>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 8, opacity: 0.7 }}>
            Click any TOD bucket to drill into state breakdown ↓
          </div>
          <div style={{ height: 300 }}>
            <Bar data={l1ChartData} options={l1Opts} />
          </div>
        </>
      )}

      {/* ── L2 — State comparison in selected bucket ── */}
      {level === 2 && (
        <>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 6, opacity: 0.7 }}>
            Click a state bar to drill into native TOD slots + unit detail ↓
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 300 }}>
            {/* State comparison for selected bucket */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                States in {curBucket.label}
              </div>
              <div style={{ height: 270 }}>
                <Bar data={l2ChartData} options={l2Opts} />
              </div>
            </div>
            {/* Native TOD slots for currently highlighted state */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  {curState.name} — native TOD slots
                </div>
                <select value={stateId} onChange={e => setStateId(e.target.value)} style={{ ...SEL, padding: '2px 6px', fontSize: 10 }}>
                  {STATES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ height: 270 }}>
                <Bar data={nativeTODData} options={nativeOpts} />
              </div>
            </div>
          </div>
          <button
            onClick={() => { setUnitId(curState.units[0]?.id ?? 1); setLevel(3) }}
            style={{
              marginTop: 12, padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              background: 'rgba(42,120,214,0.15)', border: '1px solid #2a78d6', color: '#74b0f5',
            }}
          >
            {curState.name} — unit detail →
          </button>
        </>
      )}

      {/* ── L3 — Unit time series ── */}
      {level === 3 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {curState.units.find(u => u.id === unitId)?.name ?? ''} — generation by source
              </div>
              <div style={{ height: 300 }}>
                <Bar data={l3ChartData} options={l3Opts} />
              </div>
            </div>

            {/* Native TOD sidebar */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {curState.name} native TOD
              </div>
              <div style={{ height: 300 }}>
                <Bar data={nativeTODData} options={nativeOpts} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 10 }}>
        Source split: OA = Open Access PPA · BTM = Behind-the-meter rooftop · Grid = DISCOM drawl · Y = MWh
      </div>
    </div>
  )
}
