#!/usr/bin/env bun

import fs from "node:fs/promises";
import path from "node:path";
import { probeControlPlaneTopology } from "./topology.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

function stamp(date = new Date()) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

async function main() {
  const result = await probeControlPlaneTopology({ probeModels: !Bun.argv.includes("--no-model-probe") });
  if (Bun.argv.includes("--receipt")) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-control-plane-topology-doctor-${stamp()}.json`);
    const withReceipt = { ...result, receipt_path: receiptPath };
    await fs.writeFile(receiptPath, `${JSON.stringify(withReceipt, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(withReceipt, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
