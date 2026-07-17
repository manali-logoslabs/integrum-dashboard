# Complete Data-to-Schema v2 Mapping
**Integrum Energy — All Folders Audited**
Generated: 2026-07-14

---

## 1. Inventory of All Data Files

### C9 Folder (`D:\Integrum_dashboard\C9\`)

| File | Source Table Name | Row Count | Date Coverage |
|------|-------------------|-----------|---------------|
| discom_bill_v2_202607141202.sql | discom_bill_v2 | ~440 data rows | Aug–Nov 2025 (11 units × 4 months × 10 line items) |
| effective_rate_summary_202607141202.sql | effective_rate_summary | 6 rows | Apr-2024, Mar-2025, Apr-2025 (2 of 11 units only) |
| electricity_consumption_202607141203.sql | electricity_consumption | 6 rows | Apr-2024, Mar-2025, Apr-2025 (2 of 11 units only) |
| gen_cons_15min_data_v2_202607141203.sql | gen_cons_15min_data_v2 | **0 rows — EMPTY** | — |
| hourly_gen_con2_v2_202607141203.sql | hourly_gen_con2_v2 | ~35,400 rows | Aug 2025 only (hourly × 11 units × 31 days) |
| monthly_banking_settlement_data_v2_202607141226.sql | monthly_banking_settlement_data_v2 | ~48 rows | Aug–Nov 2025 (11 units + Slot_Surplus rows) |
| monthly_savings_v2_202607141226.sql | monthly_savings_v2 | ~44 rows | Aug–Nov 2025 |
| monthly_savings_v3_202607141227.sql | monthly_savings_v3 | ~48 rows | Aug–Nov 2025 (more columns than v2) |

### GIL Folder (`D:\Integrum_dashboard\GIL\`)

| File | Source Table Name | Row Count | Date Coverage |
|------|-------------------|-----------|---------------|
| chat_history_202607141230.sql | chat_history | ~100 rows | Mar 2026 |
| consumption_data_202607141230.sql | consumption_data | ~41,700 rows | Apr–Dec 2025 (15-min, single plant) |
| grid_cost_component_202607141231.sql | grid_cost_component | 13 rows | Jan–Jan 2026 — **ALL PLACEHOLDER VALUES** |
| monthly_banking_settlement_202607141232.sql | monthly_banking_settlement | 43 rows | Apr–Dec 2025 (3 TOD slots × 9+ months) |
| performance_metrics_202607141232.sql | performance_metrics | 1 row | FY 2025-2026 |
| plant_metadata_202607141232.sql | plant_metadata | 1 row | — |
| savings_summary_202607141232.sql | savings_summary | 1 data row | Aug 2025 only |
| settlement_matching_202607141232.sql | settlement_matching | ~432,800 rows | Apr–Dec 2025 (15-min, per device) |
| slot_summary | — | Does not exist | — |
| solar_generation_202607141233.sql | solar_generation | ~63,900 rows | Apr–Dec 2025 (3 inverter serial numbers) |
| tod_daily_summary_202607141233.sql | tod_daily_summary | ~1,304 rows | Apr 2025 – Apr 2026 (3 slots/day) |
| tod_tariff_202607141234.sql | tod_tariff | 13 rows | Jan–Jan 2026 — **ALL PLACEHOLDER VALUES** |
| upload_tracking_202607141234.sql | upload_tracking | 1 row | May 2026 |
| users_202607141235.sql | users | 2 rows | — |
| wind_generation_202607141235.sql | wind_generation | ~369,000 rows | Apr 2025 – Apr 2026 (10 turbine serial numbers) |
| wind_solar_cost_component_202607141237.sql | wind_solar_cost_component | 13 rows | Jan–Jan 2026 — **ALL PLACEHOLDER VALUES** |
| wind_turbine_yearly_metrics_202607141238.sql | wind_turbine_yearly_metrics | 9 rows | FY 2025-2026 (GIL001–GIL009) |

### Root-Level SQL Files (`D:\Integrum_dashboard\`)

| File | Purpose | Status |
|------|---------|--------|
| schema_v2.sql | DDL — all table definitions | Target schema, not data |
| schema.sql | Old Schema v1 DDL | Not used |
| seed_all_months.sql | C9 reference data + Apr–Nov 2025 summary | Already in Schema v2 format |
| seed_august2025.sql | C9 August 2025 full seed | Already in Schema v2 format — includes generation_readings, tod_daily_summary, savings_summary, monthly_banking_settlement, banking_account |

---

## 2. Complete File-to-Table Mapping

### C9 Data

#### `discom_bill_v2` → `grid_bill_headers` + `grid_bill_line_items`

**Source columns:** `bill_header, unit, month_year, tariff, total_consumption, cost_without_solar, cost_with_solar_wheeling, discom_bill, savings`

**Transformation required:**
- One `grid_bill_headers` row per (unit × month): `consumption_unit_id` looked up by unit name, `billing_period_from/to` derived from `month_year`, `discom_id = 1` (BESCOM)
- Each `bill_header` value becomes one row in `grid_bill_line_items` with `charge_head_id` mapped as follows:

| bill_header value | charge_head_id | Notes |
|---|---|---|
| Total Consumption | INFO only — not a charge | Skip as line item; use for header total |
| Wheeling Energy | 7 (WHEELING_ENERGY) | units = total_consumption value |
| Energy Charges | 1 (ENERGY_CHARGE) | rate = tariff column |
| Demand Charges – Fixed | 2 (DEMAND_CHARGE) | demand_kva = total_consumption, rate = tariff |
| Fuel Cost Adjustment Charges - Fixed | 3 (FUEL_COST_ADJ) | |
| Tax – Fixed | 4 (TAX_ON_SALE) | |
| P&G Surcharge – Fixed | 5 (PG_SURCHARGE) | |
| Manual Wheeling Energy Charge - Fixed | 7 (WHEELING_CHARGE) | |
| Manual Energy Charges – Fixed (Wheeling) | 8 (MANUAL_ENERGY_WHEELING) | |
| Net Payable | Not a line item | Use as header total_amount_inr |

**Coverage:** Aug–Nov 2025, all 11 units.
**Month-to-unit_id mapping:** Unit names in the source (e.g. "MALLESWARAM (C2HT-136)") must match `consumption_units.code` values already seeded.

---

#### `effective_rate_summary` → `savings_summary` (supplemental fill)

**Source columns:** `billing_month, location_code, total_units_consumed, total_electricity_bill, total_demand_charges, effective_rate, effective_rate_excl_demand`

**Transformation:** Updates existing `savings_summary` rows for matching (unit, month) with:
- `effective_rate_per_unit` ← `effective_rate`
- `grid_rate_per_unit` ← `effective_rate_excl_demand`
- `total_consumption_kwh` ← `total_units_consumed`

**Coverage gap:** Only 6 rows covering 2 of 11 units (BNGMWM = Malleswaram, BNGOAR = Old Airport Road) for Apr-2024, Mar-2025, Apr-2025 only. These months are not covered by the main savings seed. **Load as supplemental data for those specific rows.**

---

#### `electricity_consumption` → `savings_summary` (supplemental fill)

**Source columns:** `month, location, total_units_consumed, total_electricity_bill_without_solar_credit, effective_rate_per_unit`

**Transformation:** Same as above — fills `grid_cost_without_re` and `total_consumption_kwh` for the same 6 rows.

**Note:** This file overlaps with `effective_rate_summary` in purpose. Both cover only 2 units × 3 months. Use together to backfill savings_summary rows that predate the main seed (which starts Apr 2025).

---

#### `gen_cons_15min_data_v2` → `generation_readings` + `consumption_readings`

**Status: EMPTY FILE — 0 rows. No data to load.**

The 15-min generation+consumption time-series for C9 has not been exported. The `seed_august2025.sql` provides hourly (not 15-min) generation data for August 2025 only. **This is a data gap.** Recommend re-exporting from the source system.

---

#### `hourly_gen_con2_v2` → `tod_daily_summary`

**Source columns:** `date, time, unit, tod_slot, consumption, supplied_generation`

**Transformation:**
- Aggregate by `(date, tod_slot)` — sum `consumption` and `supplied_generation` across all 11 units per slot per day
- Map tod_slot text to `tod_slot_definitions.id`:
  - "Morning Peak" → id=1, "Day Normal" → id=2, "Evening Peak" → id=3, "Night Off Peak" → id=4
- Target: `tod_daily_summary` with `tenant_id=1, plant_energy_source_id=1, consumption_unit_id=NULL` (aggregate)

**Coverage:** Aug 2025 only (31 days × 4 slots = 124 aggregate rows). All 11 units covered.

**Note:** Individual unit-level rows also possible by keeping `consumption_unit_id` non-null, but the dashboard chart uses plant-level aggregates.

---

#### `monthly_banking_settlement_data_v2` → `monthly_banking_settlement`

**Source columns:** `month, unit, consumption, supplied_generation, surplus_generation, surplus_demand, matched_settlement, settlement_with_banking, surplus_generation_after_banking, surplus_demand_after_banking`

**Column mapping to Schema v2 `monthly_banking_settlement`:**
| Source | Schema v2 |
|--------|-----------|
| consumption | total_consumption_kwh |
| supplied_generation | net_generation_kwh |
| surplus_generation | surplus_before_banking_kwh |
| surplus_demand | unmet_demand_kwh |
| matched_settlement | direct_matched_kwh |
| settlement_with_banking | banking_utilised_kwh |
| surplus_generation_after_banking | carry_forward_banking_kwh |
| surplus_demand_after_banking | grid_import_kwh |

**Transformation notes:**
- Filter out rows where `unit = 'Slot_Surplus'` — these are plant totals, not unit-level records
- Look up `consumption_unit_id` from unit name (e.g. "BELLANDUR (S11HT-124)" → code='S11HT-124')
- Set `tod_slot_id = NULL` (these are monthly totals, not per-slot)
- Set `tenant_id=1, plant_energy_source_id=1`
- `total_matched_kwh = direct_matched_kwh + banking_utilised_kwh`

**Coverage:** Aug–Nov 2025, 11 units.

**Note:** `seed_all_months.sql` already covers Apr–Nov 2025. The C9 folder file adds Aug-Nov 2025. **These overlap.** The seed is more complete (uses `ON CONFLICT DO NOTHING`). The C9 folder file's data should be reconciled with the seed before loading.

---

#### `monthly_savings_v2` → **DO NOT LOAD**

Superseded by `monthly_savings_v3` which has more columns. Load v3 only.

---

#### `monthly_savings_v3` → `savings_summary`

**Source columns:** `month, unit, consumption, grid_cost, grid_consumption_with_banking, actual_cost_with_banking, savings_with_banking, savings_pct_with_banking, actual_cost_without_banking, savings_without_banking, savings_pct_without_banking, total_grid_consumption_after_banking, total_cost_after_banking, total_savings_after_banking, total_savings_pct_after_banking`

**Column mapping:**
| Source | Schema v2 |
|--------|-----------|
| consumption | total_consumption_kwh |
| grid_cost | grid_cost_without_re |
| actual_cost_with_banking | cost_with_banking |
| savings_with_banking | savings_with_banking |
| savings_pct_with_banking | savings_pct (use this) |
| actual_cost_without_banking | cost_without_banking |
| savings_without_banking | savings_without_banking |
| total_savings_after_banking | savings_amount_inr |
| total_savings_pct_after_banking | savings_pct |

**Coverage:** Aug–Nov 2025, all 11 units.

**Note:** `seed_all_months.sql` covers Apr–Nov 2025 with the schema v2 format already. v3 adds more calculated columns. **Recommend updating the seed's savings_summary rows for Aug–Nov 2025 with the additional v3 columns** (`cost_with_banking, cost_without_banking`) rather than re-loading separately.

---

### GIL Data

#### `plant_metadata` → `plants` + `plant_energy_sources` + `devices`

**Source:** 1 row — GIL, HYBRID, MAHARASHTRA, 5MW

**Mapping to Schema v2:**
```
plants: id=2, tenant_id=2, code='GIL_MH_HYBRID', name='GIL Maharashtra Hybrid Plant',
        state_id=2 (Maharashtra), discom_id=2 (MSEDCL), commissioned_on='2025-04-01'

plant_energy_sources:
  id=2, plant_id=2, tenant_id=2, source_type_id=2 (WIND), installed_capacity_kw=5000
  id=3, plant_id=2, tenant_id=2, source_type_id=1 (SOLAR), installed_capacity_kw=2000 (estimated)

devices (Wind turbines — 10 unique serial numbers found):
  23005438 → GIL001, 23005436 → GIL002, 23005426 → GIL003, 23005428 → GIL004,
  24000783 → GIL005 (or mapped per yearly metrics), 23005432, 23005430, 23005434,
  23005424, 23005435 (10th turbine — appears in raw data but NOT in yearly metrics)

devices (Solar inverters — 3 serial numbers found in data):
  22010390, 24004845, 24004850
  Note: GIL reportedly has 4 solar inverters. One serial number may be missing from the export.
```

**Action needed:** Confirm the GIL001–GIL009 turbine-to-serial-number mapping and the 4th solar inverter serial number before loading devices.

---

#### `users` → `tenant_users`

**Source:** admin (admin@gil.com, ADMIN), kannan (rkannan@graphiteindia.com, VIEWER)

**Mapping:**
- `tenant_id=2`
- Password hashes need re-hashing to bcrypt format (source uses SHA-256; Schema v2 expects bcrypt)
- Map `is_active=1` → `is_active=TRUE`

---

#### `wind_generation` → `generation_readings` (source_type = WIND)

**Source columns:** `plant_id, serial_number, generation_date, generation_time, generation_value, generation_before_losses`

**Column mapping:**
| Source | Schema v2 |
|--------|-----------|
| serial_number | device_id (lookup by device_code) |
| generation_date + generation_time | slot_start_time (combine to TIMESTAMPTZ, add +05:30) |
| generation_date + generation_time + 15 min | slot_end_time |
| generation_value | generation_kwh |
| generation_before_losses | generation_before_losses_kwh |

**Required FK values:**
- `tenant_id=2, plant_id=2, plant_energy_source_id=2 (WIND), source_type_id=2`
- `device_id` = looked up from serial_number → devices table

**Coverage:** Apr 2025 – Apr 2026, 10 turbine serial numbers, ~369,000 rows (15-min intervals)

---

#### `solar_generation` → `generation_readings` (source_type = SOLAR)

**Source columns:** Same as wind_generation

**Required FK values:**
- `tenant_id=2, plant_id=2, plant_energy_source_id=3 (SOLAR), source_type_id=1`
- 3 inverter serial numbers: 22010390, 24004845, 24004850

**Coverage:** Apr–Dec 2025, ~63,900 rows

---

#### `consumption_data` → `consumption_readings`

**Source columns:** `consumption_date, consumption_time, consumption_value`

**Important gap:** This file has NO unit/device identifier. There is a single GIL consumption reading (the whole plant's factory consumption). This maps to a single `consumption_unit_id` for GIL.

**Column mapping:**
| Source | Schema v2 |
|--------|-----------|
| consumption_date + consumption_time | slot_start_time (TIMESTAMPTZ +05:30) |
| consumption_date + consumption_time + 15 min | slot_end_time |
| consumption_value | consumption_kwh |

**Required FK values:** `tenant_id=2, consumption_unit_id=<GIL factory unit id>`

**Coverage:** Apr–Dec 2025, ~41,700 rows

---

#### `tod_daily_summary` (GIL) → `tod_daily_summary`

**Source columns:** `summary_date, tod_slot, generation_value, allocated_consumption, matched_settlement, surplus_demand, surplus_generation, surplus_gen_with_banking, slot_total_consumption, matched_settlement_daily_tod, surplus_gen_daily_tod, surplus_demand_daily_tod`

**Column mapping:**
| Source | Schema v2 |
|--------|-----------|
| summary_date | date |
| tod_slot ('peak','normal','off-peak') | tod_slot_id (lookup MSEDCL slot IDs 5–8) |
| generation_value | generation_kwh |
| allocated_consumption | consumption_kwh |
| matched_settlement | direct_matched_kwh (total match including banking) |
| surplus_gen_with_banking | banking_utilised_kwh |
| slot_total_consumption | consumption_kwh (use this, more complete) |

**TOD slot mapping (MSEDCL, must be seeded first):**
- 'peak' → slot_id=5 (PEAK 06-10h) + slot_id=6 (PEAK 18-22h) — source combines both peaks into one 'peak' row
- 'normal' → slot_id=7 (NORMAL 10-18h)
- 'off-peak' → slot_id=8 (OFF_PEAK 22-06h)

**Action needed:** The MSEDCL TOD slots (ids 5–8) must be inserted into `tod_slot_definitions` before this data can be loaded.

**Coverage:** Apr 2025 – Apr 2026, ~1,304 rows (3 slots × ~435 days)

**Note:** The date range extends to Apr 2026, making this the most complete GIL daily-level dataset.

---

#### `monthly_banking_settlement` (GIL) → `monthly_banking_settlement`

**Source columns:** `settlement_month, tod_slot, generation_value, allocated_consumption, matched_settlement, surplus_demand, surplus_generation, surplus_gen_with_banking, slot_total_consumption, matched_settlement_daily_tod, surplus_gen_daily_tod, surplus_demand_daily_tod, matched_settlement_intra_monthly, surplus_gen_intra_monthly, surplus_demand_intra_monthly`

**Column mapping:**
| Source | Schema v2 |
|--------|-----------|
| settlement_month ('2025-04') | month (DATE, '2025-04-01') |
| tod_slot | tod_slot_id (MSEDCL lookup) |
| generation_value | net_generation_kwh |
| slot_total_consumption | total_consumption_kwh |
| matched_settlement | total_matched_kwh |
| surplus_generation | surplus_before_banking_kwh |
| surplus_gen_with_banking | intra_month_banking_kwh |
| surplus_demand | unmet_demand_kwh |
| matched_settlement_intra_monthly | direct_matched_kwh |
| surplus_gen_intra_monthly | carry_forward_banking_kwh |

**Required FK values:** `tenant_id=2, plant_energy_source_id=2 (WIND combined), consumption_unit_id=<GIL plant unit>`

**Coverage:** Apr–Dec 2025, 3 TOD slots × 9 months = 27+ rows

---

#### `savings_summary` (GIL) → `savings_summary`

**Source columns:** `settlement_month, total_consumption, grid_cost, actual_cost_with_banking, savings_with_banking, savings_pct_with_banking, actual_cost_without_banking, savings_without_banking, savings_pct_without_banking`

**Data coverage:** **Only 1 row — Aug 2025.**

This is very sparse. All other months are missing. The file should be treated as a starting reference. Remaining months should be calculated from `monthly_banking_settlement` and `re_bill_line_items` data once available.

---

#### `performance_metrics` (GIL) → `performance_metrics`

**Source columns:** `year, generation_turbine_level, plf_wind_percent, realised_kwh_cap_consumption_wind, sale_of_energy, over_injection, solar_generation, plf_solar_percent, realised_kwh_cap_consumption_solar, total_plant_consumption, total_re_consumption_capex, re_percent_capex, total_re_consumption_tpa, re_percent_tpa, total_re_percent, actual_losses_sale_of_energy, actual_losses_realised_kwh_cap_consumption_wind, actual_losses_solar_generation, actual_losses_realised_kwh_cap_consumption_solar, losses_without_over_injection_realised_kwh_cap_consumption, losses_without_over_injection_percent, banking_loss_percent_wind, banking_loss_percent_solar`

**Column mapping:**
| Source | Schema v2 |
|--------|-----------|
| year ('2025-2026') | financial_year |
| generation_turbine_level | gross_generation_kwh (wind) |
| plf_wind_percent | plf_pct |
| realised_kwh_cap_consumption_wind | realised_cap_consumption_kwh |
| sale_of_energy | sale_of_energy_kwh |
| over_injection | over_injection_kwh |
| solar_generation | → separate row with plant_energy_source_id=3 (SOLAR) |
| total_plant_consumption | total_plant_consumption_kwh |
| total_re_consumption_capex | total_re_consumption_kwh |

**Note:** The source has wind + solar combined in one row. Schema v2 stores one row per `plant_energy_source_id`. Two rows will be created: one for WIND (pes_id=2) and one for SOLAR (pes_id=3), splitting the source columns accordingly.

**Coverage:** FY 2025-2026 only (1 row → 2 rows in Schema v2)

---

#### `wind_turbine_yearly_metrics` → `device_yearly_metrics`

**Source columns:** `year, wtg (GIL001–GIL009), generation_turbine_level`

**Column mapping:**
| Source | Schema v2 |
|--------|-----------|
| year | financial_year |
| wtg (e.g. 'GIL001') | device_id (looked up from device_code) |
| generation_turbine_level | generation_kwh |

**Coverage:** FY 2025-2026, 9 turbines.

**Note:** Serial number 23005435 appears in the raw wind_generation data but NOT in yearly metrics. Either it is a spare turbine or the yearly metrics file is missing one turbine. The device must still be registered in `devices` table if it has generation readings.

---

#### `settlement_matching` → `settlement_slots`

**Source columns:** `settlement_date, settlement_time, plant_id, serial_number, generation_type, generation_value, generation_before_losses, slot_total_consumption, allocated_consumption, surplus_generation, surplus_gen_with_banking, matched_settlement`

**Column mapping:**
| Source | Schema v2 |
|--------|-----------|
| settlement_date + settlement_time | slot_start_time (TIMESTAMPTZ +05:30) |
| serial_number | → lookup device_id from devices.device_code |
| generation_type (WIND/SOLAR) | → lookup plant_energy_source_id |
| generation_value | generation_kwh |
| generation_before_losses | generation_losses_kwh (= generation_before_losses - generation_value) |
| slot_total_consumption | consumption_kwh |
| allocated_consumption | consumption_kwh (per device allocation) |
| surplus_generation | surplus_kwh |
| surplus_gen_with_banking | banking_utilised_kwh |
| matched_settlement | direct_matched_kwh |

**Note:** `consumption_unit_id` is not in the source — the GIL plant has a single consumption unit. Set to the GIL plant unit ID.

**Coverage:** Apr–Dec 2025, ~432,800 rows. This is the most voluminous file.

---

#### `chat_history` → `chat_threads` + `chat_messages`

**Source columns:** `thread_id, role, content, timestamp`

**Mapping:**
- All rows have `thread_id='1000'` — create one `chat_threads` row (id=1000, tenant_id=2)
- Each source row → one `chat_messages` row: `thread_id=1000, role, content, created_at=timestamp`

**Coverage:** ~100 messages, Mar 2026.

---

#### `upload_tracking` → `data_ingestion_logs`

**Source columns:** `year, month, no_of_st, no_of_mt, gen_pdf_name, con_pdf_name, grid_excel_name, ws_excel_name, status, error_message, uploaded_by`

**Column mapping:**
| Source | Schema v2 |
|--------|-----------|
| year + month | period_from / period_to |
| status (COMPLETED) | status |
| uploaded_by | source_system |
| gen_pdf_name | file_name |
| error_message | error_details (JSONB) |

**Note:** `no_of_st` (number of settlement time slots?) and `no_of_mt` (master templates?) have no direct equivalent in Schema v2. These can be stored in `error_details` JSONB as supplementary metadata.

---

### PLACEHOLDER DATA — Do Not Load as Real Data

These 3 GIL files contain artificial placeholder values and must NOT be loaded into production:

#### `tod_tariff` → `tariff_tod_rates` — **PLACEHOLDER**

All values are arithmetic sequences (10, 50, 90, 130... incrementing by 40). The column names `a, b, c, d` map to TOD slots but the rates are not real MSEDCL tariffs. **Do not load.** Real tariff rates must be obtained from MSEDCL tariff orders.

#### `grid_cost_component` → `grid_bill_line_items` — **PLACEHOLDER**

All 13 monthly rows use values 10, 20, 30... (incrementing by 10). These are test data. Real MSEDCL grid bill breakdowns are needed. Until real data is provided, the `gil_discom_bill` and `gil_re_costs` dashboard charts will show no data.

#### `wind_solar_cost_component` → `re_bill_line_items` — **PLACEHOLDER**

Same pattern — all values 10, 20, 30... This file should map to RE operational cost line items (O&M, wheeling, scheduling charges, etc.) but all values are fictional. Real PPA/O&M invoices needed.

---

## 3. Schema v2 Tables With No Current Data Source

| Schema v2 Table | Missing Data | Recommended Action |
|---|---|---|
| `tariff_configs` | No C9 or GIL tariff config records | Must be manually inserted: C9 = HT-2B BESCOM, GIL = MSEDCL industrial |
| `tariff_tod_rates` | GIL tod_tariff is placeholder; C9 has no TOD rate file | Manual entry from official BESCOM/MSEDCL tariff orders |
| `re_contracts` | Only C9 PPA (2.50 ₹/kWh, in seed_august2025.sql) | Need GIL wind PPA + solar PPA contract details |
| `banking_account` | Only C9 Aug 2025 (in seed_august2025.sql) | Need all months + GIL banking account data |
| `device_tod_summary` | No device-level TOD daily data | Can be derived from settlement_matching by aggregating per device |
| `device_savings_summary` | No file provided | Can be derived from settlement_matching |
| `grid_bill_headers` + `re_bill_headers` (GIL) | grid_cost_component is placeholder | Real MSEDCL bill PDFs/excels must be uploaded |
| `allocation_reconciliation` | No file | Advanced feature — not needed for initial launch |
| `consumption_readings` (C9) | gen_cons_15min_data_v2 is EMPTY | Re-export 15-min C9 data from source system |

---

## 4. Loading Order (Dependency-Safe Sequence)

```
Phase 0: Pre-flight check (read-only)
Phase 1: Deploy schema_v2.sql (DDL — create all tables)
Phase 2: seed_all_months.sql (reference data + C9 Apr–Nov 2025 summaries)
          ↓ Must add MSEDCL TOD slot rows to seed before running
Phase 3: seed_august2025.sql (C9 Aug 2025 detail — generation_readings, tod_daily_summary, banking)
Phase 4: Load GIL reference data (tenants, plants, devices, consumption_units)
          ↓ Must resolve device serial-number → GIL001–GIL009 mapping first
Phase 5: Load GIL time-series (wind_generation → generation_readings, 
          solar_generation → generation_readings, consumption_data → consumption_readings)
Phase 6: Load GIL settlement (settlement_matching → settlement_slots)
Phase 7: Load GIL summaries (tod_daily_summary, monthly_banking_settlement, savings_summary,
          performance_metrics, device_yearly_metrics)
Phase 8: Load C9 detail (discom_bill → grid_bill_headers + line_items,
          hourly_gen_con2 → tod_daily_summary aggregation,
          monthly_banking_settlement_data_v2 → monthly_banking_settlement,
          monthly_savings_v3 → savings_summary UPDATE)
Phase 9: Load supplemental (effective_rate_summary + electricity_consumption for
          Apr-2024, Mar-2025, Apr-2025 unit-level backfill)
Phase 10: Load chat history and upload tracking
Phase 11: Verification — hit every API endpoint and confirm all charts render
```

---

## 5. Key Issues Requiring Attention Before Any Loading

1. **MSEDCL TOD slots missing from seed** — `seed_all_months.sql` only has BESCOM slots (ids 1–4). MSEDCL PEAK/NORMAL/OFF_PEAK (ids 5–8) must be inserted before GIL data can reference them.

2. **GIL device serial-number → code mapping** — 10 turbine serial numbers appear in wind_generation but wind_turbine_yearly_metrics only shows 9 (GIL001–GIL009). Serial 23005435 appears in raw data but not in yearly metrics. Need to confirm the full device registry.

3. **3 solar inverter serials found, 4 reportedly exist** — solar_generation has 22010390, 24004845, 24004850. If a 4th inverter (e.g. SINV-04) exists, its data may be missing from the export.

4. **C9 gen_cons_15min_data_v2 is empty** — No 15-min generation data for C9. The dashboard's "Daily Generation" chart relies on this. Hourly data for Aug 2025 is available from seed_august2025.sql. Other months need re-export.

5. **GIL savings_summary has only 1 month** — Aug 2025 only. The GIL KPI charts will be limited to that month unless savings_summary rows are calculated from the banking settlement data.

6. **GIL billing data is all placeholder** — grid_cost_component and wind_solar_cost_component use fake values. The "DISCOM Bill" and "RE Costs" GIL charts will show no real data until actual MSEDCL invoices are provided.

7. **monthly_savings_v2 is superseded** — Only load monthly_savings_v3 for savings_summary; skip v2 entirely.

8. **Password hash format** — GIL users.sql uses SHA-256 hashes; Schema v2 expects bcrypt. Either re-hash before insertion or use the existing hashes and update the authentication logic.
