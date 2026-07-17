/**
 * WidgetLibrary.tsx
 * =================
 * Left sidebar with draggable widget cards organized by category.
 * Accepts an optional widgetRegistry prop so GIL can reuse this component
 * with its own registry without duplication.
 */

import React, { useState } from 'react'
import {
  WIDGET_REGISTRY, CATEGORIES, CATEGORY_ICONS,
  getSizeLabel, WidgetCategory, WidgetDef,
} from '../widgets/widgetRegistry'

const SIZE_COLOR: Record<string, string> = {
  'Full':  'var(--green)',
  '2 col': 'var(--blue)',
  '1 col': 'var(--amber)',
}

interface WidgetCardProps {
  widget: WidgetDef
  isLocked: boolean
  isActive: boolean
}

function SidebarWidgetCard({ widget, isLocked, isActive }: WidgetCardProps) {
  const sizeLabel = getSizeLabel(widget.size)
  const [dragging, setDragging] = useState(false)

  const baseBg     = isActive ? 'rgba(29,191,122,.10)' : 'rgba(255,255,255,.03)'
  const baseBorder = isActive ? 'rgba(29,191,122,.45)' : 'var(--border)'

  return (
    <div
      draggable={!isLocked}
      onDragStart={e => {
        if (isLocked) return
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('widgetId', widget.id)
        e.dataTransfer.setData('source', 'library')
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      style={{
        background: dragging ? 'rgba(29,191,122,.08)' : baseBg,
        border: `1px solid ${dragging ? 'rgba(29,191,122,.4)' : baseBorder}`,
        borderLeft: isActive ? '3px solid var(--green)' : `1px solid ${baseBorder}`,
        borderRadius: 8,
        padding: isActive ? '9px 11px 9px 9px' : '9px 11px',
        cursor: isLocked ? 'not-allowed' : 'grab',
        userSelect: 'none',
        transition: 'all .15s',
        opacity: isLocked ? .5 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      onMouseEnter={e => {
        if (!isLocked && !dragging)
          (e.currentTarget as HTMLElement).style.background = 'rgba(29,191,122,.06)'
      }}
      onMouseLeave={e => {
        if (!dragging)
          (e.currentTarget as HTMLElement).style.background = baseBg
      }}
      title={widget.description}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13 }}>{widget.icon}</span>
        <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--green-l)' : 'var(--text)', flex: 1, lineHeight: 1.3 }}>
          {widget.name}
        </span>
        {isActive && (
          <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--green)', background: 'rgba(29,191,122,.15)', border: '1px solid rgba(29,191,122,.3)', borderRadius: 3, padding: '1px 4px', flexShrink: 0, letterSpacing: .3 }}>
            ON
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1 }}>
          {widget.description.length > 42
            ? widget.description.slice(0, 42) + '...'
            : widget.description}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
          color: SIZE_COLOR[sizeLabel] || 'var(--text-muted)',
          background: 'rgba(255,255,255,.06)',
          flexShrink: 0, marginLeft: 6,
        }}>
          {sizeLabel}
        </span>
      </div>
    </div>
  )
}

interface WidgetLibraryProps {
  isLocked: boolean
  activeIds?: string[]
  /** Override the widget registry (defaults to C9's WIDGET_REGISTRY) */
  widgetRegistry?: WidgetDef[]
  /** Override the category order (defaults to C9's CATEGORIES) */
  categories?: WidgetCategory[]
  /** Override category icons (defaults to C9's CATEGORY_ICONS) */
  categoryIcons?: Record<string, string>
  /** Two-line footer text separated by \n */
  footerLine?: string
}

export default function WidgetLibrary({
  isLocked,
  activeIds = [],
  widgetRegistry: registry = WIDGET_REGISTRY,
  categories = CATEGORIES,
  categoryIcons = CATEGORY_ICONS,
  footerLine = 'FY 2025 · C9 Solar Fleet\nIntegrum Energy · BESCOM Karnataka',
}: WidgetLibraryProps) {
  const [collapsed, setCollapsed] = useState<Set<WidgetCategory>>(new Set())

  const toggle = (cat: WidgetCategory) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const [line1, line2] = footerLine.split('\n')

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      minWidth: 'var(--sidebar-w)',
      background: 'linear-gradient(180deg, #091625 0%, #070f1c 100%)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', letterSpacing: .3 }}>
          Widget Library
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          {isLocked ? 'Dashboard locked' : 'Drag graphs to the canvas'}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {categories.map(cat => {
          const widgets = registry.filter(w => w.category === cat)
          const open = !collapsed.has(cat)
          return (
            <div key={cat} style={{ marginBottom: 8 }}>
              <button
                onClick={() => toggle(cat)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px', borderRadius: 6, marginBottom: open ? 5 : 2, color: 'var(--text-sec)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.04)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
              >
                <span style={{ fontSize: 12 }}>{categoryIcons[cat]}</span>
                <span style={{ fontSize: 11, fontWeight: 700, flex: 1, textAlign: 'left' }}>{cat}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{widgets.length}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }}>&#x25be;</span>
              </button>
              {open && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {widgets.map(w => (
                    <SidebarWidgetCard key={w.id} widget={w} isLocked={isLocked} isActive={activeIds.includes(w.id)} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
          {line1}
          {line2 && <><br />{line2}</>}
        </div>
      </div>
    </aside>
  )
}
