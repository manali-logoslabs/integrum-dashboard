/**
 * mockData.ts — Static demo data for all C9 and GIL dashboard endpoints.
 * Data is derived from real HRBR Solar Settlement (Aug 2025) and scaled
 * for Sep–Nov 2025 using Karnataka seasonal solar factors.
 *
 * Algorithm: Solar Settlement v1.0 (HRBR Hospital Portfolio)
 * Banking charge: 8% | Group A tariff: ₹7.2/unit | Group B: ₹5.95/unit
 */

// ── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ['2025-08', '2025-09', '2025-10', '2025-11']

/** Karnataka seasonal solar generation multipliers (Aug baseline = 1.00) */
const GEN_FACTORS  = [1.00, 0.92, 1.10, 1.15]
/** Consumption variation (hospitals are stable year-round) */
const CONS_FACTORS = [1.00, 1.00, 0.98, 0.97]

function scaleGen (base: number, mi: number) { return Math.round(base * GEN_FACTORS[mi]) }
function scaleCons(base: number, mi: number) { return Math.round(base * CONS_FACTORS[mi]) }

// ── Real August daily data (from HRBR_Aug_Gen_Consumption_15min.xlsx) ────────

const AUG_DAILY_GEN = [
  22019, 29134, 24935, 20246, 16676, 17709, 18678,
  17805, 12108, 11789, 18346, 19575,  9601, 16491,
  18402, 15153,  8408, 13243, 10062,  2875,  4480,
  16262, 24771, 27066, 21005, 23527, 16431, 16028,
  17841, 24708, 20780,
]
const AUG_DAILY_CONS = [
  19430, 21781, 17940, 19809, 19676, 21274, 21908,
  21212, 21526, 17076, 20528, 19031, 17165, 18576,
  16870, 20037, 16637, 17668, 17304, 19120, 19832,
  21001, 22577, 15410, 21695, 21449, 17519, 20055,
  21086, 21232, 18007,
]
// Round-1 slot-level matched (Stage 4), per day
const AUG_DAILY_MATCHED = [
  10537, 11408,  9104,  9406,  9428, 10093, 11198,
  11197,  8686,  7891,  8792,  9539,  7606,  9281,
   8294,  9986,  6533,  8342,  7188,  2220,  2683,
  10657, 12090,  8324, 11583, 10360,  7680,  8840,
  10001, 10822,  7686,
]
// Daily surplus generation sent to banking pool (net after 8% charge)
const AUG_DAILY_BANKING = [
  10563, 16307, 14564,  9972,  6668,  7007,  6882,
   6080,  3148,  3586,  8789,  9233,  1835,  6633,
   9299,  4754,  1725,  4508,  2644,   602,  1653,
   5156, 11666, 17242,  8668, 12113,  8051,  6612,
   7213, 12775, 12046,
]

// Days in each month
const DAYS_IN_MONTH = [31, 30, 31, 30]

// ── C9 Unit Masters (real HRBR Hospital Portfolio units) ─────────────────────

export const UNIT_MASTERS = [
  { unit_id:1,  code:'C2HT-136',   name:'Malleswaram',             discom_division:'BESCOM City', tariff_category:'HT' },
  { unit_id:2,  code:'E6HT209',    name:'Old Airport Road',        discom_division:'BESCOM East',  tariff_category:'HT' },
  { unit_id:3,  code:'C8HT-111',   name:'Sahakar Nagar',           discom_division:'BESCOM North', tariff_category:'HT' },
  { unit_id:4,  code:'E8HT-203',   name:'HRBR Unit',               discom_division:'BESCOM East',  tariff_category:'HT' },
  { unit_id:5,  code:'C8HT-135',   name:'Thanisandra',             discom_division:'BESCOM North', tariff_category:'HT' },
  { unit_id:6,  code:'E4HT-355',   name:'Whitefield',              discom_division:'BESCOM East',  tariff_category:'HT' },
  { unit_id:7,  code:'S11BHT406',  name:'Bellandur Corp. Office',  discom_division:'BESCOM South', tariff_category:'HT' },
  { unit_id:8,  code:'S11HT-124',  name:'Bellandur',               discom_division:'BESCOM South', tariff_category:'HT' },
  { unit_id:9,  code:'S11HT-419',  name:'Sarjapura',               discom_division:'BESCOM South', tariff_category:'HT' },
  { unit_id:10, code:'S12HT-99',   name:'Kanakapura',              discom_division:'BESCOM South', tariff_category:'HT' },
  { unit_id:11, code:'S13HT-87',   name:'Electronic City',         discom_division:'BESCOM South', tariff_category:'HT' },
]

// ── Real Aug unit-level data (from Unit_Wise_Monthly sheet) ──────────────────
// columns: code, group, aug_consumption, aug_matched1, aug_matched2, aug_grid
const AUG_UNIT_DATA: Record<string, {
  group: 'A'|'B', tariff: number,
  consumption: number, matched1: number, matched2: number, grid: number
}> = {
  'C2HT-136':  { group:'A', tariff:7.2,  consumption:48360, matched1:24169, matched2:24191, grid:0     },
  'E6HT209':   { group:'A', tariff:7.2,  consumption:77528, matched1:42369, matched2:35159, grid:0     },
  'C8HT-111':  { group:'A', tariff:7.2,  consumption:58407, matched1:30315, matched2:28093, grid:0     },
  'E8HT-203':  { group:'A', tariff:7.2,  consumption:45320, matched1:22017, matched2:23303, grid:0     },
  'C8HT-135':  { group:'B', tariff:5.95, consumption:53563, matched1:22720, matched2:30843, grid:0     },
  'E4HT-355':  { group:'B', tariff:5.95, consumption:88540, matched1:41026, matched2:47514, grid:0     },
  'S11BHT406': { group:'B', tariff:5.95, consumption:22886, matched1:8453,  matched2:0,     grid:14433 },
  'S11HT-124': { group:'B', tariff:5.95, consumption:48752, matched1:20073, matched2:9804,  grid:18875 },
  'S11HT-419': { group:'B', tariff:5.95, consumption:45603, matched1:17457, matched2:0,     grid:28146 },
  'S12HT-99':  { group:'B', tariff:5.95, consumption:45734, matched1:18206, matched2:0,     grid:27528 },
  'S13HT-87':  { group:'B', tariff:5.95, consumption:69740, matched1:30652, matched2:39088, grid:0     },
}

// ── KPI Summary ──────────────────────────────────────────────────────────────

function makeKpi(month: string, mi: number) {
  const gen      = scaleGen (536147, mi)
  const cons     = scaleCons(604434, mi)
  // Scale matched proportionally with generation
  const genRatio = GEN_FACTORS[mi]
  const matched  = Math.round(277456 * genRatio)
  const banking  = Math.round(237995 * genRatio)        // net banked (after 8% charge)
  const totalSolar = Math.min(matched + banking, cons)
  const grid     = Math.max(0, cons - totalSolar)
  const lapsed   = Math.max(0, gen - matched - Math.round(banking / 0.92))  // gross surplus minus what went to banking

  // Cost model: Group A @ ₹7.2, Group B @ ₹5.95
  // Aug split: ~38% Group A (229,615), ~62% Group B (285,836) of total solar
  const grpA_solar = Math.round(totalSolar * 0.445)
  const grpB_solar = totalSolar - grpA_solar
  const gridCostNoSolar = Math.round(cons * 0.445 * 7.2 + cons * 0.555 * 5.95)
  const savingsInr = Math.round(grpA_solar * 7.2 + grpB_solar * 5.95)
  const gridCostPaid = Math.round(grid * 5.95)  // remaining grid (primarily Group B units)
  const actualCost = gridCostPaid + Math.round(totalSolar * 1.0)  // wheeling ₹1/unit

  return {
    month,
    total_generation_kwh:  gen,
    total_consumption_kwh: cons,
    total_matched_kwh:     matched,
    total_banking_kwh:     banking,
    total_grid_cost_inr:   gridCostNoSolar,
    total_actual_cost_inr: actualCost,
    total_savings_inr:     savingsInr,
    savings_pct:           Math.round((savingsInr / gridCostNoSolar) * 1000) / 10,
    replacement_pct:       Math.round((totalSolar / cons) * 1000) / 10,
    co2_saved_tonnes:      Math.round(totalSolar * 0.82 / 1000 * 10) / 10,
  }
}

export const KPI_BY_MONTH: Record<string, ReturnType<typeof makeKpi>> = {}
MONTHS.forEach((m, i) => { KPI_BY_MONTH[m] = makeKpi(m, i) })
export const DEFAULT_KPI = KPI_BY_MONTH['2025-11']

// ── Daily Summary ─────────────────────────────────────────────────────────────
// Aug uses real daily values; Sep/Oct/Nov are scaled from the Aug pattern.

function makeDailySummary(month: string, mi: number) {
  const gf = GEN_FACTORS[mi]
  const cf = CONS_FACTORS[mi]
  const daysInMonth = DAYS_IN_MONTH[mi]
  const rows = []

  for (let d = 0; d < daysInMonth; d++) {
    const date = `${month}-${String(d + 1).padStart(2, '0')}`
    // Wrap Aug pattern for months with fewer/more days
    const srcIdx = d % AUG_DAILY_GEN.length

    const gen     = Math.round(AUG_DAILY_GEN[srcIdx]     * gf)
    const cons    = Math.round(AUG_DAILY_CONS[srcIdx]    * cf)
    const matched = Math.round(AUG_DAILY_MATCHED[srcIdx] * gf)
    const banking = Math.round(AUG_DAILY_BANKING[srcIdx] * gf)
    const grid    = Math.max(0, cons - matched)   // unmet after R1 (banking settles monthly)

    rows.push({ date, generation_kwh: gen, consumption_kwh: cons, matched_kwh: matched, banking_kwh: banking, grid_kwh: grid })
  }
  return rows
}

export const DAILY_BY_MONTH: Record<string, ReturnType<typeof makeDailySummary>> = {}
MONTHS.forEach((m, i) => { DAILY_BY_MONTH[m] = makeDailySummary(m, i) })

// ── Monthly Aggregate (for trend chart) ──────────────────────────────────────

export const MONTHLY_AGGREGATE = MONTHS.map((month, mi) => {
  const kpi = makeKpi(month, mi)
  return {
    month,
    generation_kwh:  kpi.total_generation_kwh,
    consumption_kwh: kpi.total_consumption_kwh,
    matched_kwh:     kpi.total_matched_kwh,
    banking_kwh:     kpi.total_banking_kwh,
    grid_kwh:        Math.max(0, kpi.total_consumption_kwh - kpi.total_matched_kwh - kpi.total_banking_kwh),
    lapsed_kwh:      Math.max(0, kpi.total_generation_kwh - kpi.total_matched_kwh - Math.round(kpi.total_banking_kwh / 0.92)),
    grid_cost_inr:   kpi.total_grid_cost_inr,
    savings_inr:     kpi.total_savings_inr,
    savings_pct:     kpi.savings_pct,
  }
})

// ── Unit Savings ──────────────────────────────────────────────────────────────

function makeUnitSavings(month: string, mi: number) {
  const gf = GEN_FACTORS[mi]
  const cf = CONS_FACTORS[mi]

  return UNIT_MASTERS.map(u => {
    const aug = AUG_UNIT_DATA[u.code]
    const cons     = Math.round(aug.consumption * cf)
    const matched1 = Math.round(aug.matched1    * gf)
    const matched2 = Math.round(aug.matched2    * gf)
    const totalSolar = Math.min(matched1 + matched2, cons)
    const grid       = Math.max(0, cons - totalSolar)
    const banking    = Math.round((aug.matched1 > 0 ? aug.matched2 : 0) * gf)  // only if unit receives banking

    const gridCostNoSolar = Math.round(cons * aug.tariff)
    const savingsInr      = Math.round(totalSolar * aug.tariff)
    const actualCost      = Math.round(grid * aug.tariff + totalSolar * 1.0)
    const savingsWo       = Math.round(matched1 * aug.tariff)  // without banking

    return {
      unit:     u.name,
      unit_code: u.code,
      grid_cost:                   gridCostNoSolar,
      actual_cost_with_banking:    actualCost,
      actual_cost_without_banking: Math.round(grid * aug.tariff + matched1 * 1.0 + matched2 * aug.tariff),
      savings_with_banking:        savingsInr,
      savings_without_banking:     savingsWo,
      savings_pct_with_banking:    Math.round((savingsInr / gridCostNoSolar) * 1000) / 10,
      savings_pct_without_banking: Math.round((savingsWo  / gridCostNoSolar) * 1000) / 10,
      consumption_kwh:    cons,
      matched_kwh:        matched1,
      banking_kwh:        banking,
      surplus_kwh:        Math.max(0, matched2 - banking),
      grid_drawl_kwh:     grid,
      replacement_pct:    Math.round((totalSolar / cons) * 1000) / 10,
    }
  })
}

export const UNIT_SAVINGS_BY_MONTH: Record<string, ReturnType<typeof makeUnitSavings>> = {}
MONTHS.forEach((m, i) => { UNIT_SAVINGS_BY_MONTH[m] = makeUnitSavings(m, i) })

// ── TOD Analysis (from TOD_Unit_Wise_Monthly — August real data) ──────────────

// Real Aug TOD totals across all 11 units (kWh)
const AUG_TOD = {
  Morning_Peak:   { consumption: 62981,  matched: 39181,  surplus_dem: 23800  },
  Day_Normal:     { consumption: 282349, matched: 238095, surplus_dem: 44254  },
  Evening_Peak:   { consumption: 106964, matched:    181, surplus_dem: 106783 },
  Night_Offpeak:  { consumption: 152140, matched:      0, surplus_dem: 152140 },
}

const TOD_SLOT_LABELS: Record<string, string> = {
  MORNING_PEAK:   'Morning Peak (06–09h)',
  DAY_NORMAL:     'Day Normal (09–18h)',
  EVENING_PEAK:   'Evening Peak (18–22h)',
  NIGHT_OFF_PEAK: 'Night Off-Peak (22–06h)',
}
const TOD_MULTIPLIERS: Record<string, number> = {
  MORNING_PEAK: 1.5, DAY_NORMAL: 1.0, EVENING_PEAK: 1.5, NIGHT_OFF_PEAK: 0.5,
}

function makeTodAnalysis(month: string, mi: number) {
  const gf = GEN_FACTORS[mi]
  const cf = CONS_FACTORS[mi]
  return [
    { tod_slot:'MORNING_PEAK',   key:'Morning_Peak'  },
    { tod_slot:'DAY_NORMAL',     key:'Day_Normal'    },
    { tod_slot:'EVENING_PEAK',   key:'Evening_Peak'  },
    { tod_slot:'NIGHT_OFF_PEAK', key:'Night_Offpeak' },
  ].map(({ tod_slot, key }) => {
    const aug = AUG_TOD[key as keyof typeof AUG_TOD]
    const gen     = Math.round(aug.matched * gf * 1.05)  // generation slightly above matched
    const cons    = Math.round(aug.consumption * cf)
    const matched = Math.round(aug.matched * gf)
    const costSavings = Math.round(matched * 6.51 * TOD_MULTIPLIERS[tod_slot])
    return {
      tod_slot,
      slot_label:          TOD_SLOT_LABELS[tod_slot],
      multiplier:          TOD_MULTIPLIERS[tod_slot],
      generation_kwh:      gen,
      consumption_kwh:     cons,
      direct_matched_kwh:  matched,
      cost_savings_inr:    costSavings,
    }
  })
}

export const TOD_BY_MONTH: Record<string, ReturnType<typeof makeTodAnalysis>> = {}
MONTHS.forEach((m, i) => { TOD_BY_MONTH[m] = makeTodAnalysis(m, i) })

// ── TOD Hourly ────────────────────────────────────────────────────────────────
// Derived from real daily pattern: solar 06:00–18:45, consumption all day

const TOD_HOUR_MAP: Record<number, string> = {
  0:'NIGHT_OFF_PEAK',1:'NIGHT_OFF_PEAK',2:'NIGHT_OFF_PEAK',3:'NIGHT_OFF_PEAK',4:'NIGHT_OFF_PEAK',5:'NIGHT_OFF_PEAK',
  6:'MORNING_PEAK',7:'MORNING_PEAK',8:'MORNING_PEAK',
  9:'DAY_NORMAL',10:'DAY_NORMAL',11:'DAY_NORMAL',12:'DAY_NORMAL',13:'DAY_NORMAL',14:'DAY_NORMAL',15:'DAY_NORMAL',16:'DAY_NORMAL',17:'DAY_NORMAL',
  18:'EVENING_PEAK',19:'EVENING_PEAK',20:'EVENING_PEAK',21:'EVENING_PEAK',
  22:'NIGHT_OFF_PEAK',23:'NIGHT_OFF_PEAK',
}
const TOD_SLOT_LABELS_SHORT: Record<string, string> = {
  MORNING_PEAK: 'Morning Peak', DAY_NORMAL: 'Day Normal',
  EVENING_PEAK: 'Evening Peak', NIGHT_OFF_PEAK: 'Night Off-Peak',
}

// Typical hourly generation profile (bell curve peaking ~12:00–13:00)
const HOURLY_GEN_PROFILE = [
  0, 0, 0, 0, 0, 0,
  820, 2800, 5200,           // 06, 07, 08 (Morning Peak)
  7800, 13200, 17400, 19200, 18500, 16800, 14200, 10500, 6900,  // 09–17 (Day Normal)
  2100, 0, 0, 0,             // 18–21 (Evening Peak)
  0, 0,                      // 22–23
]
// Typical hourly consumption (hospitals run 24h, peak daytime)
const HOURLY_CONS_PROFILE = [
  6200, 5800, 5600, 5500, 5700, 6100,
  7200, 8400, 9600,
  10800, 11200, 11400, 11600, 11500, 11300, 11000, 10600, 9800,
  9200, 8600, 8000, 7500,
  7100, 6600,
]

function makeTodHourly(month: string, mi: number) {
  const gf = GEN_FACTORS[mi]
  const cf = CONS_FACTORS[mi]
  return Array.from({ length: 24 }, (_, h) => {
    const gen  = Math.round(HOURLY_GEN_PROFILE[h]  * gf)
    const cons = Math.round(HOURLY_CONS_PROFILE[h] * cf)
    return {
      hour:               h,
      hour_label:         `${String(h).padStart(2, '0')}:00`,
      generation_kwh:     gen,
      consumption_kwh:    cons,
      direct_matched_kwh: Math.min(gen, cons),
      tod_slot:           TOD_HOUR_MAP[h],
      slot_label:         TOD_SLOT_LABELS_SHORT[TOD_HOUR_MAP[h]],
    }
  })
}

export const TOD_HOURLY_BY_MONTH: Record<string, ReturnType<typeof makeTodHourly>> = {}
MONTHS.forEach((m, i) => { TOD_HOURLY_BY_MONTH[m] = makeTodHourly(m, i) })

// ── DISCOM Bill ───────────────────────────────────────────────────────────────

function makeDiscomBill(month: string, mi: number) {
  const cf = CONS_FACTORS[mi]
  return UNIT_MASTERS.map(u => {
    const aug  = AUG_UNIT_DATA[u.code]
    const cons = Math.round(aug.consumption * cf)
    // DISCOM bill components (HT tariff structure)
    const energyRate    = aug.tariff
    const energyCharge  = Math.round(cons * energyRate)
    const demandCharge  = Math.round(cons * 1.1)   // ₹1.1/unit approx
    const fac           = Math.round(cons * 0.15)
    const tax           = Math.round((energyCharge + demandCharge) * 0.06)
    const pgSurcharge   = Math.round(cons * 0.05)
    const wheelingCharge= Math.round(cons * 1.0)
    const gross  = energyCharge + demandCharge + fac + tax + pgSurcharge
    const aug2 = AUG_UNIT_DATA[u.code]
    const totalSolar = Math.min(
      Math.round((aug2.matched1 + aug2.matched2) * GEN_FACTORS[mi] * cf / CONS_FACTORS[mi]),
      cons
    )
    const netPayable = Math.round(Math.max(0, cons - totalSolar) * energyRate +
      demandCharge + fac + tax + pgSurcharge + wheelingCharge)
    return {
      unit_name:           u.name,
      unit_code:           u.code,
      gross_amount_inr:    gross,
      net_payable_inr:     Math.min(netPayable, gross),
      savings_inr:         Math.max(0, gross - Math.min(netPayable, gross)),
      total_units_kwh:     cons,
      energy_rate_per_kwh: energyRate,
      energy_charge_inr:   energyCharge,
      demand_charge_inr:   demandCharge,
      fac_inr:             fac,
      tax_inr:             tax,
      pg_surcharge_inr:    pgSurcharge,
      wheeling_charge_inr: wheelingCharge,
      wheeling_energy_kwh: Math.round(totalSolar * 0.95),
    }
  })
}

export const DISCOM_BILL_BY_MONTH: Record<string, ReturnType<typeof makeDiscomBill>> = {}
MONTHS.forEach((m, i) => { DISCOM_BILL_BY_MONTH[m] = makeDiscomBill(m, i) })

// ── Banking Loss ──────────────────────────────────────────────────────────────

function makeBankingLoss(month: string, mi: number) {
  const gf = GEN_FACTORS[mi]
  // Total banking pool grows with generation
  // Aug gross banking = 237995 / 0.92 = 258,690 kWh (before 8% charge)
  const grossTotal = Math.round(258690 * gf)
  const lossTotal  = Math.round(grossTotal * 0.08)
  const netTotal   = grossTotal - lossTotal
  // Distribute banking proportionally among units by their consumption weight
  const totalCons = UNIT_MASTERS.reduce((s, u) => s + AUG_UNIT_DATA[u.code].consumption, 0)

  return UNIT_MASTERS.map(u => {
    const aug = AUG_UNIT_DATA[u.code]
    const weight = aug.consumption / totalCons
    const gross  = Math.round(grossTotal * weight)
    const loss   = Math.round(gross * 0.08)
    const net    = gross - loss
    const settled = Math.round(aug.matched2 * gf)
    const expired = Math.max(0, net - settled)
    return {
      unit:                u.name,
      unit_code:           u.code,
      gross_banked_kwh:    gross,
      banking_loss_kwh:    loss,
      net_banked_kwh:      net,
      settled_kwh:         Math.min(settled, net),
      expired_kwh:         expired,
      closing_balance_kwh: 0,  // all settled in-month (lapse_units = 0 in Aug)
      loss_inr:            Math.round(loss * aug.tariff),
    }
  })
}

export const BANKING_LOSS_BY_MONTH: Record<string, ReturnType<typeof makeBankingLoss>> = {}
MONTHS.forEach((m, i) => { BANKING_LOSS_BY_MONTH[m] = makeBankingLoss(m, i) })

// ── Wheeling Recon ────────────────────────────────────────────────────────────

function makeWheelingRecon(month: string, mi: number) {
  const gf = GEN_FACTORS[mi]
  const cf = CONS_FACTORS[mi]
  return UNIT_MASTERS.map(u => {
    const aug = AUG_UNIT_DATA[u.code]
    const totalSolar = Math.min(
      Math.round((aug.matched1 + aug.matched2) * gf),
      Math.round(aug.consumption * cf)
    )
    // Proposed = what was scheduled for wheeling
    const proposed = totalSolar
    // Actual = metered wheeling (small tolerance ±2%)
    const variance = (u.unit_id % 3 === 0) ? 1.02 : (u.unit_id % 3 === 1) ? 0.99 : 1.00
    const actual   = Math.round(proposed * variance)
    const gap      = actual - proposed
    const status   = Math.abs(gap) < 200 ? 'OK' : gap > 0 ? 'OVER' : 'UNDER'
    return {
      unit:         u.name,
      unit_code:    u.code,
      proposed_kwh: proposed,
      actual_kwh:   actual,
      gap_kwh:      gap,
      gap_inr:      Math.round(Math.abs(gap) * 1.0),
      status:       status as 'OK' | 'OVER' | 'UNDER',
    }
  })
}

export const WHEELING_BY_MONTH: Record<string, ReturnType<typeof makeWheelingRecon>> = {}
MONTHS.forEach((m, i) => { WHEELING_BY_MONTH[m] = makeWheelingRecon(m, i) })

// ── Surplus Absorption ────────────────────────────────────────────────────────

function makeSurplusAbsorption(month: string, mi: number) {
  const gf = GEN_FACTORS[mi]
  const cf = CONS_FACTORS[mi]
  // Total generation = 536147 kWh for Aug
  const genPerUnit = Math.round(536147 * gf / 11)  // rough equal share for display

  return UNIT_MASTERS.map(u => {
    const aug = AUG_UNIT_DATA[u.code]
    const cons     = Math.round(aug.consumption * cf)
    const matched1 = Math.round(aug.matched1 * gf)
    const matched2 = Math.round(aug.matched2 * gf)
    const totMatch = Math.min(matched1 + matched2, cons)
    const grid     = Math.max(0, cons - totMatch)
    // Gross surplus before banking charge
    const grossSurplus = Math.round(aug.matched2 / 0.92 * gf)
    const bankCharge   = Math.round(grossSurplus * 0.08)
    const bankNet      = grossSurplus - bankCharge
    return {
      unit:                u.name,
      unit_code:           u.code,
      generation_kwh:      genPerUnit,
      consumption_kwh:     cons,
      direct_matched_kwh:  matched1,
      gross_surplus_kwh:   grossSurplus,
      banking_settled_kwh: Math.min(matched2, bankNet),
      banking_expired_kwh: 0,
      grid_drawl_kwh:      grid,
      total_matched_kwh:   totMatch,
      replacement_pct:     Math.round((totMatch / cons) * 1000) / 10,
      closing_balance_kwh: 0,
    }
  })
}

export const SURPLUS_BY_MONTH: Record<string, ReturnType<typeof makeSurplusAbsorption>> = {}
MONTHS.forEach((m, i) => { SURPLUS_BY_MONTH[m] = makeSurplusAbsorption(m, i) })

// ── Savings Heatmap ───────────────────────────────────────────────────────────

export const SAVINGS_HEATMAP = MONTHS.flatMap((month, mi) =>
  UNIT_MASTERS.map(u => {
    const aug = AUG_UNIT_DATA[u.code]
    const gf  = GEN_FACTORS[mi]
    const cf  = CONS_FACTORS[mi]
    const cons       = Math.round(aug.consumption * cf)
    const totalSolar = Math.min(Math.round((aug.matched1 + aug.matched2) * gf), cons)
    const savingsInr = Math.round(totalSolar * aug.tariff)
    const gridCost   = Math.round(cons * aug.tariff)
    return {
      unit:            u.name,
      unit_code:       u.code,
      month,
      savings_pct:     Math.round((savingsInr / gridCost) * 1000) / 10,
      savings_inr:     savingsInr,
      grid_cost_inr:   gridCost,
      consumption_kwh: cons,
    }
  })
)

// ── 24h×7day Heatmap ──────────────────────────────────────────────────────────

function makeHeatmap(month: string, mi: number) {
  const gf  = GEN_FACTORS[mi]
  const cf  = CONS_FACTORS[mi]
  const hours = Array.from({ length: 24 }, (_, h) => h)
  const days  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  // Weekday vs weekend factor for hospital consumption
  const dayFactors = [1.0, 1.0, 1.0, 1.0, 1.0, 0.85, 0.80]
  const gen_matrix  = days.map((_, di) => hours.map(h => Math.round(HOURLY_GEN_PROFILE[h] * gf * (0.88 + Math.sin(di * 0.7) * 0.12))))
  const cons_matrix = days.map((_, di) => hours.map(h => Math.round(HOURLY_CONS_PROFILE[h] * cf * dayFactors[di])))
  return {
    hours,
    days,
    gen_matrix,
    cons_matrix,
    net_matrix: gen_matrix.map((row, di) => row.map((v, hi) => v - cons_matrix[di][hi])),
  }
}

export const HEATMAP_BY_MONTH: Record<string, ReturnType<typeof makeHeatmap>> = {}
MONTHS.forEach((m, i) => { HEATMAP_BY_MONTH[m] = makeHeatmap(m, i) })

// ─────────────────────────────────────────────────────────────────────────────
// GIL Data  (GIL Wind+Solar — MSEDCL Maharashtra, 9 Turbines + 4 Inverters)
// ─────────────────────────────────────────────────────────────────────────────

const GIL_MONTHS = ['2025-08', '2025-09', '2025-10', '2025-11']
// Maharashtra wind/solar seasonal factors (wind peaks Oct-Feb, solar peaks Mar-May)
const GIL_WIND_FACTORS  = [0.85, 0.90, 1.15, 1.20]
const GIL_SOLAR_FACTORS = [0.80, 0.78, 0.90, 0.85]
const GIL_CONS_FACTORS  = [1.00, 1.02, 1.01, 0.98]

// ── GIL KPI ───────────────────────────────────────────────────────────────────

function makeGilKpi(month: string, mi: number) {
  const windBL  = Math.round(4820000 * GIL_WIND_FACTORS[mi])
  const solarBL = Math.round(1240000 * GIL_SOLAR_FACTORS[mi])
  const windNet  = Math.round(windBL  * 0.962)  // ~3.8% losses
  const solarNet = Math.round(solarBL * 0.986)  // ~1.4% losses
  const gen     = windNet + solarNet
  const genBL   = windBL + solarBL
  const cons    = Math.round(5200000 * GIL_CONS_FACTORS[mi])
  const matched = Math.round(Math.min(gen * 0.88, cons))
  const grid    = Math.max(0, cons - matched)
  const grossSurplus = Math.max(0, gen - matched)
  const bankUtil = Math.round(grossSurplus * 0.72)
  const bankExp  = Math.round(grossSurplus * 0.05)

  const gridCostNoSolar = Math.round(cons * 7.8)
  const actualCost = Math.round(grid * 7.8 + gen * 1.2)
  const savings = gridCostNoSolar - actualCost

  return {
    month,
    total_generation_kwh:               gen,
    total_generation_before_losses_kwh: genBL,
    wind_generation_kwh:    windNet,
    solar_generation_kwh:   solarNet,
    wind_pct:  Math.round((windNet / gen) * 1000) / 10,
    solar_pct: Math.round((solarNet / gen) * 1000) / 10,
    total_consumption_kwh: cons,
    total_matched_kwh:     matched,
    total_grid_cost_inr:   gridCostNoSolar,
    total_actual_cost_inr: actualCost,
    total_savings_inr:     savings,
    savings_pct:           Math.round((savings / gridCostNoSolar) * 1000) / 10,
    replacement_pct:       Math.round((matched / cons) * 1000) / 10,
    co2_saved_tonnes:      Math.round(matched * 0.82 / 1000 * 10) / 10,
    generation_losses_kwh: genBL - gen,
    generation_losses_pct: Math.round(((genBL - gen) / genBL) * 1000) / 10,
    gross_surplus_kwh:          grossSurplus,
    banking_utilised_kwh:       bankUtil,
    banking_expired_kwh:        bankExp,
    tod_daily_banking_kwh:      Math.round(bankUtil * 0.40),
    tod_monthly_banking_kwh:    Math.round(bankUtil * 0.35),
    intra_monthly_banking_kwh:  Math.round(bankUtil * 0.25),
    total_banking_kwh:          bankUtil,
  }
}

export const GIL_KPI_BY_MONTH: Record<string, ReturnType<typeof makeGilKpi>> = {}
GIL_MONTHS.forEach((m, i) => { GIL_KPI_BY_MONTH[m] = makeGilKpi(m, i) })

// ── GIL Monthly Summary ───────────────────────────────────────────────────────

export const GIL_MONTHLY = GIL_MONTHS.map((month, mi) => {
  const kpi = makeGilKpi(month, mi)
  return {
    month,
    wind_generation_kwh:  kpi.wind_generation_kwh,
    solar_generation_kwh: kpi.solar_generation_kwh,
    total_generation_kwh: kpi.total_generation_kwh,
    consumption_kwh:      kpi.total_consumption_kwh,
    matched_kwh:          kpi.total_matched_kwh,
    grid_kwh:             Math.max(0, kpi.total_consumption_kwh - kpi.total_matched_kwh),
    surplus_kwh:          kpi.gross_surplus_kwh,
    savings_inr:          kpi.total_savings_inr,
    savings_pct:          kpi.savings_pct,
  }
})

// ── GIL Wind vs Solar ─────────────────────────────────────────────────────────

export const GIL_WIND_SOLAR = GIL_MONTHS.map((month, mi) => ({
  month,
  wind_before_losses_kwh:  Math.round(4820000 * GIL_WIND_FACTORS[mi]),
  solar_before_losses_kwh: Math.round(1240000 * GIL_SOLAR_FACTORS[mi]),
  wind_net_kwh:  Math.round(4820000 * GIL_WIND_FACTORS[mi] * 0.962),
  solar_net_kwh: Math.round(1240000 * GIL_SOLAR_FACTORS[mi] * 0.986),
  wind_losses_kwh:  Math.round(4820000 * GIL_WIND_FACTORS[mi] * 0.038),
  solar_losses_kwh: Math.round(1240000 * GIL_SOLAR_FACTORS[mi] * 0.014),
  wind_loss_pct:  3.8,
  solar_loss_pct: 1.4,
}))

// ── GIL TOD ───────────────────────────────────────────────────────────────────

function makeGilTod(month: string, mi: number) {
  const kpi = makeGilKpi(month, mi)
  const gen = kpi.total_generation_kwh
  const cons = kpi.total_consumption_kwh
  // Wind generates 24h; solar 06-18h. Approximate TOD split:
  return [
    { tod_slot:'MORNING_PEAK',   slot_label:'Morning Peak (06–09h)',   gen_pct:0.09, cons_pct:0.16 },
    { tod_slot:'DAY_NORMAL',     slot_label:'Day Normal (09–18h)',      gen_pct:0.52, cons_pct:0.38 },
    { tod_slot:'EVENING_PEAK',   slot_label:'Evening Peak (18–22h)',    gen_pct:0.16, cons_pct:0.22 },
    { tod_slot:'NIGHT_OFF_PEAK', slot_label:'Night Off-Peak (22–06h)', gen_pct:0.23, cons_pct:0.24 },
  ].map(({ tod_slot, slot_label, gen_pct, cons_pct }) => {
    const slotGen  = Math.round(gen  * gen_pct)
    const slotCons = Math.round(cons * cons_pct)
    const slotMatch = Math.min(slotGen, slotCons)
    return {
      tod_slot, slot_label,
      generation_kwh:     slotGen,
      consumption_kwh:    slotCons,
      matched_kwh:        slotMatch,
      grid_kwh:           Math.max(0, slotCons - slotMatch),
      surplus_kwh:        Math.max(0, slotGen  - slotMatch),
    }
  })
}

export const GIL_TOD_BY_MONTH: Record<string, ReturnType<typeof makeGilTod>> = {}
GIL_MONTHS.forEach((m, i) => { GIL_TOD_BY_MONTH[m] = makeGilTod(m, i) })

// ── GIL Banking ───────────────────────────────────────────────────────────────

function makeGilBanking(month: string, mi: number) {
  const kpi = makeGilKpi(month, mi)
  return [
    { type: 'TOD Daily Banking',    kwh: kpi.tod_daily_banking_kwh,       pct: 40 },
    { type: 'TOD Monthly Banking',  kwh: kpi.tod_monthly_banking_kwh,      pct: 35 },
    { type: 'Intra-Monthly Banking',kwh: kpi.intra_monthly_banking_kwh,    pct: 25 },
  ].map(b => ({
    ...b,
    month,
    loss_kwh:     Math.round(b.kwh * 0.05),
    net_kwh:      Math.round(b.kwh * 0.95),
    settled_kwh:  Math.round(b.kwh * 0.90),
    expired_kwh:  Math.round(b.kwh * 0.05),
    savings_inr:  Math.round(b.kwh * 0.90 * 7.8),
  }))
}

export const GIL_BANKING_BY_MONTH: Record<string, ReturnType<typeof makeGilBanking>> = {}
GIL_MONTHS.forEach((m, i) => { GIL_BANKING_BY_MONTH[m] = makeGilBanking(m, i) })

// ── GIL Cost ─────────────────────────────────────────────────────────────────

export const GIL_COST = GIL_MONTHS.map((month, mi) => {
  const kpi = makeGilKpi(month, mi)
  return {
    month,
    grid_cost_inr:    kpi.total_grid_cost_inr,
    actual_cost_inr:  kpi.total_actual_cost_inr,
    savings_inr:      kpi.total_savings_inr,
    savings_pct:      kpi.savings_pct,
    ppa_cost_inr:     Math.round(kpi.total_generation_kwh * 2.8),
    grid_unit_cost:   7.8,
    ppa_unit_cost:    2.8,
  }
})

// ── GIL DISCOM Bill ───────────────────────────────────────────────────────────

function makeGilDiscom(month: string, mi: number) {
  const kpi = makeGilKpi(month, mi)
  const cons = kpi.total_consumption_kwh
  const matched = kpi.total_matched_kwh
  const grid = Math.max(0, cons - matched)
  return [
    { category: 'Energy Charges',    amount: Math.round(grid * 7.8) },
    { category: 'Demand Charges',    amount: Math.round(cons * 0.9) },
    { category: 'Wheeling Charges',  amount: Math.round(matched * 1.2) },
    { category: 'FAC',               amount: Math.round(grid * 0.15) },
    { category: 'Taxes & Surcharge', amount: Math.round(grid * 0.12) },
  ].map(item => ({ ...item, month }))
}

export const GIL_DISCOM_BY_MONTH: Record<string, ReturnType<typeof makeGilDiscom>> = {}
GIL_MONTHS.forEach((m, i) => { GIL_DISCOM_BY_MONTH[m] = makeGilDiscom(m, i) })

// ── GIL RE Costs ──────────────────────────────────────────────────────────────

function makeGilReCosts(month: string, mi: number) {
  const kpi = makeGilKpi(month, mi)
  return {
    month,
    wind_ppa_cost_inr:   Math.round(kpi.wind_generation_kwh  * 2.6),
    solar_ppa_cost_inr:  Math.round(kpi.solar_generation_kwh * 3.2),
    om_cost_inr:         Math.round((kpi.wind_generation_kwh + kpi.solar_generation_kwh) * 0.12),
    transmission_cost_inr: Math.round(kpi.total_matched_kwh * 0.35),
    banking_fee_inr:     Math.round(kpi.banking_utilised_kwh * 0.15),
    total_re_cost_inr:   Math.round(kpi.total_generation_kwh * 1.2),
    effective_cost_per_unit: 1.2,
    grid_avoided_cost_per_unit: 7.8,
  }
}

export const GIL_RE_COSTS_BY_MONTH: Record<string, ReturnType<typeof makeGilReCosts>> = {}
GIL_MONTHS.forEach((m, i) => { GIL_RE_COSTS_BY_MONTH[m] = makeGilReCosts(m, i) })

// ── GIL Turbines ─────────────────────────────────────────────────────────────

export const GIL_TURBINES = Array.from({ length: 9 }, (_, i) => ({
  turbine_id:    i + 1,
  turbine_name:  `WTG-${String(i + 1).padStart(2, '0')}`,
  capacity_mw:   2.1,
  generation_kwh: Math.round((520000 + (i % 3) * 18000 - (i % 2) * 12000) * GIL_WIND_FACTORS[3]),
  availability_pct: Math.round((93 + (i % 4) * 1.5) * 10) / 10,
  plf_pct:          Math.round((28 + (i % 5) * 1.2) * 10) / 10,
  losses_kwh:       Math.round((520000 + (i % 3) * 18000) * 0.038),
}))

// ── GIL Losses ────────────────────────────────────────────────────────────────

export const GIL_LOSSES = GIL_MONTHS.map((month, mi) => {
  const kpi = makeGilKpi(month, mi)
  const windBL  = Math.round(4820000 * GIL_WIND_FACTORS[mi])
  const solarBL = Math.round(1240000 * GIL_SOLAR_FACTORS[mi])
  return {
    month,
    wind_curtailment_kwh:   Math.round(windBL  * 0.012),
    wind_technical_kwh:     Math.round(windBL  * 0.018),
    wind_transformer_kwh:   Math.round(windBL  * 0.008),
    solar_soiling_kwh:      Math.round(solarBL * 0.006),
    solar_technical_kwh:    Math.round(solarBL * 0.005),
    solar_transformer_kwh:  Math.round(solarBL * 0.003),
    total_losses_kwh:       kpi.generation_losses_kwh,
    total_losses_pct:       kpi.generation_losses_pct,
  }
})

// ── GIL Performance Metrics ───────────────────────────────────────────────────

export const GIL_PERF_METRICS = GIL_MONTHS.map((month, mi) => {
  const kpi = makeGilKpi(month, mi)
  const daysInMo = [31, 30, 31, 30][mi]
  const windCap  = 9 * 2100  // 9 turbines × 2.1 MW = 18,900 kW
  const solarCap = 4 * 1000  // 4 inverters × 1 MW = 4,000 kW
  return {
    month,
    wind_plf_pct:        Math.round((kpi.wind_generation_kwh / (windCap * daysInMo * 24)) * 100 * 10) / 10,
    solar_plf_pct:       Math.round((kpi.solar_generation_kwh / (solarCap * daysInMo * 24)) * 100 * 10) / 10,
    wind_availability_pct:  Math.round((94 + mi * 0.5) * 10) / 10,
    solar_availability_pct: Math.round((96 + mi * 0.4) * 10) / 10,
    replacement_pct:     kpi.replacement_pct,
    co2_saved_tonnes:    kpi.co2_saved_tonnes,
  }
})

// ── GIL Savings Heatmap ───────────────────────────────────────────────────────

const GIL_CONSUMERS = [
  'Plant-01', 'Plant-02', 'Plant-03', 'Plant-04', 'Plant-05',
  'Plant-06', 'Plant-07', 'Plant-08', 'Plant-09', 'Plant-10',
]
const GIL_BASE_SAVINGS = [88, 91, 85, 76, 93, 82, 88, 79, 90, 86]

export const GIL_SAVINGS_HEATMAP = GIL_MONTHS.flatMap((month, mi) =>
  GIL_CONSUMERS.map((consumer, ci) => ({
    consumer,
    month,
    savings_pct:     Math.round((GIL_BASE_SAVINGS[ci] * GIL_WIND_FACTORS[mi]) * 10) / 10,
    savings_inr:     Math.round(GIL_BASE_SAVINGS[ci] * 1000 * GIL_WIND_FACTORS[mi] * 50),
    grid_cost_inr:   Math.round(500000 + ci * 20000),
    consumption_kwh: Math.round(60000 + ci * 3000),
  }))
)

// ── GIL Daily ─────────────────────────────────────────────────────────────────

function makeGilDaily(month: string, mi: number) {
  const kpi = makeGilKpi(month, mi)
  const daysInMo = [31, 30, 31, 30][mi]
  const avgWind  = kpi.wind_generation_kwh  / daysInMo
  const avgSolar = kpi.solar_generation_kwh / daysInMo
  const avgCons  = kpi.total_consumption_kwh / daysInMo

  return Array.from({ length: daysInMo }, (_, d) => {
    const date   = `${month}-${String(d + 1).padStart(2, '0')}`
    // Wind has natural day-to-day variation; solar follows a smoother pattern
    const windFactor  = 0.75 + Math.abs(Math.sin(d * 0.45)) * 0.55
    const solarFactor = 0.80 + Math.sin(d * 0.25) * 0.20
    const wind  = Math.round(avgWind  * windFactor)
    const solar = Math.round(avgSolar * solarFactor)
    const gen   = wind + solar
    const cons  = Math.round(avgCons * (0.94 + Math.cos(d * 0.3) * 0.06))
    const matched = Math.min(gen, cons)
    return {
      date,
      wind_kwh:         wind,
      solar_kwh:        solar,
      generation_kwh:   gen,
      consumption_kwh:  cons,
      matched_kwh:      matched,
      grid_kwh:         Math.max(0, cons - matched),
      surplus_kwh:      Math.max(0, gen - matched),
    }
  })
}

export const GIL_DAILY_BY_MONTH: Record<string, ReturnType<typeof makeGilDaily>> = {}
GIL_MONTHS.forEach((m, i) => { GIL_DAILY_BY_MONTH[m] = makeGilDaily(m, i) })

// ── MonthlyAggregateRow (re-export alias expected by some components) ─────────
export type MonthlyAggregateRow = typeof MONTHLY_AGGREGATE[0]
export type TodHourlyRow = ReturnType<typeof makeTodHourly>[0]
