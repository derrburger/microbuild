# MicroBuild — Database Schema

**Status:** Schema designed and SQL written. Not yet deployed to a Supabase project.
**Source files:** `supabase/schema.sql` (DDL) · `supabase/seed.sql` (initial data)
**TypeScript types:** `src/types/database.ts`

---

## Overview

MicroBuild uses Supabase (PostgreSQL) as its database. The schema is designed around the core marketplace flow:

```
buyer submits request
  → admin creates order + assigns creator
    → creator receives build packet
      → creator delivers MicroBuild
        → buyer approves + leaves review
```

All tables use UUID primary keys (`gen_random_uuid()`). Row-level security (RLS) is enabled on every table but policies are deferred to Phase 1 when Supabase Auth is wired.

---

## Tables

### `users`
**Purpose:** Extends Supabase Auth (`auth.users`) with app-level role data.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK — mirrors `auth.users.id` |
| email | text | Unique |
| role | text | `buyer` \| `creator` \| `admin` (default: `buyer`) |
| created_at | timestamptz | |

**RLS (Phase 1):** Buyers read/update own row. Admins read all.

---

### `business_profiles`
**Purpose:** Optional richer profile for buyers. Not required to submit a request (guest flow is supported).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id |
| business_name | text | |
| industry | text | e.g. "Pool Cleaning" |
| city | text | nullable |
| state | text | nullable |
| website | text | nullable |
| phone | text | nullable |
| created_at / updated_at | timestamptz | |

**RLS (Phase 1):** Users can read/update their own profile only.

---

### `microbuild_categories`
**Purpose:** Reference table for the 5 build types. Seeded at setup, rarely changes.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | e.g. "Quote Funnel" |
| slug | text | Unique URL key |
| description | text | |
| icon | text | Emoji |
| display_order | int | Controls browse order |

**Seeded values:** Quote Funnel · Booking Page · Review Booster · Trust Page · Package Selector

**RLS (Phase 1):** Public readable. Admin-only writes.

---

### `microbuild_templates`
**Purpose:** The marketplace listings shown on `/browse` and `/builds/:slug`. Currently sourced from mock data in `src/data/mockListings.ts`; will migrate to this table in Phase 1.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| title | text | |
| slug | text | Unique — used in URL routing |
| category_id | uuid | FK → microbuild_categories.id |
| target_industry | text | e.g. "Pool Cleaning" |
| main_goal | text | One-line outcome statement |
| starting_price | int | Dollars |
| estimated_turnaround | text | e.g. "3–5 business days" |
| description | text | Long-form listing copy |
| features | text[] | Array of bullet features |
| setup_requirements | text[] | Array of what buyer must provide |
| status | text | `available` \| `popular` \| `new` \| `coming-soon` |
| is_active | boolean | Controls visibility |
| created_at / updated_at | timestamptz | |

**RLS (Phase 1):** Public readable. Admin-only writes.

---

### `buyer_requests`
**Purpose:** Every submission from `/request`. The entry point into the order pipeline. `user_id` is nullable — guest submissions are fully supported.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id (nullable — guest OK) |
| business_profile_id | uuid | FK → business_profiles.id (nullable) |
| template_id | uuid | FK → microbuild_templates.id (nullable — for pre-selected builds) |
| full_name | text | |
| email | text | |
| phone | text | nullable |
| business_name | text | |
| industry | text | |
| website_social | text | nullable — URL or @handle |
| build_type | text | Category name or "Not sure" |
| main_goal | text | What the build should accomplish |
| current_problem | text | What's not working now |
| budget | text | nullable |
| deadline | text | nullable |
| style_notes | text | nullable |
| status | text | `new` → `in-review` → `proposal-sent` → `accepted` / `rejected` |
| created_at / updated_at | timestamptz | |

**RLS (Phase 1):** Buyers read own (matched by email for guests). Admins read/update all.

---

### `creator_profiles`
**Purpose:** Created when an approved `creator_application` becomes an active creator account. One profile per user.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id (unique) |
| full_name | text | |
| bio | text | nullable |
| portfolio_url | text | nullable |
| skills | text[] | |
| available_hours | text | |
| is_active | boolean | |
| rating | numeric(3,2) | 0–5, computed from reviews |
| builds_completed | int | Running count |
| created_at | timestamptz | |

**RLS (Phase 1):** Public read for active profiles. Creator updates own. Admin updates all.

---

### `creator_applications`
**Purpose:** Every submission from `/creators/apply`. Reviewed manually in admin dashboard. Not linked to a user account until approved.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| full_name | text | |
| email | text | |
| tools | text[] | e.g. ["Webflow", "React", "Zapier"] |
| portfolio_url | text | nullable |
| portfolio_url_2 | text | nullable |
| niches | text[] | Industries of interest/experience |
| experience | text | Open-ended |
| available_hours | text | |
| message | text | nullable |
| status | text | `new` → `reviewing` → `approved` / `rejected` |
| created_at | timestamptz | |

**RLS (Phase 1):** Admin-only read/write. No public access.

---

### `orders`
**Purpose:** Created by admin when a buyer request is accepted and a creator is assigned. Ties together the request, creator, build packet, and payment.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| request_id | uuid | FK → buyer_requests.id |
| buyer_id | uuid | FK → users.id |
| creator_id | uuid | FK → creator_profiles.id (nullable until assigned) |
| template_id | uuid | FK → microbuild_templates.id (nullable) |
| build_packet_id | uuid | FK → build_packets.id (nullable until generated) |
| amount_cents | int | Agreed price in cents |
| status | text | `pending` → `in-progress` → `delivered` → `approved` / `disputed` / `refunded` |
| created_at / updated_at | timestamptz | |

**RLS (Phase 1):** Buyers read own orders. Creators read assigned. Admins full access.

---

### `build_packets`
**Purpose:** The structured brief delivered to the creator. Contains everything needed to build the MicroBuild without any back-and-forth. Manually authored in Phase 0–1; AI-generated in Phase 3.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| request_id | uuid | FK → buyer_requests.id |
| order_id | uuid | FK → orders.id (nullable) |
| business_summary | text | |
| recommended_build | text | |
| customer_problem | text | |
| suggested_copy | jsonb | Headlines, CTAs, body copy |
| form_fields | jsonb | Array of step/field definitions |
| design_direction | text | Color, tone, layout guidance |
| automation_needs | text | nullable |
| creator_instructions | text | Step-by-step delivery notes |
| quality_checklist | text[] | What creator must verify before submitting |
| generated_at | timestamptz | |
| generated_by | text | `manual` \| `gpt-4o` \| `gpt-4-turbo` |

**RLS (Phase 1):** Assigned creator reads own packets. Admins read/write all.

---

### `deliverables`
**Purpose:** The completed MicroBuild submitted by the creator for buyer review.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| order_id | uuid | FK → orders.id |
| creator_id | uuid | FK → creator_profiles.id |
| live_url | text | The deployed MicroBuild URL |
| preview_url | text | nullable |
| source_files_url | text | nullable |
| notes | text | nullable — creator notes to buyer |
| submitted_at | timestamptz | |
| approved_at | timestamptz | nullable — set when buyer approves |
| revision_count | int | Default 0 |

**RLS (Phase 1):** Buyer reads deliverables for own orders. Creator reads/updates own submissions. Admin full.

---

### `reviews`
**Purpose:** Buyer rating and comment after approving a deliverable. One review per order (enforced by UNIQUE constraint).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| order_id | uuid | FK → orders.id (unique) |
| buyer_id | uuid | FK → users.id |
| creator_id | uuid | FK → creator_profiles.id |
| rating | int | 1–5 |
| comment | text | nullable |
| is_public | boolean | Default true — controls marketplace visibility |
| created_at | timestamptz | |

**RLS (Phase 1):** Public read for `is_public = true`. Buyers create/update own. Admins full.

---

## Backend Phase Roadmap

### Phase 1 — Connect Data Storage
**Goal:** Replace mock data with live Supabase queries. No payments or auth required yet.

- [ ] Create Supabase project (free tier)
- [ ] Run `supabase/schema.sql` in SQL editor
- [ ] Run `supabase/seed.sql` to populate categories and templates
- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`
- [ ] Update `/browse` page to query `microbuild_templates` via `supabase.from()`
- [ ] Update `/builds/:slug` page to query `microbuild_templates` by slug
- [ ] Store buyer request form submissions in `buyer_requests` table
- [ ] Store creator application form submissions in `creator_applications` table
- [ ] Verify admin dashboard reads from real tables
- [ ] Add basic RLS: buyer_requests and creator_applications admin-only write

**No auth needed** — the anon key is enough for insert-only forms and public template reads.

---

### Phase 2 — Auth + Admin Operations
**Goal:** Real user accounts, protected admin routes, and the full request → order pipeline.

- [ ] Enable Supabase Auth (email/password)
- [ ] Add auth middleware to `/admin` route
- [ ] Admin: update `buyer_requests.status` through the dashboard
- [ ] Admin: approve/reject creator applications → create `creator_profiles`
- [ ] Admin: create `orders` from accepted requests
- [ ] Admin: assign creators to orders
- [ ] Buyer: view own order status (simple dashboard)
- [ ] Creator: view assigned orders and build packets
- [ ] Email notifications via Resend or Supabase edge functions

---

### Phase 3 — Build Packets + AI
**Goal:** Automate the creator brief generation from buyer requests.

- [ ] OpenAI GPT-4o API integration (via Supabase edge function)
- [ ] Edge function: `generate-build-packet` — takes `buyer_request_id`, returns structured JSON
- [ ] Store result in `build_packets` table
- [ ] Admin can trigger generation per request and edit the result
- [ ] Creator views full packet in their order dashboard
- [ ] Quality checklist auto-populated per build type

---

### Phase 4 — Payments
**Goal:** End-to-end paid transactions.

- [ ] Stripe integration (Stripe Checkout to start)
- [ ] Payment link generated when buyer accepts proposal
- [ ] Supabase webhook handler: update `orders.status` on Stripe events
- [ ] Creator payout via Stripe Connect or manual process
- [ ] Receipt emails

---

## Technical Notes

- **Prices stored in dollars** (`starting_price int`) in templates for readability. Orders use `amount_cents` (cents) for precision in billing calculations.
- **Arrays as `text[]`** — features, setup_requirements, tools, niches, quality_checklist. Simple and queryable. Consider JSONB for richer structure if needed later.
- **No custom Postgres ENUM types** — status fields use `text + CHECK` constraints so they can be extended without `ALTER TYPE` migrations.
- **`updated_at` trigger** — applied to `business_profiles`, `microbuild_templates`, `buyer_requests`, and `orders`. Maintained automatically by `handle_updated_at()` function.
- **Circular FK** (`orders.build_packet_id` ↔ `build_packets.order_id`) — resolved by adding the `orders` FK constraint after both tables are created.
- **RLS enabled but no policies yet** — every table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Until policies are added, only the service role key can access the tables. The anon key used by the frontend will need explicit `GRANT` or `SELECT` policies for public tables.
