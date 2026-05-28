/* handoff-composer.mjs — v6.0.3 agent-to-agent handoff document composer
   Inspired by mattpocock/skills/handoff. Compact current conversation /
   sprint state into a self-contained document the next agent can pick up
   without rereading the entire transcript. */
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";

const HANDOFF_VERSION = "1.0";

function dataDir() {
  const root = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
  const d = path.join(root, "handoffs");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/**
 * compose({ from, to, topic, decisions, remaining, files_touched, blockers, contacts })
 *   from        — current agent / operator handle
 *   to          — receiving agent identifier
 *   topic       — short topic line
 *   decisions   — array of strings (decisions made so far)
 *   remaining   — array of strings (what's left)
 *   files_touched — array of absolute paths
 *   blockers    — array of strings (what's blocked)
 *   contacts    — array of strings (people/agents to consult)
 * Returns { path, content }
 */
export function compose({ from = "operator", to = "next-agent", topic = "handoff", decisions = [], remaining = [], files_touched = [], blockers = [], contacts = [] } = {}) {
  const ts = new Date().toISOString();
  const id = `${ts.replace(/[:.]/g, "-")}_${(topic || "handoff").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
  const file = path.join(dataDir(), `${id}.md`);

  const lines = [
    "---",
    `handoff_version: ${HANDOFF_VERSION}`,
    `from: ${from}`,
    `to: ${to}`,
    `topic: ${topic}`,
    `ts: ${ts}`,
    "---",
    "",
    "# Handoff",
    "",
    `**From:** ${from}  **To:** ${to}`,
    `**Topic:** ${topic}`,
    `**Generated:** ${ts}`,
    "",
    "## Decisions made (do not relitigate)",
    ...(decisions.length ? decisions.map(d => `- ${d}`) : ["- (none yet)"]),
    "",
    "## Remaining work (priority order)",
    ...(remaining.length ? remaining.map((r, i) => `${i + 1}. ${r}`) : ["- (none)"]),
    "",
    "## Files touched this session",
    ...(files_touched.length ? files_touched.map(f => `- \`${f}\``) : ["- (none)"]),
    "",
    "## Active blockers",
    ...(blockers.length ? blockers.map(b => `- ${b}`) : ["- (none)"]),
    "",
    "## Contacts / sources to consult",
    ...(contacts.length ? contacts.map(c => `- ${c}`) : ["- (none)"]),
    "",
    "## How to verify you've absorbed this",
    "Before writing code:",
    "1. Confirm the topic in one sentence.",
    "2. List the top 3 remaining items in your own words.",
    "3. Name one blocker and its workaround.",
    "If you cannot, read the linked receipts before proceeding.",
    "",
  ];
  const content = lines.join("\n");
  fs.writeFileSync(file, content);
  return { path: file, id, content };
}

export function listHandoffs({ limit = 20 } = {}) {
  const d = dataDir();
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith(".md")).sort().reverse().slice(0, limit)
    .map(f => ({ id: f.replace(/\.md$/, ""), path: path.join(d, f) }));
}

export function read(idOrPath) {
  let p = idOrPath;
  if (!fs.existsSync(p)) p = path.join(dataDir(), idOrPath + ".md");
  if (!fs.existsSync(p)) return null;
  return { path: p, content: fs.readFileSync(p, "utf8") };
}
