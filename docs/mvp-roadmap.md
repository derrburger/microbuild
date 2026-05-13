# MicroBuild MVP Roadmap

This document outlines the phased build plan for MicroBuild from foundation to a revenue-generating marketplace.

---

## Phase 0 — Foundation (Complete)

**Goal:** Clean frontend structure, routing, mock data, and backend-ready schema files.

### Completed
- [x] Vite + React + TypeScript setup
- [x] React Router with 9 routes + global 404 handler
- [x] TypeScript types for all data models (BuyerRequest, CreatorApplication, MicroBuildListing, CaseStudy, PricingTier)
- [x] Mock listings for 5 MicroBuild products across 5 categories
- [x] Reusable component library (Navbar, Footer, MicroBuildCard, CTASection, StatusBadge, Layout)
- [x] All 9 pages scaffolded with real, product-accurate copy
- [x] Global CSS design system (dark/navy/charcoal, green accent, CSS variables)
- [x] Responsive layout (mobile-first, hamburger nav)
- [x] Honest early-access copy — no fake social proof, case studies clearly labeled as demos
- [x] Expanded buyer request form (contact, business, project goal, current problem, budget, deadline, style notes)
- [x] Expanded creator application form (tools, portfolio links, niches, experience, availability)
- [x] Browse page reads `?category=` URL params — footer deep links work correctly
- [x] Graceful 404 for unknown routes and invalid build slugs
- [x] Database schema planning doc (reflects expanded form fields)
- [x] AI build packet structure doc
- [x] MVP roadmap doc

---

## Phase 1 — Backend Foundation

**Goal:** Connect real data storage. No payments yet.

### Tasks
- [ ] Set up Supabase project
- [ ] Run migrations for: `users`, `business_profiles`, `microbuild_templates`, `microbuild_categories`, `buyer_requests`, `creator_applications`
- [ ] Seed `microbuild_templates` and `microbuild_categories` from mock data
- [ ] Enable Supabase Auth (email/password to start)
- [ ] Replace mock listings with Supabase query on `/browse` and `/builds/:slug`
- [ ] Store buyer request form submissions in `buyer_requests` table
- [ ] Store creator application form submissions in `creator_applications` table
- [ ] Add basic Row Level Security (RLS) policies

### Deliverables
- Live data on Browse and BuildDetail pages
- Buyer requests and creator applications stored in DB
- Supabase dashboard readable by admin

---

## Phase 2 — Admin & Operations

**Goal:** Internal tooling to manage requests, applications, and orders.

### Tasks
- [ ] Add Supabase Auth to admin route (role check: `admin`)
- [ ] Admin: real buyer request list with status management
- [ ] Admin: real creator application list with approve/reject actions
- [ ] Admin: template management (add, edit, toggle active)
- [ ] Creator: view assigned orders and build packet
- [ ] Buyer: view order status after submission
- [ ] Email notifications (Resend or SendGrid): new request, application received, status update

### Deliverables
- Admin can manage the full request-to-order pipeline
- Creators can view their assignments
- Basic email comms working

---

## Phase 3 — AI Build Packets

**Goal:** Automate the creation of structured creator briefs from buyer requests.

### Tasks
- [ ] OpenAI API integration (GPT-4o)
- [ ] Build packet generation endpoint: takes `buyer_request` → returns structured JSON
- [ ] Store `build_packets` in Supabase
- [ ] Admin: trigger build packet generation per request
- [ ] Creator: view full build packet on their assigned order
- [ ] Quality checklist auto-generated per build type

### Deliverables
- Every accepted request generates a detailed AI build packet
- Creators receive a clear, structured brief — no ambiguity

---

## Phase 4 — Payments

**Goal:** Collect payment on order approval.

### Tasks
- [ ] Stripe integration (Stripe Checkout or Payment Links to start)
- [ ] Payment triggered when buyer accepts proposal
- [ ] Funds held until buyer approves deliverable
- [ ] Creator payout system (Stripe Connect or manual payout)
- [ ] Order status updates on payment events (Stripe webhooks)
- [ ] Receipt emails

### Deliverables
- End-to-end paid transaction: request → proposal → payment → delivery → payout

---

## Phase 5 — Marketplace Polish

**Goal:** Public-facing polish, trust, and growth features.

### Tasks
- [ ] Public creator profiles (`/creators/:handle`)
- [ ] Reviews & ratings system
- [ ] Before/after deliverable gallery
- [ ] MicroBuild case study pages from real orders
- [ ] SEO: meta tags, sitemap, Open Graph images
- [ ] Analytics: PostHog or Plausible
- [ ] Referral system for local businesses

### Deliverables
- Full buyer → creator → review loop
- Shareable, discoverable marketplace

---

## Non-Goals (For Now)

- White-label reselling
- Mobile app
- Real-time collaboration tools
- Subscription billing for buyers
- Freelancer marketplace (scope must stay narrow)

---

## Stack Decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React + Vite + TypeScript | Fast, modern, type-safe |
| Routing | React Router v7 | Standard, well-documented |
| Styling | Plain CSS (scoped per component) | Zero dependencies, full control |
| Backend/DB | Supabase (Postgres + Auth + Storage) | Fastest path to real data |
| AI | OpenAI GPT-4o API | Best quality for structured output |
| Payments | Stripe | Industry standard |
| Email | Resend | Simple, developer-friendly |
| Hosting | Vercel (frontend) + Supabase (backend) | Free tier covers MVP |
