---
name: voice
description: >-
  Interview someone about how they write and produce their own voice.md: a
  writing voice guide an AI assistant follows when drafting for them. Use
  whenever someone wants AI-written text to sound like them, even if they
  never say "voice.md": "write my voice.md", "create a voice guide for me",
  "help me define my writing voice", "make Claude write like me", "build a
  style guide from my old posts", "interview me about my writing style",
  "set up a voice file for my colleague", or "my AI drafts don't sound like
  me". Not for editing a single draft when no voice file is wanted.
---

# Voice

Builds a `voice.md` for one person from their own writing and a short
interview. The file tells an AI assistant how that person writes, in rules
a reviewer can check line by line.

## Why this order

Self-descriptions drift toward the writer a person wants to be. Their own
writing shows the writer they are. So collect samples first, interview
second, and test the result on a real draft before calling it done. A
voice file built from self-report alone reads like generic writing advice
and changes nothing in the drafts.

## Instructions

### 1. Scope

Ask, one question at a time, only what is not already clear:

- Whose voice, and who reads the result: an assistant drafting for them, a
  team sharing one voice, or both.
- The venues the file must cover. Get concrete names, such as commit
  messages, Slack, customer email, LinkedIn or a newsletter.
- Where the file will live. Default: `voice.md` in the current directory.
- Where it should load: every project (the agent's global instruction
  file), this project, or both. Step 8 lists the files per host and writes
  the line there. Skip this when the file is for someone who will install
  it on their own machine.

The interviewee is the person whose voice it is. Build a file for someone
else only when that person is taking part and answering.

### 2. Samples

Ask for three to six pieces of their own unassisted writing. Cover at
least one short-form venue (chat, email, commit messages) and one
long-form venue (posts, docs) if they write both. Writing from before 2023
is the cleanest evidence, since it predates common AI drafting help.
Accept URLs, pasted text or file paths.

- Read every sample in full. A summarized fetch loses the sentence-level
  traits this step exists to find.
- Ask before quoting anything that names other people or private details.
  Quote only what the person is fine having in the file.
- No samples available: run the interview alone and mark every trait
  `self-reported` in the file.

### 3. Analysis

Read the samples against the dimensions in
[`references/question-bank.md`](references/question-bank.md) "What to read
for". Write down each trait with two or more verbatim quotes. A trait with
one quote is `tentative`. Note where short-form and long-form samples
disagree; that is usually a venue difference, not noise.

Show the person the trait list with quotes before the interview, and ask
what surprises them. Their reaction is often the most useful answer of the
session.

### 4. Interview

One question at a time, so each answer can shape the next question. A
list of ten questions gets ten short answers and no follow-up. Use the
question bank for what the samples cannot show: who reads their writing,
what irritates them, words they never use, how they state uncertainty,
conventions per venue, and what AI drafts get wrong for them. Skip any
question the samples already answer. Stop when the next answer would not
change a line of the file.

When self-report contradicts the samples, show both and ask which one the
file should hold. The samples win unless the person says they want to
change how they write.

### 5. Contrast pairs

For each trait still unclear after the interview, write the same two or
three sentences in two versions that differ only in that trait, on the
person's own topic. Ask which one is theirs. People recognize their voice
faster than they describe it. Three or four pairs are enough; each pair
settles one trait.

### 6. Draft

Write `voice.md` from
[`references/voice-template.md`](references/voice-template.md):

- Each rule is checkable: a reviewer can point at a sentence that breaks
  it. "Be concise" fails that test. "One claim per sentence" passes.
- Each long-form trait carries one or two verbatim quotes from the samples.
  Quotes show the assistant the target better than any adjective.
- Write the person's preferences, not general writing advice. Drop any
  rule that would fit anyone.
- Keep the core rules to about 500 words, since the file loads into every
  conversation. Move extra evidence to a `voice-samples.md` next to it.
- Name tensions between venues instead of smoothing them over.

### 7. Test on a real draft

Ask for one real piece they need to write soon, in a venue the file
covers. Draft it using only `voice.md`. Do not send or post it anywhere.
Ask what is off, change the file (not just the draft), and redraft. Fixing
only the draft leaves the next draft with the same problem. Stop when they
would send the draft unedited, or after three rounds, and record any
remaining gap under `Open questions` in the file.

### 8. Install

Add the voice requirement to the instruction files picked in step 1, so
every later session loads it. Confirm the exact file paths and the line
before writing, since a global instruction file changes every project.
If step 1 picked no file, write nothing: show the person the line to add
for each host they use.

Write only the row for the host you are running in, plus any other host
the person named in step 1. Ask when unsure. Instruction files per host:

| Host | Global | Project | Line to add |
|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | `CLAUDE.md` or `.claude/CLAUDE.md` | `@<path to voice.md>` |
| Gemini CLI | `~/.gemini/GEMINI.md` | `GEMINI.md` | `@<path to voice.md>` |
| Codex | `~/.codex/AGENTS.md` | `AGENTS.md` | `Read <path to voice.md> before writing anything for <name>.` |

Codex does not resolve `@` imports, so its line is plain text that tells
the agent to read the file.

- In a global file, use an absolute path; a relative path breaks when the
  file loads from another project. Never write `~/`: Gemini CLI ignores
  an import that starts with `~`. In a project file, use the path
  relative to that file.
- Create the file if it does not exist.
- Put the line under a short heading such as `## Voice`, with one line
  above it: "Follow voice.md for all writing done for <name>."
- Read the file first. If it already references a voice file, replace
  that line instead of adding a second one. Change nothing else.
- If the project's `CLAUDE.md` or `GEMINI.md` only imports `AGENTS.md`,
  write only the plain-text Codex line, in `AGENTS.md`. Leave the
  importing files unchanged; every host loads the line through
  `AGENTS.md`.
- Show the diff of each file you changed. In Claude Code, tell them to run
  `/memory` in a new session to check that `voice.md` loads.

Other tools, where you cannot write the settings yourself:

- Claude.ai: paste it into a project's instructions, or into a custom
  style.
- Other assistants: paste it into the system prompt or custom
  instructions.

Revisit after a month of use: rerun steps 2 and 7 with newer writing.

## Example

User: "Help me write my voice.md, my AI drafts sound nothing like me." The
skill asks which venues matter (Slack and a monthly newsletter), collects
four Slack threads and two newsletters from 2021, lists six traits with
quotes (lowercase Slack openers, no greetings, a number in every
newsletter claim), asks what AI drafts get wrong ("too polite, too many
bullets"), runs one contrast pair on exclamation marks, drafts `voice.md`,
then writes next month's newsletter intro from it and fixes the file twice
before the person accepts the draft. Last, it adds `@/Users/sam/voice.md` under a
`## Voice` heading in `~/.claude/CLAUDE.md` and shows the diff.
