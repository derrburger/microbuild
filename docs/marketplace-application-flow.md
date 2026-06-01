# MicroBuild Marketplace Application Flow (Foundation v1)

## UX Flow Simplification v1 (navigation + language)

| Role | Nav priority | Dashboard focus |
|------|----------------|-----------------|
| **Buyer** | Browse Workflows, My Requests, Messages, Dashboard, Settings | **`/dashboard/requests` — My Requests v2** (summary cards, filters, searchable request cards, applicant review, selected creator, project timeline, rules-based **AI Request Monitor**), message/select CTAs |
| **Creator** | Buyer Requests, Applications, Projects, Workflows, Messages, Profile | Marketplace summary cards, **My Applications** with source type + selection label, project workspace when selected |
| **Admin** | AI Command Center, Messages (oversight tabs inside `/admin`) | Tabbed command center — not the default buyer selector |

**Status labels:** `src/lib/statusLabels.ts` + `StatusBadge` map DB values (e.g. `buyer_selected`, `submitted_for_review`, `approved_pending_payment`) to plain English with consistent pill colors (green = active/selected, amber = pending/review, red = rejected, blue/neutral = info).

**Deferred (unchanged):** Stripe checkout (plans visible; billing placeholders only), GitHub OAuth, external AI APIs, full proposal/payment/agreement UI on main admin paths.

---

## Plan Benefits + Feature Gating v1

- **Entitlements:** `src/lib/entitlements.ts` — buyer/creator plan limits and `canUseFeature(role, plan, featureKey, usageCounts)`.
- **Usage:** `src/lib/planUsage.ts` — counts for gating (requests, applications, published workflows).
- **Upgrade UI:** `src/components/UpgradePrompt.tsx` — shown when a user hits a limit or opens a locked feature; links to `/dashboard/billing` (no checkout).
- **Buyer plans (summary):**
  - **Free:** 1 active / 1 monthly request, basic applicant review, limited request summary (not full AI overview), no advanced AI monitor.
  - **Starter ($19):** 3 active / 5 monthly, workflow customization, full AI Request Overview, basic request management.
  - **Growth ($49):** 10 active / 20 monthly, advanced AI monitor, priority visibility, full request management, team-ready view.
  - **Pro:** custom limits — contact required.
- **Creator plans (summary):**
  - **Free:** 3 applications/mo, 1 published workflow, basic analytics counts, limited AI review.
  - **Professional ($15):** 20 applications/mo, 5 workflows, full analytics + AI monitor + full workflow AI review.
  - **Verified ($25):** 50 applications/mo, 15 workflows, verified badge (after admin), priority visibility.
- **Gated surfaces:** `/request` submit, `/dashboard/requests`, `/browse` apply, `/dashboard/workflows` publish, `/dashboard/analytics` premium sections.
- **Never blocked (project safety):** view existing requests/applications; messaging on active projects; agreements; delivery review; cancel/archive/delete when needed; edit drafts; unpublish workflows; finish selected projects.
- **Security note:** v1 is **frontend/helper gating only**. Before paid launch: Supabase RLS, Edge Functions, Stripe webhooks syncing `buyer_plan` / `creator_profiles.tier` / `subscription_status`.
- **SQL:** optional `supabase/migrations/subscription-plan-fields.sql` adds `user_profiles.buyer_plan` and Stripe-related columns (`ADD COLUMN IF NOT EXISTS`). Creator tier stays on `creator_profiles.tier`.

## Pricing + Billing Visibility v1

- **Config:** `src/lib/pricingPlans.ts` — marketing copy and comparison tables.
- **Public `/pricing`:** Buyer + Creator plans; signed-in → `/dashboard/billing`.
- **Signed-in `/dashboard/billing`:** Current plan, usage, locked features, upgrade reasons; Stripe **not connected**.
- **Stripe:** `src/lib/billing.ts` — checkout/portal return “coming soon” — no charges.

---

## Real Analytics + AI Monitor v1

- **Route:** `/dashboard/analytics` (account dropdown — creators and buyers; admins see platform summary + link to Command Center).
- **Helpers:** `src/lib/analytics.ts` (metrics), `src/lib/analyticsAI.ts` (rules-based insights).
- **Plan gating:** Free Creator sees top-line counts only; Professional+ unlocks full section breakdowns and AI Monitor. Free Buyer sees basic request metrics; Growth+ unlocks advanced AI monitor panel (locked preview + upgrade prompt below).
- **Real metrics (v1):** counts and breakdowns from `request_applications`, `orders`, `published_workflows`, `project_proposals`, `deliverables`, `project_messages`, `buyer_requests`, and creator profile strength (`profileAI.ts`).
- **Empty states:** sections show **“Not enough data yet”** when no rows exist — never fabricated numbers.
- **Future placeholders (labelled):** earnings/spend (Stripe), profile views, conversion rate, lead/booking metrics — require payment integration or `analytics_events` tracking (optional migration not added in v1).
- **AI Monitor checks (rules-based):**
  - **Creator:** profile visibility/strength, portfolio/avatar gaps, application performance, stalled projects, agreement/delivery risks, workflow publish opportunities, messages needing reply.
  - **Buyer:** no applicants, applicants awaiting review, agreement not confirmed, deliverable review pending, thin workflow customization notes, messages needing reply.
  - **Admin:** open requests, pending creator onboarding, deliverables to review, stalled projects (summary in analytics page; full queues in `/admin`).

---

## Primary product direction (v1 foundation)

MicroBuild is shifting from admin-only assignment to an **optional marketplace**: buyers post **open requests**, creators **apply**, buyers **pick** a creator, and the system **instantiates / updates** the pipeline `orders` row. Admin still **observes**, can **fallback-assign**, **override**, and provides **AI oversight** on published workflows — but **workflow publishing is AI-first**, not an admin approval queue.

This document summarizes the marketplace foundation introduced with `marketplace-application-foundation.sql`, **`workflow-ai-review-fields.sql`** (additive AI columns on `published_workflows`), **`/browse` role-aware storefront routing**, **`/dashboard/applications` creator history**, **`/dashboard/workflows` creator workflow studio**, and the legacy shim **`/dashboard/browse` → redirect**.

---

## Admin dashboard (operations layout)

- **`/admin`** uses **horizontal tabs** so only one major queue is visible at a time (reduces the old single-page “wall of buttons”).
- **AI Command Center** (default tab): rules-based cards (counts, focus sentence, jump buttons) — **no external AI API**.
- **Proposal & payment** moved to **Later: Proposal & Payment** (collapsed). Main buyer request and project cards show a **deferred** badge only; full `AdminProposalSection` remains for optional testing.
- **Deliverables** have a dedicated review tab; project pipeline cards show status + link, not full review actions.
- **Marketplace Applications** tab lists `request_applications` with buyer override only when needed; buyer selection stays primary.

---

## Proposal / pricing workflow (legacy storage — Project Agreement is primary UI)

**Project Agreement v1** (above) is the buyer/creator-facing scope path on the project workspace. The same **`project_proposals`** table stores agreement rows (one per order).

Legacy admin proposal tooling (still available under **Later: Proposal & Payment** for testing):

1. **Admin** can still generate/save/send via `src/lib/proposals.ts` (not required for marketplace happy path).
2. **Buyer dashboard** may list older rows under “Project agreements (legacy list)” with a link to the workspace panel.
3. Confirmations on the workspace set **`buyer_approval_status` / `creator_approval_status`** and **`agreement_status`**; **`payment_status`** remains **`unpaid`** — **no Stripe**.
4. **Workflow customization:** provenance from **`buyer_requests`** (`source_workflow_title`, `customization_notes`, ids) is folded into scope text; **`workflow_context_snapshot`** on the proposal is the traceability anchor — **editing the live published workflow does not retroactively change** that snapshot or approved proposal text.
5. **Creator workspace** shows read-only proposal status, buyer approval (canonical labels), placeholder price, scope/deliverables, workflow customization banner when applicable, and creator-facing guidance (wait vs proceed).

6. **Admin save path:** **`adminUpsertProposalFields`** inserts or updates a single **`project_proposals`** row per request/order (no duplicate orders); **`Save proposal`** works after editing preview fields even before **Generate** if the operator prefers (still recommends generate first for snapshot text).

**Future:** real payments, escrow, milestone holds, and creator payout protection — see README “Proposal / pricing workflow” and `proposal-pricing-foundation.sql` comments.

---

## Buyer flow

1. Submits `/request` (existing form). Request rows gain marketplace columns (`visibility_status`, `application_status`, `applications_count`, selection pointers).
2. Open requests accept **creator voluntary applications** via `request_applications`.
3. Buyer manages requests on **`/dashboard/requests` (My Requests v2)** — `BuyerMyRequestsPanel` + **`BuyerRequestsAIOverview`** (`#buyer-my-requests-applicants`). **Not** creator open-request browse (that is **`/browse`** for creators only).
   - **AI Request Overview** (top, `src/lib/buyerRequestAI.ts`): rules-based counts — Needs Review · Waiting for Creators · Ready to Select · Active Projects · Delivery Waiting · Missing Info — plus **Next Best Action** and insight cards with severity + CTA. **No external AI APIs.**
   - **Header:** title, subtitle, **New Request**, **Browse Workflows**.
   - **Summary cards (real counts):** Total · Waiting for Applicants · Applicants to Review · Creator Selected · In Progress · Delivery / Review.
   - **Filters:** **Active** (default) · All · Needs Action · Waiting · Review · Selected · In Progress · Delivered · Completed · **Canceled** · **Archived** + search.
   - **Request cards:** source badge, status, goal/budget/deadline, workflow provenance, status row, next action, CTAs, **Manage** menu (cancel / archive / safe delete).
   - **Safe request management** (`src/lib/buyerRequestManagement.ts`): **Delete** only when no applicants, messages, orders, proposals, or deliverables; otherwise **Cancel** (stops creator activity) or **Archive** (hide from active list). Requires **`buyer-request-management-fields.sql`** for `archived_at`, `canceled_at`, `request_visibility`, etc.
   - **Expanded details:** full goal/problem, parsed `style_notes`, AI summary, missing-info checklist, per-request **AI Request Monitor**, project timeline, selected creator card.
4. **Applicant review** (expand request): loads `request_applications` after ownership check. Collapsible applicant rows — creator name, tier, verified, **Original Workflow Creator**, profile strength, proposal, fit, timeline, price, status; **Shortlist / Reject / Select creator / Message / View profile**. After selection, applicants hide behind **View applicant history** unless expanded. Empty states: no requests, no applicants, selected-but-no-project yet.
5. Buyer actions per applicant:
   - **Shortlist** → `request_applications.application_status = shortlisted` (buyer ownership re-checked before update).
   - **Reject applicant** → `rejected` for that cycle.
   - **Select creator** → confirmation modal explaining project assignment → **`selectCreatorForRequest`** rejects sibling `submitted|shortlisted` rows, sets winner `buyer_selected`, updates **`buyer_requests`** (`creator_selected`, pointers, `visibility_status = creator_selected`), **creates or updates** the **`orders`** row (`selection_method = buyer_selected`, `selected_by_buyer`, `order_status = assigned`, `request_application_id`, deduped by `request_id`).
   - **Message creator** → central **`/messages`** deep link; prefers `orderId` once mirrored on the application/order.
   - **View public profile** → `/creator/:id` when `public_profile_status = public`.
6. **Buyer Browse Workflows (v1 — `/browse`)** — **`loadBuyerBrowseMarketplace()`** loads real **`published_workflows`** with explicit columns. Visible only when:
   - `workflow_status = published`
   - `visibility_status = public`
   - `ai_review_status` in **`published`** or **`ai_approved`**
   - **no** `ai_risk_flags` (client-side defense + dedupe by id)
   
   **UI:** stats row (published count, categories, AI-reviewed, customization available), search + category/industry/price/turnaround filters, sort (recommended, AI score, price, turnaround, newest), professional workflow cards (creator name/tier/verified, AI readiness badge, features/setup preview), **View details** panel, prominent **Request / Customize** → **`/request?workflowId=`**. Logged-out users route through **`/signin?redirect=…`** first.
   
   When no rows qualify: **“Creator workflows are coming soon.”** Below that, **Platform starter examples** (curated templates) are clearly labelled — never presented as creator-published storefront listings.
   
   **Creator Browse is different:** signed-in creators on `/browse` see **open buyer requests** only (`CreatorBuyerRequestsBrowse`) — not this workflow marketplace.

## Buyer workflow customization requests (v1)

1. Buyer discovers reusable workflows on **`/browse`** (buyer-facing storefront — not shown on the creator “Buyer Requests” discovery surface).
2. **Request / Customize** navigates to **`/request?workflowId=<uuid>`**, loads the workflow when it is **published + public** and passes the same AI visibility gates used on Browse (hidden, risky, or unpublished workflows show a clear fallback message — never a blank page).
3. The request form shows workflow context (title, publisher display name when available, category, industry, pricing, turnaround, included features, setup requirements) plus a **Customize this workflow for your business** section. Answers pack into **`buyer_requests.customization_notes`** and are echoed into **`style_notes`** under a `[Workflow customization]` block for backward-compatible readers.
4. Rows persist linkage via **`workflow-request-linking.sql`**:
   - `source_type` — `'custom_request'` (default) vs `'workflow'` for customization submissions.
   - `source_workflow_id`, `source_workflow_title`, `source_creator_profile_id` — nullable pointers back to the starter workflow + publisher profile.
   - `requested_from_workflow` boolean guard for dashboards/reporting.
5. Downstream behaviors (**applicants**, **selection**, **`orders`**, **workspace**, **messages**) reuse the existing marketplace pipeline — no Stripe/GitHub OAuth/external AI additions.

### Original workflow creator — first-right-to-build (v1, priority only)

- **Not auto-selected.** The buyer still picks the creator via **Select creator**; **`selectCreatorForRequest`** rejects sibling active applications, updates **`buyer_requests`** (`creator_selected`, pointers), and **`createOrUpdateOrderFromSelectedApplication`** syncs **`orders`** (`selection_method = buyer_selected`, `selected_by_buyer`, `order_status = assigned`) as before.
- **Creator Browse (`/browse` — Buyer Requests):** workflow-backed rows sort with **original publisher opportunities first**. Badge **Your workflow was requested** when `buyer_requests.source_creator_profile_id` matches the signed-in creator; others see **Workflow customization request** when the request is otherwise open. Apply CTA copy emphasizes workflow requests; optional default **`fit_reason`**: *Original creator of the requested workflow* (still a normal `request_applications` row; duplicates blocked by the existing partial unique index).
- **Creator Dashboard → Applications:** section **Workflow requests from your published workflows** lists open workflow-backed scopes for that creator (excludes terminal marketplace rows such as **creator_selected** / closed analogues).
- **Buyer My Requests v2:** workflow-backed cards show **Requested from reusable workflow**, title, original creator when resolvable; fallback **Workflow source unavailable** if title missing. Applicant cards can show **Original Workflow Creator** when the applicant’s profile id matches **`buyer_requests.source_creator_profile_id`**.
- **Admin queue:** workflow-backed cards show provenance (reusable workflow source, title, original creator application status, applicant count, selected creator). Admin override remains available but is not the default selector.

**Future notifications + monetization:** see `docs/workflow-customization-notifications.md`.

---

## Creator flow

1. Top navigation **Buyer Requests** (same route **`/browse`**) exposes **Browse Buyer Requests** cards with Apply / eligibility messaging.
2. **Dashboard · Applications (`/dashboard/applications`)** summarizes + lists that creator's `request_applications` (distinct from discovering new open scopes) and surfaces **Workflow requests from your published workflows** for customization scopes tied to that creator’s published workflows.
3. **Dashboard · Workflows (`/dashboard/workflows`)** — approved creators author **`published_workflows`**: drafts, AI review, improvement loop, optional publish after AI approval or auto-publish when the rules engine clears the top band.
4. Creator submits lightweight application (proposal, fit, timeline, optional price/link/questions).
5. Duplicate **active** applications are blocked (`submitted` / `shortlisted` / `buyer_selected`).
6. When a buyer selects them, the linked `orders` row appears in the existing Creator Project Pipeline/workspace. **Dashboard · Applications** shows **Open Project Workspace** when `order_id` is linked; **Message buyer** links jump to **`/messages`** for that **`buyer_request_id` × creator**.

---

## AI-first published workflows (rules-based v1)

- **Library:** `src/lib/workflowAI.ts` — scoring, missing items, risk flags, readiness label, recommended action, suggested improvements, auto-publish eligibility. **No external AI APIs** in the browser.
- **Persistence:** `published_workflows` columns from **`workflow-ai-review-fields.sql`**: `ai_review_status`, `ai_quality_score`, `ai_publish_readiness`, `ai_review_summary`, `ai_missing_items`, `ai_risk_flags`, `ai_suggested_improvements`, `ai_recommended_action`, `ai_reviewed_at`, `auto_publish_eligible`.
- **Creator actions:**
  - **Save draft** — content fields only; lifecycle defaults remain `workflow_status = draft`, `visibility_status = hidden`, AI reset/`not_reviewed` on create (insert defaults).
  - **Run AI review** — writes AI fields **without** advancing publish state (preview / refresh).
  - **Submit for AI review** — runs the engine and applies lifecycle:
    - **Risk flags** → `ai_review_status = risk_flagged`, `workflow_status = hidden`, `visibility_status = hidden` (stays off buyer Browse).
    - **Score ≥ 85 & no risks** → auto-publish: `workflow_status = published`, `visibility_status = public`, `ai_review_status = published`.
    - **Score 70–84 & no risks** → `ai_review_status = ai_approved`, `workflow_status = submitted_for_review`, `visibility_status = hidden`; creator may **Publish (AI approved)** to flip to live storefront + `ai_review_status = published`.
    - **Below thresholds** → `ai_review_status = needs_improvement`, back to **draft** / hidden with checklist surfaced in-dashboard.
- **Admin:** **`/admin` → Workflow AI overview** — filters (published live, AI-approved queue, needs improvement, risk-flagged, hidden). Actions are **secondary**: view stored AI summary, **override publish**, **hide**, **archive**, **mark needs improvement**. Primary path remains creator ↔ AI loop.

### AI review status values (documented target set)

`not_reviewed`, `needs_review`, `ai_approved`, `needs_improvement`, `risk_flagged`, `published`, plus alignment aliases `hidden`, `rejected`, `archived` reserved for overrides / archival flows.

### Publish readiness labels

`not_ready`, `needs_work`, `almost_ready`, `ready`, `public_ready` — populated by the rules engine (see `workflowAI.ts`).

---

## Creator Workflows v2 (dashboard polish)

- **Route:** **`/dashboard/workflows`** — creator workflow management dashboard; **`/dashboard/workflows/:id/edit`** — sectioned editor.
- **Libraries:** `src/lib/workflowLabels.ts` (human-readable statuses, filters, card actions), `src/lib/workflowAI.ts` (rules-based review), `src/lib/marketplace.ts` (CRUD + hide/archive + request tracking).
- **List page:** stats row (total, published, needs improvement, drafts, buyer requests), filter chips (All / Draft / Needs Improvement / AI Approved / Published / Hidden / Archived), search + sort, scannable workflow cards with role-safe actions.
- **Card actions:** Draft → Edit + Run AI Review; Needs improvement → Edit + Run AI Review; AI approved → Publish + Preview; Published → Preview + Hide + Archive; Hidden → Publish (if still approved) + Archive.
- **Editor:** sections (Basics, Description, Deliverables, Requirements, Pricing, Proof), form completion meter, **WorkflowAIPanel** (plain-English readiness), **WorkflowBuyerPreview**, buyer request list via **`buyer_requests.source_workflow_id`**.
- **Buyer Browse compatibility:** unchanged — only `workflow_status = published`, `visibility_status = public`, safe AI status, no risk flags (`getPublishedWorkflowsForBuyers`).
- **No Stripe / no new migration** — reuses `published_workflows` + `workflow-ai-review-fields.sql` + `workflow-request-linking.sql`.

**Manual tests:** (1) create draft (2) edit + save (3) AI review (4) needs-improvement suggestions (5) publish (6) buyer Browse filter (7) Request/Customize (8) hide/archive removes from Browse.

---

## Admin flow

- `/admin` includes a **Marketplace foundation oversight** panel with counts pulled from Supabase (open requests accepting bids, applications awaiting buyer/admin attention, **workflows live on Browse**, **risk-flagged workflows**, buyer-selected pipeline rows).
- **Buyer Request Queue cards** also surface a compact **marketplace strip**: applicant totals, marketplace lifecycle label, **Buyer-selected creator** badge when `application_status = creator_selected`, plus excerpts of the winning `request_application` / creator linkage — clarifying that buyers drove selection while manual pipeline assignment stays **escalation-only**.
- **Workflow AI overview** section — AI-first posture; admin is **oversight / override**, not the default publisher.
- **Manual assignment fallback** persists through existing admin pipeline actions and should be positioned as escalation rather than implying it is the only fulfillment path.

Overrides (hide/close buyer requests, reassign creators) reuse existing buyer request + order tooling; broaden `buyer_requests` marketplace columns as needed operationally via SQL/UI next phases.

Buyer/creator **`project_messages`** are visible in-product; **moderation dashboards** remain a later phase (`/admin` pipeline cards show an explicit moderation placeholder).

---

## Data model additions

| Table | Purpose |
|-------|---------|
| `request_applications` | Creator interest rows tied to buyer requests (`application_status`). |
| `published_workflows` | Creator-published reusable storefront flows for buyer browse (`workflow_status`, `visibility_status`) **+ AI review columns** (`workflow-ai-review-fields.sql`). |
| `project_messages` | Refresh-based buyer/creator/admin notes around requests/orders (`message_type`, `visibility`). |
| Extended `buyer_requests` fields | Tracks marketplace openness, counters, pointers to selections **+ workflow customization provenance** (`source_type`, `source_workflow_*`, `customization_notes`, `requested_from_workflow`) via `workflow-request-linking.sql`. |
| Extended `orders` fields | Tracks buyer vs admin vs system lineage (`selection_method`, `selected_by_buyer`, `request_application_id`). **`proposal-pricing-foundation.sql`** adds **`proposal_id`**, **`proposal_status`**, **`buyer_approval_status`** (mirrored proposal lifecycle), **`payment_status`** (placeholder until Stripe). |
| `project_proposals` | Scope & placeholder pricing rows — **`proposal-pricing-foundation.sql`** — rules-filled MVP until checkout ships. |

Partial unique index enforces single **active** application per `(buyer_request_id, creator_profile_id)`.

---

## Role-aware Browse

| Account | Primary Browse surface | Creator discovery vs history |
|---------|-----------------------|------------------------------|
| Creator signed-in | `/browse` title **Browse Buyer Requests** · open scopes + Apply | **`/dashboard/applications`** (applications) · **`/dashboard/workflows`** (published workflows) |
| Buyer / Admin signed-in | `/browse` title **Browse Workflows** · stats + filters + **`loadBuyerBrowseMarketplace()`** cards + detail panel + secondary **Platform starter examples** | Own requests/applicants stay on Dashboard |
| Logged-out | `/browse` **Browse Workflows** — same public workflow marketplace when available + labelled starter examples; **Request / Customize** prompts sign-in then continues to `/request?workflowId=` |

Legacy **`/dashboard/browse`** now redirects: creators ⇒ `/dashboard/applications`, buyers/admin ⇒ `/browse`.

Dashboard secondary nav — creators see **Applications** + **Workflows**; buyers/admins retain **Browse** pointing at `/browse`.

---

## Application statuses (`request_applications.application_status`)

- `submitted` — default after Apply.
- `shortlisted` — buyer highlight.
- `buyer_selected` — winning row.
- `rejected`, `withdrawn`, `admin_blocked` — inactive; rejecting others when selecting is enforced in helpers.

Buyer request marketplace `application_status` tracks buyer lifecycle (`open` → `reviewing_applicants` → `creator_selected` …).

---

## Selection → project conversion

`selectCreatorForRequest` performs:

1. Ownership check — `buyer_requests.email === buyer profile email` **or** `buyer_requests.user_id` matches `auth.users.id` when set.
2. Reject remaining active sibling applications except selected.
3. Update buyer pointers + statuses.
4. `createOrUpdateOrderFromSelectedApplication` → leverages `orders` pipeline helpers (`createOrderFromRequest`, `assignCreatorToOrder`) with buyer metadata persisted on the row.

Legacy admin assignment retains `selection_method = 'admin_assigned'`.

---

## Messaging v2 polish (central inbox)

- **Route:** **`/messages`** — two-panel inbox (conversation list + thread). Deep links: **`/messages?orderId=…`**, **`/messages?buyerRequestId=…&creatorProfileId=…`** (prefer `orderId` after creator selection).
- **Libraries:** `src/lib/messages.ts` + `src/lib/messageInbox.ts` — grouping, filtering, send, rules-based **Conversation helper**.
- **Conversation types:** **Application conversation** (pre-selection), **Project conversation** (order anchor), **Workflow customization** (workflow-backed requests).
- **Grouping:** One sidebar row per buyer×creator pair. When an **`orders`** row exists, the application stub is absorbed; request-phase messages merge into the project thread.
- **Surfaces:** Applicant cards, application cards, buyer dashboard selected creator, project workspace **Message buyer/creator**, creator projects panel — all via **`CentralMessageLauncher`** / **`buildMessagesHref`**.
- **Role visibility:** Buyers see request/applicant + project threads; creators see application + project threads; **admin inbox intentionally empty** (moderation later).
- **Not yet:** realtime/WebSockets, file uploads, truthful unread badges. **TEMP DEV RLS** on `project_messages` remains — replace before production.

**Manual tests:** (1) creator inbox (2) buyer inbox (3) project message button opens correct thread (4) applicant message button opens correct thread (5) send message (6) empty message blocked (7) context card (8) no duplicate conversations after selection.

---

1. Harden Row Level Security (replace TEMP DEV marketplace policies).
2. Move workflow AI scoring server-side (**Supabase Edge Functions**) + optional real models; keep browser thin.
3. Stripe quotes/payments tying `proposed_price` → executed agreements (`published_workflows` checkout remains deferred).
4. Realtime inbox + moderation tooling (`admin_only`, participant nuances).

---

## Project Agreement v2 (buyer ↔ creator)

| Topic | Detail |
|-------|--------|
| **Primary UI** | Reusable `ProjectAgreementPanel` on project workspace (buyer + creator) and admin pipeline **View agreement** |
| **Sections** | Title, scope, included/not included, timeline, revision limit, price placeholder, buyer/creator responsibilities, delivery requirements, change notes |
| **Draft** | `generateProjectAgreementForOrder()` — rules-based helper (`projectAgreementAI.ts`) |
| **Edit** | `saveProjectAgreementFields()` — buyer/creator before lock; admin override; resets confirmations |
| **Changes** | `requestProjectAgreementChanges()` — requires note; sets `changes_requested`; resets both confirmations |
| **Confirm** | Buyer: `buyerConfirmProjectAgreement` · Creator: `creatorConfirmProjectAgreement` |
| **Locked** | Both confirmed → `agreement_status = confirmed`, `locked_at`, order mirrored — deliverables not blocked if pending |
| **Payment** | Price is indicative only; `payment_status` stays `unpaid` |
| **Admin** | Oversight only — status strip, missing/risk counts, view/edit override; parties own the agreement |
| **Migration** | No new migration — reuses `project-agreement-fields.sql` columns |

**Manual tests:** (1) generate draft → (2) edit fields → (3) buyer requests changes → (4) creator sees note → (5) both confirm → (6) locked state → (7) admin view only → (8) copy buttons → (9) no payment triggered.

**Later phase:** Stripe checkout, escrow/handoff — out of scope.

---

## Deliverables + Handoff v1

| Topic | Detail |
|-------|--------|
| **Route** | `/dashboard/projects/:orderId` — **Deliverables & Handoff** panel |
| **Creator flow** | Submit preview → submit final delivery → update links/notes → respond to revision with “what changed” |
| **Buyer flow** | See preview/final links + notes → **Review delivery** → **Accept delivery** (marks approved + order completed) or **Request revision** (saves `revision_note`, status revision requested) |
| **Status badges** | Not submitted · Preview submitted · Delivery submitted · Revision requested · Approved · Completed |
| **AI Delivery Monitor** | `src/lib/deliveryAI.ts` — rules-based only: agreement not confirmed, nothing submitted, preview without final, buyer review pending, revision action, missing notes, invalid-looking links |
| **Helpers** | `src/lib/deliverables.ts` — CRUD actions, handoff checklists, order sync (`in_progress` / `in_review` / `completed`) |
| **Messages** | Message creator/buyer about delivery → `/messages?orderId=…&buyerRequestId=…` |
| **Admin** | `/admin#section-deliverables` — oversight (revision requested, approved, project link, buyer/creator names); not required for every delivery |
| **Payment** | **Not active** — no Stripe |
| **Migration** | **Not required** for v1 if `deliverables` table exists; optional `deliverables-revision-note.sql` for `revision_note` column |

**Manual tests:** (1) creator opens project → (2) submit preview → (3) buyer sees preview → (4) creator submits final → (5) buyer requests revision → (6) creator sees note → (7) creator updates → (8) buyer accepts → (9) completed state → (10) admin sees status.

---

## Project workspace (polished v3)

| Topic | Detail |
|-------|--------|
| **Route** | `/dashboard/projects/:orderId` |
| **Who** | Assigned creator (full tooling) or buyer who owns the linked request (overview, agreement, deliverables, messages) |
| **Header** | Title, MicroBuild type, buyer + creator names, status badges, message + delivery shortcuts |
| **Timeline** | Request submitted → Creator selected → Agreement confirmed → Build in progress → Delivery submitted → Completed |
| **Agreement** | **Project Agreement** panel is the primary scope path — generate draft, buyer/creator confirm, request changes, copy agreement. Reuses `project_proposals`; payment stays **unpaid** |
| **Deliverables** | **Deliverables & Handoff v1** — see section above; buyer accept/revision on workspace; AI Delivery Monitor |
| **Checklist & brief** | Creator brief (build packet) + grouped build checklist remain lightweight MVP tools — no external AI on the page |
| **Deferred** | Stripe checkout, payment holding, admin-first proposal UX, external AI APIs, file uploads |

---

## Project Agreement v1 (buyer ↔ creator)

| Topic | Detail |
|-------|--------|
| **Primary UI** | Project workspace `/dashboard/projects/:orderId` — **Project Agreement** panel |
| **Not** | Admin-generated “MicroBuild proposal” as the default path (admin proposal tools stay in **Later: Proposal & Payment**) |
| **Draft** | `generateProjectAgreementForOrder()` — rules-based AI (`projectAgreementAI.ts`) from buyer request, application, workflow customization, build packet, order |
| **Confirm** | Buyer: `buyerConfirmProjectAgreement` · Creator: `creatorConfirmProjectAgreement` · Either: `requestProjectAgreementChanges` |
| **Locked** | Both confirmed → `agreement_status = confirmed`, `locked_at`, `orders.agreement_status = confirmed` — workspace/deliverables **not blocked** if agreement pending |
| **Payment** | Explicit copy: scope confirmation only; `payment_status` stays `unpaid` |
| **Migration** | Run `supabase/migrations/project-agreement-fields.sql` (additive columns only) |

**Manual tests:** (1) buyer selects creator → (2) open project workspace → (3) generate draft → (4) buyer confirm → (5) creator confirm → (6) status shows confirmed / ready to build → (7) admin pipeline strip shows confirmations → (8) no payment triggered.

**Later phase:** Stripe checkout, escrow/handoff, legal-grade contracts — out of scope for v1.

---

## Core marketplace QA checklist (v1)

Manual pass with three test accounts (buyer, creator, admin). No Stripe, GitHub OAuth, or external AI APIs in scope.

| Step | Buyer | Creator | Admin |
|------|-------|---------|-------|
| 1 | Submit **New Request** (`/request`) or **Workflow Request/Customize** (`/request?workflowId=`) | — | — |
| 2 | — | **Buyer Requests** (`/browse`) lists open requests; **Apply to Build** works; duplicate apply blocked; card shows **Applied** | Buyer Requests queue shows new row |
| 3 | — | **My Applications** lists row; summary **Waiting for buyer** increments | Marketplace Applications tab |
| 4 | **My Requests v2** — summary counts, filters, request card, applicant count matches `request_applications` | — | — |
| 5 | Expand details; applicant cards; **Message creator** → `/messages?buyerRequestId&creatorProfileId`; **AI Request Monitor** shows rules-based insight | — | — |
| 6 | **Select creator** (confirm); **selected creator** card; applicants behind history toggle | **Selected** badge; project in **Projects** | Pipeline shows buyer-selected project |
| 7 | Project timeline + status; **Message creator** prefers `orderId` when assigned | **Project workspace** opens; **Message buyer** → Messages | Deliverables oversight tab |
| 8 | **Review delivery** → accept or request revision | Submit preview / final delivery; respond to revision | Monitor handoff status |
| 9 | Accept delivery when scope matches | Resubmit after revision note | Optional admin override |
| 10 | Project shows **Completed** / **Approved** | AI Delivery Monitor highlights next action | See buyer/creator + project link |
| 10 | Central **Messages** — one thread per buyer×creator pair (order anchor after selection) | Same | Inbox empty by design |

**Status labels:** `src/lib/statusLabels.ts` — buyers see **Applied** on new applicants; creators see **Waiting for buyer** on `submitted`; admins see plain English on marketplace application cards.

**Deferred:** proposal generate/send, Stripe checkout, agreement signing — read-only or collapsed **Later: Proposal & Payment** in admin only.

**Known launch-hardening (not fixed in UI-only QA):**

- Replace TEMP DEV RLS on `request_applications`, `project_messages`, `buyer_requests`.
- Server-side workflow AI scoring; unread badges; message attachments.
- Optional: `deliverables.revision_note` — apply `supabase/migrations/deliverables-revision-note.sql` if revision UI shows missing column errors.
- Production admin inbox / moderation (currently empty for `account_type === 'admin'`).

---
