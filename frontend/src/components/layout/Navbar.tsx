/**
 * Navbar.tsx
 * ==========
 * Top navigation bar — matches the integrum-dashboard.html reference UI exactly.
 * Logo | Nav links | Live clock | Notifications | User avatar
 */

import React, { useState, useEffect } from 'react'

const NAV_ITEMS = ['Dashboard', 'Plants', 'Finance', 'Reports', 'Settings']

interface NavbarProps {
  activeNav?: string
  onNavChange?: (item: string) => void
}

export default function Navbar({ activeNav = 'Dashboard', onNavChange }: NavbarProps) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <nav style={{
      height: 'var(--nav-h)',
      background: 'rgba(7,17,31,0.97)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 0,
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 1000,
      backdropFilter: 'blur(8px)',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
        <span style={{ fontSize: 20 }}>⚡</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: 'var(--text)', lineHeight: 1.1 }}>
            INTEGRUM
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
            Energy Analytics Platform
          </div>
        </div>
        <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 16px' }} />
      </div>

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = item === activeNav
          return (
            <button
              key={item}
              onClick={() => onNavChange?.(item)}
              style={{
                padding: '5px 13px',
                borderRadius: 6,
                border: 'none',
                background: active ? 'rgba(29,191,122,.15)' : 'transparent',
                color: active ? 'var(--green-l)' : 'var(--text-muted)',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.05)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}}
            >
              {item}
            </button>
          )
        })}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Clock */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {timeStr}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{dateStr}</div>
        </div>

        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(29,191,122,.12)', border: '1px solid rgba(29,191,122,.3)', borderRadius: 20, padding: '3px 9px' }}>
          <span style={{
            display: 'block', width: 6, height: 6, borderRadius: '50%',
            background: 'var(--green)',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 10, color: 'var(--green-l)', fontWeight: 700 }}>LIVE</span>
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

        {/* Bell */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, borderRadius: 6, lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          🔔
        </button>

        {/* Settings gear */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 4, borderRadius: 6, lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
        >
          ⚙️
        </button>

        {/* User avatar */}
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--green) 0%, #0a8f5c 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: '#fff', cursor: 'pointer',
          border: '2px solid rgba(29,191,122,.4)',
        }}>
          M
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .5; transform: scale(.8); }
        }
      `}</style>
    </nav>
  )
}
