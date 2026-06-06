#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const watchRoot = path.join(dataRoot, "watcher");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

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

function ageMs(iso) {
  const parsed = Date.parse(iso || "");
  return Number.isFinite(parsed) ? Date.now() - parsed : null;
}

async function probe(url, timeoutMs = 1200) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 240);
    }
    return { ok: response.ok, status: response.status, ms: Date.now() - started, url, body };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, url, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function latestReceipt(prefix) {
  if (!exists(receiptDir)) return null;
  const files = fs.readdirSync(receiptDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(receiptDir, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

function codexaSignalHygiene(alert) {
  if (!alert?.status) return null;
  if (alert.signal_hygiene) return alert.signal_hygiene;
  const status = alert.status;
  const severity = status === "CODEXA_READY"
    ? "green"
    : status === "CODEXA_COMMAND_ONLY"
      ? "warning"
      : status === "CODEXA_RECEIPTS_ONLY"
        ? (alert.remote_control_available ? "warning" : "attention")
        : (alert.receipts_reachable || alert.smb_port_visible ? "attention" : "urgent");
  const humanLabel = status === "CODEXA_READY"
    ? "Codexa ready"
    : status === "CODEXA_RECEIPTS_ONLY"
      ? "Codexa receipts only"
      : status === "CODEXA_COMMAND_ONLY"
        ? "Codexa command rail only"
        : "Codexa unreachable";
  return {
    version: "orangebox-signal-hygiene/v1-fallback",
    severity,
    human_label: humanLabel,
    repeat_count: null,
    stable_since: alert.checked_at || null,
    notify_reason: alert.popup?.result?.mode || "legacy_alert_shape",
    next_popup_after: null,
    cooldown_minutes: alert.popup?.cooldown_minutes ?? null,
    popup_requested: alert.popup?.requested ?? null,
    alert_fatigue_policy: "Derived by reality watcher because the upstream alert receipt did not include signal_hygiene.",
    operator_action_required: status !== "CODEXA_READY" && alert.remote_execution_available !== true,
    local_basic_install_blocked: false,
    full_system_green_blocked: status !== "CODEXA_READY",
    summary_line: `${humanLabel}; local Ops can continue; full two-machine routing remains gated.`,
  };
}

async function main() {
  const chatHeartbeatPath = path.join(dataRoot, "chat-mirror", "listener-heartbeat.json");
  const chatHeartbeat = readJson(chatHeartbeatPath);
  const fullGreenPath = path.join(dataRoot, "gauntlet", "latest-orangebox-full-green.json");
  const fullGreen = readJson(fullGreenPath) || readJson(latestReceipt("orangebox-gauntlet-orangebox-full-green-") || "");
  const projectReportPath = path.join(dataRoot, "reports", "project", "latest-project-report.json");
  const projectReport = readJson(projectReportPath);
  const opsReadinessPath = latestReceipt("orangebox-ops-readiness-");
  const opsReadiness = readJson(opsReadinessPath || "");
  const atomsmasherIntakePath = path.join(dataRoot, "incoming", "atomsmasher-module-intake.json");
  const atomsmasherIntake = readJson(atomsmasherIntakePath);
  const atomsmasherDoctorPath = path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json");
  const atomsmasherDoctor = readJson(atomsmasherDoctorPath);
  const atomsmasherToolMergePath = path.join(dataRoot, "atomsmasher", "tool-merge", "latest-tool-merge.json");
  const atomsmasherToolMerge = readJson(atomsmasherToolMergePath);
  const strongarmDoctorPath = path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json");
  const strongarmDoctor = readJson(strongarmDoctorPath);
  const gremlinDoctorPath = path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json");
  const gremlinDoctor = readJson(gremlinDoctorPath);
  const triLaneRouterPath = path.join(dataRoot, "trilane", "latest-trilane-model-router.json");
  const triLaneRouter = readJson(triLaneRouterPath);
  const obox2PackPath = path.join(dataRoot, "obox2", "latest-internal-setup-pack.json");
  const obox2Pack = readJson(obox2PackPath);
  const obox2PackagePath = path.join(dataRoot, "obox2", "latest-package-doctor.json");
  const obox2Package = readJson(obox2PackagePath);
  const soulGenomePath = path.join(dataRoot, "knowledge", "soul-genome", "latest-soul-genome-doctor.json");
  const soulGenome = readJson(soulGenomePath);
  const knowledgeImprovementsPath = path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json");
  const knowledgeImprovements = readJson(knowledgeImprovementsPath);
  const harnessBenchmarkPath = path.join(dataRoot, "harness", "latest-harness-benchmark.json");
  const harnessBenchmark = readJson(harnessBenchmarkPath);
  const toolErgonomicsPath = path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json");
  const toolErgonomics = readJson(toolErgonomicsPath);
  const checkmatePath = path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json");
  const checkmate = readJson(checkmatePath);
  const codexaAlertPath = path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json");
  const codexaAlert = readJson(codexaAlertPath);
  const openclawRetirementPath = path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json");
  const openclawRetirement = readJson(openclawRetirementPath);
  const openclawStartupPath = path.join(userRoot, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "OpenClaw Gateway (atomeons).cmd");
  const restorePacketPath = path.join(dataRoot, "restore-packets", "ORANGEBOX_RESTORE_PACKET.latest.md");
  const bootstrapRoot = path.join(dataRoot, "bootstrap");

  const probes = {
    local_llama_health: await probe("http://127.0.0.1:8080/health", 1000),
    local_llama_models: await probe("http://127.0.0.1:8080/v1/models", 1000),
    ai_box_command_8097: await probe("http://10.0.99.1:8097/health", 1000),
    ai_box_wiki_8098: await probe("http://10.0.99.1:8098/health", 1000),
  };

  const chatFresh = chatHeartbeat?.ok === true && ageMs(chatHeartbeat.last_finished) !== null && ageMs(chatHeartbeat.last_finished) < 10 * 60 * 1000;
  const fullGreenOk = fullGreen?.ok === true || fullGreen?.summary?.status === "ORANGEBOX_FULL_GREEN_LOCAL_RUNTIME" || fullGreen?.status === "ORANGEBOX_FULL_GREEN_LOCAL_RUNTIME";
  const localOpsGreen = projectReport?.local_ops_green === true;
  const opsGreen = opsReadiness?.ok === true || opsReadiness?.status === "ORANGEBOX_OPS_RAILS_GREEN";
  const atomsmasherGreen = atomsmasherDoctor?.ok === true && atomsmasherDoctor?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN";
  const atomsmasherToolMergeGreen = atomsmasherToolMerge?.ok === true && atomsmasherToolMerge?.status === "ATOMSMASHER_TOOL_MERGE_GREEN";
  const strongarmGreen = strongarmDoctor?.ok === true && strongarmDoctor?.status === "STRONGARM_ORANGEBOX_GATE_GREEN";
  const gremlinGreen = gremlinDoctor?.ok === true && gremlinDoctor?.status === "GREMLIN_MISFITS_ELITE_GREEN";
  const triLaneGreen = triLaneRouter?.ok === true && triLaneRouter?.status === "TRILANE_ROUTER_PACK_GREEN";
  const obox2PackGreen = obox2Pack?.ok === true && obox2Pack?.status === "OBOX2_INTERNAL_SETUP_PACK_GREEN";
  const obox2PackageGreen = obox2Package?.ok === true && obox2Package?.status === "OBOX2_PACKAGE_VERIFIED_GREEN";
  const soulGenomeGreen = soulGenome?.ok === true && soulGenome?.status === "SOUL_GENOME_KNOWLEDGE_MAP_GREEN";
  const knowledgeImprovementsReady =
    knowledgeImprovements?.ok === true &&
    knowledgeImprovements?.status === "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY" &&
    knowledgeImprovements?.not_autonomous === true;
  const harnessBenchmarkGreen = harnessBenchmark?.ok === true && harnessBenchmark?.status === "ORANGEBOX_HARNESS_BENCHMARK_GREEN";
  const toolErgonomicsGreen = toolErgonomics?.ok === true && toolErgonomics?.status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN";
  const checkmateGreen = checkmate?.ok === true && checkmate?.status === "CHECKMATE_EVAL_LANE_GREEN";
  const openclawRetired = openclawRetirement?.status === "OPENCLAW_STARTUP_RETIRED" && !exists(openclawStartupPath);
  const warnings = [];
  if (!chatFresh) warnings.push("ChatBackup heartbeat is stale or missing.");
  if (!fullGreenOk) {
    warnings.push(localOpsGreen
      ? "Broad two-machine/system full-green is not green; local Ops remains green. Check project report for Codexa/Ollama/Hermes gaps."
      : "Latest full-green proof is missing or not green.");
  }
  if (!opsGreen) warnings.push("Latest Ops readiness receipt is missing or not green.");
  if (!probes.local_llama_health.ok) warnings.push("Local llama listener is not reachable.");
  if (!atomsmasherGreen) warnings.push("AtomSmasher full-scope backend integration proof is missing or not green.");
  if (!atomsmasherToolMergeGreen) warnings.push("AtomSmasher backend tool-merge proof is missing or not green.");
  if (!strongarmGreen) warnings.push("STRONGARM project pressure gate proof is missing or not green.");
  if (!gremlinGreen) warnings.push("Misfits/Gremlin elite packet dataset proof is missing or not green.");
  if (!triLaneGreen) warnings.push("Tri-lane model router proof is missing or not green.");
  if (!obox2PackGreen) warnings.push("OBOX2 internal Codexa setup pack is missing or not green.");
  if (!obox2PackageGreen) warnings.push("OBOX2 setup package has not passed package doctor.");
  if (!soulGenomeGreen) warnings.push("SOUL GENOME continuity map proof is missing or not green.");
  if (!knowledgeImprovementsReady) warnings.push("Knowledge Engine improvement candidate queue is missing or not green.");
  if (!harnessBenchmarkGreen) warnings.push("Offline harness benchmark proof is missing or not green.");
  if (!toolErgonomicsGreen) warnings.push("Tool ergonomics proof is missing or not green.");
  if (!codexaAlert?.status) warnings.push("Codexa/AI Box visible alert receipt is missing.");
  if (!openclawRetired) warnings.push("OpenClaw startup retirement is missing, stale, or the startup hook still exists.");
  if (!probes.ai_box_command_8097.ok) warnings.push("AI Box command rail 8097 is not reachable.");
  if (!probes.ai_box_wiki_8098.ok) warnings.push("AI Box wiki/receipt rail 8098 is not reachable.");

  const result = {
    ok: warnings.length === 0,
    version: "orangebox-reality-watch/v0",
    checked_at: new Date().toISOString(),
    status: warnings.length === 0 ? "ONE_REALITY_GREEN" : "ONE_REALITY_WITH_WARNINGS",
    doctrine: "The watcher reports what is actually reachable and recently proven. It does not promote claims from tools unless receipts or probes match reality.",
    doer_watcher_split: {
      doer: "Codex/Orangebox Ops scripts mutate and prove backend changes.",
      watcher: "Local deterministic watcher checks receipts, heartbeats, and local rails without paid model calls.",
      local_llm_policy:
        "Local LLM endpoint availability is checked every cycle. Generation is off by default; enable only for anomaly review or explicit operator request.",
    },
    lane_truth: {
      this_chat: "Orangebox Operations backend.",
      visual_product_lane:
        "Visual, media, website, shop, mobile, native, and dashboard outputs are valid Orangebox product lanes, but this chat does not touch them.",
      stale_skill_scan: "on-demand only via npm.cmd run skills:stale",
      bookmaker: "deferred",
      atomsmasher: "completed compression super-pack received as backend capability; validated by npm.cmd run atomsmasher:doctor.",
      atomsmasher_tool_merge: "backend tool-upgrade lane; validated by npm.cmd run atomsmasher:merge-tools.",
      strongarm_gate: "local draft pressure gate for keeping project work on the full productive path; validated by npm.cmd run strongarm:doctor.",
      gremlin_misfits: "elite 1k packet-training lane; validated by npm.cmd run gremlin:doctor; training is not claimed until a LoRA run produces receipts.",
      trilane_router: "visible registry + role map + routing policy; validated by npm.cmd run trilane:doctor.",
      obox2_internal_setup_pack: "operator-run Codexa/AI Box model install pack; generated by npm.cmd run obox2:pack.",
      obox2_package_doctor: "expanded zip verification; proves OBOX2 setup pack is structurally safe before operator runs it on Codexa.",
      soul_genome: "Knowledge Engine continuity map; not a model body, hidden ruler, rename, or training claim; validated by npm.cmd run soul:doctor.",
      knowledge_improvements:
        "receipt/report learner queue; candidates are observed, deduped, scored, and parked for operator approval; validated by npm.cmd run knowledge:improvements.",
      harness_benchmark:
        "offline oracle tasks with budgets, traces, and receipts; validates tool/routing/proof harness claims before promotion.",
      tool_ergonomics:
        "command/tool surface proof; validates distinct names, concise descriptions, bounded outputs, receipt-backed scripts, and backend-only constraints.",
      checkmate_eval_lane:
        "CHECKMATE eval proof; requires fixtures and canaries before prompt, model, routing, benchmark, or tool changes.",
      codexa_alert:
        "explicit AI Box/Codexa link alert; warns the operator when local Basic Install is green but Codexa rails/models are not usable.",
      openclaw_retirement: "legacy OpenClaw startup is retired surgically; rollback is the backup path in OrangeBox-Data.",
    },
    checks: {
      chatbackup: {
        ok: chatFresh,
        heartbeat_path: chatHeartbeatPath,
        heartbeat_age_ms: ageMs(chatHeartbeat?.last_finished),
        heartbeat: chatHeartbeat,
      },
      full_green: {
        ok: fullGreenOk,
        path: fullGreenPath,
        receipt_path: latestReceipt("orangebox-gauntlet-orangebox-full-green-"),
        status: fullGreen?.summary?.status || fullGreen?.status || null,
        note: "Broad two-machine/system gate. Local Ops can be green while this is red.",
      },
      project_report: {
        ok: Boolean(projectReport?.status),
        path: projectReportPath,
        status: projectReport?.status || null,
        local_ops_green: projectReport?.local_ops_green ?? null,
        full_project_green: projectReport?.full_project_green ?? null,
        gap_count: projectReport?.gap_count ?? null,
      },
      ops_readiness: {
        ok: opsGreen,
        receipt_path: opsReadinessPath,
        status: opsReadiness?.status || null,
      },
      restore_packet: {
        ok: exists(restorePacketPath),
        path: restorePacketPath,
      },
      bootstrap_exports: {
        ok: exists(bootstrapRoot),
        root: bootstrapRoot,
      },
      atomsmasher: {
        ok: atomsmasherGreen,
        doctor_path: atomsmasherDoctorPath,
        intake_path: atomsmasherIntakePath,
        intake_status: atomsmasherIntake?.status || null,
        status: atomsmasherDoctor?.summary?.status || null,
        features_registered: atomsmasherDoctor?.summary?.features_registered || 0,
        features_ok: atomsmasherDoctor?.summary?.features_ok || 0,
        schema_version: atomsmasherDoctor?.summary?.schema_version || null,
      },
      atomsmasher_tool_merge: {
        ok: atomsmasherToolMergeGreen,
        path: atomsmasherToolMergePath,
        status: atomsmasherToolMerge?.status || null,
        eligible_backend_tools: atomsmasherToolMerge?.manifest?.totals?.eligible_backend_tools || 0,
        excluded_visual_or_product_lane: atomsmasherToolMerge?.manifest?.totals?.excluded_visual_or_product_lane || 0,
      },
      atomsmasher_intake: {
        ok: atomsmasherGreen || atomsmasherIntake?.status === "WAITING_FOR_HEAVY_SPEC",
        path: atomsmasherIntakePath,
        status: atomsmasherIntake?.status || null,
      },
      strongarm_gate: {
        ok: strongarmGreen,
        path: strongarmDoctorPath,
        status: strongarmDoctor?.status || null,
        default_mode: strongarmDoctor?.project_gate_policy?.default_mode || null,
        integration_root: strongarmDoctor?.integration_root || null,
      },
      gremlin_misfits: {
        ok: gremlinGreen,
        path: gremlinDoctorPath,
        status: gremlinDoctor?.status || null,
        rows: gremlinDoctor?.elite_proof?.rows || null,
        training_status: gremlinDoctor?.training?.status || null,
      },
      trilane_router: {
        ok: triLaneGreen,
        path: triLaneRouterPath,
        status: triLaneRouter?.status || null,
        core_installed_count: triLaneRouter?.availability?.core_installed_count || 0,
        core_total: triLaneRouter?.availability?.core_total || 0,
        codexa_status_note: triLaneRouter?.codexa_status_note || null,
      },
      obox2_internal_setup_pack: {
        ok: obox2PackGreen,
        path: obox2PackPath,
        status: obox2Pack?.status || null,
        zip_path: obox2Pack?.zip_path || null,
      },
      obox2_package_doctor: {
        ok: obox2PackageGreen,
        path: obox2PackagePath,
        status: obox2Package?.status || null,
        extracted_dir: obox2Package?.extracted_dir || null,
        zip_path: obox2Package?.zip_path || null,
      },
      soul_genome: {
        ok: soulGenomeGreen,
        path: soulGenomePath,
        status: soulGenome?.status || null,
        decision: soulGenome?.decision || null,
        genome_hash: soulGenome?.genome_hash || null,
        layer_count: soulGenome?.layers?.length || 0,
      },
      knowledge_improvements: {
        ok: knowledgeImprovementsReady,
        path: knowledgeImprovementsPath,
        status: knowledgeImprovements?.status || null,
        candidate_count: knowledgeImprovements?.candidate_count || 0,
        not_autonomous: knowledgeImprovements?.not_autonomous || false,
        top_candidate: knowledgeImprovements?.candidates?.[0] || null,
      },
      harness_benchmark: {
        ok: harnessBenchmarkGreen,
        path: harnessBenchmarkPath,
        status: harnessBenchmark?.status || null,
        tasks_total: harnessBenchmark?.tasks_total || 0,
        tasks_ok: harnessBenchmark?.tasks_ok || 0,
        score: harnessBenchmark?.score ?? null,
        suite_hash: harnessBenchmark?.suite_hash || null,
      },
      tool_ergonomics: {
        ok: toolErgonomicsGreen,
        path: toolErgonomicsPath,
        status: toolErgonomics?.status || null,
        command_count: toolErgonomics?.command_surface?.command_count || 0,
        failures: toolErgonomics?.failures?.length ?? null,
      },
      checkmate_eval_lane: {
        ok: checkmateGreen,
        path: checkmatePath,
        status: checkmate?.status || null,
        fixtures_total: checkmate?.fixtures?.length || 0,
        failures: checkmate?.failures?.length ?? null,
      },
      codexa_alert: {
        ok: Boolean(codexaAlert?.status),
        path: codexaAlertPath,
        status: codexaAlert?.status || null,
        popup_notified: codexaAlert?.popup?.notified || false,
        message: codexaAlert?.message || null,
        signal_hygiene: codexaSignalHygiene(codexaAlert),
      },
      openclaw_retirement: {
        ok: openclawRetired,
        path: openclawRetirementPath,
        status: openclawRetirement?.status || null,
        startup_path: openclawStartupPath,
        startup_hook_present: exists(openclawStartupPath),
        backup_dir: openclawRetirement?.backup_dir || null,
      },
      probes,
    },
    warnings,
  };

  fs.mkdirSync(watchRoot, { recursive: true });
  const latestPath = path.join(watchRoot, "latest-reality-watch.json");
  const heartbeatPath = path.join(watchRoot, "watcher-heartbeat.json");
  fs.writeFileSync(latestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  fs.writeFileSync(heartbeatPath, `${JSON.stringify({ ok: true, checked_at: result.checked_at, status: result.status, warnings: result.warnings }, null, 2)}\n`, "utf8");
  result.latest_path = latestPath;
  result.heartbeat_path = heartbeatPath;

  if (receipt) {
    fs.mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `orangebox-reality-watch-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  console.log(json ? JSON.stringify(result, null, 2) : result.status);
}

main();
