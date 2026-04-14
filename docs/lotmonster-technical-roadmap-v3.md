# Lotmonster — Technical Roadmap v3

**AI-Native Inventory Management for Small CPG Manufacturers**

Domain: lotmonster.co | Local path: `F:\Projects\lotmonster` | Build window: 8 weeks (56 days)

Perplexity Billion Dollar Build Contest Entry

---

## 1. What Changed in v3

| Change | v2 (Stackline) | v3 (Lotmonster) |
|---|---|---|
| Product name | Stackline | **Lotmonster** |
| Domain | stackline.app | **lotmonster.co** |
| Local project path | `F:\Projects\stackline` | `F:\Projects\lotmonster` |
| AI model ID | `claude-3-7-sonnet` (retired) | **`claude-sonnet-4-6`** (Sonnet 4.6 — current) |
| Supabase SSR | `@supabase/ssr` v0.5.x | **`@supabase/ssr` v0.10.2** |
| QBO API version | minorversion=65 | **minorversion=75** |
| Stripe API version | 2024-xx | **2026-03-25.dahlia** |
| Vercel compute | Standard serverless | **Fluid compute** (10 s → 60 s ceiling, pay-per-ms) |
| Middleware file | `middleware.ts` | **`proxy.ts`** (Next.js 16 rename) |

### Why the rename?

"Stackline" conflicted with an existing analytics company. "Lotmonster" signals the core domain — **lot tracking** — and is available as a `.co` domain.

### API research notes (dev-docs-spec)

- **Supabase SSR v0.10.2**: `createServerClient()` now requires explicit `getAll()` / `setAll()` cookie handlers. The `cookies()` helper from Next.js is async in App Router.
- **QBO minorversion=75**: Adds `TaxCodeRef` nesting on `Line` items for international tax support, and `MetaData.LastUpdatedTime` precision to millisecond.
- **Stripe 2026-03-25.dahlia**: `Subscription.default_payment_method` is now required on creation. `checkout.session.completed` webhook payload includes `subscription` directly.
- **Vercel Fluid compute**: Function timeout scales from 10 s to 60 s based on execution. `maxDuration` in `vercel.json` sets ceiling. Cron jobs inherit this limit.

---

## 2. Technology Stack

| # | Layer | Technology | Version / Notes | Rationale |
|---|---|---|---|---|
| 1 | Presentation | Next.js 15 App Router | `next@15.x`, React 19, Turbopack | RSC-first rendering; streaming; App Router conventions |
| 2 | Auth | Supabase Auth | `@supabase/ssr` v0.10.2 | Magic link + Google OAuth; PKCE flow; row-level org isolation |
| 3 | Database | Supabase PostgreSQL | Postgres 15, pg_cron | Managed Postgres with RLS, extensions, and pgvector if needed |
| 4 | Secret Storage | Supabase Vault | `vault.create_secret()` | Encrypted at rest; used for QBO refresh tokens per org |
| 5 | File Storage | Supabase Storage | S3-compatible | Ingredient images, COA PDFs, export files |
| 6 | AI Engine | Anthropic Claude | `claude-sonnet-4-6` | Tool-use pattern; structured output; 200K context |
| 7 | Hosting | Vercel | Fluid compute, Edge Network | Zero-config deploys from Git; preview deploys per PR |
| 8 | Cron | Vercel Cron Jobs | `vercel.json` schedule | Nightly QBO sync, expiry alerts, token refresh |
| 9 | Payments | Stripe Billing | API 2026-03-25.dahlia | Checkout Sessions, Customer Portal, webhook-driven |
| 10 | Accounting Sync | QuickBooks Online | REST API v3, minorversion=75 | OAuth 2.0; AP Bills, AR Invoices, Journal Entries |
| 11 | UI Components | shadcn/ui + Tailwind CSS | Tailwind v4, Radix primitives | Copy-paste components; full control; accessible |
| 12 | State | React Query + Zustand | TanStack Query v5 | Server-state cache + minimal client store |
| 13 | Testing | Playwright | E2E + component testing | Cross-browser; CI-integrated; visual regression |

---

## 3. Architecture Overview

### Layer Responsibility Map

| Layer | Responsibility | Key Files / Patterns |
|---|---|---|
| **Presentation** | Next.js App Router. RSC for data-heavy views (ingredient list, dashboard). Client Components for interactive UI (recipe builder, production form). | `app/(dashboard)/`, `app/(auth)/` |
| **API / Logic** | Next.js Route Handlers (`app/api/*`) for external integrations (QBO, Stripe, AI). Server Actions for internal mutations (create ingredient, start production run). | `app/api/qbo/`, `app/api/ai/`, `lib/actions/` |
| **File Processing** | `js-xlsx` (SheetJS) for spreadsheet parsing. Claude Vision for ingredient label images. Deterministic regex extraction runs first; AI only for ambiguous fields. | `lib/parsers/xlsx.ts`, `lib/parsers/vision.ts` |
| **AI Engine** | Claude tool-use pattern. 10 named query functions registered as tools. Claude calls `supabase.rpc()` via tool calls — **never raw SQL**. SELECT-only DB role for AI queries. | `lib/ai/tools.ts`, `lib/ai/agent.ts` |
| **Data** | 12-table Supabase schema. RLS on every table. Org-based isolation via `org_id` foreign key. FEFO (First Expired, First Out) ordering on `ingredient_lots`. | `supabase/migrations/` |
| **Auth** | Supabase Auth with `@supabase/ssr`. `proxy.ts` (Next.js 16 middleware rename) refreshes session on every request. `getClaims()` extracts `org_id` for RLS. | `proxy.ts`, `lib/supabase/server.ts` |
| **External** | QBO OAuth 2.0 (token rotation every 24h). Stripe webhooks (idempotent). Anthropic API (tool-use, streaming). | `app/api/qbo/`, `app/api/stripe/` |
| **Infrastructure** | Vercel (hosting + cron + preview deploys). Supabase (DB + auth + storage + vault). DNS on Cloudflare → lotmonster.co. | `vercel.json`, Supabase Dashboard |

### Request Flow

```
Browser → Vercel Edge (proxy.ts) → Next.js App Router
  ├─ RSC: Server Component → Supabase (RLS query) → HTML stream
  ├─ Route Handler: /api/* → business logic → Supabase / QBO / Stripe / Claude
  └─ Server Action: form submit → mutation → revalidatePath()
```

### AI Query Architecture

```
User question → POST /api/ai/query
  → Claude receives system prompt + 10 tool definitions
  → Claude selects tool(s) → calls supabase.rpc('get_cogs_summary', {...})
  → Results returned to Claude → Claude formats natural-language answer
  → Streamed back to UI
```

---

## 4. Database Schema — Full 12-Table Model

### Group 1 — Foundation

```sql
-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE organizations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'free'
                CHECK (plan IN ('free', 'starter', 'growth', 'scale')),
  stripe_customer_id TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS: users see only their own org
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_org_isolation" ON users
  USING (org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid()));
```

### Group 2 — Suppliers, POs, Ingredients

```sql
-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE suppliers (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  contact_email   TEXT,
  lead_time_days  INTEGER DEFAULT 7,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON suppliers
  USING (org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid()));

-- ============================================================
-- INGREDIENTS
-- ============================================================
CREATE TABLE ingredients (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id              UUID NOT NULL REFERENCES organizations(id),
  name                TEXT NOT NULL,
  unit                TEXT NOT NULL,          -- 'oz', 'g', 'ml', 'each'
  bulk_qty            NUMERIC,               -- e.g. 50
  bulk_unit           TEXT,                   -- e.g. 'lb'
  bulk_price_cents    INTEGER,               -- e.g. 4500 ($45.00)
  cost_per_unit_cents INTEGER,               -- derived: bulk_price / (bulk_qty * conversion)
  supplier_id         UUID REFERENCES suppliers(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

-- ⚠️ RLS NULL guard pattern (critical — Ray flag):
-- If auth.uid() returns NULL, the subquery returns NULL,
-- and NULL = NULL is FALSE → query returns 0 rows, NOT all rows.
CREATE POLICY "org_isolation" ON ingredients
  USING (org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid()));

-- ============================================================
-- INGREDIENT LOTS
-- ============================================================
CREATE TABLE ingredient_lots (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
  lot_number      TEXT NOT NULL,
  expiry_date     DATE,
  qty_on_hand     NUMERIC NOT NULL DEFAULT 0,
  received_date   DATE DEFAULT CURRENT_DATE,
  po_id           UUID REFERENCES purchase_orders(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ingredient_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON ingredient_lots
  USING (
    ingredient_id IN (
      SELECT i.id FROM ingredients i
      WHERE i.org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid())
    )
  );

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
CREATE TABLE purchase_orders (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
  ordered_at  TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  total_cents INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON purchase_orders
  USING (org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid()));

-- ============================================================
-- PO LINE ITEMS
-- ============================================================
CREATE TABLE po_line_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
  qty_ordered     NUMERIC NOT NULL,
  qty_received    NUMERIC DEFAULT 0,
  unit_cost_cents INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON po_line_items
  USING (
    po_id IN (
      SELECT po.id FROM purchase_orders po
      WHERE po.org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid())
    )
  );
```

### Group 3 — Products, Recipes, Production

```sql
-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'finished'
                CHECK (type IN ('finished', 'wip', 'raw')),
  version     INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON products
  USING (org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid()));

-- ============================================================
-- RECIPE LINES
-- ============================================================
CREATE TABLE recipe_lines (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
  qty_per_batch   NUMERIC NOT NULL,
  unit            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recipe_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON recipe_lines
  USING (
    product_id IN (
      SELECT p.id FROM products p
      WHERE p.org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid())
    )
  );

-- ============================================================
-- PRODUCTION RUNS
-- ============================================================
CREATE TABLE production_runs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  product_id    UUID NOT NULL REFERENCES products(id),
  batch_size    NUMERIC NOT NULL DEFAULT 1,
  lot_number    TEXT NOT NULL,
  started_at    TIMESTAMPTZ DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  waste_pct     NUMERIC DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE production_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON production_runs
  USING (org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid()));

-- ============================================================
-- PRODUCTION LOT ALLOCATIONS
-- ============================================================
CREATE TABLE production_lot_allocations (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  production_run_id   UUID NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE,
  ingredient_lot_id   UUID NOT NULL REFERENCES ingredient_lots(id),
  qty_used            NUMERIC NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE production_lot_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON production_lot_allocations
  USING (
    production_run_id IN (
      SELECT pr.id FROM production_runs pr
      WHERE pr.org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid())
    )
  );
```

### Group 4 — Sales, Fulfillment, QBO Ledger

```sql
-- ============================================================
-- SALES ORDERS
-- ============================================================
CREATE TABLE sales_orders (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations(id),
  customer_name   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  ordered_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON sales_orders
  USING (org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid()));

-- ============================================================
-- SO LINE ITEMS
-- ============================================================
CREATE TABLE so_line_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  so_id       UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  qty         NUMERIC NOT NULL,
  price_cents INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE so_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON so_line_items
  USING (
    so_id IN (
      SELECT so.id FROM sales_orders so
      WHERE so.org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid())
    )
  );

-- ============================================================
-- SHIPMENTS
-- ============================================================
CREATE TABLE shipments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  so_id           UUID NOT NULL REFERENCES sales_orders(id),
  shipped_at      TIMESTAMPTZ DEFAULT now(),
  tracking_number TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON shipments
  USING (
    so_id IN (
      SELECT so.id FROM sales_orders so
      WHERE so.org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid())
    )
  );

-- ============================================================
-- SHIPMENT LOT ALLOCATIONS
-- ============================================================
CREATE TABLE shipment_lot_allocations (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id       UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  production_lot_id UUID NOT NULL REFERENCES production_runs(id),
  qty_shipped       NUMERIC NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE shipment_lot_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON shipment_lot_allocations
  USING (
    shipment_id IN (
      SELECT s.id FROM shipments s
      WHERE s.so_id IN (
        SELECT so.id FROM sales_orders so
        WHERE so.org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid())
      )
    )
  );

-- ============================================================
-- QBO SYNC LOG
-- ============================================================
CREATE TABLE qbo_sync_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL,      -- 'bill', 'invoice', 'journal_entry'
  entity_id   UUID NOT NULL,      -- FK to the source record
  qbo_id      TEXT,               -- QuickBooks entity ID after sync
  synced_at   TIMESTAMPTZ DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'success', 'error')),
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE qbo_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON qbo_sync_log
  USING (org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid()));
```

### RLS NULL Guard Pattern — Detailed Explanation

```sql
-- The standard RLS pattern uses a subquery to resolve org_id:
CREATE POLICY "org_isolation" ON ingredients
  USING (org_id = (SELECT u.org_id FROM users u WHERE u.id = auth.uid()));

-- WHY THIS IS SAFE:
-- 1. If auth.uid() is NULL (unauthenticated request), the subquery returns NULL
-- 2. NULL = NULL evaluates to FALSE in SQL (not TRUE)
-- 3. Therefore: no rows match → query returns empty set
-- 4. This is correct behavior — unauthenticated users see nothing

-- DANGEROUS ALTERNATIVE (DO NOT USE):
-- USING (org_id = current_setting('app.current_org_id')::uuid)
-- If the setting is unset, this throws an error or returns all rows
-- depending on the missing_ok parameter. Never use this pattern.
```

---

## 5. Phase Plan — 8 Weeks (56 Days)

### Phase 0: Foundation (Days 1–2)

| Deliverable | Details |
|---|---|
| Next.js scaffold | `npx create-next-app@latest lotmonster --app --ts --tailwind --turbopack` |
| Supabase project | Create project, note URL + anon key + service role key |
| Vercel deploy | Connect GitHub repo, set env vars, confirm preview deploys work |
| Environment vars | All `.env.local` values populated (see Section 8) |
| Domain | `lotmonster.co` DNS pointed to Vercel |
| Git structure | `main` branch protected, PR-based workflow |

### Phase 1: Auth + Schema (Days 3–6)

| Deliverable | Details |
|---|---|
| Supabase Auth | Magic link + Google OAuth configured |
| `proxy.ts` | Session refresh middleware (Next.js 16 rename from `middleware.ts`) |
| `getClaims()` | Helper to extract `org_id` from JWT claims |
| Database migration | All 12 tables created (see Section 4) |
| RLS policies | Every table has `org_isolation` policy with NULL guard |
| Org creation flow | First user creates org → inserts into `organizations` + `users` |

### Phase 2: Three-Path Onboarding (Days 7–14)

| Path | Description |
|---|---|
| **Path A — Spreadsheet Upload** | User uploads XLSX/CSV of ingredients. `js-xlsx` parses rows. UI shows preview table with editable columns. Confirm → bulk insert into `ingredients`. |
| **Path B — Photo/Label Scan** | User uploads photo of ingredient label. Claude Vision extracts: name, supplier, unit, bulk qty, bulk price. Deterministic regex runs first; Claude handles ambiguous fields. |
| **Path C — AI Conversation** | User describes their products in plain English. Claude extracts ingredients, quantities, suppliers via tool-use. Confirms with user, then inserts. |

**Bulk pricing chain**: `bulk_price_cents` ÷ (`bulk_qty` × unit conversion factor) = `cost_per_unit_cents`. This derived value is recalculated on every edit.

**Unit conversion**: A conversion table maps between common CPG units (lb→oz, kg→g, gal→fl_oz, etc.). Stored in `lib/units.ts` as a static lookup.

### Phase 3: Ingredient & Lot Core (Days 15–20)

| Deliverable | Details |
|---|---|
| Ingredient registry | CRUD for ingredients with supplier linking |
| Lot management | Create lots on PO receipt; track `qty_on_hand` |
| Expiry tracking | Dashboard widget: lots expiring within 30/60/90 days |
| FEFO ordering | All lot consumption queries order by `expiry_date ASC` (First Expired, First Out) |
| Low-stock alerts | Configurable threshold per ingredient; cron-triggered notifications |
| Ingredient detail page | Lot history, cost history, supplier info, usage chart |

### Phase 4: Recipe & Production (Days 21–28)

| Deliverable | Details |
|---|---|
| Recipe builder | Add ingredients to product recipe with `qty_per_batch` and `unit` |
| Production run form | Select product → auto-calculate required ingredients × batch size |
| FEFO lot allocation | System allocates from oldest-expiry lots first (auto) or user overrides |
| Atomic deduction | Transaction: deduct `qty_on_hand` from multiple `ingredient_lots` in single DB transaction |
| Production lot number | Auto-generated: `{product_code}-{YYYYMMDD}-{seq}` |
| COGS calculation | Sum of (`qty_used` × `cost_per_unit_cents`) for each allocation in the run |
| Waste tracking | `waste_pct` recorded per run; factors into true COGS |

### Phase 5: PO Module (Days 29–35)

| Deliverable | Details |
|---|---|
| PO creation | Select supplier → add line items (ingredient + qty + unit cost) |
| PO status flow | draft → sent → partial → received |
| Receiving | Mark line items received; auto-create `ingredient_lots` with lot numbers |
| QBO AP Bill sync | On PO received → create QBO Bill via REST API |
| QBO token management | Store refresh token in Supabase Vault; rotate on every use |

### Phase 6: Sales Orders (Days 36–42)

| Deliverable | Details |
|---|---|
| Sales order entry | Customer name, line items (product + qty + price) |
| Fulfillment | Create shipment → allocate production lots → deduct inventory |
| Lot traceability | From any sales order → trace back to exact ingredient lots used |
| QBO AR Invoice sync | On SO confirmed → create QBO Invoice |
| QBO Journal Entry | COGS journal entry: debit COGS, credit Inventory |

### Phase 7: AI Assistant (Days 43–49)

| Deliverable | Details |
|---|---|
| Claude tool-use agent | System prompt + 10 tool definitions (see Section 7) |
| Streaming responses | Server-Sent Events from `/api/ai/query` → UI chat component |
| SELECT-only DB role | AI queries run as `lotmonster_ai_reader` role — no mutations |
| Named query functions | All 10 `supabase.rpc()` functions deployed (see Section 7) |
| AI onboarding (Path C) | Conversational ingredient entry via Claude (from Phase 2) |
| Chat history | Last 20 messages stored in-memory per session (not persisted) |

### Phase 8: Stripe + Polish + Submit (Days 50–56)

| Deliverable | Details |
|---|---|
| Stripe Checkout | Create Checkout Session for starter/growth/scale plans |
| Free trial | 14-day free trial on all paid plans |
| Billing gates | Feature flags based on `organizations.plan` column |
| Customer Portal | Stripe-hosted portal for plan changes, payment method updates |
| Webhook handler | `checkout.session.completed` → update `organizations.plan` |
| Demo seeder | Script that populates a demo org with realistic data |
| Contest submission | Video recording, README, architecture diagram |
| Production hardening | Error boundaries, loading states, 404/500 pages |

---

## 6. API Contracts

### Auth

#### `POST /api/auth/callback`

Supabase Auth code exchange. Called by Supabase after magic link click or OAuth redirect.

```typescript
// app/api/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createServerClient(/* ... */)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  return NextResponse.redirect(new URL('/auth/error', request.url))
}
```

### Ingredients

#### `GET /api/ingredients`

Returns all ingredients for the authenticated user's org.

```typescript
// Response: 200
{
  "data": [
    {
      "id": "uuid",
      "name": "Cayenne Pepper",
      "unit": "oz",
      "bulk_qty": 50,
      "bulk_unit": "lb",
      "bulk_price_cents": 8500,
      "cost_per_unit_cents": 11,
      "supplier": { "id": "uuid", "name": "SpiceWorld" }
    }
  ]
}
```

#### `POST /api/ingredients`

Create a new ingredient. Requires `name`, `unit`. Optional: `bulk_qty`, `bulk_unit`, `bulk_price_cents`, `supplier_id`.

```typescript
// Request body
{
  "name": "Habanero Flakes",
  "unit": "oz",
  "bulk_qty": 25,
  "bulk_unit": "lb",
  "bulk_price_cents": 12000,
  "supplier_id": "uuid"
}

// Response: 201
{ "data": { "id": "uuid", "cost_per_unit_cents": 30, /* ... */ } }
```

#### `POST /api/ingredients/[id]/lots`

Create a new lot for an ingredient (typically on PO receipt).

```typescript
// Request body
{
  "lot_number": "HAB-20250715-001",
  "expiry_date": "2026-01-15",
  "qty_on_hand": 400,
  "po_id": "uuid"  // optional
}

// Response: 201
{ "data": { "id": "uuid", "lot_number": "HAB-20250715-001", /* ... */ } }
```

### Production

#### `POST /api/production-runs`

Start a production run. Automatically allocates ingredient lots (FEFO) and deducts inventory.

```typescript
// Request body
{
  "product_id": "uuid",
  "batch_size": 2,
  "lot_number": "LSH-20250720-001"  // optional, auto-generated if omitted
}

// Response: 201
{
  "data": {
    "id": "uuid",
    "lot_number": "LSH-20250720-001",
    "allocations": [
      { "ingredient": "Cayenne Pepper", "lot": "CAY-20250601-001", "qty_used": 64 },
      { "ingredient": "Habanero Flakes", "lot": "HAB-20250715-001", "qty_used": 16 }
    ],
    "cogs_cents": 2240
  }
}
```

### Sales Orders

#### `POST /api/sales-orders`

Create a sales order.

```typescript
// Request body
{
  "customer_name": "Hill Country Market",
  "line_items": [
    { "product_id": "uuid", "qty": 48, "price_cents": 899 }
  ]
}

// Response: 201
{ "data": { "id": "uuid", "status": "draft", /* ... */ } }
```

### QuickBooks Online

#### `POST /api/qbo/connect`

Initiates QBO OAuth 2.0 flow. Returns redirect URL.

```typescript
// Response: 200
{ "redirect_url": "https://appcenter.intuit.com/connect/oauth2?client_id=...&redirect_uri=...&scope=com.intuit.quickbooks.accounting&state=..." }
```

#### `GET /api/qbo/callback`

OAuth callback. Exchanges code for tokens, stores refresh token in Supabase Vault.

#### `POST /api/qbo/sync/bill`

Syncs a received PO as a QBO AP Bill.

```typescript
// Request body
{ "po_id": "uuid" }

// Response: 200
{ "qbo_id": "186", "status": "success" }
```

#### `POST /api/qbo/sync/invoice`

Syncs a confirmed sales order as a QBO AR Invoice.

```typescript
// Request body
{ "so_id": "uuid" }

// Response: 200
{ "qbo_id": "312", "status": "success" }
```

#### `POST /api/qbo/sync/journal-entry`

Creates a COGS journal entry for a completed production run.

```typescript
// Request body
{ "production_run_id": "uuid" }

// Response: 200
{ "qbo_id": "445", "status": "success" }

// QBO Journal Entry:
// Debit:  5000 - Cost of Goods Sold  $22.40
// Credit: 1200 - Inventory Asset     $22.40
```

### AI

#### `POST /api/ai/query`

Send a natural-language query to the Claude AI assistant. Returns Server-Sent Events stream.

```typescript
// Request body
{ "message": "What's my COGS for July?", "history": [...] }

// Response: SSE stream
data: {"type":"tool_use","name":"get_cogs_summary","input":{"org_id":"...","start_date":"2025-07-01","end_date":"2025-07-31"}}
data: {"type":"text","content":"Your COGS for July 2025 was **$1,247.30** across 12 production runs..."}
data: {"type":"done"}
```

### Stripe

#### `POST /api/stripe/create-checkout`

Creates a Stripe Checkout Session for the selected plan.

```typescript
// Request body
{ "price_id": "price_xxxx", "org_id": "uuid" }

// Response: 200
{ "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxxx" }
```

#### `POST /api/stripe/webhook`

Handles Stripe webhook events. Idempotent.

```typescript
// Events handled:
// - checkout.session.completed → update organizations.plan + stripe_customer_id
// - customer.subscription.updated → update organizations.plan
// - customer.subscription.deleted → downgrade to 'free'
// - invoice.payment_failed → send notification
```

### Cron

#### `GET /api/cron/sync-qbo`

Vercel Cron Job. Runs nightly. Syncs pending entities to QBO, refreshes tokens.

```typescript
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync-qbo",
      "schedule": "0 3 * * *"
    }
  ]
}

// Route handler must verify CRON_SECRET header
// Must export: export const dynamic = 'force-dynamic'
```

---

## 7. AI Tool Schema — 10 Named Query Functions

All functions are Supabase RPC calls (`supabase.rpc()`). The AI agent has a SELECT-only database role (`lotmonster_ai_reader`). No raw SQL is ever generated or executed.

### Tool Definitions (Claude API format)

```json
{
  "tools": [
    {
      "name": "get_cogs_summary",
      "description": "Get total Cost of Goods Sold for a date range, broken down by product.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "start_date": { "type": "string", "format": "date" },
          "end_date": { "type": "string", "format": "date" }
        },
        "required": ["org_id", "start_date", "end_date"]
      }
    },
    {
      "name": "get_inventory_levels",
      "description": "Get current inventory levels for all ingredients, optionally filtered to low-stock only.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "low_stock_only": { "type": "boolean", "default": false }
        },
        "required": ["org_id"]
      }
    },
    {
      "name": "get_expiring_soon",
      "description": "Get ingredient lots expiring within N days.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "days_ahead": { "type": "integer", "default": 30 }
        },
        "required": ["org_id"]
      }
    },
    {
      "name": "get_production_run_history",
      "description": "Get production run history, optionally filtered by product.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "product_id": { "type": "string", "format": "uuid" },
          "limit": { "type": "integer", "default": 20 }
        },
        "required": ["org_id"]
      }
    },
    {
      "name": "get_lot_genealogy",
      "description": "Full upstream traceability: given a finished-good lot number, return all ingredient lots that went into it.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "lot_number": { "type": "string" }
        },
        "required": ["org_id", "lot_number"]
      }
    },
    {
      "name": "get_forward_traceability",
      "description": "Forward traceability: given an ingredient lot, find which production runs used it and which customers received those products.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "ingredient_lot_id": { "type": "string", "format": "uuid" }
        },
        "required": ["org_id", "ingredient_lot_id"]
      }
    },
    {
      "name": "get_sales_by_product",
      "description": "Get sales totals grouped by product for a date range.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "start_date": { "type": "string", "format": "date" },
          "end_date": { "type": "string", "format": "date" }
        },
        "required": ["org_id", "start_date", "end_date"]
      }
    },
    {
      "name": "get_po_history",
      "description": "Get purchase order history, optionally filtered by supplier and/or status.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "supplier_id": { "type": "string", "format": "uuid" },
          "status": { "type": "string", "enum": ["draft", "sent", "partial", "received", "cancelled"] }
        },
        "required": ["org_id"]
      }
    },
    {
      "name": "get_recipe_cost",
      "description": "Calculate the current cost to produce one batch of a product based on recipe lines and current ingredient costs.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "product_id": { "type": "string", "format": "uuid" }
        },
        "required": ["org_id", "product_id"]
      }
    },
    {
      "name": "get_demand_forecast",
      "description": "Simple demand forecast based on historical sales velocity. Returns projected units needed for N future periods.",
      "input_schema": {
        "type": "object",
        "properties": {
          "org_id": { "type": "string", "format": "uuid" },
          "product_id": { "type": "string", "format": "uuid" },
          "periods": { "type": "integer", "default": 4, "description": "Number of future weeks to forecast" }
        },
        "required": ["org_id", "product_id"]
      }
    }
  ]
}
```

### Implementation Pattern

```typescript
// lib/ai/tools.ts
import { createClient } from '@/lib/supabase/server'

export const AI_TOOLS = {
  get_cogs_summary: async (input: {
    org_id: string
    start_date: string
    end_date: string
  }) => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_cogs_summary', {
      p_org_id: input.org_id,
      p_start_date: input.start_date,
      p_end_date: input.end_date,
    })
    if (error) throw error
    return data
  },
  // ... other tools follow same pattern
}
```

### Agent Loop

```typescript
// lib/ai/agent.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function runAgent(message: string, orgId: string) {
  const messages = [{ role: 'user' as const, content: message }]

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: TOOL_DEFINITIONS,
    messages,
  })

  // Tool-use loop
  while (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find(b => b.type === 'tool_use')!
    const result = await AI_TOOLS[toolUse.name]({
      ...toolUse.input,
      org_id: orgId,  // Always inject org_id server-side
    })

    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      }],
    })

    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    })
  }

  return response.content.find(b => b.type === 'text')?.text
}
```

---

## 8. Environment Variables

### `.env.local` Template

```bash
# ─── Supabase ───────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGci...

# ─── QuickBooks Online ──────────────────────────────────────
QBO_CLIENT_ID=ABxxxxxxxxxxxxxxxxxxxxxxxxxxxx
QBO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
QBO_REDIRECT_URI=https://lotmonster.co/api/qbo/callback
QBO_SANDBOX=true

# ─── Anthropic ──────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxx

# ─── Stripe ─────────────────────────────────────────────────
STRIPE_PUBLISHABLE_KEY=pk_test_xxxx
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
STRIPE_PRICE_STARTER=price_xxxx
STRIPE_PRICE_GROWTH=price_xxxx
STRIPE_PRICE_SCALE=price_xxxx

# ─── Vercel ─────────────────────────────────────────────────
CRON_SECRET=xxxx

# ─── App ────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://lotmonster.co
```

### Variable Reference

| Variable | Where Used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Public. Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client + Server | Public. Supabase anon key (safe to expose — RLS enforces access). |
| `QBO_CLIENT_ID` | Server only | From Intuit Developer Portal. |
| `QBO_CLIENT_SECRET` | Server only | **Never expose to client.** |
| `QBO_REDIRECT_URI` | Server only | Must match Intuit app settings exactly. |
| `QBO_SANDBOX` | Server only | `true` for dev, `false` for production. |
| `ANTHROPIC_API_KEY` | Server only | Claude API key. |
| `STRIPE_PUBLISHABLE_KEY` | Client + Server | Public. Used in Stripe.js. |
| `STRIPE_SECRET_KEY` | Server only | **Never expose to client.** |
| `STRIPE_WEBHOOK_SECRET` | Server only | Verifies webhook signatures. |
| `STRIPE_PRICE_*` | Server only | Stripe Price IDs for each plan tier. |
| `CRON_SECRET` | Server only | Vercel cron header verification. |
| `NEXT_PUBLIC_APP_URL` | Client + Server | Base URL for redirects and OG tags. |

---

## 9. Risk Register

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | **QBO token rotation** — refresh token rotates every 24h; if old token is reused after rotation, access is permanently lost until user re-authenticates | High | Medium | Store refresh token in Supabase Vault. On every token use: exchange → persist new refresh token → then use access token. Never cache old tokens. Cron job refreshes nightly as a safety net. |
| R2 | **QBO GET calls metered** (Nov 2025) — GET requests now count against rate limits and may incur charges | Medium | High | Cache QBO responses with 15-min TTL. Batch queries where possible. Use webhooks for change detection instead of polling. |
| R3 | **Supabase middleware rename** — Next.js 16 renames `middleware.ts` → `proxy.ts` | Low | Certain | Already using `proxy.ts` in v3. Document for team members who reference Next.js docs. |
| R4 | **RLS NULL guard** — If `auth.uid()` returns NULL and RLS policy uses direct equality, it could leak data | Critical | Low | All policies use subquery pattern: `(SELECT u.org_id FROM users u WHERE u.id = auth.uid())`. NULL = NULL → FALSE → 0 rows. Automated test verifies unauthenticated queries return empty. |
| R5 | **Transaction boundary for production runs** — Deducting inventory from multiple lots must be atomic | High | Medium | Wrap all lot deductions in a single Supabase RPC function that uses `BEGIN...COMMIT`. If any deduction would go negative, the entire transaction rolls back. |
| R6 | **Claude extended thinking + tool_choice incompatibility** — `tool_choice: "auto"` conflicts with `thinking` parameter in some API versions | Medium | Medium | Do not enable extended thinking when using tool-use. Use `tool_choice: "auto"` (default). If thinking is needed for complex analysis, make a separate non-tool-use call. |
| R7 | **Vercel cron requires force-dynamic** — Cron route handlers must export `dynamic = 'force-dynamic'` or they get statically optimized and never execute | High | High | Every cron route exports `export const dynamic = 'force-dynamic'`. CI lint rule checks for this export in all `/api/cron/` files. |
| R8 | **Stripe webhook idempotency** — Stripe may send duplicate webhook events | Medium | High | Store `event.id` in `qbo_sync_log` or a dedicated `stripe_events` table. Check for duplicates before processing. Return 200 for already-processed events. |
| R9 | **8-week time constraint** — Contest deadline is fixed; scope creep kills projects | Critical | High | Phase plan is aggressive but achievable for a solo dev. Each phase has a hard deliverable. If behind, cut Phase 6 (sales) to manual entry only and skip QBO invoice sync. |
| R10 | **Supabase cold starts** — First request after idle may be slow | Low | Medium | Use Vercel cron to ping Supabase every 5 minutes during demo hours. For contest demo, pre-warm with a health-check call 2 minutes before recording. |

---

## 10. Definition of Done — Day 56 Checklist

| # | Criteria | Verification |
|---|---|---|
| 1 | User can sign up with magic link or Google OAuth | Manual test |
| 2 | User can create an organization and invite is stubbed | Manual test |
| 3 | All three onboarding paths work (spreadsheet, photo, AI conversation) | Manual test each path |
| 4 | Ingredient CRUD with bulk pricing chain calculates `cost_per_unit_cents` | Automated test |
| 5 | Lot management with FEFO ordering and expiry alerts | Automated test |
| 6 | Recipe builder creates valid `recipe_lines` | Manual test |
| 7 | Production run deducts inventory atomically across multiple lots | Automated test (transaction rollback on insufficient stock) |
| 8 | COGS calculated correctly per production run | Automated test with known input/output |
| 9 | Purchase orders: create → send → receive → creates lots | Manual test |
| 10 | Sales orders: create → confirm → ship → allocate production lots | Manual test |
| 11 | QBO OAuth connect/disconnect flow works | Manual test (sandbox) |
| 12 | QBO sync: AP Bill, AR Invoice, Journal Entry all create correctly | Manual test (sandbox) |
| 13 | AI assistant answers queries using all 10 tool functions | Manual test each tool |
| 14 | Stripe Checkout → subscription → plan upgrade reflected in app | Manual test (test mode) |
| 15 | Full lot traceability: ingredient lot → production run → sales order → customer | Manual test + automated test |
| 16 | Demo seeder populates "Lone Star Heat" data in < 30 seconds | Script execution test |

---

## 11. Demo Script — "Lone Star Heat"

**Scenario**: Lone Star Heat Co. is a small-batch hot sauce manufacturer in Austin, TX. They make three products: Original Fire, Smoky Habanero, and Ghost Pepper Reserve.

**Demo duration**: 5 minutes

### 0:00–0:30 — Setup & Context

> "This is Lotmonster — AI-native inventory management built for small CPG manufacturers. Let me show you how Lone Star Heat Co. manages their entire operation from ingredient receipt to customer delivery."

- Show the dashboard with seeded data
- Highlight: ingredient count, active lots, upcoming expirations, recent production runs

### 0:30–1:30 — Receive Ingredient PO

> "A shipment of cayenne pepper just arrived from SpiceWorld. Let me receive this purchase order."

1. Navigate to Purchase Orders → select PO-2025-047 (SpiceWorld, $425.00)
2. Click "Receive" → mark all line items as received
3. Show: new lots auto-created with lot numbers (`CAY-20250720-001`)
4. Show: `qty_on_hand` updated on Cayenne Pepper ingredient page
5. Mention: "This PO will automatically sync to QuickBooks as an AP Bill tonight."

### 1:30–2:30 — Production Run

> "Now let's make a batch of Original Fire hot sauce."

1. Navigate to Production → New Run
2. Select "Original Fire" → batch size: 2×
3. Show recipe auto-populated: Cayenne (64 oz), Habanero (16 oz), Vinegar (32 oz), Garlic (8 oz), Salt (4 oz)
4. Show FEFO allocation: system picks oldest-expiry lots first
5. Click "Start Run" → show lot number auto-generated (`OGF-20250720-001`)
6. Show COGS: $22.40 per batch
7. Click "Complete" → show inventory deducted, COGS journal entry queued for QBO

### 2:30–3:30 — Sales Order & Fulfillment

> "Hill Country Market just ordered 48 bottles. Let's fulfill it."

1. Navigate to Sales Orders → New Order
2. Customer: "Hill Country Market", Product: "Original Fire" × 48 @ $8.99
3. Confirm order → show QBO Invoice auto-created
4. Create shipment → allocate from production lot `OGF-20250720-001`
5. Show: tracking number entered, status → shipped

### 3:30–4:30 — AI Assistant & Traceability

> "Now the real power — let's ask the AI assistant some questions."

1. Open AI chat panel
2. Ask: *"What's my COGS for this month?"*
   - Show Claude calling `get_cogs_summary` → formatted answer with breakdown by product
3. Ask: *"Which customers received lot CAY-20250720-001?"*
   - Show Claude calling `get_forward_traceability` → returns Hill Country Market via production lot OGF-20250720-001
   - Emphasize: **Full lot traceability in seconds** — critical for recalls

### 4:30–5:00 — QBO Sync & Closing

> "Everything syncs to QuickBooks automatically."

1. Show QBO sync log: Bill created, Invoice created, Journal Entry created
2. Show Stripe billing page: Growth plan, $49/month
3. Closing: "Lotmonster gives small CPG manufacturers the same lot traceability and COGS tracking that enterprise ERPs provide — at a fraction of the cost, with AI built in from day one."

---

## Appendix: File Structure

```
F:\Projects\lotmonster\
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── callback/route.ts
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Dashboard home
│   │   ├── ingredients/
│   │   │   ├── page.tsx                # Ingredient list
│   │   │   └── [id]/page.tsx           # Ingredient detail + lots
│   │   ├── production/
│   │   │   ├── page.tsx                # Production run list
│   │   │   └── new/page.tsx            # New production run form
│   │   ├── purchase-orders/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── sales-orders/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── recipes/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── settings/
│   │   │   ├── page.tsx
│   │   │   ├── billing/page.tsx
│   │   │   └── qbo/page.tsx
│   │   └── ai/page.tsx                 # AI assistant chat
│   ├── api/
│   │   ├── auth/callback/route.ts
│   │   ├── ingredients/
│   │   │   ├── route.ts
│   │   │   └── [id]/lots/route.ts
│   │   ├── production-runs/route.ts
│   │   ├── sales-orders/route.ts
│   │   ├── qbo/
│   │   │   ├── connect/route.ts
│   │   │   ├── callback/route.ts
│   │   │   └── sync/
│   │   │       ├── bill/route.ts
│   │   │       ├── invoice/route.ts
│   │   │       └── journal-entry/route.ts
│   │   ├── ai/query/route.ts
│   │   ├── stripe/
│   │   │   ├── create-checkout/route.ts
│   │   │   └── webhook/route.ts
│   │   └── cron/
│   │       └── sync-qbo/route.ts
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── supabase/
│   │   ├── server.ts                   # createServerClient wrapper
│   │   ├── client.ts                   # createBrowserClient wrapper
│   │   └── admin.ts                    # Service role client (server only)
│   ├── ai/
│   │   ├── tools.ts                    # 10 named query functions
│   │   ├── agent.ts                    # Claude tool-use loop
│   │   └── prompts.ts                  # System prompts
│   ├── qbo/
│   │   ├── client.ts                   # QBO API client wrapper
│   │   ├── auth.ts                     # Token refresh + Vault storage
│   │   └── sync.ts                     # Bill, Invoice, Journal Entry mappers
│   ├── stripe/
│   │   ├── client.ts                   # Stripe SDK init
│   │   └── plans.ts                    # Plan → Price ID mapping
│   ├── parsers/
│   │   ├── xlsx.ts                     # SheetJS spreadsheet parser
│   │   └── vision.ts                   # Claude Vision label extraction
│   ├── units.ts                        # Unit conversion table
│   └── actions/                        # Server Actions
│       ├── ingredients.ts
│       ├── production.ts
│       ├── sales.ts
│       └── onboarding.ts
├── components/
│   ├── ui/                             # shadcn/ui components
│   ├── ingredients/
│   ├── production/
│   ├── sales/
│   ├── ai-chat/
│   └── onboarding/
├── proxy.ts                            # Next.js 16 middleware (renamed from middleware.ts)
├── supabase/
│   └── migrations/
│       ├── 001_foundation.sql
│       ├── 002_suppliers_ingredients.sql
│       ├── 003_products_production.sql
│       ├── 004_sales_fulfillment.sql
│       ├── 005_qbo_sync.sql
│       └── 006_rpc_functions.sql
├── vercel.json
├── .env.local
├── package.json
└── tsconfig.json
```

---

*Document version: v3.0 | Last updated: July 2025 | Author: Lotmonster Engineering*
