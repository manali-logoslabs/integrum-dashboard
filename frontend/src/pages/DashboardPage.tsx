/**
 * DashboardPage.tsx
 * C9 dashboard — Auto-paged tabs, Light/Dark toggle, Lock/Unlock, Fullscreen.
 *
 * Each page holds up to MAX_PER_TAB widgets. When a widget is added and the
 * current page is full, a new "Page N" is created automatically. Empty tabs
 * are removed when the last widget is pulled from them (min 1 tab always kept).
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'
import WidgetLibrary from '../components/layout/WidgetLibrary'
import UploadModal from '../components/layout/UploadModal'
import { WIDGET_MAP, getSizeLabel } from '../components/widgets/widgetRegistry'
import { api, UnitMaster } from '../api/client'
import { useTheme } from '../context/ThemeContext'
import ChartKpi             from '../components/charts/ChartKpi'
import Chart1Daily          from '../components/charts/Chart1Daily'
import Chart2PowerCost      from '../components/charts/Chart2PowerCost'
import Chart3SavingsHeatmap from '../components/charts/Chart3SavingsHeatmap'
import Chart4Tod            from '../components/charts/Chart4Tod'
import Chart5Banking        from '../components/charts/Chart5Banking'
import Chart6DiscomBill     from '../components/charts/Chart6DiscomBill'
import Chart7UnitSummary    from '../components/charts/Chart7UnitSummary'
import Chart8BankingLoss    from '../components/charts/Chart8BankingLoss'
import Chart10Wheeling      from '../components/charts/Chart10Wheeling'
import Chart11Surplus            from '../components/charts/Chart11Surplus'
import Chart15Heatmap            from '../components/charts/Chart15Heatmap'
import ChartCostSummaryTable     from '../components/charts/ChartCostSummaryTable'

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'table' | 'monthly'
export interface DashboardFilters { month: string; fromMonth?: string; toMonth?: string; unitIds: number[]; todSlot: string }

// ── Auto-tab config ──────────────────────────────────────────────────────────
const MAX_PER_TAB = 4
interface TabState { id: string; label: string; widgets: string[] }
const INITIAL_TABS: TabState[] = [{ id: 'page-1', label: 'Page 1', widgets: [] }]

function loadTabs(): TabState[] {
  try { const s = localStorage.getItem('c9-tabs'); if (s) return JSON.parse(s) } catch {}
  return INITIAL_TABS
}
function loadActiveTabId(tabs: TabState[]): string {
  try {
    const s = localStorage.getItem('c9-active-tab-id')
    if (s && tabs.find(t => t.id === s)) return s
  } catch {}
  return tabs[0]?.id ?? 'page-1'
}

// ── Chart type config ────────────────────────────────────────────────────────
const CHART_TYPES: Record<string, ChartType[]> = {
  gen_cons_daily:  ['monthly', 'bar', 'line', 'area', 'pie'],
  power_cost:      ['bar', 'line', 'area', 'pie'],
  tod_analysis:    ['bar', 'pie', 'doughnut'],
  banking_cost:    ['bar', 'line', 'pie'],
  discom_bill:     ['bar', 'line', 'pie'],
  banking_loss:    ['bar', 'pie', 'doughnut'],
  wheeling_recon:  ['bar', 'pie'],
  surplus_flow:    ['bar', 'line'],
  unit_summary:         ['table'],
  cost_summary_table:   ['table'],
  kpi_cards:            ['table'],
  savings_heatmap: ['table'],
  heatmap_24h:     ['table'],
}
const TYPE_ICONS: Record<ChartType, string>  = { monthly:'M', bar:'B', line:'L', area:'A', pie:'P', doughnut:'D', table:'T' }
const TYPE_LABELS: Record<ChartType, string> = { monthly:'Monthly', bar:'Bar', line:'Line', area:'Area', pie:'Pie', doughnut:'Donut', table:'Table' }
const EXPORT_CHART_KEY: Record<string, string> = {
  gen_cons_daily:'daily-summary', power_cost:'unit-savings', unit_summary:'unit-savings',
  tod_analysis:'tod-analysis', banking_loss:'banking-loss', surplus_flow:'surplus-absorption',
  wheeling_recon:'wheeling-recon',
}
const TOD_SLOTS = [
  { value:'', label:'All TOD Slots' },
  { value:'MORNING_PEAK', label:'Morning Peak (06-09h)' },
  { value:'DAY_NORMAL', label:'Day Normal (09-18h)' },
  { value:'EVENING_PEAK', label:'Evening Peak (18-22h)' },
  { value:'NIGHT_OFF_PEAK', label:'Night Off-Peak (22-06h)' },
]

// ── Widget content ───────────────────────────────────────────────────────────
function WidgetContent({ widgetId, filters, chartType }: { widgetId: string; filters: DashboardFilters; chartType: ChartType }) {
  const { month, fromMonth, toMonth, unitIds } = filters
  const uid = unitIds.length ? unitIds.join(',') : undefined
  switch (widgetId) {
    case 'kpi_cards':       return <ChartKpi              month={month} unitIds={uid} />
    case 'gen_cons_daily':  return <Chart1Daily           month={month} chartType={chartType} fromMonth={fromMonth} toMonth={toMonth} unitIds={uid} />
    case 'power_cost':      return <Chart2PowerCost       month={month} chartType={chartType} fromMonth={fromMonth} toMonth={toMonth} unitIds={uid} />
    case 'savings_heatmap': return <Chart3SavingsHeatmap  month={month} />
    case 'tod_analysis':    return <Chart4Tod             month={month} chartType={chartType} unitIds={uid} />
    case 'banking_cost':    return <Chart5Banking         month={month} chartType={chartType} unitIds={uid} />
    case 'discom_bill':     return <Chart6DiscomBill      month={month} chartType={chartType} unitIds={uid} />
    case 'unit_summary':         return <Chart7UnitSummary      month={month} unitIds={uid} />
    case 'cost_summary_table':   return <ChartCostSummaryTable  month={month} fromMonth={fromMonth} toMonth={toMonth} unitIds={uid} />
    case 'banking_loss':    return <Chart8BankingLoss     month={month} chartType={chartType} unitIds={uid} />
    case 'wheeling_recon':  return <Chart10Wheeling       month={month} chartType={chartType} unitIds={uid} />
    case 'surplus_flow':    return <Chart11Surplus        month={month} chartType={chartType} unitIds={uid} />
    case 'heatmap_24h':     return <Chart15Heatmap        month={month} />
    default: return <div style={{ padding:16, color:'var(--text-muted)', fontSize:12 }}>Unknown widget</div>
  }
}

// ── Unit filter dropdown ─────────────────────────────────────────────────────
function UnitFilterDropdown({ units, selected, onChange }: { units: UnitMaster[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  const allSel = selected.length === 0 || selected.length === units.length
  const lbl = allSel ? 'All Units' : `${selected.length} Unit${selected.length > 1 ? 's' : ''}`
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="btn" style={{ fontSize:11, padding:'5px 10px' }}>
        {lbl} {'▾'}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', left:0, marginTop:4, zIndex:100, background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:10, padding:'6px 0', minWidth:210, boxShadow:'0 8px 32px rgba(0,0,0,.4)' }}>
          <div onClick={() => onChange([])} style={{ padding:'6px 14px', fontSize:11, cursor:'pointer', color:allSel?'var(--green-l)':'var(--text-muted)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:14, height:14, borderRadius:3, border:`1px solid ${allSel?'var(--green)':'var(--border-light)'}`, background:allSel?'var(--green)':'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff', flexShrink:0 }}>{allSel?'✓':''}</span>
            All Units (11)
          </div>
          {units.map(u => {
            const chk = selected.includes(u.unit_id)
            return (
              <div key={u.unit_id} onClick={() => toggle(u.unit_id)}
                style={{ padding:'6px 14px', fontSize:11, cursor:'pointer', color:chk?'var(--text)':'var(--text-muted)', display:'flex', alignItems:'center', gap:8 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,.04)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}
              >
                <span style={{ width:14, height:14, borderRadius:3, flexShrink:0, border:`1px solid ${chk?'var(--green)':'var(--border-light)'}`, background:chk?'var(--green)':'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff' }}>{chk?'✓':''}</span>
                {u.name}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Export button ────────────────────────────────────────────────────────────
function ExportButton({ widgetId, month, cardRef }: { widgetId: string; month: string; cardRef: React.RefObject<HTMLDivElement | null> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const chartKey = EXPORT_CHART_KEY[widgetId]
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const dl = (fmt: 'csv' | 'excel') => { if (chartKey) window.open(api.c9.exportUrl(chartKey, month, fmt), '_blank'); setOpen(false) }
  const png = () => {
    const canvas = cardRef.current?.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const a = document.createElement('a')
    a.download = `C9_${widgetId}_${month}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
    setOpen(false)
  }
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-elevated)', color:'var(--text-muted)', fontSize:11, cursor:'pointer' }}>
        <span style={{ fontSize:13 }}>&#8801;</span> Data
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', right:0, marginTop:4, zIndex:200, background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:8, padding:'4px 0', minWidth:148, boxShadow:'0 8px 24px rgba(0,0,0,.4)' }}>
          {chartKey && (
            <>
              <div onClick={() => dl('csv')} style={{ padding:'8px 14px', fontSize:11, color:'var(--text)', cursor:'pointer' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,.06)'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>Download CSV</div>
              <div onClick={() => dl('excel')} style={{ padding:'8px 14px', fontSize:11, color:'var(--text)', cursor:'pointer' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,.06)'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>Download Excel</div>
            </>
          )}
          <div onClick={png} style={{ padding:'8px 14px', fontSize:11, color:'var(--text)', cursor:'pointer' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,.06)'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>Download PNG</div>
        </div>
      )}
    </div>
  )
}

// ── Chart type switcher ──────────────────────────────────────────────────────
function ChartTypeSwitcher({ widgetId, current, onChange }: { widgetId: string; current: ChartType; onChange: (t: ChartType) => void }) {
  const types = CHART_TYPES[widgetId] ?? []
  if (types.length <= 1) return null
  return (
    <div style={{ display:'flex', gap:3 }}>
      {types.map(t => (
        <button key={t} title={TYPE_LABELS[t]} onClick={() => onChange(t)} style={{
          width:26, height:24, borderRadius:5,
          border:`1px solid ${current===t?'var(--green)':'var(--border)'}`,
          background:current===t?'rgba(29,191,122,.15)':'var(--bg-elevated)',
          color:current===t?'var(--green-l)':'var(--text-muted)',
          fontSize:10, fontWeight:700, cursor:'pointer',
        }}>
          {TYPE_ICONS[t]}
        </button>
      ))}
    </div>
  )
}

// ── Fullscreen overlay ───────────────────────────────────────────────────────
function FullscreenWidget({ widgetId, filters, chartType, onClose }: {
  widgetId: string; filters: DashboardFilters; chartType: ChartType; onClose: () => void
}) {
  const def = WIDGET_MAP[widgetId]
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  if (!def) return null
  return (
    <div className="fullscreen-overlay">
      <div className="fullscreen-overlay-header">
        <span style={{ fontSize:20 }}>{def.icon}</span>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{def.name}</div>
          <div style={{ fontSize:10, color:'var(--text-muted)' }}>{def.category} · {filters.month}</div>
        </div>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:10, color:'var(--text-muted)' }}>Press ESC to exit fullscreen</span>
        <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-elevated)', color:'var(--text-muted)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
      </div>
      <div className="fullscreen-overlay-body">
        <WidgetContent widgetId={widgetId} filters={filters} chartType={chartType} />
      </div>
    </div>
  )
}

// ── Canvas widget card ───────────────────────────────────────────────────────
function CanvasWidgetCard({ widgetId, filters, chartType, onChangeType, onRemove, isLocked, onFullscreen }: {
  widgetId: string; filters: DashboardFilters; chartType: ChartType
  onChangeType: (t: ChartType) => void; onRemove: (id: string) => void
  isLocked: boolean; onFullscreen: (id: string) => void
}) {
  const def = WIDGET_MAP[widgetId]
  const containerRef = useRef<HTMLDivElement>(null)
  if (!def) return null
  return (
    <div className="widget-card">
      <div className="widget-card-header">
        <span style={{ fontSize:18 }}>{def.icon}</span>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{def.name}</div>
          <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>
            {def.category} · {getSizeLabel(def.size)} · {filters.month}
          </div>
        </div>
        <div style={{ flex:1 }} />
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {!isLocked && <ChartTypeSwitcher widgetId={widgetId} current={chartType} onChange={onChangeType} />}
          <ExportButton widgetId={widgetId} month={filters.month} cardRef={containerRef} />
          <button onClick={() => onFullscreen(widgetId)} title="Fullscreen"
            style={{ width:28, height:28, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-elevated)', color:'var(--text-muted)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
          >⤢</button>
          {!isLocked && (
            <button onClick={() => onRemove(widgetId)} title="Remove"
              style={{ width:24, height:24, borderRadius:5, border:'1px solid var(--border)', background:'var(--bg-elevated)', color:'var(--text-muted)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', marginLeft:2 }}
            >✕</button>
          )}
        </div>
      </div>
      <div className="widget-card-body" ref={containerRef}>
        <WidgetContent widgetId={widgetId} filters={filters} chartType={chartType} />
      </div>
    </div>
  )
}

// ── Auto-page tab bar ────────────────────────────────────────────────────────
function TabNav({ tabs, activeTabId, onSelect }: {
  tabs: TabState[]; activeTabId: string; onSelect: (id: string) => void
}) {
  return (
    <nav className="tab-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab-btn${activeTabId === tab.id ? ' active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          <span style={{ fontSize:12 }}>📋</span>
          <span>{tab.label}</span>
          <span className="tab-badge">{tab.widgets.length}/{MAX_PER_TAB}</span>
        </button>
      ))}
    </nav>
  )
}

// ── Main dashboard page ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const { theme, toggleTheme } = useTheme()

  // Auto-paged tab state — persisted to localStorage
  const [tabs, setTabs] = useState<TabState[]>(loadTabs)
  const [activeTabId, setActiveTabId] = useState<string>(() => loadActiveTabId(loadTabs()))

  // Keep a ref so addWidget/removeWidget always see current state
  const tabsRef = useRef(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  // Persist tabs + active tab
  useEffect(() => {
    try { localStorage.setItem('c9-tabs', JSON.stringify(tabs)) } catch {}
  }, [tabs])
  useEffect(() => {
    try { localStorage.setItem('c9-active-tab-id', activeTabId) } catch {}
  }, [activeTabId])

  // Derived
  const activeTab    = tabs.find(t => t.id === activeTabId) ?? tabs[0]
  const canvasWidgets = activeTab?.widgets ?? []
  const allActiveIds  = tabs.flatMap(t => t.widgets)

  const [dragOver, setDragOver]           = useState(false)
  const [showUpload, setShowUpload]       = useState(false)
  const [units, setUnits]                 = useState<UnitMaster[]>([])
  const [selectedUnits, setSelectedUnits] = useState<number[]>([])
  const [todSlot, setTodSlot]             = useState('')
  const [chartTypes, setChartTypes]       = useState<Record<string, ChartType>>({})
  const [isLocked, setIsLocked]           = useState(false)
  const [rangeMode, setRangeMode]         = useState(false)
  const [fullscreenWidget, setFullscreenWidget] = useState<string | null>(null)

  // Clamp to 2025-11 — latest month with real data
  const [month, setMonth] = useState(() => {
    const d = new Date()
    const cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return cur > '2025-11' ? '2025-11' : cur
  })
  const [fromMonth, setFromMonth] = useState('2025-04')
  const [toMonth,   setToMonth]   = useState('2025-11')

  const rangeError = rangeMode && fromMonth > toMonth ? 'From month must be before To month' : null

  useEffect(() => { api.c9.units().then(setUnits).catch(() => {}) }, [])

  const filters: DashboardFilters = {
    month,
    fromMonth: rangeMode ? fromMonth : undefined,
    toMonth:   rangeMode ? toMonth   : undefined,
    unitIds: selectedUnits,
    todSlot,
  }

  // ── Widget add: fills active tab first; auto-creates new page when full ──
  const addWidget = useCallback((widgetId: string) => {
    const prev = tabsRef.current
    if (prev.some(t => t.widgets.includes(widgetId))) return // already on canvas

    const activeT = prev.find(t => t.id === activeTabId)
    if (activeT && activeT.widgets.length < MAX_PER_TAB) {
      setTabs(prev.map(t =>
        t.id === activeTabId ? { ...t, widgets: [...t.widgets, widgetId] } : t
      ))
    } else {
      // Current page is full → auto-create a new page
      const nextNum = prev.length + 1
      const newId   = `page-${nextNum}-${Date.now()}`
      const newTab: TabState = { id: newId, label: `Page ${nextNum}`, widgets: [widgetId] }
      setTabs([...prev, newTab])
      setActiveTabId(newId)
    }
  }, [activeTabId])

  // ── Widget remove: cleans up empty tabs (always keeps at least one) ──────
  const removeWidget = useCallback((widgetId: string) => {
    const prev = tabsRef.current
    const updated = prev.map(t => ({ ...t, widgets: t.widgets.filter(w => w !== widgetId) }))
    const cleaned = updated.filter(t => t.widgets.length > 0)
    const newTabs = cleaned.length > 0 ? cleaned : [{ id: 'page-1', label: 'Page 1', widgets: [] }]
    setTabs(newTabs)
    if (!newTabs.find(t => t.id === activeTabId)) {
      setActiveTabId(newTabs[newTabs.length - 1].id)
    }
  }, [activeTabId])

  return (
    <div style={{ display:'flex', height:'100vh', background:'var(--bg)', overflow:'hidden' }}>

      {/* Sidebar — hidden in presentation mode */}
      <div className={`sidebar-wrapper${isLocked ? ' hidden' : ''}`} style={{ width:'var(--sidebar-w)', minWidth:'var(--sidebar-w)', display: isLocked ? 'none' : undefined }}>
        <WidgetLibrary isLocked={isLocked} activeIds={allActiveIds} />
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderBottom:'1px solid var(--border)', background:'var(--header-bg)', flexShrink:0, flexWrap:'wrap' }}>
          {/* Client identity */}
          <div style={{ display:'flex', flexDirection:'column', marginRight:8 }}>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>Kids Clinic India Limited</span>
            <span style={{ fontSize:9, color:'var(--text-muted)', marginTop:1 }}>C9 · BESCOM Karnataka · 11 Units</span>
          </div>
          <div style={{ width:1, height:30, background:'var(--border)', marginRight:4 }} />

          {/* Date filters */}
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <button
              onClick={() => setRangeMode(r => !r)}
              style={{ fontSize:10, padding:'4px 9px', borderRadius:5, cursor:'pointer', border:`1px solid ${rangeMode?'var(--blue)':'var(--border)'}`, background:rangeMode?'rgba(74,158,255,.12)':'var(--bg-elevated)', color:rangeMode?'var(--blue)':'var(--text-muted)' }}
            >{rangeMode ? 'Range ✕' : '⇔ Range'}</button>

            {rangeMode ? (
              <>
                <span style={{ fontSize:10, color:'var(--text-muted)' }}>From</span>
                <input type="month" value={fromMonth} min="2025-04" max={toMonth}
                  onChange={e => setFromMonth(e.target.value)}
                  style={{ background:'var(--bg-elevated)', border:`1px solid ${rangeError?'var(--red)':'var(--border)'}`, color:'var(--text)', borderRadius:6, padding:'4px 8px', fontSize:11 }} />
                <span style={{ fontSize:10, color:'var(--text-muted)' }}>To</span>
                <input type="month" value={toMonth} min={fromMonth} max="2025-11"
                  onChange={e => setToMonth(e.target.value)}
                  style={{ background:'var(--bg-elevated)', border:`1px solid ${rangeError?'var(--red)':'var(--border)'}`, color:'var(--text)', borderRadius:6, padding:'4px 8px', fontSize:11 }} />
              </>
            ) : (
              <>
                <span style={{ fontSize:10, color:'var(--text-muted)' }}>Month</span>
                <input type="month" value={month} min="2025-04" max="2025-11"
                  onChange={e => setMonth(e.target.value)}
                  style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'4px 8px', fontSize:11 }} />
              </>
            )}
            {rangeError && <span style={{ fontSize:10, color:'var(--red)' }}>⚠ {rangeError}</span>}
          </div>

          <UnitFilterDropdown units={units} selected={selectedUnits} onChange={setSelectedUnits} />
          <select value={todSlot} onChange={e => setTodSlot(e.target.value)}
            style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', color:todSlot?'var(--text)':'var(--text-muted)', borderRadius:6, padding:'5px 8px', fontSize:11 }}>
            {TOD_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <div style={{ flex:1 }} />

          {/* Theme toggle */}
          <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {/* Lock / Unlock */}
          <button
            onClick={() => setIsLocked(l => !l)}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:6, fontSize:11, cursor:'pointer', border:`1px solid ${isLocked?'rgba(245,166,35,.5)':'var(--border)'}`, background:isLocked?'rgba(245,166,35,.12)':'var(--bg-elevated)', color:isLocked?'var(--amber)':'var(--text-muted)' }}
            title={isLocked ? 'Unlock dashboard to edit' : 'Lock dashboard layout'}
          >
            {isLocked ? '🔒' : '🔓'} {isLocked ? 'Locked' : 'Lock'}
          </button>

          {isLocked && <span className="presentation-badge">● Presentation Mode</span>}
          {!isLocked && <button className="btn" onClick={() => setShowUpload(true)} style={{ fontSize:11 }}>Upload Data</button>}
        </div>

        {/* ── Tab bar ── */}
        <TabNav tabs={tabs} activeTabId={activeTabId} onSelect={setActiveTabId} />

        {/* ── Active filter chips ── */}
        {(selectedUnits.length > 0 || todSlot) && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 16px', background:'rgba(74,158,255,.06)', borderBottom:'1px solid rgba(74,158,255,.15)', fontSize:11, color:'var(--blue)', flexWrap:'wrap' }}>
            <span>Filtered:</span>
            {selectedUnits.length > 0 && (
              <span style={{ background:'rgba(74,158,255,.12)', borderRadius:4, padding:'2px 7px' }}>
                {selectedUnits.length} unit{selectedUnits.length > 1 ? 's' : ''}
                <button onClick={() => setSelectedUnits([])} style={{ marginLeft:4, background:'none', border:'none', color:'var(--blue)', cursor:'pointer', fontSize:11 }}>×</button>
              </span>
            )}
            {todSlot && (
              <span style={{ background:'rgba(74,158,255,.12)', borderRadius:4, padding:'2px 7px' }}>
                {TOD_SLOTS.find(s => s.value === todSlot)?.label}
                <button onClick={() => setTodSlot('')} style={{ marginLeft:4, background:'none', border:'none', color:'var(--blue)', cursor:'pointer', fontSize:11 }}>×</button>
              </span>
            )}
          </div>
        )}

        {/* ── Canvas ── */}
        <div
          style={{ flex:1, overflowY:'auto', padding:'20px 24px', boxSizing:'border-box', outline:dragOver?'2px solid rgba(29,191,122,.5)':'none', outlineOffset:-2, transition:'outline .15s' }}
          onDragOver={e => { if (isLocked) return; e.preventDefault(); setDragOver(true) }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            if (isLocked) return
            const id = e.dataTransfer.getData('widgetId')
            if (id) addWidget(id)
          }}
        >
          {canvasWidgets.length === 0 ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16, color:'var(--text-muted)', userSelect:'none' }}>
              <div style={{ fontSize:48, opacity:.2 }}>📊</div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text-sec)' }}>
                {isLocked ? 'No widgets on this page' : `${activeTab?.label ?? 'Page 1'} is empty`}
              </div>
              <div style={{ fontSize:12, textAlign:'center', maxWidth:300, lineHeight:1.7 }}>
                {isLocked
                  ? 'Unlock the dashboard to add widgets.'
                  : `Drag graphs from the left sidebar onto this page. Pages fill up to ${MAX_PER_TAB} widgets, then a new page is created automatically.`}
              </div>
            </div>
          ) : (
            canvasWidgets.map(id => {
              const ct = chartTypes[id] ?? (CHART_TYPES[id]?.[0] ?? 'bar')
              return (
                <CanvasWidgetCard
                  key={id}
                  widgetId={id}
                  filters={filters}
                  chartType={ct}
                  onChangeType={t => setChartTypes(prev => ({ ...prev, [id]: t }))}
                  onRemove={removeWidget}
                  isLocked={isLocked}
                  onFullscreen={setFullscreenWidget}
                />
              )
            })
          )}
          {dragOver && (
            <div className="drop-zone-hint">
              {(activeTab?.widgets.length ?? 0) >= MAX_PER_TAB
                ? `Page ${tabs.length + 1} will be created automatically`
                : `Drop to add to ${activeTab?.label ?? 'Page 1'}`}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 16px', borderTop:'1px solid var(--border)', background:'var(--header-bg)', flexShrink:0 }}>
          <span style={{ fontSize:10, color:'var(--text-muted)' }}>11 units · BESCOM Karnataka · Solar Wheeling PPA ₹2.50/kWh</span>
          <span style={{ fontSize:10, color:'var(--text-muted)' }}>© 2025 Integrum Energy Infrastructure Ltd.</span>
        </div>
      </div>

      {/* Fullscreen overlay */}
      {fullscreenWidget && (
        <FullscreenWidget
          widgetId={fullscreenWidget}
          filters={filters}
          chartType={chartTypes[fullscreenWidget] ?? (CHART_TYPES[fullscreenWidget]?.[0] ?? 'bar')}
          onClose={() => setFullscreenWidget(null)}
        />
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
