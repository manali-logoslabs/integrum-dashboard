/**
 * widgetRegistry.ts
 * =================
 * Complete catalog of all available widgets for the C9 dashboard.
 * Maps widget IDs to metadata, chart components, and API endpoints.
 */

export type WidgetSize = 'full' | '2col' | '1col'
export type WidgetCategory = 'Generation' | 'Finance' | 'Analysis' | 'Operations'

export interface WidgetDef {
  id: string
  name: string
  description: string
  category: WidgetCategory
  size: WidgetSize
  icon: string
  chartId?: number   // C9 chart number
  endpoint?: string  // API endpoint (relative, no /api/c9 prefix)
}

export const WIDGET_REGISTRY: WidgetDef[] = [
  // ── Generation ─────────────────────────────────────────────────
  {
    id: 'gen_cons_daily',
    name: 'Generation vs Consumption',
    description: 'Daily 31-day generation, consumption and settlement bar/line chart',
    category: 'Generation',
    size: 'full',
    icon: '⚡',
    chartId: 1,
    endpoint: 'daily-summary',
  },
  {
    id: 'tod_analysis',
    name: 'TOD Slot Analysis',
    description: 'Morning Peak, Day Normal, Evening Peak, Night Off-Peak breakdown',
    category: 'Generation',
    size: '2col',
    icon: '🕐',
    chartId: 4,
    endpoint: 'tod-analysis',
  },
  {
    id: 'heatmap_24h',
    name: '24h × 7-day Heatmap',
    description: 'Average hourly generation/consumption pattern by day-of-week',
    category: 'Generation',
    size: 'full',
    icon: '🗓️',
    chartId: 15,
    endpoint: 'heatmap',
  },
  {
    id: 'surplus_flow',
    name: 'Surplus & Absorption',
    description: 'Energy flow: Generation → Direct Match → Banking → Surplus Lapsed',
    category: 'Generation',
    size: 'full',
    icon: '🔄',
    chartId: 11,
    endpoint: 'surplus-absorption',
  },

  // ── Finance ────────────────────────────────────────────────────
  {
    id: 'banking_cost',
    name: 'Monthly Bill (With/Without Banking)',
    description: 'Per-unit cost comparison: with banking vs without banking benefits',
    category: 'Finance',
    size: '2col',
    icon: '🏦',
    chartId: 5,
    endpoint: 'unit-savings',
  },
  {
    id: 'power_cost',
    name: 'Power Cost Analysis',
    description: 'Grid cost vs actual cost with solar wheeling, per unit',
    category: 'Finance',
    size: '2col',
    icon: '💰',
    chartId: 2,
    endpoint: 'unit-savings',
  },
  {
    id: 'discom_bill',
    name: 'DISCOM Bill Breakdown',
    description: 'Bill line items per unit: energy, demand, FAC, wheeling charges',
    category: 'Finance',
    size: 'full',
    icon: '🧾',
    chartId: 6,
    endpoint: 'discom-bill',
  },
  {
    id: 'unit_summary',
    name: 'Financial Performance Summary',
    description: 'Per-unit summary table: consumption, savings, replacement %, cost',
    category: 'Finance',
    size: 'full',
    icon: '📊',
    chartId: 7,
    endpoint: 'unit-savings',
  },

  // ── Analysis ───────────────────────────────────────────────────
  {
    id: 'savings_heatmap',
    name: 'Monthly Savings Heatmap',
    description: 'Heat-map of savings % across all units × all months',
    category: 'Analysis',
    size: 'full',
    icon: '🌡️',
    chartId: 3,
    endpoint: 'unit-savings',
  },
  {
    id: 'wheeling_recon',
    name: 'Wheeling Reconciliation',
    description: 'Proposed vs actual wheeled units; coverage gap per unit',
    category: 'Analysis',
    size: '2col',
    icon: '⚖️',
    chartId: 10,
    endpoint: 'wheeling-recon',
  },

  // ── Operations ─────────────────────────────────────────────────
  {
    id: 'banking_loss',
    name: 'Banking Loss Analysis',
    description: 'Gross banked, 8% loss, net settled, expired per unit per month',
    category: 'Operations',
    size: '2col',
    icon: '📉',
    chartId: 8,
    endpoint: 'banking-loss',
  },
  {
    id: 'kpi_cards',
    name: 'KPI Overview Cards',
    description: 'Monthly totals: generation, consumption, matched, savings',
    category: 'Operations',
    size: 'full',
    icon: '🎯',
    endpoint: 'kpi-summary',
  },
]

export const WIDGET_MAP = Object.fromEntries(WIDGET_REGISTRY.map(w => [w.id, w]))

export const CATEGORIES: WidgetCategory[] = ['Generation', 'Finance', 'Analysis', 'Operations']

export const CATEGORY_ICONS: Record<WidgetCategory, string> = {
  Generation: '⚡',
  Finance:    '💹',
  Analysis:   '🔬',
  Operations: '⚙️',
}

export function getSizeLabel(size: WidgetSize): string {
  return size === 'full' ? 'Full' : size === '2col' ? '2 col' : '1 col'
}

export function getGridSpan(size: WidgetSize): number {
  return size === 'full' ? 4 : size === '2col' ? 2 : 1
}
