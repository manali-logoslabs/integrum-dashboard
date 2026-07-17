import React from 'react'

interface Props {
  label:    string
  value:    string
  sub?:     string
  color?:   string
  icon?:    string
}

export default function KpiCard({ label, value, sub, color, icon }: Props) {
  return (
    <div className="card" style={{ minWidth: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="card-title">{label}</div>
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            color: color ?? 'var(--color-text-primary)',
            lineHeight: 1.2,
          }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {sub}
            </div>
          )}
        </div>
        {icon && (
          <span style={{ fontSize: 24, opacity: 0.6 }}>{icon}</span>
        )}
      </div>
    </div>
  )
}
