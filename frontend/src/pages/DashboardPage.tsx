/**
 * DashboardPage.tsx - Multi-widget canvas with drag-and-drop.
 */
import React, { useState, useRef, useEffect } from 'react'
import WidgetLibrary from '../components/layout/WidgetLibrary'
import UploadModal from '../components/layout/UploadModal'
import { WIDGET_MAP, getSizeLabel } from '../components/widgets/widgetRegistry'
import { api, UnitMaster } from '../api/client'
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
import Chart11Surplus       from '../components/charts/Chart11Surplus'
import Chart15Heatmap       from '../components/charts/Chart15Heatmap'

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'table'
export interface DashboardFilters { month: string; unitIds: number[]; todSlot: string }

const CHART_TYPES: Record<string, ChartType[]> = {
  gen_cons_daily:  ['bar', 'line', 'area', 'pie'],
  power_cost:      ['bar', 'line', 'area', 'pie'],
  tod_analysis:    ['bar', 'pie', 'doughnut'],
  banking_cost:    ['bar', 'line', 'pie'],
  discom_bill:     ['bar', 'line', 'pie'],
  banking_loss:    ['bar', 'pie', 'doughnut'],
  wheeling_recon:  ['bar', 'pie'],
  surplus_flow:    ['bar', 'line'],
  unit_summary:    ['table'],
  kpi_cards:       ['table'],
  savings_heatmap: ['table'],
  heatmap_24h:     ['table'],
}
const TYPE_ICONS: Record<ChartType, string>  = { bar:'B', line:'L', area:'A', pie:'P', doughnut:'D', table:'T' }
const TYPE_LABELS: Record<ChartType, string> = { bar:'Bar', line:'Line', area:'Area', pie:'Pie', doughnut:'Donut', table:'Table' }
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

function WidgetContent({ widgetId, filters, chartType }: { widgetId: string; filters: DashboardFilters; chartType: ChartType }) {
  const { month, unitIds } = filters
  const uid = unitIds.length ? unitIds.join(',') : undefined
  switch (widgetId) {
    case 'kpi_cards':       return <ChartKpi              month={month} unitIds={uid} />
    case 'gen_cons_daily':  return <Chart1Daily           month={month} chartType={chartType} />
    case 'power_cost':      return <Chart2PowerCost       month={month} chartType={chartType} unitIds={uid} />
    case 'savings_heatmap': return <Chart3SavingsHeatmap  month={month} />
    case 'tod_analysis':    return <Chart4Tod             month={month} chartType={chartType} unitIds={uid} />
    case 'banking_cost':    return <Chart5Banking         month={month} chartType={chartType} unitIds={uid} />
    case 'discom_bill':     return <Chart6DiscomBill      month={month} chartType={chartType} unitIds={uid} />
    case 'unit_summary':    return <Chart7UnitSummary     month={month} unitIds={uid} />
    case 'banking_loss':    return <Chart8BankingLoss     month={month} chartType={chartType} unitIds={uid} />
    case 'wheeling_recon':  return <Chart10Wheeling       month={month} chartType={chartType} unitIds={uid} />
    case 'surplus_flow':    return <Chart11Surplus        month={month} chartType={chartType} unitIds={uid} />
    case 'heatmap_24h':     return <Chart15Heatmap        month={month} />
    default: return <div style={{ padding:16, color:'var(--text-muted)', fontSize:12 }}>Unknown widget</div>
  }
}

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
      <button onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:6, border:'1px solid var(--border)', background:'rgba(255,255,255,.04)', color:'var(--text-muted)', fontSize:11, cursor:'pointer' }}>
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

function ChartTypeSwitcher({ widgetId, current, onChange }: { widgetId: string; current: ChartType; onChange: (t: ChartType) => void }) {
  const types = CHART_TYPES[widgetId] ?? []
  if (types.length <= 1) return null
  return (
    <div style={{ display:'flex', gap:3 }}>
      {types.map(t => (
        <button key={t} title={TYPE_LABELS[t]} onClick={() => onChange(t)} style={{
          width:26, height:24, borderRadius:5,
          border:`1px solid ${current===t?'var(--green)':'var(--border)'}`,
          background:current===t?'rgba(29,191,122,.15)':'rgba(255,255,255,.03)',
          color:current===t?'var(--green-l)':'var(--text-muted)',
          fontSize:10, fontWeight:700, cursor:'pointer',
        }}>
          {TYPE_ICONS[t]}
        </button>
      ))}
    </div>
  )
}

function CanvasWidgetCard({ widgetId, filters, chartType, onChangeType, onRemove, isLocked }: {
  widgetId: string
  filters: DashboardFilters
  chartType: ChartType
  onChangeType: (t: ChartType) => void
  onRemove: (id: string) => void
  isLocked: boolean
}) {
  const def = WIDGET_MAP[widgetId]
  const containerRef = useRef<HTMLDivElement>(null)
  if (!def) return null
  return (
    <div style={{ marginBottom:20, background:'rgba(255,255,255,.02)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border)', background:'rgba(255,255,255,.025)', flexWrap:'wrap' }}>
        <span style={{ fontSize:18 }}>{def.icon}</span>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{def.name}</div>
          <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>
            {def.category} &#183; {getSizeLabel(def.size)} &#183; {filters.month}
          </div>
        </div>
        <div style={{ flex:1 }} />
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {!isLocked && <ChartTypeSwitcher widgetId={widgetId} current={chartType} onChange={onChangeType} />}
          <ExportButton widgetId={widgetId} month={filters.month} cardRef={containerRef} />
          {!isLocked && (
            <button
              onClick={() => onRemove(widgetId)}
              style={{ width:24, height:24, borderRadius:5, border:'1px solid var(--border)', background:'rgba(255,255,255,.04)', color:'var(--text-muted)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', marginLeft:4 }}
              title="Remove from dashboard"
            >
              &#x2715;
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef} style={{ padding:'16px' }}>
        <WidgetContent widgetId={widgetId} filters={filters} chartType={chartType} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [canvasWidgets, setCanvasWidgets] = useState<string[]>(['gen_cons_daily'])
  const [dragOver, setDragOver]           = useState(false)
  const [showUpload, setShowUpload]       = useState(false)
  const [units, setUnits]                 = useState<UnitMaster[]>([])
  const [selectedUnits, setSelectedUnits] = useState<number[]>([])
  const [todSlot, setTodSlot]             = useState('')
  const [chartTypes, setChartTypes]       = useState<Record<string, ChartType>>({})
  const [isLocked, setIsLocked]           = useState(false)

  const [month, setMonth] = useState(() => {
    const d = new Date()
    const cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return cur > '2025-11' ? '2025-08' : cur
  })

  useEffect(() => { api.c9.units().then(setUnits).catch(() => {}) }, [])

  const filters: DashboardFilters = { month, unitIds: selectedUnits, todSlot }

  const addWidget = (id: string) => {
    setCanvasWidgets(prev => prev.includes(id) ? prev : [...prev, id])
  }
  const removeWidget = (id: string) => {
    setCanvasWidgets(prev => prev.filter(w => w !== id))
  }

  return (
    <div style={{ display:'flex', height:'100vh', background:'var(--bg)', overflow:'hidden' }}>
      <WidgetLibrary isLocked={isLocked} activeIds={canvasWidgets} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderBottom:'1px solid var(--border)', background:'rgba(7,17,31,.97)', flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginRight:8 }}>
            <span style={{ fontSize:10, color:'var(--text-muted)' }}>Month</span>
            <input type="month" value={month} min="2025-04" max="2025-11" onChange={e => setMonth(e.target.value)}
              style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'4px 8px', fontSize:11 }} />
          </div>
          <UnitFilterDropdown units={units} selected={selectedUnits} onChange={setSelectedUnits} />
          <select value={todSlot} onChange={e => setTodSlot(e.target.value)}
            style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', color:todSlot?'var(--text)':'var(--text-muted)', borderRadius:6, padding:'5px 8px', fontSize:11 }}>
            {TOD_SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div style={{ flex:1 }} />
          <button
            onClick={() => setIsLocked(l => !l)}
            style={{
              display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:6, fontSize:11, cursor:'pointer',
              border:`1px solid ${isLocked ? 'rgba(245,166,35,.5)' : 'var(--border)'}`,
              background: isLocked ? 'rgba(245,166,35,.12)' : 'rgba(255,255,255,.04)',
              color: isLocked ? 'var(--amber)' : 'var(--text-muted)',
            }}
            title={isLocked ? 'Unlock dashboard to edit' : 'Lock dashboard layout'}
          >
            {isLocked ? '🔒' : '🔓'} {isLocked ? 'Locked' : 'Lock'}
          </button>
          <button className="btn" onClick={() => setShowUpload(true)} style={{ fontSize:11 }}>Upload Data</button>
        </div>

        {(selectedUnits.length > 0 || todSlot) && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 16px', background:'rgba(74,158,255,.06)', borderBottom:'1px solid rgba(74,158,255,.15)', fontSize:11, color:'var(--blue)', flexWrap:'wrap' }}>
            <span>Filtered:</span>
            {selectedUnits.length > 0 && (
              <span style={{ background:'rgba(74,158,255,.12)', borderRadius:4, padding:'2px 7px' }}>
                {selectedUnits.length} unit{selectedUnits.length > 1 ? 's' : ''}
                <button onClick={() => setSelectedUnits([])} style={{ marginLeft:4, background:'none', border:'none', color:'var(--blue)', cursor:'pointer', fontSize:11 }}>x</button>
              </span>
            )}
            {todSlot && (
              <span style={{ background:'rgba(74,158,255,.12)', borderRadius:4, padding:'2px 7px' }}>
                {TOD_SLOTS.find(s => s.value === todSlot)?.label}
                <button onClick={() => setTodSlot('')} style={{ marginLeft:4, background:'none', border:'none', color:'var(--blue)', cursor:'pointer', fontSize:11 }}>x</button>
              </span>
            )}
          </div>
        )}

        <div
          style={{ flex:1, overflowY:'auto', padding:'20px 24px', boxSizing:'border-box', boxShadow:dragOver?'inset 0 0 0 2px rgba(29,191,122,.5)':'none', transition:'box-shadow .15s' }}
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
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:16, color:'var(--text-muted)', userSelect:'none', pointerEvents:'none' }}>
              <div style={{ fontSize:48, opacity:.25 }}>&#128202;</div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text-sec)' }}>Build Your Dashboard</div>
              <div style={{ fontSize:12, textAlign:'center', maxWidth:280, lineHeight:1.6 }}>
                Drag and drop graphs from the left sidebar onto this canvas.
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
                />
              )
            })
          )}
          {dragOver && canvasWidgets.length > 0 && (
            <div style={{ border:'2px dashed rgba(29,191,122,.35)', borderRadius:10, padding:'18px', textAlign:'center', color:'rgba(29,191,122,.7)', fontSize:12, marginTop:4 }}>
              Drop here to add
            </div>
          )}
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 16px', borderTop:'1px solid var(--border)', background:'rgba(7,17,31,.97)', flexShrink:0 }}>
          <span style={{ fontSize:10, color:'var(--text-muted)' }}>11 units &#183; BESCOM Karnataka &#183; Solar Wheeling PPA &#8377;2.50/kWh</span>
          <span style={{ fontSize:10, color:'var(--text-muted)' }}>2025 Integrum Energy Infrastructure Ltd.</span>
        </div>
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
