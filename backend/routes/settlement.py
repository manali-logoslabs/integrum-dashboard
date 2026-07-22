from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import (
    MonthlyBankingSettlement, SlotSummary, TodDailySummary,
    TodSlot, User
)
from schemas import BankingSettlementOut, SlotSummaryOut
from routes.auth import get_current_user

router = APIRouter(prefix="/settlement", tags=["settlement"])


@router.get("/slot-summary", response_model=list[SlotSummaryOut])
async def get_slot_summary(
    plant_id: int,
    summary_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SlotSummary)
        .where(
            SlotSummary.tenant_id == current_user.tenant_id,
            SlotSummary.plant_id == plant_id,
            SlotSummary.summary_date == summary_date,
        )
        .order_by(SlotSummary.summary_time)
    )
    return [SlotSummaryOut.model_validate(r) for r in result.scalars().all()]


@router.get("/banking", response_model=list[BankingSettlementOut])
async def get_banking_settlement(
    plant_id: int,
    month_from: date = Query(...),
    month_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MonthlyBankingSettlement)
        .where(
            MonthlyBankingSettlement.tenant_id == current_user.tenant_id,
            MonthlyBankingSettlement.plant_id == plant_id,
            MonthlyBankingSettlement.settlement_month >= month_from,
            MonthlyBankingSettlement.settlement_month <= month_to,
        )
        .order_by(MonthlyBankingSettlement.settlement_month)
    )
    return [BankingSettlementOut.model_validate(r) for r in result.scalars().all()]


@router.get("/banking/monthly-summary")
async def get_banking_monthly_summary(
    plant_id: int,
    month_from: date = Query(...),
    month_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(
            MonthlyBankingSettlement.settlement_month,
            func.sum(MonthlyBankingSettlement.generation_value).label("total_generation"),
            func.sum(MonthlyBankingSettlement.matched_settlement).label("total_matched"),
            func.sum(MonthlyBankingSettlement.surplus_generation).label("total_surplus"),
            func.sum(MonthlyBankingSettlement.surplus_gen_with_banking).label("surplus_after_banking"),
            func.sum(MonthlyBankingSettlement.surplus_demand).label("total_unmet_demand"),
        )
        .where(
            MonthlyBankingSettlement.tenant_id == current_user.tenant_id,
            MonthlyBankingSettlement.plant_id == plant_id,
            MonthlyBankingSettlement.settlement_month >= month_from,
            MonthlyBankingSettlement.settlement_month <= month_to,
        )
        .group_by(MonthlyBankingSettlement.settlement_month)
        .order_by(MonthlyBankingSettlement.settlement_month)
    )
    return [
        {
            "month": row.settlement_month,
            "total_generation_kwh": float(row.total_generation),
            "total_matched_kwh": float(row.total_matched),
            "total_surplus_kwh": float(row.total_surplus),
            "surplus_after_banking_kwh": float(row.surplus_after_banking),
            "unmet_demand_kwh": float(row.total_unmet_demand),
            "match_rate_pct": round(
                float(row.total_matched) / float(row.total_generation) * 100, 2
            ) if row.total_generation else 0,
        }
        for row in result.all()
    ]


@router.get("/daily-tod")
async def get_daily_tod_summary(
    plant_id: int,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TodDailySummary, TodSlot.slot_code, TodSlot.slot_name)
        .join(TodSlot, TodDailySummary.tod_slot_id == TodSlot.slot_id)
        .where(
            TodDailySummary.tenant_id == current_user.tenant_id,
            TodDailySummary.plant_id == plant_id,
            TodDailySummary.summary_date >= date_from,
            TodDailySummary.summary_date <= date_to,
        )
        .order_by(TodDailySummary.summary_date, TodSlot.slot_code)
    )
    rows = result.all()
    return [
        {
            "date": r.TodDailySummary.summary_date,
            "tod_slot": r.slot_code,
            "tod_slot_name": r.slot_name,
            "generation_kwh": float(r.TodDailySummary.generation_value),
            "consumption_kwh": float(r.TodDailySummary.slot_total_consumption),
            "matched_kwh": float(r.TodDailySummary.matched_settlement),
            "surplus_generation_kwh": float(r.TodDailySummary.surplus_generation),
            "surplus_demand_kwh": float(r.TodDailySummary.surplus_demand),
        }
        for r in rows
    ]
