# MicroBuild — Profile & Account System Audit

**Date:** May 2026  
**Status:** Pre-phase-2 audit — admin auth deferred, dev-mode dashboard active  
**App stack:** React / Vite / TypeScript + Supabase (no auth active, no Stripe yet)

> **Auth status update (May 2026):** Admin authentication infrastructure was built (`src/lib/admin.ts`, `src/components/AdminRouteGuard.tsx`, `src/pages/AdminLogin.tsx`) but intentionally disconnected. `/admin` loads directly without login in dev mode. The auth layer will be reconnected in the Admin Protection phase. See Section 9 for the recommended build order.

---

## Table of Contents

1. [What Currently Works](#1-what-currently-works)
2. [What Is Incomplete](#2-what-is-incomplete)
3. [What Is Broken or Risky](#3-what-is-broken-or-risky)
4. [What Is Placeholder / Dev-Mode Only](#4-what-is-placeholder--dev-mode-only)
5. [What Needs Supabase Auth Later](#5-what-needs-supabase-auth-later)
6. [What Needs Stripe Later](#6-what-needs-stripe-later)
7. [What Can Be Fixed Now (No Auth / No Stripe)](#7-what-can-be-fixed-now-no-auth--no-stripe)
8. [Recommended Build Order](#8-recommended-build-order)
9. [Next Build Phase Recommendation](#9-next-build-phase-recommendation)

---

## 1. What Currently Works

### Creator Application Submission
- Two-step application flow with tier selection: Free, Professional, Verified.
- Tier-gated form fields: Professional collects portfolio/projects, Verified collects credentials/GitHub/LinkedIn/case studies.
- Pricing clearly shown before submission (no charge at apply time).
- Row inserts into `creator_applications` via Supabase anon INSERT policy.
- `tier`, `requested_plan_price`, `top_projects`, `service_capabilities`, `fulfillment_speed`, `github_url`, `linkedin_url`, `certifications`, `credential_links`, `case_studies` columns are all migrated and present (via `creator-tier-fields.sql`).
- Application `status` CHECK constraint supports 8 values: `new`, `reviewing`, `needs_portfolio_review`, `needs_more_info`, `approved_pending_payment`, `active`, `rejected`, `suspended`.
- Success state explains tier-specific review/payment timeline to applicants.

### Admin Dashboard
- Reads live `buyer_requests`, `creator_applications`, and `microbuild_templates` from Supabase.
- Status dropdown writes updated status back to Supabase for both requests and applications.
- Rule-based AI operations panel generates build packets, lead scores, and creator fit reviews.
- `CreatorCard` shows tier badge, application detail, AI review, profile preview, and approval action buttons.
- `ApprovalActionRow` buttons update application status in Supabase.
- `CreateProfileButton` inserts a new row into `creator_profiles` based on the application data.
- Error boundary (`SectionErrorBoundary`) and per-row `try/catch` prevent a single bad row from blanking the page.
- Defensive helpers (`safeArray`, `safeText`, `safeDate`, `safeNumber`, `normalizeBuyerRequest`, `normalizeCreatorApp`) protect against null/unexpected types from Supabase.

### Profile System Foundation (Schema)
- `creator_profiles` migration adds 20+ new columns with safe `IF NOT EXISTS` guards.
- `user_id` is now nullable (allows admin-created profiles before auth users exist).
- `creator_application_id` FK links profiles back to their source application.
- `public_profile_status` column controls public visibility (`hidden`, `public`, `paused`).
- `approval_status`, `subscription_status`, `verification_status`, and `tier` columns all present with CHECK constraints.
- Updated-at trigger is in place.
- Indexes on `public_profile_status`, `tier`, `slug`, and `creator_application_id`.

### Public-Facing Profile Routes
- `/creators` — fetches profiles where `public_profile_status = 'public'` and renders a grid.
- Shows "Creator directory coming soon" when no public profiles exist.
- `/creator/:id` — fetches a single profile by UUID; hides if `public_profile_status !== 'public'` (client-side check).
- Both pages use defensive `safeArr()` wrappers and `normalizeCreatorProfile()`.
- Profile pages include tools, niches, certifications, portfolio links, GitHub/LinkedIn.

### `src/lib/profiles.ts`
- `normalizeCreatorProfile()` — sanitizes raw Supabase data into typed `CreatorProfileRow`.
- `normalizeCreatorApplicationToProfilePreview()` — builds a full preview from application data.
- `buildCreatorProfileInsert()` — constructs the DB payload for `creator_profiles`.
- `generateCreatorProfileAISummary()` — rule-based profile summary (no external AI).
- `getCreatorBadges()`, `getCreatorTierLabel()`, `getVerificationLabel()`, `getProfileVisibilityLabel()`, `getApprovalStatusLabel()` — UI label helpers.
- `generateCreatorSlug()` — URL-safe slug from display name + UUID prefix.

---

## 2. What Is Incomplete

### A. No Admin UI to Activate a Profile
**Severity: High**

The "Create Profile" button creates a `creator_profiles` row with `public_profile_status = 'hidden'`. There is **no admin UI control** to change a profile's `public_profile_status` to `'public'`. The only way to make a creator profile visible is to manually edit the row in the Supabase Table Editor.

The full activation workflow is broken at step 3:
1. ✅ Admin sets application status to `approved_pending_payment` or `active`
2. ✅ Admin clicks "Create Profile" → row created with status `hidden`
3. ❌ **No admin UI step exists** to flip `public_profile_status` to `public`

### B. No Admin Profile Management Section
**Severity: Medium**

After a profile is created, there is no section in `/admin` to:
- List existing `creator_profiles` rows
- Update `approval_status`, `subscription_status`, or `public_profile_status`
- See which profiles are live vs hidden
- Delete or suspend a profile

Admin must use the Supabase Table Editor for all post-creation profile management.

### C. No Duplicate Profile Check
**Severity: Medium**

`createCreatorProfile()` in `Admin.tsx` does not check if a `creator_profiles` row already exists for the given `creator_application_id` before inserting. Clicking the "Create Profile" button a second time will attempt a second INSERT, and since there is no UNIQUE constraint on `creator_application_id`, it can succeed — resulting in duplicate profiles for the same applicant.

**Missing SQL constraint:**
```sql
ALTER TABLE public.creator_profiles
  ADD CONSTRAINT creator_profiles_app_id_unique
  UNIQUE (creator_application_id);
```

### D. Bio Field Quality Risk
**Severity: Low**

`buildCreatorProfileInsert()` in `profiles.ts` sets `bio` to:
```typescript
safeStr(app.message) || safeStr(app.experience).slice(0, 280) || null
```
If the applicant left `message` blank, their raw `experience` text (which may be a list of past jobs or unstructured notes) becomes the public bio. This can produce unprofessional or confusing profile descriptions.

### E. Buyer / Business Profile System Is Structural Only
**Severity: Medium**

The `business_profiles` table schema was expanded (contact_name, website_url, instagram_url, google_business_url, main_goal, preferred_microbuild_type, notes). However:
- No buyer-facing UI creates a `business_profiles` row.
- The RLS policy for `business_profiles` INSERT still requires `auth.uid() = user_id` (authenticated insert only).
- Buyer requests store business info inline in `buyer_requests` columns directly.
- There is no buyer profile page, buyer directory, or buyer account concept in the frontend.
- `business_profiles.user_id` FK still references `public.users` — inserting without auth will fail with an FK violation.

### F. Creator Application Success Email
**Severity: Low (for MVP)**

After submitting an application, the applicant receives only an on-screen success message. No email is sent:
- Application received confirmation
- Approval notification
- Profile activation notification
- Payment request (when Stripe is added)

This requires a backend service or Supabase Edge Function.

### G. Slug Not Always Unique
**Severity: Low**

`generateCreatorSlug()` produces `{name-slug}-{id.slice(0,8)}`. While the 8-char UUID prefix makes collisions very unlikely, the DB has a UNIQUE constraint on `slug`. If the same name+UUID prefix somehow collides (unlikely), the INSERT will fail. More practically, slug is not always set before the profile is used — `creator_profiles` rows fetched by ID (`/creator/:id`) do not use the slug route yet.

### H. No Slug-Based Routing
**Severity: Low**

`/creator/:id` uses the UUID as the route param. The `slug` column is generated and stored, but the public route does not use it. There is no `/creator/:slug` route, which would produce cleaner, shareable URLs.

---

## 3. What Is Broken or Risky

### A. RLS Policy Conflict: Dev Admin Read Exposes All Profiles Publicly
**Severity: Critical (security)**

`supabase/policies.sql` has two SELECT policies on `creator_profiles`:

| Policy | Role | USING clause |
|--------|------|--------------|
| `creator_profiles_public_read` | `anon, authenticated` | `public_profile_status = 'public'` |
| `creator_profiles_dev_admin_read` | `anon, authenticated` | `true` (no restriction) |

PostgreSQL RLS with permissive policies uses **OR logic**: if ANY policy matches, the row is returned. The `dev_admin_read` policy with `USING (true)` completely overrides the public-only policy. **This means:**

- Every `creator_profiles` row — including `hidden`, `draft`, and `rejected` profiles — is readable by any anonymous HTTP caller via the Supabase REST API.
- `admin_notes` and `ai_profile_summary` (internal admin fields) are exposed publicly.
- The `public_profile_status !== 'public'` check in `CreatorProfile.tsx` is purely client-side and provides no real security.

**The profile privacy system does not work at the database level while both policies coexist.**

**Immediate mitigation (without removing admin read ability):** Change `creator_profiles_dev_admin_read` to a named/service-role-only policy, or remove it and rely on admin fetching profiles by UUID directly. The public query with `.eq('public_profile_status', 'public')` does work correctly at the query level, but any direct REST call bypasses it.

### B. `SELECT *` on Public Profile Queries Leaks Admin Fields
**Severity: High (data exposure)**

Both `CreatorDirectory.tsx` and `CreatorProfile.tsx` use `.select('*')`. This fetches every column including:
- `admin_notes`
- `ai_profile_summary`
- `ai_profile_score`

These are internal admin fields that should never be exposed to the public-facing UI. Even if these values are not rendered in JSX today, they are transmitted to the browser in the API response and visible in network DevTools.

**Fix:** Replace `.select('*')` with an explicit column list that excludes internal admin fields.

### C. Anon UPDATE Policies Are Fully Open (Dev Mode)
**Severity: High (security)**

`supabase/policies.sql` includes temporary dev policies that allow the `anon` role to UPDATE rows without any restriction:
- `buyer_requests` — anon can update ANY row's status
- `creator_applications` — anon can update ANY row's status
- `creator_profiles` — anon can insert/update ANY row

Any visitor to the site who knows the Supabase project URL and anon key (which is exposed client-side by design) can call the REST API directly and:
- Set any buyer request to `rejected`
- Set any creator application to `active` or `suspended`
- Set any profile's `public_profile_status` to `public` or `paused`

This is explicitly documented as temporary dev-only, but is a critical risk before any auth or role-based access is added.

### D. `CreatorApplicationRow` Type Is Duplicated and Inconsistent
**Severity: Medium (code quality / crash risk)**

`Admin.tsx` defines its own local `CreatorApplicationRow` interface with `status: string` (wide type). `src/types/database.ts` defines `CreatorApplicationRow` with `status: ApplicationStatus` (strict union type). This causes:
- Cast chains: `app as unknown as DBCreatorApplicationRow` in `createCreatorProfile()`
- Risk of runtime drift if the two definitions become inconsistent
- TypeScript's type safety is bypassed by the `unknown` double-cast

### E. Dead-Code Branch in `normalizeCreatorApplicationToProfilePreview`
**Severity: Low (misleading)**

```typescript
// profiles.ts line 233–234
const approvalStatus: ProfileApprovalStatus =
  tier === 'free' ? 'approved_pending_payment' : 'approved_pending_payment';
```
Both branches of the ternary return the same value. This is not a bug (the value is correct), but it is misleading code that suggests there was meant to be a distinction between free and paid tiers at this point. Free tier should probably start as `'draft'` until the admin explicitly approves it, rather than pre-assigning `approved_pending_payment`.

---

## 4. What Is Placeholder / Dev-Mode Only

| Feature | Current State | What It Means |
|---------|---------------|---------------|
| Admin auth | Infrastructure built but **intentionally disconnected** — `/admin` loads directly | Auth files exist (`src/lib/admin.ts`, `AdminRouteGuard`, `AdminLogin`) but are not wired. Auth phase is deferred. |
| Admin RLS update policies | `USING (true)` on anon role | Any user with the anon key can update requests/applications/profiles |
| Creator login | Not implemented | Creators cannot view their own application status |
| Buyer login | Not implemented | Buyers cannot see their past requests |
| Payment processing | No Stripe, no payment | `approved_pending_payment` status is set but no actual charge occurs |
| Email notifications | Not implemented | No emails sent on application, approval, or rejection |
| AI profile review | Rule-based frontend only | No real AI scoring — deterministic from form data |
| Build matching | Not implemented | Creator-buyer matching is manual admin activity |
| Profile photo upload | Not implemented | `profile_photo_url` column exists but no upload UI |
| Admin notes field | Not editable via UI | Admin notes must be written directly in Supabase Table Editor |
| Slug-based routing | Column exists, route uses `:id` | Slugs are generated and stored but not used in URLs |

---

## 5. What Needs Supabase Auth Later

These features cannot be built without Supabase Auth (or equivalent):

1. **Creator account login** — creators need a session to view their own application status and edit their profile.
2. **Buyer account login** — buyers need a session to view past requests and track build progress.
3. **Admin route protection** — `/admin` must require an authenticated admin user (Supabase `service_role` check or custom claims).
4. **RLS policy replacement** — all `anon` UPDATE/INSERT policies must be replaced with policies using `auth.uid()` or a service-role check.
5. **Creator profile self-editing** — creator can update their own `bio`, `tools`, `niches`, and `portfolio_links` after approval.
6. **Application status notifications** — email or in-app notification when status changes requires a trigger and `auth.users.email`.
7. **Build assignment** — assigning a creator to a buyer request requires knowing both parties' auth identities.
8. **Subscription management** — `subscription_status` lifecycle (e.g., past_due, canceled) requires auth context to identify whose subscription changed.

---

## 6. What Needs Stripe Later

These features require Stripe integration:

1. **Professional tier payment** — $15/month subscription after `approved_pending_payment`.
2. **Verified tier payment** — $25/month subscription after `approved_pending_payment`.
3. **Subscription status sync** — `subscription_status` column should update from Stripe webhooks (`active`, `past_due`, `canceled`).
4. **Payment before profile activation** — Pro/Verified profiles should only become `public` after Stripe confirms the first payment.
5. **Buyer payments** — future buyer-side payments for MicroBuild deliverables.
6. **Creator payouts** — creator revenue distribution.

Note: Free tier creators do NOT need Stripe — they should be activatable by admin without payment.

---

## 7. What Can Be Fixed Now (No Auth / No Stripe)

These are safe improvements that require only frontend or SQL changes:

### Fix 1 — Add UNIQUE constraint on `creator_application_id`
Add to a new migration file or to `profile-system-foundation.sql`:
```sql
ALTER TABLE public.creator_profiles
  ADD CONSTRAINT creator_profiles_app_id_unique
  UNIQUE (creator_application_id);
```
This prevents duplicate profiles if the "Create Profile" button is clicked twice.

### Fix 2 — Check for existing profile before creating
In `Admin.tsx` `createCreatorProfile()`, query `creator_profiles` for an existing row with the same `creator_application_id` before inserting. Show an "Already created" message instead of attempting a duplicate insert.

### Fix 3 — Replace `SELECT *` with explicit column lists
In `CreatorDirectory.tsx` and `CreatorProfile.tsx`, change:
```typescript
.select('*')
```
To an explicit list that excludes `admin_notes`, `ai_profile_summary`, `ai_profile_score`.

### Fix 4 — Add admin UI to set `public_profile_status`
Add a simple dropdown or toggle button in the Admin `CreatorCard` to change an existing profile's `public_profile_status`. This makes the approval-to-activation flow completable entirely within the admin UI.

### Fix 5 — Fix the dead-code branch in `profiles.ts`
Change line 233–234 in `profiles.ts`:
```typescript
// Before (both branches are identical — misleading)
const approvalStatus: ProfileApprovalStatus =
  tier === 'free' ? 'approved_pending_payment' : 'approved_pending_payment';

// After (clearer intent)
const approvalStatus: ProfileApprovalStatus = 'draft';
```
New profiles should start as `draft`. The admin explicitly sets `approved_pending_payment` when approving, so pre-assigning this status is incorrect business logic.

### Fix 6 — Replace admin's local `CreatorApplicationRow` with the database.ts type
Remove the duplicate local type definition in `Admin.tsx` and import `CreatorApplicationRow` directly from `src/types/database.ts`. This eliminates the `as unknown as DBCreatorApplicationRow` double-cast and centralizes the type.

### Fix 7 — Handle `business_profiles` FK constraint
The `business_profiles` table still has a FK to `public.users`. The migration makes `user_id` nullable but doesn't DROP the FK. If a buyer profile is ever created without an auth user, it will fail with `23503 FK violation`. The FK should either be dropped (until auth is added) or the INSERT should be blocked in the frontend entirely.

---

## 8. Recommended Build Order

```
Phase 1 (Now — no auth needed):
  ✅  Duplicate profile prevention (Fix 1 + Fix 2)
  ✅  Explicit column selection on public queries (Fix 3)
  ✅  Admin UI to set public_profile_status (Fix 4)
  ✅  Fix approvalStatus dead-code branch (Fix 5)
  ✅  Consolidate CreatorApplicationRow type (Fix 6)

Phase 2 — Admin Protection (Supabase Auth):
  • Add Supabase Auth for admin route
  • Replace all anon UPDATE/INSERT policies with auth-based policies
  • Gate /admin behind a session check
  • Creator login — view own application status

Phase 3 — Stripe Subscriptions:
  • Add Stripe Checkout for Pro/Verified payment after approval
  • Sync subscription_status via Stripe webhooks
  • Activate creator profile only after Stripe confirms payment

Phase 4 — Creator Account System:
  • Creator profile editing (self-serve)
  • Public profile photo upload
  • Creator dashboard (/creator/dashboard)
  • Slug-based routing (/creator/:slug)

Phase 5 — Buyer Account System:
  • Buyer login + buyer_requests history
  • business_profiles linked to auth user
  • Build status tracking per request

Phase 6 — Build Matching & Fulfillment:
  • Assign creator to buyer request
  • Build status workflow
  • Delivery confirmation + ratings
  • Email notifications
```

---

## 9. Next Build Phase Recommendation

### Recommendation: **Admin Protection**

**Rationale:**

The most pressing risk in the current system is not missing features — it is that the admin dashboard and all Supabase write operations are completely unauthenticated. Any visitor can:

1. Navigate to `/admin` and view every buyer request and creator application.
2. Call the Supabase REST API directly (the anon key is exposed client-side) and update any buyer request status, any creator application status, or any creator profile.
3. Read all creator profiles including hidden/rejected profiles and their `admin_notes`.

Before adding the creator directory, Stripe, or any buyer account system, the admin route and its RLS policies should be secured. The simplest viable approach for MicroBuild at this stage is:

- Add Supabase Auth for a single admin user (email + password, no public signup).
- Protect `/admin` with a session check that redirects unauthenticated visitors.
- Replace the temp `USING (true)` UPDATE policies with `USING (auth.uid() IS NOT NULL)` or a service-role key check.
- Keep the public SELECT and INSERT policies for buyers/applicants as-is.

This is a focused, scoped change that does **not** require building a full multi-user auth system. It adds one admin account and gates one route, which is the minimum needed before any public-facing launch.

**Alternative — Profile Workflow Only:**  
If admin security is deferred, the next most useful improvement is completing the profile activation loop (Fix 1–5 above). This makes the system actually functional end-to-end without auth: admin can approve → create profile → activate profile → profile appears at `/creators`. This is a valid short-term path if MicroBuild is still in purely private testing.

---

*Audit performed May 2026. Re-audit recommended after Admin Protection phase is complete.*
