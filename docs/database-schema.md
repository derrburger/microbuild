# MicroBuild Database Schema (Planned)

This document defines the planned Supabase/PostgreSQL table structure for the MicroBuild platform. Not yet implemented — for planning and backend handoff purposes.

---

## Tables

### `users`
Core authentication table (managed by Supabase Auth).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key (Supabase Auth UID) |
| email | text | Unique |
| created_at | timestamptz | |
| role | enum | `buyer`, `creator`, `admin` |

---

### `business_profiles`
Profile created by buyers when they register or submit a request.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id |
| business_name | text | |
| industry | text | e.g. "Pool Cleaning" |
| city | text | |
| state | text | |
| website | text | nullable |
| phone | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `microbuild_categories`
Reference table for build types.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | e.g. "Quote Funnel" |
| slug | text | Unique |
| description | text | |
| icon | text | Emoji or icon name |
| display_order | int | |

---

### `microbuild_templates`
Marketplace listings shown on /browse and /builds/:slug.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| title | text | |
| slug | text | Unique |
| category_id | uuid | FK → microbuild_categories.id |
| target_industry | text | |
| main_goal | text | |
| starting_price | int | In cents or dollars (decide) |
| estimated_turnaround | text | e.g. "3–5 business days" |
| description | text | |
| features | text[] | Array of feature strings |
| setup_requirements | text[] | Array of requirement strings |
| status | enum | `available`, `popular`, `new`, `coming-soon` |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| is_active | bool | |

---

### `buyer_requests`
Submitted via the /request page.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id, nullable (guest requests allowed) |
| business_profile_id | uuid | FK → business_profiles.id, nullable |
| template_id | uuid | FK → microbuild_templates.id, nullable |
| full_name | text | |
| email | text | |
| phone | text | nullable |
| business_name | text | |
| industry | text | e.g. "Pool Cleaning" |
| website_social | text | nullable — URL or @handle |
| build_type | text | Category name, "Not sure", or "custom" |
| main_goal | text | What the build should accomplish |
| current_problem | text | What's not working right now |
| budget | text | nullable — selected range |
| deadline | text | nullable — selected timeline |
| style_notes | text | nullable — tone, colors, references |
| status | enum | `new`, `in-review`, `proposal-sent`, `accepted`, `rejected` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `creator_profiles`
Approved creator accounts.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id |
| full_name | text | |
| bio | text | nullable |
| portfolio_url | text | nullable |
| skills | text[] | Array |
| available_hours | text | |
| is_active | bool | |
| rating | numeric(3,2) | 0–5 |
| builds_completed | int | |
| created_at | timestamptz | |

---

### `creator_applications`
Submitted via /creators/apply.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| full_name | text | |
| email | text | |
| tools | text[] | e.g. ["Webflow", "React", "Zapier"] |
| portfolio_url | text | nullable — primary link |
| portfolio_url_2 | text | nullable — secondary link |
| niches | text[] | Industries the creator has interest/experience in |
| experience | text | Open-ended description |
| available_hours | text | Selected range |
| message | text | nullable |
| status | enum | `new`, `reviewing`, `approved`, `rejected` |
| created_at | timestamptz | |

---

### `orders`
Created when a buyer accepts a proposal.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| request_id | uuid | FK → buyer_requests.id |
| buyer_id | uuid | FK → users.id |
| creator_id | uuid | FK → creator_profiles.id, nullable |
| template_id | uuid | FK → microbuild_templates.id, nullable |
| build_packet_id | uuid | FK → build_packets.id, nullable |
| amount_cents | int | Price in cents |
| status | enum | `pending`, `in-progress`, `delivered`, `approved`, `disputed`, `refunded` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `build_packets`
AI-generated briefing packet for creators, generated from a buyer request.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| request_id | uuid | FK → buyer_requests.id |
| order_id | uuid | FK → orders.id, nullable |
| business_summary | text | |
| recommended_build | text | |
| customer_problem | text | |
| suggested_copy | jsonb | Headlines, CTAs, body text |
| form_fields | jsonb | Array of field definitions |
| design_direction | text | Color, tone, layout notes |
| automation_needs | text | nullable |
| creator_instructions | text | |
| quality_checklist | text[] | |
| generated_at | timestamptz | |
| generated_by | text | e.g. "gpt-4o", "manual" |

---

### `deliverables`
Final build files/links submitted by a creator.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| order_id | uuid | FK → orders.id |
| creator_id | uuid | FK → creator_profiles.id |
| live_url | text | The deployed MicroBuild URL |
| preview_url | text | nullable |
| source_files_url | text | nullable |
| notes | text | nullable |
| submitted_at | timestamptz | |
| approved_at | timestamptz | nullable |
| revision_count | int | Default 0 |

---

### `reviews`
Buyer reviews of completed builds.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| order_id | uuid | FK → orders.id |
| buyer_id | uuid | FK → users.id |
| creator_id | uuid | FK → creator_profiles.id |
| rating | int | 1–5 |
| comment | text | nullable |
| is_public | bool | Default true |
| created_at | timestamptz | |

---

## Notes

- All IDs use UUIDs (`gen_random_uuid()` in Postgres)
- Row-level security (RLS) will be enabled on all tables once auth is wired
- `buyer_requests` allows guest submissions (user_id nullable) to reduce friction
- `build_packets` generated by OpenAI API, stored as structured JSON in Supabase
