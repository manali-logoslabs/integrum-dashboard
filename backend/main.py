from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from config import get_settings
from database import init_db
from routes import auth, plants, generation, settlement, savings, performance
from routes import c9_dashboard
from routes import c9_upload
from routes import gil_dashboard

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Multi-tenant renewable energy analytics API — Solar · Wind · Hybrid",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Routers
PREFIX = "/api"
app.include_router(auth.router,           prefix=PREFIX)
app.include_router(plants.router,         prefix=PREFIX)
app.include_router(generation.router,     prefix=PREFIX)
app.include_router(settlement.router,     prefix=PREFIX)
app.include_router(savings.router,        prefix=PREFIX)
app.include_router(performance.router,    prefix=PREFIX)
app.include_router(c9_dashboard.router,   prefix=PREFIX)
app.include_router(c9_upload.router,      prefix=PREFIX)
app.include_router(gil_dashboard.router,  prefix=PREFIX)


@app.get("/api/health", tags=["health"])
async def health():
    return {"status": "ok", "version": settings.app_version}
