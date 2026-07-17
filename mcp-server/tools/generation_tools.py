import asyncpg
import mcp.types as types


def get_generation_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="generation_get_daily",
            description="Get daily generation totals for a plant, optionally filtered by source (SOLAR or WIND). Returns kWh per day per source.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":   {"type": "integer", "description": "Tenant ID"},
                    "plant_id":    {"type": "integer", "description": "Plant ID"},
                    "date_from":   {"type": "string",  "description": "Start date YYYY-MM-DD"},
                    "date_to":     {"type": "string",  "description": "End date YYYY-MM-DD"},
                    "source_type": {"type": "string",  "description": "SOLAR or WIND (optional, omit for both)"},
                },
                "required": ["tenant_id", "plant_id", "date_from", "date_to"],
            },
        ),
        types.Tool(
            name="generation_get_monthly",
            description="Get monthly generation totals per source for a plant. Good for trend analysis and PLF tracking.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":   {"type": "integer"},
                    "plant_id":    {"type": "integer"},
                    "year":        {"type": "integer", "description": "Financial year start (e.g. 2025 for FY2025-26)"},
                    "source_type": {"type": "string",  "description": "SOLAR or WIND (optional)"},
                },
                "required": ["tenant_id", "plant_id"],
            },
        ),
        types.Tool(
            name="generation_compare_sources",
            description="Compare Solar vs Wind generation totals, share %, losses, and device count for a date range.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id": {"type": "integer"},
                    "plant_id":  {"type": "integer"},
                    "date_from": {"type": "string"},
                    "date_to":   {"type": "string"},
                },
                "required": ["tenant_id", "plant_id", "date_from", "date_to"],
            },
        ),
        types.Tool(
            name="generation_get_device_output",
            description="Get generation breakdown per individual device (turbine or panel) for a date range.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":   {"type": "integer"},
                    "plant_id":    {"type": "integer"},
                    "date_from":   {"type": "string"},
                    "date_to":     {"type": "string"},
                    "source_type": {"type": "string", "description": "SOLAR or WIND"},
                },
                "required": ["tenant_id", "plant_id", "date_from", "date_to"],
            },
        ),
    ]


async def handle_generation(name: str, args: dict, pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        if name == "generation_get_daily":
            q = """
                SELECT
                    gr.reading_date,
                    est.code AS source,
                    ROUND(SUM(gr.generation_value)::numeric, 2)          AS total_kwh,
                    ROUND(SUM(gr.generation_before_losses)::numeric, 2)  AS gross_kwh,
                    ROUND(SUM(gr.generation_before_losses - gr.generation_value)::numeric, 2) AS losses_kwh
                FROM generation_readings gr
                JOIN energy_source_types est ON est.source_type_id = gr.source_type_id
                WHERE gr.tenant_id = $1
                  AND gr.plant_id  = $2
                  AND gr.reading_date BETWEEN $3::date AND $4::date
                  {source_filter}
                GROUP BY gr.reading_date, est.code
                ORDER BY gr.reading_date, est.code
            """.format(
                source_filter="AND est.code = $5" if args.get("source_type") else ""
            )
            params = [args["tenant_id"], args["plant_id"], args["date_from"], args["date_to"]]
            if args.get("source_type"):
                params.append(args["source_type"].upper())
            rows = await conn.fetch(q, *params)
            return [dict(r) for r in rows]

        elif name == "generation_get_monthly":
            q = """
                SELECT
                    DATE_TRUNC('month', gr.reading_date)::date AS month,
                    est.code AS source,
                    ROUND(SUM(gr.generation_value)::numeric, 2)         AS total_kwh,
                    ROUND(SUM(gr.generation_before_losses)::numeric, 2) AS gross_kwh,
                    COUNT(DISTINCT gr.reading_date)                      AS days_with_data
                FROM generation_readings gr
                JOIN energy_source_types est ON est.source_type_id = gr.source_type_id
                WHERE gr.tenant_id = $1 AND gr.plant_id = $2
                  {year_filter}
                  {source_filter}
                GROUP BY DATE_TRUNC('month', gr.reading_date), est.code
                ORDER BY month, est.code
            """.format(
                year_filter="AND EXTRACT(YEAR FROM gr.reading_date) = $3" if args.get("year") else "",
                source_filter="AND est.code = $4" if args.get("source_type") else (
                    "AND est.code = $3" if not args.get("year") and args.get("source_type") else ""
                ),
            )
            params = [args["tenant_id"], args["plant_id"]]
            if args.get("year"):
                params.append(args["year"])
            if args.get("source_type"):
                params.append(args["source_type"].upper())
            rows = await conn.fetch(q, *params)
            return [dict(r) for r in rows]

        elif name == "generation_compare_sources":
            rows = await conn.fetch("""
                SELECT
                    est.code AS source,
                    ROUND(SUM(gr.generation_value)::numeric, 2)         AS total_kwh,
                    ROUND(SUM(gr.generation_before_losses)::numeric, 2) AS gross_kwh,
                    COUNT(DISTINCT gr.device_id)                         AS device_count
                FROM generation_readings gr
                JOIN energy_source_types est ON est.source_type_id = gr.source_type_id
                WHERE gr.tenant_id = $1 AND gr.plant_id = $2
                  AND gr.reading_date BETWEEN $3::date AND $4::date
                GROUP BY est.code
                ORDER BY est.code
            """, args["tenant_id"], args["plant_id"], args["date_from"], args["date_to"])

            data = [dict(r) for r in rows]
            total = sum(r["total_kwh"] for r in data) or 1
            for r in data:
                r["share_pct"] = round(float(r["total_kwh"]) / float(total) * 100, 2)
                r["losses_kwh"] = round(float(r["gross_kwh"]) - float(r["total_kwh"]), 2)
            return data

        elif name == "generation_get_device_output":
            q = """
                SELECT
                    d.serial_number,
                    est.code AS source,
                    ROUND(SUM(gr.generation_value)::numeric, 2)         AS total_kwh,
                    ROUND(SUM(gr.generation_before_losses)::numeric, 2) AS gross_kwh
                FROM generation_readings gr
                JOIN devices d ON d.device_id = gr.device_id
                JOIN energy_source_types est ON est.source_type_id = gr.source_type_id
                WHERE gr.tenant_id = $1 AND gr.plant_id = $2
                  AND gr.reading_date BETWEEN $3::date AND $4::date
                  {source_filter}
                GROUP BY d.serial_number, est.code
                ORDER BY total_kwh DESC
            """.format(
                source_filter="AND est.code = $5" if args.get("source_type") else ""
            )
            params = [args["tenant_id"], args["plant_id"], args["date_from"], args["date_to"]]
            if args.get("source_type"):
                params.append(args["source_type"].upper())
            rows = await conn.fetch(q, *params)
            return [dict(r) for r in rows]

    return {"error": f"Unknown tool: {name}"}
