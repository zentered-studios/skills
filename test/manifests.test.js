#!/usr/bin/env node
// The Claude Code and Codex manifests describe one plugin. Keep their name,
// version and description in sync, and package.json on the same version.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const pkg = read("package.json");
const claude = read(".claude-plugin/plugin.json");
const codex = read(".codex-plugin/plugin.json");
const claudeMarket = read(".claude-plugin/marketplace.json");
const codexMarket = read(".agents/plugins/marketplace.json");

test("plugin manifests share name, version and description", () => {
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, claude.version);
  assert.equal(codex.description, claude.description);
  assert.equal(pkg.version, claude.version);
});

test("both marketplaces list the plugin from the repo root", () => {
  for (const market of [claudeMarket, codexMarket]) {
    const entry = market.plugins.find((p) => p.name === claude.name);
    assert.ok(entry, `${market.name} lists ${claude.name}`);
    const source = typeof entry.source === "string" ? entry.source : entry.source.path;
    assert.equal(source, "./");
  }
});

test("every skill directory has a SKILL.md whose name matches the directory", () => {
  const skillsDir = path.join(root, "skills");
  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const { name: dir } of dirs) {
    const text = fs.readFileSync(path.join(skillsDir, dir, "SKILL.md"), "utf8");
    assert.match(text, new RegExp(`^---\\nname: ${dir}\\n`), `skills/${dir}/SKILL.md name`);
    assert.match(text, /^description: /m, `skills/${dir}/SKILL.md description`);
  }
});
