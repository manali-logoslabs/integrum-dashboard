# Integrum Energy — Data Warehouse Design v2.0

## Overview

This document explains every design decision behind `schema_v2.sql`. The schema supports multiple renewable energy customers with different DISCOM billing structures, generation source mixes, and data granularity needs — without requiring structural changes when a new client is onboarded.

**Current clients:**

| Client | DISCOM | State | Sources | Consumption Side |
|--------|--------|-------|---------|-----------------|
| C9 (Cloud9 Energy) | BESCOM | Karnataka | Solar only | 11 HT buildings (MALLESWARAM, WHITEFIELD, …) |
| GIL (Graphite India Limited) | MSEDCL | Maharashtra | Solar + Wind (Hybrid) | Plant self-consumption + turbine-level tracking |

---

## Architecture: 14 Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 0  Reference Tables                                          │
│           states · discoms · energy_source_types                    │
│           tod_slot_definitions · charge_head_types                  │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 1  Tenants                                                   │
│           tenants · tenant_users                                    │
├──────────────────────────────┬──────────────────────────────────────┤
│  LAYER 2  Plants             │  LAYER 3  Consumption Units          │
│  (Generation Side)           │  (Offtake Side)                     │
│  plants                      │  consumption_units                  │
│  plant_energy_sources        │  plant_consumption_mappings         │
│  devices                     │                                     │
├──────────────────────────────┴──────────────────────────────────────┤
│  LAYER 4  Tariff & Open-Access Configuration                        │
│           tariff_configs · tariff_tod_rates                         │
├────────────────────┬────────────────────┬───────────────────────────┤
│  LAYER 5           │  LAYER 6           │  LAYER 7                  │
│  Generation        │  Consumption       │  Settlement Slots         │
│  Readings (15-min) │  Readings (15-min) │  (15-min matching)        │
│  [partitioned]     │  [partitioned]     │  [partitioned]            │
├────────────────────┴────────────────────┴───────────────────────────┤
│  LAYER 8  TOD Daily Summary                                         │
│           tod_daily_summary (plant level)                           │
│           device_tod_summary (device/turbine level — GIL)           │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 9  Monthly Banking Settlement                                │
│           monthly_banking_settlement                                │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 10  Billing — Flexible Line-Item Model                       │
│            grid_bill_headers · grid_bill_line_items                 │
│            re_bill_headers   · re_bill_line_items                   │
│            ← charge_head_types drives all line items                │
├──────────────────────────────┬──────────────────────────────────────┤
│  LAYER 11  Savings Summary   │  LAYER 12  Performance Metrics      │
│  savings_summary             │  performance_metrics                 │
│  device_savings_summary      │  device_yearly_metrics              │
├──────────────────────────────┴──────────────────────────────────────┤
│  LAYER 13  Data Ingestion Audit                                     │
│            data_ingestion_logs                                      │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 14  AI / Chat (MCP-powered)                                  │
│            chat_threads · chat_messages                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Flexible Billing — `charge_head_types` Catalog

The single most important extensibility decision. Every billing line item across every DISCOM is a row in `charge_head_types`. Grid bill line items and RE cost line items reference this table via `charge_head_id`.

**Why this matters:**

| Old approach | New approach |
|---|---|
| Add 12 columns to `grid_cost_components` for MSEDCL | Insert 12 rows into `charge_head_types` |
| ALTER TABLE required for every new DISCOM | Zero schema migration |
| C9 and GIL have different columns → messy NULLs | Each DISCOM only inserts the rows it uses |
| Hard to add ToD-wise drill-down | Each ToD slot = a separate line item row with `tod_slot_id` |

**BESCOM (C9) charge heads used:**
`ENERGY_CHARGE`, `DEMAND_CHARGE`, `WHEELING_ENERGY`, `WHEELING_CHARGE`, `FUEL_COST_ADJ`, `PG_SURCHARGE`, `MANUAL_ENERGY_WHEELING`, `NET_PAYABLE`

**MSEDCL (GIL) charge heads used:**
`ENERGY_KVAH`, `DEMAND_CHARGE`, `WHEELING_CHARGE`, `TOD_TARIFF` (with per-slot rows), `FUEL_COST_ADJ`, `ELECTRICITY_DUTY`, `TAX_ON_SALE`, `BULK_DISCOUNT`, `INCREMENTAL_REBATE`, `DEBIT_BILL_ADJ`, `GOM_MERC_SUBSIDY`, `PRINCIPAL_ARREARS`, `PROMPT_PAYMENT_DISC`, `TOS_CHARGES`, `NET_PAYABLE`

**RE charge heads used by GIL/MSEDCL (not in C9):**
`ASSET_MC`, `OPERATING_CHARGES_MSEDCL`, `OA_APPLICATION_CHARGES`, `STARTUP_POWER_BILL`, `GST_REVERSAL`, `TOS_RE_CHARGES`

**Adding a new DISCOM (e.g. TSNPDCL):**
```sql
-- Step 1: Add the DISCOM
INSERT INTO discoms (state_id, code, name) VALUES (..., 'TSNPDCL', '...');

-- Step 2: Add any new charge heads it uses
INSERT INTO charge_head_types (category, code, name, applicable_discom_codes)
VALUES ('GRID', 'TSNPDCL_SURCHARGE', 'TSNPDCL Special Surcharge', ARRAY['TSNPDCL']);

-- Step 3: Load bills — zero schema changes
```

---

### 2. HYBRID Is Derived, Never Stored

A plant is HYBRID when it has both a `SOLAR` and a `WIND` row in `plant_energy_sources`. This is computed at query time via the `v_plant_capabilities` view:

```sql
-- All HYBRID plants
SELECT plant_name, tenant_name FROM v_plant_capabilities WHERE plant_type = 'HYBRID';

-- All SOLAR-only plants
SELECT plant_name FROM v_plant_capabilities WHERE has_solar = TRUE AND has_wind = FALSE;

-- All WIND-only plants
SELECT plant_name FROM v_plant_capabilities WHERE has_wind = TRUE AND has_solar = FALSE;
```

Adding a third source in the future (e.g. Battery Storage) requires only:
```sql
INSERT INTO energy_source_types (code, name) VALUES ('BATTERY', 'Battery Energy Storage');
-- Then add a plant_energy_sources row for BATTERY to the relevant plant
```

---

### 3. Device-Level Savings (`device_savings_summary`)

C9's savings heatmap groups by **consumption unit** (building). GIL's heatmap groups by **device serial number** (turbine/panel). These are fundamentally different entities.

`device_savings_summary` stores one row per device per month:
- `savings_pct` is allowed to exceed 100% — this is valid and intentional for GIL, where banking credits can fully offset grid cost plus more in peak generation months (132.6% was observed).

The `v_device_savings_heatmap` view produces labels matching the screenshot format:

```sql
-- Returns: "GIL001 WIND", "22010390 SOLAR", "23005436 WIND", ...
SELECT unit_label, month, savings_pct, savings_amount_inr
FROM v_device_savings_heatmap
WHERE tenant_code = 'GIL'
ORDER BY device_code, month;
```

---

### 4. Device-Level TOD Summary (`device_tod_summary`)

GIL's dashboard shows a "Unit-wise Generation vs Consumption ToD wise Turbine wise" chart where individual turbines (22010390 SOLAR, 23005424 WIND) are selectable with granularity (daily/monthly) and TOD slot filters (NORMAL, OFF-PEAK, PEAK).

`device_tod_summary` stores daily generation/consumption/matched/lapsed per device per TOD slot, populated from `settlement_slots` via the ETL pipeline.

`tod_daily_summary` handles the simpler plant-level view (same chart, no device selection).

---

### 5. Consumption Units vs Plants

These are distinct entities and must not be conflated:

| | C9 | GIL |
|---|---|---|
| `plants` | 1 solar farm (Karnataka) | 1 hybrid site (Maharashtra) |
| `plant_energy_sources` | 1 row (SOLAR) | 2 rows (SOLAR, WIND) |
| `consumption_units` | 11 BESCOM HT connections (buildings) | 1–2 units (plant itself + captive) |
| `plant_consumption_mappings` | 1 plant → 11 units | 1 plant → 1 unit |

The `plant_consumption_mappings` table carries an `allocation_pct` and `priority_rank`, making it possible to model partial supply (e.g. one plant sends 60% to Unit A and 40% to Unit B).

---

### 6. Monthly Partitioning on High-Volume Tables

Three tables are partitioned by `slot_start_time` (one partition per month):
- `generation_readings` — 96 slots × N devices × 365 days
- `consumption_readings` — 96 slots × N units × 365 days
- `settlement_slots` — 96 slots × N unit-plant pairs × 365 days

Queries that filter by month only scan the relevant partition(s), reducing I/O by orders of magnitude at scale.

```sql
-- Only scans the 2025-08 partition, not the full table
SELECT SUM(generation_kwh) FROM generation_readings
WHERE tenant_id = 1 AND slot_start_time >= '2025-08-01' AND slot_start_time < '2025-09-01';
```

Partitions from April 2024 to March 2027 are created in `schema_v2.sql` via a PL/pgSQL loop. In production, use `pg_partman` with `run_maintenance()` to auto-create future partitions.

---

### 7. TOD Slot Definitions Per DISCOM

BESCOM and MSEDCL have different TOD windows and multipliers. Both are stored in `tod_slot_definitions` keyed to their respective `discom_id`. All settlement, banking, and billing queries join to this table to pick the correct slot for each timestamp.

```sql
-- Identify which TOD slot a timestamp falls in for MSEDCL
SELECT slot_code FROM tod_slot_definitions
WHERE discom_id = (SELECT id FROM discoms WHERE code = 'MSEDCL')
  AND '2025-08-15 19:30:00'::TIME BETWEEN time_from AND time_to
  AND effective_from <= '2025-08-15' AND (effective_to IS NULL OR effective_to > '2025-08-15');
```

---

### 8. Financial Year Convention

India uses April–March financial years. `performance_metrics` and `device_yearly_metrics` store `financial_year VARCHAR(9)` as `'2025-2026'`.

```sql
-- Current financial year helper
SELECT CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
            THEN EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' ||
                 (EXTRACT(YEAR FROM CURRENT_DATE)+1)::TEXT
            ELSE (EXTRACT(YEAR FROM CURRENT_DATE)-1)::TEXT || '-' ||
                 EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
       END AS current_fy;
```

---

## Dashboard-to-Table Mapping

### C9 Dashboards

| Dashboard / Chart | Primary Tables | Key Columns |
|---|---|---|
| Generation, Consumption & Settlement Breakdown | `v_gen_cons_settlement_monthly` | All 6 series: generation, consumption, matched, banking, lapsed, grid |
| Grid Cost vs Actual Cost (unit-wise bars) | `savings_summary` | `grid_cost_without_re`, `actual_cost_with_re`, `savings_pct` |
| Monthly Savings Heatmap (per unit) | `savings_summary` | GROUP BY `consumption_unit_id`, `month`, `savings_pct` |
| Unit-wise Cost Summary Table | `savings_summary` | SUM by unit across date range |
| Power Cost Analysis (With/Without Banking) | `savings_summary` | `cost_with_banking`, `cost_without_banking` |
| DISCOM Bill – All Units | `v_discom_bill_detail` | All BESCOM charge heads |
| Electricity Consumption Summary | `grid_bill_headers` | `total_units_kwh`, `gross_amount_inr` |

### GIL Dashboards

| Dashboard / Chart | Primary Tables | Key Columns |
|---|---|---|
| Generation, Consumption & Settlement Breakdown | `v_gen_cons_settlement_monthly` + `v_gen_cons_by_plant_type` | Adds "Generation Losses" series; Plant Type filter |
| Total Grid vs Actual Cost (monthly bars) | `savings_summary` | GROUP BY `month` |
| Monthly Savings Heatmap (per turbine/panel) | `v_device_savings_heatmap` | `unit_label`, `savings_pct` (can exceed 100%) |
| Generation & Consumption Analysis — TOD-wise | `tod_daily_summary` | `tod_slot_id`, daily/monthly granularity |
| Unit-wise TOD — Turbine-wise | `device_tod_summary` | `device_id`, `tod_slot_id`, Show Gen/Cons/Lapsed toggles |
| Grid Cost Component (MSEDCL) | `v_discom_bill_detail` | MSEDCL charge heads; `TOD_TARIFF` with `tod_slot_id` drill-down |
| Wind & Solar Cost Component | `v_re_cost_detail` | All RE charge heads per source |
| Performance Metrics Table | `performance_metrics` | PLF%, over injection, sale of energy, realised cap |
| Wind Turbine Yearly Metrics | `device_yearly_metrics` | `device_code` (GIL001–GIL009), `generation_kwh` |

---

## Multi-Tenant Isolation

Every table has `tenant_id`. All API queries and MCP tool calls filter by the authenticated tenant's ID. No cross-tenant data leakage is possible at the row level.

For additional security, PostgreSQL Row-Level Security (RLS) can be enabled:

```sql
ALTER TABLE savings_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON savings_summary
    USING (tenant_id = current_setting('app.current_tenant_id')::INT);
```

---

## Onboarding a New Client — Checklist

To onboard a new renewable energy client with zero schema changes:

```sql
-- 1. Add the tenant
INSERT INTO tenants (code, name, city, state_id) VALUES ('ACME', 'ACME Wind Ltd', 'Pune', ...);

-- 2. Add any new DISCOM (if not already present)
INSERT INTO discoms (state_id, code, name) VALUES (..., 'MSEDCL', '...'); -- already present for GIL

-- 3. Add any new TOD slot definitions for the DISCOM
INSERT INTO tod_slot_definitions (...);   -- only if new DISCOM not yet configured

-- 4. Add plants
INSERT INTO plants (tenant_id, code, name, state_id, discom_id) VALUES (...);

-- 5. Add energy sources for each plant
INSERT INTO plant_energy_sources (plant_id, tenant_id, source_type_id, installed_capacity_kw) VALUES (...);

-- 6. Add devices (turbines, inverters)
INSERT INTO devices (tenant_id, plant_id, plant_energy_source_id, device_code, device_type, ...) VALUES (...);

-- 7. Add consumption units
INSERT INTO consumption_units (tenant_id, discom_id, code, name, ...) VALUES (...);

-- 8. Map plants to consumption units
INSERT INTO plant_consumption_mappings (plant_energy_source_id, consumption_unit_id, ...) VALUES (...);

-- 9. Configure tariffs
INSERT INTO tariff_configs (...); INSERT INTO tariff_tod_rates (...);

-- 10. Begin ETL ingestion — all historical data flows into existing tables
```

**No new tables. No ALTER TABLE. No code changes.** All dashboards work immediately once data is loaded.

---

## Views Reference

| View | Purpose |
|---|---|
| `v_plant_capabilities` | SOLAR / WIND / HYBRID classification per plant |
| `v_monthly_generation` | Monthly net + gross generation per source |
| `v_monthly_savings_overview` | Full savings KPIs with tenant/unit/DISCOM context |
| `v_device_savings_heatmap` | Per-device savings for GIL heatmap (label: "GIL001 WIND") |
| `v_gen_cons_settlement_monthly` | 6-series monthly data for main chart |
| `v_gen_cons_by_plant_type` | Above view + plant type filter (ALL/SOLAR/WIND) |
| `v_discom_bill_detail` | DISCOM bill expanded with all charge head names |
| `v_re_cost_detail` | RE cost detail with charge head names per source |

---

## Extensibility: Future Requirements

| Future need | Required change |
|---|---|
| New DISCOM (e.g. TSNPDCL) | INSERT into `discoms`, `tod_slot_definitions`, and any new rows in `charge_head_types` |
| New energy source (e.g. Battery) | INSERT into `energy_source_types`; add `plant_energy_sources` row |
| Generation forecast | New table `generation_forecasts (plant_energy_source_id, slot_start_time, forecast_kwh)` |
| Real-time live data | New table `live_readings` (or TimescaleDB hypertable) feeding into `generation_readings` |
| RPO compliance tracking | New table `rpo_obligations (tenant_id, financial_year, solar_target_pct, wind_target_pct)` |
| REC inventory | New table `rec_inventory (plant_energy_source_id, period, issued, retired, available)` |
| CO₂ offset | New table `emission_factors (state_id, year, grid_co2_factor_tco2_kwh)` |
| Contract management | New table `contracts (tenant_id, type, ppa_rate, effective_from, effective_to)` |
| Alert rules | New tables `alert_rules` + `alert_events` |
| Preventive maintenance | New tables `maintenance_schedule` + `maintenance_log` |

None of these require modifying existing tables.
