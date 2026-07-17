# Integrum Energy — Database Schema Descriptions

This document covers two things:
1. **Source tables** — the raw tables exported from C9 (Cloud9) and GIL (Graphite India Limited) DBeaver databases, used as ETL input.
2. **Data Warehouse tables** — the unified `schema_v2` tables that all dashboards and MCP tools query.

---

## Part 1 — Source Data (Raw Export Tables)

Two source databases feed the Integrum Energy data warehouse:

| Source | Full Name | Plant Type | State | DISCOM | DB |
|--------|-----------|------------|-------|--------|----|
| **C9** | Cloud9 Energy | Solar (Wheeling) | Karnataka | BESCOM | Cloud9 DB |
| **GIL** | Graphite India Limited | Hybrid — Wind + Solar | Maharashtra | MSEDCL | GIL DB |

---

### C9 Source Tables (BESCOM / Karnataka)

Cloud9 tracks multiple HT consumer units across Bengaluru (Bellandur, Malleswaram, Electronic City, Whitefield, etc.) under a solar wheeling arrangement with BESCOM. Data is at 15-minute and hourly granularity with monthly roll-ups for billing and savings.

#### `discom_bill_v2`

DISCOM billing line items per consumer unit per month, comparing costs before and after solar wheeling.

| Column | Type | Description |
|--------|------|-------------|
| `bill_header` | string | Bill line item label (e.g., "Total Consumption", "Wheeling Energy") |
| `unit` | string | Consumer unit name and DISCOM account code (e.g., `MALLESWARAM (C2HT-136)`) |
| `month_year` | string | Billing month in `YYYY-MM` format |
| `tariff` | numeric | Applicable tariff rate (₹/kWh or slab multiplier) |
| `total_consumption` | numeric | Total energy consumed by the unit (kWh) |
| `cost_without_solar` | numeric | Electricity cost if no solar wheeling is applied (₹) |
| `cost_with_solar_wheeling` | numeric | Electricity cost after solar wheeling credit is applied (₹) |
| `discom_bill` | numeric | Actual DISCOM bill amount payable (₹) |
| `savings` | numeric | Cost savings achieved through solar wheeling (₹) |

**Warehouse mapping →** `grid_bill_headers` + `grid_bill_line_items`

---

#### `effective_rate_summary`

Monthly summary of effective electricity rate per consumer unit.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `billing_month` | date | Month for which the rate is computed |
| `location_code` | string | Consumer unit location / DISCOM account code |
| `total_units_consumed` | numeric | Total electricity consumed in the month (kWh) |
| `total_electricity_bill` | numeric | Total electricity bill for the month (₹) |
| `total_demand_charges` | numeric | Demand charges component of the bill (₹) |
| `effective_rate` | numeric | Effective rate including demand charges (₹/kWh) |
| `effective_rate_excl_demand` | numeric | Effective rate excluding demand charges (₹/kWh) |
| `created_at` | timestamp | Record creation timestamp |
| `updated_at` | timestamp | Record last updated timestamp |

**Warehouse mapping →** `savings_summary.effective_rate_per_unit` + `savings_summary.grid_rate_per_unit`

---

#### `gen_cons_15min_data_v2`

15-minute interval generation vs. consumption data across all consumer units and TOD slots.

| Column | Type | Description |
|--------|------|-------------|
| `reading_date` | date | Date of the 15-minute reading |
| `reading_time` | time | Time of the 15-minute interval (HH:MM:SS) |
| `location` | string | Consumer unit location name (e.g., MALLESWARAM) |
| `unit` | string | DISCOM account code for the unit (e.g., C2HT-136) |
| `tod_slot` | string | Time-of-Day tariff slot (e.g., Night Off Peak, Morning Peak) |
| `consumption` | numeric | Energy consumed in the interval (kWh) |
| `supplied_generation` | numeric | Solar energy supplied/allocated to this unit in the interval (kWh) |

**Warehouse mapping →** `generation_readings` + `consumption_readings` + `settlement_slots`

---

#### `hourly_gen_con2_v2`

Hourly aggregated generation vs. consumption per unit and TOD slot.

| Column | Type | Description |
|--------|------|-------------|
| `date` | date | Date of the hourly reading |
| `time` | time | Hour start time (HH:MM:SS) |
| `unit` | string | Consumer unit name and/or DISCOM account code |
| `tod_slot` | string | Time-of-Day tariff slot for the hour |
| `consumption` | numeric | Total energy consumed in the hour (kWh) |
| `supplied_generation` | numeric | Solar energy supplied to this unit in the hour (kWh) |

**Warehouse mapping →** Aggregated from `settlement_slots` in `tod_daily_summary`

---

#### `monthly_banking_settlement_data_v2`

Monthly banking settlement roll-up per consumer unit.

| Column | Type | Description |
|--------|------|-------------|
| `month` | string | Settlement month in `YYYY-MM` format |
| `unit` | string | Consumer unit name and DISCOM account code |
| `consumption` | numeric | Total monthly consumption (kWh) |
| `supplied_generation` | numeric | Total solar generation supplied to the unit (kWh) |
| `surplus_generation` | numeric | Generation surplus over consumption in matched slots (kWh) |
| `surplus_demand` | numeric | Consumption not met by solar (unmatched demand) (kWh) |
| `matched_settlement` | numeric | Generation directly matched and settled against consumption (kWh) |
| `settlement_with_banking` | numeric | Total settlement after applying banked energy credits (kWh) |
| `surplus_generation_after_banking` | numeric | Remaining surplus generation after banking utilisation (kWh) |
| `surplus_demand_after_banking` | numeric | Remaining unmet demand after banking utilisation (kWh) |

**Warehouse mapping →** `monthly_banking_settlement`

---

#### `monthly_savings_v2`

Monthly financial savings summary per consumer unit.

| Column | Type | Description |
|--------|------|-------------|
| `month` | string | Settlement month in `YYYY-MM` format |
| `unit` | string | Consumer unit name and DISCOM account code |
| `consumption` | numeric | Total monthly consumption (kWh) |
| `grid_cost` | numeric | Estimated cost if all consumption sourced from the grid (₹) |
| `actual_cost_with_banking` | numeric | Actual electricity cost with solar wheeling and banking (₹) |
| `savings_with_banking` | numeric | Savings achieved with solar banking vs. full grid cost (₹) |
| `savings_pct_with_banking` | numeric | Savings percentage with banking (%) |
| `actual_cost_without_banking` | numeric | Actual electricity cost with solar but without banking (₹) |
| `savings_without_banking` | numeric | Savings achieved without banking vs. full grid cost (₹) |
| `savings_pct_without_banking` | numeric | Savings percentage without banking (%) |

**Warehouse mapping →** `savings_summary`

---

### GIL Source Tables (MSEDCL / Maharashtra)

GIL operates a 5 MW hybrid plant (wind + solar) in Maharashtra under the MSEDCL open-access framework. Data covers 15-minute generation, TOD-based settlement, banking, cost components, and annual plant performance.

#### `plant_metadata`

Master reference for the GIL plant.

| Column | Type | Description |
|--------|------|-------------|
| `plant_id` | integer | Primary key |
| `plant_name` | string | Plant name (GIL) |
| `plant_type` | string | Plant type — HYBRID (wind + solar) |
| `location` | string | State where the plant is located (MAHARASHTRA) |
| `capacity_mw` | numeric | Installed capacity in MW (5.00 MW) |
| `created_at` | timestamp | Record creation timestamp |
| `updated_at` | timestamp | Record last updated timestamp |

**Warehouse mapping →** `plants` + `plant_energy_sources` (2 rows: SOLAR + WIND)

---

#### `solar_generation`

15-minute interval solar generation per panel/inverter serial number.

| Column | Type | Description |
|--------|------|-------------|
| `solar_gen_id` | integer | Primary key |
| `plant_id` | integer | Foreign key to `plant_metadata` |
| `serial_number` | string | Solar panel / inverter serial number (e.g., 22010390, 24004845) |
| `generation_date` | date | Date of the generation reading |
| `generation_time` | time | 15-minute interval time (HH:MM:SS) |
| `generation_value` | numeric | Net solar energy generated after losses (kWh) |
| `generation_before_losses` | numeric | Gross solar energy generated before T&D losses (kWh) |
| `created_at` | timestamp | Record creation timestamp |

**Warehouse mapping →** `generation_readings` (source_type = SOLAR, device_id = mapped serial)

---

#### `wind_generation`

15-minute interval wind generation per turbine serial number.

| Column | Type | Description |
|--------|------|-------------|
| `wind_gen_id` | integer | Primary key |
| `plant_id` | integer | Foreign key to `plant_metadata` |
| `serial_number` | string | Wind turbine serial number (e.g., 23005436, 23005438) |
| `generation_date` | date | Date of the generation reading |
| `generation_time` | time | 15-minute interval time (HH:MM:SS) |
| `generation_value` | numeric | Net wind energy generated after losses (kWh) |
| `generation_before_losses` | numeric | Gross wind energy generated before losses (kWh) |
| `created_at` | timestamp | Record creation timestamp |

**Warehouse mapping →** `generation_readings` (source_type = WIND, device_id = mapped serial)

---

#### `consumption_data`

15-minute interval electricity consumption for the GIL facility.

| Column | Type | Description |
|--------|------|-------------|
| `consumption_id` | integer | Primary key |
| `consumption_date` | date | Date of the consumption reading |
| `consumption_time` | time | 15-minute interval time (HH:MM:SS) |
| `consumption_value` | numeric | Total electricity consumed in the interval (kWh) |
| `created_at` | timestamp | Record creation timestamp |

**Warehouse mapping →** `consumption_readings`

---

#### `settlement_matching`

15-minute matching of generation from each source against consumption.

| Column | Type | Description |
|--------|------|-------------|
| `matching_id` | integer | Primary key |
| `settlement_date` | date | Date of the settlement interval |
| `settlement_time` | time | 15-minute interval time (HH:MM:SS) |
| `plant_id` | integer | Foreign key to `plant_metadata` |
| `serial_number` | string | Turbine or panel serial number |
| `generation_type` | string | Source type — SOLAR or WIND |
| `generation_value` | numeric | Net generation in the interval (kWh) |
| `generation_before_losses` | numeric | Gross generation before losses (kWh) |
| `slot_total_consumption` | numeric | Total facility consumption in the interval (kWh) |
| `allocated_consumption` | numeric | Consumption allocated to this generation source (kWh) |
| `surplus_generation` | numeric | Generation in excess of allocated consumption (kWh) |
| `surplus_gen_with_banking` | numeric | Surplus after applying banked units (kWh) |
| `matched_settlement` | numeric | Energy successfully matched and settled (kWh) |
| `created_at` | timestamp | Record creation timestamp |

**Warehouse mapping →** `settlement_slots` + `device_tod_summary`

---

#### `slot_summary`

15-minute aggregate across all generation sources.

| Column | Type | Description |
|--------|------|-------------|
| `slot_summary_id` | integer | Primary key |
| `summary_date` | date | Date of the interval |
| `summary_time` | time | 15-minute interval time (HH:MM:SS) |
| `generation_value` | numeric | Total combined generation (wind + solar) (kWh) |
| `slot_total_consumption` | numeric | Total consumption in the interval (kWh) |
| `allocated_consumption` | numeric | Consumption successfully met by RE generation (kWh) |
| `surplus_generation` | numeric | RE generation in excess of consumption (kWh) |
| `surplus_gen_with_banking` | numeric | Surplus available after banking credit application (kWh) |
| `matched_settlement` | numeric | Energy matched and settled in the interval (kWh) |

**Warehouse mapping →** Aggregated from `settlement_slots`

---

#### `tod_daily_summary` *(GIL source)*

Daily TOD-slot breakdown of generation, consumption, and settlement.

| Column | Type | Description |
|--------|------|-------------|
| `tod_daily_summary_id` | integer | Primary key |
| `summary_date` | date | Date of the summary |
| `tod_slot` | string | TOD slot name (normal, off-peak, peak) |
| `generation_value` | numeric | Total generation in this TOD slot for the day (kWh) |
| `allocated_consumption` | numeric | Consumption allocated to RE in this slot (kWh) |
| `matched_settlement` | numeric | Energy matched in this slot (kWh) |
| `surplus_demand` | numeric | Unmet demand in this slot (kWh) |
| `surplus_generation` | numeric | Unmatched surplus generation in this slot (kWh) |
| `surplus_gen_with_banking` | numeric | Surplus after banking adjustment (kWh) |
| `slot_total_consumption` | numeric | Total consumption in this TOD slot for the day (kWh) |

**Warehouse mapping →** `tod_daily_summary` (warehouse table)

---

#### `monthly_banking_settlement` *(GIL source)*

Monthly TOD-slot-wise banking settlement summary.

| Column | Type | Description |
|--------|------|-------------|
| `banking_id` | integer | Primary key |
| `settlement_month` | string | Settlement month in `YYYY-MM` format |
| `tod_slot` | string | TOD slot (normal, off-peak, peak) |
| `generation_value` | numeric | Total generation in this slot for the month (kWh) |
| `allocated_consumption` | numeric | Consumption allocated to RE in this slot (kWh) |
| `matched_settlement` | numeric | Energy directly matched in this slot (kWh) |
| `surplus_demand` | numeric | Unmet demand in this slot (kWh) |
| `surplus_generation` | numeric | Surplus generation before banking (kWh) |
| `surplus_gen_with_banking` | numeric | Surplus after banking utilisation (kWh) |
| `matched_settlement_intra_monthly` | numeric | Intra-monthly banking settlement (kWh) |
| `surplus_gen_intra_monthly` | numeric | Intra-monthly surplus generation (kWh) |
| `surplus_demand_intra_monthly` | numeric | Intra-monthly surplus demand (kWh) |

**Warehouse mapping →** `monthly_banking_settlement` (warehouse table)

---

#### `savings_summary` *(GIL source)*

Monthly financial savings comparing RE vs. full grid cost.

| Column | Type | Description |
|--------|------|-------------|
| `savings_id` | integer | Primary key |
| `settlement_month` | date | Settlement month (first of month) |
| `total_consumption` | numeric | Total facility consumption (kWh) |
| `grid_cost` | numeric | Estimated cost if all consumption from grid (₹) |
| `actual_cost_with_banking` | numeric | Actual RE cost after banking (₹) |
| `savings_with_banking` | numeric | Savings vs. grid with banking (₹) |
| `savings_pct_with_banking` | numeric | Savings % with banking |
| `actual_cost_without_banking` | numeric | RE cost without banking benefit (₹) |
| `savings_without_banking` | numeric | Savings vs. grid without banking (₹) |
| `savings_pct_without_banking` | numeric | Savings % without banking |

**Warehouse mapping →** `savings_summary` (warehouse table)

---

#### `grid_cost_component`

Monthly breakdown of MSEDCL grid bill into individual charge components.

| Column | Type | Description |
|--------|------|-------------|
| `grid_cost_id` | integer | Primary key |
| `month` | string | Billing month in `YYYY-MM` format |
| `demand_in_kva` | numeric | Demand charges in KVA (₹) |
| `energy_in_kvah` | numeric | Energy charges in KVAh (₹) |
| `bulk_discount` | numeric | Bulk consumption discount applied (₹) |
| `wheeling_charges` | numeric | Wheeling/network access charges (₹) |
| `tod_tariff` | numeric | Time-of-Day tariff component (₹) |
| `fca` | numeric | Fuel Cost Adjustment (₹) |
| `ed` | numeric | Electricity Duty (₹) |
| `tax_on_sale` | numeric | Tax on sale of electricity (₹) |
| `incremental_rebate` | numeric | Incremental consumption rebate (₹) |
| `debit_bill_adj` | numeric | Debit bill adjustment (₹) |
| `gom_merc_subsidy` | numeric | GoM/MERC Subsidy (₹) |
| `principle_arrears` | numeric | Principal arrears carried forward (₹) |
| `prompt_payment_discount` | numeric | Prompt/early payment discount (₹) |

**Warehouse mapping →** `grid_bill_line_items` (one row per charge head via `charge_head_types`)

---

#### `wind_solar_cost_component`

Monthly breakdown of wind and solar RE plant operating costs.

| Column | Type | Description |
|--------|------|-------------|
| `wind_solar_cost_id` | integer | Primary key |
| `month` | string | Cost month in `YYYY-MM` format |
| `om_charges` | numeric | Operation & Maintenance charges (₹) |
| `transmission_charges` | numeric | Transmission charges (₹) |
| `wheeling_charges` | numeric | Wheeling charges for grid access (₹) |
| `scheduling_charges` | numeric | SLDC scheduling and dispatching charges (₹) |
| `deviation_charges` | numeric | Deviation settlement mechanism (DSM) charges (₹) |
| `asset_mc` | numeric | Asset management / metering charges (₹) |
| `operating_charges_msedcl` | numeric | MSEDCL-specific operating charges (₹) |
| `oa_application_charges` | numeric | Open access application charges (₹) |
| `startup_power_bill` | numeric | Startup/auxiliary power consumption bill (₹) |
| `gst_reversal` | numeric | GST reversal amount (₹) |
| `depreciation` | numeric | Depreciation component (₹) |
| `tos` | numeric | Terms of supply / Transmission of Surplus charges (₹) |
| `overheads` | numeric | Administrative and other overhead costs (₹) |

**Warehouse mapping →** `re_bill_line_items` (one row per charge head via `charge_head_types`)

---

#### `tod_tariff`

Monthly TOD tariff rates for MSEDCL slots.

| Column | Type | Description |
|--------|------|-------------|
| `tod_tariff_id` | integer | Primary key |
| `month` | string | Tariff month in `YYYY-MM` format |
| `a` | numeric | Night Off-Peak rate (₹/kWh) |
| `b` | numeric | Morning rate (₹/kWh) |
| `c` | numeric | Day Normal rate (₹/kWh) |
| `d` | numeric | Evening Peak rate (₹/kWh) |

**Warehouse mapping →** `tariff_tod_rates`

---

#### `performance_metrics` *(GIL source)*

Annual plant-level performance covering PLF, generation, losses, and RE share.

| Column | Type | Description |
|--------|------|-------------|
| `metric_id` | integer | Primary key |
| `year` | string | Financial year (e.g., `2025-2026`) |
| `generation_turbine_level` | numeric | Total wind generation at turbine level (kWh) |
| `plf_wind_percent` | numeric | Plant Load Factor for wind (%) |
| `realised_kwh_cap_consumption_wind` | numeric | Wind generation allocated to captive consumption (kWh) |
| `sale_of_energy` | numeric | Wind energy sold to third parties (kWh) |
| `over_injection` | numeric | Wind energy over-injected into grid (kWh) |
| `solar_generation` | numeric | Total solar generation (kWh) |
| `plf_solar_percent` | numeric | Plant Load Factor for solar (%) |
| `realised_kwh_cap_consumption_solar` | numeric | Solar generation allocated to captive consumption (kWh) |
| `total_plant_consumption` | numeric | Total facility electricity consumption (kWh) |
| `total_re_consumption_capex` | numeric | RE consumed under CapEx arrangement (kWh) |
| `total_re_consumption_tpa` | numeric | RE consumed under Third Party Arrangement (kWh) |
| `total_re_percent` | numeric | Overall RE share of total consumption (%) |
| `banking_loss_percent_wind` | numeric | Banking-related loss % for wind |
| `banking_loss_percent_solar` | numeric | Banking-related loss % for solar |

**Warehouse mapping →** `performance_metrics` (warehouse table, split into SOLAR + WIND rows)

---

#### `wind_turbine_yearly_metrics`

Annual generation per individual wind turbine.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `year` | string | Financial year (e.g., `2025-2026`) |
| `wtg` | string | Wind Turbine Generator ID (e.g., GIL001–GIL009) |
| `generation_turbine_level` | numeric | Total annual generation for this turbine (kWh) |

**Warehouse mapping →** `device_yearly_metrics`

---

#### `users` *(GIL source)*

User accounts for GIL analytics portal.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `username` | string | Login username |
| `password_hash` | string | Hashed password |
| `full_name` | string | User's full name |
| `email` | string | User's email address |
| `role` | string | Access role — ADMIN or VIEWER |
| `is_active` | boolean | Whether the account is active |

**Warehouse mapping →** `tenant_users`

---

#### `chat_history` *(GIL source)*

AI assistant interaction logs.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `thread_id` | string | Conversation thread identifier |
| `role` | string | Message sender — `user` or `assistant` |
| `content` | string | Full text of the message |
| `timestamp` | timestamp | Message timestamp (IST) |

**Warehouse mapping →** `chat_threads` + `chat_messages`

---

---

## Part 2 — Data Warehouse Tables (schema_v2)

The unified warehouse schema supports C9 and GIL under a single multi-tenant PostgreSQL database. All dashboards, MCP tools, and API endpoints query these tables.

---

### Layer 0 — Reference / Lookup Tables

#### `states`

Master list of Indian states and union territories.

| Column | Type | Description |
|--------|------|-------------|
| `id` | smallserial | Primary key |
| `code` | varchar(10) | State code (`KA`, `MH`, `TN`, `RJ`, `GJ`, etc.) |
| `name` | varchar(100) | Full state name |
| `country` | varchar(50) | Country (default: India) |
| `timezone` | varchar(50) | IANA timezone (default: Asia/Kolkata) |

---

#### `discoms`

Distribution companies (DISCOMs). Adding a new DISCOM here requires no other schema changes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | smallserial | Primary key |
| `state_id` | smallint | FK → `states.id` |
| `code` | varchar(20) | DISCOM code (`BESCOM`, `MSEDCL`, `KSEB`, etc.) |
| `name` | varchar(200) | Full DISCOM name |
| `billing_cycle` | varchar(20) | Billing frequency — `MONTHLY` or `BIMONTHLY` |
| `currency` | char(3) | Currency code (default: INR) |
| `notes` | text | Free-text notes |

Seeded: BESCOM, MSEDCL, TANGEDCO, TSNPDCL, TSSPDCL, JVVNL, AVVNL, DGVCL, MGVCL, APEPDCL, DHBVN

---

#### `energy_source_types`

Renewable energy source types. HYBRID is never stored here — it is derived when a plant has both SOLAR and WIND rows in `plant_energy_sources`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | smallserial | Primary key |
| `code` | varchar(20) | Source code (`SOLAR`, `WIND`) |
| `name` | varchar(100) | Full name |
| `unit` | varchar(10) | Energy unit (default: kWh) |
| `description` | text | Description |
| `is_active` | boolean | Whether this source type is active |

---

#### `tod_slot_definitions`

Time-of-Day tariff windows per DISCOM. BESCOM and MSEDCL have different time ranges and multipliers — both stored here.

| Column | Type | Description |
|--------|------|-------------|
| `id` | smallserial | Primary key |
| `discom_id` | smallint | FK → `discoms.id` |
| `slot_code` | varchar(20) | Slot identifier (`PEAK`, `OFF_PEAK`, `NORMAL`, `NIGHT`) |
| `slot_name` | varchar(100) | Human-readable name |
| `time_from` | time | Slot start time |
| `time_to` | time | Slot end time |
| `applies_to_days` | varchar(20) | Day applicability (`ALL`, `WEEKDAY`, `WEEKEND`) |
| `multiplier` | decimal(6,4) | ToD rate multiplier over base tariff (e.g., 1.5 for PEAK) |
| `sort_order` | smallint | Display order |
| `effective_from` | date | When this slot definition takes effect |
| `effective_to` | date | When it expires (NULL = currently active) |

---

#### `charge_head_types`

**The extensibility cornerstone.** Every billing line item across every DISCOM is a row here. Adding a new DISCOM requires inserting new rows — never altering other tables.

| Column | Type | Description |
|--------|------|-------------|
| `id` | smallserial | Primary key |
| `category` | varchar(10) | `GRID` (electricity bill) or `RE` (renewable energy cost) |
| `code` | varchar(60) | Unique code (`ENERGY_CHARGE`, `BULK_DISCOUNT`, `GST_REVERSAL`, etc.) |
| `name` | varchar(200) | Display name |
| `unit` | varchar(20) | Unit type — `INR`, `kWh`, `kVAh`, or `PCT` |
| `is_credit` | boolean | TRUE for discounts, rebates, reversals (displayed as negative) |
| `applicable_discom_codes` | varchar[] | NULL = universal; `ARRAY['BESCOM']` = BESCOM only; `ARRAY['MSEDCL']` = MSEDCL only |
| `description` | text | Explanation of this charge head |
| `sort_order` | smallint | Display order within a bill |

**GRID charge heads seeded (universal):** `TOTAL_CONSUMPTION`, `ENERGY_CHARGE`, `DEMAND_CHARGE`, `WHEELING_ENERGY`, `WHEELING_CHARGE`, `FUEL_COST_ADJ`, `ELECTRICITY_DUTY`, `TAX_ON_SALE`, `TOD_TARIFF`, `CROSS_SUBSIDY_SURCHARGE`, `NET_PAYABLE`

**GRID charge heads seeded (BESCOM only):** `PG_SURCHARGE`, `MANUAL_ENERGY_WHEELING`

**GRID charge heads seeded (MSEDCL only):** `ENERGY_KVAH`, `BULK_DISCOUNT`, `INCREMENTAL_REBATE`, `DEBIT_BILL_ADJ`, `GOM_MERC_SUBSIDY`, `PRINCIPAL_ARREARS`, `PROMPT_PAYMENT_DISC`, `TOS_CHARGES`

**RE charge heads seeded (universal):** `OM_CHARGES`, `TRANSMISSION_CHARGES`, `WHEELING_CHARGES`, `SCHEDULING_CHARGES`, `DEVIATION_CHARGES`, `DEPRECIATION`

**RE charge heads seeded (MSEDCL only):** `ASSET_MC`, `OPERATING_CHARGES_MSEDCL`, `OA_APPLICATION_CHARGES`, `STARTUP_POWER_BILL`, `GST_REVERSAL`, `TOS_RE_CHARGES`

---

### Layer 1 — Tenants

#### `tenants`

One row per customer of Integrum Energy.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `code` | varchar(50) | Short unique code (`C9`, `GIL`, `ACME`) |
| `name` | varchar(200) | Full legal name |
| `short_name` | varchar(100) | Display name |
| `gstin` | varchar(20) | GST Identification Number |
| `pan` | varchar(15) | PAN number |
| `address` | text | Registered address |
| `city` | varchar(100) | City |
| `state_id` | smallint | FK → `states.id` |
| `pincode` | varchar(10) | PIN code |
| `primary_email` | varchar(200) | Primary contact email |
| `primary_phone` | varchar(20) | Primary contact phone |
| `contract_start` | date | Service contract start date |
| `contract_end` | date | Service contract end date |
| `is_active` | boolean | Whether tenant is currently active |
| `metadata` | jsonb | Flexible additional attributes |

---

#### `tenant_users`

User accounts scoped to a tenant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `email` | varchar(200) | Login email (unique across all tenants) |
| `full_name` | varchar(200) | User's full name |
| `role` | varchar(30) | `SUPER_ADMIN`, `ADMIN`, `ANALYST`, or `VIEWER` |
| `password_hash` | text | Bcrypt hashed password |
| `is_active` | boolean | Whether account is active |
| `last_login_at` | timestamptz | Last successful login timestamp |

---

### Layer 2 — Plants (Generation Side)

#### `plants`

A plant is a physical generation site — a solar farm, wind farm, or hybrid site.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `code` | varchar(50) | Tenant-scoped plant code (`GIL_PLANT_01`, `C9_KA_SOLAR`) |
| `name` | varchar(200) | Plant name |
| `state_id` | smallint | FK → `states.id` |
| `discom_id` | smallint | FK → `discoms.id` (injection DISCOM) |
| `latitude` | decimal(9,6) | GPS latitude |
| `longitude` | decimal(9,6) | GPS longitude |
| `address` | text | Plant site address |
| `commissioned_on` | date | Plant commissioning date |
| `is_active` | boolean | Whether plant is currently active |
| `metadata` | jsonb | Flexible additional attributes |

---

#### `plant_energy_sources`

Which energy sources a plant generates from. A plant with both SOLAR and WIND rows is classified as HYBRID (derived — never stored as a type).

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `plant_id` | int | FK → `plants.id` |
| `tenant_id` | int | FK → `tenants.id` |
| `source_type_id` | smallint | FK → `energy_source_types.id` |
| `installed_capacity_kw` | decimal(12,3) | Total installed capacity for this source (kW) |
| `contracted_capacity_kw` | decimal(12,3) | Capacity under open-access contract (kW) |
| `commissioned_on` | date | Source commissioning date |
| `decommissioned_on` | date | Source decommission date (NULL = active) |
| `is_active` | boolean | Whether this source is currently active |
| `meter_number` | varchar(100) | SLDC / DISCOM injection meter number |
| `open_access_type` | varchar(30) | `INTRA_STATE` or `INTER_STATE` |
| `wheeling_zone` | varchar(100) | Wheeling zone name |
| `sldc_applicant_id` | varchar(100) | SLDC scheduling applicant ID |

---

#### `devices`

Individual generation units — wind turbines, solar inverters, panel strings.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `plant_id` | int | FK → `plants.id` |
| `plant_energy_source_id` | int | FK → `plant_energy_sources.id` |
| `device_code` | varchar(100) | Device identifier (`GIL001`, `22010390`, `INV-01`) |
| `device_type` | varchar(30) | `TURBINE`, `INVERTER`, `PANEL_STRING`, `BATTERY`, `OTHER` |
| `manufacturer` | varchar(200) | Equipment manufacturer |
| `model` | varchar(200) | Equipment model |
| `serial_number` | varchar(200) | Manufacturer serial number |
| `capacity_kw` | decimal(10,3) | Nameplate capacity (kW) |
| `hub_height_m` | decimal(8,2) | Hub height in metres (wind turbines only) |
| `commissioned_on` | date | Device commissioning date |
| `decommissioned_on` | date | Device decommission date |
| `is_active` | boolean | Whether device is currently active |
| `metadata` | jsonb | Additional attributes (rotor diameter, panel count, etc.) |

---

### Layer 3 — Consumption Units (Offtake Side)

#### `consumption_units`

Any metered offtake point that receives RE power. For C9 these are BESCOM HT buildings; for GIL these are the plant's own consumption meters.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `discom_id` | smallint | FK → `discoms.id` (receiving DISCOM) |
| `code` | varchar(100) | Unit code (`C2HT-136`, `E4HT-355`) |
| `name` | varchar(200) | Unit name (`MALLESWARAM`, `WHITEFIELD`) |
| `address` | text | Physical address of the unit |
| `state_id` | smallint | FK → `states.id` |
| `tariff_category` | varchar(50) | DISCOM tariff slab (`HT-2B`, `LT-5`) |
| `connection_type` | varchar(10) | `HT`, `LT`, or `EHT` |
| `contract_demand_kva` | decimal(10,2) | Contracted demand limit (kVA) |
| `sanctioned_load_kw` | decimal(10,2) | Sanctioned load (kW) |
| `meter_number` | varchar(100) | DISCOM meter number |
| `discom_account_no` | varchar(100) | DISCOM billing account number |
| `is_active` | boolean | Whether unit is currently active |
| `metadata` | jsonb | Additional attributes (feeder info, voltage level, etc.) |

---

#### `plant_consumption_mappings`

Many-to-many mapping of which plant-source supplies which consumption units. Supports partial allocation (C9: 1 plant → 11 units; GIL: 1 plant → itself).

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `plant_energy_source_id` | int | FK → `plant_energy_sources.id` |
| `consumption_unit_id` | int | FK → `consumption_units.id` |
| `tenant_id` | int | FK → `tenants.id` |
| `allocation_pct` | decimal(7,4) | % of generation allocated to this unit (NULL = auto-distribute) |
| `priority_rank` | smallint | Which unit gets first priority for RE allocation |
| `effective_from` | date | When this mapping becomes active |
| `effective_to` | date | When it expires (NULL = currently active) |
| `is_active` | boolean | Whether mapping is active |

---

### Layer 4 — Tariff Configuration

#### `tariff_configs`

Master tariff configuration per DISCOM / tariff category / effective period.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `consumption_unit_id` | int | FK → `consumption_units.id` (NULL = DISCOM-level default) |
| `discom_id` | smallint | FK → `discoms.id` |
| `tariff_category` | varchar(50) | Tariff slab (`HT-2B`, `LT-5`, etc.) |
| `effective_from` | date | When this tariff takes effect |
| `effective_to` | date | When it expires |
| `energy_charge_per_kwh` | decimal(10,4) | Energy charge rate (₹/kWh) |
| `energy_charge_per_kvah` | decimal(10,4) | Energy charge rate (₹/kVAh) — MSEDCL |
| `demand_charge_per_kva` | decimal(10,4) | Demand charge (₹/kVA/month) |
| `fuel_cost_adj_per_unit` | decimal(10,4) | Fuel cost adjustment (₹/unit) |
| `electricity_duty_pct` | decimal(8,4) | Electricity duty percentage |
| `wheeling_charge_per_unit` | decimal(10,4) | Wheeling charge (₹/unit) |
| `transmission_charge_per_unit` | decimal(10,4) | Transmission charge (₹/unit) |
| `scheduling_charge_per_unit` | decimal(10,4) | Scheduling charge (₹/unit) |
| `cross_subsidy_surcharge` | decimal(10,4) | Cross-subsidy surcharge (₹/unit) |
| `banking_allowed` | boolean | Whether energy banking is permitted |
| `banking_loss_pct` | decimal(8,4) | Percentage loss applied to banked energy |
| `banking_period` | varchar(20) | Banking settlement period (`MONTHLY`, `QUARTERLY`, `ANNUAL`) |
| `lapse_at_period_end` | boolean | Whether unused banked energy lapses at period end |

---

#### `tariff_tod_rates`

Time-of-Day specific rates per tariff configuration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `tariff_config_id` | int | FK → `tariff_configs.id` |
| `tod_slot_id` | smallint | FK → `tod_slot_definitions.id` |
| `energy_rate` | decimal(10,4) | Rate for this TOD slot (₹/unit) |
| `multiplier` | decimal(6,4) | Multiplier over base rate (e.g., 1.5 for Peak) |

---

### Layer 5 — Generation Readings (15-min, Partitioned)

#### `generation_readings`

Core 15-minute generation time-series at device level. **Partitioned monthly** for query performance. Both C9 inverter data and GIL turbine/panel data flow here.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Partition primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `plant_id` | int | FK → `plants.id` |
| `plant_energy_source_id` | int | FK → `plant_energy_sources.id` |
| `device_id` | int | FK → `devices.id` |
| `source_type_id` | smallint | FK → `energy_source_types.id` (SOLAR or WIND) |
| `slot_start_time` | timestamptz | 15-minute interval start (partition key) |
| `slot_end_time` | timestamptz | 15-minute interval end |
| `generation_kwh` | decimal(14,4) | Net generation after T&D losses (kWh) |
| `generation_before_losses_kwh` | decimal(14,4) | Gross generation before losses (kWh) |
| `loss_pct` | decimal(8,4) | Loss percentage for this interval |
| `peak_power_kw` | decimal(12,4) | Peak power output in this slot (kW) |
| `avg_power_kw` | decimal(12,4) | Average power output in this slot (kW) |
| `is_estimated` | boolean | Whether value was estimated (vs. metered) |
| `data_source` | varchar(30) | `SCADA`, `MANUAL`, `IMPORT`, or `CALCULATED` |
| `ingestion_batch_id` | bigint | FK → `data_ingestion_logs.id` for traceability |

---

### Layer 6 — Consumption Readings (15-min, Partitioned)

#### `consumption_readings`

15-minute consumption time-series per consumption unit. **Partitioned monthly.**

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Partition primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `consumption_unit_id` | int | FK → `consumption_units.id` |
| `slot_start_time` | timestamptz | 15-minute interval start (partition key) |
| `slot_end_time` | timestamptz | 15-minute interval end |
| `consumption_kwh` | decimal(14,4) | Energy consumed (kWh) |
| `consumption_kvah` | decimal(14,4) | Energy consumed in kVAh (MSEDCL billing) |
| `demand_kva` | decimal(12,4) | Demand in kVA at peak of this slot |
| `demand_kw` | decimal(12,4) | Demand in kW |
| `power_factor` | decimal(6,4) | Power factor for this interval |
| `is_estimated` | boolean | Whether value was estimated |
| `data_source` | varchar(30) | `DISCOM`, `MANUAL`, `IMPORT`, or `CALCULATED` |
| `ingestion_batch_id` | bigint | FK → `data_ingestion_logs.id` |

---

### Layer 7 — Settlement Slots (15-min, Partitioned)

#### `settlement_slots`

15-minute record of how each consumption unit's demand was met: directly from generation, from banking, or from the grid. **Partitioned monthly.**

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Partition primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `plant_energy_source_id` | int | FK → `plant_energy_sources.id` |
| `consumption_unit_id` | int | FK → `consumption_units.id` |
| `slot_start_time` | timestamptz | Interval start (partition key) |
| `tod_slot_id` | smallint | FK → `tod_slot_definitions.id` |
| `generation_kwh` | decimal(14,4) | Raw generation in this interval (kWh) |
| `generation_losses_kwh` | decimal(14,4) | T&D losses in this interval (kWh) |
| `net_generation_kwh` | decimal(14,4) | Net generation after losses (kWh) |
| `consumption_kwh` | decimal(14,4) | Total consumption in this interval (kWh) |
| `direct_matched_kwh` | decimal(14,4) | Consumption met directly from generation (kWh) |
| `banking_utilised_kwh` | decimal(14,4) | Consumption met from banked energy (kWh) |
| `total_matched_kwh` | decimal(14,4) | Total matched (direct + banking) (kWh) |
| `surplus_kwh` | decimal(14,4) | Generation in excess of consumption — goes to banking (kWh) |
| `lapsed_kwh` | decimal(14,4) | Surplus that cannot be banked and is lapsed (kWh) |
| `grid_drawl_kwh` | decimal(14,4) | Unmet demand drawn from grid (kWh) |

---

### Layer 8 — TOD Daily Summary

#### `tod_daily_summary`

Daily aggregates per TOD slot at plant level. Powers the "Generation vs Consumption ToD wise" chart in both C9 and GIL.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `plant_energy_source_id` | int | FK → `plant_energy_sources.id` |
| `consumption_unit_id` | int | FK → `consumption_units.id` (NULL = all units) |
| `date` | date | Date of the summary |
| `tod_slot_id` | smallint | FK → `tod_slot_definitions.id` |
| `generation_kwh` | decimal(14,4) | Total generation in this slot (kWh) |
| `generation_losses_kwh` | decimal(14,4) | Generation losses in this slot (kWh) |
| `net_generation_kwh` | decimal(14,4) | Net generation after losses (kWh) |
| `consumption_kwh` | decimal(14,4) | Total consumption in this slot (kWh) |
| `direct_matched_kwh` | decimal(14,4) | Direct generation-to-consumption match (kWh) |
| `banking_utilised_kwh` | decimal(14,4) | Banking credits utilised (kWh) |
| `total_matched_kwh` | decimal(14,4) | Total matched consumption (kWh) |
| `surplus_kwh` | decimal(14,4) | Surplus generation (kWh) |
| `lapsed_kwh` | decimal(14,4) | Lapsed surplus (kWh) |
| `grid_drawl_kwh` | decimal(14,4) | Grid drawl to meet unmet demand (kWh) |

---

#### `device_tod_summary`

Daily TOD aggregates at individual device level. Powers GIL's "Unit-wise Generation vs Consumption ToD wise Turbine wise" chart where turbines (22010390 SOLAR, 23005424 WIND) are individually selectable.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `device_id` | int | FK → `devices.id` |
| `date` | date | Date of the summary |
| `tod_slot_id` | smallint | FK → `tod_slot_definitions.id` |
| `generation_kwh` | decimal(14,4) | Generation from this device in this slot (kWh) |
| `consumption_kwh` | decimal(14,4) | Consumption attributed to this device (kWh) |
| `direct_matched_kwh` | decimal(14,4) | Direct match from this device (kWh) |
| `surplus_kwh` | decimal(14,4) | Surplus from this device (kWh) |
| `lapsed_kwh` | decimal(14,4) | Lapsed surplus from this device (kWh) |

---

### Layer 9 — Monthly Banking Settlement

#### `monthly_banking_settlement`

Monthly banking ledger per plant-source and consumption unit, optionally split by TOD slot. `tod_slot_id = NULL` rows represent the full-month aggregate.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `plant_energy_source_id` | int | FK → `plant_energy_sources.id` |
| `consumption_unit_id` | int | FK → `consumption_units.id` |
| `month` | date | First day of the settlement month |
| `tod_slot_id` | smallint | FK → `tod_slot_definitions.id` (NULL = all slots) |
| `gross_generation_kwh` | decimal(16,4) | Total generation before losses (kWh) |
| `generation_losses_kwh` | decimal(16,4) | T&D losses (kWh) |
| `net_generation_kwh` | decimal(16,4) | Net delivered generation (kWh) |
| `total_consumption_kwh` | decimal(16,4) | Total consumption (kWh) |
| `direct_matched_kwh` | decimal(16,4) | Direct generation match (kWh) |
| `banking_utilised_kwh` | decimal(16,4) | Energy drawn from banking credits (kWh) |
| `total_matched_kwh` | decimal(16,4) | Total matched (direct + banking) (kWh) |
| `opening_banking_balance_kwh` | decimal(16,4) | Banking balance at start of month (kWh) |
| `surplus_before_banking_kwh` | decimal(16,4) | Surplus available before banking allocation (kWh) |
| `intra_month_banking_kwh` | decimal(16,4) | Banking credits settled within same month (kWh) |
| `carry_forward_banking_kwh` | decimal(16,4) | Banking credits carried to next month (kWh) |
| `banking_loss_kwh` | decimal(16,4) | Banking loss at agreed percentage (kWh) |
| `surplus_lapsed_kwh` | decimal(16,4) | Surplus that could not be banked and was lapsed (kWh) |
| `closing_banking_balance_kwh` | decimal(16,4) | Banking balance at end of month (kWh) |
| `unmet_demand_kwh` | decimal(16,4) | Consumption not met by RE — grid drawl (kWh) |
| `grid_import_kwh` | decimal(16,4) | Total grid import for the month (kWh) |
| `over_injection_kwh` | decimal(16,4) | RE energy over-injected into the grid (kWh) |
| `match_rate_pct` | decimal(8,4) | total_matched / net_generation × 100 |
| `replacement_pct` | decimal(8,4) | total_matched / total_consumption × 100 |

---

### Layer 10 — Billing (Flexible Line-Item Model)

#### `grid_bill_headers`

One grid bill header per consumption unit per billing period. Stores bill-level totals.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `consumption_unit_id` | int | FK → `consumption_units.id` |
| `discom_id` | smallint | FK → `discoms.id` |
| `bill_date` | date | Date the bill was issued |
| `billing_period_from` | date | Billing period start |
| `billing_period_to` | date | Billing period end |
| `total_units_kwh` | decimal(16,4) | Total units billed (kWh) |
| `total_units_kvah` | decimal(16,4) | Total units billed (kVAh) — MSEDCL |
| `gross_amount_inr` | decimal(16,4) | Bill amount before RE credit (₹) |
| `net_payable_inr` | decimal(16,4) | Actual amount after RE credit (₹) |
| `savings_inr` | decimal(16,4) | Savings from RE for this bill (₹) |
| `bill_number` | varchar(100) | DISCOM bill reference number |
| `bill_source` | varchar(20) | `DISCOM`, `MANUAL`, or `IMPORT` |
| `raw_data` | jsonb | Original bill payload for audit |
| `ingestion_batch_id` | bigint | FK → `data_ingestion_logs.id` |

---

#### `grid_bill_line_items`

One row per charge head per bill. This is the core flexible table — BESCOM bills have ~8 rows; MSEDCL bills have ~15 rows, each referencing a different `charge_head_id`. TOD tariff drill-down is achieved by having one row per TOD slot with `tod_slot_id` populated.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `bill_header_id` | bigint | FK → `grid_bill_headers.id` |
| `charge_head_id` | smallint | FK → `charge_head_types.id` |
| `tod_slot_id` | smallint | FK → `tod_slot_definitions.id` (for ToD drill-down rows; NULL otherwise) |
| `units_kwh` | decimal(16,4) | Quantity in kWh |
| `units_kvah` | decimal(16,4) | Quantity in kVAh (MSEDCL) |
| `demand_kva` | decimal(12,4) | Demand in kVA (for demand charge rows) |
| `rate` | decimal(14,6) | Rate applied for this charge head |
| `amount_without_re` | decimal(16,4) | Amount this line would be without RE (₹) |
| `amount_with_re` | decimal(16,4) | Actual amount after RE credit (₹) |
| `savings_inr` | decimal(16,4) | Savings on this line item (₹) |
| `is_credit` | boolean | TRUE for discount/rebate rows |
| `notes` | text | Free-text notes |

---

#### `re_bill_headers`

One RE cost bill per plant-source per billing period. Covers O&M invoices, wheeling bills, and MSEDCL operational charges.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `plant_energy_source_id` | int | FK → `plant_energy_sources.id` |
| `billing_period_from` | date | Period start |
| `billing_period_to` | date | Period end |
| `total_amount_inr` | decimal(16,4) | Total RE cost for this period (₹) |
| `invoice_number` | varchar(100) | Vendor invoice reference |
| `vendor_name` | varchar(200) | O&M vendor or DISCOM name |
| `bill_source` | varchar(20) | `MANUAL`, `IMPORT`, or `DISCOM` |
| `raw_data` | jsonb | Original invoice data for audit |

---

#### `re_bill_line_items`

One row per RE charge head per RE bill. Handles all universal charges (O&M, wheeling, scheduling) and MSEDCL-specific charges (Asset MC, OA Application, Startup Power Bill, GST Reversal, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `re_bill_header_id` | bigint | FK → `re_bill_headers.id` |
| `charge_head_id` | smallint | FK → `charge_head_types.id` |
| `units_kwh` | decimal(16,4) | Energy quantity (kWh) |
| `rate` | decimal(14,6) | Rate per unit |
| `amount_inr` | decimal(16,4) | Amount for this charge (₹) |
| `is_credit` | boolean | TRUE for GST reversals and rebates |
| `notes` | text | Free-text notes |

---

### Layer 11 — Savings Summary

#### `savings_summary`

Monthly savings KPIs per plant-source and consumption unit. The foundation of most dashboard charts (Grid Cost vs Actual Cost, Unit-wise Summary, Power Cost Analysis, Monthly Heatmap).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `plant_energy_source_id` | int | FK → `plant_energy_sources.id` |
| `consumption_unit_id` | int | FK → `consumption_units.id` |
| `month` | date | First day of the month |
| `grid_cost_without_re` | decimal(16,4) | Hypothetical full-grid cost (₹) |
| `re_cost` | decimal(16,4) | Total RE operational cost (wheeling + O&M + …) (₹) |
| `actual_cost_with_re` | decimal(16,4) | Grid drawl cost + RE cost (₹) |
| `cost_without_banking` | decimal(16,4) | Actual cost ignoring banking credits (₹) |
| `cost_with_banking` | decimal(16,4) | Actual cost with banking credits applied (₹) |
| `savings_without_banking` | decimal(16,4) | Savings vs. grid without banking (₹) |
| `savings_with_banking` | decimal(16,4) | Savings vs. grid with banking (₹) |
| `savings_amount_inr` | decimal(16,4) | Net savings for this month (₹) |
| `savings_pct` | decimal(10,4) | Savings as % of grid cost (can exceed 100 for GIL in peak months) |
| `effective_rate_per_unit` | decimal(10,4) | Blended cost actually paid (₹/kWh) |
| `grid_rate_per_unit` | decimal(10,4) | What grid would have cost per kWh |
| `total_generation_kwh` | decimal(16,4) | Total RE generation for the month (kWh) |
| `total_consumption_kwh` | decimal(16,4) | Total consumption (kWh) |
| `total_matched_kwh` | decimal(16,4) | RE units that replaced grid (kWh) |
| `replacement_pct` | decimal(8,4) | % of consumption met by RE |

---

#### `device_savings_summary`

Monthly savings per individual device (turbine/inverter/panel). Powers GIL's per-turbine savings heatmap where savings_pct can exceed 100%.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `device_id` | int | FK → `devices.id` |
| `month` | date | First day of the month |
| `grid_cost_without_re` | decimal(16,4) | Grid cost without this device's contribution (₹) |
| `actual_cost_with_re` | decimal(16,4) | Actual cost with this device's contribution (₹) |
| `savings_amount_inr` | decimal(16,4) | Savings attributed to this device (₹) |
| `savings_pct` | decimal(10,4) | Savings % (can exceed 100) |
| `generation_kwh` | decimal(14,4) | Generation from this device for the month (kWh) |
| `consumption_kwh` | decimal(14,4) | Consumption attributed to this device (kWh) |
| `matched_kwh` | decimal(14,4) | RE units matched to consumption from this device (kWh) |

---

### Layer 12 — Performance Metrics

#### `performance_metrics`

Annual plant + source level performance — financial year granularity. Covers PLF, PR, generation, losses, settlement outcomes, and financials.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `plant_energy_source_id` | int | FK → `plant_energy_sources.id` |
| `financial_year` | varchar(9) | Financial year (`2025-2026`) |
| `gross_generation_kwh` | decimal(18,4) | Total generation before losses (kWh) |
| `net_generation_kwh` | decimal(18,4) | Net generation after losses (kWh) |
| `generation_losses_kwh` | decimal(18,4) | Total losses (kWh) |
| `plf_pct` | decimal(8,4) | Plant Load Factor (%) |
| `pr_pct` | decimal(8,4) | Performance Ratio % (solar) |
| `availability_pct` | decimal(8,4) | Equipment availability % |
| `realised_cap_consumption_kwh` | decimal(18,4) | RE units actually consumed from captive (kWh) |
| `over_injection_kwh` | decimal(18,4) | Units over-injected into grid (kWh) |
| `sale_of_energy_kwh` | decimal(18,4) | Units sold to third parties (kWh) |
| `sale_of_energy_inr` | decimal(16,4) | Revenue from energy sales (₹) |
| `total_plant_consumption_kwh` | decimal(18,4) | Total facility consumption (kWh) |
| `total_re_consumption_kwh` | decimal(18,4) | RE portion of consumption (kWh) |
| `replacement_pct` | decimal(8,4) | RE replacement % |
| `total_re_cost_inr` | decimal(16,4) | Total RE operational cost for the year (₹) |
| `total_grid_cost_saved_inr` | decimal(16,4) | Grid cost avoided (₹) |
| `total_savings_inr` | decimal(16,4) | Net savings for the year (₹) |
| `ebitda_inr` | decimal(16,4) | EBITDA (revenue − OPEX) (₹) |

---

#### `device_yearly_metrics`

Annual performance per individual device. Powers GIL's "Wind Turbine Yearly Metrics" table (GIL001–GIL009 generation per year).

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `device_id` | int | FK → `devices.id` |
| `financial_year` | varchar(9) | Financial year (`2025-2026`) |
| `generation_kwh` | decimal(18,4) | Total annual generation (kWh) |
| `plf_pct` | decimal(8,4) | Plant Load Factor (%) |
| `availability_pct` | decimal(8,4) | Availability percentage |
| `pr_pct` | decimal(8,4) | Performance Ratio % |
| `downtime_hours` | decimal(10,2) | Total downtime hours in the year |
| `p50_generation_kwh` | decimal(18,4) | P50 estimated generation for variance analysis (kWh) |

---

### Layer 13 — Data Ingestion Audit

#### `data_ingestion_logs`

Tracks every ETL batch load so data quality issues can be traced to their source file and run.

| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `source_system` | varchar(50) | Source system (`C9_DBEAVER`, `GIL_DBEAVER`, `SCADA`, `MANUAL`) |
| `table_name` | varchar(100) | Warehouse table being loaded |
| `file_name` | varchar(500) | Source file path or API endpoint |
| `records_processed` | int | Total records attempted |
| `records_inserted` | int | Records successfully inserted |
| `records_skipped` | int | Duplicate or excluded records |
| `records_errored` | int | Records that failed |
| `period_from` | date | Earliest data date in this batch |
| `period_to` | date | Latest data date in this batch |
| `status` | varchar(20) | `SUCCESS`, `PARTIAL`, `FAILED`, or `RUNNING` |
| `error_details` | jsonb | Error messages and row-level details |
| `started_at` | timestamptz | Batch start timestamp |
| `completed_at` | timestamptz | Batch completion timestamp |

---

### Layer 14 — AI / Chat

#### `chat_threads`

Conversation sessions per tenant user (used by MCP-powered natural language queries).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `tenant_id` | int | FK → `tenants.id` |
| `user_id` | int | FK → `tenant_users.id` |
| `title` | varchar(500) | Auto-generated or user-set thread title |
| `created_at` | timestamptz | Thread creation timestamp |
| `updated_at` | timestamptz | Last message timestamp |

---

#### `chat_messages`

Individual messages within a chat thread.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `thread_id` | uuid | FK → `chat_threads.id` |
| `tenant_id` | int | FK → `tenants.id` |
| `role` | varchar(20) | `user`, `assistant`, `tool`, or `system` |
| `content` | text | Full message content |
| `tool_calls` | jsonb | MCP tool calls and results for assistant messages |
| `token_count` | int | Token count for billing/monitoring |
| `created_at` | timestamptz | Message timestamp |

---

## Part 3 — Views Reference

| View | Replaces / Aggregates | Primary Use |
|------|----------------------|-------------|
| `v_plant_capabilities` | `plant_energy_sources` + `energy_source_types` | SOLAR / WIND / HYBRID classification; "Select Plant Type" filter |
| `v_monthly_generation` | `generation_readings` | Monthly net + gross generation per source |
| `v_monthly_savings_overview` | `savings_summary` + all dimension tables | Full savings KPIs with tenant/unit/DISCOM labels |
| `v_device_savings_heatmap` | `device_savings_summary` + `devices` | GIL per-turbine heatmap (`"GIL001 WIND"`, `"22010390 SOLAR"`) |
| `v_gen_cons_settlement_monthly` | `monthly_banking_settlement` | 6-series monthly breakdown chart (Generation, Losses, Consumption, Matched, Banking, Lapsed) |
| `v_gen_cons_by_plant_type` | `v_gen_cons_settlement_monthly` + plant type | Same chart with Plant Type filter (`ALL` / `SOLAR` / `WIND`) |
| `v_discom_bill_detail` | `grid_bill_headers` + `grid_bill_line_items` + `charge_head_types` | DISCOM Bill table with all charge head names expanded |
| `v_re_cost_detail` | `re_bill_headers` + `re_bill_line_items` + `charge_head_types` | Wind & Solar Cost Component table with charge names |

---

## Part 4 — Source-to-Warehouse ETL Mapping

| Source Table | Source | → Warehouse Table(s) |
|---|---|---|
| `discom_bill_v2` | C9 | `grid_bill_headers` + `grid_bill_line_items` |
| `effective_rate_summary` | C9 | `savings_summary` (effective_rate_per_unit, grid_rate_per_unit) |
| `gen_cons_15min_data_v2` | C9 | `generation_readings` + `consumption_readings` + `settlement_slots` |
| `hourly_gen_con2_v2` | C9 | `tod_daily_summary` (aggregated) |
| `monthly_banking_settlement_data_v2` | C9 | `monthly_banking_settlement` |
| `monthly_savings_v2` | C9 | `savings_summary` |
| `plant_metadata` | GIL | `plants` + `plant_energy_sources` (2 rows) |
| `solar_generation` | GIL | `generation_readings` (source_type=SOLAR) |
| `wind_generation` | GIL | `generation_readings` (source_type=WIND) |
| `consumption_data` | GIL | `consumption_readings` |
| `settlement_matching` | GIL | `settlement_slots` + `device_tod_summary` |
| `slot_summary` | GIL | Aggregated from `settlement_slots` |
| `tod_daily_summary` | GIL | `tod_daily_summary` |
| `monthly_banking_settlement` | GIL | `monthly_banking_settlement` |
| `savings_summary` | GIL | `savings_summary` + `device_savings_summary` |
| `grid_cost_component` | GIL | `grid_bill_line_items` (one row per column via charge_head_types) |
| `wind_solar_cost_component` | GIL | `re_bill_line_items` (one row per column via charge_head_types) |
| `tod_tariff` | GIL | `tariff_tod_rates` |
| `performance_metrics` | GIL | `performance_metrics` (split into SOLAR + WIND rows) |
| `wind_turbine_yearly_metrics` | GIL | `device_yearly_metrics` |
| `users` | GIL | `tenant_users` |
| `chat_history` | GIL | `chat_threads` + `chat_messages` |

---

## Part 5 — Cross-Source Comparison

| Aspect | C9 (Cloud9 / BESCOM) | GIL (Graphite India / MSEDCL) |
|--------|---------------------|-------------------------------|
| Plant type | Solar only | Hybrid — Wind + Solar |
| State | Karnataka | Maharashtra |
| DISCOM | BESCOM | MSEDCL |
| Capacity | Multiple solar units | 5 MW (wind + solar) |
| Consumption side | 11 HT BESCOM buildings | Plant self-consumption |
| Savings heatmap | Per consumption unit | Per device/turbine serial |
| savings_pct range | 70%–90% typical | Can exceed 100% (banking surplus) |
| Grid bill structure | ~8 line items | ~15 line items (MSEDCL-specific) |
| RE cost structure | O&M, wheeling, scheduling | + Asset MC, OA Charges, Startup Power, GST Reversal, ToS |
| Generation granularity | 15-min per solar array | 15-min per turbine (GIL001–GIL009) + per solar panel serial |
| TOD slots | PEAK / OFF-PEAK / NORMAL / NIGHT | PEAK / OFF-PEAK / NORMAL |
| Annual reporting | Unit-wise savings | PLF, over-injection, sale of energy, realised cap consumption |
| Source tables | 6 | 16 |
| Warehouse tables used | All (layers 0–14) | All (layers 0–14) |
