/**
 * Chart11BankingRulesMaster.tsx — Graph 11
 * Banking Rules Master
 *
 * Every source/plant tagged to its applicable banking regime.
 * State- and vintage-aware; effective-dated records.
 * Admin-editable table (mock); feeds Scenario Builder (Graph 12) and
 * Optimum Settlement (Graph 13).
 */
import React, { useState, useMemo } from 'react'

// ── Banking rule type ──────────────────────────────────────────────────────────
interface BankingRule {
  id:              number
  plantId:         string
  plantName:       string
  sourceType:      'Solar OA' | 'Wind OA' | 'BTM Solar'
  state:           string
  vintage:         number
  regime:          'annual' | 'monthly' | 'none'
  carryForwardPct: number
  lapseRule:       'End of FY' | 'End of month' | 'n/a'
  todRestricted:   boolean   // off-peak injection excluded from bank?
  bankingCIK:      number    // Charge-in-Kind % deducted on drawl
  effectiveFrom:   string    // YYYY-MM-DD
  status:          'active' | 'grandfathered' | 'proposed'
  notes:           string
}

// ── Master data ────────────────────────────────────────────────────────────────
export const BANKING_RULES: BankingRule[] = [
  {
    id: 1,
    plantId: 'pav-sol', plantName: 'Pavagada Solar', sourceType: 'Solar OA',
    state: 'KA', vintage: 2018,
    regime: 'annual', carryForwardPct: 100, lapseRule: 'End of FY',
    todRestricted: false, bankingCIK: 5,
    effectiveFrom: '2022-04-01', status: 'active',
    notes: 'KERC Order No. 2022/45 — annual banking at 5% CIK on drawl. Surplus injected between Apr 1 and Mar 31 banked; unused units lapse on Mar 31.',
  },
  {
    id: 2,
    plantId: 'bel-wnd', plantName: 'Bellary Wind', sourceType: 'Wind OA',
    state: 'KA', vintage: 2019,
    regime: 'annual', carryForwardPct: 100, lapseRule: 'End of FY',
    todRestricted: true, bankingCIK: 5,
    effectiveFrom: '2022-04-01', status: 'active',
    notes: 'KERC wind banking: TOD-restricted — injection during off-peak (22:00–06:00) is NOT eligible for banking credit; only normal + peak-hour wind units enter the bank.',
  },
  {
    id: 3,
    plantId: 'pav-sol-gf', plantName: 'Pavagada Solar (GF tranche)', sourceType: 'Solar OA',
    state: 'KA', vintage: 2017,
    regime: 'annual', carryForwardPct: 100, lapseRule: 'End of FY',
    todRestricted: false, bankingCIK: 3,
    effectiveFrom: '2017-06-01', status: 'grandfathered',
    notes: 'Pre-2020 PPA signed under older KERC regime: CIK locked at 3% under grandfather clause. Exempt from 2022 revision to 5%. Applicable until PPA expiry (2037).',
  },
  {
    id: 4,
    plantId: 'raj-sol', plantName: 'Rajasthan Solar', sourceType: 'Solar OA',
    state: 'RJ', vintage: 2021,
    regime: 'monthly', carryForwardPct: 80, lapseRule: 'End of month',
    todRestricted: false, bankingCIK: 2,
    effectiveFrom: '2021-09-01', status: 'active',
    notes: 'RERC inter-state banking: monthly settlement cycle. 80% of surplus units carry forward to next month; remaining 20% lapse. 2% CIK on drawl. Drawal allowed only within same state boundary.',
  },
  {
    id: 5,
    plantId: 'nan-wnd', plantName: 'Nanded Wind', sourceType: 'Wind OA',
    state: 'MH', vintage: 2020,
    regime: 'monthly', carryForwardPct: 90, lapseRule: 'End of month',
    todRestricted: false, bankingCIK: 2,
    effectiveFrom: '2020-11-01', status: 'active',
    notes: 'MERC banking: monthly reset with 90% carry-forward. 10% of un-drawn balance lapses at end of each calendar month. Banking restricted to consumers within Maharashtra.',
  },
  {
    id: 6,
    plantId: 'btm-ka', plantName: 'BTM Solar (Karnataka units)', sourceType: 'BTM Solar',
    state: 'KA', vintage: 2021,
    regime: 'annual', carryForwardPct: 100, lapseRule: 'End of FY',
    todRestricted: false, bankingCIK: 0,
    effectiveFrom: '2021-04-01', status: 'active',
    notes: 'KERC net-metering / net-billing for rooftop solar below 1 MW: annual settlement, 100% carry-forward, zero CIK. Excess units valued at prevailing KERC rate at FY end.',
  },
  {
    id: 7,
    plantId: 'btm-mh', plantName: 'BTM Solar (Maharashtra units)', sourceType: 'BTM Solar',
    state: 'MH', vintage: 2022,
    regime: 'monthly', carryForwardPct: 100, lapseRule: 'End of month',
    todRestricted: false, bankingCIK: 0,
    effectiveFrom: '2022-01-01', status: 'active',
    notes: 'MERC net-metering: monthly settlement cycle, 100% carry-forward within month, excess lapses at billing cycle end. No CIK applicable for BTM.',
  },
  {
    id: 8,
    plantId: 'ts-solar-prop', plantName: 'Proposed TS Solar (OA)', sourceType: 'Solar OA',
    state: 'TS', vintage: 2026,
    regime: 'none', carryForwardPct: 0, lapseRule: 'n/a',
    todRestricted: false, bankingCIK: 0,
    effectiveFrom: '2026-10-01', status: 'proposed',
    notes: 'TSERC currently does not permit OA banking. Proposed plant (COD Oct 2026) will rely entirely on direct real-time scheduling. No banking credit applicable until regulatory change.',
  },
]

// ── Colour helpers ─────────────────────────────────────────────────────────────
const REGIME_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  annual:  { bg: 'rgba(27,175,122,0.12)',  border: 'rgba(27,175,122,0.35)',  text: '#1baf7a' },
  monthly: { bg: 'rgba(42,120,214,0.12)',  border: 'rgba(42,120,214,0.35)',  text: '#74b0f5' },
  none:    { bg: 'rgba(127,140,141,0.12)', border: 'rgba(127,140,141,0.30)', text: '#95a5a6' },
}

const STATUS_COLOR: Record<string, string> = {
  active:        '#1baf7a',
  grandfathered: '#eda100',
  proposed:      '#9b59b6',
}

const TYPE_ICON: Record<string, string> = {
  'Solar OA':  '☀️',
  'Wind OA':   '🌬️',
  'BTM Solar': '🏠',
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 12, padding: 20,
}
const SEL: React.CSSProperties = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 6, padding: '4px 8px',
  color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chart11BankingRulesMaster() {
  const [stateFilter,  setStateFilter]  = useState('')
  const [regimeFilter, setRegimeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId,   setExpandedId]   = useState<number | null>(null)
  const [editMode,     setEditMode]     = useState(false)

  const filtered = useMemo(() => BANKING_RULES.filter(r =>
    (!stateFilter  || r.state  === stateFilter)  &&
    (!regimeFilter || r.regime === regimeFilter)  &&
    (!statusFilter || r.status === statusFilter)
  ), [stateFilter, regimeFilter, statusFilter])

  const states = [...new Set(BANKING_RULES.map(r => r.state))]

  const summaryStats = {
    annual:  BANKING_RULES.filter(r => r.regime === 'annual').length,
    monthly: BANKING_RULES.filter(r => r.regime === 'monthly').length,
    none:    BANKING_RULES.filter(r => r.regime === 'none').length,
    gf:      BANKING_RULES.filter(r => r.status === 'grandfathered').length,
  }

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Banking Rules Master
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            Plant → banking regime mapping · state & vintage aware · effective-dated · feeds Graphs 12 & 13
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} style={SEL}>
            <option value="">All states</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={regimeFilter} onChange={e => setRegimeFilter(e.target.value)} style={SEL}>
            <option value="">All regimes</option>
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
            <option value="none">None</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={SEL}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="grandfathered">Grandfathered</option>
            <option value="proposed">Proposed</option>
          </select>
          <button
            onClick={() => setEditMode(e => !e)}
            style={{
              padding: '4px 12px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              background: editMode ? 'rgba(237,161,0,0.12)' : 'transparent',
              border: `1px solid ${editMode ? '#eda100' : 'var(--color-border)'}`,
              color: editMode ? '#eda100' : 'var(--color-text-muted)',
              fontWeight: editMode ? 700 : 400,
            }}
          >
            ✎ {editMode ? 'Editing' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Admin edit banner */}
      {editMode && (
        <div style={{
          marginBottom: 12, padding: '7px 12px', borderRadius: 6,
          background: 'rgba(237,161,0,0.07)', border: '1px solid rgba(237,161,0,0.28)',
          fontSize: 11, color: '#eda100', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠</span>
          <span>Admin edit mode — rule changes feed Scenario Builder (G-12) and Optimum Settlement (G-13). Production changes require regulatory approval workflow.</span>
        </div>
      )}

      {/* ── Summary chips ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          { label: 'Annual banking', count: summaryStats.annual,  ...REGIME_COLOR['annual']  },
          { label: 'Monthly banking', count: summaryStats.monthly, ...REGIME_COLOR['monthly'] },
          { label: 'No banking',      count: summaryStats.none,    ...REGIME_COLOR['none']    },
        ] as { label: string; count: number; bg: string; border: string; text: string }[]).map(c => (
          <div key={c.label} style={{ padding: '5px 12px', borderRadius: 6, background: c.bg, border: `1px solid ${c.border}` }}>
            <span style={{ fontWeight: 700, color: c.text }}>{c.count} </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{c.label}</span>
          </div>
        ))}
        {summaryStats.gf > 0 && (
          <div style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(237,161,0,0.08)', border: '1px solid rgba(237,161,0,0.28)' }}>
            <span style={{ fontWeight: 700, color: '#eda100' }}>{summaryStats.gf} </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>grandfathered</span>
          </div>
        )}
        <div style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-muted)' }}>
          {filtered.length} / {BANKING_RULES.length} rules
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              {[
                'Plant / Source', 'Type', 'State', 'Vtg', 'Regime',
                'Carry-fwd', 'Lapse rule', 'TOD restr.', 'CIK %',
                'Effective from', 'Status', '',
              ].map(h => (
                <th key={h} style={{
                  padding: '7px 10px',
                  textAlign: ['Carry-fwd', 'CIK %', 'Vtg'].includes(h) ? 'right' : h === '' || h === 'TOD restr.' ? 'center' : 'left',
                  color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                  borderBottom: '1px solid var(--color-border)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const rc = REGIME_COLOR[r.regime]
              const isExpanded = expandedId === r.id
              return (
                <React.Fragment key={r.id}>
                  <tr
                    style={{
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.1s',
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    {/* Plant name */}
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.plantName}</span>
                    </td>
                    {/* Type */}
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>
                      <span title={r.sourceType}>{TYPE_ICON[r.sourceType]} {r.sourceType}</span>
                    </td>
                    {/* State */}
                    <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)', fontWeight: 700 }}>
                      {r.state}
                    </td>
                    {/* Vintage */}
                    <td style={{ padding: '8px 10px', color: 'var(--color-text-muted)', textAlign: 'right' }}>
                      {r.vintage}
                    </td>
                    {/* Regime badge */}
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        background: rc.bg, border: `1px solid ${rc.border}`,
                        color: rc.text, fontWeight: 700, fontSize: 10, textTransform: 'capitalize',
                      }}>{r.regime}</span>
                    </td>
                    {/* Carry-fwd % */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                      {r.regime === 'none' ? '—' : `${r.carryForwardPct}%`}
                    </td>
                    {/* Lapse rule */}
                    <td style={{ padding: '8px 10px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {r.lapseRule}
                    </td>
                    {/* TOD restricted */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {r.todRestricted
                        ? <span style={{ color: '#e74c3c', fontWeight: 700, fontSize: 12 }}>Yes</span>
                        : <span style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>No</span>}
                    </td>
                    {/* CIK % */}
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: r.bankingCIK > 0 ? '#eb6834' : 'var(--color-text-muted)' }}>
                      {r.bankingCIK > 0 ? `${r.bankingCIK}%` : '—'}
                    </td>
                    {/* Effective from */}
                    <td style={{ padding: '8px 10px', color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: 10, whiteSpace: 'nowrap' }}>
                      {r.effectiveFrom}
                    </td>
                    {/* Status badge */}
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                        background: `${STATUS_COLOR[r.status]}18`,
                        border: `1px solid ${STATUS_COLOR[r.status]}44`,
                        color: STATUS_COLOR[r.status], fontWeight: 700, fontSize: 9,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>{r.status}</span>
                    </td>
                    {/* Action / expand */}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {editMode
                        ? <button
                            onClick={e => { e.stopPropagation() }}
                            style={{
                              padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
                              background: 'rgba(237,161,0,0.10)', border: '1px solid rgba(237,161,0,0.35)',
                              color: '#eda100',
                            }}>Edit</button>
                        : <span style={{ fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.5 }}>{isExpanded ? '▲' : '▼'}</span>
                      }
                    </td>
                  </tr>

                  {/* Expanded notes row */}
                  {isExpanded && (
                    <tr style={{ background: 'rgba(42,120,214,0.04)' }}>
                      <td colSpan={12} style={{ padding: '6px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 240 }}>
                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                              Regulatory notes
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
                              {r.notes}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            {[
                              { label: 'Carry-forward', value: r.regime === 'none' ? 'n/a' : `${r.carryForwardPct}%` },
                              { label: 'CIK on drawl',  value: r.bankingCIK > 0 ? `${r.bankingCIK}% deducted` : 'nil' },
                              { label: 'TOD restriction', value: r.todRestricted ? 'Yes — off-peak excluded' : 'None' },
                              { label: 'Lapse trigger',  value: r.lapseRule },
                            ].map(item => (
                              <div key={item.label} style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.15)', minWidth: 110 }}>
                                <div style={{ fontSize: 9, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{item.label}</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer legend */}
      <div style={{ marginTop: 14, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          CIK = Charge-in-Kind (% deducted on bank drawl) · TOD restr. = off-peak injection excluded from banking credit
        </span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          {Object.entries(STATUS_COLOR).map(([s, c]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: c }} />
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{s}</span>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          Click any row to expand notes
        </span>
      </div>
    </div>
  )
}
