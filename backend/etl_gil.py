#!/usr/bin/env python3
"""
etl_gil.py — Load all GIL CSV data into Schema v2 (PostgreSQL).

Usage (run from D:\\Integrum_dashboard\\):
    python backend/etl_gil.py

Connection: postgresql://integrum@localhost:5432/integrum
Data dir:   D:\\Integrum_dashboard\\GIL\\
"""

import csv
import io
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
DB_DSN  = "postgresql://integrum@localhost:5432/integrum"
GIL_DIR = Path(__file__).parent.parent / "GIL"

MSEDCL_RATE = 9.2423   # effective Rs/kWh (derived from Aug-2025 actuals)
PPA_RATE    = 2.50     # Rs/kWh GIL hybrid PPA tariff

# Wind turbine: serial_number → GIL device name (ranked by annual generation)
WIND_SERIAL_TO_NAME: dict[str, str] = {
    "23005436": "GIL008",
    "23005426": "GIL007",
    "23005438": "GIL003",
    "23005428": "GIL009",
    "24000783": "GIL004",
    "23005432": "GIL001",
    "23005430": "GIL006",
    "23005434": "GIL002",
    "23005424": "GIL005",
    "23005435": "GIL010",   # partial-year turbine — kept as extra device
}

# Solar inverter serials (in order → SINV-01 … SINV-04)
SOLAR_SERIALS = ["24004845", "22010390", "24004850", "Q0430203"]

# CSV tod_slot string → MSEDCL DB slot_code
TOD_CSV_TO_CODE: dict[str, str] = {
    "normal":   "NORMAL",
    "off-peak": "OFF_PEAK",
    "peak":     "PEAK",
}


# ─────────────────────────────────────────────────────────────────────────────
def connect() -> psycopg2.extensions.connection:
    return psycopg2.connect(DB_DSN)


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Look up existing reference IDs from seed data
# ─────────────────────────────────────────────────────────────────────────────

def get_ref_ids(cur) -> dict:
    refs: dict = {}

    cur.execute("SELECT id FROM states WHERE code = 'MH'")
    refs["mh_state_id"] = cur.fetchone()[0]

    cur.execute("SELECT id FROM discoms WHERE code = 'MSEDCL'")
    refs["msedcl_id"] = cur.fetchone()[0]

    cur.execute("SELECT id FROM energy_source_types WHERE code = 'WIND'")
    refs["wind_est_id"] = cur.fetchone()[0]

    cur.execute("SELECT id FROM energy_source_types WHERE code = 'SOLAR'")
    refs["solar_est_id"] = cur.fetchone()[0]

    # MSEDCL has two PEAK rows (morning + evening); use MIN(id) per code
    cur.execute("""
        SELECT slot_code, MIN(id)
        FROM tod_slot_definitions
        WHERE discom_id = %s
        GROUP BY slot_code
    """, (refs["msedcl_id"],))
    for slot_code, slot_id in cur.fetchall():
        refs[f"tod_{slot_code}_id"] = slot_id

    print(f"  ref IDs: MH={refs['mh_state_id']}, MSEDCL={refs['msedcl_id']}, "
          f"WIND={refs['wind_est_id']}, SOLAR={refs['solar_est_id']}")
    return refs


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Insert GIL tenant, plant, PES, devices, consumption unit
# ─────────────────────────────────────────────────────────────────────────────

def _upsert_returning(cur, sql: str, params: tuple, fallback_sql: str, fallback_params: tuple) -> int:
    """Execute an ON CONFLICT DO NOTHING INSERT; if nothing returned, run a SELECT."""
    cur.execute(sql, params)
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute(fallback_sql, fallback_params)
    return cur.fetchone()[0]


def setup_gil_entities(cur, refs: dict) -> dict:
    print("  Setting up GIL tenant, plant, devices…")

    # Tenant
    tenant_id = _upsert_returning(
        cur,
        """INSERT INTO tenants (code, name, short_name, city, state_id, primary_email)
           VALUES ('GIL','Graphite India Limited','GIL','Mumbai',%s,'data@graphiteindia.com')
           ON CONFLICT (code) DO NOTHING RETURNING id""",
        (refs["mh_state_id"],),
        "SELECT id FROM tenants WHERE code='GIL'", (),
    )
    print(f"    tenant_id={tenant_id}")

    # Plant
    plant_id = _upsert_returning(
        cur,
        """INSERT INTO plants (tenant_id, code, name, state_id, discom_id, commissioned_on, notes)
           VALUES (%s,'GIL_PLANT_01',
                   'Graphite India Hybrid Plant (Wind + Solar)',%s,%s,
                   '2020-04-01','9 Wind Turbines (GIL001-GIL009) + 4 Solar Inverters, Maharashtra')
           ON CONFLICT (tenant_id, code) DO NOTHING RETURNING id""",
        (tenant_id, refs["mh_state_id"], refs["msedcl_id"]),
        "SELECT id FROM plants WHERE tenant_id=%s AND code='GIL_PLANT_01'", (tenant_id,),
    )
    print(f"    plant_id={plant_id}")

    # Wind plant_energy_source (9 × 2 MW = 18 MW)
    wind_pes_id = _upsert_returning(
        cur,
        """INSERT INTO plant_energy_sources
               (plant_id, tenant_id, source_type_id, installed_capacity_kw,
                contracted_capacity_kw, commissioned_on, open_access_type)
           VALUES (%s,%s,%s,18000.0,18000.0,'2020-04-01','INTRA_STATE')
           ON CONFLICT (plant_id, source_type_id) DO NOTHING RETURNING id""",
        (plant_id, tenant_id, refs["wind_est_id"]),
        "SELECT id FROM plant_energy_sources WHERE plant_id=%s AND source_type_id=%s",
        (plant_id, refs["wind_est_id"]),
    )

    # Solar plant_energy_source (4 × ~2.82 MWp ≈ 11.28 MWp)
    solar_pes_id = _upsert_returning(
        cur,
        """INSERT INTO plant_energy_sources
               (plant_id, tenant_id, source_type_id, installed_capacity_kw,
                contracted_capacity_kw, commissioned_on, open_access_type)
           VALUES (%s,%s,%s,11280.0,11280.0,'2020-04-01','INTRA_STATE')
           ON CONFLICT (plant_id, source_type_id) DO NOTHING RETURNING id""",
        (plant_id, tenant_id, refs["solar_est_id"]),
        "SELECT id FROM plant_energy_sources WHERE plant_id=%s AND source_type_id=%s",
        (plant_id, refs["solar_est_id"]),
    )
    print(f"    wind_pes_id={wind_pes_id}, solar_pes_id={solar_pes_id}")

    # Wind turbine devices
    wind_device_ids: dict[str, int] = {}
    for serial, name in WIND_SERIAL_TO_NAME.items():
        dev_id = _upsert_returning(
            cur,
            """INSERT INTO devices
                   (tenant_id, plant_id, plant_energy_source_id, device_code,
                    device_type, serial_number, capacity_kw)
               VALUES (%s,%s,%s,%s,'TURBINE',%s,2000.0)
               ON CONFLICT (plant_id, device_code) DO NOTHING RETURNING id""",
            (tenant_id, plant_id, wind_pes_id, name, serial),
            "SELECT id FROM devices WHERE plant_id=%s AND device_code=%s",
            (plant_id, name),
        )
        wind_device_ids[serial] = dev_id

    # Solar inverter devices
    solar_device_ids: dict[str, int] = {}
    for i, serial in enumerate(SOLAR_SERIALS, 1):
        code = f"SINV-{i:02d}"
        dev_id = _upsert_returning(
            cur,
            """INSERT INTO devices
                   (tenant_id, plant_id, plant_energy_source_id, device_code,
                    device_type, serial_number, capacity_kw)
               VALUES (%s,%s,%s,%s,'INVERTER',%s,2820.0)
               ON CONFLICT (plant_id, device_code) DO NOTHING RETURNING id""",
            (tenant_id, plant_id, solar_pes_id, code, serial),
            "SELECT id FROM devices WHERE plant_id=%s AND device_code=%s",
            (plant_id, code),
        )
        solar_device_ids[serial] = dev_id

    print(f"    devices: {len(wind_device_ids)} wind + {len(solar_device_ids)} solar")

    # Consumption unit (GIL self-consumes its RE generation)
    cu_id = _upsert_returning(
        cur,
        """INSERT INTO consumption_units
               (tenant_id, discom_id, code, name, state_id,
                tariff_category, connection_type, contract_demand_kva)
           VALUES (%s,%s,'GIL-MAIN','GIL Plant (Self-Consumption)',%s,'HT-2','HT',25000.0)
           ON CONFLICT (tenant_id, code) DO NOTHING RETURNING id""",
        (tenant_id, refs["msedcl_id"], refs["mh_state_id"]),
        "SELECT id FROM consumption_units WHERE tenant_id=%s AND code='GIL-MAIN'", (tenant_id,),
    )
    print(f"    consumption_unit_id={cu_id}")

    # Plant → consumption unit mappings (WIND and SOLAR both supply GIL-MAIN)
    for pes_id in (wind_pes_id, solar_pes_id):
        cur.execute("""
            INSERT INTO plant_consumption_mappings
                (plant_energy_source_id, consumption_unit_id, tenant_id,
                 allocation_pct, priority_rank, effective_from)
            VALUES (%s,%s,%s,100.0,1,'2020-04-01')
            ON CONFLICT (plant_energy_source_id, consumption_unit_id, effective_from) DO NOTHING
        """, (pes_id, cu_id, tenant_id))

    return {
        "tenant_id":       tenant_id,
        "plant_id":        plant_id,
        "wind_pes_id":     wind_pes_id,
        "solar_pes_id":    solar_pes_id,
        "wind_device_ids": wind_device_ids,   # serial → device_id
        "solar_device_ids":solar_device_ids,
        "cu_id":           cu_id,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Generation readings (wind & solar)
# ─────────────────────────────────────────────────────────────────────────────

def _delete_existing_generation(cur, tenant_id: int, source: str, refs: dict) -> None:
    est_id = refs["wind_est_id"] if source == "WIND" else refs["solar_est_id"]
    cur.execute("""
        DELETE FROM generation_readings
        WHERE tenant_id = %s AND source_type_id = %s
    """, (tenant_id, est_id))


def load_generation(cur, conn, ents: dict, refs: dict, source: str = "WIND") -> int:
    if source == "WIND":
        csv_path   = GIL_DIR / "wind_generation_202607011304.csv"
        pes_id     = ents["wind_pes_id"]
        est_id     = refs["wind_est_id"]
        device_map = ents["wind_device_ids"]
    else:
        csv_path   = GIL_DIR / "solar_generation_202607011303.csv"
        pes_id     = ents["solar_pes_id"]
        est_id     = refs["solar_est_id"]
        device_map = ents["solar_device_ids"]

    tenant_id = ents["tenant_id"]
    plant_id  = ents["plant_id"]

    print(f"  Loading {source} generation from {csv_path.name}…")
    _delete_existing_generation(cur, tenant_id, source, refs)
    conn.commit()

    cols = [
        "tenant_id", "plant_id", "plant_energy_source_id", "device_id", "source_type_id",
        "slot_start_time", "slot_end_time",
        "generation_kwh", "generation_before_losses_kwh", "loss_pct",
        "is_estimated", "data_source",
    ]

    batch: list[tuple] = []
    count = 0
    BATCH = 5000

    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            serial = row["serial_number"]
            if serial not in device_map:
                continue
            device_id = device_map[serial]

            gen_date  = row["generation_date"]
            gen_time  = row["generation_time"]
            gen_kwh   = float(row["generation_value"] or 0)
            before_v  = row.get("generation_before_losses") or ""
            gen_before: float | None = float(before_v) if before_v.strip() not in ("", "NULL") else None

            # CSV time is slot END (e.g. "00:15:00" = slot 00:00–00:15)
            slot_end_dt   = datetime.strptime(f"{gen_date} {gen_time}", "%Y-%m-%d %H:%M:%S")
            slot_start_dt = slot_end_dt - timedelta(minutes=15)
            slot_end_str  = slot_end_dt.strftime("%Y-%m-%d %H:%M:%S+05:30")
            slot_start_str = slot_start_dt.strftime("%Y-%m-%d %H:%M:%S+05:30")

            loss_pct: float | None = None
            if gen_before and gen_before > 0:
                loss_pct = round((gen_before - gen_kwh) / gen_before * 100, 4)

            batch.append((
                tenant_id, plant_id, pes_id, device_id, est_id,
                slot_start_str, slot_end_str,
                gen_kwh, gen_before, loss_pct,
                False, "IMPORT",
            ))
            count += 1

            if len(batch) >= BATCH:
                execute_values(cur, f"""
                    INSERT INTO generation_readings ({', '.join(cols)})
                    VALUES %s
                """, batch)
                conn.commit()
                batch = []
                print(f"    {count} rows…")

    if batch:
        execute_values(cur, f"""
            INSERT INTO generation_readings ({', '.join(cols)})
            VALUES %s
        """, batch)
        conn.commit()

    print(f"    ✓ {count} {source} generation rows loaded")
    return count


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Consumption readings
# ─────────────────────────────────────────────────────────────────────────────

def load_consumption(cur, conn, ents: dict) -> int:
    csv_path  = GIL_DIR / "consumption_data_202607011302.csv"
    tenant_id = ents["tenant_id"]
    cu_id     = ents["cu_id"]

    print(f"  Loading consumption from {csv_path.name}…")
    cur.execute("DELETE FROM consumption_readings WHERE tenant_id = %s", (tenant_id,))
    conn.commit()

    cols = [
        "tenant_id", "consumption_unit_id",
        "slot_start_time", "slot_end_time",
        "consumption_kwh", "is_estimated", "data_source",
    ]

    batch: list[tuple] = []
    count = 0
    BATCH = 5000

    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cons_date   = row["consumption_date"]
            cons_time   = row["consumption_time"]
            cons_kwh    = float(row["consumption_value"] or 0)

            slot_end_dt    = datetime.strptime(f"{cons_date} {cons_time}", "%Y-%m-%d %H:%M:%S")
            slot_start_dt  = slot_end_dt - timedelta(minutes=15)

            batch.append((
                tenant_id, cu_id,
                slot_start_dt.strftime("%Y-%m-%d %H:%M:%S+05:30"),
                slot_end_dt.strftime("%Y-%m-%d %H:%M:%S+05:30"),
                cons_kwh, False, "IMPORT",
            ))
            count += 1

            if len(batch) >= BATCH:
                execute_values(cur, f"""
                    INSERT INTO consumption_readings ({', '.join(cols)})
                    VALUES %s
                """, batch)
                conn.commit()
                batch = []

    if batch:
        execute_values(cur, f"""
            INSERT INTO consumption_readings ({', '.join(cols)})
            VALUES %s
        """, batch)
        conn.commit()

    print(f"    ✓ {count} consumption rows loaded")
    return count


# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Monthly banking settlement
# ─────────────────────────────────────────────────────────────────────────────

def load_banking(cur, conn, ents: dict, refs: dict) -> int:
    csv_path  = GIL_DIR / "monthly_banking_settlement_202607011302.csv"
    tenant_id = ents["tenant_id"]
    pes_id    = ents["wind_pes_id"]   # combined wind+solar banking stored under WIND PES
    cu_id     = ents["cu_id"]

    print(f"  Loading banking settlement from {csv_path.name}…")
    cur.execute("""
        DELETE FROM monthly_banking_settlement
        WHERE tenant_id = %s AND plant_energy_source_id = %s
    """, (tenant_id, pes_id))
    conn.commit()

    # Also clear the solar PES rows if any
    cur.execute("""
        DELETE FROM monthly_banking_settlement
        WHERE tenant_id = %s AND plant_energy_source_id = %s
    """, (tenant_id, ents["solar_pes_id"]))

    cols = [
        "tenant_id", "plant_energy_source_id", "consumption_unit_id", "month", "tod_slot_id",
        "net_generation_kwh", "gross_generation_kwh", "total_consumption_kwh",
        "direct_matched_kwh", "banking_utilised_kwh", "intra_month_banking_kwh",
        "total_matched_kwh",
        "surplus_before_banking_kwh", "surplus_lapsed_kwh", "unmet_demand_kwh",
        "replacement_pct", "match_rate_pct",
    ]

    # Collect rows grouped by month for aggregate computation
    monthly: dict[str, list[dict]] = {}

    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            m   = row["settlement_month"]   # "2025-04"
            slot_csv = row["tod_slot"].strip().lower()
            slot_code = TOD_CSV_TO_CODE.get(slot_csv)
            if not slot_code:
                print(f"    WARN: unknown tod_slot '{slot_csv}', skipping")
                continue
            tod_id = refs.get(f"tod_{slot_code}_id")
            if tod_id is None:
                print(f"    WARN: no tod_slot_id for code '{slot_code}', skipping")
                continue

            month_date = f"{m}-01"   # first of month

            net_gen   = float(row["generation_value"]         or 0)
            total_con = float(row["slot_total_consumption"]   or 0)
            matched   = float(row["matched_settlement"]       or 0)
            surplus   = float(row["surplus_generation"]       or 0)  # before banking
            lapsed    = float(row["surplus_gen_with_banking"] or 0)  # after banking
            unmet     = float(row["surplus_demand"]           or 0)
            daily_tod = float(row["matched_settlement_daily_tod"]    or 0)
            intra     = float(row["matched_settlement_intra_monthly"] or 0)

            # Schema mapping:
            # direct_matched_kwh  = daily_tod  (Tier-1 match)
            # banking_utilised    = matched - daily_tod  (Tier-2 + Tier-3 combined)
            # intra_month_banking = intra  (Tier-3 specifically)
            banking_utilised = round(matched - daily_tod, 4)

            replacement_pct = round(matched / total_con * 100, 4) if total_con > 0 else None
            match_rate      = round(matched / net_gen  * 100, 4) if net_gen  > 0 else None

            row_data = dict(
                slot_code=slot_code,
                tod_id=tod_id,
                month_date=month_date,
                net_gen=net_gen,
                total_con=total_con,
                matched=matched,
                daily_tod=daily_tod,
                banking_utilised=banking_utilised,
                intra=intra,
                surplus=surplus,
                lapsed=lapsed,
                unmet=unmet,
                replacement_pct=replacement_pct,
                match_rate=match_rate,
            )
            monthly.setdefault(m, []).append(row_data)

    # Insert per-slot rows + aggregate rows
    per_slot_rows: list[tuple] = []
    aggregate_rows: list[tuple] = []

    for month_str, slot_rows in monthly.items():
        for r in slot_rows:
            per_slot_rows.append((
                tenant_id, pes_id, cu_id, r["month_date"], r["tod_id"],
                r["net_gen"], r["net_gen"],   # gross = net (no separate gross in CSV)
                r["total_con"],
                r["daily_tod"], r["banking_utilised"], r["intra"],
                r["matched"],
                r["surplus"], r["lapsed"], r["unmet"],
                r["replacement_pct"], r["match_rate"],
            ))

        # Aggregate row (tod_slot_id = NULL)
        agg_net   = sum(r["net_gen"]   for r in slot_rows)
        agg_con   = sum(r["total_con"] for r in slot_rows)
        agg_mat   = sum(r["matched"]   for r in slot_rows)
        agg_dt    = sum(r["daily_tod"] for r in slot_rows)
        agg_bk    = sum(r["banking_utilised"] for r in slot_rows)
        agg_intra = sum(r["intra"]     for r in slot_rows)
        agg_surp  = sum(r["surplus"]   for r in slot_rows)
        agg_lap   = sum(r["lapsed"]    for r in slot_rows)
        agg_unmet = sum(r["unmet"]     for r in slot_rows)
        agg_rep   = round(agg_mat / agg_con  * 100, 4) if agg_con  > 0 else None
        agg_mr    = round(agg_mat / agg_net  * 100, 4) if agg_net  > 0 else None

        aggregate_rows.append((
            tenant_id, pes_id, cu_id, slot_rows[0]["month_date"], None,
            agg_net, agg_net, agg_con,
            agg_dt, agg_bk, agg_intra,
            agg_mat,
            agg_surp, agg_lap, agg_unmet,
            agg_rep, agg_mr,
        ))

    all_rows = per_slot_rows + aggregate_rows
    execute_values(cur, f"""
        INSERT INTO monthly_banking_settlement ({', '.join(cols)})
        VALUES %s
        ON CONFLICT (tenant_id, plant_energy_source_id, consumption_unit_id, month,
                     COALESCE(tod_slot_id, 0))
        DO NOTHING
    """, all_rows)
    conn.commit()

    print(f"    ✓ {len(per_slot_rows)} per-slot + {len(aggregate_rows)} aggregate banking rows loaded")
    return len(all_rows)


# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Savings summary
# ─────────────────────────────────────────────────────────────────────────────

def load_savings(cur, conn, ents: dict) -> int:
    tenant_id = ents["tenant_id"]
    pes_id    = ents["wind_pes_id"]
    cu_id     = ents["cu_id"]

    print("  Loading savings summary…")
    cur.execute("""
        DELETE FROM savings_summary
        WHERE tenant_id = %s AND plant_energy_source_id = %s
    """, (tenant_id, pes_id))
    conn.commit()

    # Real row from savings CSV (Aug 2025 only)
    real_months: dict[str, dict] = {}
    sv_path = GIL_DIR / "savings_summary_202607011302.csv"
    with open(sv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            m = str(row["settlement_month"])[:7]   # "2025-08-01" → "2025-08"
            real_months[m] = {
                "total_consumption": float(row["total_consumption"] or 0),
                "grid_cost":         float(row["grid_cost"] or 0),
                "cost_with_banking": float(row["actual_cost_with_banking"] or 0),
                "savings_with_banking": float(row["savings_with_banking"] or 0),
                "cost_without_banking": float(row.get("actual_cost_without_banking") or 0),
                "savings_without_banking": float(row.get("savings_without_banking") or 0),
            }

    # Read aggregate banking rows to derive savings for all other months
    cur.execute("""
        SELECT TO_CHAR(month, 'YYYY-MM') AS m,
               total_consumption_kwh,
               total_matched_kwh,
               direct_matched_kwh,
               net_generation_kwh
        FROM monthly_banking_settlement
        WHERE tenant_id = %s AND plant_energy_source_id = %s AND tod_slot_id IS NULL
        ORDER BY month
    """, (tenant_id, pes_id))
    banking_rows = cur.fetchall()

    # Also get total generation per month from generation_readings
    cur.execute("""
        SELECT TO_CHAR(DATE_TRUNC('month', slot_start_time AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS m,
               SUM(generation_kwh) AS gen_kwh
        FROM generation_readings
        WHERE tenant_id = %s
        GROUP BY 1
    """, (tenant_id,))
    gen_by_month = {r[0]: float(r[1] or 0) for r in cur.fetchall()}

    cols = [
        "tenant_id", "plant_energy_source_id", "consumption_unit_id", "month",
        "grid_cost_without_re", "re_cost", "actual_cost_with_re",
        "cost_without_banking", "cost_with_banking",
        "savings_without_banking", "savings_with_banking",
        "savings_amount_inr", "savings_pct",
        "effective_rate_per_unit", "grid_rate_per_unit",
        "total_generation_kwh", "total_consumption_kwh", "total_matched_kwh",
        "replacement_pct",
    ]

    rows: list[tuple] = []
    for brow in banking_rows:
        m          = brow[0]
        total_con  = float(brow[1] or 0)
        total_mat  = float(brow[2] or 0)
        direct_mat = float(brow[3] or 0)  # daily TOD matched
        total_gen  = gen_by_month.get(m, 0)

        month_date = f"{m}-01"

        if m in real_months:
            # Use actual DISCOM bill data
            rv = real_months[m]
            grid_cost    = rv["grid_cost"]
            cost_wb      = rv["cost_with_banking"]
            sav_wb       = rv["savings_with_banking"]
            cost_wob     = rv["cost_without_banking"]
            sav_wob      = rv["savings_without_banking"]
        else:
            # Derive from banking data using effective rate
            grid_cost = round(total_con  * MSEDCL_RATE, 2)
            cost_wb   = round((total_con - total_mat) * MSEDCL_RATE + total_mat * PPA_RATE, 2)
            sav_wb    = round(grid_cost - cost_wb, 2)
            # Without banking: only direct match (daily TOD tier)
            cost_wob  = round((total_con - direct_mat) * MSEDCL_RATE + direct_mat * PPA_RATE, 2)
            sav_wob   = round(grid_cost - cost_wob, 2)

        re_cost      = round(total_mat * PPA_RATE, 2)
        act_cost_re  = round((total_con - total_mat) * MSEDCL_RATE + re_cost, 2)
        sav_pct      = round(sav_wb / grid_cost * 100, 4) if grid_cost > 0 else 0
        eff_rate     = round(cost_wb / total_con, 4) if total_con > 0 else None
        repl_pct     = round(total_mat / total_con * 100, 4) if total_con > 0 else None

        rows.append((
            tenant_id, pes_id, cu_id, month_date,
            grid_cost, re_cost, act_cost_re,
            cost_wob, cost_wb,
            sav_wob, sav_wb,
            sav_wb, sav_pct,
            eff_rate, MSEDCL_RATE,
            total_gen, total_con, total_mat,
            repl_pct,
        ))

    if rows:
        execute_values(cur, f"""
            INSERT INTO savings_summary ({', '.join(cols)})
            VALUES %s
            ON CONFLICT (tenant_id, plant_energy_source_id, consumption_unit_id, month)
            DO NOTHING
        """, rows)
        conn.commit()

    print(f"    ✓ {len(rows)} savings summary rows loaded")
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Annual performance metrics (plant level: WIND + SOLAR)
# ─────────────────────────────────────────────────────────────────────────────

def load_performance_metrics(cur, conn, ents: dict) -> int:
    csv_path  = GIL_DIR / "performance_metrics_202607011302.csv"
    tenant_id = ents["tenant_id"]

    print(f"  Loading performance metrics from {csv_path.name}…")

    cur.execute("""
        DELETE FROM performance_metrics WHERE tenant_id = %s
    """, (tenant_id,))
    conn.commit()

    cols = [
        "tenant_id", "plant_energy_source_id", "financial_year",
        "gross_generation_kwh", "net_generation_kwh", "generation_losses_kwh",
        "plf_pct", "pr_pct", "availability_pct",
        "realised_cap_consumption_kwh", "over_injection_kwh", "sale_of_energy_kwh",
        "total_plant_consumption_kwh", "total_re_consumption_kwh", "replacement_pct",
    ]

    rows: list[tuple] = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            fy = row["year"]   # "2025-2026"

            # WIND source row
            wind_gen     = float(row["generation_turbine_level"] or 0)
            wind_plf     = float(row["plf_wind_percent"] or 0)
            wind_real    = float(row["realised_kwh_cap_consumption_wind"] or 0)
            wind_losses  = float(row.get("actual_losses_realised_kwh_cap_consumption_wind") or 0)
            wind_net     = wind_gen - wind_losses if wind_losses > 0 else wind_gen
            over_inj     = float(row["over_injection"] or 0)
            sale_e       = float(row["sale_of_energy"] or 0)
            total_cons   = float(row["total_plant_consumption"] or 0)
            total_re_con = float(row["total_re_consumption_capex"] or 0)
            re_pct       = float(row["total_re_percent"] or 0)

            rows.append((
                tenant_id, ents["wind_pes_id"], fy,
                wind_gen, wind_net, wind_losses,
                wind_plf, None, None,
                wind_real, over_inj, sale_e,
                total_cons, total_re_con, re_pct,
            ))

            # SOLAR source row
            solar_gen    = float(row["solar_generation"] or 0)
            solar_plf    = float(row["plf_solar_percent"] or 0)
            solar_real   = float(row["realised_kwh_cap_consumption_solar"] or 0)
            solar_losses = float(row.get("actual_losses_solar_generation") or 0)
            solar_net    = solar_gen - solar_losses if solar_losses > 0 else solar_gen

            rows.append((
                tenant_id, ents["solar_pes_id"], fy,
                solar_gen, solar_net, solar_losses,
                solar_plf, None, None,
                solar_real, 0, 0,
                total_cons, total_re_con, re_pct,
            ))

    if rows:
        execute_values(cur, f"""
            INSERT INTO performance_metrics ({', '.join(cols)})
            VALUES %s
            ON CONFLICT (tenant_id, plant_energy_source_id, financial_year) DO NOTHING
        """, rows)
        conn.commit()

    print(f"    ✓ {len(rows)} performance metric rows loaded (WIND + SOLAR)")
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────────
# Step 8 — Device yearly metrics (per-turbine)
# ─────────────────────────────────────────────────────────────────────────────

def load_device_metrics(cur, conn, ents: dict) -> int:
    csv_path  = GIL_DIR / "wind_turbine_yearly_metrics_202607011304.csv"
    tenant_id = ents["tenant_id"]

    # Build GIL name → device_id map
    name_to_serial = {v: k for k, v in WIND_SERIAL_TO_NAME.items()}
    device_ids = ents["wind_device_ids"]   # serial → device_id

    print(f"  Loading device yearly metrics from {csv_path.name}…")
    cur.execute("DELETE FROM device_yearly_metrics WHERE tenant_id = %s", (tenant_id,))
    conn.commit()

    cols = ["tenant_id", "device_id", "financial_year", "generation_kwh", "plf_pct"]
    rows: list[tuple] = []

    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            wtg  = row["wtg"]          # "GIL001"
            fy   = row["year"]         # "2025-2026"
            gen  = float(row["generation_turbine_level"] or 0)

            serial = name_to_serial.get(wtg)
            if serial is None:
                print(f"    WARN: no serial for WTG '{wtg}', skipping")
                continue
            dev_id = device_ids.get(serial)
            if dev_id is None:
                print(f"    WARN: no device_id for serial '{serial}' ({wtg}), skipping")
                continue

            # PLF: wind turbines rated 2 MW, 8760 hours/year
            plf = round(gen / (2000 * 8760) * 100, 2)
            rows.append((tenant_id, dev_id, fy, gen, plf))

    if rows:
        execute_values(cur, f"""
            INSERT INTO device_yearly_metrics ({', '.join(cols)})
            VALUES %s
            ON CONFLICT (tenant_id, device_id, financial_year) DO NOTHING
        """, rows)
        conn.commit()

    print(f"    ✓ {len(rows)} device yearly metric rows loaded")
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("GIL ETL — Loading CSV data into Schema v2")
    print("=" * 60)

    conn = connect()
    cur  = conn.cursor()

    try:
        print("\n[1/8] Reference IDs")
        refs = get_ref_ids(cur)

        print("\n[2/8] GIL Entity Setup")
        ents = setup_gil_entities(cur, refs)
        conn.commit()

        print("\n[3/8] Wind Generation Readings")
        load_generation(cur, conn, ents, refs, source="WIND")

        print("\n[4/8] Solar Generation Readings")
        load_generation(cur, conn, ents, refs, source="SOLAR")

        print("\n[5/8] Consumption Readings")
        load_consumption(cur, conn, ents)

        print("\n[6/8] Monthly Banking Settlement")
        load_banking(cur, conn, ents, refs)

        print("\n[7/8] Savings Summary")
        load_savings(cur, conn, ents)

        print("\n[8/8] Performance & Device Metrics")
        load_performance_metrics(cur, conn, ents)
        load_device_metrics(cur, conn, ents)

        print("\n" + "=" * 60)
        print("ETL complete. All GIL data loaded successfully.")
        print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
