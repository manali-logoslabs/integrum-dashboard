/**
 * Chart15AIInsightLayer.tsx — Graph 15
 * AI Insight & Anomaly Layer (standalone tile)
 *
 * Shows AI-generated conclusions + anomaly triggers per chart.
 * Each insight card has an 'Investigate' deep-link hint.
 * Anomaly types: spike, drop, deviation, threshold-breach, trend-reversal
 */
import React, { useState, useMemo } from 'react'

// ── RNG (seeded, stable) ───────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Severity = 'critical' | 'warning' | 'info' | 'ok'
type AnomalyType = 'spike' | 'drop' | 'deviation' | 'threshold-breach' | 'trend-reversal' | 'none'

interface Insight {
  chartId:     string
  chartLabel:  string
  chartIcon:   string
  severity:    Severity
  anomalyType: AnomalyType
  headline:    string
  detail:      string
  question:    string       // surfaced question to user
  drillPath:   string       // deep-link label
  metric:      string       // affected metric
  delta:       string       // quantified change
  timestamp:   string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function prevMonthStr(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return new Date((y ?? 2026), (mo ?? 6) - 1, 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// ── Mock insight generation ───────────────────────────────────────────────────
const CHART_META: { id: string; label: string; icon: string }[] = [
  { id: 'graph-1',  label: 'Portfolio Consumption', icon: '📊' },
  { id: 'graph-2',  label: 'Unit Time Series',       icon: '📈' },
  { id: 'graph-3',  label: 'Demand vs CD',           icon: '⚡' },
  { id: 'graph-4',  label: 'Demand Duration',        icon: '📉' },
  { id: 'graph-5',  label: 'Power Factor',           icon: '🔋' },
  { id: 'graph-6',  label: 'Generation by TOD',      icon: '☀️' },
  { id: 'graph-7',  label: 'CUF / PLF Tiles',        icon: '🔆' },
  { id: 'graph-8',  label: 'Settled Consumption',    icon: '🏦' },
  { id: 'graph-9',  label: 'Settlement Mapping',     icon: '🔗' },
  { id: 'graph-10', label: 'Losses Waterfall',        icon: '🌊' },
  { id: 'graph-11', label: 'Banking Rules',           icon: '📋' },
  { id: 'graph-12', label: 'Banking Scenarios',       icon: '🔀' },
  { id: 'graph-13', label: 'Optimum Settlement',      icon: '⚙️' },
  { id: 'graph-14', label: 'C9 KPI Tiles',            icon: '🎯' },
]

const SEVERITY_POOL: Severity[] = ['critical', 'warning', 'info', 'ok']
const ANOMALY_POOL: AnomalyType[] = ['spike', 'drop', 'deviation', 'threshold-breach', 'trend-reversal', 'none']

function buildInsight(chartId: string, chartLabel: string, chartIcon: string, month: string): Insight {
  const [y, m] = month.split('-').map(Number)
  const seed = chartId.charCodeAt(chartId.length - 1) * 71 + (y ?? 2026) * 100 + (m ?? 6)

  const sevIdx  = Math.floor(rng(seed + 1) * 4)
  const anomIdx = Math.floor(rng(seed + 2) * 6)
  const severity    = SEVERITY_POOL[sevIdx]!
  const anomalyType = ANOMALY_POOL[anomIdx]!

  const deltaPct = (5 + rng(seed + 3) * 22).toFixed(1)
  const deltaMWh = (8 + rng(seed + 4) * 40).toFixed(1)

  type InsightTemplate = {
    headline: string; detail: string; question: string
    drillPath: string; metric: string; delta: string
  }

  const templates: Record<string, InsightTemplate> = {
    'graph-1': {
      headline: severity === 'ok'
        ? 'Consumption within expected range'
        : `KA consumption ${anomalyType === 'spike' ? 'spike' : 'drop'} detected`,
      detail: severity === 'ok'
        ? `Portfolio consumption tracked within ±3% of the 3-month rolling average for ${formatMonthLabel(month)}.`
        : `Karnataka consumption rose ${deltaPct}% above the seasonal baseline — highest since Feb. BTM share declined ${(+deltaPct * 0.4).toFixed(1)}pp.`,
      question: 'Was there a scheduled shutdown at the Pavagada plant?',
      drillPath: 'Portfolio Consumption → State drill → KA',
      metric: 'KA consumption', delta: `+${deltaPct}%`,
    },
    'graph-3': {
      headline: severity === 'critical' ? 'CD exceedance on 3 days this month' : 'Demand within CD limits',
      detail: severity === 'critical'
        ? `Peak demand breached contract demand (820 kVA) on ${Math.floor(rng(seed + 5) * 3) + 2} days. Max recorded: ${(820 + rng(seed + 6) * 80).toFixed(0)} kVA. Penalty risk: ₹${(rng(seed + 7) * 1.5 + 0.5).toFixed(1)} lakh.`
        : `No CD exceedance events in ${formatMonthLabel(month)}. Demand utilization stable at ${(65 + rng(seed + 8) * 15).toFixed(0)}%.`,
      question: 'Which hours saw exceedance — can we shift load to off-peak?',
      drillPath: 'Demand vs CD → Exceedance heatmap',
      metric: 'Peak demand', delta: `+${deltaMWh} kVA over CD`,
    },
    'graph-5': {
      headline: severity === 'warning' ? 'Power factor dipped below 0.90 threshold' : 'Power factor healthy',
      detail: severity === 'warning'
        ? `Avg PF fell to ${(0.87 + rng(seed + 9) * 0.03).toFixed(3)} — below BESCOM threshold of 0.90. Potential surcharge: ₹${(rng(seed + 10) * 0.8 + 0.2).toFixed(1)} lakh on next bill.`
        : `Average PF held at ${(0.93 + rng(seed + 9) * 0.05).toFixed(3)} — well above the 0.90 BESCOM threshold.`,
      question: 'Is the capacitor bank at Unit KA-02 underperforming?',
      drillPath: 'Power Factor → Monthly trend → Unit drill',
      metric: 'Avg PF', delta: `−${(rng(seed + 11) * 0.06).toFixed(3)}`,
    },
    'graph-7': {
      headline: severity === 'warning' ? 'Pavagada CUF below target (25%)' : 'CUF within normal range',
      detail: severity === 'warning'
        ? `Pavagada Solar CUF: ${(18 + rng(seed + 12) * 4).toFixed(1)}% — below 25% target. Likely cause: above-average cloud cover (monsoon effect). FY-to-date still on track.`
        : `All units reporting CUF above 22%. Bellary Wind leading at ${(28 + rng(seed + 12) * 6).toFixed(1)}% this month.`,
      question: 'Has the inverter availability report been reviewed?',
      drillPath: 'CUF Tiles → Unit drill → Pavagada',
      metric: 'Pavagada CUF', delta: `−${deltaPct}% vs target`,
    },
    'graph-10': {
      headline: severity === 'critical' ? 'Lapsed units above acceptable threshold' : 'Loss waterfall within norms',
      detail: severity === 'critical'
        ? `${deltaMWh} MWh lapsed this month — ${deltaPct}% above the 5 MWh monthly ceiling. Root cause: annual banking balance not drawn down before month-end.`
        : `Total losses (Tx + wheeling + CIK + lapse) at ${(4.2 + rng(seed + 13) * 1.5).toFixed(1)}% of gross gen — within the 6% target.`,
      question: 'Can we pre-schedule banking drawl before month close?',
      drillPath: 'Losses Waterfall → Lapsed segment → Unit drill',
      metric: 'Lapsed MWh', delta: `+${deltaMWh} MWh`,
    },
  }

  // Generic template for charts without a specific one
  const genericTemplates: InsightTemplate[] = [
    {
      headline: severity === 'ok' ? 'No anomalies detected' : `${anomalyType.replace('-', ' ')} detected`,
      detail: severity === 'ok'
        ? `All metrics for ${chartLabel} tracked within expected bounds in ${formatMonthLabel(month)}.`
        : `A ${anomalyType.replace('-', ' ')} was detected in ${chartLabel}. Deviation: ${deltaPct}% from baseline. Review recommended.`,
      question: `What drove the ${anomalyType.replace('-', ' ')} in ${chartLabel}?`,
      drillPath: `${chartLabel} → Detail view`,
      metric: 'Key metric', delta: `±${deltaPct}%`,
    },
  ]

  const t = templates[chartId] ?? genericTemplates[0]!
  const now = new Date()
  const timestamp = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) +
    ' · ' + now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

  return {
    chartId, chartLabel, chartIcon, severity, anomalyType,
    headline:   t.headline,
    detail:     t.detail,
    question:   t.question,
    drillPath:  t.drillPath,
    metric:     t.metric,
    delta:      t.delta,
    timestamp,
  }
}

// ── Severity config ───────────────────────────────────────────────────────────
const SEV: Record<Severity, { color: string; bg: string; border: string; icon: string; label: string }> = {
  critical: { color: '#e74c3c', bg: 'rgba(231,76,60,0.10)', border: 'rgba(231,76,60,0.35)', icon: '🔴', label: 'Critical' },
  warning:  { color: '#eda100', bg: 'rgba(237,161,0,0.10)',  border: 'rgba(237,161,0,0.35)',  icon: '🟡', label: 'Warning'  },
  info:     { color: '#2a78d6', bg: 'rgba(42,120,214,0.10)', border: 'rgba(42,120,214,0.35)', icon: '🔵', label: 'Info'     },
  ok:       { color: '#1baf7a', bg: 'rgba(27,175,122,0.08)', border: 'rgba(27,175,122,0.25)', icon: '🟢', label: 'OK'       },
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 12, padding: 20,
}
const SEL: React.CSSProperties = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 6, padding: '4px 8px',
  color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
}

// ── Insight card ──────────────────────────────────────────────────────────────
function InsightCard({ insight, expanded, onToggle }: {
  insight: Insight
  expanded: boolean
  onToggle: () => void
}) {
  const sev = SEV[insight.severity]

  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden',
      background: sev.bg, border: `1px solid ${sev.border}`,
      transition: 'all 0.15s',
    }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        {/* Severity dot */}
        <span style={{ fontSize: 10 }}>{sev.icon}</span>

        {/* Chart icon + label */}
        <span style={{ fontSize: 13 }}>{insight.chartIcon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', flex: 1, lineHeight: 1.3 }}>
          {insight.chartLabel}
        </span>

        {/* Severity badge */}
        <span style={{
          fontSize: 9, fontWeight: 700, color: sev.color,
          background: `${sev.color}18`, border: `1px solid ${sev.color}40`,
          borderRadius: 3, padding: '1px 6px', letterSpacing: 0.5, flexShrink: 0,
        }}>
          {sev.label.toUpperCase()}
        </span>

        {/* Expand chevron */}
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 4 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Headline always visible */}
      <div style={{
        padding: '0 14px 10px', fontSize: 11, fontWeight: 700,
        color: insight.severity === 'ok' ? '#1baf7a' : sev.color,
        lineHeight: 1.4,
      }}>
        {insight.headline}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${sev.border}` }}>
          {/* Detail */}
          <p style={{ margin: '10px 0 8px', fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            {insight.detail}
          </p>

          {/* Metric delta badge */}
          {insight.severity !== 'ok' && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
              padding: '4px 10px', borderRadius: 20,
              background: `${sev.color}18`, border: `1px solid ${sev.color}30`,
            }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{insight.metric}:</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: sev.color }}>{insight.delta}</span>
            </div>
          )}

          {/* Surfaced question */}
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 10,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)',
          }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              💬 Suggested question
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontStyle: 'italic', lineHeight: 1.5 }}>
              "{insight.question}"
            </div>
          </div>

          {/* Investigate link */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
              Updated {insight.timestamp}
            </span>
            <button style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
              background: `${sev.color}20`, border: `1px solid ${sev.color}50`,
              color: sev.color, display: 'flex', alignItems: 'center', gap: 5,
            }}
              title={`Drill path: ${insight.drillPath}`}
            >
              🔍 Investigate → {insight.drillPath.split('→')[0]?.trim()}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
type FilterSev = 'all' | Severity

export default function Chart15AIInsightLayer() {
  const [month, setMonth]       = useState(prevMonthStr)
  const [filter, setFilter]     = useState<FilterSev>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const insights = useMemo(
    () => CHART_META.map(c => buildInsight(c.id, c.label, c.icon, month)),
    [month],
  )

  const filtered = filter === 'all' ? insights : insights.filter(i => i.severity === filter)

  const counts = {
    critical: insights.filter(i => i.severity === 'critical').length,
    warning:  insights.filter(i => i.severity === 'warning').length,
    info:     insights.filter(i => i.severity === 'info').length,
    ok:       insights.filter(i => i.severity === 'ok').length,
  }

  const hasAlert = counts.critical > 0 || counts.warning > 0

  return (
    <div style={CARD}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            🤖 AI Insight & Anomaly Layer
            {hasAlert && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#e74c3c',
                background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.35)',
                borderRadius: 10, padding: '2px 7px',
              }}>
                {counts.critical + counts.warning} alert{counts.critical + counts.warning !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
            AI-generated conclusions + anomaly triggers · {formatMonthLabel(month)} · Click any card to investigate
          </div>
        </div>
        <input
          type="month" value={month} min="2025-04" max={currentMonth()}
          onChange={e => setMonth(e.target.value)} style={SEL}
        />
      </div>

      {/* ── Summary chips ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setFilter('all')} style={{
          padding: '5px 14px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
          background: filter === 'all' ? 'rgba(255,255,255,0.12)' : 'transparent',
          border: `1px solid ${filter === 'all' ? 'rgba(255,255,255,0.4)' : 'var(--color-border)'}`,
          color: filter === 'all' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          fontWeight: filter === 'all' ? 700 : 400,
        }}>
          All ({insights.length})
        </button>
        {(Object.entries(counts) as [Severity, number][]).map(([sev, cnt]) => {
          const s = SEV[sev]
          return (
            <button key={sev} onClick={() => setFilter(sev)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
              background: filter === sev ? s.bg : 'transparent',
              border: `1px solid ${filter === sev ? s.border : 'var(--color-border)'}`,
              color: filter === sev ? s.color : 'var(--color-text-muted)',
              fontWeight: filter === sev ? 700 : 400,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {s.icon} {s.label} ({cnt})
            </button>
          )
        })}
      </div>

      {/* ── AI disclaimer ── */}
      <div style={{
        marginBottom: 14, padding: '6px 12px', borderRadius: 6,
        background: 'rgba(42,120,214,0.07)', border: '1px solid rgba(42,120,214,0.25)',
        fontSize: 10, color: 'var(--color-text-muted)', display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <span>ℹ️</span>
        Insights are generated by a rule-based anomaly engine on mock data. In production, this will call the Claude API with live metering data.
      </div>

      {/* ── Insight cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-muted)', fontSize: 12 }}>
            No insights for this filter.
          </div>
        )}
        {filtered.map(ins => (
          <InsightCard
            key={ins.chartId}
            insight={ins}
            expanded={expanded === ins.chartId}
            onToggle={() => setExpanded(expanded === ins.chartId ? null : ins.chartId)}
          />
        ))}
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
          {insights.filter(i => i.severity === 'ok').length} of {insights.length} charts healthy
        </span>
        <button
          onClick={() => setExpanded(null)}
          style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 10, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          Collapse all
        </button>
      </div>
    </div>
  )
}
