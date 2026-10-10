# AI-writing tells

Reference for `scripts/check-ai-phrases.js`. The script is the source of
truth for the actual patterns (`scripts/ai-phrases.js`); this file lists
what each group flags, its known false positives, and its sources.

## Pattern groups

Run `node scripts/check-ai-phrases.js --file <path>` to see live counts;
this is a summary, not the full regex detail (read `scripts/ai-phrases.js`
for that).

| Group | What it catches | Examples |
|---|---|---|
| Rhetorical tics | LLM-favored sentence-level constructions | "No fluff, no filler, no jargon"; "That's the whole point"; stacked rhetorical questions; echoing sentence runs; "Here's the twist" |
| Signs of AI writing (Wikipedia) | Vocabulary and boilerplate specific to encyclopedic/explainer AI prose | "tapestry", "plays a crucial role", "it should be noted", "ever-evolving landscape", "nestled in the heart of" |
| Banned words (deslop) | Every word and phrase `SKILL.md` bans outright. `--strict` blocks only on this group, and an overlapping match from another group is reported once, here | "delve", "leverage", "seamless", "it's important to note", "not just X, but Y", em dashes, "Certainly!", "let me break this down", "load-bearing" |
| Additional AI tells (GPTZero) | Overused reporting verbs/phrases from GPTZero's frequency data | "remarked", "aligns with", "aims to explore" |
| Claude/Anthropic tics (Opus, Sonnet, Haiku, Fable) | Claude 5 family tells, advisory (the older Claude tics are in the banned group) | "the honest answer", "genuinely", "worth stating plainly", ", full stop", "In short,", "this matters", "Why X matters", "is more than a X, it", "rather than simply", "for a long moment", 4+ bold lead-in bullets in a row |
| OpenAI GPT tics (GPT-5.6 Sol, GPT-6 Astra) | Sol's banned "real-talk" and patronizing phrases, Astra's hedges, signposts and transitions | "My blunt take", "let's take a step back", "you're not broken", "does not establish", "Bottom line:", "Importantly,", "another dimension" |
| Claudisms (claudisms.ai) | Multi-word entries from the CC0 claudisms.ai banlist, advisory | "worth sitting with", "I keep coming back to", "here's where it gets interesting", "doing the heavy lifting", "here's where I landed", "At its core,", "when it comes to" |

## Known limitations

- **No model-specific data for Sonnet 5.x or Haiku 5.x** as of 2026-10-09.
  The newest Sonnet audit found is for Sonnet 4.6, and no Haiku source
  exists. Their patterns come from the Claude-family sources above.
- **No measured phrase data for Gemini 3.1 Pro, GPT-6 Sol, GPT-6 Luna or
  GPT-6.1 Sol** as of 2026-10-09. Graphite's study covers Gemini 3.1 Pro
  in its tells explorer and Drive data but names no Gemini phrases in the
  text.
- **Frequency-only tells are not encoded.** Sol's "in addition" (14x
  Astra's rate), Astra's "not necessarily", and Opus 5.5's "for example"
  are ordinary phrases that only mean something as a density. The same
  goes for Graphite's Opus 5.5 adjectives ("dependable" 23x, "steady" 11x,
  "thoughtful" 9x) and claudisms.ai's single-word entries ("shape", "real",
  "hold", "useful").
- **Bold lead-in runs flag deliberate formatting too.** Changelogs and
  style guides use "**Term:** text" lists on purpose. On a sample of 150
  local Markdown files the check fired in 19, mostly generated reviews.

- **False positives happen.** Several patterns (colon-into-a-triple, bare
  "landscape"/"journey"/"ecosystem", "not just X but Y") are common in
  ordinary technical and business writing too. Treat every flag as "worth a
  second look," not "definitely rewrite."
- **Coverage is file-based, not chat-based.** The hook
  (`../../../hooks/hooks.json`, at the plugin root) fires on `Write`/`Edit` tool
  calls against prose files (`.md`, `.mdx`, `.markdown`, `.txt`, `.rst`,
  `.adoc`). It does not see commit messages or PR/issue bodies created via
  `Bash` (`git commit -m`, `gh pr create --body`), or plain chat replies.
  For those, apply this skill by hand, or pipe the drafted text through the
  checker: `echo "$TEXT" | node scripts/check-ai-phrases.js`.
- **Advisory by default.** The hook never blocks a tool call unless
  `--strict` is passed in `hooks.json`, and even then only the
  banned-word group (the unambiguous one) can block; the broader AI-tell
  patterns always stay advisory.

## Sources

- **[Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)**
  (CC BY-SA 4.0): Wikipedia editors' catalogue of tells in LLM-drafted
  encyclopedia articles, covering vocabulary, promotional tone, formatting
  quirks, citation artifacts, and chatbot leftovers.
- **[simonw/tools: llm-cliche-highlighter.html](https://github.com/simonw/tools/blob/main/llm-cliche-highlighter.html)**
  (Apache License 2.0): a browser tool with 27 regex/structural detectors
  for LLM rhetorical tics (chain constructions, echoing sentences, stacked
  questions, anaphora, stranded-auxiliary contrast, etc.), plus its own
  11-pattern adaptation of the Wikipedia list into regexes. `ai-phrases.js`
  ports these detectors to Node near-verbatim (DOM/highlighting code
  dropped, detection logic kept), per Apache-2.0 terms.
- **[GPTZero: most common AI vocabulary](https://gptzero.me/news/most-common-ai-vocabulary/)**:
  frequency-differential data from GPTZero's own AI-detection corpus. Used
  for a handful of terms not already covered above ("remarked", "aligns
  with", "aims to explore", "notable works include").
- **`SKILL.md`** in this same directory: the skill's own banned words and
  phrases, which are stricter than "sounds like AI". These are banned
  regardless of who or what wrote them.
- **Claude-specific**, since Claude (Opus/Sonnet/Fable) is the most-used
  writing assistant here: [How to Stop Claude Writing Like an AI](https://willfrancis.com/how-to-stop-claude-writing-like-an-ai/),
  [Stop Claude From Using Its Annoying Verbal Tics](https://agentplix.com/posts/how-to-stop-claude-from-writing-it-s-not-its/),
  [How to Stop Claude from Using AI Buzzwords](https://www.navokit.com/en/blog/how-to-stop-claude-from-saying-ai-words),
  and [anthropics/claude-code#7112](https://github.com/anthropics/claude-code/issues/7112)
  (a sycophancy feature request quoting Claude's own stock openers). Most of
  what these describe duplicates the groups above; the parts that don't
  are the `claude-*` patterns in the banned group.
- **Claude 5 family (2026-10 update):**
  [Pangram: Can Pangram detect Opus 5.5?](https://www.pangram.com/blog/can-pangram-detect-opus-5-5)
  (1,000 Arena prompts, Opus 5.5 vs Opus 5 vs Sonnet 5),
  [explainx: Opus 5 "load-bearing" Claudisms](https://explainx.ai/blog/claude-opus-5-load-bearing-claudisms-writing-tells-2026),
  and [slhck.info: Claudish](https://slhck.info/software/2026/06/22/claudish.html).
  Opus 5.5 dropped most Opus 5 tics ("genuinely", "the honest answer",
  em dashes) and picked up "In short" (Pangram: 100 uses vs Opus 5's 9).
  "Perhaps the most" is Graphite's, at 29x GPT-6 Astra's rate, not a
  Pangram finding.
- **Opus 5.5, measured (2026-09 and 2026-10):**
  [Graphite: AI Tells, Opus 5.5 update](https://graphite.io/five-percent/research/ai-tells-opus-5-5-update)
  (2026-10-01; 10,000 pre-ChatGPT Common Crawl articles as the human
  baseline; tells and raw data on Google Drive, linked from the page) gives
  rates against human text: "this matters" 116x, "is more than a _ it"
  98x, "why _ matters" 92x, "looking ahead the" 40x, "rather than simply"
  32x, "adds another layer" 27x, "what comes next" 24x. Pangram adds the
  fiction phrases "said quietly", "for a long moment", "felt something".
  [Arize: Anthropic says it fixed Claude's writing](https://arize.com/blog/anthropic-says-it-fixed-claudes-writing/)
  (2026-09; Opus 5 vs 5.5 on 20 fixed briefs, about 110k words, one
  annotator, no human baseline) found about 2.5x as many bold lead-in
  bullets and 35% more three-item lists in Opus 5.5.
- **[claudisms.ai](https://claudisms.ai/)**
  ([wespomeroyny/claudisms](https://github.com/wespomeroyny/claudisms),
  CC0, list dated 2026-09-01): a 127-entry banlist with a plain
  replacement for each entry. Entries cite no source and name no model, so
  it ranks with the blog posts above, not with the measured studies. Only
  multi-word entries the other groups miss are ported.
- **OpenAI GPT (GPT-5.6 Sol, GPT-6 Astra):**
  [Graphite: AI Tells](https://graphite.io/five-percent/research/ai-tells)
  (2026-09-16) and its [Opus 5.5 update](https://graphite.io/five-percent/research/ai-tells-opus-5-5-update)
  (some rates against human text, others against another model; each
  pattern description says which), a
  [leaked GPT-5.6 Sol system prompt](https://github.com/asgeirtj/system_prompts_leaks/blob/main/OpenAI/gpt-5.6-sol.md)
  (third-party, authenticity unverified; its avoid-list implies output
  habits but measures nothing), and an
  [Astra copywriting prompt blocklist](https://godofprompt.ai/prompt-library/tool/astra/for/copywriters)
  (unattributed, not measured). The weakest-sourced patterns sit here.
