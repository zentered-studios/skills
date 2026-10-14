#!/usr/bin/env node
// AI-phrase checker for the deslop skill. No dependencies, stdlib only.
//
// Three ways to run it:
//   node check-ai-phrases.js < draft.md          scan stdin, human report, exit 1 if flagged
//   node check-ai-phrases.js --file draft.md      scan a file, human report, exit 1 if flagged
//   node check-ai-phrases.js draft.md             same as --file
//   node check-ai-phrases.js --hook                PostToolUse hook mode (Claude Code, Codex; see below)
//
// --hook mode reads the hook's stdin JSON (session_id, tool_name, tool_input,
// ...), re-reads each touched file from disk (so it sees the post-edit
// content), and only acts on prose-ish files
// (.md/.mdx/.markdown/.txt/.rst/.adoc). It is advisory by default: it never
// blocks the tool call, it prints a hookSpecificOutput.additionalContext
// listing what it found so the agent can decide whether to rewrite. Pass
// --strict alongside --hook to make it a hard block (exit 2) when it finds
// one of the skill's banned words/phrases (the small, unambiguous list),
// while leaving the broader AI-tell patterns advisory even in that mode,
// since those need human judgment, not an automatic block.
//
// Pattern source and licensing: see ai-phrases.js.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { patterns } = require("./ai-phrases.js");

const BANNED_GROUP = "Banned words (deslop)";
const PROSE_EXTENSIONS = new Set([".md", ".mdx", ".markdown", ".txt", ".rst", ".adoc"]);
const MAX_REPORTED_GROUPS = 4;

// Scratch and index files a hook should never flag: job briefs and the memory
// index (which quotes banned words as examples and uses em dashes as its own
// required list-entry format). The OS temp dir is not exempt: issue drafts
// written to /tmp are published as GitHub issue bodies.
function isExemptPath(filePath) {
  const resolved = path.resolve(filePath);

  const home = os.homedir();
  const jobsDir = path.join(home, ".claude", "jobs") + path.sep;
  if (resolved.startsWith(jobsDir)) return true;

  const projectsDir = path.join(home, ".claude", "projects") + path.sep;
  if (resolved.startsWith(projectsDir)) {
    const rest = resolved.slice(projectsDir.length).split(path.sep);
    // <project>/memory/MEMORY.md only; individual memory entries are prose and get scanned.
    if (rest.length === 3 && rest[1] === "memory" && rest[2] === "MEMORY.md") return true;
  }
  return false;
}

// Files a hook payload touched. Claude Code's Write and Edit pass
// tool_input.file_path. Codex's apply_patch passes the patch text in
// tool_input.command; its "*** Add File:", "*** Update File:" and
// "*** Move to:" headers name the files, relative to the session cwd.
function hookFilePaths(payload) {
  const input = payload?.tool_input;
  if (typeof input?.file_path === "string") return [input.file_path];
  if (payload?.tool_name !== "apply_patch") return [];
  const command = input?.command;
  const patch =
    Array.isArray(command) && command.every((c) => typeof c === "string") ? command.join("\n") : command;
  if (typeof patch !== "string") return [];
  const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
  const paths = [];
  for (const m of patch.matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)) {
    paths.push(path.resolve(cwd, m[1].trim()));
  }
  return [...new Set(paths)];
}

// Matches in one hook-touched file, or [] for a non-prose, exempt, missing
// or unreadable file.
function checkFile(filePath) {
  if (!PROSE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return [];
  if (isExemptPath(filePath)) return [];
  try {
    return scan(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

const USAGE = "Usage: check-ai-phrases.js [--strict] [--file] <path>, or pipe text on stdin. Hook mode: --hook [--strict].";

// A bare path is the file to scan. Before this, it was silently ignored and
// the script read stdin instead: it waited forever on an open pipe, and
// reported "OK" on an empty one without scanning the file.
function parseArgs(argv) {
  const opts = { file: null, hook: false, strict: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") opts.file = argv[++i] ?? null;
    else if (arg === "--hook") opts.hook = true;
    else if (arg === "--strict") opts.strict = true;
    else if (arg.startsWith("-")) opts.error = `Unknown option: ${arg}`;
    else if (opts.file === null) opts.file = arg;
    else opts.error = `Only one file per run: ${arg}`;
  }
  return opts;
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function snippet(text, start, end) {
  const s = Math.max(0, start - 25);
  const e = Math.min(text.length, end + 25);
  return text.slice(s, e).replace(/\s+/g, " ").trim();
}

// Run every pattern against text, return matches sorted by position.
function scan(text, patternSet = patterns) {
  const matches = [];
  for (const p of patternSet) {
    let hits;
    try {
      hits = p.find(text);
    } catch (e) {
      continue; // a malformed pattern should not crash the whole scan
    }
    for (const h of hits) {
      matches.push({
        id: p.id,
        group: p.group || "Rhetorical tics",
        name: p.name,
        start: h.start,
        end: h.end,
        line: lineOf(text, h.start),
        snippet: snippet(text, h.start, h.end),
        detail: h.badgeTitle || null,
      });
    }
  }
  // A banned phrase also matches some wider groups ("it's worth noting" is a
  // Wikipedia tell too). Report it once, as banned.
  const banned = matches.filter((m) => m.group === BANNED_GROUP);
  const kept = matches.filter(
    (m) => m.group === BANNED_GROUP || !banned.some((b) => m.start < b.end && b.start < m.end),
  );
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

function formatHumanReport(matches, source) {
  if (matches.length === 0) {
    return `OK: no AI-writing tells found${source ? ` in ${source}` : ""}.`;
  }
  const byPattern = new Map();
  for (const m of matches) {
    const key = `${m.group} — ${m.name}`;
    if (!byPattern.has(key)) byPattern.set(key, []);
    byPattern.get(key).push(m);
  }
  const lines = [];
  lines.push(`Found ${matches.length} AI-writing tell(s)${source ? ` in ${source}` : ""}:`);
  // Banned-word groups first, so the cap never hides the hard rules.
  const groups = [...byPattern.entries()].sort(
    ([, a], [, b]) => (b[0].group === BANNED_GROUP) - (a[0].group === BANNED_GROUP),
  );
  for (const [key, ms] of groups.slice(0, MAX_REPORTED_GROUPS)) {
    lines.push(`\n${key} (${ms.length}):`);
    for (const m of ms.slice(0, 5)) {
      const extra = m.detail ? ` [${m.detail}]` : "";
      lines.push(`  line ${m.line}: "${m.snippet}"${extra}`);
    }
    if (ms.length > 5) lines.push(`  ... and ${ms.length - 5} more`);
  }
  if (groups.length > MAX_REPORTED_GROUPS) {
    const rest = groups.slice(MAX_REPORTED_GROUPS).map(([key, ms]) => `${key} (${ms.length})`);
    lines.push(`\n... and ${rest.length} more pattern group(s): ${rest.join("; ")}.`);
  }
  return lines.join("\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) {
    process.stderr.write(`${opts.error}\n${USAGE}\n`);
    process.exit(2);
  }

  if (opts.hook) {
    const stdinRaw = readStdin();
    let payload;
    try {
      payload = JSON.parse(stdinRaw);
    } catch {
      process.exit(0); // not valid hook input, do nothing rather than fail the tool call
    }
    const results = hookFilePaths(payload)
      .map((filePath) => ({ filePath, matches: checkFile(filePath) }))
      .filter((r) => r.matches.length > 0);
    if (results.length === 0) process.exit(0);
    const report = (key) =>
      results
        .filter((r) => r[key].length > 0)
        .map((r) => formatHumanReport(r[key], r.filePath))
        .join("\n\n");

    if (opts.strict) {
      for (const r of results) r.banned = r.matches.filter((m) => m.group === BANNED_GROUP);
      const blocked = report("banned");
      if (blocked) {
        process.stderr.write(blocked + "\n");
        process.exit(2); // block: these are the skill's hard rules, not judgment calls
      }
    }

    const total = results.reduce((n, r) => n + r.matches.length, 0);
    const names = results.map((r) => path.basename(r.filePath)).join(", ");
    console.log(
      JSON.stringify({
        systemMessage: `deslop: ${total} possible AI-writing tell(s) in ${names}`,
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            report("matches") +
            `\n\nConsider rewriting per the deslop skill (and your voice.md for tone and structure) before finishing.`,
        },
      })
    );
    process.exit(0);
  }

  // Non-hook mode: human/CI report.
  if (!opts.file && process.stdin.isTTY) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  const text = opts.file ? fs.readFileSync(opts.file, "utf8") : readStdin();
  if (!opts.file && text.trim() === "") {
    // An empty pipe is a caller mistake, not clean text. Never report it as OK.
    process.stderr.write(`No input on stdin.\n${USAGE}\n`);
    process.exit(2);
  }
  const patternSet = opts.strict ? patterns.filter((p) => p.group === BANNED_GROUP) : patterns;
  const matches = scan(text, patternSet);
  console.log(formatHumanReport(matches, opts.file));
  process.exit(matches.length > 0 ? 1 : 0);
}

main();
