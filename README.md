# MicroBuild

A marketplace for focused, affordable web tools built for local service businesses â€” quote funnels, booking pages, review boosters, trust pages, and package selectors. Businesses request a build, a vetted creator delivers it in days.

**Status:** Marketplace **Buyer Applicant Review + Selection + Central Messaging v2** — **`/messages`** is the primary inbox (conversation list + thread + composer): buyers see applicants + selected-creator/project threads; creators see applications + assigned projects; messages still stored in **`project_messages`** (**request-phase rows** without **`order_id`**, merged with **`order_id`** threads when a project exists). **`Select creator`** still synchronizes **`buyer_requests`** and **`orders`**. Application/workspace launchers deep-link into **`/messages?…`**. Participant **`admin_only`** visibility is filtered client-side; **TEMP DEV RLS remains unsafe** until production policies ship.


### Marketplace Application Foundation v1


| Concept | Detail |
|---------|--------|
| SQL | `supabase/migrations/marketplace-application-foundation.sql` adds `request_applications`, `published_workflows`, `project_messages`; extends `buyer_requests` + `orders`. |
| Role-aware Browse | **`/browse`** — after auth resolves `account_type`, creators browse open marketplace buyer requests (+ Apply), buyers browse **`published_workflows`** plus labelled **Platform starter MicroBuilds**, logged-out sees public templates only. **`/dashboard/browse`** now **redirects** (creators → `/dashboard/applications`, everyone else → `/browse`). Creator dashboard **`Applications`** tab lists their **`request_applications`**. |
| Buyer selection | **My Requests & Applicants** — applicant cards + **Message creator** links to **`/messages`**; **Select** finalizes lineage on **`buyer_requests`** + **`orders`**. |
| Messaging | **`/messages`** + **`src/lib/messages.ts`** + **`src/lib/messageInbox.ts`** — grouped conversations (**order** anchor preferred; application-only before selection), explicit column selects on **`project_messages`**, **`admin_only`** hidden in participant UI. **Signed-out** cannot open inbox; **`account_type === 'admin'`** returns an empty inbox (moderation dashboards later). Refresh-only · no realtime · no uploads. |
| Admin | **`/admin`** pipeline cards show moderation placeholder text; Buyer-selected badge + oversight panels unchanged. Manual assignment remains fallback. Console does **not** expose private **`project_messages`** content in v2. |
| Future | Stripe, production-scoped policies, realtime messaging. |

### Project Workspace Polish v2

| Area | Behavior |
|------|----------|
| Creator workspace | Route **`/dashboard/projects/:orderId`** — **creator** assigned on the order (full tooling) **or buyer** who owns the linked request (overview, brief read-only without copy shortcuts until creator context, **`Open project chat`** → **`/messages`** merges request + order context, **no deliverable form** for buyers). Assigned creator retains project overview, brief with copy helpers, operational checklist, deliverable URLs + revision surfaces, activity list, timeline. |
| Admin deliverable review | Pipeline order cards: buyer/build context, assignment (**Unassigned** when empty), payment + packet placeholders, deliverable status + links + revision blockquote; revision / approve / delivered / completed actions with loading and success/error feedback; copy row includes **creator brief** (loaded from linked/latest packet), checklist, buyer update (packet-aware), completion message, delivery summary, revision request. |
| Buyer project tracking | Eight-stage timeline (request → completed); proposal/payment placeholders; preview/delivery URLs only when policy-safe (delivered/completed + approved deliverable); no internal admin-only notes. |
| Revision workflow | **Request Revision** sets deliverable `revision_needed`, saves `revision_note`, moves order back toward active build (**in_progress** via `adminReviewDeliverable`); creator workspace surfaces feedback; buyers see sanitized messaging. |
| Future | File uploads (Supabase Storage), Stripe payouts, tighter RLS. |

### Deliverables + Project Workspace v1

**Superseded by Polish v2 for UX details** — core behaviors unchanged: single `deliverables` row per order, creator submission moves order toward review when applicable, optional migration `deliverables-revision-note.sql` for `revision_note`.

---

## What is MicroBuild?

Local service businesses (pool cleaners, detailers, painters, landscapers, etc.) need specific web tools to convert leads, collect reviews, and present their work. Building these from scratch takes too long and costs too much.

MicroBuild solves this by offering five standardized "MicroBuilds" â€” small, focused tools that solve one revenue problem each. Buyers browse listings, submit a request, and a creator delivers a working build in days.

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
| Auth | Supabase Auth â€” email/password sign-up + sign-in. GitHub OAuth deferred until stable domain. |
| Payments | Not yet implemented â€” Stripe deferred (Phase 4) |
| AI | Rules-based only â€” `src/lib/profileAI.ts`, `src/lib/buildPacket.ts`. No external APIs. |
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
  schema.sql                                  # DDL â€” all tables, indexes, triggers
  seed.sql                                    # DML â€” categories and template listings
  policies.sql                                # RLS â€” access policies
  migrations/
    creator-tier-fields.sql                   # Adds tier columns to creator_applications
    profile-system-foundation.sql             # Expands creator_profiles + business_profiles
    admin-auth-notes.sql                      # Comments only â€” future RLS hardening guide
    email-account-profile-fields.sql          # Adds github_url, avatar_url to user_profiles
    account-approval-workflow.sql             # Approval workflow v1: auth linking, approval_status, duplicate prevention
    project-pipeline-foundation.sql           # Orders pipeline, build_packets + deliverables extras (run before workspace features)
    deliverables-revision-note.sql           # Adds revision_note on deliverables for admin→creator revision feedback
    marketplace-application-foundation.sql   # Marketplace: request_applications, published_workflows, project_messages, buyer/request selection fields — TEMP DEV RLS flagged in-file
docs/
  database-schema.md
  marketplace-application-flow.md
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

- **`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`** â€” found in Supabase Dashboard â†’ Settings â†’ API.
- **`VITE_ADMIN_EMAILS`** â€” comma-separated list of emails that can sign in to `/admin`. Must match the email(s) you created in Supabase Auth (see Admin Setup below).

> The app renders with mock data if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not set â€” no crashes, just sample listings.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Supabase Setup

Run these SQL files **in order** in your Supabase Dashboard â†’ SQL Editor:

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
| 9 | `supabase/migrations/project-pipeline-foundation.sql` | Pipeline fields on `orders` / packets / deliverables + TEMP DEV ALL policies for local pipeline testing |
| 10 | `supabase/migrations/deliverables-revision-note.sql` | Optional revision note persistence for creator workspace |
| 11 | `supabase/migrations/marketplace-application-foundation.sql` | Marketplace tables + TEMP DEV marketplace policies (**unsafe for prod**) |

Each file is safe to re-run: migrations use `ADD COLUMN IF NOT EXISTS`, policies use `DROP POLICY IF EXISTS`.

> **Order matters.** Schema must exist before seed; policies file references tables that schema created; migrations must run after schema.

---

## Account Approval Workflow v1

### Creator Application Lifecycle

```
Submit application â†’ new â†’ reviewing â†’ [decision]
                                        â”œâ”€â”€ active                  (Free tier approved)
                                        â”œâ”€â”€ approved_pending_payment (Pro/Verified approved, payment pending)
                                        â”œâ”€â”€ needs_more_info          (admin needs clarification)
                                        â”œâ”€â”€ rejected                 (not approved)
                                        â””â”€â”€ suspended                (account suspended)
```

### Auth Linking
When a logged-in user submits an application, it is linked via:
1. `auth_user_id` (Supabase Auth UUID â€” primary)
2. `user_profile_id` (user_profiles row â€” secondary)
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
| Make Profile Public | â€” | â€” | public_profile_status=`public` |
| Hide Profile | â€” | â€” | public_profile_status=`hidden` |

### Admin Dashboard â€” Operations Command Center
The `/admin` dashboard is a full operations panel with:

**AI Ops Brief (rules-based, no external API):**
- Buyer signals: High Priority, Ready to Quote, Needs Follow-up
- Creator signals: Pending Review, Needs Info, Pending Payment, Active Creators
- Alerts for approved creators without profiles, and unlinked applications
- Auto-selected "admin focus today" message

**Metrics Row (two groups):**
- Buyer Requests: Total, New, High Priority, Ready to Quote, Needs Follow-up
- Creator Applications: Pending Review, Needs Info, Pending Payment, Active Creators, Rejected/Suspended

**Creator Application Cards show:**
- Name, email, tier badge, fit score, human-readable status label
- Auth-linked indicator (ðŸ”— Auth linked) when `auth_user_id` is present
- Profile-created indicator (âœ“ Profile created) when `linked_creator_profile_id` is set
- Admin decision date when a decision has been made
- Needs-more-info reason callout when status is `needs_more_info`
- Rejection reason callout when status is `rejected`
- Suspension reason callout when status is `suspended`
- Admin notes callout if any notes are saved
- AI candidate review (tier fit, strengths, gaps, missing info)
- Copyable messages: approval, rejection, needs-more-info, follow-up, candidate summary
- Action buttons: Approve Free, Approve Professional, Approve Verified, Needs More Info, Reject, Suspend, Create/Update Profile, Make Public, Hide Profile
- Workflow templates library: preset copyable message blocks for all common scenarios

### Creator Dashboard Status
The creator dashboard shows real-time application status including:
- No application submitted
- Under review
- Needs more info (with admin reason)
- Approved â€” payment pending
- Active
- Rejected (with reason)
- Suspended

---

## Dashboard v2 â€” Account Command Center

### Dashboard Navigation
All dashboard pages share a consistent top navigation bar (`DashboardNav` component):
- **Overview** (`/dashboard`)
- **Profile** (`/dashboard/profile`)
- **Analytics** (`/dashboard/analytics`)
- **Settings** (`/dashboard/settings`)

### Creator Dashboard Features (v2)

**Account Status Panel:**
- Tier (Free / Professional / Verified)
- Account status (approval status)
- Profile visibility (Public / Hidden / Paused)
- Verification status
- Application status
- Payment status placeholder

**Next Best Action Card:**
Rules-based card that surfaces the highest priority action based on the creator's current state:
- Submit application (no application found)
- Review under way â€” wait for admin
- Update profile (needs more info)
- Payment setup coming soon (approved)
- Profile live â€” keep it updated
- Complete profile (low strength score)
- Profile active but waiting to be published

**Profile Strength Panel:**
- Composite score (0â€“100) computed by `analyzeProfileStrength()` in `src/lib/profileAI.ts`
- Section scores: Identity, Expertise, Portfolio, Credentials, Availability
- Missing items checklist with direct link to profile editor
- Strengths list
- Suggested badges (awarded by admin)
- AI Readiness Assessment verdict + verification path

**Creator Analytics Preview:**
- Completed builds count (live from Supabase)
- Average rating (live from Supabase)
- Profile views: placeholder â€” requires analytics integration
- Buyer interest: placeholder â€” requires matching system
- Estimated earnings: placeholder â€” requires Stripe
- Monthly revenue: placeholder â€” requires Stripe

**Project Pipeline (Placeholder):**
Five-stage pipeline view: Available â†’ Assigned â†’ In Progress â†’ In Review â†’ Completed.
All stages show "â€”" until the build order system is built (Phase 2).

### Buyer Dashboard Features (v2)

**Request List (Enhanced):**
- Business name and build type
- Industry tag
- Budget (if provided)
- Deadline (if provided)
- Status with color coding

**Missing Info Panel:**
Automatically detects missing fields in the latest buyer request:
- No budget specified
- No deadline specified
- No industry/business type included

**Recommended Next MicroBuild:**
Rules-based recommendation of a MicroBuild type the buyer hasn't tried yet, based on their submitted request types. Includes quick links to other untried builds.

**Quick Actions:**
- Submit a New Request
- Browse All Builds
- How It Works

### Dashboard AI Intelligence (Rules-Based)
All dashboard intelligence is computed locally using rules in:
- `src/lib/profileAI.ts` â€” `analyzeProfileStrength()`, `analyzeCreatorReadiness()`
- No external AI API is called
- Scores are deterministic from profile data

### Analytics Page (v2)
- Live profile strength section bars (fetches creator profile and computes real scores)
- Live build count and rating for creators
- Live request count for buyers
- Placeholder metrics grid clearly labeled with what integration is required
- Earnings bar chart placeholder

### Future Dashboard Phases
- **Phase 2:** Project matching, build pipeline, assignment notifications
- **Phase 3:** Event tracking, profile view counts, real-time buyer interest
- **Phase 4:** Stripe integration for earnings, subscription management, invoices
- **Phase 5:** Real AI recommendations via Supabase Edge Functions (server-side only)

> **âš  Never put Stripe keys or AI API keys in the frontend.** All payment and real AI calls must go through Supabase Edge Functions.

### Future
- Stripe payment activation for Pro/Verified tiers (Phase 4)
- GitHub OAuth sign-in once stable domain is configured
- Production RLS: replace `USING (true)` policies with auth-based restrictions

---

## Buyer Experience v2 — Request Workflow

### `/request` — Expanded Intake Form

The buyer request form is now a structured, multi-section intake flow:

| Section | Fields |
|---------|--------|
| Business Basics | Name, contact, email, phone, industry, city/state, website, Instagram, Google Business Profile |
| Business Goal | 7-option radio selection with icons and descriptions |
| Requested MicroBuild | 6-option card grid (Quote Funnel, Booking Page, Review Booster, Package Selector, Trust Page, Not sure) |
| Current Problem | Textarea with 5 one-click example prompts |
| Scope Details | Budget, timeline, preferred CTA, services offered, target customer, lead source, style notes |
| AI-style Preview | Live rules-based preview before submission: recommended build, quote readiness, missing info, complexity, estimated price range |
| Success State | Timeline of next steps, what our team reviews, link to dashboard (if logged in), link to browse |

Extra fields (city/state, Instagram, Google Business, CTA, services, target customer, lead source) are packed into `style_notes` using a structured text format — no schema changes required.

### Buyer Dashboard (`/dashboard`)

**Status Overview Row (6 cards):**
- Requests Submitted
- Under Review
- Proposals Pending
- Needs More Info
- Completed Builds
- Recommended Next MicroBuild

**Active Requests Section:**
Each active request shows:
- Business name + build type
- Request timeline (7-stage progress indicator: Submitted → Under Review → Needs More Info → Proposal Ready → In Progress → Delivered → Completed)
- Goal, recommended build, budget, deadline, quote readiness
- Missing info checklist with a link to submit an updated request

**Buyer AI Analysis (rules-based, no external API):**
- Recommended build (from goal + industry + problem)
- Quote readiness score (0–100)
- Missing info flags
- Business profile completeness panel

**Complete Business Profile Panel:**
Shows missing business data fields with a prompt to submit a more complete request.

### Buyer Analytics (`/dashboard/analytics`)

- Request status breakdown (6 status buckets, live from DB)
- MicroBuild types requested (bar chart, live from DB)
- Goal & outcome tracking (placeholder, activates after MicroBuild goes live)
- Notice: "Analytics activate after your MicroBuild goes live"

### Buyer Settings (`/dashboard/settings`)

- Account email (read-only)
- Display name (editable)
- Billing: "No subscription. Buyers pay per approved MicroBuild later." (Stripe deferred)
- Privacy and notification placeholders

### Admin — Buyer Request Queue Improvements

Each request card now shows **quick action buttons** on the surface (no need to open AI Ops panel):
- Mark Reviewed → `in-review`
- Needs More Info → `needs-more-info`
- Ready to Quote → `proposal-sent`
- In Progress → `in-progress`
- Complete → `completed`
- Reject → `rejected`

Buttons are wired to `updateRequestStatus()` — each click updates Supabase immediately with visual feedback.

### `src/lib/buyerAI.ts` — Rules-Based Buyer Intelligence

| Function | Returns |
|----------|---------|
| `getRecommendedBuild(data)` | Best build type + reason string |
| `getQuoteReadiness(data)` | Score 0–100, label, color |
| `getMissingInfoFlags(data)` | Array of missing field descriptions |
| `getPriorityScore(data)` | Score + label + color |
| `getComplexityRating(data)` | Simple / Standard / Complex / TBD |
| `getSuggestedPriceRange(data)` | String price range |
| `getProposalAngle(data)` | Proposal narrative paragraph |
| `getFollowUpQuestions(data)` | Up to 5 follow-up questions |
| `getCreatorBriefSummary(data)` | One-paragraph creator brief |
| `getAdminNextAction(data, status)` | Admin action string |
| `getRequestTimeline(status)` | 7-stage timeline array |
| `previewBuyerRequest(data)` | Full preview object for form panel |
| `analyzeBuyerDashboard(requests)` | Recommended build + missing fields |

No external AI API calls. All logic is deterministic from request data.

### Future: Buyer Payments & Proposal System

When Stripe is connected (Phase 4):
- Buyers will pay per approved MicroBuild after proposal acceptance
- Stripe Checkout will be triggered from the buyer dashboard
- Payment confirmation will update `buyer_requests.status` to `in-progress`

---

## MVP Features

### Public pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/browse` | Browse all 5 MicroBuild templates with category filter and search |
| `/builds/:slug` | Template detail page with customer flow, FAQ, best fit industries |
| `/request` | Buyer request form â€” inserts into `buyer_requests` |
| `/creators` | Creator directory â€” public profiles only; shows "coming soon" until profiles are activated |
| `/creator/:id` | Individual creator profile â€” hidden unless `public_profile_status = 'public'` |
| `/creators/apply` | Creator application with tier selection â€” inserts into `creator_applications` |
| `/how-it-works` | Process explanation |
| `/pricing` | Three pricing tiers |
| `/case-studies` | Demo scenario examples |

### Platform v2 â€” Account & Dashboard Routes

| Route | Description |
|-------|-------------|
| `/signin` | Email/password sign-in **and** sign-up (tab toggle on same page). |
| `/onboarding` | Role selection (buyer / creator) and basic profile setup. Requires sign-in. |
| `/dashboard` | Creator or buyer dashboard â€” role-based view based on `user_profiles.account_type`. |
| `/dashboard/profile` | Creator profile editor â€” edits `creator_profiles` row linked by `user_id`. |
| `/dashboard/analytics` | Analytics page â€” live request count + placeholder metrics. |
| `/dashboard/settings` | Account settings â€” display name, GitHub profile URL (plain link), sign out. |

### Supabase Auth Setup (Email/Password)

Email/password auth is built-in to Supabase â€” no OAuth app registration required.

**For local development â€” disable email confirmation:**
1. Supabase Dashboard â†’ Authentication â†’ Settings â†’ Email
2. Toggle off **"Enable email confirmations"**
3. Users are signed in immediately after sign-up (no email needed)

**For production â€” enable email confirmation:**
- Leave "Enable email confirmations" on
- After sign-up, the app shows a "Check your email" screen
- The confirmation link redirects to your site's callback URL

**Add your site URL:**
- Supabase Dashboard â†’ Authentication â†’ URL Configuration
- Site URL: `http://localhost:5173` (dev) or your production URL
- Redirect URLs: add `http://localhost:5173/dashboard`

### GitHub OAuth â€” Deferred

GitHub sign-in is intentionally **not implemented yet**. It will be added once MicroBuild has a stable production domain. Currently:
- GitHub URL is stored as a **plain text link** on `user_profiles.github_url` and `creator_profiles.github_url`
- Users can add their GitHub URL in Settings or the Profile Editor
- It shows as a clickable link on public creator profiles
- No OAuth flow, no GitHub app registration needed

### Admin (dev-mode, no auth required)

| Route | Description |
|-------|-------------|
| `/admin` | AI Operations Command Center â€” loads directly, no login required in dev mode |
| `/admin/login` | Deferred placeholder â€” shows a note that auth is not yet active |

> **Admin auth is intentionally deferred.** The infrastructure files exist (`src/lib/admin.ts`, `src/components/AdminRouteGuard.tsx`) but are not wired into routing. The `AdminRouteGuard` can be reconnected to `App.tsx` in a future auth phase.

> **Do not deploy `/admin` publicly** until Supabase Auth and admin role policies are in place. The temporary dev RLS policies in `supabase/policies.sql` allow anonymous read/write access. See `supabase/migrations/admin-auth-notes.sql` for the full hardening guide.

#### When Admin Auth Is Ready

1. Create a Supabase Auth user (Dashboard â†’ Authentication â†’ Users â†’ Add User).
2. Add their email to `VITE_ADMIN_EMAILS` in `.env`.
3. In `src/App.tsx`, re-wrap the `admin` index route with `<AdminRouteGuard>`.
4. Replace all `USING (true)` dev policies per `supabase/migrations/admin-auth-notes.sql`.

#### Admin Dashboard Features (v3 â€” AI Ops Command Center)

**Section navigation:** Sticky top nav with anchor links to all 6 sections â€” Focus, Creators, Buyers, Profiles, Templates, Health.

**Today's AI Focus Panel:**
- Numbered, prioritized action list computed from live Supabase data (rules-based, no external AI API)
- Signals: profiles missing / high-priority buyers / pending review / ready to quote / needs follow-up / needs more info / pending payment / unlinked apps
- Signal groups: Buyer Requests and Creator Applications with color-coded counts
- Warning alerts for approved creators without profiles and unlinked applications

**Creator Review Queue:**
- Status filter bar: All / Pending Review / Approved / Closed
- Batch selection with checkboxes â€” copy summaries or export as `.txt`
- Creator cards showing: name, email, tier, approval status, auth-link badge, profile-link badge, decision date, reason callout
- AI fit score (0â€“100), strengths, concerns, missing proof, best-fit niches, recommended decision
- Action buttons: Approve Free, Approve Professional Pending Payment, Approve Verified Pending Payment, Needs More Info, Reject, Suspend, Create/Update Profile, Make Public, Hide Profile
- Reason input fields for reject/suspend/needs-more-info actions
- Copyable messages: approval, rejection, follow-up, candidate summary

**Buyer Request Queue:**
- Filter tabs: All / New / High Priority / Needs Follow-up / Ready to Quote
- Batch selection with checkboxes â€” copy summaries or export as `.txt`
- Request cards showing: business, industry, build type, budget, deadline, lead quality score (0â€“100), priority, fit rating, quote readiness, price range, missing info flags
- AI Operations Panel (7 tabs): AI Summary (8 scores), Missing Info + Risk Flags, Follow-up Questions, Creator Brief, Proposal Draft, Checklists, Automation
- Copy buttons: Packet Summary, Follow-up Questions, Buyer Outreach, Creator Brief, Proposal Draft
- Save Build Packet to Supabase (shows saved ID on success)

**Profile Quality Queue:**
- Fetches all `creator_profiles` from Supabase
- Profile strength score (0â€“100) computed rules-based using `analyzeProfileStrength()`
- Filter tabs: All Profiles / Low Strength (<50) / Hidden Active / Public Risks
- Each card shows: tier, visibility status, score + label, risk flags, top missing fields, strengths
- Actions: Toggle public/hidden (writes to Supabase), Copy profile improvement message

**Reusable Workflow Templates (10):**
- New Buyer Follow-up, Missing Info Request, Quote Proposal Starter
- Creator Approval, Creator Rejection, Professional Payment Pending, Verified Proof Request
- Profile Improvement Request, Profile Approved & Published, Buyer â†’ Creator Handoff
- Each card shows template preview and one-click copy with copied state

**Platform Health Snapshot:**
- Overall health score (0â€“100) with label: Healthy / Needs Attention / Action Required
- 6 health metrics: Total Buyers, Creator Apps, Active Creators, Public Profiles, Pending Review, Pending Payment
- Warning flags for actionable issues (creators without profiles, weak public profiles)

**Copy button reliability:** All copy buttons use a consistent `copyToClipboard()` helper with textarea fallback. Every button shows a "âœ“ Copied" state for 2 seconds, then resets. No crashes if Clipboard API is unavailable.

**Defensive UI:** `SectionErrorBoundary` wraps every section and every individual card. All data access uses `safeText()`, `safeArray()`, `safeNumber()` helpers. No blank screens. Loading and error states have readable messages.

**Rules-based AI â€” no external API keys:**
- `src/lib/buildPacket.ts` â€” buyer lead quality, priority, fit rating, quote readiness, proposal draft, creator brief
- `src/lib/profileAI.ts` â€” profile strength score, missing fields, improvements, risk flags, badges, readiness verdict

> **âš  Never expose external AI API keys in the frontend.** If real GPT-4o / Claude AI is added in a future phase, it must go through a **Supabase Edge Function** (server-side). The frontend calls the Edge Function, not the AI API directly. API keys must be stored as Supabase secrets, not in `.env` or frontend code.
- **MicroBuild Listings:** Clean table with encoding-safe turnaround display.

#### Temporary Dev Policies Warning

`supabase/policies.sql` contains clearly marked `DEVELOPMENT ONLY` policies that allow:
- Anonymous `SELECT` on `buyer_requests` and `creator_applications` (admin reads)
- Anonymous `UPDATE` on `buyer_requests` and `creator_applications` (status updates)
- Anonymous `INSERT` on `build_packets` (save packet action)

**These must be removed or replaced with Supabase Auth + admin role checks before the app is made publicly accessible.** See the policy file for exact comments and Phase 2 instructions.

### Data behavior

- **Browse and Build Detail:** Fetches from Supabase with a silent fallback to mock data if Supabase is unavailable or RLS blocks the query.
- **Forms:** Insert directly into Supabase. Full error logging in the browser console â€” error code `42501` means an RLS policy is missing.
- **AI-Ready Build Packet System:** After submitting a request, a structured build brief is generated from form data. See below for full details.

---

## Roadmap

### Phase 1 â€” Current (MVP)
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

### Phase 2 â€” Auth + Admin Operations
- [ ] Supabase Auth (email/password or magic link)
- [ ] Admin role check on `/admin` â€” replace temp dev policies with JWT-scoped RLS
- [ ] Buyers can view their own request status
- [ ] Creator profiles created from approved applications (using `creator_profiles` table)
- [ ] Creator login + dashboard to view assigned project briefs
- [ ] Replace dev anon UPDATE/INSERT policies with service-role key in server-side routes

### Phase 3 â€” Build Packets + AI
- [ ] Supabase Edge Function: `generate-build-packet` (server-side, no API key in frontend)
- [ ] GPT-4o generates full build brief from buyer request data
- [ ] Stored in `build_packets` table, linked to the buyer request row
- [ ] Admin triggers generation; creator views the brief in their dashboard
- [ ] `GeneratedBuildPacket` interface shape stays the same â€” only the generator changes

### Phase 4 â€” Payments
- [ ] Stripe Checkout for buyer project fees
- [ ] Stripe Subscriptions for Professional ($15/mo) and Verified ($25/mo) creator tiers
- [ ] Payment link generated per accepted request; `approved_pending_payment` status triggers subscription activation email
- [ ] Webhook handler updates `creator_applications.status` â†’ `active` after payment
- [ ] Creator payout via Stripe Connect

---

## Creator Profile System

### Profile Visibility Rules

Creator profiles follow strict visibility rules to protect applicants and maintain marketplace quality:

| Stage | `approval_status` | `public_profile_status` | Visible to public? |
|---|---|---|---|
| Application submitted | (not yet created) | â€” | No |
| Admin creates profile | `draft` | `hidden` | No |
| Approved (Free) | `active` | `hidden` | No â€” admin must flip to `public` |
| Approved (Pro/Verified, pending payment) | `approved_pending_payment` | `hidden` | No |
| Payment confirmed, admin activates | `active` | `public` | **Yes** |
| Suspended | `suspended` | `hidden` or `paused` | No |

**Rule: Public profiles are only visible when `public_profile_status = 'public'`.** Approved but unpaid or newly approved profiles remain hidden until explicitly activated.

### Approval-Before-Payment Flow

1. Application submitted â†’ `creator_applications.status = 'new'`
2. Admin reviews and sets application to `approved_pending_payment`
3. Admin clicks "Create Creator Profile" in dashboard â†’ inserts into `creator_profiles` with `approval_status = 'approved_pending_payment'` and `public_profile_status = 'hidden'`
4. Subscription instructions sent to creator (Pro/Verified only)
5. On payment confirmation, admin sets `public_profile_status = 'public'` and `approval_status = 'active'`
6. Profile appears in `/creators` directory

Free Creators skip step 4 â€” admin can activate directly.

### Profile Schema

`creator_profiles` fields (after `profile-system-foundation.sql` migration):

- **Identity:** `display_name`, `full_name`, `slug`, `profile_photo_url`, `bio`
- **Tier:** `tier`, `verification_status`, `approval_status`, `subscription_status`, `public_profile_status`
- **Marketplace:** `tools`, `niches`, `badges`, `portfolio_links`, `credential_links`, `certifications`
- **Proof:** `github_url`, `linkedin_url`, `case_studies`, `education_or_coursework`, `proof_links`
- **Stats:** `completed_builds_count`, `average_rating`
- **Admin:** `admin_notes`, `ai_profile_score`, `ai_profile_summary`

### Profile Helpers (`src/lib/profiles.ts`)

- `normalizeCreatorProfile()` â€” safe Supabase row â†’ typed profile
- `normalizeCreatorApplicationToProfilePreview()` â€” generate preview from application
- `buildCreatorProfileInsert()` â€” create insert payload from application
- `generateCreatorProfileAISummary()` â€” rule-based profile summary
- `getCreatorBadges()` â€” compute display badges from tier/stats
- `getCreatorTierLabel()`, `getVerificationLabel()`, `getProfileVisibilityLabel()`

### Public Profile Routes

- `/creators` â€” creator directory (shows only `public_profile_status = 'public'` rows); shows "coming soon" if empty
- `/creator/:id` â€” individual profile page; returns "Profile Not Available" if hidden/pending

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
3. Admin reviews in dashboard â€” AI Review panel shows tier-specific scoring, missing info, and suggested decision
4. Admin sets status to one of:
   - `needs_portfolio_review` â€” request more samples
   - `needs_more_info` â€” specific clarifications needed
   - `approved_pending_payment` â€” approved; subscription activation sent (Pro/Verified only)
   - `active` â€” account is live and eligible for projects
   - `rejected` â€” not a fit at this time
   - `suspended` â€” temporarily deactivated
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
- **Candidate Fit Score** (0â€“100) â€” tier-aware scoring based on tools, niches, portfolio, availability, and tier-specific proof
- **Tier Fit Assessment** â€” how well evidence matches the claimed tier
- **Suggested Badge** â€” Free Creator / MicroBuild Pro / Verified Creator âœ“
- **Strengths / Concerns / Missing Info** â€” rule-based flags for review
- **Recommended Decision** â€” derived from score + tier + evidence completeness
- **Copy-ready messages** â€” approval message, rejection message, follow-up message

No AI API is called. All analysis is deterministic. Phase 3 may replace this with a Supabase Edge Function call.

âš ï¸ **Security rule: No AI API keys ever go in the frontend.** All future AI integrations will be server-side only (Supabase Edge Functions).

---

## Development Notes

### Build

```bash
npm run build   # TypeScript check + Vite production build
npm run dev     # Development server with HMR
```

### Environment variables

All Vite env vars must be prefixed with `VITE_`. Never commit `.env` â€” it is in `.gitignore`.

### Database types

`src/types/database.ts` contains hand-authored TypeScript types mirroring the Supabase schema. These can be replaced with auto-generated types once the project is stable:

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
```

### Supabase client

`src/lib/supabase.ts` exports the client plus two typed insert helpers (`insertBuyerRequest`, `insertCreatorApplication`). The client strips any `/rest/v1/` suffix from the URL automatically.

### AI-Ready Build Packet System

`src/lib/buildPacket.ts` generates a structured build brief from a buyer request. **No external AI API is called.** The logic is entirely deterministic and runs in the browser. All UI surfaces label this clearly as *"AI-style operations preview â€” rules-based MVP version."*

**âš ï¸ Security rule: No AI API keys ever go in the frontend.** Phase 3 will call GPT-4o from a Supabase Edge Function (server-side only).

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
| `suggestedProposalAngle` | 2â€“3 sentence pitch framing for this specific request |
| `proposalDraft` | Copy-ready email proposal draft for admin to send |
| `qualityChecklist` | QA items specific to the build type |
| `launchChecklist` | Post-delivery launch tasks for the business owner |
| `adminNextAction` | Recommended next step derived from score + urgency |
| `priorityLabel` | High / Medium / Low â€” derived from score + urgency |
| `fitRating` | Strong / Good / Okay / Weak â€” derived from score + build type |
| `leadQualityScore` | 0â€“100 â€” based on field completeness and specificity |
| `leadQualityLabel` | Strong / Good / Fair / Needs Detail |
| `urgencyRating` | High / Medium / Low / Not specified â€” from deadline field |
| `complexityRating` | Low / Medium / High â€” from build type + style notes |
| `revenuePotentialRating` | High / Medium-High / Medium / Low-Medium / Low / Unknown |
| `missingInfoFlags` | List of missing or weak fields that should be followed up |
| `riskFlags` | List of risk signals (low budget, urgent + vague, no build type) |
| `followUpQuestions` | Suggested questions to ask the buyer before scoping |
| `quoteReadiness` | Ready / Nearly Ready / Needs Details / Not Ready â€” from score + budget |
| `suggestedPriceRange` | Estimated price range from complexity + buyer's stated budget |
| `estimatedFulfillmentDifficulty` | Easy 1â€“3d / Standard 3â€“5d / Complex 5â€“7d from complexity |
| `creatorFitRecommendation` | Which creator profile and tools best match this request |
| `buyerOutreachMessage` | Copy-ready message for following up with the buyer directly |

`generateCreatorReview()` is also exported and generates a `CreatorApplicationReview` from a creator application, including:
- `candidateFitScore` (0â€“100), `fitLabel` (Strong / Good / Fair / Weak)
- `strengths`, `concerns`, `missingPortfolioInfo`
- `bestFitNiches`, `recommendedDecision`
- `creatorFollowUpMessage` (copy-ready outreach)

**Where it appears:**
- `/admin` AI Ops Brief â€” top panel summarizing today's operational focus
- `/admin` per-request AI Operations Panel â€” 7 tabs including new Quote Readiness, Price Range, Fulfillment, Creator Fit Recommendation, and Buyer Outreach Message copy button
- `/admin` per-creator AI Review panel â€” expandable with full review output and copy buttons
- `/admin` Proposal tab â€” "Save to Supabase" button that writes to `build_packets` table
- `/request` success state â€” buyer-safe summary only (goal, build, problem, budget, deadline)

### Admin Ops v2 â€” Supabase Status Updates

The admin dashboard can now write status updates back to Supabase:

**Buyer requests** â€” status dropdown per card with 5 states:
- `new` â†’ `in-review` â†’ `proposal-sent` â†’ `accepted` / `rejected`
- Fires `UPDATE buyer_requests SET status = ? WHERE id = ?` via anon key
- Optimistic UI update with revert on failure

**Creator applications** â€” action buttons per card:
- Mark Reviewed (`reviewing`), Approve (`approved`), Reject (`rejected`), Reset (`new`)
- Fires `UPDATE creator_applications SET status = ? WHERE id = ?` via anon key

**Build packets** â€” "Save to Supabase" in the Proposal tab:
- Inserts a full rules-based packet into `build_packets` linked to `buyer_request.id`
- Uses `generated_by = 'manual'`; Phase 3 will change this to `'gpt-4o'`

**These all require the dev UPDATE/INSERT policies from `supabase/policies.sql` to be active in your project. They are NOT safe for a public deployment.** See policy file for replacement instructions.

**Phase 3 upgrade path:**
`generateBuildPacket()` on the frontend will be replaced by a Supabase Edge Function call (`/functions/v1/generate-build-packet`) that invokes GPT-4o server-side. The `GeneratedBuildPacket` interface shape stays the same â€” the UI does not need to change.

### Mock data fallback

`src/lib/templates.ts` fetches from Supabase and falls back to `src/data/mockListings.ts` if the query fails or returns empty. This lets the app render correctly without a live Supabase connection.


---

## Project Pipeline v1

### Overview

The Project Pipeline converts buyer requests into trackable projects assigned to creators and visible to both parties on their dashboards.

### Core Flow

`
Buyer submits request
  -> Admin reviews in /admin Buyer Request Queue
  -> Admin generates Build Packet (AI-style rules-based brief)
  -> Admin clicks "+ Create Project" on any request card
  -> Admin assigns an active creator to the project
  -> Creator sees assigned project in /dashboard Project Pipeline
  -> Buyer sees linked project status in /dashboard Active Requests
  -> Admin updates project status as work progresses
  -> Project marked delivered -> completed
`

### Order Pipeline Statuses

| Status | Meaning |
|--------|---------|
| draft | Project created, not yet assigned or quoted |
| 
eady_to_quote | Ready to send proposal to buyer |
| pending_payment | Awaiting buyer payment (future Stripe integration) |
| ssigned | Creator assigned, work not yet started |
| in_progress | Creator is actively building |
| in_review | Build submitted, under review |
| delivered | Delivered to buyer, awaiting approval |
| completed | Buyer approved, project closed |
| 
ejected | Request rejected |
| canceled | Project canceled |

### New Migration: project-pipeline-foundation.sql

Run this in the Supabase SQL editor **after** schema.sql:

`
supabase/migrations/project-pipeline-foundation.sql
`

**What it does:**
- Adds order_status, payment_status, project_title, project_type, dmin_notes, microbuild_fee, creator_payout to orders
- Makes uyer_id nullable on orders (supports guest buyer requests)
- Adds launch_checklist, i_summary, suggested_page_sections to uild_packets
- Adds github_url, delivery_status, creator_profile_id to deliverables
- Adds DEV-ONLY RLS policies for orders, uild_packets, deliverables (clearly labeled UNSAFE)

**Note:** The dev policies grant full anon + authenticated access. Remove before production deployment.

### New File: src/lib/orders.ts

CRUD helpers for the project pipeline:

| Function | Purpose |
|----------|---------|
| createOrderFromRequest() | Creates an order from a buyer request, prevents duplicates |
| updateOrderStatus() | Updates order pipeline status |
| ssignCreatorToOrder() | Assigns creator profile, moves status to assigned |
| etchAllOrders() | Admin: fetch all orders |
| etchOrderByRequestId() | Check if order exists for a request |
| etchOrdersByCreatorProfile() | Creator dashboard: fetch assigned orders |
| etchOrdersByRequestIds() | Buyer dashboard: fetch orders for buyer's requests |
| etchActiveCreatorProfiles() | Creator assignment dropdown data |
| createDeliverablePlaceholder() | Creates a deliverable placeholder |
| etchDeliverableByOrderId() | Fetch deliverable for an order |
| updateDeliverable() | Update deliverable URLs and status |

Also exports ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_PIPELINE_STAGES, and getNextOrderAction().

### Admin: Project Pipeline Section

The /admin dashboard now includes a **Project Pipeline** section (replaces the old "Orders: Phase 2" placeholder):

- Filter tabs: All, Draft, Ready to Quote, Assigned, In Progress, In Review, Delivered, Completed
- Each order card shows: project title, type, pipeline progress bar, payment status, creator assignment dropdown, status action buttons, next best action, admin notes
- Creator assignment: select from active creators, one-click assign
- Status updates write directly to Supabase with optimistic UI

Each buyer request card now includes a **+ Create Project** button that:
- Checks for existing order first (prevents duplicates)
- Creates order linked to the buyer request
- Shows the project ID badge once created

### Creator Dashboard: Live Project Pipeline

The creator dashboard now shows **real assigned projects** instead of a Phase 2 placeholder:

- Fetches orders from Supabase where creator_id = creator_profile.id
- Shows stage counts: Assigned, In Progress, In Review, Delivered, Completed
- Shows individual project cards with: title, type, status badge, date, next action
- Empty state: "Approved creators will see assigned MicroBuild projects here."

### Buyer Dashboard: Project Status

The buyer dashboard's Active Requests section now shows a **Project Status block** on each request card:

- If a project exists: shows project title, pipeline status badge, and a human-readable next step
- If no project yet: shows "Your request is under review. MicroBuild will prepare a recommended build plan."
- Orders are fetched by matching buyer request IDs

### Deliverables + Creator Workspace

- **Route:** `/dashboard/projects/:orderId` (authenticated creator with `user_profiles.creator_profile_id` matching `orders.creator_id`).
- **Submit:** `submitCreatorDeliverable()` upserts the single `deliverables` row for that `order_id` and sets `delivery_status` to **submitted**; order moves to **in_review** when it was **assigned** or **in_progress**.
- **Admin:** Each pipeline order card includes deliverable URLs, creator notes, revision textarea, and actions: Request Revision, Approve Deliverable, Mark Delivered, Mark Completed.
- **Buyer:** Preview/live links render only when `order_status` is **delivered** or **completed** **and** `delivery_status` is **approved** (does not expose internal admin-only notes).
- **Migration:** Run `supabase/migrations/deliverables-revision-note.sql` so **Request Revision** can persist `revision_note` for the creator workspace.

Legacy: `createDeliverablePlaceholder()` still creates an initial draft row from admin workflows when needed.

### Payment Integration (Future)

Stripe integration is **not included in v1**. The payment_status field on orders (unpaid, pending, paid, 
efunded) and microbuild_fee / creator_payout fields are in place for a future Stripe integration via Supabase Edge Functions.

### Real AI Integration (Future)

All current AI functionality is rules-based (uyerAI.ts, uildPacket.ts). Phase 3 will replace generateBuildPacket() with a Supabase Edge Function call to GPT-4o server-side. The GeneratedBuildPacket interface shape will not change.

### Manual Tests After Migration

1. **Submit buyer request**: Go to /request, submit a form
2. **Generate/save build packet**: Open request in /admin, expand AI Operations Panel, generate packet and save to Supabase
3. **Create project**: Click "+ Create Project" on any request card in admin; verify project ID badge appears
4. **Assign creator**: In Project Pipeline section, select an active creator from the dropdown and click Assign
5. **Creator dashboard**: Log in as creator, verify assigned project appears; open **Open workspace →**, submit deliverable URLs
6. **Buyer dashboard**: Log in as buyer, verify linked project timeline and (after approve+delivery) preview/live links
7. **Admin deliverable review**: Request revision / approve deliverable / mark delivered / completed; verify buyer visibility rules
8. **Admin status update**: In Project Pipeline, click legacy status buttons as needed

