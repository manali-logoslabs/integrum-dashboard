"""
routes/gil_dashboard.py
=======================
All dashboard endpoints for the GIL client (MSEDCL, Hybrid Wind+Solar, Maharashtra).

Tables used (Schema v2):
  generation_readings        slot_start_time, generation_kwh, generation_before_losses_kwh
  consumption_readings       slot_start_time, consumption_kwh
  plant_energy_sources       source_type_id → energy_source_types.code ('WIND'/'SOLAR')
  energy_source_types        code ('WIND', 'SOLAR')
  devices                    device_code, capacity_kw, serial_number
  device_yearly_metrics      generation_kwh, plf_pct
  monthly_banking_settlement net_generation_kwh, total_consumption_kwh, direct_matched_kwh,
                             banking_utilised_kwh, intra_month_banking_kwh, total_matched_kwh,
                             surplus_before_banking_kwh, surplus_lapsed_kwh, unmet_demand_kwh
  savings_summary            grid_cost_without_re, re_cost, cost_with_banking,
                             cost_without_banking, savings_with_banking, savings_without_banking,
                             total_consumption_kwh, total_matched_kwh, replacement_pct
  performance_metrics        gross_generation_kwh, net_generation_kwh, generation_losses_kwh,
                             plf_pct, pr_pct, availability_pct
  grid_bill_headers          billing_period_from, gross_amount_inr, net_payable_inr
  grid_bill_line_items       charge_head_id, units_kwh, rate, amount_without_re, amount_with_re
  re_bill_headers            billing_period_from, total_amount_inr
  re_bill_line_items         charge_head_id, units_kwh, rate, amount_inr
  charge_head_types          code, name, category, sort_order
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

router = APIRouter(prefix="/gil", tags=["GIL Dashboard"])

# ── GIL constants ─────────────────────────────────────────────────────────────
_GIL_TENANT_ID = 2          # GIL tenant id in Schema v2
_CO2_FACTOR    = 0.000820   # tonne CO₂/kWh Maharashtra grid emission factor
_MSEDCL_RATE   = 9.2423     # Rs/kWh effective (derived from Aug-2025 actuals)
_PPA_RATE      = 2.50       # Rs/kWh Hybrid RE PPA rate
_DEMAND_RATE   = 320.0      # Rs/kVA/month MSEDCL demand charge
_FAC_RATE      = 0.15       # Rs/kWh Fuel Adjustment Charge
_TAX_PCT       = 0.16       # 16% electricity duty + cess (Maharashtra)
_WHEELING_RATE = 0.65       # Rs/kWh MSEDCL wheeling

# MSEDCL 3-slot definitions (for display labelling)
_MSEDCL_TOD = [
    ("PEAK",     "Peak (06-10h & 18-22h)",   1.25),
    ("NORMAL",   "Normal (10-18h)",            1.00),
    ("OFF_PEAK", "Off-Peak (22-06h)",           0.50),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_py(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return round(float(v), 4)
    return v


def _row(r: Any) -> dict:
    return {k: _to_py(v) for k, v in dict(r).items()}


def _month_str(month: str) -> date:
    try:
        return date.fromisoformat(f"{month}-01")
    except ValueError:
        raise HTTPException(400, f"Invalid month '{month}'. Use YYYY-MM.")


def _month_range(month: str) -> tuple[date, date]:
    d = _month_str(month)
    nxt = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return d, nxt - timedelta(days=1)


def _msedcl_tod_case(hour_expr: str) -> str:
    return f"""
        CASE
            WHEN ({hour_expr}) BETWEEN 6  AND 9  THEN 'PEAK'
            WHEN ({hour_expr}) BETWEEN 10 AND 17 THEN 'NORMAL'
            WHEN ({hour_expr}) BETWEEN 18 AND 21 THEN 'PEAK'
            ELSE 'OFF_PEAK'
        END
    """


# ─────────────────────────────────────────────────────────────────────────────
# G1 — KPI Summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/kpi-summary")
async def kpi_summary(
    month: str = Query("2025-08", description="Month YYYY-MM"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Top-level KPI cards for GIL — generation, savings, CO₂, replacement %."""
    month_date = _month_str(month)
    start, end = _month_range(month)
    TID = _GIL_TENANT_ID

    # Savings summary
    ss_sql = text("""
        SELECT
            COALESCE(SUM(ss.total_consumption_kwh), 0)   AS total_consumption_kwh,
            COALESCE(SUM(ss.total_matched_kwh), 0)       AS total_matched_kwh,
            COALESCE(SUM(ss.grid_cost_without_re), 0)    AS total_grid_cost_inr,
            COALESCE(SUM(ss.cost_with_banking), 0)        AS total_actual_cost_inr,
            COALESCE(SUM(ss.savings_with_banking), 0)     AS total_savings_inr,
            COALESCE(AVG(ss.replacement_pct), 0)          AS avg_replacement_pct
        FROM savings_summary ss
        WHERE ss.tenant_id = :tid AND ss.month = :month
    """)
    ss_row = (await db.execute(ss_sql, {"tid": TID, "month": month_date})).mappings().first()

    # Generation split by source type
    gen_sql = text("""
        SELECT
            COALESCE(SUM(gr.generation_kwh), 0) AS total_gen_kwh,
            COALESCE(SUM(gr.generation_before_losses_kwh), 0) AS total_gen_before_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'WIND'  THEN gr.generation_kwh ELSE 0 END), 0) AS wind_gen_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'SOLAR' THEN gr.generation_kwh ELSE 0 END), 0) AS solar_gen_kwh
        FROM generation_readings gr
        JOIN plant_energy_sources pes ON pes.id = gr.plant_energy_source_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE gr.tenant_id = :tid
          AND gr.slot_start_time::DATE BETWEEN :start AND :end
    """)
    gen_row = (await db.execute(gen_sql, {"tid": TID, "start": start, "end": end})).mappings().first()

    # Banking totals (aggregate row only)
    bank_sql = text("""
        SELECT
            COALESCE(SUM(mbs.surplus_before_banking_kwh), 0) AS gross_surplus_kwh,
            COALESCE(SUM(mbs.banking_utilised_kwh), 0)       AS banking_utilised_kwh,
            COALESCE(SUM(mbs.surplus_lapsed_kwh), 0)         AS banking_expired_kwh,
            COALESCE(SUM(mbs.intra_month_banking_kwh), 0)    AS intra_monthly_banking_kwh,
            COALESCE(SUM(mbs.direct_matched_kwh), 0)         AS tod_daily_banking_kwh
        FROM monthly_banking_settlement mbs
        WHERE mbs.tenant_id = :tid
          AND mbs.month = :month
          AND mbs.tod_slot_id IS NULL
    """)
    bank_row = (await db.execute(bank_sql, {"tid": TID, "month": month_date})).mappings().first()

    total_grid   = float(ss_row["total_grid_cost_inr"] or 0)
    total_actual = float(ss_row["total_actual_cost_inr"] or 0)
    total_match  = float(ss_row["total_matched_kwh"] or 0)
    total_cons   = float(ss_row["total_consumption_kwh"] or 0)
    total_gen    = float(gen_row["total_gen_kwh"] or 0)
    gen_before   = float(gen_row["total_gen_before_kwh"] or 0)
    wind_gen     = float(gen_row["wind_gen_kwh"] or 0)
    solar_gen    = float(gen_row["solar_gen_kwh"] or 0)

    savings_pct     = round((total_grid - total_actual) / total_grid * 100, 1) if total_grid > 0 else 0
    replacement_pct = round(total_match / total_cons * 100, 1) if total_cons > 0 else 0
    co2_saved       = round(total_match * _CO2_FACTOR, 2)
    total_losses    = round(gen_before - total_gen, 0) if gen_before > 0 else 0
    losses_pct      = round(total_losses / gen_before * 100, 2) if gen_before > 0 else 0

    result: dict = {
        "month":                               month,
        "total_generation_kwh":                round(total_gen, 0),
        "total_generation_before_losses_kwh":  round(gen_before, 0),
        "wind_generation_kwh":                 round(wind_gen, 0),
        "solar_generation_kwh":                round(solar_gen, 0),
        "wind_pct":                            round(wind_gen / total_gen * 100, 1) if total_gen > 0 else 0,
        "solar_pct":                           round(solar_gen / total_gen * 100, 1) if total_gen > 0 else 0,
        "total_consumption_kwh":               round(total_cons, 0),
        "total_matched_kwh":                   round(total_match, 0),
        "total_grid_cost_inr":                 round(total_grid, 0),
        "total_actual_cost_inr":               round(total_actual, 0),
        "total_savings_inr":                   round(float(ss_row["total_savings_inr"] or 0), 0),
        "savings_pct":                         savings_pct,
        "replacement_pct":                     replacement_pct,
        "co2_saved_tonnes":                    co2_saved,
        "generation_losses_kwh":               total_losses,
        "generation_losses_pct":               losses_pct,
    }
    if bank_row:
        result.update({
            "gross_surplus_kwh":         round(float(bank_row["gross_surplus_kwh"] or 0), 0),
            "banking_utilised_kwh":      round(float(bank_row["banking_utilised_kwh"] or 0), 0),
            "banking_expired_kwh":       round(float(bank_row["banking_expired_kwh"] or 0), 0),
            "tod_daily_banking_kwh":     round(float(bank_row["tod_daily_banking_kwh"] or 0), 0),
            "intra_monthly_banking_kwh": round(float(bank_row["intra_monthly_banking_kwh"] or 0), 0),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# G2 — Monthly Gen + Cons Trend
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/monthly-summary")
async def monthly_summary(
    months: int = Query(13, description="Number of recent months"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Last N months of generation, consumption and savings."""
    TID = _GIL_TENANT_ID

    ss_sql = text("""
        SELECT
            TO_CHAR(ss.month, 'YYYY-MM')                          AS month,
            COALESCE(ss.total_consumption_kwh, 0)                 AS consumption_kwh,
            COALESCE(ss.total_matched_kwh, 0)                     AS matched_kwh,
            COALESCE(ss.grid_cost_without_re, 0)                  AS grid_cost_inr,
            COALESCE(ss.cost_with_banking, 0)                     AS actual_cost_inr,
            COALESCE(ss.savings_with_banking, 0)                  AS savings_inr,
            ROUND(ss.savings_with_banking
                  / NULLIF(ss.grid_cost_without_re, 0) * 100, 1) AS savings_pct,
            COALESCE(ss.replacement_pct, 0)                       AS replacement_pct
        FROM savings_summary ss
        WHERE ss.tenant_id = :tid
        ORDER BY ss.month DESC
        LIMIT :months
    """)
    rows = (await db.execute(ss_sql, {"tid": TID, "months": months})).mappings().all()
    if not rows:
        return []

    month_list = [str(r["month"]) for r in rows]
    oldest, newest = month_list[-1], month_list[0]

    gen_sql = text("""
        SELECT
            TO_CHAR(DATE_TRUNC('month', slot_start_time AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
            COALESCE(SUM(gr.generation_kwh), 0)                                                  AS generation_kwh,
            COALESCE(SUM(gr.generation_before_losses_kwh), 0)                                   AS gen_before_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'WIND'  THEN gr.generation_kwh ELSE 0 END), 0)    AS wind_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'SOLAR' THEN gr.generation_kwh ELSE 0 END), 0)    AS solar_kwh
        FROM generation_readings gr
        JOIN plant_energy_sources pes ON pes.id = gr.plant_energy_source_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE gr.tenant_id = :tid
          AND (slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE
              BETWEEN (:oldest || '-01')::DATE
              AND (DATE_TRUNC('month', (:newest || '-01')::DATE + INTERVAL '1 month') - INTERVAL '1 day')::DATE
        GROUP BY 1
    """)
    gen_map = {
        r["month"]: dict(r)
        for r in (await db.execute(gen_sql, {"tid": TID, "oldest": oldest, "newest": newest})).mappings().all()
    }

    result = []
    for r in reversed(rows):
        m   = str(r["month"])
        gen = gen_map.get(m, {})
        result.append({
            "month":                        m,
            "generation_kwh":               round(float(gen.get("generation_kwh", 0) or 0), 0),
            "generation_before_losses_kwh": round(float(gen.get("gen_before_kwh", 0) or 0), 0),
            "wind_kwh":                     round(float(gen.get("wind_kwh", 0) or 0), 0),
            "solar_kwh":                    round(float(gen.get("solar_kwh", 0) or 0), 0),
            "consumption_kwh":              round(float(r["consumption_kwh"] or 0), 0),
            "matched_kwh":                  round(float(r["matched_kwh"] or 0), 0),
            "grid_cost_inr":                round(float(r["grid_cost_inr"] or 0), 0),
            "actual_cost_inr":              round(float(r["actual_cost_inr"] or 0), 0),
            "savings_inr":                  round(float(r["savings_inr"] or 0), 0),
            "savings_pct":                  float(r["savings_pct"] or 0),
            "replacement_pct":              float(r["replacement_pct"] or 0),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# G3 — Wind vs Solar Monthly Split
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/wind-solar-split")
async def wind_solar_split(
    months: int = Query(13, description="Number of recent months"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Monthly wind and solar generation for last N months."""
    TID = _GIL_TENANT_ID

    sql = text("""
        SELECT
            TO_CHAR(DATE_TRUNC('month', slot_start_time AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
            COALESCE(SUM(CASE WHEN est.code = 'WIND'  THEN gr.generation_kwh ELSE 0 END), 0) AS wind_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'SOLAR' THEN gr.generation_kwh ELSE 0 END), 0) AS solar_kwh,
            COALESCE(SUM(gr.generation_kwh), 0) AS total_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'WIND'  THEN gr.generation_before_losses_kwh ELSE 0 END), 0) AS wind_before_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'SOLAR' THEN gr.generation_before_losses_kwh ELSE 0 END), 0) AS solar_before_kwh
        FROM generation_readings gr
        JOIN plant_energy_sources pes ON pes.id = gr.plant_energy_source_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE gr.tenant_id = :tid
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT :months
    """)
    rows = (await db.execute(sql, {"tid": TID, "months": months})).mappings().all()

    result = []
    for r in reversed(rows):
        total     = float(r["total_kwh"] or 0)
        wind_kwh  = float(r["wind_kwh"] or 0)
        solar_kwh = float(r["solar_kwh"] or 0)
        result.append({
            "month":                  str(r["month"]),
            "wind_kwh":               round(wind_kwh, 0),
            "solar_kwh":              round(solar_kwh, 0),
            "total_kwh":              round(total, 0),
            "wind_pct":               round(wind_kwh / total * 100, 1) if total > 0 else 0,
            "solar_pct":              round(solar_kwh / total * 100, 1) if total > 0 else 0,
            "wind_before_losses_kwh": round(float(r["wind_before_kwh"] or 0), 0),
            "solar_before_losses_kwh":round(float(r["solar_before_kwh"] or 0), 0),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# G4 — TOD Analysis (MSEDCL 3-slot)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/tod-analysis")
async def tod_analysis(
    month: str = Query("2025-08"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """MSEDCL 3-slot TOD breakdown for the month from monthly_banking_settlement."""
    month_date = _month_str(month)
    TID = _GIL_TENANT_ID

    # Use per-slot banking rows (tod_slot_id IS NOT NULL)
    sql = text("""
        SELECT
            tsd.slot_code                                               AS tod_slot,
            COALESCE(SUM(mbs.net_generation_kwh), 0)                   AS generation_kwh,
            COALESCE(SUM(mbs.total_consumption_kwh), 0)                AS consumption_kwh,
            COALESCE(SUM(mbs.direct_matched_kwh), 0)                   AS direct_matched_kwh,
            COALESCE(SUM(mbs.banking_utilised_kwh), 0)                 AS banking_kwh,
            COALESCE(SUM(mbs.unmet_demand_kwh), 0)                     AS grid_drawl_kwh,
            COALESCE(SUM(mbs.total_matched_kwh), 0)                    AS total_matched_kwh
        FROM monthly_banking_settlement mbs
        JOIN tod_slot_definitions tsd ON tsd.id = mbs.tod_slot_id
        WHERE mbs.tenant_id = :tid
          AND mbs.month = :month
          AND mbs.tod_slot_id IS NOT NULL
        GROUP BY tsd.slot_code
    """)
    tod_rows = (await db.execute(sql, {"tid": TID, "month": month_date})).mappings().all()
    tod_map = {r["tod_slot"]: dict(r) for r in tod_rows}

    if not tod_map:
        # Fallback: compute from raw 15-min readings
        hour_expr = "EXTRACT(HOUR FROM slot_start_time AT TIME ZONE 'Asia/Kolkata')::INT"
        tod_case  = _msedcl_tod_case(hour_expr)
        start, end = _month_range(month)

        gen_sql = text(f"""
            SELECT {tod_case} AS tod_slot, COALESCE(SUM(generation_kwh), 0) AS gen_kwh
            FROM generation_readings
            WHERE tenant_id = :tid AND slot_start_time::DATE BETWEEN :start AND :end
            GROUP BY 1
        """)
        cons_sql = text(f"""
            SELECT {tod_case} AS tod_slot, COALESCE(SUM(consumption_kwh), 0) AS cons_kwh
            FROM consumption_readings
            WHERE tenant_id = :tid AND slot_start_time::DATE BETWEEN :start AND :end
            GROUP BY 1
        """)
        gen_map  = {r["tod_slot"]: float(r["gen_kwh"]  or 0) for r in (await db.execute(gen_sql,  {"tid": TID, "start": start, "end": end})).mappings()}
        cons_map = {r["tod_slot"]: float(r["cons_kwh"] or 0) for r in (await db.execute(cons_sql, {"tid": TID, "start": start, "end": end})).mappings()}
        for slot_code, _, _ in _MSEDCL_TOD:
            g = gen_map.get(slot_code, 0)
            c = cons_map.get(slot_code, 0)
            tod_map[slot_code] = {
                "tod_slot": slot_code, "generation_kwh": g, "consumption_kwh": c,
                "direct_matched_kwh": min(g, c), "banking_kwh": 0,
                "grid_drawl_kwh": max(0, c - g), "total_matched_kwh": min(g, c),
            }

    result = []
    for slot_code, slot_label, tod_mult in _MSEDCL_TOD:
        d       = tod_map.get(slot_code, {})
        gen_kwh = round(float(d.get("generation_kwh", 0) or 0), 0)
        cons    = round(float(d.get("consumption_kwh", 0) or 0), 0)
        matched = round(float(d.get("total_matched_kwh", 0) or 0), 0)
        banking = round(float(d.get("banking_kwh", 0) or 0), 0)
        grid    = round(float(d.get("grid_drawl_kwh", 0) or max(0, cons - matched)), 0)
        tod_rate = _MSEDCL_RATE * tod_mult
        result.append({
            "tod_slot":           slot_code,
            "slot_label":         slot_label,
            "tod_multiplier":     tod_mult,
            "effective_rate":     round(tod_rate, 2),
            "generation_kwh":     gen_kwh,
            "consumption_kwh":    cons,
            "direct_matched_kwh": round(float(d.get("direct_matched_kwh", 0) or 0), 0),
            "banking_kwh":        banking,
            "grid_drawl_kwh":     grid,
            "total_matched_kwh":  matched,
            "cost_savings_inr":   round(matched * (tod_rate - _PPA_RATE), 0),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# G5 — 3-Tier Banking Settlement
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/banking-settlement")
async def banking_settlement(
    month: str = Query("2025-08"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    MSEDCL 3-tier banking settlement:
      Tier 1 (Daily TOD)       = direct_matched_kwh
      Tier 2 (Monthly TOD)     = banking_utilised_kwh - intra_month_banking_kwh
      Tier 3 (Intra-monthly)   = intra_month_banking_kwh
    """
    month_date = _month_str(month)
    TID = _GIL_TENANT_ID

    sql = text("""
        SELECT
            COALESCE(SUM(mbs.net_generation_kwh), 0)          AS net_generation_kwh,
            COALESCE(SUM(mbs.total_consumption_kwh), 0)       AS total_consumption_kwh,
            COALESCE(SUM(mbs.direct_matched_kwh), 0)          AS direct_matched_kwh,
            COALESCE(SUM(mbs.banking_utilised_kwh), 0)        AS total_banking_utilised_kwh,
            COALESCE(SUM(mbs.intra_month_banking_kwh), 0)     AS intra_monthly_kwh,
            COALESCE(SUM(mbs.surplus_before_banking_kwh), 0)  AS surplus_before_banking_kwh,
            COALESCE(SUM(mbs.surplus_lapsed_kwh), 0)          AS banking_expired_kwh,
            COALESCE(SUM(mbs.unmet_demand_kwh), 0)            AS unmet_demand_kwh,
            COALESCE(SUM(mbs.total_matched_kwh), 0)           AS total_matched_kwh
        FROM monthly_banking_settlement mbs
        WHERE mbs.tenant_id = :tid
          AND mbs.month = :month
          AND mbs.tod_slot_id IS NULL
    """)
    row = (await db.execute(sql, {"tid": TID, "month": month_date})).mappings().first()

    if not row or not row["net_generation_kwh"]:
        return {"month": month, "no_data": True}

    net_gen  = float(row["net_generation_kwh"] or 0)
    total_con = float(row["total_consumption_kwh"] or 0)
    tier1    = float(row["direct_matched_kwh"] or 0)           # Daily TOD
    total_bk = float(row["total_banking_utilised_kwh"] or 0)
    tier3    = float(row["intra_monthly_kwh"] or 0)            # Intra-monthly
    tier2    = round(total_bk - tier3, 0)                       # Monthly TOD
    surplus  = float(row["surplus_before_banking_kwh"] or 0)
    expired  = float(row["banking_expired_kwh"] or 0)
    unmet    = float(row["unmet_demand_kwh"] or 0)
    matched  = float(row["total_matched_kwh"] or 0)

    tier1_savings = round(tier1 * (_MSEDCL_RATE * 1.25 - _PPA_RATE), 0)
    tier2_savings = round(tier2 * (_MSEDCL_RATE * 1.00 - _PPA_RATE), 0)
    tier3_savings = round(tier3 * (_MSEDCL_RATE * 0.90 - _PPA_RATE), 0)

    return {
        "month":                      month,
        "net_generation_kwh":         round(net_gen, 0),
        "total_consumption_kwh":      round(total_con, 0),
        "direct_matched_kwh":         round(tier1, 0),
        "surplus_before_banking_kwh": round(surplus, 0),
        "tier1_tod_daily_kwh":        round(tier1, 0),
        "tier2_tod_monthly_kwh":      round(tier2, 0),
        "tier3_intra_monthly_kwh":    round(tier3, 0),
        "total_banking_utilised_kwh": round(total_bk, 0),
        "banking_expired_kwh":        round(expired, 0),
        "unmet_demand_kwh":           round(unmet, 0),
        "total_matched_kwh":          round(matched, 0),
        "tier1_savings_inr":          tier1_savings,
        "tier2_savings_inr":          tier2_savings,
        "tier3_savings_inr":          tier3_savings,
        "total_banking_savings_inr":  round(tier1_savings + tier2_savings + tier3_savings, 0),
        "replacement_pct":            round(matched / total_con * 100, 1) if total_con > 0 else 0,
        "banking_efficiency_pct":     round(total_bk / surplus * 100, 1) if surplus > 0 else 0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# G6 — Cost Comparison Trend
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/cost-comparison")
async def cost_comparison(
    months: int = Query(13, description="Number of recent months"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Monthly grid cost vs actual RE cost for last N months."""
    TID = _GIL_TENANT_ID

    sql = text("""
        SELECT
            TO_CHAR(ss.month, 'YYYY-MM')                                  AS month,
            COALESCE(ss.grid_cost_without_re, 0)                          AS grid_cost_inr,
            COALESCE(ss.cost_with_banking, 0)                             AS actual_cost_inr,
            COALESCE(ss.cost_without_banking, 0)                          AS cost_without_banking_inr,
            COALESCE(ss.savings_with_banking, 0)                          AS savings_with_banking_inr,
            COALESCE(ss.savings_without_banking, 0)                       AS savings_without_banking_inr,
            ROUND(ss.savings_with_banking
                  / NULLIF(ss.grid_cost_without_re, 0) * 100, 1)         AS savings_pct_with_banking,
            ROUND(ss.savings_without_banking
                  / NULLIF(ss.grid_cost_without_re, 0) * 100, 1)         AS savings_pct_without_banking,
            COALESCE(ss.total_consumption_kwh, 0)                         AS consumption_kwh,
            COALESCE(ss.total_matched_kwh, 0)                             AS matched_kwh
        FROM savings_summary ss
        WHERE ss.tenant_id = :tid
        ORDER BY ss.month DESC
        LIMIT :months
    """)
    rows = (await db.execute(sql, {"tid": TID, "months": months})).mappings().all()
    return [_row(r) for r in reversed(rows)]


# ─────────────────────────────────────────────────────────────────────────────
# G7 — MSEDCL Bill Breakdown
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/discom-bill")
async def discom_bill(
    month: str = Query("2025-08"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """MSEDCL bill line items — actual data if available, else estimated from savings_summary."""
    month_date = _month_str(month)
    TID = _GIL_TENANT_ID

    # Try actual bill data
    bill_sql = text("""
        SELECT
            cht.name                                              AS charge_head,
            cht.category                                          AS category,
            gli.amount_without_re                                 AS amount_inr,
            gli.units_kwh                                         AS quantity_kwh,
            gli.units_kvah                                        AS quantity_kvah,
            gli.rate                                              AS rate,
            gbh.gross_amount_inr,
            gbh.net_payable_inr
        FROM grid_bill_headers gbh
        JOIN grid_bill_line_items gli ON gli.bill_header_id = gbh.id
        JOIN charge_head_types cht    ON cht.id = gli.charge_head_id
        WHERE gbh.tenant_id = :tid
          AND DATE_TRUNC('month', gbh.billing_period_from) = :month
        ORDER BY cht.sort_order
    """)
    try:
        rows = (await db.execute(bill_sql, {"tid": TID, "month": month_date})).mappings().all()
        if rows:
            gross   = float(rows[0]["gross_amount_inr"] or 0)
            net_pay = float(rows[0]["net_payable_inr"] or 0)
            return {
                "month":                  month,
                "total_payable_inr":      round(gross, 0),
                "net_payable_after_re":   round(net_pay, 0),
                "savings_inr":            round(gross - net_pay, 0),
                "line_items": [
                    {
                        "charge_head": r["charge_head"],
                        "category":    r["category"],
                        "amount_inr":  round(float(r["amount_inr"] or 0), 2),
                        "quantity":    _to_py(r.get("quantity_kwh") or r.get("quantity_kvah")),
                        "rate":        _to_py(r["rate"]),
                    }
                    for r in rows
                ],
                "data_source": "actual_bill",
            }
    except ProgrammingError:
        pass

    # Fallback: estimate from savings_summary
    ss_sql = text("""
        SELECT
            COALESCE(ss.grid_cost_without_re, 0) AS grid_cost_inr,
            COALESCE(ss.cost_with_banking, 0)     AS actual_cost_inr,
            COALESCE(ss.savings_with_banking, 0)  AS savings_inr,
            COALESCE(ss.total_consumption_kwh, 0) AS consumption_kwh,
            COALESCE(ss.total_matched_kwh, 0)     AS matched_kwh
        FROM savings_summary ss
        WHERE ss.tenant_id = :tid AND ss.month = :month
    """)
    ss_row = (await db.execute(ss_sql, {"tid": TID, "month": month_date})).mappings().first()
    if not ss_row:
        return {"month": month, "no_data": True}

    gross   = float(ss_row["grid_cost_inr"] or 0)
    kwh     = float(ss_row["consumption_kwh"] or 0)
    whl_kwh = float(ss_row["matched_kwh"] or 0)
    return {
        "month":             month,
        "total_payable_inr": round(gross, 0),
        "net_payable_after_re": round(float(ss_row["actual_cost_inr"] or 0), 0),
        "savings_inr":       round(float(ss_row["savings_inr"] or 0), 0),
        "line_items": [
            {"charge_head": "Energy Charges (kVAh)",   "category": "ENERGY",   "amount_inr": round(kwh * _MSEDCL_RATE, 0)},
            {"charge_head": "Demand Charges",          "category": "DEMAND",   "amount_inr": round(gross * 0.15, 0)},
            {"charge_head": "Fuel Adjustment Charge",  "category": "FAC",      "amount_inr": round(kwh * _FAC_RATE, 0)},
            {"charge_head": "Wheeling Charges",        "category": "WHEELING", "amount_inr": round(whl_kwh * _WHEELING_RATE, 0)},
            {"charge_head": "Electricity Duty & Cess", "category": "TAX",      "amount_inr": round(gross * _TAX_PCT, 0)},
            {"charge_head": "TOS Charges",             "category": "TOS",      "amount_inr": round(gross * 0.01, 0)},
        ],
        "data_source": "estimated",
    }


# ─────────────────────────────────────────────────────────────────────────────
# G8 — RE Cost Breakdown
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/re-costs")
async def re_costs(
    month: str = Query("2025-08"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """RE plant cost components (OM, wheeling, MSEDCL charges, etc.)."""
    month_date = _month_str(month)
    TID = _GIL_TENANT_ID

    # Try actual RE bill
    re_sql = text("""
        SELECT
            cht.name                AS charge_head,
            cht.category            AS category,
            rli.amount_inr          AS amount_inr,
            rli.units_kwh           AS quantity_kwh,
            rli.rate                AS rate,
            rbh.total_amount_inr    AS total_re_cost_inr
        FROM re_bill_headers rbh
        JOIN re_bill_line_items rli ON rli.re_bill_header_id = rbh.id
        JOIN charge_head_types cht  ON cht.id = rli.charge_head_id
        WHERE rbh.tenant_id = :tid
          AND DATE_TRUNC('month', rbh.billing_period_from) = :month
        ORDER BY cht.sort_order
    """)
    try:
        rows = (await db.execute(re_sql, {"tid": TID, "month": month_date})).mappings().all()
        if rows:
            total_re = float(rows[0]["total_re_cost_inr"] or 0)
            gen_sql = text("""
                SELECT COALESCE(SUM(generation_kwh), 0) AS gen_kwh
                FROM generation_readings
                WHERE tenant_id = :tid
                  AND DATE_TRUNC('month', slot_start_time AT TIME ZONE 'Asia/Kolkata') = :month
            """)
            gen_row = (await db.execute(gen_sql, {"tid": TID, "month": month_date})).mappings().first()
            gen_kwh = float(gen_row["gen_kwh"] or 0) if gen_row else 0
            return {
                "month":             month,
                "total_re_cost_inr": round(total_re, 0),
                "per_unit_cost":     round(total_re / gen_kwh, 4) if gen_kwh > 0 else None,
                "generation_kwh":    round(gen_kwh, 0),
                "line_items": [
                    {"charge_head": r["charge_head"], "category": r["category"],
                     "amount_inr":  round(float(r["amount_inr"] or 0), 2),
                     "quantity":    _to_py(r["quantity_kwh"]), "rate": _to_py(r["rate"])}
                    for r in rows
                ],
                "data_source": "actual_bill",
            }
    except ProgrammingError:
        pass

    # Fallback: estimate from savings_summary.re_cost
    ss_sql = text("""
        SELECT COALESCE(SUM(ss.re_cost), 0) AS total_re_cost,
               COALESCE(SUM(ss.total_matched_kwh), 0) AS matched_kwh
        FROM savings_summary ss
        WHERE ss.tenant_id = :tid AND ss.month = :month
    """)
    ss_row = (await db.execute(ss_sql, {"tid": TID, "month": month_date})).mappings().first()
    total_re = float(ss_row["total_re_cost"] or 0) if ss_row else 0
    matched  = float(ss_row["matched_kwh"] or 0) if ss_row else 0

    if total_re == 0:
        total_re = round(matched * _PPA_RATE, 0)

    return {
        "month":             month,
        "total_re_cost_inr": round(total_re, 0),
        "per_unit_cost":     round(total_re / matched, 4) if matched > 0 else _PPA_RATE,
        "generation_kwh":    round(matched, 0),
        "line_items": [
            {"charge_head": "Asset Maintenance Charges",  "category": "ASSET_MC",                  "amount_inr": round(total_re * 0.45, 0)},
            {"charge_head": "Operating Charges (MSEDCL)", "category": "OPERATING_CHARGES_MSEDCL",  "amount_inr": round(total_re * 0.20, 0)},
            {"charge_head": "OA Application Charges",     "category": "OA_APPLICATION_CHARGES",    "amount_inr": round(total_re * 0.05, 0)},
            {"charge_head": "Startup Power Bill",         "category": "STARTUP_POWER_BILL",        "amount_inr": round(total_re * 0.10, 0)},
            {"charge_head": "GST Reversal",               "category": "GST_REVERSAL",              "amount_inr": round(total_re * 0.12, 0)},
            {"charge_head": "TOS-RE Charges",             "category": "TOS_RE_CHARGES",            "amount_inr": round(total_re * 0.08, 0)},
        ],
        "data_source": "estimated",
    }


# ─────────────────────────────────────────────────────────────────────────────
# G9 — Per-Turbine Performance
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/turbine-performance")
async def turbine_performance(
    financial_year: str = Query("2025-2026"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Per-device annual performance from device_yearly_metrics, falls back to generation_readings."""
    TID = _GIL_TENANT_ID

    try:
        fy_start_year = int(financial_year.split("-")[0])
    except (ValueError, IndexError):
        raise HTTPException(400, f"Invalid financial_year '{financial_year}'.")
    fy_start = date(fy_start_year, 4, 1)
    fy_end   = date(fy_start_year + 1, 3, 31)

    # Primary: device_yearly_metrics
    dym_sql = text("""
        SELECT
            d.device_code                                          AS device_code,
            est.code                                               AS source_type,
            d.capacity_kw                                          AS rated_capacity_kw,
            d.serial_number,
            dym.generation_kwh,
            dym.plf_pct,
            dym.availability_pct,
            dym.pr_pct,
            dym.p50_generation_kwh
        FROM device_yearly_metrics dym
        JOIN devices              d   ON d.id   = dym.device_id
        JOIN plant_energy_sources pes ON pes.id = d.plant_energy_source_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE dym.tenant_id = :tid
          AND dym.financial_year = :fy
        ORDER BY est.code, d.device_code
    """)
    rows = (await db.execute(dym_sql, {"tid": TID, "fy": financial_year})).mappings().all()
    if rows:
        return [_row(r) for r in rows]

    # Fallback: aggregate from generation_readings
    gen_sql = text("""
        SELECT
            d.device_code                                                    AS device_code,
            est.code                                                         AS source_type,
            d.capacity_kw                                                    AS rated_capacity_kw,
            d.serial_number,
            COALESCE(SUM(gr.generation_kwh), 0)                             AS generation_kwh,
            COALESCE(SUM(gr.generation_before_losses_kwh), 0)               AS gen_before_kwh,
            COALESCE(SUM(gr.generation_before_losses_kwh)
                     - SUM(gr.generation_kwh), 0)                           AS losses_kwh
        FROM generation_readings gr
        JOIN devices              d   ON d.id   = gr.device_id
        JOIN plant_energy_sources pes ON pes.id = d.plant_energy_source_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE gr.tenant_id = :tid
          AND gr.slot_start_time::DATE BETWEEN :start AND :end
        GROUP BY d.device_code, est.code, d.capacity_kw, d.serial_number
        ORDER BY est.code, d.device_code
    """)
    rows = (await db.execute(gen_sql, {"tid": TID, "start": fy_start, "end": fy_end})).mappings().all()
    result = []
    hours = (fy_end - fy_start).days * 24
    for r in rows:
        gen_kwh  = float(r["generation_kwh"] or 0)
        cap_kw   = float(r["rated_capacity_kw"] or 0)
        plf      = round(gen_kwh / (cap_kw * hours) * 100, 2) if cap_kw > 0 and hours > 0 else None
        result.append({
            "device_code":       r["device_code"],
            "source_type":       r["source_type"],
            "rated_capacity_kw": cap_kw,
            "serial_number":     r["serial_number"],
            "generation_kwh":    round(gen_kwh, 0),
            "gen_before_kwh":    round(float(r["gen_before_kwh"] or 0), 0),
            "losses_kwh":        round(float(r["losses_kwh"] or 0), 0),
            "plf_pct":           plf,
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# G10 — Generation Losses (before vs after)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/generation-losses")
async def generation_losses(
    months: int = Query(13, description="Number of recent months"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Monthly before-loss vs after-loss generation — wind and solar split."""
    TID = _GIL_TENANT_ID

    sql = text("""
        SELECT
            TO_CHAR(DATE_TRUNC('month', gr.slot_start_time AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
            COALESCE(SUM(CASE WHEN est.code = 'WIND'
                THEN gr.generation_before_losses_kwh ELSE 0 END), 0) AS wind_before_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'WIND'
                THEN gr.generation_kwh ELSE 0 END), 0)               AS wind_after_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'SOLAR'
                THEN gr.generation_before_losses_kwh ELSE 0 END), 0) AS solar_before_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'SOLAR'
                THEN gr.generation_kwh ELSE 0 END), 0)               AS solar_after_kwh,
            COALESCE(SUM(gr.generation_before_losses_kwh), 0)        AS total_before_kwh,
            COALESCE(SUM(gr.generation_kwh), 0)                      AS total_after_kwh
        FROM generation_readings gr
        JOIN plant_energy_sources pes ON pes.id = gr.plant_energy_source_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE gr.tenant_id = :tid
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT :months
    """)
    rows = (await db.execute(sql, {"tid": TID, "months": months})).mappings().all()

    result = []
    for r in reversed(rows):
        wb  = float(r["wind_before_kwh"] or 0)
        wa  = float(r["wind_after_kwh"] or 0)
        sb  = float(r["solar_before_kwh"] or 0)
        sa  = float(r["solar_after_kwh"] or 0)
        tb  = float(r["total_before_kwh"] or 0)
        ta  = float(r["total_after_kwh"] or 0)
        result.append({
            "month":                   str(r["month"]),
            "wind_before_losses_kwh":  round(wb, 0),
            "wind_after_losses_kwh":   round(wa, 0),
            "wind_losses_kwh":         round(wb - wa, 0),
            "wind_losses_pct":         round((wb - wa) / wb * 100, 2) if wb > 0 else 0,
            "solar_before_losses_kwh": round(sb, 0),
            "solar_after_losses_kwh":  round(sa, 0),
            "solar_losses_kwh":        round(sb - sa, 0),
            "solar_losses_pct":        round((sb - sa) / sb * 100, 2) if sb > 0 else 0,
            "total_before_losses_kwh": round(tb, 0),
            "total_after_losses_kwh":  round(ta, 0),
            "total_losses_kwh":        round(tb - ta, 0),
            "total_losses_pct":        round((tb - ta) / tb * 100, 2) if tb > 0 else 0,
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# G11 — Annual Performance Metrics
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/performance-metrics")
async def performance_metrics(
    financial_year: str = Query("2025-2026"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Plant-level annual performance: PLF, generation, losses by source type."""
    TID = _GIL_TENANT_ID

    try:
        fy_start_year = int(financial_year.split("-")[0])
    except (ValueError, IndexError):
        raise HTTPException(400, f"Invalid financial_year '{financial_year}'.")
    fy_start = date(fy_start_year, 4, 1)
    fy_end   = date(fy_start_year + 1, 3, 31)

    # Try performance_metrics table
    pm_sql = text("""
        SELECT
            est.code                                   AS source_type,
            pm.financial_year,
            pm.gross_generation_kwh,
            pm.net_generation_kwh,
            pm.generation_losses_kwh,
            pm.plf_pct,
            pm.pr_pct,
            pm.availability_pct,
            pm.realised_cap_consumption_kwh,
            pm.over_injection_kwh,
            pm.sale_of_energy_kwh,
            pm.total_plant_consumption_kwh,
            pm.total_re_consumption_kwh,
            pm.replacement_pct
        FROM performance_metrics pm
        JOIN plant_energy_sources pes ON pes.id = pm.plant_energy_source_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE pm.tenant_id = :tid AND pm.financial_year = :fy
    """)
    pm_rows = (await db.execute(pm_sql, {"tid": TID, "fy": financial_year})).mappings().all()
    if pm_rows:
        wind_row  = next((r for r in pm_rows if r["source_type"] == "WIND"),  None)
        solar_row = next((r for r in pm_rows if r["source_type"] == "SOLAR"), None)
        return {
            "financial_year": financial_year,
            "wind":  _row(wind_row)  if wind_row  else None,
            "solar": _row(solar_row) if solar_row else None,
            "total_generation_kwh": sum(
                float(r["net_generation_kwh"] or 0) for r in pm_rows
            ),
            "total_plant_consumption_kwh": float(
                (wind_row or pm_rows[0])["total_plant_consumption_kwh"] or 0
            ),
            "data_source": "performance_metrics",
        }

    # Fallback: compute from generation_readings
    gen_sql = text("""
        SELECT
            est.code                                                         AS source_type,
            COALESCE(SUM(gr.generation_kwh), 0)                             AS gen_kwh,
            COALESCE(SUM(gr.generation_before_losses_kwh), 0)               AS gen_before_kwh
        FROM generation_readings gr
        JOIN plant_energy_sources pes ON pes.id = gr.plant_energy_source_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE gr.tenant_id = :tid
          AND gr.slot_start_time::DATE BETWEEN :start AND :end
        GROUP BY est.code
    """)
    cap_sql = text("""
        SELECT
            est.code                                                          AS source_type,
            COALESCE(SUM(pes.installed_capacity_kw), 0)                      AS capacity_kw
        FROM plant_energy_sources pes
        JOIN plants               p   ON p.id   = pes.plant_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE p.tenant_id = :tid
        GROUP BY est.code
    """)
    gen_rows = {r["source_type"]: dict(r) for r in (await db.execute(gen_sql, {"tid": TID, "start": fy_start, "end": fy_end})).mappings()}
    cap_rows = {r["source_type"]: float(r["capacity_kw"] or 0) for r in (await db.execute(cap_sql, {"tid": TID})).mappings()}

    hours  = (fy_end - fy_start).days * 24
    result = {"financial_year": financial_year, "data_source": "computed_from_readings"}
    for src in ("WIND", "SOLAR"):
        g  = gen_rows.get(src, {})
        cap = cap_rows.get(src, 0)
        gen = float(g.get("gen_kwh", 0) or 0)
        bef = float(g.get("gen_before_kwh", 0) or 0)
        plf = round(gen / (cap * hours) * 100, 2) if cap > 0 and hours > 0 else None
        result[src.lower()] = {
            "source_type":           src,
            "net_generation_kwh":    round(gen, 0),
            "gross_generation_kwh":  round(bef, 0),
            "generation_losses_kwh": round(bef - gen, 0),
            "losses_pct":            round((bef - gen) / bef * 100, 2) if bef > 0 else 0,
            "plf_pct":               plf,
            "installed_capacity_kw": cap,
        }
    result["total_generation_kwh"] = sum(
        float(g.get("gen_kwh", 0) or 0) for g in gen_rows.values()
    )
    return result


# ─────────────────────────────────────────────────────────────────────────────
# G12 — Savings Heatmap (all months)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/savings-heatmap")
async def savings_heatmap(
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """All months of savings data for GIL heatmap."""
    TID = _GIL_TENANT_ID

    sql = text("""
        SELECT
            TO_CHAR(ss.month, 'YYYY-MM')                                  AS month,
            COALESCE(ss.total_consumption_kwh, 0)                         AS consumption_kwh,
            COALESCE(ss.total_matched_kwh, 0)                             AS matched_kwh,
            COALESCE(ss.grid_cost_without_re, 0)                          AS grid_cost_inr,
            COALESCE(ss.cost_with_banking, 0)                             AS actual_cost_inr,
            COALESCE(ss.savings_with_banking, 0)                          AS savings_inr,
            ROUND(ss.savings_with_banking
                  / NULLIF(ss.grid_cost_without_re, 0) * 100, 1)         AS savings_pct,
            COALESCE(ss.replacement_pct, 0)                               AS replacement_pct
        FROM savings_summary ss
        WHERE ss.tenant_id = :tid
        ORDER BY ss.month ASC
    """)
    rows = (await db.execute(sql, {"tid": TID})).mappings().all()
    return [_row(r) for r in rows]


# ─────────────────────────────────────────────────────────────────────────────
# Daily Generation & Consumption (time-series charts)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/daily-summary")
async def daily_summary(
    month: str = Query("2025-08"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Daily generation (wind + solar split) and consumption for the month."""
    start, end = _month_range(month)
    TID = _GIL_TENANT_ID

    gen_sql = text("""
        SELECT
            (slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE                 AS day,
            COALESCE(SUM(gr.generation_kwh), 0)                                 AS gen_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'WIND'  THEN gr.generation_kwh ELSE 0 END), 0) AS wind_kwh,
            COALESCE(SUM(CASE WHEN est.code = 'SOLAR' THEN gr.generation_kwh ELSE 0 END), 0) AS solar_kwh
        FROM generation_readings gr
        JOIN plant_energy_sources pes ON pes.id = gr.plant_energy_source_id
        JOIN energy_source_types  est ON est.id = pes.source_type_id
        WHERE gr.tenant_id = :tid
          AND (slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY day ORDER BY day
    """)
    cons_sql = text("""
        SELECT
            (slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE AS day,
            COALESCE(SUM(consumption_kwh), 0)                   AS cons_kwh
        FROM consumption_readings
        WHERE tenant_id = :tid
          AND (slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN :start AND :end
        GROUP BY day ORDER BY day
    """)

    gen_map  = {str(r["day"]): dict(r) for r in (await db.execute(gen_sql, {"tid": TID, "start": start, "end": end})).mappings()}
    cons_map = {str(r["day"]): float(r["cons_kwh"] or 0) for r in (await db.execute(cons_sql, {"tid": TID, "start": start, "end": end})).mappings()}

    result = []
    for day in sorted(set(gen_map) | set(cons_map)):
        g    = gen_map.get(day, {})
        cons = cons_map.get(day, 0)
        gen  = float(g.get("gen_kwh", 0) or 0)
        result.append({
            "date":            day,
            "generation_kwh":  round(gen, 2),
            "wind_kwh":        round(float(g.get("wind_kwh", 0) or 0), 2),
            "solar_kwh":       round(float(g.get("solar_kwh", 0) or 0), 2),
            "consumption_kwh": round(cons, 2),
            "matched_kwh":     round(min(gen, cons), 2),
            "grid_kwh":        round(max(0, cons - gen), 2),
        })
    return result
