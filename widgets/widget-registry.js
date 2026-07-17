/**
 * Integrum Energy — Widget Registry
 * Central catalog of all 16 widgets with metadata and lazy-loaded classes.
 * Each widget class extends BaseWidget and handles its own data fetch + render.
 */

export const WIDGET_CATALOG = [
  // ── GENERATION ─────────────────────────────────────────────
  {
    type: 'gen-cons',
    label: 'Generation vs Consumption',
    icon: '⚡',
    span: 3,
    cat: 'Generation',
    description: 'Line chart comparing total RE generation vs facility consumption over time.',
    apiCalls: ['getDailyGeneration'],
    module: () => import('./widgets/GenConsWidget.js'),
  },
  {
    type: 'solar-trend',
    label: 'Solar Generation Trend',
    icon: '☀️',
    span: 2,
    cat: 'Generation',
    description: 'Monthly solar output vs target with irradiance overlay.',
    apiCalls: ['getMonthlyGeneration'],
    module: () => import('./widgets/SolarTrendWidget.js'),
  },
  {
    type: 'wind-trend',
    label: 'Wind Generation Trend',
    icon: '💨',
    span: 2,
    cat: 'Generation',
    description: 'Monthly wind output vs target with wind speed overlay.',
    apiCalls: ['getMonthlyGeneration'],
    module: () => import('./widgets/WindTrendWidget.js'),
  },
  {
    type: 'hybrid-perf',
    label: 'Hybrid Plant Performance',
    icon: '🏭',
    span: 3,
    cat: 'Generation',
    description: 'Side-by-side solar + wind generation per plant vs targets.',
    apiCalls: ['getMonthlyGeneration', 'getPerformanceMetrics'],
    module: () => import('./widgets/HybridPerfWidget.js'),
  },

  // ── FINANCE ───────────────────────────────────────────────
  {
    type: 'bill-analysis',
    label: 'Monthly Bill Analysis (Banking)',
    icon: '🧾',
    span: 2,
    cat: 'Finance',
    description: 'Gross DISCOM bill vs banking credit vs net payable per month.',
    apiCalls: ['getDiscomBills'],
    module: () => import('./widgets/BillAnalysisWidget.js'),
  },
  {
    type: 'cost-analysis',
    label: 'Power Cost Analysis',
    icon: '💹',
    span: 2,
    cat: 'Finance',
    description: 'Grid rate vs RE rate per unit with savings per kWh trend.',
    apiCalls: ['getEffectiveRate', 'getReCost'],
    module: () => import('./widgets/CostAnalysisWidget.js'),
  },
  {
    type: 'cost-summary',
    label: 'Cost Analysis Summary',
    icon: '📋',
    span: 3,
    cat: 'Finance',
    description: 'KPI tiles: total savings, avg rate achieved, banking credits, ROI.',
    apiCalls: ['getSavingsAggregate', 'getEffectiveRate'],
    module: () => import('./widgets/CostSummaryWidget.js'),
  },
  {
    type: 'export-rev',
    label: 'Revenue from Energy Export',
    icon: '💰',
    span: 2,
    cat: 'Finance',
    description: 'Monthly export units and revenue earned from energy sold to grid.',
    apiCalls: ['getPerformanceMetrics'],
    module: () => import('./widgets/ExportRevWidget.js'),
  },
  {
    type: 'financial',
    label: 'Financial Performance Summary',
    icon: '📈',
    span: 3,
    cat: 'Finance',
    description: 'Revenue, OPEX, CapEx, and EBITDA trend — monthly bar + line combo.',
    apiCalls: ['getGridCost', 'getReCost', 'getSavings'],
    module: () => import('./widgets/FinancialWidget.js'),
  },

  // ── ANALYSIS ──────────────────────────────────────────────
  {
    type: 'energy-mix',
    label: 'Energy Mix Analysis',
    icon: '🥧',
    span: 1,
    cat: 'Analysis',
    description: 'Doughnut chart showing Solar / Wind / Grid share of consumption.',
    apiCalls: ['compareGenerationSources'],
    module: () => import('./widgets/EnergyMixWidget.js'),
  },
  {
    type: 'heatmap',
    label: 'Monthly Savings Heatmap',
    icon: '🌡️',
    span: 3,
    cat: 'Analysis',
    description: 'CSS heatmap grid showing savings % across plants × months.',
    apiCalls: ['getSavings'],
    module: () => import('./widgets/HeatmapWidget.js'),
  },
  {
    type: 'grid-ie',
    label: 'Grid Import vs Export',
    icon: '🔄',
    span: 2,
    cat: 'Analysis',
    description: 'Monthly grid import vs export bar chart with net position.',
    apiCalls: ['getBankingMonthlySummary'],
    module: () => import('./widgets/GridImportExportWidget.js'),
  },
  {
    type: 'tariff-comp',
    label: 'State-wise Tariff Comparison',
    icon: '🗺️',
    span: 2,
    cat: 'Analysis',
    description: 'Horizontal bar chart comparing grid tariff vs RE rate by state.',
    apiCalls: [],
    module: () => import('./widgets/TariffCompWidget.js'),
  },

  // ── OPERATIONS ────────────────────────────────────────────
  {
    type: 'peak-demand',
    label: 'Peak Demand Analysis',
    icon: '📡',
    span: 2,
    cat: 'Operations',
    description: 'Hourly demand curve vs contract limit to spot overrun risks.',
    apiCalls: ['getSlotSummary'],
    module: () => import('./widgets/PeakDemandWidget.js'),
  },
  {
    type: 'plant-uf',
    label: 'Plant Utilization Factor',
    icon: '⚙️',
    span: 1,
    cat: 'Operations',
    description: 'Horizontal bar chart of utilization % per plant (color-coded).',
    apiCalls: ['getPlfSummary'],
    module: () => import('./widgets/PlantUtilWidget.js'),
  },
  {
    type: 'banking-util',
    label: 'Banking Utilization Analysis',
    icon: '🏦',
    span: 2,
    cat: 'Operations',
    description: 'Banked vs utilized units per month with running balance line.',
    apiCalls: ['getBankingSettlement', 'getBankingMonthlySummary'],
    module: () => import('./widgets/BankingUtilWidget.js'),
  },
];

// Keyed lookup for fast access by type
export const WIDGET_MAP = Object.fromEntries(WIDGET_CATALOG.map(w => [w.type, w]));

/**
 * Load and instantiate a widget class dynamically.
 * @param {string} type    - widget type key from WIDGET_CATALOG
 * @param {string} domId   - DOM id to bind to
 * @param {object} config  - { plantId, tenantId, dateFrom, dateTo, ... }
 * @returns {Promise<BaseWidget>}
 */
export async function createWidget(type, domId, config = {}) {
  const meta = WIDGET_MAP[type];
  if (!meta) throw new Error(`Unknown widget type: ${type}`);
  const { default: WidgetClass } = await meta.module();
  const widget = new WidgetClass(domId, config);
  await widget.load();
  return widget;
}

export default WIDGET_CATALOG;
