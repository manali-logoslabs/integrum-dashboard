"""Pydantic v2 request/response schemas for all API endpoints."""
from datetime import datetime, date, time
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, EmailStr, field_validator


# ── AUTH ──────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserOut"

class UserOut(BaseModel):
    user_id: int
    tenant_id: int
    username: str
    full_name: str | None
    email: str | None
    role: str
    model_config = {"from_attributes": True}


# ── ENERGY SOURCE TYPES ───────────────────────────────────────

class EnergySourceTypeOut(BaseModel):
    source_type_id: int
    code: str
    name: str
    unit: str
    description: str | None
    model_config = {"from_attributes": True}


# ── TENANTS ───────────────────────────────────────────────────

class TenantCreate(BaseModel):
    tenant_code: str
    name: str
    org_type: str | None = None
    state: str | None = None
    discom: str | None = None
    gstin: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None

class TenantOut(BaseModel):
    tenant_id: int
    tenant_code: str
    name: str
    org_type: str | None
    state: str | None
    discom: str | None
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── PLANTS ────────────────────────────────────────────────────

class PlantEnergySourceOut(BaseModel):
    plant_source_id: int
    source_type_id: int
    source_code: str
    source_name: str
    installed_capacity_mw: Decimal
    is_active: bool
    model_config = {"from_attributes": True}

class PlantCreate(BaseModel):
    plant_code: str
    plant_name: str
    location: str | None = None
    state: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    total_capacity_mw: Decimal | None = None
    commissioning_date: date | None = None
    energy_sources: list[dict] = []  # [{"source_type_id": 1, "installed_capacity_mw": 2.5}]

class PlantOut(BaseModel):
    plant_id: int
    tenant_id: int
    plant_code: str
    plant_name: str
    location: str | None
    state: str | None
    total_capacity_mw: Decimal | None
    status: str
    has_solar: bool = False
    has_wind: bool = False
    plant_type: str = "UNKNOWN"  # SOLAR / WIND / HYBRID
    energy_sources: list[PlantEnergySourceOut] = []
    model_config = {"from_attributes": True}


# ── DEVICES ───────────────────────────────────────────────────

class DeviceOut(BaseModel):
    device_id: int
    plant_id: int
    source_type_id: int
    serial_number: str
    device_name: str | None
    device_model: str | None
    capacity_kw: Decimal | None
    status: str
    model_config = {"from_attributes": True}


# ── GENERATION ────────────────────────────────────────────────

class GenerationReadingOut(BaseModel):
    reading_id: int
    plant_id: int
    device_id: int
    source_type_id: int
    reading_date: date
    reading_time: time
    generation_value: Decimal
    generation_before_losses: Decimal
    model_config = {"from_attributes": True}

class GenerationSummary(BaseModel):
    month: date
    source_code: str
    total_generation_kwh: Decimal
    gross_generation_kwh: Decimal
    total_losses_kwh: Decimal
    days_with_data: int

class GenerationByDay(BaseModel):
    reading_date: date
    source_code: str
    total_kwh: Decimal
    gross_kwh: Decimal


# ── CONSUMPTION ───────────────────────────────────────────────

class ConsumptionSummary(BaseModel):
    reading_date: date
    total_kwh: Decimal
    tod_slot: str | None = None


# ── SETTLEMENT ────────────────────────────────────────────────

class SlotSummaryOut(BaseModel):
    summary_date: date
    summary_time: time
    generation_value: Decimal
    slot_total_consumption: Decimal
    allocated_consumption: Decimal
    surplus_generation: Decimal
    matched_settlement: Decimal
    model_config = {"from_attributes": True}

class BankingSettlementOut(BaseModel):
    banking_id: int
    settlement_month: date
    tod_slot_id: int
    generation_value: Decimal
    matched_settlement: Decimal
    surplus_generation: Decimal
    surplus_gen_with_banking: Decimal
    surplus_demand: Decimal
    model_config = {"from_attributes": True}


# ── SAVINGS ───────────────────────────────────────────────────

class SavingsSummaryOut(BaseModel):
    savings_id: int
    plant_id: int
    settlement_month: date
    total_consumption: Decimal
    grid_cost: Decimal
    actual_cost_with_banking: Decimal
    savings_with_banking: Decimal
    savings_pct_with_banking: Decimal
    actual_cost_without_banking: Decimal
    savings_without_banking: Decimal
    savings_pct_without_banking: Decimal
    model_config = {"from_attributes": True}

class SavingsAggregate(BaseModel):
    total_grid_cost: Decimal
    total_savings: Decimal
    avg_savings_pct: Decimal
    total_consumption_kwh: Decimal
    months_count: int


# ── PERFORMANCE ───────────────────────────────────────────────

class PerformanceMetricOut(BaseModel):
    metric_id: int
    plant_id: int
    source_type_id: int
    source_code: str
    financial_year: str
    generation_total: Decimal
    plf_percent: Decimal
    realised_kwh_captive_consumption: Decimal
    sale_of_energy: Decimal
    total_re_percent: Decimal
    banking_loss_percent: Decimal
    model_config = {"from_attributes": True}

class DeviceMetricOut(BaseModel):
    device_metric_id: int
    device_id: int
    serial_number: str
    source_code: str
    financial_year: str
    generation_total: Decimal
    plf_percent: Decimal | None
    availability_pct: Decimal | None
    model_config = {"from_attributes": True}


# ── EFFECTIVE RATE ────────────────────────────────────────────

class EffectiveRateOut(BaseModel):
    rate_id: int
    plant_id: int
    billing_month: date
    total_units_consumed: Decimal
    total_electricity_bill: Decimal
    effective_rate: Decimal
    effective_rate_excl_demand: Decimal
    model_config = {"from_attributes": True}


# ── DISCOM BILLS ──────────────────────────────────────────────

class DiscomBillOut(BaseModel):
    bill_id: int
    plant_id: int
    month: date
    bill_header: str | None
    total_consumption: Decimal
    cost_without_re: Decimal
    cost_with_re_wheeling: Decimal
    discom_bill_amount: Decimal
    savings: Decimal
    model_config = {"from_attributes": True}


# ── GRID & RE COSTS ───────────────────────────────────────────

class GridCostOut(BaseModel):
    cost_id: int
    plant_id: int
    month: date
    demand_charges: Decimal
    energy_charges: Decimal
    wheeling_charges: Decimal
    electricity_duty: Decimal
    total_grid_bill: Decimal
    model_config = {"from_attributes": True}

class ReCostOut(BaseModel):
    re_cost_id: int
    plant_id: int
    source_type_id: int
    month: date
    om_charges: Decimal
    transmission_charges: Decimal
    wheeling_charges: Decimal
    scheduling_charges: Decimal
    total_re_cost: Decimal
    model_config = {"from_attributes": True}


# ── CHAT ──────────────────────────────────────────────────────

class ChatMessageCreate(BaseModel):
    content: str
    thread_id: int | None = None

class ChatMessageOut(BaseModel):
    message_id: int
    thread_id: int
    role: str
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}

class ChatThreadOut(BaseModel):
    thread_id: int
    title: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── PAGINATION ────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    pages: int
