# Integrum Energy — Multi-Tenant Database Schema Design

## Overview

This schema supports a renewable energy SaaS platform where each customer (tenant) can operate a **Solar-only**, **Wind-only**, or **Hybrid (Solar + Wind)** plant — and where adding future energy sources (hydro, biomass, etc.) requires **zero DDL changes**.

---

## Core Design Principles

### 1. Multi-Tenancy via `tenant_id`
Every table carries a `tenant_id` foreign key. All queries are scoped to a tenant first. Row-level security (PostgreSQL RLS) or application-layer filtering enforces data isolation.

### 2. Energy Source Flexibility via Junction Table
The `plant_energy_sources` table is the heart of the design. Instead of hard-coding `solar_capacity` and `wind_capacity` columns on `plants`, each plant declares which energy sources it uses via a many-to-many relationship:

| Scenario | `plant_energy_sources` rows |
|----------|-----------------------------|
| Solar only | 1 row: `(plant_id, SOLAR)` |
| Wind only | 1 row: `(plant_id, WIND)` |
| Hybrid | 2 rows: `(plant_id, SOLAR)` + `(plant_id, WIND)` |    
| Future source | 1 row: `(plant_id, NEW_SOURCE)` — no schema change needed |

### 3. Unified Generation Table
`generation_readings` stores readings from **all** energy sources in one table, tagged with `source_type_id`. This avoids maintaining separate `solar_generation` and `wind_generation` tables that duplicate structure.

### 4. Time-Series Partitioning
`generation_readings`, `consumption_readings`, and `settlement_matching` are partitioned by month. This keeps query performance fast as data grows to billions of rows.

---

## Entity Relationship (Layer by Layer)

```
LAYER 1 — LOOKUPS
  energy_source_types    (SOLAR, WIND)
  tod_slots              (A, B, C, D / PEAK, OFF_PEAK, NORMAL)

LAYER 2 — TENANTS
  tenants ──────────────────────────────────────┐
  └── users                                     │

LAYER 3 — PLANT HIERARCHY                       │
  tenants ──► plants ──► plant_energy_sources ──┘
                 └──► devices

LAYER 4-5 — TIME-SERIES (15-min, partitioned)
  devices ──► generation_readings    (per device per 15 min)
  plants  ──► consumption_readings   (per plant per 15 min)

LAYER 6 — SETTLEMENT
  settlement_matching  (device-level, 15-min)
  slot_summary         (plant-level aggregate, 15-min)

LAYER 7 — ROLL-UPS
  tod_daily_summary          (daily × TOD slot)
  monthly_banking_settlement (monthly × TOD slot)
  savings_summary            (monthly)

LAYER 8 — BILLING & TARIFFS
  tariff_config              (rate per slot per month)
  grid_cost_components       (grid bill breakdown)
  re_cost_components         (RE opex breakdown per source)
  discom_bills               (line-item billing, wheeling)
  effective_rate_summary

LAYER 9 — PERFORMANCE (ANNUAL)
  performance_metrics        (per plant per source per year)
  device_yearly_metrics      (per turbine / per panel per year)

LAYER 10 — AI CHAT
  chat_threads
  chat_history
```

---

## Table Reference

### Reference / Lookup

| Table | Purpose |
|-------|---------|
| `energy_source_types` | Registry of supported RE source types: SOLAR and WIND (Hybrid = plant with both) |
| `tod_slots` | TOD tariff slot definitions (state-agnostic) |

### Tenant Management

| Table | Purpose |
|-------|---------|
| `tenants` | One row per customer organisation |
| `users` | User accounts scoped to a tenant |

### Plant Hierarchy

| Table | Purpose |
|-------|---------|
| `plants` | Physical generation plants |
| `plant_energy_sources` | **Which energy sources a plant uses** (the flexibility pivot) |
| `devices` | Individual turbines, panels, inverters — tagged by source type |

### Time-Series (15-min, partitioned)

| Table | Purpose |
|-------|---------|
| `generation_readings` | Per-device 15-min generation for all source types |
| `consumption_readings` | Per-plant 15-min electricity consumption |

### Settlement

| Table | Purpose |
|-------|---------|
| `settlement_matching` | Device-level 15-min matching of generation to consumption |
| `slot_summary` | Plant-level 15-min aggregate across all devices |

### Daily & Monthly Roll-ups

| Table | Purpose |
|-------|---------|
| `tod_daily_summary` | Daily aggregates per TOD slot |
| `monthly_banking_settlement` | Monthly banking settlement per TOD slot |
| `savings_summary` | Monthly cost savings with/without banking |

### Billing & Tariffs

| Table | Purpose |
|-------|---------|
| `tariff_config` | TOD rate per tenant per month |
| `grid_cost_components` | Grid electricity bill itemised breakdown |
| `re_cost_components` | RE plant opex breakdown per source type |
| `discom_bills` | DISCOM bill line items (wheeling customers) |
| `effective_rate_summary` | Blended effective rate per plant per month |

### Performance (Annual)

| Table | Purpose |
|-------|---------|
| `performance_metrics` | PLF, generation, losses, RE% per source per year |
| `device_yearly_metrics` | Per-turbine / per-panel annual output and availability |

### AI Chat

| Table | Purpose |
|-------|---------|
| `chat_threads` | Conversation sessions per tenant/user |
| `chat_history` | Individual messages (user + assistant) |

---

## Views

| View | What it shows |
|------|---------------|
| `v_plant_capabilities` | Each plant with `has_solar`, `has_wind`, source count, installed MW |
| `v_generation_by_source` | Unified generation rows tagged by source type across all tenants |
| `v_monthly_generation` | Monthly generation totals per plant per source |

### Example: query all hybrid plants
```sql
SELECT tenant_name, plant_name, total_installed_mw
FROM v_plant_capabilities
WHERE has_solar = TRUE AND has_wind = TRUE;
```

### Example: compare solar vs wind generation in a month
```sql
SELECT
    est.code              AS source,
    SUM(generation_value) AS total_kwh
FROM generation_readings  gr
JOIN energy_source_types  est ON est.source_type_id = gr.source_type_id
WHERE gr.tenant_id  = 2                    -- GIL
  AND gr.reading_date BETWEEN '2025-04-01' AND '2025-04-30'
GROUP BY est.code;
```

### Example: monthly savings for all tenants
```sql
SELECT
    t.name               AS tenant,
    s.settlement_month,
    s.savings_with_banking,
    s.savings_pct_with_banking
FROM savings_summary s
JOIN tenants         t ON t.tenant_id = s.tenant_id
ORDER BY t.name, s.settlement_month;
```

---

## Mapping: C9 & GIL → Unified Schema

| C9 / GIL table | Unified table |
|----------------|---------------|
| `gen_cons_15min_data_v2` | `generation_readings` + `consumption_readings` |
| `hourly_gen_con2_v2` | Aggregated view over `generation_readings` |
| `solar_generation` | `generation_readings` WHERE `source_type = 'SOLAR'` |
| `wind_generation` | `generation_readings` WHERE `source_type = 'WIND'` |
| `consumption_data` | `consumption_readings` |
| `settlement_matching` | `settlement_matching` |
| `slot_summary` | `slot_summary` |
| `tod_daily_summary` | `tod_daily_summary` |
| `monthly_banking_settlement` / `monthly_banking_settlement_data_v2` | `monthly_banking_settlement` |
| `monthly_savings_v2` / `savings_summary` | `savings_summary` |
| `grid_cost_component` | `grid_cost_components` |
| `wind_solar_cost_component` | `re_cost_components` |
| `effective_rate_summary` | `effective_rate_summary` |
| `discom_bill_v2` | `discom_bills` |
| `performance_metrics` | `performance_metrics` |
| `wind_turbine_yearly_metrics` | `device_yearly_metrics` |
| `plant_metadata` | `plants` + `plant_energy_sources` |
| `tod_tariff` | `tariff_config` |
| `users` | `users` |
| `chat_history` | `chat_history` + `chat_threads` |

---

## Supported Configurations

| Configuration | `plant_energy_sources` rows | Result |
|---------------|-----------------------------|--------|
| Solar only | `(plant_id, SOLAR)` | Solar plant |
| Wind only | `(plant_id, WIND)` | Wind plant |
| Hybrid | `(plant_id, SOLAR)` + `(plant_id, WIND)` | Hybrid plant |

Hybrid is not a separate source type — it is automatically derived when a plant has both SOLAR and WIND entries. Use `v_plant_capabilities` to query this:

```sql
-- All hybrid plants
SELECT tenant_name, plant_name FROM v_plant_capabilities
WHERE has_solar = TRUE AND has_wind = TRUE;

-- Solar-only plants
SELECT tenant_name, plant_name FROM v_plant_capabilities
WHERE has_solar = TRUE AND has_wind = FALSE;

-- Wind-only plants
SELECT tenant_name, plant_name FROM v_plant_capabilities
WHERE has_wind = TRUE AND has_solar = FALSE;
```

---

## Indexing Strategy

All high-frequency query patterns are covered:

| Pattern | Index |
|---------|-------|
| "All data for tenant X" | `(tenant_id)` on every table |
| "Generation for plant X in month Y" | `(tenant_id, reading_date)` on generation_readings |
| "Compare solar vs wind" | `(source_type_id, reading_date)` on generation_readings |
| "Monthly savings history" | `(tenant_id, settlement_month)` on savings_summary |
| "Annual PLF for each plant" | `(tenant_id, financial_year)` on performance_metrics |

---

## Partitioning Strategy

Time-series tables (`generation_readings`, `consumption_readings`, `settlement_matching`) are partitioned by month:

- Queries for a specific month only scan one partition
- Old data can be archived by detaching old partitions
- New months need a new partition DDL (`CREATE TABLE generation_readings_YYYY_MM PARTITION OF ...`)
- Can be automated with `pg_partman` for zero-maintenance rolling partitions
