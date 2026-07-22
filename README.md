# Integrum Energy — C9 Analytics Dashboard

Full-stack renewable energy analytics platform for C9 client (BESCOM, Karnataka Solar).

## Stack

| Layer    | Technology                    |
|----------|-------------------------------|
| Frontend | React 18 + Vite + TypeScript  |
| Backend  | Python FastAPI + SQLAlchemy   |
| Database | PostgreSQL 16                 |
| Charts   | Chart.js / react-chartjs-2    |
| ORM      | SQLAlchemy async + asyncpg    |

---

## Quick Start (Docker)

```bash
# 1. Clone and enter the repo
git clone https://github.com/Logos-Labs-India/Integrum_client_dashboard.git
cd Integrum_client_dashboard

# 2. Start the full stack (DB + API)
docker compose up -d

# 3. Wait ~15 s for PostgreSQL to initialise + seed data to load
docker compose logs -f api   # watch for "Application startup complete"

# 4. Start the frontend dev server (in a second terminal)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

API docs: **http://localhost:8000/api/docs**

---

## Environment Variables

Copy `.env.example` to `.env` and change as needed:

```env
SECRET_KEY=change-me-in-production
DEBUG=false
```

---

## Project Structure

```
Integrum_client_dashboard/
├── backend/                  # FastAPI application
│   ├── main.py               # App factory + router registration
│   ├── config.py             # Settings (pydantic-settings)
│   ├── database.py           # Async SQLAlchemy engine + session
│   ├── routes/
│   │   ├── c9_dashboard.py   # ← All 12 chart endpoints (Chart 1–7, 8, 10, 11, 15)
│   │   ├── auth.py
│   │   ├── generation.py
│   │   ├── savings.py
│   │   └── settlement.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── api/client.ts     # Axios + typed API helpers
│   │   ├── hooks/useApi.ts   # Generic async fetch hook
│   │   ├── components/
│   │   │   ├── charts/       # Chart.js chart components
│   │   │   ├── layout/       # Sidebar, TopBar
│   │   │   └── ui/           # KpiCard, LoadingState
│   │   ├── pages/            # One page per dashboard view
│   │   │   ├── OverviewPage.tsx
│   │   │   ├── DailyPage.tsx        # Chart 1
│   │   │   ├── UnitSavingsPage.tsx  # Charts 2, 5, 7
│   │   │   ├── TodPage.tsx          # Chart 4
│   │   │   ├── DiscomBillPage.tsx   # Chart 6
│   │   │   ├── BankingPage.tsx      # Chart 8
│   │   │   ├── WheelingPage.tsx     # Chart 10
│   │   │   ├── SurplusPage.tsx      # Chart 11
│   │   │   └── HeatmapPage.tsx      # Chart 15
│   │   └── styles/globals.css
│   ├── package.json
│   └── vite.config.ts
│
├── schema_v2.sql             # PostgreSQL schema — data warehouse DDL
├── seed_august2025.sql       # Real August 2025 data (from CSV exports)
├── calc_spec.md              # Business logic specification
├── docker-compose.yml        # PostgreSQL + FastAPI services
└── README.md
```

---

## API Endpoints (C9 Dashboard)

All endpoints under `/api/c9/` and accept `?month=YYYY-MM`.

| Endpoint              | Chart | Description                          |
|-----------------------|-------|--------------------------------------|
| `GET /api/c9/kpi-summary`        | —    | Header KPI cards                     |
| `GET /api/c9/daily-summary`      | 1    | Daily gen/cons/settlement (31-day)   |
| `GET /api/c9/unit-savings`       | 2/5/7| Per-unit cost breakdown              |
| `GET /api/c9/tod-analysis`       | 4    | TOD slot generation/consumption      |
| `GET /api/c9/discom-bill`        | 6    | DISCOM bill per unit                 |
| `GET /api/c9/banking-loss`       | 8    | Banking loss per unit                |
| `GET /api/c9/wheeling-recon`     | 10   | Proposed vs actual wheeling          |
| `GET /api/c9/surplus-absorption` | 11   | Energy flow / surplus absorption     |
| `GET /api/c9/heatmap`            | 15   | 24h × 7-day heatmap matrix           |

---

## Data Schema

The database uses `schema_v2.sql` — a multi-tenant renewable energy data warehouse.

Key views (exact names used by dashboard):
- `monthly_banking_settlement_data_v2` — settlement + banking per unit
- `monthly_savings_v2` — cost savings per unit
- `hourly_gen_con2_v2` — hourly generation/consumption with TOD slots
- `discom_bill_v2` — DISCOM bill line items

---

## Key Business Rules

From `calc_spec.md` (single source of truth):

- **Banking loss**: 8% on gross surplus at time of banking (not generation)
- **Banking expiry**: End of calendar month, FIFO drawdown
- **Allocation**: Pass 1 = highest tariff unit first; Pass 2 = proportional within tier
- **BESCOM TOD slots**: Morning Peak 06–09h (×1.5), Day Normal 09–18h (×1.0), Evening Peak 18–22h (×1.5), Night Off Peak 22–06h (×0.75)
- **Cost formula**: `savings = grid_cost − actual_cost` where `actual_cost = grid_drawl × grid_rate + settled × ₹2.50`
- **Tariffs**: ₹7.20/kWh (Malleswaram, Sahakar Nagar, Old Airport Road, HRBR) · ₹5.95/kWh (all others)

---

## Git Workflow

```bash
# Feature branch from Dev
git checkout Dev
git pull origin Dev
git checkout -b feature/full-stack-v2

# After each milestone commit
git add .
git commit -m "feat: add C9 dashboard backend routes (Charts 1-7, 8, 10, 11, 15)"
git push origin feature/full-stack-v2

# Milestones:
# 1. Backend schema_v2 + seed data
# 2. FastAPI C9 dashboard routes
# 3. React/Vite scaffold + layout
# 4. Chart components (Charts 1-7)
# 5. Chart components (Charts 8, 10, 11, 15)
# 6. Production config + README
```

---

## Default Credentials

| Field    | Value                    |
|----------|--------------------------|
| Email    | admin@c9.integrum.in     |
| Password | integrum123              |
| DB Host  | localhost:5432           |
| DB Name  | integrum                 |
| DB User  | integrum / integrum_pass |
