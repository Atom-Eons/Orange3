import path from "node:path";
import { argValue, dataRoot, isMain, safeId, sha256, stamp, writeJson, writeReceipt } from "../lib/core.ts";

const root = path.join(dataRoot, "v3", "chronos");

export async function recordChronosIteration(args = process.argv.slice(2)) {
  const sessionId = argValue(args, "--session-id", `chronos_${stamp().toLowerCase()}`);
  const iteration = {
    iteration_id: `iter_${stamp().toLowerCase()}_${sha256(args.join("|")).slice(0, 8)}`,
    session_id: sessionId,
    chat_id: argValue(args, "--chat-id", ""),
    task_id: argValue(args, "--task-id", ""),
    ghost_id: argValue(args, "--ghost-id", ""),
    head_sha: argValue(args, "--head", ""),
    patch_hash: argValue(args, "--patch-hash", ""),
    screenshot_path: argValue(args, "--screenshot", ""),
    annotated_screenshot_path: argValue(args, "--annotated", ""),
    target_crop_path: argValue(args, "--crop", ""),
    motion_trace_path: argValue(args, "--motion", ""),
    a11y_snapshot_path: argValue(args, "--a11y", ""),
    r3f_scene_path: argValue(args, "--r3f", ""),
    cssom_json: argValue(args, "--cssom", ""),
    source_targets_json: args.filter((item, i) => args[i - 1] === "--target"),
    model_lane: argValue(args, "--model-lane", ""),
    critique_summary: argValue(args, "--critique", ""),
    proof_status: argValue(args, "--proof-status", "unknown"),
    green_score: Number(argValue(args, "--green-score", "0")),
    created_at: new Date().toISOString(),
  };
  const file = path.join(root, safeId(sessionId), `${iteration.iteration_id}.json`);
  await writeJson(file, iteration);
  await writeJson(path.join(root, "latest-iteration.json"), iteration);
  const receipt = await writeReceipt("chronos-iteration", { ok: true, status: "CHRONOS_ITERATION_RECORDED", iteration, iteration_path: file });
  return { ok: true, status: "CHRONOS_ITERATION_RECORDED", iteration, iteration_path: file, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  recordChronosIteration().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "CHRONOS_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
