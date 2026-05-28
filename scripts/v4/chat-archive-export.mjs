#!/usr/bin/env node
/* chat-archive-export.mjs - local account-independent chat archive exporter.
 *
 * Exports Codex JSONL sessions into a raw copy, readable Markdown transcript,
 * screenplay Markdown, and manifest under OrangeBox-Data. This is intentionally
 * local-only: no network, no account API, no visual/website work.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const ARCHIVE_ROOT = path.join(DATA_ROOT, "chat-archives");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const VERSION = "orangebox-chat-archive-export/v0";

function flagValue(args, flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function slug(value) {
  return String(value || "chat")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "chat";
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fsSync.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function writeText(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, value, "utf8");
  return file;
}

async function writeJson(file, value) {
  return writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function latestCodexSession() {
  const sessions = path.join(os.homedir(), ".codex", "sessions");
  const candidates = [];
  async function walk(dir, depth = 0) {
    if (depth > 5) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const stat = await fs.stat(full).catch(() => null);
        if (stat) candidates.push({ file: full, mtimeMs: stat.mtimeMs, size: stat.size });
      }
    }
  }
  await walk(sessions);
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.file || null;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => item?.text || item?.content || "")
    .filter(Boolean)
    .join("\n");
}

function compact(text, max = 2200) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n[...truncated ${value.length - max} chars in screenplay; full text is in chat-duplicate.md and raw JSONL...]`;
}

async function parseCodexJsonl(source) {
  const turns = [];
  let meta = {};
  let lineCount = 0;
  let parseErrors = 0;
  const rl = readline.createInterface({
    input: fsSync.createReadStream(source, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    lineCount += 1;
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      parseErrors += 1;
      continue;
    }
    const timestamp = obj.timestamp || "";
    const payload = obj.payload || {};
    if (obj.type === "session_meta") {
      meta = {
        session_id: payload.id,
        started_at: payload.timestamp || timestamp,
        cwd: payload.cwd,
        originator: payload.originator,
        cli_version: payload.cli_version,
        model_provider: payload.model_provider,
      };
      continue;
    }
    if (obj.type === "response_item" && payload.type === "message") {
      const role = payload.role || "message";
      const text = textFromContent(payload.content);
      if (text.trim()) turns.push({ timestamp, kind: "message", role, phase: payload.phase || "", text });
      continue;
    }
    if (obj.type === "event_msg" && payload.type === "user_message") {
      const text = payload.message || "";
      if (text.trim()) turns.push({ timestamp, kind: "event", role: "user", phase: "event", text });
      continue;
    }
    if (obj.type === "event_msg" && payload.type === "agent_message") {
      const text = payload.message || "";
      if (text.trim()) turns.push({ timestamp, kind: "event", role: "assistant", phase: payload.phase || "event", text });
      continue;
    }
    if (obj.type === "response_item" && payload.type === "function_call") {
      turns.push({
        timestamp,
        kind: "tool_call",
        role: "tool",
        phase: "call",
        text: `${payload.name || "tool"} ${payload.arguments || ""}`.trim(),
      });
      continue;
    }
    if (obj.type === "response_item" && payload.type === "function_call_output") {
      turns.push({
        timestamp,
        kind: "tool_output",
        role: "tool",
        phase: "output",
        text: compact(payload.output || "", 1200),
      });
    }
  }
  return { meta, turns, lineCount, parseErrors };
}

function renderTranscript({ meta, turns, source, sourceHash }) {
  const lines = [
    "# Orangebox Chat Duplicate",
    "",
    "This is a local Markdown duplicate generated from a Codex JSONL session file. Raw JSONL is preserved beside this file for forensic replay.",
    "",
    "## Source",
    "",
    `- Source file: \`${source}\``,
    `- Source SHA-256: \`${sourceHash}\``,
    `- Session id: \`${meta.session_id || "unknown"}\``,
    `- Started at: \`${meta.started_at || "unknown"}\``,
    `- Originator: \`${meta.originator || "unknown"}\``,
    `- Working directory: \`${meta.cwd || "unknown"}\``,
    "",
    "## Transcript",
    "",
  ];
  for (const [index, turn] of turns.entries()) {
    lines.push(`### ${index + 1}. ${turn.role.toUpperCase()}${turn.phase ? ` / ${turn.phase}` : ""}`);
    lines.push("");
    lines.push(`Timestamp: \`${turn.timestamp || "unknown"}\``);
    lines.push("");
    lines.push("```text");
    lines.push(turn.text.replace(/```/g, "` ` `"));
    lines.push("```");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderScreenplay({ meta, turns, sourceHash }) {
  const dialogue = turns.filter((turn) => ["user", "assistant"].includes(turn.role));
  const acts = [
    {
      title: "ACT I - The System Wakes",
      filter: (_, i) => i < Math.ceil(dialogue.length * 0.33),
    },
    {
      title: "ACT II - The Machine Gets Its Law",
      filter: (_, i) => i >= Math.ceil(dialogue.length * 0.33) && i < Math.ceil(dialogue.length * 0.72),
    },
    {
      title: "ACT III - The Work Leaves The Account",
      filter: (_, i) => i >= Math.ceil(dialogue.length * 0.72),
    },
  ];
  const lines = [
    "Title: ORANGEBOX OPS",
    "Format: Local Chat Screenplay",
    `Session: ${meta.session_id || "unknown"}`,
    `Source hash: ${sourceHash}`,
    "",
    "FADE IN:",
    "",
    "INT. LOCAL MACHINE - NIGHT",
    "",
    "A long-running AI build system tries to become independent of fragile account memory. The operator demands receipts, not theater.",
    "",
  ];
  for (const act of acts) {
    lines.push(act.title);
    lines.push("");
    for (const [i, turn] of dialogue.entries()) {
      if (!act.filter(turn, i)) continue;
      const character = turn.role === "user" ? "OPERATOR" : "CODEX";
      lines.push(character);
      lines.push(compact(turn.text, 1600));
      lines.push("");
    }
  }
  lines.push("FADE OUT.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const wantsJson = args.includes("--json");
  const wantsReceipt = args.includes("--receipt");
  const source = path.resolve(flagValue(args, "--source", await latestCodexSession() || ""));
  if (!source || !fsSync.existsSync(source)) throw new Error("No source JSONL found. Pass --source <path>.");
  const label = slug(flagValue(args, "--label", path.basename(source, ".jsonl")));
  const archiveDir = path.join(ARCHIVE_ROOT, `${stamp()}-${label}`);
  const rawCopy = path.join(archiveDir, "raw-session.jsonl");
  await fs.mkdir(archiveDir, { recursive: true });
  await fs.copyFile(source, rawCopy);
  const sourceHash = await sha256File(source);
  const { meta, turns, lineCount, parseErrors } = await parseCodexJsonl(source);
  const transcript = renderTranscript({ meta, turns, source, sourceHash });
  const screenplay = renderScreenplay({ meta, turns, sourceHash });
  const transcriptPath = await writeText(path.join(archiveDir, "chat-duplicate.md"), transcript);
  const screenplayPath = await writeText(path.join(archiveDir, "chat-screenplay.md"), screenplay);
  const manifest = {
    ok: true,
    version: VERSION,
    created_at: new Date().toISOString(),
    source,
    source_sha256: sourceHash,
    archive_dir: archiveDir,
    files: {
      raw_session_jsonl: rawCopy,
      chat_duplicate_md: transcriptPath,
      chat_screenplay_md: screenplayPath,
      manifest_json: path.join(archiveDir, "manifest.json"),
    },
    counts: {
      jsonl_lines: lineCount,
      parse_errors: parseErrors,
      exported_turns: turns.length,
      dialogue_turns: turns.filter((turn) => ["user", "assistant"].includes(turn.role)).length,
    },
    honesty: {
      raw_jsonl_preserved: true,
      markdown_duplicate_generated_from_visible_jsonl_payloads: true,
      encrypted_reasoning_not_decoded: true,
      screenplay_is_adaptation_not_verbatim: true,
    },
    portability: {
      account_independent: true,
      location: archiveDir,
      next_build_needed: "Add Claude JSONL and Antigravity DB/PB exporters if full cross-tool screenplay export is required.",
    },
    integrity: {
      transcript_sha256: sha256(transcript),
      screenplay_sha256: sha256(screenplay),
    },
  };
  await writeJson(manifest.files.manifest_json, manifest);
  if (wantsReceipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-chat-archive-${stamp()}.json`);
    manifest.receipt_path = receiptPath;
    await writeJson(receiptPath, manifest);
  }
  if (wantsJson) console.log(JSON.stringify(manifest, null, 2));
  else {
    console.log(`${manifest.ok ? "OK" : "FAIL"} ${VERSION}`);
    console.log(`archive: ${archiveDir}`);
    console.log(`duplicate: ${transcriptPath}`);
    console.log(`screenplay: ${screenplayPath}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
