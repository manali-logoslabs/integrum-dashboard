"""
SQLAlchemy ORM models -- intended to mirror schema_v2.sql exactly, but
several classes (User, SavingsSummary, and others used by auth.py,
savings.py, generation.py, performance.py, plants.py, settlement.py)
are currently out of sync with the real table/column names in
schema_v2.sql (e.g. User.__tablename__ = "users" vs the real
"tenant_users"). See the tracked follow-up task for the fix.
All multi-tenant tables carry tenant_id for row-level scoping.
"""
from datetime import datetime, date, time
from decimal import Decimal
from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, ForeignKey, Integer,
    Numeric, String, Text, Time, UniqueConstraint, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


# ── LAYER 1: LOOKUP TABLES ────────────────────────────────────

class EnergySourceType(Base):
    __tablename__ = "energy_source_types"

    source_type_id: Mapped[int]         = mapped_column(Integer, primary_key=True, autoincrement=True)
    code:           Mapped[str]         = mapped_column(String(30), nullable=False, unique=True)
    name:           Mapped[str]         = mapped_column(String(100), nullable=False)
    unit:           Mapped[str]         = mapped_column(String(20), nullable=False, default="kWh")
    description:    Mapped[str | None]  = mapped_column(Text)
    is_active:      Mapped[bool]        = mapped_column(Boolean, nullable=False, default=True)
    created_at:     Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now())

    plant_sources:  Mapped[list["PlantEnergySource"]] = relationship(back_populates="source_type")
    devices:        Mapped[list["Device"]]             = relationship(back_populates="source_type")


class TodSlot(Base):
    __tablename__ = "tod_slots"

    slot_id:     Mapped[int]         = mapped_column(Integer, primary_key=True, autoincrement=True)
    slot_code:   Mapped[str]         = mapped_column(String(10), nullable=False, unique=True)
    slot_name:   Mapped[str]         = mapped_column(String(60), nullable=False)
    start_time:  Mapped[time | None] = mapped_column(Time)
    end_time:    Mapped[time | None] = mapped_column(Time)
    description: Mapped[str | None]  = mapped_column(Text)
    created_at:  Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── LAYER 2: TENANT MANAGEMENT ───────────────────────────────

class Tenant(Base):
    __tablename__ = "tenants"

    tenant_id:     Mapped[int]         = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_code:   Mapped[str]         = mapped_column(String(30), nullable=False, unique=True)
    name:          Mapped[str]         = mapped_column(String(200), nullable=False)
    org_type:      Mapped[str | None]  = mapped_column(String(50))
    state:         Mapped[str | None]  = mapped_column(String(100))
    discom:        Mapped[str | None]  = mapped_column(String(100))
    gstin:         Mapped[str | None]  = mapped_column(String(20))
    contact_email: Mapped[str | None]  = mapped_column(String(200))
    contact_phone: Mapped[str | None]  = mapped_column(String(20))
    is_active:     Mapped[bool]        = mapped_column(Boolean, nullable=False, default=True)
    created_at:    Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:    Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    plants: Mapped[list["Plant"]] = relationship(back_populates="tenant")
    users:  Mapped[list["User"]]  = relationship(back_populates="tenant")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "username"),
        UniqueConstraint("tenant_id", "email"),
    )

    user_id:       Mapped[int]         = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:     Mapped[int]         = mapped_column(ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False)
    username:      Mapped[str]         = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str]         = mapped_column(String(255), nullable=False)
    full_name:     Mapped[str | None]  = mapped_column(String(200))
    email:         Mapped[str | None]  = mapped_column(String(200))
    role:          Mapped[str]         = mapped_column(String(30), nullable=False, default="VIEWER")
    is_active:     Mapped[bool]        = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at:    Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped["Tenant"] = relationship(back_populates="users")


# ── LAYER 3: PLANT HIERARCHY ──────────────────────────────────

class Plant(Base):
    __tablename__ = "plants"
    __table_args__ = (UniqueConstraint("tenant_id", "plant_code"),)

    plant_id:           Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:          Mapped[int]            = mapped_column(ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False)
    plant_code:         Mapped[str]            = mapped_column(String(50), nullable=False)
    plant_name:         Mapped[str]            = mapped_column(String(200), nullable=False)
    location:           Mapped[str | None]     = mapped_column(String(200))
    state:              Mapped[str | None]     = mapped_column(String(100))
    latitude:           Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude:          Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    total_capacity_mw:  Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    commissioning_date: Mapped[date | None]    = mapped_column(Date)
    status:             Mapped[str]            = mapped_column(String(30), nullable=False, default="ACTIVE")
    created_at:         Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:         Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant:         Mapped["Tenant"]                   = relationship(back_populates="plants")
    energy_sources: Mapped[list["PlantEnergySource"]]  = relationship(back_populates="plant", cascade="all, delete-orphan")
    devices:        Mapped[list["Device"]]             = relationship(back_populates="plant")


class PlantEnergySource(Base):
    __tablename__ = "plant_energy_sources"
    __table_args__ = (UniqueConstraint("plant_id", "source_type_id"),)

    plant_source_id:       Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id:              Mapped[int]            = mapped_column(ForeignKey("plants.plant_id", ondelete="CASCADE"), nullable=False)
    source_type_id:        Mapped[int]            = mapped_column(ForeignKey("energy_source_types.source_type_id"), nullable=False)
    installed_capacity_mw: Mapped[Decimal]        = mapped_column(Numeric(10, 3), nullable=False)
    commissioned_date:     Mapped[date | None]    = mapped_column(Date)
    is_active:             Mapped[bool]           = mapped_column(Boolean, nullable=False, default=True)
    created_at:            Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now())

    plant:       Mapped["Plant"]            = relationship(back_populates="energy_sources")
    source_type: Mapped["EnergySourceType"] = relationship(back_populates="plant_sources")


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (UniqueConstraint("plant_id", "serial_number"),)

    device_id:         Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id:          Mapped[int]            = mapped_column(ForeignKey("plants.plant_id", ondelete="CASCADE"), nullable=False)
    source_type_id:    Mapped[int]            = mapped_column(ForeignKey("energy_source_types.source_type_id"), nullable=False)
    serial_number:     Mapped[str]            = mapped_column(String(100), nullable=False)
    device_name:       Mapped[str | None]     = mapped_column(String(200))
    device_model:      Mapped[str | None]     = mapped_column(String(200))
    manufacturer:      Mapped[str | None]     = mapped_column(String(200))
    capacity_kw:       Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    status:            Mapped[str]            = mapped_column(String(30), nullable=False, default="ACTIVE")
    installed_at:      Mapped[date | None]    = mapped_column(Date)
    decommissioned_at: Mapped[date | None]    = mapped_column(Date)
    created_at:        Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now())

    plant:       Mapped["Plant"]            = relationship(back_populates="devices")
    source_type: Mapped["EnergySourceType"] = relationship(back_populates="devices")


# ── LAYER 4-5: TIME-SERIES ────────────────────────────────────

class GenerationReading(Base):
    __tablename__ = "generation_readings"

    reading_id:               Mapped[int]     = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id:                Mapped[int]     = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                 Mapped[int]     = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    device_id:                Mapped[int]     = mapped_column(ForeignKey("devices.device_id"), nullable=False)
    source_type_id:           Mapped[int]     = mapped_column(ForeignKey("energy_source_types.source_type_id"), nullable=False)
    reading_date:             Mapped[date]    = mapped_column(Date, nullable=False)
    reading_time:             Mapped[time]    = mapped_column(Time, nullable=False)
    generation_value:         Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    generation_before_losses: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    created_at:               Mapped[datetime]= mapped_column(DateTime(timezone=True), server_default=func.now())


class ConsumptionReading(Base):
    __tablename__ = "consumption_readings"

    consumption_id:    Mapped[int]         = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id:         Mapped[int]         = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:          Mapped[int]         = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    reading_date:      Mapped[date]        = mapped_column(Date, nullable=False)
    reading_time:      Mapped[time]        = mapped_column(Time, nullable=False)
    tod_slot_id:       Mapped[int | None]  = mapped_column(ForeignKey("tod_slots.slot_id"))
    consumption_value: Mapped[Decimal]     = mapped_column(Numeric(14, 4), nullable=False, default=0)
    created_at:        Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── LAYER 6: SETTLEMENT ───────────────────────────────────────

class SettlementMatching(Base):
    __tablename__ = "settlement_matching"

    matching_id:              Mapped[int]        = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id:                Mapped[int]        = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                 Mapped[int]        = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    device_id:                Mapped[int]        = mapped_column(ForeignKey("devices.device_id"), nullable=False)
    source_type_id:           Mapped[int]        = mapped_column(ForeignKey("energy_source_types.source_type_id"), nullable=False)
    settlement_date:          Mapped[date]       = mapped_column(Date, nullable=False)
    settlement_time:          Mapped[time]       = mapped_column(Time, nullable=False)
    tod_slot_id:              Mapped[int | None] = mapped_column(ForeignKey("tod_slots.slot_id"))
    generation_value:         Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    generation_before_losses: Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    slot_total_consumption:   Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    allocated_consumption:    Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_generation:       Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_gen_with_banking: Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    matched_settlement:       Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    created_at:               Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now())


class SlotSummary(Base):
    __tablename__ = "slot_summary"

    slot_summary_id:          Mapped[int]        = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id:                Mapped[int]        = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                 Mapped[int]        = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    summary_date:             Mapped[date]       = mapped_column(Date, nullable=False)
    summary_time:             Mapped[time]       = mapped_column(Time, nullable=False)
    tod_slot_id:              Mapped[int | None] = mapped_column(ForeignKey("tod_slots.slot_id"))
    generation_value:         Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    slot_total_consumption:   Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    allocated_consumption:    Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_generation:       Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_gen_with_banking: Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    matched_settlement:       Mapped[Decimal]    = mapped_column(Numeric(14, 4), nullable=False, default=0)
    created_at:               Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── LAYER 7: ROLL-UPS ─────────────────────────────────────────

class TodDailySummary(Base):
    __tablename__ = "tod_daily_summary"
    __table_args__ = (UniqueConstraint("tenant_id", "plant_id", "summary_date", "tod_slot_id"),)

    tod_daily_id:                Mapped[int]     = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:                   Mapped[int]     = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                    Mapped[int]     = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    summary_date:                Mapped[date]    = mapped_column(Date, nullable=False)
    tod_slot_id:                 Mapped[int]     = mapped_column(ForeignKey("tod_slots.slot_id"), nullable=False)
    generation_value:            Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    slot_total_consumption:      Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    allocated_consumption:       Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    matched_settlement:          Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_demand:              Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_generation:          Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_gen_with_banking:    Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    matched_settlement_daily_tod:Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_gen_daily_tod:       Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_demand_daily_tod:    Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    created_at:                  Mapped[datetime]= mapped_column(DateTime(timezone=True), server_default=func.now())


class MonthlyBankingSettlement(Base):
    __tablename__ = "monthly_banking_settlement"
    __table_args__ = (UniqueConstraint("tenant_id", "plant_id", "settlement_month", "tod_slot_id"),)

    banking_id:                      Mapped[int]     = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:                       Mapped[int]     = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                        Mapped[int]     = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    settlement_month:                Mapped[date]    = mapped_column(Date, nullable=False)
    tod_slot_id:                     Mapped[int]     = mapped_column(ForeignKey("tod_slots.slot_id"), nullable=False)
    generation_value:                Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    allocated_consumption:           Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    matched_settlement:              Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_demand:                  Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_generation:              Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_gen_with_banking:        Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    slot_total_consumption:          Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    matched_settlement_daily_tod:    Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_gen_daily_tod:           Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_demand_daily_tod:        Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    matched_settlement_intra_monthly:Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_gen_intra_monthly:       Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    surplus_demand_intra_monthly:    Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    created_at:                      Mapped[datetime]= mapped_column(DateTime(timezone=True), server_default=func.now())


class SavingsSummary(Base):
    __tablename__ = "savings_summary"
    __table_args__ = (UniqueConstraint("tenant_id", "plant_id", "settlement_month"),)

    savings_id:                  Mapped[int]     = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:                   Mapped[int]     = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                    Mapped[int]     = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    settlement_month:            Mapped[date]    = mapped_column(Date, nullable=False)
    total_consumption:           Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    grid_cost:                   Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    actual_cost_with_banking:    Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    savings_with_banking:        Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    savings_pct_with_banking:    Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    actual_cost_without_banking: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    savings_without_banking:     Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    savings_pct_without_banking: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    created_at:                  Mapped[datetime]= mapped_column(DateTime(timezone=True), server_default=func.now())


# ── LAYER 8: BILLING & TARIFFS ───────────────────────────────

class TariffConfig(Base):
    __tablename__ = "tariff_config"
    __table_args__ = (UniqueConstraint("tenant_id", "effective_month", "tod_slot_id"),)

    tariff_id:      Mapped[int]     = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:      Mapped[int]     = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    effective_month:Mapped[date]    = mapped_column(Date, nullable=False)
    tod_slot_id:    Mapped[int]     = mapped_column(ForeignKey("tod_slots.slot_id"), nullable=False)
    rate_per_kwh:   Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False)
    discom:         Mapped[str | None] = mapped_column(String(100))
    state:          Mapped[str | None] = mapped_column(String(100))
    created_at:     Mapped[datetime]= mapped_column(DateTime(timezone=True), server_default=func.now())


class GridCostComponent(Base):
    __tablename__ = "grid_cost_components"
    __table_args__ = (UniqueConstraint("tenant_id", "plant_id", "month"),)

    cost_id:                 Mapped[int]     = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:               Mapped[int]     = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                Mapped[int]     = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    month:                   Mapped[date]    = mapped_column(Date, nullable=False)
    demand_charges:          Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    energy_charges:          Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    wheeling_charges:        Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    tod_tariff_charges:      Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    fuel_cost_adjustment:    Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    electricity_duty:        Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    tax_on_sale:             Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    bulk_discount:           Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    incremental_rebate:      Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    prompt_payment_discount: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    gom_subsidy:             Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    other_adjustments:       Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    total_grid_bill:         Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    created_at:              Mapped[datetime]= mapped_column(DateTime(timezone=True), server_default=func.now())


class ReCostComponent(Base):
    __tablename__ = "re_cost_components"
    __table_args__ = (UniqueConstraint("tenant_id", "plant_id", "source_type_id", "month"),)

    re_cost_id:               Mapped[int]     = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:                Mapped[int]     = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                 Mapped[int]     = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    source_type_id:           Mapped[int]     = mapped_column(ForeignKey("energy_source_types.source_type_id"), nullable=False)
    month:                    Mapped[date]    = mapped_column(Date, nullable=False)
    om_charges:               Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    transmission_charges:     Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    wheeling_charges:         Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    scheduling_charges:       Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    deviation_charges:        Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    asset_management_charges: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    oa_application_charges:   Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    startup_power_bill:       Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    gst_reversal:             Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    depreciation:             Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    overheads:                Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    total_re_cost:            Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    created_at:               Mapped[datetime]= mapped_column(DateTime(timezone=True), server_default=func.now())


class DiscomBill(Base):
    __tablename__ = "discom_bills"

    bill_id:               Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:             Mapped[int]            = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:              Mapped[int]            = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    month:                 Mapped[date]           = mapped_column(Date, nullable=False)
    bill_header:           Mapped[str | None]     = mapped_column(String(200))
    tariff_rate:           Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    total_consumption:     Mapped[Decimal]        = mapped_column(Numeric(14, 4), nullable=False, default=0)
    cost_without_re:       Mapped[Decimal]        = mapped_column(Numeric(14, 4), nullable=False, default=0)
    cost_with_re_wheeling: Mapped[Decimal]        = mapped_column(Numeric(14, 4), nullable=False, default=0)
    discom_bill_amount:    Mapped[Decimal]        = mapped_column(Numeric(14, 4), nullable=False, default=0)
    savings:               Mapped[Decimal]        = mapped_column(Numeric(14, 4), nullable=False, default=0)
    created_at:            Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now())


class EffectiveRateSummary(Base):
    __tablename__ = "effective_rate_summary"
    __table_args__ = (UniqueConstraint("tenant_id", "plant_id", "billing_month"),)

    rate_id:                    Mapped[int]     = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:                  Mapped[int]     = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                   Mapped[int]     = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    billing_month:              Mapped[date]    = mapped_column(Date, nullable=False)
    total_units_consumed:       Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    total_electricity_bill:     Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    total_demand_charges:       Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    effective_rate:             Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=0)
    effective_rate_excl_demand: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=False, default=0)
    created_at:                 Mapped[datetime]= mapped_column(DateTime(timezone=True), server_default=func.now())


# ── LAYER 9: PERFORMANCE (ANNUAL) ────────────────────────────

class PerformanceMetric(Base):
    __tablename__ = "performance_metrics"
    __table_args__ = (UniqueConstraint("tenant_id", "plant_id", "source_type_id", "financial_year"),)

    metric_id:                          Mapped[int]     = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:                          Mapped[int]     = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:                           Mapped[int]     = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    source_type_id:                     Mapped[int]     = mapped_column(ForeignKey("energy_source_types.source_type_id"), nullable=False)
    financial_year:                     Mapped[str]     = mapped_column(String(10), nullable=False)
    generation_total:                   Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False, default=0)
    plf_percent:                        Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    realised_kwh_captive_consumption:   Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False, default=0)
    sale_of_energy:                     Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False, default=0)
    over_injection:                     Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False, default=0)
    total_plant_consumption:            Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False, default=0)
    total_re_consumption_capex:         Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False, default=0)
    re_percent_capex:                   Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    total_re_consumption_tpa:           Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False, default=0)
    re_percent_tpa:                     Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    total_re_percent:                   Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    actual_losses:                      Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False, default=0)
    losses_excl_over_injection:         Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False, default=0)
    losses_excl_over_injection_percent: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    banking_loss_percent:               Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    created_at:                         Mapped[datetime]= mapped_column(DateTime(timezone=True), server_default=func.now())


class DeviceYearlyMetric(Base):
    __tablename__ = "device_yearly_metrics"
    __table_args__ = (UniqueConstraint("device_id", "financial_year"),)

    device_metric_id: Mapped[int]            = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:        Mapped[int]            = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    plant_id:         Mapped[int]            = mapped_column(ForeignKey("plants.plant_id"), nullable=False)
    device_id:        Mapped[int]            = mapped_column(ForeignKey("devices.device_id"), nullable=False)
    source_type_id:   Mapped[int]            = mapped_column(ForeignKey("energy_source_types.source_type_id"), nullable=False)
    financial_year:   Mapped[str]            = mapped_column(String(10), nullable=False)
    generation_total: Mapped[Decimal]        = mapped_column(Numeric(16, 4), nullable=False, default=0)
    plf_percent:      Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    availability_pct: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    created_at:       Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── LAYER 10: AI CHAT ─────────────────────────────────────────

class ChatThread(Base):
    __tablename__ = "chat_threads"

    thread_id:  Mapped[int]         = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id:  Mapped[int]         = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    user_id:    Mapped[int | None]  = mapped_column(ForeignKey("users.user_id"))
    title:      Mapped[str | None]  = mapped_column(String(300))
    created_at: Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime]    = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    messages: Mapped[list["ChatMessage"]] = relationship(back_populates="thread", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_history"

    message_id: Mapped[int]      = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thread_id:  Mapped[int]      = mapped_column(ForeignKey("chat_threads.thread_id", ondelete="CASCADE"), nullable=False)
    tenant_id:  Mapped[int]      = mapped_column(ForeignKey("tenants.tenant_id"), nullable=False)
    role:       Mapped[str]      = mapped_column(String(20), nullable=False)
    content:    Mapped[str]      = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    thread: Mapped["ChatThread"] = relationship(back_populates="messages")
