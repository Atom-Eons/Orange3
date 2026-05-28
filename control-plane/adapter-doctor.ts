#!/usr/bin/env bun

import fs from "node:fs/promises";
import path from "node:path";
import { runAdapterDoctor } from "./adapters.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

function stamp(date = new Date()) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

async function main() {
  const writeReceipt = Bun.argv.includes("--receipt");
  const result = await runAdapterDoctor();
  if (writeReceipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-control-plane-adapter-doctor-${stamp()}.json`);
    await fs.writeFile(receiptPath, `${JSON.stringify({ ...result, receipt_path: receiptPath }, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...result, receipt_path: receiptPath }, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
