/**
 * UploadModal.tsx
 * ===============
 * Drag-drop CSV upload modal.
 * Supports generation and consumption CSVs.
 * Auto-detects file type from column headers.
 */

import React, { useState, useRef, useCallback } from 'react'
import { api } from '../../api/client'

interface Props {
  onClose: () => void
}

interface UploadResult {
  file: string
  detected_type: string
  rows_processed: number
  rows_inserted: number
  errors: string[]
}

// Known C9 units (loaded from DB at runtime, but pre-populated as fallback)
const UNITS_FALLBACK = [
  { unit_id: 1, code: 'U01', name: 'Unit 1' },
  { unit_id: 2, code: 'U02', name: 'Unit 2' },
]

export default function UploadModal({ onClose }: Props) {
  const [files, setFiles]       = useState<File[]>([])
  const [unitId, setUnitId]     = useState<number | ''>('')
  const [peid, setPeid]         = useState<number | ''>(1)
  const [units, setUnits]       = useState(UNITS_FALLBACK)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [results, setResults]   = useState<UploadResult[]>([])
  const [error, setError]       = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Load unit list on mount
  React.useEffect(() => {
    api.c9.units().then(setUnits).catch(() => {})
  }, [])

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return
    const csvs = Array.from(incoming).filter(f => f.name.endsWith('.csv'))
    if (csvs.length === 0) { setError('Only .csv files are accepted.'); return }
    setFiles(prev => [...prev, ...csvs])
    setError('')
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  const handleUpload = async () => {
    if (!files.length) { setError('Add at least one CSV file.'); return }
    setUploading(true)
    setResults([])
    setError('')

    const out: UploadResult[] = []
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await api.c9.upload(fd, unitId || undefined, peid || undefined) as UploadResult
        out.push(res)
      } catch (e: any) {
        out.push({
          file: file.name,
          detected_type: '—',
          rows_processed: 0,
          rows_inserted: 0,
          errors: [e?.response?.data?.detail ?? e?.message ?? 'Upload failed'],
        })
      }
    }
    setResults(out)
    setUploading(false)
  }

  const allDone = results.length > 0

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: 24,
  }
  const modal: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 16, width: '100%', maxWidth: 540,
    padding: 28, display: 'flex', flexDirection: 'column', gap: 18,
  }
  const label: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }
  const select: React.CSSProperties = {
    width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 12,
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>📤 Upload Data</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Upload generation or consumption CSV — type is auto-detected from column headers
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--green)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: '28px 16px',
            textAlign: 'center',
            background: dragging ? 'rgba(29,191,122,.04)' : 'rgba(255,255,255,.015)',
            cursor: 'pointer',
            transition: 'all .15s',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>Drop CSV files here</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>or click to browse</div>
          <input ref={fileRef} type="file" accept=".csv" multiple hidden onChange={e => addFiles(e.target.files)} />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>📄</span>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(f.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={label}>Consumption Unit (for consumption CSVs)</div>
            <select style={select} value={unitId} onChange={e => setUnitId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Auto-detect / Generation file —</option>
              {units.map(u => (
                <option key={u.unit_id} value={u.unit_id}>{u.name} ({u.code})</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>Plant Energy Source ID (for generation CSVs)</div>
            <select style={select} value={peid} onChange={e => setPeid(e.target.value ? Number(e.target.value) : '')}>
              <option value={1}>Source 1 (default)</option>
              <option value={2}>Source 2</option>
              <option value={3}>Source 3</option>
            </select>
          </div>
        </div>

        {/* Format guide */}
        <details style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--blue)', fontSize: 11 }}>📋 Expected CSV formats</summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--green-l)', marginBottom: 2 }}>Generation CSV</div>
              <code style={{ fontSize: 10, background: 'rgba(0,0,0,.3)', padding: '4px 8px', borderRadius: 4, display: 'block' }}>
                slot_start_time, slot_end_time, generation_kwh
              </code>
            </div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 2 }}>Consumption CSV</div>
              <code style={{ fontSize: 10, background: 'rgba(0,0,0,.3)', padding: '4px 8px', borderRadius: 4, display: 'block' }}>
                slot_start_time, slot_end_time, consumption_kwh
              </code>
            </div>
            <div style={{ color: 'var(--amber)', marginTop: 4 }}>
              ⚠ Timestamps must be in ISO 8601 format (e.g. 2025-08-01 00:00:00). Duplicates are overwritten.
            </div>
          </div>
        </details>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(232,72,72,.1)', border: '1px solid rgba(232,72,72,.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--red)' }}>
            ⚠ {error}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map((r, i) => (
              <div key={i} style={{
                background: r.errors.length ? 'rgba(232,72,72,.06)' : 'rgba(29,191,122,.06)',
                border: `1px solid ${r.errors.length ? 'rgba(232,72,72,.3)' : 'rgba(29,191,122,.3)'}`,
                borderRadius: 8, padding: '10px 14px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: r.errors.length ? 'var(--red)' : 'var(--green-l)' }}>
                  {r.errors.length ? '✗' : '✓'} {r.file}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Type: <strong style={{ color: 'var(--text)' }}>{r.detected_type}</strong>
                  &nbsp;·&nbsp; Processed: <strong style={{ color: 'var(--text)' }}>{r.rows_processed}</strong>
                  &nbsp;·&nbsp; Inserted: <strong style={{ color: 'var(--green-l)' }}>{r.rows_inserted}</strong>
                </div>
                {r.errors.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>
                    {r.errors.slice(0, 3).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          {allDone
            ? <button className="btn btn-primary" onClick={() => { setFiles([]); setResults([]) }}>Upload More</button>
            : <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading || !files.length}
                style={{ opacity: uploading || !files.length ? .6 : 1 }}
              >
                {uploading ? '⏳ Uploading…' : `📤 Upload ${files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''}` : ''}`}
              </button>
          }
        </div>
      </div>
    </div>
  )
}
