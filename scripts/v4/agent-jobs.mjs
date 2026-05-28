/* agent-jobs.mjs — v6.1.0 in-process background job table for Agent runs.
   Parallels Codex's task queue but local + receipted. Each job:
     - has an id, goal, workspace, start_ts, state, log[], result, cancel_token
     - runs in the background; foreground UI polls /agent/status
     - emits a `agent-run` receipt at finish (success OR cancel)
     - is cancellable mid-flight via /agent/cancel
*/

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as agent from "./agent-loop.mjs";

const JOBS = new Map();    // id -> job record
const MAX_HISTORY = 100;   // cap retained jobs (LRU)

function newId() { return "agent-" + crypto.randomUUID().slice(0, 8); }

function evictIfFull() {
  if (JOBS.size <= MAX_HISTORY) return;
  // Drop oldest finished
  const sorted = Array.from(JOBS.values())
    .filter(j => j.state !== "running")
    .sort((a, b) => (a.finish_ts || a.start_ts) - (b.finish_ts || b.start_ts));
  for (const j of sorted) {
    if (JOBS.size <= MAX_HISTORY) break;
    JOBS.delete(j.id);
  }
}

/**
 * start({ goal, workspace, anthropicKey, maxSteps, dataRoot, freezeGuard, emitReceipt })
 * Returns { id, state: "running" } immediately. Loop runs in background.
 */
export function start({ goal, workspace, anthropicKey, maxSteps, model, dataRoot, freezeGuard, emitReceipt }) {
  if (!goal || !workspace || !anthropicKey) {
    throw new Error("goal + workspace + anthropicKey required");
  }
  const id = newId();
  const cancelToken = { cancelled: false };
  const job = {
    id,
    goal,
    workspace,
    state: "running",
    start_ts: Date.now(),
    finish_ts: null,
    log: [],
    result: null,
    cancelToken,
    last_step: 0,
    last_tool: null,
  };
  JOBS.set(id, job);
  evictIfFull();

  // Background runner
  job.last_heartbeat = Date.now();
  job.messages = [];

  const heartbeatCheckInterval = setInterval(async () => {
    if (job.state !== "running") {
      clearInterval(heartbeatCheckInterval);
      return;
    }
    const inactiveMs = Date.now() - (job.last_heartbeat || job.start_ts);
    // Stall detection threshold: 11 minutes
    if (inactiveMs > 11 * 60 * 1000) {
      clearInterval(heartbeatCheckInterval);
      job.state = "stalled";
      cancelToken.cancelled = true; // force stop
      
      const resumeDir = path.join(dataRoot || process.env.ORANGEBOX_DATA_ROOT || "OrangeBox-Data", "receipts", "agent-resume");
      await fs.mkdir(resumeDir, { recursive: true }).catch(() => {});
      const resumeFile = path.join(resumeDir, `${id}-resume.json`);
      const resumeTicket = {
        mcp_version: "0.2",
        resume_ticket_id: `tkt_${id}`,
        job_id: id,
        goal,
        workspace,
        last_step: job.last_step,
        last_tool: job.last_tool,
        stalled_at: new Date().toISOString(),
        inactive_duration_ms: inactiveMs,
        messages_snapshot: job.messages,
      };
      await fs.writeFile(resumeFile, JSON.stringify(resumeTicket, null, 2), "utf8").catch(() => {});

      if (emitReceipt) {
        await emitReceipt({
          source:   "agent-run",
          title:    `Agent stalled: ${String(goal).slice(0, 60)}`,
          summary:  `Agent loop stalled at step ${job.last_step} after ${Math.round(inactiveMs / 1000)}s of inactivity. Resume ticket created.`,
          evidence: {
            job_id: id,
            state: "stalled",
            last_step: job.last_step,
            last_tool: job.last_tool,
            resume_ticket_id: `tkt_${id}`,
            resume_file: resumeFile,
          },
        });
      }
    }
  }, 15000);

  (async () => {
    try {
      const result = await agent.run({
        goal, workspace, anthropicKey, maxSteps, model, dataRoot, freezeGuard,
        cancelToken,
        onEvent(ev) {
          job.last_heartbeat = Date.now(); // update heartbeat
          job.log.push({ ts: Date.now(), ...ev });
          if (job.log.length > 500) job.log.splice(0, job.log.length - 500);
          if (typeof ev.step === "number") job.last_step = ev.step;
          if (ev.kind === "tool_call") job.last_tool = ev.tool;
          if (ev.kind === "model_reply" && ev.messages) job.messages = ev.messages;
        },
      });
      clearInterval(heartbeatCheckInterval);
      job.result = result;
      job.state  = cancelToken.cancelled ? (job.state === "stalled" ? "stalled" : "cancelled") : (result.ok ? "finished" : "failed");
      job.finish_ts = Date.now();

      if (emitReceipt) {
        await emitReceipt({
          source:   "agent-run",
          title:    `Agent ${job.state}: ${String(goal).slice(0, 60)}`,
          summary:  `${result.step_count || 0} steps · ${result.totalInTokens || 0} in / ${result.totalOutTokens || 0} out tokens`,
          evidence: {
            job_id:        id,
            state:         job.state,
            step_count:    result.step_count,
            in_tokens:     result.totalInTokens,
            out_tokens:    result.totalOutTokens,
            final_summary: result.finalSummary || result.error || null,
            goal_excerpt:  String(goal).slice(0, 200),
            workspace,
            tool_calls:    (result.steps || []).map(s => ({ step: s.step, tool: s.tool, ok: s.result?.ok })),
          },
        });
      }
    } catch (e) {
      clearInterval(heartbeatCheckInterval);
      job.state = "error";
      job.finish_ts = Date.now();
      job.result = { ok: false, error: e.message };
      if (emitReceipt) {
        await emitReceipt({
          source:   "agent-run",
          title:    `Agent error: ${String(goal).slice(0, 60)}`,
          summary:  e.message,
          evidence: { job_id: id, error: e.message, goal_excerpt: String(goal).slice(0, 200) },
        });
      }
    }
  })();

  return { id, state: "running" };
}

export function status(id) {
  const j = JOBS.get(id);
  if (!j) return null;
  return {
    id:         j.id,
    goal:       j.goal,
    workspace:  j.workspace,
    state:      j.state,
    start_ts:   j.start_ts,
    finish_ts:  j.finish_ts,
    last_step:  j.last_step,
    last_tool:  j.last_tool,
    log_count:  j.log.length,
    result:     j.result,
    log_tail:   j.log.slice(-30),
  };
}

export function cancel(id) {
  const j = JOBS.get(id);
  if (!j) return { ok: false, error: "no such job" };
  if (j.state !== "running") return { ok: false, error: `job is ${j.state}` };
  j.cancelToken.cancelled = true;
  return { ok: true, id };
}

export function cancelAll(reason = "operator") {
  const cancelled = [];
  for (const j of JOBS.values()) {
    if (j.state !== "running") continue;
    j.cancelToken.cancelled = true;
    j.log.push({ ts: Date.now(), kind: "cancel", reason });
    cancelled.push(j.id);
  }
  return { ok: true, cancelled_count: cancelled.length, cancelled };
}

export function list({ limit = 20 } = {}) {
  const items = Array.from(JOBS.values())
    .sort((a, b) => b.start_ts - a.start_ts)
    .slice(0, limit)
    .map(j => ({
      id:        j.id,
      goal:      String(j.goal).slice(0, 120),
      state:     j.state,
      start_ts:  j.start_ts,
      finish_ts: j.finish_ts,
      last_step: j.last_step,
      last_tool: j.last_tool,
    }));
  return { items, total_in_memory: JOBS.size };
}
