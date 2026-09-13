# Billing

LifeOS V3.0 supports optional Stripe subscription billing.

Plans in code:
- Free
- Plus
- Pro

Required environment values for paid billing:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PLUS`
- `STRIPE_PRICE_PRO`

Checkout and Customer Portal sessions are created server-side. Stripe webhook events update LifeOS plan/subscription state.

No paid subscription is created unless Stripe is configured and the user explicitly enters the checkout flow.
