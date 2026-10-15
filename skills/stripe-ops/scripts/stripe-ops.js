#!/usr/bin/env node
// Daily read-only Stripe check for the stripe-ops skill. No dependencies,
// stdlib only.
//
//   node stripe-ops.js                       every profile in the Stripe CLI config
//   node stripe-ops.js --profile default     one profile (repeat the flag for more)
//   node stripe-ops.js --hours 72            look back 72 hours instead of 24
//   node stripe-ops.js --json                machine-readable output
//   node stripe-ops.js --config path.toml    another Stripe CLI config file
//
// It only runs `stripe get ... --live --project-name <profile>`. It never
// creates, updates or deletes anything. Every profile runs on its own: one
// failing profile never stops the others.
//
// Each finding is error, warning or info. A check that could not run is
// unknown, never ok. Findings carry object ids and counts, never customer
// names, emails or card details.
//
// Exit codes: 0 no errors, 1 at least one error, 2 usage error or no
// profiles found.
//
// STRIPE_BIN overrides the stripe binary (tests use a fake).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const OPEN_DISPUTE = new Set(["needs_response", "warning_needs_response"]);
const REVIEW_DISPUTE = new Set(["under_review", "warning_under_review"]);
const DISPUTE_EVENTS = new Set(["*", "charge.dispute.created"]);
// Stripe sends ugx (and isk) amounts times 100, so they stay two-decimal.
const ZERO_DECIMAL = new Set(
  "bif clp djf gnf jpy kmf krw mga pyg rwf vnd vuv xaf xof xpf".split(" ")
);
const THREE_DECIMAL = new Set("bhd jod kwd omr tnd".split(" "));
const MAX_PAGES = 10;
const HOUR = 3600;
const DAY = 86400;

// --- config -----------------------------------------------------------------

// A TOML table key is bare, "basic" (JSON-style escapes) or 'literal'.
function tableKey(raw) {
  if (raw.startsWith('"')) return JSON.parse(raw);
  if (raw.startsWith("'")) return raw.slice(1, -1);
  return raw;
}

// Reads the profile sections of a Stripe CLI config.toml. A section counts
// as a profile only when it holds an account_id, which `stripe login` writes.
function parseProfiles(toml) {
  const profiles = [];
  let current = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    const section = line.match(/^\[\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^\]."']+?)\s*\]$/);
    if (section) {
      current = { name: tableKey(section[1]) };
      profiles.push(current);
      continue;
    }
    if (line.startsWith("[")) {
      current = null;
      continue;
    }
    const kv = current && line.match(/^(account_id|display_name)\s*=\s*['"]([^'"]*)['"]/);
    if (kv) current[kv[1] === "account_id" ? "accountId" : "displayName"] = kv[2];
  }
  return profiles.filter((p) => p.accountId);
}

function defaultConfigPath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "stripe", "config.toml");
}

// --- fetching ---------------------------------------------------------------

// target is { profile, config }: the profile name and the config file the
// CLI must read it from.
function stripeGet(target, apiPath, params = {}) {
  const args = ["get", apiPath, "--live", "--project-name", target.profile, "--config", target.config];
  for (const [k, v] of Object.entries(params)) args.push("-d", `${k}=${v}`);
  // STRIPE_API_KEY beats the profile's credentials in the CLI, so an
  // inherited test key would answer --live calls with test data.
  const { STRIPE_API_KEY, ...env } = process.env;
  return new Promise((resolve) => {
    execFile(
      process.env.STRIPE_BIN || "stripe",
      args,
      { timeout: 30000, maxBuffer: 64 * 1024 * 1024, env },
      (err, stdout, stderr) => {
        // The CLI prints its "Running in" banner on stderr; strip it.
        const why = String(stderr || "").replace(/^.*Running in.*$/gm, "").trim();
        if (err && err.code === "ENOENT") return resolve({ error: "stripe CLI not found" });
        if (err) return resolve({ error: why || err.message });
        let body;
        try {
          body = JSON.parse(stdout);
        } catch {
          return resolve({ error: `not JSON from ${apiPath}` });
        }
        // API errors come back with exit 0 and an error body.
        if (body.error) return resolve({ error: body.error.message || body.error.type });
        resolve({ body });
      }
    );
  });
}

// Follows has_more up to MAX_PAGES pages and says when it stopped early.
async function stripeList(target, apiPath, params = {}) {
  const data = [];
  let after;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await stripeGet(target, apiPath, {
      limit: 100,
      ...params,
      ...(after ? { starting_after: after } : {}),
    });
    if (res.error) return { error: res.error };
    data.push(...res.body.data);
    if (!res.body.has_more || !res.body.data.length) return { data, truncated: false };
    after = res.body.data[res.body.data.length - 1].id;
  }
  return { data, truncated: true };
}

async function collect(profile, config, now, hours) {
  const target = { profile: profile.name, config };
  const since = now - hours * HOUR;
  const account = await stripeGet(target, "/v1/account");
  if (account.error) return { account };
  const [balance, disputes, efw, payouts, charges, events, pastDue, unpaid, webhooks] =
    await Promise.all([
      stripeGet(target, "/v1/balance"),
      stripeGet(target, "/v1/disputes", { limit: 100 }),
      stripeGet(target, "/v1/radar/early_fraud_warnings", { limit: 100 }),
      stripeGet(target, "/v1/payouts", { limit: 20 }),
      stripeList(target, "/v1/charges", { "created[gte]": since }),
      stripeList(target, "/v1/events", { "created[gte]": since }),
      stripeGet(target, "/v1/subscriptions", { status: "past_due", limit: 100 }),
      stripeGet(target, "/v1/subscriptions", { status: "unpaid", limit: 100 }),
      stripeGet(target, "/v1/webhook_endpoints", { limit: 100 }),
    ]);
  return { account, balance, disputes, efw, payouts, charges, events, pastDue, unpaid, webhooks };
}

// --- evaluation -------------------------------------------------------------

function money(amount, currency) {
  const c = String(currency).toLowerCase();
  const digits = ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2;
  return `${c.toUpperCase()} ${(amount / 10 ** digits).toFixed(digits)}`;
}

function sumBy(items, amountOf) {
  const totals = {};
  for (const item of items) {
    totals[item.currency] = (totals[item.currency] || 0) + amountOf(item);
  }
  return Object.entries(totals).map(([c, a]) => money(a, c));
}

function day(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function listOf(res) {
  return res.body ? res.body.data : res.data;
}

// Turns one profile's raw responses into findings and an overview. Pure:
// tests feed it synthetic snapshots.
function evaluate(profile, snap, now, hours) {
  const out = {
    profile: profile.name,
    name: profile.displayName || profile.name,
    accountId: profile.accountId,
    findings: [],
    overview: [],
    unknown: [],
  };
  const add = (severity, check, message) => out.findings.push({ severity, check, message });
  const unknown = (check, res) => out.unknown.push({ check, reason: res.error });

  if (snap.account.error) {
    add("error", "access", `cannot read the account: ${snap.account.error}`);
    return out;
  }
  const acct = snap.account.body;
  if (acct.id !== profile.accountId) {
    // stripe-cli before 1.53.1 ignored --project-name and ran against the
    // active account. Reporting that data under this profile would be wrong.
    add("error", "access", `profile returned ${acct.id}, expected ${profile.accountId}; skipped the rest`);
    return out;
  }

  // Account status and requirements.
  const req = acct.requirements || {};
  if (acct.charges_enabled === false) add("error", "account", "charges are disabled");
  if (acct.payouts_enabled === false) add("error", "account", "payouts are disabled");
  if (req.disabled_reason) add("error", "account", `disabled_reason: ${req.disabled_reason}`);
  if (req.past_due && req.past_due.length)
    add("error", "requirements", `past due: ${req.past_due.join(", ")}`);
  if (req.currently_due && req.currently_due.length) {
    const by = req.current_deadline ? ` by ${day(req.current_deadline)}` : "";
    add("warning", "requirements", `currently due${by}: ${req.currently_due.join(", ")}`);
  }
  const later = (req.eventually_due || []).filter((f) => !(req.currently_due || []).includes(f));
  if (later.length) add("info", "requirements", `eventually due: ${later.join(", ")}`);
  for (const [cap, status] of Object.entries(acct.capabilities || {})) {
    if (status === "active") continue;
    // Card payments stopping is an outage. Other methods are often pending
    // or inactive by design, so they stay info to keep the daily run quiet.
    add(cap === "card_payments" ? "error" : "info", "capabilities", `${cap} is ${status}`);
  }

  // Balance.
  if (snap.balance.error) unknown("balance", snap.balance);
  else if (snap.balance.body.livemode === false) {
    add("error", "access", "profile returned test mode data; skipped the balance");
  } else {
    const b = snap.balance.body;
    for (const x of [...b.available, ...b.pending])
      if (x.amount < 0) add("warning", "balance", `negative balance ${money(x.amount, x.currency)}`);
    out.overview.push(`balance available ${b.available.map((x) => money(x.amount, x.currency)).join(", ") || "none"}`);
    out.overview.push(`balance pending ${b.pending.map((x) => money(x.amount, x.currency)).join(", ") || "none"}`);
  }

  // Disputes: open ones need evidence before due_by or they are lost.
  if (snap.disputes.error) unknown("disputes", snap.disputes);
  else {
    const disputes = listOf(snap.disputes);
    const dueBy = (d) => (d.evidence_details || {}).due_by;
    const open = disputes
      .filter((d) => OPEN_DISPUTE.has(d.status))
      .sort((a, b) => (dueBy(a) || 0) - (dueBy(b) || 0));
    for (const d of open) {
      const due = dueBy(d);
      add("error", "disputes", `${d.id} ${d.status} ${money(d.amount, d.currency)}${due ? `, evidence due ${day(due)}` : ""}`);
    }
    const review = disputes.filter((d) => REVIEW_DISPUTE.has(d.status)).length;
    if (review) add("info", "disputes", `${review} under review`);
  }

  // Early fraud warnings: still actionable means a refund can avoid a dispute.
  if (snap.efw.error) unknown("early fraud warnings", snap.efw);
  else
    for (const w of listOf(snap.efw).filter((x) => x.actionable))
      add("warning", "early fraud warnings", `${w.id} on ${w.charge} (${w.fraud_type})`);

  // Payouts.
  if (snap.payouts.error) unknown("payouts", snap.payouts);
  else {
    const open = listOf(snap.payouts).filter((p) => p.status === "pending" || p.status === "in_transit");
    for (const p of open.filter((p) => p.arrival_date < now - DAY))
      add("warning", "payouts", `${p.id} still ${p.status}, expected ${day(p.arrival_date)}`);
    const next = open.sort((a, b) => a.arrival_date - b.arrival_date)[0];
    out.overview.push(next ? `next payout ${money(next.amount, next.currency)} on ${day(next.arrival_date)}` : "no payout scheduled");
  }

  // Charges in the window. Failure counts use distinct customers, so one
  // card retried ten times reads as one customer.
  if (snap.charges.error) unknown("charges", snap.charges);
  else {
    const all = snap.charges.data;
    const ok = all.filter((c) => c.status === "succeeded");
    const failed = all.filter((c) => c.status === "failed");
    out.overview.push(`charges ${ok.length} succeeded, volume ${sumBy(ok, (c) => c.amount).join(", ") || "none"}`);
    const refunded = ok.filter((c) => c.amount_refunded > 0);
    if (refunded.length) out.overview.push(`refunded ${sumBy(refunded, (c) => c.amount_refunded).join(", ")}`);
    if (failed.length) {
      const customers = new Set(failed.map((c) => c.customer || c.id)).size;
      const codes = {};
      for (const c of failed) codes[c.failure_code || "unknown"] = (codes[c.failure_code || "unknown"] || 0) + 1;
      const why = Object.entries(codes).map(([k, n]) => `${k} ${n}`).join(", ");
      add("warning", "charges", `${failed.length} failed for ${customers} customer(s): ${why}`);
    }
    if (snap.charges.truncated) add("info", "charges", `more than ${all.length} charges; counted the newest ${all.length}`);
  }

  // Subscriptions.
  for (const [res, status, severity] of [[snap.pastDue, "past_due", "warning"], [snap.unpaid, "unpaid", "error"]]) {
    if (res.error) unknown(`subscriptions ${status}`, res);
    else if (listOf(res).length) add(severity, "subscriptions", `${listOf(res).length} ${status}`);
  }

  // Events in the window: failed payouts and invoices, stuck webhooks.
  if (snap.events.error) unknown("events", snap.events);
  else {
    const ev = snap.events.data;
    const of = (type) => ev.filter((e) => e.type === type);
    for (const e of of("payout.failed"))
      add("error", "payouts", `${e.data.object.id} failed: ${e.data.object.failure_code || "no code"}`);
    const invoices = of("invoice.payment_failed").length;
    if (invoices) add("warning", "invoices", `${invoices} invoice payment(s) failed`);
    const stuck = ev.filter((e) => e.pending_webhooks > 0 && e.created < now - HOUR);
    if (stuck.length) {
      const sample = stuck.slice(0, 5).map((e) => `${e.id} ${e.type}`).join(", ");
      add("warning", "webhooks", `${stuck.length} event(s) not delivered after 1 hour: ${sample}`);
    }
    const created = of("customer.subscription.created").length;
    const deleted = of("customer.subscription.deleted").length;
    out.overview.push(`subscriptions +${created} new, -${deleted} canceled`);
    if (snap.events.truncated) add("info", "events", `more than ${ev.length} events; read the newest ${ev.length}`);
  }

  // Webhook endpoints.
  if (snap.webhooks.error) unknown("webhook endpoints", snap.webhooks);
  else {
    const eps = listOf(snap.webhooks);
    const enabled = eps.filter((w) => w.status === "enabled");
    for (const w of eps.filter((w) => w.status === "disabled"))
      add("info", "webhooks", `${w.id} is disabled (${w.url})`);
    if (!enabled.some((w) => w.enabled_events.some((e) => DISPUTE_EVENTS.has(e)))) {
      const fix = enabled.length
        ? `(enabled: ${enabled.map((w) => w.id).join(", ")}); add the event to one`
        : "(no enabled endpoint); add one";
      add("warning", "webhooks", `no enabled endpoint receives charge.dispute.created ${fix}`);
    }
  }

  return out;
}

// --- output -----------------------------------------------------------------

const ORDER = ["error", "warning", "info"];
const LABEL = { error: "Errors", warning: "Warnings", info: "Info" };

function render(results, { date, hours }) {
  const count = (s) => results.reduce((n, r) => n + r.findings.filter((f) => f.severity === s).length, 0);
  const unknowns = results.reduce((n, r) => n + r.unknown.length, 0);
  const lines = [
    `# Stripe ops ${date} (live, last ${hours}h)`,
    "",
    `${results.length} account(s): ${count("error")} error(s), ${count("warning")} warning(s), ${count("info")} info, ${unknowns} unknown`,
  ];
  for (const r of results) {
    lines.push("", `## ${r.name} (${r.accountId}, profile ${r.profile})`, "");
    for (const s of ORDER) {
      const found = r.findings.filter((f) => f.severity === s);
      lines.push(`${LABEL[s]}: ${found.length ? "" : "none"}`.trimEnd());
      for (const f of found) lines.push(`- ${f.check}: ${f.message}`);
    }
    if (r.unknown.length) {
      lines.push("Unknown:");
      for (const u of r.unknown) lines.push(`- ${u.check}: ${u.reason}`);
    }
    if (r.overview.length) {
      lines.push("Overview:");
      for (const o of r.overview) lines.push(`- ${o}`);
    }
  }
  return lines.join("\n") + "\n";
}

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { profiles: [], hours: 24, json: false, config: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--profile") opts.profiles.push(argv[++i]);
    else if (a === "--hours") opts.hours = Number(argv[++i]);
    else if (a === "--config") {
      opts.config = argv[++i];
      if (!opts.config) throw new Error("--config needs a path");
    }
    else throw new Error(`unknown argument ${a}`);
  }
  if (!(opts.hours > 0)) throw new Error("--hours needs a positive number");
  if (opts.profiles.some((p) => !p)) throw new Error("--profile needs a name");
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`stripe-ops: ${e.message}\n`);
    process.exit(2);
  }
  const configPath = opts.config || defaultConfigPath();
  let profiles;
  try {
    profiles = parseProfiles(fs.readFileSync(configPath, "utf8"));
  } catch {
    process.stderr.write(`stripe-ops: cannot read ${configPath}. Run \`stripe login\` first.\n`);
    process.exit(2);
  }
  if (opts.profiles.length) {
    const missing = opts.profiles.filter((p) => !profiles.some((x) => x.name === p));
    if (missing.length) {
      process.stderr.write(`stripe-ops: no profile ${missing.join(", ")} in ${configPath}\n`);
      process.exit(2);
    }
    profiles = profiles.filter((p) => opts.profiles.includes(p.name));
  }
  if (!profiles.length) {
    process.stderr.write(`stripe-ops: no logged-in profiles in ${configPath}. Run \`stripe login\`.\n`);
    process.exit(2);
  }

  const now = Math.floor(Date.now() / 1000);
  const results = [];
  for (const p of profiles) results.push(evaluate(p, await collect(p, configPath, now, opts.hours), now, opts.hours));

  const date = new Date(now * 1000).toISOString().slice(0, 10);
  if (opts.json) process.stdout.write(JSON.stringify({ date, hours: opts.hours, results }, null, 2) + "\n");
  else process.stdout.write(render(results, { date, hours: opts.hours }));
  process.exit(results.some((r) => r.findings.some((f) => f.severity === "error")) ? 1 : 0);
}

if (require.main === module) main();

module.exports = { parseProfiles, evaluate, render, parseArgs };
