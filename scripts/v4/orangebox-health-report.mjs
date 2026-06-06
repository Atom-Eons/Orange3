#!/usr/bin/env node
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
const reportRoot = path.join(dataRoot, "reports", "health");

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

function latestReceipt(prefix, root = receiptDir) {
  if (!exists(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

async function probe(url, timeoutMs = 2400) {
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

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, "utf8");
}

function startupPath(name) {
  return path.join(userRoot, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", name);
}

function skillRootStatus() {
  const roots = [
    path.join(userRoot, ".codex", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, ".agents", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, ".claude", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, "AppData", "Roaming", "Claude", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, "AppData", "Roaming", "Claude-3p", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, "AppData", "Roaming", "Antigravity", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, ".gemini", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "orangebox-primer", "SKILL.md"),
  ];
  return roots.map((file) => ({ file, ok: exists(file) }));
}

function mdBool(ok) {
  return ok ? "GREEN" : "NOT GREEN";
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# Orangebox Health Report");
  lines.push("");
  lines.push(`Generated: ${result.generated_at}`);
  lines.push(`Status: **${result.status}**`);
  lines.push(`Machine: \`${result.machine.name}\``);
  lines.push("");
  lines.push("## Dev / N150");
  for (const [name, probe] of Object.entries(result.dev.probes)) {
    lines.push(`- ${name}: ${mdBool(probe.ok)} (${probe.url})`);
  }
  lines.push(`- OpenClaw startup retired: ${mdBool(result.dev.openclaw_startup_retired.ok)}`);
  lines.push(`- Skill primer installs: ${result.dev.skill_primers.filter((item) => item.ok).length}/${result.dev.skill_primers.length}`);
  lines.push("");
  lines.push("## AI Box / Codexa");
  for (const [name, probe] of Object.entries(result.ai_box.probes)) {
    lines.push(`- ${name}: ${mdBool(probe.ok)} (${probe.url})`);
  }
  lines.push("");
  lines.push("## Current Proof Receipts");
  for (const [name, item] of Object.entries(result.receipts)) {
    lines.push(`- ${name}: ${item.status || "unknown"} ${item.path ? `(${item.path})` : ""}`);
  }
  lines.push("");
  lines.push("## Warnings");
  if (result.warnings.length === 0) lines.push("- None.");
  else for (const warning of result.warnings) lines.push(`- ${warning}`);
  lines.push("");
  lines.push("## Next Actions");
  if (result.next_actions.length === 0) lines.push("- None.");
  else for (const action of result.next_actions) lines.push(`- ${action}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const receiptPaths = {
    ops_readiness: latestReceipt("orangebox-ops-readiness-") || latestReceipt("orangebox-ops-readiness-", path.join(repoRoot, "receipts")),
    backend_install: latestReceipt("orangebox-backend-install-"),
    project_report: latestReceipt("orangebox-project-report-"),
    reality_watch: latestReceipt("orangebox-reality-watch-"),
    obox2_package: latestReceipt("orangebox-obox2-package-doctor-"),
    research_scout: latestReceipt("orangebox-external-research-scout-"),
    knowledge_improvements: latestReceipt("orangebox-knowledge-improvement-queue-"),
    codexa_alert: latestReceipt("orangebox-codexa-alert-"),
    mcp_doctor: latestReceipt("orangebox-mcp-doctor-"),
    skill_lifecycle: latestReceipt("orangebox-skill-lifecycle-doctor-"),
    openclaw_retirement: latestReceipt("orangebox-openclaw-retirement-"),
  };
  const latest = {
    ops_readiness: readJson(receiptPaths.ops_readiness || path.join(dataRoot, "watcher", "latest-reality-watch.json")),
    backend_install: readJson(receiptPaths.backend_install || ""),
    project_report: readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json")) || readJson(receiptPaths.project_report || ""),
    reality_watch: readJson(path.join(dataRoot, "watcher", "latest-reality-watch.json")) || readJson(receiptPaths.reality_watch || ""),
    obox2_package: readJson(path.join(dataRoot, "obox2", "latest-package-doctor.json")) || readJson(receiptPaths.obox2_package || ""),
    research_scout: readJson(path.join(dataRoot, "research-scout", "latest-external-research-scout.json")) || readJson(receiptPaths.research_scout || ""),
    knowledge_improvements: readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json")) || readJson(receiptPaths.knowledge_improvements || ""),
    codexa_alert: readJson(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json")) || readJson(receiptPaths.codexa_alert || ""),
    mcp_doctor: readJson(path.join(dataRoot, "mcp", "latest-mcp-doctor.json")) || readJson(receiptPaths.mcp_doctor || ""),
    skill_lifecycle: readJson(path.join(dataRoot, "skills", "latest-skill-lifecycle.json")) || readJson(receiptPaths.skill_lifecycle || ""),
    openclaw_retirement: readJson(path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json")) || readJson(receiptPaths.openclaw_retirement || ""),
  };

  const devProbes = {
    command_server: await probe("http://127.0.0.1:8787/api/realtime/health", 3000),
    api_server: await probe("http://127.0.0.1:8797/api/health", 5000),
    local_llama_health: await probe("http://127.0.0.1:8080/health", 3000),
    local_llama_models: await probe("http://127.0.0.1:8080/v1/models", 3000),
    local_ollama: await probe("http://127.0.0.1:11434/api/tags", 1000),
    strongarm_gate: await probe("http://127.0.0.1:8094/health", 3000),
  };
  const aiBoxProbes = {
    direct_command_rail_8097: await probe("http://10.0.99.1:8097/health", 1200),
    direct_wiki_bridge_8098: await probe("http://10.0.99.1:8098/health", 1200),
    direct_receipts_8099: await probe("http://10.0.99.1:8099/", 1200),
    direct_ollama_11434: await probe("http://10.0.99.1:11434/api/tags", 1200),
    lan_command_rail_8097: await probe("http://10.0.0.4:8097/health", 1200),
    lan_ollama_11434: await probe("http://10.0.0.4:11434/api/tags", 1200),
  };

  const startupOpenClaw = startupPath("OpenClaw Gateway (atomeons).cmd");
  const openclawRetired = !exists(startupOpenClaw) && latest.openclaw_retirement?.status === "OPENCLAW_STARTUP_RETIRED";
  const warnings = [];
  if (!devProbes.command_server.ok) warnings.push("Dev command server is not reachable.");
  if (!devProbes.api_server.ok) warnings.push("Dev API server is not reachable.");
  if (!devProbes.local_llama_health.ok) warnings.push("Local llama listener is not reachable.");
  if (!devProbes.strongarm_gate.ok) warnings.push("STRONGARM gate is not reachable.");
  if (!openclawRetired) warnings.push("OpenClaw startup hook is still present or no retirement receipt exists.");
  if (latest.mcp_doctor?.ok !== true || latest.mcp_doctor?.summary?.failed !== 0) warnings.push("MCP quarantine/tool bridge doctor is not green.");
  if (latest.skill_lifecycle?.status !== "ORANGEBOX_SKILL_LIFECYCLE_GREEN") warnings.push("Orangebox skill lifecycle doctor is not green.");
  if (!aiBoxProbes.direct_command_rail_8097.ok && !aiBoxProbes.lan_command_rail_8097.ok) warnings.push("AI Box command rail 8097 is not reachable.");
  if (!aiBoxProbes.direct_ollama_11434.ok && !aiBoxProbes.lan_ollama_11434.ok) warnings.push("AI Box Ollama is not reachable.");
  if (latest.obox2_package?.status !== "OBOX2_PACKAGE_VERIFIED_GREEN") warnings.push("OBOX2 package doctor is not green yet.");
  if (latest.research_scout?.status === "EXTERNAL_RESEARCH_SCOUT_OFFLINE") warnings.push("External research scout could not reach any source.");
  if (latest.knowledge_improvements?.status !== "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY") warnings.push("Knowledge Engine improvement candidates are not refreshed.");
  if (latest.project_report?.full_project_green === false) warnings.push(`Project report has ${latest.project_report?.gap_count || 0} open gap(s); do not call full Orangebox green.`);

  const nextActions = [];
  if (!openclawRetired) nextActions.push("Run npm.cmd run openclaw:retire from the Orangebox repo.");
  if (!aiBoxProbes.direct_command_rail_8097.ok && !aiBoxProbes.lan_command_rail_8097.ok) nextActions.push("On AI Box/Codexa, run RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd, RUN_CODEXA_POWER_DOCTOR.cmd, then RUN_START_CODEXA_RAIL_AS_ADMIN.cmd from the OBOX2 setup pack.");
  if (!aiBoxProbes.direct_ollama_11434.ok && !aiBoxProbes.lan_ollama_11434.ok) nextActions.push("After the AI Box power/rail proof is green, run RUN_INSTALL_CORE_LLMS_ON_CODEXA.cmd, then RUN_MODEL_DOCTOR_ON_CODEXA.cmd.");
  if (latest.obox2_package?.status !== "OBOX2_PACKAGE_VERIFIED_GREEN") nextActions.push("Run npm.cmd run obox2:pack and npm.cmd run obox2:doctor.");
  if (!latest.research_scout?.status) nextActions.push("Run npm.cmd run research:scout to refresh external public research candidates.");
  if (latest.knowledge_improvements?.status !== "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY") nextActions.push("Run npm.cmd run knowledge:improvements before promoting any learned system upgrade.");
  if (latest.project_report?.full_project_green === false) nextActions.push("Review npm.cmd run project:report output before claiming full project completion.");
  if (!latest.codexa_alert?.status) nextActions.push("Run npm.cmd run codexa:alert:popup once so AI Box disconnects become visible operator alerts.");
  if (latest.mcp_doctor?.ok !== true || latest.mcp_doctor?.summary?.failed !== 0) nextActions.push("Run npm.cmd run mcp:doctor to verify the MCP quarantine/tool bridge.");
  if (latest.skill_lifecycle?.status !== "ORANGEBOX_SKILL_LIFECYCLE_GREEN") nextActions.push("Run npm.cmd run skills:lifecycle to verify Orangebox skill install and command mappings.");

  const mcpDoctorOk = latest.mcp_doctor?.ok === true && latest.mcp_doctor?.summary?.failed === 0;
  const skillLifecycleOk = latest.skill_lifecycle?.status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN";
  const localCoreOk = devProbes.command_server.ok && devProbes.api_server.ok && devProbes.local_llama_health.ok && devProbes.strongarm_gate.ok && openclawRetired && mcpDoctorOk && skillLifecycleOk;
  const aiBoxOk = (aiBoxProbes.direct_command_rail_8097.ok || aiBoxProbes.lan_command_rail_8097.ok)
    && (aiBoxProbes.direct_ollama_11434.ok || aiBoxProbes.lan_ollama_11434.ok);
  const status = localCoreOk && aiBoxOk && warnings.length === 0
    ? "ORANGEBOX_HEALTH_GREEN"
    : localCoreOk
      ? "ORANGEBOX_HEALTH_DEV_GREEN_AIBOX_WARN"
      : "ORANGEBOX_HEALTH_NOT_GREEN";

  const result = {
    ok: status === "ORANGEBOX_HEALTH_GREEN",
    version: "orangebox-health-report/v1",
    status,
    generated_at: new Date().toISOString(),
    machine: {
      name: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      memory_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    },
    repo_root: repoRoot,
    data_root: dataRoot,
    dev: {
      probes: devProbes,
      openclaw_startup_retired: {
        ok: openclawRetired,
        startup_path: startupOpenClaw,
        retirement_status: latest.openclaw_retirement?.status || null,
      },
      skill_primers: skillRootStatus(),
    },
    ai_box: {
      expected: {
        direct_ip: "10.0.99.1",
        lan_ip: "10.0.0.4",
        command_rail: 8097,
        wiki_bridge: 8098,
        receipts: 8099,
        ollama: 11434,
      },
      probes: aiBoxProbes,
    },
    receipts: {
      ops_readiness: { path: receiptPaths.ops_readiness, status: latest.ops_readiness?.status || latest.ops_readiness?.checks?.ops_readiness?.status || null },
      backend_install: { path: receiptPaths.backend_install, status: latest.backend_install?.status || null },
      project_report: {
        path: path.join(dataRoot, "reports", "project", "latest-project-report.json"),
        status: latest.project_report?.status || null,
        full_project_green: latest.project_report?.full_project_green ?? null,
        gap_count: latest.project_report?.gap_count ?? null,
      },
      reality_watch: { path: path.join(dataRoot, "watcher", "latest-reality-watch.json"), status: latest.reality_watch?.status || null },
      obox2_package: { path: path.join(dataRoot, "obox2", "latest-package-doctor.json"), status: latest.obox2_package?.status || null },
      research_scout: {
        path: path.join(dataRoot, "research-scout", "latest-external-research-scout.json"),
        status: latest.research_scout?.status || null,
        candidate_count: latest.research_scout?.candidate_count || 0,
      },
      knowledge_improvements: {
        path: path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"),
        status: latest.knowledge_improvements?.status || null,
        candidate_count: latest.knowledge_improvements?.candidate_count || 0,
      },
      codexa_alert: {
        path: path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"),
        status: latest.codexa_alert?.status || null,
        popup_notified: latest.codexa_alert?.popup?.notified || false,
        message: latest.codexa_alert?.message || null,
      },
      mcp_doctor: {
        path: path.join(dataRoot, "mcp", "latest-mcp-doctor.json"),
        status: latest.mcp_doctor?.ok === true ? "MCP_QUARANTINE_GREEN" : "MCP_QUARANTINE_NOT_GREEN",
        checks: latest.mcp_doctor?.summary?.checks || 0,
        passed: latest.mcp_doctor?.summary?.passed || 0,
        failed: latest.mcp_doctor?.summary?.failed ?? null,
        host_mcp_config_mutated: latest.mcp_doctor?.host_mcp_config_mutated ?? null,
      },
      skill_lifecycle: {
        path: path.join(dataRoot, "skills", "latest-skill-lifecycle.json"),
        status: latest.skill_lifecycle?.status || null,
        command_count: latest.skill_lifecycle?.command_count || 0,
        stale_count: latest.skill_lifecycle?.stale_count ?? null,
      },
      openclaw_retirement: { path: path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json"), status: latest.openclaw_retirement?.status || null },
    },
    warnings,
    next_actions: nextActions,
  };

  const base = `orangebox-health-report-${stamp()}`;
  const jsonPath = path.join(reportRoot, `${base}.json`);
  const mdPath = path.join(reportRoot, `${base}.md`);
  await writeJson(jsonPath, result);
  await writeText(mdPath, renderMarkdown(result));
  await writeJson(path.join(reportRoot, "latest-health-report.json"), { ...result, report_json: jsonPath, report_markdown: mdPath });
  await writeText(path.join(reportRoot, "latest-health-report.md"), renderMarkdown({ ...result, report_json: jsonPath, report_markdown: mdPath }));
  result.report_json = jsonPath;
  result.report_markdown = mdPath;

  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `${base}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (status === "ORANGEBOX_HEALTH_NOT_GREEN") process.exitCode = 1;
}

await main();
