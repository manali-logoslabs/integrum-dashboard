import React from 'react'

interface Props {
  error?: string | null
  height?: number
}

export function Loading({ height = 200 }: { height?: number }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )
}

export function ErrorState({ error, height = 200 }: Props) {
  return (
    <div style={{
      height,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 8,
      color: 'var(--color-red)',
    }}>
      <span style={{ fontSize: 20 }}>⚠</span>
      <span style={{ fontSize: 13 }}>{error ?? 'Failed to load data'}</span>
    </div>
  )
}

export default function LoadingState({ error, height }: Props) {
  if (error) return <ErrorState error={error} height={height} />
  return <Loading height={height} />
}
