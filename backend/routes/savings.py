from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import SavingsSummary, EffectiveRateSummary, DiscomBill, GridCostComponent, ReCostComponent, User
from schemas import SavingsSummaryOut, EffectiveRateOut, DiscomBillOut, GridCostOut, ReCostOut, SavingsAggregate
from .auth import get_current_user

router = APIRouter(prefix="/savings", tags=["savings"])


@router.get("", response_model=list[SavingsSummaryOut])
async def get_savings(
    plant_id: int | None = Query(None),
    month_from: date = Query(...),
    month_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(SavingsSummary).where(
        SavingsSummary.tenant_id == current_user.tenant_id,
        SavingsSummary.settlement_month >= month_from,
        SavingsSummary.settlement_month <= month_to,
    ).order_by(SavingsSummary.settlement_month)
    if plant_id:
        q = q.where(SavingsSummary.plant_id == plant_id)
    result = await db.execute(q)
    return [SavingsSummaryOut.model_validate(r) for r in result.scalars().all()]


@router.get("/aggregate", response_model=SavingsAggregate)
async def get_savings_aggregate(
    plant_id: int | None = Query(None),
    month_from: date = Query(...),
    month_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(
        func.sum(SavingsSummary.grid_cost).label("total_grid_cost"),
        func.sum(SavingsSummary.savings_with_banking).label("total_savings"),
        func.avg(SavingsSummary.savings_pct_with_banking).label("avg_savings_pct"),
        func.sum(SavingsSummary.total_consumption).label("total_consumption_kwh"),
        func.count().label("months_count"),
    ).where(
        SavingsSummary.tenant_id == current_user.tenant_id,
        SavingsSummary.settlement_month >= month_from,
        SavingsSummary.settlement_month <= month_to,
    )
    if plant_id:
        q = q.where(SavingsSummary.plant_id == plant_id)
    result = await db.execute(q)
    row = result.one()
    return SavingsAggregate(
        total_grid_cost=row.total_grid_cost or 0,
        total_savings=row.total_savings or 0,
        avg_savings_pct=row.avg_savings_pct or 0,
        total_consumption_kwh=row.total_consumption_kwh or 0,
        months_count=row.months_count or 0,
    )


@router.get("/effective-rate", response_model=list[EffectiveRateOut])
async def get_effective_rate(
    plant_id: int,
    month_from: date = Query(...),
    month_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EffectiveRateSummary).where(
            EffectiveRateSummary.tenant_id == current_user.tenant_id,
            EffectiveRateSummary.plant_id == plant_id,
            EffectiveRateSummary.billing_month >= month_from,
            EffectiveRateSummary.billing_month <= month_to,
        ).order_by(EffectiveRateSummary.billing_month)
    )
    return [EffectiveRateOut.model_validate(r) for r in result.scalars().all()]


@router.get("/discom-bills", response_model=list[DiscomBillOut])
async def get_discom_bills(
    plant_id: int,
    month_from: date = Query(...),
    month_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DiscomBill).where(
            DiscomBill.tenant_id == current_user.tenant_id,
            DiscomBill.plant_id == plant_id,
            DiscomBill.month >= month_from,
            DiscomBill.month <= month_to,
        ).order_by(DiscomBill.month)
    )
    return [DiscomBillOut.model_validate(r) for r in result.scalars().all()]


@router.get("/grid-cost", response_model=list[GridCostOut])
async def get_grid_cost(
    plant_id: int,
    month_from: date = Query(...),
    month_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(GridCostComponent).where(
            GridCostComponent.tenant_id == current_user.tenant_id,
            GridCostComponent.plant_id == plant_id,
            GridCostComponent.month >= month_from,
            GridCostComponent.month <= month_to,
        ).order_by(GridCostComponent.month)
    )
    return [GridCostOut.model_validate(r) for r in result.scalars().all()]


@router.get("/re-cost", response_model=list[ReCostOut])
async def get_re_cost(
    plant_id: int,
    month_from: date = Query(...),
    month_to: date = Query(...),
    source_type_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(ReCostComponent).where(
        ReCostComponent.tenant_id == current_user.tenant_id,
        ReCostComponent.plant_id == plant_id,
        ReCostComponent.month >= month_from,
        ReCostComponent.month <= month_to,
    ).order_by(ReCostComponent.month)
    if source_type_id:
        q = q.where(ReCostComponent.source_type_id == source_type_id)
    result = await db.execute(q)
    return [ReCostOut.model_validate(r) for r in result.scalars().all()]
