# AI Build Packet Structure

This document defines how MicroBuild will turn a buyer request into a structured build packet that a creator can use to build the MicroBuild without any back-and-forth.

---

## What Is a Build Packet?

A build packet is an AI-generated document created from a buyer's request submission. It translates a raw description ("I need a quote funnel for my pool cleaning business") into a complete, actionable brief for a creator.

Build packets eliminate ambiguity, reduce revision cycles, and allow the creator to start building immediately.

---

## Input: Buyer Request

The build packet is generated from the `buyer_requests` record, which includes:

```json
{
  "full_name": "Carlos Medina",
  "business_name": "Medina Pool Care",
  "industry": "Pool Cleaning",
  "email": "carlos@medinapools.com",
  "phone": "(602) 555-0182",
  "website_social": "@medinapoolcare",
  "build_type": "Quote Funnel",
  "main_goal": "Capture quote leads from homeowners who find me on Instagram or Google",
  "current_problem": "People visit my page but never reach out. I think they leave because they have no idea what I charge. I get calls but half of them ghost when I send a quote because the price surprised them.",
  "budget": "$100–$200",
  "deadline": "ASAP — within a week",
  "style_notes": "Clean, professional. Dark blue and white. Nothing too flashy. Similar feel to Jobber."
}
```

---

## Output: Build Packet Fields

### 1. Business Summary
A 2–3 sentence summary of the business and their customer.

**Example:**
> Medina Pool Care is a pool cleaning and maintenance company serving homeowners in the Dallas/Fort Worth area. Their customers are homeowners who want recurring pool maintenance but need to understand pricing before committing. Carlos handles most customer communication himself and wants to reduce pre-sale friction.

---

### 2. Recommended MicroBuild
The specific build type recommended, with a one-sentence rationale.

**Example:**
> **Quote Funnel** — A 3-step form that captures pool size, service frequency, and chemical preferences, then shows an instant estimate and prompts the homeowner to submit their contact info.

---

### 3. Customer Problem
What is the customer (the homeowner) trying to solve?

**Example:**
> Homeowners want to know if they can afford pool service before committing to a conversation. Without a price range upfront, they leave the website or never reach out.

---

### 4. Suggested Copy
Pre-written headline, subheadline, and CTA text that the creator should use (or adapt).

```json
{
  "headline": "Get an Instant Pool Cleaning Estimate",
  "subheadline": "Tell us about your pool and we'll show you our pricing in 60 seconds — no phone call required.",
  "cta_primary": "Get My Estimate →",
  "cta_secondary": "Book a Cleanup",
  "thank_you_headline": "Your Estimate Is Ready",
  "thank_you_body": "We'll follow up within 24 hours to confirm your appointment.",
  "trust_line": "Serving DFW homeowners since 2018 · 4.9★ on Google"
}
```

---

### 5. Form Fields
The exact fields the quote funnel should capture, in order.

```json
[
  {
    "step": 1,
    "label": "What size is your pool?",
    "type": "radio",
    "options": ["Small (under 10,000 gal)", "Medium (10,000–20,000 gal)", "Large (20,000+ gal)"]
  },
  {
    "step": 2,
    "label": "How often do you want service?",
    "type": "radio",
    "options": ["Weekly", "Bi-weekly", "Monthly", "One-time cleanup"]
  },
  {
    "step": 3,
    "label": "Do you need chemicals included?",
    "type": "radio",
    "options": ["Yes, include chemicals", "No, I'll handle chemicals myself"]
  },
  {
    "step": 4,
    "label": "Your contact info",
    "type": "contact",
    "fields": ["First name", "Last name", "Email", "Phone (optional)"]
  }
]
```

---

### 6. Design Direction
Visual guidelines for the creator.

```json
{
  "color_scheme": "Light blue and white base with navy accents — clean, trustworthy, outdoor feel",
  "tone": "Professional but approachable. Not corporate. Local and personal.",
  "layout": "Single-column, step-by-step. Progress indicator at top. No distractions.",
  "logo": "Business provides logo file",
  "photography": "No stock photos needed — icon illustrations or clean minimal layout preferred",
  "font_feel": "Modern sans-serif, nothing too techy or startup-y"
}
```

---

### 7. Automation Needs
Any integrations or post-submit actions required.

**Example:**
> - Send lead notification email to `carlos@medinapools.com` on every submission
> - Optional: Zapier webhook to add lead to Google Sheet
> - No CRM integration required at this time
> - Thank-you page only — no redirect to external booking tool

---

### 8. Creator Instructions
Step-by-step delivery notes for the creator.

```
1. Build as a single-page app or Webflow/Carrd page — standalone URL, no nav or footer needed
2. Use the suggested copy from Section 4 — adapt tone if needed but preserve key phrases
3. Implement form fields from Section 5 in order (3 question steps + contact capture)
4. Show a price estimate range after Step 3 (before contact form):
   - Weekly + Large + Chemicals: $180–$220/month
   - Weekly + Small + No chemicals: $80–$110/month
   (Admin will provide full pricing matrix before build starts)
5. After contact form submission, show thank-you headline and body from Section 4
6. Send form submission to email address provided — use Formspree or similar
7. Make it mobile-first — most traffic will come from Instagram or Google on phone
8. Deliver as: (a) live URL + (b) source files or Webflow export
```

---

### 9. Quality Checklist
What the creator must verify before submitting the deliverable.

```
[ ] All 4 steps render correctly on mobile (375px)
[ ] Progress indicator advances correctly between steps
[ ] Price estimate displays correctly after Step 3
[ ] Contact form captures all required fields
[ ] Form submission triggers notification email to business owner
[ ] Thank-you message displays after submission
[ ] Page loads in under 2 seconds on 3G
[ ] All copy matches the approved version from Section 4
[ ] Business logo is present and renders at correct size
[ ] No broken links or console errors
[ ] Standalone URL — no external nav, no external branding
```

---

## Generation Process

> **Current state (Phase 0):** Build packets are manually produced by the MicroBuild team during early access. The automated AI generation pipeline is planned for Phase 3. The packet structure and field definitions below are finalized and ready for implementation.

1. Buyer submits `/request` form (live in Phase 0)
2. Admin reviews request manually (Phase 0–1) → triggers AI generation (Phase 3)
3. MicroBuild API calls OpenAI GPT-4o with a structured prompt (Phase 3)
4. Response is parsed and stored in the `build_packets` table
5. Admin reviews and optionally edits the packet before it's shared
6. Creator is assigned the order and given access to the full packet
7. Creator builds and submits the deliverable

---

## Prompt Architecture (Planned)

The build packet generation prompt will use:

- **System prompt:** MicroBuild's product context, tone guidelines, and output format
- **User prompt:** Structured buyer request data (business name, industry, build type, description, budget, timeline)
- **Output format:** JSON with all 9 fields above (GPT-4o structured output / JSON mode)
- **Temperature:** 0.4 (balance between creative and consistent)
- **Fallback:** If generation fails, admin is notified and can write the packet manually

---

## Notes

- Build packets are editable by admins before being shared with creators
- The same packet structure is used for all MicroBuild types — only the form fields and design direction sections vary significantly
- Pricing matrices (used in Step 3 of the funnel example) are provided by the buyer during onboarding, not generated by AI
