# AGENTS.md

Instructions for coding agents working in this repo. Read `README.md` for
what the skills do.

## Layout

- One plugin, `zentered-studios`, with the repo root as its source, for
  two hosts:
  - Claude Code: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`.
  - Codex: `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`.
  Keep name, version and description identical in both plugin manifests
  and `package.json`. `test/manifests.test.js` enforces it.
- Gemini CLI has no manifest here. It installs each skill folder with
  `gemini skills install ... --path skills/<name>`.
- `skills/<name>/SKILL.md`: one directory per skill, in the Agent Skills
  format. Frontmatter `name` equals the directory name. References go in
  `references/`, scripts in `scripts/`. All hosts read the same files.
- `hooks/hooks.json`: the deslop `PostToolUse` hook, read by Claude Code
  and Codex. It runs `skills/deslop/scripts/check-ai-phrases.js --hook`
  after Claude Code `Write`/`Edit` and Codex `apply_patch` (Codex maps the
  `Write|Edit` matcher to `apply_patch` and sets `CLAUDE_PLUGIN_ROOT`).
- `CLAUDE.md`, `GEMINI.md`: one line, `@AGENTS.md`. This file is the only
  source of agent instructions. Ignore the `claude plugin validate .`
  warning about the root `CLAUDE.md`.
- `test/`: `node:test` suites for the checker, the hook and the
  manifests. No dependencies.
- `evals/<case>/`: `claude plugin eval` cases. Each has a `prompt.md` and
  `graders/*.md`.

## Commands

```
npm test                                   # unit tests, also run by CI
claude plugin validate .                   # Claude Code manifest check
codex plugin marketplace add "$PWD"        # Codex install check, then:
codex plugin add zentered-studios@zentered-studios
claude plugin eval . --allow-tools "Bash(node *)" Write   # evals, with a no-plugin baseline
node skills/deslop/scripts/check-ai-phrases.js --file draft.md
```

Run `npm test` and `claude plugin validate .` before every commit. Run the
evals after changing a `SKILL.md`, a skill description, or the checker
output. Each eval run spends model tokens; results land in
`evals/results/`, which is git-ignored.

## Rules

- No runtime dependencies. Scripts use the Node standard library only, so
  the hook works right after install with no `npm install`.
- `skills/deslop/scripts/ai-phrases.js` is the source of truth for
  patterns. When you add, rename or remove one:
  - add a `hit` (and if possible a `miss`) fixture in
    `test/ai-phrases.test.js`. A test fails for any pattern without one.
  - update the group table in `skills/deslop/references/ai-phrases.md`.
  - if the word is banned outright, add it to the list in
    `skills/deslop/SKILL.md` too. A test checks that the two agree.
- Cite a source for every new pattern in the header comment of
  `ai-phrases.js` and in `references/ai-phrases.md`. Check that the page
  says what you attribute to it.
- The hook must never break a tool call. On bad input, a missing file or a
  non-prose extension it exits 0 with no output. It accepts both payload
  shapes: `tool_input.file_path` (Claude Code) and `apply_patch` patch
  text in `tool_input.command` (Codex). Test both when changing it. Keep
  it advisory unless `--strict` is passed.
- Keep each `SKILL.md` under 500 lines. Put long material in
  `references/` and link it from `SKILL.md` with a line on when to read it.
- The deslop `SKILL.md` and `references/ai-phrases.md` quote banned words
  and em dashes on purpose. The hook flags them; that is expected.
- Code under `skills/deslop/scripts/ai-phrases.js` is partly ported from
  simonw/tools (Apache 2.0). Keep `LICENSE-simonw-tools` and
  `THIRD_PARTY_NOTICES.md` current when you port more.

## Writing

- American English. Short sentences. No em dashes.
- Commits: `type(scope): description`, lowercase, imperative, no period.
  Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `chore`, `ci`, `build`, `revert`. One change per commit.
- Branch from `main` and open a draft pull request. Never push to `main`.
