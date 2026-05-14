# MicroBuild

A marketplace for focused, affordable web tools built for local service businesses — quote funnels, booking pages, review boosters, trust pages, and package selectors. Businesses request a build, a vetted creator delivers it in days.

**Status:** Account Approval Workflow v1 — consistent creator application lifecycle, cascading admin actions, duplicate prevention, real-status creator dashboard. Build passes. Stripe and GitHub OAuth deferred.

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
| Auth | Supabase Auth — email/password sign-up + sign-in. GitHub OAuth deferred until stable domain. |
| Payments | Not yet implemented — Stripe deferred (Phase 4) |
| AI | Rules-based only — `src/lib/profileAI.ts`, `src/lib/buildPacket.ts`. No external APIs. |
| Deployment | Hostinger (planned) |

---

## Project Structure

```
src/
  components/    # Navbar, Footer, MicroBuildCard, StatusBadge, CTASection, Layout, AdminRouteGuard
  data/          # mockListings.ts (fallback data), templateDetails.ts (extended static detail)
  lib/           # supabase.ts (client + typed helpers), templates.ts (fetch), buildPacket.ts (AI-style packets), profiles.ts (profile helpers), admin.ts (auth helpers + email allowlist)
  pages/         # One file per route
  types/         # index.ts (frontend types), database.ts (Supabase schema types)
supabase/
  schema.sql                                  # DDL — all tables, indexes, triggers
  seed.sql                                    # DML — categories and template listings
  policies.sql                                # RLS — access policies
  migrations/
    creator-tier-fields.sql                   # Adds tier columns to creator_applications
    profile-system-foundation.sql             # Expands creator_profiles + business_profiles
    admin-auth-notes.sql                      # Comments only — future RLS hardening guide
    email-account-profile-fields.sql          # Adds github_url, avatar_url to user_profiles
    account-approval-workflow.sql             # Approval workflow v1: auth linking, approval_status, duplicate prevention
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

Edit `.env` and fill in your values:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_EMAILS=you@example.com
```

- **`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`** — found in Supabase Dashboard → Settings → API.
- **`VITE_ADMIN_EMAILS`** — comma-separated list of emails that can sign in to `/admin`. Must match the email(s) you created in Supabase Auth (see Admin Setup below).

> The app renders with mock data if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not set — no crashes, just sample listings.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Supabase Setup

Run these SQL files **in order** in your Supabase Dashboard → SQL Editor:

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/schema.sql` | Creates all tables, indexes, triggers |
| 2 | `supabase/seed.sql` | Inserts categories and 5 template listings |
| 3 | `supabase/policies.sql` | Enables RLS + all access policies |
| 4 | `supabase/migrations/creator-tier-fields.sql` | Adds tier columns to `creator_applications` |
| 5 | `supabase/migrations/profile-system-foundation.sql` | Expands `creator_profiles` and `business_profiles` |
| 6 | `supabase/migrations/account-profile-foundation.sql` | Creates `user_profiles` table, links auth, adds `creator_profiles` v2 columns, RLS policies |
| 7 | `supabase/migrations/email-account-profile-fields.sql` | Adds `github_url` and `avatar_url` to `user_profiles` for email auth accounts |
| 8 | `supabase/migrations/account-approval-workflow.sql` | **Run this.** Fixes status CHECK constraint, adds auth linking columns, approval tracking, duplicate-prevention indexes |

Each file is safe to re-run: migrations use `ADD COLUMN IF NOT EXISTS`, policies use `DROP POLICY IF EXISTS`.

> **Order matters.** Schema must exist before seed; policies file references tables that schema created; migrations must run after schema.

---

## Account Approval Workflow v1

### Creator Application Lifecycle

```
Submit application → new → reviewing → [decision]
                                        ├── active                  (Free tier approved)
                                        ├── approved_pending_payment (Pro/Verified approved, payment pending)
                                        ├── needs_more_info          (admin needs clarification)
                                        ├── rejected                 (not approved)
                                        └── suspended                (account suspended)
```

### Auth Linking
When a logged-in user submits an application, it is linked via:
1. `auth_user_id` (Supabase Auth UUID — primary)
2. `user_profile_id` (user_profiles row — secondary)
3. `email` (text fallback for pre-auth or guest applications)

### Duplicate Prevention
- A unique partial index prevents multiple active (non-rejected/suspended) applications per `auth_user_id`.
- A unique partial index prevents multiple active applications per `lower(email)`.
- A unique partial index prevents duplicate `creator_profiles` per `creator_application_id`.
- A unique partial index prevents duplicate `creator_profiles` per `user_profile_id`.

### Admin Approval Actions
Each application card in `/admin` shows action buttons that **cascade updates** to three tables:

| Action | creator_applications | user_profiles | creator_profiles |
|--------|---------------------|---------------|-----------------|
| Approve Free | status=`active` | creator_application_status=`active` | created with tier=`free`, hidden |
| Approve Pro | status=`approved_pending_payment` | status updated | created with tier=`professional`, subscription=`pending_payment` |
| Approve Verified | status=`approved_pending_payment` | status updated | created with tier=`verified`, verification_status=`pending` |
| Needs More Info | status=`needs_more_info` | status updated | no change |
| Reject | status=`rejected` | status=`rejected` | public_profile_status=`hidden` |
| Suspend | status=`suspended` | status updated | approval_status=`suspended`, hidden |
| Make Profile Public | — | — | public_profile_status=`public` |
| Hide Profile | — | — | public_profile_status=`hidden` |

### Admin AI Operations (rules-based, no external API)
The admin overview panel includes copyable workflow messages:
- Creator approval messages (Free / Pro / Verified)
- Needs-more-info message with reason field
- Rejection message with reason field

### Creator Dashboard Status
The creator dashboard shows real-time application status including:
- No application submitted
- Under review
- Needs more info (with admin reason)
- Approved — payment pending
- Active
- Rejected (with reason)
- Suspended

### Future
- Stripe payment activation for Pro/Verified tiers (Phase 4)
- GitHub OAuth sign-in once stable domain is configured
- Production RLS: replace `USING (true)` policies with auth-based restrictions

---

## MVP Features

### Public pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/browse` | Browse all 5 MicroBuild templates with category filter and search |
| `/builds/:slug` | Template detail page with customer flow, FAQ, best fit industries |
| `/request` | Buyer request form — inserts into `buyer_requests` |
| `/creators` | Creator directory — public profiles only; shows "coming soon" until profiles are activated |
| `/creator/:id` | Individual creator profile — hidden unless `public_profile_status = 'public'` |
| `/creators/apply` | Creator application with tier selection — inserts into `creator_applications` |
| `/how-it-works` | Process explanation |
| `/pricing` | Three pricing tiers |
| `/case-studies` | Demo scenario examples |

### Platform v2 — Account & Dashboard Routes

| Route | Description |
|-------|-------------|
| `/signin` | Email/password sign-in **and** sign-up (tab toggle on same page). |
| `/onboarding` | Role selection (buyer / creator) and basic profile setup. Requires sign-in. |
| `/dashboard` | Creator or buyer dashboard — role-based view based on `user_profiles.account_type`. |
| `/dashboard/profile` | Creator profile editor — edits `creator_profiles` row linked by `user_id`. |
| `/dashboard/analytics` | Analytics page — live request count + placeholder metrics. |
| `/dashboard/settings` | Account settings — display name, GitHub profile URL (plain link), sign out. |

### Supabase Auth Setup (Email/Password)

Email/password auth is built-in to Supabase — no OAuth app registration required.

**For local development — disable email confirmation:**
1. Supabase Dashboard → Authentication → Settings → Email
2. Toggle off **"Enable email confirmations"**
3. Users are signed in immediately after sign-up (no email needed)

**For production — enable email confirmation:**
- Leave "Enable email confirmations" on
- After sign-up, the app shows a "Check your email" screen
- The confirmation link redirects to your site's callback URL

**Add your site URL:**
- Supabase Dashboard → Authentication → URL Configuration
- Site URL: `http://localhost:5173` (dev) or your production URL
- Redirect URLs: add `http://localhost:5173/dashboard`

### GitHub OAuth — Deferred

GitHub sign-in is intentionally **not implemented yet**. It will be added once MicroBuild has a stable production domain. Currently:
- GitHub URL is stored as a **plain text link** on `user_profiles.github_url` and `creator_profiles.github_url`
- Users can add their GitHub URL in Settings or the Profile Editor
- It shows as a clickable link on public creator profiles
- No OAuth flow, no GitHub app registration needed

### Admin (dev-mode, no auth required)

| Route | Description |
|-------|-------------|
| `/admin` | AI Operations Command Center — loads directly, no login required in dev mode |
| `/admin/login` | Deferred placeholder — shows a note that auth is not yet active |

> **Admin auth is intentionally deferred.** The infrastructure files exist (`src/lib/admin.ts`, `src/components/AdminRouteGuard.tsx`) but are not wired into routing. The `AdminRouteGuard` can be reconnected to `App.tsx` in a future auth phase.

> **Do not deploy `/admin` publicly** until Supabase Auth and admin role policies are in place. The temporary dev RLS policies in `supabase/policies.sql` allow anonymous read/write access. See `supabase/migrations/admin-auth-notes.sql` for the full hardening guide.

#### When Admin Auth Is Ready

1. Create a Supabase Auth user (Dashboard → Authentication → Users → Add User).
2. Add their email to `VITE_ADMIN_EMAILS` in `.env`.
3. In `src/App.tsx`, re-wrap the `admin` index route with `<AdminRouteGuard>`.
4. Replace all `USING (true)` dev policies per `supabase/migrations/admin-auth-notes.sql`.

#### Admin Dashboard Features (v2 — Actionable Ops)

- **AI Ops Brief:** Compact panel at the top with today's operational focus, derived from live data: high-priority requests, ready-to-quote count, needs-follow-up count, new applications.
- **Metric cards:** Total requests, new, high-priority, ready-to-quote, needs follow-up, new applications — with color alerts.
- **Buyer request cards:** Each request shows business, industry, build type, budget, deadline, price estimate, lead quality (0–100), priority, fit rating, quote readiness, next action, missing info count, risk flags.
- **Status dropdown (writes to Supabase):** Change buyer request status directly from the card — New / In Review / Proposal Sent / Accepted / Rejected. Uses optimistic update with revert on failure.
- **Filter tabs:** All / New / High Priority / Needs Follow-up / Ready to Quote.
- **AI Operations Panel (7 tabs):** AI Summary (8 signal scores), Missing Info + Risk Flags, Follow-up Questions, Creator Brief, Proposal Draft, Checklists, Automation.
- **Copy buttons:** Copy Packet Summary, Follow-up Questions, Buyer Outreach Message, Creator Brief, Proposal Draft.
- **Save Build Packet (writes to Supabase):** In the Proposal tab, saves the rules-based build packet to the `build_packets` table linked to the buyer request. Shows saved ID on success.
- **Creator Applications:** Action buttons (Mark Reviewed / Approve / Reject / Reset) that write to Supabase. Expandable AI Review panel with candidate fit score, strengths, concerns, missing info, best-fit niches, recommended decision, and Copy Follow-up Message button.
- **MicroBuild Listings:** Clean table with encoding-safe turnaround display.

#### Temporary Dev Policies Warning

`supabase/policies.sql` contains clearly marked `DEVELOPMENT ONLY` policies that allow:
- Anonymous `SELECT` on `buyer_requests` and `creator_applications` (admin reads)
- Anonymous `UPDATE` on `buyer_requests` and `creator_applications` (status updates)
- Anonymous `INSERT` on `build_packets` (save packet action)

**These must be removed or replaced with Supabase Auth + admin role checks before the app is made publicly accessible.** See the policy file for exact comments and Phase 2 instructions.

### Data behavior

- **Browse and Build Detail:** Fetches from Supabase with a silent fallback to mock data if Supabase is unavailable or RLS blocks the query.
- **Forms:** Insert directly into Supabase. Full error logging in the browser console — error code `42501` means an RLS policy is missing.
- **AI-Ready Build Packet System:** After submitting a request, a structured build brief is generated from form data. See below for full details.

---

## Roadmap

### Phase 1 — Current (MVP)
- [x] All 9 public pages
- [x] Supabase connected (templates, buyer requests, creator applications)
- [x] RLS policies for public reads and anonymous inserts
- [x] Admin dashboard with live data + AI Ops Command Center
- [x] Rules-based AI build packet system (no external AI API)
- [x] Admin status updates write back to Supabase (buyer requests + creator applications)
- [x] Creator tier application system (Free, Professional, Verified)
- [x] Approval-before-payment model for paid tiers
- [x] Admin AI review with tier-aware scoring, profile preview, copy messages
- [x] Save Build Packet to Supabase from admin panel

### Phase 2 — Auth + Admin Operations
- [ ] Supabase Auth (email/password or magic link)
- [ ] Admin role check on `/admin` — replace temp dev policies with JWT-scoped RLS
- [ ] Buyers can view their own request status
- [ ] Creator profiles created from approved applications (using `creator_profiles` table)
- [ ] Creator login + dashboard to view assigned project briefs
- [ ] Replace dev anon UPDATE/INSERT policies with service-role key in server-side routes

### Phase 3 — Build Packets + AI
- [ ] Supabase Edge Function: `generate-build-packet` (server-side, no API key in frontend)
- [ ] GPT-4o generates full build brief from buyer request data
- [ ] Stored in `build_packets` table, linked to the buyer request row
- [ ] Admin triggers generation; creator views the brief in their dashboard
- [ ] `GeneratedBuildPacket` interface shape stays the same — only the generator changes

### Phase 4 — Payments
- [ ] Stripe Checkout for buyer project fees
- [ ] Stripe Subscriptions for Professional ($15/mo) and Verified ($25/mo) creator tiers
- [ ] Payment link generated per accepted request; `approved_pending_payment` status triggers subscription activation email
- [ ] Webhook handler updates `creator_applications.status` → `active` after payment
- [ ] Creator payout via Stripe Connect

---

## Creator Profile System

### Profile Visibility Rules

Creator profiles follow strict visibility rules to protect applicants and maintain marketplace quality:

| Stage | `approval_status` | `public_profile_status` | Visible to public? |
|---|---|---|---|
| Application submitted | (not yet created) | — | No |
| Admin creates profile | `draft` | `hidden` | No |
| Approved (Free) | `active` | `hidden` | No — admin must flip to `public` |
| Approved (Pro/Verified, pending payment) | `approved_pending_payment` | `hidden` | No |
| Payment confirmed, admin activates | `active` | `public` | **Yes** |
| Suspended | `suspended` | `hidden` or `paused` | No |

**Rule: Public profiles are only visible when `public_profile_status = 'public'`.** Approved but unpaid or newly approved profiles remain hidden until explicitly activated.

### Approval-Before-Payment Flow

1. Application submitted → `creator_applications.status = 'new'`
2. Admin reviews and sets application to `approved_pending_payment`
3. Admin clicks "Create Creator Profile" in dashboard → inserts into `creator_profiles` with `approval_status = 'approved_pending_payment'` and `public_profile_status = 'hidden'`
4. Subscription instructions sent to creator (Pro/Verified only)
5. On payment confirmation, admin sets `public_profile_status = 'public'` and `approval_status = 'active'`
6. Profile appears in `/creators` directory

Free Creators skip step 4 — admin can activate directly.

### Profile Schema

`creator_profiles` fields (after `profile-system-foundation.sql` migration):

- **Identity:** `display_name`, `full_name`, `slug`, `profile_photo_url`, `bio`
- **Tier:** `tier`, `verification_status`, `approval_status`, `subscription_status`, `public_profile_status`
- **Marketplace:** `tools`, `niches`, `badges`, `portfolio_links`, `credential_links`, `certifications`
- **Proof:** `github_url`, `linkedin_url`, `case_studies`, `education_or_coursework`, `proof_links`
- **Stats:** `completed_builds_count`, `average_rating`
- **Admin:** `admin_notes`, `ai_profile_score`, `ai_profile_summary`

### Profile Helpers (`src/lib/profiles.ts`)

- `normalizeCreatorProfile()` — safe Supabase row → typed profile
- `normalizeCreatorApplicationToProfilePreview()` — generate preview from application
- `buildCreatorProfileInsert()` — create insert payload from application
- `generateCreatorProfileAISummary()` — rule-based profile summary
- `getCreatorBadges()` — compute display badges from tier/stats
- `getCreatorTierLabel()`, `getVerificationLabel()`, `getProfileVisibilityLabel()`

### Public Profile Routes

- `/creators` — creator directory (shows only `public_profile_status = 'public'` rows); shows "coming soon" if empty
- `/creator/:id` — individual profile page; returns "Profile Not Available" if hidden/pending

---

## Creator Tier System

### Overview

MicroBuild uses a three-tier creator system with approval-before-payment:

| Tier | Monthly Price | Requirements | Marketplace Priority |
|---|---|---|---|
| **Free** | $0 | Basic portfolio, tools, niches | Standard |
| **Professional** | $15/mo (after approval) | Strong portfolio, top projects, service capabilities, fulfillment speed | Priority |
| **Verified** | $25/mo (after approval) | Credentials, certifications, GitHub/LinkedIn, case studies with real results | Top-tier |

### Approval Workflow

1. Creator selects tier and submits application via `/creators/apply`
2. Application stored with `status: 'new'` and `tier: 'free' | 'professional' | 'verified'`
3. Admin reviews in dashboard — AI Review panel shows tier-specific scoring, missing info, and suggested decision
4. Admin sets status to one of:
   - `needs_portfolio_review` — request more samples
   - `needs_more_info` — specific clarifications needed
   - `approved_pending_payment` — approved; subscription activation sent (Pro/Verified only)
   - `active` — account is live and eligible for projects
   - `rejected` — not a fit at this time
   - `suspended` — temporarily deactivated
5. Free tier goes directly to `active` on approval; paid tiers require subscription payment first

### Pricing Transparency

- Pricing is shown on the tier selection cards before submission
- Pricing notice shown again at the bottom of the application form
- Applicants are **not charged during application**
- On `approved_pending_payment`, subscription activation instructions are sent separately
- Applicants can decline the subscription at no cost

### Database Schema

The `creator_applications` table includes all tier fields after running `supabase/migrations/add_creator_tiers.sql`:
- `tier`, `requested_plan_price`, `top_projects`, `service_capabilities`, `fulfillment_speed`
- `github_url`, `linkedin_url`, `certifications`, `credential_links`, `case_studies`

The `creator_profiles` table includes tier + subscription fields after the same migration.

**See `supabase/migrations/add_creator_tiers.sql` for the full migration SQL.**

### Admin AI Review (Creator Applications)

For each creator application, the admin dashboard generates:
- **Candidate Fit Score** (0–100) — tier-aware scoring based on tools, niches, portfolio, availability, and tier-specific proof
- **Tier Fit Assessment** — how well evidence matches the claimed tier
- **Suggested Badge** — Free Creator / MicroBuild Pro / Verified Creator ✓
- **Strengths / Concerns / Missing Info** — rule-based flags for review
- **Recommended Decision** — derived from score + tier + evidence completeness
- **Copy-ready messages** — approval message, rejection message, follow-up message

No AI API is called. All analysis is deterministic. Phase 3 may replace this with a Supabase Edge Function call.

⚠️ **Security rule: No AI API keys ever go in the frontend.** All future AI integrations will be server-side only (Supabase Edge Functions).

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

### AI-Ready Build Packet System

`src/lib/buildPacket.ts` generates a structured build brief from a buyer request. **No external AI API is called.** The logic is entirely deterministic and runs in the browser. All UI surfaces label this clearly as *"AI-style operations preview — rules-based MVP version."*

**⚠️ Security rule: No AI API keys ever go in the frontend.** Phase 3 will call GPT-4o from a Supabase Edge Function (server-side only).

The generated `GeneratedBuildPacket` includes:

| Field | Description |
|---|---|
| `businessSummary` | Sentence built from business name, industry, website, budget |
| `targetAudience` | Audience inferred from industry + build type |
| `problem` | Buyer's stated current problem |
| `aiSummary` | One-paragraph admin-facing overview with all signal scores |
| `recommendedBuild` | Build type + template title |
| `whyThisBuildFits` | Why this build type matches the stated goal and problem |
| `suggestedPageSections` | Per-build-type section list |
| `ctaStrategy` | CTA best practices for the build type |
| `suggestedCopyDirection` | Headline/subheadline suggestions from actual form data |
| `designDirection` | Layout and UX direction per build type |
| `formFields` | Recommended form inputs per build type |
| `automationNeeds` | Email/automation needs per build type |
| `creatorInstructions` | Full creator brief from actual submitted fields |
| `suggestedProposalAngle` | 2–3 sentence pitch framing for this specific request |
| `proposalDraft` | Copy-ready email proposal draft for admin to send |
| `qualityChecklist` | QA items specific to the build type |
| `launchChecklist` | Post-delivery launch tasks for the business owner |
| `adminNextAction` | Recommended next step derived from score + urgency |
| `priorityLabel` | High / Medium / Low — derived from score + urgency |
| `fitRating` | Strong / Good / Okay / Weak — derived from score + build type |
| `leadQualityScore` | 0–100 — based on field completeness and specificity |
| `leadQualityLabel` | Strong / Good / Fair / Needs Detail |
| `urgencyRating` | High / Medium / Low / Not specified — from deadline field |
| `complexityRating` | Low / Medium / High — from build type + style notes |
| `revenuePotentialRating` | High / Medium-High / Medium / Low-Medium / Low / Unknown |
| `missingInfoFlags` | List of missing or weak fields that should be followed up |
| `riskFlags` | List of risk signals (low budget, urgent + vague, no build type) |
| `followUpQuestions` | Suggested questions to ask the buyer before scoping |
| `quoteReadiness` | Ready / Nearly Ready / Needs Details / Not Ready — from score + budget |
| `suggestedPriceRange` | Estimated price range from complexity + buyer's stated budget |
| `estimatedFulfillmentDifficulty` | Easy 1–3d / Standard 3–5d / Complex 5–7d from complexity |
| `creatorFitRecommendation` | Which creator profile and tools best match this request |
| `buyerOutreachMessage` | Copy-ready message for following up with the buyer directly |

`generateCreatorReview()` is also exported and generates a `CreatorApplicationReview` from a creator application, including:
- `candidateFitScore` (0–100), `fitLabel` (Strong / Good / Fair / Weak)
- `strengths`, `concerns`, `missingPortfolioInfo`
- `bestFitNiches`, `recommendedDecision`
- `creatorFollowUpMessage` (copy-ready outreach)

**Where it appears:**
- `/admin` AI Ops Brief — top panel summarizing today's operational focus
- `/admin` per-request AI Operations Panel — 7 tabs including new Quote Readiness, Price Range, Fulfillment, Creator Fit Recommendation, and Buyer Outreach Message copy button
- `/admin` per-creator AI Review panel — expandable with full review output and copy buttons
- `/admin` Proposal tab — "Save to Supabase" button that writes to `build_packets` table
- `/request` success state — buyer-safe summary only (goal, build, problem, budget, deadline)

### Admin Ops v2 — Supabase Status Updates

The admin dashboard can now write status updates back to Supabase:

**Buyer requests** — status dropdown per card with 5 states:
- `new` → `in-review` → `proposal-sent` → `accepted` / `rejected`
- Fires `UPDATE buyer_requests SET status = ? WHERE id = ?` via anon key
- Optimistic UI update with revert on failure

**Creator applications** — action buttons per card:
- Mark Reviewed (`reviewing`), Approve (`approved`), Reject (`rejected`), Reset (`new`)
- Fires `UPDATE creator_applications SET status = ? WHERE id = ?` via anon key

**Build packets** — "Save to Supabase" in the Proposal tab:
- Inserts a full rules-based packet into `build_packets` linked to `buyer_request.id`
- Uses `generated_by = 'manual'`; Phase 3 will change this to `'gpt-4o'`

**These all require the dev UPDATE/INSERT policies from `supabase/policies.sql` to be active in your project. They are NOT safe for a public deployment.** See policy file for replacement instructions.

**Phase 3 upgrade path:**
`generateBuildPacket()` on the frontend will be replaced by a Supabase Edge Function call (`/functions/v1/generate-build-packet`) that invokes GPT-4o server-side. The `GeneratedBuildPacket` interface shape stays the same — the UI does not need to change.

### Mock data fallback

`src/lib/templates.ts` fetches from Supabase and falls back to `src/data/mockListings.ts` if the query fails or returns empty. This lets the app render correctly without a live Supabase connection.
