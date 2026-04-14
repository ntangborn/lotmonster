# Lotmonster — Product Requirements Document v3

**Version:** 3.0  
**Date:** July 2025  
**Author:** Lotmonster Team  
**Domain:** lotmonster.co  
**Status:** Active Development — Perplexity Billion Dollar Build Contest Entry  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target User](#3-target-user)
4. [The Six Pillars (Feature Scope)](#4-the-six-pillars-feature-scope)
5. [Three-Path Onboarding](#5-three-path-onboarding)
6. [Feature Priority Matrix](#6-feature-priority-matrix)
7. [Pricing](#7-pricing)
8. [What Is NOT in Scope (8-Week Build)](#8-what-is-not-in-scope-8-week-build)
9. [Success Metrics (Day 56 / Contest)](#9-success-metrics-day-56--contest)
10. [Key Design Decisions & Open Questions](#10-key-design-decisions--open-questions)
11. [Scope Boundary](#11-scope-boundary)
12. [Demo Scenario: "Lone Star Heat"](#12-demo-scenario-lone-star-heat)

---

## 1. Executive Summary

**Lotmonster** is an AI-native inventory management platform purpose-built for small Consumer Packaged Goods (CPG) manufacturers. It covers the complete **buy → make → sell** operational cycle — from purchasing raw ingredients, through production with lot traceability, to fulfilling sales orders and syncing financials with QuickBooks Online.

### Who It's For

Lotmonster targets founder-operators of small CPG brands — companies with 1–15 employees manufacturing physical products: hot sauce, craft beer, artisan baked goods, specialty foods, pet food. These operators are too sophisticated for spreadsheets but priced out of (or poorly served by) legacy ERP systems.

### The Fishbowl Problem

The incumbent in this space is **Fishbowl Inventory** — a legacy ERP originally built for widget manufacturers (discrete parts, BOMs, warehouses). Small CPG brands shoehorn their businesses into Fishbowl because no better option exists. The result:

- **$10K+ annual cost** for software that doesn't understand recipes, lots, or COGS
- **No lot genealogy** — can't trace "which customers received lot #2024-0817?"
- **Manual QuickBooks sync** — broken bridges, duplicate entries, reconciliation nightmares
- **Clunky desktop UI** — training cost is measured in weeks, not minutes
- **No recipe/assembly costing** — CPG manufacturers build cost-of-goods manually in spreadsheets alongside the "inventory system" they're paying $10K/year for

### Lotmonster's Value Proposition

| Dimension | Fishbowl | Lotmonster |
|-----------|----------|------------|
| Pricing | $10K+/year | $99–$299/mo (1/3 the cost) |
| UI | Desktop-era, weeks to learn | Modern web, minutes to learn |
| CPG fit | Shoehorned | Native (recipes, lots, FEFO) |
| QBO sync | Manual/broken | Real-time OAuth 2.0 |
| AI assist | None | Claude-powered NL queries |
| Lot traceability | Bolt-on | Core architecture |
| Onboarding | Consultant required | Self-serve, 3 paths, <7 min |

### Contest Context

Lotmonster is entered in the **Perplexity Billion Dollar Build** contest. The 8-week (56-day) build timeline drives the phasing decisions in this document. The goal: ship a production-ready MVP that demonstrates the full buy → make → sell cycle with real QBO sync and AI assistance.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ App Router |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Hosting | Vercel |
| AI | Anthropic Claude API (tool-use pattern) |
| Payments | Stripe (subscriptions + metered billing) |
| Accounting sync | QuickBooks Online API (OAuth 2.0) |

---

## 2. Problem Statement

### The Pain: Small CPG Manufacturers Are Flying Blind

Small CPG manufacturers face a unique operational challenge: they transform perishable raw ingredients into finished goods through recipes, and must track every lot through the entire supply chain — from supplier through production to customer. This is fundamentally different from discrete manufacturing (assembling widgets from parts).

#### Core Pain Points

**1. Lot Traceability Is Manual or Nonexistent**

When the FDA asks "which customers received product made with ingredient lot #X?", most small CPG manufacturers cannot answer in under 24 hours. They rely on spreadsheets, handwritten logs, or memory. A single recall event can bankrupt a small brand — not because of the recall itself, but because they can't scope it and must recall everything.

**2. Recipe Costing Is a Spreadsheet Nightmare**

A hot sauce with 8 ingredients, each purchased at different prices from different suppliers in different units (gallons, pounds, cases), requires manual unit conversion and cost aggregation. When habanero prices spike 40%, the manufacturer has no real-time visibility into how that impacts their COGS per bottle.

**3. QuickBooks Online Sync Is Broken**

99% of small manufacturers use QuickBooks Online for accounting. But QBO has no concept of production, lots, or inventory transformation. Manufacturers manually create journal entries for COGS, manually reconcile inventory values, and manually enter AP/AR transactions. Errors compound monthly.

**4. COGS Visibility Is Delayed or Wrong**

Without automated production costing, most small CPG brands don't know their true COGS until their accountant reconciles at quarter-end. By then, they've been selling product at margins they assumed, not margins they verified.

**5. Existing Tools Don't Fit**

- **Fishbowl**: Built for widget manufacturers. No lot genealogy. Manual QBO sync. $10K+/year. Desktop UI. Requires consultant for setup.
- **Katana / inFlow / Cin7**: Better UIs, but still don't understand CPG recipes natively. Lot traceability is an afterthought. Limited QBO depth.
- **Spreadsheets**: Free, flexible, unscalable. No audit trail. One accidental deletion away from disaster.

### Fishbowl's Specific Failures for CPG

| Capability | What CPG Needs | What Fishbowl Delivers |
|-----------|----------------|----------------------|
| Lot genealogy | Full forward + backward tracing | Lot numbers exist but no genealogy graph |
| Recipe costing | Real-time COGS per unit as ingredient prices change | Manual BOM costing, no live recalculation |
| QBO sync | Automated JE on production, invoice on shipment | Fragile plugin, manual reconciliation |
| FEFO | First-expiry-first-out allocation | FIFO only (by receipt date, not expiry) |
| Onboarding | Self-serve in minutes | Consultant engagement, weeks of setup |
| UI | Modern web, mobile-friendly | Windows desktop application |

### Market Sizing

| Metric | Value | Methodology |
|--------|-------|-------------|
| **TAM** | $2.5B | ~85,000 small CPG manufacturers in the US × $2,400/yr avg software spend × adjacent verticals (craft beer, bakery, pet food, supplements) |
| **SAM** | $425M | ~35,000 manufacturers actively using inventory software (Fishbowl, Katana, inFlow, Cin7, or spreadsheets-with-intent-to-upgrade) × $1,000/yr avg |
| **SOM (Year 1)** | $1.2M | 500 paying customers × $199/mo avg plan × 12 months |
| **SOM (Year 3)** | $12M | 3,000 customers × $250/mo avg (plan mix shift to Growth/Scale) + expansion revenue |

The ~85,000 figure is derived from USDA food manufacturing establishment data (NAICS 311) filtered to companies with 1–50 employees, cross-referenced with SBA size standards for small manufacturers.

---

## 3. Target User

### Primary: Founder-Operators of Small CPG Brands

- **Company size:** 1–15 employees
- **Revenue:** $100K–$5M annual
- **Products:** Physical goods manufactured from ingredient inputs (food, beverage, supplements, pet food, personal care)
- **Current tools:** QuickBooks Online (accounting) + spreadsheets (inventory) + maybe a disconnected PO system
- **Technical sophistication:** Comfortable with SaaS tools, not comfortable with ERP configuration
- **Decision maker:** The founder IS the buyer, the user, and the person who will do the initial setup

### Secondary: Contract Manufacturers (Co-Packers)

Contract manufacturers who produce for multiple brands. They need multi-tenant lot tracing (which brand's ingredients went into which production run?) and separate billing per brand. This is a P2 expansion — the core architecture supports it, but the UI won't be optimized for it at launch.

### User Persona: "Sam"

> **Sam Torres** — Founder, Lone Star Heat  
> Austin, TX | 4 employees | $800K annual revenue  
>
> Sam started Lone Star Heat in their home kitchen 4 years ago. They now manufacture 6 hot sauce SKUs in a licensed commercial kitchen, selling through 47 local retailers, a Shopify DTC store, and one regional distributor.
>
> **Current stack:** QuickBooks Online (accounting), Google Sheets (inventory tracking, recipe costing), handwritten lot logs in a composition notebook, POs via email.
>
> **Pain points:**
> - Spends 6 hours/week on inventory spreadsheets and QBO data entry
> - Had a close call when a supplier flagged a contaminated pepper lot — took 3 days to trace which batches used that lot and which customers received those batches
> - Has no idea what their actual COGS per bottle is (estimates range from $2.10 to $2.80 depending on which spreadsheet version they trust)
> - Looked at Fishbowl, got quoted $12K/year, sat through a 90-minute demo of features designed for an auto parts warehouse, and closed the tab
>
> **What Sam wants:**
> - "Tell me which customers got lot #2024-0817 in under 30 seconds"
> - "Show me my actual COGS per SKU, updated when ingredient prices change"
> - "Stop me from using expired ingredients"
> - "Sync my production costs to QBO without me touching anything"
> - "Don't make me learn another complicated system — I have sauce to make"
>
> **Success for Sam:** Lotmonster replaces the spreadsheets, the notebook, and the manual QBO entries. Sam gets 6 hours/week back and sleeps better knowing a recall won't destroy the business.

---

## 4. The Six Pillars (Feature Scope)

Lotmonster is organized around six functional pillars that together cover the complete buy → make → sell cycle. Each pillar is designed to stand alone (progressive activation) while sharing a unified data model anchored on **lots**.

### Pillar 1: Ingredient & Lot Management

The foundation. Every other pillar depends on ingredients and lots existing in the system.

**Core capabilities:**

- **Ingredient Registry** — Catalog of all raw materials with: name, category, unit of measure, allergen flags, storage requirements, default supplier, reorder point
- **Bulk Pricing** — Store purchase price per bulk unit (e.g., $45/gallon) and recipe unit (e.g., $0.35/oz). System derives unit cost chain: bulk → recipe unit with live display
- **Lot Numbers** — Every ingredient receipt creates a lot record: supplier lot #, internal lot #, quantity, expiry date, receipt date, PO reference
- **Expiry Tracking** — Visual dashboard of lot expiry status: green (>30 days), yellow (7–30 days), red (<7 days), black (expired)
- **FEFO Logic** — First-Expiry-First-Out allocation. When a production run consumes an ingredient, the system auto-selects the lot expiring soonest. Manual override available.
- **Supplier Tracking** — Link ingredients to suppliers. Track lead times, minimum order quantities, price history.
- **Low Stock Alerts** — Configurable threshold per ingredient. Push notification + dashboard badge when on-hand quantity drops below reorder point.

**Data model (simplified):**

```sql
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  unit_of_measure TEXT NOT NULL,        -- recipe unit (oz, g, ml, etc.)
  bulk_unit TEXT,                        -- purchase unit (gallon, lb, case)
  bulk_to_recipe_factor NUMERIC(12,4),  -- 1 gallon = 128 oz
  cost_per_bulk_unit NUMERIC(12,4),
  cost_per_recipe_unit NUMERIC(12,6),   -- derived: cost_per_bulk / factor
  allergens TEXT[],
  reorder_point NUMERIC(12,2),
  default_supplier_id UUID REFERENCES suppliers(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id) NOT NULL,
  lot_number TEXT NOT NULL,
  supplier_lot_number TEXT,
  quantity_received NUMERIC(12,4) NOT NULL,
  quantity_on_hand NUMERIC(12,4) NOT NULL,
  unit_cost NUMERIC(12,6) NOT NULL,
  expiry_date DATE,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  po_id UUID REFERENCES purchase_orders(id),
  status TEXT DEFAULT 'available',      -- available, depleted, expired, quarantined
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policy (every table)
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY lots_org_isolation ON lots
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
```

### Pillar 2: Purchase Orders

The "buy" in buy → make → sell.

**Core capabilities:**

- **Create PO** — Select supplier, add line items (ingredient + quantity + unit cost), set expected delivery date, add notes
- **PO States** — Draft → Sent → Partially Received → Fully Received → Closed
- **Receive Against PO** — Receive partial or full shipments. Each receipt creates lot records. Quantity discrepancies flagged automatically.
- **Auto-Deduct from Inventory** — Receipt increases on-hand quantity for the ingredient
- **QBO AP Sync** — On PO receipt, create a Bill in QBO (AP) with line items mapped to expense accounts
- **Landed Cost** — Allocate freight/duty across PO line items by weight, quantity, or value. Landed cost feeds into lot unit cost.

**PO → Lot creation flow:**

```
PO #1042 (Supplier: Texas Pepper Co.)
├── Line 1: Habaneros, 50 lbs @ $3.20/lb
│   └── Receipt → Lot #HAB-20250715 (50 lbs, expires 2025-08-15, cost $3.20/lb)
├── Line 2: Ghost Peppers, 25 lbs @ $8.50/lb
│   └── Receipt → Lot #GHO-20250715 (25 lbs, expires 2025-08-10, cost $8.50/lb)
└── Freight: $45.00 → allocated across lines by weight
    ├── Habaneros: +$0.60/lb → landed cost $3.80/lb
    └── Ghost Peppers: +$0.60/lb → landed cost $9.10/lb
```

### Pillar 3: Recipe & Production

The "make" in buy → make → sell. This is where Lotmonster's CPG-native architecture diverges most sharply from generic inventory tools.

**Core capabilities:**

- **Recipe Builder** — Define a recipe as: list of ingredients + quantities → expected yield of finished goods. Example: "Lone Star Original" = 10 lbs habaneros + 5 gal vinegar + 3 lbs garlic + ... → yields 200 bottles (5 oz each)
- **Recipe Versioning** — Full version history. When Sam changes the habanero ratio, the old version is preserved. Production runs reference a specific recipe version.
- **Production Runs** — Execute a recipe: select recipe version, specify batch multiplier, system auto-allocates lots (FEFO), confirm → deduct ingredients, create finished goods lot
- **Lot Genealogy** — The production run links: input lots (ingredients consumed) → output lot (finished goods created). This is the core of forward and backward traceability.
- **Yield Tracking** — Record actual yield vs. expected yield. System calculates waste percentage per run.
- **Production Costing** — Real-time COGS per unit: sum(ingredient lot costs consumed) / actual yield. This is the number that flows to QBO.

**Lot genealogy data model:**

```sql
CREATE TABLE production_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  recipe_id UUID REFERENCES recipes(id) NOT NULL,
  recipe_version INT NOT NULL,
  batch_multiplier NUMERIC(8,2) DEFAULT 1.0,
  status TEXT DEFAULT 'planned',  -- planned, in_progress, completed, cancelled
  expected_yield NUMERIC(12,4),
  actual_yield NUMERIC(12,4),
  waste_pct NUMERIC(5,2),         -- derived: (expected - actual) / expected * 100
  total_cost NUMERIC(12,4),       -- sum of ingredient costs consumed
  cost_per_unit NUMERIC(12,6),    -- total_cost / actual_yield
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE production_run_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_run_id UUID REFERENCES production_runs(id) NOT NULL,
  lot_id UUID REFERENCES lots(id) NOT NULL,           -- ingredient lot consumed
  ingredient_id UUID REFERENCES ingredients(id) NOT NULL,
  quantity_consumed NUMERIC(12,4) NOT NULL,
  unit_cost NUMERIC(12,6) NOT NULL,                   -- cost at time of consumption
  line_cost NUMERIC(12,4) NOT NULL                    -- quantity * unit_cost
);

CREATE TABLE production_run_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_run_id UUID REFERENCES production_runs(id) NOT NULL,
  finished_good_id UUID REFERENCES finished_goods(id) NOT NULL,
  lot_id UUID REFERENCES lots(id) NOT NULL,           -- NEW finished goods lot created
  quantity_produced NUMERIC(12,4) NOT NULL,
  cost_per_unit NUMERIC(12,6) NOT NULL
);
```

**Traceability queries:**

```sql
-- BACKWARD: "What ingredients went into finished goods lot #LSO-20250720?"
SELECT i.name, l.lot_number, pri.quantity_consumed, pri.unit_cost
FROM production_run_inputs pri
JOIN lots l ON l.id = pri.lot_id
JOIN ingredients i ON i.id = pri.ingredient_id
WHERE pri.production_run_id = (
  SELECT production_run_id FROM production_run_outputs
  WHERE lot_id = 'LSO-20250720-lot-uuid'
);

-- FORWARD: "Which customers received products made with habanero lot #HAB-20250715?"
SELECT c.name AS customer, so.order_number, sol.quantity_shipped, fgl.lot_number
FROM production_run_inputs pri
JOIN production_run_outputs pro ON pro.production_run_id = pri.production_run_id
JOIN lots fgl ON fgl.id = pro.lot_id
JOIN sales_order_lines sol ON sol.lot_id = fgl.id
JOIN sales_orders so ON so.id = sol.sales_order_id
JOIN customers c ON c.id = so.customer_id
WHERE pri.lot_id = 'HAB-20250715-lot-uuid';
```

### Pillar 4: Sales Orders & Fulfillment

The "sell" in buy → make → sell.

**Core capabilities:**

- **Sales Order Entry** — Select customer, add line items (finished good + quantity), pricing, expected ship date
- **Lot Allocation** — Allocate specific finished goods lots to sales order lines. FEFO auto-suggest with manual override.
- **Shipment Recording** — Mark order as shipped (full or partial). Deduct allocated lots. Record shipping details (carrier, tracking #).
- **Forward Lot Traceability** — "Which customers got lot #LSO-20250720?" — answered instantly via the lot allocation records.
- **QBO AR Sync** — On shipment, create an Invoice in QBO (AR) with line items mapped to revenue accounts.

**Sales order states:**

```
Draft → Confirmed → Allocated → Shipped (Partial) → Shipped (Complete) → Invoiced → Closed
```

### Pillar 5: QuickBooks Online Sync

The financial backbone. Every operational event in Lotmonster that has accounting implications is synced to QBO in real-time.

**Core capabilities:**

- **OAuth 2.0 Connect** — Standard QBO OAuth flow. Tokens stored in Supabase Vault (encrypted at rest). Auto-refresh before expiry.
- **Account Mapping** — User maps Lotmonster categories to QBO chart of accounts: which expense account for ingredients? Which revenue account for sales? Which COGS account?
- **COGS Journal Entry on Production** — When a production run completes:
  - Debit: COGS (cost of ingredients consumed)
  - Credit: Raw Materials Inventory (ingredient value removed)
  - Debit: Finished Goods Inventory (new product created at production cost)
  - Credit: COGS (to net out — the JE moves value from raw materials to finished goods)
- **AR Invoice on Shipment** — When a sales order is shipped, create a QBO Invoice with customer, line items, amounts.
- **AP Bill on PO Receipt** — When a PO is received, create a QBO Bill with supplier, line items, amounts.
- **Sync Status Dashboard** — Visual log of every sync event: timestamp, type, QBO document ID, status (success/failed/pending retry), error details.
- **Conflict Resolution** — If a QBO entity is modified outside Lotmonster, flag the conflict for manual resolution rather than overwriting.

**QBO sync architecture:**

```
Lotmonster Event → Supabase Edge Function → QBO API
                                          ↓
                               qbo_sync_log table
                               (event_type, status, qbo_doc_id, error, retry_count)
```

**Token storage:**

```sql
-- QBO tokens in Supabase Vault (encrypted)
SELECT vault.create_secret(
  'qbo_access_token',
  $access_token,
  'QuickBooks Online access token for org ' || $org_id
);

-- Retrieve for API calls
SELECT decrypted_secret FROM vault.decrypted_secrets
WHERE name = 'qbo_access_token_' || $org_id;
```

### Pillar 6: AI Assistant

Natural language interface to Lotmonster data, powered by Anthropic Claude with tool-use pattern.

**Core capabilities:**

- **Natural Language Queries** — "What's my COGS this month?", "Which lots expire this week?", "How many bottles of Original did we produce in June?"
- **Claude Tool-Use Pattern** — Claude receives a system prompt with 10 named query functions. It selects the appropriate function, fills parameters, Lotmonster executes the query, and returns results for Claude to format into a natural language response.
- **SELECT-Only DB Role** — The AI assistant connects to a read-only Supabase role. It cannot modify data. Write operations ("create a PO for...") are handled by generating a pre-filled form, not by direct DB writes.
- **Context-Aware** — The assistant knows the user's org_id, current inventory levels, and recent activity. It can reference specific lots, recipes, and orders by name.

**10 Named Query Functions:**

| # | Function | Description | Example Query |
|---|----------|-------------|---------------|
| 1 | `get_inventory_levels` | Current on-hand by ingredient or finished good | "How much habanero do I have?" |
| 2 | `get_expiring_lots` | Lots expiring within N days | "What expires this week?" |
| 3 | `get_cogs_summary` | COGS by SKU or date range | "What's my COGS this month?" |
| 4 | `get_lot_trace_forward` | Forward traceability from ingredient lot | "Who got lot #HAB-0715?" |
| 5 | `get_lot_trace_backward` | Backward traceability from finished goods lot | "What went into lot #LSO-0720?" |
| 6 | `get_production_summary` | Production runs by date range or recipe | "How many batches this week?" |
| 7 | `get_low_stock_alerts` | Ingredients below reorder point | "What do I need to reorder?" |
| 8 | `get_recipe_cost` | Current cost breakdown for a recipe | "What does Original cost to make?" |
| 9 | `get_sales_summary` | Sales orders by date range or customer | "What did we ship to HEB this month?" |
| 10 | `get_supplier_history` | Purchase history by supplier | "What have we bought from Texas Pepper Co.?" |

**Tool-use flow:**

```
User: "What's my habanero situation?"

→ Claude selects: get_inventory_levels(ingredient="habanero")
                  get_expiring_lots(ingredient="habanero", days=30)
                  get_low_stock_alerts(ingredient="habanero")

→ Lotmonster executes queries against read-only DB

→ Claude responds: "You have 35 lbs of habaneros across 2 lots.
   Lot #HAB-0701 (15 lbs) expires in 8 days — use it first.
   Lot #HAB-0715 (20 lbs) is good until August 15.
   You're above your reorder point of 20 lbs, so no need to reorder yet."
```

---

## 5. Three-Path Onboarding

Onboarding is the highest-leverage feature in Lotmonster. If a user can't create their first product (recipe + ingredients) in under 7 minutes, they churn before seeing any value.

### Design Principle: Equal-Weight Choice

The welcome screen presents three equal-weight cards — no "recommended" badge, no visual hierarchy that steers users. Different users have different mental models:

- **Path A users** think in documents: "I have a recipe card / label / spreadsheet"
- **Path B users** think in forms: "Just give me fields to fill in"
- **Path C users** think in conversation: "Let me just describe what I make"

### Path A: Upload Recipe

**Flow:**

```
1. File Drop Zone — accepts: image (JPG/PNG), PDF, CSV, TXT
2. Deterministic Parse (first pass):
   - CSV → column mapping heuristic (ingredient name, quantity, unit)
   - TXT → regex pattern matching for common recipe formats
3. Claude Vision Fallback (if deterministic parse confidence < 80%):
   - Send image/PDF to Claude vision
   - Extract: ingredients, quantities, units, recipe name, yield
4. Editable Confirmation Table:
   - Two-column table: ingredient | quantity + unit
   - User can edit any cell, add/remove rows
   - "Looks good" → creates ingredient + recipe records
   - Bulk price prompt: for each ingredient, ask purchase price + bulk unit
```

**Key decisions:**
- Deterministic parse runs first (fast, cheap, predictable)
- Claude vision is fallback, not primary (cost control + latency)
- Confirmation table is ALWAYS shown — never auto-create without user review
- Unit normalization happens at confirmation stage (suggest standard units, allow override)

### Path B: Manual Form

**Flow:**

```
1. Recipe Name + Expected Yield (quantity + unit)
2. "Add Ingredient" repeater:
   - Ingredient name (autocomplete against existing registry)
   - Recipe quantity + recipe unit (oz, g, ml, etc.)
   - Bulk price toggle (optional, expandable):
     → Purchase price + bulk unit (gallon, lb, case)
     → Conversion factor (auto-suggested based on units)
     → Live unit cost chain: "$45.00/gal → $0.352/oz"
3. Save → creates ingredient + recipe records
```

**Key decisions:**
- Zero AI — this path is 100% deterministic
- Bulk price is optional (toggle) so it doesn't block the critical path
- Live unit cost chain is displayed as user enters data — immediate value signal
- Autocomplete prevents duplicate ingredients for returning users

### Path C: AI Chat

**Flow:**

```
1. Chat interface with prompt: "Describe your product and what goes into it"
2. User types: "I make a habanero hot sauce. It's got habaneros, white vinegar,
   garlic, salt, and lime juice. A batch makes about 200 five-ounce bottles."
3. Claude extracts structured data → renders Ingredient Staging Panel
   (sidebar with editable ingredient cards)
4. User refines in the staging panel or continues chatting
5. "Edit as Form" escape hatch → switches to Path B form pre-filled
   with current staging panel data
6. "Confirm" → creates ingredient + recipe records
```

**Key decisions:**
- Staging panel is the bridge between freeform chat and structured data
- "Edit as Form" escape hatch is always visible — users can bail to Path B at any time
- Chat history is preserved if user switches to form and back
- Claude extracts quantities and units when mentioned, leaves them blank when not (user fills in form)

### Success Metric

> **First product created in under 7 minutes on all three paths.**

Measured from welcome screen card click to recipe record saved. Tracked via analytics events with timestamps.

---

## 6. Feature Priority Matrix

### P0 — Must Ship by Day 56

These features define the MVP. Without any one of them, the product does not solve the core problem.

| Feature | Pillar | Acceptance Criteria |
|---------|--------|-------------------|
| Ingredient registry | 1 | CRUD ingredients with all core fields; autocomplete search |
| Lot tracking | 1 | Create lots on receipt; track on-hand quantity; expiry dates; FEFO allocation |
| Recipe builder | 3 | Create recipe with ingredients + quantities; version on edit; cost calculation |
| Production runs | 3 | Execute recipe → deduct ingredient lots → create FG lot; yield tracking |
| Lot genealogy | 3 | Forward + backward traceability queries return in <2s |
| Basic sales orders | 4 | Create SO, allocate FG lots, mark shipped, deduct inventory |
| QBO Journal Entry sync | 5 | OAuth connect; COGS JE on production completion; sync status log |
| Three-path onboarding | — | All three paths functional; <7 min time-to-first-product |
| Stripe billing | — | Free trial → paid conversion; 3 plan tiers; metered billing for overages |
| Auth + multi-tenant | — | Supabase Auth; RLS on all tables; org-level isolation |
| Dashboard | — | Inventory summary, expiring lots, recent activity, low stock alerts |

### P1 — Day 56 Stretch Goals

Ship if time permits. Each is independently valuable and does not block P0.

| Feature | Pillar | Notes |
|---------|--------|-------|
| PO module (full) | 2 | Create PO, receive against PO, landed cost |
| QBO Invoice sync | 5 | AR invoice on shipment |
| QBO Bill sync | 5 | AP bill on PO receipt |
| AI assistant (basic) | 6 | 5 of 10 query functions; text responses only |
| Demand forecasting (basic) | 6 | Simple moving average; "you'll run out of X in Y days" |
| Supplier management | 1 | Supplier registry, price history, lead times |
| Export (CSV) | — | Export any table view to CSV |
| Bulk import (ingredients) | — | CSV upload for initial ingredient data load |

### P2 — Post-Contest (Day 57+)

Roadmap items. Architecture should not preclude them, but no code is written for them during the contest.

| Feature | Pillar | Notes |
|---------|--------|-------|
| Mobile app (PWA) | — | Progressive web app with offline production run recording |
| Advanced analytics | — | Margin trends, ingredient price volatility, seasonal demand |
| Multi-location | — | Multiple warehouses/kitchens with inter-location transfers |
| Retailer EDI | 4 | EDI 850/856 for major retailer integration |
| Barcode scanning | 1 | Camera-based barcode/QR scanning for lot receipt and allocation |
| Custom reporting builder | — | Drag-and-drop report builder |
| API (public) | — | REST API for third-party integrations |
| Co-packer mode | — | Multi-brand production tracking for contract manufacturers |
| E-commerce sync | 4 | Shopify / WooCommerce inventory sync |

---

## 7. Pricing

### Design Principles

1. **1/3 of Fishbowl** — Fishbowl charges $10K+/year. Our most expensive plan is $3,588/year.
2. **Value metric = recipes** — Recipes are the unit of CPG complexity. More recipes = more value extracted = higher willingness to pay.
3. **No per-transaction fees** — Small manufacturers run high-volume, low-margin operations. Per-transaction pricing creates anxiety.
4. **Free trial with full access** — 14-day trial on Growth plan. No credit card required. Converts to Starter at trial end if no card on file.

### Plan Comparison

| Feature | Starter ($99/mo) | Growth ($199/mo) | Scale ($299/mo) |
|---------|:-----------------:|:-----------------:|:----------------:|
| Recipes | 50 | Unlimited | Unlimited |
| Users | 1 | 3 | 10 |
| Ingredients | Unlimited | Unlimited | Unlimited |
| Lots | Unlimited | Unlimited | Unlimited |
| Production runs | Unlimited | Unlimited | Unlimited |
| Sales orders | Unlimited | Unlimited | Unlimited |
| QBO sync — JE | ✓ | ✓ | ✓ |
| QBO sync — Invoice/Bill | — | ✓ | ✓ |
| AI assistant | — | ✓ (100 queries/mo) | ✓ (unlimited) |
| Demand forecasting | — | — | ✓ |
| Multi-location | — | — | ✓ |
| Advanced reporting | — | — | ✓ |
| Priority support | — | — | ✓ |
| **Annual price** | **$1,188** | **$2,388** | **$3,588** |
| **vs. Fishbowl ($10K+)** | **88% savings** | **76% savings** | **64% savings** |

### Stripe Implementation

```
Products:
  - prod_lotmonster_starter  → price_starter_monthly ($99)
  - prod_lotmonster_growth   → price_growth_monthly ($199)
  - prod_lotmonster_scale    → price_scale_monthly ($299)

Trial:
  - 14 days on Growth plan features
  - trial_end webhook → downgrade to Starter if no payment method

Metered:
  - AI queries on Growth plan: $0.10/query over 100/mo cap
  - Tracked via Stripe usage records
```

---

## 8. What Is NOT in Scope (8-Week Build)

Explicit exclusions to prevent scope creep. These are valid features that will not be built during the 56-day contest window.

| Excluded Feature | Reason |
|-----------------|--------|
| **Mobile app** | PWA is P2. Responsive web covers mobile access during contest. |
| **EDI integrations** | Enterprise feature. No small CPG brand needs EDI at launch. |
| **Multi-warehouse** | Architecture supports it (location_id FK), but UI is single-location only. |
| **Custom reporting builder** | Pre-built reports + CSV export cover Day 56 needs. |
| **Barcode scanning** | Requires native device API. Manual lot entry is sufficient for MVP. |
| **E-commerce storefront** | Lotmonster is buy→make→sell, not sell-to-consumer. Shopify sync is P2. |
| **Advanced permissions** | MVP has admin + viewer roles only. Granular RBAC is P2. |
| **Offline mode** | Requires service worker complexity. Internet is assumed. |
| **Multi-currency** | USD only at launch. International expansion is P2. |
| **Regulatory compliance modules** | FDA/FSMA compliance reporting is valuable but not core to the operational cycle. P2. |
| **Recipe scaling optimization** | AI-suggested batch sizes based on demand. P2 after demand forecasting ships. |
| **Ingredient substitution engine** | "You're out of habaneros — here's a substitute." P2 AI feature. |

---

## 9. Success Metrics (Day 56 / Contest)

### 14 KPIs Across Three Horizons

| # | Metric | Day 56 Target | Day 56 Stretch | Day 90 Target |
|---|--------|:-------------:|:--------------:|:-------------:|
| 1 | Onboarding completion rate | >65% | >75% | >80% |
| 2 | Time to first product (recipe created) | <7 min | <5 min | <4 min |
| 3 | QBO sync success rate | >95% | >98% | >99% |
| 4 | AI query accuracy (correct answer) | >85% | >90% | >93% |
| 5 | Stripe trial → paid conversion | >15% | >20% | >25% |
| 6 | Day-7 retention (return after signup) | >40% | >50% | >55% |
| 7 | Production runs per active org per week | >2 | >4 | >5 |
| 8 | Lot traceability query time (p95) | <2s | <1s | <500ms |
| 9 | Avg onboarding path split (A/B/C) | 33% each (±10%) | — | — |
| 10 | Support tickets per 100 users per week | <8 | <5 | <3 |
| 11 | QBO connection rate (of signups) | >50% | >65% | >70% |
| 12 | Uptime (Vercel + Supabase) | >99.5% | >99.9% | >99.9% |
| 13 | Lighthouse performance score | >85 | >90 | >92 |
| 14 | NPS (first survey at Day 30) | >30 | >45 | >50 |

### Measurement Methods

- **Metrics 1–3, 6–9, 11:** Supabase analytics events + PostHog
- **Metric 4:** AI response sampling — human review of 50 random queries/week
- **Metric 5:** Stripe dashboard + webhook events
- **Metric 10:** Intercom/support tool ticket count
- **Metric 12:** Vercel + Supabase status page monitoring
- **Metric 13:** Automated Lighthouse CI on every deploy
- **Metric 14:** In-app NPS survey (Delighted or custom)

---

## 10. Key Design Decisions & Open Questions

### Decided (Bob and Ray Flags — Resolved)

**1. Transaction Boundaries for Production Runs**

**Decision:** Production run completion is a single Supabase database transaction. If any step fails (ingredient deduction, FG lot creation, cost calculation, QBO sync trigger), the entire run rolls back.

**Rationale:** A partial production run (ingredients deducted but FG not created) would corrupt inventory. The QBO sync is triggered *after* the transaction commits — it's eventually consistent, not part of the atomic transaction. Failed QBO syncs are retried via a background job with exponential backoff.

```sql
-- Pseudo-transaction for production run completion
BEGIN;
  -- 1. Deduct ingredient lots (FEFO order)
  UPDATE lots SET quantity_on_hand = quantity_on_hand - $consumed
  WHERE id IN (SELECT lot_id FROM production_run_inputs WHERE run_id = $run_id);

  -- 2. Create finished goods lot
  INSERT INTO lots (ingredient_id, lot_number, quantity_on_hand, ...)
  VALUES ($fg_id, $lot_number, $actual_yield, ...);

  -- 3. Update production run status + costs
  UPDATE production_runs SET status = 'completed', actual_yield = $yield,
    total_cost = $cost, cost_per_unit = $cost / $yield
  WHERE id = $run_id;

  -- 4. Insert QBO sync task (processed async after commit)
  INSERT INTO qbo_sync_queue (event_type, ref_id, payload)
  VALUES ('production_complete', $run_id, $journal_entry_payload);
COMMIT;
```

**2. NL Query Architecture: Tool-Use vs. Fine-Tune**

**Decision:** Tool-use pattern with Claude. Not fine-tuning.

**Rationale:**
- Tool-use is available today with Claude 3.5 Sonnet — no training pipeline needed
- 10 named functions are well within Claude's tool-use capabilities
- Fine-tuning would require training data we don't have yet (chicken-and-egg)
- Tool-use gives us explicit control over what SQL runs (we define the functions, not Claude)
- Cost is manageable: ~$0.01–0.03 per query at Claude Sonnet pricing

**3. RLS NULL Guard Pattern**

**Decision:** Every RLS policy includes an explicit NULL guard on `org_id`.

**Rationale:** If `auth.uid()` returns NULL (unauthenticated request that somehow bypasses middleware), the policy must fail closed, not open. Without the NULL guard, a NULL `org_id` comparison could match rows with NULL `org_id` (if any exist due to data bugs).

```sql
CREATE POLICY org_isolation ON ingredients
  USING (
    org_id IS NOT NULL
    AND org_id = (
      SELECT org_id FROM profiles
      WHERE id = auth.uid()
      AND auth.uid() IS NOT NULL
    )
  );
```

**4. QBO Token Storage**

**Decision:** Supabase Vault for QBO OAuth tokens.

**Rationale:**
- Vault provides AES-256 encryption at rest
- Tokens are never exposed in client-side code or Supabase realtime subscriptions
- Refresh token rotation is handled server-side (Edge Function)
- Vault secrets are accessed only through server-side functions, never through PostgREST

**5. Bulk Price Storage: Source of Truth vs. Derived**

**Decision:** `cost_per_bulk_unit` and `bulk_to_recipe_factor` are stored (source of truth). `cost_per_recipe_unit` is stored as a derived/cached value but recalculated on every bulk price or factor change.

**Rationale:**
- Users think in bulk prices ("I pay $45/gallon for vinegar")
- Recipes reference recipe-unit costs ("this recipe uses 16 oz of vinegar at $0.352/oz")
- Storing the derived value avoids recalculation on every recipe cost query (performance)
- A trigger ensures consistency: on UPDATE of cost_per_bulk_unit or bulk_to_recipe_factor, recalculate cost_per_recipe_unit

```sql
CREATE OR REPLACE FUNCTION recalculate_recipe_unit_cost()
RETURNS TRIGGER AS $$
BEGIN
  NEW.cost_per_recipe_unit :=
    CASE WHEN NEW.bulk_to_recipe_factor > 0
         THEN NEW.cost_per_bulk_unit / NEW.bulk_to_recipe_factor
         ELSE 0
    END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_unit_cost
  BEFORE INSERT OR UPDATE OF cost_per_bulk_unit, bulk_to_recipe_factor
  ON ingredients
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_recipe_unit_cost();
```

### Open Questions (Unresolved)

| # | Question | Owner | Blocking? | Notes |
|---|----------|-------|-----------|-------|
| 1 | Should production runs support partial completion (pause/resume)? | Engineering | No | V1 is atomic: start → complete/cancel. Partial introduces state complexity. |
| 2 | How do we handle QBO rate limits at scale (500 req/min shared)? | Engineering | No | Not a Day 56 problem. Queue + backoff is sufficient for contest. |
| 3 | Should the AI assistant support write operations via form pre-fill? | Product | No | V1 is read-only. "Create a PO for 50 lbs habaneros" → pre-fill PO form, don't auto-create. |
| 4 | Multi-UOM (tracking in both lbs and cases simultaneously)? | Product | No | V1: single recipe UOM per ingredient. Multi-UOM is a P2 complexity bomb. |
| 5 | Should we build a dedicated "Recall Mode" (lock lots, notify customers)? | Product | No | V1 delivers the data (traceability). Recall workflow (notifications, lock) is P2. |
| 6 | Supabase Edge Function cold start latency for QBO sync? | Engineering | Yes (testing) | Need to benchmark. If >3s, consider always-warm function or Vercel API route. |
| 7 | Pricing tier enforcement — hard wall or soft limit with upgrade prompt? | Product | No | Leaning soft limit: show upgrade modal, allow 3-day grace period. |

---

## 11. Scope Boundary

### What We ARE Building (8 Weeks)

A production-ready SaaS application that enables a small CPG manufacturer to:

1. **Register** their ingredients, suppliers, and recipes
2. **Purchase** ingredients via POs and receive them into lot-tracked inventory
3. **Produce** finished goods from recipes with full lot genealogy
4. **Sell** finished goods via sales orders with lot allocation
5. **Sync** all financial events to QuickBooks Online
6. **Ask** natural language questions about their business via AI assistant
7. **Onboard** in under 7 minutes via their preferred path
8. **Pay** via Stripe with a 14-day free trial

### What We Are NOT Building

- A general-purpose ERP (no HR, no CRM, no project management)
- An e-commerce platform (no storefront, no checkout, no customer portal)
- A warehouse management system (no bin locations, no pick/pack/ship optimization)
- A food safety compliance tool (no HACCP plans, no SQF checklists, no FDA submission)
- A demand planning suite (basic forecasting only — "you'll run out in X days")
- A marketplace or B2B platform connecting buyers and sellers
- An accounting system (QBO is the system of record — we sync to it, never replace it)

### Architecture Guardrails

These constraints ensure the 8-week build stays focused while leaving the right extensibility hooks:

1. **Single-tenant per org** — no cross-org data sharing (co-packer mode is P2)
2. **Single currency (USD)** — all monetary values stored as USD NUMERIC(12,4)
3. **Single location** — no `location_id` in P0 queries (FK exists in schema for P2)
4. **Server-side AI only** — no client-side AI model calls. All Claude calls go through Edge Functions.
5. **No real-time collaboration** — optimistic locking, not CRDT. Last-write-wins with conflict detection.
6. **QBO is truth for accounting** — Lotmonster syncs TO QBO. We never read from QBO to update inventory.

---

## 12. Demo Scenario: "Lone Star Heat"

This is the 5-minute demo script that walks through the complete buy → make → sell cycle using the Lone Star Heat hot sauce brand as demo data. It serves as both a contest demo and a functional test of all P0 features.

### Setup (Pre-Loaded Demo Data)

- **Organization:** Lone Star Heat
- **User:** Sam Torres (sam@lonestarheat.com)
- **Recipes:** Lone Star Original, Lone Star Smoky Ghost, Lone Star Verde
- **Ingredients:** Habanero peppers, ghost peppers, tomatillos, white vinegar, garlic, sea salt, lime juice, mesquite smoke extract
- **Customers:** Whole Foods Austin, Central Market, HEB, Fiesta Mart, DTC (Shopify)
- **Suppliers:** Texas Pepper Co., Hill Country Garlic, Austin Vinegar Works

### Demo Script (5 Minutes)

**Minute 0:00–1:00 — Onboarding (Path A)**

> "Sam signs up and is greeted by three onboarding paths. They choose Upload Recipe and drop a photo of their recipe card for Lone Star Original. Lotmonster's parser extracts the 7 ingredients, quantities, and yield. Sam confirms the table, adjusts the vinegar quantity from 4 to 5 gallons, and hits Save. First product created in 90 seconds."

**Minute 1:00–2:00 — Purchase Order**

> "Sam creates a PO for Texas Pepper Co.: 50 lbs habaneros at $3.20/lb and 25 lbs ghost peppers at $8.50/lb. Freight: $45. Sam receives the PO — two new lots are created automatically with landed costs ($3.80/lb and $9.10/lb). Inventory dashboard shows the new lots with expiry dates highlighted in green. A Bill is queued for QBO sync."

**Minute 2:00–3:30 — Production Run**

> "Sam starts a production run of Lone Star Original, 2x batch. The system auto-allocates ingredient lots using FEFO — the oldest habanero lot is selected first. Sam confirms and starts the run. When complete, Sam enters actual yield: 380 bottles (expected: 400). Waste: 5%. A finished goods lot #LSO-20250720 is created."
>
> "The cost breakdown appears: total ingredient cost $312.40, cost per bottle $0.822. A COGS journal entry is automatically synced to QuickBooks — debit COGS, credit Raw Materials, debit Finished Goods."

**Minute 3:30–4:30 — Sales Order + Traceability**

> "Sam creates a sales order for Whole Foods Austin: 100 bottles of Lone Star Original. The system allocates lot #LSO-20250720. Sam marks the order as shipped."
>
> "Now the traceability demo: Sam searches for habanero lot #HAB-20250715. In one click, the lot genealogy shows: this lot was used in production run #PR-2024-042, which produced finished goods lot #LSO-20250720, which was shipped to Whole Foods Austin. Forward + backward trace, sub-2 seconds."

**Minute 4:30–5:00 — AI Assistant**

> "Sam opens the AI assistant and types: 'What's my COGS this month and which lots expire this week?'"
>
> "Claude responds with a formatted summary: COGS for July is $1,847.20 across 6 production runs. Two lots expire within 7 days: ghost pepper lot #GHO-20250701 (3 lbs remaining, expires July 25) and lime juice lot #LMJ-20250705 (1.5 gal remaining, expires July 28). Use them or lose them."

### Demo Data Seed Script

```sql
-- Abridged: key demo data inserts
INSERT INTO organizations (id, name, slug)
VALUES ('org-demo-uuid', 'Lone Star Heat', 'lone-star-heat');

INSERT INTO ingredients (org_id, name, unit_of_measure, bulk_unit,
  bulk_to_recipe_factor, cost_per_bulk_unit, cost_per_recipe_unit)
VALUES
  ('org-demo-uuid', 'Habanero Peppers', 'lb', 'lb', 1, 3.20, 3.20),
  ('org-demo-uuid', 'White Vinegar', 'oz', 'gallon', 128, 12.00, 0.09375),
  ('org-demo-uuid', 'Garlic', 'oz', 'lb', 16, 4.50, 0.28125),
  ('org-demo-uuid', 'Sea Salt', 'oz', 'lb', 16, 1.20, 0.075),
  ('org-demo-uuid', 'Lime Juice', 'oz', 'gallon', 128, 18.00, 0.140625),
  ('org-demo-uuid', 'Ghost Peppers', 'lb', 'lb', 1, 8.50, 8.50),
  ('org-demo-uuid', 'Tomatillos', 'lb', 'lb', 1, 2.80, 2.80),
  ('org-demo-uuid', 'Mesquite Smoke Extract', 'oz', 'bottle', 16, 24.00, 1.50);

-- Recipe: Lone Star Original (1x batch = 200 bottles)
INSERT INTO recipes (org_id, name, expected_yield, yield_unit)
VALUES ('org-demo-uuid', 'Lone Star Original', 200, 'bottles (5oz)');

-- Recipe ingredients (for 1x batch)
-- Habaneros: 10 lbs, Vinegar: 5 gal (640 oz), Garlic: 3 lbs (48 oz),
-- Salt: 8 oz, Lime juice: 32 oz
```

---

## Appendix A: Tech Stack Details

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Frontend framework | Next.js 14+ App Router | Server components for fast initial load; Server Actions for mutations; built-in auth middleware |
| UI components | shadcn/ui + Tailwind CSS | Accessible, composable, no vendor lock-in |
| Database | Supabase PostgreSQL | Managed Postgres with RLS, Realtime, Vault, Edge Functions |
| Auth | Supabase Auth | Email + Google OAuth; JWT-based; integrates with RLS |
| File storage | Supabase Storage | Recipe uploads, PO attachments, export files |
| AI | Anthropic Claude 3.5 Sonnet | Best tool-use performance; reasonable cost; fast inference |
| Payments | Stripe | Industry standard; subscription + metered billing; customer portal |
| Accounting | QuickBooks Online API | 99% market share in target segment; OAuth 2.0; REST API |
| Hosting | Vercel | Zero-config Next.js deployment; edge functions; analytics |
| Monitoring | Vercel Analytics + Sentry | Performance monitoring + error tracking |
| Email | Resend | Transactional emails (PO confirmations, expiry alerts, invoices) |

## Appendix B: Database Schema Overview

```
organizations
├── profiles (users, linked via Supabase Auth)
├── suppliers
├── customers
├── ingredients
│   └── lots (ingredient lots with expiry, cost, on-hand qty)
├── finished_goods
│   └── lots (finished goods lots, linked to production runs)
├── recipes
│   └── recipe_versions
│       └── recipe_ingredients (ingredient + quantity per version)
├── purchase_orders
│   └── po_lines
│       └── po_receipts → creates lots
├── production_runs
│   ├── production_run_inputs → consumes ingredient lots
│   └── production_run_outputs → creates finished goods lots
├── sales_orders
│   └── sales_order_lines → allocates finished goods lots
│       └── shipments
└── qbo_sync_log (every QBO API interaction)
```

## Appendix C: API Route Structure

```
/app
├── (auth)
│   ├── login/
│   └── signup/
├── (dashboard)
│   ├── page.tsx                    — Dashboard home
│   ├── ingredients/
│   │   ├── page.tsx                — Ingredient list
│   │   └── [id]/page.tsx           — Ingredient detail + lots
│   ├── recipes/
│   │   ├── page.tsx                — Recipe list
│   │   └── [id]/page.tsx           — Recipe builder
│   ├── production/
│   │   ├── page.tsx                — Production run list
│   │   └── [id]/page.tsx           — Run detail + lot genealogy
│   ├── purchase-orders/
│   │   ├── page.tsx                — PO list
│   │   └── [id]/page.tsx           — PO detail + receiving
│   ├── sales-orders/
│   │   ├── page.tsx                — SO list
│   │   └── [id]/page.tsx           — SO detail + shipping
│   ├── traceability/
│   │   └── page.tsx                — Lot search + genealogy graph
│   ├── assistant/
│   │   └── page.tsx                — AI chat interface
│   └── settings/
│       ├── page.tsx                — Org settings
│       ├── quickbooks/page.tsx     — QBO connection + account mapping
│       ├── billing/page.tsx        — Stripe customer portal
│       └── team/page.tsx           — User management
├── onboarding/
│   ├── page.tsx                    — Three-card welcome
│   ├── upload/page.tsx             — Path A
│   ├── manual/page.tsx             — Path B
│   └── chat/page.tsx               — Path C
└── api/
    ├── qbo/
    │   ├── callback/route.ts       — OAuth callback
    │   ├── sync/route.ts           — Sync trigger
    │   └── webhook/route.ts        — QBO webhooks
    ├── ai/
    │   └── query/route.ts          — Claude tool-use endpoint
    ├── stripe/
    │   └── webhook/route.ts        — Stripe webhooks
    └── onboarding/
        └── parse/route.ts          — Recipe file parsing
```

---

*End of Lotmonster PRD v3*
