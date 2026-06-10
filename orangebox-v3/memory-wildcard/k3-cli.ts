import fs from "node:fs";
import { isMain, printResult } from "../lib/core.ts";
import { openK3Db, seedConcepts } from "./k3-card-writer.ts";
import { k3Doctor } from "./k3-doctor.ts";
import { indexColdTruth } from "./k3-index-coldtruth.ts";
import { indexPrimers } from "./k3-index-primers.ts";
import { indexReceipts } from "./k3-index-receipts.ts";
import { alphaMatch } from "./k3-alpha-matcher.ts";
import { runK3Benchmark } from "./k3-benchmark.ts";
import { writeK3Receipt } from "./k3-receipt.ts";
import { k3DbPath } from "./k3-paths.ts";

async function init() {
  await openK3Db();
  const cold = await indexColdTruth();
  const receipt = await writeK3Receipt("init", { ok: true, status: "K3_INIT_COMPLETE", cold });
  return { ok: true, status: "K3_INIT_COMPLETE", cold, receipt_path: receipt.receipt_path };
}

async function index(scope: string, args: string[]) {
  const limitArg = args.findIndex((x) => x === "--limit");
  const limit = limitArg >= 0 ? Number(args[limitArg + 1] || "250") : 250;
  const cold = await indexColdTruth();
  let result: any;
  if (scope === "receipts") result = await indexReceipts(limit);
  else if (scope === "primers") result = await indexPrimers(limit);
  else if (scope === "coldtruth") result = cold;
  else if (scope === "chat") result = {
    ok: true,
    status: "K3_CHAT_INDEX_DISABLED_IN_W1",
    indexed: 0,
    chat_archive_indexing_performed: false,
    reason: "Chat archives are explicitly disabled until receipts/primers/coldtruth pass recall benchmark.",
  };
  else result = { ok: false, status: "K3_UNKNOWN_INDEX_SCOPE", scope };
  const receipt = await writeK3Receipt(`index-${scope}`, { ...result, coldtruth_seed: cold });
  return { ...result, coldtruth_seed: cold, receipt_path: receipt.receipt_path };
}

async function query(q: string) {
  if (!q.trim()) return { ok: false, status: "K3_QUERY_REQUIRED", usage: "bun ./orangebox-v3/memory-wildcard/k3-cli.ts query \"heavy memory compiler\"" };
  const result = await alphaMatch(q, 10);
  const receipt = await writeK3Receipt("query", result);
  return { ...result, receipt_path: receipt.receipt_path };
}

async function reset(args: string[]) {
  if (!args.includes("--confirm")) return { ok: false, status: "K3_RESET_REQUIRES_CONFIRM" };
  if (fs.existsSync(k3DbPath)) fs.unlinkSync(k3DbPath);
  const receipt = await writeK3Receipt("reset-index", { ok: true, status: "K3_INDEX_RESET", db_path: k3DbPath });
  return { ok: true, status: "K3_INDEX_RESET", receipt_path: receipt.receipt_path };
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "doctor";
  let out: unknown;
  if (cmd === "init") out = await init();
  else if (cmd === "doctor") {
    const result = await k3Doctor();
    const receipt = await writeK3Receipt("doctor", result);
    out = { ...result, receipt_path: receipt.receipt_path };
  } else if (cmd === "index") out = await index(args[1] || "receipts", args.slice(2));
  else if (cmd === "query") out = await query(args.slice(1).join(" "));
  else if (cmd === "explain") out = await query(args.slice(1).join(" "));
  else if (cmd === "bench") {
    await indexColdTruth();
    const result = await runK3Benchmark();
    const receipt = await writeK3Receipt("benchmark", result);
    out = { ...result, receipt_path: receipt.receipt_path };
  } else if (cmd === "receipt") out = await writeK3Receipt("manual", { ok: true, status: "K3_RECEIPT_WRITTEN" });
  else if (cmd === "reset-index") out = await reset(args.slice(1));
  else out = {
    ok: false,
    status: "K3_UNKNOWN_COMMAND",
    usage: ["init", "doctor", "index receipts", "index primers", "index coldtruth", "index chat --limit 100", "query <text>", "bench", "reset-index --confirm"],
    seed_concepts: seedConcepts().map((item) => item.title),
  };
  printResult(out, true);
  if ((out as any)?.ok === false) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "K3_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
