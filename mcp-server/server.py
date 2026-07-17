"""
Integrum Energy MCP Server
Exposes energy analytics as tools that Claude can call directly.
Run: python server.py
"""
import asyncio
import json
from datetime import date, datetime
from decimal import Decimal
import asyncpg
import mcp.server.stdio
import mcp.types as types
from mcp.server import Server

from tools.generation_tools import get_generation_tools, handle_generation
from tools.savings_tools import get_savings_tools, handle_savings
from tools.settlement_tools import get_settlement_tools, handle_settlement
from tools.performance_tools import get_performance_tools, handle_performance

# ── DB connection pool ────────────────────────────────────────
import os
DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/integrum")

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DB_URL, min_size=2, max_size=10)
    return _pool


# ── JSON serializer ───────────────────────────────────────────
def json_serial(obj):
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


def to_json(data) -> str:
    return json.dumps(data, default=json_serial, indent=2)


# ── MCP server setup ─────────────────────────────────────────
server = Server("integrum-energy")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        *get_generation_tools(),
        *get_savings_tools(),
        *get_settlement_tools(),
        *get_performance_tools(),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    pool = await get_pool()

    try:
        if name.startswith("generation_"):
            result = await handle_generation(name, arguments, pool)
        elif name.startswith("savings_") or name.startswith("billing_"):
            result = await handle_savings(name, arguments, pool)
        elif name.startswith("settlement_") or name.startswith("banking_"):
            result = await handle_settlement(name, arguments, pool)
        elif name.startswith("performance_"):
            result = await handle_performance(name, arguments, pool)
        else:
            result = {"error": f"Unknown tool: {name}"}
    except Exception as e:
        result = {"error": str(e), "tool": name}

    return [types.TextContent(type="text", text=to_json(result))]


async def main():
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
