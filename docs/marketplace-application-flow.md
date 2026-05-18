# MicroBuild Marketplace Application Flow (Foundation v1)

## Primary product direction (v1 foundation)

MicroBuild is shifting from admin-only assignment to an **optional marketplace**: buyers post **open requests**, creators **apply**, buyers **pick** a creator, and the system **instantiates / updates** the pipeline `orders` row. Admin still **observes**, can **fallback-assign**, **override**, and manages **workflow publishing**.

This document summarizes the marketplace foundation introduced with `marketplace-application-foundation.sql`, **`/browse` role-aware storefront routing**, **`/dashboard/applications` creator history**, and the legacy shim **`/dashboard/browse` → redirect**.

---

## Buyer flow

1. Submits `/request` (existing form). Request rows gain marketplace columns (`visibility_status`, `application_status`, `applications_count`, selection pointers).
2. Open requests accept **creator voluntary applications** via `request_applications`.
3. Buyer reviews applicants in **Dashboard → My Requests & Applicants** (expand per request — budget, deadline, marketplace status, selected creator when set, link to workspace when an order exists).
4. Buyer taps **Select creator** → sibling active applications → `rejected`; winner → `buyer_selected`; `buyer_requests` → `creator_selected` + `visibility_status = creator_selected`; **`orders`** row created or updated (no duplicate per `request_id`) with **`creator_id`**, **`request_application_id`**, **`selection_method = buyer_selected`**, **`order_status = assigned`**.
5. **Buyer Browse** (**`/browse`**) lists `published_workflows` that are published + publicly visible plus a clearly labelled block of platform starter listings when storefront rows are sparse.

**Messaging v1:** per-applicant **Message creator** on each applicant card — expandable threads tied to **`buyer_request_id`** (+ optional `recipient_user_profile_id`). **Dashboard → Project workspace** (`/dashboard/projects/:id`) exposes **Request conversation** (rows without `order_id`) and **Project messages** (`order_id`) for both **creator** (assigned profile) and **buyer** (request owner); **admin-only** `project_messages.visibility` rows never surface in participant UIs. Text-only, **refresh-based** — no realtime, no uploads yet.

---

## Creator flow

1. Top navigation **Buyer Requests** (same route **`/browse`**) exposes **Browse Buyer Requests** cards with Apply / eligibility messaging.
2. **Dashboard · Applications (`/dashboard/applications`)** summarizes + lists that creator's `request_applications` (distinct from discovering new open scopes).
3. Creator submits lightweight application (proposal, fit, timeline, optional price/link/questions).
4. Duplicate **active** applications are blocked (`submitted` / `shortlisted` / `buyer_selected`).
5. When a buyer selects them, the linked `orders` row appears in the existing Creator Project Pipeline/workspace. **Dashboard · Applications** shows **Open Project Workspace** when `order_id` is linked; **Message buyer** threads use the same **`project_messages`** foundation (pair-scoped refresh UI).

Creators publish reusable storefront templates through `published_workflows` going forward — UI for authoring stays incremental in later milestones.

---

## Admin flow

- `/admin` includes a **Marketplace foundation oversight** panel with counts pulled from Supabase joins (open requests accepting bids, awaiting buyer/admin attention on applications, workflows submitted for review, buyer-selected pipeline rows).
- **Manual assignment fallback** persists through existing admin pipeline actions and should be positioned as escalation rather than implying it is the only fulfillment path.

Overrides (hide/close buyer requests, reassign creators) reuse existing buyer request + order tooling; broaden `buyer_requests` marketplace columns as needed operationally via SQL/UI next phases.

Buyer/creator **`project_messages`** are visible in-product; **moderation dashboards** remain a later phase (`/admin` pipeline cards show an explicit moderation placeholder).

---

## Data model additions

| Table | Purpose |
|-------|---------|
| `request_applications` | Creator interest rows tied to buyer requests (`application_status`). |
| `published_workflows` | Creator-published reusable storefront flows for buyer browse (workflow + visibility enums). |
| `project_messages` | Refresh-based buyer/creator/admin notes around requests/orders (`message_type`, `visibility`). |
| Extended `buyer_requests` fields | Tracks marketplace openness, counters, pointers to selections. |
| Extended `orders` fields | Tracks buyer vs admin vs system lineage (`selection_method`, `selected_by_buyer`, `request_application_id`). |

Partial unique index enforces single **active** application per `(buyer_request_id, creator_profile_id)`.

---

## Role-aware Browse

| Account | Primary Browse surface | Creator discovery vs history |
|---------|-----------------------|------------------------------|
| Creator signed-in | `/browse` title **Browse Buyer Requests** · open scopes + Apply | Track submissions at `/dashboard/applications` |
| Buyer / Admin signed-in | `/browse` title **Browse Workflows** (`published_workflows` + labelled starters) | Own requests/applicants stay on Dashboard |
| Logged-out / onboarding incomplete | `/browse` unchanged public template grid **or** onboarding prompt when profile missing |

Legacy **`/dashboard/browse`** now redirects: creators ⇒ `/dashboard/applications`, buyers/admin ⇒ `/browse`.

Dashboard secondary nav reinforces the split — creators see **Applications**, buyers/admins retain **Browse** pointing at `/browse`.

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

## Messaging v1 (refresh-based)

- **Implementation:** `src/lib/messages.ts` — explicit column selects on `project_messages`, participant-safe filtering (**hides `admin_only` visibility** in buyer/creator UIs), `sendRequestMessage` / `sendProjectMessage`, thread preview + visibility labels. `marketplace.ts` re-exports `fetchProjectMessagesForRequest`, `insertProjectMessage`, and `generateMessageThreadPreview` as thin aliases into `messages.ts`.
- **Surfaces:**
  - **Buyer → applicants:** **Message creator** on each applicant row — threads scoped by `buyer_request_id` plus participant pairing when IDs exist.
  - **Creator → applications:** **Message buyer** on each application card — buyer profile resolved from `buyer_requests.email` when needed.
  - **Workspace (`/dashboard/projects/:id`):** **Request conversation** (messages without `order_id`) and **Project messages** (`order_id`); **assigned creator** and **request-owning buyer** both get access — deliverable submission remains **creator-only**.
- **Not in v1:** Realtime/WebSockets, file uploads, read receipts (**`getUnreadPlaceholderCount`** is a placeholder), robust admin moderation (**`/admin`** shows “moderation coming later” on pipeline cards).
- **Production:** RLS must restrict who can read/write `project_messages`; TEMP DEV permissive policies are unsafe.

## Next build phases

1. Harden Row Level Security (replace TEMP DEV marketplace policies).
2. Creator authoring UI for published workflows + SEO slugs + admin publish approval workflow.
3. Stripe quotes/payments tying `proposed_price` → executed agreements.
4. Realtime inbox + moderation tooling (`admin_only`, participant nuances).

---
