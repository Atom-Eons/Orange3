#!/usr/bin/env node
/*
  frontend-dist-bridge.mjs

  Orangebox Delta serving bridge.

  The canonical React frontend source lives in frontend/ and builds to frontend/dist.
  The legacy Ops command server currently serves /v4/react from apps/web/dist.
  Until that server path is migrated, this bridge copies frontend/dist into apps/web/dist
  after build:web so backend serving and the modern frontend workspace stay aligned.

  This is backend/ops glue, not frontend visual work.
*/

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const source = path.join(root, "frontend", "dist");
const target = path.join(root, "apps", "web", "dist");

async function rmIfExists(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else if (entry.isFile()) {
      await fs.copyFile(from, to);
    }
  }
}

async function main() {
  const receipt = {
    version: "orangebox-frontend-dist-bridge/v1",
    status: "RUNNING",
    ok: false,
    source,
    target,
    started_at: new Date().toISOString(),
    completed_at: null,
    files_copied: 0,
    error: null,
  };

  try {
    if (!fsSync.existsSync(path.join(source, "index.html"))) {
      throw new Error(`frontend/dist/index.html missing. Run npm run build -w @ae-see-suite/web first. Expected: ${path.join(source, "index.html")}`);
    }

    await rmIfExists(target);
    await copyDir(source, target);

    const countFiles = async (dir) => {
      let count = 0;
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) count += await countFiles(full);
        else if (entry.isFile()) count += 1;
      }
      return count;
    };

    receipt.files_copied = await countFiles(target);
    receipt.status = receipt.files_copied > 0 ? "VERIFIED" : "FAILED";
    receipt.ok = receipt.status === "VERIFIED";
  } catch (error) {
    receipt.status = "FAILED";
    receipt.ok = false;
    receipt.error = error.stack || error.message;
  } finally {
    receipt.completed_at = new Date().toISOString();
  }

  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.ok) process.exit(1);
}

await main();
