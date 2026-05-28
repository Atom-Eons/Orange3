import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const vaultRoot = path.join(orangeRoot, "orangebox-knowledge-vault");
const projectKey = process.argv.includes("--project")
  ? process.argv[process.argv.indexOf("--project") + 1] || "orangebox"
  : "orangebox";

const dirs = {
  command: path.join(vaultRoot, "00 Command"),
  projects: path.join(vaultRoot, "01 Projects", projectKey),
  memory: path.join(vaultRoot, "02 Memory"),
  chats: path.join(vaultRoot, "03 Claude Chats"),
  receipts: path.join(vaultRoot, "04 Receipts"),
  proof: path.join(vaultRoot, "05 Proof"),
  sources: path.join(vaultRoot, "06 Sources"),
  system: path.join(vaultRoot, "99 System")
};

function iso() {
  return new Date().toISOString();
}

function stamp() {
  return iso().replace(/[:.]/g, "-");
}

function normalizeSlash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function wikilink(name, label = name) {
  return `[[${name}|${label}]]`;
}

function clampText(value, limit = 14000) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[clipped by OrangeBOX Obsidian sync: ${text.length - limit} chars stored at source]`;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readText(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

async function writeJson(file, data) {
  await writeText(file, `${JSON.stringify(data, null, 2)}\n`);
}

function note(title, body, extra = {}) {
  const frontmatter = {
    title,
    orangebox: true,
    generated: iso(),
    ...extra
  };
  return [
    "---",
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    "",
    `# ${title}`,
    "",
    body.trim(),
    ""
  ].join("\n");
}

async function listFiles(dir, limit = 40, predicate = () => true) {
  try {
    const rows = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const row of rows) {
      if (!row.isFile() || !predicate(row.name)) continue;
      const full = path.join(dir, row.name);
      const stat = await fs.stat(full).catch(() => null);
      files.push({ name: row.name, full, updatedAt: stat?.mtime?.toISOString?.() || null, size: stat?.size || 0 });
    }
    return files.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, limit);
  } catch {
    return [];
  }
}

async function copyTreeIfExists(from, to) {
  if (!(await exists(from))) return false;
  await fs.rm(to, { recursive: true, force: true });
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
  return true;
}

async function setupVaultShell() {
  for (const dir of [vaultRoot, ...Object.values(dirs), path.join(vaultRoot, ".obsidian")]) {
    await fs.mkdir(dir, { recursive: true });
  }
  await writeJson(path.join(vaultRoot, ".obsidian", "app.json"), {
    legacyEditor: false,
    livePreview: true,
    readableLineLength: true,
    showLineNumber: false
  });
  await writeJson(path.join(vaultRoot, ".obsidian", "appearance.json"), {
    theme: "obsidian",
    accentColor: "#7dd3fc",
    cssTheme: ""
  });
  await writeJson(path.join(vaultRoot, ".obsidian", "core-plugins.json"), {
    fileExplorer: true,
    globalSearch: true,
    switcher: true,
    graph: true,
    backlinks: true,
    outgoingLink: true,
    tagPane: true,
    pagePreview: true,
    dailyNotes: true,
    templates: false,
    noteComposer: true,
    commandPalette: true,
    slashCommand: false,
    starred: false,
    markdownImporter: false,
    zkPrefixer: false,
    randomNote: false,
    outline: true,
    wordCount: true,
    slides: false,
    audioRecorder: false,
    workspaces: false,
    fileRecovery: true
  });
}

async function writeCommandNotes() {
  const body = `
OrangeBOX is the commander above OrangeBOX Knowledge. The vault is memory, not the boss.

## Load Order

1. Load the active OrangeBOX project position.
2. Load the live project spine and next numbered step.
3. Load the tiny memory primer.
4. Search this Obsidian OrangeBOX Knowledge vault only for relevant past context.
5. Pull skills, MCP tools, and AE departments on demand.
6. Treat receipts and visual proof as the truth layer.

## Operating Law

- Never load the whole vault into a model by default.
- Never call a memory note verified unless there is a receipt or proof artifact.
- Keep lessons, decisions, and failure patterns; decay raw noise.
- Use Codexa for heavy execution and cockpit for command.
- Keep Claude/Codex subscription telemetry honest: unknown means unknown.

## Relevant Notes

- ${wikilink("Current Position")}
- ${wikilink("Project Spine")}
- ${wikilink("Memory Primer")}
- ${wikilink("OrangeBOX Knowledge")}
- ${wikilink("OrangeBOX PageTree Primer")}
- ${wikilink("CLC Primer")}
- ${wikilink("Claude Chat Archive Index")}
- ${wikilink("Receipt Index")}
- ${wikilink("Hermes Agent Notes")}
`;
  await writeText(path.join(dirs.command, "Orchestrator Law.md"), note("Orchestrator Law", body, { layer: "command" }));
}

async function writeProjectNotes() {
  const projectDir = path.join(orangeRoot, "project-thread", projectKey);
  const position = await readJson(path.join(projectDir, "project-position.json"), {});
  const spineMarkdown = await readText(path.join(projectDir, "PROJECT_SPINE.md"), "Project spine has not been generated yet.");
  const thread = await readText(path.join(projectDir, "THREAD.md"), "");
  const handoff = await readText(path.join(projectDir, "CODEX_HANDOFF.md"), "");
  await writeText(path.join(dirs.projects, "Current Position.md"), note("Current Position", `
Project: ${projectKey}

Claude Code session id: ${position.claudeCodeSessionId || "pending"}

Anthropic binding: ${position.anthropicBinding || "subscription-claude-code-session"}

Brain: ${position.brain || "unset"}

Scope: ${position.scope || "unset"}

## Current Position

${position.currentPosition || "No current project position captured yet."}

## Links

- ${wikilink("Project Spine")}
- ${wikilink("Recent Project Thread")}
- ${wikilink("Codex Handoff")}
`, { project: projectKey, layer: "project" }));

  await writeText(path.join(dirs.projects, "Project Spine.md"), note("Project Spine", spineMarkdown, { project: projectKey, layer: "project" }));
  await writeText(path.join(dirs.projects, "Recent Project Thread.md"), note("Recent Project Thread", clampText(thread, 24000), { project: projectKey, layer: "project" }));
  await writeText(path.join(dirs.projects, "Codex Handoff.md"), note("Codex Handoff", clampText(handoff, 24000), { project: projectKey, layer: "project" }));
}

async function writeMemoryNotes() {
  const memorySources = [
    ["Recall Packet", path.join(orangeRoot, "RECALL.md")],
    ["Misfit Manifesto", path.join(orangeRoot, "MISFIT_MANIFESTO.md")],
    ["Hardware Wiki", path.join(orangeRoot, "HARDWAREWIKI.md")],
    ["Lessons Learned", path.join(orangeRoot, "memory", "compiled", "LESSONS_LEARNED.md")],
    ["Mistakes", path.join(orangeRoot, "memory", "compiled", "MISTAKES.md")],
    ["CLC Primer", path.join(orangeRoot, "memory", "compiled", "CLC_PRIMER.md")],
    ["OrangeBOX Knowledge Primer", path.join(orangeRoot, "memory", "compiled", "ORANGEBOX_KNOWLEDGE_PRIMER.md")],
    ["OrangeBOX PageTree Primer", path.join(orangeRoot, "memory", "compiled", "ORANGEBOX_PAGETREE_PRIMER.md")]
  ];
  const index = [];
  for (const [title, source] of memorySources) {
    const text = await readText(source, "");
    if (!text) continue;
    await writeText(path.join(dirs.memory, `${title}.md`), note(title, clampText(text, 24000), {
      layer: "memory",
      source: normalizeSlash(source)
    }));
    index.push(`- ${wikilink(title)} from \`${normalizeSlash(source)}\``);
  }
  await writeText(path.join(dirs.memory, "Memory Primer.md"), note("Memory Primer", `
This is the bounded memory layer for OrangeBOX. It should be searched and summarized, not loaded wholesale.

## Sources

${index.length ? index.join("\n") : "- No compiled memory sources found yet."}

## Rule

Good memory keeps the lesson and drops the noise. Raw archives stay searchable; active context stays small.
`, { layer: "memory" }));
}

async function writeOrangeboxKnowledgeNotes() {
  const graphPath = path.join(orangeRoot, "memory", "orangebox-knowledge", "graph.json");
  const pageTreePath = path.join(orangeRoot, "memory", "orangebox-knowledge", "pagetree.json");
  const enginePath = path.join(orangeRoot, "memory", "orangebox-knowledge", "ENGINE.md");
  const graph = await readJson(graphPath, null);
  const pageTree = await readJson(pageTreePath, null);
  const engineText = await readText(enginePath, "");
  const body = graph ? `
OrangeBOX Knowledge is the active memory engine under the command surface. It is not a static document shelf.

The PageTree rail reads natural headings and transcript turns like a book. It does not require embeddings or an external vector database.

## Counts

- Documents: ${graph.counts?.documents || 0}
- PageTree nodes: ${pageTree?.counts?.treeNodes || graph.counts?.pageTreeNodes || 0}
- PageTree leaves: ${pageTree?.counts?.leaves || graph.counts?.pageTreeLeaves || 0}
- Context slices: ${graph.counts?.chunks || 0}
- Nodes: ${graph.counts?.nodes || 0}
- Edges: ${graph.counts?.edges || 0}
- Terms: ${graph.counts?.terms || 0}

## Adapter Truth

${Object.entries(graph.adapterStatus || {}).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

## Source

\`${normalizeSlash(graphPath)}\`

PageTree: \`${normalizeSlash(pageTreePath)}\`

## Engine Brief

${clampText(engineText, 30000)}
` : `
OrangeBOX Knowledge has not been built yet. Run \`npm run knowledge\` in \`C:\\AtomEons\\aeskills\\orangebox-command\`.
`;
  await writeText(path.join(dirs.memory, "OrangeBOX Knowledge.md"), note("OrangeBOX Knowledge", body, {
    layer: "memory-engine",
    source: normalizeSlash(graphPath)
  }));
}

async function writeClaudeChatNotes() {
  const latest = await readJson(path.join(orangeRoot, "memory", "claude-chats", "LATEST_IMPORT.json"), null);
  const wikiDir = latest?.wikiDir
    ? path.resolve(latest.wikiDir)
    : latest?.importId
      ? path.join(orangeRoot, "memory", "claude-chats", "wiki", latest.importId)
      : latest?.id
        ? path.join(orangeRoot, "memory", "claude-chats", "wiki", latest.id)
        : null;
  const importId = wikiDir ? path.basename(wikiDir) : latest?.importId || latest?.id || null;
  const copiedFull = wikiDir
    ? await copyTreeIfExists(path.join(wikiDir, "full-transcripts"), path.join(dirs.chats, "full-transcripts"))
    : false;
  const files = [
    ["Claude Chat Wiki", wikiDir && path.join(wikiDir, "CLAUDE_CHAT_WIKI.md")],
    ["Project Mention Index", wikiDir && path.join(wikiDir, "PROJECT_MENTION_INDEX.md")],
    ["User Said Project Index", wikiDir && path.join(wikiDir, "USER_SAID_PROJECT_INDEX.md")],
    ["Claude Projects", wikiDir && path.join(wikiDir, "CLAUDE_PROJECTS.md")]
  ];
  const lines = [
    `Latest import: ${importId || "none"}`,
    `Full transcripts copied into vault: ${copiedFull ? "yes" : "no"}`,
    "",
    "## Search Path",
    "",
    "Use Obsidian search over this folder first when the operator asks what they said about a project.",
    ""
  ];
  for (const [title, source] of files) {
    if (!source || !(await exists(source))) continue;
    const text = await readText(source);
    await writeText(path.join(dirs.chats, `${title}.md`), note(title, clampText(text, 50000), {
      layer: "archive",
      source: normalizeSlash(source)
    }));
    lines.push(`- ${wikilink(title)} from \`${normalizeSlash(source)}\``);
  }
  await writeText(path.join(dirs.chats, "Claude Chat Archive Index.md"), note("Claude Chat Archive Index", lines.join("\n"), {
    layer: "archive",
    importId: importId || "none"
  }));
}

async function writeReceiptAndProofNotes() {
  const receiptRows = await listFiles(path.join(orangeRoot, "receipts"), 80, (name) => name.endsWith(".json") || name.endsWith(".md"));
  const proofRows = await listFiles(path.join(orangeRoot, "proof"), 60, (name) => name.endsWith(".json") || name.endsWith(".png"));
  await writeText(path.join(dirs.receipts, "Receipt Index.md"), note("Receipt Index", `
Receipts are the truth trail. If a feature has no receipt, it is configured or claimed, not proven.

${receiptRows.map((row) => `- \`${row.name}\` - ${row.updatedAt || "unknown"} - ${row.size} bytes`).join("\n") || "- No receipts found yet."}
`, { layer: "proof" }));
  await writeText(path.join(dirs.proof, "Proof Index.md"), note("Proof Index", `
Visual and runtime proof artifacts.

${proofRows.map((row) => `- \`${row.name}\` - ${row.updatedAt || "unknown"} - ${row.size} bytes`).join("\n") || "- No proof artifacts found yet."}
`, { layer: "proof" }));
}

async function writeSourceNotes() {
  await writeText(path.join(dirs.sources, "Hermes Agent Notes.md"), note("Hermes Agent Notes", `
Hermes Agent is relevant as a design reference, not as a replacement for OrangeBOX.

Useful ideas to borrow:

- Bounded memory in the prompt; deep session search underneath.
- Progressive skill disclosure instead of loading every skill.
- MCP filtering so dangerous or noisy tools do not flood the namespace.
- Isolated subagents and sandbox backends for execution.
- Scheduled automations with explicit approval lines.

OrangeBOX adaptation:

- OrangeBOX stays the command cockpit and mission graph.
- Obsidian becomes the human-readable memory vault.
- Codexa remains the execution worker.
- Receipts remain the proof layer.

Sources:

- https://hermes-agent.nousresearch.com/
- https://hermes-agent.nousresearch.com/docs
- https://hermes-agent.nousresearch.com/docs/user-guide/features/memory
- https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
- https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
`, { layer: "source" }));
}

async function writeHome() {
  const body = `
This vault is the OrangeBOX living wiki. Open this folder in Obsidian.

## Start Here

- ${wikilink("Orchestrator Law")}
- ${wikilink("Current Position")}
- ${wikilink("Project Spine")}
- ${wikilink("Memory Primer")}
- ${wikilink("OrangeBOX PageTree Primer")}
- ${wikilink("Claude Chat Archive Index")}
- ${wikilink("Receipt Index")}
- ${wikilink("Proof Index")}

## Hierarchy

OrangeBOX command surface -> project brain packet -> Obsidian memory vault -> skills/MCPs/departments -> receipts/proof.

## Vault Path

\`${normalizeSlash(vaultRoot)}\`
`;
  await writeText(path.join(vaultRoot, "OrangeBOX Wiki.md"), note("OrangeBOX Wiki", body, { layer: "home" }));
  await writeText(path.join(vaultRoot, "OrangeBOX Knowledge.md"), note("OrangeBOX Knowledge", body.replace(/OrangeBOX Wiki/g, "OrangeBOX Knowledge"), { layer: "home" }));
  await writeText(path.join(orangeRoot, "OBSIDIAN_VAULT.md"), [
    "# OrangeBOX Knowledge Obsidian Vault",
    "",
    `Vault path: \`${normalizeSlash(vaultRoot)}\``,
    "",
    "Open this folder in Obsidian. OrangeBOX owns orchestration; Obsidian owns readable memory.",
    "",
    "- `OrangeBOX Knowledge.md` is the home note.",
    "- `00 Command/Orchestrator Law.md` is the load order.",
    "- `03 Claude Chats/` contains sanitized chat archive indexes and full transcript Markdown generated from the Claude export.",
    ""
  ].join("\n"));
}

async function scanForRawSecrets() {
  const patterns = [
    /github_pat_[A-Za-z0-9_]{20,}/,
    /\bghp_[A-Za-z0-9]{20,}/,
    /\bvcp_[A-Za-z0-9]{20,}/,
    /\bvck_[A-Za-z0-9]{20,}/,
    /\bsk-[A-Za-z0-9_-]{20,}/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}/,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/
  ];
  const findings = [];
  async function walk(dir) {
    const rows = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const row of rows) {
      const full = path.join(dir, row.name);
      if (row.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(md|json|txt)$/i.test(row.name)) continue;
      const text = await readText(full, "");
      if (patterns.some((pattern) => pattern.test(text))) {
        findings.push(normalizeSlash(full));
      }
    }
  }
  await walk(vaultRoot);
  return findings;
}

async function main() {
  await setupVaultShell();
  await writeCommandNotes();
  await writeProjectNotes();
  await writeMemoryNotes();
  await writeOrangeboxKnowledgeNotes();
  await writeClaudeChatNotes();
  await writeReceiptAndProofNotes();
  await writeSourceNotes();
  await writeHome();

  const secretFindings = await scanForRawSecrets();
  const manifest = {
    status: secretFindings.length ? "FAILED" : "VERIFIED",
    generatedAt: iso(),
    project: projectKey,
    vaultRoot: normalizeSlash(vaultRoot),
    homeNote: normalizeSlash(path.join(vaultRoot, "OrangeBOX Knowledge.md")),
    appRoot: normalizeSlash(appRoot),
    orangeRoot: normalizeSlash(orangeRoot),
    secretScan: secretFindings.length ? "FAILED_RAW_TOKEN_PATTERN" : "NO_RAW_TOKEN_PATTERNS_FOUND",
    secretFindings,
    sourceHash: crypto.createHash("sha256").update(`${projectKey}:${iso()}:${vaultRoot}`).digest("hex")
  };
  await writeJson(path.join(dirs.system, "obsidian-sync-manifest.json"), manifest);
  await writeJson(path.join(orangeRoot, "receipts", `orangebox-obsidian-vault-sync-${stamp()}.json`), {
    result: manifest.status,
    evidence: manifest,
    blockers: secretFindings.length ? ["Raw token-shaped pattern found in generated vault. Inspect before use."] : [],
    nextAction: "Open the vault folder in Obsidian and use OrangeBOX as the orchestrator above it."
  });

  if (secretFindings.length) {
    console.error(JSON.stringify(manifest, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
