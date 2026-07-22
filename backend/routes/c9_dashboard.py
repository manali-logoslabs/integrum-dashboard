"""
routes/c9_dashboard.py
======================
All dashboard endpoints for the C9 client (BESCOM HT, Solar, Karnataka).

Tables used:
  savings_summary            — cost/savings per unit per month
  monthly_banking_settlement — settlement flow per unit per month
  banking_account            — banking ledger per unit per month
  generation_readings        — 15-min plant-level generation
  consumption_readings       — 15-min per-unit consumption
  consumption_units          — unit master (code, name, id)
  discom_bill_v2             — view: pivoted bill line items per unit

Charts served:
  Chart 1  — GET /daily-summary          Daily Gen/Cons (31-day)
  Chart 2  — GET /unit-savings           Grid Cost vs Actual Cost per unit
  Chart 4  — GET /tod-analysis           TOD slot breakdown + cost savings
  Chart 5  — GET /unit-savings           (with/without banking columns)
  Chart 6  — GET /discom-bill            DISCOM bill breakdown per unit
  Chart 7  — GET /unit-savings           Summary table (same endpoint)
  Chart 8  — GET /banking-loss           Banking loss per unit
  Chart 10 — GET /wheeling-recon         Wheeling reconciliation
  Chart 11 — GET /surplus-absorption     Energy flow / surplus absorption
  Chart 15 — GET /heatmap                24h x 7-day generation/consumption heatmap
             GET /savings-heatmap        All months x all units savings% grid
"""

from __future__ import annotations
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

router = APIRouter(prefix="/c9", tags=["C9 Dashboard"])

# Tariff rates (Rs/kWh) by consumption_unit_id
# High-tariff units: Malleswaram (4), Sahakar Nagar (6), Old Airport Rd (7), HRBR (8)
_TARIFF = {4: 7.20, 6: 7.20, 7: 7.20, 8: 7.20}   # others -> 5.95 (standard)

# BESCOM actual charge rates (from discom_bill_v2 CSV data)
_FAC_RATE        = 0.39   # Fuel Adjustment Charge per kWh
_PG_RATE         = 0.36   # P&G Surcharge per kWh
_TAX_PCT         = 0.09   # Tax 9%
_WHEELING_RATE   = 0.52   # Manual Wheeling (0.32 + 0.20) per kWh
_CO2_FACTOR      = 0.000716  # tonne CO2 per kWh (BESCOM grid emission factor)
_PPA_RATE        = 1.00   # Solar PPA rate Rs/kWh (C9 contract)


def _to_py(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, Decimal):
        return round(float(v), 4)
    return v


def _row(r: Any) -> dict:
    return {k: _to_py(v) for k, v in dict(r).items()}


def _month_range(month: str) -> tuple[date, date]:
    try:
        d = date.fromisoformat(f"{month}-01")
    except ValueError:
        raise HTTPException(400, f"Invalid month '{month}'. Use YYYY-MM.")
    next_month = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return d, next_month - timedelta(days=1)


def _month_str(month: str) -> date:
    try:
        return date.fromisoformat(f"{month}-01")
    except ValueError:
        raise HTTPException(400, f"Invalid month '{month}'. Use YYYY-MM.")


def _parse_unit_ids(unit_ids: str) -> list[int]:
    """Parse comma-separated unit ID string into list of ints."""
    if not unit_ids:
        return []
    return [int(x) for x in unit_ids.split(",") if x.strip().isdigit()]


def _uid_clause(uid_list: list[int], alias: str = "cu") -> tuple[str, dict]:
    """Return (SQL fragment, params dict) for optional unit_id filter."""
    if uid_list:
        return f"AND {alias}.id = ANY(:unit_ids)", {"unit_ids": uid_list}
    return "", {}


# ---------------------------------------------------------------------------
# KPI Summary (header cards)
# ---------------------------------------------------------------------------

@router.get("/kpi-summary")
async def kpi_summary(
    month: str = Query("2025-08", description="Month in YYYY-MM format"),
    unit_ids: str = Query("", description="Comma-separated unit IDs (empty = all)"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Top-level KPI cards for the selected month."""
    month_date = _month_str(month)
    uid_list = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    sql = text(f"""
        SELECT
            COALESCE(SUM(ss.total_consumption_kwh), 0)  AS total_consumption_kwh,
            COALESCE(SUM(ss.total_matched_kwh), 0)      AS total_matched_kwh,
            COALESCE(SUM(ss.grid_cost_without_re), 0)   AS total_grid_cost_inr,
            COALESCE(SUM(ss.cost_with_banking), 0)      AS total_actual_cost_inr,
            COALESCE(SUM(ss.savings_with_banking), 0)   AS total_savings_inr,
            COALESCE(AVG(ss.replacement_pct), 0)        AS avg_replacement_pct
        FROM savings_summary ss
        JOIN consumption_units cu ON cu.id = ss.consumption_unit_id
        WHERE ss.tenant_id = 1
          AND ss.month = :month
          {uid_sql}
    """)
    params = {"month": month_date, **uid_params}
    row = (await db.execute(sql, params)).mappings().first()

    start, end = _month_range(month)
    gen_sql = text("""
        SELECT COALESCE(SUM(generation_kwh), 0) AS total_gen
        FROM generation_readings
        WHERE tenant_id = 1
          AND slot_start_time::DATE BETWEEN :start AND :end
    """)
    gen_row = (await db.execute(gen_sql, {"start": start, "end": end})).mappings().first()

    # Banking total from banking_account
    try:
        bank_sql = text(f"""
            SELECT COALESCE(SUM(ba.gross_banked_kwh), 0) AS total_banking_kwh
            FROM banking_account ba
            JOIN consumption_units cu ON cu.id = ba.consumption_unit_id
            WHERE ba.tenant_id = 1
              AND ba.month = :month
              {uid_sql}
        """)
        bank_row = (await db.execute(bank_sql, params)).mappings().first()
        total_banking = float(bank_row["total_banking_kwh"] or 0)
    except ProgrammingError:
        total_banking = 0

    total_grid   = float(row["total_grid_cost_inr"] or 0)
    total_actual = float(row["total_actual_cost_inr"] or 0)
    total_match  = float(row["total_matched_kwh"] or 0)
    total_cons   = float(row["total_consumption_kwh"] or 0)
    total_gen    = float(gen_row["total_gen"] or 0)

    replacement_pct = round(total_match / total_cons * 100, 1) if total_cons > 0 else 0
    savings_pct     = round((total_grid - total_actual) / total_grid * 100, 1) if total_grid > 0 else 0
    co2_saved       = round(total_match * _CO2_FACTOR, 2)

    return {
        "month":                 month,
        "total_generation_kwh":  round(total_gen, 0),
        "total_consumption_kwh": round(total_cons, 0),
        "total_matched_kwh":     round(total_match, 0),
        "total_banking_kwh":     round(total_banking, 0),
        "total_grid_cost_inr":   round(total_grid, 0),
        "total_actual_cost_inr": round(total_actual, 0),
        "total_savings_inr":     round(float(row["total_savings_inr"] or 0), 0),
        "savings_pct":           savings_pct,
        "replacement_pct":       replacement_pct,
        "co2_saved_tonnes":      co2_saved,
    }


# ---------------------------------------------------------------------------
# Chart 1 — Daily Generation & Consumption
# ---------------------------------------------------------------------------

@router.get("/daily-summary")
async def daily_summary(
    month: str = Query("2025-08"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Daily totals for the month across all units."""
    start, end = _month_range(month)
    month_date = _month_str(month)

    gen_sql = text("""
        SELECT
            (slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE AS day,
            SUM(generation_kwh) AS gen_kwh
        FROM generation_readings
        WHERE tenant_id = 1
          AND slot_start_time::DATE BETWEEN :start AND :end
        GROUP BY day ORDER BY day
    """)
    gen_rows = {
        str(r["day"]): float(r["gen_kwh"] or 0)
        for r in (await db.execute(gen_sql, {"start": start, "end": end})).mappings().all()
    }

    cons_sql = text("""
        SELECT
            (slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE AS day,
            SUM(consumption_kwh) AS cons_kwh
        FROM consumption_readings
        WHERE tenant_id = 1
          AND slot_start_time::DATE BETWEEN :start AND :end
        GROUP BY day ORDER BY day
    """)
    cons_rows = {
        str(r["day"]): float(r["cons_kwh"] or 0)
        for r in (await db.execute(cons_sql, {"start": start, "end": end})).mappings().all()
    }

    try:
        monthly_sql = text("""
            SELECT
                COALESCE(SUM(total_matched_kwh), 0)    AS total_matched,
                COALESCE(SUM(banking_utilised_kwh), 0) AS total_banking
            FROM monthly_banking_settlement
            WHERE tenant_id = 1
              AND month = :month
              AND tod_slot_id IS NULL
        """)
        mrow = (await db.execute(monthly_sql, {"month": month_date})).mappings().first()
        total_matched = float(mrow["total_matched"] or 0) if mrow else 0
        total_banking = float(mrow["total_banking"] or 0) if mrow else 0
    except ProgrammingError:
        total_matched = 0
        total_banking = 0

    total_gen = sum(gen_rows.values()) or 1
    all_days  = sorted(set(gen_rows.keys()) | set(cons_rows.keys()))
    result    = []
    for day in all_days:
        gen  = gen_rows.get(day, 0)
        cons = cons_rows.get(day, 0)
        share   = gen / total_gen
        matched = round(min(total_matched * share, cons), 2)
        banking = round(min(total_banking * share, max(0, cons - matched)), 2)
        grid    = round(max(0, cons - matched - banking), 2)
        result.append({
            "date":            day,
            "generation_kwh":  round(gen,  2),
            "consumption_kwh": round(cons, 2),
            "matched_kwh":     matched,
            "banking_kwh":     banking,
            "grid_kwh":        grid,
        })
    return result


# ---------------------------------------------------------------------------
# Charts 2, 5, 7 — Unit-wise savings / cost analysis
# ---------------------------------------------------------------------------

@router.get("/unit-savings")
async def unit_savings(
    month: str = Query("2025-08"),
    unit_ids: str = Query("", description="Comma-separated unit IDs (empty = all)"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Per-unit cost breakdown for the selected month from savings_summary."""
    month_date = _month_str(month)
    uid_list = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    try:
        sql = text(f"""
            SELECT
                cu.name                                                     AS unit,
                cu.code                                                     AS unit_code,
                cu.id                                                       AS unit_id,
                ss.grid_cost_without_re                                     AS grid_cost,
                ss.cost_with_banking                                        AS actual_cost_with_banking,
                ss.cost_without_banking                                     AS actual_cost_without_banking,
                ss.savings_with_banking,
                ss.savings_without_banking,
                ROUND(ss.savings_with_banking
                      / NULLIF(ss.grid_cost_without_re, 0) * 100, 1)       AS savings_pct_with_banking,
                ROUND(ss.savings_without_banking
                      / NULLIF(ss.grid_cost_without_re, 0) * 100, 1)       AS savings_pct_without_banking,
                ss.total_consumption_kwh                                    AS consumption_kwh,
                ss.total_matched_kwh                                        AS matched_kwh,
                ss.replacement_pct,
                mbs.banking_utilised_kwh                                    AS banking_kwh,
                mbs.surplus_before_banking_kwh                              AS surplus_kwh,
                GREATEST(ss.total_consumption_kwh - ss.total_matched_kwh, 0) AS grid_drawl_kwh
            FROM savings_summary ss
            JOIN consumption_units cu ON cu.id = ss.consumption_unit_id
            LEFT JOIN monthly_banking_settlement mbs
                   ON mbs.consumption_unit_id = ss.consumption_unit_id
                  AND mbs.month = ss.month
                  AND mbs.tenant_id = ss.tenant_id
                  AND mbs.tod_slot_id IS NULL
            WHERE ss.tenant_id = 1
              AND ss.month = :month
              {uid_sql}
            ORDER BY cu.name
        """)
        params = {"month": month_date, **uid_params}
        rows = (await db.execute(sql, params)).mappings().all()
    except ProgrammingError:
        sql = text(f"""
            SELECT
                cu.name                                                     AS unit,
                cu.code                                                     AS unit_code,
                cu.id                                                       AS unit_id,
                ss.grid_cost_without_re                                     AS grid_cost,
                ss.cost_with_banking                                        AS actual_cost_with_banking,
                ss.cost_without_banking                                     AS actual_cost_without_banking,
                ss.savings_with_banking,
                ss.savings_without_banking,
                ROUND(ss.savings_with_banking
                      / NULLIF(ss.grid_cost_without_re, 0) * 100, 1)       AS savings_pct_with_banking,
                ROUND(ss.savings_without_banking
                      / NULLIF(ss.grid_cost_without_re, 0) * 100, 1)       AS savings_pct_without_banking,
                ss.total_consumption_kwh                                    AS consumption_kwh,
                ss.total_matched_kwh                                        AS matched_kwh,
                ss.replacement_pct,
                0::NUMERIC AS banking_kwh,
                0::NUMERIC AS surplus_kwh,
                GREATEST(ss.total_consumption_kwh - ss.total_matched_kwh, 0) AS grid_drawl_kwh
            FROM savings_summary ss
            JOIN consumption_units cu ON cu.id = ss.consumption_unit_id
            WHERE ss.tenant_id = 1
              AND ss.month = :month
              {uid_sql}
            ORDER BY cu.name
        """)
        params = {"month": month_date, **uid_params}
        rows = (await db.execute(sql, params)).mappings().all()

    return [_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Chart 4 — TOD Analysis
# ---------------------------------------------------------------------------

@router.get("/tod-analysis")
async def tod_analysis(
    month: str = Query("2025-08"),
    unit_ids: str = Query("", description="Comma-separated unit IDs (empty = all)"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """TOD slot breakdown: gen, cons, and estimated cost savings per slot."""
    start, end = _month_range(month)
    uid_list = _parse_unit_ids(unit_ids)
    uid_sql_cons, uid_params = _uid_clause(uid_list, alias="cr")

    # Add consumption unit filter only to consumption_readings (which has unit_id)
    cons_sql = text(f"""
        SELECT
            CASE
                WHEN EXTRACT(HOUR FROM slot_start_time AT TIME ZONE 'Asia/Kolkata') BETWEEN 6 AND 8   THEN 'MORNING_PEAK'
                WHEN EXTRACT(HOUR FROM slot_start_time AT TIME ZONE 'Asia/Kolkata') BETWEEN 9 AND 17  THEN 'DAY_NORMAL'
                WHEN EXTRACT(HOUR FROM slot_start_time AT TIME ZONE 'Asia/Kolkata') BETWEEN 18 AND 21 THEN 'EVENING_PEAK'
                ELSE 'NIGHT_OFF_PEAK'
            END AS tod_slot,
            SUM(consumption_kwh) AS consumption_kwh
        FROM consumption_readings cr
        WHERE cr.tenant_id = 1
          AND cr.slot_start_time::DATE BETWEEN :start AND :end
          {uid_sql_cons.replace('cu.id', 'cr.consumption_unit_id')}
        GROUP BY tod_slot
    """)
    cons_params = {"start": start, "end": end, **uid_params}
    cons_map = {
        r["tod_slot"]: float(r["consumption_kwh"] or 0)
        for r in (await db.execute(cons_sql, cons_params)).mappings().all()
    }

    gen_sql = text("""
        SELECT
            CASE
                WHEN EXTRACT(HOUR FROM slot_start_time AT TIME ZONE 'Asia/Kolkata') BETWEEN 6 AND 8   THEN 'MORNING_PEAK'
                WHEN EXTRACT(HOUR FROM slot_start_time AT TIME ZONE 'Asia/Kolkata') BETWEEN 9 AND 17  THEN 'DAY_NORMAL'
                WHEN EXTRACT(HOUR FROM slot_start_time AT TIME ZONE 'Asia/Kolkata') BETWEEN 18 AND 21 THEN 'EVENING_PEAK'
                ELSE 'NIGHT_OFF_PEAK'
            END AS tod_slot,
            SUM(generation_kwh) AS generation_kwh
        FROM generation_readings
        WHERE tenant_id = 1
          AND slot_start_time::DATE BETWEEN :start AND :end
        GROUP BY tod_slot
    """)
    gen_map = {
        r["tod_slot"]: float(r["generation_kwh"] or 0)
        for r in (await db.execute(gen_sql, {"start": start, "end": end})).mappings().all()
    }

    # Average tariff rate across all units (mix of 7.20 and 5.95)
    avg_rate = 6.40  # Weighted average for BESCOM C9 portfolio

    SLOTS = [
        ("MORNING_PEAK",   "Morning Peak (06-09h)",   1.50),
        ("DAY_NORMAL",     "Day Normal (09-18h)",      1.00),
        ("EVENING_PEAK",   "Evening Peak (18-22h)",    1.50),
        ("NIGHT_OFF_PEAK", "Night Off-Peak (22-06h)",  0.75),
    ]
    result = []
    for code, label, mult in SLOTS:
        gen_kwh  = round(gen_map.get(code,  0), 2)
        cons_kwh = round(cons_map.get(code, 0), 2)
        # Direct match estimate = min(gen, cons); savings = matched * (tariff - PPA)
        direct_matched = round(min(gen_kwh, cons_kwh), 2)
        cost_savings   = round(direct_matched * (avg_rate - _PPA_RATE), 2)
        result.append({
            "tod_slot":         code,
            "slot_label":       label,
            "multiplier":       mult,
            "generation_kwh":   gen_kwh,
            "consumption_kwh":  cons_kwh,
            "direct_matched_kwh": direct_matched,
            "cost_savings_inr": cost_savings,
        })
    return result


# ---------------------------------------------------------------------------
# Chart 6 — DISCOM Bill Breakdown
# ---------------------------------------------------------------------------

@router.get("/discom-bill")
async def discom_bill(
    month: str = Query("2025-08"),
    unit_ids: str = Query("", description="Comma-separated unit IDs (empty = all)"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    DISCOM bill line items per unit.
    Tries discom_bill_v2 view for actual line items; falls back to
    BESCOM-rate estimates (corrected from CSV data) if view unavailable.
    Actual BESCOM rates: FAC Rs0.39/kWh, Tax 9%, P&G Rs0.36/kWh,
    Wheeling Rs0.32+0.20=0.52/kWh.
    """
    month_date = _month_str(month)
    uid_list = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    try:
        # Try joining with discom_bill_v2 view for actual line items
        sql = text(f"""
            SELECT
                cu.name                                                     AS unit_name,
                cu.code                                                     AS unit_code,
                cu.id                                                       AS unit_id,
                ss.grid_cost_without_re                                     AS gross_amount_inr,
                ss.cost_with_banking                                        AS net_payable_inr,
                ss.savings_with_banking                                     AS savings_inr,
                ss.total_consumption_kwh                                    AS total_units_kwh,
                ss.total_matched_kwh                                        AS wheeling_energy_kwh,
                CASE WHEN cu.id IN (4, 6, 7, 8) THEN 7.20 ELSE 5.95 END   AS energy_rate_per_kwh,
                dbv.demand_charge                                            AS demand_charge_inr,
                dbv.fac_charge                                               AS fac_inr,
                dbv.tax                                                      AS tax_inr,
                dbv.pg_surcharge                                             AS pg_surcharge_inr,
                COALESCE(dbv.wheeling_energy_charge, 0)
                  + COALESCE(dbv.manual_wheeling_charge, 0)                 AS wheeling_charge_inr
            FROM savings_summary ss
            JOIN consumption_units cu ON cu.id = ss.consumption_unit_id
            LEFT JOIN discom_bill_v2 dbv
                   ON dbv.unit_id = cu.id AND dbv.month = ss.month
            WHERE ss.tenant_id = 1
              AND ss.month = :month
              {uid_sql}
            ORDER BY cu.name
        """)
        params = {"month": month_date, **uid_params}
        rows = (await db.execute(sql, params)).mappings().all()
        use_view = True
    except ProgrammingError:
        # discom_bill_v2 view not yet created — use savings_summary only
        sql = text(f"""
            SELECT
                cu.name                                                     AS unit_name,
                cu.code                                                     AS unit_code,
                cu.id                                                       AS unit_id,
                ss.grid_cost_without_re                                     AS gross_amount_inr,
                ss.cost_with_banking                                        AS net_payable_inr,
                ss.savings_with_banking                                     AS savings_inr,
                ss.total_consumption_kwh                                    AS total_units_kwh,
                ss.total_matched_kwh                                        AS wheeling_energy_kwh,
                CASE WHEN cu.id IN (4, 6, 7, 8) THEN 7.20 ELSE 5.95 END   AS energy_rate_per_kwh,
                NULL::NUMERIC AS demand_charge_inr,
                NULL::NUMERIC AS fac_inr,
                NULL::NUMERIC AS tax_inr,
                NULL::NUMERIC AS pg_surcharge_inr,
                NULL::NUMERIC AS wheeling_charge_inr
            FROM savings_summary ss
            JOIN consumption_units cu ON cu.id = ss.consumption_unit_id
            WHERE ss.tenant_id = 1
              AND ss.month = :month
              {uid_sql}
            ORDER BY cu.name
        """)
        params = {"month": month_date, **uid_params}
        rows = (await db.execute(sql, params)).mappings().all()
        use_view = False

    result = []
    for r in rows:
        d = dict(r)
        gross        = float(d["gross_amount_inr"] or 0)
        kwh          = float(d["total_units_kwh"] or 0)
        rate         = float(d["energy_rate_per_kwh"])
        wheeling_kwh = float(d["wheeling_energy_kwh"] or 0)

        # Use actual view data if populated; otherwise use corrected BESCOM rate estimates
        energy_charge  = round(kwh * rate, 2)
        demand_charge  = float(d["demand_charge_inr"] or 0) or round(gross * 0.12, 2)
        fac            = float(d["fac_inr"]  or 0) or round(kwh * _FAC_RATE, 2)
        tax            = float(d["tax_inr"]  or 0) or round(gross * _TAX_PCT, 2)
        pg_surcharge   = float(d["pg_surcharge_inr"] or 0) or round(kwh * _PG_RATE, 2)
        wheeling       = float(d["wheeling_charge_inr"] or 0) or round(wheeling_kwh * _WHEELING_RATE, 2)

        result.append({
            "unit_name":           d["unit_name"],
            "unit_code":           d["unit_code"],
            "gross_amount_inr":    round(gross, 2),
            "net_payable_inr":     round(float(d["net_payable_inr"] or 0), 2),
            "savings_inr":         round(float(d["savings_inr"] or 0), 2),
            "total_units_kwh":     round(kwh, 2),
            "energy_rate_per_kwh": rate,
            "energy_charge_inr":   energy_charge,
            "demand_charge_inr":   demand_charge,
            "fac_inr":             fac,
            "tax_inr":             tax,
            "pg_surcharge_inr":    pg_surcharge,
            "wheeling_charge_inr": wheeling,
            "wheeling_energy_kwh": round(wheeling_kwh, 2),
            "data_source":         "actual_bill" if use_view and float(d.get("demand_charge_inr") or 0) > 0 else "estimated",
        })
    return result


# ---------------------------------------------------------------------------
# Chart 8 — Banking Loss per Unit
# ---------------------------------------------------------------------------

@router.get("/banking-loss")
async def banking_loss(
    month: str = Query("2025-08"),
    unit_ids: str = Query("", description="Comma-separated unit IDs (empty = all)"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Per-unit banking loss breakdown from banking_account."""
    month_date = _month_str(month)
    uid_list = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    sql = text(f"""
        SELECT
            cu.name                                                             AS unit,
            cu.code                                                             AS unit_code,
            ba.gross_banked_kwh,
            ROUND(ba.gross_banked_kwh * ba.banking_loss_pct / 100, 2)          AS banking_loss_kwh,
            ROUND(ba.gross_banked_kwh * (1 - ba.banking_loss_pct / 100), 2)    AS net_banked_kwh,
            ba.intra_settled_kwh + ba.inter_settled_kwh                         AS settled_kwh,
            ba.lapsed_kwh                                                        AS expired_kwh,
            ba.closing_balance_kwh,
            ROUND(ba.gross_banked_kwh * ba.banking_loss_pct / 100
                  * CASE WHEN cu.id IN (4,6,7,8) THEN 7.20 ELSE 5.95 END, 2)  AS loss_inr
        FROM banking_account ba
        JOIN consumption_units cu ON cu.id = ba.consumption_unit_id
        WHERE ba.tenant_id = 1
          AND ba.month = :month
          {uid_sql}
        ORDER BY cu.name
    """)
    params = {"month": month_date, **uid_params}
    rows = (await db.execute(sql, params)).mappings().all()
    return [_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Chart 10 — Wheeling Reconciliation
# ---------------------------------------------------------------------------

@router.get("/wheeling-recon")
async def wheeling_recon(
    month: str = Query("2025-08"),
    unit_ids: str = Query("", description="Comma-separated unit IDs (empty = all)"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Proposed vs actual wheeled units; coverage gap per unit."""
    month_date = _month_str(month)
    uid_list = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    try:
        sql = text(f"""
            SELECT
                cu.name                                                             AS unit,
                cu.code                                                             AS unit_code,
                mbs.total_matched_kwh                                               AS proposed_kwh,
                mbs.direct_matched_kwh                                              AS direct_match_kwh,
                mbs.banking_utilised_kwh                                            AS banking_settled_kwh,
                mbs.total_consumption_kwh                                           AS consumption_kwh,
                mbs.unmet_demand_kwh                                                AS gap_kwh,
                ROUND(mbs.unmet_demand_kwh
                      * CASE WHEN cu.id IN (4,6,7,8) THEN 7.20 ELSE 5.95 END, 2)  AS gap_inr,
                CASE
                    WHEN mbs.total_matched_kwh >= mbs.total_consumption_kwh THEN 'FULL_COVER'
                    WHEN mbs.direct_matched_kwh > 0                          THEN 'PARTIAL'
                    ELSE 'GRID_ONLY'
                END AS status
            FROM monthly_banking_settlement mbs
            JOIN consumption_units cu ON cu.id = mbs.consumption_unit_id
            WHERE mbs.tenant_id = 1
              AND mbs.month = :month
              AND mbs.tod_slot_id IS NULL
              {uid_sql}
            ORDER BY cu.name
        """)
        params = {"month": month_date, **uid_params}
        rows = (await db.execute(sql, params)).mappings().all()
    except ProgrammingError:
        rows = []
    return [_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Chart 11 — Surplus & Absorption Flow
# ---------------------------------------------------------------------------

@router.get("/surplus-absorption")
async def surplus_absorption(
    month: str = Query("2025-08"),
    unit_ids: str = Query("", description="Comma-separated unit IDs (empty = all)"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Complete energy flow per unit:
    Generation -> Direct Match + Surplus -> Banked + Lapsed -> Banking Settled.

    Note: surplus_lapsed_kwh = banking credits that expired unused at month end.
          closing_balance_kwh = cumulative unused banking carry-forward to next month.
    """
    month_date = _month_str(month)
    uid_list = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)

    try:
        sql = text(f"""
            SELECT
                cu.name                                AS unit,
                cu.code                                AS unit_code,
                mbs.net_generation_kwh                 AS generation_kwh,
                mbs.total_consumption_kwh              AS consumption_kwh,
                mbs.direct_matched_kwh,
                mbs.surplus_before_banking_kwh         AS gross_surplus_kwh,
                mbs.banking_utilised_kwh               AS banking_settled_kwh,
                mbs.surplus_lapsed_kwh                 AS banking_expired_kwh,
                mbs.unmet_demand_kwh                   AS grid_drawl_kwh,
                mbs.total_matched_kwh,
                ss.replacement_pct,
                ba.closing_balance_kwh
            FROM monthly_banking_settlement mbs
            JOIN consumption_units cu ON cu.id = mbs.consumption_unit_id
            LEFT JOIN savings_summary ss
                   ON ss.consumption_unit_id = mbs.consumption_unit_id
                  AND ss.month = mbs.month
                  AND ss.tenant_id = mbs.tenant_id
            LEFT JOIN banking_account ba
                   ON ba.consumption_unit_id = mbs.consumption_unit_id
                  AND ba.month = mbs.month
                  AND ba.tenant_id = mbs.tenant_id
            WHERE mbs.tenant_id = 1
              AND mbs.month = :month
              AND mbs.tod_slot_id IS NULL
              {uid_sql}
            ORDER BY cu.name
        """)
        params = {"month": month_date, **uid_params}
        rows = (await db.execute(sql, params)).mappings().all()
    except ProgrammingError:
        rows = []
    return [_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Chart 15 — 24h x 7-day Heatmap
# ---------------------------------------------------------------------------

@router.get("/heatmap")
async def heatmap(
    month: str = Query("2025-08"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Average gen/cons per hour-of-day x day-of-week (IST). Returns 24x7 matrices."""
    start, end = _month_range(month)

    cons_sql = text("""
        SELECT
            EXTRACT(HOUR FROM slot_start_time AT TIME ZONE 'Asia/Kolkata')::INT AS hr,
            ((EXTRACT(DOW FROM slot_start_time AT TIME ZONE 'Asia/Kolkata')::INT + 6) % 7) AS dow,
            AVG(consumption_kwh) AS avg_cons
        FROM consumption_readings
        WHERE tenant_id = 1
          AND slot_start_time::DATE BETWEEN :start AND :end
        GROUP BY hr, dow
    """)
    cons_rows = (await db.execute(cons_sql, {"start": start, "end": end})).mappings().all()

    gen_sql = text("""
        SELECT
            EXTRACT(HOUR FROM slot_start_time AT TIME ZONE 'Asia/Kolkata')::INT AS hr,
            ((EXTRACT(DOW FROM slot_start_time AT TIME ZONE 'Asia/Kolkata')::INT + 6) % 7) AS dow,
            AVG(generation_kwh) AS avg_gen
        FROM generation_readings
        WHERE tenant_id = 1
          AND slot_start_time::DATE BETWEEN :start AND :end
        GROUP BY hr, dow
    """)
    gen_rows = (await db.execute(gen_sql, {"start": start, "end": end})).mappings().all()

    cons_map = {(int(r["hr"]), int(r["dow"])): float(r["avg_cons"] or 0) for r in cons_rows}
    gen_map  = {(int(r["hr"]), int(r["dow"])): float(r["avg_gen"]  or 0) for r in gen_rows}

    net_matrix:  list = []
    gen_matrix:  list = []
    cons_matrix: list = []
    for h in range(24):
        net_row, gen_row, cons_row = [], [], []
        for d in range(7):
            g = gen_map.get((h, d))
            c = cons_map.get((h, d))
            if g is None and c is None:
                net_row.append(None); gen_row.append(None); cons_row.append(None)
            else:
                g = g or 0; c = c or 0
                gen_row.append(round(g, 1))
                cons_row.append(round(c, 1))
                net_row.append(round(g - c, 1))
        net_matrix.append(net_row)
        gen_matrix.append(gen_row)
        cons_matrix.append(cons_row)

    return {
        "hours":        list(range(24)),
        "days":         ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "net_matrix":   net_matrix,
        "gen_matrix":   gen_matrix,
        "cons_matrix":  cons_matrix,
    }


# ---------------------------------------------------------------------------
# Savings Heatmap — All months x all units (Chart 3 dedicated endpoint)
# ---------------------------------------------------------------------------

@router.get("/savings-heatmap")
async def savings_heatmap(
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Returns savings% for every unit x every available month.
    Powers Chart 3 (Monthly Savings Heatmap) with a single API call
    instead of N parallel /unit-savings calls.
    """
    try:
        # Try monthly_savings_v2 view first (schema_v2)
        sql = text("""
            SELECT
                cu.name                                                             AS unit,
                cu.code                                                             AS unit_code,
                TO_CHAR(msv.month, 'YYYY-MM')                                      AS month,
                msv.savings_pct_with_banking                                        AS savings_pct,
                msv.savings_with_banking                                            AS savings_inr,
                msv.grid_cost                                                       AS grid_cost_inr,
                msv.consumption                                                     AS consumption_kwh
            FROM monthly_savings_v2 msv
            JOIN consumption_units cu ON cu.id = msv.consumption_unit_id
            WHERE msv.tenant_id = 1
            ORDER BY cu.name, msv.month
        """)
        rows = (await db.execute(sql)).mappings().all()
    except ProgrammingError:
        # Fall back to savings_summary (always available)
        sql = text("""
            SELECT
                cu.name                                                             AS unit,
                cu.code                                                             AS unit_code,
                TO_CHAR(ss.month, 'YYYY-MM')                                        AS month,
                ROUND(ss.savings_with_banking
                      / NULLIF(ss.grid_cost_without_re, 0) * 100, 1)               AS savings_pct,
                ss.savings_with_banking                                             AS savings_inr,
                ss.grid_cost_without_re                                             AS grid_cost_inr,
                ss.total_consumption_kwh                                            AS consumption_kwh
            FROM savings_summary ss
            JOIN consumption_units cu ON cu.id = ss.consumption_unit_id
            WHERE ss.tenant_id = 1
            ORDER BY cu.name, ss.month
        """)
        rows = (await db.execute(sql)).mappings().all()

    return [_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Monthly Aggregate — multi-month trend for Chart 1 Monthly view
# ---------------------------------------------------------------------------

@router.get("/monthly-aggregate")
async def monthly_aggregate(
    from_month: str = Query("2025-08", description="Start month YYYY-MM"),
    to_month:   str = Query("2025-11", description="End month YYYY-MM (inclusive)"),
    unit_ids:   str = Query("", description="Comma-separated unit IDs (empty = all)"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Month-by-month energy flow for the Chart 1 Monthly view.
    Returns one row per calendar month with:
      generation_kwh, consumption_kwh, matched_kwh, banking_kwh,
      grid_kwh, lapsed_kwh, savings_inr, grid_cost_inr, savings_pct.

    Source of truth: monthly_banking_settlement (mbs)
      - matched_kwh  = mbs.direct_matched_kwh
      - banking_kwh  = mbs.banking_utilised_kwh  (withdrawals, not deposits)
      - grid_kwh     = GREATEST(unmet_demand - banking_utilised, 0) per unit, summed
      - lapsed_kwh   = mbs.surplus_lapsed_kwh; fallback via 8% BESCOM banking loss
    Grid and Lapsed are mutually exclusive per month.
    """
    from_date = _month_str(from_month)
    to_d      = _month_str(to_month)
    to_end    = (to_d.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)

    uid_list = _parse_unit_ids(unit_ids)
    uid_sql, uid_params = _uid_clause(uid_list)
    sav_params = {"from_date": from_date, "to_end": to_end, **uid_params}

    # Generation from 15-min plant readings
    gen_sql = text("""
        SELECT
            DATE_TRUNC('month', slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE AS m,
            SUM(generation_kwh) AS gen_kwh
        FROM generation_readings
        WHERE tenant_id = 1
          AND (slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE
              BETWEEN :from_date AND :to_end
        GROUP BY m ORDER BY m
    """)
    gen_map = {
        str(r["m"])[:7]: float(r["gen_kwh"] or 0)
        for r in (await db.execute(gen_sql, {"from_date": from_date, "to_end": to_end})).mappings().all()
    }

    # Cost/savings from savings_summary
    cost_sql = text(f"""
        SELECT
            TO_CHAR(ss.month, 'YYYY-MM')   AS m,
            SUM(ss.grid_cost_without_re)   AS grid_cost_inr,
            SUM(ss.savings_with_banking)   AS savings_inr
        FROM savings_summary ss
        JOIN consumption_units cu ON cu.id = ss.consumption_unit_id
        WHERE ss.tenant_id = 1
          AND ss.month BETWEEN :from_date AND :to_end
          {uid_sql}
        GROUP BY ss.month ORDER BY ss.month
    """)
    cost_map = {
        r["m"]: dict(r)
        for r in (await db.execute(cost_sql, sav_params)).mappings().all()
    }

    # Settlement breakdown from monthly_banking_settlement — single source of truth
    try:
        mbs_sql = text(f"""
            SELECT
                TO_CHAR(mbs.month, 'YYYY-MM')                                   AS m,
                SUM(mbs.total_consumption_kwh)                                   AS cons_kwh,
                SUM(mbs.direct_matched_kwh)                                      AS matched_kwh,
                SUM(mbs.banking_utilised_kwh)                                    AS banking_kwh,
                SUM(COALESCE(mbs.surplus_lapsed_kwh, 0))                        AS lapsed_kwh,
                SUM(GREATEST(
                    mbs.unmet_demand_kwh - COALESCE(mbs.banking_utilised_kwh, 0),
                    0
                ))                                                                AS grid_kwh
            FROM monthly_banking_settlement mbs
            JOIN consumption_units cu ON cu.id = mbs.consumption_unit_id
            WHERE mbs.tenant_id = 1
              AND mbs.month BETWEEN :from_date AND :to_end
              {uid_sql}
            GROUP BY mbs.month ORDER BY mbs.month
        """)
        mbs_map = {
            r["m"]: dict(r)
            for r in (await db.execute(mbs_sql, sav_params)).mappings().all()
        }
    except Exception:
        mbs_map = {}

    result = []
    cur = from_date
    while cur <= to_d:
        key      = cur.strftime("%Y-%m")
        mbs      = mbs_map.get(key, {})
        cost     = cost_map.get(key, {})
        gen_kwh  = gen_map.get(key, 0)
        cons_kwh = float(mbs.get("cons_kwh") or 0)
        matched  = float(mbs.get("matched_kwh") or 0)
        banking  = float(mbs.get("banking_kwh") or 0)
        grid_kwh = float(mbs.get("grid_kwh") or 0)
        lapsed   = float(mbs.get("lapsed_kwh") or 0)

        # Fallback: derive lapsed via BESCOM 8% banking loss when DB value is NULL/0.
        # Only apply when the month has real settlement data (cons_kwh > 0) to avoid
        # inflating months before the system went live (no mbs rows → cons_kwh = 0
        # but generation_readings may still have data, which previously caused
        # lapsed = gen_kwh * 0.92 producing giant phantom bars for Apr–Jul).
        if lapsed == 0 and gen_kwh > 0 and cons_kwh > 0:
            gross_surplus = max(0.0, gen_kwh - matched)
            if gross_surplus > 0:
                lapsed = max(0.0, gross_surplus * 0.92 - banking)

        grid_cost   = float(cost.get("grid_cost_inr") or 0)
        savings     = float(cost.get("savings_inr") or 0)
        savings_pct = round(savings / grid_cost * 100, 1) if grid_cost > 0 else 0

        result.append({
            "month":           key,
            "generation_kwh":  round(gen_kwh, 2),
            "consumption_kwh": round(cons_kwh, 2),
            "matched_kwh":     round(matched, 2),
            "banking_kwh":     round(banking, 2),
            "grid_kwh":        round(grid_kwh, 2),
            "lapsed_kwh":      round(lapsed, 2),
            "grid_cost_inr":   round(grid_cost, 2),
            "savings_inr":     round(savings, 2),
            "savings_pct":     savings_pct,
        })
        cur = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)

    return result
