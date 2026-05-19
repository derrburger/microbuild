# Workflow customization — future notifications & monetization (placeholder)

This note captures **intentional deferrals** for the buyer → `/request?workflowId=` → `buyer_requests` customization flow shipped in v1.

## Notifications

- **Future:** notify the **original workflow publisher** (`source_creator_profile_id`) when a buyer submits a customization request against their `published_workflows` row.
- Delivery mechanism TBD (email, in-app, `/messages` system events). v1 only surfaces counts on **Dashboard → Workflows** and contextual labels elsewhere.

## Monetization / checkout

- Workflow customization requests **do not** activate Stripe or deposits. Scope confirmation stays manual / proposal-driven until the Stripe phase documented in the main README.

## Creator priority

- v1 keeps **marketplace fairness**: publishers are **not** auto-assigned when their workflow seeds a request.
- **Future:** optional “first right to apply” or highlighted application lane for the originating creator once governance rules exist.
