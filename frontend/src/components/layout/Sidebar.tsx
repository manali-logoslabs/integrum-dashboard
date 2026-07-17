import React from 'react'
import { NavLink } from 'react-router-dom'

const NAV = [
  { label: 'Overview',           path: '/' },
  { label: 'Generation & Consumption', path: '/c9/daily' },
  { label: 'Unit Cost Analysis', path: '/c9/unit-savings' },
  { label: 'TOD Analysis',       path: '/c9/tod' },
  { label: 'DISCOM Bill',        path: '/c9/discom-bill' },
  { label: 'Banking & Loss',     path: '/c9/banking' },
  { label: 'Wheeling Recon',     path: '/c9/wheeling' },
  { label: 'Surplus Absorption', path: '/c9/surplus' },
  { label: 'Energy Heatmap',     path: '/c9/heatmap' },
]

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-w)',
    minHeight: '100vh',
    background: 'var(--color-sidebar)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 100,
  },
  logo: {
    padding: '20px 20px 16px',
    borderBottom: '1px solid var(--color-border)',
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.02em',
  },
  logoSub: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    marginTop: 2,
  },
  nav: {
    padding: '12px 0',
    flex: 1,
  },
  section: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    padding: '12px 20px 4px',
  },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid var(--color-border)',
    fontSize: 11,
    color: 'var(--color-text-muted)',
  },
}

export default function Sidebar() {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <div style={styles.logoTitle}>⚡ Integrum Energy</div>
        <div style={styles.logoSub}>C9 Analytics Dashboard</div>
      </div>

      <nav style={styles.nav}>
        <div style={styles.section}>C9 Client — BESCOM / Solar</div>
        {NAV.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            style={({ isActive }) => ({
              display: 'block',
              padding: '8px 20px',
              fontSize: 13,
              color: isActive ? 'var(--color-green-light)' : 'var(--color-text-secondary)',
              background: isActive ? 'rgba(27,175,122,.08)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--color-green)' : '2px solid transparent',
              transition: 'all 0.15s',
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={styles.footer}>
        v1.0 · Aug 2025 · Karnataka
      </div>
    </aside>
  )
}
