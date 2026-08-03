/**
 * NewLayout.tsx
 * Shell layout for v2 dashboard: fixed sidebar + scrollable main area.
 */
import React from 'react'
import NewSidebar from './NewSidebar'

interface Props {
  children: React.ReactNode
  activeCustomer?: string
  canvasGraphIds?: string[]
}

export default function NewLayout({ children, activeCustomer = 'c9', canvasGraphIds = [] }: Props) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <NewSidebar activeCustomer={activeCustomer} canvasGraphIds={canvasGraphIds} />
      <main style={{
        marginLeft: 230,
        width: 'calc(100vw - 230px)',   // explicit: not flex-basis-dependent
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflowY: 'auto',
      }}>
        {children}
      </main>
    </div>
  )
}
