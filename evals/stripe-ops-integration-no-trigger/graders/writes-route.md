---
type: llm
---

The response gives an Express route that reads the raw request body,
verifies the signature with `stripe.webhooks.constructEvent` and the
secret from `STRIPE_WEBHOOK_SECRET`, handles `invoice.payment_failed`, and
returns a 2xx response. It does not run a Stripe account check.
