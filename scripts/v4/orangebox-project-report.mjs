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
const reportRoot = path.join(dataRoot, "reports", "project");

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

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, "utf8");
}

function status(ok, partial = false) {
  if (ok) return "REAL";
  return partial ? "PARTIAL" : "NOT_REAL_YET";
}

function mdList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# Orangebox Full Project Report");
  lines.push("");
  lines.push(`Generated: ${result.generated_at}`);
  lines.push(`Project status: **${result.status}**`);
  lines.push(`Report OK: **${result.report_ok}**`);
  lines.push(`Full project green: **${result.full_project_green}**`);
  lines.push(`Local Ops green: **${result.local_ops_green}**`);
  lines.push(`Two-machine green: **${result.two_machine_green}**`);
  lines.push(`Gap count: **${result.gap_count}**`);
  lines.push(`Repo: \`${result.repo_root}\``);
  lines.push("");
  lines.push("## System Definition");
  lines.push("");
  lines.push(result.definition);
  lines.push("");
  lines.push("## Scope Table");
  lines.push("");
  lines.push("| Area | Status | Reality | Next Work |");
  lines.push("| --- | --- | --- | --- |");
  for (const item of result.scope) {
    lines.push(`| ${item.area} | ${item.status} | ${item.reality.replace(/\|/g, "/")} | ${item.next.replace(/\|/g, "/")} |`);
  }
  lines.push("");
  lines.push("## Model Plan");
  lines.push("");
  for (const model of result.models.registered_local_models) {
    lines.push(`- ${model.id}: ${model.lane}, tier ${model.required_tier}, roles ${model.allowed_roles.join(", ")}`);
  }
  lines.push("");
  lines.push("## What Is Not Real Yet");
  lines.push("");
  lines.push(mdList(result.not_real_yet));
  lines.push("");
  lines.push("## Recommended Next Actions");
  lines.push("");
  lines.push(mdList(result.recommended_next_actions));
  lines.push("");
  lines.push("## Reports And Receipts");
  lines.push("");
  for (const [name, value] of Object.entries(result.evidence)) {
    lines.push(`- ${name}: ${value.status || "unknown"} ${value.path ? `(${value.path})` : ""}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function packageScript(name, packageJson) {
  return packageJson?.scripts?.[name] || null;
}

async function main() {
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const modelRegistry = readJson(path.join(repoRoot, "config", "model_registry.json"));
  const roleMap = readJson(path.join(repoRoot, "config", "role_map.json"));
  const routingPolicy = readJson(path.join(repoRoot, "config", "routing_policy.json"));
  const soulGenome = readJson(path.join(repoRoot, "config", "soul_genome.json"));
  const atomSmasher = readJson(path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json"));
  const atomTools = readJson(path.join(dataRoot, "atomsmasher", "tool-merge", "latest-tool-merge.json"));
  const strongarm = readJson(path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json"));
  const gremlin = readJson(path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json"));
  const triLane = readJson(path.join(dataRoot, "trilane", "latest-trilane-model-router.json"));
  const obox2Pack = readJson(path.join(dataRoot, "obox2", "latest-internal-setup-pack.json"));
  const obox2Doctor = readJson(path.join(dataRoot, "obox2", "latest-package-doctor.json"));
  const soulDoctor = readJson(path.join(dataRoot, "knowledge", "soul-genome", "latest-soul-genome-doctor.json"));
  const knowledgeImprovements = readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"));
  const researchScout = readJson(path.join(dataRoot, "research-scout", "latest-external-research-scout.json"));
  const codexaAlert = readJson(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"));
  const mcpDoctor = readJson(path.join(dataRoot, "mcp", "latest-mcp-doctor.json")) || readJson(latestReceipt("orangebox-mcp-doctor-"));
  const skillLifecycle = readJson(path.join(dataRoot, "skills", "latest-skill-lifecycle.json")) || readJson(latestReceipt("orangebox-skill-lifecycle-doctor-"));
  const reality = readJson(path.join(dataRoot, "watcher", "latest-reality-watch.json"));
  const openclawRetire = readJson(path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json"));
  const fullGreen = readJson(path.join(dataRoot, "gauntlet", "latest-orangebox-full-green.json"));
  const backendInstallPath = latestReceipt("orangebox-backend-install-");
  const opsReadinessPath = latestReceipt("orangebox-ops-readiness-");
  const backendInstall = readJson(backendInstallPath);
  const opsReadiness = readJson(opsReadinessPath);
  const aecodeFormat = readJson(path.join(dataRoot, "aecode-format", "latest-final-format.json"));

  const mcpReal = exists(path.join(repoRoot, "scripts", "orangebox-mcp-server.mjs"))
    && exists(path.join(repoRoot, "scripts", "orangebox-command-server.mjs"));
  const aiBoxRailReachable = reality?.checks?.probes?.ai_box_command_8097?.ok === true;
  const openclawRetired = openclawRetire?.status === "OPENCLAW_STARTUP_RETIRED";
  const packageGreen = obox2Doctor?.status === "OBOX2_PACKAGE_VERIFIED_GREEN";
  const knowledgeImprovementsReady =
    knowledgeImprovements?.status === "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY" &&
    knowledgeImprovements?.not_autonomous === true;
  const researchScoutReady =
    researchScout?.status === "EXTERNAL_RESEARCH_SCOUT_READY" ||
    researchScout?.status === "EXTERNAL_RESEARCH_SCOUT_DEGRADED";
  const mcpQuarantineGreen =
    mcpDoctor?.ok === true &&
    mcpDoctor?.summary?.failed === 0 &&
    mcpDoctor?.install_attempted === false &&
    mcpDoctor?.host_mcp_config_mutated === false &&
    mcpDoctor?.paid_api_attempted === false;
  const skillLifecycleGreen = skillLifecycle?.status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN";
  const localOpsBackendGreen =
    backendInstall?.status === "ORANGEBOX_DELTA_BACKEND_INSTALLED_GREEN" &&
    opsReadiness?.status === "ORANGEBOX_OPS_RAILS_GREEN";

  const scope = [
    {
      area: "Orangebox Ops backend",
      status: status(localOpsBackendGreen, Boolean(backendInstall || opsReadiness)),
      reality: localOpsBackendGreen
        ? "Local backend proof and ops readiness are green; command server, API server, local listener, and STRONGARM are startup-managed."
        : "Local backend has some proof receipts, but backend install and ops readiness are not both green.",
      next: localOpsBackendGreen
        ? "Keep backend proof in every release gate. Treat two-device full-green as a separate Codexa readiness gate."
        : "Run npm.cmd run backend:proof and npm.cmd run ops:readiness.",
    },
    {
      area: "MCP quarantine/tool bridge",
      status: status(mcpQuarantineGreen, exists(path.join(repoRoot, "scripts", "v4", "mcp-doctor.mjs"))),
      reality: mcpQuarantineGreen
        ? `MCP registry, local HTTP tool-list probe, metadata-only stdio probe, disable override, CLI/API source probe, and code-mode execute guard are green (${mcpDoctor?.summary?.passed || 0}/${mcpDoctor?.summary?.checks || 0}).`
        : "MCP bridge source exists, but the quarantine doctor is not green yet.",
      next: mcpQuarantineGreen
        ? "Keep all new MCPs as candidates until health, tools, scopes, output caps, receipts, and operator-confirmed write mode are proven."
        : "Run npm.cmd run mcp:doctor and fix the exact failed gate.",
    },
    {
      area: "Skill lifecycle compression",
      status: status(skillLifecycleGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-skill-lifecycle-doctor.mjs"))),
      reality: skillLifecycleGreen
        ? `Orangebox primer skill is installed across app roots, stale skills are absent, and ${skillLifecycle?.command_count || 0} real skill commands map to existing proof scripts.`
        : "Skill lifecycle source exists, but install roots or command mappings are not proven green.",
      next: skillLifecycleGreen
        ? "Promote new skills only when they reduce repeated work, have command/proof mappings, and pass stale-skill gates."
        : "Run npm.cmd run skills:lifecycle and fix the exact failed root or command mapping.",
    },
    {
      area: "N150 to AI Box MCP/command bridge",
      status: status(mcpReal && aiBoxRailReachable, mcpReal),
      reality: mcpReal ? "MCP server and command-server AI Box routes exist; AI Box command rail is currently not reachable." : "No MCP/command bridge source found.",
      next: "Start Codexa rail 8097 on AI Box, then rerun health report.",
    },
    {
      area: "Codexa visible alerting",
      status: status(Boolean(codexaAlert?.status), exists(path.join(repoRoot, "scripts", "v4", "orangebox-codexa-alert-doctor.mjs"))),
      reality: codexaAlert?.status
        ? `Codexa alert doctor is real. Current status: ${codexaAlert.status}. It writes receipts and can show throttled Windows popups.`
        : "Codexa alert script exists or is planned, but no alert receipt is current yet.",
      next: codexaAlert?.status
        ? "Keep alerting explicit until Codexa rails and Ollama are green."
        : "Run npm.cmd run codexa:alert:popup, then rerun project/readiness proof.",
    },
    {
      area: "Hermes outer orchestration",
      status: status(false, exists(path.join(repoRoot, "scripts", "v4", "hermes", "hermes-doctor.mjs"))),
      reality: "Hermes readiness scripts and setup path exist. Hermes is not proven installed or running in this report.",
      next: "Run the OBOX2 Hermes doctor/install on Codexa when ready.",
    },
    {
      area: "OpenClaw retirement",
      status: status(openclawRetired),
      reality: openclawRetired ? "OpenClaw startup retired with backup receipt." : "OpenClaw startup still needs retirement or proof receipt.",
      next: openclawRetired ? "Do not reintroduce OpenClaw startup hooks." : "Run npm.cmd run openclaw:retire.",
    },
    {
      area: "Knowledge Engine",
      status: status(knowledgeImprovementsReady, exists(path.join(repoRoot, "scripts", "orangebox-knowledge-v2.mjs"))),
      reality: knowledgeImprovementsReady
        ? `Knowledge storage/search, receipts, primers, and ${knowledgeImprovements?.candidate_count || 0} learned improvement candidates are real. Autonomous self-promotion is intentionally not real.`
        : "Knowledge storage, receipts, primers, and search exist. Learned improvement candidates are not proven yet, and autonomous self-promotion is intentionally not real.",
      next: knowledgeImprovementsReady
        ? "Promote candidates only through task contract, operator approval, doctor receipt, and rollback path."
        : "Run npm.cmd run knowledge:improvements, then rerun project/readiness proof.",
    },
    {
      area: "External research scout",
      status: status(researchScoutReady, exists(path.join(repoRoot, "scripts", "v4", "orangebox-external-research-scout.mjs"))),
      reality: researchScoutReady
        ? `Low-bandwidth public research scout is real with ${researchScout?.candidate_count || 0} candidates. It uses evidence tiers and promotes nothing automatically.`
        : "Research scout script exists or is planned, but no current scout receipt is green yet.",
      next: researchScoutReady
        ? "Run npm.cmd run research:scout on cadence, then npm.cmd run knowledge:improvements to queue approved-fit upgrade candidates."
        : "Run npm.cmd run research:scout, then rerun project/readiness proof.",
    },
    {
      area: "AtomSmasher compression pack",
      status: status(atomSmasher?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN"),
      reality: `${atomSmasher?.summary?.features_ok || 0}/${atomSmasher?.summary?.features_registered || 0} features green; schema ${atomSmasher?.summary?.schema_version || "unknown"}.`,
      next: "Wire learned improvement candidates into Knowledge Engine receipts.",
    },
    {
      area: "AtomSmasher backend tool merge",
      status: status(atomTools?.status === "ATOMSMASHER_TOOL_MERGE_GREEN"),
      reality: `${atomTools?.manifest?.totals?.eligible_backend_tools || 0} backend tools eligible; visual/product lane excluded.`,
      next: "Promote only backend tools that pass proof receipts.",
    },
    {
      area: "STRONGARM",
      status: status(strongarm?.status === "STRONGARM_ORANGEBOX_GATE_GREEN"),
      reality: "Local pressure gate is installed and green in heuristic/sidecar form.",
      next: "Move from heuristic-only toward local model structured-output mode after Ollama is proven.",
    },
    {
      area: "Misfits / Gremlin",
      status: status(gremlin?.status === "GREMLIN_MISFITS_ELITE_GREEN"),
      reality: `${gremlin?.elite_proof?.rows || 0} elite packet rows verified; training status ${gremlin?.training?.status || "unknown"}.`,
      next: "Train/evaluate LoRA only after Codexa/Colab runtime is chosen.",
    },
    {
      area: "Tri-lane local model router",
      status: status(triLane?.status === "TRILANE_ROUTER_PACK_GREEN"),
      reality: `Registry and policy green; installed core models ${triLane?.availability?.core_installed_count || 0}/${triLane?.availability?.core_total || 0}.`,
      next: "Install core Ollama models on Codexa and rerun model doctor.",
    },
    {
      area: "OBOX2 setup package",
      status: status(packageGreen, obox2Pack?.status === "OBOX2_INTERNAL_SETUP_PACK_GREEN"),
      reality: packageGreen ? "Zip was expanded and verified by package doctor; includes Codexa always-on power optimizer, rail starter, model installer, and Hermes doctor." : "Zip exists or is planned, but package doctor is not green.",
      next: "Run power optimizer/doctor on Codexa first, then rail, then core models.",
    },
    {
      area: "SOUL GENOME continuity map",
      status: status(soulDoctor?.status === "SOUL_GENOME_KNOWLEDGE_MAP_GREEN"),
      reality: soulDoctor?.decision || "Continuity map not proven.",
      next: "Build continuity probes and candidate-model promotion receipts.",
    },
    {
      area: "AECode final format",
      status: status(Boolean(aecodeFormat?.ok || aecodeFormat?.status)),
      reality: "AECode remains the middle voice for output contracts, not a frontend rewrite mandate.",
      next: "Use AECode for project contracts and artifact specs.",
    },
    {
      area: "Visual/frontend lane",
      status: "SEPARATE_LANE",
      reality: "Visual is part of Orangebox outputs, but this Ops chat does not touch frontend/.",
      next: "Keep frontend work in the separate visual project lane.",
    },
  ];

  const notRealYet = scope
    .filter((item) => item.status === "PARTIAL" || item.status === "NOT_REAL_YET")
    .map((item) => `${item.area}: ${item.reality} Next: ${item.next}`);
  const statusCounts = scope.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
  const fullProjectGreen = notRealYet.length === 0;
  const twoMachineGreen = Boolean(aiBoxRailReachable);
  const reportStatus = fullProjectGreen
    ? "ORANGEBOX_PROJECT_SCOPE_GREEN"
    : "ORANGEBOX_PROJECT_SCOPE_REPORTED_WITH_GAPS";

  const result = {
    ok: fullProjectGreen,
    report_ok: true,
    full_project_green: fullProjectGreen,
    local_ops_green: localOpsBackendGreen,
    two_machine_green: twoMachineGreen,
    gap_count: notRealYet.length,
    partial_count: statusCounts.PARTIAL || 0,
    not_real_count: statusCounts.NOT_REAL_YET || 0,
    status_counts: statusCounts,
    version: "orangebox-project-report/v1",
    status: reportStatus,
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    definition: "Orangebox Version 1 is a local-first governed software factory and operations backend. AECode writes buildable source contracts; AtomSmasher compresses context/work; STRONGARM/Misfits/Mirror/Judgement keep outputs honest; receipts prove reality; the operator remains final authority.",
    package: {
      name: packageJson?.name || null,
      version: packageJson?.version || null,
      scripts: {
        health_report: packageScript("health:report", packageJson),
        project_report: packageScript("project:report", packageJson),
        obox2_pack: packageScript("obox2:pack", packageJson),
        obox2_doctor: packageScript("obox2:doctor", packageJson),
        mcp_doctor: packageScript("mcp:doctor", packageJson),
        skills_lifecycle: packageScript("skills:lifecycle", packageJson),
      },
    },
    models: {
      registered_local_models: modelRegistry?.local_models || [],
      cloud_lanes: modelRegistry?.cloud_lanes || {},
      role_map: roleMap?.roles || {},
      routing_policy_version: routingPolicy?.version || null,
      installed_core_count: triLane?.availability?.core_installed_count || 0,
      installed_core_total: triLane?.availability?.core_total || 0,
    },
    soul_genome: {
      status: soulGenome?.status || null,
      doctor_status: soulDoctor?.status || null,
      non_goals: soulGenome?.non_goals || [],
    },
    scope,
    not_real_yet: notRealYet,
    recommended_next_actions: [
      "Retire OpenClaw startup if not already retired.",
      "Verify OBOX2 package with npm.cmd run obox2:doctor before touching Codexa.",
      "On Codexa, run the OBOX2 power optimizer/doctor before rail/model setup so the AI Box cannot quietly sleep mid-run.",
      "Bring up AI Box command rail 8097 and Ollama, then rerun health:report.",
      "Install core Codexa models first; hold heavy models until core proof is green.",
      "Run npm.cmd run research:scout periodically, then approve only candidates that fit Orangebox Ops scope.",
      "Use npm.cmd run knowledge:improvements to refresh receipt-learning candidates before deciding backend upgrades.",
    ],
    evidence: {
      full_green: { path: path.join(dataRoot, "gauntlet", "latest-orangebox-full-green.json"), status: fullGreen?.summary?.status || fullGreen?.status || null },
      backend_install: { path: backendInstallPath, status: backendInstall?.status || null },
      ops_readiness: { path: opsReadinessPath, status: opsReadiness?.status || null },
      atom_smasher: { path: path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json"), status: atomSmasher?.summary?.status || null },
      atom_tools: { path: path.join(dataRoot, "atomsmasher", "tool-merge", "latest-tool-merge.json"), status: atomTools?.status || null },
      strongarm: { path: path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json"), status: strongarm?.status || null },
      gremlin: { path: path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json"), status: gremlin?.status || null },
      trilane: { path: path.join(dataRoot, "trilane", "latest-trilane-model-router.json"), status: triLane?.status || null },
      obox2_pack: { path: path.join(dataRoot, "obox2", "latest-internal-setup-pack.json"), status: obox2Pack?.status || null },
      obox2_doctor: { path: path.join(dataRoot, "obox2", "latest-package-doctor.json"), status: obox2Doctor?.status || null },
      soul: { path: path.join(dataRoot, "knowledge", "soul-genome", "latest-soul-genome-doctor.json"), status: soulDoctor?.status || null },
      knowledge_improvements: { path: path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"), status: knowledgeImprovements?.status || null },
      research_scout: { path: path.join(dataRoot, "research-scout", "latest-external-research-scout.json"), status: researchScout?.status || null },
      codexa_alert: { path: path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"), status: codexaAlert?.status || null },
      mcp_doctor: {
        path: path.join(dataRoot, "mcp", "latest-mcp-doctor.json"),
        status: mcpQuarantineGreen ? "MCP_QUARANTINE_GREEN" : "MCP_QUARANTINE_NOT_GREEN",
      },
      skill_lifecycle: {
        path: path.join(dataRoot, "skills", "latest-skill-lifecycle.json"),
        status: skillLifecycle?.status || null,
      },
      reality: { path: path.join(dataRoot, "watcher", "latest-reality-watch.json"), status: reality?.status || null },
      openclaw_retirement: { path: path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json"), status: openclawRetire?.status || null },
    },
  };

  const base = `orangebox-project-report-${stamp()}`;
  const jsonPath = path.join(reportRoot, `${base}.json`);
  const mdPath = path.join(reportRoot, `${base}.md`);
  await writeJson(jsonPath, result);
  await writeText(mdPath, renderMarkdown(result));
  await writeJson(path.join(reportRoot, "latest-project-report.json"), { ...result, report_json: jsonPath, report_markdown: mdPath });
  await writeText(path.join(reportRoot, "latest-project-report.md"), renderMarkdown({ ...result, report_json: jsonPath, report_markdown: mdPath }));
  result.report_json = jsonPath;
  result.report_markdown = mdPath;

  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `${base}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
}

await main();
