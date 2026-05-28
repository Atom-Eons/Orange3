#!/usr/bin/env bun

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const BASE_URL = (Bun.env.LLAMA_CPP_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const MODEL_ALIAS = Bun.env.ORANGEBOX_LLAMA_LISTENER_ALIAS || "orangebox-n150-cpu-listener";

function stamp(date = new Date()) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 30000) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - started),
      json,
      body: json ? null : text.slice(0, 1200),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - started),
      json: null,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const [health, models] = await Promise.all([
    fetchJson(`${BASE_URL}/health`, {}, 8000),
    fetchJson(`${BASE_URL}/v1/models`, {}, 10000),
  ]);
  const generation = health.ok && models.ok
    ? await fetchJson(`${BASE_URL}/v1/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL_ALIAS,
        prompt: "Orangebox local listener smoke token:",
        max_tokens: 8,
        temperature: 0,
      }),
    }, 45000)
    : null;

  const text = String(generation?.json?.choices?.[0]?.text || "");
  const timings = generation?.json?.timings || {};
  const usage = generation?.json?.usage || {};
  const checks = [
    { name: "listener health reachable", ok: health.ok, detail: { status: health.status, ms: health.ms } },
    { name: "listener model list reachable", ok: models.ok, detail: { status: models.status, ms: models.ms } },
    { name: "local generation returned completion text", ok: Boolean(generation?.ok && text.length > 0), detail: { status: generation?.status || 0, ms: generation?.ms || 0, text: text.slice(0, 120) } },
    { name: "generation returned token accounting", ok: Number(usage.total_tokens || 0) > 0 || Number(timings.predicted_n || 0) > 0, detail: { usage, timings } },
  ];
  const ok = checks.every((check) => check.ok);
  const result = {
    ok,
    version: "orangebox-local-llama-generation-smoke/v0.1",
    project: "ORANGEBOX",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    endpoint: BASE_URL,
    model_alias: MODEL_ALIAS,
    checks,
    generation: generation ? {
      status: generation.status,
      ms: generation.ms,
      model: generation.json?.model || null,
      text_preview: text.slice(0, 200),
      usage,
      timings,
    } : null,
    safety: {
      paid_api_call: false,
      local_cpu_listener: true,
      gpu_required: false,
      repository_mutation: false,
      prompt_contains_secret: false,
    },
    rollback: {
      repo_mutation: "control-plane v0.4 source files and package scripts only",
      runtime_mutation: "one local llama.cpp completion request plus optional JSON receipt",
      recovery_action: "Delete the generated receipt if superseded; stop the listener with npm.cmd run llama:stop if the operator wants it offline.",
    },
  };
  if (Bun.argv.includes("--receipt")) {
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-local-llama-generation-smoke-${stamp()}.json`);
    const withReceipt = { ...result, receipt_path: receiptPath };
    await writeJson(receiptPath, withReceipt);
    console.log(JSON.stringify(withReceipt, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
