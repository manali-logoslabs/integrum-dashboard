-- =============================================================================
-- INTEGRUM ENERGY — INTELLIGENT DATA WAREHOUSE v2.0
-- Multi-tenant · Multi-DISCOM · Multi-Source · Extensible
--
-- Supports:
--   C9  (Cloud9 Energy)        — BESCOM / Karnataka  / Solar-only   / Unit-wise
--   GIL (Graphite India Ltd)   — MSEDCL / Maharashtra / Solar+Wind   / Device-wise
--   Any future client          — any DISCOM, any state, any source mix
--
-- Design principles:
--   1. Flexible billing  — charge_head_types catalog; no ALTER TABLE per new DISCOM
--   2. Device-level data — device_savings_summary + device_tod_summary for GIL heatmap
--   3. Multi-tenant      — tenant_id on every row; strict row-level isolation
--   4. Partitioned T/S   — monthly range partitions on all high-volume time-series
--   5. Extensible refs   — add new state / DISCOM / source type via INSERT only
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;          -- for fuzzy name search

-- ---------------------------------------------------------------------------
-- LAYER 0 — REFERENCE / LOOKUP TABLES
-- ---------------------------------------------------------------------------

-- States / UTs
CREATE TABLE states (
    id              SMALLSERIAL PRIMARY KEY,
    code            VARCHAR(10)  NOT NULL UNIQUE,   -- 'KA', 'MH', 'TN'
    name            VARCHAR(100) NOT NULL,
    country         VARCHAR(50)  NOT NULL DEFAULT 'India',
    timezone        VARCHAR(50)  NOT NULL DEFAULT 'Asia/Kolkata'
);

-- Distribution Companies (DISCOMs)
-- New DISCOMs are added here — zero schema changes elsewhere
CREATE TABLE discoms (
    id              SMALLSERIAL  PRIMARY KEY,
    state_id        SMALLINT     NOT NULL REFERENCES states(id),
    code            VARCHAR(20)  NOT NULL UNIQUE,   -- 'BESCOM', 'MSEDCL', 'KSEB'
    name            VARCHAR(200) NOT NULL,
    billing_cycle   VARCHAR(20)  NOT NULL DEFAULT 'MONTHLY', -- 'MONTHLY', 'BIMONTHLY'
    currency        CHAR(3)      NOT NULL DEFAULT 'INR',
    notes           TEXT
);

-- Energy source types (SOLAR, WIND — extensible for future sources)
CREATE TABLE energy_source_types (
    id              SMALLSERIAL  PRIMARY KEY,
    code            VARCHAR(20)  NOT NULL UNIQUE,   -- 'SOLAR', 'WIND'
    name            VARCHAR(100) NOT NULL,
    unit            VARCHAR(10)  NOT NULL DEFAULT 'kWh',
    description     TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);

-- TOD slot definitions per DISCOM
-- BESCOM: PEAK (18:00–22:00), OFF-PEAK (06:00–18:00 + 22:00–23:00), NIGHT
-- MSEDCL: PEAK, OFF-PEAK, NORMAL — different time windows
-- Stored separately per DISCOM so each billing calculation uses the right window
CREATE TABLE tod_slot_definitions (
    id              SMALLSERIAL  PRIMARY KEY,
    discom_id       SMALLINT     NOT NULL REFERENCES discoms(id),
    slot_code       VARCHAR(20)  NOT NULL,           -- 'PEAK', 'OFF_PEAK', 'NORMAL', 'NIGHT'
    slot_name       VARCHAR(100) NOT NULL,
    time_from       TIME         NOT NULL,
    time_to         TIME         NOT NULL,
    applies_to_days VARCHAR(20)  NOT NULL DEFAULT 'ALL', -- 'ALL', 'WEEKDAY', 'WEEKEND'
    multiplier      DECIMAL(6,4) NOT NULL DEFAULT 1.0,   -- ToD rate multiplier over base tariff
    sort_order      SMALLINT     NOT NULL DEFAULT 1,
    effective_from  DATE         NOT NULL,
    effective_to    DATE,                             -- NULL = currently active
    UNIQUE (discom_id, slot_code, effective_from)
);

-- =============================================================================
-- CHARGE HEAD TYPES — The extensibility cornerstone
-- =============================================================================
-- This table is the catalog of every billing line item across all DISCOMs.
-- Adding a new DISCOM (e.g. TSNPDCL) means inserting rows here — NEVER
-- adding columns to grid_bill_line_items or re_bill_line_items.
--
-- C9 / BESCOM grid charges:
--   ENERGY_CHARGE, DEMAND_CHARGE, WHEELING_ENERGY, WHEELING_CHARGE,
--   FUEL_COST_ADJ, PG_SURCHARGE, MANUAL_ENERGY_WHEELING, NET_PAYABLE
--
-- GIL / MSEDCL grid charges:
--   ENERGY_CHARGE, DEMAND_CHARGE, WHEELING_CHARGE, TOD_TARIFF, FUEL_COST_ADJ,
--   ELECTRICITY_DUTY, TAX_ON_SALE, BULK_DISCOUNT, INCREMENTAL_REBATE,
--   DEBIT_BILL_ADJ, GOM_MERC_SUBSIDY, PRINCIPAL_ARREARS,
--   PROMPT_PAYMENT_DISC, TOS_CHARGES, NET_PAYABLE
--
-- RE charges (universal + MSEDCL-specific):
--   OM_CHARGES, TRANSMISSION_CHARGES, WHEELING_CHARGES, SCHEDULING_CHARGES,
--   DEVIATION_CHARGES, DEPRECIATION, ASSET_MC, OPERATING_CHARGES_MSEDCL,
--   OA_APPLICATION_CHARGES, STARTUP_POWER_BILL, GST_REVERSAL, TOS_RE_CHARGES
-- =============================================================================
CREATE TABLE charge_head_types (
    id                      SMALLSERIAL  PRIMARY KEY,
    category                VARCHAR(10)  NOT NULL CHECK (category IN ('GRID','RE')),
    code                    VARCHAR(60)  NOT NULL UNIQUE,
    name                    VARCHAR(200) NOT NULL,
    unit                    VARCHAR(20)  NOT NULL DEFAULT 'INR', -- 'INR','kWh','kVAh','PCT'
    is_credit               BOOLEAN      NOT NULL DEFAULT FALSE,  -- discounts/rebates = TRUE
    applicable_discom_codes VARCHAR(20)[],                        -- NULL = all DISCOMs
    description             TEXT,
    sort_order              SMALLINT     NOT NULL DEFAULT 100
);

-- ---------------------------------------------------------------------------
-- LAYER 1 — TENANTS
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
    id              SERIAL       PRIMARY KEY,
    code            VARCHAR(50)  NOT NULL UNIQUE,   -- 'C9', 'GIL', 'ACME'
    name            VARCHAR(200) NOT NULL,
    short_name      VARCHAR(100),
    gstin           VARCHAR(20),
    pan             VARCHAR(15),
    address         TEXT,
    city            VARCHAR(100),
    state_id        SMALLINT     REFERENCES states(id),
    pincode         VARCHAR(10),
    primary_email   VARCHAR(200),
    primary_phone   VARCHAR(20),
    contract_start  DATE,
    contract_end    DATE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    metadata        JSONB,                           -- flexible extra fields
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant_users (
    id              SERIAL       PRIMARY KEY,
    tenant_id       INT          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username        VARCHAR(100),
    email           VARCHAR(200) NOT NULL UNIQUE,
    full_name       VARCHAR(200),
    role            VARCHAR(30)  NOT NULL DEFAULT 'VIEWER'
                        CHECK (role IN ('SUPER_ADMIN','ADMIN','ANALYST','VIEWER')),
    password_hash   TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- LAYER 2 — PLANTS (GENERATION SIDE)
-- ---------------------------------------------------------------------------

-- A plant is a physical generation site (a solar farm, wind farm, or hybrid site)
CREATE TABLE plants (
    id              SERIAL       PRIMARY KEY,
    tenant_id       INT          NOT NULL REFERENCES tenants(id),
    code            VARCHAR(50)  NOT NULL,           -- 'GIL_PLANT_01', 'C9_KA_SOLAR'
    name            VARCHAR(200) NOT NULL,
    state_id        SMALLINT     NOT NULL REFERENCES states(id),
    discom_id       SMALLINT     NOT NULL REFERENCES discoms(id),
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    address         TEXT,
    commissioned_on DATE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    notes           TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

-- Which energy sources a plant generates from
-- A plant with both SOLAR + WIND rows is a HYBRID plant
-- HYBRID is never stored as a type — it is derived at query time
CREATE TABLE plant_energy_sources (
    id                      SERIAL       PRIMARY KEY,
    plant_id                INT          NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    tenant_id               INT          NOT NULL REFERENCES tenants(id),
    source_type_id          SMALLINT     NOT NULL REFERENCES energy_source_types(id),
    installed_capacity_kw   DECIMAL(12,3) NOT NULL,
    contracted_capacity_kw  DECIMAL(12,3),           -- capacity under open-access contract
    commissioned_on         DATE,
    decommissioned_on       DATE,
    is_active               BOOLEAN      NOT NULL DEFAULT TRUE,
    meter_number            VARCHAR(100),            -- SLDC / DISCOM injection meter
    open_access_type        VARCHAR(30)  DEFAULT 'INTRA_STATE'
                                CHECK (open_access_type IN ('INTRA_STATE','INTER_STATE')),
    wheeling_zone           VARCHAR(100),
    sldc_applicant_id       VARCHAR(100),            -- SLDC scheduling ID
    notes                   TEXT,
    UNIQUE (plant_id, source_type_id)
);

-- Individual generation units: inverters, wind turbines, panel strings
-- GIL: GIL001–GIL009 (turbines), 22010390 / 24004845 (panels by serial)
-- C9:  INV-01, INV-02 … (inverters)
CREATE TABLE devices (
    id                      SERIAL       PRIMARY KEY,
    tenant_id               INT          NOT NULL REFERENCES tenants(id),
    plant_id                INT          NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    plant_energy_source_id  INT          NOT NULL REFERENCES plant_energy_sources(id),
    device_code             VARCHAR(100) NOT NULL,   -- 'GIL001', '22010390', 'INV-01'
    device_type             VARCHAR(30)  NOT NULL
                                CHECK (device_type IN ('TURBINE','INVERTER','PANEL_STRING','BATTERY','OTHER')),
    manufacturer            VARCHAR(200),
    model                   VARCHAR(200),
    serial_number           VARCHAR(200),
    capacity_kw             DECIMAL(10,3),
    hub_height_m            DECIMAL(8,2),            -- wind turbines only
    commissioned_on         DATE,
    decommissioned_on       DATE,
    is_active               BOOLEAN      NOT NULL DEFAULT TRUE,
    metadata                JSONB,                   -- rotor diameter, module count, etc.
    UNIQUE (plant_id, device_code)
);

-- ---------------------------------------------------------------------------
-- LAYER 3 — CONSUMPTION UNITS (OFFTAKE / DEMAND SIDE)
-- ---------------------------------------------------------------------------

-- A consumption unit is any metered offtake point that receives RE power
--
-- C9: 11 BESCOM HT connections (buildings):
--   MALLESWARAM C2HT-136, WHITEFIELD E4HT-355, OLD AIRPORT ROAD E6HT209, …
--
-- GIL: The plant itself is the consumer (self-consumption);
--   may also have sub-meters or captive units
CREATE TABLE consumption_units (
    id                      SERIAL       PRIMARY KEY,
    tenant_id               INT          NOT NULL REFERENCES tenants(id),
    discom_id               SMALLINT     NOT NULL REFERENCES discoms(id),
    code                    VARCHAR(100) NOT NULL,   -- 'C2HT-136', 'E4HT-355'
    name                    VARCHAR(200) NOT NULL,   -- 'MALLESWARAM', 'WHITEFIELD'
    address                 TEXT,
    state_id                SMALLINT     REFERENCES states(id),
    tariff_category         VARCHAR(50),             -- 'HT-2B', 'LT-5', 'HT-1'
    connection_type         VARCHAR(10)  DEFAULT 'HT' CHECK (connection_type IN ('HT','LT','EHT')),
    contract_demand_kva     DECIMAL(10,2),
    sanctioned_load_kw      DECIMAL(10,2),
    meter_number            VARCHAR(100),
    discom_account_no       VARCHAR(100),
    is_active               BOOLEAN      NOT NULL DEFAULT TRUE,
    metadata                JSONB,                   -- voltage level, feeder info, etc.
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

-- Which plant-source supplies which consumption unit(s) — Many-to-Many
-- C9: 1 solar plant → 11 BESCOM units, with optional % allocation per unit
-- GIL: 1 hybrid plant (solar + wind) → itself as consumer
CREATE TABLE plant_consumption_mappings (
    id                      SERIAL       PRIMARY KEY,
    plant_energy_source_id  INT          NOT NULL REFERENCES plant_energy_sources(id),
    consumption_unit_id     INT          NOT NULL REFERENCES consumption_units(id),
    tenant_id               INT          NOT NULL REFERENCES tenants(id),
    allocation_pct          DECIMAL(7,4),            -- % of generation to this unit (NULL = auto)
    priority_rank           SMALLINT     DEFAULT 1,  -- which unit gets first dibs on RE
    effective_from          DATE         NOT NULL,
    effective_to            DATE,
    is_active               BOOLEAN      NOT NULL DEFAULT TRUE,
    notes                   TEXT,
    UNIQUE (plant_energy_source_id, consumption_unit_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- LAYER 4 — TARIFF CONFIGURATION
-- ---------------------------------------------------------------------------

-- Master tariff config per DISCOM / tariff category / period
CREATE TABLE tariff_configs (
    id                          SERIAL       PRIMARY KEY,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    consumption_unit_id         INT          REFERENCES consumption_units(id), -- NULL = DISCOM default
    discom_id                   SMALLINT     NOT NULL REFERENCES discoms(id),
    tariff_category             VARCHAR(50)  NOT NULL,
    effective_from              DATE         NOT NULL,
    effective_to                DATE,
    -- Grid base rates
    energy_charge_per_kwh       DECIMAL(10,4),
    energy_charge_per_kvah      DECIMAL(10,4),       -- GIL/MSEDCL uses kVAh
    demand_charge_per_kva       DECIMAL(10,4),
    fuel_cost_adj_per_unit      DECIMAL(10,4),
    electricity_duty_pct        DECIMAL(8,4),
    -- Open-access pass-through rates
    wheeling_charge_per_unit    DECIMAL(10,4),
    transmission_charge_per_unit DECIMAL(10,4),
    scheduling_charge_per_unit  DECIMAL(10,4),
    cross_subsidy_surcharge     DECIMAL(10,4),
    add_surcharge_per_unit      DECIMAL(10,4),
    -- Banking rules
    banking_allowed             BOOLEAN      NOT NULL DEFAULT TRUE,
    banking_loss_pct            DECIMAL(8,4)         DEFAULT 0,
    banking_period              VARCHAR(20)  DEFAULT 'MONTHLY'
                                    CHECK (banking_period IN ('MONTHLY','QUARTERLY','ANNUAL')),
    lapse_at_period_end         BOOLEAN      NOT NULL DEFAULT TRUE,
    notes                       TEXT
);
CREATE UNIQUE INDEX ux_tariff_configs ON tariff_configs
    (tenant_id, discom_id, tariff_category, COALESCE(consumption_unit_id, 0), effective_from);

-- ToD-specific rates per tariff config
CREATE TABLE tariff_tod_rates (
    id                  SERIAL       PRIMARY KEY,
    tariff_config_id    INT          NOT NULL REFERENCES tariff_configs(id) ON DELETE CASCADE,
    tod_slot_id         SMALLINT     NOT NULL REFERENCES tod_slot_definitions(id),
    energy_rate         DECIMAL(10,4) NOT NULL,
    multiplier          DECIMAL(6,4)  DEFAULT 1.0,
    UNIQUE (tariff_config_id, tod_slot_id)
);

-- ---------------------------------------------------------------------------
-- LAYER 5 — GENERATION READINGS (15-min time-series, partitioned by month)
-- ---------------------------------------------------------------------------

CREATE TABLE generation_readings (
    id                          BIGSERIAL,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    plant_id                    INT          NOT NULL REFERENCES plants(id),
    plant_energy_source_id      INT          NOT NULL REFERENCES plant_energy_sources(id),
    device_id                   INT          NOT NULL REFERENCES devices(id),
    source_type_id              SMALLINT     NOT NULL REFERENCES energy_source_types(id),
    slot_start_time             TIMESTAMPTZ  NOT NULL,
    slot_end_time               TIMESTAMPTZ  NOT NULL,
    -- Energy
    generation_kwh              DECIMAL(14,4) NOT NULL DEFAULT 0,   -- net delivered
    generation_before_losses_kwh DECIMAL(14,4),                     -- gross (before T&D losses)
    loss_pct                    DECIMAL(8,4),
    -- Power quality
    peak_power_kw               DECIMAL(12,4),
    avg_power_kw                DECIMAL(12,4),
    -- Data provenance
    is_estimated                BOOLEAN      NOT NULL DEFAULT FALSE,
    data_source                 VARCHAR(30)  NOT NULL DEFAULT 'SCADA'
                                    CHECK (data_source IN ('SCADA','MANUAL','IMPORT','CALCULATED')),
    ingestion_batch_id          BIGINT,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, slot_start_time),
    CONSTRAINT ux_generation_readings_biz_key
        UNIQUE (tenant_id, device_id, slot_start_time)
) PARTITION BY RANGE (slot_start_time);

-- ---------------------------------------------------------------------------
-- LAYER 6 — CONSUMPTION READINGS (15-min time-series, partitioned by month)
-- ---------------------------------------------------------------------------

CREATE TABLE consumption_readings (
    id                      BIGSERIAL,
    tenant_id               INT          NOT NULL REFERENCES tenants(id),
    consumption_unit_id     INT          NOT NULL REFERENCES consumption_units(id),
    slot_start_time         TIMESTAMPTZ  NOT NULL,
    slot_end_time           TIMESTAMPTZ  NOT NULL,
    -- Energy
    consumption_kwh         DECIMAL(14,4) NOT NULL DEFAULT 0,
    consumption_kvah        DECIMAL(14,4),           -- MSEDCL bills on kVAh
    -- Power
    demand_kva              DECIMAL(12,4),
    demand_kw               DECIMAL(12,4),
    power_factor            DECIMAL(6,4),
    -- Data provenance
    is_estimated            BOOLEAN      NOT NULL DEFAULT FALSE,
    data_source             VARCHAR(30)  NOT NULL DEFAULT 'DISCOM',
    ingestion_batch_id      BIGINT,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, slot_start_time),
    CONSTRAINT ux_consumption_readings_biz_key
        UNIQUE (tenant_id, consumption_unit_id, slot_start_time)
) PARTITION BY RANGE (slot_start_time);

-- ---------------------------------------------------------------------------
-- LAYER 7 — SETTLEMENT SLOTS (15-min matching, partitioned by month)
-- ---------------------------------------------------------------------------
-- Every 15-min slot shows how each unit's consumption was met:
--   matched directly from generation, drawn from banking, or from the grid

CREATE TABLE settlement_slots (
    id                          BIGSERIAL,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    plant_energy_source_id      INT          NOT NULL REFERENCES plant_energy_sources(id),
    consumption_unit_id         INT          NOT NULL REFERENCES consumption_units(id),
    slot_start_time             TIMESTAMPTZ  NOT NULL,
    tod_slot_id                 SMALLINT     REFERENCES tod_slot_definitions(id),
    -- Generation side
    generation_kwh              DECIMAL(14,4) NOT NULL DEFAULT 0,
    generation_losses_kwh       DECIMAL(14,4) DEFAULT 0,
    net_generation_kwh          DECIMAL(14,4) NOT NULL DEFAULT 0,
    -- Consumption side
    consumption_kwh             DECIMAL(14,4) NOT NULL DEFAULT 0,
    -- Settlement breakdown
    direct_matched_kwh          DECIMAL(14,4) NOT NULL DEFAULT 0,
    banking_utilised_kwh        DECIMAL(14,4) DEFAULT 0,
    total_matched_kwh           DECIMAL(14,4) NOT NULL DEFAULT 0,
    surplus_kwh                 DECIMAL(14,4) DEFAULT 0,   -- goes to banking
    lapsed_kwh                  DECIMAL(14,4) DEFAULT 0,   -- surplus that cannot be banked
    grid_drawl_kwh              DECIMAL(14,4) DEFAULT 0,   -- unmet demand from grid
    PRIMARY KEY (id, slot_start_time)
) PARTITION BY RANGE (slot_start_time);

-- ---------------------------------------------------------------------------
-- LAYER 8 — TOD DAILY SUMMARY
-- ---------------------------------------------------------------------------

-- Plant / consumption-unit level daily summary per TOD slot
-- Powers the "Generation vs Consumption ToD wise" chart in both C9 and GIL
CREATE TABLE tod_daily_summary (
    id                      BIGSERIAL    PRIMARY KEY,
    tenant_id               INT          NOT NULL REFERENCES tenants(id),
    plant_energy_source_id  INT          NOT NULL REFERENCES plant_energy_sources(id),
    consumption_unit_id     INT          REFERENCES consumption_units(id), -- NULL = aggregate all units
    date                    DATE         NOT NULL,
    tod_slot_id             SMALLINT     NOT NULL REFERENCES tod_slot_definitions(id),
    generation_kwh          DECIMAL(14,4) DEFAULT 0,
    generation_losses_kwh   DECIMAL(14,4) DEFAULT 0,
    net_generation_kwh      DECIMAL(14,4) DEFAULT 0,
    consumption_kwh         DECIMAL(14,4) DEFAULT 0,
    direct_matched_kwh      DECIMAL(14,4) DEFAULT 0,
    banking_utilised_kwh    DECIMAL(14,4) DEFAULT 0,
    total_matched_kwh       DECIMAL(14,4) DEFAULT 0,
    surplus_kwh             DECIMAL(14,4) DEFAULT 0,
    lapsed_kwh              DECIMAL(14,4) DEFAULT 0,
    grid_drawl_kwh          DECIMAL(14,4) DEFAULT 0
);
CREATE UNIQUE INDEX ux_tod_daily_summary ON tod_daily_summary
    (tenant_id, plant_energy_source_id, COALESCE(consumption_unit_id, 0), date, tod_slot_id);

-- Device / turbine level daily summary per TOD slot
-- Powers GIL's "Unit-wise Generation vs Consumption ToD wise Turbine wise" chart
-- where each turbine (22010390 SOLAR, 23005424 WIND) is selectable individually
CREATE TABLE device_tod_summary (
    id                      BIGSERIAL    PRIMARY KEY,
    tenant_id               INT          NOT NULL REFERENCES tenants(id),
    device_id               INT          NOT NULL REFERENCES devices(id),
    date                    DATE         NOT NULL,
    tod_slot_id             SMALLINT     NOT NULL REFERENCES tod_slot_definitions(id),
    generation_kwh          DECIMAL(14,4) DEFAULT 0,
    consumption_kwh         DECIMAL(14,4) DEFAULT 0,
    direct_matched_kwh      DECIMAL(14,4) DEFAULT 0,
    surplus_kwh             DECIMAL(14,4) DEFAULT 0,
    lapsed_kwh              DECIMAL(14,4) DEFAULT 0,
    UNIQUE (tenant_id, device_id, date, tod_slot_id)
);

-- ---------------------------------------------------------------------------
-- LAYER 9 — MONTHLY BANKING SETTLEMENT
-- ---------------------------------------------------------------------------
-- Monthly aggregate of the banking ledger per plant-source, per consumption unit,
-- optionally split by TOD slot (tod_slot_id NULL = total across all slots)

CREATE TABLE monthly_banking_settlement (
    id                              BIGSERIAL    PRIMARY KEY,
    tenant_id                       INT          NOT NULL REFERENCES tenants(id),
    plant_energy_source_id          INT          NOT NULL REFERENCES plant_energy_sources(id),
    consumption_unit_id             INT          NOT NULL REFERENCES consumption_units(id),
    month                           DATE         NOT NULL, -- always 1st of month
    tod_slot_id                     SMALLINT     REFERENCES tod_slot_definitions(id),
    -- Generation
    gross_generation_kwh            DECIMAL(16,4) DEFAULT 0,
    generation_losses_kwh           DECIMAL(16,4) DEFAULT 0,
    net_generation_kwh              DECIMAL(16,4) DEFAULT 0,
    -- Consumption
    total_consumption_kwh           DECIMAL(16,4) DEFAULT 0,
    -- Settlement
    direct_matched_kwh              DECIMAL(16,4) DEFAULT 0,
    banking_utilised_kwh            DECIMAL(16,4) DEFAULT 0,
    total_matched_kwh               DECIMAL(16,4) DEFAULT 0,
    -- Banking ledger
    opening_banking_balance_kwh     DECIMAL(16,4) DEFAULT 0,
    surplus_before_banking_kwh      DECIMAL(16,4) DEFAULT 0,
    intra_month_banking_kwh         DECIMAL(16,4) DEFAULT 0,
    carry_forward_banking_kwh       DECIMAL(16,4) DEFAULT 0,
    banking_loss_kwh                DECIMAL(16,4) DEFAULT 0, -- % loss on banked units
    surplus_lapsed_kwh              DECIMAL(16,4) DEFAULT 0, -- cannot be banked (lapsed)
    closing_banking_balance_kwh     DECIMAL(16,4) DEFAULT 0,
    -- Demand
    unmet_demand_kwh                DECIMAL(16,4) DEFAULT 0, -- grid drawl
    grid_import_kwh                 DECIMAL(16,4) DEFAULT 0,
    over_injection_kwh              DECIMAL(16,4) DEFAULT 0,
    -- KPI
    match_rate_pct                  DECIMAL(8,4),            -- total_matched / net_generation × 100
    replacement_pct                 DECIMAL(8,4)             -- total_matched / total_consumption × 100
);
CREATE UNIQUE INDEX ux_monthly_banking_settlement ON monthly_banking_settlement
    (tenant_id, plant_energy_source_id, consumption_unit_id, month, COALESCE(tod_slot_id, 0));

-- ---------------------------------------------------------------------------
-- LAYER 10 — BILLING (FLEXIBLE LINE-ITEM MODEL)
-- ---------------------------------------------------------------------------
--
-- KEY DESIGN: Instead of adding columns per DISCOM, every charge head is a row
-- in charge_head_types and every line item is a row in *_bill_line_items.
--
-- Adding a new DISCOM (e.g. TSNPDCL with its own surcharges) = INSERT rows
-- into charge_head_types only. Zero schema migration required.
--
-- ToD Tariff drill-down (seen in GIL/MSEDCL Grid Cost Component table):
--   One row per slot in grid_bill_line_items with charge_head_id = TOD_TARIFF
--   and tod_slot_id pointing to the specific slot.

-- Grid bill header — one per consumption unit per billing period
CREATE TABLE grid_bill_headers (
    id                          BIGSERIAL    PRIMARY KEY,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    consumption_unit_id         INT          NOT NULL REFERENCES consumption_units(id),
    discom_id                   SMALLINT     NOT NULL REFERENCES discoms(id),
    bill_date                   DATE         NOT NULL,
    billing_period_from         DATE         NOT NULL,
    billing_period_to           DATE         NOT NULL,
    total_units_kwh             DECIMAL(16,4),
    total_units_kvah            DECIMAL(16,4),       -- MSEDCL
    gross_amount_inr            DECIMAL(16,4),       -- before RE credit
    net_payable_inr             DECIMAL(16,4),       -- after RE credit (actual paid)
    savings_inr                 DECIMAL(16,4),
    bill_number                 VARCHAR(100),
    bill_source                 VARCHAR(20)  NOT NULL DEFAULT 'DISCOM'
                                    CHECK (bill_source IN ('DISCOM','MANUAL','IMPORT')),
    raw_data                    JSONB,               -- original bill payload for audit
    ingestion_batch_id          BIGINT,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, consumption_unit_id, billing_period_from)
);

-- Grid bill line items — one row per charge head per bill
-- Supports any DISCOM; BESCOM and MSEDCL use different charge_head_ids
CREATE TABLE grid_bill_line_items (
    id                          BIGSERIAL    PRIMARY KEY,
    bill_header_id              BIGINT       NOT NULL REFERENCES grid_bill_headers(id) ON DELETE CASCADE,
    charge_head_id              SMALLINT     NOT NULL REFERENCES charge_head_types(id),
    tod_slot_id                 SMALLINT     REFERENCES tod_slot_definitions(id), -- ToD breakdown rows
    -- Quantity
    units_kwh                   DECIMAL(16,4),
    units_kvah                  DECIMAL(16,4),       -- MSEDCL uses kVAh
    demand_kva                  DECIMAL(12,4),
    rate                        DECIMAL(14,6),
    -- Amounts
    amount_without_re           DECIMAL(16,4),       -- what it would cost without RE
    amount_with_re              DECIMAL(16,4),       -- actual amount after RE credit
    savings_inr                 DECIMAL(16,4),
    is_credit                   BOOLEAN      NOT NULL DEFAULT FALSE,
    notes                       TEXT
);

-- RE bill header — one per plant-source per billing period
-- Captures O&M invoices, wheeling bills, MSEDCL operational charges, etc.
CREATE TABLE re_bill_headers (
    id                          BIGSERIAL    PRIMARY KEY,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    plant_energy_source_id      INT          NOT NULL REFERENCES plant_energy_sources(id),
    billing_period_from         DATE         NOT NULL,
    billing_period_to           DATE         NOT NULL,
    total_amount_inr            DECIMAL(16,4),
    invoice_number              VARCHAR(100),
    vendor_name                 VARCHAR(200),
    bill_source                 VARCHAR(20)  NOT NULL DEFAULT 'MANUAL',
    raw_data                    JSONB,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, plant_energy_source_id, billing_period_from)
);

-- RE bill line items — one row per RE charge head per bill
CREATE TABLE re_bill_line_items (
    id                          BIGSERIAL    PRIMARY KEY,
    re_bill_header_id           BIGINT       NOT NULL REFERENCES re_bill_headers(id) ON DELETE CASCADE,
    charge_head_id              SMALLINT     NOT NULL REFERENCES charge_head_types(id),
    units_kwh                   DECIMAL(16,4),
    rate                        DECIMAL(14,6),
    amount_inr                  DECIMAL(16,4) NOT NULL,
    is_credit                   BOOLEAN      NOT NULL DEFAULT FALSE, -- GST reversal, rebates
    notes                       TEXT
);

-- ---------------------------------------------------------------------------
-- LAYER 11 — SAVINGS SUMMARY
-- ---------------------------------------------------------------------------

-- Plant / consumption-unit monthly savings — the foundation of most dashboard KPIs
-- Covers: Grid Cost vs Actual Cost chart, Unit-wise Cost Summary, Power Cost Analysis
CREATE TABLE savings_summary (
    id                          BIGSERIAL    PRIMARY KEY,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    plant_energy_source_id      INT          NOT NULL REFERENCES plant_energy_sources(id),
    consumption_unit_id         INT          NOT NULL REFERENCES consumption_units(id),
    month                       DATE         NOT NULL,   -- 1st of month
    -- Costs
    grid_cost_without_re        DECIMAL(16,4) DEFAULT 0, -- hypothetical full-grid cost
    re_cost                     DECIMAL(16,4) DEFAULT 0, -- RE operational cost (wheeling+OM+…)
    actual_cost_with_re         DECIMAL(16,4) DEFAULT 0, -- grid_drawl_cost + re_cost
    -- Banking scenarios (for "With/Without Banking" chart)
    cost_without_banking        DECIMAL(16,4),
    cost_with_banking           DECIMAL(16,4),
    savings_without_banking     DECIMAL(16,4),
    savings_with_banking        DECIMAL(16,4),
    -- Summary
    savings_amount_inr          DECIMAL(16,4) DEFAULT 0,
    -- NOTE: savings_pct CAN exceed 100 for GIL/MSEDCL when banking credits
    --       more than offset grid cost. The column allows this by design.
    savings_pct                 DECIMAL(10,4) DEFAULT 0,
    -- Rates
    effective_rate_per_unit     DECIMAL(10,4),           -- blended ₹/kWh actually paid
    grid_rate_per_unit          DECIMAL(10,4),           -- what grid would have cost per kWh
    demand_charges_inr          DECIMAL(16,4),           -- DISCOM demand/kVA charges component
    -- Energy context
    total_generation_kwh        DECIMAL(16,4) DEFAULT 0,
    total_consumption_kwh       DECIMAL(16,4) DEFAULT 0,
    total_matched_kwh           DECIMAL(16,4) DEFAULT 0,
    replacement_pct             DECIMAL(8,4),
    UNIQUE (tenant_id, plant_energy_source_id, consumption_unit_id, month)
);

-- Device-level monthly savings — powers GIL's per-turbine/panel heatmap
-- Each row = one device (turbine/inverter) × one month
-- savings_pct > 100 is valid (and common for GIL in peak months)
CREATE TABLE device_savings_summary (
    id                          BIGSERIAL    PRIMARY KEY,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    device_id                   INT          NOT NULL REFERENCES devices(id),
    month                       DATE         NOT NULL,
    -- Costs
    grid_cost_without_re        DECIMAL(16,4) DEFAULT 0,
    actual_cost_with_re         DECIMAL(16,4) DEFAULT 0,
    savings_amount_inr          DECIMAL(16,4) DEFAULT 0,
    savings_pct                 DECIMAL(10,4) DEFAULT 0, -- can exceed 100
    -- Energy
    generation_kwh              DECIMAL(14,4) DEFAULT 0,
    consumption_kwh             DECIMAL(14,4) DEFAULT 0,
    matched_kwh                 DECIMAL(14,4) DEFAULT 0,
    UNIQUE (tenant_id, device_id, month)
);

-- ---------------------------------------------------------------------------
-- LAYER 12 — PERFORMANCE METRICS
-- ---------------------------------------------------------------------------

-- Annual plant-source performance (PLF, PR, losses, sale of energy, etc.)
-- Financial year = April–March (India standard)
CREATE TABLE performance_metrics (
    id                              BIGSERIAL    PRIMARY KEY,
    tenant_id                       INT          NOT NULL REFERENCES tenants(id),
    plant_energy_source_id          INT          NOT NULL REFERENCES plant_energy_sources(id),
    financial_year                  VARCHAR(9)   NOT NULL, -- '2025-2026'
    -- Generation
    gross_generation_kwh            DECIMAL(18,4) DEFAULT 0,
    net_generation_kwh              DECIMAL(18,4) DEFAULT 0,
    generation_losses_kwh           DECIMAL(18,4) DEFAULT 0,
    -- Performance ratios
    plf_pct                         DECIMAL(8,4),          -- Plant Load Factor %
    pr_pct                          DECIMAL(8,4),          -- Performance Ratio % (solar)
    availability_pct                DECIMAL(8,4),
    -- Settlement outcomes
    realised_cap_consumption_kwh    DECIMAL(18,4),         -- actual consumed from RE
    over_injection_kwh              DECIMAL(18,4),         -- excess injected to grid
    sale_of_energy_kwh              DECIMAL(18,4),
    sale_of_energy_inr              DECIMAL(16,4),
    -- Consumption context
    total_plant_consumption_kwh     DECIMAL(18,4),
    total_re_consumption_kwh        DECIMAL(18,4),         -- capex basis
    replacement_pct                 DECIMAL(8,4),           -- capex basis
    total_re_consumption_tpa_kwh    DECIMAL(18,4),         -- third-party-agreement basis
    re_percent_tpa                  DECIMAL(8,4),           -- third-party-agreement basis
    -- Losses
    actual_losses_sale_of_energy_kwh   DECIMAL(18,4),
    losses_excl_over_injection_kwh     DECIMAL(18,4),
    losses_excl_over_injection_pct     DECIMAL(8,4),
    banking_loss_pct                   DECIMAL(8,4),
    -- Financials
    total_re_cost_inr               DECIMAL(16,4),
    total_grid_cost_saved_inr       DECIMAL(16,4),
    total_savings_inr               DECIMAL(16,4),
    ebitda_inr                      DECIMAL(16,4),
    UNIQUE (tenant_id, plant_energy_source_id, financial_year)
);

-- Device-level annual metrics — powers GIL's "Wind Turbine Yearly Metrics" table
-- GIL rows: (GIL001, 2025-2026, 6350974 kWh), (GIL002, …), …
CREATE TABLE device_yearly_metrics (
    id                          BIGSERIAL    PRIMARY KEY,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    device_id                   INT          NOT NULL REFERENCES devices(id),
    financial_year              VARCHAR(9)   NOT NULL,
    generation_kwh              DECIMAL(18,4) DEFAULT 0,
    plf_pct                     DECIMAL(8,4),
    availability_pct            DECIMAL(8,4),
    pr_pct                      DECIMAL(8,4),
    downtime_hours              DECIMAL(10,2),
    p50_generation_kwh          DECIMAL(18,4),   -- estimated P50 for variance analysis
    UNIQUE (tenant_id, device_id, financial_year)
);

-- ---------------------------------------------------------------------------
-- LAYER 13 — DATA INGESTION AUDIT
-- ---------------------------------------------------------------------------
-- Tracks every ETL batch so data quality issues can be traced to their source

CREATE TABLE data_ingestion_logs (
    id                      BIGSERIAL    PRIMARY KEY,
    tenant_id               INT          NOT NULL REFERENCES tenants(id),
    source_system           VARCHAR(50)  NOT NULL, -- 'C9_DBEAVER', 'GIL_DBEAVER', 'SCADA', 'MANUAL'
    table_name              VARCHAR(100) NOT NULL,
    file_name               VARCHAR(500),
    records_processed       INT          DEFAULT 0,
    records_inserted        INT          DEFAULT 0,
    records_skipped         INT          DEFAULT 0,
    records_errored         INT          DEFAULT 0,
    period_from             DATE,
    period_to               DATE,
    status                  VARCHAR(20)  NOT NULL DEFAULT 'SUCCESS'
                                CHECK (status IN ('SUCCESS','PARTIAL','FAILED','RUNNING')),
    error_details           JSONB,
    started_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- LAYER 14 — AI / CHAT (MCP-powered natural language queries)
-- ---------------------------------------------------------------------------

CREATE TABLE chat_threads (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   INT          NOT NULL REFERENCES tenants(id),
    user_id     INT          NOT NULL REFERENCES tenant_users(id),
    title       VARCHAR(500),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id   UUID         NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    tenant_id   INT          NOT NULL REFERENCES tenants(id),
    role        VARCHAR(20)  NOT NULL CHECK (role IN ('user','assistant','tool','system')),
    content     TEXT         NOT NULL,
    tool_calls  JSONB,
    token_count INT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- MONTHLY PARTITIONS — generation_readings, consumption_readings, settlement_slots
-- NOTE: In production use pg_partman to auto-create future partitions.
--       Example partitions below cover Apr 2024 – Mar 2027.
-- =============================================================================

DO $$
DECLARE
    start_date  DATE := '2024-04-01';
    end_date    DATE := '2027-04-01';
    cur_date    DATE := start_date;
    next_date   DATE;
    part_name   TEXT;
    yr_mon      TEXT;
BEGIN
    WHILE cur_date < end_date LOOP
        next_date := cur_date + INTERVAL '1 month';
        yr_mon    := TO_CHAR(cur_date, 'YYYY_MM');

        -- generation_readings
        part_name := 'generation_readings_' || yr_mon;
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF generation_readings
             FOR VALUES FROM (%L) TO (%L)',
            part_name, cur_date, next_date
        );

        -- consumption_readings
        part_name := 'consumption_readings_' || yr_mon;
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF consumption_readings
             FOR VALUES FROM (%L) TO (%L)',
            part_name, cur_date, next_date
        );

        -- settlement_slots
        part_name := 'settlement_slots_' || yr_mon;
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF settlement_slots
             FOR VALUES FROM (%L) TO (%L)',
            part_name, cur_date, next_date
        );

        cur_date := next_date;
    END LOOP;
END $$;

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Tenants
CREATE INDEX idx_tenants_code              ON tenants (code);

-- Plants
CREATE INDEX idx_plants_tenant             ON plants (tenant_id);
CREATE INDEX idx_pes_plant                 ON plant_energy_sources (plant_id, is_active);
CREATE INDEX idx_devices_plant             ON devices (plant_id, is_active);
CREATE INDEX idx_devices_code              ON devices (plant_id, device_code);
CREATE INDEX idx_devices_serial            ON devices (serial_number) WHERE serial_number IS NOT NULL;

-- Consumption units
CREATE INDEX idx_cu_tenant                 ON consumption_units (tenant_id, is_active);
CREATE INDEX idx_cu_discom                 ON consumption_units (discom_id);
CREATE INDEX idx_pcm_pes                   ON plant_consumption_mappings (plant_energy_source_id, is_active);
CREATE INDEX idx_pcm_cu                    ON plant_consumption_mappings (consumption_unit_id, is_active);

-- Generation readings (partitioned — each partition inherits these)
CREATE INDEX idx_gen_tenant_time           ON generation_readings (tenant_id, slot_start_time);
CREATE INDEX idx_gen_device_time           ON generation_readings (device_id, slot_start_time);
CREATE INDEX idx_gen_plant_source_time     ON generation_readings (plant_id, source_type_id, slot_start_time);

-- Consumption readings
CREATE INDEX idx_cons_unit_time            ON consumption_readings (consumption_unit_id, slot_start_time);
CREATE INDEX idx_cons_tenant_time          ON consumption_readings (tenant_id, slot_start_time);

-- Settlement slots
CREATE INDEX idx_settle_tenant_time        ON settlement_slots (tenant_id, slot_start_time);
CREATE INDEX idx_settle_pes_cu_time        ON settlement_slots (plant_energy_source_id, consumption_unit_id, slot_start_time);

-- TOD summaries
CREATE INDEX idx_tod_daily_tenant_date     ON tod_daily_summary (tenant_id, date);
CREATE INDEX idx_tod_daily_pes_date        ON tod_daily_summary (plant_energy_source_id, date);
CREATE INDEX idx_device_tod_tenant_date    ON device_tod_summary (tenant_id, device_id, date);

-- Monthly banking
CREATE INDEX idx_banking_tenant_month      ON monthly_banking_settlement (tenant_id, month);
CREATE INDEX idx_banking_cu_month          ON monthly_banking_settlement (consumption_unit_id, month);
CREATE INDEX idx_banking_pes_month         ON monthly_banking_settlement (plant_energy_source_id, month);

-- Billing
CREATE INDEX idx_gbh_cu_period             ON grid_bill_headers (consumption_unit_id, billing_period_from);
CREATE INDEX idx_gbh_tenant_period         ON grid_bill_headers (tenant_id, billing_period_from);
CREATE INDEX idx_gbli_header               ON grid_bill_line_items (bill_header_id);
CREATE INDEX idx_gbli_charge_head          ON grid_bill_line_items (charge_head_id);
CREATE INDEX idx_rbh_pes_period            ON re_bill_headers (plant_energy_source_id, billing_period_from);
CREATE INDEX idx_rbli_header               ON re_bill_line_items (re_bill_header_id);

-- Savings
CREATE INDEX idx_savings_tenant_month      ON savings_summary (tenant_id, month);
CREATE INDEX idx_savings_cu_month          ON savings_summary (consumption_unit_id, month);
CREATE INDEX idx_savings_pes_month         ON savings_summary (plant_energy_source_id, month);
CREATE INDEX idx_dev_savings_tenant_month  ON device_savings_summary (tenant_id, month);
CREATE INDEX idx_dev_savings_device_month  ON device_savings_summary (device_id, month);

-- Performance
CREATE INDEX idx_perf_tenant_fy            ON performance_metrics (tenant_id, financial_year);
CREATE INDEX idx_perf_pes_fy               ON performance_metrics (plant_energy_source_id, financial_year);
CREATE INDEX idx_dev_yearly_tenant_fy      ON device_yearly_metrics (tenant_id, financial_year);
CREATE INDEX idx_dev_yearly_device_fy      ON device_yearly_metrics (device_id, financial_year);

-- Ingestion logs
CREATE INDEX idx_ingest_tenant             ON data_ingestion_logs (tenant_id, started_at);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Plant capability: SOLAR / WIND / HYBRID (derived, never stored)
CREATE VIEW v_plant_capabilities AS
SELECT
    p.id                AS plant_id,
    p.tenant_id,
    p.code              AS plant_code,
    p.name              AS plant_name,
    t.name              AS tenant_name,
    t.code              AS tenant_code,
    s.name              AS state_name,
    s.code              AS state_code,
    d.code              AS discom_code,
    d.name              AS discom_name,
    BOOL_OR(est.code = 'SOLAR')  AS has_solar,
    BOOL_OR(est.code = 'WIND')   AS has_wind,
    CASE
        WHEN BOOL_OR(est.code = 'SOLAR') AND BOOL_OR(est.code = 'WIND') THEN 'HYBRID'
        WHEN BOOL_OR(est.code = 'SOLAR') THEN 'SOLAR'
        WHEN BOOL_OR(est.code = 'WIND')  THEN 'WIND'
        ELSE 'UNKNOWN'
    END                 AS plant_type,
    SUM(pes.installed_capacity_kw)  AS total_capacity_kw,
    COUNT(DISTINCT pes.id)          AS source_count
FROM plants p
JOIN tenants               t   ON t.id   = p.tenant_id
JOIN states                s   ON s.id   = p.state_id
JOIN discoms               d   ON d.id   = p.discom_id
JOIN plant_energy_sources  pes ON pes.plant_id = p.id AND pes.is_active = TRUE
JOIN energy_source_types   est ON est.id  = pes.source_type_id
WHERE p.is_active = TRUE
GROUP BY p.id, p.tenant_id, p.code, p.name, t.name, t.code, s.name, s.code, d.code, d.name;

-- Monthly generation by plant and source type
CREATE VIEW v_monthly_generation AS
SELECT
    tenant_id,
    plant_id,
    plant_energy_source_id,
    source_type_id,
    DATE_TRUNC('month', slot_start_time)::DATE  AS month,
    SUM(generation_kwh)                         AS net_generation_kwh,
    SUM(COALESCE(generation_before_losses_kwh, generation_kwh)) AS gross_generation_kwh,
    SUM(COALESCE(generation_before_losses_kwh, generation_kwh) - generation_kwh) AS losses_kwh,
    COUNT(DISTINCT device_id)                   AS active_devices,
    ROUND(SUM(CASE WHEN is_estimated THEN 0 ELSE generation_kwh END)
          / NULLIF(SUM(generation_kwh), 0) * 100, 2) AS actual_data_pct
FROM generation_readings
GROUP BY tenant_id, plant_id, plant_energy_source_id, source_type_id,
         DATE_TRUNC('month', slot_start_time);

-- Monthly savings overview — the C9 and GIL dashboard primary KPI view
CREATE VIEW v_monthly_savings_overview AS
SELECT
    ss.tenant_id,
    t.name              AS tenant_name,
    t.code              AS tenant_code,
    cu.name             AS unit_name,
    cu.code             AS unit_code,
    d.code              AS discom_code,
    est.code            AS source_type,
    p.name              AS plant_name,
    ss.month,
    ss.grid_cost_without_re,
    ss.re_cost,
    ss.actual_cost_with_re,
    ss.savings_amount_inr,
    ss.savings_pct,
    ss.cost_with_banking,
    ss.cost_without_banking,
    ss.savings_with_banking,
    ss.savings_without_banking,
    ss.effective_rate_per_unit,
    ss.grid_rate_per_unit,
    ss.total_generation_kwh,
    ss.total_consumption_kwh,
    ss.total_matched_kwh,
    ss.replacement_pct
FROM savings_summary            ss
JOIN tenants                    t   ON t.id   = ss.tenant_id
JOIN consumption_units          cu  ON cu.id  = ss.consumption_unit_id
JOIN discoms                    d   ON d.id   = cu.discom_id
JOIN plant_energy_sources       pes ON pes.id = ss.plant_energy_source_id
JOIN energy_source_types        est ON est.id = pes.source_type_id
JOIN plants                     p   ON p.id   = pes.plant_id;

-- Device savings heatmap view — for GIL's per-turbine/panel heatmap
-- Label format matches screenshots: "23005436 WIND", "24004845 SOLAR"
CREATE VIEW v_device_savings_heatmap AS
SELECT
    dss.tenant_id,
    t.code              AS tenant_code,
    dss.device_id,
    dev.device_code,
    dev.device_type,
    est.code            AS source_type,
    dev.device_code || ' ' || est.code  AS unit_label,     -- "GIL001 WIND", "22010390 SOLAR"
    dss.month,
    dss.savings_pct,
    dss.savings_amount_inr,
    dss.grid_cost_without_re,
    dss.actual_cost_with_re,
    dss.generation_kwh,
    dss.consumption_kwh,
    dss.matched_kwh
FROM device_savings_summary     dss
JOIN tenants                    t   ON t.id   = dss.tenant_id
JOIN devices                    dev ON dev.id = dss.device_id
JOIN plant_energy_sources       pes ON pes.id = dev.plant_energy_source_id
JOIN energy_source_types        est ON est.id = pes.source_type_id;

-- Generation, Consumption & Settlement monthly breakdown
-- Powers the top chart in both C9 and GIL dashboards (6-series grouped bar chart)
CREATE VIEW v_gen_cons_settlement_monthly AS
SELECT
    mbs.tenant_id,
    mbs.plant_energy_source_id,
    mbs.consumption_unit_id,
    est.code                                    AS source_type,
    mbs.month,
    SUM(mbs.gross_generation_kwh)               AS gross_generation_kwh,
    SUM(mbs.generation_losses_kwh)              AS generation_losses_kwh,   -- "Generation Losses" bar
    SUM(mbs.net_generation_kwh)                 AS net_generation_kwh,      -- "Actual Generation" bar
    SUM(mbs.total_consumption_kwh)              AS total_consumption_kwh,   -- "Consumption" bar
    SUM(mbs.direct_matched_kwh)                 AS direct_matched_kwh,      -- "Matched Settlement" bar
    SUM(mbs.banking_utilised_kwh)               AS banking_utilised_kwh,    -- "Settlement with Banking" bar
    SUM(mbs.surplus_lapsed_kwh)                 AS lapsed_kwh,              -- "Lapsed Units" bar
    SUM(mbs.unmet_demand_kwh)                   AS grid_drawl_kwh,          -- "Grid Consumption" bar
    SUM(mbs.over_injection_kwh)                 AS over_injection_kwh,
    ROUND(SUM(mbs.total_matched_kwh)
          / NULLIF(SUM(mbs.total_consumption_kwh), 0) * 100, 2) AS replacement_pct
FROM monthly_banking_settlement  mbs
JOIN plant_energy_sources        pes ON pes.id = mbs.plant_energy_source_id
JOIN energy_source_types         est ON est.id = pes.source_type_id
WHERE mbs.tod_slot_id IS NULL    -- aggregate row (no TOD slot filter)
GROUP BY mbs.tenant_id, mbs.plant_energy_source_id, mbs.consumption_unit_id, est.code, mbs.month;

-- Plant type filter view (for "Select Plant Type: ALL/SOLAR/WIND" dropdown)
CREATE VIEW v_gen_cons_by_plant_type AS
SELECT
    vg.*,
    vpc.plant_type,
    vpc.plant_name,
    vpc.discom_code
FROM v_gen_cons_settlement_monthly  vg
JOIN plant_energy_sources           pes ON pes.id = vg.plant_energy_source_id
JOIN v_plant_capabilities           vpc ON vpc.plant_id = pes.plant_id;

-- Grid bill summary with charge heads expanded (for DISCOM Bill table)
CREATE VIEW v_discom_bill_detail AS
SELECT
    gbh.tenant_id,
    gbh.consumption_unit_id,
    cu.name             AS unit_name,
    cu.code             AS unit_code,
    gbh.billing_period_from,
    gbh.billing_period_to,
    gbh.bill_date,
    gbh.gross_amount_inr,
    gbh.net_payable_inr,
    gbh.savings_inr,
    cht.code            AS charge_head_code,
    cht.name            AS charge_head_name,
    cht.category,
    cht.is_credit,
    tsd.slot_code       AS tod_slot_code,
    gli.units_kwh,
    gli.units_kvah,
    gli.demand_kva,
    gli.rate,
    gli.amount_without_re,
    gli.amount_with_re,
    gli.savings_inr     AS line_savings_inr
FROM grid_bill_headers      gbh
JOIN consumption_units      cu  ON cu.id  = gbh.consumption_unit_id
JOIN grid_bill_line_items   gli ON gli.bill_header_id = gbh.id
JOIN charge_head_types      cht ON cht.id = gli.charge_head_id
LEFT JOIN tod_slot_definitions tsd ON tsd.id = gli.tod_slot_id
ORDER BY gbh.billing_period_from, cu.name, cht.sort_order, tsd.sort_order;

-- RE cost component detail (for Wind & Solar Cost Component table)
CREATE VIEW v_re_cost_detail AS
SELECT
    rbh.tenant_id,
    rbh.plant_energy_source_id,
    p.name              AS plant_name,
    est.code            AS source_type,
    rbh.billing_period_from,
    rbh.billing_period_to,
    cht.code            AS charge_head_code,
    cht.name            AS charge_head_name,
    cht.is_credit,
    rli.units_kwh,
    rli.rate,
    rli.amount_inr,
    rli.is_credit       AS line_is_credit
FROM re_bill_headers        rbh
JOIN plant_energy_sources   pes ON pes.id = rbh.plant_energy_source_id
JOIN plants                 p   ON p.id   = pes.plant_id
JOIN energy_source_types    est ON est.id = pes.source_type_id
JOIN re_bill_line_items     rli ON rli.re_bill_header_id = rbh.id
JOIN charge_head_types      cht ON cht.id = rli.charge_head_id
ORDER BY rbh.billing_period_from, est.code, cht.sort_order;

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- States
INSERT INTO states (code, name) VALUES
    ('KA', 'Karnataka'),
    ('MH', 'Maharashtra'),
    ('TN', 'Tamil Nadu'),
    ('TS', 'Telangana'),
    ('RJ', 'Rajasthan'),
    ('GJ', 'Gujarat'),
    ('AP', 'Andhra Pradesh'),
    ('MP', 'Madhya Pradesh'),
    ('HR', 'Haryana'),
    ('UP', 'Uttar Pradesh');

-- DISCOMs
INSERT INTO discoms (state_id, code, name) VALUES
    ((SELECT id FROM states WHERE code='KA'), 'BESCOM',   'Bangalore Electricity Supply Company'),
    ((SELECT id FROM states WHERE code='MH'), 'MSEDCL',   'Maharashtra State Electricity Distribution Co. Ltd'),
    ((SELECT id FROM states WHERE code='TN'), 'TANGEDCO', 'Tamil Nadu Generation and Distribution Corporation'),
    ((SELECT id FROM states WHERE code='TS'), 'TSNPDCL',  'Telangana Northern Power Distribution Company'),
    ((SELECT id FROM states WHERE code='TS'), 'TSSPDCL',  'Telangana Southern Power Distribution Company'),
    ((SELECT id FROM states WHERE code='RJ'), 'JVVNL',    'Jaipur Vidyut Vitran Nigam Limited'),
    ((SELECT id FROM states WHERE code='RJ'), 'AVVNL',    'Ajmer Vidyut Vitran Nigam Limited'),
    ((SELECT id FROM states WHERE code='GJ'), 'DGVCL',    'Dakshin Gujarat Vij Company Limited'),
    ((SELECT id FROM states WHERE code='GJ'), 'MGVCL',    'Madhya Gujarat Vij Company Limited'),
    ((SELECT id FROM states WHERE code='AP'), 'APEPDCL',  'Andhra Pradesh Eastern Power Distribution Co.'),
    ((SELECT id FROM states WHERE code='HR'), 'DHBVN',    'Dakshin Haryana Bijli Vitran Nigam');

-- Energy source types (only SOLAR and WIND; HYBRID = derived)
INSERT INTO energy_source_types (code, name, unit, description) VALUES
    ('SOLAR', 'Solar Photovoltaic', 'kWh', 'Energy generated by solar PV panels or strings'),
    ('WIND',  'Wind Turbine',       'kWh', 'Energy generated by wind turbine generators');

-- TOD slot definitions — BESCOM (Karnataka)
-- Source: visualizations/tod_config.py (Dev branch, confirmed 2026-07)
-- 4 slots covering 24 hours. Night Off Peak wraps midnight (22:00–06:00).
INSERT INTO tod_slot_definitions (discom_id, slot_code, slot_name, time_from, time_to, multiplier, sort_order, effective_from)
SELECT id, 'MORNING_PEAK',    'Morning Peak',    '06:00', '09:00', 1.5,  1, '2020-04-01' FROM discoms WHERE code = 'BESCOM'
UNION ALL
SELECT id, 'DAY_NORMAL',      'Day Normal',      '09:00', '18:00', 1.0,  2, '2020-04-01' FROM discoms WHERE code = 'BESCOM'
UNION ALL
SELECT id, 'EVENING_PEAK',    'Evening Peak',    '18:00', '22:00', 1.5,  3, '2020-04-01' FROM discoms WHERE code = 'BESCOM'
UNION ALL
SELECT id, 'NIGHT_OFF_PEAK',  'Night Off Peak',  '22:00', '06:00', 0.75, 4, '2020-04-01' FROM discoms WHERE code = 'BESCOM';

-- TOD slot definitions — MSEDCL (Maharashtra)
INSERT INTO tod_slot_definitions (discom_id, slot_code, slot_name, time_from, time_to, multiplier, sort_order, effective_from)
SELECT id, 'PEAK',     'Peak Hours',         '07:00', '11:00', 1.5,  1, '2020-04-01' FROM discoms WHERE code = 'MSEDCL'
UNION ALL
SELECT id, 'PEAK',     'Peak Hours (Eve)',   '18:00', '23:00', 1.5,  2, '2020-04-01' FROM discoms WHERE code = 'MSEDCL'
UNION ALL
SELECT id, 'OFF_PEAK', 'Off-Peak Hours',     '11:00', '18:00', 1.0,  3, '2020-04-01' FROM discoms WHERE code = 'MSEDCL'
UNION ALL
SELECT id, 'NORMAL',   'Normal Hours',       '23:00', '07:00', 0.8,  4, '2020-04-01' FROM discoms WHERE code = 'MSEDCL';

-- ===========================================================================
-- CHARGE HEAD TYPES — GRID
-- ===========================================================================
INSERT INTO charge_head_types (category, code, name, unit, is_credit, applicable_discom_codes, sort_order) VALUES
    -- ── Universal (all DISCOMs) ──────────────────────────────────────
    ('GRID','TOTAL_CONSUMPTION',         'Total Consumption',                  'kWh',  FALSE, NULL,            5),
    ('GRID','ENERGY_CHARGE',             'Energy Charges',                     'INR',  FALSE, NULL,           10),
    ('GRID','DEMAND_CHARGE',             'Demand Charges – Fixed',             'INR',  FALSE, NULL,           20),
    ('GRID','WHEELING_ENERGY',           'Wheeling Energy',                    'kWh',  FALSE, NULL,           30),
    ('GRID','WHEELING_CHARGE',           'Wheeling Energy Charge',             'INR',  FALSE, NULL,           35),
    ('GRID','FUEL_COST_ADJ',             'Fuel Cost Adjustment (FCA)',         'INR',  FALSE, NULL,           40),
    ('GRID','ELECTRICITY_DUTY',          'Electricity Duty (ED)',              'INR',  FALSE, NULL,           50),
    ('GRID','TAX_ON_SALE',               'Tax on Sale',                        'INR',  FALSE, NULL,           55),
    ('GRID','TOD_TARIFF',                'Time-of-Day Tariff',                 'INR',  FALSE, NULL,           60),
    ('GRID','CROSS_SUBSIDY_SURCHARGE',   'Cross-Subsidy Surcharge',            'INR',  FALSE, NULL,           65),
    ('GRID','NET_PAYABLE',               'Net Payable',                        'INR',  FALSE, NULL,          200),

    -- ── BESCOM-specific (C9 / Karnataka) ────────────────────────────
    ('GRID','PG_SURCHARGE',              'P&G Surcharge – Fixed',              'INR',  FALSE, ARRAY['BESCOM'], 70),
    ('GRID','MANUAL_ENERGY_WHEELING',    'Manual Energy Charges – Fixed (Wheeling)', 'INR', FALSE, ARRAY['BESCOM'], 80),

    -- ── MSEDCL-specific (GIL / Maharashtra) ─────────────────────────
    ('GRID','ENERGY_KVAH',               'Energy Charges (kVAh)',              'kVAh', FALSE, ARRAY['MSEDCL'], 12),
    ('GRID','BULK_DISCOUNT',             'Bulk Discount',                      'INR',  TRUE,  ARRAY['MSEDCL'], 75),
    ('GRID','INCREMENTAL_REBATE',        'Incremental Rebate',                 'INR',  TRUE,  ARRAY['MSEDCL'], 85),
    ('GRID','DEBIT_BILL_ADJ',            'Debit Bill Adjustment (Previous Rebate)', 'INR', FALSE, ARRAY['MSEDCL'], 90),
    ('GRID','GOM_MERC_SUBSIDY',          'GoM/MERC Subsidy',                   'INR',  TRUE,  ARRAY['MSEDCL'], 95),
    ('GRID','PRINCIPAL_ARREARS',         'Principal Arrears',                  'INR',  FALSE, ARRAY['MSEDCL'],100),
    ('GRID','PROMPT_PAYMENT_DISC',       'Prompt Payment Discount',            'INR',  TRUE,  ARRAY['MSEDCL'],105),
    ('GRID','TOS_CHARGES',               'Transmission of Surplus (ToS)',      'INR',  FALSE, ARRAY['MSEDCL'],110);

-- ===========================================================================
-- CHARGE HEAD TYPES — RE
-- ===========================================================================
INSERT INTO charge_head_types (category, code, name, unit, is_credit, applicable_discom_codes, sort_order) VALUES
    -- ── Universal RE charges ─────────────────────────────────────────
    ('RE','OM_CHARGES',               'O&M Charges',                        'INR',  FALSE, NULL,  10),
    ('RE','TRANSMISSION_CHARGES',     'Transmission Charges',               'INR',  FALSE, NULL,  20),
    ('RE','WHEELING_CHARGES',         'Wheeling Charges',                   'INR',  FALSE, NULL,  30),
    ('RE','SCHEDULING_CHARGES',       'Scheduling Charges',                 'INR',  FALSE, NULL,  40),
    ('RE','DEVIATION_CHARGES',        'Deviation Charges (DSM)',            'INR',  FALSE, NULL,  50),
    ('RE','DEPRECIATION',             'Depreciation',                       'INR',  FALSE, NULL,  60),

    -- ── MSEDCL-specific RE charges (GIL) ────────────────────────────
    ('RE','ASSET_MC',                 'Asset Management Charges (MC)',      'INR',  FALSE, ARRAY['MSEDCL'], 70),
    ('RE','OPERATING_CHARGES_MSEDCL', 'Operating Charges to MSEDCL',       'INR',  FALSE, ARRAY['MSEDCL'], 80),
    ('RE','OA_APPLICATION_CHARGES',   'Open Access Application Charges',    'INR',  FALSE, ARRAY['MSEDCL'], 90),
    ('RE','STARTUP_POWER_BILL',       'Startup Power Bill',                 'INR',  FALSE, ARRAY['MSEDCL'],100),
    ('RE','GST_REVERSAL',             'GST Reversal',                       'INR',  TRUE,  ARRAY['MSEDCL'],110),
    ('RE','TOS_RE_CHARGES',           'Transmission of Surplus – RE (ToS)', 'INR',  FALSE, ARRAY['MSEDCL'],120);

-- ===========================================================================
-- SAMPLE TENANTS (C9 and GIL)
-- ===========================================================================
INSERT INTO tenants (code, name, short_name, city, state_id, primary_email) VALUES
    ('C9',  'Cloud9 Energy Private Limited', 'C9',  'Bangalore',  (SELECT id FROM states WHERE code='KA'), 'data@cloud9energy.in'),
    ('GIL', 'Graphite India Limited',        'GIL', 'Mumbai',     (SELECT id FROM states WHERE code='MH'), 'data@graphiteindia.com');

-- ===========================================================================
-- MISSING TABLE ADDITIONS (identified 2026-07)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- TABLE: re_contracts
-- Stores PPA (Power Purchase Agreement) rate per plant-energy-source per period.
-- The renewable_rate_per_kwh used in the savings formula comes from this table.
-- ---------------------------------------------------------------------------
CREATE TABLE re_contracts (
    id                          BIGSERIAL    PRIMARY KEY,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    plant_energy_source_id      INT          NOT NULL REFERENCES plant_energy_sources(id),
    contract_name               VARCHAR(200),
    counterparty_name           VARCHAR(200),           -- solar/wind developer name
    ppa_rate_per_kwh            DECIMAL(10,4) NOT NULL, -- ₹/kWh PPA tariff
    wheeling_rate_per_kwh       DECIMAL(10,4) DEFAULT 0,-- ₹/kWh wheeling charge from DISCOM
    net_renewable_rate_per_kwh  DECIMAL(10,4)           -- ppa_rate + wheeling_rate (effective)
                                GENERATED ALWAYS AS (ppa_rate_per_kwh + wheeling_rate_per_kwh) STORED,
    contract_start_date         DATE         NOT NULL,
    contract_end_date           DATE,
    contracted_capacity_kw      DECIMAL(12,4),
    contract_document_url       TEXT,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, plant_energy_source_id, contract_start_date)
);

CREATE INDEX idx_re_contracts_tenant       ON re_contracts (tenant_id);
CREATE INDEX idx_re_contracts_pes          ON re_contracts (plant_energy_source_id, contract_start_date);

-- ---------------------------------------------------------------------------
-- TABLE: banking_account
-- Tracks monthly banking balance per unit — gross banked, loss applied, net settled,
-- lapsed. Provides the audit trail for the 8% loss and monthly expiry rule.
-- ---------------------------------------------------------------------------
CREATE TABLE banking_account (
    id                          BIGSERIAL    PRIMARY KEY,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    plant_energy_source_id      INT          NOT NULL REFERENCES plant_energy_sources(id),
    consumption_unit_id         INT          NOT NULL REFERENCES consumption_units(id),
    month                       DATE         NOT NULL,   -- 1st of month (banking period)
    -- Opening / generation side
    opening_balance_kwh         DECIMAL(16,4) DEFAULT 0, -- banked kWh carried from prior month
    gross_banked_kwh            DECIMAL(16,4) DEFAULT 0, -- surplus generation banked this month
    -- Loss
    banking_loss_pct            DECIMAL(8,4)  NOT NULL DEFAULT 8.0,  -- 8% confirmed
    banking_loss_kwh            DECIMAL(16,4)
        GENERATED ALWAYS AS (gross_banked_kwh * banking_loss_pct / 100) STORED,
    net_available_kwh           DECIMAL(16,4)
        GENERATED ALWAYS AS (gross_banked_kwh * (1 - banking_loss_pct / 100)) STORED,
    -- Settlement (drawdown)
    intra_settled_kwh           DECIMAL(16,4) DEFAULT 0, -- settled within same month
    inter_settled_kwh           DECIMAL(16,4) DEFAULT 0, -- settled from prior month opening
    total_settled_kwh           DECIMAL(16,4)
        GENERATED ALWAYS AS (intra_settled_kwh + inter_settled_kwh) STORED,
    -- Closing
    lapsed_kwh                  DECIMAL(16,4) DEFAULT 0, -- expired at month end (not settled)
    closing_balance_kwh         DECIMAL(16,4) DEFAULT 0, -- carried to next month
    -- Audit
    expiry_date                 DATE,                    -- last day of month (auto-expire)
    notes                       TEXT,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, plant_energy_source_id, consumption_unit_id, month)
);

CREATE INDEX idx_banking_account_tenant    ON banking_account (tenant_id, month);
CREATE INDEX idx_banking_account_cu_month  ON banking_account (consumption_unit_id, month);
CREATE INDEX idx_banking_account_pes_month ON banking_account (plant_energy_source_id, month);

-- ---------------------------------------------------------------------------
-- TABLE: allocation_reconciliation
-- Tracks proposed allocation (dashboard model) vs actual BESCOM wheeling
-- certificate allocation per unit per month. Surfaces the reconciliation gap.
-- ---------------------------------------------------------------------------
CREATE TABLE allocation_reconciliation (
    id                          BIGSERIAL    PRIMARY KEY,
    tenant_id                   INT          NOT NULL REFERENCES tenants(id),
    plant_energy_source_id      INT          NOT NULL REFERENCES plant_energy_sources(id),
    consumption_unit_id         INT          NOT NULL REFERENCES consumption_units(id),
    month                       DATE         NOT NULL,
    -- Proposed (dashboard model — highest tariff first, then by consumption ∝)
    proposed_allocation_kwh     DECIMAL(16,4) DEFAULT 0,
    proposed_tariff_rate        DECIMAL(10,4),           -- ₹/kWh at time of allocation
    proposed_tariff_tier        SMALLINT,                -- 1=high, 2=standard, etc.
    proposed_allocation_rank    SMALLINT,                -- 1=first allocated, n=last
    -- Actual (from BESCOM wheeling certificate)
    actual_wheeling_kwh         DECIMAL(16,4),           -- kWh shown on BESCOM certificate
    actual_banking_credit_kwh   DECIMAL(16,4),           -- banking credit on certificate
    -- Gap
    gap_kwh                     DECIMAL(16,4)
        GENERATED ALWAYS AS (
            COALESCE(proposed_allocation_kwh, 0) - COALESCE(actual_wheeling_kwh, 0)
        ) STORED,
    gap_inr                     DECIMAL(16,4),           -- gap_kwh × tariff_rate (manual or computed)
    -- Audit
    reconciliation_status       VARCHAR(20)  DEFAULT 'PENDING'
                                    CHECK (reconciliation_status IN ('PENDING','RECONCILED','DISPUTED')),
    notes                       TEXT,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, plant_energy_source_id, consumption_unit_id, month)
);

CREATE INDEX idx_alloc_recon_tenant        ON allocation_reconciliation (tenant_id, month);
CREATE INDEX idx_alloc_recon_cu_month      ON allocation_reconciliation (consumption_unit_id, month);

-- ===========================================================================
-- TARIFF SEEDS — C9 Client (BESCOM, Karnataka)
-- Source: DISCOM Bill – All Units.csv (Aug 2025 actuals)
-- Note: tariff_configs table stores historical rates; new row each time tariff changes.
-- ===========================================================================
-- High tariff units (₹7.20/kWh): Malleswaram, Sahakar Nagar, Old Airport Road, HRBR Unit
-- Standard tariff units (₹5.95/kWh): remaining 7 units
-- These are inserted as comments only — actual INSERT requires consumption_unit_id
-- which is populated during client onboarding. See onboarding checklist in schema_design_v2.md.

-- Tariff reference constants (for documentation and ETL validation):
-- C9 HIGH_TARIFF     = ₹7.20/kWh  → units: Malleswaram, Sahakar Nagar, Old Airport Rd, HRBR
-- C9 STANDARD_TARIFF = ₹5.95/kWh  → units: Bellandur Corp, Bellandur 1, Bellandur 2,
--                                           Madiwala, GK Pvt, Rajajinagar, Domlur
-- BESCOM Demand Charge: ₹350–₹370 / kVA / month (varies by unit)
-- BESCOM FAC: ₹0.36/kWh
-- BESCOM Tax: 9%
-- BESCOM P&G Surcharge: ₹0.36/kWh
-- BESCOM Manual Wheeling: ₹0.29/kWh (deducted from wheeling credit)
-- BESCOM Manual Energy Wheeling: ₹0.20/kWh (deducted from wheeling credit)
-- Net wheeling benefit: ₹1.00 − ₹0.29 − ₹0.20 = ₹0.51/kWh

-- ===========================================================================
-- DASHBOARD-COMPATIBLE VIEWS
-- These views match the exact names queried by the existing Streamlit dashboard
-- (Dev branch). Any rename requires code changes in db/fetch_*.py files.
-- ===========================================================================

-- View: monthly_banking_settlement_data_v2
-- Source file: db/fetch_summary_data.py
-- Powers: Summary tab Generation vs Consumption chart, Banking Analysis chart
CREATE VIEW monthly_banking_settlement_data_v2 AS
SELECT
    mbs.tenant_id,
    mbs.plant_energy_source_id,
    DATE_TRUNC('month', mbs.month)::DATE            AS month,
    SUM(mbs.net_generation_kwh + COALESCE(mbs.over_injection_kwh, 0))
                                                    AS supplied_generation,
    SUM(mbs.total_consumption_kwh)                  AS consumption,
    SUM(mbs.surplus_lapsed_kwh)                     AS surplus_generation,      -- pre-banking surplus
    SUM(mbs.unmet_demand_kwh)                       AS surplus_demand,          -- unmet demand
    SUM(mbs.direct_matched_kwh)                     AS matched_settlement,      -- 15-min direct match
    SUM(mbs.banking_utilised_kwh)                   AS settlement_with_banking, -- banked kWh settled
    SUM(mbs.direct_matched_kwh + mbs.banking_utilised_kwh) AS total_settlement,
    SUM(COALESCE(mbs.surplus_lapsed_kwh, 0))        AS surplus_generation_after_banking,
    SUM(COALESCE(mbs.unmet_demand_kwh, 0))          AS surplus_demand_after_banking
FROM monthly_banking_settlement  mbs
WHERE mbs.tod_slot_id IS NULL   -- aggregate rows only, exclude per-slot rows
GROUP BY mbs.tenant_id, mbs.plant_energy_source_id, DATE_TRUNC('month', mbs.month);

-- View: monthly_savings_v2
-- Source file: db/fetch_tod_tab_data.py, visualizations/unit_wise_power_cost_calculations.py
-- Powers: Bill tab, Unit-wise Monthly Bill Analysis, Savings Heatmap
-- Note: actual_cost_with_banking uses energy-only grid_cost (no demand charges) per code.
CREATE VIEW monthly_savings_v2 AS
SELECT
    ss.month,
    cu.name                                         AS unit,
    ss.grid_cost_without_re                         AS grid_cost,
    ss.cost_with_banking                            AS actual_cost_with_banking,
    ss.savings_with_banking,
    ROUND(
        CASE WHEN ss.grid_cost_without_re > 0
             THEN ss.savings_with_banking / ss.grid_cost_without_re * 100
             ELSE 0
        END, 2
    )                                               AS savings_pct_with_banking,
    -- Additional columns for unit-wise analysis
    ss.cost_without_banking                         AS actual_cost_without_banking,
    ss.savings_without_banking,
    ROUND(
        CASE WHEN ss.grid_cost_without_re > 0
             THEN ss.savings_without_banking / ss.grid_cost_without_re * 100
             ELSE 0
        END, 2
    )                                               AS savings_pct_without_banking,
    ss.total_consumption_kwh,
    ss.total_matched_kwh,
    ss.replacement_pct,
    ss.tenant_id,
    ss.consumption_unit_id,
    ss.plant_energy_source_id
FROM savings_summary        ss
JOIN consumption_units      cu  ON cu.id = ss.consumption_unit_id
ORDER BY ss.month, cu.name;

-- View: hourly_gen_con2_v2
-- Source file: db/fetch_tod_tab_data.py
-- Powers: TOD tab — hourly and daily generation vs consumption by slot
CREATE VIEW hourly_gen_con2_v2 AS
SELECT
    gr.tenant_id,
    gr.slot_start_time::DATE                        AS date,
    gr.slot_start_time::TIME                        AS time,
    tsd.slot_name                                   AS tod_slot,
    SUM(gr.generation_kwh)                          AS supplied_generation,
    SUM(cr.consumption_kwh)                         AS consumption
FROM generation_readings    gr
JOIN tod_slot_definitions   tsd ON tsd.discom_id = (
        SELECT p.discom_id FROM plants p
        JOIN plant_energy_sources pes ON pes.plant_id = p.id
        WHERE pes.id = gr.plant_energy_source_id
    )
    AND gr.slot_start_time::TIME >= tsd.time_from::TIME
    AND (
        tsd.time_from < tsd.time_to  -- normal slot (doesn't wrap midnight)
        AND gr.slot_start_time::TIME < tsd.time_to::TIME
        OR
        tsd.time_from >= tsd.time_to -- wrap-around slot (e.g. 22:00–06:00)
        AND (gr.slot_start_time::TIME >= tsd.time_from::TIME
             OR gr.slot_start_time::TIME < tsd.time_to::TIME)
    )
JOIN consumption_readings   cr  ON cr.slot_start_time = gr.slot_start_time
                                AND cr.tenant_id = gr.tenant_id
GROUP BY gr.tenant_id, gr.slot_start_time::DATE, gr.slot_start_time::TIME, tsd.slot_name;

-- View: discom_bill_v2
-- Source file: db/fetch_tod_tab_data.py
-- Powers: Bill tab — actual DISCOM bill with all line items
CREATE VIEW discom_bill_v2 AS
SELECT
    gbh.tenant_id,
    gbh.consumption_unit_id,
    cu.name                                         AS unit_name,
    cu.code                                         AS unit_code,
    gbh.billing_period_from                         AS month_year,  -- dashboard filters by this
    gbh.billing_period_to,
    gbh.bill_number,
    gbh.gross_amount_inr,
    gbh.net_payable_inr,
    gbh.savings_inr,
    gbh.total_units_kwh,
    -- Pivot key line items as columns (BESCOM structure)
    MAX(CASE WHEN cht.code = 'ENERGY_CHARGE'          THEN gli.rate   END) AS energy_rate_per_kwh,
    MAX(CASE WHEN cht.code = 'DEMAND_CHARGE'           THEN gli.rate   END) AS demand_rate_per_kva,
    MAX(CASE WHEN cht.code = 'WHEELING_ENERGY'         THEN gli.units_kwh END) AS wheeling_energy_kwh,
    MAX(CASE WHEN cht.code = 'ENERGY_CHARGE'           THEN gli.amount_without_re END) AS energy_charge_inr,
    MAX(CASE WHEN cht.code = 'DEMAND_CHARGE'           THEN gli.amount_without_re END) AS demand_charge_inr,
    MAX(CASE WHEN cht.code = 'FUEL_COST_ADJ'           THEN gli.amount_without_re END) AS fac_inr,
    MAX(CASE WHEN cht.code = 'TAX_ON_SALE'             THEN gli.amount_without_re END) AS tax_inr,
    MAX(CASE WHEN cht.code = 'PG_SURCHARGE'            THEN gli.amount_without_re END) AS pg_surcharge_inr,
    MAX(CASE WHEN cht.code = 'WHEELING_CHARGE'         THEN gli.amount_without_re END) AS wheeling_charge_inr,
    MAX(CASE WHEN cht.code = 'MANUAL_ENERGY_WHEELING'  THEN gli.amount_without_re END) AS manual_wheeling_inr
FROM grid_bill_headers      gbh
JOIN consumption_units      cu  ON cu.id  = gbh.consumption_unit_id
JOIN grid_bill_line_items   gli ON gli.bill_header_id = gbh.id
JOIN charge_head_types      cht ON cht.id = gli.charge_head_id
GROUP BY gbh.tenant_id, gbh.consumption_unit_id, cu.name, cu.code,
         gbh.billing_period_from, gbh.billing_period_to, gbh.bill_number,
         gbh.gross_amount_inr, gbh.net_payable_inr, gbh.savings_inr, gbh.total_units_kwh
ORDER BY gbh.billing_period_from, cu.name;

-- ===========================================================================
-- END OF SCHEMA
-- ===========================================================================
