"""
routes/c9_upload.py
====================
Data upload, export, and unit-list endpoints for the C9 dashboard.

POST /c9/upload         — upload a CSV; auto-detect type and insert to DB
GET  /c9/units          — list all consumption units (for filter UI)
GET  /c9/export/{chart} — download chart data as Excel/CSV
"""

from __future__ import annotations

import io
import csv
import json
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

router = APIRouter(prefix="/c9", tags=["C9 Upload & Export"])
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# helpers (mirror from c9_dashboard.py)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# GET /c9/units  — unit master list for filter UI
# ---------------------------------------------------------------------------

@router.get("/units")
async def list_units(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Return all consumption units for tenant_id=1 (C9)."""
    sql = text("""
        SELECT
            cu.id             AS unit_id,
            cu.code,
            cu.name,
            d.name             AS discom_division,
            cu.tariff_category
        FROM consumption_units cu
        JOIN discoms d ON d.id = cu.discom_id
        WHERE cu.tenant_id = 1
        ORDER BY cu.id
    """)
    rows = (await db.execute(sql)).mappings().all()
    return [_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Column detection helpers for upload
# ---------------------------------------------------------------------------

GENERATION_COLS   = {'slot_start_time', 'slot_end_time', 'generation_kwh'}
CONSUMPTION_COLS  = {'slot_start_time', 'slot_end_time', 'consumption_kwh'}

def _detect_file_type(cols: set[str]) -> str:
    """Return 'generation', 'consumption', or raise."""
    cols_lower = {c.lower().strip() for c in cols}
    if 'generation_kwh' in cols_lower or 'generation' in cols_lower or 'gen_kwh' in cols_lower:
        return 'generation'
    if 'consumption_kwh' in cols_lower or 'consumption' in cols_lower or 'cons_kwh' in cols_lower:
        return 'consumption'
    # Check for date + kwh pattern
    if any('kwh' in c for c in cols_lower):
        if any('gen' in c for c in cols_lower):
            return 'generation'
        return 'consumption'
    raise HTTPException(400, "Cannot detect file type. Expected columns: slot_start_time, slot_end_time, generation_kwh OR consumption_kwh")


def _normalise_col(col: str) -> str:
    """Lowercase, strip, replace spaces/dashes with underscores."""
    return col.lower().strip().replace(' ', '_').replace('-', '_')


# ---------------------------------------------------------------------------
# POST /c9/upload
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_data(
    file: UploadFile = File(...),
    unit_id: Optional[int] = Query(None, description="consumption_unit_id (required for consumption CSVs)"),
    plant_energy_source_id: Optional[int] = Query(None, description="plant_energy_source_id (required for generation CSVs)"),
    tenant_id: int = Query(1),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Upload a CSV of generation or consumption readings.

    Auto-detect file type from column names.
    Insert into generation_readings or consumption_readings.
    Returns a summary of rows inserted.
    """
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(400, "Only .csv files are accepted.")

    raw = await file.read()
    try:
        text_data = raw.decode('utf-8-sig')  # handle BOM
    except UnicodeDecodeError:
        text_data = raw.decode('latin-1')

    df = pd.read_csv(io.StringIO(text_data))
    if df.empty:
        raise HTTPException(400, "CSV file is empty.")

    # Normalise column names
    df.columns = [_normalise_col(c) for c in df.columns]
    file_type = _detect_file_type(set(df.columns))

    rows_inserted = 0
    errors: list[str] = []

    if file_type == 'generation':
        rows_inserted, errors = await _insert_generation(df, tenant_id, plant_energy_source_id, db)
    else:
        if unit_id is None:
            raise HTTPException(400, "unit_id query param is required for consumption CSV uploads.")
        rows_inserted, errors = await _insert_consumption(df, tenant_id, unit_id, db)

    await db.commit()

    return {
        "file": file.filename,
        "detected_type": file_type,
        "rows_processed": len(df),
        "rows_inserted": rows_inserted,
        "errors": errors[:10],  # cap error list
    }


async def _insert_generation(
    df: pd.DataFrame,
    tenant_id: int,
    plant_energy_source_id: Optional[int],
    db: AsyncSession,
) -> tuple[int, list[str]]:
    """Insert rows into generation_readings."""
    # Resolve column aliases
    col_map = {
        'slot_start_time': ['slot_start_time', 'start_time', 'timestamp', 'datetime', 'date_time'],
        'slot_end_time':   ['slot_end_time',   'end_time'],
        'generation_kwh':  ['generation_kwh',  'gen_kwh', 'generation', 'kwh'],
        'plant_energy_source_id': ['plant_energy_source_id', 'source_id', 'plant_id'],
        'device_id': ['device_id'],
        'source_type_id': ['source_type_id'],
        'plant_id': ['plant_id'],
    }
    row_map: dict[str, str] = {}
    for canon, aliases in col_map.items():
        for a in aliases:
            if a in df.columns:
                row_map[canon] = a
                break

    start_col = row_map.get('slot_start_time')
    gen_col   = row_map.get('generation_kwh')
    if not start_col or not gen_col:
        return 0, [f"Missing required columns. Got: {list(df.columns)}"]

    peid = plant_energy_source_id or (int(df[row_map['plant_energy_source_id']].iloc[0]) if 'plant_energy_source_id' in row_map else 1)
    plant_id_col = row_map.get('plant_id')
    device_id_col = row_map.get('device_id')

    inserted = 0
    errors: list[str] = []
    for _, r in df.iterrows():
        try:
            start = pd.to_datetime(r[start_col])
            end   = start + pd.Timedelta(minutes=30)
            if 'slot_end_time' in row_map:
                end = pd.to_datetime(r[row_map['slot_end_time']])
            gen_kwh = float(r[gen_col])
            plant_id = int(r[plant_id_col]) if plant_id_col and pd.notna(r[plant_id_col]) else 1
            device_id = int(r[device_id_col]) if device_id_col and pd.notna(r[device_id_col]) else 1

            await db.execute(text("""
                INSERT INTO generation_readings
                    (tenant_id, plant_id, plant_energy_source_id, device_id, source_type_id,
                     slot_start_time, slot_end_time, generation_kwh, data_source)
                VALUES
                    (:tid, :pid, :peid, :did, 1, :start, :end, :gen, 'upload')
                ON CONFLICT (tenant_id, plant_energy_source_id, device_id, slot_start_time) DO UPDATE
                    SET generation_kwh = EXCLUDED.generation_kwh,
                        data_source    = 'upload'
            """), {
                'tid': tenant_id, 'pid': plant_id, 'peid': peid,
                'did': device_id, 'start': start, 'end': end, 'gen': gen_kwh,
            })
            inserted += 1
        except Exception as e:
            errors.append(str(e)[:120])

    return inserted, errors


async def _insert_consumption(
    df: pd.DataFrame,
    tenant_id: int,
    unit_id: int,
    db: AsyncSession,
) -> tuple[int, list[str]]:
    """Insert rows into consumption_readings."""
    col_map = {
        'slot_start_time': ['slot_start_time', 'start_time', 'timestamp', 'datetime', 'date_time'],
        'slot_end_time':   ['slot_end_time',   'end_time'],
        'consumption_kwh': ['consumption_kwh', 'cons_kwh', 'consumption', 'kwh', 'units'],
    }
    row_map: dict[str, str] = {}
    for canon, aliases in col_map.items():
        for a in aliases:
            if a in df.columns:
                row_map[canon] = a
                break

    start_col = row_map.get('slot_start_time')
    cons_col  = row_map.get('consumption_kwh')
    if not start_col or not cons_col:
        return 0, [f"Missing required columns. Got: {list(df.columns)}"]

    inserted = 0
    errors: list[str] = []
    for _, r in df.iterrows():
        try:
            start = pd.to_datetime(r[start_col])
            end   = start + pd.Timedelta(minutes=30)
            if 'slot_end_time' in row_map:
                end = pd.to_datetime(r[row_map['slot_end_time']])
            cons_kwh = float(r[cons_col])

            await db.execute(text("""
                INSERT INTO consumption_readings
                    (tenant_id, consumption_unit_id, slot_start_time, slot_end_time, consumption_kwh, data_source)
                VALUES
                    (:tid, :uid, :start, :end, :cons, 'upload')
                ON CONFLICT (tenant_id, consumption_unit_id, slot_start_time) DO UPDATE
                    SET consumption_kwh = EXCLUDED.consumption_kwh,
                        data_source     = 'upload'
            """), {
                'tid': tenant_id, 'uid': unit_id,
                'start': start, 'end': end, 'cons': cons_kwh,
            })
            inserted += 1
        except Exception as e:
            errors.append(str(e)[:120])

    return inserted, errors


# ---------------------------------------------------------------------------
# GET /c9/export/{chart}  — download chart data as Excel or CSV
# ---------------------------------------------------------------------------

async def _fetch_chart_data(chart: str, month: str, db: AsyncSession) -> tuple[list[dict], str]:
    """Fetch data for a given chart endpoint key. Returns (rows, sheet_name)."""
    start, end = _month_range(month)
    month_date = _month_str(month)

    queries: dict[str, tuple[str, str]] = {
        "daily-summary": ("""
            SELECT
                (slot_start_time AT TIME ZONE 'Asia/Kolkata')::DATE AS date,
                SUM(generation_kwh) AS generation_kwh
            FROM generation_readings
            WHERE tenant_id=1 AND slot_start_time::DATE BETWEEN :start AND :end
            GROUP BY date ORDER BY date
        """, "Daily Summary"),

        "unit-savings": ("""
            SELECT
                cu.code AS unit_code, cu.name AS unit,
                COALESCE(SUM(ss.total_consumption_kwh),0) AS consumption_kwh,
                COALESCE(SUM(ss.grid_cost_without_re),0) AS grid_cost_inr,
                COALESCE(SUM(ss.cost_with_banking),0) AS actual_cost_inr,
                COALESCE(SUM(ss.savings_with_banking),0) AS savings_inr,
                COALESCE(AVG(ss.replacement_pct),0) AS replacement_pct
            FROM consumption_units cu
            LEFT JOIN savings_summary ss
                ON ss.consumption_unit_id=cu.id AND ss.month=:month AND ss.tenant_id=1
            WHERE cu.tenant_id=1
            GROUP BY cu.id, cu.code, cu.name
            ORDER BY cu.id
        """, "Unit Savings"),

        "tod-analysis": ("""
            SELECT
                tod.slot_name AS tod_slot,
                COALESCE(SUM(mbs.net_generation_kwh),0) AS generation_kwh,
                COALESCE(SUM(mbs.total_consumption_kwh),0) AS consumption_kwh
            FROM monthly_banking_settlement mbs
            JOIN tod_slot_definitions tod ON tod.id=mbs.tod_slot_id
            WHERE mbs.tenant_id=1 AND mbs.month=:month
            GROUP BY tod.slot_name, tod.id
            ORDER BY tod.id
        """, "TOD Analysis"),

        "banking-loss": ("""
            SELECT
                cu.code AS unit_code, cu.name AS unit,
                COALESCE(SUM(ba.gross_banked_kwh),0) AS gross_banked_kwh,
                COALESCE(SUM(ba.gross_banked_kwh * ba.banking_loss_pct / 100),0) AS banking_loss_kwh,
                COALESCE(SUM(ba.intra_settled_kwh + ba.inter_settled_kwh),0) AS settled_kwh,
                COALESCE(SUM(ba.lapsed_kwh),0) AS lapsed_kwh,
                COALESCE(SUM(ba.closing_balance_kwh),0) AS closing_balance_kwh
            FROM consumption_units cu
            LEFT JOIN banking_account ba
                ON ba.consumption_unit_id=cu.id AND ba.month=:month AND ba.tenant_id=1
            WHERE cu.tenant_id=1
            GROUP BY cu.id, cu.code, cu.name
            ORDER BY cu.id
        """, "Banking Loss"),

        "surplus-absorption": ("""
            SELECT
                cu.code AS unit_code, cu.name AS unit,
                COALESCE(SUM(mbs.net_generation_kwh),0) AS generation_kwh,
                COALESCE(SUM(mbs.total_consumption_kwh),0) AS consumption_kwh,
                COALESCE(SUM(mbs.direct_matched_kwh),0) AS direct_matched_kwh,
                COALESCE(SUM(mbs.banking_utilised_kwh),0) AS banking_utilised_kwh,
                COALESCE(SUM(mbs.surplus_lapsed_kwh),0) AS surplus_lapsed_kwh
            FROM consumption_units cu
            LEFT JOIN monthly_banking_settlement mbs
                ON mbs.consumption_unit_id=cu.id AND mbs.month=:month AND mbs.tenant_id=1
            WHERE cu.tenant_id=1
            GROUP BY cu.id, cu.code, cu.name
            ORDER BY cu.id
        """, "Surplus Absorption"),

        "wheeling-recon": ("""
            SELECT
                cu.code AS unit_code, cu.name AS unit,
                COALESCE(SUM(mbs.total_matched_kwh),0) AS matched_kwh,
                COALESCE(SUM(mbs.total_consumption_kwh),0) AS consumption_kwh,
                COALESCE(SUM(mbs.surplus_before_banking_kwh),0) AS surplus_kwh
            FROM consumption_units cu
            LEFT JOIN monthly_banking_settlement mbs
                ON mbs.consumption_unit_id=cu.id AND mbs.month=:month AND mbs.tenant_id=1
            WHERE cu.tenant_id=1
            GROUP BY cu.id, cu.code, cu.name
            ORDER BY cu.id
        """, "Wheeling Recon"),
    }

    if chart not in queries:
        raise HTTPException(404, f"Unknown chart '{chart}'. Available: {list(queries.keys())}")

    sql_str, sheet_name = queries[chart]
    params: dict = {"month": month_date, "start": start, "end": end}

    rows = (await db.execute(text(sql_str), params)).mappings().all()
    return [_row(r) for r in rows], sheet_name


@router.get("/export/{chart}")
async def export_chart(
    chart: str,
    month: str = Query("2025-08"),
    fmt: str = Query("csv", description="'csv' or 'excel'"),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Download chart data as CSV or Excel."""
    data, sheet_name = await _fetch_chart_data(chart, month, db)

    if not data:
        raise HTTPException(404, "No data found for this chart/month combination.")

    df = pd.DataFrame(data)

    if fmt == "excel":
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name=sheet_name[:31])
            ws = writer.sheets[sheet_name[:31]]
            # Auto-fit columns
            for i, col in enumerate(df.columns):
                max_len = max(len(str(col)), df[col].astype(str).str.len().max() or 0) + 2
                ws.set_column(i, i, min(max_len, 40))
        buf.seek(0)
        filename = f"C9_{chart}_{month}.xlsx"
        return StreamingResponse(
            buf,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )
    else:
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        buf.seek(0)
        filename = f"C9_{chart}_{month}.csv"
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode('utf-8-sig')),
            media_type='text/csv',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )
