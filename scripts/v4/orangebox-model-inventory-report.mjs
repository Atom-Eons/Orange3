#!/usr/bin/env node
/*
  orangebox-model-inventory-report.mjs

  Backend/Ops model truth surface. This joins the registry, role map, routing
  policy, live lightweight probes, and existing receipts into one operator
  report. It does not pull models, call paid APIs, or mutate Codexa.
*/

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
const reportRoot = path.join(dataRoot, "reports", "models");

const configRoot = path.join(repoRoot, "config");
const registryPath = path.join(configRoot, "model_registry.json");
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

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, "utf8");
}

async function probeJson(url, timeoutMs = 1800) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body = text.slice(0, 500);
    try { body = JSON.parse(text); } catch {}
    return { ok: response.ok, status: response.status, ms: Date.now() - started, url, body };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, url, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeTag(tag) {
  return String(tag || "").trim();
}

function normalizeProbeTags(probe) {
  const body = probe?.body;
  const tags = [];
  if (Array.isArray(body?.models)) {
    for (const model of body.models) tags.push(model.name || model.model || model.id || "");
  }
  if (Array.isArray(body?.data)) {
    for (const model of body.data) {
      tags.push(model.id || model.name || model.model || "");
      for (const alias of model.aliases || []) tags.push(alias);
    }
  }
  return tags.map(normalizeTag).filter(Boolean);
}

function byTier(models) {
  const out = {};
  for (const model of models) {
    const tier = model.required_tier || "unknown";
    out[tier] ||= { total: 0, installed: 0, missing: 0 };
    out[tier].total += 1;
    if (model.installed) out[tier].installed += 1;
    else out[tier].missing += 1;
  }
  return out;
}

function roleUse(roleMap, modelId) {
  const roles = [];
  for (const [role, spec] of Object.entries(roleMap?.roles || {})) {
    if (spec.default_model === modelId) roles.push(`${role}:default`);
    if (spec.hard_model === modelId) roles.push(`${role}:hard`);
    for (const cloud of spec.cloud_escalation || []) {
      if (cloud === modelId) roles.push(`${role}:cloud-escalation`);
    }
  }
  return roles;
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# Orangebox Model Inventory Report");
  lines.push("");
  lines.push(`Generated: ${result.generated_at}`);
  lines.push(`Status: **${result.status}**`);
  lines.push(`Full local model runtime green: **${result.full_local_model_runtime_green}**`);
  lines.push(`Registry: \`${result.config.model_registry.path}\``);
  lines.push("");
  lines.push("## Live Probe Summary");
  for (const [name, probe] of Object.entries(result.probes)) {
    lines.push(`- ${name}: ${probe.ok ? "GREEN" : "NOT GREEN"} (${probe.url})`);
  }
  lines.push("");
  lines.push("## Local Models");
  lines.push("");
  lines.push("| Model | Tier | Lane | Installed | RAM GB | Allowed Roles | Forbidden Roles |");
  lines.push("| --- | --- | --- | --- | ---: | --- | --- |");
  for (const model of result.local_models) {
    lines.push(`| ${model.id} | ${model.required_tier} | ${model.lane} | ${model.installed ? "yes" : "no"} | ${model.ram_estimate_gb ?? ""} | ${(model.allowed_roles || []).join(", ")} | ${(model.forbidden_roles || []).join(", ")} |`);
  }
  lines.push("");
  lines.push("## Cloud Lanes");
  for (const [name, lane] of Object.entries(result.cloud_lanes)) {
    lines.push(`- ${name}: ${lane.preferred} (${lane.role}); approval required: ${lane.approval_required}`);
  }
  lines.push("");
  lines.push("## Tier Summary");
  for (const [tier, summary] of Object.entries(result.summary.by_tier)) {
    lines.push(`- ${tier}: ${summary.installed}/${summary.total} installed`);
  }
  lines.push("");
  lines.push("## Warnings");
  if (result.warnings.length === 0) lines.push("- None.");
  else for (const warning of result.warnings) lines.push(`- ${warning}`);
  lines.push("");
  lines.push("## Next Actions");
  for (const action of result.next_actions) lines.push(`- ${action}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const started = new Date();
  const registry = readJson(registryPath);
  const roleMap = readJson(roleMapPath);
  const routingPolicy = readJson(routingPolicyPath);
  const triLane = readJson(path.join(dataRoot, "trilane", "latest-trilane-model-router.json"));
  const localLane = readJson(path.join(dataRoot, "models", "latest-local-model-lane-eval.json"));
  const obox2Doctor = readJson(path.join(dataRoot, "obox2", "latest-package-doctor.json"));
  const codexaRemoteProof = readJson(path.join(dataRoot, "codexa-remote-proof", "latest-codexa-remote-runtime-proof.json"));

  const probes = {
    cockpit_ollama: await probeJson("http://127.0.0.1:11434/api/tags"),
    cockpit_llama_listener: await probeJson("http://127.0.0.1:8080/v1/models"),
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

  const installedTags = [...new Set(Object.values(probes).flatMap(normalizeProbeTags))].sort();
  const installedSet = new Set(installedTags);
  const registeredLocal = Array.isArray(registry?.local_models) ? registry.local_models : [];
  const localModels = registeredLocal.map((model) => ({
    id: model.id,
    lane: model.lane,
    size_class: model.size_class,
    required_tier: model.required_tier,
    optional: Boolean(model.optional || model.required_tier === "wildcard"),
    installed: installedSet.has(model.id),
    ram_estimate_gb: model.ram_estimate_gb,
    allowed_roles: model.allowed_roles || [],
    forbidden_roles: model.forbidden_roles || [],
    role_map_use: roleUse(roleMap, model.id),
    strengths: model.strengths || [],
    weaknesses: model.weaknesses || [],
  }));

  const coreModels = localModels.filter((model) => model.required_tier === "core");
  const coreInstalled = coreModels.filter((model) => model.installed);
  const requiredModels = localModels.filter((model) => !model.optional);
  const requiredInstalled = requiredModels.filter((model) => model.installed);
  const fullLocalModelRuntimeGreen = requiredModels.length > 0 && requiredInstalled.length === requiredModels.length;
  const configOk =
    registry?.version === "orangebox-model-registry/v2" &&
    roleMap?.version === "orangebox-role-map/v2" &&
    routingPolicy?.version === "orangebox-routing-policy/v2" &&
    localModels.length >= 10;

  const warnings = [];
  if (!fullLocalModelRuntimeGreen) warnings.push(`Only ${requiredInstalled.length}/${requiredModels.length} required local models were observed installed through live probes.`);
  if (coreInstalled.length !== coreModels.length) warnings.push(`Core local model fleet is not complete: ${coreInstalled.length}/${coreModels.length} observed.`);
  if (!probes.codexa_direct_ollama.ok && !probes.codexa_lan_ollama.ok && !probes.codexa_remote_runtime_proof.ok) warnings.push("Codexa Ollama is not directly reachable and no green command-rail remote proof is available, so AI Box model inventory is unproven.");
  if (!probes.cockpit_ollama.ok) warnings.push("Cockpit Ollama is not reachable on 127.0.0.1:11434.");
  if (probes.cockpit_llama_listener.ok && installedTags.includes("orangebox-n150-cpu-listener")) {
    warnings.push("Local llama listener is reachable, but it is not one of the registered Orangebox role models.");
  }

  const result = {
    ok: configOk,
    version: "orangebox-model-inventory-report/v1",
    status: configOk && fullLocalModelRuntimeGreen
      ? "ORANGEBOX_MODEL_INVENTORY_GREEN"
      : configOk
        ? "ORANGEBOX_MODEL_INVENTORY_REPORTED_WITH_GAPS"
        : "ORANGEBOX_MODEL_INVENTORY_NOT_GREEN",
    generated_at: started.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Model inventory is receipt/probe truth. A registry entry is a plan, not an installed model. Wildcards pressure only; they never decide.",
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      model_pull_attempted: false,
      model_call_attempted: false,
      paid_api_attempted: false,
      remote_codexa_mutation_attempted: false,
    },
    config: {
      model_registry: { path: registryPath, ok: registry?.version === "orangebox-model-registry/v2" },
      role_map: { path: roleMapPath, ok: roleMap?.version === "orangebox-role-map/v2" },
      routing_policy: { path: routingPolicyPath, ok: routingPolicy?.version === "orangebox-routing-policy/v2" },
    },
    probes,
    installed_tags: installedTags,
    local_models: localModels,
    cloud_lanes: registry?.cloud_lanes || {},
    summary: {
      registered_local_total: localModels.length,
      required_total: requiredModels.length,
      required_installed: requiredInstalled.length,
      core_total: coreModels.length,
      core_installed: coreInstalled.length,
      optional_total: localModels.filter((model) => model.optional).length,
      optional_installed: localModels.filter((model) => model.optional && model.installed).length,
      by_tier: byTier(localModels),
    },
    receipt_truth: {
      trilane_status: triLane?.status || null,
      trilane_core_installed: triLane?.availability?.core_installed_count ?? null,
      trilane_core_total: triLane?.availability?.core_total ?? null,
      local_lane_eval_status: localLane?.status || null,
      local_lane_full_runtime_green: localLane?.inventory_truth?.full_local_model_runtime_green ?? null,
      obox2_package_status: obox2Doctor?.status || null,
      obox2_zip_path: obox2Doctor?.zip_path || null,
      codexa_remote_runtime_status: codexaRemoteProof?.status || null,
      codexa_remote_runtime_green: codexaRemoteProof?.codexa_remote_runtime_green ?? null,
    },
    full_local_model_runtime_green: fullLocalModelRuntimeGreen,
    warnings,
    next_actions: fullLocalModelRuntimeGreen
      ? [
          "Run model packet evaluations with latency/json-validity receipts before changing routing weights.",
          "Keep cloud lanes approval-gated for high-risk or local-confidence failures.",
        ]
      : [
          "Run npm.cmd run codexa:remote-proof. If it is not green, use the verified OBOX2 setup pack on Codexa, then install core models and rerun CODEXA_MODEL_DOCTOR.ps1.",
          "From this cockpit, rerun npm.cmd run trilane:doctor, npm.cmd run model:lane-eval, and npm.cmd run model:inventory after Codexa remote runtime proof is green.",
          "Do not claim full local model runtime green until every required local model is observed by a live probe.",
        ],
  };

  const reportJson = path.join(reportRoot, `orangebox-model-inventory-report-${stamp(started)}.json`);
  const reportMd = path.join(reportRoot, `orangebox-model-inventory-report-${stamp(started)}.md`);
  const latestJson = path.join(reportRoot, "latest-model-inventory-report.json");
  const latestMd = path.join(reportRoot, "latest-model-inventory-report.md");
  result.report_json = reportJson;
  result.report_markdown = reportMd;

  await writeJson(reportJson, result);
  await writeJson(latestJson, result);
  const markdown = renderMarkdown(result);
  await writeText(reportMd, markdown);
  await writeText(latestMd, markdown);

  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-model-inventory-report-${stamp(started)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(reportJson, result);
    await writeJson(latestJson, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
