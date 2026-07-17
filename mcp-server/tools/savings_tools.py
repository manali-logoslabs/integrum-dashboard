import asyncpg
import mcp.types as types


def get_savings_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="savings_get_monthly",
            description="Get monthly cost savings for a plant: grid cost avoided, actual RE cost, savings ₹ and % — with and without banking.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":   {"type": "integer"},
                    "plant_id":    {"type": "integer"},
                    "month_from":  {"type": "string", "description": "YYYY-MM-DD (first of month)"},
                    "month_to":    {"type": "string", "description": "YYYY-MM-DD (first of month)"},
                },
                "required": ["tenant_id", "plant_id", "month_from", "month_to"],
            },
        ),
        types.Tool(
            name="savings_get_aggregate",
            description="Get aggregated savings totals for a date range: total grid cost avoided, total savings ₹, average savings %, total consumption.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":  {"type": "integer"},
                    "plant_id":   {"type": "integer"},
                    "month_from": {"type": "string"},
                    "month_to":   {"type": "string"},
                },
                "required": ["tenant_id", "month_from", "month_to"],
            },
        ),
        types.Tool(
            name="billing_get_effective_rate",
            description="Get the blended effective electricity rate (₹/kWh) per month for a plant, including and excluding demand charges.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tenant_id":   {"type": "integer"},
                    "plant_id":    {"type": "integer"},
                    "month_from":  {"type": "string"},
                    "month_to":    {"type": "string"},
                },
                "required": ["tenant_id", "plant_id", "month_from", "month_to"],
            },
        ),
        types.Tool(
            name="billing_get_discom_bills",
            description="Get DISCOM bill line items per month: gross cost, RE credit, net payable, and savings for wheeling customers.",
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
    ]


async def handle_savings(name: str, args: dict, pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        if name == "savings_get_monthly":
            rows = await conn.fetch("""
                SELECT
                    settlement_month,
                    ROUND(total_consumption::numeric, 2)               AS total_consumption_kwh,
                    ROUND(grid_cost::numeric, 2)                       AS grid_cost,
                    ROUND(actual_cost_with_banking::numeric, 2)        AS actual_cost_with_banking,
                    ROUND(savings_with_banking::numeric, 2)            AS savings_with_banking,
                    ROUND(savings_pct_with_banking::numeric, 2)        AS savings_pct_with_banking,
                    ROUND(actual_cost_without_banking::numeric, 2)     AS actual_cost_without_banking,
                    ROUND(savings_without_banking::numeric, 2)         AS savings_without_banking,
                    ROUND(savings_pct_without_banking::numeric, 2)     AS savings_pct_without_banking
                FROM savings_summary
                WHERE tenant_id = $1 AND plant_id = $2
                  AND settlement_month BETWEEN $3::date AND $4::date
                ORDER BY settlement_month
            """, args["tenant_id"], args["plant_id"], args["month_from"], args["month_to"])
            return [dict(r) for r in rows]

        elif name == "savings_get_aggregate":
            q = """
                SELECT
                    ROUND(SUM(grid_cost)::numeric, 2)                    AS total_grid_cost,
                    ROUND(SUM(savings_with_banking)::numeric, 2)         AS total_savings,
                    ROUND(AVG(savings_pct_with_banking)::numeric, 2)     AS avg_savings_pct,
                    ROUND(SUM(total_consumption)::numeric, 2)            AS total_consumption_kwh,
                    COUNT(*)                                              AS months_count
                FROM savings_summary
                WHERE tenant_id = $1
                  AND settlement_month BETWEEN $2::date AND $3::date
                  {plant_filter}
            """.format(plant_filter="AND plant_id = $4" if args.get("plant_id") else "")
            params = [args["tenant_id"], args["month_from"], args["month_to"]]
            if args.get("plant_id"):
                params.append(args["plant_id"])
            row = await conn.fetchrow(q, *params)
            return dict(row)

        elif name == "billing_get_effective_rate":
            rows = await conn.fetch("""
                SELECT
                    billing_month,
                    ROUND(total_units_consumed::numeric, 2)           AS total_units_consumed,
                    ROUND(total_electricity_bill::numeric, 2)         AS total_electricity_bill,
                    ROUND(effective_rate::numeric, 4)                 AS effective_rate,
                    ROUND(effective_rate_excl_demand::numeric, 4)     AS effective_rate_excl_demand
                FROM effective_rate_summary
                WHERE tenant_id = $1 AND plant_id = $2
                  AND billing_month BETWEEN $3::date AND $4::date
                ORDER BY billing_month
            """, args["tenant_id"], args["plant_id"], args["month_from"], args["month_to"])
            return [dict(r) for r in rows]

        elif name == "billing_get_discom_bills":
            rows = await conn.fetch("""
                SELECT
                    month,
                    bill_header,
                    ROUND(total_consumption::numeric, 2)       AS total_consumption_kwh,
                    ROUND(cost_without_re::numeric, 2)         AS cost_without_re,
                    ROUND(cost_with_re_wheeling::numeric, 2)   AS cost_with_re_wheeling,
                    ROUND(discom_bill_amount::numeric, 2)      AS discom_bill_amount,
                    ROUND(savings::numeric, 2)                 AS savings
                FROM discom_bills
                WHERE tenant_id = $1 AND plant_id = $2
                  AND month BETWEEN $3::date AND $4::date
                ORDER BY month
            """, args["tenant_id"], args["plant_id"], args["month_from"], args["month_to"])
            return [dict(r) for r in rows]

    return {"error": f"Unknown tool: {name}"}
