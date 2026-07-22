/**
 * api/client.ts
 * Axios instance + typed request helpers for all dashboard endpoints.
 */
import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

const http = axios.create({
  baseURL: API_BASE,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── C9 Types ───────────────────────────────────────────────────────────────

export interface DailySummaryRow {
  date:             string
  generation_kwh:   number
  consumption_kwh:  number
  matched_kwh:      number
  banking_kwh:      number
  grid_kwh:         number
}

export interface UnitSavingsRow {
  unit:                        string
  unit_code:                   string
  grid_cost:                   number
  actual_cost_with_banking:    number
  actual_cost_without_banking: number
  savings_with_banking:        number
  savings_without_banking:     number
  savings_pct_with_banking:    number
  savings_pct_without_banking: number
  consumption_kwh:             number
  matched_kwh:                 number
  banking_kwh:                 number
  surplus_kwh:                 number
  grid_drawl_kwh:              number
  replacement_pct:             number
}

export interface TodRow {
  tod_slot:            string
  slot_label?:         string
  multiplier?:         number
  generation_kwh:      number
  consumption_kwh:     number
  direct_matched_kwh?: number
  cost_savings_inr?:   number
}

export interface DiscomBillRow {
  unit_name:           string
  unit_code:           string
  gross_amount_inr:    number
  net_payable_inr:     number
  savings_inr:         number
  total_units_kwh:     number
  energy_rate_per_kwh: number | null
  energy_charge_inr:   number | null
  demand_charge_inr:   number | null
  fac_inr:             number | null
  tax_inr:             number | null
  pg_surcharge_inr:    number | null
  wheeling_charge_inr: number | null
  wheeling_energy_kwh: number | null
}

export interface BankingLossRow {
  unit:               string
  unit_code:          string
  gross_banked_kwh:   number
  banking_loss_kwh:   number
  net_banked_kwh:     number
  settled_kwh:        number
  expired_kwh:        number
  closing_balance_kwh:number
  loss_inr:           number
}

export interface WheelingReconRow {
  unit:         string
  unit_code:    string
  proposed_kwh: number
  actual_kwh:   number
  gap_kwh:      number
  gap_inr:      number
  status:       'OK' | 'OVER' | 'UNDER' | 'INFO'
}

export interface SurplusAbsorptionRow {
  unit:                  string
  unit_code:             string
  generation_kwh:        number
  consumption_kwh:       number
  direct_matched_kwh:    number
  gross_surplus_kwh:     number
  banking_settled_kwh:   number
  banking_expired_kwh:   number
  grid_drawl_kwh:        number
  total_matched_kwh:     number
  replacement_pct:       number
  closing_balance_kwh?:  number
}

export interface HeatmapData {
  hours:       number[]
  days:        string[]
  net_matrix:  (number | null)[][]
  gen_matrix:  (number | null)[][]
  cons_matrix: (number | null)[][]
}

export interface KpiSummary {
  month:                 string
  total_generation_kwh:  number
  total_consumption_kwh: number
  total_matched_kwh:     number
  total_banking_kwh:     number
  total_grid_cost_inr:   number
  total_actual_cost_inr: number
  total_savings_inr:     number
  savings_pct:           number
  replacement_pct:       number
  co2_saved_tonnes:      number
}

export interface SavingsHeatmapRow {
  unit:            string
  unit_code:       string
  month:           string
  savings_pct:     number | null
  savings_inr?:    number
  grid_cost_inr?:  number
  consumption_kwh?: number
}

export interface UnitMaster {
  unit_id:          number
  code:             string
  name:             string
  discom_division?: string
  tariff_category?: string
}

export interface MonthlyAggregateRow {
  month:           string
  generation_kwh:  number
  consumption_kwh: number
  matched_kwh:     number
  banking_kwh:     number
  grid_kwh:        number
  lapsed_kwh:      number
  grid_cost_inr:   number
  savings_inr:     number
  savings_pct:     number
}

// ── GIL Types ──────────────────────────────────────────────────────────────

export interface GILKpiSummary {
  month:                               string
  total_generation_kwh:                number
  total_generation_before_losses_kwh:  number
  wind_generation_kwh:                 number
  solar_generation_kwh:                number
  wind_pct:                            number
  solar_pct:                           number
  total_consumption_kwh:               number
  total_matched_kwh:                   number
  total_grid_cost_inr:                 number
  total_actual_cost_inr:               number
  total_savings_inr:                   number
  savings_pct:                         number
  replacement_pct:                     number
  co2_saved_tonnes:                    number
  generation_losses_kwh:               number
  generation_losses_pct:               number
  gross_surplus_kwh?:                  number
  banking_utilised_kwh?:               number
  banking_expired_kwh?:                number
  tod_daily_banking_kwh?:              number
  tod_monthly_banking_kwh?:            number
  intra_monthly_banking_kwh?:          number
}

export interface GILMonthlyRow {
  month:                          string
  generation_kwh:                 number
  generation_before_losses_kwh:   number
  wind_kwh:                       number
  solar_kwh:                      number
  consumption_kwh:                number
  matched_kwh:                    number
  grid_cost_inr:                  number
  actual_cost_inr:                number
  savings_inr:                    number
  savings_pct:                    number
  replacement_pct:                number
}

export interface GILWindSolarRow {
  month:                    string
  wind_kwh:                 number
  solar_kwh:                number
  total_kwh:                number
  wind_pct:                 number
  solar_pct:                number
  wind_before_losses_kwh:   number
  solar_before_losses_kwh:  number
}

export interface GILTodRow {
  tod_slot:           string
  slot_label:         string
  tod_multiplier:     number
  effective_rate:     number
  generation_kwh:     number
  consumption_kwh:    number
  direct_matched_kwh: number
  banking_kwh:        number
  grid_drawl_kwh:     number
  cost_savings_inr:   number
}

export interface GILBankingSettlement {
  month:                        string
  net_generation_kwh:           number
  total_consumption_kwh:        number
  direct_matched_kwh:           number
  surplus_before_banking_kwh:   number
  tier1_tod_daily_kwh:          number
  tier2_tod_monthly_kwh:        number
  tier3_intra_monthly_kwh:      number
  total_banking_utilised_kwh:   number
  banking_expired_kwh:          number
  unmet_demand_kwh:             number
  total_matched_kwh:            number
  tier1_savings_inr:            number
  tier2_savings_inr:            number
  tier3_savings_inr:            number
  total_banking_savings_inr:    number
  replacement_pct:              number
  banking_efficiency_pct:       number
}

export interface GILCostRow {
  month:                          string
  grid_cost_inr:                  number
  actual_cost_inr:                number
  cost_without_banking_inr:       number
  savings_with_banking_inr:       number
  savings_without_banking_inr:    number
  savings_pct_with_banking:       number
  savings_pct_without_banking:    number
  consumption_kwh:                number
  matched_kwh:                    number
}

export interface GILBillLineItem {
  charge_head:  string
  category:     string
  amount_inr:   number
  quantity?:    number | null
  rate?:        number | null
}

export interface GILDiscomBill {
  month:                  string
  total_payable_inr:      number
  net_payable_after_re:   number
  savings_inr:            number
  line_items:             GILBillLineItem[]
  data_source:            string
}

export interface GILReCosts {
  month:             string
  total_re_cost_inr: number
  per_unit_cost:     number | null
  generation_kwh:    number
  line_items:        GILBillLineItem[]
  data_source:       string
}

export interface GILTurbineRow {
  device_code:                    string
  device_name:                    string
  source_type:                    string
  generation_kwh:                 number
  generation_before_losses_kwh:   number
  losses_kwh:                     number
  losses_pct:                     number
  plf_pct:                        number | null
  cuf_pct?:                       number | null
  pr_pct?:                        number | null
  rated_capacity_kw:              number
}

export interface GILLossRow {
  month:                    string
  wind_before_losses_kwh:   number
  wind_after_losses_kwh:    number
  wind_losses_kwh:          number
  wind_losses_pct:          number
  solar_before_losses_kwh:  number
  solar_after_losses_kwh:   number
  solar_losses_kwh:         number
  solar_losses_pct:         number
  total_before_losses_kwh:  number
  total_after_losses_kwh:   number
  total_losses_kwh:         number
  total_losses_pct:         number
}

export interface GILPerfMetrics {
  financial_year:                 string
  generation_kwh:                 number
  generation_before_losses_kwh:   number
  losses_kwh:                     number
  losses_pct:                     number
  plf_pct:                        number | null
  wind_plf_pct:                   number | null
  solar_plf_pct:                  number | null
  wind_generation_kwh:            number
  solar_generation_kwh:           number
  total_capacity_kw:              number
  wind_capacity_kw:               number
  solar_capacity_kw:              number
  wind_losses_pct:                number
  solar_losses_pct:               number
  data_source?:                   string
}

export interface GILSavingsRow {
  month:            string
  consumption_kwh:  number
  matched_kwh:      number
  grid_cost_inr:    number
  actual_cost_inr:  number
  savings_inr:      number
  savings_pct:      number | null
  replacement_pct:  number
}

export interface GILDailySummaryRow {
  date:             string
  generation_kwh:   number
  wind_kwh:         number
  solar_kwh:        number
  consumption_kwh:  number
  matched_kwh:      number
  grid_kwh:         number
}

// ── API helpers ────────────────────────────────────────────────────────────

const c9 = (path: string, month: string, extra?: Record<string, unknown>) =>
  http.get<unknown>(`/c9/${path}`, { params: { month, ...extra } })

export const api = {
  c9: {
    kpiSummary:        (month: string, p?: Record<string, unknown>) => c9('kpi-summary', month, p).then(r => r.data as KpiSummary),
    dailySummary:      (month: string, p?: Record<string, unknown>) => c9('daily-summary', month, p).then(r => r.data as DailySummaryRow[]),
    unitSavings:       (month: string, p?: Record<string, unknown>) => c9('unit-savings', month, p).then(r => r.data as UnitSavingsRow[]),
    todAnalysis:       (month: string, p?: Record<string, unknown>) => c9('tod-analysis', month, p).then(r => r.data as TodRow[]),
    discomBill:        (month: string, p?: Record<string, unknown>) => c9('discom-bill', month, p).then(r => r.data as DiscomBillRow[]),
    bankingLoss:       (month: string, p?: Record<string, unknown>) => c9('banking-loss', month, p).then(r => r.data as BankingLossRow[]),
    wheelingRecon:     (month: string, p?: Record<string, unknown>) => c9('wheeling-recon', month, p).then(r => r.data as WheelingReconRow[]),
    surplusAbsorption: (month: string, p?: Record<string, unknown>) => c9('surplus-absorption', month, p).then(r => r.data as SurplusAbsorptionRow[]),
    heatmap:           (month: string, p?: Record<string, unknown>) => c9('heatmap', month, p).then(r => r.data as HeatmapData),
    monthlyAggregate:  (fromMonth: string, toMonth: string, p?: Record<string, unknown>) =>
      http.get<MonthlyAggregateRow[]>('/c9/monthly-aggregate', { params: { from_month: fromMonth, to_month: toMonth, ...p } }).then(r => r.data),
    savingsHeatmap:    () => http.get<SavingsHeatmapRow[]>('/c9/savings-heatmap').then(r => r.data),
    units:             () => http.get<UnitMaster[]>('/c9/units').then(r => r.data),
    upload:            (formData: FormData, unitId?: number, peid?: number) =>
      http.post('/c9/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { ...(unitId ? { unit_id: unitId } : {}), ...(peid ? { plant_energy_source_id: peid } : {}) },
      }).then(r => r.data),
    exportUrl: (chart: string, month: string, fmt: 'csv' | 'excel') =>
      `${API_BASE}/c9/export/${chart}?month=${month}&fmt=${fmt}`,
  },
  gil: {
    kpiSummary:         (month: string) =>
      http.get<GILKpiSummary>('/gil/kpi-summary', { params: { month } }).then(r => r.data),
    monthlySummary:     (months = 12) =>
      http.get<GILMonthlyRow[]>('/gil/monthly-summary', { params: { months } }).then(r => r.data),
    windSolarSplit:     (months = 12) =>
      http.get<GILWindSolarRow[]>('/gil/wind-solar-split', { params: { months } }).then(r => r.data),
    todAnalysis:        (month: string) =>
      http.get<GILTodRow[]>('/gil/tod-analysis', { params: { month } }).then(r => r.data),
    bankingSettlement:  (month: string) =>
      http.get<GILBankingSettlement>('/gil/banking-settlement', { params: { month } }).then(r => r.data),
    costComparison:     (months = 12) =>
      http.get<GILCostRow[]>('/gil/cost-comparison', { params: { months } }).then(r => r.data),
    discomBill:         (month: string) =>
      http.get<GILDiscomBill>('/gil/discom-bill', { params: { month } }).then(r => r.data),
    reCosts:            (month: string) =>
      http.get<GILReCosts>('/gil/re-costs', { params: { month } }).then(r => r.data),
    turbinePerformance: (financial_year = '2025-2026') =>
      http.get<GILTurbineRow[]>('/gil/turbine-performance', { params: { financial_year } }).then(r => r.data),
    generationLosses:   (months = 12) =>
      http.get<GILLossRow[]>('/gil/generation-losses', { params: { months } }).then(r => r.data),
    performanceMetrics: (financial_year = '2025-2026') =>
      http.get<GILPerfMetrics>('/gil/performance-metrics', { params: { financial_year } }).then(r => r.data),
    savingsHeatmap:     () =>
      http.get<GILSavingsRow[]>('/gil/savings-heatmap').then(r => r.data),
    dailySummary:       (month: string) =>
      http.get<GILDailySummaryRow[]>('/gil/daily-summary', { params: { month } }).then(r => r.data),
  },
  health: () => http.get('/health').then(r => r.data),
}

export default http
