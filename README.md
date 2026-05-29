# MicroBuild

A marketplace for focused, affordable web tools built for local service businesses â€” quote funnels, booking pages, review boosters, trust pages, and package selectors. Businesses request a build, a vetted creator delivers it in days.

**Status:** Marketplace **Buyer Browse Workflows v1** — professional `/browse` storefront for AI-reviewed creator workflows with search, filters, detail panel, and Request/Customize. Prior: **Real Analytics + AI Monitor v1**. Proposal/payment remains **deferred** (no Stripe). **TEMP DEV RLS remains unsafe** until production policies ship.

### Real Analytics + AI Monitor v1

| Area | Behavior |
|------|----------|
| Route | **`/dashboard/analytics`** — role-aware (creator, buyer, admin summary) |
| Data | **`src/lib/analytics.ts`** — explicit column selects from existing tables; no fake numbers |
| AI Monitor | **`src/lib/analyticsAI.ts`** — rules-based insights only (no external AI API) |
| Creator metrics | Applications (`request_applications`), projects (`orders`), workflows (`published_workflows` + `buyer_requests.source_workflow_id`), agreements (`project_proposals`), deliverables, messages |
| Buyer metrics | Requests, applicants, projects, deliverables awaiting review, workflow vs custom requests |
| Admin | Summary counts + link to **`/admin`** Command Center — full admin analytics stay in admin shell |
| Future placeholders | **Earnings** (needs Stripe), **profile views** / **conversion rate** (needs event tracking) — clearly labelled, not `$0` fake charts |
| Migration | **Not required** for v1 — uses existing rows only |

### Buyer Browse Workflows v1

| Area | Behavior |
|------|----------|
| Route | **`/browse`** — buyer, guest, and admin see **creator-published workflows**; creators see **open buyer requests** (never the workflow marketplace) |
| Query | **`loadBuyerBrowseMarketplace()`** — explicit columns; `published` + `public` + AI-safe (`published` / `ai_approved`, no risk flags); deduped by id |
| Layout | Stats row, search/filters/sort, professional workflow cards, detail panel, secondary **Platform starter examples** |
| Cards | Creator name/tier/verified, AI quality badge, features/setup preview, preview link, **View details**, **Request / Customize** |
| Request flow | **`/request?workflowId=`** — logged-out users sign in first (`/signin?redirect=…`); request page shows customization context unchanged |
| Empty state | **“Creator workflows are coming soon.”** + labelled starter examples (never fake creator listings) |
| Role safety | Creator nav **Buyer Requests** → same `/browse` route, different content (`CreatorBuyerRequestsBrowse`) |

### Creator Workflows v2

| Area | Behavior |
|------|----------|
| Route | **`/dashboard/workflows`** — list + **`/dashboard/workflows/:id/edit`** — sectioned editor |
| Stats & filters | Total, published, needs improvement, drafts, buyer request counts; chips + search + sort |
| Cards | Title, category, industry, status/visibility/AI badges, score, missing/risk counts, request count, role-safe actions (Edit, AI review, Preview, Publish, Hide, Archive) |
| AI review | Rules-based panel (`workflowAI.ts`) — plain-English readiness, missing items, risks, suggested improvements, auto-publish eligibility |
| Buyer preview | `WorkflowBuyerPreview` — mirrors buyer Browse card; Request button preview-only |
| Request tracking | Counts + recent rows from **`buyer_requests.source_workflow_id`** — no new migration |
| Browse compatibility | **`getPublishedWorkflowsForBuyers`** unchanged — published + public + safe AI + no risks |


### Proposal / pricing workflow (v1 — scope approval, no payments)

- **SQL:** `supabase/migrations/proposal-pricing-foundation.sql` adds **`project_proposals`** (rules-filled scope, placeholder **`proposed_price` / `platform_fee` / `creator_payout`**, lifecycle **`proposal_status`**, **`buyer_approval_status`**, frozen **`workflow_context_snapshot`** for workflow-backed requests) and extends **`orders`** with **`proposal_id`**, **`proposal_status`** (mirrors proposal lifecycle once linked), **`buyer_approval_status`**, **`payment_status`** (stays **`unpaid`**). File includes **TEMP DEV RLS — replace before production.** No new migration needed for v1 tidy-ups — buyer approval values use plain text columns.
- **Generator:** `src/lib/proposals.ts` — **`generateProposalDraft`**, **`generateAndPersistProposal`**, **`adminUpsertProposalFields`** (save without requiring a prior generate), **`adminSetProposalStatus`**, buyer actions — rules-only (no external AI).
- **Statuses:** **`proposal_status`** remains `draft` \| `sent` \| `buyer_approved` \| `buyer_changes_requested` \| `buyer_rejected` \| … (DB CHECK). **`buyer_approval_status`** is normalized in-app to **`pending`** \| **`approved`** \| **`changes_requested`** \| **`rejected`** (legacy `buyer_approved` / `buyer_rejected` rows are treated as approved/rejected when read).
- **Admin:** `/admin` → **Project Workflow** → **Official proposal (scope & price)** — empty-state banner, summary cards when saved, step labels (**Draft & save** vs **Send & outcomes**), primary **[Generate / Regenerate]** + **[Save proposal]** (upserts one row per request/order), lifecycle buttons (**Mark sent**, buyer outcomes for testing), workflow customization context, copy helpers.
- **Buyer:** Dashboard **Proposals & pricing** — latest proposal per request (deduped), selected creator + workflow publisher labels when known; respond when **`proposal_status === sent`**. Disclaimer: **payments not active** — approval confirms **project scope** only for MVP; Stripe and protected handoff come later.
- **Creator:** `/dashboard/projects/:orderId` — read-only proposal + workflow banner + **guidance** by proposal status; copy buttons; cannot edit proposal rows.
- **Order integration:** Buyer **approve** sets **`proposal_status = buyer_approved`**, **`buyer_approval_status = approved`**, syncs **`orders`**, keeps **`payment_status` unpaid**, may advance **`assigned` → `in_progress`** — **no Stripe charge**.
- **Future:** Stripe checkout, escrow / handoff security, production RLS, creator payout protection policies.

### Project Agreement v2 (buyer ↔ creator on project workspace)

- **Where:** `/dashboard/projects/:orderId` — **Project Agreement** panel (primary scope UI; replaces admin-first proposal flow on participant pages).
- **Sections:** Project title, scope, included/not included, timeline, revisions, price placeholder, buyer/creator responsibilities, delivery requirements, change notes, AI readiness.
- **Edit:** Before both parties confirm, buyer/creator can **Edit Agreement** or **Request Changes** (note required). Admin has **Edit Agreement (override)** on pipeline cards. Saving resets confirmations to pending.
- **Confirm:** Buyer and creator each **Confirm Agreement** independently. Both confirmed → `agreement_status = confirmed`, `locked_at` set — **no Stripe / no payment**.
- **Copy:** Full agreement, buyer summary, creator scope, delivery requirements, change request.
- **Admin:** Oversight strip + optional **View agreement** panel — status, confirmations, missing/risk counts, change note; no default generate/send controls.
- **Data:** Reuses `project_proposals` + optional columns from `supabase/migrations/project-agreement-fields.sql`.

### Project Agreement v1 (buyer ↔ creator on project workspace)

- **Where:** `/dashboard/projects/:orderId` — **Project Agreement** panel (replaces admin-first proposal UX on the project page).
- **Flow:** Either party can **Generate AI Agreement Draft** (rules-based, `src/lib/projectAgreementAI.ts`). Buyer **Confirm Agreement** and creator **Confirm Agreement** independently. When both confirm → `agreement_status = confirmed`, `locked_at` set, order `agreement_status` mirrored — **no Stripe / no payment**.
- **Data:** Reuses `project_proposals` (one row per order) + optional columns from `supabase/migrations/project-agreement-fields.sql`.
- **Admin:** Pipeline order cards show agreement status + buyer/creator confirmed + AI missing/risk counts — no generate/send controls on main paths (deferred **Later: Proposals** tab unchanged).

### Core marketplace loop (QA v1)

End-to-end path: **buyer request** → **creator apply** → **buyer review/select** → **`orders` project** → **workspace deliverable** → **central `/messages`**. Role nav: buyer **Overview / Browse Workflows / My Requests / Messages**; creator **Buyer Requests / Applications / Projects / Workflows / Messages**; admin **AI Command Center** sections via `/admin#…`. Full manual checklist: **`docs/marketplace-application-flow.md`** (Core marketplace QA checklist). **Deferred:** Stripe, proposal enforcement UI, GitHub OAuth, external AI APIs.

### Marketplace Application Foundation v1


| Concept | Detail |
|---------|--------|
| SQL | `marketplace-application-foundation.sql` adds `request_applications`, `published_workflows`, `project_messages`; extends `buyer_requests` + `orders`. **`workflow-ai-review-fields.sql`** adds rules-based AI review columns on `published_workflows` (quality score, readiness, risk flags, etc.). **`workflow-request-linking.sql`** adds buyer-request provenance when a buyer customizes a published workflow (`source_type`, `source_workflow_*`, `customization_notes`, `requested_from_workflow`). |
| Role-aware Browse | **`/browse`** — creators browse open marketplace buyer requests (+ Apply). Buyers, admins, and logged-out visitors see **creator `published_workflows`** that are **published + public + AI-visible** (`ai_review_status` in **`published` / `ai_approved`**, no risk flags), plus labelled **Platform starter examples**. Workflow cards include **Request / Customize** → **`/request?workflowId=`** (buyer/creator split unchanged — creators never see the buyer workflow storefront on Buyer Requests browse). **`/dashboard/browse`** redirects (creators → `/dashboard/applications`, everyone else → `/browse`). Creator dashboard includes **`Applications`** and **`Workflows`** (`/dashboard/workflows`). |
| Buyer selection | **My Requests & Applicants** (`#buyer-my-requests-applicants`) — rich request cards, **next best action** hints (wait → review → select → message → track delivery → approve delivery). Applicant rows: tier + verified pill, **rules-based comparison** (fit, strengths, concerns, clarity, timeline confidence), **Original Workflow Creator** badge when applicable, **Shortlist**, **Reject applicant**, **Select creator** (confirmation dialog), **Message creator**, **View public profile** when enabled. Updates verify buyer ownership before mutating `request_applications`. |
| Messaging | **`/messages`** — two-panel central inbox (**`src/lib/messages.ts`** + **`src/lib/messageInbox.ts`**). Conversations group by buyer×creator; **order anchor** preferred after selection (application stub absorbed; request-phase rows merge into project thread). Filter chips (All / Requests / Projects / Selected Creators), search, context card, rules-based **Conversation helper**. Deep links: **`/messages?orderId=…`**, **`/messages?buyerRequestId=…&creatorProfileId=…`**. **No realtime · no uploads · unread placeholder**. Admin inbox empty by design (moderation later). |
| Admin | **`/admin`** is a tabbed **AI operations command center** (one section at a time): Command Center (rules-based focus cards), Buyer Requests, Creator Applications, Marketplace Applications, Projects/Pipeline, Deliverables, Published Workflows, Messages placeholder, Platform Health, and a collapsed **Later: Proposal & Payment** panel for test-only proposal tools. **Proposal/pricing is deferred** — no generate/save/send controls on main request or project cards; buyer/creator proposal UIs remain read-only where data exists. Admin role is **oversight, support, and override** (e.g. marketplace select fallback), not the default buyer selector. |
| Future | Stripe, production-scoped policies, realtime messaging. |

### Buyer workflow customization + original creator first-right (v1)

- Buyers hit **Request / Customize** on **`/browse`** workflow cards → **`/request?workflowId=`** loads public, AI-eligible workflows only (`fetchPublishedWorkflowForPublicRequest`).
- Submissions insert **`buyer_requests`** with `source_type = 'workflow'`, `source_workflow_id`, `source_workflow_title`, `source_creator_profile_id`, structured **`customization_notes`**, `requested_from_workflow = true`, plus merged context in `style_notes` for older readers.
- **First-right-to-build (priority only):** the **original workflow publisher** sees these requests first with clear badges (**Your workflow was requested** on Browse; **Workflow requests from your published workflows** on **Dashboard → Applications**). Other creators still see open customization requests as **Workflow customization request** when visibility allows. **No auto-assignment** — the buyer always chooses the winning applicant; **`selectCreatorForRequest`** + **`orders`** lineage unchanged.
- **Buyer applicants:** the original publisher’s application row can show an **Original Workflow Creator** badge; buyers may still select any applicant.
- **Admin:** **`/admin`** buyer-request queue labels workflow-backed rows (**Source: Reusable Workflow**, workflow title, whether the original creator applied, applicant counts, selected creator). Manual override remains escalation, not the default path.
- **SQL:** apply **`supabase/migrations/workflow-request-linking.sql`** so inserts/selects against the provenance columns succeed (no additional migration required for first-right UI).

### Project Workspace Polish v3

| Area | Behavior |
|------|----------|
| Route | **`/dashboard/projects/:orderId`** — official project workspace for assigned **creator** or owning **buyer** |
| Header | Project title, buyer/creator context, project + agreement + deliverable badges, **Message** shortcut, delivery anchor when applicable |
| Status timeline | Six plain-English steps (request → creator → agreement → build → delivery → completed) with dates only when stored |
| Layout | Two-column: **left** — overview, Project Agreement, deliverables · **right** — next best action, messages, activity, build checklist (creator) · **full-width** creator brief |
| Project Agreement | Primary scope UI on the project page — buyer/creator confirm, request changes, regenerate, copy helpers; **no Stripe** |
| Deliverables | Lightweight MVP — creator submit/update URLs; buyer sees links after internal approval; empty states when none yet |
| Build checklist | Grouped operational checklist for creators (rules-based, no external AI) |
| Deferred | Stripe, payment holding, proposal enforcement UI, external AI APIs |

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
| AI | Rules-based only — `src/lib/profileAI.ts`, `src/lib/buildPacket.ts`, **`src/lib/workflowAI.ts`** (creator workflow quality scoring). No external APIs; future model calls should run via **Supabase Edge Functions** only. |
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
    workflow-ai-review-fields.sql            # Additive AI review columns + indexes on published_workflows
    workflow-request-linking.sql             # buyer_requests ↔ published workflow provenance + customization_notes
    proposal-pricing-foundation.sql           # project_proposals + orders proposal pointers (TEMP DEV RLS — see file)
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

