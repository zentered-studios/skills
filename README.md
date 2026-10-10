# Zentered Studios skills

Agent skills for writing, in the [Agent Skills](https://agentskills.io)
format. They work in Claude Code, Codex and Gemini CLI, and in any agent
that reads `skills/<name>/SKILL.md`.

## Skills

### voice

Builds a `voice.md`: a writing voice guide an AI assistant follows when it
drafts for a person. It reads three to six pieces of their own writing,
lists their traits with quotes, interviews them one question at a time,
and tests the file on a real draft. Last, after confirmation, it adds the
file to the agent's global or project instructions (`CLAUDE.md`,
`GEMINI.md` or `AGENTS.md`).

Start it with "help me write my voice.md".

### deslop

Finds and cuts AI-writing tells: banned words (delve, leverage, robust,
seamless), filler ("it's important to note"), em dashes, sycophantic
openers, and Claude and GPT tics. A dependency-free Node script checks a
file or stdin. On Claude Code and Codex, an advisory hook runs it after
every write to a prose file.

Technical writing gets some false positives: "unlock the mutex" and "npm
ecosystem" are flagged. Treat each flag as a second look, not a required
rewrite.

```
node skills/deslop/scripts/check-ai-phrases.js --file draft.md
```

## Install

Claude Code:

```
/plugin marketplace add zentered-studios/skills
/plugin install zentered-studios@zentered-studios
```

Codex (tested with CLI 0.162):

```
codex plugin marketplace add zentered-studios/skills
codex plugin add zentered-studios@zentered-studios
```

Start a new session after install. Codex asks you to trust the deslop
hook before it runs.

Gemini CLI:

```
gemini skills install https://github.com/zentered-studios/skills.git --path skills/voice
gemini skills install https://github.com/zentered-studios/skills.git --path skills/deslop
```

Gemini gets the skills without the hook.

Other agents: copy `skills/voice/` or `skills/deslop/` into the agent's
skills directory (often `.agents/skills/`).

## Development

Node 20 or newer. No dependencies.

```
npm test                    # checker, hook and manifest tests
claude plugin validate .    # Claude Code plugin and marketplace manifests
claude plugin eval . --allow-tools "Bash(node *)" Write
```

`claude plugin eval` runs each case in `evals/` with and without the
plugin and reports the score difference. CI runs `npm test` on Node 20,
22 and 24. Agent instructions for this repo are in `AGENTS.md`.

## License

MIT, except the ported patterns in
`skills/deslop/scripts/ai-phrases.js` (Apache 2.0). See
`THIRD_PARTY_NOTICES.md`.
