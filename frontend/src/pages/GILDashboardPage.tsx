/**
 * GILDashboardPage.tsx
 * ====================
 * GIL (Wind + Solar, Maharashtra, MSEDCL) dashboard.
 * Shares the same layout, WidgetLibrary sidebar, drag-and-drop canvas,
 * lock/unlock, chart-type switching, and upload modal as C9 DashboardPage.
 * Only the widget registry, widget content, and footer text differ.
 */
import React, { useState, useRef, useEffect } from 'react'
import WidgetLibrary from '../components/layout/WidgetLibrary'
import UploadModal   from '../components/layout/UploadModal'
import {
  GIL_WIDGET_REGISTRY, GIL_WIDGET_MAP, GIL_CATEGORIES, GIL_CATEGORY_ICONS,
  getSizeLabel,
} from '../components/widgets/gilWidgetRegistry'
import GILKpi             from '../components/gil/GILKpi'
import GILDailyGen        from '../components/gil/GILDailyGen'
import GILMonthlySummary  from '../components/gil/GILMonthlySummary'
import GILWindSolarSplit  from '../components/gil/GILWindSolarSplit'
import GILGenLosses       from '../components/gil/GILGenLosses'
import GILDiscomBill      from '../components/gil/GILDiscomBill'
import GILRECosts         from '../components/gil/GILRECosts'
import GILCostComparison  from '../components/gil/GILCostComparison'
import GILSavingsHeatmap  from '../components/gil/GILSavingsHeatmap'
import GILTodAnalysis     from '../components/gil/GILTodAnalysis'
import GILBanking         from '../components/gil/GILBanking'
import GILTurbinePerf     from '../components/gil/GILTurbinePerf'
import GILPerfMetrics     from '../components/gil/GILPerfMetrics'

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'table'

export interface GILDashboardFilters {
  month: string
  todSlot: string
  financialYear: string
}

// ── Chart-type options per widget ─────────────────────────────────────────────
const GIL_CHART_TYPES: Record<string, ChartType[]> = {
  gil_kpi:             ['table'],
  gil_daily_gen:       ['bar', 'line', 'area'],
  gil_monthly_summary: ['bar', 'line'],
  gil_wind_solar_split:['bar', 'pie', 'doughnut'],
  gil_gen_losses:      ['bar', 'line'],
  gil_discom_bill:     ['pie', 'doughnut', 'bar'],
  gil_re_costs:        ['doughnut', 'bar'],
  gil_cost_comparison: ['bar', 'line'],
  gil_savings_heatmap: ['bar', 'table'],
  gil_tod_analysis:    ['bar', 'pie', 'doughnut'],
  gil_banking:         ['bar', 'table'],
  gil_turbine_perf:    ['bar', 'table'],
  gil_perf_metrics:    ['table'],
}

const TYPE_ICONS: Record<ChartType, string>  = { bar:'B', line:'L', area:'A', pie:'P', doughnut:'D', table:'T' }
const TYPE_LABELS: Record<ChartType, string> = { bar:'Bar', line:'Line', area:'Area', pie:'Pie', doughnut:'Donut', table:'Table' }

// MSEDCL 3-slot TOD
const GIL_TOD_SLOTS = [
  { value: '',         label: 'All TOD Slots' },
  { value: 'PEAK',     label: 'Peak (06-10h & 18-22h)' },
  { value: 'NORMAL',   label: 'Normal (10-18h)' },
  { value: 'OFF_PEAK', label: 'Off-Peak (22-06h)' },
]

const FY_OPTIONS = ['2023-2024', '2024-2025', '2025-2026', '2026-2027']

// ── Widget content dispatcher ─────────────────────────────────────────────────
function GILWidgetContent({ widgetId, filters, chartType }: {
  widgetId: string
  filters: GILDashboardFilters
  chartType: ChartType
}) {
  const { month, financialYear } = filters
  switch (widgetId) {
    case 'gil_kpi':              return <GILKpi month={month} />
    case 'gil_daily_gen':        return <GILDailyGen month={month} chartType={chartType} />
    case 'gil_monthly_summary':  return <GILMonthlySummary months={13} chartType={chartType} />
    case 'gil_wind_solar_split': return <GILWindSolarSplit months={13} chartType={chartType} />
    case 'gil_gen_losses':       return <GILGenLosses months={13} chartType={chartType} />
    case 'gil_discom_bill':      return <GILDiscomBill month={month} chartType={chartType} />
    case 'gil_re_costs':         return <GILRECosts month={month} />
    case 'gil_cost_comparison':  return <GILCostComparison months={13} chartType={chartType} />
    case 'gil_savings_heatmap':  return <GILSavingsHeatmap />
    case 'gil_tod_analysis':     return <GILTodAnalysis month={month} chartType={chartType} />
    case 'gil_banking':          return <GILBanking month={month} />
    case 'gil_turbine_perf':     return <GILTurbinePerf financialYear={financialYear} chartType={chartType} />
    case 'gil_perf_metrics':     return <GILPerfMetrics defaultYear={financialYear} />
    default:
      return <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Unknown widget</div>
  }
}

// ── Chart-type switcher (same visual as C9) ───────────────────────────────────
function ChartTypeSwitcher({ widgetId, current, onChange }: {
  widgetId: string
  current: ChartType
  onChange: (t: ChartType) => void
}) {
  const types = GIL_CHART_TYPES[widgetId] ?? []
  if (types.length <= 1) return null
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {types.map(t => (
        <button key={t} title={TYPE_LABELS[t]} onClick={() => onChange(t)} style={{
          width: 26, height: 24, borderRadius: 5,
          border: `1px solid ${current === t ? 'var(--green)' : 'var(--border)'}`,
          background: current === t ? 'rgba(29,191,122,.15)' : 'rgba(255,255,255,.03)',
          color: current === t ? 'var(--green-l)' : 'var(--text-muted)',
          fontSize: 10, fontWeight: 700, cursor: 'pointer',
        }}>
          {TYPE_ICONS[t]}
        </button>
      ))}
    </div>
  )
}

// ── Export button (PNG only for GIL — no server-side export endpoint yet) ─────
function ExportButton({ widgetId, month, cardRef }: {
  widgetId: string
  month: string
  cardRef: React.RefObject<HTMLDivElement | null>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const png = () => {
    const canvas = cardRef.current?.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const a = document.createElement('a')
    a.download = `GIL_${widgetId}_${month}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
    setOpen(false)
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 11px', borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'rgba(255,255,255,.04)',
        color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
      }}>
        <span style={{ fontSize: 13 }}>&#8801;</span> Data
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 200,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '4px 0', minWidth: 148, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}>
          <div onClick={png}
            style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.06)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            Download PNG
          </div>
        </div>
      )}
    </div>
  )
}

// ── Canvas widget card (same structure as C9) ─────────────────────────────────
function CanvasWidgetCard({ widgetId, filters, chartType, onChangeType, onRemove, isLocked }: {
  widgetId: string
  filters: GILDashboardFilters
  chartType: ChartType
  onChangeType: (t: ChartType) => void
  onRemove: (id: string) => void
  isLocked: boolean
}) {
  const def = GIL_WIDGET_MAP[widgetId]
  const containerRef = useRef<HTMLDivElement>(null)
  if (!def) return null
  return (
    <div style={{ marginBottom: 20, background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,.025)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>{def.icon}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{def.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {def.category} &#183; {getSizeLabel(def.size)} &#183; {filters.month}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isLocked && <ChartTypeSwitcher widgetId={widgetId} current={chartType} onChange={onChangeType} />}
          <ExportButton widgetId={widgetId} month={filters.month} cardRef={containerRef} />
          {!isLocked && (
            <button
              onClick={() => onRemove(widgetId)}
              style={{ width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'rgba(255,255,255,.04)', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
              title="Remove from dashboard"
            >
              &#x2715;
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef} style={{ padding: '16px' }}>
        <GILWidgetContent widgetId={widgetId} filters={filters} chartType={chartType} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GILDashboardPage() {
  const [canvasWidgets, setCanvasWidgets] = useState<string[]>(['gil_kpi'])
  const [dragOver, setDragOver]           = useState(false)
  const [showUpload, setShowUpload]       = useState(false)
  const [todSlot, setTodSlot]             = useState('')
  const [chartTypes, setChartTypes]       = useState<Record<string, ChartType>>({})
  const [isLocked, setIsLocked]           = useState(false)

  const [month, setMonth] = useState(() => {
    const d = new Date()
    const cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return cur > '2026-06' ? '2025-06' : cur
  })

  const [financialYear, setFinancialYear] = useState('2025-2026')

  const filters: GILDashboardFilters = { month, todSlot, financialYear }

  const addWidget = (id: string) => {
    setCanvasWidgets(prev => prev.includes(id) ? prev : [...prev, id])
  }
  const removeWidget = (id: string) => {
    setCanvasWidgets(prev => prev.filter(w => w !== id))
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Left sidebar — shared WidgetLibrary, GIL registry injected */}
      <WidgetLibrary
        isLocked={isLocked}
        activeIds={canvasWidgets}
        widgetRegistry={GIL_WIDGET_REGISTRY}
        categories={GIL_CATEGORIES}
        categoryIcons={GIL_CATEGORY_ICONS}
        footerLine={'FY 2025-2026 · GIL Wind+Solar\nIntegrum Energy · MSEDCL Maharashtra'}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Header bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(7,17,31,.97)', flexShrink: 0, flexWrap: 'wrap' }}>

          {/* Month picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Month</span>
            <input
              type="month"
              value={month}
              min="2024-04"
              max="2026-12"
              onChange={e => setMonth(e.target.value)}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}
            />
          </div>

          {/* Financial Year picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>FY</span>
            <select
              value={financialYear}
              onChange={e => setFinancialYear(e.target.value)}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '5px 8px', fontSize: 11 }}
            >
              {FY_OPTIONS.map(fy => <option key={fy} value={fy}>{fy}</option>)}
            </select>
          </div>

          {/* MSEDCL TOD slot filter */}
          <select
            value={todSlot}
            onChange={e => setTodSlot(e.target.value)}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: todSlot ? 'var(--text)' : 'var(--text-muted)', borderRadius: 6, padding: '5px 8px', fontSize: 11 }}
          >
            {GIL_TOD_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <div style={{ flex: 1 }} />

          {/* Lock button */}
          <button
            onClick={() => setIsLocked(l => !l)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${isLocked ? 'rgba(245,166,35,.5)' : 'var(--border)'}`,
              background: isLocked ? 'rgba(245,166,35,.12)' : 'rgba(255,255,255,.04)',
              color: isLocked ? 'var(--amber)' : 'var(--text-muted)',
            }}
            title={isLocked ? 'Unlock dashboard to edit' : 'Lock dashboard layout'}
          >
            {isLocked ? '🔒' : '🔓'} {isLocked ? 'Locked' : 'Lock'}
          </button>

          {/* Upload button */}
          <button className="btn" onClick={() => setShowUpload(true)} style={{ fontSize: 11 }}>
            Upload Data
          </button>
        </div>

        {/* ── Active filter chips ── */}
        {todSlot && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 16px', background: 'rgba(74,158,255,.06)', borderBottom: '1px solid rgba(74,158,255,.15)', fontSize: 11, color: 'var(--blue)', flexWrap: 'wrap' }}>
            <span>Filtered:</span>
            <span style={{ background: 'rgba(74,158,255,.12)', borderRadius: 4, padding: '2px 7px' }}>
              {GIL_TOD_SLOTS.find(s => s.value === todSlot)?.label}
              <button onClick={() => setTodSlot('')} style={{ marginLeft: 4, background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 11 }}>x</button>
            </span>
          </div>
        )}

        {/* ── Canvas ── */}
        <div
          style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', boxSizing: 'border-box', boxShadow: dragOver ? 'inset 0 0 0 2px rgba(29,191,122,.5)' : 'none', transition: 'box-shadow .15s' }}
          onDragOver={e => { if (isLocked) return; e.preventDefault(); setDragOver(true) }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            if (isLocked) return
            const id = e.dataTransfer.getData('widgetId')
            if (id) addWidget(id)
          }}
        >
          {canvasWidgets.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--text-muted)', userSelect: 'none', pointerEvents: 'none' }}>
              <div style={{ fontSize: 48, opacity: .25 }}>&#128202;</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-sec)' }}>Build Your Dashboard</div>
              <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
                Drag and drop graphs from the left sidebar onto this canvas.
              </div>
            </div>
          ) : (
            canvasWidgets.map(id => {
              const ct = chartTypes[id] ?? (GIL_CHART_TYPES[id]?.[0] ?? 'bar')
              return (
                <CanvasWidgetCard
                  key={id}
                  widgetId={id}
                  filters={filters}
                  chartType={ct}
                  onChangeType={t => setChartTypes(prev => ({ ...prev, [id]: t }))}
                  onRemove={removeWidget}
                  isLocked={isLocked}
                />
              )
            })
          )}
          {dragOver && canvasWidgets.length > 0 && (
            <div style={{ border: '2px dashed rgba(29,191,122,.35)', borderRadius: 10, padding: '18px', textAlign: 'center', color: 'rgba(29,191,122,.7)', fontSize: 12, marginTop: 4 }}>
              Drop here to add
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 16px', borderTop: '1px solid var(--border)', background: 'rgba(7,17,31,.97)', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            9 Wind Turbines + 4 Solar Inverters &#183; MSEDCL Maharashtra &#183; Hybrid Wind+Solar PPA
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>2025 Integrum Energy Infrastructure Ltd.</span>
        </div>
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
