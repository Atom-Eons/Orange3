/* pipeline-observatory.mjs - inspect Silent Canvas pipeline runs. */

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import * as silentCanvas from "./silent-canvas.mjs";

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
    path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}

function receiptsDir(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "receipts", "v4");
}

async function loadReceipts({ dataRoot = defaultDataRoot(), run_id = null, limit = 40 } = {}) {
  const dir = receiptsDir(dataRoot);
  if (!fssync.existsSync(dir)) return [];
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort().reverse();
  const receipts = [];
  for (const file of files) {
    if (receipts.length >= limit) break;
    try {
      const doc = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
      const source = String(doc.source || "");
      const isPipeline = source.startsWith("silent-canvas") || source.startsWith("relevance-projection");
      if (!isPipeline) continue;
      if (run_id && doc.evidence?.run_id !== run_id) continue;
      receipts.push({
        id: doc.id || file.replace(/\.json$/, ""),
        source: doc.source,
        title: doc.title,
        summary: doc.summary,
        ts: doc.ts,
        evidence: doc.evidence || null,
      });
    } catch {
      // Skip corrupt receipts in the observatory; the receipts lane can inspect them separately.
    }
  }
  return receipts;
}

function stageStatus(events, receipts, keys) {
  const hasEvent = events.some((event) => keys.events.includes(event.phase));
  const hasReceipt = receipts.some((receipt) => keys.sources.includes(receipt.source));
  if (hasEvent || hasReceipt) return "observed";
  return "waiting";
}

function buildStages(status, receipts) {
  const events = status?.events_tail || [];
  return [
    {
      key: "relevance",
      label: "Relevance projection",
      status: stageStatus(events, receipts, { events: ["relevance_projection", "relevance_projection_expanded"], sources: ["relevance-projection", "relevance-projection-expansion"] }),
    },
    {
      key: "prompt_bundle",
      label: "Prompt bundle",
      status: stageStatus(events, receipts, { events: [], sources: ["silent-canvas-prompt-version"] }),
    },
    {
      key: "creative_brain",
      label: "Creative Brain",
      status: stageStatus(events, receipts, { events: ["creative_brain_start", "creative_brain_done", "creative_brain_context_retry_done"], sources: [] }),
    },
    {
      key: "fast_interpreter",
      label: "Fast Interpreter / HSMP",
      status: stageStatus(events, receipts, { events: ["fast_interpreter_start", "fast_interpreter_done", "fast_interpreter_context_retry_done"], sources: ["silent-canvas-parse-error"] }),
    },
    {
      key: "apply_diff",
      label: "Apply diff",
      status: stageStatus(events, receipts, { events: ["state_mutation", "milestone_done"], sources: ["silent-canvas-milestone"] }),
    },
    {
      key: "summary",
      label: "Summary receipt",
      status: stageStatus(events, receipts, { events: ["summary", "done"], sources: ["silent-canvas-summary", "silent-canvas-run"] }),
    },
  ];
}

function latestRunId() {
  return silentCanvas.list({ limit: 1 }).items?.[0]?.id || null;
}

export async function observe({ dataRoot = defaultDataRoot(), run_id = null, limit = 40 } = {}) {
  const selectedRunId = run_id || latestRunId();
  const status = selectedRunId ? silentCanvas.status(selectedRunId) : null;
  const replay = selectedRunId ? silentCanvas.replayEvents(selectedRunId) : null;
  const receipts = await loadReceipts({ dataRoot, run_id: selectedRunId, limit });
  const latestRunReceipt = receipts.find((receipt) => receipt.source === "silent-canvas-run");
  return {
    ok: true,
    selected_run_id: selectedRunId,
    run: status,
    events: replay?.events || [],
    event_count: replay?.events?.length || 0,
    stages: buildStages(status, receipts),
    receipts,
    latest_run_receipt: latestRunReceipt || null,
    runs: silentCanvas.list({ limit: 8 }).items,
  };
}
