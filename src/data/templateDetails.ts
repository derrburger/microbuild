/**
 * templateDetails.ts — Extended static metadata for each MicroBuild template.
 *
 * Keyed by template slug. This data supplements the Supabase-stored fields
 * (title, description, features, setup requirements) with richer page content.
 * Not stored in the database because it is editorial/marketing content that
 * changes infrequently and benefits from version control over a CMS.
 */

export interface TemplateDetail {
  customerFlow: string[];
  businessReceives: string[];
  bestFitIndustries: string[];
  faq: Array<{ q: string; a: string }>;
}

const templateDetails: Record<string, TemplateDetail> = {

  'pool-cleaning-quote-funnel': {
    customerFlow: [
      'Lands on your quote link — shared from Instagram bio, Google Business profile, SMS, or paid ad',
      'Answers 3–4 quick questions about their pool (size, service frequency, chemical needs)',
      'Enters name, email, and phone to reveal their instant price estimate',
      'Sees a personalized estimate with a booking call-to-action',
      'Gets a follow-up email with their estimate and your contact info',
    ],
    businessReceives: [
      'Branded quote funnel hosted at a shareable link',
      'Automatic email notification per lead with full contact details',
      'Pre-qualified leads with pool size and service needs already captured',
      'Mobile-optimized layout that works on any device',
      'Thank-you page with booking CTA so leads can convert immediately',
    ],
    bestFitIndustries: [
      'Pool Cleaning & Maintenance',
      'Pool Chemical Services',
      'Seasonal Pool Opening / Closing',
      'Pool Repair & Equipment',
      'Hot Tub & Spa Services',
    ],
    faq: [
      {
        q: 'Do I need a website for this to work?',
        a: 'No. The quote funnel is a standalone link you can share anywhere — Instagram bio, Google Business, SMS to new leads, or ads. No website required.',
      },
      {
        q: 'How do customers get their estimate?',
        a: 'They answer a few quick questions about their pool, then enter their contact info. The price estimate displays instantly on the next screen.',
      },
      {
        q: 'Will I get notified when someone submits?',
        a: 'Yes. You receive an email notification with the full lead details every time someone completes the funnel.',
      },
      {
        q: 'Can I update my pricing later?',
        a: 'Yes. Pricing range updates are a simple revision included in the first 30 days. After that, updates are available at a small fee.',
      },
      {
        q: 'What if I service multiple pool types or sizes?',
        a: 'We build the funnel around your exact service tiers. You provide the pricing ranges; we handle the display logic.',
      },
    ],
  },

  'auto-detailing-package-selector': {
    customerFlow: [
      'Lands on the page from Instagram bio, SMS reply, or a QR code in your shop',
      'Selects their vehicle type (sedan, SUV, truck, motorcycle)',
      'Compares your packages side-by-side with prices and included services',
      'Adds optional upgrades (ceramic coat, engine bay, leather conditioning)',
      'Taps "Book Now" — routed directly to your booking link or contact method',
    ],
    businessReceives: [
      'Visual package selector page branded to your detailing business',
      'Vehicle type filter so customers self-select the right option',
      'Add-on upsell section (ceramic, engine bay, etc.) that increases average ticket',
      'Direct routing to your booking tool or phone number',
      'Mobile-optimized card layout that works via text link or QR code',
    ],
    bestFitIndustries: [
      'Mobile Auto Detailing',
      'Detailing Shops & Studios',
      'Car Wash + Detail Combo Services',
      'Paint Correction & Ceramic Coating',
      'Fleet Detailing',
    ],
    faq: [
      {
        q: 'What if I only have two packages?',
        a: 'Two to four packages works best visually. We can absolutely build around just two tiers.',
      },
      {
        q: 'Can the add-ons show a running total?',
        a: 'Yes. The price calculator updates in real-time as customers select add-ons, so they see their total before booking.',
      },
      {
        q: 'How do customers book after selecting a package?',
        a: 'You choose the destination — Calendly, Square, HoneyBook, a phone number, or any booking link you already use.',
      },
      {
        q: 'Can I add vehicle photos or example before/afters?',
        a: 'Yes. We can include example work photos per package to show the quality difference between tiers.',
      },
    ],
  },

  'painter-estimate-page': {
    customerFlow: [
      'Finds your estimate page from Google, your website, or a social media link',
      'Selects interior, exterior, or both',
      'Enters room count, square footage, and project condition details',
      'Provides their contact info and preferred contact time',
      'Submits the request — receives a confirmation email and expects your call',
    ],
    businessReceives: [
      'Estimate request page branded to your painting business',
      'Pre-qualified leads with project scope already described',
      'Email notification per submission with full project details',
      'Optional photo upload so you can pre-assess before calling',
      'Confirmation email sent automatically to the homeowner',
    ],
    bestFitIndustries: [
      'Interior & Exterior Painting',
      'Cabinet Painting & Refinishing',
      'Deck & Fence Staining',
      'Commercial Painting',
      'Drywall Repair + Painting',
    ],
    faq: [
      {
        q: 'How is this different from a regular contact form?',
        a: 'A regular contact form gives you almost no information. This estimate page collects scope, square footage, project type, and condition — so you can pre-qualify and give accurate ballparks before the first call.',
      },
      {
        q: 'Can customers upload photos of their space?',
        a: 'Yes. A photo upload option is included so customers can show you wall condition, current color, and trim details.',
      },
      {
        q: 'Do I need to display prices?',
        a: 'No. This is an estimate request page — it collects the information you need to provide a quote. You follow up directly with the pricing.',
      },
      {
        q: 'Can I embed this on my existing website?',
        a: 'The MicroBuild is delivered as a standalone link. Embedding requires a simple iframe or redirect from your site.',
      },
    ],
  },

  'review-booster-page': {
    customerFlow: [
      'Receives a text message after their service is completed: "How did we do? [link]"',
      'Taps the link — lands on a simple star rating page',
      'Selects 1–5 stars',
      'Happy customers (4–5 stars) are immediately routed to your Google review page',
      'Unhappy customers (1–3 stars) see a private feedback form — their response goes to you, not Google',
    ],
    businessReceives: [
      'Review booster page with your business name and logo',
      'Intelligent routing: 4–5 stars → Google review, 1–3 stars → private feedback form',
      'Private feedback email sent to you — so you can address issues before they become public reviews',
      'Shareable link optimized for SMS and messaging apps',
      'Works on all devices with no login required for your customers',
    ],
    bestFitIndustries: [
      'Any Local Service Business (universal)',
      'Home Services (HVAC, Plumbing, Electrical)',
      'Landscaping & Lawn Care',
      'Pressure Washing & Exterior Cleaning',
      'Cleaning Services',
      'Pest Control',
    ],
    faq: [
      {
        q: 'How does the routing between Google and private feedback work?',
        a: 'When a customer selects 4 or 5 stars, a "Leave a Google Review" button appears that links directly to your Google review URL. When they select 1–3 stars, a private feedback form appears instead — their comments go to your email, not Google.',
      },
      {
        q: 'Do I need a Google Business Profile to use this?',
        a: 'Yes — you need a Google Business Profile with a review link. We can also set up a Facebook review link as a secondary option.',
      },
      {
        q: 'How do I send this to customers?',
        a: 'Text them the link after each completed job. You can also use it in follow-up emails, receipts, or invoices.',
      },
      {
        q: 'Can I use this for Facebook reviews too?',
        a: 'Yes. We can route happy customers to Facebook, Google, or both — your choice.',
      },
      {
        q: 'Will customers need to create an account to leave a review?',
        a: "They'll need to be logged into Google when they click the review link, but the MicroBuild page itself requires no login.",
      },
    ],
  },

  'before-after-trust-page': {
    customerFlow: [
      'Receives your trust page link via social media, ad, email signature, or QR code',
      'Sees a striking before/after image slider — immediately understands the quality of your work',
      'Reads customer testimonials and sees your star rating',
      'Reviews your service highlights and what makes you different',
      'Taps the primary CTA — calls, books, or requests a quote',
    ],
    businessReceives: [
      'High-impact trust page with before/after image gallery',
      'Customer testimonials section (up to 4 quotes)',
      'Star rating display and key service highlights',
      'Primary CTA button routing to your booking page, phone, or contact form',
      'Fast-loading, shareable URL optimized for social sharing with correct preview image',
    ],
    bestFitIndustries: [
      'Pressure Washing & Exterior Cleaning',
      'Landscaping & Lawn Care',
      'Pool Cleaning & Renovation',
      'Auto Detailing',
      'House Cleaning & Maid Services',
      'Painting & Staining',
    ],
    faq: [
      {
        q: 'How many before/after photos do I need?',
        a: 'Minimum 3 pairs, maximum 6. More is better — the visual proof is the whole point of this build. We can work with phone camera photos as long as they are well-lit.',
      },
      {
        q: "Do I need professional photography?",
        a: 'No. Natural light, good composition, and a clean shot of the before and after work well. We can advise on what makes a strong before/after image when we scope your build.',
      },
      {
        q: 'How do I share this page?',
        a: 'The page is a single shareable URL. Put it in your Instagram bio, send it via SMS to prospects, use it in email signatures, or run it as a destination for paid ads.',
      },
      {
        q: 'Can I update photos after it is built?',
        a: 'Yes. Photo updates are included in the first 30 days. After that, updates are available at a small maintenance fee.',
      },
    ],
  },
};

export default templateDetails;
