# C9 Dashboard — Comparative Analysis & Recommendation
**Integrum Energy · BESCOM Karnataka · August 2025**

> Evaluation across four expert dimensions:
> **Renewable Energy Domain Expert** · **Business Analyst** · **Data Warehouse Architect** · **UI/UX Dashboard Expert**

---

## Executive Summary

After analysing both dashboards against the real BESCOM bill data (DISCOM Bill – All Units.csv), the following critical findings emerge:

| Finding | Impact |
|---|---|
| My proposed charts used ₹9.00/kWh uniform rate — actual rates are ₹5.95 and ₹7.20 by unit | Cost figures overstated by 25–51% |
| My settlement used daily matching — existing dashboard uses 15-min slot matching | Banking understated 8.6× (27.7K vs 238.3K kWh) |
| Existing dashboard uses "proposed allocation" not actual BESCOM wheeling — no reconciliation | Business risk: unexplained gap between projected and billed savings |
| Bellandur Corp. Office gets 0 wheeling in actual bill, but 30.7% savings shown in dashboard | Misleading KPI for client |
| Savings % in existing dashboard ≠ actual bill savings % for any unit | Dashboard formula not validated against real bills |
| Neither dashboard has a day-by-day time-series or generation profile chart | Critical for operational monitoring and monsoon impact analysis |

**Overall verdict:** Neither dashboard is fully correct. A combined approach using the existing dashboard's 15-min settlement logic + actual tariff rates + my proposed daily time-series + a reconciliation layer is needed.

---

## Data Foundation — Key Facts from Actual Bill

| Unit | Tariff (₹/kWh) | Consumption (kWh) | Wheeled Solar (kWh) | RE% | Without-Solar Bill (₹) | Actual DISCOM Bill (₹) | Actual Savings (₹) | Actual Savings % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Malleswaram | 7.20 | 48,360 | 40,990 | 84.8% | 4,77,348 | 1,46,231 | 2,90,127 | 60.8% |
| Sahakar Nagar | 7.20 | 58,408 | 52,786 | 90.4% | 6,24,685 | 1,98,280 | 3,73,619 | 59.8% |
| Thanisandra | 5.95 | 53,563 | 46,193 | 86.2% | 4,52,548 | 1,42,339 | 2,64,016 | 58.3% |
| Whitefield | 5.95 | 88,540 | 81,230 | 91.7% | 7,71,175 | 2,25,675 | 4,64,270 | 60.2% |
| Old Airport Road | 7.20 | 77,528 | 70,158 | 90.5% | 7,60,510 | 1,93,774 | 4,96,578 | 65.3% |
| HRBR Unit | 7.20 | 45,320 | 38,925 | 85.9% | 4,51,302 | 1,36,866 | 2,75,511 | 61.0% |
| **Bellandur Corp.** | 5.95 | 22,886 | **0** | **0%** | 2,14,857 | 2,14,857 | **0** | **0%** |
| Bellandur | 5.95 | 48,752 | 41,383 | 84.9% | 4,01,234 | 1,23,327 | 2,36,525 | 58.9% |
| Sarjapura | 5.95 | 45,603 | 38,233 | 83.8% | 4,28,493 | 1,71,739 | 2,18,521 | 51.0% |
| Kanakapura | 5.95 | 45,734 | 38,480 | 84.1% | 3,79,483 | 1,21,070 | 2,19,932 | 58.0% |
| Electronic City | 5.95 | 69,740 | 62,322 | 89.4% | 5,69,112 | 1,50,588 | 3,56,201 | 62.6% |
| **TOTAL** | — | **6,04,434** | **5,10,700** | **84.5%** | **55,30,747** | **18,24,746** | **31,95,300** | **57.8%** |

**Critical numbers to remember:**
- Actual blended savings: **57.8%** (not 71.5% as shown in my chart, not 86% as shown in existing heatmap)
- Total actual savings: **₹31.95L** (not ₹38.87L as I computed)
- Tariff is NOT ₹9/kWh — it is ₹5.95 (7 units) and ₹7.20 (4 units)
- Bellandur Corp. Office has **zero solar allocation** in actual bill — savings = ₹0

---

## Graph 1 — Generation, Consumption & Settlement Breakdown

### What the existing dashboard shows
A 3-column grouped bar: **Generation** (536.1K) | **Consumption** (604.2K) | **Settlement breakdown** split into: Matched Settlement (277.4K) + Banking (238.3K) + Grid (88.8K) + Lapsed Units. KPIs: Total Generation, Consumption, Replacement 85.31%, Surplus Demand 88.77 MWh.

### What my proposed chart shows
31-day time-series with daily bars for Generation, Consumption, Direct Match, Banking Used, Surplus to Bank, Grid Drawl. Line overlay for Replacement %.

### Technical comparison

| Dimension | Existing Dashboard | My Proposed Chart |
|---|---|---|
| **Settlement granularity** | ✅ 15-min slot matching (more accurate) | ⚠️ Daily-level matching (overestimates direct, underestimates banking) |
| **Banking computed** | ✅ 238.3K kWh (15-min level) | ❌ 27.7K kWh (8.6× underestimated) |
| **Matched settlement** | ✅ 277.4K kWh | ❌ 493.9K kWh (1.78× overestimated) |
| **Replacement %** | ✅ 85.31% | ⚠️ 86.4% (close but based on wrong model) |
| **Time dimension** | ❌ Single month aggregate only | ✅ 31-day daily time-series |
| **Lapsed units** | ✅ Tracks banking expiry (BESCOM regulatory) | ❌ Not shown |
| **Trend analysis** | ❌ No day-to-day visibility | ✅ Shows monsoon dip (Aug 20–21), best/worst days |
| **Interactivity** | ✅ Date range + unit filter | ⚠️ Static |

### Domain Expert Assessment
The 15-min slot matching in the existing dashboard is the **correct BESCOM settlement model**. In solar generation: panels produce from 6am–6pm; consumption happens 24 hours. Even on high-generation days, consumption from 10pm to 6am must be covered by banking. Daily matching misses this entirely — it sees daily gen > daily cons and calls it "direct," but BESCOM doesn't settle that way. The existing calculation (Banking = 238.3K) is closer to the actual wheeled amount (510.7K total offset includes both matched and banked).

### Business Analyst Assessment
The existing chart shows total generation vs consumption as aggregate bars — this is fine for a monthly summary slide. But it gives **zero operational insight**: which days was performance poor? Was it consistently poor (module degradation) or episodic (rain)? The daily time-series I proposed gives this, and it's essential for energy managers who need to plan grid procurement, approve banking drawdowns, and explain month-to-month variance to finance.

### Data Warehouse Assessment
The existing chart draws from a settlement calculation engine that operates at 15-min granularity. The warehouse `settlement_slots` table (in schema_v2) is correctly designed for this. My daily model is simpler but less accurate. The "Lapsed Units" dimension needs a `banking_account_balance` table tracking cumulative balance, expiry dates, and lapse events — this is **not yet in schema_v2** and must be added.

### Recommendation
**COMBINE BOTH.** Keep the existing 15-min settlement logic for KPI numbers (replacement %, banking, matched, grid, lapsed). Add a daily time-series bar chart below it showing the 31-day pattern. This gives both the accurate aggregate and the operational trend. The monthly aggregate chart is the executive view; the daily chart is the operations view.

**Missing KPIs to add:** Banking balance (running), Lapsed units YTD, Performance Ratio (actual gen vs theoretical max given irradiance), Plant Load Factor (PLF).

---

## Graph 2 — Grid Cost vs Actual Cost (Unit-wise)

### What the existing dashboard shows
Horizontal grouped bar chart: Grid Cost vs Actual Cost per unit with savings % labels. Units sorted by consumption (descending). Savings % varies from 30.7% (Bellandur Corp) to 86.1% (Old Airport Road). Note: "All calculations are based on the proposed allocation."

### What my proposed chart shows
Paired vertical bars (Grid vs Actual) at ₹9.00/kWh uniform grid rate, 86.4% uniform replacement. All units show identical 71.4% savings %.

### Technical comparison

| Dimension | Existing Dashboard | My Proposed Chart |
|---|---|---|
| **Tariff rate** | ✅ Unit-specific (₹5.95 or ₹7.20) | ❌ Uniform ₹9.00 (wrong — inflates grid cost) |
| **Replacement rate** | ✅ Unit-specific (varies by allocation) | ❌ Uniform 86.4% (hides unit-level disparity) |
| **Savings % accuracy** | ⚠️ "Proposed allocation" — not actual bill | ❌ Based on wrong assumptions |
| **Bellandur Corp** | ⚠️ Shows 30.7% but actual = 0% savings | ❌ Shows uniform 71.4% — clearly wrong |
| **Demand charges** | ✅ Included in "Without Solar" cost | ❌ Energy charges only (misses fixed demand) |
| **Business insight** | ✅ Shows which units benefit most/least | ❌ False uniformity — no insight |

### Critical finding: Savings % discrepancy
The existing dashboard's savings % does not match the actual bill for ANY unit:

| Unit | Dashboard Shows | Actual Bill Savings % | Energy Replacement % |
|---|---:|---:|---:|
| Old Airport Road | 86.1% | 65.3% | 90.5% |
| Sahakar Nagar | 86.1% | 59.8% | 90.4% |
| Sarjapura | 31.8% | 51.0% | 83.8% |
| Kanakapura | 33.1% | 58.0% | 84.1% |
| Bellandur Corp. | 30.7% | **0.0%** | 0.0% |

The existing dashboard shows "proposed allocation" which uses a different distribution model than the actual BESCOM wheeling data. This means the dashboard savings % is a **projection, not an actuality**. Presenting this to clients without a clear disclaimer is a business risk — the numbers won't reconcile with their BESCOM bill.

### Recommendation
**Use existing as the base, but fix three things:**
1. Use actual BESCOM tariff rates per unit (from `tariff_configs` in schema_v2 — must be seeded)
2. Compute from actual bill data (actual wheeling kWh × PPA rate + residual grid kWh × grid tariff) — not proposed allocation
3. Add a **Proposed vs Actual Variance** column so clients can see the gap and understand allocation methodology

**The chart should show three bars per unit:** Grid Cost · Projected (proposed allocation) · Actual (billed). This makes the allocation model transparent and builds trust.

---

## Graph 3 — Monthly Savings Heatmap (Unit × Month)

### What the existing dashboard shows
Horizontal heatmap with units on Y-axis, months on X-axis. Only Aug 2025 has data. Color-coded from light (low %) to dark blue (high %). Values range from 30.7% to 86.1%.

### What my proposed chart shows
Same structure but all units show uniform 71.4% (one color). Other months show "—" with grey.

### Assessment

The existing heatmap wins on one dimension: it shows **variation between units** — revealing that Sarjapura (31.8%), Kanakapura (33.1%), and Bellandur Corp (30.7%) are underperforming relative to other units. This is valuable for allocation planning and identifying units that may need feeder reconfiguration or capacity addition.

However, the metric being plotted ("proposed savings %") is not the same as actual bill savings, which makes the heat values potentially misleading.

The ideal heatmap should toggle between:
- **Energy Replacement %** (actual kWh replaced / total consumption) — most accurate operational metric
- **Bill Savings %** (actual bill saving vs baseline) — most relevant financial metric
- **Proposed vs Actual Gap** (where is allocation not being delivered?)

### Recommendation
**Keep the heatmap** but add a toggle for metric type and annotate cells with both % and ₹ amount. Add a "Target" reference line (e.g., contracted replacement %). Units below target should highlight in red. This turns a passive display into an exception management tool.

---

## Graph 4 — TOD Generation vs Consumption Analysis

### What the existing dashboard shows
Grouped bars by TOD slot: **Generation vs Consumption** side-by-side per slot.
- Morning Peak (6am–9am): Gen 46,837 | Cons 60,293
- Day Normal (9am–5pm): **Gen 485,095 | Cons 278,481** ← massive surplus
- Evening Peak (6pm–10pm): Gen 4,216 | Cons 109,039 ← entirely grid/bank dependent
- Night Off-Peak (10pm–6am): Gen 0 | Cons 156,405

TOD slot definitions used: Morning Peak (6–9am), Day Normal (9am–5pm), Evening Peak (6–10pm), Night Off-Peak (10pm–6am).

### What my proposed chart shows
Stacked consumption by unit, per TOD slot. **Does not show generation.** Uses different slot definitions (Morning Peak 6–10am, Day Normal 10–6pm, Evening Peak 6–10pm, Night 10pm–6am).

### Assessment

The existing chart is **significantly better** for three reasons:

1. **Shows generation profile by TOD** — this is the most critical insight. Day Normal has 485K kWh generation vs only 278K consumption. The 207K surplus goes to banking. This explains why the banking pool is large (238K from the settlement chart).

2. **Identifies the evening gap** — Evening Peak has 4.2K gen but 109K consumption. This entire slot is served from grid + bank. Since BESCOM peak tariff is highest in evening, this is where cost optimization opportunity lies.

3. **BESCOM TOD slot accuracy issue** — both charts have incorrect slot boundaries. BESCOM GESCOM HT slots are: Peak 18:00–22:00, Off-Peak 06:00–18:00, Normal 22:00–23:59, Night 00:00–06:00 (4 slots, not the 6/9/10 boundaries used). The existing dashboard's "6am–9am Morning Peak" doesn't match BESCOM's actual billing slot. This means the TOD cost calculation will be incorrect.

4. **My chart showed unit-wise consumption stacking** — this is secondary information. The primary question is: is solar covering the right TOD slots to reduce peak cost?

### Recommendation
**Use the existing chart's structure (Gen vs Cons per TOD slot) but fix two things:**
1. Use correct BESCOM TOD slot boundaries: Peak (18–22h), Off-Peak (06–18h), Normal (22–00h), Night (00–06h)
2. Add a third bar per slot showing "Grid Cost per slot" — so users see which slots are most expensive

**Add a TOD Cost Impact table** showing: slot × tariff rate × grid units × cost. This immediately quantifies evening peak exposure.

---

## Graph 5 — Power Cost Analysis (With vs Without Banking)

### What the existing dashboard shows
3-bar stacked comparison: Grid Cost | Actual With Banking | Actual Without Banking.
- Grid Cost = ₹38.8L
- With Banking: Savings = ₹15.2L, Actual = ₹23.8L (savings % ≈ 39%)
- Without Banking: Savings = ₹28.4L, Actual = ₹10.4L (savings % ≈ 73%)

**Critical problem:** "Without Banking" shows LOWER actual cost than "With Banking" — the label ordering or calculation appears **inverted**. Economic logic says banking should reduce cost, not increase it. This is very likely a display bug in the existing dashboard (possibly labels swapped, or the "without banking" bar is actually "with banking" and vice versa).

Additionally, the "With Banking" actual cost = ₹23.8L is much higher than the actual bill total of ₹18.2L from the CSV. This suggests the "actual cost" in this chart includes the PPA contract cost that is not captured in the BESCOM bill (i.e., it's including the solar contract payments made to the solar developer separately).

### What my proposed chart shows
Grid | Solar-No-Banking | Solar-With-Banking comparison with waterfall, plus energy mix chart. Values: Grid ₹54.4L (wrong rate) → No Banking ₹17.6L → With Banking ₹15.5L. Shows correct direction (banking reduces cost).

### Assessment

My chart shows the correct directional relationship (banking saves money vs no-banking). However, the absolute values are wrong due to the ₹9/kWh rate error.

The existing chart appears to have the labels inverted — the "Without Banking" scenario shows lower actual cost (₹10.4L) than "With Banking" (₹23.8L), which contradicts the economic logic. This is a bug that would confuse any client or auditor looking at the chart.

### Recommendation
**Fix both charts:**
1. Correct the "Without Banking" vs "With Banking" label order in the existing chart
2. Use actual tariff rates (₹5.95/₹7.20) not ₹9.00
3. The waterfall approach I proposed is the clearer visual — show: Grid Cost → Energy Savings → Banking Benefit → Additional Charges (wheeling + CSS + FAC) → Net Actual Cost
4. Clearly separate: RE contract cost (PPA payments to solar developer) + BESCOM bill component + DISCOM charges

**Add ROI/Payback** KPI: Monthly savings at current rate → annualised → payback period on solar investment.

---

## Graph 6 — DISCOM Bill Breakdown

### What the existing dashboard shows (Electricity Consumption Summary table)
Table showing: Month | Location | Total Units Consumed (kWh) | Bill Without Solar Credit (₹) | Effective Rate/Unit (₹/kWh).
Only shows aggregate — no line-item breakdown. Effective rate = ₹9 for all (this appears to be an estimate used for the baseline, not the actual BESCOM tariff).

### What my proposed chart shows
Full charge-head breakdown (TOD tariff × 4 slots + Fixed Demand + FAC + ED + Levies + RE charges) with donut chart showing component share. Clearly maps to `charge_head_types` catalog.

### Assessment

My proposed bill breakdown is far superior for these reasons:

1. **The actual bill has 9 distinct line items** (from the CSV): Total Consumption, Wheeling Energy, Energy Charges, Demand Charges, FAC, Tax, P&G Surcharge, Manual Wheeling Charge, Manual Energy Charges (Wheeling). The existing dashboard's table shows none of this granularity.

2. **Demand charges are ₹350–₹370/kVA/month** — for a unit like Old Airport Road with 275 kVA demand, that's ₹96,250/month fixed regardless of consumption. A client needs to see this as a separate line item.

3. **The wheeling structure is complex**: Units receive "Wheeling Energy" (solar credited at ₹1/kWh), but also pay "Manual Wheeling Energy Charge" (₹0.29/kWh) and "Manual Energy Charges – Wheeling" (₹0.20/kWh) on those same units. Net wheeling benefit = ₹1.00 − ₹0.29 − ₹0.20 = ₹0.51/kWh (not ₹1.00). The existing dashboard doesn't show this nuance.

4. **Bellandur Corp pays ₹2.14L with zero solar benefit** — this is a business problem that the bill breakdown would immediately reveal, enabling action (can this unit be connected to the solar feeder?).

### Recommendation
**Use my proposed chart structure** with full charge-head breakdown, but populate with actual BESCOM bill line items from the CSV. This directly maps to the `grid_bill_line_items` table in schema_v2. Add a toggle: "All Units" vs individual unit bill view. The existing summary table can sit above as a quick reference.

---

## Graph 7 — Unit-wise Cost Summary Table

### What the existing dashboard shows
Table: Consumption Unit | Grid Cost (₹) | Actual Cost (₹) | Savings (₹) | Savings %.

**Critical bug identified:** For several units, the "Actual Cost (₹)" column displays the kWh consumption value, not the cost in rupees. Example: HRBR Unit shows Actual Cost = ₹45,103.64 which is the same as its consumption kWh (45,104). Old Airport Road shows ₹77,528 = its kWh consumption. This is a **data format bug** — the cell is displaying the raw consumption field instead of a computed cost field.

### What my proposed chart shows
Table with: Rank | Unit | Consumption | RE Units | Grid Units | RE Cost | Grid Cost | Actual Cost | Without Solar Cost | Savings | Savings % | mini bar.

### Assessment

My proposed table is more complete and has no visible data bugs. The existing table has:
1. A clear data bug (Actual Cost = kWh value for some units)
2. No separation of RE cost vs grid residual cost
3. No rank or visual indicator

However, my table used wrong assumptions (₹9 rate, uniform 86.4% replacement).

### Recommendation
**Fix both issues together:** Use my table structure with correct tariff rates and actual bill figures from the CSV. Add a "Proposed vs Actual Δ" column showing the gap between the allocation model and real BESCOM bill — this is the reconciliation view clients need to trust the numbers.

---

## Critical Business Issues Not Addressed by Either Dashboard

### 1. Proposed vs Actual Allocation Gap
The existing dashboard uses "proposed allocation" which differs significantly from actual BESCOM wheeling. **No reconciliation view exists.** Bellandur Corp shows 30.7% savings in the dashboard but ₹0 savings on the actual bill. If a client's finance team reconciles the dashboard to their BESCOM bill, they will immediately flag this discrepancy.

**Solution:** Add a reconciliation table showing proposed kWh vs actually wheeled kWh vs variance per unit, and flag any unit where the gap exceeds 5%.

### 2. Solar Plant Performance vs Contractual Obligation
Neither dashboard shows: Is the solar plant actually generating what it should? August generation = 536.1K kWh. What was the contracted/expected generation? If the contract guarantees 600K kWh/month and only 536K was delivered, there may be a performance penalty due from the developer.

**Solution:** Add a "Plant Performance" tile with: Actual Gen | Expected Gen | PLF % | Performance Ratio.

### 3. Banking Account Balance Tracking
BESCOM banking has rules: surplus units expire at financial year end (March 31). Neither dashboard shows the running bank balance, units at risk of lapsing, or optimal drawdown strategy.

**Solution:** Add banking balance chart: running balance by month, projected expiry date, units at risk.

### 4. Tariff Accuracy for Future Months
Grid tariff for BESCOM HT changes periodically. Using a fixed ₹9.00 or even the current ₹5.95/₹7.20 will become wrong. The `tariff_configs` table in schema_v2 handles this but must be kept updated.

---

## Schema_v2 Coverage Assessment

| Dashboard Feature | Schema_v2 Support | Action Needed |
|---|---|---|
| 15-min settlement (matched/banking/grid) | ✅ `settlement_slots` | Populate from source data |
| Per-unit tariff rate | ✅ `tariff_configs` | Seed correct BESCOM rates |
| Bill charge heads (9 line items) | ✅ `grid_bill_line_items` + `charge_head_types` | Map CSV columns to charge_head codes |
| Wheeling energy credit | ✅ `charge_head_types` (WHEELING_ENERGY code) | Add credit type |
| Demand charges per unit | ✅ `grid_bill_line_items` (DEMAND_CHARGE) | Seed per unit kVA values |
| Banking balance tracking | ⚠️ Partial — missing `banking_account` table | **Add banking_account table** |
| Proposed vs actual reconciliation | ❌ Not in schema | **Add allocation_reconciliation view** |
| Plant performance (PLF, PR) | ❌ Not in schema | **Add performance_metrics table** |
| Lapsed units tracking | ❌ Not in schema | **Add to banking_account** |
| Solar developer contract details | ❌ Not in schema | **Add re_contracts table** |

---

## Recommended Final Dashboard Architecture

### Tier 1 — Executive Summary (Above-the-fold KPIs)
Total Gen (MWh) | Total Consumption (MWh) | Replacement % (actual) | Savings ₹ (actual bill) | Banking Balance (kWh) | Plant Performance (vs contracted)

### Tier 2 — Settlement & Generation
Chart A: Monthly settlement (15-min model) — existing chart structure, keep it
Chart B: **NEW** Daily time-series bar (31-day pattern, monsoon visibility, trend)

### Tier 3 — Financial Analysis
Chart C: 3-bar per unit (Grid / Projected / Actual) — fixing the existing chart with actual data
Chart D: Waterfall chart (Grid → savings components → net bill) — from my design
Chart E: Full bill breakdown by charge head — from my design, populated with actual data

### Tier 4 — Operational Analysis
Chart F: TOD Gen vs Cons (existing structure, fixed BESCOM slot boundaries)
Chart G: Banking balance trend (new)
Chart H: Monthly savings heatmap (unit × month, toggle: Replacement % / Bill Savings % / Variance)

### Tier 5 — Reconciliation & Audit
Table I: Proposed vs Actual allocation reconciliation — new
Table J: Unit-wise cost summary with correct actual figures — fixed from both designs

---

## Summary Verdict

| Graph | Winner | Why |
|---|---|---|
| Settlement Breakdown | **Existing** (method) + **Proposed** (time dimension) | 15-min logic is correct; daily time-series adds operational value |
| Grid Cost vs Actual Cost | **Neither** — both have significant errors | Existing: wrong savings %; Proposed: wrong tariff rate |
| Savings Heatmap | **Existing** (unit variation visible) | Shows unit-level disparity — critical business insight; but fix the metric |
| TOD Analysis | **Existing** (shows generation too) | Gen vs Cons by TOD slot is far more insightful than consumption-only |
| With/Without Banking | **Proposed** (correct direction) | Existing has inverted labels — appears to be a bug |
| DISCOM Bill Breakdown | **Proposed** | Full charge-head granularity vs single-row summary |
| Cost Summary Table | **Proposed** (structure) | Existing has data format bug (Actual Cost = kWh value) |

**Bottom line:** The existing dashboard has the correct settlement engine (15-min) and unit-specific tariff handling. My proposed charts add time-series trend analysis, correct banking direction, and detailed bill breakdown. The ideal dashboard combines both, fixes the bugs identified above, and adds the three missing layers: reconciliation, plant performance, and banking balance tracking.
