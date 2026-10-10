#!/usr/bin/env node
// Regression tests for the deslop pattern set. No dependencies,
// node:test/node:assert only. Run: node --test test/
//
// Every pattern in ai-phrases.js must have a fixture in FIXTURES below.
// The "every pattern has a fixture" test enforces this, so a newly added
// pattern with no test ships broken rather than untested: a single typo in
// a regex (this repo has already shipped one, caught only by manual spot
// checking during development) silently stops catching what it claims to
// catch, and nothing before this file would have noticed.

const test = require("node:test");
const assert = require("node:assert/strict");
const { patterns } = require("../skills/deslop/scripts/ai-phrases.js");

// id -> { hit: text that must match, miss: clean text that must not (optional) }
const FIXTURES = {
  "no-chain": { hit: "No fluff, no filler, no jargon.", miss: "This change has no known regressions." },
  whole: { hit: "That's the whole point of this refactor.", miss: "This covers part of the refactor." },
  "did-not-chain": { hit: "It did not crash, did not hang, did not lose data.", miss: "It did not crash today." },
  "dont-verb-it": { hit: "Don't call it a fix. Call it a workaround.", miss: "Don't ship this without a test." },
  "sit-with": { hit: "Sit with that discomfort for a moment.", miss: "Sit down and read the log." },
  "already-know": { hit: "You already know the answer.", miss: "You already ran the migration." },
  "is-the-entire": { hit: "Caching is the entire bottleneck.", miss: "Caching is one bottleneck among several." },
  "the-entire-is": { hit: "The entire deploy pipeline is broken.", miss: "The deploy pipeline has one broken step." },
  "is-real": { hit: "The risk is real, and it's growing.", miss: "The risk is manageable with monitoring." },
  punchline: { hit: "The punchline is that nobody read the runbook.", miss: "The summary is that nobody read the runbook." },
  "worth-naming": { hit: "Worth naming: the timeout was never configured.", miss: "The timeout was never configured." },
  "not-nothing": { hit: "It's not nothing: a 12% latency drop.", miss: "A 12% latency drop is measurable." },
  "is-the-whole": { hit: "Here's the whole trick to this migration.", miss: "Here's one trick to this migration." },
  "echo-triad": {
    hit: "A shopping cart is an object in the system. A chat room is an object in the system.",
    miss: "The cart holds items. The room holds messages. Neither is empty right now.",
  },
  "performative-honesty": { hit: "Honestly, this could break in prod.", miss: "This could break in prod." },
  "thats-the-part": { hit: "That's the part a linter can't catch.", miss: "A linter can't catch every bug." },
  "the-only-i-trust": { hit: "This is the only test suite I trust before a release.", miss: "This test suite covers the auth flow." },
  "take-my-word": { hit: "You don't have to take my word for it, run the benchmark yourself.", miss: "Run the benchmark yourself." },
  "turns-out": { hit: "Turns out the cache key was never invalidated.", miss: "The cache key was never invalidated." },
  "fits-in-your-head": { hit: "The config is small enough to hold in your head.", miss: "The config file is about 40 lines." },
  "stacked-questions": {
    hit: "Does it scale? Does it handle retries? Does it log failures?",
    miss: "Does it scale to our current load, given the numbers from last week?",
  },
  "sentence-anaphora": {
    hit: "Maybe nobody needed it. Maybe it added risk. Maybe it was never used.",
    miss: "The service restarts on failure. It logs the reason. It pages on-call after three retries.",
  },
  "colon-triple": {
    hit: "The stack has three layers: the API gateway, the worker pool, and the datastore.",
    miss: "The stack has one layer that matters here.",
  },
  "heres-the-twist": { hit: "Here's the twist: the flag was already on in prod.", miss: "The flag was already on in prod." },
  "x-is-dead": { hit: "Manual deploys are dead.", miss: "Manual deploys are slow." },
  "thats-why-mattered": { hit: "That's why the retry budget mattered.", miss: "The retry budget was set to three." },
  "stranded-auxiliary": {
    hit: "The build passed; the deploy didn't.",
    miss: "The build passed after we fixed the flaky test.",
  },
  "ai-vocab": { hit: "Let's delve into the intricate tapestry of this codebase.", miss: "Let's look into how this codebase is organized." },
  "not-just": { hit: "This is not just a bug fix, but a redesign.", miss: "This is a bug fix, plus a small redesign." },
  "note-that": { hit: "It's important to note that the flag defaults to false.", miss: "The flag defaults to false." },
  testament: { hit: "This outage is a testament to how fragile the pipeline is.", miss: "This outage shows how fragile the pipeline is." },
  "crucial-role": { hit: "Caching plays a crucial role in keeping latency low.", miss: "Caching helps keep latency low." },
  landscape: { hit: "In today's fast-paced development world, tooling changes fast.", miss: "Tooling in this project changed twice this year." },
  "vague-experts": { hit: "Experts argue that microservices add more overhead than they save.", miss: "Our team decided microservices added more overhead than they saved." },
  "despite-challenges": { hit: "Despite these challenges, the migration shipped on time.", miss: "The migration shipped on time, two days late on one service." },
  "participle-tail": { hit: "Latency dropped 20%, highlighting the value of the cache layer.", miss: "Latency dropped 20% after we added the cache layer." },
  promo: { hit: "This dashboard boasts a stunning view of your metrics.", miss: "This dashboard shows your metrics." },
  "ai-leftovers": { hit: "As an AI language model, I can't access real-time data.", miss: "This service can't access real-time data without a network call." },
  "banned-fillers": { hit: "My honest take: this needs a rewrite.", miss: "This needs a rewrite." },
  "banned-vocab": { hit: "We should leverage a more robust, seamless solution.", miss: "We should use a simpler, tested solution." },
  "banned-em-dash": { hit: "The fix is small—but risky.", miss: "The fix is small, but risky." },
  "banned-praise-opener": { hit: "Great question, let's look at the logs.", miss: "Let's look at the logs." },
  "extra-verbs": { hit: "As she remarked in the changelog, the API aligns with the new schema.", miss: "The changelog says the API matches the new schema." },
  "claude-sycophancy-opener": { hit: "Certainly! Here is the fix.", miss: "Here is the fix." },
  "claude-pivot-reframe": { hit: "It's not that the test is flaky, it's that the fixture leaks state.", miss: "The test is flaky because the fixture leaks state." },
  "claude-meta-wrapper": { hit: "Let me break this down for you.", miss: "Here's how the retry logic works." },
  "claude-keep-in-mind": { hit: "Keep in mind that the token expires after an hour.", miss: "The token expires after an hour." },
  "claude-misc-vocab": { hit: "This is undeniably a load-bearing assumption.", miss: "This assumption is easy to break." },
  "claude-honest-frame": { hit: "The honest answer is that the cache is stale.", miss: "The cache is stale." },
  "claude-intensifier": { hit: "This genuinely matters enormously for latency.", miss: "This matters for latency." },
  "claude-opus5-phrasing": { hit: "These numbers carry the argument, full stop.", miss: "These numbers show the regression." },
  "claude-stock-opener": { hit: "The one thing you need to check is the token.", miss: "Check the token first." },
  "claude-in-short": { hit: "The queue drops jobs. In short, retries are broken.", miss: "Keep the summary short, two lines." },
  "claude-this-matters": { hit: "## Why cold starts matter\n\nThis matters for every deploy.", miss: "The matter was closed after the deploy." },
  "claude-more-than-a": { hit: "The linter is more than a tool, it is a habit.", miss: "The linter has more than a hundred rules." },
  "claude-opus55-transitions": { hit: "Looking ahead, the roadmap adds another layer of caching.", miss: "The roadmap adds a cache in Q3." },
  "claude-fiction-stock": { hit: "She said quietly, and for a long moment nobody moved.", miss: "She said no, and nobody moved." },
  "claude-bold-leadin": {
    hit: "- **Cause:** the cache key\n- **Impact:** stale reads\n\n- **Fix:** add the version\n- **Owner:** platform",
    miss: "- **Cause:** the cache key\n- **Impact:** stale reads\n- **Fix:** add the version\n- Owner: platform",
  },
  "gpt-real-talk": { hit: "My blunt take: ship it Friday.", miss: "Ship it Friday." },
  "gpt-patronizing": { hit: "Let's take a step back. It's not your fault.", miss: "Step back to the last green build." },
  "gpt-astra-hedge": { hit: "The log does not establish a root cause.", miss: "The log shows the root cause." },
  "gpt-signpost": { hit: "Importantly, the job retries. Bottom line: it works.", miss: "The job retries and works." },
  "gpt-astra-dimension": { hit: "Batching adds another dimension to the scheduler.", miss: "The tensor has a third dimension." },
  "claudism-reflective": { hit: "That is worth sitting with. I keep coming back to the logs.", miss: "Sit with the on-call engineer during the drill." },
  "claudism-reveal": { hit: "Here's where it gets interesting: that's the tell.", miss: "Here's where the config file lives." },
  "claudism-metaphor": { hit: "The index is doing the heavy lifting, and we've seen this movie before.", miss: "The index makes the query fast." },
  "claudism-landing": { hit: "Here's where I landed: everyone I've worked with ships on Fridays.", miss: "We ship on Fridays." },
  "claudism-phrases": { hit: "At its core, the queue is simple. When it comes to retries, this is where backoff comes in.", miss: "The queue is simple. Retries use exponential backoff." },
};

test("every pattern has a test fixture", () => {
  const missing = patterns.filter((p) => !FIXTURES[p.id]).map((p) => p.id);
  assert.deepEqual(missing, [], `patterns missing test fixtures: ${missing.join(", ")}`);
});

test("every fixture maps to a real pattern (no stale entries)", () => {
  const ids = new Set(patterns.map((p) => p.id));
  const stale = Object.keys(FIXTURES).filter((id) => !ids.has(id));
  assert.deepEqual(stale, [], `fixtures reference removed/renamed pattern ids: ${stale.join(", ")}`);
});

for (const p of patterns) {
  const fx = FIXTURES[p.id];
  if (!fx) continue; // already reported by the coverage test above

  test(`${p.id}: matches its hit example`, () => {
    const matches = p.find(fx.hit);
    assert.ok(matches.length > 0, `expected "${p.id}" to match: ${JSON.stringify(fx.hit)}`);
  });

  if (fx.miss !== undefined) {
    test(`${p.id}: does not match clean text`, () => {
      const matches = p.find(fx.miss);
      assert.equal(matches.length, 0, `expected "${p.id}" not to match: ${JSON.stringify(fx.miss)}, got ${JSON.stringify(matches)}`);
    });
  }
}

// Extra cases beyond the one hit/miss pair per pattern.
const EXTRA = [
  ["claude-bold-leadin", true, "- **A:** one\n  wrapped\n- **B:** two\n  wrapped\n- **C:** x\n  w\n- **D:** y"],
  ["claude-bold-leadin", false, "- **A:** a\n- **B:** b\nPlain paragraph.\n- **C:** c\n- **D:** d"],
  ["claude-bold-leadin", false, "- **A:** a\n- **B:** b\n- plain\n- **C:** c\n- **D:** d"],
  ["claude-more-than-a", false, "It is more than a year, they said."],
  ["claude-more-than-a", false, "The tool is more than a linter; it runs tests."],
  ["claude-more-than-a", true, "It\u2019s more than a tool, it\u2019s a habit."],
  ["claude-bold-leadin", false, "- **A:** a\n- **B:** b\n\n # Separate section\n\n- **C:** c\n- **D:** d"],
  ["claude-bold-leadin", false, "1. **A:** a\n2. **B:** b\n\n Lightly indented paragraph.\n\n3. **C:** c\n4. **D:** d"],
  ["claude-bold-leadin", false, "- **A:** a\n- **B:** b\n # Heading\n- **C:** c\n- **D:** d"],
  ["claude-bold-leadin", true, "1. **A:** a\n\n   Second paragraph of A.\n2. **B:** b\n3. **C:** c\n4. **D:** d"],
  ["claude-bold-leadin", true, "- **A:** a\n\n  ## Details\n\n  Detail text.\n- **B:** b\n- **C:** c\n- **D:** d"],
  ["claude-bold-leadin", true, "- **A:** a\n\n\tSecond paragraph of A.\n- **B:** b\n- **C:** c\n- **D:** d"],
  ["claude-bold-leadin", true, "- **Cause:** the cache key\n omits the version.\n- **Impact:** stale reads\n after a deploy.\n- **Fix:** add the version\n to the key.\n- **Owner:** platform"],
  ["claude-bold-leadin", false, " - **A:** a\n - **B:** b\n - plain\n - **C:** c\n - **D:** d"],
  ["claude-bold-leadin", false, "1. **A:** a\n2. **B:** b\n3. plain\n4. **C:** c\n5. **D:** d"],
  ["claude-bold-leadin", true, "- **A:** a\n  - nested plain\n- **B:** b\n- **C:** c\n- **D:** d"],
  ["claude-bold-leadin", true, "- **A:** a\n  - **Nested:** nested\n  - nested plain\n- **B:** b\n- **C:** c\n- **D:** d"],
];
for (const [id, shouldMatch, text] of EXTRA) {
  test(`${id}: extra case (${shouldMatch ? "hit" : "miss"}) ${JSON.stringify(text.slice(0, 30))}`, () => {
    const matches = patterns.find((p) => p.id === id).find(text);
    assert.equal(matches.length > 0, shouldMatch, JSON.stringify(text));
  });
}

// SKILL.md "Banned words and phrases" is the source of truth; the banned
// group is what --strict blocks on. These two tests fail when they drift.
const SKILL = require("node:fs").readFileSync(
  require("node:path").join(__dirname, "..", "skills", "deslop", "SKILL.md"),
  "utf8",
);
const banned = patterns.filter((p) => p.group === "Banned words (deslop)");
// Templates in the SKILL.md list, filled with a sample.
const TEMPLATES = {
  '"not just X, but Y"': "not just fast, but cheap",
  '"it\'s not that X, it\'s that Y"': "it's not that it fails, it's that it hangs",
};

function skillBannedPhrases() {
  const section = SKILL.split("## Banned words and phrases")[1].split("\n## ")[0].replace(/\s*\n\s*/g, " ");
  const openers = [...section.match(/Never open with praise[^:]*: (.*?)\. -/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const list = section.match(/Banned words and phrases: (.*)$/)[1].trim().replace(/\.$/, "");
  const words = list.split(/, (?=(?:[^"]*"[^"]*")*[^"]*$)/).map((w) => w.replace(/\s*\([^)]*\)/, "").trim());
  return { openers, words: words.map((w) => TEMPLATES[w] ?? w), emDash: /Never use em dashes/.test(section) };
}

const flagged = (text) => banned.some((p) => p.find(text).length > 0);

test("every phrase SKILL.md bans is flagged by the banned group", () => {
  const { openers, words, emDash } = skillBannedPhrases();
  assert.ok(words.length > 30 && openers.length > 5, "SKILL.md banned list did not parse");
  assert.ok(emDash);
  const missing = [...words, ...openers].filter((w) => !flagged(w));
  if (!flagged("a — b")) missing.push("em dash");
  assert.deepEqual(missing, [], "SKILL.md bans these but --strict does not block them");
});

test("every banned-group pattern blocks something SKILL.md bans", () => {
  const { openers, words } = skillBannedPhrases();
  const listed = [...words, ...openers, "a — b"];
  const extra = banned.filter((p) => !listed.some((w) => p.find(w).length > 0)).map((p) => p.id);
  assert.deepEqual(extra, [], "these banned patterns match nothing SKILL.md lists");
});
