---
type: regex
pattern: '^(?=[\s\S]*\bhonestly\b)(?=[\s\S]*\bto be honest\b)(?=[\s\S]*\bleverage\b)(?=[\s\S]*\brobust\b)(?=[\s\S]*\bseamless\b)'
flags: i
match: contains
---

The reply names each flagged word, so a silent fix fails. Deterministic
on purpose: an LLM judge failed replies that named all five.
