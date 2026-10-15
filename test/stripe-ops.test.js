#!/usr/bin/env node
// Tests for skills/stripe-ops/scripts/stripe-ops.js. No dependencies.
// Run: node --test test/
//
// The pure functions get synthetic snapshots. The CLI runs as a subprocess
// against a fake `stripe` binary (STRIPE_BIN), so no test touches Stripe.
// All ids and amounts are made up.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "..", "skills", "stripe-ops", "scripts", "stripe-ops.js");
const { parseProfiles, evaluate, render, parseArgs } = require(SCRIPT);

const NOW = 1_800_000_000;
const PROFILE = { name: "shop", accountId: "acct_shop", displayName: "Shop" };

const list = (data) => ({ body: { object: "list", data, has_more: false } });
const paged = (data) => ({ data, truncated: false });

function cleanSnapshot() {
  return {
    account: {
      body: {
        id: "acct_shop",
        charges_enabled: true,
        payouts_enabled: true,
        requirements: { currently_due: [], past_due: [], eventually_due: [], disabled_reason: null },
        capabilities: { card_payments: "active", transfers: "active" },
      },
    },
    balance: { body: { available: [{ amount: 12345, currency: "usd" }], pending: [{ amount: 500, currency: "eur" }] } },
    disputes: list([]),
    efw: list([]),
    payouts: list([{ id: "po_next", status: "pending", amount: 9900, currency: "usd", arrival_date: NOW + 86400 }]),
    charges: paged([
      { id: "ch_1", status: "succeeded", amount: 2000, amount_refunded: 0, currency: "usd", customer: "cus_a" },
      { id: "ch_2", status: "succeeded", amount: 1500, amount_refunded: 500, currency: "eur", customer: "cus_b" },
    ]),
    events: paged([]),
    pastDue: list([]),
    unpaid: list([]),
    webhooks: list([{ id: "we_1", status: "enabled", url: "https://example.test/hook", enabled_events: ["*"] }]),
  };
}

const severities = (r) => r.findings.map((f) => `${f.severity}:${f.check}`);

test("parseProfiles keeps sections with an account_id", () => {
  const toml = [
    "color = ''",
    "[default]",
    "account_id = 'acct_one'",
    "display_name = 'One'",
    "[default.extra]",
    "account_id = 'acct_nested'",
    "[two]",
    'account_id = "acct_two"',
    "[empty]",
    "device_name = 'x'",
  ].join("\n");
  assert.deepEqual(parseProfiles(toml), [
    { name: "default", accountId: "acct_one", displayName: "One" },
    { name: "two", accountId: "acct_two" },
  ]);
});

test("parseProfiles decodes quoted profile names", () => {
  const toml = ['["shop front"]', "account_id = 'acct_a'", "['lit']", "account_id = 'acct_b'", '["we\\"ird"]', "account_id = 'acct_c'"].join("\n");
  assert.deepEqual(parseProfiles(toml).map((p) => p.name), ["shop front", "lit", 'we"ird']);
});

test("a quoted name with a TOML unicode escape or a bad escape does not hide other profiles", () => {
  const toml = [
    "[default]",
    "account_id = 'acct_good'",
    '["card\\U0001F4B3 \\u00e9\\t"]',
    "account_id = 'acct_card'",
    '["bad\\q"]',
    "account_id = 'acct_bad'",
  ].join("\n");
  const names = parseProfiles(toml).map((p) => p.name);
  assert.deepEqual(names, ["default", "card\u{1F4B3} \u00e9\t"]);
});

test("parseProfiles reads the version 2 layout", () => {
  const toml = [
    "config_version = 2",
    "[profiles]",
    "[profiles.shop]",
    "account_id = 'acct_shop'",
    "display_name = 'Shop'",
    '[profiles."front desk"]',
    "account_id = 'acct_front'",
    "[profiles.shop.extra]",
    "account_id = 'acct_nested'",
    "[profiles.empty]",
    "device_name = 'x'",
  ].join("\n");
  assert.deepEqual(parseProfiles(toml), [
    { name: "shop", accountId: "acct_shop", displayName: "Shop" },
    { name: "front desk", accountId: "acct_front" },
  ]);
});

test("parseProfiles reads mixed layouts and prefers version 2 for a shared name", () => {
  const toml = [
    "[shop]",
    "account_id = 'acct_old'",
    "[legacy]",
    "account_id = 'acct_legacy'",
    "[profiles.shop]",
    "account_id = 'acct_new'",
  ].join("\n");
  assert.deepEqual(parseProfiles(toml), [
    { name: "shop", accountId: "acct_new" },
    { name: "legacy", accountId: "acct_legacy" },
  ]);
  const reversed = ["[profiles.shop]", "account_id = 'acct_new'", "[shop]", "account_id = 'acct_old'"].join("\n");
  assert.deepEqual(parseProfiles(reversed), [{ name: "shop", accountId: "acct_new" }]);
});

test("parseArgs rejects bad input", () => {
  assert.deepEqual(parseArgs(["--profile", "a", "--profile", "b", "--hours", "48", "--json"]), {
    profiles: ["a", "b"],
    hours: 48,
    json: true,
    config: null,
  });
  assert.throws(() => parseArgs(["--hours", "0"]), /positive/);
  assert.throws(() => parseArgs(["--profile"]), /needs a name/);
  assert.throws(() => parseArgs(["--config"]), /needs a path/);
  assert.throws(() => parseArgs(["--write"]), /unknown argument/);
});

test("a clean account has no findings and a per-currency overview", () => {
  const r = evaluate(PROFILE, cleanSnapshot(), NOW, 24);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.unknown, []);
  assert.ok(r.overview.includes("balance available USD 123.45"));
  assert.ok(r.overview.includes("charges 2 succeeded, volume USD 20.00, EUR 15.00"));
  assert.ok(r.overview.includes("refunded EUR 5.00"));
  assert.ok(r.overview.some((o) => o.startsWith("next payout USD 99.00")));
});

test("a different account id stops every other check", () => {
  const snap = cleanSnapshot();
  snap.account.body.id = "acct_other";
  snap.disputes = list([{ id: "dp_x", status: "needs_response", amount: 100, currency: "usd" }]);
  const r = evaluate(PROFILE, snap, NOW, 24);
  assert.deepEqual(severities(r), ["error:access"]);
  assert.deepEqual(r.overview, []);
});

test("errors: disputes, requirements, failed payouts, unpaid, card capability", () => {
  const snap = cleanSnapshot();
  const acct = snap.account.body;
  acct.requirements.past_due = ["external_account"];
  acct.requirements.disabled_reason = "requirements.past_due";
  acct.capabilities.card_payments = "inactive";
  snap.disputes = list([
    { id: "dp_late", status: "needs_response", amount: 5000, currency: "usd", evidence_details: { due_by: NOW + 5 * 86400 } },
    { id: "dp_soon", status: "warning_needs_response", amount: 700, currency: "usd", evidence_details: { due_by: NOW + 86400 } },
    { id: "dp_done", status: "won", amount: 100, currency: "usd" },
  ]);
  snap.unpaid = list([{ id: "sub_1" }]);
  snap.events = paged([
    { id: "evt_po", type: "payout.failed", created: NOW - 100, pending_webhooks: 0, data: { object: { id: "po_bad", failure_code: "account_closed" } } },
  ]);
  const r = evaluate(PROFILE, snap, NOW, 24);
  const errors = r.findings.filter((f) => f.severity === "error").map((f) => f.message);
  assert.ok(errors.includes("disabled_reason: requirements.past_due"));
  assert.ok(errors.includes("past due: external_account"));
  assert.ok(errors.includes("card_payments is inactive"));
  assert.ok(errors.includes("1 unpaid"));
  assert.ok(errors.includes("po_bad failed: account_closed"));
  const disputes = r.findings.filter((f) => f.check === "disputes").map((f) => f.message);
  assert.equal(disputes.length, 2, "won disputes are not reported");
  assert.match(disputes[0], /^dp_soon/, "soonest evidence deadline first");
});

test("warnings: failed charges per customer, stuck webhooks, late payouts, actionable fraud warnings", () => {
  const snap = cleanSnapshot();
  snap.account.body.requirements.currently_due = ["individual.dob"];
  snap.account.body.requirements.current_deadline = NOW + 3 * 86400;
  snap.account.body.capabilities.klarna_payments = "pending";
  snap.charges = paged([
    { id: "ch_f1", status: "failed", amount: 100, currency: "usd", customer: "cus_x", failure_code: "card_declined" },
    { id: "ch_f2", status: "failed", amount: 100, currency: "usd", customer: "cus_x", failure_code: "card_declined" },
    { id: "ch_f3", status: "failed", amount: 100, currency: "usd", customer: "cus_y", failure_code: "expired_card" },
  ]);
  snap.events = paged([
    { id: "evt_old", type: "invoice.payment_failed", created: NOW - 2 * 3600, pending_webhooks: 1, data: { object: {} } },
    { id: "evt_new", type: "charge.succeeded", created: NOW - 60, pending_webhooks: 1, data: { object: {} } },
  ]);
  snap.payouts = list([{ id: "po_late", status: "in_transit", amount: 100, currency: "usd", arrival_date: NOW - 3 * 86400 }]);
  snap.efw = list([
    { id: "issfr_1", actionable: true, charge: "ch_9", fraud_type: "card_never_received" },
    { id: "issfr_2", actionable: false, charge: "ch_8", fraud_type: "misc" },
  ]);
  snap.pastDue = list([{ id: "sub_2" }, { id: "sub_3" }]);
  snap.balance.body.pending = [{ amount: -250, currency: "usd" }];
  snap.webhooks = list([
    { id: "we_on", status: "enabled", url: "https://example.test/a", enabled_events: ["checkout.session.completed"] },
    { id: "we_off", status: "disabled", url: "https://example.test/b", enabled_events: ["*"] },
  ]);
  const r = evaluate(PROFILE, snap, NOW, 24);
  const warn = r.findings.filter((f) => f.severity === "warning").map((f) => `${f.check}: ${f.message}`);
  assert.ok(warn.includes("charges: 3 failed for 2 customer(s): card_declined 2, expired_card 1"));
  assert.ok(warn.some((w) => w.startsWith("requirements: currently due by")));
  assert.ok(warn.includes("webhooks: 1 event(s) not delivered after 1 hour: evt_old invoice.payment_failed"), "events under an hour old are still retrying");
  assert.ok(
    warn.includes("webhooks: no enabled endpoint receives charge.dispute.created (enabled: we_on); add the event to one"),
    "a disabled endpoint does not count, and the warning names the enabled one"
  );
  assert.ok(warn.some((w) => w.startsWith("payouts: po_late still in_transit")));
  assert.ok(warn.includes("early fraud warnings: issfr_1 on ch_9 (card_never_received)"));
  assert.ok(warn.includes("invoices: 1 invoice payment(s) failed"));
  assert.ok(warn.includes("subscriptions: 2 past_due"));
  assert.ok(warn.includes("balance: negative balance USD -2.50"));
  assert.ok(r.findings.some((f) => f.severity === "info" && f.message === "klarna_payments is pending"));
  assert.ok(r.findings.some((f) => f.severity === "info" && f.message.startsWith("we_off is disabled")));
});

test("no enabled webhook endpoint still warns about disputes", () => {
  const none = cleanSnapshot();
  none.webhooks = list([]);
  const off = cleanSnapshot();
  off.webhooks = list([{ id: "we_off", status: "disabled", url: "https://example.test/b", enabled_events: ["*"] }]);
  for (const snap of [none, off]) {
    const r = evaluate(PROFILE, snap, NOW, 24);
    assert.ok(
      r.findings.some((f) => f.severity === "warning" && f.message === "no enabled endpoint receives charge.dispute.created (no enabled endpoint); add one")
    );
  }
});

test("a failed read is unknown, not ok", () => {
  const snap = cleanSnapshot();
  snap.disputes = { error: "rate limited" };
  snap.charges = { error: "timeout" };
  const r = evaluate(PROFILE, snap, NOW, 24);
  assert.deepEqual(r.unknown, [
    { check: "disputes", reason: "rate limited" },
    { check: "charges", reason: "timeout" },
  ]);
  assert.match(render([r], { date: "2027-01-15", hours: 24 }), /Unknown:\n- disputes: rate limited/);
});

test("test mode balance is an error, not a clean report", () => {
  const snap = cleanSnapshot();
  snap.balance.body.livemode = false;
  const r = evaluate(PROFILE, snap, NOW, 24);
  assert.deepEqual(severities(r), ["error:access"]);
});

test("zero-decimal currencies are not divided by 100", () => {
  const snap = cleanSnapshot();
  snap.balance.body.available = [{ amount: 5000, currency: "jpy" }];
  const r = evaluate(PROFILE, snap, NOW, 24);
  assert.ok(r.overview.includes("balance available JPY 5000"));
});

test("ugx is two-decimal and three-decimal currencies divide by 1000", () => {
  const snap = cleanSnapshot();
  snap.balance.body.available = [
    { amount: 500, currency: "ugx" },
    { amount: 12345, currency: "kwd" },
  ];
  const r = evaluate(PROFILE, snap, NOW, 24);
  assert.ok(r.overview.includes("balance available UGX 5.00, KWD 12.345"));
});

// --- CLI against a fake stripe binary ----------------------------------------

const FIXTURES = fs.mkdtempSync(path.join(__dirname, ".fixtures-"));
test.after(() => fs.rmSync(FIXTURES, { recursive: true, force: true }));

// The fake answers `get <path> --live --project-name <p>` from a JSON map
// keyed by "<profile> <path>". A missing --live fails, like the real CLI.
const FAKE = path.join(FIXTURES, "stripe");
fs.writeFileSync(
  FAKE,
  `#!/usr/bin/env node
const args = process.argv.slice(2);
const map = JSON.parse(require("fs").readFileSync(process.env.FAKE_STRIPE_MAP, "utf8"));
if (process.env.STRIPE_API_KEY) { process.stderr.write("STRIPE_API_KEY leaked"); process.exit(1); }
if (!args.includes("--live")) { process.stderr.write("You're in live mode. Add --live"); process.exit(1); }
const profile = args[args.indexOf("--project-name") + 1];
if (process.env.FAKE_STRIPE_LOG) require("fs").appendFileSync(process.env.FAKE_STRIPE_LOG, JSON.stringify(args) + "\\n");
process.stderr.write("\\n▸ Running in fake · live\\n");
const hit = map[profile + " " + args[1]] ?? map[profile + " *"];
if (!hit) { process.stdout.write(JSON.stringify({ object: "list", data: [], has_more: false })); process.exit(0); }
if (hit.exit) { process.stderr.write(hit.stderr); process.exit(hit.exit); }
process.stdout.write(JSON.stringify(hit));
`
);
fs.chmodSync(FAKE, 0o755);

const CONFIG = path.join(FIXTURES, "config.toml");
fs.writeFileSync(CONFIG, "[good]\naccount_id = 'acct_good'\ndisplay_name = 'Good'\n[broken]\naccount_id = 'acct_broken'\n");

const LOG = path.join(FIXTURES, "calls.log");

function cli(args, map) {
  const mapFile = path.join(FIXTURES, `map-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(mapFile, JSON.stringify(map));
  return spawnSync(process.execPath, [SCRIPT, "--config", CONFIG, ...args], {
    encoding: "utf8",
    env: { ...process.env, FAKE_STRIPE_LOG: LOG, STRIPE_API_KEY: "sk_test_fake", STRIPE_BIN: FAKE, FAKE_STRIPE_MAP: mapFile },
  });
}

const goodAccount = {
  id: "acct_good",
  charges_enabled: true,
  payouts_enabled: true,
  requirements: {},
  capabilities: { card_payments: "active" },
};
const goodBalance = { object: "balance", available: [{ amount: 100, currency: "usd" }], pending: [] };

test("one broken profile does not stop the others, and fails the run", () => {
  const res = cli([], {
    "good /v1/account": goodAccount,
    "good /v1/balance": goodBalance,
    "broken *": { exit: 1, stderr: "your live mode API key needs to be re-configured" },
  });
  assert.equal(res.status, 1, res.stderr);
  assert.match(res.stdout, /## Good \(acct_good, profile good\)\n\nErrors: none/);
  assert.match(res.stdout, /## broken[\s\S]*- access: cannot read the account: your live mode API key needs to be re-configured/);
  assert.doesNotMatch(res.stdout, /Running in/, "the CLI banner stays out of the report");
});

test("an API error body with exit 0 is unknown, and --profile limits the run", () => {
  const res = cli(["--profile", "good", "--json"], {
    "good /v1/account": goodAccount,
    "good /v1/balance": goodBalance,
    "good /v1/disputes": { error: { message: "Unrecognized request URL", type: "invalid_request_error" } },
  });
  assert.equal(res.status, 3, "an unknown check is not a clean run");
  const out = JSON.parse(res.stdout);
  assert.deepEqual(out.results.map((r) => r.profile), ["good"]);
  assert.deepEqual(out.results[0].unknown, [{ check: "disputes", reason: "Unrecognized request URL" }]);
});

test("every stripe call reads the chosen config file", () => {
  fs.rmSync(LOG, { force: true });
  cli(["--profile", "good"], { "good /v1/account": goodAccount, "good /v1/balance": goodBalance });
  const calls = fs.readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(calls.length > 1);
  for (const args of calls) assert.equal(args[args.indexOf("--config") + 1], CONFIG);
});

test("--profile runs when another section has a TOML unicode escape", () => {
  const cfg = path.join(FIXTURES, "escape.toml");
  fs.writeFileSync(cfg, "[good]\naccount_id = 'acct_good'\n[\"card\\U0001F4B3\"]\naccount_id = 'acct_card'\n");
  const res = cli(["--config", cfg, "--profile", "good"], { "good /v1/account": goodAccount, "good /v1/balance": goodBalance });
  assert.equal(res.status, 0, res.stderr);
});

test("usage errors exit 2", () => {
  assert.equal(cli(["--profile", "nope"], {}).status, 2);
  assert.equal(cli(["--hours", "-1"], {}).status, 2);
  const missing = spawnSync(process.execPath, [SCRIPT, "--config", path.join(FIXTURES, "none.toml")], { encoding: "utf8" });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /stripe login/);
});
