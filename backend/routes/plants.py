from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Plant, PlantEnergySource, EnergySourceType, Device, User
from schemas import PlantOut, PlantCreate, PlantEnergySourceOut, DeviceOut
from .auth import get_current_user

router = APIRouter(prefix="/plants", tags=["plants"])


def _plant_type(sources: list) -> str:
    codes = {s.source_type.code for s in sources if s.is_active}
    if "SOLAR" in codes and "WIND" in codes:
        return "HYBRID"
    if "SOLAR" in codes:
        return "SOLAR"
    if "WIND" in codes:
        return "WIND"
    return "UNKNOWN"


@router.get("", response_model=list[PlantOut])
async def list_plants(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(Plant)
        .options(selectinload(Plant.energy_sources).selectinload(PlantEnergySource.source_type))
        .where(Plant.tenant_id == current_user.tenant_id)
    )
    if status:
        q = q.where(Plant.status == status.upper())
    result = await db.execute(q)
    plants = result.scalars().all()

    out = []
    for p in plants:
        codes = {s.source_type.code for s in p.energy_sources if s.is_active}
        out.append(PlantOut(
            plant_id=p.plant_id,
            tenant_id=p.tenant_id,
            plant_code=p.plant_code,
            plant_name=p.plant_name,
            location=p.location,
            state=p.state,
            total_capacity_mw=p.total_capacity_mw,
            status=p.status,
            has_solar="SOLAR" in codes,
            has_wind="WIND" in codes,
            plant_type=_plant_type(p.energy_sources),
            energy_sources=[
                PlantEnergySourceOut(
                    plant_source_id=s.plant_source_id,
                    source_type_id=s.source_type_id,
                    source_code=s.source_type.code,
                    source_name=s.source_type.name,
                    installed_capacity_mw=s.installed_capacity_mw,
                    is_active=s.is_active,
                )
                for s in p.energy_sources
            ],
        ))
    return out


@router.get("/{plant_id}", response_model=PlantOut)
async def get_plant(
    plant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Plant)
        .options(selectinload(Plant.energy_sources).selectinload(PlantEnergySource.source_type))
        .where(Plant.plant_id == plant_id, Plant.tenant_id == current_user.tenant_id)
    )
    plant = result.scalar_one_or_none()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    codes = {s.source_type.code for s in plant.energy_sources if s.is_active}
    return PlantOut(
        plant_id=plant.plant_id,
        tenant_id=plant.tenant_id,
        plant_code=plant.plant_code,
        plant_name=plant.plant_name,
        location=plant.location,
        state=plant.state,
        total_capacity_mw=plant.total_capacity_mw,
        status=plant.status,
        has_solar="SOLAR" in codes,
        has_wind="WIND" in codes,
        plant_type=_plant_type(plant.energy_sources),
        energy_sources=[
            PlantEnergySourceOut(
                plant_source_id=s.plant_source_id,
                source_type_id=s.source_type_id,
                source_code=s.source_type.code,
                source_name=s.source_type.name,
                installed_capacity_mw=s.installed_capacity_mw,
                is_active=s.is_active,
            )
            for s in plant.energy_sources
        ],
    )


@router.post("", response_model=PlantOut, status_code=201)
async def create_plant(
    payload: PlantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("ADMIN",):
        raise HTTPException(status_code=403, detail="Admin role required")

    plant = Plant(
        tenant_id=current_user.tenant_id,
        **payload.model_dump(exclude={"energy_sources"}),
    )
    db.add(plant)
    await db.flush()  # get plant_id

    for src in payload.energy_sources:
        db.add(PlantEnergySource(plant_id=plant.plant_id, **src))

    await db.commit()
    return await get_plant(plant.plant_id, db, current_user)


@router.get("/{plant_id}/devices", response_model=list[DeviceOut])
async def list_devices(
    plant_id: int,
    source_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(Device)
        .join(Plant)
        .where(Device.plant_id == plant_id, Plant.tenant_id == current_user.tenant_id)
    )
    if source_type:
        q = q.join(EnergySourceType).where(EnergySourceType.code == source_type.upper())
    result = await db.execute(q)
    return [DeviceOut.model_validate(d) for d in result.scalars().all()]
