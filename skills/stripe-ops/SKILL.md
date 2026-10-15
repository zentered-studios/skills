---
name: stripe-ops
description: >-
  Daily read-only Stripe check across every Stripe CLI account. Reports
  errors, warnings and an overview (balance, payouts, disputes and evidence
  deadlines, early fraud warnings, failed charges and invoices, past_due and
  unpaid subscriptions, account requirements, capabilities, undelivered
  webhooks). Use for "stripe ops", "check all my stripe accounts", "daily
  stripe overview", "anything wrong in stripe", "stripe health check", "do I
  have disputes or failed payouts", or a morning check of payments. Live
  mode, never writes. Not for building a Stripe integration or debugging
  webhook code.
---

# Stripe ops

Run one read-only check over every Stripe account the Stripe CLI is logged
in to, and report what needs action today.

## Run the check

Run the bundled script by absolute path, since the working directory is
the user's project:

```
node <skill dir>/scripts/stripe-ops.js
```

Options: `--profile <name>` (repeatable) limits the run to some profiles,
`--hours <n>` changes the look-back window from 24 hours, `--json` gives
machine-readable output, `--config <path>` reads another CLI config.

Exit code 0 means no errors and 1 means at least one error. Exit code 2
means it could not start, and stderr says why.

Use the script rather than calling `stripe` yourself. It does the parts
that are easy to get wrong by hand:

- It passes `--live` on every call. Without it the CLI refuses to run or
  reads a sandbox, and a check of test data looks clean.
- It checks that the account the API returns matches the profile's
  `account_id`. Stripe CLI before 1.53.1 ignored `--project-name` and
  read the active account instead, which would put one account's numbers
  under another's name.
- It reads API errors from the response body. The CLI exits 0 on an API
  error, so an exit code alone says nothing.
- It runs each profile on its own, so one expired key does not hide the
  other accounts.

## Report to the user

Lead with errors, then warnings, per account. Give each one in a line with
the object id and what to do next. Then the overview in two or three
lines. Skip info lines unless the user asks, or one explains an error.

Rules for the report:

- A check listed under Unknown did not run. Say which and why, and never
  call that account clean. A missing number reported as fine hides the
  problem the check exists to catch.
- Report ids, counts and amounts. Do not look up or print customer names,
  emails or card details as part of this check. The report often gets
  pasted into chat or a ticket.
- Keep each currency on its own line. Never add amounts in different
  currencies.
- Say the date, that it is live mode, and the window.
- Stay read-only. Do not refund, close a dispute, retry a payout or resend
  events. Name the Dashboard page or the command the user can run.

When no profile is logged in, tell the user to run `stripe login` for each
account, with `--project-name <name>` for every account after the first.
The script reads profiles from `~/.config/stripe/config.toml`.

## What each finding means

Errors need action today:

- `access`: the key is expired or revoked, or the profile returned another
  account. Fix with `stripe login --project-name <profile>`.
- `account`: charges or payouts are disabled, or `disabled_reason` is set.
- `requirements` past due: Stripe has restricted or will restrict the
  account. Fix in Dashboard, Settings, Business.
- `disputes`: a dispute needs evidence. The due date is the deadline; with
  no evidence by then the dispute is lost.
- `payouts` failed: money did not reach the bank. Check the bank account.
- `subscriptions` unpaid: Stripe stopped retrying. The customer may still
  have access.
- `capabilities` card_payments not active: the account cannot take cards.

Warnings need a look this week:

- `requirements` currently due, with the deadline.
- `early fraud warnings` still actionable: a refund now can prevent a
  dispute and its fee.
- `charges` failed, counted per customer and grouped by failure code.
- `invoices` with failed payments, and `subscriptions` past_due: Stripe
  is still retrying.
- `webhooks`: events not delivered after an hour, or no enabled endpoint
  receives `charge.dispute.created`, so disputes reach nobody until this
  check runs.
- `payouts` still pending a day after the expected arrival date.
- `balance` below zero.

Info: other payment methods pending or inactive (often by design),
disabled webhook endpoints, disputes under review, requirements due
later, and lists longer than the script reads (it reads up to 1,000
charges and 1,000 events per window).

## Limits

- Stripe keeps events for 30 days, so `--hours` above 720 loses the
  event-based checks.
- The dispute, early fraud warning and subscription lists read the newest
  100 of each.
- It does not compute a dispute rate. Stripe shows it in the Dashboard.
