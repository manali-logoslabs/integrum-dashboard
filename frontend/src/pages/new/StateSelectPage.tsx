/**
 * StateSelectPage.tsx
 * Step 2 of the new dashboard flow.
 * URL: /new/:clientId/select-state
 *
 * Shows available states for the selected client.
 * On Continue → navigates to the dashboard.
 */
import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

interface StateOption {
  id: string
  name: string
  discom: string
  energy: string
  dashboardPath: string
}

interface ClientConfig {
  name: string
  icon: string
  tagline: string
  accentColor: string
  states: StateOption[]
}

const CLIENT_CONFIG: Record<string, ClientConfig> = {
  c9: {
    name: 'C9',
    icon: '☀️',
    tagline: 'BESCOM · Solar',
    accentColor: '#3b82f6',
    states: [
      {
        id: 'karnataka',
        name: 'Karnataka',
        discom: 'BESCOM',
        energy: 'Solar',
        dashboardPath: '/new/c9',
      },
    ],
  },
  gil: {
    name: 'GIL',
    icon: '🌬️',
    tagline: 'MSEDCL · Wind+Solar',
    accentColor: '#10b981',
    states: [
      {
        id: 'maharashtra',
        name: 'Maharashtra',
        discom: 'MSEDCL',
        energy: 'Wind + Solar',
        dashboardPath: '/old/gil',   // GIL v2 not yet built → falls back to v1
      },
    ],
  },
}

// State flag emoji map
const STATE_FLAGS: Record<string, string> = {
  karnataka:   '🟡',   // Karnataka flag colours: yellow
  maharashtra: '🔵',   // Maharashtra
}

export default function StateSelectPage() {
  const { clientId = '' } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)

  const client = CLIENT_CONFIG[clientId]

  // Unknown client → back to landing
  if (!client) {
    navigate('/new', { replace: true })
    return null
  }

  const selectedState = client.states.find(s => s.id === selected)

  function handleContinue() {
    if (!selectedState) return
    navigate(selectedState.dashboardPath)
  }

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
      position: 'relative',
    }}>

      {/* Back button */}
      <button
        onClick={() => navigate('/new')}
        style={{
          position: 'absolute', top: 28, left: 28,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: 'rgba(255,255,255,0.6)',
          padding: '7px 14px',
          fontSize: 13,
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
      >
        ← Back
      </button>

      {/* Client badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: client.accentColor + '22',
        border: `1px solid ${client.accentColor}44`,
        borderRadius: 12, padding: '8px 20px', marginBottom: 28,
      }}>
        <span style={{ fontSize: 20 }}>{client.icon}</span>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{client.name}</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>· {client.tagline}</span>
      </div>

      {/* Heading */}
      <h2 style={{
        color: '#ffffff', fontSize: 26, fontWeight: 700,
        margin: '0 0 8px', textAlign: 'center', letterSpacing: '-0.02em',
      }}>
        Select a State
      </h2>
      <p style={{
        color: 'rgba(255,255,255,0.38)', fontSize: 14,
        margin: '0 0 40px', textAlign: 'center',
      }}>
        Choose the state you want to view dashboard data for
      </p>

      {/* State cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 40 }}>
        {client.states.map(state => {
          const isSelected = selected === state.id
          return (
            <button
              key={state.id}
              onClick={() => setSelected(state.id)}
              style={{
                minWidth: 190,
                padding: '22px 24px',
                background: isSelected
                  ? 'rgba(27,175,122,0.14)'
                  : 'rgba(255,255,255,0.05)',
                border: isSelected
                  ? '2px solid rgba(27,175,122,0.55)'
                  : '1.5px solid rgba(255,255,255,0.1)',
                borderRadius: 14,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s',
                outline: 'none',
              }}
              onMouseEnter={e => {
                if (!isSelected)
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={e => {
                if (!isSelected)
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 10 }}>
                {STATE_FLAGS[state.id] ?? '📍'}
              </div>
              <div style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 5 }}>
                {state.name}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                {state.discom} · {state.energy}
              </div>
              {isSelected && (
                <div style={{
                  marginTop: 12, fontSize: 12,
                  color: '#1baf7a', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                  ✓ Selected
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Continue / View Dashboard button */}
      <button
        onClick={handleContinue}
        disabled={!selected}
        style={{
          background: selected ? '#1baf7a' : 'rgba(255,255,255,0.08)',
          border: 'none',
          borderRadius: 12,
          color: selected ? '#ffffff' : 'rgba(255,255,255,0.25)',
          padding: '13px 48px',
          fontSize: 16,
          fontWeight: 700,
          cursor: selected ? 'pointer' : 'not-allowed',
          letterSpacing: '-0.01em',
          transition: 'background 0.15s, transform 0.1s',
        }}
        onMouseEnter={e => {
          if (selected) (e.currentTarget as HTMLButtonElement).style.background = '#17a370'
        }}
        onMouseLeave={e => {
          if (selected) (e.currentTarget as HTMLButtonElement).style.background = '#1baf7a'
        }}
      >
        View Dashboard →
      </button>

      {/* Step indicator */}
      <div style={{
        marginTop: 48, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {['Select Client', 'Select State', 'Dashboard'].map((step, i) => (
          <React.Fragment key={step}>
            <div style={{
              fontSize: 12,
              color: i === 1 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)',
              fontWeight: i === 1 ? 600 : 400,
            }}>
              {step}
            </div>
            {i < 2 && (
              <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12 }}>›</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
