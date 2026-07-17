import asyncpg
import mcp.types as types


def get_performance_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="performance_get_plant_metrics",
            description="Get annual plant performance metrics: PLF %, total generation, RE %, banking loss %, captive consumption — per source (SOLAR/WIND).",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":      {"type": "integer"},
                    "plant_id":       {"type": "integer"},
                    "financial_year": {"type": "string", "description": "e.g. 2025-2026"},
                    "source_type":    {"type": "string", "description": "SOLAR or WIND (optional)"},
                },
                "required": ["tenant_id", "plant_id"],
            },
        ),
        types.Tool(
            name="performance_get_device_metrics",
            description="Get annual generation per individual turbine or solar panel, with PLF and availability %.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":      {"type": "integer"},
                    "plant_id":       {"type": "integer"},
                    "financial_year": {"type": "string"},
                    "source_type":    {"type": "string", "description": "SOLAR or WIND"},
                },
                "required": ["tenant_id", "plant_id"],
            },
        ),
        types.Tool(
            name="performance_get_plf_summary",
            description="Get a concise PLF summary for a plant and financial year: PLF per source, RE % of total consumption, losses.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":      {"type": "integer"},
                    "plant_id":       {"type": "integer"},
                    "financial_year": {"type": "string"},
                },
                "required": ["tenant_id", "plant_id", "financial_year"],
            },
        ),
        types.Tool(
            name="performance_get_plant_info",
            description="Get plant details and energy source configuration: name, location, capacity MW, whether Solar/Wind/Hybrid.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id": {"type": "integer"},
                    "plant_id":  {"type": "integer", "description": "Omit to list all plants for tenant"},
                },
                "required": ["tenant_id"],
            },
        ),
    ]


async def handle_performance(name: str, args: dict, pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        if name == "performance_get_plant_metrics":
            q = """
                SELECT
                    pm.financial_year,
                    est.code                                                   AS source,
                    ROUND(pm.plf_percent::numeric, 2)                          AS plf_percent,
                    ROUND(pm.generation_total::numeric, 2)                     AS generation_total_kwh,
                    ROUND(pm.realised_kwh_captive_consumption::numeric, 2)     AS captive_consumption_kwh,
                    ROUND(pm.sale_of_energy::numeric, 2)                       AS sale_of_energy_kwh,
                    ROUND(pm.over_injection::numeric, 2)                       AS over_injection_kwh,
                    ROUND(pm.total_re_percent::numeric, 2)                     AS re_percent,
                    ROUND(pm.banking_loss_percent::numeric, 2)                 AS banking_loss_pct,
                    ROUND(pm.losses_excl_over_injection_percent::numeric, 2)   AS loss_pct
                FROM performance_metrics pm
                JOIN energy_source_types est ON est.source_type_id = pm.source_type_id
                WHERE pm.tenant_id = $1 AND pm.plant_id = $2
                  {year_filter}
                  {source_filter}
                ORDER BY pm.financial_year, est.code
            """.format(
                year_filter="AND pm.financial_year = $3" if args.get("financial_year") else "",
                source_filter="AND est.code = $4" if args.get("source_type") and args.get("financial_year") else (
                    "AND est.code = $3" if args.get("source_type") and not args.get("financial_year") else ""
                ),
            )
            params = [args["tenant_id"], args["plant_id"]]
            if args.get("financial_year"):
                params.append(args["financial_year"])
            if args.get("source_type"):
                params.append(args["source_type"].upper())
            rows = await conn.fetch(q, *params)
            return [dict(r) for r in rows]

        elif name == "performance_get_device_metrics":
            q = """
                SELECT
                    d.serial_number,
                    est.code                                       AS source,
                    dm.financial_year,
                    ROUND(dm.generation_total::numeric, 2)        AS generation_total_kwh,
                    ROUND(dm.plf_percent::numeric, 2)             AS plf_percent,
                    ROUND(dm.availability_pct::numeric, 2)        AS availability_pct
                FROM device_yearly_metrics dm
                JOIN devices d ON d.device_id = dm.device_id
                JOIN energy_source_types est ON est.source_type_id = dm.source_type_id
                WHERE dm.tenant_id = $1 AND dm.plant_id = $2
                  {year_filter}
                  {source_filter}
                ORDER BY dm.financial_year, est.code, dm.generation_total DESC
            """.format(
                year_filter="AND dm.financial_year = $3" if args.get("financial_year") else "",
                source_filter="AND est.code = $4" if args.get("source_type") and args.get("financial_year") else (
                    "AND est.code = $3" if args.get("source_type") else ""
                ),
            )
            params = [args["tenant_id"], args["plant_id"]]
            if args.get("financial_year"):
                params.append(args["financial_year"])
            if args.get("source_type"):
                params.append(args["source_type"].upper())
            rows = await conn.fetch(q, *params)
            return [dict(r) for r in rows]

        elif name == "performance_get_plf_summary":
            rows = await conn.fetch("""
                SELECT
                    est.code                                                 AS source,
                    ROUND(pm.plf_percent::numeric, 2)                       AS plf_percent,
                    ROUND(pm.generation_total::numeric, 2)                  AS generation_kwh,
                    ROUND(pm.total_re_percent::numeric, 2)                  AS re_pct_of_consumption,
                    ROUND(pm.banking_loss_percent::numeric, 2)              AS banking_loss_pct,
                    ROUND(pm.losses_excl_over_injection_percent::numeric, 2)AS transmission_loss_pct
                FROM performance_metrics pm
                JOIN energy_source_types est ON est.source_type_id = pm.source_type_id
                WHERE pm.tenant_id = $1 AND pm.plant_id = $2 AND pm.financial_year = $3
                ORDER BY est.code
            """, args["tenant_id"], args["plant_id"], args["financial_year"])
            return {
                "plant_id": args["plant_id"],
                "financial_year": args["financial_year"],
                "sources": [dict(r) for r in rows],
            }

        elif name == "performance_get_plant_info":
            q = """
                SELECT
                    p.plant_id,
                    p.plant_code,
                    p.plant_name,
                    p.location,
                    p.state,
                    p.total_capacity_mw,
                    p.status,
                    STRING_AGG(est.code, ' + ' ORDER BY est.code)      AS energy_sources,
                    BOOL_OR(est.code = 'SOLAR')                        AS has_solar,
                    BOOL_OR(est.code = 'WIND')                         AS has_wind,
                    SUM(pes.installed_capacity_mw)                     AS installed_mw
                FROM plants p
                JOIN plant_energy_sources pes ON pes.plant_id = p.plant_id
                JOIN energy_source_types est ON est.source_type_id = pes.source_type_id
                WHERE p.tenant_id = $1
                  {plant_filter}
                GROUP BY p.plant_id, p.plant_code, p.plant_name, p.location, p.state,
                         p.total_capacity_mw, p.status
                ORDER BY p.plant_name
            """.format(
                plant_filter="AND p.plant_id = $2" if args.get("plant_id") else ""
            )
            params = [args["tenant_id"]]
            if args.get("plant_id"):
                params.append(args["plant_id"])
            rows = await conn.fetch(q, *params)
            plants = [dict(r) for r in rows]
            for p in plants:
                codes = set()
                if p.get("has_solar"):
                    codes.add("SOLAR")
                if p.get("has_wind"):
                    codes.add("WIND")
                p["plant_type"] = "HYBRID" if len(codes) == 2 else (codes.pop() if codes else "UNKNOWN")
            return plants

    return {"error": f"Unknown tool: {name}"}
