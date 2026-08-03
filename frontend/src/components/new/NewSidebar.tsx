/**
 * NewSidebar.tsx
 * Sidebar for the v2 dashboard.
 *
 * Graph tiles are DRAGGABLE — user drags them onto the canvas to add.
 * Active graphs (already on canvas) are shown with a green ON badge.
 * Same pattern as the old dashboard's WidgetLibrary.
 */
import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

interface Customer { id: string; label: string; icon: string; path: string; disabled?: boolean }

export interface GraphDef {
  id:          string
  label:       string
  icon:        string
  description: string
}

const CUSTOMERS: Customer[] = [
  { id: 'c9',  label: 'C9',  icon: '☀️',  path: '/new/c9'  },
  { id: 'gil', label: 'GIL', icon: '🌬️', path: '/new/gil', disabled: true },
]

// Registry of all available graphs — grows as new graphs are built
export const GRAPH_REGISTRY: GraphDef[] = [
  {
    id: 'graph-1',
    label: 'Portfolio Consumption',
    icon: '📊',
    description: 'Stacked consumption by state (OA + BTM + Grid) with contract demand',
  },
  {
    id: 'graph-2',
    label: 'Unit Time Series',
    icon: '📈',
    description: 'Single-unit consumption at hourly / daily granularity with monthly, FY, 5Y and custom (max 3 months) presets',
  },
  {
    id: 'graph-3',
    label: 'Demand vs CD',
    icon: '⚡',
    description: '15-min recorded demand vs contract demand; exceedance heatmap by hour-of-day',
  },
  {
    id: 'graph-4',
    label: 'Demand Duration',
    icon: '📉',
    description: 'Sorted block-demand curve vs CD + exceedance histogram; BESS-sizing metrics',
  },
  {
    id: 'graph-5',
    label: 'Power Factor',
    icon: '🔋',
    description: 'Monthly avg & min-block PF trend; derived vs billed reconciliation; kVA inflation insight',
  },
  {
    id: 'graph-6',
    label: 'Generation by TOD',
    icon: '☀️',
    description: 'Portfolio generation by TOD × source (3-level drill: portfolio → state → unit)',
  },
  {
    id: 'graph-7',
    label: 'CUF / PLF Tiles',
    icon: '🔆',
    description: 'Prev-month + FY-to-date CUF per unit and portfolio (net gen ÷ capacity × hours)',
  },
  {
    id: 'graph-8',
    label: 'Settled Consumption',
    icon: '🏦',
    description: 'State-wise settled consumption stacked by source (OA / BTM / Grid); pre/post-banking toggle; click state to drill into units',
  },
  {
    id: 'graph-9',
    label: 'Settlement Mapping',
    icon: '🔗',
    description: 'Unit-level consumption vs contributing generation by source; TOD-split toggle; historical trend mode',
  },
  {
    id: 'graph-10',
    label: 'Losses Waterfall',
    icon: '🌊',
    description: 'Waterfall from gross generation to net settled units: Tx loss, wheeling, banking CIK, lapsed, other — by unit/state/portfolio',
  },
  {
    id: 'graph-11',
    label: 'Banking Rules Master',
    icon: '📋',
    description: 'Admin-editable table of plant → banking regime mappings (annual / monthly / none); CIK %, lapse rule, TOD restriction, vintage, status',
  },
  {
    id: 'graph-12',
    label: 'Banking Scenario Builder',
    icon: '🔀',
    description: 'What-if engine: compare base vs No-Banking / Monthly-all / CIK+3% scenarios; grouped stacked bars by state; Δ cost and Δ lapsed KPI chips',
  },
  {
    id: 'graph-13',
    label: 'Optimum Settlement',
    icon: '⚙️',
    description: 'Greedy allocation engine (Min cost / Max banking / Min lapse); horizontal allocation bar + cost breakdown table; indicative savings vs sub-optimal dispatch',
  },
  {
    id: 'graph-14',
    label: 'C9 KPI Tiles',
    icon: '🎯',
    description: '9 KPI tiles in 3×3 grid: Total Consumption, OA Settled, BTM Gen, Grid Drawl, Portfolio CUF, Avg PF, Banking Balance, Net Settled, CD Utilization — colour-coded by threshold with MoM delta',
  },
]

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

interface Props {
  activeCustomer?: string
  canvasGraphIds?: string[]    // graphs currently on canvas
}

function GraphTile({ graph, isActive }: { graph: GraphDef; isActive: boolean }) {
  const [dragging, setDragging] = useState(false)

  const baseBg     = isActive ? 'rgba(27,175,122,.10)' : 'rgba(255,255,255,.03)'
  const baseBorder = isActive ? 'rgba(27,175,122,.40)' : 'var(--color-border)'

  return (
    <div
      draggable={!isActive}
      onDragStart={e => {
        if (isActive) return
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('graphId', graph.id)
        e.dataTransfer.setData('source', 'sidebar')
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      style={{
        margin: '0 12px 6px',
        padding: '9px 11px',
        borderRadius: 8,
        background: dragging ? 'rgba(27,175,122,.08)' : baseBg,
        border: `1px solid ${dragging ? 'rgba(27,175,122,.4)' : baseBorder}`,
        borderLeft: isActive ? '3px solid var(--color-green)' : `1px solid ${baseBorder}`,
        cursor: isActive ? 'default' : dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        opacity: isActive ? 1 : dragging ? 0.7 : 1,
        transition: 'all .15s',
      }}
      onMouseEnter={e => {
        if (!isActive && !dragging)
          (e.currentTarget as HTMLElement).style.background = 'rgba(27,175,122,.06)'
      }}
      onMouseLeave={e => {
        if (!dragging)
          (e.currentTarget as HTMLElement).style.background = isActive
            ? 'rgba(27,175,122,.10)' : 'rgba(255,255,255,.03)'
      }}
      title={isActive ? 'Already on dashboard' : `Drag to add — ${graph.description}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13 }}>{graph.icon}</span>
        <span style={{
          fontSize: 11, fontWeight: isActive ? 700 : 600, flex: 1, lineHeight: 1.3,
          color: isActive ? 'var(--color-green-light)' : 'var(--color-text-secondary)',
        }}>
          {graph.label}
        </span>
        {isActive && (
          <span style={{
            fontSize: 8, fontWeight: 700, color: 'var(--color-green)',
            background: 'rgba(27,175,122,.15)',
            border: '1px solid rgba(27,175,122,.3)',
            borderRadius: 3, padding: '1px 4px', letterSpacing: .3,
          }}>
            ON
          </span>
        )}
      </div>
      {!isActive && (
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>
          {graph.description}
        </div>
      )}
    </div>
  )
}

export default function NewSidebar({ activeCustomer = 'c9', canvasGraphIds = [] }: Props) {
  const navigate = useNavigate()

  return (
    <aside style={{
      width: 230,
      height: '100vh',
      background: 'var(--color-sidebar)',
      borderRight: '1px solid var(--color-border)',
      position: 'fixed',
      top: 0, left: 0,
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div
        onClick={() => navigate('/new')}
        style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
        title="Back to client selection"
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
          ⚡ Integrum Energy
        </div>
      </div>

      {/* Graph library — scrollable tile list */}
      <div style={{ padding: '14px 0 8px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ ...sectionLabel, padding: '0 20px 10px' }}>
          Graphs — drag onto dashboard
        </div>

        {GRAPH_REGISTRY.map(g => (
          <GraphTile
            key={g.id}
            graph={g}
            isActive={canvasGraphIds.includes(g.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--color-border)', padding: '10px 20px' }}>
        <NavLink
          to="/old/c9"
          style={{ fontSize: 11, color: 'var(--color-text-muted)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 6 }}
        >
          ← Old Dashboard (v1)
        </NavLink>
      </div>
      <div style={{ padding: '10px 20px', borderTop: '1px solid var(--color-border)',
        fontSize: 11, color: 'var(--color-text-muted)' }}>
        v2.0 · 2026 · Karnataka
      </div>
    </aside>
  )
}
