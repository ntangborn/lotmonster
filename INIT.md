# LotMonster

**AI-Native Inventory Management for Small CPG Manufacturers**

Domain: **lotmonster.co** | Contest: **Perplexity Billion Dollar Build** | Build window: **8 weeks (56 days)**

---

## What It Is

Lotmonster is a purpose-built inventory and operations platform for small CPG manufacturers (hot sauce, craft beer, artisan foods, specialty beverages, pet food, supplements). It covers the complete **buy → make → sell** cycle — from purchasing raw ingredients, through production with lot traceability, to fulfilling sales orders and syncing financials to QuickBooks Online.

---

## The Problem

Small CPG manufacturers (1–15 employees, $100K–$5M revenue) are stuck between spreadsheets and legacy ERP. The incumbent, **Fishbowl Inventory**, costs $10K+/year, was built for widget manufacturers, and fails CPG in every dimension that matters:

| Capability | CPG Needs | Fishbowl Delivers |
|-----------|-----------|------------------|
| Lot genealogy | Full forward + backward trace | Lot numbers exist, no genealogy graph |
| Recipe costing | Real-time COGS as prices change | Manual BOM, no live recalculation |
| FEFO | First-expiry-first-out allocation | FIFO only (by receipt date, not expiry) |
| QBO sync | Automated JE on production | Fragile plugin, manual reconciliation |
| Onboarding | Self-serve in minutes | Consultant engagement, weeks of setup |
| UI | Modern web, mobile-friendly | Windows desktop application |

Lotmonster's position: **1/3 the price, built for CPG natively, self-serve onboarding under 7 minutes.**

---

## Target User: "Sam"

> **Sam Torres** — Founder, Lone Star Heat (Austin, TX)
> 4 employees · $800K revenue · 6 SKUs · sells DTC (Shopify), 47 local retailers, 1 distributor
>
> Currently uses: QuickBooks Online + Google Sheets + handwritten lot logs
>
> What Sam wants: "Tell me which customers got lot #2024-0817 in under 30 seconds. Show me my actual COGS per SKU. Stop me from using expired ingredients. Sync production costs to QBO without me touching anything."

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 App Router (React 19, Turbopack) |
| Auth | Supabase Auth (`@supabase/ssr` v0.10.2) |
| Database | Supabase PostgreSQL 15 (RLS, pg_cron) |
| Secret Storage | Supabase Vault (QBO tokens, encrypted at rest) |
| AI Engine | Anthropic Claude (`claude-sonnet-4-6`) — tool-use pattern |
| Hosting | Vercel (Fluid compute, Edge Network) |
| Payments | Stripe Billing (API `2026-03-25.dahlia`) |
| Accounting Sync | QuickBooks Online REST API v3, minorversion=75 |
| UI Components | shadcn/ui + Tailwind CSS v4 |
| State | React Query (TanStack v5) + Zustand |
| Testing | Playwright (E2E + visual regression) |

---

## The Six Pillars

| # | Pillar | Description |
|---|--------|-------------|
| 1 | **Ingredient & Lot Management** | Ingredient registry, lot creation on receipt, FEFO allocation, expiry tracking (visual dashboard), low-stock alerts |
| 2 | **Purchase Orders** | Draft → Received lifecycle, PO receipt creates ingredient lots, landed cost allocation, QBO AP Bill sync |
| 3 | **Recipe & Production** | Recipe builder with versioning, production runs with FEFO auto-allocation, lot genealogy (forward + backward trace), yield tracking, real-time COGS per unit |
| 4 | **Sales Orders & Fulfillment** | Sales order entry, lot allocation, shipment recording, forward traceability to customers, QBO AR Invoice sync |
| 5 | **QuickBooks Online Sync** | OAuth 2.0 connect, account mapping, COGS journal entry on production completion, AP Bill on receipt, AR Invoice on shipment, sync status dashboard |
| 6 | **AI Assistant** | Natural language queries powered by Claude tool-use. 10 named query functions (inventory levels, expiring lots, COGS, lot trace forward/backward, production summary, low stock, recipe cost, sales summary, supplier history). SELECT-only DB role — AI cannot write data. |

---

## Three-Path Onboarding

Goal: **First product created in under 7 minutes.** No "recommended" path — equal-weight cards.

- **Path A — Upload Recipe:** Drop a file (image, PDF, CSV, TXT). Deterministic parse first; Claude Vision fallback if confidence < 80%. Always shows editable confirmation table before creating records.
- **Path B — Manual Form:** Recipe name + yield → repeating ingredient rows with optional bulk pricing. Live unit cost chain displayed as user types. Zero AI.
- **Path C — AI Chat:** Describe the product in natural language → Claude extracts structured data into a Staging Panel sidebar. "Edit as Form" escape hatch always visible.

---

## Pricing

| | Starter | Growth | Scale |
|--|:-------:|:------:|:-----:|
| **Price** | $99/mo | $199/mo | $299/mo |
| Recipes | 50 | Unlimited | Unlimited |
| Users | 1 | 3 | 10 |
| QBO sync | JE only | JE + Invoice + Bill | JE + Invoice + Bill |
| AI assistant | — | ✓ | ✓ |

14-day free trial at Growth level. No credit card required. Max plan = $3,588/year (vs. Fishbowl $10K+).

---

## Database Schema (12 Tables)

**Foundation:** `organizations`, `users`
**Procurement:** `suppliers`, `purchase_orders`, `purchase_order_lines`
**Inventory:** `ingredients`, `lots`
**Production:** `recipes`, `production_runs`, `production_run_inputs`, `production_run_outputs`
**Sales:** `sales_orders`, `sales_order_lines`

RLS enabled on every table. Org-level isolation via `org_id` foreign key. FEFO ordering on `ingredient_lots`.

---

## Architecture

```
Browser → Vercel Edge (proxy.ts) → Next.js App Router
  ├─ RSC: Server Component → Supabase (RLS query) → HTML stream
  ├─ Route Handler: /api/* → business logic → Supabase / QBO / Stripe / Claude
  └─ Server Action: form submit → mutation → revalidatePath()
```

AI query path:
```
User question → POST /api/ai/query
  → Claude receives system prompt + 10 tool definitions
  → Claude selects tool(s) → Lotmonster calls supabase.rpc() via SELECT-only role
  → Results returned to Claude → Claude formats natural-language answer → streamed to UI
```

---

## MVP Scope (P0 — Day 56)

- Ingredient registry + lot tracking (FEFO, expiry)
- Recipe builder + production runs + lot genealogy
- Basic sales orders with lot allocation
- QBO OAuth connect + COGS Journal Entry sync
- Three-path onboarding (<7 min to first product)
- Stripe billing (3 tiers + free trial)
- Auth + multi-tenant (Supabase RLS)
- Dashboard (inventory summary, expiring lots, low stock, recent activity)

## Stretch Goals (P1)

- Full PO module (create, receive, landed cost)
- QBO Invoice + Bill sync
- AI assistant (5 of 10 query functions)
- Basic demand forecasting ("you'll run out of X in Y days")
- CSV export + bulk ingredient import

---

## Market

| | |
|--|--|
| TAM | $2.5B (~85K small CPG manufacturers × avg software spend) |
| SAM | $425M (~35K actively using inventory software) |
| SOM Year 1 | $1.2M (500 customers × $199/mo avg) |
| SOM Year 3 | $12M (3,000 customers × $250/mo avg) |

---

## Local Path & Key Files

```
F:\Projects\lotmonster\
├── docs/
│   ├── lotmonster-prd-v3.md          # Full product requirements
│   ├── lotmonster-build-guide-v3.md  # Step-by-step build guide (Perplexity + Claude Code)
│   ├── lotmonster-technical-roadmap-v3.md  # Stack, schema, architecture
│   └── lotmonster-onboarding-spec-v3.md    # Onboarding flow detail
├── src/
│   ├── app/        # Next.js App Router pages
│   ├── lib/        # Shared utilities + Supabase clients
│   └── components/ # React components
└── INIT.md         # This file
```

---

## Build Status

- [x] Documentation complete (PRD v3, build guide v3, technical roadmap v3, onboarding spec v3)
- [ ] Accounts provisioned (Supabase, Vercel, Anthropic, Stripe, Intuit Developer)
- [ ] Next.js project scaffolded
- [ ] Supabase schema + RLS migrations applied
- [ ] Auth + multi-tenant working
- [ ] Three-path onboarding functional
- [ ] Six pillars implemented (P0)
- [ ] QBO OAuth + COGS JE sync live
- [ ] Stripe billing live
- [ ] Deployed to lotmonster.co

---

*Created: 2026-04-14 | Last updated: 2026-04-14*
