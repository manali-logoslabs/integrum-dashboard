#!/usr/bin/env python3
"""
run_migration.py — Integrum Energy Schema v2 Full Migration  (v2)
=================================================================
Deploys schema, seeds reference data, and loads ALL C9 + GIL data.

Run from D:\\Integrum_dashboard\\:
    pip install psycopg2-binary
    python run_migration.py

What this script does:
  Phase 1 — Deploy schema_v2.sql (skips if already deployed)
  Phase 2 — Seeds: seed_august2025 -> MSEDCL TOD slots -> seed_all_months
  Phase 3 — GIL ETL (all 11 GIL source files -> Schema v2)
  Phase 4 — C9  ETL (all C9 source files incl. effective rates -> Schema v2)
  Phase 5 — Verification counts for every table

Files covered:
  C9:  discom_bill_v2, hourly_gen_con2_v2, monthly_banking_settlement_data_v2,
       monthly_savings_v3, effective_rate_summary
       [monthly_savings_v2 skipped — superseded by v3]
       [gen_cons_15min_data_v2 skipped — 0 rows confirmed]
       [electricity_consumption skipped — superseded by effective_rate_summary]
  GIL: wind_generation, solar_generation, consumption_data,
       tod_daily_summary, monthly_banking_settlement, savings_summary,
       performance_metrics, wind_turbine_yearly_metrics,
       settlement_matching, chat_history, upload_tracking
       [grid_cost_component, wind_solar_cost_component, tod_tariff
        skipped — confirmed placeholders with fake data]
"""

import re
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("ERROR: Run:  pip install psycopg2-binary")

# ── Config ────────────────────────────────────────────────────────────────────
DB_DSN  = "postgresql://integrum:integrum_pass@localhost:5432/integrum"
BASE    = Path(__file__).parent
GIL_DIR = BASE / "GIL"
C9_DIR  = BASE / "C9"

C9_TENANT_ID  = 1
GIL_TENANT_ID = 2

MSEDCL_GRID_RATE = 9.2423   # Rs/kWh effective MSEDCL rate
GIL_PPA_RATE     = 2.50     # Rs/kWh hybrid PPA tariff

# GIL plant capacities — back-calculated from performance_metrics:
#   Wind:  60,405,546 kWh / (36.48% PLF x 8,760 hrs) = 18,902 kW ~ 18,900 kW
#   Solar: 13,088,326 kWh / (16.98% PLF x 8,760 hrs) =  8,799 kW
#   plant_metadata.sql says 5 MW which is incorrect (old/contracted value)
WIND_CAPACITY_KW    = 18900
TURBINE_CAPACITY_KW = 2100    # 18900 / 9 metered turbines
SOLAR_CAPACITY_KW   = 8799
SOLAR_INV_CAPACITY  = 2199.75 # 8799 / 4 inverters

# Wind turbine serial -> device_code  (GIL001 = highest annual generation)
WIND_SERIAL_TO_CODE: dict[str, str] = {
    "23005432": "GIL001",
    "23005434": "GIL002",
    "23005438": "GIL003",
    "24000783": "GIL004",
    "23005430": "GIL005",
    "23005426": "GIL006",
    "23005436": "GIL007",
    "23005428": "GIL008",
    "23005424": "GIL009",
    "23005435": "GIL010",   # present in raw generation data; no yearly metrics
}

SOLAR_SERIAL_TO_CODE: dict[str, str] = {
    "24004845": "SINV-01",
    "22010390": "SINV-02",
    "24004850": "SINV-03",
    # Q0430203 was initially assumed to be SINV-03 under a prior serial
    # number, but its Mar-2026 readings overlap 24004850's with distinct,
    # simultaneous non-zero values -- confirmed genuinely separate,
    # concurrently-operating physical inverter.
    "Q0430203": "SINV-04",
}

# effective_rate_summary.location_code -> consumption_units.code  (C9)
EFF_RATE_LOC_TO_CU: dict[str, str] = {
    "BNGMWM": "C2HT-136",   # Malleswaram
    "BNGOAR": "E6HT209",    # Old Airport Road
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def connect():
    try:
        return psycopg2.connect(DB_DSN)
    except Exception as e:
        sys.exit(f"Cannot connect ({DB_DSN}): {e}")


def run_sql_file(conn, path: Path, label: str = "") -> None:
    label = label or path.name
    print(f"  > {label} ... ", end="", flush=True)
    with conn.cursor() as cur:
        cur.execute(path.read_text(encoding="utf-8"))
    conn.commit()
    print("done")


def load_to_staging(conn, filepath: Path, stg_table: str,
                    pub_table: str | None = None) -> int:
    """Stream INSERT file into stg.TABLE, stripping ::schema.enum casts."""
    pub_table = pub_table or stg_table
    print(f"  > stg.{stg_table} <- {filepath.name} ... ", end="", flush=True)
    cur = conn.cursor()
    buf: list[str] = []
    blocks = 0
    with open(filepath, encoding="utf-8") as f:
        for line in f:
            line = re.sub(r"::\w+\.\w+", "", line)
            line = line.replace(f"INSERT INTO public.{pub_table}",
                                f"INSERT INTO stg.{stg_table}")
            buf.append(line)
            if ";" in line:
                sql = "".join(buf).strip()
                if sql and not sql.startswith("--"):
                    cur.execute(sql)
                    blocks += 1
                    if blocks % 1000 == 0:
                        conn.commit()
                        print(f"\r  > stg.{stg_table} <- {filepath.name} "
                              f"... {blocks} blocks  ", end="", flush=True)
                buf = []
    conn.commit()
    cur.execute(f"SELECT COUNT(*) FROM stg.{stg_table}")
    n = cur.fetchone()[0]
    cur.close()
    print(f"\r  > stg.{stg_table} <- {filepath.name} ... {n:,} rows        ")
    return n


def upsert(cur, ins_sql, ins_params, sel_sql, sel_params):
    """INSERT ... RETURNING id; fall back to SELECT id on conflict."""
    cur.execute(ins_sql, ins_params)
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(sel_sql, sel_params)
    return cur.fetchone()[0]


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — Schema DDL
# ─────────────────────────────────────────────────────────────────────────────

def phase1_schema(conn) -> None:
    print("\n[Phase 1] Schema v2 DDL")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema='public' AND table_name='generation_readings'
        """)
        exists = cur.fetchone()[0] > 0
    if exists:
        print("  Schema already deployed -- skipping DDL")
    else:
        run_sql_file(conn, BASE / "schema_v2.sql", "schema_v2.sql")
        print("  Schema v2 created")

    # Idempotent patches for columns added after the initial deployment --
    # safe to run against both a fresh DB (no-op, columns already in
    # schema_v2.sql) and an already-deployed one (adds the columns).
    with conn.cursor() as cur:
        cur.execute("""
            ALTER TABLE tenant_users
                ADD COLUMN IF NOT EXISTS username VARCHAR(100);

            ALTER TABLE performance_metrics
                ADD COLUMN IF NOT EXISTS total_re_consumption_tpa_kwh DECIMAL(18,4),
                ADD COLUMN IF NOT EXISTS re_percent_tpa                DECIMAL(8,4),
                ADD COLUMN IF NOT EXISTS actual_losses_sale_of_energy_kwh DECIMAL(18,4),
                ADD COLUMN IF NOT EXISTS losses_excl_over_injection_kwh   DECIMAL(18,4),
                ADD COLUMN IF NOT EXISTS losses_excl_over_injection_pct   DECIMAL(8,4),
                ADD COLUMN IF NOT EXISTS banking_loss_pct                 DECIMAL(8,4);

            ALTER TABLE savings_summary
                ADD COLUMN IF NOT EXISTS demand_charges_inr DECIMAL(16,4);
        """)
        conn.commit()
    print("  Schema patches applied (idempotent)")

    # generation_readings / consumption_readings had no business-key unique
    # constraint (only a synthetic id + partition key in the PK), so the
    # "ON CONFLICT DO NOTHING" in seed_all_months.sql / seed_august2025.sql
    # never had anything to conflict against -- every re-run duplicated
    # all seeded rows. Dedupe existing data, then add the missing
    # constraints so re-runs become genuinely idempotent.
    with conn.cursor() as cur:
        cur.execute("""
            DELETE FROM generation_readings gr
            USING generation_readings gr2
            WHERE gr.tenant_id = gr2.tenant_id
              AND gr.device_id = gr2.device_id
              AND gr.slot_start_time = gr2.slot_start_time
              AND gr.id > gr2.id
        """)
        gen_removed = cur.rowcount
        cur.execute("""
            DELETE FROM consumption_readings cr
            USING consumption_readings cr2
            WHERE cr.tenant_id = cr2.tenant_id
              AND cr.consumption_unit_id = cr2.consumption_unit_id
              AND cr.slot_start_time = cr2.slot_start_time
              AND cr.id > cr2.id
        """)
        cons_removed = cur.rowcount
        conn.commit()
        if gen_removed or cons_removed:
            print(f"  Deduplicated generation_readings ({gen_removed:,} "
                  f"removed), consumption_readings ({cons_removed:,} removed)")

        for conname, ddl in [
            ("ux_generation_readings_biz_key",
             "ALTER TABLE generation_readings ADD CONSTRAINT "
             "ux_generation_readings_biz_key "
             "UNIQUE (tenant_id, device_id, slot_start_time)"),
            ("ux_consumption_readings_biz_key",
             "ALTER TABLE consumption_readings ADD CONSTRAINT "
             "ux_consumption_readings_biz_key "
             "UNIQUE (tenant_id, consumption_unit_id, slot_start_time)"),
        ]:
            cur.execute("SELECT 1 FROM pg_constraint WHERE conname=%s",
                        (conname,))
            if not cur.fetchone():
                cur.execute(ddl)
                print(f"  Added missing constraint {conname}")
        conn.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 — Seeds
# ─────────────────────────────────────────────────────────────────────────────

def phase2_seeds(conn) -> None:
    print("\n[Phase 2] Reference data + C9 seed")

    run_sql_file(conn, BASE / "seed_august2025.sql", "seed_august2025.sql")

    # MSEDCL TOD slots absent from both seed files -- insert manually
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM tod_slot_definitions WHERE discom_id=2")
        if cur.fetchone()[0] == 0:
            print("  > Adding MSEDCL TOD slots ... ", end="", flush=True)
            cur.execute("""
                INSERT INTO tod_slot_definitions
                    (id, discom_id, slot_code, slot_name,
                     time_from, time_to, applies_to_days,
                     multiplier, sort_order, effective_from)
                VALUES
                    (5,2,'PEAK',        'Peak (Morning)', '06:00','10:00',
                     'ALL',1.25,1,'2020-01-01'),
                    (6,2,'PEAK_EVENING','Peak (Evening)', '18:00','22:00',
                     'ALL',1.25,2,'2020-01-01'),
                    (7,2,'NORMAL',  'Normal',         '10:00','18:00',
                     'ALL',1.00,3,'2020-01-01'),
                    (8,2,'OFF_PEAK','Off-Peak (Night)','22:00','06:00',
                     'ALL',0.50,4,'2020-01-01')
                ON CONFLICT (id) DO NOTHING
            """)
            conn.commit()
            print("done")
        else:
            print("  MSEDCL TOD slots already present")

    run_sql_file(conn, BASE / "seed_all_months.sql", "seed_all_months.sql")
    print("  Seeds complete")


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — GIL ETL
# ─────────────────────────────────────────────────────────────────────────────

def phase3_gil(conn) -> None:
    print("\n[Phase 3] GIL ETL")

    # -- Fetch reference IDs --------------------------------------------------
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM discoms WHERE code='MSEDCL'")
        msedcl_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM states WHERE code='MH'")
        mh_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM energy_source_types WHERE code='WIND'")
        wind_est = cur.fetchone()[0]
        cur.execute("SELECT id FROM energy_source_types WHERE code='SOLAR'")
        solar_est = cur.fetchone()[0]
        cur.execute("""
            SELECT slot_code, MIN(id)
            FROM tod_slot_definitions WHERE discom_id=%s
            GROUP BY slot_code
        """, (msedcl_id,))
        msedcl_slots = {r[0]: r[1] for r in cur.fetchall()}

    peak_id    = msedcl_slots["PEAK"]
    normal_id  = msedcl_slots["NORMAL"]
    offpeak_id = msedcl_slots["OFF_PEAK"]
    print(f"  MSEDCL slots: PEAK={peak_id}, NORMAL={normal_id}, "
          f"OFF_PEAK={offpeak_id}")

    # -- 3a. GIL entities -----------------------------------------------------
    with conn.cursor() as cur:

        tenant_id = upsert(cur,
            "INSERT INTO tenants "
            "(code,name,short_name,city,state_id,primary_email) "
            "VALUES ('GIL','Graphite India Limited','GIL','Mumbai',%s,"
            "'data@graphiteindia.com') "
            "ON CONFLICT (code) DO NOTHING RETURNING id",
            (mh_id,),
            "SELECT id FROM tenants WHERE code='GIL'", ())

        plant_id = upsert(cur,
            "INSERT INTO plants "
            "(tenant_id,code,name,state_id,discom_id,commissioned_on) "
            "VALUES (%s,'GIL_MH_HYBRID',"
            "'GIL Maharashtra Hybrid Plant',%s,%s,'2020-04-01') "
            "ON CONFLICT (tenant_id,code) DO NOTHING RETURNING id",
            (tenant_id, mh_id, msedcl_id),
            "SELECT id FROM plants "
            "WHERE tenant_id=%s AND code='GIL_MH_HYBRID'",
            (tenant_id,))

        wind_pes = upsert(cur,
            "INSERT INTO plant_energy_sources "
            "(plant_id,tenant_id,source_type_id,"
            " installed_capacity_kw,commissioned_on,open_access_type) "
            "VALUES (%s,%s,%s,%s,'2020-04-01','INTRA_STATE') "
            "ON CONFLICT (plant_id,source_type_id) "
            "DO UPDATE SET installed_capacity_kw=EXCLUDED.installed_capacity_kw "
            "RETURNING id",
            (plant_id, tenant_id, wind_est, WIND_CAPACITY_KW),
            "SELECT id FROM plant_energy_sources "
            "WHERE plant_id=%s AND source_type_id=%s",
            (plant_id, wind_est))

        solar_pes = upsert(cur,
            "INSERT INTO plant_energy_sources "
            "(plant_id,tenant_id,source_type_id,"
            " installed_capacity_kw,commissioned_on,open_access_type) "
            "VALUES (%s,%s,%s,%s,'2020-04-01','INTRA_STATE') "
            "ON CONFLICT (plant_id,source_type_id) "
            "DO UPDATE SET installed_capacity_kw=EXCLUDED.installed_capacity_kw "
            "RETURNING id",
            (plant_id, tenant_id, solar_est, SOLAR_CAPACITY_KW),
            "SELECT id FROM plant_energy_sources "
            "WHERE plant_id=%s AND source_type_id=%s",
            (plant_id, solar_est))

        # Wind turbines -- 10 serials in raw data (9 with yearly metrics + GIL010)
        wind_devs: dict[str, int] = {}
        for serial, code in WIND_SERIAL_TO_CODE.items():
            did = upsert(cur,
                "INSERT INTO devices "
                "(tenant_id,plant_id,plant_energy_source_id,"
                " device_code,device_type,serial_number,capacity_kw) "
                "VALUES (%s,%s,%s,%s,'TURBINE',%s,%s) "
                "ON CONFLICT (plant_id,device_code) "
                "DO UPDATE SET capacity_kw=EXCLUDED.capacity_kw "
                "RETURNING id",
                (tenant_id, plant_id, wind_pes, code, serial, TURBINE_CAPACITY_KW),
                "SELECT id FROM devices "
                "WHERE plant_id=%s AND device_code=%s",
                (plant_id, code))
            wind_devs[serial] = did

        # Solar inverters
        solar_devs: dict[str, int] = {}
        for serial, code in SOLAR_SERIAL_TO_CODE.items():
            did = upsert(cur,
                "INSERT INTO devices "
                "(tenant_id,plant_id,plant_energy_source_id,"
                " device_code,device_type,serial_number,capacity_kw) "
                "VALUES (%s,%s,%s,%s,'INVERTER',%s,%s) "
                "ON CONFLICT (plant_id,device_code) "
                "DO UPDATE SET capacity_kw=EXCLUDED.capacity_kw "
                "RETURNING id",
                (tenant_id, plant_id, solar_pes, code, serial, SOLAR_INV_CAPACITY),
                "SELECT id FROM devices "
                "WHERE plant_id=%s AND device_code=%s",
                (plant_id, code))
            solar_devs[serial] = did

        # GIL consumption unit (single self-consumption point)
        cu_id = upsert(cur,
            "INSERT INTO consumption_units "
            "(tenant_id,discom_id,code,name,state_id,"
            " tariff_category,connection_type,contract_demand_kva) "
            "VALUES (%s,%s,'GIL-MAIN','GIL Plant (Self-Consumption)',%s,"
            "'HT-2','HT',25000) "
            "ON CONFLICT (tenant_id,code) DO NOTHING RETURNING id",
            (tenant_id, msedcl_id, mh_id),
            "SELECT id FROM consumption_units "
            "WHERE tenant_id=%s AND code='GIL-MAIN'", (tenant_id,))

        for pes in (wind_pes, solar_pes):
            cur.execute(
                "INSERT INTO plant_consumption_mappings "
                "(plant_energy_source_id,consumption_unit_id,tenant_id,"
                " allocation_pct,priority_rank,effective_from) "
                "VALUES (%s,%s,%s,100,1,'2020-04-01') ON CONFLICT DO NOTHING",
                (pes, cu_id, tenant_id))

        # GIL users -- migrated verbatim from the real source
        # users_202607141235.sql (username, password_hash, email, full_name,
        # role, is_active, created_at all preserved as-is). NOTE: source
        # password_hash is SHA-256 hex, not bcrypt -- the app's auth layer
        # must account for this (or these accounts need a password reset)
        # before the hash can be used to authenticate.
        gil_users_sql = (GIL_DIR / "users_202607141235.sql").read_text(
            encoding="utf-8")
        user_rows = re.findall(
            r"\('([^']*)','([^']*)','([^']*)','([^']*)','([^']*)'"
            r"::public\.user_role_enum,(\d+),'([^']*)'\)",
            gil_users_sql)
        if not user_rows:
            sys.exit("ERROR: could not parse GIL users_*.sql -- format changed?")
        for username, pw_hash, full_name, email, role, is_active, created_at \
                in user_rows:
            # Update the earlier fabricated placeholder row for this role
            # in place (its email may differ from the real source email --
            # e.g. admin@gil.integrum.in vs the real admin@gil.com).
            # Updating in place (rather than delete+insert) keeps its id
            # stable, since chat_threads.user_id already references it.
            cur.execute(
                "UPDATE tenant_users SET "
                "  username=%s, email=%s, full_name=%s, "
                "  password_hash=%s, is_active=%s, created_at=%s "
                "WHERE tenant_id=%s AND role=%s",
                (username, email, full_name, pw_hash, is_active == "1",
                 created_at, tenant_id, role))
            if cur.rowcount == 0:
                cur.execute(
                    "INSERT INTO tenant_users "
                    "(tenant_id,username,email,full_name,role,password_hash,"
                    " is_active,created_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
                    "ON CONFLICT (email) DO UPDATE SET "
                    "  username=EXCLUDED.username, "
                    "  full_name=EXCLUDED.full_name, "
                    "  password_hash=EXCLUDED.password_hash, "
                    "  is_active=EXCLUDED.is_active, "
                    "  created_at=EXCLUDED.created_at",
                    (tenant_id, username, email, full_name, role, pw_hash,
                     is_active == "1", created_at))

        conn.commit()

    print(f"  Tenant={tenant_id}, plant={plant_id}")
    print(f"  Wind PES={wind_pes} ({WIND_CAPACITY_KW:,} kW, "
          f"{len(wind_devs)} turbines x {TURBINE_CAPACITY_KW} kW)")
    print(f"  Solar PES={solar_pes} ({SOLAR_CAPACITY_KW:,} kW, "
          f"{len(set(solar_devs.values()))} inverters x "
          f"{SOLAR_INV_CAPACITY} kW)")
    print(f"  Users: {', '.join(u[3] for u in user_rows)} (real source data)")

    # -- 3b. Staging schema ---------------------------------------------------
    print("  Creating staging schema ...")
    with conn.cursor() as cur:
        cur.execute("DROP SCHEMA IF EXISTS stg CASCADE")
        cur.execute("CREATE SCHEMA stg")

        cur.execute("""CREATE TABLE stg.wind_generation(
            plant_id INT, serial_number TEXT, generation_date DATE,
            generation_time TIME, generation_value DECIMAL(14,4),
            generation_before_losses DECIMAL(14,4), created_at TIMESTAMP)""")

        cur.execute("""CREATE TABLE stg.solar_generation(
            plant_id INT, serial_number TEXT, generation_date DATE,
            generation_time TIME, generation_value DECIMAL(14,4),
            generation_before_losses DECIMAL(14,4), created_at TIMESTAMP)""")

        cur.execute("""CREATE TABLE stg.consumption_data(
            consumption_date DATE, consumption_time TIME,
            consumption_value DECIMAL(14,4), created_at TIMESTAMP)""")

        cur.execute("""CREATE TABLE stg.gil_tod_daily(
            summary_date DATE, tod_slot TEXT,
            generation_value DECIMAL(14,4),
            allocated_consumption DECIMAL(14,4),
            matched_settlement DECIMAL(14,4),
            surplus_demand DECIMAL(14,4),
            surplus_generation DECIMAL(14,4),
            surplus_gen_with_banking DECIMAL(14,4),
            slot_total_consumption DECIMAL(14,4),
            matched_settlement_daily_tod DECIMAL(14,4),
            surplus_gen_daily_tod DECIMAL(14,4),
            surplus_demand_daily_tod DECIMAL(14,4),
            created_at TIMESTAMP)""")

        cur.execute("""CREATE TABLE stg.gil_banking(
            settlement_month TEXT, tod_slot TEXT,
            generation_value DECIMAL(16,4),
            allocated_consumption DECIMAL(16,4),
            matched_settlement DECIMAL(16,4),
            surplus_demand DECIMAL(16,4),
            surplus_generation DECIMAL(16,4),
            surplus_gen_with_banking DECIMAL(16,4),
            slot_total_consumption DECIMAL(16,4),
            matched_settlement_daily_tod DECIMAL(16,4),
            surplus_gen_daily_tod DECIMAL(16,4),
            surplus_demand_daily_tod DECIMAL(16,4),
            matched_settlement_intra_monthly DECIMAL(16,4),
            surplus_gen_intra_monthly DECIMAL(16,4),
            surplus_demand_intra_monthly DECIMAL(16,4),
            created_at TIMESTAMP)""")

        cur.execute("""CREATE TABLE stg.gil_savings(
            settlement_month DATE, total_consumption DECIMAL(16,4),
            grid_cost DECIMAL(16,4),
            actual_cost_with_banking DECIMAL(16,4),
            savings_with_banking DECIMAL(16,4),
            savings_pct_with_banking DECIMAL(10,4),
            actual_cost_without_banking DECIMAL(16,4),
            savings_without_banking DECIMAL(16,4),
            savings_pct_without_banking DECIMAL(10,4),
            created_at TIMESTAMP)""")

        cur.execute("""CREATE TABLE stg.perf_metrics(
            year TEXT,
            generation_turbine_level DECIMAL(18,4),
            plf_wind_percent DECIMAL(8,4),
            realised_kwh_cap_consumption_wind DECIMAL(18,4),
            sale_of_energy DECIMAL(18,4),
            over_injection DECIMAL(18,4),
            solar_generation DECIMAL(18,4),
            plf_solar_percent DECIMAL(8,4),
            realised_kwh_cap_consumption_solar DECIMAL(18,4),
            total_plant_consumption DECIMAL(18,4),
            total_re_consumption_capex DECIMAL(18,4),
            re_percent_capex DECIMAL(8,4),
            total_re_consumption_tpa DECIMAL(18,4),
            re_percent_tpa DECIMAL(8,4),
            total_re_percent DECIMAL(8,4),
            actual_losses_sale_of_energy DECIMAL(18,4),
            actual_losses_realised_kwh_cap_consumption_wind DECIMAL(18,4),
            actual_losses_solar_generation DECIMAL(18,4),
            actual_losses_realised_kwh_cap_consumption_solar DECIMAL(18,4),
            losses_without_over_injection_realised_kwh_cap_consumption
                DECIMAL(18,4),
            losses_without_over_injection_percent DECIMAL(8,4),
            banking_loss_percent_wind DECIMAL(8,4),
            banking_loss_percent_solar DECIMAL(8,4),
            created_at TIMESTAMP)""")

        cur.execute("""CREATE TABLE stg.wtg_yearly(
            year TEXT, wtg TEXT,
            generation_turbine_level DECIMAL(18,4),
            created_at TIMESTAMP)""")

        cur.execute("""CREATE TABLE stg.settlement_matching(
            settlement_date DATE, settlement_time TIME,
            plant_id INT, serial_number TEXT, generation_type TEXT,
            generation_value DECIMAL(14,4),
            generation_before_losses DECIMAL(14,4),
            slot_total_consumption DECIMAL(14,4),
            allocated_consumption DECIMAL(14,4),
            surplus_generation DECIMAL(14,4),
            surplus_gen_with_banking DECIMAL(14,4),
            matched_settlement DECIMAL(14,4),
            created_at TIMESTAMP)""")

        cur.execute("""CREATE TABLE stg.chat_history(
            thread_id TEXT, role TEXT, content TEXT,
            timestamp TIMESTAMPTZ)""")

        cur.execute("""CREATE TABLE stg.upload_tracking(
            "year" INT, "month" TEXT, no_of_st INT, no_of_mt INT,
            gen_pdf_name TEXT, con_pdf_name TEXT,
            grid_excel_name TEXT, ws_excel_name TEXT,
            status TEXT, error_message TEXT,
            uploaded_by TEXT,
            created_at TIMESTAMP, updated_at TIMESTAMP)""")

        # Device-serial lookup used in generation INSERTs
        cur.execute("""CREATE TABLE stg.dev_lookup(
            serial TEXT PRIMARY KEY, device_id INT, pes_id INT)""")
        rows = ([(s, did, wind_pes) for s, did in wind_devs.items()] +
                [(s, did, solar_pes) for s, did in solar_devs.items()])
        execute_values(cur, "INSERT INTO stg.dev_lookup VALUES %s", rows)
        conn.commit()

    # -- 3c. Load SQL files into staging --------------------------------------
    load_to_staging(conn,
        GIL_DIR / "wind_generation_202607141235.sql",
        "wind_generation")
    load_to_staging(conn,
        GIL_DIR / "solar_generation_202607141233.sql",
        "solar_generation")
    load_to_staging(conn,
        GIL_DIR / "consumption_data_202607141230.sql",
        "consumption_data")
    load_to_staging(conn,
        GIL_DIR / "tod_daily_summary_202607141233.sql",
        "gil_tod_daily", pub_table="tod_daily_summary")
    load_to_staging(conn,
        GIL_DIR / "monthly_banking_settlement_202607141232.sql",
        "gil_banking", pub_table="monthly_banking_settlement")
    load_to_staging(conn,
        GIL_DIR / "savings_summary_202607141232.sql",
        "gil_savings", pub_table="savings_summary")
    load_to_staging(conn,
        GIL_DIR / "performance_metrics_202607141232.sql",
        "perf_metrics", pub_table="performance_metrics")
    load_to_staging(conn,
        GIL_DIR / "wind_turbine_yearly_metrics_202607141238.sql",
        "wtg_yearly", pub_table="wind_turbine_yearly_metrics")
    load_to_staging(conn,
        GIL_DIR / "settlement_matching_202607141232.sql",
        "settlement_matching")
    load_to_staging(conn,
        GIL_DIR / "chat_history_202607141230.sql",
        "chat_history")
    load_to_staging(conn,
        GIL_DIR / "upload_tracking_202607141234.sql",
        "upload_tracking")

    # -- 3d. Transform staging -> Schema v2 -----------------------------------
    with conn.cursor() as cur:

        # generation_readings -- WIND (Apr 2025 - Apr 2026)
        print("  > generation_readings (WIND) ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM generation_readings "
            "WHERE tenant_id=%s AND source_type_id=%s",
            (tenant_id, wind_est))
        cur.execute(f"""
            INSERT INTO generation_readings
                (tenant_id, plant_id, plant_energy_source_id, device_id,
                 source_type_id, slot_start_time, slot_end_time,
                 generation_kwh, generation_before_losses_kwh,
                 loss_pct, is_estimated, data_source)
            SELECT {tenant_id},{plant_id},{wind_pes},dl.device_id,{wind_est},
                (wg.generation_date + wg.generation_time
                 - INTERVAL '15 min') AT TIME ZONE 'Asia/Kolkata',
                (wg.generation_date + wg.generation_time
                 ) AT TIME ZONE 'Asia/Kolkata',
                wg.generation_value,
                wg.generation_before_losses,
                CASE WHEN wg.generation_before_losses > 0 THEN
                    ROUND((wg.generation_before_losses - wg.generation_value)
                          / wg.generation_before_losses * 100, 4)
                END,
                FALSE, 'IMPORT'
            FROM stg.wind_generation wg
            JOIN stg.dev_lookup dl ON dl.serial = wg.serial_number
        """)
        print(f"{cur.rowcount:,} rows")
        conn.commit()

        # generation_readings -- SOLAR (Apr - Dec 2025)
        print("  > generation_readings (SOLAR) ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM generation_readings "
            "WHERE tenant_id=%s AND source_type_id=%s",
            (tenant_id, solar_est))
        cur.execute(f"""
            INSERT INTO generation_readings
                (tenant_id, plant_id, plant_energy_source_id, device_id,
                 source_type_id, slot_start_time, slot_end_time,
                 generation_kwh, generation_before_losses_kwh,
                 loss_pct, is_estimated, data_source)
            SELECT {tenant_id},{plant_id},{solar_pes},dl.device_id,{solar_est},
                (sg.generation_date + sg.generation_time
                 - INTERVAL '15 min') AT TIME ZONE 'Asia/Kolkata',
                (sg.generation_date + sg.generation_time
                 ) AT TIME ZONE 'Asia/Kolkata',
                sg.generation_value,
                sg.generation_before_losses,
                CASE WHEN sg.generation_before_losses > 0 THEN
                    ROUND((sg.generation_before_losses - sg.generation_value)
                          / sg.generation_before_losses * 100, 4)
                END,
                FALSE, 'IMPORT'
            FROM stg.solar_generation sg
            JOIN stg.dev_lookup dl ON dl.serial = sg.serial_number
        """)
        print(f"{cur.rowcount:,} rows")
        conn.commit()

        # consumption_readings (Apr - Dec 2025)
        print("  > consumption_readings ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM consumption_readings WHERE tenant_id=%s",
            (tenant_id,))
        cur.execute(f"""
            INSERT INTO consumption_readings
                (tenant_id, consumption_unit_id,
                 slot_start_time, slot_end_time,
                 consumption_kwh, is_estimated, data_source)
            SELECT {tenant_id},{cu_id},
                (consumption_date + consumption_time
                 - INTERVAL '15 min') AT TIME ZONE 'Asia/Kolkata',
                (consumption_date + consumption_time
                 ) AT TIME ZONE 'Asia/Kolkata',
                consumption_value, FALSE, 'IMPORT'
            FROM stg.consumption_data
        """)
        print(f"{cur.rowcount:,} rows")
        conn.commit()

        # tod_daily_summary -- GIL (Apr 2025 - Apr 2026)
        print("  > tod_daily_summary (GIL) ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM tod_daily_summary WHERE tenant_id=%s", (tenant_id,))
        cur.execute(f"""
            INSERT INTO tod_daily_summary
                (tenant_id, plant_energy_source_id, consumption_unit_id,
                 date, tod_slot_id,
                 generation_kwh, consumption_kwh,
                 direct_matched_kwh, banking_utilised_kwh,
                 total_matched_kwh, surplus_kwh, lapsed_kwh, grid_drawl_kwh)
            SELECT {tenant_id},{wind_pes},NULL,
                summary_date,
                CASE tod_slot
                    WHEN 'peak'     THEN {peak_id}
                    WHEN 'normal'   THEN {normal_id}
                    WHEN 'off-peak' THEN {offpeak_id}
                END,
                generation_value,
                slot_total_consumption,
                matched_settlement_daily_tod,
                GREATEST(0, matched_settlement - matched_settlement_daily_tod),
                matched_settlement,
                surplus_gen_daily_tod,
                0,
                surplus_demand_daily_tod
            FROM stg.gil_tod_daily
            WHERE tod_slot IN ('peak','normal','off-peak')
            ON CONFLICT DO NOTHING
        """)
        print(f"{cur.rowcount:,} rows")
        conn.commit()

        # monthly_banking_settlement -- GIL (Apr 2025 - Apr 2026)
        print("  > monthly_banking_settlement (GIL) ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM monthly_banking_settlement WHERE tenant_id=%s",
            (tenant_id,))
        # Per-slot rows
        cur.execute(f"""
            INSERT INTO monthly_banking_settlement
                (tenant_id, plant_energy_source_id, consumption_unit_id,
                 month, tod_slot_id,
                 net_generation_kwh, gross_generation_kwh,
                 total_consumption_kwh,
                 direct_matched_kwh, banking_utilised_kwh,
                 intra_month_banking_kwh, total_matched_kwh,
                 surplus_before_banking_kwh, surplus_lapsed_kwh,
                 unmet_demand_kwh, replacement_pct, match_rate_pct)
            SELECT {tenant_id},{wind_pes},{cu_id},
                (settlement_month||'-01')::DATE,
                CASE tod_slot
                    WHEN 'peak'     THEN {peak_id}
                    WHEN 'normal'   THEN {normal_id}
                    WHEN 'off-peak' THEN {offpeak_id}
                END,
                generation_value, generation_value,
                slot_total_consumption,
                matched_settlement_daily_tod,
                GREATEST(0, matched_settlement - matched_settlement_daily_tod),
                matched_settlement_intra_monthly,
                matched_settlement,
                surplus_generation,
                surplus_gen_with_banking,
                surplus_demand,
                CASE WHEN slot_total_consumption > 0 THEN
                    ROUND(matched_settlement / slot_total_consumption * 100, 4)
                END,
                CASE WHEN generation_value > 0 THEN
                    ROUND(matched_settlement / generation_value * 100, 4)
                END
            FROM stg.gil_banking
            WHERE tod_slot IN ('peak','normal','off-peak')
            ON CONFLICT DO NOTHING
        """)
        slot_rows = cur.rowcount
        # Aggregate row per month (tod_slot_id = NULL)
        cur.execute(f"""
            INSERT INTO monthly_banking_settlement
                (tenant_id, plant_energy_source_id, consumption_unit_id,
                 month, tod_slot_id,
                 net_generation_kwh, gross_generation_kwh,
                 total_consumption_kwh,
                 direct_matched_kwh, banking_utilised_kwh,
                 intra_month_banking_kwh, total_matched_kwh,
                 surplus_before_banking_kwh, surplus_lapsed_kwh,
                 unmet_demand_kwh, replacement_pct, match_rate_pct)
            SELECT {tenant_id},{wind_pes},{cu_id},
                (settlement_month||'-01')::DATE, NULL,
                SUM(generation_value), SUM(generation_value),
                SUM(slot_total_consumption),
                SUM(matched_settlement_daily_tod),
                SUM(GREATEST(0,matched_settlement-matched_settlement_daily_tod)),
                SUM(matched_settlement_intra_monthly),
                SUM(matched_settlement),
                SUM(surplus_generation),
                SUM(surplus_gen_with_banking),
                SUM(surplus_demand),
                CASE WHEN SUM(slot_total_consumption) > 0 THEN
                    ROUND(SUM(matched_settlement)
                          / SUM(slot_total_consumption) * 100, 4)
                END,
                CASE WHEN SUM(generation_value) > 0 THEN
                    ROUND(SUM(matched_settlement)
                          / SUM(generation_value) * 100, 4)
                END
            FROM stg.gil_banking
            WHERE tod_slot IN ('peak','normal','off-peak')
            GROUP BY settlement_month
            ON CONFLICT DO NOTHING
        """)
        print(f"{slot_rows} slot + {cur.rowcount} aggregate rows")
        conn.commit()

        # savings_summary -- GIL
        print("  > savings_summary (GIL) ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM savings_summary WHERE tenant_id=%s", (tenant_id,))
        # Real Aug 2025 row from the savings_summary SQL file
        cur.execute(f"""
            INSERT INTO savings_summary
                (tenant_id, plant_energy_source_id, consumption_unit_id,
                 month,
                 grid_cost_without_re, cost_with_banking,
                 cost_without_banking,
                 savings_with_banking, savings_without_banking,
                 savings_amount_inr, savings_pct,
                 grid_rate_per_unit,
                 total_consumption_kwh, total_matched_kwh, replacement_pct)
            SELECT {tenant_id},{wind_pes},{cu_id},
                settlement_month,
                grid_cost,
                actual_cost_with_banking, actual_cost_without_banking,
                savings_with_banking, savings_without_banking,
                savings_with_banking,
                CASE WHEN grid_cost > 0 THEN
                    ROUND(savings_with_banking / grid_cost * 100, 4)
                END,
                {MSEDCL_GRID_RATE},
                total_consumption,
                ROUND(total_consumption * savings_pct_with_banking / 100, 4),
                savings_pct_with_banking
            FROM stg.gil_savings
            ON CONFLICT DO NOTHING
        """)
        real_rows = cur.rowcount
        # Derived rows for all other months from banking settlement aggregates
        cur.execute(f"""
            INSERT INTO savings_summary
                (tenant_id, plant_energy_source_id, consumption_unit_id,
                 month,
                 grid_cost_without_re, re_cost, actual_cost_with_re,
                 cost_with_banking, cost_without_banking,
                 savings_with_banking, savings_without_banking,
                 savings_amount_inr, savings_pct,
                 effective_rate_per_unit, grid_rate_per_unit,
                 total_generation_kwh, total_consumption_kwh,
                 total_matched_kwh, replacement_pct)
            SELECT {tenant_id},{wind_pes},{cu_id},
                m.month,
                ROUND(m.total_consumption_kwh * {MSEDCL_GRID_RATE}, 2),
                ROUND(m.total_matched_kwh * {GIL_PPA_RATE}, 2),
                ROUND((m.total_consumption_kwh - m.total_matched_kwh)
                      * {MSEDCL_GRID_RATE}
                      + m.total_matched_kwh * {GIL_PPA_RATE}, 2),
                ROUND((m.total_consumption_kwh - m.total_matched_kwh)
                      * {MSEDCL_GRID_RATE}
                      + m.total_matched_kwh * {GIL_PPA_RATE}, 2),
                ROUND((m.total_consumption_kwh - m.direct_matched_kwh)
                      * {MSEDCL_GRID_RATE}
                      + m.direct_matched_kwh * {GIL_PPA_RATE}, 2),
                ROUND(m.total_consumption_kwh * {MSEDCL_GRID_RATE}
                      - ((m.total_consumption_kwh - m.total_matched_kwh)
                         * {MSEDCL_GRID_RATE}
                         + m.total_matched_kwh * {GIL_PPA_RATE}), 2),
                ROUND(m.total_consumption_kwh * {MSEDCL_GRID_RATE}
                      - ((m.total_consumption_kwh - m.direct_matched_kwh)
                         * {MSEDCL_GRID_RATE}
                         + m.direct_matched_kwh * {GIL_PPA_RATE}), 2),
                ROUND(m.total_consumption_kwh * {MSEDCL_GRID_RATE}
                      - ((m.total_consumption_kwh - m.total_matched_kwh)
                         * {MSEDCL_GRID_RATE}
                         + m.total_matched_kwh * {GIL_PPA_RATE}), 2),
                CASE WHEN m.total_consumption_kwh * {MSEDCL_GRID_RATE} > 0 THEN
                    ROUND((m.total_consumption_kwh * {MSEDCL_GRID_RATE}
                           - ((m.total_consumption_kwh - m.total_matched_kwh)
                              * {MSEDCL_GRID_RATE}
                              + m.total_matched_kwh * {GIL_PPA_RATE}))
                          / (m.total_consumption_kwh * {MSEDCL_GRID_RATE})
                          * 100, 4)
                END,
                CASE WHEN m.total_consumption_kwh > 0 THEN
                    ROUND(((m.total_consumption_kwh - m.total_matched_kwh)
                           * {MSEDCL_GRID_RATE}
                           + m.total_matched_kwh * {GIL_PPA_RATE})
                          / m.total_consumption_kwh, 4)
                END,
                {MSEDCL_GRID_RATE},
                m.net_generation_kwh,
                m.total_consumption_kwh,
                m.total_matched_kwh,
                m.replacement_pct
            FROM monthly_banking_settlement m
            WHERE m.tenant_id = {tenant_id}
              AND m.plant_energy_source_id = {wind_pes}
              AND m.tod_slot_id IS NULL
              AND m.month NOT IN (
                  SELECT month FROM savings_summary
                  WHERE tenant_id = {tenant_id})
            ON CONFLICT DO NOTHING
        """)
        print(f"{real_rows} real + {cur.rowcount} derived rows")
        conn.commit()

        # performance_metrics -- GIL (FY 2025-2026)
        print("  > performance_metrics (GIL) ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM performance_metrics WHERE tenant_id=%s", (tenant_id,))
        cur.execute(f"""
            INSERT INTO performance_metrics
                (tenant_id, plant_energy_source_id, financial_year,
                 gross_generation_kwh, net_generation_kwh,
                 generation_losses_kwh, plf_pct,
                 realised_cap_consumption_kwh, over_injection_kwh,
                 sale_of_energy_kwh,
                 total_plant_consumption_kwh, total_re_consumption_kwh,
                 replacement_pct,
                 total_re_consumption_tpa_kwh, re_percent_tpa,
                 actual_losses_sale_of_energy_kwh,
                 losses_excl_over_injection_kwh, losses_excl_over_injection_pct,
                 banking_loss_pct)
            SELECT {tenant_id},{wind_pes}, year,
                generation_turbine_level,
                generation_turbine_level
                    - COALESCE(actual_losses_realised_kwh_cap_consumption_wind, 0),
                COALESCE(actual_losses_realised_kwh_cap_consumption_wind, 0),
                plf_wind_percent,
                realised_kwh_cap_consumption_wind,
                over_injection, sale_of_energy,
                total_plant_consumption,
                total_re_consumption_capex, total_re_percent,
                total_re_consumption_tpa, re_percent_tpa,
                actual_losses_sale_of_energy,
                losses_without_over_injection_realised_kwh_cap_consumption,
                losses_without_over_injection_percent,
                banking_loss_percent_wind
            FROM stg.perf_metrics ON CONFLICT DO NOTHING
        """)
        cur.execute(f"""
            INSERT INTO performance_metrics
                (tenant_id, plant_energy_source_id, financial_year,
                 gross_generation_kwh, net_generation_kwh,
                 generation_losses_kwh, plf_pct,
                 realised_cap_consumption_kwh, over_injection_kwh,
                 sale_of_energy_kwh,
                 total_plant_consumption_kwh, total_re_consumption_kwh,
                 replacement_pct,
                 total_re_consumption_tpa_kwh, re_percent_tpa,
                 banking_loss_pct)
            SELECT {tenant_id},{solar_pes}, year,
                solar_generation,
                solar_generation
                    - COALESCE(actual_losses_solar_generation, 0),
                COALESCE(actual_losses_solar_generation, 0),
                plf_solar_percent,
                realised_kwh_cap_consumption_solar,
                0, 0,
                total_plant_consumption,
                total_re_consumption_capex, total_re_percent,
                total_re_consumption_tpa, re_percent_tpa,
                banking_loss_percent_solar
            FROM stg.perf_metrics ON CONFLICT DO NOTHING
        """)
        print("2 rows (WIND + SOLAR)")
        conn.commit()

        # device_yearly_metrics -- GIL wind turbines
        print("  > device_yearly_metrics (GIL) ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM device_yearly_metrics WHERE tenant_id=%s",
            (tenant_id,))
        cur.execute(
            "SELECT device_code,id FROM devices "
            "WHERE tenant_id=%s AND device_type='TURBINE'",
            (tenant_id,))
        code_to_did = {r[0]: r[1] for r in cur.fetchall()}
        for code, did in code_to_did.items():
            cur.execute(f"""
                INSERT INTO device_yearly_metrics
                    (tenant_id, device_id, financial_year,
                     generation_kwh, plf_pct)
                SELECT {tenant_id},{did}, year,
                    generation_turbine_level,
                    ROUND(generation_turbine_level
                          / ({TURBINE_CAPACITY_KW} * 8760) * 100, 2)
                FROM stg.wtg_yearly WHERE wtg = %s
                ON CONFLICT DO NOTHING
            """, (code,))
        print(f"{len(code_to_did)} turbines")
        conn.commit()

        # settlement_slots -- GIL (~432,800 rows, largest table)
        print("  > settlement_slots (GIL) ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM settlement_slots WHERE tenant_id=%s", (tenant_id,))
        cur.execute(f"""
            INSERT INTO settlement_slots
                (tenant_id, plant_energy_source_id, consumption_unit_id,
                 slot_start_time, tod_slot_id,
                 generation_kwh, generation_losses_kwh, net_generation_kwh,
                 consumption_kwh, direct_matched_kwh, total_matched_kwh,
                 surplus_kwh, lapsed_kwh, grid_drawl_kwh)
            SELECT {tenant_id},
                CASE generation_type
                    WHEN 'WIND'  THEN {wind_pes}
                    ELSE              {solar_pes}
                END,
                {cu_id},
                (settlement_date + settlement_time
                 - INTERVAL '15 min') AT TIME ZONE 'Asia/Kolkata',
                CASE
                    WHEN settlement_time >= '06:00'
                     AND settlement_time <  '10:00' THEN {peak_id}
                    WHEN settlement_time >= '10:00'
                     AND settlement_time <  '18:00' THEN {normal_id}
                    WHEN settlement_time >= '18:00'
                     AND settlement_time <  '22:00' THEN {peak_id}
                    ELSE {offpeak_id}
                END,
                generation_value,
                GREATEST(0, generation_before_losses - generation_value),
                generation_value,
                allocated_consumption,
                matched_settlement,
                matched_settlement,
                surplus_generation,
                0,
                GREATEST(0, allocated_consumption - matched_settlement)
            FROM stg.settlement_matching
            WHERE generation_type IN ('WIND','SOLAR')
        """)
        print(f"{cur.rowcount:,} rows")
        conn.commit()

        # chat_threads + chat_messages -- one thread per distinct source
        # thread_id (source has 8 real conversations; collapsing them into
        # one would lose the original conversation boundaries).
        # Source has no user column -- link all history to GIL admin user.
        print("  > chat history ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM chat_threads WHERE tenant_id=%s", (tenant_id,))
        cur.execute(
            "SELECT id FROM tenant_users "
            "WHERE tenant_id=%s AND role='ADMIN' LIMIT 1",
            (tenant_id,))
        admin_uid = cur.fetchone()[0]
        cur.execute(
            "SELECT DISTINCT thread_id FROM stg.chat_history ORDER BY thread_id")
        source_thread_ids = [r[0] for r in cur.fetchall()]
        msg_count = 0
        for src_thread_id in source_thread_ids:
            cur.execute(
                "SELECT MIN(timestamp), MAX(timestamp) FROM stg.chat_history "
                "WHERE thread_id=%s", (src_thread_id,))
            earliest, latest = cur.fetchone()
            cur.execute(
                "SELECT content FROM stg.chat_history "
                "WHERE thread_id=%s AND role='user' ORDER BY timestamp LIMIT 1",
                (src_thread_id,))
            first_msg = cur.fetchone()
            title = (first_msg[0][:100] if first_msg
                      else f"GIL Chat {src_thread_id}")
            cur.execute("""
                INSERT INTO chat_threads
                    (tenant_id, user_id, title, created_at, updated_at)
                VALUES (%s,%s,%s,%s,%s)
                RETURNING id
            """, (tenant_id, admin_uid, title, earliest, latest))
            thread_uuid = str(cur.fetchone()[0])
            cur.execute("""
                INSERT INTO chat_messages
                    (thread_id, tenant_id, role, content, created_at)
                SELECT %s,%s, role, content, timestamp
                FROM stg.chat_history WHERE thread_id=%s ORDER BY timestamp
            """, (thread_uuid, tenant_id, src_thread_id))
            msg_count += cur.rowcount
        print(f"{len(source_thread_ids)} threads, {msg_count} messages")
        conn.commit()

        # upload_tracking -> data_ingestion_logs
        print("  > data_ingestion_logs (upload_tracking) ... ",
              end="", flush=True)
        cur.execute(f"""
            INSERT INTO data_ingestion_logs
                (tenant_id, source_system, table_name, file_name,
                 records_processed, status,
                 period_from, period_to, started_at, completed_at)
            SELECT
                {tenant_id},
                'GIL_MANUAL',
                'settlement_matching',
                CONCAT_WS(', ',
                    gen_pdf_name, con_pdf_name,
                    grid_excel_name, ws_excel_name),
                COALESCE(no_of_st,0) + COALESCE(no_of_mt,0),
                CASE status
                    WHEN 'COMPLETED' THEN 'SUCCESS'
                    WHEN 'FAILED'    THEN 'FAILED'
                    ELSE 'PARTIAL'
                END,
                DATE_TRUNC('month',
                    TO_DATE("year"::TEXT||'-'||"month", 'YYYY-Mon'))::DATE,
                (DATE_TRUNC('month',
                    TO_DATE("year"::TEXT||'-'||"month", 'YYYY-Mon'))
                 + INTERVAL '1 month - 1 day')::DATE,
                created_at, updated_at
            FROM stg.upload_tracking
        """)
        print(f"{cur.rowcount} rows")
        conn.commit()

        cur.execute("DROP SCHEMA stg CASCADE")
        conn.commit()

    print("  GIL ETL complete")


# ─────────────────────────────────────────────────────────────────────────────
# Phase 4 -- C9 ETL
# ─────────────────────────────────────────────────────────────────────────────

def phase4_c9(conn) -> None:
    print("\n[Phase 4] C9 ETL")

    with conn.cursor() as cur:
        cur.execute("SELECT id FROM discoms WHERE code='BESCOM'")
        bescom_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM energy_source_types WHERE code='SOLAR'")
        solar_est = cur.fetchone()[0]
        cur.execute(
            "SELECT slot_code,id FROM tod_slot_definitions WHERE discom_id=%s",
            (bescom_id,))
        bescom_slots = {r[0]: r[1] for r in cur.fetchall()}
        cur.execute(
            "SELECT code,id FROM consumption_units WHERE tenant_id=%s",
            (C9_TENANT_ID,))
        cu_by_code = {r[0]: r[1] for r in cur.fetchall()}
        cur.execute("""
            SELECT pes.id FROM plant_energy_sources pes
            JOIN plants p ON p.id = pes.plant_id
            WHERE p.tenant_id=%s AND pes.source_type_id=%s
        """, (C9_TENANT_ID, solar_est))
        row = cur.fetchone()
        c9_pes = row[0] if row else None

    if not c9_pes:
        print("  WARN: C9 PES not found (seed may not have run). "
              "Skipping C9 ETL.")
        return

    print(f"  C9: bescom={bescom_id}, pes={c9_pes}, "
          f"{len(cu_by_code)} consumption units")

    # -- 4a. Staging schema ---------------------------------------------------
    print("  Creating staging schema ...")
    with conn.cursor() as cur:
        cur.execute("DROP SCHEMA IF EXISTS stg CASCADE")
        cur.execute("CREATE SCHEMA stg")

        cur.execute("""CREATE TABLE stg.discom_bill(
            bill_header TEXT, unit TEXT, month_year TEXT, tariff TEXT,
            total_consumption TEXT,
            cost_without_solar DECIMAL(16,4),
            cost_with_solar_wheeling DECIMAL(16,4),
            discom_bill DECIMAL(16,4), savings DECIMAL(16,4))""")

        cur.execute("""CREATE TABLE stg.hourly_gen(
            "date" DATE, "time" TIME, unit TEXT, tod_slot TEXT,
            consumption DECIMAL(14,4),
            supplied_generation DECIMAL(14,4))""")

        cur.execute("""CREATE TABLE stg.banking_v2(
            "month" TEXT, unit TEXT, consumption DECIMAL(16,4),
            supplied_generation DECIMAL(16,4),
            surplus_generation DECIMAL(16,4),
            surplus_demand DECIMAL(16,4),
            matched_settlement DECIMAL(16,4),
            settlement_with_banking DECIMAL(16,4),
            surplus_generation_after_banking DECIMAL(16,4),
            surplus_demand_after_banking DECIMAL(16,4))""")

        cur.execute("""CREATE TABLE stg.savings_v3(
            "month" TEXT, unit TEXT, consumption DECIMAL(16,4),
            grid_cost DECIMAL(16,4),
            grid_consumption_with_banking DECIMAL(16,4),
            actual_cost_with_banking DECIMAL(16,4),
            savings_with_banking DECIMAL(16,4),
            savings_pct_with_banking DECIMAL(10,4),
            actual_cost_without_banking DECIMAL(16,4),
            savings_without_banking DECIMAL(16,4),
            savings_pct_without_banking DECIMAL(10,4),
            total_grid_consumption_after_banking DECIMAL(16,4),
            total_cost_after_banking DECIMAL(16,4),
            total_savings_after_banking DECIMAL(16,4),
            total_savings_pct_after_banking DECIMAL(10,4))""")

        cur.execute("""CREATE TABLE stg.effective_rate(
            billing_month TEXT, location_code TEXT,
            total_units_consumed DECIMAL(16,4),
            total_electricity_bill DECIMAL(16,4),
            total_demand_charges DECIMAL(16,4),
            effective_rate DECIMAL(10,4),
            effective_rate_excl_demand DECIMAL(10,4),
            created_at TIMESTAMP, updated_at TIMESTAMP)""")

        conn.commit()

    # -- 4b. Load SQL files ---------------------------------------------------
    load_to_staging(conn,
        C9_DIR / "discom_bill_v2_202607141202.sql",
        "discom_bill", pub_table="discom_bill_v2")
    load_to_staging(conn,
        C9_DIR / "hourly_gen_con2_v2_202607141203.sql",
        "hourly_gen", pub_table="hourly_gen_con2_v2")
    load_to_staging(conn,
        C9_DIR / "monthly_banking_settlement_data_v2_202607141226.sql",
        "banking_v2", pub_table="monthly_banking_settlement_data_v2")
    load_to_staging(conn,
        C9_DIR / "monthly_savings_v3_202607141227.sql",
        "savings_v3", pub_table="monthly_savings_v3")
    load_to_staging(conn,
        C9_DIR / "effective_rate_summary_202607141202.sql",
        "effective_rate", pub_table="effective_rate_summary")

    with conn.cursor() as cur:

        # -- grid_bill_headers + line items (Aug-Nov 2025) -------------------
        print("  > grid_bill_headers (C9) ... ", end="", flush=True)
        cur.execute(
            "DELETE FROM grid_bill_headers "
            "WHERE tenant_id=%s AND billing_period_from >= '2025-08-01' "
            "AND billing_period_from < '2025-12-01'", (C9_TENANT_ID,))
        cur.execute(f"""
            INSERT INTO grid_bill_headers
                (tenant_id, consumption_unit_id, discom_id,
                 bill_date, billing_period_from, billing_period_to,
                 total_units_kwh, gross_amount_inr,
                 net_payable_inr, savings_inr, bill_source)
            SELECT {C9_TENANT_ID}, cu.id, {bescom_id},
                (db.month_year||'-01')::DATE
                    + INTERVAL '1 month' - INTERVAL '1 day',
                (db.month_year||'-01')::DATE,
                (db.month_year||'-01')::DATE
                    + INTERVAL '1 month' - INTERVAL '1 day',
                NULLIF(NULLIF(tc.total_consumption,''),'-')::DECIMAL,
                db.cost_without_solar, db.discom_bill, db.savings, 'IMPORT'
            FROM stg.discom_bill db
            JOIN consumption_units cu
                ON  cu.tenant_id = {C9_TENANT_ID}
                AND cu.code = TRIM(REGEXP_REPLACE(
                    SUBSTRING(db.unit FROM '\\(([^)]+)\\)$'),
                    '[\\(\\)]', '', 'g'))
            LEFT JOIN stg.discom_bill tc
                ON  tc.bill_header = 'Total Consumption'
                AND tc.unit = db.unit
                AND tc.month_year = db.month_year
            WHERE db.bill_header = 'Net Payable'
            ON CONFLICT (tenant_id,consumption_unit_id,billing_period_from)
            DO NOTHING
        """)
        hdr_count = cur.rowcount
        conn.commit()

        cur.execute(f"""
            INSERT INTO grid_bill_line_items
                (bill_header_id, charge_head_id,
                 units_kwh, demand_kva, rate,
                 amount_without_re, amount_with_re,
                 savings_inr, is_credit)
            SELECT gbh.id,
                CASE db.bill_header
                    WHEN 'Wheeling Energy'
                        THEN 7
                    WHEN 'Energy Charges'
                        THEN 1
                    WHEN 'Demand Charges – Fixed'
                        THEN 2
                    WHEN 'Fuel Cost Adjustment Charges - Fixed'
                        THEN 3
                    WHEN 'Tax – Fixed'
                        THEN 4
                    WHEN 'P&G Surcharge – Fixed'
                        THEN 5
                    WHEN 'Manual Wheeling Energy Charge - Fixed'
                        THEN 6
                    WHEN 'Manual Energy Charges – Fixed ( Wheeling)'
                        THEN 8
                END,
                NULLIF(NULLIF(db.total_consumption,''),'-')::DECIMAL,
                CASE WHEN db.bill_header = 'Demand Charges – Fixed'
                     THEN NULLIF(NULLIF(db.total_consumption,''),'-')::DECIMAL END,
                NULLIF(db.tariff,'-')::DECIMAL,
                NULLIF(db.cost_without_solar, 0),
                db.discom_bill,
                NULLIF(db.savings, 0),
                FALSE
            FROM stg.discom_bill db
            JOIN consumption_units cu
                ON  cu.tenant_id = {C9_TENANT_ID}
                AND cu.code = TRIM(REGEXP_REPLACE(
                    SUBSTRING(db.unit FROM '\\(([^)]+)\\)$'),
                    '[\\(\\)]', '', 'g'))
            JOIN grid_bill_headers gbh
                ON  gbh.tenant_id = {C9_TENANT_ID}
                AND gbh.consumption_unit_id = cu.id
                AND gbh.billing_period_from = (db.month_year||'-01')::DATE
            WHERE db.bill_header NOT IN ('Total Consumption','Net Payable')
              AND db.bill_header IN (
                'Wheeling Energy',
                'Energy Charges',
                'Demand Charges – Fixed',
                'Fuel Cost Adjustment Charges - Fixed',
                'Tax – Fixed',
                'P&G Surcharge – Fixed',
                'Manual Wheeling Energy Charge - Fixed',
                'Manual Energy Charges – Fixed ( Wheeling)')
        """)
        print(f"{hdr_count} headers, {cur.rowcount} line items")
        conn.commit()

        # -- tod_daily_summary (C9) Aug-Nov 2025 from hourly data ------------
        print("  > tod_daily_summary (C9, Aug-Nov 2025) ... ",
              end="", flush=True)
        cur.execute("""
            DELETE FROM tod_daily_summary
            WHERE tenant_id=%s
              AND date >= '2025-08-01' AND date < '2025-12-01'
        """, (C9_TENANT_ID,))
        cur.execute(f"""
            INSERT INTO tod_daily_summary
                (tenant_id, plant_energy_source_id, consumption_unit_id,
                 date, tod_slot_id,
                 generation_kwh, consumption_kwh,
                 direct_matched_kwh, total_matched_kwh,
                 surplus_kwh, grid_drawl_kwh)
            SELECT {C9_TENANT_ID},{c9_pes}, NULL,
                "date",
                CASE tod_slot
                    WHEN 'Morning Peak'
                        THEN {bescom_slots.get('MORNING_PEAK', 1)}
                    WHEN 'Day Normal'
                        THEN {bescom_slots.get('DAY_NORMAL', 2)}
                    WHEN 'Evening Peak'
                        THEN {bescom_slots.get('EVENING_PEAK', 3)}
                    WHEN 'Night Off Peak'
                        THEN {bescom_slots.get('NIGHT_OFF_PEAK', 4)}
                END,
                SUM(supplied_generation),
                SUM(consumption),
                SUM(LEAST(supplied_generation, consumption)),
                SUM(LEAST(supplied_generation, consumption)),
                SUM(GREATEST(0, supplied_generation - consumption)),
                SUM(GREATEST(0, consumption - supplied_generation))
            FROM stg.hourly_gen
            WHERE tod_slot IN (
                'Morning Peak','Day Normal','Evening Peak','Night Off Peak')
            GROUP BY "date", tod_slot
            ON CONFLICT DO NOTHING
        """)
        print(f"{cur.rowcount} rows")
        conn.commit()

        # -- monthly_banking_settlement (C9) Aug-Nov 2025 -------------------
        # SQL files are authoritative for these months;
        # DELETE any seed data first so we load clean values.
        print("  > monthly_banking_settlement (C9, Aug-Nov 2025) ... ",
              end="", flush=True)
        cur.execute("""
            DELETE FROM monthly_banking_settlement
            WHERE tenant_id=%s
              AND month >= '2025-08-01' AND month < '2025-12-01'
        """, (C9_TENANT_ID,))
        cur.execute(f"""
            INSERT INTO monthly_banking_settlement
                (tenant_id, plant_energy_source_id, consumption_unit_id,
                 month, tod_slot_id,
                 net_generation_kwh, gross_generation_kwh,
                 total_consumption_kwh,
                 direct_matched_kwh, banking_utilised_kwh,
                 total_matched_kwh,
                 surplus_before_banking_kwh, surplus_lapsed_kwh,
                 unmet_demand_kwh, replacement_pct, match_rate_pct)
            SELECT {C9_TENANT_ID},{c9_pes}, cu.id,
                (bv."month"||'-01')::DATE, NULL,
                supplied_generation, supplied_generation,
                consumption,
                matched_settlement, settlement_with_banking,
                matched_settlement + settlement_with_banking,
                surplus_generation,
                surplus_generation_after_banking,
                surplus_demand,
                CASE WHEN consumption > 0 THEN
                    ROUND((matched_settlement + settlement_with_banking)
                          / consumption * 100, 4)
                END,
                CASE WHEN supplied_generation > 0 THEN
                    ROUND((matched_settlement + settlement_with_banking)
                          / supplied_generation * 100, 4)
                END
            FROM stg.banking_v2 bv
            JOIN consumption_units cu
                ON  cu.tenant_id = {C9_TENANT_ID}
                AND cu.code = TRIM(REGEXP_REPLACE(
                    SUBSTRING(bv.unit FROM '\\(([^)]+)\\)$'),
                    '[\\(\\)]', '', 'g'))
            WHERE bv.unit != 'Slot_Surplus'
            ON CONFLICT DO NOTHING
        """)
        print(f"{cur.rowcount} rows")
        conn.commit()

        # -- savings_summary (C9) Aug-Nov 2025 -------------------------------
        print("  > savings_summary (C9, Aug-Nov 2025) ... ",
              end="", flush=True)
        cur.execute(f"""
            INSERT INTO savings_summary
                (tenant_id, plant_energy_source_id, consumption_unit_id,
                 month,
                 grid_cost_without_re, cost_with_banking,
                 cost_without_banking,
                 savings_with_banking, savings_without_banking,
                 savings_amount_inr, savings_pct,
                 total_consumption_kwh, total_matched_kwh, replacement_pct)
            SELECT {C9_TENANT_ID},{c9_pes}, cu.id,
                (sv."month"||'-01')::DATE,
                grid_cost,
                actual_cost_with_banking, actual_cost_without_banking,
                savings_with_banking, savings_without_banking,
                total_savings_after_banking,
                total_savings_pct_after_banking,
                consumption,
                ROUND(consumption * savings_pct_with_banking / 100, 4),
                savings_pct_with_banking
            FROM stg.savings_v3 sv
            JOIN consumption_units cu
                ON  cu.tenant_id = {C9_TENANT_ID}
                AND cu.code = TRIM(REGEXP_REPLACE(
                    SUBSTRING(sv.unit FROM '\\(([^)]+)\\)$'),
                    '[\\(\\)]', '', 'g'))
            ON CONFLICT (tenant_id,plant_energy_source_id,
                          consumption_unit_id,month)
            DO UPDATE SET
                grid_cost_without_re    = EXCLUDED.grid_cost_without_re,
                cost_with_banking       = EXCLUDED.cost_with_banking,
                cost_without_banking    = EXCLUDED.cost_without_banking,
                savings_with_banking    = EXCLUDED.savings_with_banking,
                savings_without_banking = EXCLUDED.savings_without_banking,
                savings_amount_inr      = EXCLUDED.savings_amount_inr,
                savings_pct             = EXCLUDED.savings_pct,
                total_consumption_kwh   = EXCLUDED.total_consumption_kwh,
                total_matched_kwh       = EXCLUDED.total_matched_kwh,
                replacement_pct         = EXCLUDED.replacement_pct
        """)
        print(f"{cur.rowcount} rows upserted")
        conn.commit()

        # effective_rate_summary -> savings_summary
        # Apr-24, Mar-25: new pre-solar baseline rows (0 savings)
        # Apr-25: update effective_rate fields on existing seed rows
        print("  > effective_rate_summary -> savings_summary "
              "(C9 baseline + rates) ... ", end="", flush=True)
        total_upserted = 0
        for loc_code, cu_code in EFF_RATE_LOC_TO_CU.items():
            cu_id_val = cu_by_code.get(cu_code)
            if not cu_id_val:
                print(f"\n  WARN: CU {cu_code} not found for {loc_code}")
                continue
            cur.execute(f"""
                INSERT INTO savings_summary
                    (tenant_id, plant_energy_source_id, consumption_unit_id,
                     month,
                     grid_cost_without_re, total_consumption_kwh,
                     savings_amount_inr, savings_pct,
                     total_matched_kwh, replacement_pct,
                     effective_rate_per_unit, grid_rate_per_unit,
                     demand_charges_inr)
                SELECT {C9_TENANT_ID},{c9_pes},{cu_id_val},
                    (billing_month||'-01')::DATE,
                    total_electricity_bill,
                    total_units_consumed,
                    0, 0, 0, 0,
                    effective_rate, effective_rate,
                    total_demand_charges
                FROM stg.effective_rate
                WHERE location_code = %s
                ON CONFLICT (tenant_id,plant_energy_source_id,
                              consumption_unit_id,month)
                DO UPDATE SET
                    effective_rate_per_unit = EXCLUDED.effective_rate_per_unit,
                    grid_rate_per_unit      = EXCLUDED.grid_rate_per_unit,
                    demand_charges_inr      = EXCLUDED.demand_charges_inr,
                    grid_cost_without_re  = CASE
                        WHEN savings_summary.grid_cost_without_re = 0
                        THEN EXCLUDED.grid_cost_without_re
                        ELSE savings_summary.grid_cost_without_re
                    END,
                    total_consumption_kwh = CASE
                        WHEN savings_summary.total_consumption_kwh = 0
                        THEN EXCLUDED.total_consumption_kwh
                        ELSE savings_summary.total_consumption_kwh
                    END
            """, (loc_code,))
            total_upserted += cur.rowcount
        print(f"{total_upserted} rows "
              "(Apr-24 + Mar-25 = new baselines; Apr-25 = rate update)")
        conn.commit()

        cur.execute("DROP SCHEMA stg CASCADE")
        conn.commit()

    print("  C9 ETL complete")


# ─────────────────────────────────────────────────────────────────────────────
# Phase 5 -- Verification
# ─────────────────────────────────────────────────────────────────────────────

def phase5_verify(conn) -> None:
    print("\n[Phase 5] Verification")

    checks = [
        ("tenants",                   "SELECT COUNT(*) FROM tenants"),
        ("plants",                    "SELECT COUNT(*) FROM plants"),
        ("plant_energy_sources",      "SELECT COUNT(*) FROM plant_energy_sources"),
        ("devices",                   "SELECT COUNT(*) FROM devices"),
        ("consumption_units",         "SELECT COUNT(*) FROM consumption_units"),
        ("tenant_users",              "SELECT COUNT(*) FROM tenant_users"),
        ("tod_slot_definitions",      "SELECT COUNT(*) FROM tod_slot_definitions"),
        None,
        ("generation_readings",       "SELECT COUNT(*) FROM generation_readings"),
        ("consumption_readings",      "SELECT COUNT(*) FROM consumption_readings"),
        ("settlement_slots",          "SELECT COUNT(*) FROM settlement_slots"),
        None,
        ("tod_daily_summary",         "SELECT COUNT(*) FROM tod_daily_summary"),
        ("monthly_banking_settlement","SELECT COUNT(*) FROM monthly_banking_settlement"),
        ("savings_summary",           "SELECT COUNT(*) FROM savings_summary"),
        ("performance_metrics",       "SELECT COUNT(*) FROM performance_metrics"),
        ("device_yearly_metrics",     "SELECT COUNT(*) FROM device_yearly_metrics"),
        None,
        ("grid_bill_headers",         "SELECT COUNT(*) FROM grid_bill_headers"),
        ("grid_bill_line_items",      "SELECT COUNT(*) FROM grid_bill_line_items"),
        None,
        ("chat_messages",             "SELECT COUNT(*) FROM chat_messages"),
        ("data_ingestion_logs",       "SELECT COUNT(*) FROM data_ingestion_logs"),
    ]

    with conn.cursor() as cur:
        for item in checks:
            if item is None:
                print()
                continue
            label, sql = item
            cur.execute(sql)
            n = cur.fetchone()[0]
            flag = "OK" if n > 0 else "!! EMPTY"
            print(f"  [{flag}]  {label}: {n:,}")

        print("\n  GIL installed capacity:")
        cur.execute("""
            SELECT est.code, pes.installed_capacity_kw
            FROM plant_energy_sources pes
            JOIN energy_source_types est ON est.id = pes.source_type_id
            JOIN plants p ON p.id = pes.plant_id
            WHERE p.tenant_id = 2
        """)
        for r in cur.fetchall():
            print(f"    {r[0]}: {r[1]:,} kW")

        print("\n  GIL savings_summary (latest 3 months):")
        cur.execute("""
            SELECT TO_CHAR(month,'YYYY-MM'),
                   ROUND(savings_amount_inr/1e5, 2) AS lakh
            FROM savings_summary WHERE tenant_id=2
            ORDER BY month DESC LIMIT 3
        """)
        for r in cur.fetchall():
            print(f"    {r[0]}: Rs.{r[1]}L savings")

        print("\n  C9 DISCOM bills:")
        cur.execute("""
            SELECT TO_CHAR(billing_period_from,'YYYY-MM'), COUNT(*) AS units
            FROM grid_bill_headers WHERE tenant_id=1
            GROUP BY 1 ORDER BY 1
        """)
        for r in cur.fetchall():
            print(f"    {r[0]}: {r[1]} units billed")

        print("\n  C9 pre-solar baseline rows:")
        cur.execute("""
            SELECT TO_CHAR(month,'YYYY-MM'), cu.code,
                   ROUND(grid_cost_without_re) AS bill,
                   effective_rate_per_unit
            FROM savings_summary ss
            JOIN consumption_units cu ON cu.id = ss.consumption_unit_id
            WHERE ss.tenant_id=1 AND month < '2025-04-01'
            ORDER BY month, cu.code
        """)
        rows = cur.fetchall()
        if rows:
            for r in rows:
                print(f"    {r[0]} {r[1]}: Rs.{r[2]:,} @ {r[3]} Rs/kWh")
        else:
            print("    (none)")

    print("\n  Migration complete. All tables populated.")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 62)
    print("  Integrum Energy -- Schema v2 Full Migration (v2)")
    print("  26 source files -> Schema v2 (C9 + GIL)")
    print("=" * 62)
    conn = connect()
    print(f"  Connected: {DB_DSN}\n")
    try:
        phase1_schema(conn)
        phase2_seeds(conn)
        phase3_gil(conn)
        phase4_c9(conn)
        phase5_verify(conn)
    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()
    print("\n" + "=" * 62)
    print("  Migration finished successfully.")
    print("=" * 62)


if __name__ == "__main__":
    main()
