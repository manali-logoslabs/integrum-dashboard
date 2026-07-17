import asyncpg
import mcp.types as types


def get_settlement_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="settlement_get_banking_monthly",
            description="Get monthly banking settlement by TOD slot: generation, matched settlement, surplus generation before/after banking, unmet demand.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":   {"type": "integer"},
                    "plant_id":    {"type": "integer"},
                    "month_from":  {"type": "string", "description": "YYYY-MM-DD"},
                    "month_to":    {"type": "string", "description": "YYYY-MM-DD"},
                },
                "required": ["tenant_id", "plant_id", "month_from", "month_to"],
            },
        ),
        types.Tool(
            name="settlement_get_banking_summary",
            description="Get monthly aggregate banking performance: match rate %, total surplus, unmet demand, banking utilisation.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":  {"type": "integer"},
                    "plant_id":   {"type": "integer"},
                    "month_from": {"type": "string"},
                    "month_to":   {"type": "string"},
                },
                "required": ["tenant_id", "plant_id", "month_from", "month_to"],
            },
        ),
        types.Tool(
            name="banking_get_slot_summary",
            description="Get 15-minute slot-level generation vs consumption matching for a specific date.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":    {"type": "integer"},
                    "plant_id":     {"type": "integer"},
                    "summary_date": {"type": "string", "description": "YYYY-MM-DD"},
                },
                "required": ["tenant_id", "plant_id", "summary_date"],
            },
        ),
        types.Tool(
            name="settlement_get_daily_tod",
            description="Get daily TOD slot breakdown: generation, consumption, matched settlement, surplus/deficit per slot.",
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
    ]


async def handle_settlement(name: str, args: dict, pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        if name == "settlement_get_banking_monthly":
            rows = await conn.fetch("""
                SELECT
                    mbs.settlement_month,
                    ts.slot_code,
                    ts.slot_name,
                    ROUND(mbs.generation_value::numeric, 2)              AS generation_kwh,
                    ROUND(mbs.matched_settlement::numeric, 2)            AS matched_kwh,
                    ROUND(mbs.surplus_generation::numeric, 2)            AS surplus_before_banking,
                    ROUND(mbs.surplus_gen_with_banking::numeric, 2)      AS surplus_after_banking,
                    ROUND(mbs.surplus_demand::numeric, 2)                AS unmet_demand_kwh,
                    ROUND(mbs.slot_total_consumption::numeric, 2)        AS total_consumption_kwh
                FROM monthly_banking_settlement mbs
                JOIN tod_slots ts ON ts.slot_id = mbs.tod_slot_id
                WHERE mbs.tenant_id = $1 AND mbs.plant_id = $2
                  AND mbs.settlement_month BETWEEN $3::date AND $4::date
                ORDER BY mbs.settlement_month, ts.slot_code
            """, args["tenant_id"], args["plant_id"], args["month_from"], args["month_to"])
            return [dict(r) for r in rows]

        elif name == "settlement_get_banking_summary":
            rows = await conn.fetch("""
                SELECT
                    settlement_month,
                    ROUND(SUM(generation_value)::numeric, 2)         AS total_generation_kwh,
                    ROUND(SUM(matched_settlement)::numeric, 2)       AS total_matched_kwh,
                    ROUND(SUM(surplus_generation)::numeric, 2)       AS total_surplus_kwh,
                    ROUND(SUM(surplus_gen_with_banking)::numeric, 2) AS surplus_after_banking,
                    ROUND(SUM(surplus_demand)::numeric, 2)           AS total_unmet_demand,
                    CASE WHEN SUM(generation_value) > 0
                         THEN ROUND((SUM(matched_settlement) / SUM(generation_value) * 100)::numeric, 2)
                         ELSE 0 END                                   AS match_rate_pct
                FROM monthly_banking_settlement
                WHERE tenant_id = $1 AND plant_id = $2
                  AND settlement_month BETWEEN $3::date AND $4::date
                GROUP BY settlement_month
                ORDER BY settlement_month
            """, args["tenant_id"], args["plant_id"], args["month_from"], args["month_to"])
            return [dict(r) for r in rows]

        elif name == "banking_get_slot_summary":
            rows = await conn.fetch("""
                SELECT
                    summary_time,
                    ROUND(generation_value::numeric, 4)         AS generation_kwh,
                    ROUND(slot_total_consumption::numeric, 4)   AS consumption_kwh,
                    ROUND(allocated_consumption::numeric, 4)    AS allocated_kwh,
                    ROUND(surplus_generation::numeric, 4)       AS surplus_kwh,
                    ROUND(matched_settlement::numeric, 4)       AS matched_kwh
                FROM slot_summary
                WHERE tenant_id = $1 AND plant_id = $2 AND summary_date = $3::date
                ORDER BY summary_time
            """, args["tenant_id"], args["plant_id"], args["summary_date"])
            return [dict(r) for r in rows]

        elif name == "settlement_get_daily_tod":
            rows = await conn.fetch("""
                SELECT
                    tds.summary_date,
                    ts.slot_code,
                    ts.slot_name,
                    ROUND(tds.generation_value::numeric, 2)          AS generation_kwh,
                    ROUND(tds.slot_total_consumption::numeric, 2)    AS consumption_kwh,
                    ROUND(tds.matched_settlement::numeric, 2)        AS matched_kwh,
                    ROUND(tds.surplus_generation::numeric, 2)        AS surplus_generation_kwh,
                    ROUND(tds.surplus_demand::numeric, 2)            AS surplus_demand_kwh
                FROM tod_daily_summary tds
                JOIN tod_slots ts ON ts.slot_id = tds.tod_slot_id
                WHERE tds.tenant_id = $1 AND tds.plant_id = $2
                  AND tds.summary_date BETWEEN $3::date AND $4::date
                ORDER BY tds.summary_date, ts.slot_code
            """, args["tenant_id"], args["plant_id"], args["date_from"], args["date_to"])
            return [dict(r) for r in rows]

    return {"error": f"Unknown tool: {name}"}
