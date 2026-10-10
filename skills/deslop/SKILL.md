---
name: deslop
description: >-
  Find and cut AI-writing tells in any text: banned words (delve, leverage,
  robust, seamless), filler ("it's important to note", "not just X but Y"), em
  dashes, sycophantic openers, Claude and GPT tics. Use when drafting or
  reviewing prose, when asked "does this sound like ChatGPT wrote it", to run
  the AI-phrase checker, or to act on what the deslop hook flagged. For tone
  and structure, use the voice skill or the person's voice.md.
---

# Deslop

Cut text that reads as AI-generated, whoever wrote it. This skill says
what to cut. For how the result should read, load the person's voice.md
(built with the `voice` skill) alongside it.

## Workflow

- **Drafting:** apply the banned list and the tells below while writing.
  Do not write first and clean up after.
- **Reviewing:** flag each banned word, em dash, praise opener and tell by
  name and line, then give the corrected text.
- **Hook output:** when the deslop hook reports findings on a file you
  just wrote, fix that file before finishing.
- **False positives:** literal technical uses ("unlock the mutex", "npm
  ecosystem") are fine. When unsure, say so instead of forcing a rewrite.
  See "Known limitations" in
  [`references/ai-phrases.md`](references/ai-phrases.md).

## Banned words and phrases

Banned outright, independent of context:

- **Never use em dashes.** Hyphen, or rewrite the sentence.
- Never open with praise or agreement: no "Great question", "You're
  absolutely right", "Good catch", "Excellent point", "Certainly!",
  "Absolutely!", "Of course,", "That's brilliant!", "Excellent idea!".
- Banned words and phrases: honestly, to be honest, my honest take, it's
  worth noting, it's important to note, keep in mind that, bears
  mentioning, at the end of the day, let's dive in, deep dive, let me break this
  down, let me walk you through, I hope this helps, feel free to, delve,
  leverage (use "use"), robust, seamless, streamline, unlock, supercharge,
  game-changer, best-in-class, holistic, landscape, journey, ecosystem,
  elevate, empower, cutting-edge, load-bearing (metaphorical), undeniably,
  "not just X, but Y", "it's not that X, it's that Y".

## AI-writing tells

Avoid these too. They need judgment, so the checker reports them without
blocking:

- Hedged didacticism: "it's important to note", "it should be noted".
- Inflated significance: "stands as a testament", "plays a crucial role".
- Promotional boilerplate: "nestled in the heart of".
- Negative parallelism and reframes: "not just X, but Y", "is more than a
  X, it's Y", "it's not that X, it's that Y".
- Claude tics: "let me break this down", "the honest answer",
  "genuinely", "In short,", "this matters", runs of bold lead-in bullets.
- GPT tics: "My blunt take", "let's take a step back", "Bottom line:",
  "another dimension".
- Reflective-pose filler: "worth sitting with", "I keep coming back to".
- Rhetorical shape: stacked questions, echoing sentence openers, a colon
  into a list of three.

The full catalogue, grouped by source and model with citations, is in
[`references/ai-phrases.md`](references/ai-phrases.md). Read it when a
review needs the source of a pattern or a tell not listed here.

## Checker

`scripts/check-ai-phrases.js` checks text against the full catalogue.
Node only, no dependencies. Run it by absolute path, since the working
directory is the user's project:

```
node <skill dir>/scripts/check-ai-phrases.js --file draft.md
echo "$TEXT" | node <skill dir>/scripts/check-ai-phrases.js
```

Exit 0 means clean, exit 1 means tells found. `--strict` checks the banned
list only.

Installed as a plugin on Claude Code or Codex, the same script runs as a
`PostToolUse` hook (`hooks/hooks.json` at the plugin root) after each
write to a `.md`, `.mdx`, `.markdown`, `.txt`, `.rst` or `.adoc` file. It
returns findings as context and never blocks. It does not see commit
messages, PR bodies or chat replies: apply this skill by hand there. On
hosts without the hook (Gemini CLI, a copied skill folder), run the
checker before finishing a prose file.
