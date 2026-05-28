/* composer.mjs — v6.0.7 multi-file diff plan + apply (Cursor-Composer equivalent)
   Architecture:
     plan(prompt, files[])     → returns proposed { file, before, after, diff_text } per file
     apply(plan, accept_ids[]) → writes accepted hunks, emits receipt, returns saved files

   The LLM call is NOT performed here — callers POST to /api/v4/model/call or
   /api/v4/model/stream with the composer's prompt scaffolding. This module
   is the orchestration + diff + receipts layer. */
import fs   from "node:fs";
import fsp  from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function sha256OfString(s) {
  return crypto.createHash("sha256").update(String(s ?? ""), "utf8").digest("hex");
}

function safeRead(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

function makeUnifiedDiff(before, after, filename) {
  // Minimal unified-diff producer: keep it readable, not git-perfect.
  const aLines = (before || "").split(/\r?\n/);
  const bLines = (after  || "").split(/\r?\n/);
  const out = [];
  out.push(`--- a/${filename}`);
  out.push(`+++ b/${filename}`);
  // Cheap line-by-line diff (no proper LCS; chunked into single hunk).
  const maxLen = Math.max(aLines.length, bLines.length);
  const changeRanges = [];
  let i = 0;
  while (i < maxLen) {
    if (aLines[i] === bLines[i]) { i++; continue; }
    const start = i;
    while (i < maxLen && aLines[i] !== bLines[i]) i++;
    changeRanges.push([start, i]);
  }
  if (changeRanges.length === 0) return "";
  for (const [s, e] of changeRanges) {
    const ctx = 2;
    const cs = Math.max(0, s - ctx);
    const ce = Math.min(maxLen, e + ctx);
    const aLen = Math.min(aLines.length, ce) - cs;
    const bLen = Math.min(bLines.length, ce) - cs;
    out.push(`@@ -${cs + 1},${aLen} +${cs + 1},${bLen} @@`);
    for (let k = cs; k < ce; k++) {
      if (k < aLines.length && k < bLines.length && aLines[k] === bLines[k]) {
        out.push(" " + aLines[k]);
      } else {
        if (k < aLines.length) out.push("-" + aLines[k]);
        if (k < bLines.length) out.push("+" + bLines[k]);
      }
    }
  }
  return out.join("\n");
}

/**
 * planScaffold({ prompt, files })
 * Returns the prompt + per-file before-content the caller hands to the LLM.
 * The LLM is expected to return JSON: { changes: [{file, after}] }
 */
export function planScaffold({ prompt, files }) {
  if (!prompt) throw new Error("planScaffold: prompt required");
  if (!Array.isArray(files) || !files.length) throw new Error("planScaffold: files (array) required");
  const fileBlocks = [];
  for (const f of files) {
    const content = safeRead(f);
    if (content === null) continue;
    fileBlocks.push(`<<<FILE ${f}>>>\n${content}\n<<<END FILE>>>`);
  }
  const llmPrompt = [
    "You are the OrangeBox Composer. You receive a multi-file edit request",
    "and the current contents of each file. Return ONLY a JSON object of",
    "the form:",
    "",
    "  { \"changes\": [ { \"file\": \"<absolute path>\", \"after\": \"<full new content>\" } ] }",
    "",
    "Rules:",
    "- Output ONLY valid JSON, no prose.",
    "- Return ONLY files you changed. Don't return unchanged files.",
    "- 'after' is the COMPLETE new file content (not a patch).",
    "- Apply Karpathy rule 3: surgical changes only. Don't touch adjacent lines.",
    "",
    `REQUEST: ${prompt}`,
    "",
    "FILES:",
    fileBlocks.join("\n\n"),
  ].join("\n");
  return { llm_prompt: llmPrompt, file_count: fileBlocks.length };
}

/**
 * buildPlanFromLlmResponse({ files, llm_json })
 * Given the LLM's parsed JSON, build a structured plan with per-file diffs.
 */
export function buildPlanFromLlmResponse({ llm_json }) {
  if (!llm_json || !Array.isArray(llm_json.changes)) {
    return { ok: false, error: "llm_json.changes (array) required" };
  }
  const proposed = [];
  for (const change of llm_json.changes) {
    if (!change.file || typeof change.after !== "string") continue;
    const before = safeRead(change.file);
    if (before === null) {
      proposed.push({
        id:     `new_${proposed.length}`,
        file:   change.file,
        kind:   "create",
        before: null,
        after:  change.after,
        diff_text: `--- /dev/null\n+++ b/${change.file}\n` + change.after.split(/\r?\n/).map(l => "+" + l).join("\n"),
      });
      continue;
    }
    if (before === change.after) continue; // no change
    proposed.push({
      id:        `change_${proposed.length}`,
      file:      change.file,
      kind:      "modify",
      before,
      after:     change.after,
      diff_text: makeUnifiedDiff(before, change.after, path.basename(change.file)),
    });
  }
  return { ok: true, plan_id: `plan_${Date.now()}`, proposed, file_count: proposed.length };
}

/**
 * apply({ plan, accept_ids })
 * Applies accepted changes from a built plan. Returns per-file result + diffs.
 */
export async function apply({ plan, accept_ids = null }) {
  if (!plan || !Array.isArray(plan.proposed)) return { ok: false, error: "plan.proposed required" };
  const acceptSet = accept_ids ? new Set(accept_ids) : null;
  const results = [];
  for (const change of plan.proposed) {
    if (acceptSet && !acceptSet.has(change.id)) {
      results.push({ id: change.id, file: change.file, applied: false, reason: "not in accept_ids" });
      continue;
    }
    try {
      // Capture before-hash for audit chain
      const before = change.before ?? safeRead(change.file) ?? "";
      await fsp.mkdir(path.dirname(change.file), { recursive: true });
      await fsp.writeFile(change.file, change.after);
      const beforeHash = sha256OfString(before);
      const afterHash  = sha256OfString(change.after);
      results.push({
        id:        change.id,
        file:      change.file,
        applied:   true,
        kind:      change.kind || "modify",
        bytes:     Buffer.byteLength(change.after, "utf8"),
        sha256_before: beforeHash,
        sha256_after:  afterHash,
        chain:     `${beforeHash.slice(0, 12)} → ${afterHash.slice(0, 12)}`,
      });
    } catch (e) {
      results.push({ id: change.id, file: change.file, applied: false, error: e.message });
    }
  }
  return {
    ok: true,
    results,
    applied_count: results.filter(r => r.applied).length,
    chain_summary: results.filter(r => r.applied).map(r => ({ file: r.file, chain: r.chain })),
  };
}
