"""
routes/c9_dashboard.py
======================
All dashboard endpoints for the C9 client (BESCOM HT Solar, Karnataka).

Data source of truth: Excel-imported tables (v3 schema)
  c9_unit_monthly        — monthly per-unit settlement totals
  c9_monthly_tod         — monthly TOD breakdown per unit
  c9_slot_generation     — 15-min solar generation
  c9_slot_consumption    — 15-min per-unit consumption
  c9_monthly_summary     — month-level KPI summary
  consumption_units      — unit master (code, name, tariff)

All amounts in kWh (energy) or INR (cost).
Field names are aligned with the TypeScript interfaces in frontend/src/api/client.ts.
"""

from __future__ import annotations
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

router = APIRouter(prefix="/c9", tags=["C9 Dashboard"])

# ── Constants ─────────────────────────────────────────────────────────────────

TENANT_ID     = 1
PPA_RATE      = Decimal("1.00")    # Rs/kWh — solar PPA rate (BESCOM HT)
BANKING_RATE  = Decimal("0.08")    # 8% banking charge levied by BESCOM

# BESCOM wheeling & ancillary charges (Rs/kWh) on RE units consumed
WHEELING_RATE = Decimal("0.52")    # Rs/kWh (0.32 basic + 0.20 manual wheeling)
FAC_RATE      = Decimal("0.39")    # Fuel Adjustment Charge
PG_RATE       = Decimal("0.36")    # P&G surcharge
TAX_PCT       = Decimal("0.09")    # 9% electricity tax on bill

# Demand charge estimation (from 15-min peak consumption)
DEMAND_RATE   = Decimal("350.00")  # Rs/kVA/month — BESCOM HT-2 demand charge
POWER_FACTOR  = Decimal("0.95")    # Assumed p.f. for kW → kVA conversion

# CO2 emission factor (BESCOM grid average)
CO2_FACTOR    = Decimal("0.000716")  # tonne CO2/kWh


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_py(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return round(float(v), 4)
    return v


def _row(r: Any) -> dict:
    return {k: _to_py(v) for k, v in dict(r).items()}


def _month_date(month: str) -> date:
    try:
        return date.fromisoformat(f"{month}-01")
    except ValueError:
        raise HTTPException(400, f"Invalid month '{month}'. Use YYYY-MM.")


def _month_range(month: str) -> tuple[date, date]:
    d = _month_date(month)
    next_m = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return d, next_m - timedelta(days=1)


def _parse_unit_ids(unit_ids: str) -> list[int]:
    if not unit_ids:
        return []
    return [int(x) for x in unit_ids.split(",") if x.strip().isdigit()]


def _uid_clause(uid_list: list[int], alias: str = "cu") -> tuple[str, dict]:
    if uid_list:
        return f"AND {alias}.unit_id = ANY(:unit_ids)", {"unit_ids": uid_list}
    return "", {}


# ── Units master ──────────────────────────────────────────────────────────────

@router.get("/units")
async def list_units(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Return all C9 consumption units (excludes Slot_Surplus virtual unit)."""
    sql = text("""
        SELECT
            unit_id,
            unit_code  AS code,
            unit_name  AS name,
            tariff_group,
            tariff_rate
        FROM   consumption_units
        WHERE  tenant_id = :tid
          AND  unit_code <> 'SLOT_SURPLUS'
          AND  is_active = TRUE
        ORDER BY tariff_group, unit_name
    """)
    rows = (await db.execute(sql, {"tid": TENANT_ID})).mappings().all()
    return [_row(r) for r in rows]


# ── KPI Summary (header cards) ────────────────────────────────────────────────

@router.get("/kpi-summary")
async def kpi_summary(
    month:    str = Query("2025-08"),
    unit_ids: str = Query(""),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Top-level KPI cards for the selected month from c9_unit_monthly + c9_monthly_summary."""
    month_date = _month_date(month)
    uid_list   = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    # Settlement aggregates (exclude virtual Slot_Surplus)
    agg_sql = text(f"""
        SELECT
            COALESCE(SUM(um.consumption_kwh),    0) AS total_consumption_kwh,
            COALESCE(SUM(um.matched_settlement),  0) AS total_matched_kwh,
            COALESCE(SUM(um.matched_settlement_2),0) AS total_banked_kwh,
            COALESCE(SUM(um.grid_consumption),    0) AS total_grid_kwh,
            COALESCE(SUM(um.lapse_units),         0) AS total_lapse_kwh
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  um.month     = :m
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
    """)
    agg = (await db.execute(agg_sql, {"tid": TENANT_ID, "m": month_date, **uid_params})).mappings().first()

    # Monthly generation total
    sum_sql = text("""
        SELECT total_generation_kwh, net_banked_kwh
        FROM   c9_monthly_summary
        WHERE  tenant_id = :tid AND month = :m
        LIMIT 1
    """)
    sumr = (await db.execute(sum_sql, {"tid": TENANT_ID, "m": month_date})).mappings().first()

    total_gen    = float(sumr["total_generation_kwh"] if sumr else 0) or 0
    total_cons   = float(agg["total_consumption_kwh"]  or 0)
    total_match  = float(agg["total_matched_kwh"]      or 0)
    total_banked = float(agg["total_banked_kwh"]       or 0)
    total_grid   = float(agg["total_grid_kwh"]         or 0)
    total_lapse  = float(agg["total_lapse_kwh"]        or 0)

    # Cost breakdown per tariff group
    cost_sql = text(f"""
        SELECT
            COALESCE(SUM(um.consumption_kwh * cu.tariff_rate), 0)                      AS grid_cost,
            COALESCE(SUM(um.matched_settlement * :ppa), 0)                             AS matched_ppa,
            COALESCE(SUM(um.matched_settlement_2 * :ppa), 0)                           AS banked_ppa,
            0                                                                           AS wheeling_cost,
            COALESCE(SUM(um.grid_consumption * cu.tariff_rate), 0)                     AS grid_drawl_cost
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  um.month     = :m
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
    """)
    cost = (await db.execute(cost_sql, {
        "tid": TENANT_ID, "m": month_date,
        "ppa": float(PPA_RATE), "whl": float(WHEELING_RATE),
        **uid_params
    })).mappings().first()

    grid_cost    = float(cost["grid_cost"]       or 0)
    actual_cost  = (float(cost["matched_ppa"]     or 0)
                  + float(cost["banked_ppa"]      or 0)
                  + float(cost["wheeling_cost"]   or 0)
                  + float(cost["grid_drawl_cost"] or 0))
    savings      = max(0, grid_cost - actual_cost)
    savings_pct  = round(savings / grid_cost * 100, 1) if grid_cost > 0 else 0
    repl_pct     = round((total_match + total_banked) / total_cons * 100, 1) if total_cons > 0 else 0
    co2_saved    = round((total_match + total_banked) * float(CO2_FACTOR), 2)

    return {
        "month":                  month,
        "total_generation_kwh":   round(total_gen,    0),
        "total_consumption_kwh":  round(total_cons,   0),
        "total_matched_kwh":      round(total_match,  0),
        "total_banking_kwh":      round(total_banked, 0),
        "total_grid_kwh":         round(total_grid,   0),
        "total_lapse_kwh":        round(total_lapse,  0),
        "total_grid_cost_inr":    round(grid_cost,    0),
        "total_actual_cost_inr":  round(actual_cost,  0),
        "total_savings_inr":      round(savings,      0),
        "savings_pct":            savings_pct,
        "replacement_pct":        repl_pct,
        "co2_saved_tonnes":       co2_saved,
    }


# ── Chart 1 — Daily Generation & Consumption ──────────────────────────────────

@router.get("/daily-summary")
async def daily_summary(
    month: str = Query("2025-08"),
    db:    AsyncSession = Depends(get_db),
) -> list[dict]:
    """Daily totals for the month — from 15-min slot tables."""
    start, end = _month_range(month)

    gen_sql = text("""
        SELECT
            (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE AS day,
            SUM(generation_kwh)                         AS gen_kwh
        FROM   c9_slot_generation
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY day
        ORDER BY day
    """)
    gen_map = {
        str(r["day"]): float(r["gen_kwh"] or 0)
        for r in (await db.execute(gen_sql, {"tid": TENANT_ID, "start": start, "end": end})).mappings().all()
    }

    cons_sql = text("""
        SELECT
            (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE AS day,
            SUM(consumption_kwh)                        AS cons_kwh
        FROM   c9_slot_consumption
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY day
        ORDER BY day
    """)
    cons_map = {
        str(r["day"]): float(r["cons_kwh"] or 0)
        for r in (await db.execute(cons_sql, {"tid": TENANT_ID, "start": start, "end": end})).mappings().all()
    }

    # Monthly settlement totals for pro-rating to daily
    month_date = _month_date(month)
    agg_sql = text("""
        SELECT
            COALESCE(SUM(matched_settlement),   0) AS total_matched,
            COALESCE(SUM(matched_settlement_2), 0) AS total_banking,
            COALESCE(SUM(lapse_units),          0) AS total_lapsed
        FROM   c9_unit_monthly
        WHERE  tenant_id = :tid AND month = :m
    """)
    agg = (await db.execute(agg_sql, {"tid": TENANT_ID, "m": month_date})).mappings().first()
    total_matched = float(agg["total_matched"]  or 0)
    total_banking = float(agg["total_banking"]  or 0)
    total_lapsed  = float(agg["total_lapsed"]   or 0)
    total_gen_kwh = sum(gen_map.values()) or 1

    result = []
    for day in sorted(set(gen_map) | set(cons_map)):
        gen  = gen_map.get(day, 0)
        cons = cons_map.get(day, 0)
        share   = gen / total_gen_kwh
        matched = round(min(total_matched * share, cons), 2)
        banking = round(min(total_banking * share, max(0, cons - matched)), 2)
        grid    = round(max(0, cons - matched - banking), 2)
        lapsed  = round(total_lapsed * share, 2)
        result.append({
            "date":            day,
            "generation_kwh":  round(gen,  2),
            "consumption_kwh": round(cons, 2),
            "matched_kwh":     matched,
            "banking_kwh":     banking,
            "grid_kwh":        grid,
            "lapsed_kwh":      lapsed,
        })
    return result


# ── Monthly Aggregate — multi-month trend ─────────────────────────────────────

@router.get("/monthly-aggregate")
async def monthly_aggregate(
    from_month: str = Query("2025-08"),
    to_month:   str = Query("2025-11"),
    unit_ids:   str = Query(""),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Month-by-month energy & cost trend for the Gen vs Consumption chart."""
    from_date = _month_date(from_month)
    to_date   = _month_date(to_month)
    uid_list  = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    to_end = (to_date.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    gen_sql = text("""
        SELECT
            DATE_TRUNC('month', slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE AS m,
            SUM(generation_kwh) AS gen_kwh
        FROM   c9_slot_generation
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :from_d AND :to_end
        GROUP BY m ORDER BY m
    """)
    gen_map = {
        str(r["m"])[:7]: float(r["gen_kwh"] or 0)
        for r in (await db.execute(gen_sql, {"tid": TENANT_ID, "from_d": from_date, "to_end": to_end})).mappings().all()
    }

    sett_sql = text(f"""
        WITH slot_lapse AS (
            SELECT um2.month, SUM(um2.lapse_units) AS lapsed_kwh
            FROM   c9_unit_monthly um2
            JOIN   consumption_units cu2 ON cu2.unit_id = um2.unit_id
            WHERE  cu2.unit_code = 'SLOT_SURPLUS'
              AND  um2.tenant_id = :tid
              AND  um2.month BETWEEN :from_d AND :to_date
            GROUP BY um2.month
        )
        SELECT
            TO_CHAR(um.month, 'YYYY-MM')                                    AS m,
            SUM(um.consumption_kwh)                                         AS cons_kwh,
            SUM(um.matched_settlement)                                      AS matched_kwh,
            SUM(um.matched_settlement_2)                                    AS banking_kwh,
            COALESCE(MAX(sl.lapsed_kwh), 0)                                 AS lapsed_kwh,
            SUM(um.grid_consumption)                                        AS grid_kwh,
            SUM(um.consumption_kwh * cu.tariff_rate)                        AS grid_cost_inr,
            SUM((um.matched_settlement + um.matched_settlement_2) * :ppa) AS actual_cost_inr
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        LEFT JOIN slot_lapse sl ON sl.month = um.month
        WHERE  um.tenant_id = :tid
          AND  um.month BETWEEN :from_d AND :to_date
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
        GROUP BY um.month ORDER BY um.month
    """)

    sett_map = {
        r["m"]: dict(r)
        for r in (await db.execute(sett_sql, {
            "tid": TENANT_ID, "from_d": from_date, "to_date": to_date,
            "ppa": float(PPA_RATE), "whl": float(WHEELING_RATE),
            **uid_params
        })).mappings().all()
    }

    result = []
    cur = from_date
    while cur <= to_date:
        key  = cur.strftime("%Y-%m")
        s    = sett_map.get(key, {})
        gen_kwh      = gen_map.get(key, 0)
        cons_kwh     = float(s.get("cons_kwh")    or 0)
        matched_kwh  = float(s.get("matched_kwh") or 0)
        banking_kwh  = float(s.get("banking_kwh") or 0)
        lapsed_kwh   = float(s.get("lapsed_kwh")  or 0)
        grid_kwh     = float(s.get("grid_kwh")    or 0)
        grid_cost    = float(s.get("grid_cost_inr")   or 0)
        actual_cost  = float(s.get("actual_cost_inr") or 0)
        savings      = max(0, grid_cost - actual_cost)
        savings_pct  = round(savings / grid_cost * 100, 1) if grid_cost > 0 else 0

        result.append({
            "month":           key,
            "generation_kwh":  round(gen_kwh,    2),
            "consumption_kwh": round(cons_kwh,   2),
            "matched_kwh":     round(matched_kwh, 2),
            "banking_kwh":     round(banking_kwh, 2),
            "grid_kwh":        round(grid_kwh,   2),
            "lapsed_kwh":      round(lapsed_kwh, 2),
            "grid_cost_inr":   round(grid_cost,  2),
            "savings_inr":     round(savings,    2),
            "savings_pct":     savings_pct,
        })
        cur = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)

    return result


# ── Chart 5b — Monthly Cost Comparison (Grid vs With/Without Banking) ─────────

@router.get("/monthly-cost")
async def monthly_cost(
    from_month: str = Query("2025-08"),
    to_month:   str = Query("2025-11"),
    unit_ids:   str = Query(""),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Per-month cost comparison: grid_cost, actual_with_banking, actual_without_banking.
    Matches old dashboard's 'Cost Comparison: Grid Cost vs With/Without Banking' chart.
    No wheeling charges — PPA rate only on RE units.
    """
    from_date = _month_date(from_month)
    to_date   = _month_date(to_month)
    uid_list  = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    sql = text(f"""
        SELECT
            TO_CHAR(um.month, 'YYYY-MM') AS month,
            SUM(um.consumption_kwh * cu.tariff_rate) AS grid_cost,
            SUM(
                CASE
                    WHEN um.grid_consumption = 0 THEN
                        (um.matched_settlement + um.matched_settlement_2) * :ppa
                    ELSE
                        (um.matched_settlement + um.matched_settlement_2) * :ppa
                        + um.grid_consumption * cu.tariff_rate
                END
            ) AS actual_cost_with_banking,
            SUM(
                um.matched_settlement * :ppa
                + um.surplus_demand   * cu.tariff_rate
            ) AS actual_cost_without_banking
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  um.month BETWEEN :from_d AND :to_d
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
        GROUP BY um.month
        ORDER BY um.month
    """)
    rows = (await db.execute(sql, {
        "tid": TENANT_ID, "from_d": from_date, "to_d": to_date,
        "ppa": float(PPA_RATE), **uid_params
    })).mappings().all()

    result = []
    for r in rows:
        gc   = float(r["grid_cost"]                  or 0)
        awb  = float(r["actual_cost_with_banking"]   or 0)
        awob = float(r["actual_cost_without_banking"] or 0)
        result.append({
            "month":                      r["month"],
            "grid_cost":                  round(gc,   0),
            "actual_cost_with_banking":   round(awb,  0),
            "actual_cost_without_banking":round(awob, 0),
            "savings_with_banking":       round(max(0, gc - awb),  0),
            "savings_without_banking":    round(max(0, gc - awob), 0),
            "incremental_banking_savings":round(max(0, awob - awb), 0),
        })
    return result


# ── Chart 2 — Unit-wise savings ───────────────────────────────────────────────

@router.get("/unit-savings")
async def unit_savings(
    month:      str = Query("2025-08"),
    from_month: str = Query(""),
    to_month:   str = Query(""),
    unit_ids:   str = Query(""),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Per-unit cost & savings aggregated across a month range.
    If from_month/to_month are provided they take precedence over month.
    """
    from_date = _month_date(from_month if from_month else month)
    to_date   = _month_date(to_month   if to_month   else month)
    uid_list  = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    sql = text(f"""
        SELECT
            cu.unit_id,
            cu.unit_code,
            cu.unit_name                                                              AS unit,
            cu.tariff_group,
            cu.tariff_rate,
            SUM(um.consumption_kwh)                                                   AS consumption_kwh,
            SUM(um.matched_settlement)                                                AS matched_kwh,
            SUM(um.matched_settlement_2)                                              AS banking_kwh,
            SUM(um.lapse_units)                                                       AS lapse_units_kwh,
            SUM(um.grid_consumption)                                                  AS grid_consumption,
            SUM(um.surplus_demand)                                                    AS surplus_demand,
            SUM(um.consumption_kwh)      * cu.tariff_rate                             AS grid_cost,
            CASE
              WHEN SUM(um.grid_consumption) = 0 THEN
                (SUM(um.matched_settlement) + SUM(um.matched_settlement_2)) * :ppa
              ELSE
                (SUM(um.matched_settlement) + SUM(um.matched_settlement_2)) * :ppa
                + SUM(um.grid_consumption) * cu.tariff_rate
            END                                                                        AS actual_cost_with_banking,
            SUM(um.matched_settlement)   * :ppa
            + SUM(um.surplus_demand)     * cu.tariff_rate                             AS actual_cost_without_banking
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  um.month BETWEEN :from_d AND :to_d
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
        GROUP BY cu.unit_id, cu.unit_code, cu.unit_name, cu.tariff_group, cu.tariff_rate
        ORDER BY grid_cost DESC
    """)
    rows = (await db.execute(sql, {
        "tid": TENANT_ID, "from_d": from_date, "to_d": to_date,
        "ppa": float(PPA_RATE), "whl": float(WHEELING_RATE),
        **uid_params
    })).mappings().all()

    result = []
    for r in rows:
        d          = dict(r)
        grid_cost  = float(d["grid_cost"]                    or 0)
        actual_wb  = float(d["actual_cost_with_banking"]     or 0)
        actual_wob = float(d["actual_cost_without_banking"]  or 0)
        savings_wb = max(0, grid_cost - actual_wb)
        savings_wob= max(0, grid_cost - actual_wob)
        cons_kwh   = float(d["consumption_kwh"] or 0)
        match_kwh  = float(d["matched_kwh"]     or 0)
        bank_kwh   = float(d["banking_kwh"]     or 0)
        result.append({
            "unit":                        d["unit"],
            "unit_code":                   d["unit_code"],
            "unit_id":                     d["unit_id"],
            "tariff_group":                d["tariff_group"],
            "tariff_rate":                 float(d["tariff_rate"]),
            "consumption_kwh":             round(cons_kwh,    2),
            "matched_kwh":                 round(match_kwh,   2),
            "banking_kwh":                 round(bank_kwh,    2),
            "surplus_kwh":                 round(float(d["surplus_demand"]   or 0), 2),
            "grid_drawl_kwh":              round(float(d["grid_consumption"] or 0), 2),
            "lapse_units_kwh":             round(float(d["lapse_units_kwh"] or 0), 2),
            "replacement_pct":             round((match_kwh + bank_kwh) / cons_kwh * 100, 1) if cons_kwh else 0,
            "grid_cost":                   round(grid_cost,   2),
            "actual_cost_with_banking":    round(actual_wb,   2),
            "actual_cost_without_banking": round(actual_wob,  2),
            "savings_with_banking":        round(savings_wb,  2),
            "savings_without_banking":     round(savings_wob, 2),
            "savings_pct_with_banking":    round(savings_wb  / grid_cost * 100, 1) if grid_cost else 0,
            "savings_pct_without_banking": round(savings_wob / grid_cost * 100, 1) if grid_cost else 0,
        })
    return result


# ── Chart 4 — TOD Analysis ────────────────────────────────────────────────────

@router.get("/tod-analysis")
async def tod_analysis(
    month:      str           = Query("2025-08"),
    from_month: Optional[str] = Query(None),
    to_month:   Optional[str] = Query(None),
    unit_ids:   str           = Query(""),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """TOD slot breakdown.
    Generation = total plant output per slot from c9_slot_generation (matches old dashboard).
    Consumption / matched = from c9_slot_consumption / c9_monthly_tod.
    Supports single month (month=) or date range (from_month= & to_month=).
    """
    # Date range
    if from_month and to_month:
        start, _   = _month_range(from_month)
        _,     end = _month_range(to_month)
    else:
        start, end = _month_range(month)

    uid_list = _parse_unit_ids(unit_ids)

    TOD_CASE = """
        CASE
            WHEN EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') >= 22
              OR EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') < 6
            THEN 'Night_Offpeak'
            WHEN EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') >= 6
             AND EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') < 9
            THEN 'Morning_Peak'
            WHEN EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') >= 9
             AND EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') < 18
            THEN 'Day_Normal'
            ELSE 'Evening_Peak'
        END
    """

    # Generation: actual plant output per slot from 15-min data
    gen_sql = text(f"""
        SELECT {TOD_CASE} AS tod_slot,
               SUM(generation_kwh) AS gen_kwh
        FROM   c9_slot_generation
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY 1
    """)

    # Consumption: actual per-slot from 15-min data
    cons_sql = text(f"""
        SELECT {TOD_CASE} AS tod_slot,
               SUM(consumption_kwh) AS cons_kwh
        FROM   c9_slot_consumption
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY 1
    """)

    # Matched settlement: from c9_monthly_tod (Excel-settled actuals)
    if from_month and to_month:
        match_where = "mt.month BETWEEN :match_start AND :match_end"
        match_params: dict = {"match_start": _month_date(from_month), "match_end": _month_date(to_month)}
    else:
        match_where = "mt.month = :match_m"
        match_params = {"match_m": _month_date(month)}

    match_sql = text(f"""
        SELECT mt.tod_slot,
               SUM(mt.matched_settlement) AS matched_kwh,
               SUM(mt.surplus_generation) AS surplus_gen_kwh,
               SUM(mt.surplus_demand)     AS surplus_demand_kwh
        FROM   c9_monthly_tod mt
        WHERE  mt.tenant_id = :tid
          AND  {match_where}
        GROUP BY mt.tod_slot
    """)

    base_params = {"tid": TENANT_ID, "start": start, "end": end}
    gen_rows   = (await db.execute(gen_sql,   base_params)).mappings().all()
    cons_rows  = (await db.execute(cons_sql,  base_params)).mappings().all()
    match_rows = (await db.execute(match_sql, {"tid": TENANT_ID, **match_params})).mappings().all()

    # Merge into slot dict
    SLOTS = ["Night_Offpeak", "Morning_Peak", "Day_Normal", "Evening_Peak"]
    data: dict[str, dict] = {s: {"gen": 0.0, "cons": 0.0, "matched": 0.0, "surplus_gen": 0.0, "surplus_demand": 0.0} for s in SLOTS}
    for r in gen_rows:
        if r["tod_slot"] in data:
            data[r["tod_slot"]]["gen"] = float(r["gen_kwh"] or 0)
    for r in cons_rows:
        if r["tod_slot"] in data:
            data[r["tod_slot"]]["cons"] = float(r["cons_kwh"] or 0)
    for r in match_rows:
        if r["tod_slot"] in data:
            data[r["tod_slot"]]["matched"]       = float(r["matched_kwh"]      or 0)
            data[r["tod_slot"]]["surplus_gen"]   = float(r["surplus_gen_kwh"]  or 0)
            data[r["tod_slot"]]["surplus_demand"] = float(r["surplus_demand_kwh"] or 0)

    SLOT_META = {
        "Night_Offpeak": ("Night Off-Peak (22-06h)", 0.75),
        "Morning_Peak":  ("Morning Peak (06-09h)",   1.50),
        "Day_Normal":    ("Day Normal (09-18h)",      1.00),
        "Evening_Peak":  ("Evening Peak (18-22h)",   1.50),
    }
    BESCOM_RATE_A = 7.20

    result = []
    for code in SLOTS:
        label, mult = SLOT_META[code]
        d = data[code]
        result.append({
            "tod_slot":           code,
            "slot_label":         label,
            "multiplier":         mult,
            "generation_kwh":     round(d["gen"],    2),
            "consumption_kwh":    round(d["cons"],   2),
            "matched_kwh":        round(d["matched"], 2),
            "direct_matched_kwh": round(d["matched"], 2),
            "surplus_gen_kwh":    round(d["surplus_gen"],    2),
            "surplus_demand_kwh": round(d["surplus_demand"], 2),
            "cost_savings_inr":   round(d["matched"] * (BESCOM_RATE_A - float(PPA_RATE)), 2),
        })
    return result


# ── Chart 4b — TOD Daily Time Series ─────────────────────────────────────────

@router.get("/tod-daily")
async def tod_daily(
    month: str = Query("2025-08"),
    db:    AsyncSession = Depends(get_db),
) -> list[dict]:
    """Daily generation & consumption per TOD slot for the month.
    Derives tod_slot from slot_ts hour using BESCOM tariff windows:
      Night Off-Peak  22:00–06:00
      Morning Peak    06:00–09:00
      Day Normal      09:00–18:00
      Evening Peak    18:00–22:00
    """
    start, end = _month_range(month)

    SLOT_META = {
        "Night_Offpeak": "Night Off-Peak (22-06h)",
        "Morning_Peak":  "Morning Peak (06-09h)",
        "Day_Normal":    "Day Normal (09-18h)",
        "Evening_Peak":  "Evening Peak (18-22h)",
    }

    TOD_CASE = """
        CASE
            WHEN EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') >= 22
              OR EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') < 6
            THEN 'Night_Offpeak'
            WHEN EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') >= 6
             AND EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') < 9
            THEN 'Morning_Peak'
            WHEN EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') >= 9
             AND EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') < 18
            THEN 'Day_Normal'
            ELSE 'Evening_Peak'
        END
    """

    gen_sql = text(f"""
        SELECT
            (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE AS day,
            {TOD_CASE} AS tod_slot,
            SUM(generation_kwh) AS gen_kwh
        FROM   c9_slot_generation
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY day, tod_slot
        ORDER BY day, tod_slot
    """)

    cons_sql = text(f"""
        SELECT
            (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE AS day,
            {TOD_CASE} AS tod_slot,
            SUM(consumption_kwh) AS cons_kwh
        FROM   c9_slot_consumption
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY day, tod_slot
        ORDER BY day, tod_slot
    """)

    params   = {"tid": TENANT_ID, "start": start, "end": end}
    gen_rows  = (await db.execute(gen_sql,  params)).mappings().all()
    cons_rows = (await db.execute(cons_sql, params)).mappings().all()

    merged: dict[tuple, dict] = {}
    for r in gen_rows:
        key = (str(r["day"]), r["tod_slot"])
        merged.setdefault(key, {"generation_kwh": 0.0, "consumption_kwh": 0.0})
        merged[key]["generation_kwh"] = round(float(r["gen_kwh"] or 0), 2)
    for r in cons_rows:
        key = (str(r["day"]), r["tod_slot"])
        merged.setdefault(key, {"generation_kwh": 0.0, "consumption_kwh": 0.0})
        merged[key]["consumption_kwh"] = round(float(r["cons_kwh"] or 0), 2)

    result = []
    for (day, slot), vals in sorted(merged.items()):
        result.append({
            "date":            day,
            "tod_slot":        slot,
            "slot_label":      SLOT_META.get(slot, slot),
            "generation_kwh":  vals["generation_kwh"],
            "consumption_kwh": vals["consumption_kwh"],
        })
    return result


# ── Chart 4c — TOD Monthly Time Series ───────────────────────────────────────

@router.get("/tod-monthly")
async def tod_monthly(
    from_month: str = Query("2025-08"),
    to_month:   str = Query("2025-11"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Monthly generation & consumption per TOD slot from c9_monthly_tod."""
    from_date = _month_date(from_month)
    to_date   = _month_date(to_month)
    SLOT_META = {
        "Night_Offpeak": "Night Off-Peak (22-06h)",
        "Morning_Peak":  "Morning Peak (06-09h)",
        "Day_Normal":    "Day Normal (09-18h)",
        "Evening_Peak":  "Evening Peak (18-22h)",
    }
    sql = text("""
        SELECT
            mt.month,
            mt.tod_slot,
            SUM(mt.allocated_generation) AS gen_kwh,
            SUM(mt.consumption_kwh)      AS cons_kwh
        FROM   c9_monthly_tod mt
        WHERE  mt.tenant_id = :tid
          AND  mt.month BETWEEN :from_m AND :to_m
        GROUP BY mt.month, mt.tod_slot
        ORDER BY mt.month, mt.tod_slot
    """)
    rows = (await db.execute(sql, {
        "tid":    TENANT_ID,
        "from_m": from_date,
        "to_m":   to_date,
    })).mappings().all()
    result = []
    for r in rows:
        result.append({
            "month":           str(r["month"])[:7],
            "tod_slot":        r["tod_slot"],
            "slot_label":      SLOT_META.get(r["tod_slot"], r["tod_slot"]),
            "generation_kwh":  round(float(r["gen_kwh"]  or 0), 2),
            "consumption_kwh": round(float(r["cons_kwh"] or 0), 2),
        })
    return result


# ── Chart 4d — TOD 60-min Time Series ────────────────────────────────────────

@router.get("/tod-hourly")
async def tod_hourly(
    month: str = Query("2025-08"),
    db:    AsyncSession = Depends(get_db),
) -> list[dict]:
    """60-minute aggregated generation & consumption per TOD slot.
    Groups 15-min data into 1-hour buckets (IST). Each hour belongs to exactly
    one TOD slot (slot boundaries align with whole hours).
    Returns stacked-bar chart data: generation per slot + consumption per hour.
    """
    start, end = _month_range(month)

    SLOT_META = {
        "Night_Offpeak": "Night Off-Peak (22-06h)",
        "Morning_Peak":  "Morning Peak (06-09h)",
        "Day_Normal":    "Day Normal (09-18h)",
        "Evening_Peak":  "Evening Peak (18-22h)",
    }

    TOD_CASE = """
        CASE
            WHEN EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') >= 22
              OR EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') < 6
            THEN 'Night_Offpeak'
            WHEN EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') >= 6
             AND EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') < 9
            THEN 'Morning_Peak'
            WHEN EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') >= 9
             AND EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata') < 18
            THEN 'Day_Normal'
            ELSE 'Evening_Peak'
        END
    """

    gen_sql = text(f"""
        SELECT
            TO_CHAR(
                DATE_TRUNC('hour', slot_ts AT TIME ZONE 'Asia/Kolkata'),
                'YYYY-MM-DD"T"HH24:MI'
            ) AS hour_ts,
            {TOD_CASE} AS tod_slot,
            SUM(generation_kwh) AS gen_kwh
        FROM   c9_slot_generation
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY hour_ts, tod_slot
        ORDER BY hour_ts, tod_slot
    """)

    cons_sql = text(f"""
        SELECT
            TO_CHAR(
                DATE_TRUNC('hour', slot_ts AT TIME ZONE 'Asia/Kolkata'),
                'YYYY-MM-DD"T"HH24:MI'
            ) AS hour_ts,
            {TOD_CASE} AS tod_slot,
            SUM(consumption_kwh) AS cons_kwh
        FROM   c9_slot_consumption
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY hour_ts, tod_slot
        ORDER BY hour_ts, tod_slot
    """)

    params    = {"tid": TENANT_ID, "start": start, "end": end}
    gen_rows  = (await db.execute(gen_sql,  params)).mappings().all()
    cons_rows = (await db.execute(cons_sql, params)).mappings().all()

    merged: dict[tuple, dict] = {}
    for r in gen_rows:
        key = (r["hour_ts"], r["tod_slot"])
        merged.setdefault(key, {"generation_kwh": 0.0, "consumption_kwh": 0.0})
        merged[key]["generation_kwh"] = round(float(r["gen_kwh"] or 0), 2)
    for r in cons_rows:
        key = (r["hour_ts"], r["tod_slot"])
        merged.setdefault(key, {"generation_kwh": 0.0, "consumption_kwh": 0.0})
        merged[key]["consumption_kwh"] = round(float(r["cons_kwh"] or 0), 2)

    result = []
    for (hour_ts, slot), vals in sorted(merged.items()):
        result.append({
            "hour_ts":         hour_ts,
            "tod_slot":        slot,
            "slot_label":      SLOT_META.get(slot, slot),
            "generation_kwh":  vals["generation_kwh"],
            "consumption_kwh": vals["consumption_kwh"],
        })
    return result


# ── Chart 5 — DISCOM Bill Breakdown per unit ──────────────────────────────────

@router.get("/discom-bill")
async def discom_bill(
    month:    str = Query("2025-08"),
    unit_ids: str = Query(""),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Per-unit estimated BESCOM bill breakdown.

    Demand charge is estimated from the highest 15-min consumption slot in the
    month (no actual kVA meter reading needed):
        peak_kw  = max_15min_kwh / 0.25
        peak_kva = peak_kw / POWER_FACTOR  (assumed 0.95)
        demand   = peak_kva × DEMAND_RATE  (₹350/kVA)

    Gross bill = full grid (no solar): energy + demand + FAC + P&G + 9% tax
    Net bill   = with solar: grid energy + demand + wheeling + FAC/P&G on grid
                 drawl + 9% tax  (PPA cost to solar company shown separately)
    """
    month_date  = _month_date(month)
    start, end  = _month_range(month)
    uid_list    = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    # ── Step 1: peak 15-min consumption per unit ──────────────────────────────
    peak_sql = text(f"""
        SELECT
            sc.unit_id,
            MAX(sc.consumption_kwh) AS peak_15min_kwh
        FROM   c9_slot_consumption sc
        JOIN   consumption_units cu ON cu.unit_id = sc.unit_id
        WHERE  sc.tenant_id = :tid
          AND  (sc.slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
        GROUP BY sc.unit_id
    """)
    peak_rows = (await db.execute(
        peak_sql, {"tid": TENANT_ID, "start": start, "end": end, **uid_params}
    )).mappings().all()
    # unit_id → peak kVA
    pf   = float(POWER_FACTOR)
    dr   = float(DEMAND_RATE)
    peak_kva_map: dict[int, float] = {}
    for pr in peak_rows:
        peak_kwh = float(pr["peak_15min_kwh"] or 0)
        peak_kw  = peak_kwh / 0.25          # 15 min → kW
        peak_kva_map[pr["unit_id"]] = peak_kw / pf

    # ── Step 2: monthly energy & settlement totals per unit ───────────────────
    sql = text(f"""
        SELECT
            cu.unit_name,
            cu.unit_code,
            cu.unit_id,
            cu.tariff_group,
            cu.tariff_rate,
            um.consumption_kwh,
            um.matched_settlement,
            um.matched_settlement_2  AS banking_kwh,
            um.grid_consumption
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  um.month     = :m
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
        ORDER BY cu.tariff_group, cu.unit_name
    """)
    rows = (await db.execute(
        sql, {"tid": TENANT_ID, "m": month_date, **uid_params}
    )).mappings().all()

    fac_r  = float(FAC_RATE)
    pg_r   = float(PG_RATE)
    tax_r  = float(TAX_PCT)
    whl_r  = float(WHEELING_RATE)
    ppa_r  = float(PPA_RATE)

    result = []
    for r in rows:
        d          = dict(r)
        rate       = float(d["tariff_rate"])
        cons_kwh   = float(d["consumption_kwh"]    or 0)
        match_kwh  = float(d["matched_settlement"] or 0)
        bank_kwh   = float(d["banking_kwh"]        or 0)
        grid_kwh   = float(d["grid_consumption"]   or 0)
        re_kwh     = match_kwh + bank_kwh

        peak_kva       = peak_kva_map.get(d["unit_id"], 0.0)
        demand_charge  = peak_kva * dr          # same for gross & net

        # ── Gross bill (no solar — full grid supply) ──────────────────────────
        energy_gross   = cons_kwh * rate
        fac_gross      = cons_kwh * fac_r
        pg_gross       = cons_kwh * pg_r
        subtotal_gross = energy_gross + demand_charge + fac_gross + pg_gross
        tax_gross      = subtotal_gross * tax_r
        gross_inr      = subtotal_gross + tax_gross

        # ── Net DISCOM bill (with solar) ──────────────────────────────────────
        energy_net     = grid_kwh * rate         # energy charge on grid drawl only
        wheeling_inr   = re_kwh * whl_r          # wheeling on RE units
        fac_net        = grid_kwh * fac_r        # FAC on grid drawl only
        pg_net         = grid_kwh * pg_r         # P&G on grid drawl only
        subtotal_net   = energy_net + demand_charge + wheeling_inr + fac_net + pg_net
        tax_net        = subtotal_net * tax_r
        discom_bill    = subtotal_net + tax_net

        # ── PPA cost (paid to solar company, not BESCOM) ──────────────────────
        ppa_cost       = re_kwh * ppa_r

        total_with_re  = discom_bill + ppa_cost
        savings_inr    = max(0.0, gross_inr - total_with_re)

        result.append({
            "unit_name":           d["unit_name"],
            "unit_code":           d["unit_code"],
            "tariff_group":        d["tariff_group"],
            # totals
            "gross_amount_inr":    round(gross_inr,    2),
            "net_payable_inr":     round(discom_bill,  2),
            "total_with_re_inr":   round(total_with_re, 2),
            "savings_inr":         round(savings_inr,  2),
            "ppa_cost_inr":        round(ppa_cost,     2),
            # energy
            "total_units_kwh":     round(cons_kwh,     2),
            "energy_rate_per_kwh": rate,
            "energy_charge_inr":   round(energy_gross, 2),
            # demand
            "peak_demand_kva":     round(peak_kva,     1),
            "demand_charge_inr":   round(demand_charge,2),
            # ancillary
            "fac_inr":             round(fac_gross,    2),
            "pg_surcharge_inr":    round(pg_gross,     2),
            "tax_inr":             round(tax_gross,    2),
            # wheeling (net-bill specific)
            "wheeling_charge_inr": round(wheeling_inr, 2),
            "wheeling_energy_kwh": round(re_kwh,       2),
        })
    return result


# ── Electricity Consumption Summary ───────────────────────────────────────────

@router.get("/consumption-summary")
async def consumption_summary(
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Historical monthly consumption per unit — all available months.
    Matches the old dashboard's 'Electricity Consumption Summary' table:
      Month | Location | Total Units Consumed | Bill Without Solar Credit | Effective Rate/Unit
    Gross bill = consumption_kwh × tariff_rate (energy component, no demand/FAC).
    """
    sql = text("""
        SELECT
            TO_CHAR(um.month, 'YYYY-MM') AS month,
            cu.unit_name,
            cu.unit_code,
            cu.tariff_rate,
            um.consumption_kwh
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  cu.unit_code <> 'SLOT_SURPLUS'
        ORDER BY um.month DESC, cu.unit_name
    """)
    rows = (await db.execute(sql, {"tid": TENANT_ID})).mappings().all()

    result = []
    for r in rows:
        cons_kwh  = float(r["consumption_kwh"] or 0)
        rate      = float(r["tariff_rate"]      or 0)
        gross_inr = cons_kwh * rate
        result.append({
            "month":             r["month"],
            "unit_name":         r["unit_name"],
            "unit_code":         r["unit_code"],
            "consumption_kwh":   round(cons_kwh,  2),
            "gross_bill_inr":    round(gross_inr, 2),
            "effective_rate":    rate,
        })
    return result


# ── Chart 8 — Banking Loss ────────────────────────────────────────────────────

@router.get("/banking-loss")
async def banking_loss(
    month:    str = Query("2025-08"),
    unit_ids: str = Query(""),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Per-unit banking round-2 settlement. Returns BankingLossRow shape:
    gross_banked_kwh  = raw slot surplus allocated to this unit (pro-rated)
    banking_loss_kwh  = 8% BESCOM charge on gross surplus
    net_banked_kwh    = gross_banked after 8% charge
    settled_kwh       = consumed from bank (matched_settlement_2)
    expired_kwh       = lapse_units (unused bank credits)
    closing_balance   = net_banked - settled - expired
    loss_inr          = banking_loss_kwh × tariff_rate
    """
    month_date = _month_date(month)
    uid_list   = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    # Net banked pool from Slot_Surplus virtual row
    pool_sql = text("""
        SELECT
            um.surplus_generation  AS net_banked_kwh,
            um.surplus_demand      AS raw_slot_surplus_kwh
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid AND um.month = :m AND cu.unit_code = 'SLOT_SURPLUS'
        LIMIT 1
    """)
    pool_row = (await db.execute(pool_sql, {"tid": TENANT_ID, "m": month_date})).mappings().first()
    net_banked_pool    = float(pool_row["net_banked_kwh"]       if pool_row else 0) or 0
    raw_surplus        = float(pool_row["raw_slot_surplus_kwh"] if pool_row else 0) or 0
    banking_loss_total = max(0, raw_surplus - net_banked_pool)

    sql = text(f"""
        SELECT
            cu.unit_name                AS unit,
            cu.unit_code,
            cu.unit_id,
            cu.tariff_rate,
            um.surplus_demand           AS surplus_demand_kwh,
            um.matched_settlement_2     AS settled_kwh,
            um.lapse_units              AS expired_kwh
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  um.month     = :m
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
        ORDER BY cu.tariff_group, cu.unit_name
    """)
    rows = (await db.execute(sql, {"tid": TENANT_ID, "m": month_date, **uid_params})).mappings().all()

    total_surplus_demand = sum(float(r["surplus_demand_kwh"] or 0) for r in rows)

    result = []
    for r in rows:
        d            = dict(r)
        surplus_d    = float(d["surplus_demand_kwh"] or 0)
        settled      = float(d["settled_kwh"]        or 0)
        expired      = float(d["expired_kwh"]        or 0)
        share        = surplus_d / total_surplus_demand if total_surplus_demand > 0 else 0
        gross_banked = round(raw_surplus * share,        2)
        net_banked   = round(net_banked_pool * share,    2)
        bank_loss    = round(banking_loss_total * share, 2)
        closing      = max(0, round(net_banked - settled - expired, 2))
        loss_inr     = round(bank_loss * float(d["tariff_rate"]), 2)

        result.append({
            "unit":                d["unit"],
            "unit_code":           d["unit_code"],
            "unit_id":             d["unit_id"],
            "tariff_rate":         float(d["tariff_rate"]),
            "gross_banked_kwh":    gross_banked,
            "banking_loss_kwh":    bank_loss,
            "net_banked_kwh":      net_banked,
            "settled_kwh":         round(settled, 2),
            "expired_kwh":         round(expired, 2),
            "closing_balance_kwh": closing,
            "loss_inr":            loss_inr,
        })
    return result


# ── Chart 10 — Wheeling Reconciliation ───────────────────────────────────────

@router.get("/wheeling-recon")
async def wheeling_recon(
    month:    str = Query("2025-08"),
    unit_ids: str = Query(""),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Wheeling reconciliation: proposed vs actual RE units wheeled per unit.
    Returns WheelingReconRow shape.
    """
    month_date = _month_date(month)
    uid_list   = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    sql = text(f"""
        SELECT
            cu.unit_name                                            AS unit,
            cu.unit_code,
            cu.unit_id,
            cu.tariff_rate,
            (um.matched_settlement + um.matched_settlement_2)       AS proposed_kwh,
            (um.matched_settlement + um.matched_settlement_2)       AS actual_kwh
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  um.month     = :m
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
        ORDER BY cu.tariff_group, cu.unit_name
    """)
    rows = (await db.execute(sql, {"tid": TENANT_ID, "m": month_date, **uid_params})).mappings().all()

    result = []
    for r in rows:
        d        = dict(r)
        proposed = float(d["proposed_kwh"] or 0)
        actual   = float(d["actual_kwh"]   or 0)
        gap_kwh  = round(proposed - actual, 2)
        gap_inr  = round(abs(gap_kwh) * float(d["tariff_rate"]), 2)
        status   = "OK" if abs(gap_kwh) < 0.01 else ("OVER" if gap_kwh > 0 else "UNDER")
        result.append({
            "unit":         d["unit"],
            "unit_code":    d["unit_code"],
            "proposed_kwh": round(proposed, 2),
            "actual_kwh":   round(actual,   2),
            "gap_kwh":      gap_kwh,
            "gap_inr":      gap_inr,
            "status":       status,
        })
    return result


# ── Chart 11 — Surplus & Absorption Flow ─────────────────────────────────────

@router.get("/surplus-absorption")
async def surplus_absorption(
    month:    str = Query("2025-08"),
    unit_ids: str = Query(""),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Per-unit energy flow. Returns SurplusAbsorptionRow shape:
    generation_kwh → direct_matched_kwh (R1) → gross_surplus_kwh →
    banking_settled_kwh (R2) → banking_expired_kwh / grid_drawl_kwh
    """
    month_date = _month_date(month)
    uid_list   = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    # Allocated generation from c9_monthly_tod (sum across TOD slots per unit)
    gen_sql = text(f"""
        SELECT unit_id, SUM(allocated_generation) AS alloc_gen_kwh
        FROM   c9_monthly_tod
        WHERE  tenant_id = :tid AND month = :m
        GROUP BY unit_id
    """)
    gen_map = {
        r["unit_id"]: float(r["alloc_gen_kwh"] or 0)
        for r in (await db.execute(gen_sql, {"tid": TENANT_ID, "m": month_date})).mappings().all()
    }

    sql = text(f"""
        SELECT
            cu.unit_name                                               AS unit,
            cu.unit_code,
            cu.unit_id,
            cu.tariff_group,
            um.consumption_kwh,
            um.matched_settlement                                      AS direct_matched_kwh,
            um.surplus_demand                                          AS gross_surplus_kwh,
            um.matched_settlement_2                                    AS banking_settled_kwh,
            um.lapse_units                                             AS banking_expired_kwh,
            um.grid_consumption                                        AS grid_drawl_kwh,
            (um.matched_settlement + um.matched_settlement_2)          AS total_matched_kwh,
            ROUND(
                (um.matched_settlement + um.matched_settlement_2)::NUMERIC
                / NULLIF(um.consumption_kwh, 0) * 100, 1
            ) AS replacement_pct
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  um.month     = :m
          AND  cu.unit_code <> 'SLOT_SURPLUS'
          {uid_sql}
        ORDER BY cu.tariff_group, cu.unit_name
    """)
    rows = (await db.execute(sql, {"tid": TENANT_ID, "m": month_date, **uid_params})).mappings().all()

    result = []
    for r in rows:
        d   = dict(r)
        uid = d["unit_id"]
        result.append({
            "unit":                d["unit"],
            "unit_code":           d["unit_code"],
            "tariff_group":        d["tariff_group"],
            "generation_kwh":      round(gen_map.get(uid, 0), 2),
            "consumption_kwh":     round(float(d["consumption_kwh"]      or 0), 2),
            "direct_matched_kwh":  round(float(d["direct_matched_kwh"]   or 0), 2),
            "gross_surplus_kwh":   round(float(d["gross_surplus_kwh"]    or 0), 2),
            "banking_settled_kwh": round(float(d["banking_settled_kwh"]  or 0), 2),
            "banking_expired_kwh": round(float(d["banking_expired_kwh"]  or 0), 2),
            "grid_drawl_kwh":      round(float(d["grid_drawl_kwh"]       or 0), 2),
            "total_matched_kwh":   round(float(d["total_matched_kwh"]    or 0), 2),
            "replacement_pct":     float(d["replacement_pct"] or 0),
        })
    return result


# ── Chart 3 — Savings Heatmap (all months × all units) ───────────────────────

@router.get("/savings-heatmap")
async def savings_heatmap(
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Savings % heatmap: all available months × all units."""
    sql = text("""
        SELECT
            cu.unit_name                                                              AS unit,
            cu.unit_code,
            TO_CHAR(um.month, 'YYYY-MM')                                              AS month,
            um.consumption_kwh,
            um.consumption_kwh * cu.tariff_rate                                       AS grid_cost_inr,
            CASE
                WHEN um.grid_consumption = 0 THEN
                    (um.matched_settlement + um.matched_settlement_2) * :ppa
                ELSE
                    (um.matched_settlement + um.matched_settlement_2) * :ppa
                    + um.grid_consumption * cu.tariff_rate
            END                                                                        AS actual_cost_inr,
            ROUND(
                (um.consumption_kwh * cu.tariff_rate
                 - CASE
                     WHEN um.grid_consumption = 0 THEN
                         (um.matched_settlement + um.matched_settlement_2) * :ppa
                     ELSE
                         (um.matched_settlement + um.matched_settlement_2) * :ppa
                         + um.grid_consumption * cu.tariff_rate
                   END
                ) / NULLIF(um.consumption_kwh * cu.tariff_rate, 0) * 100, 1
            ) AS savings_pct
        FROM   c9_unit_monthly um
        JOIN   consumption_units cu ON cu.unit_id = um.unit_id
        WHERE  um.tenant_id = :tid
          AND  cu.unit_code <> 'SLOT_SURPLUS'
        ORDER BY cu.unit_name, um.month
    """)
    rows = (await db.execute(sql, {
        "tid": TENANT_ID,
        "ppa": float(PPA_RATE),
        "whl": float(WHEELING_RATE),
    })).mappings().all()
    return [_row(r) for r in rows]


# ── Chart 15 — 24h × 7-day Heatmap ──────────────────────────────────────────

@router.get("/heatmap")
async def heatmap(
    month: str = Query("2025-08"),
    db:    AsyncSession = Depends(get_db),
) -> dict:
    """Average gen/cons per hour-of-day × day-of-week (IST)."""
    start, end = _month_range(month)

    cons_sql = text("""
        SELECT
            EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata')::INT             AS hr,
            ((EXTRACT(DOW FROM slot_ts AT TIME ZONE 'Asia/Kolkata')::INT + 6) % 7) AS dow,
            AVG(consumption_kwh) AS avg_cons
        FROM   c9_slot_consumption
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY hr, dow
    """)
    cons_rows = (await db.execute(cons_sql, {"tid": TENANT_ID, "start": start, "end": end})).mappings().all()

    gen_sql = text("""
        SELECT
            EXTRACT(HOUR FROM slot_ts AT TIME ZONE 'Asia/Kolkata')::INT             AS hr,
            ((EXTRACT(DOW FROM slot_ts AT TIME ZONE 'Asia/Kolkata')::INT + 6) % 7) AS dow,
            AVG(generation_kwh) AS avg_gen
        FROM   c9_slot_generation
        WHERE  tenant_id = :tid
          AND  (slot_ts AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY hr, dow
    """)
    gen_rows = (await db.execute(gen_sql, {"tid": TENANT_ID, "start": start, "end": end})).mappings().all()

    cons_map = {(int(r["hr"]), int(r["dow"])): float(r["avg_cons"] or 0) for r in cons_rows}
    gen_map  = {(int(r["hr"]), int(r["dow"])): float(r["avg_gen"]  or 0) for r in gen_rows}

    net_matrix, gen_matrix, cons_matrix = [], [], []
    for h in range(24):
        nr, gr, cr = [], [], []
        for dw in range(7):
            g = gen_map.get((h, dw))
            c = cons_map.get((h, dw))
            if g is None and c is None:
                nr.append(None); gr.append(None); cr.append(None)
            else:
                g = g or 0; c = c or 0
                gr.append(round(g, 1))
                cr.append(round(c, 1))
                nr.append(round(g - c, 1))
        net_matrix.append(nr)
        gen_matrix.append(gr)
        cons_matrix.append(cr)

    return {
        "hours":       list(range(24)),
        "days":        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "net_matrix":  net_matrix,
        "gen_matrix":  gen_matrix,
        "cons_matrix": cons_matrix,
    }

