/**
 * gilWidgetRegistry.ts
 * ====================
 * GIL (Wind + Solar hybrid, Maharashtra, MSEDCL) widget catalog.
 * Same shape as widgetRegistry.ts so WidgetLibrary can be reused directly.
 */

import { getSizeLabel, getGridSpan } from './widgetRegistry'
import type { WidgetCategory, WidgetSize } from './widgetRegistry'
export { getSizeLabel, getGridSpan }
export type { WidgetCategory, WidgetSize }

export interface GILWidgetDef {
  id: string
  name: string
  description: string
  category: WidgetCategory
  size: WidgetSize
  icon: string
}

export const GIL_WIDGET_REGISTRY: GILWidgetDef[] = [
  // ── Generation ─────────────────────────────────────────────────
  {
    id: 'gil_kpi',
    name: 'KPI Overview',
    description: 'Wind + Solar generation, consumption, savings and cost KPIs',
    category: 'Generation',
    size: 'full',
    icon: '🎯',
  },
  {
    id: 'gil_daily_gen',
    name: 'Daily Generation',
    description: 'Day-by-day Wind + Solar stacked vs Consumption for the month',
    category: 'Generation',
    size: 'full',
    icon: '⚡',
  },
  {
    id: 'gil_monthly_summary',
    name: 'Monthly Generation Summary',
    description: 'Rolling 13-month Wind, Solar and Consumption trend',
    category: 'Generation',
    size: 'full',
    icon: '📅',
  },
  {
    id: 'gil_wind_solar_split',
    name: 'Wind vs Solar Split',
    description: '13-month breakdown of Wind vs Solar contribution',
    category: 'Generation',
    size: '2col',
    icon: '🌬️',
  },
  {
    id: 'gil_gen_losses',
    name: 'Generation Losses',
    description: 'Before-loss vs after-loss generation, Wind and Solar breakdown',
    category: 'Generation',
    size: '2col',
    icon: '📉',
  },

  // ── Finance ────────────────────────────────────────────────────
  {
    id: 'gil_discom_bill',
    name: 'MSEDCL Bill Breakdown',
    description: 'DISCOM bill line items: energy charges, demand, wheeling, FAC',
    category: 'Finance',
    size: 'full',
    icon: '🧾',
  },
  {
    id: 'gil_re_costs',
    name: 'RE Plant Costs',
    description: 'Asset maintenance, MSEDCL charges, O&M and other RE cost components',
    category: 'Finance',
    size: '2col',
    icon: '💰',
  },
  {
    id: 'gil_cost_comparison',
    name: 'Cost Comparison Trend',
    description: 'Grid cost vs actual RE cost vs monthly savings over 13 months',
    category: 'Finance',
    size: 'full',
    icon: '📊',
  },
  {
    id: 'gil_savings_heatmap',
    name: 'Savings Heatmap',
    description: 'All-months savings % and cost summary bar + table',
    category: 'Finance',
    size: 'full',
    icon: '🌡️',
  },

  // ── Analysis ───────────────────────────────────────────────────
  {
    id: 'gil_tod_analysis',
    name: 'MSEDCL TOD Analysis',
    description: 'PEAK / NORMAL / OFF-PEAK slot breakdown for the selected month',
    category: 'Analysis',
    size: '2col',
    icon: '🕐',
  },
  {
    id: 'gil_banking',
    name: '3-Tier Banking Settlement',
    description: 'Daily TOD → Monthly TOD → Intra-monthly banking waterfall',
    category: 'Analysis',
    size: 'full',
    icon: '🏦',
  },

  // ── Operations ─────────────────────────────────────────────────
  {
    id: 'gil_turbine_perf',
    name: 'Turbine & Inverter Performance',
    description: 'Per-device annual generation: 9 wind turbines + 4 solar inverters',
    category: 'Operations',
    size: 'full',
    icon: '🔧',
  },
  {
    id: 'gil_perf_metrics',
    name: 'Performance Metrics',
    description: 'Annual PLF, CUF, PR and loss % for the selected financial year',
    category: 'Operations',
    size: '2col',
    icon: '⚙️',
  },
]

export const GIL_WIDGET_MAP = Object.fromEntries(GIL_WIDGET_REGISTRY.map(w => [w.id, w]))

export const GIL_CATEGORIES: WidgetCategory[] = ['Generation', 'Finance', 'Analysis', 'Operations']

export const GIL_CATEGORY_ICONS: Record<WidgetCategory, string> = {
  Generation: '⚡',
  Finance:    '💹',
  Analysis:   '🔬',
  Operations: '⚙️',
}
