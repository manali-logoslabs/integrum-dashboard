/**
 * InsightCard.tsx
 *
 * AI insight + anomaly strip rendered below each chart card on the canvas.
 *
 * Produces per-graph, per-period seeded insight text + anomaly severity.
 * "Investigate" deep-link scrolls to the target chart and highlights it.
 *
 * In production this would call an LLM endpoint; here we use a
 * deterministic seeded text pool so the dashboard stays self-contained.
 */
import React, { useState } from 'react'

// ── RNG ───────────────────────────────────────────────────────────────────────
function rng(s: number): number {
  const x = Math.sin(s * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(rng(seed) * arr.length)]!
}

// ── Insight templates per graph ───────────────────────────────────────────────
type Severity = 'anomaly' | 'warning' | 'info'

interface InsightTemplate {
  severity: Severity
  text:     string
  investigateLabel?: string   // label for deep-link; omit to hide
  investigateTarget?: string  // graph-id to scroll to
}

// Pool keyed by graph-id; multiple templates per graph
const INSIGHT_POOL: Record<string, InsightTemplate[]> = {
  'graph-1': [
    { severity: 'anomaly', text: 'Karnataka consumption spiked +18% vs the trailing 3-month average — driven by a 22% increase in Grid drawl. Check scheduling adherence for the same period.', investigateLabel: 'Check Grid drawl →', investigateTarget: 'graph-8' },
    { severity: 'info',    text: 'Portfolio consumption is within ±5% of the 6-month trend. OA share held steady at 46%.', },
    { severity: 'warning', text: 'Maharashtra BTM contribution dropped below 10% — verify rooftop meter data is complete.', investigateLabel: 'Inspect BTM source →', investigateTarget: 'graph-6' },
  ],
  'graph-2': [
    { severity: 'info',    text: 'Peak demand for the selected unit occurred on the 14th at 17:45 — aligns with evening TOD peak window (18–22 h).', },
    { severity: 'anomaly', text: 'Two back-to-back zero-generation hours detected on the 9th (13:00–14:00). Possible curtailment or meter gap.', investigateLabel: 'View losses →', investigateTarget: 'graph-10' },
    { severity: 'warning', text: 'Daily profile shows generation falling 12% short of contractual schedule on 6 out of 30 days.', },
  ],
  'graph-3': [
    { severity: 'anomaly', text: 'Contract demand was breached on 3 separate 15-min blocks — peak exceedance reached 108% of CD. This may trigger penalty clauses.', investigateLabel: 'See demand duration →', investigateTarget: 'graph-4' },
    { severity: 'info',    text: 'Demand stayed within 95% of CD across all blocks. No exceedances detected this period.', },
    { severity: 'warning', text: 'Heatmap shows consistent demand spikes in the 09:00–10:00 band — overlaps with shift start. Consider staggered startup schedules.', },
  ],
  'graph-4': [
    { severity: 'info',    text: 'Load factor for the period: 64%. A BESS of ~2 MWh would have shaved the top 5% of demand blocks, reducing peak CD by ~8%.', },
    { severity: 'warning', text: 'Demand duration curve shows 12% of blocks above 90% CD — sustained high utilization increases transformation stress.', investigateLabel: 'Check PF →', investigateTarget: 'graph-5' },
    { severity: 'anomaly', text: 'Exceedance blocks increased 3× compared to the prior month. Investigate new load additions.', },
  ],
  'graph-5': [
    { severity: 'anomaly', text: 'Average power factor dipped to 0.89 — below the BESCOM penalty threshold of 0.90. Verify capacitor bank operation.', investigateLabel: 'Review demand →', investigateTarget: 'graph-3' },
    { severity: 'info',    text: 'Power factor held above 0.96 all month — no penalty exposure. Billed PF closely matches metered PF (Δ < 0.01).', },
    { severity: 'warning', text: 'Two units showed billed PF diverging >2% from metered PF. Raise a meter-audit flag.', },
  ],
  'graph-6': [
    { severity: 'info',    text: 'Off-peak generation (22–06 h) contributed 28% of total generation — this is banking-eligible surplus. Verify scheduling instructions are submitted.', },
    { severity: 'warning', text: 'TOD-restricted plants (Bellary Wind) generated 14% of output in restricted hours — check if KERC exemption is in place.', investigateLabel: 'Review banking rules →', investigateTarget: 'graph-11' },
    { severity: 'anomaly', text: 'Peak-hour generation (18–22 h) dropped 31% MoM — likely cloud cover or curtailment. Loss attribution needed.', investigateLabel: 'See waterfall →', investigateTarget: 'graph-10' },
  ],
  'graph-7': [
    { severity: 'warning', text: 'Pavagada Solar CUF fell to 19.2% against a 6-month baseline of 23.8%. Review O&M logs for soiling or inverter faults.', },
    { severity: 'info',    text: 'Portfolio CUF of 24.6% is above the FY target of 22%. FY-to-date CUF remains on track.', },
    { severity: 'anomaly', text: 'Bellary Wind CUF at 12.1% — well below seasonal norm of 18%. Check anemometer and wake-loss data.', investigateLabel: 'Inspect TOD generation →', investigateTarget: 'graph-6' },
  ],
  'graph-8': [
    { severity: 'info',    text: 'OA settled units exceeded BTM + Grid by 4.2× — strong renewable penetration at 82% of total consumption.', },
    { severity: 'warning', text: 'Grid drawl share in Telangana rose to 38% — above the target of <25%. Banking balance may be depleted.', investigateLabel: 'Check banking balance →', investigateTarget: 'graph-11' },
    { severity: 'anomaly', text: 'Post-banking settled units are 11% lower than pre-banking — unusually high CIK deduction. Verify billing statement.', investigateLabel: 'See waterfall →', investigateTarget: 'graph-10' },
  ],
  'graph-9': [
    { severity: 'info',    text: 'Settlement mapping is balanced — each consuming unit has a matched generating unit with <3% unallocated surplus.', },
    { severity: 'warning', text: 'U-KA-02 (Bellary Wind) has 18 MWh unmatched surplus routed to banking. Confirm banking slot was acknowledged by BESCOM.', },
    { severity: 'anomaly', text: 'Historical trend shows a step-change in Grid drawl for U-TS-01 starting the 3rd week — correlate with any meter replacement.', investigateLabel: 'View time series →', investigateTarget: 'graph-2' },
  ],
  'graph-10': [
    { severity: 'anomaly', text: 'Banking CIK losses increased to 8.2% this month vs the contractual 5% cap — raise a dispute with BESCOM billing.', investigateLabel: 'Review banking rules →', investigateTarget: 'graph-11' },
    { severity: 'info',    text: 'Net settled / gross generation ratio: 87.4% — within the expected 85–90% range after accounting for Tx losses and wheeling.', },
    { severity: 'warning', text: '4.1 MWh lapsed at FY end — highest single-month lapse this year. Consider accelerating drawl in Q4.', investigateLabel: 'Run banking scenario →', investigateTarget: 'graph-12' },
  ],
  'graph-11': [
    { severity: 'info',    text: 'All active banking rules are current. 1 grandfathered PPA (Pavagada GF tranche) expires in Mar 2027 — plan renegotiation.', },
    { severity: 'warning', text: 'Proposed TS Solar rule has been in "proposed" status for 3 months — escalate to state nodal agency for approval.', },
    { severity: 'anomaly', text: 'CIK rate mismatch detected: billing shows 6.1% for KA plants vs the contracted 5%. Raise a billing query.', investigateLabel: 'Check scenario impact →', investigateTarget: 'graph-12' },
  ],
  'graph-12': [
    { severity: 'info',    text: 'Under the current annual banking regime, indicative cost is ₹12.4 L/month. Switching to monthly-all would increase costs by ~₹1.8 L.', },
    { severity: 'warning', text: 'A +3% CIK increase scenario adds ₹0.9 L/month to portfolio costs — equivalent to 3.2 additional MWh of grid drawl.', investigateLabel: 'See optimum settlement →', investigateTarget: 'graph-13' },
    { severity: 'anomaly', text: 'No-banking scenario shows grid drawl would increase by 143 MWh — a ₹12.5 L cost penalty. Maintain banking continuity.', },
  ],
  'graph-13': [
    { severity: 'info',    text: 'Min-cost dispatch saves an estimated ₹2.1 L vs grid-first. BTM and OA solar are being fully utilised before banking drawl.', },
    { severity: 'warning', text: 'Banking balance for U-KA-01 is 34 MWh — below the recommended 60 MWh buffer. Accelerate drawl or reduce surplus banking.', investigateLabel: 'Review banking rules →', investigateTarget: 'graph-11' },
    { severity: 'anomaly', text: 'Max-banking objective results in 22 MWh lapsed — banking account is near capacity. Review lapse clause timing.', },
  ],
  'graph-14': [
    { severity: 'anomaly', text: 'CD Utilization hit 94% — in the WARNING band. Two more blocks above 95% would trigger an automatic demand-reduction alert.', investigateLabel: 'See demand duration →', investigateTarget: 'graph-4' },
    { severity: 'info',    text: 'All 9 KPIs are within target this month. Portfolio CUF at 24.6% is above FY target; PF at 0.963 avoids penalty.', },
    { severity: 'warning', text: 'Banking Balance at 58 MWh — approaching the minimum comfort threshold of 50 MWh with 3 months left in FY.', investigateLabel: 'Run banking scenario →', investigateTarget: 'graph-12' },
  ],
}

// ── Severity config ───────────────────────────────────────────────────────────
const SEV: Record<Severity, { icon: string; color: string; bg: string; border: string; label: string }> = {
  anomaly: { icon: '🔴', color: '#e74c3c', bg: 'rgba(231,76,60,0.08)',   border: 'rgba(231,76,60,0.3)',   label: 'Anomaly detected' },
  warning: { icon: '🟡', color: '#eda100', bg: 'rgba(237,161,0,0.08)',   border: 'rgba(237,161,0,0.3)',   label: 'Watch' },
  info:    { icon: '🟢', color: '#1baf7a', bg: 'rgba(27,175,122,0.08)',  border: 'rgba(27,175,122,0.3)',  label: 'On track' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function insightForGraph(graphId: string, period: string): InsightTemplate {
  const pool = INSIGHT_POOL[graphId]
  if (!pool) return { severity: 'info', text: 'No insight available for this chart.' }
  const [y, m] = period.split('-').map(Number)
  const seed   = graphId.charCodeAt(graphId.length - 1) * 17 + (y ?? 2026) * 100 + (m ?? 6)
  return pick(pool, seed)
}

// ── Component ─────────────────────────────────────────────────────────────────
interface InsightCardProps {
  graphId:     string
  period:      string    // YYYY-MM
  onInvestigate?: (targetGraphId: string) => void
}

export default function InsightCard({ graphId, period, onInvestigate }: InsightCardProps) {
  const [expanded, setExpanded] = useState(false)
  const insight = insightForGraph(graphId, period)
  const cfg     = SEV[insight.severity]

  return (
    <div
      style={{
        marginTop: 6,
        padding: '8px 14px',
        borderRadius: '0 0 10px 10px',
        background: cfg.bg,
        borderLeft: `3px solid ${cfg.color}`,
        borderRight: `1px solid ${cfg.border}`,
        borderBottom: `1px solid ${cfg.border}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        transition: 'background 0.2s',
      }}
    >
      {/* Severity dot */}
      <div style={{ marginTop: 1, flexShrink: 0 }}>
        <span style={{ fontSize: 10 }}>{cfg.icon}</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, color: cfg.color,
            textTransform: 'uppercase' as const, letterSpacing: '0.07em',
          }}>
            AI Insight · {cfg.label}
          </span>
        </div>

        <div style={{
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.6,
          display: expanded ? 'block' : '-webkit-box',
          WebkitLineClamp: expanded ? undefined : 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: expanded ? 'visible' : 'hidden',
        }}>
          {insight.text}
        </div>

        {/* Actions row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 5 }}>
          {insight.text.length > 120 && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: 'none', border: 'none', padding: 0,
                fontSize: 10, color: 'var(--color-text-muted)',
                cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}

          {insight.investigateLabel && insight.investigateTarget && onInvestigate && (
            <button
              onClick={() => onInvestigate(insight.investigateTarget!)}
              style={{
                background: 'none', border: 'none', padding: 0,
                fontSize: 10, color: cfg.color,
                cursor: 'pointer', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              {insight.investigateLabel}
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            Indicative · AI-generated
          </span>
        </div>
      </div>
    </div>
  )
}
