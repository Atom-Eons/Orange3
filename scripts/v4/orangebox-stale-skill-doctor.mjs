#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

const activeRoots = [
  { id: "codex", root: path.join(userRoot, ".codex", "skills") },
  { id: "agents", root: path.join(userRoot, ".agents", "skills") },
  { id: "claude", root: path.join(userRoot, ".claude", "skills") },
  { id: "antigravity", root: path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills") },
];

const staleNames = new Set([
  "ae-code",
  "ae-design",
  "ae-factory",
  "ae-launch",
  "ae-legal",
  "ae-marketing",
  "ae-ops",
  "ae-product",
  "ae-researcher",
  "ae-review-panel",
  "ae-sales",
  "aecode",
  "aefactory",
  "aeskills",
]);

function listSkillDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(root, entry.name);
      return {
        name: entry.name,
        path: full,
        has_skill_md: fs.existsSync(path.join(full, "SKILL.md")),
      };
    });
}

function main() {
  const roots = activeRoots.map((activeRoot) => {
    const skills = listSkillDirs(activeRoot.root);
    return {
      ...activeRoot,
      exists: fs.existsSync(activeRoot.root),
      skill_count: skills.length,
      stale: skills.filter((skill) => staleNames.has(skill.name.toLowerCase())),
      orangebox_primer_present: skills.some((skill) => skill.name === "orangebox-primer"),
    };
  });
  const stale = roots.flatMap((root) => root.stale.map((skill) => ({ root: root.id, ...skill })));
  const result = {
    ok: stale.length === 0,
    version: "orangebox-stale-skill-doctor/v0",
    mode: "ON_DEMAND_ONLY",
    checked_at: new Date().toISOString(),
    stale_count: stale.length,
    stale,
    roots,
    note: "This is deliberately not part of the always-on watcher. Run when skill discovery looks polluted.",
  };
  if (receipt) {
    fs.mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `orangebox-stale-skill-doctor-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }
  console.log(json ? JSON.stringify(result, null, 2) : `${result.ok ? "STALE_SKILLS_CLEAR" : "STALE_SKILLS_FOUND"} ${stale.length}`);
  if (!result.ok) process.exitCode = 1;
}

main();
