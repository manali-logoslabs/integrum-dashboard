# Integrum Energy — Database Migration Guide
### A Beginner's Step-by-Step Reference

---

## What This Guide Covers

1. Understanding what PostgreSQL and DBeaver are
2. Checking that PostgreSQL is running on your computer
3. Creating the `integrum` database
4. Connecting DBeaver to the database
5. Running the migration script (`run_migration.py`)
6. Verifying your data in DBeaver

You will only need to do Steps 1–4 **once**. After that, running and verifying the migration (Steps 5–6) is all you will ever need to repeat when new data arrives.

---

## Part 1 — Background (Read This First)

### What is PostgreSQL?
PostgreSQL (often called "Postgres") is a database engine — software that stores and organizes data on your computer. Think of it like Excel, but designed to hold millions of rows and let multiple applications read and write data at the same time. It runs silently in the background as a Windows service.

### What is DBeaver?
DBeaver is a visual tool for looking inside a PostgreSQL database. It lets you browse tables, run queries, and see your data — like a File Explorer, but for database tables.

### What does the migration script do?
`run_migration.py` is a Python script that reads all your source data files (from the `GIL` and `C9` folders), creates the new Schema v2 tables, and fills them with the correct data. You run it once from the Command Prompt. It connects directly to PostgreSQL and does everything automatically.

---

## Part 2 — Check That PostgreSQL Is Running

Before anything else, confirm PostgreSQL is running.

1. Press **Windows Key + R**, type `services.msc`, press Enter.
2. In the Services window, scroll down to find a service named something like **postgresql-x64-15** (the number may differ — 14, 16, etc.).
3. The **Status** column should say **Running**.
   - If it says **Stopped**: right-click it → **Start**.
   - If you cannot find it at all: PostgreSQL may not be installed. Contact your IT team.
4. Note the version number (e.g., 15). You will need it in the next step.

---

## Part 3 — Create the `integrum` Database

PostgreSQL is running, but the `integrum` database does not exist yet. You need to create it using the Command Prompt.

### Step 3.1 — Open Command Prompt as Administrator
1. Press **Windows Key**, type `cmd`.
2. Right-click **Command Prompt** → **Run as administrator**.
3. Click **Yes** if Windows asks for permission.

### Step 3.2 — Find the PostgreSQL bin folder
PostgreSQL's command-line tools are in a folder like:
```
C:\Program Files\PostgreSQL\15\bin\
```
Replace `15` with your version number from Part 2.

### Step 3.3 — Run these three commands
Type each command below and press **Enter** after each one. Replace `15` with your version if different.

**Command 1 — Go to the bin folder:**
```
cd "C:\Program Files\PostgreSQL\15\bin"
```

**Command 2 — Open the PostgreSQL console (you will be asked for a password — this is the `postgres` user password you set when installing PostgreSQL):**
```
psql -U postgres
```
You will see a prompt like `postgres=#`

**Command 3 — Create the database and user (copy and paste all four lines at once):**
```sql
CREATE DATABASE integrum;
CREATE USER integrum WITH PASSWORD '';
GRANT ALL PRIVILEGES ON DATABASE integrum TO integrum;
\q
```
The `\q` exits the console. You should see:
```
CREATE DATABASE
CREATE ROLE
GRANT
```

> **If you get "password authentication failed":** The `postgres` user password is set during PostgreSQL installation. If you don't remember it, try pressing Enter for a blank password, or check with whoever installed PostgreSQL on your machine.

---

## Part 4 — Connect DBeaver to the Database

Now you will add a connection in DBeaver so you can browse the data visually.

### Step 4.1 — Open DBeaver
Double-click the DBeaver icon on your desktop (or find it in the Start menu).

### Step 4.2 — Create a new connection
1. In the top menu, click **Database** → **New Database Connection**.
2. In the list of databases, click **PostgreSQL** → click **Next**.

### Step 4.3 — Fill in connection details
Fill the form with exactly these values:

| Field       | Value       |
|-------------|-------------|
| Host        | `localhost` |
| Port        | `5432`      |
| Database    | `integrum`  |
| Username    | `integrum`  |
| Password    | *(leave blank)* |

### Step 4.4 — Test the connection
1. Click the **Test Connection** button at the bottom.
2. If it says **Connected**, click **Finish**.
3. If it says an error: double-check the values above. The most common mistake is wrong database name or username.

### Step 4.5 — Find your connection in the left panel
In the **Database Navigator** panel on the left, you should now see an entry called **integrum** (or **localhost**). Click the arrow to expand it. You will see **Databases → integrum → Schemas → public**.

At this point the `public` schema is empty — no tables yet. The migration script will create them.

---

## Part 5 — Run the Migration Script

The migration script creates all tables and fills them with your data. You run it once from the Command Prompt.

### Prerequisites — check these first

**Check Python is installed:**
1. Open Command Prompt (no need for administrator this time).
2. Type: `python --version`
3. You should see something like `Python 3.11.2`. If you see an error, Python needs to be installed from [python.org](https://python.org).

**Check the required library is installed:**
```
pip install psycopg2-binary
```
If it says "already satisfied" that is fine. If it installs successfully, that is also fine.

### Step 5.1 — Open Command Prompt
Press **Windows Key + R**, type `cmd`, press Enter. (No administrator needed this time.)

### Step 5.2 — Navigate to your project folder
```
cd D:\Integrum_dashboard
```

### Step 5.3 — Run the migration
```
python run_migration.py
```

### Step 5.4 — Watch the output
The script will print progress messages like this:
```
==============================================================
  Integrum Energy -- Schema v2 Full Migration (v2)
  26 source files -> Schema v2 (C9 + GIL)
==============================================================
  Connected: postgresql://integrum@localhost:5432/integrum

[Phase 1] Schema deployment
  Schema v2 deployed (or already current)

[Phase 2] Seed data
  > TOD slots (BESCOM C9) ...
  > TOD slots (MSEDCL GIL) ...
  ...

[Phase 3] GIL data ingestion
  ...

[Phase 4] C9 data ingestion
  ...

[Phase 5] Verification
  [OK]  tenants: 2
  [OK]  plants: 2
  ...
  Migration complete. All tables populated.
```

The whole process takes about 30–60 seconds.

### What to do if you see an error

**Error: `could not connect to server`**
→ PostgreSQL is not running. Go back to Part 2 and start the service.

**Error: `database "integrum" does not exist`**
→ Go back to Part 3 and create the database.

**Error: `permission denied`**
→ The `integrum` user does not have rights. Re-run the GRANT command from Part 3.

**Error: `No module named psycopg2`**
→ Run `pip install psycopg2-binary` and try again.

**Any other error:**
→ Copy the full error message and share it — do not try to fix it manually.

---

## Part 6 — Verify Your Data in DBeaver

After the script finishes, switch to DBeaver to confirm all tables are populated.

### Step 6.1 — Refresh the schema
1. In DBeaver's left panel, right-click **public** (under integrum → Schemas) → **Refresh**.
2. You should now see all the tables listed under **Tables**.

### Step 6.2 — Browse a table
1. Double-click any table name, e.g., **tenants**.
2. Click the **Data** tab (next to Properties) at the top of the panel that opens.
3. You will see the rows in that table.

### Step 6.3 — Key tables to check

| Table | What to look for |
|-------|-----------------|
| `tenants` | 2 rows: C9 (id=1) and GIL (id=2) |
| `plants` | 2 rows: one for C9, one for GIL |
| `devices` | Multiple rows: 9 wind turbines + 3 solar inverters for GIL |
| `consumption_units` | Multiple rows: C9's metered units (Malleswaram, Old Airport Road, etc.) |
| `generation_readings` | Many rows: hourly wind/solar generation data |
| `consumption_readings` | Many rows: hourly consumption data for C9 |
| `savings_summary` | Savings calculations per month per unit |
| `grid_bill_headers` | DISCOM electricity bills |
| `performance_metrics` | GIL yearly plant performance (PLF, generation totals) |
| `tenant_users` | Users: admin and kannan |

### Step 6.4 — Run a quick verification query
1. In DBeaver, click the **SQL Editor** button (looks like a document with a play button), or press **Ctrl + ]**.
2. Make sure the connection at the top shows **integrum**.
3. Paste this query and press **Ctrl + Enter** to run it:

```sql
SELECT
    t.name                        AS tenant,
    COUNT(DISTINCT p.id)          AS plants,
    COUNT(DISTINCT d.id)          AS devices,
    COUNT(DISTINCT cu.id)         AS consumption_units,
    COUNT(DISTINCT ss.id)         AS savings_rows
FROM tenants t
LEFT JOIN plants p          ON p.tenant_id = t.id
LEFT JOIN devices d         ON d.plant_id = p.id
LEFT JOIN consumption_units cu ON cu.tenant_id = t.id
LEFT JOIN savings_summary ss   ON ss.tenant_id = t.id
GROUP BY t.name
ORDER BY t.name;
```

You should see something like:

| tenant | plants | devices | consumption_units | savings_rows |
|--------|--------|---------|-------------------|--------------|
| C9     | 1      | 0       | 4+                | 12+          |
| GIL    | 1      | 12      | 0                 | 12+          |

### Step 6.5 — Check GIL installed capacity
```sql
SELECT
    est.code                        AS energy_source,
    pes.installed_capacity_kw       AS capacity_kw,
    pes.installed_capacity_kw / 1000.0 AS capacity_mw
FROM plant_energy_sources pes
JOIN energy_source_types est ON est.id = pes.source_type_id
JOIN plants p ON p.id = pes.plant_id
JOIN tenants t ON t.id = p.tenant_id
WHERE t.name = 'GIL';
```

Expected result:
| energy_source | capacity_kw | capacity_mw |
|---------------|-------------|-------------|
| WIND          | 18900       | 18.9        |
| SOLAR         | 8799        | 8.799       |

---

## Part 7 — Loading New Data in the Future

When you receive new generation data, consumption data, DISCOM bills, or any other operational data:

1. Place the new SQL file(s) in the appropriate folder (`D:\Integrum_dashboard\GIL\` or `D:\Integrum_dashboard\C9\`).
2. The migration script is designed to use `INSERT ... ON CONFLICT DO UPDATE` — this means running it again will **add new rows and update existing ones** without deleting anything.
3. Simply open Command Prompt, go to `D:\Integrum_dashboard`, and run `python run_migration.py` again.
4. Refresh DBeaver to see the new data.

No schema changes are needed. The new data will fit into the existing tables automatically.

---

## Quick Reference Card

| Task | What to do |
|------|------------|
| Check PostgreSQL is running | `services.msc` → find postgresql service |
| Create database (once only) | `psql -U postgres` → `CREATE DATABASE integrum;` |
| Run migration | `cd D:\Integrum_dashboard` → `python run_migration.py` |
| View data | DBeaver → integrum → Schemas → public → Tables |
| Run SQL query | DBeaver SQL Editor → Ctrl+Enter |
| Load new data | Drop files in GIL/C9 folder → run migration again |

---

*Guide version: July 2026 | Schema v2 | Integrum Energy*
