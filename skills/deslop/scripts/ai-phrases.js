// AI-writing-tell pattern set. No dependencies, stdlib only.
//
// Group A (ids below prefixed implicitly, no `group` field) and the
// `Signs of AI writing (Wikipedia)` group are ported near-verbatim from
// simonw/tools' llm-cliche-highlighter.html:
//   https://github.com/simonw/tools/blob/main/llm-cliche-highlighter.html
// That project is Apache License 2.0. Ported to Node (dropped the DOM
// highlighting code, kept the `find(text)` detectors), reformatted, no
// patterns removed. Its own Wikipedia-adapted group cites:
//   https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
// Local change: ai-leftovers matches only the referrer tags that page's
// "utm_source=" section lists (utm_source=openai, chatgpt.com, copilot.com;
// referrer=grok.com), not every utm_source=, which flagged a site's own
// campaign links.
//
// Group `Banned words` is the list
// (skills/deslop/SKILL.md), for words that skill bans
// outright regardless of AI-writing context.
//
// Group `Additional AI tells` adds terms from GPTZero's own frequency
// analysis not already covered above:
//   https://gptzero.me/news/most-common-ai-vocabulary/
//
// The claude-* patterns target Claude specifically (the most-used
// writing assistant here). SKILL.md bans them outright, so they sit in the banned group.
// Sourced from:
//   https://willfrancis.com/how-to-stop-claude-writing-like-an-ai/
//   https://agentplix.com/posts/how-to-stop-claude-from-writing-it-s-not-its/
//   https://www.navokit.com/en/blog/how-to-stop-claude-from-saying-ai-words
//   https://github.com/anthropics/claude-code/issues/7112 (sycophancy)
// Claude 5 family additions (2026-10), each phrase checked in the raw page:
//   https://www.pangram.com/blog/can-pangram-detect-opus-5-5
//   https://explainx.ai/blog/claude-opus-5-load-bearing-claudisms-writing-tells-2026
//   https://slhck.info/software/2026/06/22/claudish.html
// Only the items not already covered by the groups above are added here;
// see references/ai-phrases.md for the overlap notes.
// Opus 5.5 measured tells (2026-10), multipliers against human text:
//   https://graphite.io/five-percent/research/ai-tells-opus-5-5-update
//   https://arize.com/blog/anthropic-says-it-fixed-claudes-writing/
//     (Opus 5 vs 5.5: bold lead-in bullets, about 2.5x as many)
//
// Group `Claudisms (claudisms.ai)` hand-picks multi-word entries from the
// CC0 banlist at https://github.com/wespomeroyny/claudisms (claudisms.json,
// updated 2026-09-01). Single-word entries ("shape", "real", "hold") are
// left out: they match ordinary prose far more often than they catch a tell.
//
// Group `OpenAI GPT tics` targets GPT-5.6 Sol and GPT-6 Astra, sourced from:
//   https://graphite.io/five-percent/research/ai-tells
//   https://graphite.io/five-percent/research/ai-tells-opus-5-5-update
//   https://github.com/asgeirtj/system_prompts_leaks/blob/main/OpenAI/gpt-5.6-sol.md
//     (third-party leak, authenticity unverified; an avoid-list, not data)
//   https://godofprompt.ai/prompt-library/tool/astra/for/copywriters
//     (unattributed prompt-library blocklist, not measured)

const CHAIN_BODY = String.raw`[^,.;:!?\n–—…]*`;
const CHAIN_SEP = String.raw`(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+|\s*[;&–—]\s*(?:and\s+|or\s+)?|\s+-{1,2}\s+)`;
const CHAIN_SPLIT = new RegExp(CHAIN_SEP, "i");

function makeChainFinder(head, headTest, itemLabel) {
  const item = head + CHAIN_BODY;
  const chain = new RegExp(String.raw`\b${item}(?:${CHAIN_SEP}${item})+`, "gi");
  return function (text) {
    const found = [];
    for (const m of text.matchAll(chain)) {
      let end = m.index + m[0].length;
      while (end > m.index && /\s/.test(text[end - 1])) end -= 1;
      const count = m[0].split(CHAIN_SPLIT).filter((p) => headTest.test(p.trim())).length;
      found.push({
        start: m.index,
        end,
        badgeTitle: `${count} ${itemLabel}${count === 1 ? "" : "s"}`,
      });
    }
    return found;
  };
}

function makeRegexFinder(re) {
  return function (text) {
    const found = [];
    for (const m of text.matchAll(re)) {
      found.push({ start: m.index, end: m.index + m[0].length });
    }
    return found;
  };
}

// Consecutive sentences repeating the same multi-word skeleton, e.g.
// "A shopping cart is an object in the system. A chat room is an object
// in the system."
function makeEchoFinder({ minGram = 3, minRun = 2 } = {}) {
  const SENT = /[^.!?\n]+[.!?]?/g;
  const grams = (s, n) => {
    const w = s.toLowerCase().match(/[a-z0-9'’-]+/g) || [];
    const out = new Set();
    for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
    return out;
  };
  return function (text) {
    const sents = [];
    for (const m of text.matchAll(SENT)) {
      if ((m[0].match(/\S+/g) || []).length >= 4) {
        sents.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      }
    }
    const found = [];
    let i = 0;
    while (i < sents.length) {
      let j = i;
      let shared = null;
      while (j + 1 < sents.length) {
        if (sents[j + 1].start - sents[j].end > 3) break;
        const a = grams(sents[j].text, minGram);
        const b = grams(sents[j + 1].text, minGram);
        const common = [...a].filter((g) => b.has(g));
        if (!common.length) break;
        shared = common.sort((x, y) => y.length - x.length)[0];
        j += 1;
      }
      const run = j - i + 1;
      if (run >= minRun && shared) {
        let end = sents[j].end;
        while (end > sents[i].start && /\s/.test(text[end - 1])) end -= 1;
        found.push({ start: sents[i].start, end, badgeTitle: `${run} sentences echoing "${shared}"` });
        i = j + 1;
      } else {
        i += 1;
      }
    }
    return found;
  };
}

// Two or more consecutive question sentences.
function makeQuestionChainFinder({ minRun = 2 } = {}) {
  const chain = /[^.!?\n]+\?(?:\s+[^.!?\n]+\?)+/g;
  return function (text) {
    const found = [];
    for (const m of text.matchAll(chain)) {
      const count = (m[0].match(/\?/g) || []).length;
      if (count < minRun) continue;
      let start = m.index;
      while (start < m.index + m[0].length && /\s/.test(text[start])) start += 1;
      found.push({ start, end: m.index + m[0].length, badgeTitle: `${count} questions in a row` });
    }
    return found;
  };
}

// Consecutive sentences opening on the same word ("Maybe X. Maybe Y.").
const ANAPHORA_SKIP =
  /^(?:i|it|the|a|an|this|that|we|you|they|he|she|there|but|and|so|in|as|if|my|his|her|their|its|these|those|for|at|on|of|to|is|was)$/i;
function makeAnaphoraFinder({ minRun = 3 } = {}) {
  const SENT = /[^.!?\n]+[.!?]/g;
  return function (text) {
    const sents = [];
    for (const m of text.matchAll(SENT)) {
      const w = m[0].match(/[A-Za-z'’-]+/);
      if (w) {
        sents.push({ start: m.index + m[0].indexOf(w[0]), end: m.index + m[0].length, head: w[0].toLowerCase() });
      }
    }
    const found = [];
    let i = 0;
    while (i < sents.length) {
      let j = i;
      while (j + 1 < sents.length && sents[j + 1].head === sents[i].head && sents[j + 1].start - sents[j].end < 4) {
        j += 1;
      }
      const run = j - i + 1;
      if (run >= minRun && !ANAPHORA_SKIP.test(sents[i].head)) {
        found.push({ start: sents[i].start, end: sents[j].end, badgeTitle: `${run} sentences opening "${sents[i].head}"` });
        i = j + 1;
      } else {
        i += 1;
      }
    }
    return found;
  };
}

// Width of a string in columns, with tab stops every 4.
function columnsOf(str) {
  let col = 0;
  for (const ch of str) col += ch === "\t" ? 4 - (col % 4) : 1;
  return col;
}

// Runs of list items that open on a bold lead-in ("- **Term:** text").
// Each list nesting level keeps its own run, so a nested list neither breaks
// nor extends its parent's run. Other lines stay in the run as wrapped item
// text; see the indent rules below.
function makeBoldLeadInFinder({ minRun = 4 } = {}) {
  const MARKER = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/;
  const LINE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\*\*[^*\n]+\*\*/;
  const HEADING = /^[ \t]*#+[ \t]/;
  return function (text) {
    const found = [];
    // Open list levels, outermost first. contentCol is the column where the
    // text of the level's last item starts.
    const levels = [];
    let offset = 0;
    let afterBlank = false;
    const flush = (level) => {
      if (level.run.length >= minRun) {
        const last = level.run[level.run.length - 1];
        found.push({ start: level.run[0].start, end: last.end, badgeTitle: `${level.run.length} bold lead-in bullets in a row` });
      }
      level.run = [];
    };
    const top = () => levels[levels.length - 1];
    for (const line of text.split("\n")) {
      const indent = columnsOf(line.match(/^[ \t]*/)[0]);
      const marker = line.match(MARKER);
      if (marker) {
        // A list item is never wrapped text: shallower than a level's text
        // column closes that level, unless it is also deep enough to be a
        // sibling there. Deeper than the last item's text column nests.
        while (levels.length > 1 && indent < levels[levels.length - 2].contentCol) flush(levels.pop());
        if (levels.length === 0 || indent >= top().contentCol) levels.push({ contentCol: 0, run: [] });
        const level = top();
        level.contentCol = columnsOf(marker[0]);
        if (LINE.test(line)) level.run.push({ start: offset, end: offset + line.length });
        else flush(level);
        afterBlank = false;
      } else if (line.trim() === "") {
        afterBlank = true;
      } else {
        // After a blank line only text under the item's text column belongs to it.
        // Directly after an item, any indented line is a wrapped body, but a
        // heading shallower than the text column starts a new section.
        const ends = (level) => afterBlank
          ? indent < level.contentCol
          : indent === 0 || (HEADING.test(line) && indent < level.contentCol);
        while (levels.length > 0 && ends(top())) flush(levels.pop());
        afterBlank = false;
      }
      offset += line.length + 1;
    }
    while (levels.length > 0) flush(levels.pop());
    return found.sort((a, b) => a.start - b.start);
  };
}

const WIKI_GROUP = "Signs of AI writing (Wikipedia)";
const BANNED_GROUP = "Banned words (deslop)";
const EXTRA_GROUP = "Additional AI tells (GPTZero)";
const CLAUDE_GROUP = "Claude/Anthropic tics (Opus, Sonnet, Haiku, Fable)";
const GPT_GROUP = "OpenAI GPT tics (GPT-5.6 Sol, GPT-6 Astra)";
const CLAUDISMS_GROUP = "Claudisms (claudisms.ai)";

const patterns = [
  { id: "no-chain", name: '"No X, no Y" chains', description: 'Two or more "no ..." items in a row, e.g. "No fluff, no filler, no jargon."', find: makeChainFinder(String.raw`no[-\s]`, /^no[-\s]/i, '"no" item') },
  { id: "whole", name: '"That’s the whole ..."', description: '"That / this is the whole point, game, thing ..."', find: makeRegexFinder(/\b(?:that|this)(?:['’]s|\s+(?:is|was))\s+the\s+whole\b(?:\s+\w+)?/gi) },
  { id: "did-not-chain", name: '"Did not X, did not Y" chains', description: 'Two or more "did not ..." or "didn’t ..." items in a row.', find: makeChainFinder(String.raw`(?:did\s+not|didn['’]t)\s`, /^(?:did\s+not|didn['’]t)\s/i, '"did not" item') },
  { id: "dont-verb-it", name: '"Don’t VERB it ... VERB it"', description: '"Don’t call it X. Call it Y." — a negated verb + "it", then the same verb + "it" again.', find: makeRegexFinder(/\b(?:do\s+not|don['’]t)\s+(?:just\s+|simply\s+|merely\s+)?(\w+)(?:\s+(?:of|about|at|on|for|with|to))?\s+it\b[^.!?\n]*?[.!?;,:–—]['"”’]*\s*(?:just\s+|simply\s+|merely\s+)?\1(?:\s+(?:of|about|at|on|for|with|to))?\s+it\b/gi) },
  { id: "sit-with", name: '"Sit with that"', description: "The reflective \"sit with that / this / it (for a moment)\", plus \"sit with the discomfort\" and friends.", find: makeRegexFinder(/\bsit(?:s|ting)?\s+with\s+(?:that|this|it|(?:the|your)\s+(?:discomfort|feelings?|tension|weight|uncertainty|ambiguity|grief|silence|unease))\b(?:\s+for\s+a\s+\w+)?/gi) },
  { id: "already-know", name: '"You already know"', description: '"You already know" — the answer, what to do, or standing alone before a full stop.', find: makeRegexFinder(/\byou\s+already\s+knows?\s+(?:the\s+answer|what|how|why|this|that|it|who|where)\b|\byou\s+already\s+knows?\b(?![ \t]+\w)/gi) },
  { id: "is-the-entire", name: '"Is the entire ..."', description: '"X is the entire point / game / business model."', find: makeRegexFinder(/(?:\b(?:is|was|are|were)|['’]s)\s+the\s+entire\b(?:\s+\w+)?/gi) },
  { id: "the-entire-is", name: '"The entire ... is"', description: '"The entire point / game / business model is ..."', find: makeRegexFinder(/\bthe\s+entire\s+[\w'’-]+(?:\s+[\w'’-]+){0,4}?\s+(?:is|was|are|were)\b/gi) },
  { id: "is-real", name: '"Is real ... and / not"', description: '"The X is real, and / not ...". Skips "real estate", "real time", and similar.', find: makeRegexFinder(/\bis\s+(?:(?:the|a)\s+real\b(?![\s-]+(?:estate|time|life|world|quick)\b)[^.!?\n]*?\b(?:and|not)\s+it\b|real\b(?![\s-]+(?:estate|time|life|world|quick)\b)[^.!?\n]*?\b(?:and|not)\b)/gi) },
  { id: "punchline", name: '"The punchline is"', description: '"The punchline is ...", "the punchline:", or "the punchline?".', find: makeRegexFinder(/\bthe\s+punchline(?:\s+(?:is|was|being)\b|\s*[:?])/gi) },
  { id: "worth-naming", name: '"Worth naming"', description: 'The therapist-voiced "that loss is real and it’s worth naming", or a "Worth naming:" opener.', find: makeRegexFinder(/(?:\b(?:is|are|was|were|feels?|felt|seems?|seemed)|['’]s)\s+(?:\w+\s+){0,2}?worth\s+naming\b(?!\s+names\b)|\bworth\s+naming\s*:/gi) },
  { id: "not-nothing", name: '"That’s not nothing"', description: '"That is not nothing" / "that’s not nothing", plus "this / it / which is not nothing".', find: makeRegexFinder(/\b(?:that|this|it|which)(?:['’]s|\s+(?:is|was))\s+not\s+nothing\b/gi) },
  { id: "is-the-whole", name: '"Is the whole ..."', description: 'Subject + "is the whole point / trick / pitch / idea", plus "here is the whole ...".', find: makeRegexFinder(/(?:\b(?:is|was|are|were)|['’]s)\s+the\s+whole\b(?:\s+\w+)?|\bhere(?:['’]s|\s+is)\s+the\s+whole\b(?:\s+\w+)?/gi) },
  { id: "echo-triad", name: "Echoing sentence runs", description: "Consecutive sentences built on the same repeated skeleton.", find: makeEchoFinder({ minGram: 4, minRun: 2 }) },
  { id: "performative-honesty", name: "Performative honesty", description: 'Sincerity announced rather than demonstrated: "I won’t pretend", "I’ll be honest", "let’s be honest", "to be clear", sentence-initial "Honestly," or "Look,".', find: makeRegexFinder(/\bI\s+(?:will\s+not|won['’]t)\s+pretend\b|\b(?:I['’]ll|let['’]s|to)\s+be\s+(?:honest|clear|blunt|real)\b|(?:^|[.!?–—]\s+|\n)(?:Honestly|Look|Truthfully|Frankly)\s*,/gi) },
  { id: "thats-the-part", name: '"That’s the part ..."', description: 'Gesturing at a favoured detail instead of stating it.', find: makeRegexFinder(/\b(?:that|this|it)(?:['’]s|\s+(?:is|was))\s+the\s+part\b|\bthe\s+part\s+that\s+(?:makes|made|gets|got|keeps|kept)\s+(?:me|you|us|it)\b|\bmy\s+favou?rite\s+part\s+of\b/gi) },
  { id: "the-only-i-trust", name: '"The only X I trust"', description: 'The narrowing superlative reveal: "the only marketing I trust".', find: makeRegexFinder(/\bthe\s+only\s+[\w'’-]+(?:\s+[\w'’-]+){0,2}?\s+(?:I|you|we|it|he|she|they)\s+(?:trust|need|needs|care|want|wants|use|uses|believe)\b|\bthe\s+only\s+[\w'’-]+\s+that\s+(?:matters|counts|works|survives)\b/gi) },
  { id: "take-my-word", name: '"Don’t take my word for it"', description: 'The stock invitation to verify.', find: makeRegexFinder(/\b(?:you\s+)?(?:do\s+not|don['’]t)\s+(?:have\s+to\s+)?take\s+my\s+word\s+for\s+(?:it|any\s+of\s+(?:it|this|that))\b/gi) },
  { id: "turns-out", name: '"Turns out ..."', description: 'The casual-revelation opener, almost always bolted to a tidy conclusion.', find: makeRegexFinder(/(?:^|[.!?–—]\s+|\n)Turns\s+out\b|\bit\s+turns\s+out\s+that\b/gi) },
  { id: "fits-in-your-head", name: '"Fits in your head"', description: 'Dev-blog boilerplate for simplicity: "batteries included", "it just works", "zero config".', find: makeRegexFinder(/\b(?:hold|fit|fits|holds|held)\s+(?:it\s+)?in\s+your\s+head\b|\bbatteries[-\s]included\b|\bit\s+just\s+works\b|\bzero[-\s]config(?:uration)?\b|\bsane\s+defaults\b/gi) },
  { id: "stacked-questions", name: "Stacked rhetorical questions", description: "Two or more questions fired in a row.", find: makeQuestionChainFinder({ minRun: 2 }) },
  { id: "sentence-anaphora", name: "Repeated sentence openers", description: "Three or more consecutive sentences starting on the same word.", find: makeAnaphoraFinder({ minRun: 3 }) },
  { id: "colon-triple", name: "Colon into a triple", description: 'A colon opening onto three or more comma-separated items. Noisy in technical writing.', find: makeRegexFinder(/:\s+[^.!?;:\n]{2,40},\s+[^.!?;:\n]{2,40},\s+(?:and\s+|or\s+)?[^.!?;:\n]{2,40}(?=[.!?\n])/g) },
  { id: "heres-the-twist", name: '"Here’s the twist"', description: 'The stage-managed reveal: "here’s the thing", "here’s the catch".', find: makeRegexFinder(/\bhere(?:['’]s|\s+is)\s+(?:the|a|my|one)\s+(?:twist|thing|catch|kicker|rub|problem|first|second|third|next|recent|real|best|worst|surprising|interesting|key|important)\b[\w\s-]{0,20}[:.]/gi) },
  { id: "x-is-dead", name: '"X is dead"', description: 'The obituary headline and its sequel: "peer code review is dead".', find: makeRegexFinder(/\b[\w\s]{3,30}\s+(?:is|are)\s+dead\b|\blong\s+live\s+\w+/gi) },
  { id: "thats-why-mattered", name: '"That’s why X mattered"', description: 'Retroactively assigning significance.', find: makeRegexFinder(/\b(?:that|this)(?:['’]s|\s+(?:is|was))\s+why\b[^.!?\n]{0,80}?\b(?:matter(?:s|ed)?|count(?:s|ed)?)\b/gi) },
  { id: "stranded-auxiliary", name: "Stranded auxiliary contrast", description: 'A clause landing on a bare auxiliary for the reversal: "The tool died; the data didn’t."', find: makeRegexFinder(/[;:,]\s+[^.;:!?\n]{2,50}\s(?:did|does|do|was|were|is|are|has|have|had|can|could|would|will)(?:n['’]t)?\s*[.;]|\b(?:Maybe|Perhaps)\s+\w+[^.!?\n]{0,40}\s(?:would|could|might|should|did|had|was|is)(?:n['’]t)?\s+(?:have\s*)?\./g) },

  { id: "ai-vocab", group: WIKI_GROUP, name: "AI vocabulary words", description: 'Words LLMs lean on far more than people do (delve and seamless are in the banned group): "tapestry", "meticulous", "pivotal", "intricate", "interplay", "underscore", "garner", "bolster", "vibrant", "bustling", "multifaceted", "ever-evolving".', find: makeRegexFinder(/\b(?:tapestr(?:y|ies)|meticulous(?:ly)?|pivotal|intricate(?:ly)?|intricacies|interplay|underscor(?:e|es|ed|ing)|garner(?:s|ed|ing)?|bolster(?:s|ed|ing)?|vibrant|bustling|multifaceted|commendable|ever-evolving)\b/gi) },
  { id: "not-just", group: BANNED_GROUP, name: '"Not just X, but Y"', description: 'Negative parallelisms: "not just X, but (also) Y", "it’s not X — it’s Y".', find: makeRegexFinder(/\bnot\s+(?:just|only|merely|simply)\s+[^.!?\n;]*?\bbut(?:\s+also)?\b|\b(?:it|this|that)(?:['’]s|\s+(?:is|was))\s+not\s+[^.!?\n,;—–]{1,60}[,;—–]\s*(?:it|this|that)(?:['’]s|\s+(?:is|was))\b/gi) },
  { id: "note-that", group: WIKI_GROUP, name: '"It’s important to note"', description: 'Didactic hedging: "it is important to note that", "it’s worth noting", "it should be noted".', find: makeRegexFinder(/\bit(?:['’]s|\s+(?:is|was))\s+(?:also\s+)?(?:important|worth|crucial|essential|vital)\s+(?:to\s+(?:note|remember|understand|recognize|mention|pause|consider|ask)|noting|mentioning|remembering|pausing|considering|asking)\b(?:\s+that\b)?|\bit\s+should\s+be\s+noted\b/gi) },
  { id: "testament", group: WIKI_GROUP, name: '"Stands as a testament"', description: '"Stands / serves as a testament (or reminder)", "is a testament to".', find: makeRegexFinder(/\b(?:stand|stands|stood|serve|serves|served|standing|serving)\s+as\s+(?:a|an)\s+(?:\w+\s+)?(?:testament|reminder)\b|\b(?:is|was|are|were|remain|remains)\s+a\s+(?:\w+\s+)?testament\s+to\b/gi) },
  { id: "crucial-role", group: WIKI_GROUP, name: '"Plays a crucial role"', description: '"Plays a crucial / pivotal / vital / key / significant role in ...".', find: makeRegexFinder(/\bplay(?:s|ed|ing)?\s+(?:a|an)\s+(?:\w+\s+)?(?:crucial|pivotal|vital|key|significant|central|critical|important)\s+role\b/gi) },
  { id: "landscape", group: WIKI_GROUP, name: '"Ever-evolving landscape"', description: 'Scene-setting boilerplate: "the ever-evolving landscape", "in today’s fast-paced world".', find: makeRegexFinder(/\b(?:ever-)?(?:evolving|changing|shifting)\s+landscape\b|\bin\s+today['’]s\s+(?:fast-paced|ever-changing|ever-evolving|digital|modern|competitive)\s+\w+/gi) },
  { id: "vague-experts", group: WIKI_GROUP, name: '"Experts argue"', description: 'Vague attribution to unnamed authorities: "experts argue", "industry reports indicate".', find: makeRegexFinder(/\b(?:many|some|several|most|numerous)?\s*(?:experts|critics|observers|scholars|analysts|commentators)\s+(?:have\s+|often\s+|widely\s+)?(?:argu(?:e|es|ed)|not(?:e|es|ed)|suggest(?:s|ed)?|believ(?:e|es|ed)|agree[ds]?|contend(?:s|ed)?|observ(?:e|es|ed)|caution(?:s|ed)?|claim(?:s|ed)?|cit(?:e|es|ed)|point(?:s|ed)?\s+out)\b|\bindustry\s+reports?\s+(?:suggest|indicate|show)\w*\b/gi) },
  { id: "despite-challenges", group: WIKI_GROUP, name: '"Despite these challenges"', description: 'The challenges-and-outlook formula: "despite these challenges", "remains to be seen", "time will tell".', find: makeRegexFinder(/\bdespite\s+(?:these|those|such|its|their|the|numerous|significant|ongoing)\s+(?:\w+\s+)?challenges\b|\bfac(?:e|es|ed|ing)\s+(?:several|numerous|many|significant|various|a\s+number\s+of)\s+challenges\b|\bchallenges\s+remain\b|\bremains\s+to\s+be\s+seen\b|\b(?:only\s+)?time\s+will\s+tell\b/gi) },
  { id: "participle-tail", group: WIKI_GROUP, name: "Participle sentence tails", description: 'Superficial analysis bolted onto a sentence end: "..., highlighting the ...".', find: makeRegexFinder(/,\s+(?:highlighting|underscoring|emphasizing|showcasing|reflecting|demonstrating|illustrating|signaling|solidifying|cementing|reinforcing|underlining)\s+(?:its|his|her|their|our|the|a|an|how|that|what|both)\b[^.!?\n]*/gi) },
  { id: "promo", group: WIKI_GROUP, name: "Promotional boilerplate", description: 'Travel-brochure tone: "nestled in", "in the heart of", "hidden gem", "boasts a", "breathtaking".', find: makeRegexFinder(/\bnestled\s+(?:in|on|among|between|along|at)\b|\bin\s+the\s+heart\s+of\b|\brich\s+(?:cultural\s+|historical\s+)?(?:heritage|history|tapestry)\b|\bhidden\s+gem\b|\bmust-(?:visit|see|try)\b|\bbreathtaking\b|\bboasts?\s+(?:a|an|the)\b|\bstunning\s+(?:views?|scenery|architecture|backdrop)\b/gi) },
  { id: "ai-leftovers", group: WIKI_GROUP, name: "Chatbot leftovers", description: 'Artifacts pasted straight from a chatbot: "as an AI language model", "knowledge cutoff", plus markup debris like "oaicite" and the AI referrer tags "utm_source=chatgpt.com", "utm_source=openai", "utm_source=copilot.com" and "referrer=grok.com".', find: makeRegexFinder(/\bas\s+an\s+ai(?:\s+language)?\s+model\b|\bas\s+of\s+my\s+last\s+(?:update|training)\b|\bknowledge\s+cutoff\b|\bI\s+(?:cannot|can['’]t|do\s+not|don['’]t)\s+(?:browse\s+the\s+internet|access\s+real-?time)\b|contentReference|oaicite|turn0(?:search|news|image)\d*|attributableIndex|utm_source=(?:openai|chatgpt\.com|copilot\.com)\b|referrer=grok\.com\b/gi) },

  { id: "banned-fillers", group: BANNED_GROUP, name: "Banned filler phrase", description: "Phrases skills/deslop/SKILL.md bans outright: honestly, to be honest, my honest take, it's worth noting, it's important to note, at the end of the day, let's dive in, I hope this helps, feel free to, deep dive.", find: makeRegexFinder(/\bhonestly\b|\bto\s+be\s+honest\b|\bit(?:['’]s|\s+is)\s+(?:worth\s+noting|important\s+to\s+note)\b|\bmy\s+honest\s+take\b|\bat\s+the\s+end\s+of\s+the\s+day\b|\blet['’]s\s+dive\s+in\b|\bI\s+hope\s+this\s+helps\b|\bfeel\s+free\s+to\b|\b(?:a\s+)?deep\s+dive\b/gi) },
  { id: "banned-vocab", group: BANNED_GROUP, name: "Banned word", description: "Single words skills/deslop/SKILL.md bans outright: delve, leverage (as verb), robust, seamless, streamline, unlock, supercharge, game-changer, best-in-class, holistic, landscape (bare), journey, ecosystem, elevate, empower, cutting-edge.", find: makeRegexFinder(/\bleverag(?:e|es|ed|ing)\b|\brobust(?:ly|ness)?\b|\bstreamlin(?:e|es|ed|ing)\b|\bunlock(?:s|ed|ing)?\b|\bsupercharg(?:e|es|ed|ing)\b|\bgame[-\s]changers?\b|\bbest-in-class\b|\bholistic(?:ally)?\b|\blandscape\b|\bjourney\b|\becosystems?\b|\belevat(?:e|es|ed|ing)\b|\bempower(?:s|ed|ing|ment)?\b|\bcutting-edge\b|\bdelv(?:e|es|ed|ing)\b|\bseamless(?:ly)?\b/gi) },
  { id: "banned-em-dash", group: BANNED_GROUP, name: "Em dash", description: "SKILL.md: never use em dashes; use a hyphen or rewrite the sentence.", find: makeRegexFinder(/—/g) },
  { id: "banned-praise-opener", group: BANNED_GROUP, name: "Praise/agreement opener", description: 'SKILL.md: never open with praise or agreement ("Great question", "You’re absolutely right", "Good catch", "Excellent point").', find: makeRegexFinder(/(?:^|\n)\s*(?:Great\s+question|You['’]re\s+absolutely\s+right|Good\s+catch|Excellent\s+point)\b/gi) },

  { id: "extra-verbs", group: EXTRA_GROUP, name: "Overused reporting verbs", description: 'GPTZero frequency data: "remarked", "aligns/aligned with", "aims to explore", "notable works include".', find: makeRegexFinder(/\bremark(?:ed|s)\b|\balign(?:s|ed|ing)?\s+with\b|\baims?\s+to\s+explore\b|\bnotable\s+works?\s+includes?\b/gi) },

  { id: "claude-sycophancy-opener", group: BANNED_GROUP, name: "Sycophantic opener", description: 'Sentence-initial affirmations before getting to content: "Certainly!", "Absolutely!", "Of course,", "That’s brilliant!", "Excellent idea!". Extends SKILL.md’s existing praise-opener ban with more of Claude’s specific defaults.', find: makeRegexFinder(/(?:^|[.!?–—]\s+|\n)(?:Certainly|Absolutely|Of course)[!,]|\bThat['’]s\s+brilliant\b|\bExcellent\s+idea\b|\bWhat\s+a\s+(?:great|fantastic|wonderful)\s+idea\b/gi) },
  { id: "claude-pivot-reframe", group: BANNED_GROUP, name: '"It’s not that X, it’s that Y"', description: "The reframe hedge: restating a claim as a correction of an unstated assumption instead of just stating it.", find: makeRegexFinder(/\bit(?:['’]s|\s+is)\s+not\s+that\s+[^.!?\n,;]{1,60},?\s+it(?:['’]s|\s+is)\s+that\b/gi) },
  { id: "claude-meta-wrapper", group: BANNED_GROUP, name: 'Meta-commentary wrapper', description: 'Narrating the explanation instead of giving it: "let me break this down", "let me walk you through", "let me explain".', find: makeRegexFinder(/\blet\s+me\s+(?:break\s+(?:this|that|it)\s+down|walk\s+you\s+through|explain\s+(?:this|that|why|how))\b/gi) },
  { id: "claude-keep-in-mind", group: BANNED_GROUP, name: '"Keep in mind" / "bears mentioning"', description: 'Didactic hedging variants not already covered by the Wikipedia "it\'s important to note" pattern.', find: makeRegexFinder(/\b(?:it(?:['’]s|\s+is)\s+(?:important|worth)\s+to\s+)?keep\s+in\s+mind\s+that\b|\bbears\s+mentioning\b/gi) },
  { id: "claude-misc-vocab", group: BANNED_GROUP, name: "Claude-specific vocabulary", description: 'Distinctive single words called out repeatedly as Claude tics: "load-bearing" (metaphorical), "undeniably".', find: makeRegexFinder(/\bload-bearing\b|\bundeniably\b/gi) },
  { id: "claude-honest-frame", group: CLAUDE_GROUP, name: '"The honest answer" / "Honest caveat:"', description: 'Announcing candor instead of being candid: "the honest answer (is that)", "one honest note", "Honest caveat:". Pangram: absent in Opus 5.5, common in Opus 5.', find: makeRegexFinder(/\bthe\s+honest\s+answer\b|\bone\s+honest\s+note\b|\bhonest\s+caveat\s*:/gi) },
  { id: "claude-intensifier", group: CLAUDE_GROUP, name: '"Genuinely" / "matters enormously"', description: 'Pangram’s top Sonnet 5 and Opus 5 intensifiers. Opus 5.5 uses them far less. "genuinely" is ordinary English, so judge density, not a single hit.', find: makeRegexFinder(/\bgenuinely\b|\bmatters?\s+enormously\b/gi) },
  { id: "claude-opus5-phrasing", group: CLAUDE_GROUP, name: "Opus 5 stock phrasing", description: 'Siblings of "load-bearing" from explainx’s Opus 5 table: "worth stating plainly", "carry the argument", "..., full stop.", "..., and the trap is".', find: makeRegexFinder(/\bworth\s+stating\s+plainly\b|\bcarr(?:y|ies|ied)\s+the\s+argument\b|,\s+full\s+stop\b|,\s+and\s+the\s+trap\s+is\b/gi) },
  { id: "claude-stock-opener", group: CLAUDE_GROUP, name: "Claude-speak openers", description: 'From slhck.info’s Claude-speak list: "The one thing you need to ...", "That’s precisely the ... you’ve encountered".', find: makeRegexFinder(/\bthe\s+one\s+thing\s+you\s+need\s+to\b|\bthat['’]s\s+precisely\s+the\b/gi) },
  { id: "claude-in-short", group: CLAUDE_GROUP, name: '"In short," / "perhaps the most"', description: 'Opus 5.5’s rising tells: sentence-initial "In short" (100 uses vs Opus 5’s 9, Pangram) and the hedged superlative "perhaps the most" (29x Astra’s rate, Graphite).', find: makeRegexFinder(/(?:^|[.!?]\s+|\n)In\s+short\b[,:]|\bperhaps\s+the\s+most\b/gi) },
  { id: "claude-this-matters", group: CLAUDE_GROUP, name: '"This matters" / "Why X matters"', description: 'Graphite, Opus 5.5 vs human text: "this matters" 116x, a sentence or heading opening "Why X matters" 92x, "matters most" 12x. Also "and that matters", "because it matters".', find: makeRegexFinder(/\bthis\s+matters\b|(?:^|[.!?]\s+|\n)(?:#+\s+)?Why\s+(?:[\w'’-]+\s+){1,4}?matters?\b|\bmatters\s+most\b|\b(?:and|because)\s+(?:that|it)\s+matters\b/gi) },
  { id: "claude-more-than-a", group: CLAUDE_GROUP, name: '"Is more than a X, it’s Y"', description: 'Graphite: Opus 5.5 uses "is more than a ..., it" at 98x the human rate, in place of the older "not X, it’s Y".', find: makeRegexFinder(/(?:\b(?:is|are|was|were)|['’]s)\s+(?:much\s+)?more\s+than\s+(?:just\s+)?(?:a|an)\s+[^.!?\n,;]{1,40}[,;:–]\s*(?:it|they|this|that)(?:\s+(?:is|are|was|were)\b|['’](?:s|re)\b)/gi) },
  { id: "claude-opus55-transitions", group: CLAUDE_GROUP, name: "Opus 5.5 stock transitions", description: 'Graphite, Opus 5.5 vs human text: "looking ahead, the" 40x, "rather than simply" 32x, "adds another layer" 27x, "what comes next" 24x, "just as important" 13x.', find: makeRegexFinder(/\blooking\s+ahead\s*,?\s+the\b|\brather\s+than\s+simply\b|\badd(?:s|ed|ing)?\s+another\s+layer\b|\bwhat\s+comes\s+next\b|\bjust\s+as\s+important\b/gi) },
  { id: "claude-fiction-stock", group: CLAUDE_GROUP, name: "Opus 5.5 fiction stock phrases", description: 'Pangram: "said quietly", "for a long moment" and "felt something" appear far more often in Opus 5.5 fiction.', find: makeRegexFinder(/\bsaid\s+quietly\b|\bfor\s+a\s+long\s+moment\b|\bfelt\s+something\b/gi) },
  { id: "claude-bold-leadin", group: CLAUDE_GROUP, name: "Bold lead-in bullet runs", description: 'Four or more list items in a row opening on "**Term:**". Arize: Opus 5.5 writes about 2.5x as many as Opus 5. claudisms.ai lists the same "Bold term: explanation" format.', find: makeBoldLeadInFinder() },

  { id: "gpt-real-talk", group: GPT_GROUP, name: 'Superficial "real-talk"', description: 'GPT-5.6 Sol’s leaked prompt bans these as a verbal tic: "My blunt take", "My honest recommendation", "My strategic advice", "If I’m being direct". ("To be blunt" is in performative-honesty.)', find: makeRegexFinder(/\bmy\s+(?:blunt\s+take|honest\s+recommendation|strategic\s+advice)\b|\bif\s+I['’]m\s+being\s+direct\b/gi) },
  { id: "gpt-patronizing", group: GPT_GROUP, name: "Patronizing reassurance", description: 'GPT-5.6 Sol’s leaked prompt bans "let’s pause", "let’s take a breath", "let’s take a step back", "it’s not your fault", "you’re not broken".', find: makeRegexFinder(/\blet['’]s\s+(?:pause|take\s+a\s+(?:breath|step\s+back))\b|\bit['’]s\s+not\s+your\s+fault\b|\byou['’]re\s+not\s+broken\b/gi) },
  { id: "gpt-astra-hedge", group: GPT_GROUP, name: "Astra qualification hedges", description: 'Graphite: GPT-6 Astra uses "does not establish" at 275x and "may provide" at 18x Opus 5.5’s rate, and "need not" at 17x Sol’s.', find: makeRegexFinder(/\bdoes\s+not\s+establish\b|\bmay\s+provide\b|\bneed\s+not\b/gi) },
  { id: "gpt-signpost", group: GPT_GROUP, name: "Formulaic signposts", description: 'From an unattributed Astra prompt blocklist: "Bottom line:", "The simplest mental model is", sentence-initial "Importantly,", and the verb "foster".', find: makeRegexFinder(/\bbottom\s+line\s*:|\bthe\s+simplest\s+mental\s+model\b|(?:^|[.!?]\s+|\n)Importantly\s*[,:]|\bfoster(?:s|ed|ing)?\b/gi) },
  { id: "gpt-astra-dimension", group: GPT_GROUP, name: '"Another dimension"', description: 'Graphite: GPT-6 Astra uses the transition "another dimension" at 117x the human rate.', find: makeRegexFinder(/\banother\s+dimension\b/gi) },

  { id: "claudism-reflective", group: CLAUDISMS_GROUP, name: "Reflective-pose filler", description: 'claudisms.ai: "worth sitting with", "a hard thing to sit with.", "I keep coming back to", "which brings me back to", "I can’t stop thinking about", "what I keep running into", "the question that keeps coming up".', find: makeRegexFinder(/\bworth\s+sitting\s+with\b|\bsit\s+with(?=\s*[.!?\n])|\b(?:I|we)\s+keep\s+coming\s+back\s+to\b|\bbrings?\s+(?:me|us)\s+back\s+to\b|\bI\s+can['’]t\s+stop\s+thinking\s+about\b|\bwhat\s+I\s+keep\s+(?:running\s+into|hitting|noticing|finding|seeing|landing\s+on)\b|\bwhere\s+I\s+keep\s+landing\b|\bthe\s+question\s+(?:that\s+|I\s+)?(?:kept|keeps|keep)\s+coming\s+(?:up|back\s+to)\b/gi) },
  { id: "claudism-reveal", group: CLAUDISMS_GROUP, name: "Staged reveal", description: 'claudisms.ai: "here’s where it gets interesting", "the one that surprised me most", "what struck me hardest", "stuck with me", "hit a nerve", "what I didn’t expect to find", "if I had to pick one", "hits hardest", "that’s the tell".', find: makeRegexFinder(/\bhere['’]s\s+where\s+it\s+gets\s+interesting\b|\bhere['’]s\s+the\s+(?:part|moment|analogy)\s+that\s+(?:stuck|hit|clicked|landed)\b|\bthe\s+one\s+that\s+surprised\s+me\s+(?:the\s+)?most\b|\bwhat\s+struck\s+me\s+(?:the\s+)?(?:hardest|most)\b|\b(?:stuck|stayed)\s+with\s+me\b|\b(?:hit|struck)\s+a\s+(?:nerve|chord)\b|\bwhat\s+I\s+didn['’]t\s+expect\s+to\s+find\b|\bif\s+I\s+had\s+to\s+pick\s+one\b|\bwhat\s+got\s+me\s+was\b|\bthe\s+thing\s+that\s+got\s+(?:to\s+)?me\b|\b(?:hits|lands|strikes)\s+(?:the\s+)?hardest\b|\bthat['’]s\s+the\s+tell\b|\bthe\s+tell\s+is\b/gi) },
  { id: "claudism-metaphor", group: CLAUDISMS_GROUP, name: "Stock metaphors", description: 'claudisms.ai: "doing the heavy lifting", "we’ve seen this movie before", "nobody handed you", "what stays yours", "throughline", "different physics", "paradigm shift", "first wave of a multi-year transition", "best operators", "quietly dropped".', find: makeRegexFinder(/\bdoing\s+(?:all\s+)?the\s+(?:heavy\s+)?lifting\b|\bseen\s+this\s+movie\s+before\b|\b(?:nobody|no\s+one)\s+(?:handed|gave)\s+you\b|\bstays?\s+yours\b|\bthroughlines?\b|\bdifferent\s+physics\b|\bparadigm\s+shifts?\b|\bfirst\s+wave\s+of\s+a\s+multi-year\b|\b(?:best|top)\s+(?:operators|practitioners)\b|\bquietly\s+(?:dropped|stopped|refuses?|shifts?|erodes?)\b|\b(?:shifts|erodes|changes)\s+quietly\b/gi) },
  { id: "claudism-landing", group: CLAUDISMS_GROUP, name: "Invented consensus and landing", description: 'claudisms.ai: "here’s where I landed", "what I want you to see", "what I want people to take away", "everyone I’ve worked with", "most people I’ve talked to", "nobody I know".', find: makeRegexFinder(/\b(?:here['’]?s|here\s+is)\s+where\s+I\s+(?:landed|come\s+down)\b|\bwhat\s+I\s+(?:keep\s+)?want(?:ing)?\s+(?:you|people)\s+to\s+(?:see|take\s+away)\b|\beveryone\s+I['’]ve\s+worked\s+with\b|\bmost\s+people\s+I['’]ve\s+(?:talked|spoken)\s+to\b|\bnobody\s+I\s+know\b/gi) },
  { id: "claudism-phrases", group: CLAUDISMS_GROUP, name: "Stock AI phrases", description: 'claudisms.ai "Phrases" and "Vocabulary": "At its core,", "When it comes to", "This is where X comes in", "cannot be overstated", "shed light on", "pave the way", "reflecting a broader trend", "marking a significant shift", "I love that you asked", "let’s break it down", "let’s unpack", "harness the power", "realm of", "groundbreaking", "transformative", "game-changing".', find: makeRegexFinder(/(?:^|[.!?]\s+|\n)At\s+its\s+core\b|\bwhen\s+it\s+comes\s+to\b|\bthis\s+is\s+where\s+[\w'’ -]{1,30}?\s+comes?\s+in\b|\bcan(?:not|['’]t)\s+be\s+overstated\b|\bsh(?:ed|eds|edding)\s+(?:new\s+)?light\s+on\b|\bpav(?:e|es|ed|ing)\s+the\s+way\b|\breflecting\s+a\s+broader\s+trend\b|\bmarking\s+a\s+significant\s+shift\b|\bI\s+love\s+that\s+you\s+asked\b|\blet['’]s\s+(?:break\s+(?:it|this)\s+down|unpack)\b|\bharness(?:es|ed|ing)?\s+the\s+power\b|\b(?:in\s+the\s+)?realms?\s+of\b|\bgroundbreaking\b|\btransformative\b|\bgame-changing\b/gi) },

];

module.exports = { patterns };
