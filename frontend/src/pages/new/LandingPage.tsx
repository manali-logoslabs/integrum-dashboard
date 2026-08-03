/**
 * LandingPage.tsx
 * Entry point for the new dashboard.
 * URL: /new
 * Shows all client cards → click → state selection.
 */
import React from 'react'
import { useNavigate } from 'react-router-dom'

interface Client {
  id: string
  name: string
  icon: string
  tagline: string
  bg: string
  accentText: string
  enabled: boolean
}

const CLIENTS: Client[] = [
  {
    id: 'c9',
    name: 'C9 Dashboard',
    icon: '☀️',
    tagline: 'BESCOM · Solar · Karnataka',
    bg: 'linear-gradient(140deg, #2563eb 0%, #1e40af 100%)',
    accentText: '#93c5fd',
    enabled: true,
  },
  {
    id: 'gil',
    name: 'GIL Dashboard',
    icon: '🌬️',
    tagline: 'MSEDCL · Wind+Solar · Maharashtra',
    bg: 'linear-gradient(140deg, #059669 0%, #065f46 100%)',
    accentText: '#6ee7b7',
    enabled: true,
  },
]

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d1526',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>

      {/* Logo */}
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em', marginBottom: 8 }}>
          ⚡ Integrum Intelligence Dashboard
        </div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)' }}>
          Select a client dashboard to continue
        </div>
      </div>

      {/* Client cards */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {CLIENTS.map(client => (
          <button
            key={client.id}
            onClick={() => client.enabled && navigate(`/new/${client.id}/select-state`)}
            disabled={!client.enabled}
            style={{
              width: 240,
              height: 210,
              background: client.bg,
              border: 'none',
              borderRadius: 20,
              cursor: client.enabled ? 'pointer' : 'not-allowed',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              padding: '28px 24px',
              opacity: client.enabled ? 1 : 0.5,
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              outline: 'none',
            }}
            onMouseEnter={e => {
              if (!client.enabled) return
              const el = e.currentTarget as HTMLButtonElement
              el.style.transform = 'translateY(-6px)'
              el.style.boxShadow = '0 20px 48px rgba(0,0,0,0.45)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.transform = 'translateY(0)'
              el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)'
            }}
          >
            <span style={{ fontSize: 44 }}>{client.icon}</span>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#ffffff', fontSize: 19, fontWeight: 700, marginBottom: 5 }}>
                {client.name}
              </div>
              <div style={{ color: client.accentText, fontSize: 13, opacity: 0.85 }}>
                {client.tagline}
              </div>
            </div>
            {!client.enabled && (
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.6)',
                background: 'rgba(0,0,0,0.25)',
                borderRadius: 20, padding: '3px 10px',
              }}>
                Coming Soon
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 64, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
        Integrum Energy Analytics · v2 · 2026
      </div>
    </div>
  )
}
