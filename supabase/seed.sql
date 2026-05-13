-- ============================================================
-- MicroBuild — Seed Data (MVP)
-- ============================================================
-- Run after schema.sql to populate categories and templates.
-- Use in local dev or a fresh Supabase project.
--
--   supabase db reset    (applies schema + seed automatically)
--   -- OR manually:
--   psql -f schema.sql && psql -f seed.sql
--
-- Note: UUIDs are hard-coded so they're stable across resets
-- and can be referenced in application code or tests.
-- ============================================================


-- ─── microbuild_categories ───────────────────────────────────────────────────

INSERT INTO public.microbuild_categories (id, name, slug, description, icon, display_order)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Quote Funnel',
    'quote-funnel',
    'Multi-step guided forms that deliver instant price estimates and capture lead contact info.',
    '⚡',
    1
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Booking Page',
    'booking-page',
    'Standalone pages that let customers select a service and schedule an appointment directly.',
    '📅',
    2
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Review Booster',
    'review-booster',
    'Pages that route happy customers to Google reviews and unhappy customers to private feedback.',
    '⭐',
    3
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'Trust Page',
    'trust-page',
    'Before/after photo showcases with testimonials and a strong CTA to convert skeptical prospects.',
    '📸',
    4
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'Package Selector',
    'package-selector',
    'Visual service comparison pages that help customers self-select their tier and proceed to booking.',
    '🎯',
    5
  )
ON CONFLICT (slug) DO NOTHING;


-- ─── microbuild_templates ────────────────────────────────────────────────────

-- 1. Pool Cleaning Quote Funnel
INSERT INTO public.microbuild_templates (
  id,
  title,
  slug,
  category_id,
  target_industry,
  main_goal,
  starting_price,
  estimated_turnaround,
  description,
  features,
  setup_requirements,
  status,
  is_active
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Pool Cleaning Quote Funnel',
  'pool-cleaning-quote-funnel',
  '00000000-0000-0000-0000-000000000001',
  'Pool Cleaning',
  'Generate instant quote leads from homeowners',
  149,
  '3–5 business days',
  'A mobile-first quote funnel built for pool cleaning companies. Homeowners answer a few quick questions — pool size, service frequency, chemical needs — and receive an instant estimate with a booking CTA. Captures name, email, and phone before delivering the quote.',
  ARRAY[
    'Step-by-step quote flow (3–5 questions)',
    'Instant price estimate display',
    'Lead capture form before quote reveal',
    'Mobile-optimized layout',
    'Thank-you page with booking CTA',
    'Email notification on submission',
    'Branded with your logo and colors'
  ],
  ARRAY[
    'Business name and logo',
    'Service area (city/zip)',
    'Pricing ranges for service tiers',
    'Contact email for lead notifications'
  ],
  'popular',
  true
)
ON CONFLICT (slug) DO NOTHING;


-- 2. Auto Detailing Package Selector
INSERT INTO public.microbuild_templates (
  id,
  title,
  slug,
  category_id,
  target_industry,
  main_goal,
  starting_price,
  estimated_turnaround,
  description,
  features,
  setup_requirements,
  status,
  is_active
) VALUES (
  '10000000-0000-0000-0000-000000000002',
  'Auto Detailing Package Selector',
  'auto-detailing-package-selector',
  '00000000-0000-0000-0000-000000000005',
  'Auto Detailing',
  'Help customers choose and book the right detail package',
  129,
  '3–4 business days',
  'A clean, visual package selector for auto detailing businesses. Customers compare packages side-by-side, select add-ons, and proceed straight to booking. Reduces back-and-forth and increases average order value by surfacing premium options.',
  ARRAY[
    'Visual package comparison (2–4 tiers)',
    'Add-on selector (ceramic coat, engine bay, etc.)',
    'Vehicle type selection (sedan, SUV, truck)',
    'Instant price calculator',
    'Book Now CTA per package',
    'Mobile-friendly card layout',
    'Branded color scheme'
  ],
  ARRAY[
    'Package names, descriptions, and prices',
    'List of available add-ons and pricing',
    'Vehicle types you service',
    'Booking link or contact method'
  ],
  'available',
  true
)
ON CONFLICT (slug) DO NOTHING;


-- 3. Painter Estimate Page
INSERT INTO public.microbuild_templates (
  id,
  title,
  slug,
  category_id,
  target_industry,
  main_goal,
  starting_price,
  estimated_turnaround,
  description,
  features,
  setup_requirements,
  status,
  is_active
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  'Painter Estimate Page',
  'painter-estimate-page',
  '00000000-0000-0000-0000-000000000001',
  'Painting',
  'Collect qualified estimate requests from homeowners',
  139,
  '3–5 business days',
  'A professional estimate request page for painters. Homeowners describe their project — interior vs exterior, square footage, number of rooms, prep work needed — and submit a request. You get a pre-qualified lead with all the context needed to give an accurate quote fast.',
  ARRAY[
    'Project type selection (interior/exterior/both)',
    'Room count and square footage inputs',
    'Prep work and condition questions',
    'Photo upload option',
    'Lead capture with preferred contact time',
    'Confirmation email to homeowner',
    'Admin notification with full project details'
  ],
  ARRAY[
    'Business name and logo',
    'Service area',
    'Project types you accept',
    'Email for lead notifications'
  ],
  'new',
  true
)
ON CONFLICT (slug) DO NOTHING;


-- 4. Review Booster Page
INSERT INTO public.microbuild_templates (
  id,
  title,
  slug,
  category_id,
  target_industry,
  main_goal,
  starting_price,
  estimated_turnaround,
  description,
  features,
  setup_requirements,
  status,
  is_active
) VALUES (
  '10000000-0000-0000-0000-000000000004',
  'Review Booster Page',
  'review-booster-page',
  '00000000-0000-0000-0000-000000000003',
  'All Local Services',
  'Drive satisfied customers to leave Google or Facebook reviews',
  99,
  '2–3 business days',
  'A focused review-generation page you send to customers after a completed job. Customers rate their experience, and happy customers (4–5 stars) are routed directly to your Google review link. Unhappy customers send private feedback to you instead. Protects your rating while growing review count.',
  ARRAY[
    'Star rating selector',
    'Happy customer → Google review redirect',
    'Unhappy customer → private feedback form',
    'Custom thank-you message',
    'SMS and email shareable link',
    'Works on all devices',
    'No login required for customers'
  ],
  ARRAY[
    'Business name',
    'Google review link',
    'Optional: Facebook review link',
    'Custom thank-you message (optional)'
  ],
  'popular',
  true
)
ON CONFLICT (slug) DO NOTHING;


-- 5. Before & After Trust Page
INSERT INTO public.microbuild_templates (
  id,
  title,
  slug,
  category_id,
  target_industry,
  main_goal,
  starting_price,
  estimated_turnaround,
  description,
  features,
  setup_requirements,
  status,
  is_active
) VALUES (
  '10000000-0000-0000-0000-000000000005',
  'Before & After Trust Page',
  'before-after-trust-page',
  '00000000-0000-0000-0000-000000000004',
  'All Local Services',
  'Build credibility with visual proof of your work',
  119,
  '3–4 business days',
  'A high-impact trust page built around before/after photo comparisons. Showcases your real work, includes customer testimonials, and ends with a strong CTA. Perfect for sharing on social media, in ads, or as a link in your email signature. Converts skeptical prospects into booked clients.',
  ARRAY[
    'Before/after image slider (up to 6 pairs)',
    'Customer quote testimonials section',
    'Service highlights with icons',
    'Star rating display',
    'Primary CTA (Request a Quote / Book Now)',
    'Mobile-optimized gallery layout',
    'Fast-loading, shareable URL'
  ],
  ARRAY[
    'Before/after photos (minimum 3 pairs)',
    'Customer testimonials (2–4 quotes)',
    'Business name and logo',
    'CTA link (booking page or contact form)'
  ],
  'available',
  true
)
ON CONFLICT (slug) DO NOTHING;
