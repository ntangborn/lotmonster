# Lotmonster — Onboarding UX Specification v3

**Version:** 3.0  
**Last Updated:** July 2025  
**Status:** Draft  
**Platform:** lotmonster.co  
**Stack:** Next.js App Router · Supabase · Anthropic Claude API

---

## Table of Contents

1. [Overview & Design Philosophy](#1-overview--design-philosophy)
2. [Welcome Screen (Screen 0)](#2-welcome-screen-screen-0)
3. [Path A — Upload Recipe](#3-path-a--upload-recipe)
4. [Path B — Manual Form](#4-path-b--manual-form)
5. [Path C — AI Chat (Natural Language)](#5-path-c--ai-chat-natural-language)
6. [Shared Components](#6-shared-components)
7. [Post-Onboarding: Dashboard First View](#7-post-onboarding-dashboard-first-view)
8. [Error States & Edge Cases](#8-error-states--edge-cases)
9. [Accessibility & Mobile](#9-accessibility--mobile)
10. [Success Metrics](#10-success-metrics)
11. [Open Design Questions](#11-open-design-questions)
12. [Appendix: Technical Notes](#12-appendix-technical-notes)

---

## 1. Overview & Design Philosophy

### 1.1 Product Context

Lotmonster is an AI-native inventory management platform built for small CPG manufacturers — craft hot sauce makers, microbreweries, artisan bakers, and similar businesses. These users are founders, not accountants. They know their recipes by heart but have never modeled ingredient costs in software.

The onboarding flow exists to bridge that gap: take what the user already knows (their recipe) and turn it into a structured product record with accurate, transparent cost data.

### 1.2 Primary Goal

**A non-technical CPG founder creates their first product record — recipe + ingredient costs — in under 7 minutes.**

This is the single activation metric. Everything in this spec serves it.

### 1.3 Design Principles

| # | Principle | What it means in practice |
|---|-----------|--------------------------|
| 1 | **Three equal paths** | The Welcome Screen presents Upload, Manual, and AI Chat as equal options. No "recommended" badge, no default selection, no AI-first bias. The user picks the path that matches what they have in hand. |
| 2 | **Show the full cost derivation chain** | Never display only a final number. Always show the math: `$12.50 / 25 lb bag → $0.50/lb → recipe uses 2 lb → $1.00`. The user must trust the number, and trust comes from transparency. |
| 3 | **Never strand the user** | Every path has an escape hatch to another path. Upload fails? Switch to Manual. Chat feels weird? "Edit as form" converts to Manual with data intact. No dead ends. |
| 4 | **Deterministic first, AI second** | File parsing uses regex/deterministic extraction first. Claude is a fallback for messy or image-based files, never the default. Users who choose the Manual path get zero AI involvement. |
| 5 | **Zero-cost guard** | The system never lets a user save a product where any ingredient has a $0.00 unit cost. This prevents garbage data from entering the system on day one. |

### 1.4 User Persona

**Primary:** Small CPG founder/operator  
- Makes 1–5 products  
- Buys ingredients in bulk from restaurant supply, Amazon, or local distributors  
- Tracks recipes on paper, in Notes, or in a basic spreadsheet  
- Has never used inventory management software  
- Needs to know their true cost-per-unit to price products and stay profitable

### 1.5 Onboarding Flow Map

```
┌─────────────────────────────────────────────────────────┐
│                   WELCOME SCREEN (0)                     │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐           │
│  │ Upload   │   │ Manual   │   │ AI Chat  │           │
│  │ Recipe   │   │ Form     │   │          │           │
│  │ (Path A) │   │ (Path B) │   │ (Path C) │           │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘           │
│       │              │              │                   │
└───────┼──────────────┼──────────────┼───────────────────┘
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ File    │   │ Product │   │ Chat    │
   │ Upload  │   │ Name +  │   │ Input   │
   │ (1A)    │   │ Type    │   │ (1C)    │
   │         │   │ (1B)    │   │         │
   └────┬────┘   └────┬────┘   └────┬────┘
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Parse   │   │ Add     │   │ Staging │
   │ Preview │   │ Ingred- │   │ Panel   │
   │ (2A)    │   │ ients   │   │ (2C)    │
   │         │   │ (2B)    │   │         │
   └────┬────┘   └────┬────┘   └────┬────┘
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Bulk    │   │ Recipe  │   │ Pricing │
   │ Pricing │   │ Assembly│   │ Step    │
   │ (3A)    │   │ (3B)    │   │ (3C)    │
   └────┬────┘   └────┬────┘   └────┬────┘
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Product │   │ Product │   │ Product │
   │ Summary │   │ Summary │   │ Summary │
   │ (4A)    │   │ (4B)    │   │ (4C)    │
   └────┬────┘   └────┬────┘   └────┬────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
              ┌─────────────────┐
              │   DASHBOARD     │
              │   FIRST VIEW    │
              └─────────────────┘
```

**Escape hatches** (bidirectional where noted):

- Path A → Path B: "Enter manually instead" link on Screen 1A and 2A
- Path A → Path C: Not directly connected (low demand)
- Path B → Path A: "Or upload a file" link on Screen 1B
- Path C → Path B: "Edit as form" button available on Screens 1C–3C
- Any path → Welcome Screen: Back arrow always returns to Screen 0

---

## 2. Welcome Screen (Screen 0)

### 2.1 Purpose

The Welcome Screen is the first thing a new user sees after email verification and account creation. Its only job: help the user identify which onboarding path matches what they already have.

### 2.2 Layout

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                    🟢 Lotmonster                          │
│                                                          │
│            Let's build your first product.               │
│       Pick the way that matches what you've got.         │
│                                                          │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐│
│  │                │ │                │ │                ││
│  │  📄 Upload     │ │  🔧 Build it   │ │  💬 Describe   ││
│  │  your recipe   │ │  here          │ │  it            ││
│  │                │ │                │ │                ││
│  │  Got a spread- │ │  Add ingredi-  │ │  Don't have a  ││
│  │  sheet? Drop   │ │  ents one by   │ │  file? Tell us ││
│  │  it here.      │ │  one. Takes    │ │  what you make.││
│  │                │ │  about 5 min.  │ │                ││
│  └────────────────┘ └────────────────┘ └────────────────┘│
│                                                          │
│           ─── or drag a file anywhere ───                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 2.3 Card Specifications

| Card | Headline | Subtext | Icon |
|------|----------|---------|------|
| A — Upload | Upload your recipe | Got a spreadsheet? Drop it here. | Document/file icon |
| B — Manual | Build it here | Add ingredients one by one. Takes about 5 minutes. | Wrench/pencil icon |
| C — AI Chat | Describe it | Don't have a file? Tell us what you make. | Chat bubble icon |

**Visual weight:** All three cards are identical in size, color treatment, and visual prominence. No card has a badge, highlight, border, or label suggesting it is the recommended or default option.

### 2.4 Global Drag-Drop Zone

The entire Welcome Screen is a drag-drop zone. When the user drags a file over the browser window:

1. A full-screen overlay appears: `"Drop your file to get started"`
2. On drop, the user is automatically routed to **Path A, Screen 1A** with the file pre-loaded
3. Accepted types: `.csv`, `.xlsx`, `.xls`, `.pdf`, `.png`, `.jpg`, `.jpeg`
4. If the file type is not supported, show an inline error and remain on Screen 0

### 2.5 Behavior

- **No auto-selection.** The screen loads with no card selected or highlighted.
- **Hover state:** Subtle border highlight + slight elevation (box-shadow)
- **Click:** Navigates to the first screen of the selected path
- **Keyboard:** Tab between cards, Enter to select
- **Back navigation:** Returning from any path's Screen 1 returns here

---

## 3. Path A — Upload Recipe

### 3.1 Screen 1A: File Upload

**Purpose:** Accept a recipe file and begin processing.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back                              ● ○ ○ ○  Step 1/4  │
│                                                          │
│              Upload your recipe file                     │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │                                                      ││
│  │          ┌─────────────────────┐                     ││
│  │          │                     │                     ││
│  │          │   Drop file here    │                     ││
│  │          │   or click to       │                     ││
│  │          │   browse            │                     ││
│  │          │                     │                     ││
│  │          │   CSV, XLSX, PDF,   │                     ││
│  │          │   or photo of a     │                     ││
│  │          │   recipe            │                     ││
│  │          │                     │                     ││
│  │          └─────────────────────┘                     ││
│  │                                                      ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│       Don't have a file? [Enter manually instead →]      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Accepted file types:**

| Type | Extension | Parse method |
|------|-----------|-------------|
| CSV | `.csv` | Deterministic (regex + column detection) |
| Excel | `.xlsx`, `.xls` | Deterministic (column header matching) |
| PDF (text-based) | `.pdf` | Deterministic (text extraction + regex) |
| PDF (scanned/image) | `.pdf` | Claude Vision fallback |
| Image | `.png`, `.jpg`, `.jpeg` | Claude Vision |

**File size limit:** 10 MB

**After file selection:**
1. Show filename + file size in the drop zone
2. Show a loading spinner with "Analyzing your recipe..."
3. Auto-advance to Screen 2A when parsing completes

**Escape hatches:**
- "Enter manually instead" → Path B, Screen 1B
- ← Back → Welcome Screen (Screen 0)

### 3.2 Screen 2A: Parse Preview

**Purpose:** Show the user what was detected and let them confirm or edit before proceeding.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back                              ● ● ○ ○  Step 2/4  │
│                                                          │
│  We found 6 ingredients in your file                     │
│  ┌────────────────────────────────────┐                  │
│  │ ✅ Parsed with high confidence     │  (or)            │
│  │ ⚠️ Parsed with AI — please review │                  │
│  └────────────────────────────────────┘                  │
│                                                          │
│  ┌────────┬──────────┬──────────┬──────────┐            │
│  │ Ingred.│ Quantity │ Unit     │ Actions  │            │
│  ├────────┼──────────┼──────────┼──────────┤            │
│  │ Habanero│ 2       │ lb       │ ✏️ 🗑️   │            │
│  │ Vinegar│ 1        │ gallon   │ ✏️ 🗑️   │            │
│  │ Garlic │ 0.5      │ lb       │ ✏️ 🗑️   │            │
│  │ Salt   │ 4        │ oz       │ ✏️ 🗑️   │            │
│  │ Sugar  │ 2        │ oz       │ ✏️ 🗑️   │            │
│  │ Onion  │ 1        │ lb       │ ✏️ 🗑️   │            │
│  └────────┴──────────┴──────────┴──────────┘            │
│                                                          │
│  [+ Add missing ingredient]                              │
│                                                          │
│  Something look wrong? [Enter manually instead →]        │
│                                                          │
│                          [Looks good — set prices →]     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Parse Status Badge:**

| Badge | Condition | Meaning |
|-------|-----------|---------|
| ✅ Parsed with high confidence | Deterministic parser extracted all fields | Regex/column matching — no AI involved |
| ⚠️ Parsed with AI — please review | Claude Vision was used | AI extraction — user should double-check all fields |
| ❌ Could not parse — enter manually | Parse returned 0 ingredients | Redirect to Path B with explanation |

**Editable Fields:**

Every cell in the confirmation table is editable inline:
- **Ingredient name:** Free text input
- **Quantity:** Numeric input (decimals allowed)
- **Unit:** Dropdown (lb, kg, oz, g, gallon, liter, fl oz, each, bunch, can)

**Actions per row:**
- **Edit (✏️):** Toggles row into edit mode
- **Delete (🗑️):** Removes ingredient with confirmation
- **Add:** "+ Add missing ingredient" appends a blank row

**Escape hatches:**
- "Enter manually instead" → Path B, Screen 2B, pre-populated with detected data
- ← Back → Screen 1A

### 3.3 Screen 3A: Bulk Pricing Entry

**Purpose:** Collect cost data for each ingredient and show the full unit cost derivation chain in real time.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back                              ● ● ● ○  Step 3/4  │
│                                                          │
│  How much do you pay for each ingredient?                │
│  Enter the size and price of the package you buy.        │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Habanero peppers                                     ││
│  │                                                      ││
│  │ I buy this by the [ lb ▼ ] — [ 25 ] lbs for $[ 32 ] ││
│  │                                                      ││
│  │ 💡 $32.00 / 25 lb bag → $1.28/lb                    ││
│  │    → recipe uses 2 lb → $2.56 per batch              ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ White vinegar                                        ││
│  │                                                      ││
│  │ I buy this by the [ gal ▼ ] — [ 1 ] gal for $[ 4 ] ││
│  │                                                      ││
│  │ 💡 $4.00 / 1 gallon → $4.00/gal                     ││
│  │    → $4.00/gal ÷ 128 fl oz/gal → $0.03/fl oz        ││
│  │    → recipe uses 1 gal → $4.00 per batch             ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ... (one card per ingredient)                           │
│                                                          │
│                              [Review product summary →]  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Per-ingredient pricing card:**

| Field | Type | Description |
|-------|------|-------------|
| Bulk unit | Dropdown | The unit the ingredient is purchased in (lb, kg, oz, gallon, liter, each) |
| Bulk quantity | Numeric input | How many units per package |
| Bulk price | Currency input | Total price for the package |

**Derivation Chain Display:**

The derivation chain is the core transparency mechanism. It appears below each pricing card immediately as the user types, updating live. The chain always follows this structure:

```
[bulk price] / [bulk qty] [bulk unit] → [unit cost]/[bulk unit]
  → recipe uses [recipe qty] [recipe unit] → [ingredient cost per batch]
```

When unit conversion is needed (e.g., buying gallons but recipe uses fl oz), the chain adds a conversion step:

```
$4.00 / 1 gallon → $4.00/gal
  → $4.00/gal ÷ 128 fl oz/gal → $0.03/fl oz
  → recipe uses 16 fl oz → $0.50 per batch
```

**Validation:**
- All three fields (unit, quantity, price) must be filled before the derivation chain displays
- Bulk price of $0.00 is rejected — show inline error: "Enter the price you pay for this ingredient"
- The "Review product summary" button is disabled until all ingredients are priced

**Escape hatches:**
- ← Back → Screen 2A (parse preview, data preserved)

### 3.4 Screen 4A: Product Summary

**Purpose:** Final review before saving.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back                              ● ● ● ●  Step 4/4  │
│                                                          │
│  Your product is ready                                   │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Recipe name: [ Habanero Hot Sauce            ]      ││
│  │  Product type: [ Sauce ▼ ]                           ││
│  │  Batch yield: [ 24 ] bottles                         ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  Ingredient Cost Breakdown                               │
│  ┌─────────────┬────────────┬─────────────┬────────────┐│
│  │ Ingredient  │ Unit Cost  │ Qty / Batch │ Line Cost  ││
│  ├─────────────┼────────────┼─────────────┼────────────┤│
│  │ Habanero    │ $1.28/lb   │ 2 lb        │ $2.56      ││
│  │ Vinegar     │ $4.00/gal  │ 1 gal       │ $4.00      ││
│  │ Garlic      │ $3.00/lb   │ 0.5 lb      │ $1.50      ││
│  │ Salt        │ $0.68/lb   │ 4 oz        │ $0.17      ││
│  │ Sugar       │ $0.89/lb   │ 2 oz        │ $0.11      ││
│  │ Onion       │ $1.20/lb   │ 1 lb        │ $1.20      ││
│  ├─────────────┼────────────┼─────────────┼────────────┤│
│  │             │            │ TOTAL       │ $9.54      ││
│  │             │            │ Per bottle  │ $0.40      ││
│  └─────────────┴────────────┴─────────────┴────────────┘│
│                                                          │
│  Estimated COGS per unit: $0.40                          │
│  (ingredient cost only — packaging & labor not included) │
│                                                          │
│                      [Save & Continue →]                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Editable on this screen:**
- Recipe name (free text)
- Product type (dropdown: Sauce / Beverage / Baked Good / Other)
- Batch yield (numeric — "How many units does one batch make?")

**Summary table columns:**
- Ingredient name
- Unit cost (derived from bulk pricing)
- Quantity per batch (from parse/manual entry)
- Line cost (unit cost × quantity, with unit conversion applied)

**Footer data:**
- Total ingredient cost per batch
- Per-unit cost (total ÷ batch yield)
- Disclaimer: "Ingredient cost only — packaging & labor not included"

**CTA:** "Save & Continue" → writes product to Supabase, routes to Dashboard First View

**Validation:**
- Recipe name is required
- Batch yield must be > 0
- Zero cost guard: if any ingredient has $0.00 line cost, block save and highlight the row

---

## 4. Path B — Manual Form

### 4.1 Screen 1B: Product Name & Type

**Purpose:** Establish the product identity before ingredient entry.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back                              ● ○ ○ ○  Step 1/4  │
│                                                          │
│  What are you making?                                    │
│                                                          │
│  Product name                                            │
│  ┌──────────────────────────────────────────────────────┐│
│  │ e.g., Ghost Pepper Hot Sauce                         ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  Product type                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │   Sauce    │ │  Beverage  │ │ Baked Good │          │
│  └────────────┘ └────────────┘ └────────────┘          │
│  ┌────────────┐                                         │
│  │   Other    │                                         │
│  └────────────┘                                         │
│                                                          │
│  Or: [Upload a file instead →]                           │
│                                                          │
│                                       [Next →]          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Fields:**
- **Product name:** Free text, required, max 100 characters
- **Product type:** Single-select toggle buttons (Sauce / Beverage / Baked Good / Other)

**Product type** is used downstream for:
- Default unit suggestions (bottles for sauce/beverage, units for baked goods)
- Dashboard categorization
- Future: type-specific cost templates

**Escape hatches:**
- "Upload a file instead" → Path A, Screen 1A
- ← Back → Welcome Screen

### 4.2 Screen 2B: Add Ingredients

**Purpose:** Build the ingredient list one at a time, with live cost derivation as the user types.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back                              ● ● ○ ○  Step 2/4  │
│                                                          │
│  Ghost Pepper Hot Sauce — Ingredients                    │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Ingredient #1                                        ││
│  │                                                      ││
│  │ Name: [ Ghost peppers          ]                     ││
│  │                                                      ││
│  │ I buy this by the [ lb ▼ ] — [ 5 ] lbs for $[ 45 ] ││
│  │                                                      ││
│  │ 💡 $45.00 / 5 lb → $9.00/lb                         ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Ingredient #2                                        ││
│  │                                                      ││
│  │ Name: [ White vinegar           ]                    ││
│  │                                                      ││
│  │ I buy this by the [ gal ▼ ] — [ 1 ] gal for $[ 4 ] ││
│  │                                                      ││
│  │ 💡 $4.00 / 1 gallon → $4.00/gal                     ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [+ Add another ingredient]                              │
│                                                          │
│                                       [Next →]          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Per-ingredient fields:**

| Field | Type | Details |
|-------|------|---------|
| Name | Free text | Required. Autocomplete from common CPG ingredients (future). |
| Bulk unit | Dropdown | `lb`, `kg`, `oz`, `g`, `gallon`, `liter`, `fl oz`, `each` |
| Bulk quantity | Numeric | How many units per package purchased |
| Bulk price | Currency | Total price paid for the package |

**Bulk Price Toggle Pattern:**

The sentence-style input reads naturally: "I buy this by the **[lb]** — **[25]** lbs for $**[12.50]**"

This pattern:
- Reduces cognitive load (reads like English)
- Eliminates ambiguity about what "quantity" and "price" mean
- Maps directly to how founders think about purchasing ("I buy a 25 lb bag for $12.50")

**Live Unit Cost Derivation:**

As soon as all three pricing fields are filled, the derivation chain appears below the card:

```
$45.00 / 5 lb → $9.00/lb
```

At this stage, only the bulk→unit cost step is shown (recipe quantities come on Screen 3B).

**Adding/removing ingredients:**
- "+ Add another ingredient" appends a new blank card
- Each card has a delete button (🗑️) except the first (minimum 1 ingredient)
- Minimum: 1 ingredient to proceed. No maximum.

**Escape hatches:**
- ← Back → Screen 1B (data preserved)

### 4.3 Screen 3B: Recipe Assembly

**Purpose:** Define how much of each ingredient goes into one batch and how many units the batch yields.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back                              ● ● ● ○  Step 3/4  │
│                                                          │
│  Ghost Pepper Hot Sauce — Recipe                         │
│                                                          │
│  How many units does one batch make?                     │
│  [ 24 ] [ bottles ▼ ]                                   │
│                                                          │
│  How much of each ingredient per batch?                  │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Ghost peppers       [ 2 ] [ lb ▼ ]                  ││
│  │                                                      ││
│  │ 💡 $9.00/lb × 2 lb → $18.00 per batch               ││
│  │    → $18.00 ÷ 24 bottles → $0.75 per bottle          ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ White vinegar       [ 64 ] [ fl oz ▼ ]              ││
│  │                                                      ││
│  │ 💡 $4.00/gal → $0.03/fl oz × 64 fl oz → $2.00       ││
│  │    → $2.00 ÷ 24 bottles → $0.08 per bottle           ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ... (one card per ingredient)                           │
│                                                          │
│                                       [Next →]          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Fields per ingredient:**
- **Recipe quantity:** Numeric input
- **Recipe unit:** Dropdown (may differ from bulk unit — triggers unit conversion)

**Batch yield fields:**
- **Yield quantity:** Numeric (e.g., 24)
- **Yield unit:** Dropdown (bottles, jars, bags, units, cans, each)

**Full Derivation Chain (now complete):**

With recipe quantities available, the derivation chain now shows the full path from purchase price to per-unit cost:

```
$9.00/lb × 2 lb → $18.00 per batch
  → $18.00 ÷ 24 bottles → $0.75 per bottle
```

When the recipe unit differs from the bulk unit (e.g., buy gallons, recipe uses fl oz):

```
$4.00/gal → $0.03/fl oz × 64 fl oz → $2.00 per batch
  → $2.00 ÷ 24 bottles → $0.08 per bottle
```

**Validation:**
- All recipe quantities must be > 0
- Batch yield must be > 0
- Unit conversion must be resolvable (e.g., cannot convert lb to gallons without density data — show warning)

### 4.4 Screen 4B: Product Summary

Identical to Screen 4A (see Section 3.4). All data fields are the same; the only difference is where the data originated.

---

## 5. Path C — AI Chat (Natural Language)

### 5.1 Screen 1C: Chat Interface

**Purpose:** Let the user describe their recipe in natural language. Claude extracts structured data in real time.

```
┌──────────────────────────────────────────────────────────┐
│  ← Back                              ● ○ ○ ○  Step 1/4  │
│                                                          │
│  Tell us about your product                              │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │                                                      ││
│  │  Try something like:                                 ││
│  │                                                      ││
│  │  ┌────────────────────────────────────────────────┐  ││
│  │  │ "I make a 12 oz hot sauce with vinegar,        │  ││
│  │  │  peppers, garlic, and salt"                     │  ││
│  │  └────────────────────────────────────────────────┘  ││
│  │                                                      ││
│  │  ┌────────────────────────────────────────────────┐  ││
│  │  │ "My ghost pepper sauce uses 2 lbs of peppers   │  ││
│  │  │  per 24-bottle batch"                           │  ││
│  │  └────────────────────────────────────────────────┘  ││
│  │                                                      ││
│  │                                                      ││
│  │                                                      ││
│  │                                                      ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────┐ [Send] │
│  │ Type your recipe description...              │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  Rather type it in? [Edit as form →]                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Suggested Starter Prompts:**

Displayed as clickable chips above the input field:

1. "I make a 12 oz hot sauce with vinegar, peppers, garlic, and salt"
2. "My ghost pepper sauce uses 2 lbs of peppers per 24-bottle batch"

Clicking a chip populates the input field (user can edit before sending).

**Chat behavior:**
- Single-turn or multi-turn — Claude asks clarifying questions if needed
- After each user message, Claude attempts to extract: product name, product type, ingredient names, quantities, units
- Extracted data populates the Ingredient Staging Panel (Screen 2C) in real time

**Claude system prompt goals:**
- Extract structured ingredient data from natural language
- Ask for missing quantities/units if the user only names ingredients
- Confirm batch yield if mentioned
- Never hallucinate ingredients not mentioned by the user
- Keep responses concise (2–3 sentences max)

**Escape hatches:**
- "Edit as form" → Path B, pre-populated with any data extracted so far
- ← Back → Welcome Screen

### 5.2 Screen 2C: Ingredient Staging Panel

**Purpose:** Show the user what Claude has extracted, in real time, as a structured side panel.

```
┌─────────────────────────────────┬────────────────────────┐
│  Chat                           │  Staging Panel         │
│                                 │                        │
│  User: I make a habanero        │  Extracted so far:     │
│  hot sauce. Recipe is 2 lbs     │                        │
│  habaneros, 1 gallon vinegar,   │  Product: Habanero     │
│  0.5 lb garlic, 4 oz salt.     │    Hot Sauce           │
│  Makes 24 bottles.              │  Type: Sauce           │
│                                 │  Yield: 24 bottles     │
│  Lotmonster: Got it! I found    │                        │
│  4 ingredients for your         │  ┌────────┬─────┬────┐│
│  Habanero Hot Sauce:            │  │ Name   │ Qty │Unit││
│  • 2 lb habaneros               │  ├────────┼─────┼────┤│
│  • 1 gal vinegar                │  │Habanero│ 2   │ lb ││
│  • 0.5 lb garlic                │  │Vinegar │ 1   │ gal││
│  • 4 oz salt                    │  │Garlic  │ 0.5 │ lb ││
│                                 │  │Salt    │ 4   │ oz ││
│  Ready to set prices for        │  └────────┴─────┴────┘│
│  these? Or tell me about        │                        │
│  more ingredients.              │  [Edit as form →]      │
│                                 │  [Set prices →]        │
│                                 │                        │
│  ┌──────────────────────┐[Send] │                        │
│  │ Type here...         │       │                        │
│  └──────────────────────┘       │                        │
└─────────────────────────────────┴────────────────────────┘
```

**Staging Panel behavior:**

- Appears after Claude extracts at least one ingredient
- Updates in real time as new messages are processed
- Each row is editable (click to inline-edit name, quantity, unit)
- Rows can be deleted or added manually
- Panel shows: Product name, Product type, Batch yield (if mentioned), Ingredient table

**Desktop:** Side panel (right 33% of screen)  
**Mobile:** Collapsible bottom sheet with badge showing ingredient count

**Progression:**
- "Set prices" button appears once ≥1 ingredient is staged
- Clicking "Set prices" → Screen 3C

### 5.3 Screen 3C: Pricing Step

Identical to Screen 3A (Bulk Pricing Entry), pre-populated with ingredients from the staging panel. The same derivation chain display, the same validation rules.

**One addition:** A persistent "Edit as form" link that converts all staged data to Path B, Screen 3B.

### 5.4 Screen 4C: Product Summary

Identical to Screen 4A (see Section 3.4). All data fields are the same.

**Escape hatch:** "Edit as form" button is still available — converts to Path B, Screen 4B with all data intact.

---

## 6. Shared Components

### 6.1 Unit Conversion Engine

The conversion engine handles mismatches between the unit an ingredient is purchased in and the unit used in the recipe.

**Supported conversions:**

| From | To | Factor |
|------|----|--------|
| lb | oz | × 16 |
| kg | g | × 1000 |
| gallon | fl oz | × 128 |
| gallon | liter | × 3.785 |
| liter | ml | × 1000 |
| gallon | quart | × 4 |
| gallon | pint | × 8 |
| gallon | cup | × 16 |
| lb | kg | × 0.4536 |

**Weight-to-volume:** Not supported by default. If a user buys garlic by the pound but measures it in tablespoons, the system surfaces a warning:

```
⚠️ We can't automatically convert between weight (lb) and volume (tbsp).
Please enter the recipe quantity in the same unit type as the purchase unit,
or adjust the purchase unit.
```

**Future:** Density table for common CPG ingredients (e.g., 1 gallon of honey = 12 lb) can be added as a Phase 2 enhancement.

### 6.2 Zero Cost Guard

**Rule:** A product cannot be saved if any ingredient has a calculated cost of $0.00.

**Implementation:**

1. The "Save & Continue" button on all Product Summary screens (4A, 4B, 4C) is disabled if any ingredient row has a $0.00 line cost.
2. The offending row(s) are highlighted in red with the message: "This ingredient needs a price. Enter what you pay for it."
3. Clicking the highlighted row scrolls/navigates to the pricing step for that ingredient.

**Edge case:** If a user intentionally has a zero-cost ingredient (e.g., water from the tap), they must enter a nominal price ($0.01) or the system provides a "Mark as free" toggle (Phase 2 consideration).

### 6.3 Lot Number Prompt

**Trigger:** Immediately after the first product is saved (before Dashboard First View renders).

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Your first product is saved! 🎉                        │
│                                                          │
│  Want to assign a lot number to your first               │
│  production run?                                         │
│                                                          │
│  Lot #: [ 2025-001             ]                        │
│  Date:  [ July 15, 2025        ]                        │
│                                                          │
│  [Skip for now]                   [Create lot →]        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Behavior:**
- Optional — "Skip for now" is equally prominent
- Pre-fills a suggested lot format: `YYYY-001`
- Creates the first lot record in Supabase linked to the saved product
- If skipped, the user can create lots from the Dashboard later

### 6.4 Progress Indicator

A step dot indicator appears at the top of every screen in all three paths.

```
● ● ○ ○   Step 2 of 4
```

**Rules:**
- Filled dots = completed or current step
- Empty dots = upcoming steps
- Clicking a completed dot navigates back to that step (data preserved)
- Always shows "Step X of Y" as text for accessibility
- Path A, B, C all have 4 steps

### 6.5 Persistent Back Button

Every screen (except the Welcome Screen) has a ← Back button in the top-left corner.

**Behavior:**
- Navigates to the previous screen in the current path
- All data entered on the current screen is preserved in local state
- From Screen 1 of any path, ← Back returns to the Welcome Screen
- No "Are you sure?" confirmation (data is preserved, not lost)

---

## 7. Post-Onboarding: Dashboard First View

### 7.1 Success State

Immediately after "Save & Continue" on any Product Summary screen:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │                                                      ││
│  │              ✨ Your first product is live ✨         ││
│  │                                                      ││
│  │         Habanero Hot Sauce — $0.40/bottle             ││
│  │                                                      ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  NAV (appears for the first time)                  │  │
│  │  Dashboard | Products | Ingredients | Production   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────┐ ┌──────────────┐ ┌─────────────────────┐  │
│  │ Products │ │ Est. COGS    │ │ Inventory            │  │
│  │          │ │              │ │                      │  │
│  │    1     │ │  $0.40/unit  │ │  0 units             │  │
│  │          │ │              │ │  ⚠️ Start a          │  │
│  │          │ │              │ │  production run?     │  │
│  └──────────┘ └──────────────┘ └─────────────────────┘  │
│                                                          │
│  Recent Products                                         │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Habanero Hot Sauce  │  $0.40/unit  │  24 per batch  ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [+ Add another product]                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 7.2 Confetti Moment

- Brief (1.5s) confetti animation on success state
- Respects `prefers-reduced-motion` — disables animation if set
- Non-blocking — user can interact immediately

### 7.3 Dashboard Content (First View)

| Element | Content | Purpose |
|---------|---------|---------|
| Product count card | "1" | Shows progress |
| Estimated COGS card | "$X.XX/unit" | Immediate value — the number they came for |
| Inventory card | "0 units" + "Start a production run?" CTA | Guides next action |
| Recent Products list | The just-created product | Confirms save succeeded |
| "+ Add another product" | Button | Secondary CTA for multi-product users |

### 7.4 Persistent Navigation

The main navigation bar appears for the first time after onboarding completes. It was intentionally hidden during onboarding to reduce cognitive load.

**Nav items:**
- Dashboard
- Products
- Ingredients
- Production Runs

---

## 8. Error States & Edge Cases

### 8.1 File-Related Errors (Path A)

| Error | Trigger | Response |
|-------|---------|----------|
| Unsupported file type | User uploads `.doc`, `.txt`, etc. | Inline error: "We support CSV, Excel, PDF, and image files. [Try another file] or [Enter manually →]" |
| File too large | File > 10 MB | Inline error: "File is too large (max 10 MB). Try a smaller file or [Enter manually →]" |
| Parse returns 0 ingredients | Deterministic + Claude both fail | Full-screen message: "We couldn't find any ingredients in this file. This sometimes happens with unusual formatting. [Enter manually instead →]" |
| Partial parse | Some rows parsed, some failed | Show parsed rows + "We found X ingredients but may have missed some. [Add missing ingredients] below." |
| Corrupt/unreadable file | File cannot be opened | Inline error: "This file appears to be damaged. [Try another file] or [Enter manually →]" |

### 8.2 AI-Related Errors (Path C)

| Error | Trigger | Response |
|-------|---------|----------|
| Claude API timeout | Response takes > 15s | "Our AI assistant is taking a while. [Keep waiting] or [Switch to manual entry →]" (auto-switches after 30s) |
| Claude API error | 5xx response | "Our AI assistant is temporarily unavailable. [Enter your recipe manually →]" + pre-populate Path B with any data extracted before the error |
| Rate limit | Too many requests | Queue the message and show "Processing..." (transparent to user) |
| Nonsensical input | User types gibberish | Claude responds conversationally: "I didn't quite catch that. Could you describe what ingredients are in your product?" |

### 8.3 Data Validation Errors

| Error | Trigger | Response |
|-------|---------|----------|
| Duplicate ingredient name | User adds "salt" twice | Highlight both rows: "You have two ingredients named 'Salt'. [Merge them] or [Rename one]" |
| Missing required field | Blank product name, missing quantity | Inline field-level error: "This field is required" |
| Invalid numeric input | Letters in quantity fields | Inline error: "Enter a number" |
| Incompatible unit conversion | Weight → volume without density | Warning: "We can't convert between lb and fl oz automatically. Please use the same unit type." |
| Batch yield = 0 | User enters 0 for yield | Inline error: "Batch yield must be at least 1" |

### 8.4 Network Errors

| Error | Trigger | Response |
|-------|---------|----------|
| Save fails | Supabase write error | Toast: "Couldn't save your product. Your data is safe — [Try again]" (data preserved in local state) |
| Connection lost | Offline detected | Banner: "You're offline. Your progress is saved locally and will sync when you reconnect." |

---

## 9. Accessibility & Mobile

### 9.1 WCAG AA Compliance

| Requirement | Implementation |
|-------------|---------------|
| Color contrast | 4.5:1 for body text, 3:1 for large text (18px+). Tested against navy/teal palette. |
| Color independence | No information conveyed by color alone. All status indicators have text labels + icons. Parse badges use icons (✅, ⚠️, ❌) in addition to color. |
| Keyboard navigation | Full tab order through all interactive elements. Enter to activate. Escape to close modals. Arrow keys for dropdown navigation. |
| Screen reader support | All inputs have visible labels. All images/icons have alt text. Progress indicator has aria-label. Live regions for derivation chain updates. |
| Focus management | Focus moves to the first interactive element on each new screen. After inline edits, focus returns to the edited element. |
| Motion | Confetti animation respects `prefers-reduced-motion`. No auto-playing animations. |

### 9.2 Mobile Layout

All three paths work on mobile viewports (320px minimum width).

**Key mobile adaptations:**

| Component | Desktop | Mobile |
|-----------|---------|--------|
| Welcome Screen cards | 3 columns | Single column, stacked vertically |
| Parse preview table | Full table | Card-based layout (one card per ingredient) |
| Chat + Staging Panel | Side-by-side (67/33) | Chat full-width; Staging Panel as bottom sheet |
| Pricing cards | Wide cards | Full-width cards, stacked |
| Product Summary table | Full table | Scrollable table or card-based |
| Drag-drop zone | Full-screen overlay | Tap-to-upload only (no drag-drop on mobile) |

**Touch-friendly requirements:**
- Minimum tap target: 44×44px
- Input fields: minimum height 48px
- Spacing between interactive elements: minimum 8px
- Dropdowns: native `<select>` on mobile for better UX

### 9.3 Camera Upload (Mobile)

On mobile, the file upload input includes a camera option:

```html
<input type="file" accept=".csv,.xlsx,.pdf,image/*" capture="environment" />
```

**Flow:**
1. User taps "Upload your recipe"
2. Mobile OS presents options: Camera, Photo Library, Files
3. If user takes a photo of a handwritten recipe → file is sent to Claude Vision for parsing
4. Flow continues as normal through Screen 2A (Parse Preview)

---

## 10. Success Metrics

### 10.1 Primary Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Onboarding completion rate | > 65% | Users who reach Dashboard First View ÷ Users who see Welcome Screen |
| Time to first product | < 7 minutes | Timestamp of first "Save & Continue" − Timestamp of Welcome Screen load |
| Upload parse accuracy | > 85% on first attempt | Ingredients correctly parsed ÷ Total ingredients in file (measured via user edits on Screen 2A) |
| Zero-cost products | 0 | Count of saved products where any ingredient has $0.00 unit cost |

### 10.2 Secondary Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Path distribution | Roughly even split (no path < 15%) | Count of users starting each path |
| Escape hatch usage | < 20% of sessions | Count of path switches ÷ Total sessions |
| Drop-off by screen | No single screen > 25% drop-off | Funnel analysis per screen |
| Lot number adoption | > 30% create a lot on first prompt | Users who click "Create lot" ÷ Users who see the prompt |
| Parse edit rate | < 30% of rows edited | Rows edited on Screen 2A ÷ Total rows parsed |

### 10.3 Instrumentation Plan

**Events to track:**

| Event | Properties |
|-------|------------|
| `onboarding_started` | `user_id`, `timestamp` |
| `path_selected` | `user_id`, `path` (A/B/C), `method` (click/drag-drop) |
| `file_uploaded` | `user_id`, `file_type`, `file_size_bytes` |
| `parse_completed` | `user_id`, `method` (deterministic/claude), `ingredient_count`, `confidence` |
| `parse_edited` | `user_id`, `field` (name/qty/unit), `row_index` |
| `ingredient_added` | `user_id`, `path`, `ingredient_count` |
| `pricing_entered` | `user_id`, `ingredient_name`, `bulk_unit`, `bulk_qty`, `bulk_price` |
| `path_switched` | `user_id`, `from_path`, `to_path`, `from_screen` |
| `product_saved` | `user_id`, `path`, `ingredient_count`, `total_cost`, `time_elapsed_sec` |
| `lot_created` | `user_id`, `lot_number` |
| `lot_skipped` | `user_id` |
| `onboarding_completed` | `user_id`, `path`, `time_elapsed_sec` |

---

## 11. Open Design Questions

### 11.1 Bob Flag: Deterministic-First vs. Claude-First for File Parsing

**Current spec:** Deterministic regex parsing runs first. If it extracts ≥ 1 ingredient with high confidence, Claude is not invoked. Claude Vision is used only as a fallback for image-based PDFs, photos, and files where deterministic parsing returns 0 results.

**Alternative (Claude-first):** Run Claude on every uploaded file. Potentially higher accuracy on messy files, but adds latency (2–5s) and API cost to every upload.

**Decision needed:** Stick with deterministic-first, or switch to Claude-first with deterministic as a fast-path optimization?

**Factors:**
- Cost: Claude Vision is ~$0.01–0.03 per image. At scale, adds up.
- Speed: Deterministic parse is < 200ms. Claude adds 2–5s.
- Accuracy: For well-structured CSVs, deterministic is 100% accurate. For messy files, Claude is better.
- User trust: Showing "Parsed with high confidence" (no AI) may increase trust for some users.

### 11.2 Bob Flag: Bulk Price Storage — Package vs. Unit Cost

**Current spec:** The system stores the full bulk package as the source of truth (`25 lb bag for $12.50`) and derives unit cost at runtime.

**Alternative:** Store only the derived unit cost (`$0.50/lb`) and discard the bulk package data.

**Decision needed:** Which is the source of truth in the database?

**Arguments for storing bulk package:**
- User can update the price when their supplier changes pricing
- Audit trail: "Why does Lotmonster say my peppers cost $1.28/lb?" → "Because you said you buy a 25 lb bag for $32."
- Re-derivation: if conversion logic is updated, costs can be recalculated from source

**Arguments for storing unit cost only:**
- Simpler data model
- Users who buy from multiple suppliers at different quantities may find package-based pricing confusing

**Recommendation:** Store both. Bulk package is the user-facing source of truth; unit cost is a computed/cached field.

### 11.3 Ray Flag: Multi-Recipe File Upload

**Scenario:** A user uploads a spreadsheet containing 5 different recipes (e.g., one tab per recipe, or multiple recipe blocks in a single sheet).

**Current spec:** Does not address this. The upload flow assumes one recipe per file.

**Options:**

**Option A — First recipe only:** Parse the first detected recipe, ignore the rest. Show a notice: "We found multiple recipes in this file. We'll start with the first one — you can add the others after."

**Option B — Recipe picker:** After parsing, show a list of detected recipes and let the user choose which one to onboard first. Others are saved as drafts.

**Option C — Bulk import (all at once):** Parse all recipes and create all products in one flow. Pricing step handles all ingredients across all recipes.

**Recommendation:** Option B for v3 (recipe picker). Option C is a Phase 2 feature — the onboarding flow is designed for a single product, and forcing 5 products through it at once would exceed the 7-minute target.

---

## 12. Appendix: Technical Notes

### 12.1 State Management

All onboarding state is held in a client-side store (React Context or Zustand) with the following shape:

```typescript
interface OnboardingState {
  currentPath: 'A' | 'B' | 'C' | null;
  currentStep: number;
  
  // Product
  productName: string;
  productType: 'sauce' | 'beverage' | 'baked_good' | 'other' | null;
  batchYield: number | null;
  yieldUnit: string;
  
  // Ingredients
  ingredients: Ingredient[];
  
  // Path A specific
  uploadedFile: File | null;
  parseMethod: 'deterministic' | 'claude_vision' | null;
  parseConfidence: 'high' | 'low' | null;
  
  // Path C specific
  chatMessages: ChatMessage[];
}

interface Ingredient {
  id: string;
  name: string;
  bulkUnit: string;
  bulkQuantity: number | null;
  bulkPrice: number | null;
  recipeQuantity: number | null;
  recipeUnit: string;
  unitCost: number | null;      // computed
  lineCost: number | null;      // computed
  source: 'parsed' | 'manual' | 'chat';
}
```

**Persistence:** State is saved to `localStorage` on every change. If the user refreshes or navigates away, they can resume from where they left off. State is cleared on successful product save.

### 12.2 Supabase Schema (Relevant Tables)

```sql
-- Products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('sauce', 'beverage', 'baked_good', 'other')),
  batch_yield INTEGER NOT NULL,
  yield_unit TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  onboarding_path TEXT CHECK (onboarding_path IN ('A', 'B', 'C'))
);

-- Ingredients table (bulk purchase data)
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  bulk_unit TEXT NOT NULL,
  bulk_quantity NUMERIC NOT NULL,
  bulk_price NUMERIC NOT NULL,
  unit_cost NUMERIC GENERATED ALWAYS AS (bulk_price / bulk_quantity) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Recipe ingredients (junction table)
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  ingredient_id UUID REFERENCES ingredients(id),
  recipe_quantity NUMERIC NOT NULL,
  recipe_unit TEXT NOT NULL,
  line_cost NUMERIC NOT NULL,  -- computed at write time
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lots table
CREATE TABLE lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  lot_number TEXT NOT NULL,
  production_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 12.3 Claude API Integration (Path C)

**Model:** `claude-sonnet-4-20250514` (or latest Sonnet)

**System prompt (onboarding chat):**

```
You are Lotmonster's recipe assistant. Your job is to help a small food/beverage 
manufacturer describe their product recipe so we can calculate ingredient costs.

Extract from the user's messages:
- Product name
- Product type (sauce, beverage, baked good, other)
- Ingredient names
- Ingredient quantities and units
- Batch yield (how many units per batch)

Rules:
- Never invent ingredients the user didn't mention
- If quantities are missing, ask for them
- Keep responses to 2-3 sentences
- Use a friendly, casual tone
- If the user seems confused, suggest they can switch to manual entry

Output extracted data as structured JSON in a tool_use block for the frontend to parse.
```

**Claude Vision (Path A fallback):**

```
Analyze this image of a recipe. Extract:
1. All ingredient names
2. Quantities for each ingredient
3. Units for each quantity
4. Recipe name (if visible)
5. Batch yield (if visible)

Return as JSON. If a field is unclear, set it to null rather than guessing.
```

### 12.4 Parse Pipeline (Path A)

```
File uploaded
    │
    ▼
Detect file type
    │
    ├─── CSV/XLSX ──────────────────────────────────────┐
    │                                                    │
    │    1. Read file with PapaParse (CSV) or SheetJS    │
    │    2. Detect header row (fuzzy match:              │
    │       "ingredient", "name", "qty", "amount", etc.) │
    │    3. Extract rows as {name, quantity, unit}        │
    │    4. Regex cleanup (strip whitespace, normalize    │
    │       units: "lbs" → "lb", "ounces" → "oz")       │
    │    5. Return results + confidence: "high"          │
    │                                                    │
    ├─── PDF (text-based) ──────────────────────────────┐
    │                                                    │
    │    1. Extract text with pdf.js                     │
    │    2. Regex: find lines matching                   │
    │       [quantity] [unit] [ingredient] patterns      │
    │    3. Return results + confidence: "high"          │
    │                                                    │
    ├─── PDF (scanned) / Image ─────────────────────────┐
    │                                                    │
    │    1. Send to Claude Vision                        │
    │    2. Parse structured JSON response               │
    │    3. Return results + confidence: "low"           │
    │                                                    │
    └─── Unknown / Parse failure ──────────────────────→ │
         Return 0 ingredients → redirect to Path B       │
```

### 12.5 Unit Conversion Implementation

```typescript
const CONVERSIONS: Record<string, Record<string, number>> = {
  // Weight
  lb:     { oz: 16, g: 453.592, kg: 0.4536 },
  kg:     { g: 1000, lb: 2.2046, oz: 35.274 },
  oz:     { g: 28.3495, lb: 0.0625, kg: 0.02835 },
  g:      { oz: 0.03527, lb: 0.002205, kg: 0.001 },
  
  // Volume
  gallon: { fl_oz: 128, liter: 3.785, quart: 4, pint: 8, cup: 16, ml: 3785 },
  liter:  { ml: 1000, gallon: 0.2642, fl_oz: 33.814, quart: 1.057 },
  fl_oz:  { ml: 29.5735, gallon: 0.00781, liter: 0.02957, cup: 0.125 },
  quart:  { gallon: 0.25, liter: 0.9464, fl_oz: 32, cup: 4, pint: 2 },
  cup:    { fl_oz: 8, ml: 236.588, gallon: 0.0625, liter: 0.2366 },
};

function convertUnit(
  value: number, 
  fromUnit: string, 
  toUnit: string
): number | null {
  if (fromUnit === toUnit) return value;
  const factor = CONVERSIONS[fromUnit]?.[toUnit];
  if (!factor) return null; // incompatible units
  return value * factor;
}
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1 | — | Initial onboarding concept (Stackline branding) |
| v2 | — | Three-path architecture, 28 pages (Stackline branding) |
| v3 | July 2025 | Rebrand to Lotmonster. Added: derivation chain spec, zero cost guard, lot number prompt, error states, accessibility section, mobile adaptations, camera upload, instrumentation plan, technical appendix. Refined: escape hatch network, parse pipeline, staging panel behavior. |

---

*Document prepared for Lotmonster — lotmonster.co*  
*Stack: Next.js App Router · Supabase · Anthropic Claude API*
