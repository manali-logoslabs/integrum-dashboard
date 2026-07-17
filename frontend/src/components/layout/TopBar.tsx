import React, { useState } from 'react'

interface Props {
  month: string
  onMonthChange: (m: string) => void
  title?: string
}

const MONTHS = [
  '2025-04','2025-05','2025-06','2025-07',
  '2025-08','2025-09','2025-10','2025-11',
]

export default function TopBar({ month, onMonthChange, title }: Props) {
  return (
    <header style={{
      height: 'var(--header-h)',
      background: 'var(--color-sidebar)',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {title ?? 'Dashboard'}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Month:</span>
        <select
          value={month}
          onChange={e => onMonthChange(e.target.value)}
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            color: 'var(--color-text-primary)',
            padding: '4px 10px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {MONTHS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <div style={{
          width: 8, height: 8,
          borderRadius: '50%',
          background: 'var(--color-green)',
          boxShadow: '0 0 6px var(--color-green)',
        }} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Live</span>
      </div>
    </header>
  )
}
