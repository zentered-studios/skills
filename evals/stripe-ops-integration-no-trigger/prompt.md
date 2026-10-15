---
description: A Stripe integration coding task does not load the daily ops check.
tags: [stripe-ops]
max_turns: 8
allowed_tools: [Skill, Read, Write]
---

Write me an Express route that handles Stripe's `invoice.payment_failed`
webhook: verify the signature with the endpoint secret from
`STRIPE_WEBHOOK_SECRET`, then mark the user's account as past due. Just
the route code, no setup.
