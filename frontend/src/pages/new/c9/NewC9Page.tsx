/**
 * NewC9Page.tsx — C9 New Dashboard (v2)
 *
 * Model mirrors the old dashboard:
 *   • Sidebar tiles are draggable graph cards
 *   • Drag onto the canvas to add a graph
 *   • Each canvas card has a × remove button
 *   • Canvas state persists in localStorage
 *   • Empty canvas shows a "drag graphs here" prompt
 */
import React, { useState, useCallback, useRef } from 'react'
import NewLayout from '../../../components/new/NewLayout'
import { GlobalFilterProvider, useGlobalFilters } from '../../../components/new/GlobalFilterContext'
import GlobalFilterBar from '../../../components/new/GlobalFilterBar'
import InsightCard from '../../../components/new/InsightCard'
import Chart1Consumption from '../../../components/new/charts/Chart1Consumption'
import Chart2TimeSeries  from '../../../components/new/charts/Chart2TimeSeries'
import Chart3DemandVsCD    from '../../../components/new/charts/Chart3DemandVsCD'
import Chart4DemandDuration from '../../../components/new/charts/Chart4DemandDuration'
import Chart5PowerFactor    from '../../../components/new/charts/Chart5PowerFactor'
import Chart6GenerationTOD  from '../../../components/new/charts/Chart6GenerationTOD'
import Chart7CUFTiles            from '../../../components/new/charts/Chart7CUFTiles'
import Chart8SettledConsumption    from '../../../components/new/charts/Chart8SettledConsumption'
import Chart9ConsumptionSettlement  from '../../../components/new/charts/Chart9ConsumptionSettlement'
import Chart10LossesWaterfall       from '../../../components/new/charts/Chart10LossesWaterfall'
import Chart11BankingRulesMaster    from '../../../components/new/charts/Chart11BankingRulesMaster'
import Chart12BankingScenarioBuilder from '../../../components/new/charts/Chart12BankingScenarioBuilder'
import Chart13OptimumSettlement     from '../../../components/new/charts/Chart13OptimumSettlement'
import Chart14C9KPITiles            from '../../../components/new/charts/Chart14C9KPITiles'
import { GRAPH_REGISTRY } from '../../../components/new/NewSidebar'

type GraphId =
  | 'graph-1' | 'graph-2' | 'graph-3' | 'graph-4' | 'graph-5'
  | 'graph-6' | 'graph-7' | 'graph-8' | 'graph-9' | 'graph-10'
  | 'graph-11' | 'graph-12' | 'graph-13' | 'graph-14'

// ── Canvas persistence ────────────────────────────────────────────────────────
function loadCanvas(): GraphId[] {
  try {
    const s = localStorage.getItem('c9-canvas-v2')
    if (s) return JSON.parse(s)
  } catch { /* ignore */ }
  return []
}
function saveCanvas(ids: GraphId[]) {
  try { localStorage.setItem('c9-canvas-v2', JSON.stringify(ids)) } catch { /* ignore */ }
}

// ── Canvas graph card wrapper ──────────────────────────────────────────────────
function CanvasGraphCard({ id, onRemove, onInvestigate, cardRefs }: {
  id: GraphId
  onRemove:     (id: GraphId) => void
  onInvestigate:(targetId: string) => void
  cardRefs:     React.MutableRefObject<Record<string, HTMLDivElement | null>>
}) {
  const { filters } = useGlobalFilters()

  return (
    <div
      ref={el => { cardRefs.current[id] = el }}
      style={{ position: 'relative', marginBottom: 28 }}
    >
      {/* Remove button */}
      <button
        onClick={() => onRemove(id)}
        title="Remove from dashboard"
        style={{
          position: 'absolute', top: -10, right: -10, zIndex: 10,
          width: 24, height: 24, borderRadius: '50%',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
          fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background = '#e24b4a'
          el.style.color = '#fff'
          el.style.borderColor = '#e24b4a'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background = 'var(--color-surface)'
          el.style.color = 'var(--color-text-muted)'
          el.style.borderColor = 'var(--color-border)'
        }}
      >
        ✕
      </button>

      {/* Chart */}
      {id === 'graph-1'  && <Chart1Consumption />}
      {id === 'graph-2'  && <Chart2TimeSeries />}
      {id === 'graph-3'  && <Chart3DemandVsCD />}
      {id === 'graph-4'  && <Chart4DemandDuration />}
      {id === 'graph-5'  && <Chart5PowerFactor />}
      {id === 'graph-6'  && <Chart6GenerationTOD />}
      {id === 'graph-7'  && <Chart7CUFTiles />}
      {id === 'graph-8'  && <Chart8SettledConsumption />}
      {id === 'graph-9'  && <Chart9ConsumptionSettlement />}
      {id === 'graph-10' && <Chart10LossesWaterfall />}
      {id === 'graph-11' && <Chart11BankingRulesMaster />}
      {id === 'graph-12' && <Chart12BankingScenarioBuilder />}
      {id === 'graph-13' && <Chart13OptimumSettlement />}
      {id === 'graph-14' && <Chart14C9KPITiles />}

      {/* AI Insight strip */}
      <InsightCard
        graphId={id}
        period={filters.period}
        onInvestigate={onInvestigate}
      />
    </div>
  )
}

// ── Page header ───────────────────────────────────────────────────────────────
function PageHeader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '16px 24px',
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>C9</h1>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>BESCOM · Solar · Karnataka</p>
      </div>
    </div>
  )
}

// ── Inner page (needs filter context) ────────────────────────────────────────
function C9PageInner() {
  const [canvasGraphs, setCanvasGraphs] = useState<GraphId[]>(loadCanvas)
  const [dragOver,     setDragOver]     = useState(false)
  const [highlighted,  setHighlighted]  = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  function addGraph(id: GraphId) {
    if (canvasGraphs.includes(id)) return
    const next = [...canvasGraphs, id]
    setCanvasGraphs(next)
    saveCanvas(next)
  }

  function removeGraph(id: GraphId) {
    const next = canvasGraphs.filter(g => g !== id)
    setCanvasGraphs(next)
    saveCanvas(next)
  }

  // "Investigate" handler: add target if missing, scroll to it, flash highlight
  const handleInvestigate = useCallback((targetId: string) => {
    if (!canvasGraphs.includes(targetId as GraphId)) {
      addGraph(targetId as GraphId)
    }
    // Wait a tick for DOM to render then scroll
    setTimeout(() => {
      const el = cardRefs.current[targetId]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setHighlighted(targetId)
        setTimeout(() => setHighlighted(null), 2000)
      }
    }, 80)
  }, [canvasGraphs])

  return (
    <NewLayout activeCustomer="c9" canvasGraphIds={canvasGraphs}>
      <PageHeader />

      {/* ── Persistent filter bar ── */}
      <GlobalFilterBar />

      {/* ── Canvas ── */}
      <div
        style={{
          flex: 1,
          padding: '24px',
          outline: dragOver ? '2px solid rgba(27,175,122,.5)' : '2px solid transparent',
          outlineOffset: -2,
          transition: 'outline .15s',
          minHeight: 400,
        }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver(true) }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
        }}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          const id = e.dataTransfer.getData('graphId') as GraphId
          if (id) addGraph(id)
        }}
      >
        {canvasGraphs.length === 0 ? (
          /* ── Empty state ── */
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            height: '60vh', gap: 14,
            color: 'var(--color-text-muted)',
            userSelect: 'none',
          }}>
            <div style={{ fontSize: 52, opacity: 0.2 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
              Dashboard is empty
            </div>
            <div style={{
              fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 1.7,
              color: 'var(--color-text-muted)',
            }}>
              Drag graphs from the left sidebar onto this canvas to build your dashboard.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {GRAPH_REGISTRY.map(g => (
                <button
                  key={g.id}
                  onClick={() => addGraph(g.id as GraphId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(27,175,122,.1)',
                    border: '1px solid rgba(27,175,122,.3)',
                    color: 'var(--color-green-light)',
                    cursor: 'pointer',
                  }}
                >
                  {g.icon} + {g.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {canvasGraphs.map(id => (
              <div
                key={id}
                style={{
                  transition: 'box-shadow 0.3s, outline 0.3s',
                  outline: highlighted === id
                    ? '2px solid rgba(42,120,214,0.8)' : '2px solid transparent',
                  outlineOffset: 4,
                  borderRadius: 14,
                }}
              >
                <CanvasGraphCard
                  id={id}
                  onRemove={removeGraph}
                  onInvestigate={handleInvestigate}
                  cardRefs={cardRefs}
                />
              </div>
            ))}

            {dragOver && (
              <div style={{
                padding: '18px', textAlign: 'center',
                border: '2px dashed rgba(27,175,122,.4)',
                borderRadius: 10, fontSize: 13,
                color: 'rgba(27,175,122,.7)',
                marginTop: 8,
              }}>
                Drop to add another graph
              </div>
            )}
          </>
        )}
      </div>
    </NewLayout>
  )
}

// ── Main page (wraps with GlobalFilterProvider) ───────────────────────────────
export default function NewC9Page() {
  return (
    <GlobalFilterProvider>
      <C9PageInner />
    </GlobalFilterProvider>
  )
}
