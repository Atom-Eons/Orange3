import { isMain, run, writeReceipt } from "../lib/core.ts";

export async function gpuBudgetDoctor() {
  const nvidia = await run("nvidia-smi", ["--query-gpu=name,memory.total,memory.used,memory.free", "--format=csv,noheader"], { timeoutMs: 10_000 });
  const report = {
    ok: true,
    status: "GPU_CONCURRENCY_DISCIPLINE_READY",
    mode: "serial|guarded|multiplexed",
    current_default: "serial",
    nvidia_smi_available: nvidia.ok,
    gpu_inventory: nvidia.stdout || nvidia.stderr,
    rules: [
      "qwen3:4b can stay warm",
      "only one heavy reasoner by default",
      "vision critic cannot collide with heavy verifier unless budget allows",
      "idle forge pauses during active generation",
      "STRONGARM can preempt lower-priority lanes",
    ],
  };
  const receipt = await writeReceipt("gpu-budget-doctor", report);
  return { ...report, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  gpuBudgetDoctor().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "GPU_BUDGET_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
