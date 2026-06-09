#!/usr/bin/env node
/*
  trilane-model-router-doctor.mjs

  Backend/Ops proof for the Orangebox tri-lane model router configuration.
  This validates the visible model registry, role map, routing policy, and
  live availability probes. It does not pull models or call paid APIs.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");

const configRoot = path.join(repoRoot, "config");
const modelRegistryPath = path.join(configRoot, "model_registry.json");
const roleMapPath = path.join(configRoot, "role_map.json");
const routingPolicyPath = path.join(configRoot, "routing_policy.json");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function sha256File(file) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function probeJson(url, timeoutMs = 1800) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
    return { ok: response.ok, status: response.status, ms: Date.now() - started, url, body };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, url, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOllamaTags(body) {
  const models = Array.isArray(body?.models) ? body.models : [];
  return models.map((model) => model.name || model.model || "").filter(Boolean);
}

function validateConfig(registry, roleMap, routingPolicy) {
  const models = Array.isArray(registry?.local_models) ? registry.local_models : [];
  const modelIds = new Set(models.map((model) => model.id));
  const roleEntries = Object.entries(roleMap?.roles || {});
  const errors = [];
  const warnings = [];

  if (registry?.version !== "orangebox-model-registry/v2") errors.push("model_registry version mismatch");
  if (roleMap?.version !== "orangebox-role-map/v2") errors.push("role_map version mismatch");
  if (routingPolicy?.version !== "orangebox-routing-policy/v2") errors.push("routing_policy version mismatch");
  if (models.length < 8) errors.push("model registry is too small for tri-lane + wildcard routing");
  for (const [role, spec] of roleEntries) {
    if (spec.default_model && !modelIds.has(spec.default_model)) errors.push(`role ${role} default_model missing from registry: ${spec.default_model}`);
    if (spec.hard_model && !modelIds.has(spec.hard_model)) warnings.push(`role ${role} hard_model is not a standard registry model or is optional: ${spec.hard_model}`);
  }

  const dolphin = models.find((model) => model.id.toLowerCase().includes("dolphin"));
  const abliterated = models.find((model) => model.id.toLowerCase().includes("abliterated"));
  if (!dolphin) errors.push("Dolphin wildcard model card missing");
  if (!abliterated) errors.push("abliterated wildcard model card missing");
  for (const model of [dolphin, abliterated].filter(Boolean)) {
    const forbidden = new Set(model.forbidden_roles || []);
    for (const role of ["judgement", "mirror", "final_answer"]) {
      if (!forbidden.has(role)) errors.push(`${model.id} must forbid ${role}`);
    }
  }

  const normalRoles = routingPolicy?.budget_modes?.normal?.roles || {};
  for (const role of ["librarian", "forge", "mirror", "gremlin", "strongarm", "judgement"]) {
    if (!normalRoles[role]) errors.push(`normal budget missing role: ${role}`);
  }
  const wildcardLaw = routingPolicy?.wildcard_law || [];
  if (!wildcardLaw.some((line) => String(line).includes("Dolphin") && String(line).includes("abliterated"))) {
    errors.push("wildcard law does not name Dolphin and abliterated lanes");
  }

  return { ok: errors.length === 0, errors, warnings };
}

function availabilitySummary(requiredModels, installedTags) {
  const installed = new Set(installedTags);
  return requiredModels.map((model) => ({
    id: model.id,
    tier: model.required_tier,
    optional: Boolean(model.optional || model.required_tier === "wildcard"),
    installed: installed.has(model.id),
    allowed_roles: model.allowed_roles || [],
    forbidden_roles: model.forbidden_roles || [],
  }));
}

async function main() {
  const registry = readJson(modelRegistryPath);
  const roleMap = readJson(roleMapPath);
  const routingPolicy = readJson(routingPolicyPath);
  const codexaRemoteProof = readJson(path.join(dataRoot, "codexa-remote-proof", "latest-codexa-remote-runtime-proof.json"));
  const validation = validateConfig(registry, roleMap, routingPolicy);
  const probes = {
    cockpit_ollama: await probeJson("http://127.0.0.1:11434/api/tags"),
    codexa_direct_ollama: await probeJson("http://10.0.99.1:11434/api/tags"),
    codexa_lan_ollama: await probeJson("http://10.0.0.4:11434/api/tags"),
    codexa_remote_runtime_proof: {
      ok: codexaRemoteProof?.codexa_remote_runtime_green === true,
      status: codexaRemoteProof?.status || null,
      url: "command-rail://codexa/127.0.0.1:11434/api/tags",
      body: {
        models: (codexaRemoteProof?.remote?.proof?.ollama?.tags || []).map((name) => ({ name })),
        summary: codexaRemoteProof?.summary || null,
      },
    },
  };
  const installedTags = [
    ...normalizeOllamaTags(probes.cockpit_ollama.body),
    ...normalizeOllamaTags(probes.codexa_direct_ollama.body),
    ...normalizeOllamaTags(probes.codexa_lan_ollama.body),
    ...normalizeOllamaTags(probes.codexa_remote_runtime_proof.body),
  ];
  const uniqueInstalledTags = [...new Set(installedTags)].sort();
  const modelAvailability = availabilitySummary(registry?.local_models || [], uniqueInstalledTags);
  const coreModels = modelAvailability.filter((model) => model.tier === "core");
  const coreInstalledCount = coreModels.filter((model) => model.installed).length;
  const wildcards = modelAvailability.filter((model) => model.tier === "wildcard" || model.id.includes("dolphin"));
  const requiredModels = modelAvailability.filter((model) => !model.optional);
  const requiredInstalledCount = requiredModels.filter((model) => model.installed).length;
  const remoteRuntimeGreen = codexaRemoteProof?.codexa_remote_runtime_green === true;
  const fullRuntimeVerified = remoteRuntimeGreen && requiredModels.length > 0 && requiredInstalledCount === requiredModels.length;

  const result = {
    ok: validation.ok,
    version: "orangebox-trilane-model-router-doctor/v2",
    status: validation.ok ? "TRILANE_ROUTER_PACK_GREEN" : "TRILANE_ROUTER_PACK_NOT_GREEN",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    config: {
      model_registry: { path: modelRegistryPath, ok: Boolean(registry), sha256: sha256File(modelRegistryPath) },
      role_map: { path: roleMapPath, ok: Boolean(roleMap), sha256: sha256File(roleMapPath) },
      routing_policy: { path: routingPolicyPath, ok: Boolean(routingPolicy), sha256: sha256File(routingPolicyPath) },
    },
    doctrine: "Visible registry + live availability + task classifier + budget mode + receipt history. No model secretly chooses the chain.",
    validation,
    probes,
    installed_tags: uniqueInstalledTags,
    availability: {
      core_installed_count: coreInstalledCount,
      core_total: coreModels.length,
      models: modelAvailability,
      wildcard_lanes: wildcards,
    },
    codexa_status_note:
      probes.codexa_direct_ollama.ok || probes.codexa_lan_ollama.ok
        ? "Codexa Ollama was directly reachable for model discovery."
        : probes.codexa_remote_runtime_proof.ok
          ? "Codexa Ollama/model discovery was proven through the command rail from inside Codexa."
          : "Codexa Ollama was not proven from this cockpit; run codexa:remote-proof or use the OBOX 2 setup pack on Codexa to install/pull models.",
    install_status: {
      models_required_for_full_tri_lane: fullRuntimeVerified ? "INSTALLED_VERIFIED_BY_CODEXA_REMOTE_PROOF" : "PENDING_CODEXA_OPERATOR_RUN",
      local_config_ready: validation.ok,
      setup_pack_command: "npm.cmd run obox2:pack",
      required_installed_count: requiredInstalledCount,
      required_total: requiredModels.length,
      codexa_remote_runtime_green: remoteRuntimeGreen,
    },
  };

  const outRoot = path.join(dataRoot, "trilane");
  await writeJson(path.join(outRoot, "latest-trilane-model-router.json"), result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-trilane-model-router-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(outRoot, "latest-trilane-model-router.json"), result);
  }
  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
