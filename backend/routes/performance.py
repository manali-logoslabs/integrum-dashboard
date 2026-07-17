from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import PerformanceMetric, DeviceYearlyMetric, EnergySourceType, Device, User
from schemas import PerformanceMetricOut, DeviceMetricOut
from .auth import get_current_user

router = APIRouter(prefix="/performance", tags=["performance"])


@router.get("", response_model=list[PerformanceMetricOut])
async def get_performance(
    plant_id: int,
    financial_year: str | None = Query(None, example="2025-2026"),
    source_type: str | None = Query(None, description="SOLAR or WIND"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(PerformanceMetric, EnergySourceType.code.label("source_code"))
        .join(EnergySourceType)
        .where(
            PerformanceMetric.tenant_id == current_user.tenant_id,
            PerformanceMetric.plant_id == plant_id,
        )
        .order_by(PerformanceMetric.financial_year)
    )
    if financial_year:
        q = q.where(PerformanceMetric.financial_year == financial_year)
    if source_type:
        q = q.where(EnergySourceType.code == source_type.upper())

    result = await db.execute(q)
    out = []
    for row in result.all():
        m = row.PerformanceMetric
        out.append(PerformanceMetricOut(
            metric_id=m.metric_id,
            plant_id=m.plant_id,
            source_type_id=m.source_type_id,
            source_code=row.source_code,
            financial_year=m.financial_year,
            generation_total=m.generation_total,
            plf_percent=m.plf_percent,
            realised_kwh_captive_consumption=m.realised_kwh_captive_consumption,
            sale_of_energy=m.sale_of_energy,
            total_re_percent=m.total_re_percent,
            banking_loss_percent=m.banking_loss_percent,
        ))
    return out


@router.get("/devices", response_model=list[DeviceMetricOut])
async def get_device_metrics(
    plant_id: int,
    financial_year: str | None = Query(None),
    source_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(DeviceYearlyMetric, Device.serial_number, EnergySourceType.code.label("source_code"))
        .join(Device, DeviceYearlyMetric.device_id == Device.device_id)
        .join(EnergySourceType, DeviceYearlyMetric.source_type_id == EnergySourceType.source_type_id)
        .where(
            DeviceYearlyMetric.tenant_id == current_user.tenant_id,
            DeviceYearlyMetric.plant_id == plant_id,
        )
        .order_by(DeviceYearlyMetric.financial_year, EnergySourceType.code, Device.serial_number)
    )
    if financial_year:
        q = q.where(DeviceYearlyMetric.financial_year == financial_year)
    if source_type:
        q = q.where(EnergySourceType.code == source_type.upper())

    result = await db.execute(q)
    out = []
    for row in result.all():
        m = row.DeviceYearlyMetric
        out.append(DeviceMetricOut(
            device_metric_id=m.device_metric_id,
            device_id=m.device_id,
            serial_number=row.serial_number,
            source_code=row.source_code,
            financial_year=m.financial_year,
            generation_total=m.generation_total,
            plf_percent=m.plf_percent,
            availability_pct=m.availability_pct,
        ))
    return out


@router.get("/plf-summary")
async def get_plf_summary(
    plant_id: int,
    financial_year: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PerformanceMetric, EnergySourceType.code.label("source_code"))
        .join(EnergySourceType)
        .where(
            PerformanceMetric.tenant_id == current_user.tenant_id,
            PerformanceMetric.plant_id == plant_id,
            PerformanceMetric.financial_year == financial_year,
        )
    )
    rows = result.all()
    return {
        "plant_id": plant_id,
        "financial_year": financial_year,
        "sources": [
            {
                "source": row.source_code,
                "plf_percent": float(row.PerformanceMetric.plf_percent),
                "generation_total_kwh": float(row.PerformanceMetric.generation_total),
                "re_percent": float(row.PerformanceMetric.total_re_percent),
                "banking_loss_pct": float(row.PerformanceMetric.banking_loss_percent),
            }
            for row in rows
        ],
    }
