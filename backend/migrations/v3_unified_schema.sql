-- =============================================================================
-- Migration v3: Unified C9 + GIL schema
-- Adds consumption-unit-centric tables for C9 alongside existing plant-centric
-- tables used by GIL.
--
-- NOTE: FK references to tenants() are intentionally omitted to avoid
-- dependency on the exact PK column name across different DB initializations.
-- All tenant_id columns are plain INT NOT NULL with an index instead.
-- =============================================================================

-- ── CONSUMPTION UNITS: drop old table if it has wrong PK, recreate fresh ─────
-- The old schema may have a different PK column name (e.g. "id" instead of
-- "unit_id").  DROP CASCADE removes any dependent FK constraints safely.
DROP TABLE IF EXISTS consumption_units CASCADE;

-- ── CONSUMPTION UNITS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS consumption_units (
    unit_id         SERIAL PRIMARY KEY,
    tenant_id       INT           NOT NULL,
    unit_code       VARCHAR(50)   NOT NULL,
    unit_name       VARCHAR(200)  NOT NULL,
    tariff_group    CHAR(1)       NOT NULL DEFAULT 'B',
    tariff_rate     NUMERIC(8,4)  NOT NULL DEFAULT 5.95,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, unit_code)
);

-- ── C9: 15-MIN GENERATION ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS c9_slot_generation (
    id              BIGSERIAL     PRIMARY KEY,
    tenant_id       INT           NOT NULL,
    slot_ts         TIMESTAMPTZ   NOT NULL,
    generation_kwh  NUMERIC(14,4) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, slot_ts)
);

-- ── C9: 15-MIN PER-UNIT CONSUMPTION ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS c9_slot_consumption (
    id               BIGSERIAL     PRIMARY KEY,
    tenant_id        INT           NOT NULL,
    unit_id          INT           NOT NULL,
    slot_ts          TIMESTAMPTZ   NOT NULL,
    consumption_kwh  NUMERIC(14,4) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, unit_id, slot_ts)
);

-- ── C9: 15-MIN SETTLEMENT PER UNIT ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS c9_slot_settlement (
    id                   BIGSERIAL     PRIMARY KEY,
    tenant_id            INT           NOT NULL,
    unit_id              INT           NOT NULL,
    slot_ts              TIMESTAMPTZ   NOT NULL,
    tod_slot             VARCHAR(20),
    generation_kwh       NUMERIC(14,4) NOT NULL DEFAULT 0,
    allocated_generation NUMERIC(14,4) NOT NULL DEFAULT 0,
    consumption_kwh      NUMERIC(14,4) NOT NULL DEFAULT 0,
    matched_settlement   NUMERIC(14,4) NOT NULL DEFAULT 0,
    surplus_demand       NUMERIC(14,4) NOT NULL DEFAULT 0,
    surplus_generation   NUMERIC(14,4) NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, unit_id, slot_ts)
);

-- ── C9: DAILY × TOD × UNIT ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS c9_daily_tod (
    id                   SERIAL        PRIMARY KEY,
    tenant_id            INT           NOT NULL,
    unit_id              INT           NOT NULL,
    slot_date            DATE          NOT NULL,
    tod_slot             VARCHAR(20)   NOT NULL,
    allocated_generation NUMERIC(14,4) NOT NULL DEFAULT 0,
    consumption_kwh      NUMERIC(14,4) NOT NULL DEFAULT 0,
    matched_settlement   NUMERIC(14,4) NOT NULL DEFAULT 0,
    surplus_generation   NUMERIC(14,4) NOT NULL DEFAULT 0,
    surplus_demand       NUMERIC(14,4) NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, unit_id, slot_date, tod_slot)
);

-- ── C9: MONTHLY × TOD × UNIT ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS c9_monthly_tod (
    id                   SERIAL        PRIMARY KEY,
    tenant_id            INT           NOT NULL,
    unit_id              INT           NOT NULL,
    month                DATE          NOT NULL,
    tod_slot             VARCHAR(20)   NOT NULL,
    allocated_generation NUMERIC(14,4) NOT NULL DEFAULT 0,
    consumption_kwh      NUMERIC(14,4) NOT NULL DEFAULT 0,
    matched_settlement   NUMERIC(14,4) NOT NULL DEFAULT 0,
    surplus_generation   NUMERIC(14,4) NOT NULL DEFAULT 0,
    surplus_demand       NUMERIC(14,4) NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, unit_id, month, tod_slot)
);

-- ── C9: MONTHLY UNIT TOTALS (primary chart data source) ──────────────────────

CREATE TABLE IF NOT EXISTS c9_unit_monthly (
    id                     SERIAL        PRIMARY KEY,
    tenant_id              INT           NOT NULL,
    unit_id                INT           NOT NULL,
    month                  DATE          NOT NULL,
    allocated_generation   NUMERIC(14,4) NOT NULL DEFAULT 0,
    consumption_kwh        NUMERIC(14,4) NOT NULL DEFAULT 0,
    matched_settlement     NUMERIC(14,4) NOT NULL DEFAULT 0,
    surplus_generation     NUMERIC(14,4) NOT NULL DEFAULT 0,
    surplus_demand         NUMERIC(14,4) NOT NULL DEFAULT 0,
    matched_settlement_2   NUMERIC(14,4) NOT NULL DEFAULT 0,
    lapse_units            NUMERIC(14,4) NOT NULL DEFAULT 0,
    grid_consumption       NUMERIC(14,4) NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, unit_id, month)
);

-- ── C9: MONTH-LEVEL KPI SUMMARY ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS c9_monthly_summary (
    id                         SERIAL        PRIMARY KEY,
    tenant_id                  INT           NOT NULL,
    month                      DATE          NOT NULL,
    total_generation_kwh       NUMERIC(14,4) NOT NULL DEFAULT 0,
    allocated_to_units_kwh     NUMERIC(14,4) NOT NULL DEFAULT 0,
    raw_slot_surplus_kwh       NUMERIC(14,4) NOT NULL DEFAULT 0,
    banking_charge_lost_kwh    NUMERIC(14,4) NOT NULL DEFAULT 0,
    net_banked_kwh             NUMERIC(14,4) NOT NULL DEFAULT 0,
    total_consumption_kwh      NUMERIC(14,4) NOT NULL DEFAULT 0,
    round1_matched_kwh         NUMERIC(14,4) NOT NULL DEFAULT 0,
    round1_surplus_demand_kwh  NUMERIC(14,4) NOT NULL DEFAULT 0,
    round2_matched_kwh         NUMERIC(14,4) NOT NULL DEFAULT 0,
    lapse_units_kwh            NUMERIC(14,4) NOT NULL DEFAULT 0,
    final_grid_consumption_kwh NUMERIC(14,4) NOT NULL DEFAULT 0,
    created_at                 TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, month)
);

-- ── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_consumption_units_tenant   ON consumption_units    (tenant_id);
CREATE INDEX IF NOT EXISTS idx_c9_slot_gen_tenant_ts      ON c9_slot_generation   (tenant_id, slot_ts);
CREATE INDEX IF NOT EXISTS idx_c9_slot_cons_unit_ts       ON c9_slot_consumption  (tenant_id, unit_id, slot_ts);
CREATE INDEX IF NOT EXISTS idx_c9_slot_sett_unit_ts       ON c9_slot_settlement   (tenant_id, unit_id, slot_ts);
CREATE INDEX IF NOT EXISTS idx_c9_daily_tod_date          ON c9_daily_tod         (tenant_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_c9_monthly_tod_month       ON c9_monthly_tod       (tenant_id, month);
CREATE INDEX IF NOT EXISTS idx_c9_unit_monthly_month      ON c9_unit_monthly      (tenant_id, month);
CREATE INDEX IF NOT EXISTS idx_c9_monthly_summary_month   ON c9_monthly_summary   (tenant_id, month);
