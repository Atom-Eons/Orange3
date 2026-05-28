#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachAtomSmasherRoutes } from "./atomsmasher-api-routes.mjs";

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const receipt = args.has("--receipt");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function send(res, code, body, type = "application/json") {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2);
  res.writeHead(code, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
  res.end(payload);
}

async function readBody(req, max = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error("request body too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function request(base, method, pathname, body = null) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { ok: response.ok, status: response.status, method, pathname, body: parsed };
}

async function main() {
  const handler = attachAtomSmasherRoutes({
    appRoot: ROOT,
    getDataRoot: () => DATA_ROOT,
    send,
    readBody,
  });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/atomsmasher")) return handler(req, res, url);
    return send(res, 404, { ok: false, error: "not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const checks = [];
  try {
    checks.push(await request(base, "POST", "/api/atomsmasher/init"));
    checks.push(await request(base, "GET", "/api/atomsmasher/proof"));
    checks.push(await request(base, "POST", "/api/atomsmasher/sources/ingest-text", {
      title: "Orangebox AtomSmasher API smoke",
      text: "orders: AtomSmasher API smoke must preserve HOT_ALWAYS orders. Numbers: 10 20 30 40.",
    }));
    checks.push(await request(base, "POST", "/api/atomsmasher/compile", {
      query: "continue AtomSmasher API smoke without losing orders",
    }));
    checks.push(await request(base, "POST", "/api/atomsmasher/equations/fit", {
      name: "api_linear",
      values: [10, 20, 30, 40],
    }));
    checks.push(await request(base, "GET", "/api/atomsmasher/receipts?limit=5"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  const gates = [
    { id: "init_endpoint", ok: checks[0]?.ok && checks[0]?.body?.schema_version === 10 },
    { id: "proof_endpoint", ok: checks[1]?.ok && checks[1]?.body?.registry_live === true },
    { id: "ingest_text_endpoint", ok: checks[2]?.ok && Boolean(checks[2]?.body?.source_id) },
    { id: "compile_endpoint", ok: checks[3]?.ok && Boolean(checks[3]?.body?.route?.saved_work) },
    { id: "equation_fit_endpoint", ok: checks[4]?.ok && checks[4]?.body?.equation_type === "linear" },
    { id: "receipts_endpoint", ok: checks[5]?.ok && Array.isArray(checks[5]?.body) },
  ];
  const result = {
    ok: gates.every((gate) => gate.ok),
    version: "orangebox-atomsmasher-api-smoke/v0",
    checked_at: new Date().toISOString(),
    status: gates.every((gate) => gate.ok) ? "ATOMSMASHER_API_SMOKE_GREEN" : "ATOMSMASHER_API_SMOKE_NOT_GREEN",
    gates,
    endpoints_checked: checks.map((check) => ({ method: check.method, pathname: check.pathname, status: check.status, ok: check.ok })),
  };
  if (receipt) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-atomsmasher-api-smoke-${stamp()}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }
  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  const result = { ok: false, version: "orangebox-atomsmasher-api-smoke/v0", error: error?.message || String(error) };
  console.log(wantsJson ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  process.exitCode = 1;
});
