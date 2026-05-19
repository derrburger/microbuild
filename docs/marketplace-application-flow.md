# MicroBuild Marketplace Application Flow (Foundation v1)

## Primary product direction (v1 foundation)

MicroBuild is shifting from admin-only assignment to an **optional marketplace**: buyers post **open requests**, creators **apply**, buyers **pick** a creator, and the system **instantiates / updates** the pipeline `orders` row. Admin still **observes**, can **fallback-assign**, **override**, and provides **AI oversight** on published workflows — but **workflow publishing is AI-first**, not an admin approval queue.

This document summarizes the marketplace foundation introduced with `marketplace-application-foundation.sql`, **`workflow-ai-review-fields.sql`** (additive AI columns on `published_workflows`), **`/browse` role-aware storefront routing**, **`/dashboard/applications` creator history**, **`/dashboard/workflows` creator workflow studio**, and the legacy shim **`/dashboard/browse` → redirect**.

---

## Proposal / pricing workflow (v1 — placeholders only)

After buyer selection and an **`orders`** row exists (or even before, keyed by **`buyer_request_id`** only), MicroBuild can record a **`project_proposals`** row:

1. **Admin** generates or regenerates a **rules-based** draft (`src/lib/proposals.ts`) from the buyer request, winning **`request_application`** when linked, optional **`build_packets`** snippet, and **`published_workflows`** pricing/context when the request is workflow-backed.
2. Admin edits title, scope, deliverables, timeline, revision limit, placeholder price — **Save** recomputes placeholder fee/payout — **Mark sent** exposes the proposal to the buyer dashboard.
3. **Buyer** sees **Proposals & pricing** on the dashboard when at least one proposal exists (latest row per request); **Approve / Request changes / Reject** only when **`proposal_status = sent`**. Responses update **`project_proposals`** and **`orders`** via **`syncOrderProposalPointers`**; **`buyer_approval_status`** uses **`pending` / `approved` / `changes_requested` / `rejected`**; **`payment_status`** remains **`unpaid`** — **no Stripe**.
4. **Workflow customization:** provenance from **`buyer_requests`** (`source_workflow_title`, `customization_notes`, ids) is folded into scope text; **`workflow_context_snapshot`** on the proposal is the traceability anchor — **editing the live published workflow does not retroactively change** that snapshot or approved proposal text.
5. **Creator workspace** shows read-only proposal status, buyer approval (canonical labels), placeholder price, scope/deliverables, workflow customization banner when applicable, and creator-facing guidance (wait vs proceed).

6. **Admin save path:** **`adminUpsertProposalFields`** inserts or updates a single **`project_proposals`** row per request/order (no duplicate orders); **`Save proposal`** works after editing preview fields even before **Generate** if the operator prefers (still recommends generate first for snapshot text).

**Future:** real payments, escrow, milestone holds, and creator payout protection — see README “Proposal / pricing workflow” and `proposal-pricing-foundation.sql` comments.

---

## Buyer flow

1. Submits `/request` (existing form). Request rows gain marketplace columns (`visibility_status`, `application_status`, `applications_count`, selection pointers).
2. Open requests accept **creator voluntary applications** via `request_applications`.
3. Buyer reviews applicants in **Dashboard → My Requests & Applicants** (`#buyer-my-requests-applicants`): each request card summarizes **source type** (custom vs workflow customization), workflow title when relevant, budget/deadline, legacy request status, marketplace status, visibility, applicant counts, selected creator, linked **project / order** status, and a **suggested next step** (waiting → review → select → message assigned creator → track delivery → approve delivery).
4. Expanding a request loads applicants (ownership verified server-side). Applicant cards include creator identity, **tier + verified** styling, optional **Original Workflow Creator** badge, profile strength, proposal/fit/questions/timeline/price, application status + submitted timestamp, and **`buyerApplicantReviewAI` rules-only insights** (fit score, strengths, concerns, proposal clarity, timeline confidence, recommended decision, workflow-publisher advantage text when applicable).
5. Buyer actions per applicant:
   - **Shortlist** → `request_applications.application_status = shortlisted` (buyer ownership re-checked before update).
   - **Reject applicant** → `rejected` for that cycle.
   - **Select creator** → confirmation modal explaining project assignment → **`selectCreatorForRequest`** rejects sibling `submitted|shortlisted` rows, sets winner `buyer_selected`, updates **`buyer_requests`** (`creator_selected`, pointers, `visibility_status = creator_selected`), **creates or updates** the **`orders`** row (`selection_method = buyer_selected`, `selected_by_buyer`, `order_status = assigned`, `request_application_id`, deduped by `request_id`).
   - **Message creator** → central **`/messages`** deep link; prefers `orderId` once mirrored on the application/order.
   - **View public profile** → `/creator/:id` when `public_profile_status = public`.
6. **Buyer Browse** (**`/browse`**) lists **`published_workflows`** that meet **all** of:
   - `workflow_status = published`
   - `visibility_status = public`
   - `ai_review_status` in **`published`** or **`ai_approved`**
   - **no** `ai_risk_flags` (client-side defense in list loader)
   
   When no rows qualify, buyers see **“Reusable creator workflows are coming soon.”** Under that, **Platform starter examples** (curated template cards) stay clearly labelled as platform content.

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
- **Buyer Dashboard → applicants:** applicant cards can show **Original Workflow Creator** when the applicant’s profile id matches **`buyer_requests.source_creator_profile_id`**.
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
| Buyer / Admin signed-in | `/browse` title **Browse Workflows** · AI-visible `published_workflows` + **Platform starter examples** | Own requests/applicants stay on Dashboard |
| Logged-out | `/browse` **Browse Workflows** — same public workflow slice when available + starter examples (filters apply to starter grid); sign-in still required for dashboard flows |

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

## Messaging v2 (refresh-based inbox)

- **Libraries:** `src/lib/messages.ts` (explicit selects, **`sendRequestMessage`** / **`sendProjectMessage`**, filtering) + **`src/lib/messageInbox.ts`** (**`getUserConversations`**, **`sendConversationMessage`**, **`mergeMessagesForConversation`**, **`buildMessagesHref`**, **`fetchMessagePool`**). Re-exports for convenience mirror `messages.ts`.
- **Route:** **`/messages`** (+ signed-out redirect to **`/signin`**, onboarding guard when profile missing).
- **Surfaces:** Applicant/application cards (**Message creator** / **Message buyer** → query-string deep links); buyer active request (**Message creator**); creator pipeline (**Message buyer**); workspace (**Open project chat**).
- **Grouping logic:** Prefer **`orders.id`** conversations when **`request_id`** + **`creator_id`** overlap an application; suppress duplicate application stubs in that scenario. Threads merge **pair-scoped** request rows (**`order_id` IS NULL**) with order rows for the participant pair.
- **Admin:** moderation consoles stay future work — **`account_type === 'admin'` resolves to an intentionally empty inbox** (no voyeur tooling).
- **Still missing:** realtime, uploads, truthful unread badges, hardened RLS (**TEMP DEV permissive inserts/selects remain unsafe for prod**).


## Next build phases

1. Harden Row Level Security (replace TEMP DEV marketplace policies).
2. Move workflow AI scoring server-side (**Supabase Edge Functions**) + optional real models; keep browser thin.
3. Stripe quotes/payments tying `proposed_price` → executed agreements (`published_workflows` checkout remains deferred).
4. Realtime inbox + moderation tooling (`admin_only`, participant nuances).

---
