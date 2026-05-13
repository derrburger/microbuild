# MicroBuild

A marketplace for focused, affordable web tools built for local service businesses — quote funnels, booking pages, review boosters, trust pages, and package selectors. Businesses request a build, a vetted creator delivers it in days.

**Status:** Early Access MVP — live Supabase backend, guest form submissions, admin dashboard.

---

## What is MicroBuild?

Local service businesses (pool cleaners, detailers, painters, landscapers, etc.) need specific web tools to convert leads, collect reviews, and present their work. Building these from scratch takes too long and costs too much.

MicroBuild solves this by offering five standardized "MicroBuilds" — small, focused tools that solve one revenue problem each. Buyers browse listings, submit a request, and a creator delivers a working build in days.

### The Five MicroBuilds

| Type | What it does |
|------|-------------|
| Quote Funnel | Captures leads by delivering an instant price estimate |
| Package Selector | Lets customers self-select and book a service tier |
| Review Booster | Routes happy customers to Google; unhappy customers to private feedback |
| Trust Page | Before/after gallery with testimonials and a strong CTA |
| Booking Page | Focused single-goal booking experience |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Routing | React Router v6 |
| Database | Supabase (PostgreSQL) |
| Auth | Not yet implemented (Phase 2) |
| Payments | Not yet implemented (Phase 4) |
| AI | Not yet implemented (Phase 3) |
| Deployment | Hostinger (planned) |

---

## Project Structure

```
src/
  components/    # Navbar, Footer, MicroBuildCard, StatusBadge, CTASection, Layout
  data/          # mockListings.ts (fallback data), templateDetails.ts (extended static detail)
  lib/           # supabase.ts (client + typed insert helpers), templates.ts (fetch service), buildPacket.ts (packet generator)
  pages/         # One file per route
  types/         # index.ts (frontend types), database.ts (Supabase schema types)
supabase/
  schema.sql     # DDL — all tables, indexes, triggers
  seed.sql       # DML — categories and template listings
  policies.sql   # RLS — access policies
docs/
  database-schema.md
  mvp-roadmap.md
  ai-build-packet-structure.md
```

---

## Local Setup

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)

### 1. Clone and install

```bash
git clone <repo-url>
cd MicroBuild
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your Supabase project values:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Find these in your Supabase Dashboard → Settings → API.

> Note: The app runs with mock data if these are not set — no crashes, just sample listings.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Supabase Setup

Run these three SQL files **in order** in your Supabase Dashboard → SQL Editor:

### Step 1 — Schema (`supabase/schema.sql`)

Creates all 11 tables, indexes, and the `updated_at` trigger. Safe to run on a fresh project.

```sql
-- Paste contents of supabase/schema.sql and run
```

### Step 2 — Seed data (`supabase/seed.sql`)

Inserts the 5 MicroBuild categories and 5 template listings. Uses `ON CONFLICT DO NOTHING` so it is safe to run multiple times.

```sql
-- Paste contents of supabase/seed.sql and run
```

### Step 3 — RLS Policies (`supabase/policies.sql`)

Enables Row Level Security and creates the minimum access policies needed for the frontend to work without auth:

- Public `SELECT` on categories and active templates
- Public `INSERT` on `buyer_requests` and `creator_applications`
- Owner `INSERT` / `SELECT` on `business_profiles` (Phase 2, requires auth)

The file also includes commented-out "dev admin read" policies. Uncomment these to make the `/admin` page show real buyer requests and applications.

```sql
-- Paste contents of supabase/policies.sql and run
-- To also enable /admin reads, uncomment the two policy blocks near the bottom
```

> **Order matters.** Schema must exist before seed runs; seed data must exist before some policies make sense. `policies.sql` is idempotent — it uses `DROP POLICY IF EXISTS` before each `CREATE POLICY`.

---

## MVP Features

### Public pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/browse` | Browse all 5 MicroBuild templates with category filter and search |
| `/builds/:slug` | Template detail page with customer flow, FAQ, best fit industries |
| `/request` | Buyer request form — inserts into `buyer_requests` |
| `/creators/apply` | Creator application form — inserts into `creator_applications` |
| `/how-it-works` | Process explanation |
| `/pricing` | Three pricing tiers |
| `/case-studies` | Demo scenario examples |

### Admin (internal only)

| Route | Description |
|-------|-------------|
| `/admin` | Dashboard showing live data from Supabase — buyer requests, creator applications, active templates |

> ⚠️ The `/admin` route has no authentication. Apply the dev admin read policies and use this URL internally only until Phase 2 adds auth.

### Data behavior

- **Browse and Build Detail:** Fetches from Supabase with a silent fallback to mock data if Supabase is unavailable or RLS blocks the query.
- **Forms:** Insert directly into Supabase. Full error logging in the browser console — error code `42501` means an RLS policy is missing.
- **Build Packet Preview:** After submitting a request, a deterministic packet preview is generated from form data (no AI API calls).

---

## Roadmap

### Phase 1 — Current (MVP)
- [x] All 9 public pages
- [x] Supabase connected (templates, buyer requests, creator applications)
- [x] RLS policies for public reads and anonymous inserts
- [x] Admin dashboard with live data
- [x] Deterministic build packet preview

### Phase 2 — Auth + Admin Operations
- [ ] Supabase Auth (email/password or magic link)
- [ ] Admin role check on `/admin`
- [ ] Buyers can view their own request status
- [ ] Admins can update request status
- [ ] Creator profiles created from approved applications

### Phase 3 — Build Packets + AI
- [ ] Supabase Edge Function: `generate-build-packet`
- [ ] GPT-4o generates structured brief from buyer request
- [ ] Stored in `build_packets` table
- [ ] Admin triggers generation; creator views it in their dashboard

### Phase 4 — Payments
- [ ] Stripe Checkout
- [ ] Payment link generated per accepted request
- [ ] Webhook handler updates `orders.status`
- [ ] Creator payout via Stripe Connect

---

## Development Notes

### Build

```bash
npm run build   # TypeScript check + Vite production build
npm run dev     # Development server with HMR
```

### Environment variables

All Vite env vars must be prefixed with `VITE_`. Never commit `.env` — it is in `.gitignore`.

### Database types

`src/types/database.ts` contains hand-authored TypeScript types mirroring the Supabase schema. These can be replaced with auto-generated types once the project is stable:

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
```

### Supabase client

`src/lib/supabase.ts` exports the client plus two typed insert helpers (`insertBuyerRequest`, `insertCreatorApplication`). The client strips any `/rest/v1/` suffix from the URL automatically.

### Mock data fallback

`src/lib/templates.ts` fetches from Supabase and falls back to `src/data/mockListings.ts` if the query fails or returns empty. This lets the app render correctly without a live Supabase connection.
