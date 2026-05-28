#!/usr/bin/env node
/* ============================================================================
   verify-v6-native.mjs — smoke verification of the v6.0 native binary.
   Launches orangebox.exe, polls 127.0.0.1:8787 for sidecar liveness,
   inspects the cockpit status endpoint, then sends SIGTERM (or its Windows
   equivalent) and prints a verdict.
   ============================================================================ */

import fs   from "node:fs";
import os   from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const EXE  = path.join(ROOT, "src-tauri", "target", "release", "orangebox.exe");

if (!fs.existsSync(EXE)) {
  console.error("[verify-v6] FATAL: native exe not found at", EXE);
  process.exit(1);
}
console.log("[verify-v6] launching", EXE);

const child = spawn(EXE, [], { detached: false, stdio: "ignore" });
const pid = child.pid;
console.log("[verify-v6] PID:", pid);

function probe(timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.request({
      host: "127.0.0.1",
      port: 8787,
      path: "/api/v4/cockpit/status",
      method: "GET",
      timeout: timeoutMs,
    }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
    req.on("error",   (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

let verdict = { exeBuilt: true, pid, sidecarUp: false, statusOk: false, status: null, ms: null };
const start = Date.now();
for (let i = 0; i < 30; i++) {
  await sleep(500);
  const r = await probe(800);
  if (r.ok) {
    verdict.sidecarUp = true;
    verdict.statusOk = true;
    try { verdict.status = JSON.parse(r.body); } catch { verdict.status = r.body; }
    verdict.ms = Date.now() - start;
    break;
  }
}

// Kill the process
try {
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], (err) => {
      if (err) console.warn("[verify-v6] taskkill warning:", err.message);
    });
  } else {
    child.kill("SIGTERM");
  }
} catch (e) {
  console.warn("[verify-v6] kill warning:", e.message);
}

// Also kill any orphaned node.exe sidecar on 8787
if (process.platform === "win32") {
  execFile("powershell", ["-NoProfile", "-Command",
    "Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
  ], () => {});
}

console.log("[verify-v6] verdict:", JSON.stringify(verdict, null, 2));
process.exit(verdict.statusOk ? 0 : 1);
