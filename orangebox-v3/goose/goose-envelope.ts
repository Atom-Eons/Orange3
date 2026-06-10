import { argValue, isMain, writeReceipt } from "../lib/core.ts";

export async function gooseEnvelope(args = process.argv.slice(2)) {
  const envelope = {
    ok: true,
    status: "GOOSE_EXECUTOR_ENVELOPE_READY",
    executor: "goose",
    feature_flag: "ORANGEBOX_GOOSE_EXECUTOR=0|1",
    ghost_id: argValue(args, "--ghost-id", ""),
    allowed_paths: args.filter((item, i) => args[i - 1] === "--allow-path"),
    denied_paths: [".git", "node_modules", ".env", ".env.local", "secrets", ...args.filter((item, i) => args[i - 1] === "--deny-path")],
    commands_allowed: args.filter((item, i) => args[i - 1] === "--allow-command"),
    commands_denied: ["git reset --hard", "git checkout --", "Remove-Item -Recurse", "rm -rf", ...args.filter((item, i) => args[i - 1] === "--deny-command")],
    timeout_ms: Number(argValue(args, "--timeout-ms", "120000")),
    receipt_required: true,
    strategy_authority: "TriLane only",
    direct_main_write_allowed: false,
  };
  const receipt = await writeReceipt("goose-envelope", envelope);
  return { ...envelope, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  gooseEnvelope().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "GOOSE_ENVELOPE_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
