from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import GenerationReading, EnergySourceType, Device, Plant, User
from schemas import GenerationReadingOut, GenerationSummary, GenerationByDay
from .auth import get_current_user

router = APIRouter(prefix="/generation", tags=["generation"])


@router.get("", response_model=list[GenerationReadingOut])
async def get_readings(
    plant_id: int | None = Query(None),
    source_type: str | None = Query(None, description="SOLAR or WIND"),
    date_from: date = Query(...),
    date_to: date = Query(...),
    device_id: int | None = Query(None),
    limit: int = Query(1000, le=5000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(GenerationReading)
        .where(
            GenerationReading.tenant_id == current_user.tenant_id,
            GenerationReading.reading_date >= date_from,
            GenerationReading.reading_date <= date_to,
        )
        .order_by(GenerationReading.reading_date, GenerationReading.reading_time)
        .limit(limit)
    )
    if plant_id:
        q = q.where(GenerationReading.plant_id == plant_id)
    if device_id:
        q = q.where(GenerationReading.device_id == device_id)
    if source_type:
        q = q.join(EnergySourceType).where(EnergySourceType.code == source_type.upper())

    result = await db.execute(q)
    return [GenerationReadingOut.model_validate(r) for r in result.scalars().all()]


@router.get("/daily", response_model=list[GenerationByDay])
async def get_daily_generation(
    plant_id: int,
    date_from: date = Query(...),
    date_to: date = Query(...),
    source_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(
            GenerationReading.reading_date,
            EnergySourceType.code.label("source_code"),
            func.sum(GenerationReading.generation_value).label("total_kwh"),
            func.sum(GenerationReading.generation_before_losses).label("gross_kwh"),
        )
        .join(EnergySourceType)
        .where(
            GenerationReading.tenant_id == current_user.tenant_id,
            GenerationReading.plant_id == plant_id,
            GenerationReading.reading_date >= date_from,
            GenerationReading.reading_date <= date_to,
        )
        .group_by(GenerationReading.reading_date, EnergySourceType.code)
        .order_by(GenerationReading.reading_date)
    )
    if source_type:
        q = q.where(EnergySourceType.code == source_type.upper())

    result = await db.execute(q)
    return [
        GenerationByDay(
            reading_date=row.reading_date,
            source_code=row.source_code,
            total_kwh=row.total_kwh,
            gross_kwh=row.gross_kwh,
        )
        for row in result.all()
    ]


@router.get("/monthly", response_model=list[GenerationSummary])
async def get_monthly_generation(
    plant_id: int,
    year: int | None = Query(None),
    source_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(
            func.date_trunc("month", GenerationReading.reading_date).label("month"),
            EnergySourceType.code.label("source_code"),
            func.sum(GenerationReading.generation_value).label("total_generation_kwh"),
            func.sum(GenerationReading.generation_before_losses).label("gross_generation_kwh"),
            func.sum(
                GenerationReading.generation_before_losses - GenerationReading.generation_value
            ).label("total_losses_kwh"),
            func.count(func.distinct(GenerationReading.reading_date)).label("days_with_data"),
        )
        .join(EnergySourceType)
        .where(
            GenerationReading.tenant_id == current_user.tenant_id,
            GenerationReading.plant_id == plant_id,
        )
        .group_by(
            func.date_trunc("month", GenerationReading.reading_date),
            EnergySourceType.code,
        )
        .order_by(func.date_trunc("month", GenerationReading.reading_date))
    )
    if year:
        q = q.where(func.extract("year", GenerationReading.reading_date) == year)
    if source_type:
        q = q.where(EnergySourceType.code == source_type.upper())

    result = await db.execute(q)
    return [
        GenerationSummary(
            month=row.month,
            source_code=row.source_code,
            total_generation_kwh=row.total_generation_kwh,
            gross_generation_kwh=row.gross_generation_kwh,
            total_losses_kwh=row.total_losses_kwh,
            days_with_data=row.days_with_data,
        )
        for row in result.all()
    ]


@router.get("/compare", summary="Compare Solar vs Wind generation")
async def compare_sources(
    plant_id: int,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(
            EnergySourceType.code.label("source"),
            func.sum(GenerationReading.generation_value).label("total_kwh"),
            func.sum(GenerationReading.generation_before_losses).label("gross_kwh"),
            func.count(func.distinct(GenerationReading.device_id)).label("device_count"),
        )
        .join(EnergySourceType)
        .where(
            GenerationReading.tenant_id == current_user.tenant_id,
            GenerationReading.plant_id == plant_id,
            GenerationReading.reading_date >= date_from,
            GenerationReading.reading_date <= date_to,
        )
        .group_by(EnergySourceType.code)
    )
    result = await db.execute(q)
    rows = result.all()
    total = sum(r.total_kwh for r in rows) or 1
    return [
        {
            "source": r.source,
            "total_kwh": float(r.total_kwh),
            "gross_kwh": float(r.gross_kwh),
            "losses_kwh": float(r.gross_kwh - r.total_kwh),
            "share_pct": round(float(r.total_kwh) / float(total) * 100, 2),
            "device_count": r.device_count,
        }
        for r in rows
    ]
