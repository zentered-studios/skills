---
type: llm
---

The response reports per account, errors first, then warnings, then a
short overview. It names the date, live mode and the look-back window.

If the check could not run, for example because the Stripe CLI is missing
or a key expired, or a check is listed as unknown, the response says so plainly
and does not call the account clean or healthy. Telling the user to run
`stripe login` passes.

It fails if it prints a customer name, email or card detail, adds amounts
in different currencies together, or takes or offers to take a write
action itself (refund, dispute response, payout retry, event resend).
