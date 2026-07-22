# Integrum Energy — Calculation Specification
**Version**: 1.0  
**Date**: 2026-07-07  
**Status**: Confirmed from GitHub Dev branch codebase + user clarifications  
**Scope**: C9 client (BESCOM, Karnataka) — extends to GIL with MSEDCL slot variants

---

## 1. TOD Slot Definitions

### 1.1 BESCOM (Karnataka) — C9 Client

Source: `visualizations/tod_config.py`

| Slot Name       | DB Aliases                                              | Time Window  | Color       |
|-----------------|---------------------------------------------------------|--------------|-------------|
| Morning Peak    | `Morning Peak`                                          | 06:00–09:00  | `#FB8C00`   |
| Day Normal      | `Day (Normal)`, `Day Normal`                            | 09:00–18:00  | `#0288D1`   |
| Evening Peak    | `Evening Peak`                                          | 18:00–22:00  | `#C62828`   |
| Night Off Peak  | `Off-Peak`, `off-Peak`, `Night Off-Peak`, `Night Off Peak` | 22:00–06:00 | `#6A1B9A` |

**Notes**:
- Each 24-hour day has 96 × 15-minute slots
- Slot assignment is by the hour the slot **starts** in
- Morning Peak = 12 slots (6:00–8:45), Day Normal = 36 slots (9:00–17:45), Evening Peak = 16 slots (18:00–21:45), Night Off Peak = 32 slots (22:00–5:45)
- The `normalize_slot_name()` function in `tod_config.py` maps raw DB strings to display names — always use this function when reading tod_slot from the database

### 1.2 MSEDCL (Maharashtra) — GIL Client

MSEDCL uses different slot boundaries (seed data exists in schema_v2.sql). Confirm exact boundaries with GIL contract before finalising.

---

## 2. Settlement Terminology

Source: `visualizations/power_cost_calculations.py`, `db/fetch_summary_data.py`

### 2.1 Field Names and Meanings

| Code Variable              | Business Meaning                                                    |
|----------------------------|---------------------------------------------------------------------|
| `matched_settlement`       | 15-minute direct slot match — generation absorbed by consumption within same 15-min slot |
| `settlement_with_banking`  | Banked kWh actually settled in a **different** 15-min slot, after 8% loss applied |
| `total_settlement`         | `matched_settlement + settlement_with_banking`                      |
| `surplus_generation`       | Generation in excess of consumption in a 15-min slot (candidate for banking) |
| `surplus_demand`           | Consumption in excess of generation in a 15-min slot (deficit)     |
| `supplied_generation`      | Generation actually allocated/supplied to consumption units (≤ total generation) |
| `surplus_generation_after_banking` | Surplus remaining after banking credits exhausted / expired |
| `surplus_demand_after_banking`    | Deficit remaining after banking credits applied                |

**Critical distinction** — `matched_settled_sum` (old codebase name) = `matched_settlement` (current name). `intra_settlement + inter_settlement` (old names) = `settlement_with_banking` (current name).

### 2.2 Settlement Hierarchy (3-tier)

```
Tier 1 — Real-time (15-min slot)    : matched_settlement
                                       Generation kWh consumed in same slot
Tier 2 — Intra-month banking         : part of settlement_with_banking
                                       Surplus from an earlier slot used in a
                                       later slot in the same calendar month
Tier 3 — Inter-month banking         : part of settlement_with_banking
                                       Surplus from prior month carried forward
                                       (expires end of month — 8% loss applies)
```

---

## 3. Banking Rules

Source: User-confirmed (2026-06 session)

| Rule                  | Value / Policy                                          |
|-----------------------|---------------------------------------------------------|
| Banking loss rate     | **8%** — net units = banked_units × 0.92               |
| Banking expiry        | **End of calendar month** — unused banked kWh forfeit  |
| Banking priority      | Oldest banked units used first (FIFO within month)     |
| Loss timing           | Loss applied at the point of **settlement** (drawdown), not at generation |

**Formula**:
```
net_banking_units_settled = gross_banked_units × (1 - 0.08)
                          = gross_banked_units × 0.92
```

---

## 4. Allocation Rules

Source: User-confirmed (2026-06 session)

Generation is allocated to consumption units in two-pass order:

**Pass 1 — Tariff priority** (highest tariff first):
- ₹7.20/kWh units receive solar allocation before ₹5.95/kWh units
- This maximises financial savings (replacing the most expensive grid power first)

**Pass 2 — Consumption proportion** (within same tariff group):
- Among units sharing the same tariff tier, allocate by their share of total consumption
- Example: if two ₹7.20 units consume 60 kWh and 40 kWh respectively, they receive 60% and 40% of available allocation

**Allocation granularity**: 15-minute slots (same granularity as settlement matching)

**Tariff update cadence**: Monthly — tariff rates must be refreshed each billing cycle

---

## 5. Tariff Rates — C9 Client (BESCOM, Aug 2025)

Source: `DISCOM Bill – All Units.csv`

### 5.1 Energy Charge Tiers

| Tier          | Rate (₹/kWh) | Units                                                         |
|---------------|-------------|---------------------------------------------------------------|
| High Tariff   | ₹7.20       | Malleswaram, Sahakar Nagar, Old Airport Road, HRBR Unit       |
| Standard      | ₹5.95       | Bellandur Corp, Bellandur Unit 1, Bellandur Unit 2, Madiwala, GK Pvt, Rajajinagar, Domlur |

### 5.2 Full BESCOM Bill Structure (per unit per month)

| Line Item                | Rate / Basis                         |
|--------------------------|--------------------------------------|
| Total Consumption        | kWh reading                          |
| Wheeling Energy          | kWh credited at ₹1.00/kWh            |
| Energy Charges           | ₹7.20 or ₹5.95 per kWh              |
| Demand Charges           | ₹350–370 per kVA per month           |
| FAC (Fuel Adjustment Charge) | ₹0.36/kWh                       |
| Tax                      | 9% on energy + demand charges        |
| P&G Surcharge            | ₹0.36/kWh                           |
| Manual Wheeling Charge   | ₹0.29/kWh (deducted from credit)    |
| Manual Energy Wheeling   | ₹0.20/kWh (deducted from credit)    |

**Net wheeling benefit** = ₹1.00 credit − ₹0.29 − ₹0.20 = **₹0.51/kWh net**

---

## 6. Cost Calculation Formulas

Source: `visualizations/power_cost_calculations.py`  
Note: Default rates in code (`grid=4.0`, `renewable=2.0`) are placeholders — **actual rates come from the database** per unit per month.

### 6.1 Grid Baseline Cost (without any solar)

```python
grid_cost = total_consumption_kwh × grid_rate_per_kwh
```

This is the hypothetical cost if no solar existed. It is the denominator for all savings percentage calculations.

> **Important**: `grid_cost` uses **energy charges only** (₹7.20 or ₹5.95/kWh × kWh). It does NOT include demand charges, FAC, tax, or other fixed charges. This is a simplification — actual BESCOM bill savings also include demand charge reductions when solar reduces peak kVA, but the dashboard does not currently model that.

### 6.2 Actual Cost WITH Banking

```python
banked_settled_units        = matched_settlement + settlement_with_banking
grid_consumption            = max(total_consumption - banked_settled_units, 0)
renewable_cost              = banked_settled_units × renewable_rate_per_kwh
actual_cost_with_banking    = (grid_consumption × grid_rate_per_kwh) + renewable_cost
savings_with_banking        = grid_cost - actual_cost_with_banking
savings_pct_with_banking    = (savings_with_banking / grid_cost) × 100
```

### 6.3 Actual Cost WITHOUT Banking (direct match only)

```python
net_consumption_no_bank     = max(total_consumption - matched_settlement, 0)
renewable_cost_no_bank      = matched_settlement × renewable_rate_per_kwh
actual_cost_without_banking = (net_consumption_no_bank × grid_rate_per_kwh) + renewable_cost_no_bank
savings_without_banking     = grid_cost - actual_cost_without_banking
savings_pct_without_banking = (savings_without_banking / grid_cost) × 100
```

### 6.4 Unit-wise Savings (from monthly_savings_v2 view)

```sql
SELECT
    month,
    unit,
    grid_cost,
    actual_cost_with_banking  AS actual_cost,
    savings_with_banking      AS savings,
    savings_pct_with_banking  AS savings_percentage
FROM monthly_savings_v2
ORDER BY month;
```

Unit aggregation (Python side):
```python
unit_summary = df.groupby('unit').agg({
    'grid_cost':   'sum',
    'actual_cost': 'sum',
    'savings':     'sum'
})
savings_pct = round(savings / grid_cost × 100, 2) if grid_cost > 0 else 0
```

### 6.5 Replacement Rate

```python
replacement_rate = total_settlement / total_consumption × 100
# Where total_settlement = matched_settlement + settlement_with_banking
```

Shown on Gen vs Consumption chart as "Total Replacement %".

---

## 7. Database Tables and Views

### 7.1 Core Source Tables (existing dashboard)

| Table / View                         | Granularity      | Key Columns                                                                                      |
|--------------------------------------|------------------|--------------------------------------------------------------------------------------------------|
| `settlement_data`                    | 15-min per unit  | date, datetime, allocated_generation, consumption, deficit, surplus_demand, surplus_generation, settled |
| `banking_settlement`                 | Monthly per unit | matched_settled_sum, intra_settlement, inter_settlement (legacy naming)                         |

### 7.2 Computed Views (existing dashboard uses these)

| View                                  | Used In                        | Key Columns                                                             |
|---------------------------------------|--------------------------------|-------------------------------------------------------------------------|
| `monthly_banking_settlement_data_v2`  | Summary tab, Gen vs Con chart  | month, supplied_generation, consumption, matched_settlement, settlement_with_banking, surplus_generation, surplus_demand, surplus_generation_after_banking, surplus_demand_after_banking |
| `monthly_savings_v2`                  | Bill tab, Unit-wise cost chart | month, unit, grid_cost, actual_cost_with_banking, savings_with_banking, savings_pct_with_banking |
| `hourly_gen_con2_v2`                  | TOD tab                        | date, time, tod_slot, supplied_generation, consumption                  |
| `discom_bill_v2`                      | Bill tab                       | month_year, unit + all BESCOM line items                                |

### 7.3 Schema_v2 View Equivalents (to be created)

The schema_v2 warehouse must produce views matching the above names exactly, so the existing Streamlit dashboard can connect without code changes:

| View Name                            | Source Schema_v2 Tables                                                   |
|--------------------------------------|---------------------------------------------------------------------------|
| `monthly_banking_settlement_data_v2` | settlement_slots (aggregated) + generation_readings + consumption_readings |
| `monthly_savings_v2`                 | device_savings_summary + tariff_configs + devices                         |
| `hourly_gen_con2_v2`                 | generation_readings + consumption_readings + tod_slots                    |
| `discom_bill_v2`                     | grid_bill_headers + grid_bill_line_items + charge_head_types              |

---

## 8. Known Gaps and Reconciliation Issues

### 8.1 Demand Charge Not in Savings Formula

The current savings formula is **energy-only**: `grid_cost = consumption × grid_rate`. The actual BESCOM bill also has demand charges (₹350–370/kVA/month). Solar can reduce peak kVA and thus demand charges, but the current dashboard does not model this.

**Impact**: Savings % shown by the dashboard understates true financial savings.  
**Recommendation**: Phase 2 enhancement — add demand charge reduction modelling using 15-min kW peak reduction.

### 8.2 Proposed Allocation vs Actual BESCOM Wheeling

The dashboard calculates savings based on **proposed allocation** (highest tariff first, by consumption). The actual BESCOM wheeling certificate may use a different allocation method. This creates a reconciliation gap between dashboard savings and actual bill savings.

**Impact**: The "savings" KPI in the dashboard is a projection, not a reconciliation of the actual bill.  
**Recommendation**: Add `allocation_reconciliation` table to track proposed vs actual wheeling per unit per month.

### 8.3 Banking Loss in Existing Code

The existing `power_cost_calculations.py` does **not explicitly apply the 8% loss** in its formula — it uses raw `settlement_with_banking` values from the database. This implies the 8% loss is applied **upstream** (in ETL or at DB view level) before values reach `settlement_with_banking`. Confirm with ETL team.

### 8.4 Uniform Grid Rate Assumption

The existing code accepts `grid_rate_per_kwh` as a single parameter per call. Unit-wise savings via `monthly_savings_v2` presumably uses the correct per-unit rates. Verify the view definition applies ₹7.20 vs ₹5.95 correctly by unit.

### 8.5 Renewable Rate

The cost formula includes `renewable_rate_per_kwh` — this represents the PPA (Power Purchase Agreement) rate paid to the solar plant operator. This rate is not in the current uploaded data. Confirm the PPA rate for C9 and seed it into `re_contracts` table.

---

## 9. Key Formula Summary Card

```
┌─────────────────────────────────────────────────────────────┐
│  INTEGRUM ENERGY — FORMULA REFERENCE                        │
├─────────────────────────────────────────────────────────────┤
│  grid_cost = consumption × grid_rate                        │
│                                                             │
│  total_settlement = matched + banking                       │
│  replacement_rate = total_settlement / consumption × 100%   │
│                                                             │
│  grid_remaining = max(consumption − total_settlement, 0)    │
│  actual_cost    = grid_remaining × grid_rate                │
│                 + total_settlement × ppa_rate               │
│                                                             │
│  savings        = grid_cost − actual_cost                   │
│  savings_pct    = savings / grid_cost × 100%                │
│                                                             │
│  banking_loss   = 8%  →  net_banked = gross × 0.92          │
│  expiry         = end of calendar month                     │
│                                                             │
│  allocation:    highest tariff first (₹7.20 > ₹5.95)        │
│                 within same tier: ∝ consumption share        │
├─────────────────────────────────────────────────────────────┤
│  TOD SLOTS (BESCOM)                                         │
│  Morning Peak   06:00–09:00                                 │
│  Day Normal     09:00–18:00                                 │
│  Evening Peak   18:00–22:00                                 │
│  Night Off Peak 22:00–06:00                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Codebase File Map

| File                                          | Purpose                                     |
|-----------------------------------------------|---------------------------------------------|
| `visualizations/tod_config.py`                | TOD slot definitions, color map, normalizer |
| `visualizations/power_cost_calculations.py`   | Plant-level cost formula (with/without banking) |
| `visualizations/unit_wise_power_cost_calculations.py` | Unit-level savings from monthly_savings_v2 view |
| `visualizations/summary_tab_visual.py`        | Gen vs Consumption chart, TOD line chart    |
| `visualizations/tod_tab_visual.py`            | TOD heatmap and slot breakdown charts       |
| `visualizations/power_cost_visual.py`         | Bill tab financial visualizations           |
| `db/fetch_summary_data.py`                    | Queries monthly_banking_settlement_data_v2  |
| `db/fetch_tod_tab_data.py`                    | Queries hourly_gen_con2_v2, monthly_savings_v2, discom_bill_v2 |
| `db/db_setup.py`                              | Database connection (MySQL → PostgreSQL migration) |
| `helper/setup_logger.py`                      | Logging utility                             |
| `app.py`                                      | Main Streamlit entrypoint                   |

---

*This document is the single source of truth for all calculation logic in the Integrum Energy platform.*  
*Any code deviating from Section 6 formulas is a bug. Any schema deviating from Section 7 view names requires dashboard code changes.*
