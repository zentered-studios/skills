#!/usr/bin/env node
// Regression tests for the check-ai-phrases.js CLI and hook contract. No
// dependencies, node:test/node:assert/node:child_process only.
// Run: node --test test/
//
// Spawns the script as a real subprocess (it calls process.exit() in every
// path, so it can't be require()'d in-process) and asserts on stdout,
// stderr, and exit code, the actual contract a hook or a human running it
// depends on.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.join(__dirname, "..", "skills", "deslop", "scripts", "check-ai-phrases.js");

function run(args, input) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    input: input ?? "",
    encoding: "utf8",
  });
}

// Fixtures live under the repo, not os.tmpdir(), so they never depend on how
// the hook treats the OS temp dir.
const FIXTURES_ROOT = fs.mkdtempSync(path.join(__dirname, ".fixtures-"));
test.after(() => {
  fs.rmSync(FIXTURES_ROOT, { recursive: true, force: true });
});

function tempFile(name, content) {
  const p = path.join(fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-")), name);
  fs.writeFileSync(p, content);
  return p;
}

test("stdin mode: exits 1 and reports matches on flagged text", () => {
  const res = run([], "It's important to note that this is robust and seamless.\n");
  assert.equal(res.status, 1);
  assert.match(res.stdout, /Found \d+ AI-writing tell/);
  assert.match(res.stdout, /It.s important to note/);
});

test("stdin mode: exits 0 on clean text", () => {
  const res = run([], "fix: handle missing session cookie in auth middleware\n");
  assert.equal(res.status, 0);
  assert.match(res.stdout, /^OK: no AI-writing tells found/);
});

test("--file mode: reads from disk and reports the file name", () => {
  const f = tempFile("draft.md", "We should leverage a robust solution.\n");
  const res = run(["--file", f]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, new RegExp(`in ${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("bare path: scans the file, same as --file", () => {
  const f = tempFile("draft.md", "We should leverage a robust solution.\n");
  const res = run([f]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /Found \d+ AI-writing tell/);
});

test("unknown option: exits 2 with usage instead of reading stdin", () => {
  const res = run(["--fiel", "draft.md"], "We should leverage a robust solution.\n");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Unknown option: --fiel/);
  assert.match(res.stderr, /Usage:/);
});

test("bare path then --file: exits 2, never drops the first file", () => {
  const f = tempFile("draft.md", "We should leverage a robust solution.\n");
  const res = run([f, "--file", f]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Only one file per run/);
});

test("--file then bare path: exits 2", () => {
  const f = tempFile("draft.md", "We should leverage a robust solution.\n");
  const res = run(["--file", f, f]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Only one file per run/);
});

test("lone dash: reads stdin", () => {
  const res = run(["-"], "We should leverage a robust solution.\n");
  assert.equal(res.status, 1);
  assert.match(res.stdout, /Found \d+ AI-writing tell/);
});

test("stdin mode: empty input exits 2, never reports OK", () => {
  const res = run([], "");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /No input on stdin/);
  assert.equal(res.stdout, "");
});

test("--strict (non-hook) mode: only checks the banned-word group", () => {
  const res = run(["--strict"], "It should be noted that this is robust.\n");
  // "it should be noted" is a Wikipedia-group tell, not a banned word;
  // "robust" is. Strict mode must flag only the latter.
  assert.equal(res.status, 1);
  assert.doesNotMatch(res.stdout, /should be noted/);
  assert.match(res.stdout, /Banned word/);
});

test("--hook mode: advisory, exits 0, emits hookSpecificOutput JSON on a match", () => {
  const f = tempFile("draft.md", "It's important to note that this plays a crucial role.\n");
  const payload = JSON.stringify({
    session_id: "test",
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: { file_path: f },
  });
  const res = run(["--hook"], payload);
  assert.equal(res.status, 0, "advisory mode must never fail the tool call");
  const out = JSON.parse(res.stdout);
  // Claude Code rejects hookSpecificOutput without hookEventName, and only
  // reads systemMessage at the top level.
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.ok(out.systemMessage.includes("deslop"));
  assert.equal(out.hookSpecificOutput.systemMessage, undefined);
  assert.match(out.hookSpecificOutput.additionalContext, /important to note/);
});

test("--hook mode: silent, exit 0, on a clean file", () => {
  const f = tempFile("draft.md", "fix: handle missing session cookie\n");
  const payload = JSON.stringify({ tool_input: { file_path: f } });
  const res = run(["--hook"], payload);
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
});

test("--hook mode: skips non-prose file extensions entirely", () => {
  const f = tempFile("config.js", "const robust = true; // leverage this\n");
  const payload = JSON.stringify({ tool_input: { file_path: f } });
  const res = run(["--hook"], payload);
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
});

test("--hook mode: ignores malformed stdin instead of crashing the tool call", () => {
  const res = run(["--hook"], "not valid json");
  assert.equal(res.status, 0);
});

test("--hook mode: does nothing when the file no longer exists", () => {
  const payload = JSON.stringify({ tool_input: { file_path: "/nonexistent/path/does-not-exist.md" } });
  const res = run(["--hook"], payload);
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
});

// Codex reports file edits as apply_patch with the patch text in
// tool_input.command, paths relative to cwd.
function codexPayload(cwd, patch) {
  return JSON.stringify({ hook_event_name: "PostToolUse", cwd, tool_name: "apply_patch", tool_input: { command: patch } });
}

test("--hook mode: Codex apply_patch scans each added or updated prose file", () => {
  const a = tempFile("a.md", "We should leverage this.\n");
  const dir = path.dirname(a);
  fs.writeFileSync(path.join(dir, "b.txt"), "It's important to note the flag.\n");
  fs.writeFileSync(path.join(dir, "c.js"), "// leverage\n");
  const patch = [
    "*** Begin Patch",
    "*** Add File: a.md",
    "+We should leverage this.",
    "*** Update File: b.txt",
    "@@",
    "+It's important to note the flag.",
    "*** Update File: c.js",
    "*** End Patch",
  ].join("\n");
  const res = run(["--hook"], codexPayload(dir, patch));
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.match(out.systemMessage, /a\.md, b\.txt/);
  assert.match(out.hookSpecificOutput.additionalContext, /leverage/);
  assert.match(out.hookSpecificOutput.additionalContext, /important to note/);
  assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /c\.js/);
});

test("--hook mode: Codex apply_patch accepts the command as an argv array", () => {
  const f = tempFile("draft.md", "We should leverage this.\n");
  const patch = ["apply_patch", "*** Begin Patch\n*** Update File: draft.md\n*** End Patch"];
  const res = run(["--hook"], codexPayload(path.dirname(f), patch));
  assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /leverage/);
});

test("--hook mode: Codex apply_patch scans the target of a move", () => {
  const f = tempFile("new.md", "We should leverage this.\n");
  const patch = "*** Begin Patch\n*** Update File: old.md\n*** Move to: new.md\n*** End Patch";
  const res = run(["--hook"], codexPayload(path.dirname(f), patch));
  const out = JSON.parse(res.stdout);
  assert.match(out.systemMessage, /in new\.md$/);
});

test("--hook mode: Codex apply_patch with absolute paths needs no cwd", () => {
  const f = tempFile("draft.md", "We should leverage this.\n");
  const payload = JSON.stringify({ tool_name: "apply_patch", tool_input: { command: `*** Begin Patch\n*** Add File: ${f}\n*** End Patch` } });
  const res = run(["--hook"], payload);
  assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /leverage/);
});

test("--hook mode: a malformed apply_patch command is ignored, not thrown", () => {
  const payload = JSON.stringify({ tool_name: "apply_patch", tool_input: { command: [{ toString: 1 }] } });
  const res = run(["--hook"], payload);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "");
});

test("--hook mode: Codex apply_patch with only a deleted file is silent", () => {
  const f = tempFile("gone.md", "We should leverage this.\n");
  const res = run(["--hook"], codexPayload(path.dirname(f), "*** Begin Patch\n*** Delete File: gone.md\n*** End Patch"));
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
});

test("--hook --strict: Codex apply_patch blocks on a banned word", () => {
  const f = tempFile("draft.md", "A robust, seamless approach.\n");
  const res = run(["--hook", "--strict"], codexPayload(path.dirname(f), "*** Begin Patch\n*** Add File: draft.md\n*** End Patch"));
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Banned word/);
});

test("--hook --strict: blocks (exit 2) only on the banned-word group", () => {
  const f = tempFile("draft.md", "We should leverage a robust, seamless approach.\n");
  const payload = JSON.stringify({ tool_input: { file_path: f } });
  const res = run(["--hook", "--strict"], payload);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /Banned word/);
});

test("--hook --strict: stays advisory (exit 0) when only non-banned AI tells are found", () => {
  const f = tempFile("draft.md", "It should be noted that this plays a crucial role.\n");
  const payload = JSON.stringify({ tool_input: { file_path: f } });
  const res = run(["--hook", "--strict"], payload);
  assert.equal(res.status, 0, "no banned-group hit means no block, even in --strict mode");
});

test("stdin mode: a banned phrase that a wider group also matches is reported once, as banned", () => {
  const res = run([], "It's important to note the flag.\n");
  assert.equal(res.status, 1);
  assert.match(res.stdout, /Banned filler phrase|banned words/);
  assert.doesNotMatch(res.stdout, /Wikipedia/);
});

// Exempt paths: scratch briefs and index files a hook should never flag.

test("--hook mode: still scans files under the OS temp dir (issue drafts live there)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slop-exempt-"));
  const f = path.join(dir, "issue-draft.md");
  fs.writeFileSync(f, "We should leverage a robust, seamless approach.\n");
  try {
    const payload = JSON.stringify({ tool_input: { file_path: f } });
    const res = run(["--hook"], payload);
    assert.equal(res.status, 0);
    assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /leverage/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--hook mode: skips files under ~/.claude/jobs/ (a scratch brief)", () => {
  const jobDir = path.join(os.homedir(), ".claude", "jobs", `slop-test-${Date.now()}`);
  const dir = path.join(jobDir, "tmp");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, "brief.md");
  fs.writeFileSync(f, "no filler words (robust, seamless, leverage, delve, \"it's worth noting\")\n");
  try {
    const payload = JSON.stringify({ tool_input: { file_path: f } });
    const res = run(["--hook"], payload);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "");
  } finally {
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
});

test("--hook mode: skips files under ~/.claude/projects/*/memory/ (the memory index)", () => {
  const projectDir = path.join(os.homedir(), ".claude", "projects", `slop-test-${Date.now()}`);
  const dir = path.join(projectDir, "memory");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, "MEMORY.md");
  fs.writeFileSync(f, "- [entry](entry.md) — required em-dash index format\n");
  try {
    const payload = JSON.stringify({ tool_input: { file_path: f } });
    const res = run(["--hook"], payload);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "");
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("stdin mode: caps the report to the top 4 pattern groups", () => {
  const text =
    "Certainly! It's important to note that this plays a crucial role in the workflow — feel free to use a robust approach.\n";
  const res = run([], text);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /\.\.\. and \d+ more pattern group\(s\): /);
  const headers = res.stdout.match(/^\S.*\(\d+\):$/gm) || [];
  assert.ok(headers.length <= 4, `expected at most 4 group headers, got ${headers.length}`);
});

test("--hook mode: additionalContext drops the repeated 'Tells found' summary line", () => {
  const f = tempFile("draft.md", "It's important to note that this plays a crucial role.\n");
  const payload = JSON.stringify({ tool_input: { file_path: f } });
  const res = run(["--hook"], payload);
  const out = JSON.parse(res.stdout);
  assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /Tells found:/);
  assert.match(out.hookSpecificOutput.additionalContext, /Consider rewriting per/);
});

test("stdin mode: banned words are listed first and omitted groups are named", () => {
  const text =
    "Certainly! It's important to note that this plays a crucial role in the workflow — so we leverage it.\n";
  const res = run([], text);
  assert.equal(res.status, 1);
  const headers = res.stdout.match(/^\S.*\(\d+\):$/gm) || [];
  assert.match(headers[0], /Banned words/, "the banned-word group comes first");
  assert.match(res.stdout, /more pattern group\(s\): .+\(\d+\)/, "omitted groups are named");
});

test("--hook mode: still scans individual memory entries next to MEMORY.md", () => {
  const projectDir = path.join(os.homedir(), ".claude", "projects", `slop-test-entry-${Date.now()}`);
  const dir = path.join(projectDir, "memory");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, "some-entry.md");
  fs.writeFileSync(f, "We should leverage a robust approach.\n");
  try {
    const payload = JSON.stringify({ tool_input: { file_path: f } });
    const res = run(["--hook"], payload);
    assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /leverage/);
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
