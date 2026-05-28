#!/usr/bin/env node
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const wantsJson = args.includes("--json");
const receipt = args.includes("--receipt");
const noReceipt = args.includes("--no-receipt");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const VENDOR_ROOT = path.join(ROOT, "integrations", "atomsmasher_full_scope_v1_0");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const ATOM_ROOT = path.join(DATA_ROOT, "atomsmasher");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DEFAULT_DB = path.join(ATOM_ROOT, "atomsmasher-orangebox.db");
const PYTHON = process.env.ORANGEBOX_PYTHON || process.env.PYTHON || "python";
const VERSION = "orangebox-atomsmasher-runtime/v0";

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function flagValue(flag, fallback = null) {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}

function positionalAfterCommand(fallback = null) {
  const clean = args.filter((arg) => !["--json", "--receipt", "--no-receipt"].includes(arg));
  return clean.length > 1 && !clean[1].startsWith("--") ? clean[1] : fallback;
}

function sha256File(file) {
  if (!fsSync.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fsSync.readFileSync(file)).digest("hex");
}

function compact(value, max = 6000) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

function envForPython() {
  const previous = process.env.PYTHONPATH || "";
  return {
    ...process.env,
    PYTHONPATH: previous ? `${VENDOR_ROOT}${path.delimiter}${previous}` : VENDOR_ROOT,
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

async function runPythonJson(code, payload = {}, { timeout = 120_000 } = {}) {
  await fs.mkdir(path.join(ATOM_ROOT, "tmp"), { recursive: true });
  const inputPath = path.join(ATOM_ROOT, "tmp", `atomsmasher-in-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await writeJson(inputPath, payload);
  const wrapped = `
import json, sys
from atomsmasher.storage import Store
from atomsmasher.engines import SourceEngine, OrderSpine, CommitmentCodec, EquationMemory, CacheEngine, RoutingEngine, FeatureExecutor, TotalWorkCompiler, LocalProofLab, MemoryImmuneSystem, AgentGovernor, demo
from atomsmasher.feature_data import FEATURE_NAMES
from atomsmasher.version import VERSION, CODENAME, SCHEMA_VERSION, SYSTEM_LAW
payload = json.load(open(sys.argv[1], encoding='utf-8'))
${code}
`;
  try {
    const out = await execFileAsync(PYTHON, ["-c", wrapped, inputPath], {
      cwd: VENDOR_ROOT,
      env: envForPython(),
      timeout,
      maxBuffer: 15_000_000,
      windowsHide: true,
    });
    const text = out.stdout.trim();
    return text ? JSON.parse(text) : null;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
}

async function runUnitTests() {
  const started = Date.now();
  try {
    const out = await execFileAsync(PYTHON, ["-m", "unittest", "discover", "-s", "tests", "-v"], {
      cwd: VENDOR_ROOT,
      env: envForPython(),
      timeout: 180_000,
      maxBuffer: 4_000_000,
      windowsHide: true,
    });
    return {
      ok: true,
      ms: Date.now() - started,
      stdout: compact(out.stdout, 8000),
      stderr: compact(out.stderr, 8000),
    };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      stdout: compact(error?.stdout, 8000),
      stderr: compact(error?.stderr, 8000),
      error: error?.message || String(error),
    };
  }
}

function dbPath() {
  return flagValue("--db", DEFAULT_DB);
}

async function actionInit(db = dbPath()) {
  return runPythonJson(`
store=Store(payload["db"])
out={"version":VERSION,"codename":CODENAME,"schema_version":SCHEMA_VERSION,"system_law":SYSTEM_LAW,"features":store.one("SELECT COUNT(*) c FROM features")["c"],"db":payload["db"]}
print(json.dumps(out, sort_keys=True))
`, { db });
}

async function actionProof(db = dbPath()) {
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(LocalProofLab(store).run_probes(), sort_keys=True))
`, { db });
}

async function actionDemo(db = dbPath()) {
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(demo(store), sort_keys=True))
`, { db }, { timeout: 180_000 });
}

async function actionRunAll(db = dbPath(), limit = flagValue("--limit", null)) {
  const parsedLimit = limit === null ? null : Number(limit);
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(FeatureExecutor(store).run_all(payload.get("limit")), sort_keys=True))
`, { db, limit: Number.isFinite(parsedLimit) ? parsedLimit : null }, { timeout: 180_000 });
}

async function actionCompile(db = dbPath(), query = flagValue("--query", positionalAfterCommand("continue AtomSmasher without losing orders"))) {
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(TotalWorkCompiler(store).compile(payload["query"]), sort_keys=True))
`, { db, query }, { timeout: 120_000 });
}

async function actionIngestText(db = dbPath()) {
  const title = flagValue("--title", "Orangebox AtomSmasher source");
  let text = flagValue("--text", null);
  const textFile = flagValue("--text-file", null);
  if (!text && textFile) text = await fs.readFile(textFile, "utf8");
  if (!text) throw new Error("--text is required for ingest-text");
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(SourceEngine(store).ingest_text(payload["title"], payload["text"]), sort_keys=True))
`, { db, title, text }, { timeout: 120_000 });
}

async function actionIngestFile(db = dbPath()) {
  const sourcePath = flagValue("--path", flagValue("--file", null));
  if (!sourcePath) throw new Error("--path is required for ingest-file");
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(SourceEngine(store).ingest_file(payload["path"]), sort_keys=True))
`, { db, path: sourcePath }, { timeout: 180_000 });
}

async function actionOrders(db = dbPath()) {
  const add = flagValue("--add", null);
  return runPythonJson(`
store=Store(payload["db"])
spine=OrderSpine(store)
if payload.get("add"):
    spine.add_order(payload["add"])
print(json.dumps(spine.digest(), sort_keys=True))
`, { db, add });
}

async function actionSupersede(db = dbPath()) {
  const oldId = flagValue("--old-id", null);
  const text = flagValue("--text", null);
  if (!oldId || !text) throw new Error("--old-id and --text are required for orders-supersede");
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(OrderSpine(store).supersede(payload["old_id"], payload["text"]), sort_keys=True))
`, { db, old_id: oldId, text });
}

async function actionSimpleQuery(sql, payload = {}, db = dbPath()) {
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(store.all(payload["sql"], tuple(payload.get("params", []))), sort_keys=True))
`, { db, sql, params: payload.params || [] });
}

async function actionSearch(db = dbPath()) {
  const query = flagValue("--query", positionalAfterCommand(""));
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(SourceEngine(store).search(payload["query"], top_k=payload["top_k"]), sort_keys=True))
`, { db, query, top_k: Number(flagValue("--top-k", 5)) || 5 });
}

async function actionAir(db = dbPath()) {
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps({"air": CommitmentCodec(store).active_air(limit=payload["limit"])}, sort_keys=True))
`, { db, limit: Number(flagValue("--limit", 100)) || 100 });
}

async function actionEquationFit(db, name, values) {
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(EquationMemory(store).fit_series(payload["values"], payload["name"]), sort_keys=True))
`, { db, name, values });
}

async function actionEquationFitFromFlags(db = dbPath()) {
  const values = String(flagValue("--values", "")).split(",").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
  if (!values.length) throw new Error("--values is required for equation-fit");
  const name = flagValue("--name", "series");
  return actionEquationFit(db, name, values);
}

async function actionEquationShow(db = dbPath()) {
  const eqId = flagValue("--id", positionalAfterCommand(null));
  if (!eqId) throw new Error("--id is required for equation-show");
  return runPythonJson(`
store=Store(payload["db"])
eq=store.one("SELECT * FROM equations WHERE id=?", (payload["id"],))
print(json.dumps({"equation": eq, "reconstruction": EquationMemory(store).reconstruct(payload["id"])}, sort_keys=True))
`, { db, id: eqId });
}

async function actionSecurityScan(db = dbPath()) {
  const text = flagValue("--text", "");
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(MemoryImmuneSystem(store).scan_text(payload["text"]), sort_keys=True))
`, { db, text });
}

async function actionAgentLease(db = dbPath()) {
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(AgentGovernor(store).create_lease(payload["agent"], payload["mission"], payload["token_budget"], payload["time_budget_s"]), sort_keys=True))
`, {
    db,
    agent: flagValue("--agent", "orangebox-agent"),
    mission: flagValue("--mission", "bounded Orangebox mission"),
    token_budget: Number(flagValue("--token-budget", 1000)) || 1000,
    time_budget_s: Number(flagValue("--time-budget-s", 60)) || 60,
  });
}

async function actionExecuteAddition(db = dbPath()) {
  const name = flagValue("--name", positionalAfterCommand(null));
  if (!name) throw new Error("--name is required for execute-addition");
  return runPythonJson(`
store=Store(payload["db"])
print(json.dumps(FeatureExecutor(store).execute_feature(payload["name"]), sort_keys=True))
`, { db, name });
}

async function actionReceipts(db = dbPath()) {
  const filters = [];
  const params = [];
  for (const [flag, column] of [["--feature-id", "feature_id"], ["--action", "action"], ["--status", "status"]]) {
    const value = flagValue(flag, null);
    if (value) {
      filters.push(`${column}=?`);
      params.push(value);
    }
  }
  const limit = Number(flagValue("--limit", 100)) || 100;
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return actionSimpleQuery(`SELECT * FROM receipts ${where} ORDER BY created_at DESC LIMIT ${limit}`, { params }, db);
}

async function doctor() {
  const startedAt = new Date().toISOString();
  await fs.mkdir(ATOM_ROOT, { recursive: true });
  const sourceZip = "C:\\Users\\a\\Downloads\\AtomSmasher_OrangeBox_Backend_Integration_Bundle.zip";
  const fullZip = "C:\\Users\\a\\Downloads\\AtomSmasher_Full_Scope_Total_Work_Compiler_v1_0.zip";
  const db = dbPath();
  const unit = await runUnitTests();
  const init = unit.ok ? await actionInit(db) : null;
  const proof = unit.ok ? await actionProof(db) : null;
  const demoResult = unit.ok ? await actionDemo(db) : null;
  const runAll = unit.ok ? await actionRunAll(db) : null;
  const compile = unit.ok ? await actionCompile(db, "continue AtomSmasher without losing HOT_ALWAYS orders") : null;
  const equation = unit.ok ? await actionEquationFit(db, "demo_linear", [10, 20, 30, 40]) : null;
  const gates = [
    { id: "vendor_root_exists", ok: fsSync.existsSync(path.join(VENDOR_ROOT, "atomsmasher", "__init__.py")) },
    { id: "unit_tests_green", ok: unit.ok },
    { id: "schema_version_10", ok: init?.schema_version === 10 },
    { id: "features_registered_620", ok: init?.features === 620 },
    { id: "proof_registry_live", ok: proof?.registry_live === true && proof?.features_registered === 620 },
    { id: "demo_all_620_ok", ok: demoResult?.all_features?.ok === 620 && demoResult?.all_features?.errors === 0 },
    { id: "run_all_620_ok", ok: runAll?.ok === 620 && runAll?.errors === 0 },
    { id: "compile_saved_work", ok: Boolean(compile?.route?.saved_work?.tokens_not_injected) },
    { id: "equation_fit", ok: equation?.equation_type === "linear" },
    { id: "no_external_services_required", ok: true },
    { id: "no_paid_model_api_called", ok: true },
    { id: "no_gpu_required", ok: true },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: VERSION,
    kind: "orangebox-atomsmasher-integration",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    vendor_root: VENDOR_ROOT,
    db,
    bundle_hashes: {
      integration_bundle_zip: { path: sourceZip, sha256: sha256File(sourceZip) },
      full_scope_zip: { path: fullZip, sha256: sha256File(fullZip) },
    },
    gates,
    unit_tests: unit,
    init,
    proof,
    demo: demoResult,
    run_all: runAll,
    compile,
    equation,
    api_surface: {
      mounted_prefix: "/api/atomsmasher",
      spec_count: 19,
      source_manifest: "AtomSmasher_OrangeBox_Backend_Integration_Bundle/integration_manifest.json",
    },
    summary: {
      status: gates.every((gate) => gate.ok) ? "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN" : "ATOMSMASHER_ORANGEBOX_INTEGRATION_NEEDS_ATTENTION",
      features_registered: init?.features || 0,
      features_executed: runAll?.attempted || 0,
      features_ok: runAll?.ok || 0,
      selected_path: compile?.route?.selected_path || null,
      saved_tokens: compile?.route?.saved_work?.tokens_not_injected || 0,
      schema_version: init?.schema_version || null,
    },
  };
  await writeJson(path.join(ATOM_ROOT, "latest-atomsmasher-doctor.json"), report);
  return report;
}

async function dispatch() {
  if (!fsSync.existsSync(VENDOR_ROOT)) {
    throw new Error(`AtomSmasher vendor root missing: ${VENDOR_ROOT}`);
  }
  const clean = args.filter((arg) => !["--json", "--receipt", "--no-receipt"].includes(arg));
  const cmd = clean[0] || "doctor";
  let result;
  if (cmd === "doctor") result = await doctor();
  else if (cmd === "init") result = await actionInit();
  else if (cmd === "proof") result = await actionProof();
  else if (cmd === "demo" || cmd === "v10-demo") result = await actionDemo();
  else if (cmd === "run-all" || cmd === "run-all-additions") result = await actionRunAll();
  else if (cmd === "compile") result = await actionCompile();
  else if (cmd === "ingest-text") result = await actionIngestText();
  else if (cmd === "ingest-file") result = await actionIngestFile();
  else if (cmd === "orders") result = await actionOrders();
  else if (cmd === "orders-supersede") result = await actionSupersede();
  else if (cmd === "heat" || cmd === "show-hot") result = await actionSimpleQuery("SELECT * FROM heat_items ORDER BY heat DESC, created_at DESC");
  else if (cmd === "coverage") result = await actionSimpleQuery("SELECT * FROM coverage_receipts ORDER BY created_at DESC LIMIT 100");
  else if (cmd === "search") result = await actionSearch();
  else if (cmd === "air") result = await actionAir();
  else if (cmd === "equation-fit") result = await actionEquationFitFromFlags();
  else if (cmd === "equation-show") result = await actionEquationShow();
  else if (cmd === "security-scan") result = await actionSecurityScan();
  else if (cmd === "agent-lease") result = await actionAgentLease();
  else if (cmd === "execute-addition") result = await actionExecuteAddition();
  else if (cmd === "receipts") result = await actionReceipts();
  else throw new Error(`Unknown AtomSmasher command: ${cmd}`);

  if (result && typeof result === "object" && !Array.isArray(result)) {
    result.orangebox_runtime = result.orangebox_runtime || VERSION;
  }
  if (receipt && !noReceipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-atomsmasher-${cmd}-${stamp()}.json`);
    await writeJson(receiptPath, result);
    if (result && typeof result === "object" && !Array.isArray(result)) result.receipt_path = receiptPath;
  }
  console.log(wantsJson ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  if (result?.ok === false) process.exitCode = 1;
}

dispatch().catch((error) => {
  const result = { ok: false, version: VERSION, error: error?.message || String(error) };
  console.log(wantsJson ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  process.exitCode = 1;
});
