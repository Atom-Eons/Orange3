import { argValue, isMain, sha256, stamp, writeReceipt } from "../lib/core.ts";

export async function predictNextAction(args = process.argv.slice(2)) {
  const envelope = {
    ok: true,
    status: "PREDICTIVE_FORGE_ENVELOPE_READY",
    feature_flag: "ORANGEBOX_IDLE_FORGE=0|1",
    max_predictions: Number(argValue(args, "--max", "1")),
    base_head_sha: argValue(args, "--head", ""),
    active_file: argValue(args, "--active-file", ""),
    active_selection: argValue(args, "--active-selection", ""),
    ast_hash: argValue(args, "--ast-hash", ""),
    chat_hash: sha256(argValue(args, "--chat", "")),
    task_guess: argValue(args, "--guess", "no prediction without active context"),
    invalidation_rules: ["HEAD mismatch", "AST mismatch", "user input conflict", "file save conflict", "failed proof"],
    priority: "lowest",
    created_at: new Date().toISOString(),
    envelope_id: `forge_${stamp().toLowerCase()}`,
  };
  const receipt = await writeReceipt("predictive-forge-envelope", envelope);
  return { ...envelope, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  predictNextAction().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "PREDICTIVE_FORGE_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
