# Lotmonster — Step-by-Step Build Guide v3

**AI-Native Inventory Management for Small CPG Manufacturers**

| Field | Value |
|---|---|
| Stack | Next.js 15 App Router · Supabase · Vercel · Anthropic Claude (claude-sonnet-4-6) · Stripe Billing · QuickBooks Online REST API v3 |
| Domain | lotmonster.co |
| Local Path | `F:\Projects\lotmonster` |
| Contest | Perplexity Billion Dollar Build |
| Primary Tools | Perplexity Computer (research, planning, verification) · Claude Code (codebase-level implementation) |

---

## How to Read This Guide

Every action step is labeled with one of two badges:

- **[PERPLEXITY COMPUTER]** — Open Perplexity Computer and paste the prompt. Used for: research, planning, document lookup, API verification, deployment checking, security auditing, demo scripting.
- **[CLAUDE CODE]** — Open Claude Code in your terminal (pointed at `F:\Projects\lotmonster`) and paste the prompt. Used for: project scaffolding, SQL migrations, TypeScript route handlers, component code, test generation.

Every prompt is **copy-paste ready**. Read the step, see the badge, open the right tool, paste.

---

## Part 0 — Before You Write a Line of Code (Day 0)

### Step 0.1 — Account Setup Checklist

Create accounts at each of these services before writing any code.

| Service | Purpose | URL | Notes |
|---|---|---|---|
| Supabase | Postgres database + auth + storage | https://supabase.com | Free tier. Choose US East region. |
| Vercel | Hosting + serverless functions + cron | https://vercel.com | Hobby plan (free). |
| Anthropic | Claude AI API (claude-sonnet-4-6) | https://console.anthropic.com | Get API key. Add $20 credits. |
| Stripe | Subscription billing | https://stripe.com | Use **test mode only** to start. |
| Intuit Developer | QuickBooks Online API access | https://developer.intuit.com | ⚠️ **START THIS DAY 1** — app review takes 1–4 weeks. Create a sandbox company immediately. |
| GitHub | Source control | https://github.com | Create a repo named `lotmonster`. |
| Node.js | Local runtime | https://nodejs.org | Version 20+ required. |

### Step 0.2 — Validate Current Best Practices

**[PERPLEXITY COMPUTER]**

```
I'm starting the Lotmonster build. Review the dev-docs-spec.md file and confirm the current best practice for:

1. Supabase createServerClient in Next.js App Router (using @supabase/ssr, NOT @supabase/auth-helpers-nextjs)
2. Vercel Cron job route structure (GET handler with CRON_SECRET check)
3. Stripe Checkout Session for subscription with free trial (trial_period_days + trial_settings.end_behavior)
4. Anthropic claude-sonnet-4-6 tool_use schema (tool definitions, tool_choice, and the two-turn pattern)

Flag anything I need to watch out for — especially breaking changes in the latest versions of these SDKs.
```

### Step 0.3 — Create Local Project Structure

**[CLAUDE CODE]**

```
Create the folder structure for the Lotmonster project at F:\Projects\lotmonster. Do NOT run create-next-app yet — just create these directories:

F:\Projects\lotmonster\
├── docs/                  # Build guide, specs, notes
├── src/
│   ├── app/               # Next.js App Router pages
│   ├── lib/               # Shared utilities
│   │   └── supabase/      # Supabase client files
│   ├── components/        # React components
│   └── types/             # TypeScript type definitions
└── public/                # Static assets (logo, favicon)

Also create an empty README.md with this content:

# Lotmonster

AI-native inventory management for small CPG manufacturers.

## Stack
- Next.js 15 (App Router)
- Supabase (Postgres + Auth)
- Vercel (Hosting + Cron)
- Anthropic Claude (claude-sonnet-4-6)
- Stripe Billing
- QuickBooks Online API v3
```

---

## Part 1 — Days 1–2: Scaffold & Deploy

### Step 1.1 — Scaffold the Next.js Project

**[CLAUDE CODE]**

```
You are setting up the Lotmonster project at F:\Projects\lotmonster.

Run these commands in sequence:

npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

Then install all dependencies:

npm install @supabase/supabase-js @supabase/ssr
npm install @anthropic-ai/sdk
npm install stripe
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-toast
npm install shadcn-ui
npm install xlsx
npm install @tanstack/react-query
npm install react-hook-form zod @hookform/resolvers
npm install lucide-react
npm install date-fns

Create these empty files (we will fill them in the next steps):

src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/proxy.ts
src/lib/anthropic.ts
src/lib/stripe.ts
src/lib/qbo.ts
src/types/database.ts

After everything is created, run `npm run build` to verify no errors.
```

### Step 1.2 — Create Supabase Client Files

**[CLAUDE CODE]**

```
Create the three Supabase client files for Lotmonster at F:\Projects\lotmonster. Use @supabase/ssr (NOT @supabase/auth-helpers-nextjs).

FILE 1: src/lib/supabase/client.ts
- Browser client using createBrowserClient from @supabase/ssr
- Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from env

FILE 2: src/lib/supabase/server.ts
- Server client using createServerClient from @supabase/ssr
- Uses `await cookies()` from next/headers (must await in Next.js 15)
- Implements getAll/setAll cookie pattern:
  cookies: {
    getAll() { return cookieStore.getAll() },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options)
      })
    }
  }

FILE 3: src/lib/supabase/proxy.ts
- Export getClaims() function that reads the Supabase JWT from cookies and decodes the claims without a network call
- This replaces getUser() in the proxy layer for performance
- Use jose library to decode JWT (install it: npm install jose)
- getClaims() should return { sub, email, role, org_id } or null if no valid session
- Export createProxyClient() that creates a Supabase server client for use in proxy.ts

Make sure all files have correct TypeScript types and proper error handling.
```

### Step 1.3 — Create proxy.ts (Auth Proxy)

**[CLAUDE CODE]**

```
Create proxy.ts at F:\Projects\lotmonster/src/proxy.ts (Next.js 16 pattern — this replaces middleware.ts).

The proxy must:

1. Import getClaims from '@/lib/supabase/proxy'
2. Define a protectedRoutes matcher: any route starting with /dashboard, /api/ai, /api/qbo, /api/stripe/portal
3. Define publicRoutes: /, /login, /signup, /api/auth/callback, /api/stripe/webhook, /api/cron/*
4. On every request to a protected route:
   a. Call getClaims()
   b. If no valid claims → redirect to /login
   c. If valid claims → continue
5. For /api/cron/* routes:
   a. Check the Authorization header for Bearer ${CRON_SECRET}
   b. If missing or wrong → return 401
6. Export config with matcher that excludes static files:
   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']

If proxy.ts is not yet supported in your Next.js version, create this as middleware.ts with the same logic and add a comment: "// TODO: Rename to proxy.ts when Next.js 16 ships"
```

### Step 1.4 — Create Environment Variables

**[CLAUDE CODE]**

```
Create two files at F:\Projects\lotmonster:

FILE 1: .env.local (DO NOT commit this — add to .gitignore)

NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

ANTHROPIC_API_KEY=your-anthropic-api-key

STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key

QBO_CLIENT_ID=your-qbo-client-id
QBO_CLIENT_SECRET=your-qbo-client-secret
QBO_REDIRECT_URI=https://lotmonster.co/api/qbo/callback
QBO_ENVIRONMENT=sandbox

CRON_SECRET=generate-a-random-32-char-string

NEXT_PUBLIC_APP_URL=http://localhost:3000

FILE 2: .env.example (safe to commit — no real values)

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=
QBO_ENVIRONMENT=sandbox
CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000

Also make sure .gitignore includes: .env.local, .env*.local, node_modules/
```

### Step 1.5 — Initialize Git & Push

**[CLAUDE CODE]**

```
At F:\Projects\lotmonster, initialize the git repo and push to GitHub:

git init
git add .
git commit -m "feat: initial lotmonster scaffold"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lotmonster.git
git push -u origin main

Replace YOUR_USERNAME with my actual GitHub username. If the remote already exists, skip that step.
```

### Step 1.6 — Connect to Vercel

**[PERPLEXITY COMPUTER]**

```
Go to vercel.com and walk me through connecting my GitHub lotmonster repo to a new Vercel project. Specifically:

1. What settings should I use during project import? (Framework: Next.js, Root: ./, Build command: default)
2. What environment variables do I need to add BEFORE the first deploy succeeds? List them all.
3. Should I set any special Vercel project settings (Node.js version, function region)?
4. After the first deploy, what URL will my project be available at?
```

### Step 1.7 — Verify First Deploy

**[PERPLEXITY COMPUTER]**

```
The Lotmonster app just deployed to Vercel. Check the deployed URL and tell me:

1. Does the homepage load without errors?
2. Are there any console errors visible in the browser dev tools?
3. Does the page render the default Next.js welcome screen?
4. In the Vercel dashboard, are there any build warnings or errors in the deployment log?
5. Is the function region set to US East (iad1)?

If anything is broken, tell me exactly what to fix and which tool to use (Claude Code for code changes, Vercel dashboard for settings).
```

---

## Part 2 — Days 3–6: Auth + Database Schema

### Step 2.1 — Create Supabase Project

**[PERPLEXITY COMPUTER]**

```
Walk me through creating a new Supabase project for Lotmonster. Specifically:

1. What settings should I use?
   - Organization name: Lotmonster
   - Project name: lotmonster-prod
   - Database password: generate a strong one (save it in a password manager)
   - Region: US East (closest to Vercel's default iad1 region)
   - Pricing: Free tier to start
2. After creation, where do I find these values?
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
3. Should I enable any additional Supabase features immediately (Realtime, Storage, Edge Functions)?
```

### Step 2.2 — Database Schema Migration

**[CLAUDE CODE]**

```
Create the complete SQL migration for the Lotmonster database. Write this to a file at F:\Projects\lotmonster\supabase\migrations\001_initial_schema.sql

Create ALL tables in correct dependency order with RLS enabled. Here are the 12 tables:

1. orgs — Multi-tenant organizations
   - id (uuid, PK, default gen_random_uuid())
   - name (text, NOT NULL)
   - slug (text, UNIQUE, NOT NULL)
   - plan (text, default 'starter') — starter | growth | scale
   - stripe_customer_id (text)
   - stripe_subscription_id (text)
   - qbo_realm_id (text)
   - qbo_refresh_token_vault_id (uuid) — reference to Supabase Vault
   - created_at (timestamptz, default now())
   - updated_at (timestamptz, default now())

2. org_members — Users belong to orgs
   - id (uuid, PK, default gen_random_uuid())
   - org_id (uuid, FK → orgs, NOT NULL)
   - user_id (uuid, FK → auth.users, NOT NULL)
   - role (text, default 'member') — owner | admin | member
   - created_at (timestamptz, default now())
   - UNIQUE(org_id, user_id)

3. ingredients — Ingredient registry
   - id (uuid, PK, default gen_random_uuid())
   - org_id (uuid, FK → orgs, NOT NULL)
   - name (text, NOT NULL)
   - sku (text)
   - unit (text, NOT NULL) — oz, lb, gal, fl_oz, g, kg, ml, l, each
   - category (text) — raw_material | packaging | label
   - low_stock_threshold (numeric)
   - qbo_item_id (text)
   - created_at (timestamptz, default now())
   - updated_at (timestamptz, default now())

4. lots — Lot tracking per ingredient
   - id (uuid, PK, default gen_random_uuid())
   - org_id (uuid, FK → orgs, NOT NULL)
   - ingredient_id (uuid, FK → ingredients, NOT NULL)
   - lot_number (text, NOT NULL)
   - quantity_received (numeric, NOT NULL)
   - quantity_remaining (numeric, NOT NULL, default 0)
   - unit_cost (numeric, NOT NULL) — cost per unit
   - total_cost (numeric, NOT NULL) — quantity × unit_cost
   - received_date (date, NOT NULL)
   - expiry_date (date)
   - supplier (text)
   - po_id (uuid, FK → purchase_orders, nullable)
   - created_at (timestamptz, default now())

5. recipes — Product recipes/formulas
   - id (uuid, PK, default gen_random_uuid())
   - org_id (uuid, FK → orgs, NOT NULL)
   - name (text, NOT NULL)
   - sku (text)
   - target_yield (numeric, NOT NULL)
   - target_yield_unit (text, NOT NULL)
   - version (integer, default 1)
   - is_active (boolean, default true)
   - created_at (timestamptz, default now())
   - updated_at (timestamptz, default now())

6. recipe_lines — Ingredients in a recipe
   - id (uuid, PK, default gen_random_uuid())
   - recipe_id (uuid, FK → recipes, NOT NULL)
   - ingredient_id (uuid, FK → ingredients, NOT NULL)
   - quantity (numeric, NOT NULL) — amount per batch
   - unit (text, NOT NULL)
   - sort_order (integer, default 0)

7. production_runs — Batch production events
   - id (uuid, PK, default gen_random_uuid())
   - org_id (uuid, FK → orgs, NOT NULL)
   - recipe_id (uuid, FK → recipes, NOT NULL)
   - run_number (text, NOT NULL) — e.g., PR-2025-001
   - status (text, default 'draft') — draft | in_progress | completed | cancelled
   - planned_yield (numeric, NOT NULL)
   - actual_yield (numeric)
   - yield_unit (text, NOT NULL)
   - waste_quantity (numeric, default 0)
   - total_cogs (numeric) — calculated on completion
   - started_at (timestamptz)
   - completed_at (timestamptz)
   - qbo_journal_entry_id (text)
   - created_at (timestamptz, default now())

8. production_run_lots — Which lots were consumed in a production run
   - id (uuid, PK, default gen_random_uuid())
   - production_run_id (uuid, FK → production_runs, NOT NULL)
   - lot_id (uuid, FK → lots, NOT NULL)
   - ingredient_id (uuid, FK → ingredients, NOT NULL)
   - quantity_used (numeric, NOT NULL)
   - unit_cost_at_use (numeric, NOT NULL) — snapshot of lot cost at time of use

9. purchase_orders — Inbound POs
   - id (uuid, PK, default gen_random_uuid())
   - org_id (uuid, FK → orgs, NOT NULL)
   - po_number (text, NOT NULL)
   - supplier (text, NOT NULL)
   - status (text, default 'draft') — draft | sent | partial | received | cancelled
   - total_amount (numeric, default 0)
   - qbo_bill_id (text)
   - ordered_at (timestamptz)
   - expected_at (date)
   - received_at (timestamptz)
   - created_at (timestamptz, default now())

10. purchase_order_lines — Line items on a PO
    - id (uuid, PK, default gen_random_uuid())
    - po_id (uuid, FK → purchase_orders, NOT NULL)
    - ingredient_id (uuid, FK → ingredients, NOT NULL)
    - quantity_ordered (numeric, NOT NULL)
    - quantity_received (numeric, default 0)
    - unit_cost (numeric, NOT NULL)
    - unit (text, NOT NULL)

11. sales_orders — Outbound sales
    - id (uuid, PK, default gen_random_uuid())
    - org_id (uuid, FK → orgs, NOT NULL)
    - order_number (text, NOT NULL)
    - customer_name (text, NOT NULL)
    - status (text, default 'draft') — draft | confirmed | shipped | delivered | cancelled
    - total_amount (numeric, default 0)
    - qbo_invoice_id (text)
    - shipped_at (timestamptz)
    - created_at (timestamptz, default now())

12. sales_order_lines — Line items on a sales order
    - id (uuid, PK, default gen_random_uuid())
    - so_id (uuid, FK → sales_orders, NOT NULL)
    - recipe_id (uuid, FK → recipes, NOT NULL)
    - quantity (numeric, NOT NULL)
    - unit_price (numeric, NOT NULL)
    - lot_numbers_allocated (text[]) — array of lot numbers for traceability

Also create:

13. qbo_sync_log — QBO sync status tracking
    - id (uuid, PK, default gen_random_uuid())
    - org_id (uuid, FK → orgs, NOT NULL)
    - entity_type (text, NOT NULL) — journal_entry | invoice | bill
    - entity_id (uuid, NOT NULL) — ID of the production_run, sales_order, or PO
    - status (text, default 'pending') — pending | synced | failed | retrying
    - error_message (text)
    - attempts (integer, default 0)
    - last_attempted_at (timestamptz)
    - synced_at (timestamptz)
    - created_at (timestamptz, default now())

For EVERY table:
- Enable RLS: ALTER TABLE tablename ENABLE ROW LEVEL SECURITY;
- Create a policy that restricts SELECT, INSERT, UPDATE, DELETE to rows where org_id matches the user's org (read from JWT claims)
- Use auth.jwt()->'app_metadata'->>'org_id' for the org_id claim
- Add a NULL guard: policy should return false if the claim is NULL (prevents access when no org is set)

Also create:
- Updated_at trigger function that auto-sets updated_at on UPDATE
- Apply the trigger to orgs, ingredients, recipes

Write the COMPLETE SQL — do not abbreviate or use placeholders.
```

### Step 2.3 — Auth: Magic Link + Google OAuth

**[CLAUDE CODE]**

```
Set up authentication for Lotmonster at F:\Projects\lotmonster.

1. Create the auth callback route at src/app/api/auth/callback/route.ts:
   - Import createServerClient from @supabase/ssr
   - Import NextResponse, NextRequest
   - Handle GET request with ?code= query parameter
   - Exchange the code for a session using supabase.auth.exchangeCodeForSession(code)
   - After successful exchange, redirect to /dashboard
   - On error, redirect to /login?error=auth_callback_failed
   - Use the getAll/setAll cookie pattern (same as server.ts)

2. Create the login page at src/app/login/page.tsx:
   - Clean, centered card layout with Lotmonster branding
   - Email input field for magic link login
   - "Send Magic Link" button that calls supabase.auth.signInWithOtp({ email })
   - "Sign in with Google" button that calls supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${NEXT_PUBLIC_APP_URL}/api/auth/callback` } })
   - Success state: "Check your email for the login link"
   - Error state: display error message
   - Use Tailwind for styling — navy/teal theme

3. Create the signup page at src/app/signup/page.tsx:
   - Similar to login but with an additional "Organization Name" field
   - On signup, call supabase.auth.signUp({ email, password }) and then create the org + org_member records
   - Redirect to /dashboard after successful signup

4. Create a logout action at src/app/api/auth/logout/route.ts:
   - POST handler that calls supabase.auth.signOut()
   - Redirect to /login
```

### Step 2.4 — Protected Dashboard Layout

**[CLAUDE CODE]**

```
Create a protected dashboard layout for Lotmonster at F:\Projects\lotmonster.

Create src/app/dashboard/layout.tsx:
- This is a Server Component
- Import createServerClient from @/lib/supabase/server
- Call getClaims() from @/lib/supabase/proxy
- If no valid claims, redirect to /login using redirect() from next/navigation
- If valid claims, render the dashboard shell:
  - Left sidebar (240px) with navigation links:
    - Dashboard (home icon)
    - Ingredients (list icon)
    - Lots (box icon)
    - Recipes (book icon)
    - Production Runs (factory icon)
    - Purchase Orders (truck icon)
    - Sales Orders (shopping cart icon)
    - AI Assistant (sparkles icon)
    - Settings (gear icon)
  - Top bar with:
    - Lotmonster logo (left)
    - Org name (center)
    - User avatar/email + logout button (right)
  - Main content area (children)
- Use Tailwind for styling
- Use lucide-react for icons
- Active nav item should have a teal left border and teal text
- Sidebar should be collapsible on mobile (hamburger menu)

Also create src/app/dashboard/page.tsx as a placeholder:
- "Welcome to Lotmonster" heading
- Three stat cards (placeholder data): Total Ingredients, Active Lots, This Month's COGS
```

### Step 2.5 — Verify Database & Auth

**[PERPLEXITY COMPUTER]**

```
Check my Supabase project for the Lotmonster app. Confirm:

1. All 13 tables exist (orgs, org_members, ingredients, lots, recipes, recipe_lines, production_runs, production_run_lots, purchase_orders, purchase_order_lines, sales_orders, sales_order_lines, qbo_sync_log) — list any that are missing.
2. RLS is enabled on ALL tables — list any where RLS is off.
3. Every table has at least one RLS policy — list any with zero policies.
4. Auth is configured with magic link email provider enabled.
5. The auth callback URL is set correctly.
6. The updated_at trigger exists on orgs, ingredients, and recipes.

What's missing or misconfigured? Give me the exact fix for each issue.
```

---

## Part 3 — Days 7–14: Three-Path Onboarding

### Step 3.1 — Welcome Screen (Screen 0)

**[CLAUDE CODE]**

```
Create the Lotmonster onboarding welcome screen at F:\Projects\lotmonster.

Create src/app/dashboard/onboarding/page.tsx:

This is the first screen new users see after signup. It offers three equal-weight paths to add their first ingredients.

Layout:
- Large heading: "Add Your First Ingredients"
- Subheading: "Choose how you'd like to get started. You can always add more ingredients later."
- Three equal-width cards in a row (stack on mobile):

Card A — "Upload a File"
  - Icon: Upload cloud (lucide-react)
  - Description: "Upload a spreadsheet, CSV, or even a photo of your ingredient list."
  - Drag-and-drop zone that accepts: .csv, .xlsx, .xls, .jpg, .jpeg, .png, .pdf
  - Also has a "Browse files" button
  - On file drop, navigate to /dashboard/onboarding/upload with the file

Card B — "Enter Manually"
  - Icon: Keyboard (lucide-react)
  - Description: "Type in your ingredients one by one or in bulk."
  - "Get Started" button
  - On click, navigate to /dashboard/onboarding/manual

Card C — "Chat with AI"
  - Icon: Sparkles (lucide-react)
  - Description: "Tell our AI assistant about your products and it will build your ingredient list."
  - "Start Chatting" button
  - On click, navigate to /dashboard/onboarding/chat

Styling:
- Cards have subtle hover effect (lift shadow)
- Teal accent on icons and hover borders
- Clean white background, generous padding
- The drag-and-drop zone has a dashed border that turns teal when a file is dragged over it
```

### Step 3.2 — Path A: File Upload + Parse

**[CLAUDE CODE]**

```
Create Path A of the Lotmonster onboarding at F:\Projects\lotmonster.

Create src/app/dashboard/onboarding/upload/page.tsx:

This page handles file uploads — spreadsheets (CSV, XLSX) and images (JPG, PNG, PDF for AI vision fallback).

Flow:
1. Receive the uploaded file (from the welcome screen or allow re-upload here)
2. Detect file type:
   - If .csv or .xlsx/.xls → parse with xlsx library
   - If .jpg/.jpeg/.png/.pdf → send to Claude Vision (Step 3.3)
3. For spreadsheet files:
   - Parse using xlsx: read the file, get the first sheet, convert to JSON
   - Try to auto-detect columns: look for headers matching "name", "ingredient", "sku", "unit", "cost", "price", "quantity"
   - Handle common variations: "Item Name" → name, "Unit Cost" → unit_cost, "Qty" → quantity
4. Show an editable confirmation table:
   - Columns: Name (required), SKU (optional), Unit (dropdown: oz, lb, gal, fl_oz, g, kg, ml, l, each), Category (dropdown: raw_material, packaging, label), Initial Quantity, Unit Cost
   - Each row is editable inline
   - Rows with missing required fields (name, unit) are highlighted in yellow
   - "Add Row" button at the bottom
   - "Remove" button on each row
5. Column mapping step (if auto-detect fails):
   - Show a mapping UI: "Your Column → Lotmonster Field"
   - Dropdown for each detected column to map to a Lotmonster field or "Skip"
6. Validation:
   - Name is required for every row
   - Unit is required for every row
   - If Unit Cost is provided, it must be > 0 (zero cost guard)
   - Show validation errors inline on each row
7. "Save Ingredients" button:
   - Bulk insert into the ingredients table via Supabase
   - Show a success toast: "X ingredients added!"
   - Redirect to /dashboard/ingredients

Use react-hook-form for form management and zod for validation.
```

### Step 3.3 — Path A: Claude Vision Fallback

**[CLAUDE CODE]**

```
Add Claude Vision support to the Lotmonster file upload onboarding at F:\Projects\lotmonster.

When the user uploads an image file (.jpg, .jpeg, .png) or a PDF, we send it to Claude to extract ingredient data.

1. Create an API route at src/app/api/ai/extract-ingredients/route.ts:
   - Accept POST with FormData (the uploaded file)
   - Convert the file to base64
   - Call the Anthropic API with claude-sonnet-4-6:

   import Anthropic from '@anthropic-ai/sdk';

   const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

   const message = await anthropic.messages.create({
     model: "claude-sonnet-4-6",
     max_tokens: 4096,
     messages: [{
       role: "user",
       content: [
         {
           type: "image",
           source: {
             type: "base64",
             media_type: file.type,  // "image/jpeg", "image/png", etc.
             data: base64Data,
           },
         },
         {
           type: "text",
           text: `Extract all ingredients from this image. For each ingredient, identify:
           - name (required)
           - sku (if visible)
           - unit (oz, lb, gal, fl_oz, g, kg, ml, l, each — pick the most likely)
           - category (raw_material, packaging, or label)
           - quantity (if visible)
           - unit_cost (if visible)

           Return as a JSON array:
           [{ "name": "...", "sku": "...", "unit": "...", "category": "...", "quantity": null, "unit_cost": null }]

           If you cannot determine a value, use null. Always return valid JSON.`
         }
       ]
     }]
   });

   - Parse the JSON from Claude's response
   - Return the extracted ingredients array

2. In the upload page component:
   - When an image is detected, show a loading state: "AI is reading your image..."
   - Call the /api/ai/extract-ingredients endpoint
   - Feed the result into the same editable confirmation table from Step 3.2
   - If Claude returns an error or no data, show: "We couldn't read that image. Try uploading a spreadsheet instead or enter ingredients manually."
```

### Step 3.4 — Path B: Manual Entry Form

**[CLAUDE CODE]**

```
Create Path B of the Lotmonster onboarding at F:\Projects\lotmonster.

Create src/app/dashboard/onboarding/manual/page.tsx:

This is a manual ingredient entry form with bulk pricing support.

Layout:
1. Form fields per ingredient:
   - Name (text input, required)
   - SKU (text input, optional)
   - Unit (dropdown: oz, lb, gal, fl_oz, g, kg, ml, l, each — required)
   - Category (dropdown: raw_material, packaging, label — required)

2. Pricing section with a toggle:
   Toggle: "I know the unit cost" vs "I'll enter bulk purchase details"

   If "unit cost" mode:
   - Unit Cost (numeric input, required, must be > 0)

   If "bulk purchase" mode (live unit cost derivation chain):
   - Total Amount Paid (numeric input, e.g., $45.00)
   - Total Quantity Purchased (numeric input, e.g., 50)
   - Purchase Unit (dropdown — may differ from ingredient unit)
   - If purchase unit ≠ ingredient unit, show a conversion step:
     "You bought 50 lb but your ingredient unit is oz. 50 lb = 800 oz."
   - Derived Unit Cost: displayed live as user types
     Formula: Total Amount Paid ÷ (Total Quantity in ingredient units)
     e.g., "$45.00 ÷ 800 oz = $0.05625/oz"
   - Show the derivation chain visually: "$45.00 ÷ 50 lb × (1 lb / 16 oz) = $0.05625/oz"

3. "Add Another Ingredient" button — adds another empty form section below
4. Visual dividers between each ingredient entry
5. Summary at the bottom: "X ingredients ready to save"
6. "Save All Ingredients" button:
   - Validate all entries (name, unit, cost > 0)
   - Bulk insert into ingredients table
   - Success toast + redirect to /dashboard/ingredients

Use react-hook-form with a useFieldArray for multiple ingredients.
Use zod schema for validation.
The zero-cost guard from Step 3.7 applies here: block Save if any unit cost is $0.00.
```

### Step 3.5 — Path C: AI Chat Onboarding

**[CLAUDE CODE]**

```
Create Path C of the Lotmonster onboarding at F:\Projects\lotmonster.

Create src/app/dashboard/onboarding/chat/page.tsx:

This is a conversational AI interface where users describe their products and the AI builds an ingredient list.

Layout — split screen:
- Left side (60%): Chat interface
- Right side (40%): Ingredient staging panel

Chat Interface:
1. Initial system message (displayed as first AI bubble):
   "Hi! I'm here to help you set up your ingredients. Tell me about your products — for example: 'I make hot sauce. My main ingredients are habanero peppers, vinegar, garlic, and salt.' I'll build your ingredient list as we go."
2. User text input at bottom
3. Message bubbles (user = right/blue, AI = left/gray)
4. Loading indicator while AI responds

API Route: src/app/api/ai/onboarding-chat/route.ts:
- Accept POST with { messages: [...], staged_ingredients: [...] }
- Call Anthropic API with claude-sonnet-4-6
- System prompt:
  "You are an ingredient setup assistant for Lotmonster, an inventory management tool for small CPG manufacturers. Your job is to help the user identify all the ingredients they need to track.

  When the user describes a product, extract the ingredients and suggest them. For each ingredient, include:
  - name
  - suggested unit (oz, lb, gal, fl_oz, g, kg, ml, l, each)
  - category (raw_material, packaging, label)

  Ask follow-up questions to fill gaps:
  - 'What sizes do you buy your peppers in — pounds or ounces?'
  - 'Do you also track packaging materials like bottles and labels?'
  - 'What about shipping boxes or cases?'

  Keep responses concise and friendly. When you suggest ingredients, format them as a JSON block that the frontend can parse:
  ```ingredients
  [{ \"name\": \"Habanero Peppers\", \"unit\": \"lb\", \"category\": \"raw_material\" }]
  ```"

Ingredient Staging Panel (right side):
1. Heading: "Your Ingredients"
2. List of ingredients extracted from the AI conversation
3. Each ingredient is a card with: Name, Unit, Category
4. Each card has:
   - "Edit" button → opens inline edit form
   - "Remove" button → removes from staging
5. When AI suggests new ingredients (detected by parsing ```ingredients blocks), they animate into the staging panel
6. "Edit as Form" escape hatch button at the top of the staging panel:
   - Redirects to /dashboard/onboarding/manual with all staged ingredients pre-filled
   - For users who want to switch from chat to manual entry mid-flow
7. "Save All" button at the bottom:
   - Validate all staged ingredients
   - Bulk insert into ingredients table
   - Redirect to /dashboard/ingredients
```

### Step 3.6 — Unit Conversion Engine

**[CLAUDE CODE]**

```
Create a unit conversion engine for Lotmonster at F:\Projects\lotmonster.

Create src/lib/units.ts:

This module handles all unit conversions needed across the app — especially in the onboarding pricing flow and recipe builder.

Supported conversions:
- Weight: lb ↔ oz (1 lb = 16 oz), kg ↔ g (1 kg = 1000 g), lb ↔ kg (1 lb = 0.453592 kg), oz ↔ g (1 oz = 28.3495 g)
- Volume: gal ↔ fl_oz (1 gal = 128 fl_oz), l ↔ ml (1 l = 1000 ml), gal ↔ l (1 gal = 3.78541 l)
- No conversion possible between weight and volume (need density — future feature)
- "each" cannot convert to/from anything

Exports:
1. canConvert(fromUnit: string, toUnit: string): boolean
   - Returns true if conversion is possible

2. convert(value: number, fromUnit: string, toUnit: string): number
   - Returns the converted value
   - Throws if conversion is not possible

3. getConversionFactor(fromUnit: string, toUnit: string): number
   - Returns the multiplier: 1 fromUnit = X toUnit

4. formatConversion(value: number, fromUnit: string, toUnit: string): string
   - Returns a human-readable string: "50 lb = 800 oz"

5. getUnitCategory(unit: string): 'weight' | 'volume' | 'count'
   - Returns the category of a unit

6. getCompatibleUnits(unit: string): string[]
   - Returns all units that can convert to/from the given unit

Write comprehensive unit tests in src/lib/__tests__/units.test.ts covering:
- All conversion pairs
- Round-trip accuracy (convert A→B→A should return original value ± rounding)
- Error on incompatible conversions (weight ↔ volume)
- Edge cases: 0 quantity, very large numbers
```

### Step 3.7 — Zero Cost Guard

**[CLAUDE CODE]**

```
Implement the zero cost guard across all Lotmonster ingredient entry points at F:\Projects\lotmonster.

The rule: No ingredient can be saved with a $0.00 unit cost. This prevents COGS calculations from breaking downstream.

1. Create a shared validation function in src/lib/validation.ts:

   export function validateIngredientCost(unitCost: number | null | undefined): { valid: boolean; message: string } {
     if (unitCost === null || unitCost === undefined) {
       return { valid: true, message: '' }; // Cost is optional during initial entry — but warn
     }
     if (unitCost === 0) {
       return { valid: false, message: 'Unit cost cannot be $0.00. Enter the actual cost or leave blank to set later.' };
     }
     if (unitCost < 0) {
       return { valid: false, message: 'Unit cost cannot be negative.' };
     }
     return { valid: true, message: '' };
   }

2. Apply this validation in:
   - Path A (upload): in the confirmation table, highlight $0.00 rows in red, disable Save button if any row has $0.00
   - Path B (manual): in the form validation, show inline error under the cost field
   - Path C (chat): in the staging panel, warn if any ingredient is about to be saved without a cost
   - Lot creation form (Part 4): require cost > 0 for every lot

3. Add a visual warning component:
   Create src/components/zero-cost-warning.tsx:
   - Yellow alert banner: "⚠ X ingredients have no cost set. COGS calculations will be incomplete until costs are added."
   - Shown on /dashboard/ingredients if any ingredients have null cost
   - Includes a "Set Costs" button that filters the list to cost-less ingredients

4. Database-level guard:
   Add a CHECK constraint to the lots table: CHECK (unit_cost > 0)
   (Ingredients table allows null cost since it's set per-lot, but lots must always have a cost.)
```

### Step 3.8 — Test Onboarding

**[PERPLEXITY COMPUTER]**

```
Test the Lotmonster onboarding at the deployed URL. Try all three paths and report:

Path A (File Upload):
1. Upload a CSV with 5 ingredients — does it parse correctly?
2. Upload a JPG photo of a handwritten ingredient list — does Claude Vision extract ingredients?
3. Is the column mapping UI intuitive?
4. Does the editable confirmation table work (inline editing, add row, remove row)?

Path B (Manual Entry):
1. Add 3 ingredients manually — does the form work?
2. Test the bulk pricing toggle — enter $45 for 50 lb when ingredient unit is oz. Does it show the derivation chain: "$45.00 ÷ 50 lb × (1 lb / 16 oz) = $0.05625/oz"?
3. Try to save with a $0.00 cost — does the zero-cost guard block it?

Path C (AI Chat):
1. Type "I make hot sauce with habaneros, vinegar, garlic, and salt" — does the AI suggest ingredients?
2. Do suggested ingredients appear in the staging panel?
3. Does the "Edit as Form" escape hatch work?

General:
1. What takes longer than expected (> 3 seconds)?
2. Are there any console errors?
3. Does each path end with ingredients saved in the database?
```

---

## Part 4 — Days 15–20: Ingredient & Lot Management

### Step 4.1 — Ingredient Registry CRUD

**[CLAUDE CODE]**

```
Create the ingredient registry CRUD pages for Lotmonster at F:\Projects\lotmonster.

1. src/app/dashboard/ingredients/page.tsx — Ingredient list:
   - Table with columns: Name, SKU, Unit, Category, Current Stock, Avg Cost, Status
   - Current Stock = SUM of lots.quantity_remaining for that ingredient
   - Avg Cost = weighted average of lot unit costs
   - Status column: green "In Stock", yellow "Low Stock" (below threshold), red "Out of Stock" (0 remaining)
   - Search bar to filter by name or SKU
   - Category filter dropdown
   - "Add Ingredient" button → opens modal or navigates to /dashboard/ingredients/new
   - Click a row → navigate to /dashboard/ingredients/[id]

2. src/app/dashboard/ingredients/[id]/page.tsx — Ingredient detail:
   - Ingredient info header (name, SKU, unit, category)
   - Edit button → inline editing or modal
   - Tab layout:
     Tab 1: "Lots" — table of all lots for this ingredient (lot number, received date, expiry date, qty remaining, unit cost, supplier)
     Tab 2: "Used In" — list of recipes that use this ingredient
     Tab 3: "Purchase History" — PO lines for this ingredient
   - Low stock alert banner if below threshold

3. src/app/dashboard/ingredients/new/page.tsx — Add ingredient form:
   - Same fields as onboarding manual entry but for a single ingredient
   - Apply zero-cost guard on the lot cost

4. API routes:
   src/app/api/ingredients/route.ts — GET (list with pagination, search, filter) and POST (create)
   src/app/api/ingredients/[id]/route.ts — GET (detail), PATCH (update), DELETE (soft delete)

All queries must filter by the user's org_id (from JWT claims). Use Supabase client with RLS.
```

### Step 4.2 — Lot Management

**[CLAUDE CODE]**

```
Create the lot management system for Lotmonster at F:\Projects\lotmonster.

1. src/app/dashboard/lots/page.tsx — Lot list:
   - Table columns: Lot Number, Ingredient, Qty Remaining, Unit Cost, Received Date, Expiry Date, Status
   - Status: "Active" (qty > 0, not expired), "Expired" (past expiry_date), "Depleted" (qty = 0)
   - Sort by: expiry date (FEFO default), received date, ingredient name
   - Filter by: ingredient, status, expiry within X days
   - Color-coded expiry warnings:
     - Red row highlight: expires within 7 days
     - Yellow row highlight: expires within 30 days
   - "Add Lot" button → modal form

2. Lot creation modal/form:
   - Select Ingredient (dropdown, searchable)
   - Lot Number (text — auto-suggest format: ING-YYYYMMDD-001)
   - Quantity Received (numeric, required)
   - Unit Cost (numeric, required, must be > 0 — zero cost guard)
   - Total Cost (auto-calculated: quantity × unit_cost, displayed but not editable)
   - Received Date (date picker, default today)
   - Expiry Date (date picker, optional)
   - Supplier (text, optional)
   - On save: insert into lots table, update quantity_remaining = quantity_received

3. FEFO (First Expired, First Out) logic in src/lib/fefo.ts:
   - Export function allocateLots(ingredientId: string, quantityNeeded: number, orgId: string):
     - Query lots for this ingredient where quantity_remaining > 0
     - Sort by expiry_date ASC (nulls last), then received_date ASC
     - Allocate from the earliest-expiring lot first
     - If one lot doesn't have enough, continue to the next lot
     - Return an array: [{ lotId, quantityUsed, unitCost }]
     - Throw if total available < quantityNeeded

4. Low-stock alert banner component:
   - src/components/low-stock-alerts.tsx
   - Query ingredients where current stock < low_stock_threshold
   - Display on dashboard home page and ingredient list
   - Each alert: "Low Stock: {ingredient name} — {current qty} {unit} remaining (threshold: {threshold})"
```

### Step 4.3 — Expiry Tracking Dashboard Widget

**[CLAUDE CODE]**

```
Create an expiry tracking dashboard widget for Lotmonster at F:\Projects\lotmonster.

Add to src/app/dashboard/page.tsx (the main dashboard):

1. "Expiring Soon" card/section:
   - Query lots where expiry_date is within the next 30 days AND quantity_remaining > 0
   - Display as a list:
     - Lot number
     - Ingredient name
     - Expiry date (with "X days left" badge)
     - Quantity remaining
   - Color coding: red if ≤ 7 days, yellow if ≤ 30 days
   - "View All Lots" link at the bottom

2. "Low Stock" card/section:
   - Query ingredients where total remaining stock < low_stock_threshold
   - Display as a list:
     - Ingredient name
     - Current stock vs threshold
     - "Reorder" button (links to PO creation pre-filled with this ingredient)

3. Quick stats row at top of dashboard:
   - Total Active Ingredients (count)
   - Total Active Lots (count where qty > 0)
   - Lots Expiring This Week (count)
   - This Month's COGS (sum from completed production runs)

All queries use the Supabase server client with RLS filtering by org_id.
```

---

## Part 5 — Days 21–28: Recipe Builder & Production Runs

### Step 5.1 — Recipe Builder UI

**[CLAUDE CODE]**

```
Create the recipe builder for Lotmonster at F:\Projects\lotmonster.

1. src/app/dashboard/recipes/page.tsx — Recipe list:
   - Table: Name, SKU, Target Yield, # Ingredients, Version, Status (Active/Inactive)
   - "Create Recipe" button
   - Click row → recipe detail page

2. src/app/dashboard/recipes/new/page.tsx — Recipe builder:
   - Recipe header fields:
     - Name (text, required)
     - SKU (text, optional)
     - Target Yield (numeric, required)
     - Target Yield Unit (dropdown, required)
   - Ingredient lines section:
     - "Add Ingredient" button → adds a new row
     - Each row:
       - Ingredient (searchable dropdown from ingredient registry)
       - Quantity (numeric input)
       - Unit (auto-filled from ingredient's default unit, but can override)
       - Drag handle for reordering (sort_order)
       - Remove button
     - If the selected unit differs from the ingredient's default unit, show a conversion note
   - Cost preview section (live-updated as ingredients are added):
     - Table showing: Ingredient | Qty | Unit | Avg Cost/Unit | Line Cost
     - Avg Cost/Unit comes from the weighted average of active lots
     - Total Recipe Cost: sum of all line costs
     - Cost Per Unit of Yield: Total Recipe Cost ÷ Target Yield
     - Warning if any ingredient has no lots (cost = unknown)
   - "Save Recipe" button
   - "Save & Start Production Run" button

3. src/app/dashboard/recipes/[id]/page.tsx — Recipe detail:
   - Read-only view of the recipe with all ingredient lines
   - Cost summary (using current lot costs)
   - "Edit" button → switches to edit mode
   - "Start Production Run" button
   - "Production History" tab — list of production runs using this recipe
   - Version history (future feature — show a "v1" badge for now)

4. API routes:
   src/app/api/recipes/route.ts — GET (list), POST (create with lines)
   src/app/api/recipes/[id]/route.ts — GET, PATCH, DELETE
```

### Step 5.2 — Production Run Creation

**[CLAUDE CODE]**

```
Create the production run system for Lotmonster at F:\Projects\lotmonster.

1. src/app/dashboard/production/page.tsx — Production run list:
   - Table: Run Number, Recipe, Status, Planned Yield, Actual Yield, COGS, Date
   - Filter by: status (draft, in_progress, completed, cancelled)
   - "New Production Run" button

2. src/app/dashboard/production/new/page.tsx — Create production run:
   - Select Recipe (dropdown, shows recipe name + yield info)
   - After selecting recipe, display:
     - Recipe ingredients with quantities needed
     - For each ingredient, show:
       - Required quantity
       - Available stock (total from lots)
       - FEFO lot allocation preview (which lots will be used, in order)
       - Warning if insufficient stock (red highlight)
     - Auto-generate run number: PR-{YYYY}-{NNN}
   - Planned Yield (pre-filled from recipe target, editable)
   - "Create as Draft" button → saves with status=draft
   - "Start Production" button → saves with status=in_progress, allocates lots

3. src/app/dashboard/production/[id]/page.tsx — Production run detail:
   - Run info header (number, recipe, status, dates)
   - Ingredients consumed table:
     - Ingredient | Lot Number | Qty Used | Unit Cost | Line Cost
   - Status workflow buttons:
     - Draft → "Start Production" (allocates lots via FEFO)
     - In Progress → "Complete Production" (enter actual yield + waste)
     - Any → "Cancel" (returns allocated quantities to lots)
   - On "Start Production":
     - Call the FEFO allocator from Step 4.2
     - Deduct quantity_remaining from each lot
     - Create production_run_lots records
   - On "Complete Production":
     - Prompt for actual_yield and waste_quantity
     - Calculate total_cogs: SUM of (quantity_used × unit_cost_at_use) from production_run_lots
     - Update production run record
     - Trigger QBO journal entry sync (Part 8)

4. API routes:
   src/app/api/production/route.ts — GET (list), POST (create)
   src/app/api/production/[id]/route.ts — GET, PATCH
   src/app/api/production/[id]/start/route.ts — POST (allocate lots)
   src/app/api/production/[id]/complete/route.ts — POST (finalize + calculate COGS)
```

### Step 5.3 — COGS Calculation Engine

**[CLAUDE CODE]**

```
Create the COGS calculation engine for Lotmonster at F:\Projects\lotmonster.

Create src/lib/cogs.ts:

This module calculates Cost of Goods Sold for production runs using actual lot costs (not averages).

1. calculateRunCOGS(productionRunId: string):
   - Query all production_run_lots for this run
   - For each record: quantity_used × unit_cost_at_use
   - Sum all line costs = total COGS for the run
   - Return { totalCOGS, cogsPerUnit: totalCOGS / actual_yield, lines: [...] }

2. calculateRecipeEstimatedCOGS(recipeId: string):
   - For each recipe line, get the weighted average cost from active lots
   - Multiply by the recipe line quantity
   - Sum = estimated COGS per batch
   - Return { estimatedCOGS, cogsPerUnit, lines: [...], warnings: [...] }
   - Add warning if any ingredient has no lots (cost unknown)

3. getMonthlyCOGS(orgId: string, year: number, month: number):
   - Query completed production runs for the org in that month
   - Sum total_cogs
   - Return { totalCOGS, runCount, breakdown: [{ runNumber, recipeName, cogs }] }

4. getYTDCOGS(orgId: string, year: number):
   - Query completed production runs for the org in that year
   - Sum total_cogs, group by month
   - Return { totalCOGS, monthlyBreakdown: [{ month, cogs }] }

Write tests in src/lib/__tests__/cogs.test.ts.
```

---

## Part 6 — Days 29–35: Purchase Orders

### Step 6.1 — Purchase Order CRUD

**[CLAUDE CODE]**

```
Create the purchase order system for Lotmonster at F:\Projects\lotmonster.

1. src/app/dashboard/purchase-orders/page.tsx — PO list:
   - Table: PO Number, Supplier, Status, Total Amount, Order Date, Expected Date
   - Filter by: status (draft, sent, partial, received, cancelled)
   - "New Purchase Order" button

2. src/app/dashboard/purchase-orders/new/page.tsx — Create PO:
   - Header fields:
     - PO Number (auto-generated: PO-{YYYY}-{NNN})
     - Supplier (text input with autocomplete from previous suppliers)
     - Expected Delivery Date (date picker)
   - Line items section:
     - "Add Line" button
     - Each line:
       - Ingredient (searchable dropdown)
       - Quantity (numeric)
       - Unit (auto-filled from ingredient)
       - Unit Cost (numeric, editable)
       - Line Total (auto-calculated)
     - "Add from Low Stock" button: auto-adds lines for all ingredients below threshold
   - PO Total (sum of line totals)
   - "Save as Draft" and "Save & Mark Sent" buttons

3. src/app/dashboard/purchase-orders/[id]/page.tsx — PO detail:
   - PO info + line items table
   - Status workflow:
     - Draft → "Mark as Sent"
     - Sent → "Receive Delivery" (opens receiving form)
     - Partial → "Receive More" (continues receiving)

4. API routes:
   src/app/api/purchase-orders/route.ts — GET, POST
   src/app/api/purchase-orders/[id]/route.ts — GET, PATCH
   src/app/api/purchase-orders/[id]/receive/route.ts — POST (receiving workflow)
```

### Step 6.2 — Receiving Workflow

**[CLAUDE CODE]**

```
Create the PO receiving workflow for Lotmonster at F:\Projects\lotmonster.

This handles receiving deliveries against purchase orders, including partial receives.

Create src/app/dashboard/purchase-orders/[id]/receive/page.tsx:

1. Display the PO line items with:
   - Ingredient name
   - Quantity Ordered
   - Quantity Previously Received
   - Quantity Remaining (ordered - received)
   - "Receiving Now" input (numeric, default = remaining)

2. For each line being received, also collect lot info:
   - Lot Number (text, required — auto-suggest format)
   - Expiry Date (date picker, optional)
   - Actual Unit Cost (pre-filled from PO line, editable for price adjustments)

3. On "Confirm Receipt":
   - For each line where "Receiving Now" > 0:
     a. Create a new lot record linked to this PO (po_id)
     b. Set quantity_received = quantity_remaining = receiving amount
     c. Set unit_cost from the PO line (or adjusted amount)
     d. Update purchase_order_lines.quantity_received += receiving amount
   - Update PO status:
     - If all lines fully received → status = 'received', set received_at
     - If some lines partially received → status = 'partial'
   - Trigger QBO Bill sync (Part 8)
   - Redirect to PO detail page with success toast

4. Validation:
   - Cannot receive more than remaining quantity
   - Lot number is required
   - Unit cost must be > 0 (zero cost guard)
```

---

## Part 7 — Days 36–42: Sales Orders & Fulfillment

### Step 7.1 — Sales Order Entry

**[CLAUDE CODE]**

```
Create the sales order system for Lotmonster at F:\Projects\lotmonster.

1. src/app/dashboard/sales-orders/page.tsx — Sales order list:
   - Table: Order Number, Customer, Status, Total Amount, Date
   - Filter by status
   - "New Sales Order" button

2. src/app/dashboard/sales-orders/new/page.tsx — Create sales order:
   - Header: Order Number (auto: SO-{YYYY}-{NNN}), Customer Name
   - Line items:
     - Recipe/Product (dropdown from recipes)
     - Quantity (numeric)
     - Unit Price (numeric)
     - Line Total (auto-calculated)
   - Order Total (sum of lines)
   - "Save as Draft" and "Confirm Order" buttons

3. src/app/dashboard/sales-orders/[id]/page.tsx — Sales order detail:
   - Order info + line items
   - Status workflow:
     - Draft → "Confirm"
     - Confirmed → "Ship" (opens shipment recording)
     - Shipped → "Mark Delivered"
   - Lot traceability section:
     - For each line, show which lot numbers were allocated
     - Forward traceability: "This order contains products from lots: [LOT-001, LOT-002]"

4. API routes for sales orders CRUD.
```

### Step 7.2 — Shipment Recording & Lot Traceability

**[CLAUDE CODE]**

```
Create the shipment recording system for Lotmonster at F:\Projects\lotmonster.

When a sales order is shipped, we need to record which lots were used for traceability.

1. Shipment recording form (part of sales order detail):
   - For each sales order line:
     - Show the recipe and quantity ordered
     - Auto-suggest lot allocation based on production runs that used FEFO lots
     - Allow manual override of lot numbers
     - Track which production run lots are going to this customer
   - Update sales_order_lines.lot_numbers_allocated with the lot numbers
   - Set shipped_at timestamp
   - Trigger QBO Invoice sync (Part 8)

2. Forward traceability view (from lot → customer):
   - Given a lot number, find all sales orders that contain products using that lot
   - Display: "Lot {number} was used in Production Run {PR-number} → shipped in Sales Order {SO-number} to {customer}"
   - This is critical for recalls

3. Reverse traceability view (from customer → lots):
   - Given a sales order, find all lot numbers involved
   - Display the full chain: Customer → Sales Order → Production Run → Lots → Ingredients → Supplier

4. Create a traceability page at src/app/dashboard/traceability/page.tsx:
   - Search by lot number, production run number, or sales order number
   - Display the full chain in both directions
   - Visual: use a simple timeline/flowchart layout
```

---

## Part 8 — Days 36–42: QuickBooks Online Integration

### Step 8.1 — Understand QBO OAuth Flow

**[PERPLEXITY COMPUTER]**

```
Walk me through the QuickBooks Online OAuth 2.0 flow for the Lotmonster app. I need to know:

1. Authorization URL: What is the exact URL to redirect users to for QBO authorization? What query parameters are required (client_id, scope, redirect_uri, response_type, state)?
2. Token exchange URL: After the user authorizes, QBO redirects back with a code. What is the exact POST URL to exchange that code for access/refresh tokens?
3. Token refresh URL: The access token expires in 1 hour. What is the exact POST URL to refresh it? What parameters do I send?
4. What scope do I need for accounting (reading/writing journal entries, invoices, bills)?
5. What is the sandbox base URL vs production base URL for API calls?
6. How long does the refresh token last? (100 days — confirm this)
7. What headers are required for API calls?

Also check: Is there anything special about the QuickBooks Online REST API v3 that I need to know for minorversion=75?
```

### Step 8.2 — QBO OAuth Connect Flow

**[CLAUDE CODE]**

```
Create the QuickBooks Online OAuth connect flow for Lotmonster at F:\Projects\lotmonster.

1. src/app/api/qbo/connect/route.ts — Initiate OAuth:
   - Generate a random state parameter, store in a cookie
   - Build the authorization URL:
     https://appcenter.intuit.com/connect/oauth2?
     client_id={QBO_CLIENT_ID}&
     scope=com.intuit.quickbooks.accounting&
     redirect_uri={QBO_REDIRECT_URI}&
     response_type=code&
     state={random_state}
   - Redirect the user to this URL

2. src/app/api/qbo/callback/route.ts — Handle OAuth callback:
   - Verify the state parameter matches the cookie
   - Extract the authorization code and realmId from query params
   - Exchange the code for tokens:
     POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
     Authorization: Basic base64(client_id:client_secret)
     Content-Type: application/x-www-form-urlencoded
     Body: grant_type=authorization_code&code={code}&redirect_uri={redirect_uri}
   - Store the refresh token in Supabase Vault:
     const { data } = await supabase.rpc('vault.create_secret', {
       new_secret: refreshToken,
       new_name: `qbo_refresh_${orgId}`
     })
   - Store the vault secret ID and realmId in the orgs table:
     UPDATE orgs SET qbo_realm_id = realmId, qbo_refresh_token_vault_id = vaultSecretId
   - Store the access token in memory/cache (it expires in 1 hour)
   - Redirect to /dashboard/settings with success message

3. src/lib/qbo.ts — QBO client helper:
   - Export getQBOAccessToken(orgId: string): retrieves refresh token from Vault, checks if access token is cached and not expired, refreshes if needed
   - Export qboFetch(orgId: string, endpoint: string, options: RequestInit): wraps fetch with auth header and base URL
   - Base URL: https://sandbox-quickbooks.api.intuit.com (sandbox) or https://quickbooks.api.intuit.com (production)
   - All requests include: Accept: application/json, Authorization: Bearer {access_token}
```

### Step 8.3 — Token Refresh Middleware

**[CLAUDE CODE]**

```
Create the QBO token refresh middleware for Lotmonster at F:\Projects\lotmonster.

Update src/lib/qbo.ts to include automatic token refresh:

1. In-memory token cache:
   const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

2. getQBOAccessToken(orgId: string) function:
   a. Check the in-memory cache for a valid token
   b. If cached token exists and expires in MORE than 5 minutes → return it
   c. If cached token is missing or expires within 5 minutes → refresh:
      - Read refresh token from Supabase Vault:
        const { data } = await supabase.rpc('vault.read_secret', { secret_id: org.qbo_refresh_token_vault_id })
      - POST to https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
        Authorization: Basic base64(QBO_CLIENT_ID:QBO_CLIENT_SECRET)
        Body: grant_type=refresh_token&refresh_token={stored_refresh_token}
      - Parse response: { access_token, refresh_token, expires_in }
      - Store NEW refresh token back in Vault (QBO rotates refresh tokens)
      - Cache the new access token with expiry timestamp
      - Return the access token

3. Error handling:
   - If refresh fails with 401 → the refresh token has expired (after ~100 days)
   - In this case, mark the QBO connection as disconnected in the orgs table
   - Return an error that the UI can catch to show "Reconnect QuickBooks" prompt
```

### Step 8.4 — Journal Entry Sync (Production → COGS)

**[CLAUDE CODE]**

```
Create the QBO Journal Entry sync for Lotmonster at F:\Projects\lotmonster.

When a production run is completed, create a journal entry in QBO to record the COGS.

Create src/app/api/qbo/sync/journal-entry/route.ts:

1. Accept POST with { productionRunId: string }
2. Fetch the production run with its production_run_lots
3. Build the QBO Journal Entry payload:

   const journalEntry = {
     TxnDate: completedAt.toISOString().split('T')[0],
     DocNumber: runNumber,
     PrivateNote: `Lotmonster Production Run ${runNumber}`,
     Line: [
       {
         DetailType: "JournalEntryLineDetail",
         Amount: totalCOGS,
         Description: `COGS - ${recipeName} (${runNumber})`,
         JournalEntryLineDetail: {
           PostingType: "Debit",
           AccountRef: { value: cogsAccountId, name: "Cost of Goods Sold" }
         }
       },
       {
         DetailType: "JournalEntryLineDetail",
         Amount: totalCOGS,
         Description: `Raw Materials Consumed - ${recipeName} (${runNumber})`,
         JournalEntryLineDetail: {
           PostingType: "Credit",
           AccountRef: { value: rawMaterialsAccountId, name: "Raw Materials Inventory" }
         }
       }
     ]
   };

4. POST to QBO:
   const response = await qboFetch(orgId,
     `/v3/company/${realmId}/journalentry?minorversion=75`,
     { method: 'POST', body: JSON.stringify(journalEntry) }
   );

5. On success:
   - Store the QBO Journal Entry ID in production_runs.qbo_journal_entry_id
   - Update qbo_sync_log: status = 'synced', synced_at = now()

6. On failure:
   - Log the error in qbo_sync_log: status = 'failed', error_message, attempts++
   - The cron job (Part 10) will retry failed syncs

7. Account mapping:
   - Create a settings page section where the user maps their QBO accounts:
     - COGS Account (default: "Cost of Goods Sold")
     - Raw Materials Inventory Account (default: "Inventory Asset")
   - Store mappings in a new org_settings table or as JSON in the orgs table
```

### Step 8.5 — Invoice Sync (Sales → AR)

**[CLAUDE CODE]**

```
Create the QBO Invoice sync for Lotmonster at F:\Projects\lotmonster.

When a sales order is shipped, create an invoice in QBO.

Create src/app/api/qbo/sync/invoice/route.ts:

1. Accept POST with { salesOrderId: string }
2. Fetch the sales order with its lines
3. Build the QBO Invoice payload:

   const invoice = {
     CustomerRef: { value: qboCustomerId },
     TxnDate: shippedAt.toISOString().split('T')[0],
     DocNumber: orderNumber,
     PrivateNote: `Lotmonster Sales Order ${orderNumber}`,
     Line: salesOrderLines.map((line, i) => ({
       DetailType: "SalesItemLineDetail",
       Amount: line.quantity * line.unit_price,
       Description: line.recipe_name,
       SalesItemLineDetail: {
         ItemRef: { value: line.qbo_item_id || "1" },
         Qty: line.quantity,
         UnitPrice: line.unit_price,
       },
       LineNum: i + 1,
     })),
   };

4. POST to /v3/company/{realmId}/invoice?minorversion=75
5. Store qbo_invoice_id in sales_orders
6. Update qbo_sync_log

Note: The user needs to map their QBO customers. For now, create a simple customer lookup or auto-create customers in QBO when syncing.
```

### Step 8.6 — Bill Sync (PO Receipt → AP)

**[CLAUDE CODE]**

```
Create the QBO Bill sync for Lotmonster at F:\Projects\lotmonster.

When a purchase order is received, create a bill in QBO.

Create src/app/api/qbo/sync/bill/route.ts:

1. Accept POST with { purchaseOrderId: string }
2. Fetch the PO with its lines (only received quantities)
3. Build the QBO Bill payload:

   const bill = {
     VendorRef: { value: qboVendorId },
     TxnDate: receivedAt.toISOString().split('T')[0],
     DocNumber: poNumber,
     PrivateNote: `Lotmonster PO ${poNumber}`,
     Line: poLines.map((line, i) => ({
       DetailType: "AccountBasedExpenseLineDetail",
       Amount: line.quantity_received * line.unit_cost,
       Description: `${line.ingredient_name} - Lot ${line.lot_number}`,
       AccountBasedExpenseLineDetail: {
         AccountRef: { value: inventoryAccountId, name: "Inventory Asset" },
       },
       LineNum: i + 1,
     })),
   };

4. POST to /v3/company/{realmId}/bill?minorversion=75
5. Store qbo_bill_id in purchase_orders
6. Update qbo_sync_log
```

### Step 8.7 — Verify QBO Integration

**[PERPLEXITY COMPUTER]**

```
Test the QuickBooks Online integration for Lotmonster. I've connected a QBO sandbox company. Verify:

1. Go to the QBO sandbox dashboard. Did the journal entry from the test production run appear? Check under Reports → Journal.
2. Did the invoice from the test sales order appear? Check under Sales → Invoices.
3. Did the bill from the test PO receipt appear? Check under Expenses → Bills.
4. Are the account mappings correct? (COGS debit, Inventory credit on the journal entry)
5. Are the amounts matching what's in Lotmonster?
6. Check the qbo_sync_log table in Supabase — are there any failed sync entries?

If anything is wrong, tell me exactly what's mismatched and what to fix.
```

---

## Part 9 — Days 43–49: AI Assistant (Claude Tool Use)

### Step 9.1 — Design Tool Definitions

**[PERPLEXITY COMPUTER]**

```
Review the Anthropic tool_use documentation for claude-sonnet-4-6. Write me the exact tool definition JSON schemas for the Lotmonster AI assistant. I need 10 tools:

1. get_cogs_summary — accepts org_id, start_date, end_date → returns total COGS, run count, breakdown by recipe
2. get_expiring_lots — accepts org_id, days_ahead (default 30) → returns lots expiring within that window
3. get_low_stock_ingredients — accepts org_id → returns ingredients below their threshold
4. get_ingredient_cost_history — accepts org_id, ingredient_id → returns lot cost history over time
5. get_production_run_detail — accepts org_id, run_number → returns full run detail with lot allocations
6. get_recipe_cost_estimate — accepts org_id, recipe_id → returns estimated COGS for one batch
7. get_sales_summary — accepts org_id, start_date, end_date → returns total sales, order count, top customers
8. get_lot_traceability — accepts org_id, lot_number → returns forward trace (lot → production runs → sales orders → customers)
9. get_inventory_valuation — accepts org_id → returns total inventory value at cost
10. get_supplier_spend — accepts org_id, start_date, end_date → returns spend by supplier

For each tool, write:
- The complete JSON schema in the Anthropic tool_use format (name, description, input_schema with type, properties, required)
- Make sure descriptions are clear enough for Claude to choose the right tool
- Include parameter descriptions and types

Also confirm: Does claude-sonnet-4-6 support tool_use with extended thinking? Or do I need to avoid the thinking parameter when using tools? Flag any compatibility issues.
```

### Step 9.2 — Create PostgreSQL Functions

**[CLAUDE CODE]**

```
Create all 10 named PostgreSQL functions in Supabase for the Lotmonster AI assistant at F:\Projects\lotmonster.

Write the SQL to: supabase/migrations/002_ai_functions.sql

These functions will be called via supabase.rpc() from the API route.

1. get_cogs_summary(p_org_id uuid, p_start_date date, p_end_date date):
   - Returns: total_cogs numeric, run_count integer, breakdown jsonb
   - Query: SELECT from production_runs WHERE org_id = p_org_id AND status = 'completed' AND completed_at BETWEEN p_start_date AND p_end_date
   - Breakdown: group by recipe name, sum COGS per recipe

2. get_expiring_lots(p_org_id uuid, p_days_ahead integer DEFAULT 30):
   - Returns: table of (lot_number, ingredient_name, expiry_date, quantity_remaining, unit, days_until_expiry)
   - Query: lots JOIN ingredients WHERE expiry_date <= CURRENT_DATE + p_days_ahead AND quantity_remaining > 0
   - Order by expiry_date ASC

3. get_low_stock_ingredients(p_org_id uuid):
   - Returns: table of (ingredient_name, current_stock, threshold, unit, deficit)
   - Query: ingredients with SUM(lots.quantity_remaining) < low_stock_threshold

4. get_ingredient_cost_history(p_org_id uuid, p_ingredient_id uuid):
   - Returns: table of (lot_number, received_date, unit_cost, supplier)
   - Query: lots for this ingredient, ordered by received_date

5. get_production_run_detail(p_org_id uuid, p_run_number text):
   - Returns: jsonb with run info, recipe info, lot allocations, total COGS
   - Query: production_runs JOIN production_run_lots JOIN lots JOIN ingredients

6. get_recipe_cost_estimate(p_org_id uuid, p_recipe_id uuid):
   - Returns: jsonb with recipe name, target yield, estimated COGS, lines with ingredient costs
   - Uses weighted average lot costs per ingredient

7. get_sales_summary(p_org_id uuid, p_start_date date, p_end_date date):
   - Returns: total_revenue numeric, order_count integer, top_customers jsonb
   - Query: sales_orders WHERE status IN ('shipped', 'delivered')

8. get_lot_traceability(p_org_id uuid, p_lot_number text):
   - Returns: jsonb with full forward trace chain
   - Lot → production_run_lots → production_runs → sales_order_lines (where lot_numbers_allocated contains the lot) → sales_orders

9. get_inventory_valuation(p_org_id uuid):
   - Returns: total_value numeric, breakdown jsonb (by ingredient)
   - Query: SUM(quantity_remaining * unit_cost) from lots WHERE quantity_remaining > 0

10. get_supplier_spend(p_org_id uuid, p_start_date date, p_end_date date):
    - Returns: table of (supplier, total_spend, po_count, line_items)
    - Query: purchase_orders + lines WHERE status IN ('partial', 'received')

IMPORTANT: All functions must check that p_org_id matches the calling user's org (use auth.jwt()->'app_metadata'->>'org_id'). If it doesn't match, return empty results.

ALSO: Set SECURITY DEFINER on these functions and grant EXECUTE to the authenticated role only.
```

### Step 9.3 — SELECT-Only Database Role for AI

**[CLAUDE CODE]**

```
Create a SELECT-only database role for the Lotmonster AI assistant at F:\Projects\lotmonster.

Write SQL to: supabase/migrations/003_ai_readonly_role.sql

The AI assistant should NEVER be able to INSERT, UPDATE, or DELETE data. It can only read.

1. Create the role:
   CREATE ROLE ai_readonly NOLOGIN;
   GRANT USAGE ON SCHEMA public TO ai_readonly;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_readonly;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ai_readonly;

2. Grant EXECUTE on the 10 AI functions to ai_readonly.

3. Create a wrapper function that the API route calls:
   CREATE FUNCTION execute_ai_query(function_name text, params jsonb)
   RETURNS jsonb
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET ROLE = 'ai_readonly'
   AS $$
   -- This function sets the role to ai_readonly before executing
   -- Validates that function_name is in the allowed list
   -- Prevents SQL injection by only allowing whitelisted function names
   $$;

4. The allowed function list is hardcoded: only the 10 AI functions.
```

### Step 9.4 — AI Query Route (Claude Tool Use)

**[CLAUDE CODE]**

```
Create the AI query API route for Lotmonster at F:\Projects\lotmonster.

Create src/app/api/ai/query/route.ts:

This implements the full Claude tool-use two-turn pattern with claude-sonnet-4-6.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Define all 10 tools (use the schemas from Step 9.1)
const tools = [
  {
    name: "get_cogs_summary",
    description: "Get total COGS and breakdown by recipe for a date range. Use when the user asks about costs, COGS, cost of goods sold, or production costs.",
    input_schema: {
      type: "object",
      properties: {
        org_id: { type: "string", description: "The organization ID" },
        start_date: { type: "string", description: "Start date in YYYY-MM-DD format" },
        end_date: { type: "string", description: "End date in YYYY-MM-DD format" }
      },
      required: ["org_id", "start_date", "end_date"]
    }
  },
  // ... (include all 10 tools with full schemas)
];

// POST handler
export async function POST(request: Request) {
  // 1. Authenticate the user and get their org_id from JWT claims
  // 2. Get the user's message from the request body
  // 3. TURN 1: Send the message to Claude with tools

  const turn1 = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: `You are the Lotmonster AI assistant, an expert in inventory management, COGS analysis, and lot traceability for CPG manufacturers. You have access to the user's data through tools.

When the user asks a question:
1. Determine which tool(s) to call
2. Use the org_id: ${orgId}
3. For date ranges, infer from context (e.g., "this month" = current month start to today)
4. Present results in clear, concise language with specific numbers
5. If you're unsure about a date range, ask the user

Always be helpful and specific. Reference lot numbers, recipe names, and actual dollar amounts in your responses.`,
    messages: [{ role: "user", content: userMessage }],
    tools: tools,
  });

  // 4. Check if Claude wants to use a tool
  if (turn1.stop_reason === "tool_use") {
    // Extract the tool call(s)
    const toolUseBlocks = turn1.content.filter(block => block.type === "tool_use");

    // Execute each tool call via supabase.rpc()
    const toolResults = await Promise.all(toolUseBlocks.map(async (toolCall) => {
      const result = await executeToolCall(toolCall.name, toolCall.input, orgId);
      return {
        type: "tool_result",
        tool_use_id: toolCall.id,
        content: JSON.stringify(result),
      };
    }));

    // 5. TURN 2: Send the tool results back to Claude for a natural language response
    const turn2 = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `You are the Lotmonster AI assistant. You just received data from the user's database. Present it clearly with specific numbers, lot numbers, and dollar amounts. Format currency as $X,XXX.XX. Use markdown for structure if helpful.`,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: turn1.content },
        { role: "user", content: toolResults },
      ],
      tools: tools,
    });

    return Response.json({ message: extractTextContent(turn2.content) });
  }

  // If no tool use needed, return Claude's direct response
  return Response.json({ message: extractTextContent(turn1.content) });
}

// Tool execution function
async function executeToolCall(toolName: string, input: any, orgId: string) {
  // Inject the authenticated org_id (override whatever Claude passed — security!)
  input.org_id = orgId;

  // Call the corresponding Supabase RPC function
  const { data, error } = await supabase.rpc(toolName, input);
  if (error) throw error;
  return data;
}

IMPORTANT SECURITY NOTES:
- Always override org_id with the authenticated user's org_id — never trust what Claude passes
- Do NOT use extended thinking (thinking parameter) with tool_use — they are incompatible
- Use claude-sonnet-4-6 (NOT claude-3-7-sonnet or claude-3-5-sonnet)
```

### Step 9.5 — AI Chat UI

**[CLAUDE CODE]**

```
Create the AI chat UI for Lotmonster at F:\Projects\lotmonster.

Create src/app/dashboard/ai/page.tsx:

1. Layout:
   - Full-height chat interface within the dashboard layout
   - Chat history area (scrollable, auto-scrolls to bottom)
   - Input area at the bottom: text input + send button
   - Suggested questions above the input when chat is empty:
     - "What's my COGS this month?"
     - "Which lots are expiring in the next 30 days?"
     - "What's my most expensive recipe?"
     - "Show me inventory valuation"
     - "Which ingredients are low on stock?"

2. Message bubbles:
   - User messages: right-aligned, teal background, white text
   - AI messages: left-aligned, gray background, dark text
   - AI messages support markdown rendering (use a markdown renderer library)
   - Format tables, bold text, and lists in AI responses

3. Loading state:
   - While waiting for AI response, show animated dots in an AI bubble
   - Disable the input field and send button while loading

4. Error handling:
   - If the API returns an error, show a red error bubble: "Something went wrong. Please try again."
   - If the error is "Rate limit exceeded", show: "AI rate limit reached. Please wait a moment."
   - Retry button on error messages

5. State management:
   - Use React state (useState) for messages array
   - Each message: { role: 'user' | 'assistant', content: string, timestamp: Date }
   - Messages persist for the session only (no database storage)
   - "Clear Chat" button in the header

6. API call:
   - POST to /api/ai/query with { message: userInput }
   - Handle streaming if possible (for faster perceived response)

Use Tailwind for styling. Keep it clean and professional.
```

### Step 9.6 — Test AI Assistant

**[PERPLEXITY COMPUTER]**

```
Test the Lotmonster AI assistant at the deployed URL. Run these queries and report results:

1. Ask: "What's my COGS this month?"
   - Does it return actual data from the database?
   - Are the dollar amounts formatted correctly?
   - Does it break down by recipe?

2. Ask: "Which lots are expiring in the next 30 days?"
   - Does it list specific lot numbers and expiry dates?
   - Is the data accurate compared to what's in Supabase?

3. Ask: "What's my most expensive recipe to produce?"
   - Does it compare recipe costs correctly?
   - Does it show the per-unit cost?

4. Ask: "Trace lot LOT-2025-001" (use an actual lot number from the demo data)
   - Does it show the full traceability chain?
   - Forward: lot → production runs → sales orders → customers

5. General:
   - Are there any tool_use errors in the browser console?
   - How fast are the responses (should be under 5 seconds)?
   - Does the suggested questions feature work?
   - Does the loading state display correctly?

Report all issues found.
```

---

## Part 10 — Days 43–49: Vercel Cron Jobs

### Step 10.1 — QBO Sync Retry Cron

**[CLAUDE CODE]**

```
Create the QBO sync retry cron job for Lotmonster at F:\Projects\lotmonster.

Create src/app/api/cron/sync-qbo/route.ts:

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Query qbo_sync_log for failed/retrying entries
  //    WHERE status IN ('failed', 'retrying')
  //    AND attempts < 5  (max retries)
  //    ORDER BY created_at ASC
  //    LIMIT 10  (batch size)

  // 3. For each failed sync entry:
  //    a. Determine the entity type (journal_entry, invoice, bill)
  //    b. Fetch the related entity (production_run, sales_order, purchase_order)
  //    c. Retry the QBO API call
  //    d. On success: update status = 'synced', synced_at = now()
  //    e. On failure: update status = 'failed', attempts++, error_message, last_attempted_at

  // 4. Log summary: { retried: X, succeeded: Y, failed: Z }

  // 5. Also check for orgs with QBO connected but no sync in 24+ hours
  //    (detect stale connections)

  return NextResponse.json({
    success: true,
    retried: retriedCount,
    succeeded: succeededCount,
    failed: failedCount,
  });
}

IMPORTANT:
- This MUST be a GET handler (Vercel Cron only supports GET)
- MUST have: export const dynamic = 'force-dynamic' (prevents stale cached responses)
- MUST verify CRON_SECRET before doing anything
- Use the Supabase service role client (not the user's client) since there's no user session
```

### Step 10.2 — Configure Vercel Cron

**[CLAUDE CODE]**

```
Update the Vercel configuration for Lotmonster at F:\Projects\lotmonster.

Create or update vercel.json at the project root:

{
  "crons": [
    {
      "path": "/api/cron/sync-qbo",
      "schedule": "0 */4 * * *"
    }
  ]
}

This runs the QBO sync retry every 4 hours.

Also add a comment in the cron route file explaining the schedule:
// Runs every 4 hours via Vercel Cron (configured in vercel.json)
// Schedule: 0 */4 * * * (at minute 0 of every 4th hour)
// Free tier: 2 cron jobs, 1 invocation per day (Hobby plan: daily invocations)
// Pro tier: more invocations if needed

Commit and push this change.
```

### Step 10.3 — Verify Cron Configuration

**[PERPLEXITY COMPUTER]**

```
Verify the Lotmonster cron job is configured correctly in Vercel. Check:

1. Go to the Vercel project dashboard → Settings → Cron Jobs. Is the /api/cron/sync-qbo job listed?
2. What is the next scheduled run time?
3. Has it run successfully before? Check the logs for any previous invocations.
4. Is the CRON_SECRET environment variable set in Vercel?
5. Try triggering the cron manually by visiting the URL with the correct Authorization header. Does it return a success response?
6. Check the Vercel function logs — are there any errors from the cron execution?

If the cron isn't showing up, the most common issue is that vercel.json needs to be in the project root and the path must match exactly.
```

---

## Part 11 — Days 50–52: Stripe Billing

### Step 11.1 — Set Up Stripe Products

**[PERPLEXITY COMPUTER]**

```
Walk me through setting up Stripe products and prices for Lotmonster. I need three subscription plans:

1. Starter — $99/month
   - Features: Up to 50 ingredients, 20 lots, 5 recipes, basic AI (10 queries/day), no QBO sync
2. Growth — $199/month
   - Features: Up to 200 ingredients, unlimited lots, 25 recipes, full AI (100 queries/day), QBO sync
3. Scale — $299/month
   - Features: Unlimited everything, priority AI, QBO sync, API access, dedicated support

For each plan:
- 14-day free trial
- Trial cancels automatically if no payment method is added (trial_settings.end_behavior.missing_payment_method: 'cancel')
- Monthly billing cycle

Walk me through:
1. Creating each product in the Stripe dashboard (Test mode)
2. Creating the recurring price for each product
3. Getting the price IDs (I'll need these in my code)
4. Setting up the customer portal for self-serve management
5. Configuring the webhook endpoint URL (https://lotmonster.co/api/stripe/webhook)
6. Which webhook events to listen for
```

### Step 11.2 — Stripe Checkout Session

**[CLAUDE CODE]**

```
Create the Stripe Checkout Session route for Lotmonster at F:\Projects\lotmonster.

Create src/app/api/stripe/checkout/route.ts:

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  // 1. Authenticate the user and get their org_id
  // 2. Get the priceId from the request body
  // 3. Get or create a Stripe customer for this org

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      trial_settings: {
        end_behavior: {
          missing_payment_method: 'cancel',
        },
      },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing`,
    metadata: {
      org_id: orgId,
    },
  });

  return Response.json({ url: session.url });
}

Also create a pricing page component at src/app/pricing/page.tsx:
- Three plan cards side by side
- Highlight the Growth plan as "Most Popular"
- Each card shows: plan name, price, feature list, "Start Free Trial" button
- The button calls /api/stripe/checkout with the appropriate priceId
- If user is already subscribed, show "Current Plan" badge and disable the button
```

### Step 11.3 — Stripe Webhook Handler

**[CLAUDE CODE]**

```
Create the Stripe webhook handler for Lotmonster at F:\Projects\lotmonster.

Create src/app/api/stripe/webhook/route.ts:

CRITICAL: Use req.text() to get the raw body BEFORE parsing. Do NOT use req.json() — Stripe signature verification requires the raw body.

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const body = await request.text(); // RAW body — not .json()!
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Update org: set stripe_customer_id, stripe_subscription_id
      // Set plan based on the price ID
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      // Confirm subscription is active
      // Update org plan if changed
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      // Mark org as payment_failed
      // Show a banner in the dashboard: "Payment failed — update your payment method"
      break;
    }

    case 'customer.subscription.trial_will_end': {
      const subscription = event.data.object as Stripe.Subscription;
      // Trial ends in 3 days — send a reminder (log for now, email later)
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      // Downgrade org to free/inactive
      // Restrict access but don't delete data
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      // Handle plan upgrades/downgrades
      // Update org.plan based on the new price ID
      break;
    }
  }

  return new Response('ok', { status: 200 });
}

IMPORTANT: This route must NOT be behind auth (no session required — Stripe calls it directly).
Add it to the public routes list in proxy.ts/middleware.ts.
```

### Step 11.4 — Plan-Based Feature Gating

**[CLAUDE CODE]**

```
Implement plan-based feature gating for Lotmonster at F:\Projects\lotmonster.

Create src/lib/plans.ts:

Define the feature limits for each plan:

const PLAN_LIMITS = {
  starter: {
    maxIngredients: 50,
    maxLots: 20,
    maxRecipes: 5,
    aiQueriesPerDay: 10,
    qboSync: false,
    apiAccess: false,
  },
  growth: {
    maxIngredients: 200,
    maxLots: Infinity,
    maxRecipes: 25,
    aiQueriesPerDay: 100,
    qboSync: true,
    apiAccess: false,
  },
  scale: {
    maxIngredients: Infinity,
    maxLots: Infinity,
    maxRecipes: Infinity,
    aiQueriesPerDay: Infinity,
    qboSync: true,
    apiAccess: true,
  },
};

Export functions:
1. getPlanLimits(plan: string) → returns the limits object
2. checkFeatureAccess(plan: string, feature: string) → boolean
3. checkResourceLimit(plan: string, resource: string, currentCount: number) → { allowed: boolean, limit: number, current: number, message: string }

Apply gating in:
1. Ingredient creation: check maxIngredients before allowing new ingredient
2. Lot creation: check maxLots
3. Recipe creation: check maxRecipes
4. AI query route: check aiQueriesPerDay (track daily usage in a simple counter — Redis or Supabase)
5. QBO routes: check qboSync — if false, return a "Upgrade to Growth" response
6. API routes: check apiAccess

Create a reusable upgrade prompt component:
src/components/upgrade-prompt.tsx
- Shows when a user hits a plan limit
- "You've reached the {resource} limit on the {plan} plan. Upgrade to {nextPlan} to get {benefit}."
- "Upgrade Now" button → links to pricing page
```

### Step 11.5 — Customer Portal

**[CLAUDE CODE]**

```
Create the Stripe Customer Portal session for Lotmonster at F:\Projects\lotmonster.

Create src/app/api/stripe/portal/route.ts:

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  // 1. Authenticate user, get org's stripe_customer_id
  // 2. Create a portal session:

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing`,
  });

  return Response.json({ url: portalSession.url });
}

Also create the billing settings page at src/app/dashboard/settings/billing/page.tsx:
- Current plan name and status (active, trialing, past_due)
- If trialing: "Your free trial ends on {date}. Add a payment method to continue."
- Current billing period
- "Manage Subscription" button → opens Stripe Customer Portal
- "Change Plan" section with the three plan cards
- Invoice history (fetch from Stripe API)
```

---

## Part 12 — Days 53–55: Demo Seeder + Polish

### Step 12.1 — Demo Data Seeder

**[CLAUDE CODE]**

```
Create a demo data seeder for Lotmonster at F:\Projects\lotmonster.

Create src/scripts/seed-demo.ts (runnable with ts-node or npx tsx):

The demo company is "Lone Star Heat" — a Texas-based hot sauce manufacturer.

Seed this data:

INGREDIENTS (8):
1. Habanero Peppers — lb, raw_material
2. Apple Cider Vinegar — gal, raw_material
3. Garlic Cloves — lb, raw_material
4. Sea Salt — lb, raw_material
5. Cayenne Pepper Powder — lb, raw_material
6. Mango (fresh) — lb, raw_material
7. 5oz Hot Sauce Bottles — each, packaging
8. Shipping Labels — each, label

LOTS (16 — 2 per ingredient, with different dates/costs):
- Habanero Lot 1: HAB-20250101, 50 lb, $3.50/lb, received Jan 1, expires Apr 1
- Habanero Lot 2: HAB-20250301, 75 lb, $3.75/lb, received Mar 1, expires Jun 1
- Vinegar Lot 1: VIN-20250115, 10 gal, $8.00/gal, received Jan 15, no expiry
- Vinegar Lot 2: VIN-20250401, 15 gal, $8.50/gal, received Apr 1, no expiry
- (similar for all 8 ingredients with realistic costs and dates)

RECIPES (3):
1. "Lone Star Original" — target 100 bottles
   - 10 lb Habanero, 1 gal Vinegar, 2 lb Garlic, 0.5 lb Salt, 100 Bottles, 100 Labels
2. "Mango Habanero Blaze" — target 100 bottles
   - 8 lb Habanero, 5 lb Mango, 0.75 gal Vinegar, 1 lb Garlic, 0.25 lb Salt, 100 Bottles, 100 Labels
3. "Cayenne Garlic Kick" — target 100 bottles
   - 3 lb Cayenne, 0.5 gal Vinegar, 3 lb Garlic, 0.5 lb Salt, 100 Bottles, 100 Labels

PRODUCTION RUNS (5):
- PR-2025-001: Lone Star Original, completed Jan 20, actual yield 98 bottles, waste 2
- PR-2025-002: Mango Habanero Blaze, completed Feb 10, actual yield 95 bottles, waste 5
- PR-2025-003: Lone Star Original, completed Mar 5, actual yield 100 bottles, waste 0
- PR-2025-004: Cayenne Garlic Kick, completed Mar 20, actual yield 97 bottles, waste 3
- PR-2025-005: Lone Star Original, in_progress (draft — not yet completed)

PURCHASE ORDERS (3):
- PO-2025-001: received, from "Texas Pepper Farms", Jan supplies
- PO-2025-002: received, from "Hill Country Organics", Mar supplies
- PO-2025-003: sent (pending), from "Texas Pepper Farms", next month supplies

SALES ORDERS (10):
- SO-2025-001 through SO-2025-010
- Mix of shipped and delivered
- Customers: "Whole Foods Austin", "Central Market Dallas", "HEB San Antonio", "Local Grocer Co", "Farmers Market Direct"
- Various quantities of different recipes
- Include lot_numbers_allocated for traceability

QBO SYNC LOG (1):
- One synced journal entry for PR-2025-001

The script should:
1. Create the org "Lone Star Heat" with plan='growth'
2. Create a demo user and org_member
3. Insert all data in correct dependency order
4. Calculate COGS for completed production runs
5. Print a summary when done

Add a npm script: "seed": "tsx src/scripts/seed-demo.ts"
```

### Step 12.2 — Full UI Audit

**[PERPLEXITY COMPUTER]**

```
Run a full UI audit of the Lotmonster app at the deployed URL. Check every screen systematically and report:

1. BRANDING: Search every screen for any text that says "Stackline" instead of "Lotmonster". Check:
   - Page titles (browser tab)
   - Navigation items
   - Footer text
   - Error messages
   - Loading states
   - Email templates
   - Meta tags (og:title, description)

2. LOADING STATES: Does every data fetch show a loading skeleton or spinner? Check:
   - Dashboard home stats
   - Ingredient list
   - Lot list
   - Recipe list
   - Production run list
   - Purchase order list
   - Sales order list
   - AI assistant initial load

3. EMPTY STATES: Does every list view handle zero items gracefully? Check each list when empty:
   - Should show a friendly message + CTA to create the first item
   - Should NOT show a broken table or "undefined"

4. ERROR STATES: Do failed API calls show user-friendly errors? Try:
   - Disconnect from internet briefly → does it show a retry option?
   - Invalid form submissions → do errors highlight the right field?

5. MOBILE LAYOUT: Check screens at 375px width:
   - Does the sidebar collapse?
   - Are tables scrollable horizontally?
   - Are forms usable on mobile?
   - Is the AI chat input accessible?

Report ALL issues found — I'll fix them in the next step.
```

### Step 12.3 — Fix Audit Issues

**[CLAUDE CODE]**

```
Fix all UI issues found in the Lotmonster audit. Here is the list of issues:

[PASTE THE ISSUES FROM STEP 12.2 HERE]

For each issue:
1. Identify the file that needs to change
2. Make the fix
3. Add a brief comment explaining the fix

After all fixes, run `npm run build` to verify no new errors.
Commit: "fix: UI audit fixes — branding, loading states, empty states, mobile layout"
```

---

## Part 13 — Day 56: Security + Submission

### Step 13.1 — Security Audit

**[PERPLEXITY COMPUTER]**

```
Perform a security audit of the Lotmonster deployment. Check each item and report PASS or FAIL with details:

1. CRON_SECRET: Is it set in Vercel environment variables AND verified in the /api/cron/sync-qbo route? Check that the route returns 401 without the correct Authorization header.

2. SUPABASE RLS: Are Row Level Security policies enabled on ALL 13 tables? List any table where RLS is disabled or has no policies.

3. AUTH REDIRECT: Does accessing /dashboard without being logged in redirect to /login? Test by opening the URL in an incognito window.

4. ENV VARIABLES: Are all sensitive environment variables (API keys, secrets) set in Vercel and NOT hardcoded in the source code? Search the codebase for any hardcoded keys.

5. STRIPE WEBHOOK: Is the webhook signature verified using constructEvent() with the raw body? Does the route use req.text() (not req.json())?

6. QBO TOKEN STORAGE: Is the QBO refresh token stored in Supabase Vault (encrypted), NOT in a plain text column? Check the orgs table — should reference a vault secret ID, not the token itself.

7. AI READONLY ROLE: Is the AI assistant using a SELECT-only database role? Can it INSERT, UPDATE, or DELETE anything? Verify the role permissions.

8. CORS: Are API routes properly restricted? No wildcard Access-Control-Allow-Origin.

9. RATE LIMITING: Is there any rate limiting on the AI query endpoint and auth routes?

10. INPUT VALIDATION: Are all user inputs validated with zod schemas before processing?

For each FAIL, tell me exactly what to fix and which file to change.
```

### Step 13.2 — Demo Script

**[PERPLEXITY COMPUTER]**

```
Write a 5-minute demo script for Lotmonster using the "Lone Star Heat" demo data. Format as a detailed table that I can follow while screen-sharing.

| Time | Screen | What to Say | What to Click |
|---|---|---|---|
| 0:00-0:30 | Login page | "This is Lotmonster..." | Sign in with demo account |
| 0:30-1:00 | Dashboard | "Here's the main dashboard showing..." | Point to stats, expiring lots |
| ... | ... | ... | ... |

Cover these 5 key moments:
1. ONBOARDING (0:00-1:00): Show the three paths — demo the file upload with a sample CSV
2. PRODUCTION RUN (1:00-2:30): Start a production run for Lone Star Original, show FEFO lot allocation, complete it with actual yield, show COGS calculation
3. QBO SYNC (2:30-3:30): Show the journal entry created in QuickBooks, demonstrate the account mapping
4. AI ASSISTANT (3:30-4:30): Ask "What's my COGS this month?" and "Trace lot HAB-20250101" — show the natural language responses
5. RECALL TRACEABILITY (4:30-5:00): Demo the traceability view — "If lot HAB-20250101 had an issue, here's every product and customer it touched"

Make the script conversational and confident. Include specific numbers from the demo data.
```

### Step 13.3 — Submission Narrative

**[PERPLEXITY COMPUTER]**

```
Write the Perplexity Billion Dollar Build contest submission narrative for Lotmonster. This should be compelling, specific, and demonstrate how Perplexity Computer was central to the build process.

Structure:

1. WHAT WE BUILT (2 paragraphs)
   - Lotmonster: AI-native inventory management for small CPG manufacturers
   - Key capabilities: three-path onboarding, lot tracing with FEFO, recipe-based COGS, QBO double-entry sync, AI assistant with 10 named tools

2. WHO IT'S FOR (1 paragraph)
   - Small CPG manufacturers (hot sauce, cosmetics, supplements, candles)
   - Currently using spreadsheets or generic ERPs that don't understand lot tracking or COGS
   - 50,000+ small CPG manufacturers in the US alone

3. HOW PERPLEXITY COMPUTER WAS CENTRAL (3 paragraphs — this is the key section)
   List every phase where Computer was the primary tool:
   - Day 0: Validated SDK versions, checked API docs, flagged breaking changes
   - Days 1-2: Guided Vercel deployment, verified first deploy
   - Days 3-6: Verified database schema, confirmed RLS policies
   - Days 7-14: Tested all three onboarding paths
   - Days 36-42: Researched QBO OAuth flow, verified sandbox sync
   - Days 43-49: Designed Claude tool_use schemas, tested AI responses
   - Days 50-52: Guided Stripe setup, verified cron jobs
   - Day 56: Full security audit, UI audit, demo scripting, this narrative
   - Throughout: every verification step, every "does this actually work?" moment

4. THE MARKET OPPORTUNITY (2 paragraphs)
   - CPG manufacturing software market size
   - Why AI-native wins: natural language queries, vision-based onboarding, smart lot allocation

5. WHAT WE'D BUILD WITH $1B (2 paragraphs)
   - Scale: every CPG manufacturer in the world
   - Features: predictive demand, automated reordering, marketplace for ingredients, multi-facility
   - Team: hire domain experts from food safety, cosmetics regulation, supply chain

Make it authentic — this was built by a non-coder using AI tools. That's the story.
```

---

## Part 14 — Troubleshooting Guide

When things go wrong, here's what to tell Claude Code:

### Error: "auth/callback returns 404"

**[CLAUDE CODE]**

```
The auth callback at /api/auth/callback is returning 404 in the Lotmonster app. The issue is likely that the proxy.ts/middleware.ts matcher is intercepting /api routes and redirecting to /login before they can execute.

Fix the route matcher to exclude ALL /api routes from the auth check. The matcher should be:
- Protected: /dashboard/*
- Public (no auth check): /api/*, /, /login, /signup, /pricing

Check proxy.ts (or middleware.ts) and update the matcher regex.
```

### Error: "Supabase getAll is not a function"

**[CLAUDE CODE]**

```
The Lotmonster Supabase client is throwing "getAll is not a function" error. This means @supabase/ssr is below version 0.4.0.

Run: npm list @supabase/ssr

If it's below 0.4.0, update:
npm install @supabase/ssr@latest

Then verify the cookie pattern in src/lib/supabase/server.ts uses getAll/setAll (not get/set individually).
```

### Error: "QBO API returns 401"

**[CLAUDE CODE]**

```
The QuickBooks Online API is returning 401 Unauthorized in the Lotmonster app. This likely means:

1. The access token expired (they expire every hour) — check if the auto-refresh in src/lib/qbo.ts is working
2. The refresh token expired (after 100 days of no use) — if so, the user needs to reconnect QBO
3. The refresh token isn't being rotated — QBO sends a NEW refresh token with every refresh, and we must store it

Debug steps:
1. Check the token cache in qbo.ts — is it refreshing before expiry?
2. Check Supabase Vault — is the refresh token being updated after each refresh?
3. Add logging to the refresh flow to trace the issue
4. If the refresh token is expired, update the QBO connection status in orgs table and show a "Reconnect QuickBooks" prompt
```

### Error: "Cron job returns stale data"

**[CLAUDE CODE]**

```
The Lotmonster Vercel Cron job at /api/cron/sync-qbo is returning stale/cached data instead of fresh results.

Fix: Make sure the cron route file has this at the top:
export const dynamic = 'force-dynamic';

This tells Next.js to never cache this route. Without it, Next.js may serve a cached response.

Also check that the Supabase client in the cron route is using the service role key (not the anon key) since there's no user session.
```

### Error: "Claude tool_use returns error about tool_choice"

**[CLAUDE CODE]**

```
The Lotmonster AI assistant is returning an error about tool_choice being incompatible with extended thinking.

Fix: In src/app/api/ai/query/route.ts, make sure you are NOT passing the `thinking` parameter when using tool_use. They are incompatible in claude-sonnet-4-6.

Remove any `thinking: { type: "enabled", budget_tokens: ... }` parameter from the anthropic.messages.create() calls that also include `tools`.

Also verify the model is set to "claude-sonnet-4-6" (not "claude-3-7-sonnet" or "claude-3-5-sonnet" — those are deprecated).
```

### Error: "Stripe webhook returns 400"

**[CLAUDE CODE]**

```
The Lotmonster Stripe webhook at /api/stripe/webhook is returning 400 errors. This is almost always because the raw body isn't preserved before parsing.

Fix in src/app/api/stripe/webhook/route.ts:

WRONG:
const body = await request.json(); // This parses the body!

RIGHT:
const body = await request.text(); // Preserves the raw body for signature verification

The stripe.webhooks.constructEvent() function requires the EXACT raw body string that Stripe sent. If you parse it to JSON first and re-stringify, the signature won't match.

Also verify:
1. STRIPE_WEBHOOK_SECRET is set in Vercel env vars
2. The webhook URL in the Stripe dashboard matches your deployment URL exactly
3. The route is listed in public routes in proxy.ts (no auth required)
```

---

## Part 15 — Pre-Deploy Checklist

Run through this checklist before the final submission. Check each item off:

| # | Check | How to Verify | Status |
|---|---|---|---|
| 1 | All env vars set in Vercel | Vercel Dashboard → Settings → Environment Variables | ☐ |
| 2 | RLS enabled on all 13 tables | Supabase Dashboard → Authentication → Policies | ☐ |
| 3 | No "Stackline" text anywhere | Search codebase: `grep -r "Stackline" src/` | ☐ |
| 4 | Zero $0.00 costs in demo data | Query: `SELECT * FROM lots WHERE unit_cost = 0` | ☐ |
| 5 | CRON_SECRET is set and verified | Hit /api/cron/sync-qbo without auth → should return 401 | ☐ |
| 6 | Stripe webhook signature verified | Check /api/stripe/webhook uses req.text() + constructEvent() | ☐ |
| 7 | QBO refresh token in Vault | Check orgs table: qbo_refresh_token_vault_id is set, not a raw token | ☐ |
| 8 | AI uses SELECT-only role | Check migration 003: ai_readonly role has no INSERT/UPDATE/DELETE | ☐ |
| 9 | Auth redirect works | Open /dashboard in incognito → should redirect to /login | ☐ |
| 10 | All three onboarding paths work | Test each path end-to-end with real data | ☐ |
| 11 | Production run COGS calculates | Complete a run → check total_cogs is populated | ☐ |
| 12 | QBO journal entry syncs | Complete a run → check QBO sandbox for the entry | ☐ |
| 13 | AI assistant returns data | Ask "What's my COGS this month?" → should return real numbers | ☐ |
| 14 | Traceability works both directions | Search by lot number → see forward trace; search by SO → see reverse trace | ☐ |
| 15 | Mobile layout is usable | Open on a phone (or 375px width) → all screens navigable | ☐ |
| 16 | Demo seeder runs clean | `npm run seed` → all data created without errors | ☐ |

---

*Lotmonster Build Guide v3 — Generated by Perplexity Computer*
*Domain: lotmonster.co | Stack: Next.js 15 + Supabase + Vercel + Claude + Stripe + QBO*
