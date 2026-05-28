#!/usr/bin/env node
// v5.0.1 alpha applied — Phase 1+2+3:
//   • Compound intelligence endpoint (was missing)
//   • Skil.Ski MCP add endpoint (was missing)
//   • Settings/Hermes status endpoints (were missing)
//   • Cache pre-warm + router estimate (Phase 2 alpha)
//   • Memory tool client-side routes (6) — Anthropic memory_20250818
//   • Memory tool auto-attached on chat/inline_edit/multi_file_edit/architecture/pr_review
//   • Structured outputs on 4 endpoints (composer/voice-intent/trilane-conflicts/terminal-suggest)
//   • 1-hour TTL on vault documents
//   • Compaction for long-chat tasks
//   • Telemetry opt-in (4 endpoints, OFF by default)
//   • Auto-update check + manifest endpoints
//   • Codexa per-tenant Ed25519 token issue/revoke/list (admin-token-gated)
//   • Pass-through of smart-router fields: tools_prepend, system_prepend, user_prepend, beta_headers, output_config, thinking
// See docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md
/* ============================================================================
   v4-server-routes.mjs — ORANGEBOX v4 API Route Handler

   Doctrine anchor : docs/V4_MOAT_DOCTRINE.md  (ATOM-OBX-V4-MOAT-2026-0516)
   Phase slot      : v5.0.1 — Phase 1+2+3 alpha
   Author          : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date            : 2026-05-16
   Mom's Law       : Full effort. No stubs. No coasting.

   Usage
   ─────
   import { attachV4Routes } from "./v4/v4-server-routes.mjs";
   const v4 = attachV4Routes({ getDataRoot: () => DATA_ROOT });
   // In main router:
   if (req.url.startsWith("/api/v4/")) return v4(req, res);

   All endpoints return JSON unless documented as SSE or WS.
   Every outbound model call records egress via privacy-audit.
   Every meaningful side-effect emits a receipt.
   Zero npm dependencies — Node built-ins only.
   ============================================================================ */

import https    from "node:https";
import http     from "node:http";
import fs       from "node:fs/promises";
import fssync   from "node:fs";
import path     from "node:path";
import os       from "node:os";
import crypto   from "node:crypto";
import { spawn }          from "node:child_process";
import { fileURLToPath }  from "node:url";

// ── Resolve script directory for relative imports ──────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Lazy module cache — import once, reuse ─────────────────────────────────────
let _router      = null;
let _queue       = null;
let _privacy     = null;
let _whisper     = null;
let _compound    = null;
let _memoryHandler = null;

async function getRouter() {
  if (!_router) _router = await import("./router/smart-model-router.mjs");
  return _router;
}
async function getQueue() {
  if (!_queue) _queue = await import("./queue/bg-agent-queue.mjs");
  return _queue;
}
async function getPrivacy() {
  if (!_privacy) _privacy = await import("./privacy-audit.mjs");
  return _privacy;
}
async function getWhisper() {
  if (!_whisper) _whisper = await import("./voice/whisper-runner.mjs");
  return _whisper;
}
async function getCompound() {
  if (!_compound) _compound = await import("./compound-intelligence.mjs");
  return _compound;
}
async function getMemoryHandler() {
  if (!_memoryHandler) _memoryHandler = await import("./memory-tool-handler.mjs");
  return _memoryHandler;
}

// ── Env keys ───────────────────────────────────────────────────────────────────
// v6.0.1 — keys are `let` so POST /api/v4/settings/api-keys can hot-set them.
// refreshKeys() reloads from process.env after writes.
let ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY    || "";
let OPENAI_KEY       = process.env.OPENAI_API_KEY       || "";
let GOOGLE_KEY       = process.env.GOOGLE_API_KEY       || "";
let OPENROUTER_KEY   = process.env.OPENROUTER_API_KEY   || "";
let GROQ_KEY         = process.env.GROQ_API_KEY         || "";
let XAI_KEY          = process.env.XAI_API_KEY          || "";
let OLLAMA_HOST      = process.env.OLLAMA_HOST          || "http://127.0.0.1:11434";
function refreshKeys() {
  ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY  || "";
  OPENAI_KEY     = process.env.OPENAI_API_KEY     || "";
  GOOGLE_KEY     = process.env.GOOGLE_API_KEY     || "";
  OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
  GROQ_KEY       = process.env.GROQ_API_KEY       || "";
  XAI_KEY        = process.env.XAI_API_KEY        || "";
  OLLAMA_HOST    = process.env.OLLAMA_HOST        || "http://127.0.0.1:11434";
}

// Load persisted api-keys.env at module init so the buyer's saved keys
// survive restarts. Best-effort — failures are silently tolerated.
try {
  const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
  const persistedFile = path.join(dataRoot, "settings", "api-keys.env");
  if (fssync.existsSync(persistedFile)) {
    const text = fssync.readFileSync(persistedFile, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    refreshKeys();
  }
} catch { /* ignore */ }
const GROQ_MODEL_DEFAULT   = "llama-3.3-70b-versatile";
const OLLAMA_MODEL_DEFAULT = "qwen2.5:7b";
// SEC-010: Codexa admin token — never expose in responses, only presence-checked.
const ORANGEBOX_ADMIN_TOKEN = process.env.ORANGEBOX_ADMIN_TOKEN || "";

// ── appRoot: two directories up from scripts/v4/ ───────────────────────────────
const appRoot = path.resolve(__dirname, "..", "..");

// ── Cache pre-warm module-scope tracker ────────────────────────────────────────
// Reject re-warm within 240 seconds.
let _lastWarmedAt = 0;
const PREWARM_COOLDOWN_MS = 240_000;

// ── Router estimate pricing (per MTok, in USD) ─────────────────────────────────
// Opus 4.7 $5/$25, Sonnet 4.5 $3/$15, Haiku 4.5 $1/$5
const ROUTER_ESTIMATE_PRICING = {
  "claude-opus-4-7":    { inp: 5,  out: 25 },
  "claude-sonnet-4-5":  { inp: 3,  out: 15 },
  "claude-haiku-4-5":   { inp: 1,  out: 5  },
};

// ── Canonical prewarm system prompt ───────────────────────────────────────────
const PREWARM_SYSTEM_PROMPT =
  "You are ORANGEBOX, the operator AI OS. " +
  "You have compound intelligence, vault recall, mistakes avoidance, and agent orchestration. " +
  "Always answer from the operator's vault and memory before claiming ignorance. " +
  "IMPORTANT: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE. " +
  "MEMORY PROTOCOL: 1. Use the view command of your memory tool to check for earlier progress. " +
  "2. Work on the task. 3. Record progress in memory.";

// SEC-003: Terminal WS auth token — generated at boot if not set in env.
// The client must send: Sec-WebSocket-Protocol: orangebox-v4.<token>
const TERMINAL_TOKEN = process.env.ORANGEBOX_TERMINAL_TOKEN || (() => {
  const t = crypto.randomBytes(32).toString("hex");
  // Emit once at boot so the local operator knows the token.
  process.stderr.write(`[v4-server-routes] ORANGEBOX_TERMINAL_TOKEN not set — generated: ${t}\n`);
  return t;
})();

// SEC-004: Shell whitelist for terminal WS ?shell= parameter.
const ALLOWED_SHELLS = new Set(["bash", "sh", "powershell", "pwsh", "zsh", "fish", "cmd"]);

// Model IDs used by v4 routes
const ANTHROPIC_MODEL_DEFAULT = "claude-sonnet-4-5-20251015";
const OPENAI_MODEL_DEFAULT    = "gpt-5";
const GOOGLE_MODEL_DEFAULT    = "gemini-1.5-pro-002";
const XAI_MODEL_DEFAULT       = "grok-2";

// ── HTML escape helper ─────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

// ── UUID helper ────────────────────────────────────────────────────────────────
function uuidv4() {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────
// SEC-001: CORS allowlist — no wildcard.
// Allowed: http://localhost[:<port>], http://127.0.0.1[:<port>], tauri://localhost
const CORS_ORIGIN_RE = /^(https?:\/\/(?:localhost|127\.0\.0\.1)(:\d+)?|tauri:\/\/localhost)$/i;

function cors(res, req) {
  const origin = req?.headers?.origin || "";
  if (origin && CORS_ORIGIN_RE.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  // If origin is absent or not on the allowlist, no ACAO header is emitted (blocks cross-origin).
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Sec-WebSocket-Protocol");
}

function sendJSON(res, obj, status = 200, req = null) {
  cors(res, req);
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, msg, status = 400, req = null) {
  sendJSON(res, { ok: false, error: msg }, status, req);
}

async function freezeAllBlock(operation) {
  const fz = await import("./freeze-guard.mjs");
  const gate = fz.dispatchAllowed(operation);
  return gate.allowed ? null : gate;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 4_194_304) { req.destroy(); return reject(new Error("Request body too large (4MB max)")); }
      chunks.push(c);
    });
    req.on("end",   () => {
      try { resolve(Buffer.concat(chunks).toString("utf8")); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

async function parseJSONBody(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); }
  catch { throw new Error("Invalid JSON body"); }
}

function urlParams(url) {
  const u = new URL(url, "http://localhost");
  return u.searchParams;
}

// ── Receipt emitter ────────────────────────────────────────────────────────────
async function emitReceipt(dataRoot, { source, title, summary, evidence, ts }) {
  const id  = uuidv4();
  const dir = path.join(dataRoot, "receipts", "v4");
  await fs.mkdir(dir, { recursive: true });
  const rec = {
    id,
    source: source || "v4-server",
    title:  title  || "v4 event",
    summary:  summary  || "",
    evidence: evidence || {},
    ts: ts || new Date().toISOString(),
  };
  const p = path.join(dir, `${id}.json`);
  await fs.writeFile(p, JSON.stringify(rec, null, 2), "utf8");
  return { id, path: p };
}

async function readLatestFinalGreenBoardReceipt() {
  const dir = path.join(appRoot, "receipts");
  if (!fssync.existsSync(dir)) {
    return {
      ok: false,
      found: false,
      error: "No ORANGEBOX receipts directory found.",
      receipts_dir: dir,
    };
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^orangebox-final-green-board-\d{8}T\d{6}\.json$/i.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    const stat = await fs.stat(file);
    candidates.push({ file, mtimeMs: stat.mtimeMs, modified_at: stat.mtime.toISOString(), bytes: stat.size });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = candidates[0];
  if (!latest) {
    return {
      ok: false,
      found: false,
      receipts_dir: dir,
      error: "No final proof board receipt has been written yet.",
    };
  }
  const raw = await fs.readFile(latest.file, "utf8");
  const board = JSON.parse(raw.replace(/^\uFEFF/, ""));
  const checks = Array.isArray(board.checks) ? board.checks : [];
  const packageManifestPath = board.rollback?.package_manifest || null;
  let packageManifest = null;
  if (packageManifestPath && fssync.existsSync(packageManifestPath)) {
    try {
      const packageRaw = await fs.readFile(packageManifestPath, "utf8");
      const manifest = JSON.parse(packageRaw.replace(/^\uFEFF/, ""));
      packageManifest = {
        path: packageManifestPath,
        version: manifest.version || null,
        timestamp: manifest.timestamp || null,
        zip_path: manifest.zip_path || null,
        zip_size: manifest.zip_size || null,
        zip_sha256: manifest.zip_sha256 || null,
        exe_sha256: manifest.exe_sha256 || null,
        ethereal_ai_link: manifest.ethereal_ai_link ? {
          included: !!manifest.ethereal_ai_link.included,
          zip_relative_dir: manifest.ethereal_ai_link.zip_relative_dir || null,
          approval_required_for_apply: manifest.ethereal_ai_link.approval_required_for_apply !== false,
          token_file_shipped: !!manifest.ethereal_ai_link.token_file_shipped,
        } : null,
      };
    } catch (error) {
      packageManifest = {
        path: packageManifestPath,
        error: error?.message || String(error),
      };
    }
  }
  const summarizeServiceFreshnessEvidence = (check) => {
    if (check?.name !== "service_freshness") return undefined;
    const evidence = check.evidence || {};
    const summary = evidence.summary || null;
    const sourceRoutes = Array.isArray(evidence.source_routes)
      ? evidence.source_routes.slice(0, 8).map((route) => ({
        id: route.id || null,
        path: route.path || null,
        present: route.present === true,
        diagnosis: route.diagnosis || null,
        file: route.file || null,
      }))
      : [];
    const failures = Array.isArray(evidence.failures)
      ? evidence.failures.slice(0, 8).map((failure) => ({
        id: failure.id || null,
        method: failure.method || null,
        path: failure.path || null,
        purpose: failure.purpose || null,
        status: failure.status ?? null,
        diagnosis: failure.diagnosis || null,
        source_route: failure.source_route ? {
          checked: failure.source_route.checked === true,
          present: failure.source_route.present === true,
          file: failure.source_route.file || null,
          route: failure.source_route.route || failure.source_route.path || null,
          diagnosis: failure.source_route.diagnosis || null,
        } : null,
      }))
      : [];
    const recovery = evidence.recovery ? {
      status: evidence.recovery.status || null,
      read_only: evidence.recovery.read_only !== false,
      no_data_deletion_required: evidence.recovery.no_data_deletion_required === true,
      restart_is_operator_action: evidence.recovery.restart_is_operator_action === true,
      action: evidence.recovery.action || null,
      stale_installed_routes: Array.isArray(evidence.recovery.stale_installed_routes)
        ? evidence.recovery.stale_installed_routes.slice(0, 8).map((route) => ({
          id: route.id || null,
          path: route.path || null,
          source_file: route.source_file || null,
        }))
        : [],
    } : null;

    return {
      ok: evidence.ok === true,
      version: evidence.version || null,
      status: evidence.status || check.status || null,
      read_only: evidence.read_only !== false,
      summary,
      source_routes: sourceRoutes,
      failures,
      recovery,
      recovery_action: evidence.recovery_action || null,
      safe_commands: Array.isArray(evidence.safe_commands) ? evidence.safe_commands.slice(0, 6) : [],
      receipt_path: evidence.receipt_path || null,
    };
  };
  const summarizeVisualProofEvidence = (check) => {
    const evidence = check.evidence || {};
    const screenshots = Array.isArray(evidence.screenshots)
      ? evidence.screenshots
        .filter((shot) => shot?.path)
        .slice(0, 8)
        .map((shot) => ({
          name: shot.name || null,
          width: shot.width || null,
          height: shot.height || null,
          path: shot.path,
          exists: shot.exists === true,
          ok: shot.ok !== false,
          bytes: shot.bytes || null,
        }))
      : [];
    if (!screenshots.length && !evidence.receipt_path && !evidence.proof_dir) return undefined;
    return {
      ok: evidence.ok === true,
      version: evidence.version || null,
      summary: evidence.summary || null,
      screenshots,
      proof_dir: evidence.proof_dir || null,
      receipt_path: evidence.receipt_path || null,
    };
  };
  const summarizeCheckEvidence = (check) => {
    if (check?.name === "service_freshness") return summarizeServiceFreshnessEvidence(check);
    if (check?.name === "ae_see_suite_visual_proof" || check?.name === "ae_operations_visual_proof") {
      return summarizeVisualProofEvidence(check);
    }
    return undefined;
  };
  return {
    ok: board.ok === true,
    found: true,
    version: board.version || "orangebox-final-green-board/v1",
    receipt_path: latest.file,
    receipt_modified_at: latest.modified_at,
    receipt_bytes: latest.bytes,
    started_at: board.started_at || null,
    finished_at: board.finished_at || null,
    full: !!board.full,
    require_clean: !!board.require_clean,
    summary: board.summary || {},
    product_language: board.product_language || null,
    package_manifest: packageManifestPath,
    package: packageManifest,
    failures: Array.isArray(board.failures) ? board.failures.map((failure) => ({
      name: failure.name || "failure",
      status: failure.status || null,
      error: failure.error || failure.evidence?.error || null,
    })).slice(0, 12) : [],
    advisories: Array.isArray(board.advisories) ? board.advisories.slice(0, 12) : [],
    checks: checks.map((check) => {
      const evidence = summarizeCheckEvidence(check);
      return {
        name: check.name,
        ok: check.ok === true,
        status: check.status || (check.ok ? "pass" : "fail"),
        required: check.required !== false,
        duration_ms: check.duration_ms || 0,
        summary: check.evidence?.summary || (check.name === "git_state" ? {
          clean: check.evidence?.clean,
          status_count: check.evidence?.status_count,
          require_clean: check.evidence?.require_clean,
        } : null),
        evidence,
        recovery: check.name === "process_hygiene" ? (check.evidence?.recovery || null) : undefined,
      };
    }),
  };
}

// ── Privacy egress wrapper ─────────────────────────────────────────────────────
// G10: Errors surface to stderr when DEBUG_EGRESS is set; never crash the request.
async function recordEgress(opts) {
  try {
    const priv = await getPrivacy();
    await priv.recordEgress(opts);
  } catch (e) {
    if (process.env.DEBUG_EGRESS) console.error("[egress] failed:", e.message);
  }
}

// ── HTTPS fetch (built-in, no npm) ────────────────────────────────────────────
// L-pillar3: 60s default timeout — rejects with Error("upstream timeout") on expiry.
function httpsPost(hostname, path_, headers, body, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const bodyBuf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const req = https.request({
      hostname,
      path: path_,
      method: "POST",
      headers: { ...headers, "Content-Length": bodyBuf.length },
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end",  () => settle(resolve, { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", e => settle(reject, e));
    });

    const timer = setTimeout(() => {
      req.destroy();
      settle(reject, new Error("upstream timeout"));
    }, timeoutMs);

    req.on("error", e => { clearTimeout(timer); settle(reject, e); });
    req.on("close", () => clearTimeout(timer));
    req.write(bodyBuf);
    req.end();
  });
}

// ── SSE helpers ────────────────────────────────────────────────────────────────
function startSSE(res, req = null) {
  cors(res, req);
  res.writeHead(200, {
    "Content-Type":  "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection":    "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

function sseWrite(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sseDone(res) {
  res.write("data: [DONE]\n\n");
  res.end();
}

// ── FS path safety ─────────────────────────────────────────────────────────────
// SEC-002: ORANGEBOX_WORKSPACE_ROOT must be set. If unset, all fs writes are refused.
const HOME = os.homedir();
const WORKSPACE_ROOT = process.env.ORANGEBOX_WORKSPACE_ROOT || null;

// Hard block list — credential and key material locations across platforms.
// Any path matching these substrings is refused regardless of root check.
const FS_BLOCK_PATTERNS = [
  /[/\\]\.git[/\\]HEAD$/i,
  /[/\\]\.ssh[/\\]/i,
  /[/\\]\.gnupg[/\\]/i,
  /[/\\]\.aws[/\\]/i,
  /[/\\]\.config[/\\]/i,
  /[/\\]\.docker[/\\]/i,
  /[/\\]Library[/\\]Keychains/i,
  /AppData[\\/]Roaming[\\/]Microsoft[\\/]Crypto/i,
  /AppData[\\/]Roaming[\\/]Microsoft[\\/]SystemCertificates/i,
  /[/\\]\.cargo[/\\]credentials/i,
  /[/\\]\.npmrc$/i,
  /[/\\]\.netrc$/i,
  /[/\\]\.pypirc$/i,
  /\.env$/i,
  /\.env\.[a-z]/i,
];

function isFsPathSafe(p) {
  // SEC-002: Refuse all fs writes when workspace root is not configured.
  if (!WORKSPACE_ROOT) return false;

  const resolved = path.resolve(p);

  // Block any path containing traversal sequences.
  if (resolved.includes("..")) return false;

  // Must stay inside the workspace root.
  const allowedRoot = path.resolve(WORKSPACE_ROOT);
  const sep = path.sep;
  if (!resolved.startsWith(allowedRoot + sep) && resolved !== allowedRoot) return false;

  // Hard block list.
  for (const pat of FS_BLOCK_PATTERNS) {
    if (pat.test(resolved)) return false;
  }
  return true;
}

// ── Recursive fs tree ──────────────────────────────────────────────────────────
async function buildTree(dir, depth, maxDepth) {
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat) return { name: path.basename(dir), type: "missing" };
  if (stat.isFile()) return { name: path.basename(dir), type: "file", size: stat.size };
  if (depth >= maxDepth) return { name: path.basename(dir), type: "dir", truncated: true };
  let children = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const limited = entries.slice(0, 200); // cap to prevent explosion
    children = await Promise.all(limited.map(e =>
      e.isDirectory()
        ? buildTree(path.join(dir, e.name), depth + 1, maxDepth)
        : Promise.resolve({ name: e.name, type: "file" })
    ));
  } catch { /* permission denied etc */ }
  return { name: path.basename(dir), type: "dir", children };
}

// ── Anthropic streaming call ───────────────────────────────────────────────────
async function anthropicStream(res, { system, messages, model, callerRef, dataRoot, routed, tools, output_config, context_management }) {
  if (!ANTHROPIC_KEY) {
    sseWrite(res, { delta: "[ANTHROPIC_API_KEY missing — set it in your environment]" });
    sseWrite(res, { cost_cents: 0 });
    sseDone(res);
    return;
  }

  const m = model || (routed?.model) || ANTHROPIC_MODEL_DEFAULT;

  // System blocks with optional system_prepend from router.
  const systemBlocks = [];
  if (routed?.system_prepend) {
    systemBlocks.push({ type: "text", text: routed.system_prepend, cache_control: { type: "ephemeral" } });
  }
  systemBlocks.push({ type: "text", text: system || "You are ORANGEBOX, the operator OS.", cache_control: { type: "ephemeral" } });

  // Tools array with optional tools_prepend from router.
  let toolsArr = undefined;
  if (routed?.tools_prepend?.length || tools?.length) {
    toolsArr = [...(routed?.tools_prepend || []), ...(tools || [])];
  }

  // Apply user_prepend to last user message.
  let finalMessages = messages ? [...messages] : [];
  if (routed?.user_prepend && finalMessages.length > 0) {
    const lastUserIdx = [...finalMessages].map((mm, i) => [mm, i]).filter(([mm]) => mm.role === "user").pop()?.[1];
    if (lastUserIdx !== undefined) {
      const lastUser = finalMessages[lastUserIdx];
      const existingContent = typeof lastUser.content === "string"
        ? [{ type: "text", text: lastUser.content }]
        : [...(lastUser.content || [])];
      finalMessages[lastUserIdx] = {
        ...lastUser,
        content: [{ type: "text", text: routed.user_prepend }, ...existingContent],
      };
    }
  }

  const betaBase = "prompt-caching-2024-07-31";
  const extraBeta = routed?.beta_headers ? `,${routed.beta_headers}` : "";
  const betaHeader = betaBase + extraBeta;

  const bodyObj = {
    model:      m,
    max_tokens: 4096,
    stream:     true,
    system:     systemBlocks,
    messages:   finalMessages,
  };
  if (toolsArr) bodyObj.tools = toolsArr;
  if (output_config || routed?.output_config) bodyObj.output_config = output_config || routed.output_config;
  if (routed?.thinking) bodyObj.thinking = routed.thinking;
  if (context_management) bodyObj.context_management = context_management;

  const payload = JSON.stringify(bodyObj);

  return new Promise((resolve) => {
    const reqNode = https.request({
      hostname: "api.anthropic.com",
      path:     "/v1/messages",
      method:   "POST",
      headers: {
        "Content-Type":      "application/json",
        "Content-Length":    Buffer.byteLength(payload),
        "x-api-key":         ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":    betaHeader,
      },
    }, (apiRes) => {
      let inputTokens = 0, outputTokens = 0, cached = false;
      let buf = "";

      apiRes.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        const lines = buf.split("\n");
        buf = lines.pop(); // keep partial line
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            if (ev.type === "content_block_delta" && ev.delta?.text) {
              sseWrite(res, { delta: ev.delta.text });
            }
            if (ev.type === "message_start" && ev.message?.usage) {
              inputTokens = ev.message.usage.input_tokens  || 0;
              cached      = (ev.message.usage.cache_read_input_tokens || 0) > 0;
            }
            if (ev.type === "message_delta" && ev.usage) {
              outputTokens = ev.usage.output_tokens || 0;
            }
          } catch { /* partial JSON line — skip */ }
        }
      });

      apiRes.on("end", async () => {
        const costCents = estimateCost("anthropic", m, inputTokens, outputTokens);
        sseWrite(res, { cost_cents: costCents });
        sseDone(res);
        await recordEgress({
          provider: "anthropic",
          endpoint: "https://api.anthropic.com/v1/messages",
          model: m,
          inputTokens, outputTokens, cached, costCents,
          callerScript: callerRef || "v4-server-routes.mjs:anthropicStream",
        });
        resolve();
      });
      apiRes.on("error", (e) => {
        sseWrite(res, { delta: `[Anthropic stream error: ${e.message}]` });
        sseDone(res);
        resolve();
      });
    });
    reqNode.on("error", (e) => {
      sseWrite(res, { delta: `[Anthropic request error: ${e.message}]` });
      sseDone(res);
      resolve();
    });
    reqNode.write(payload);
    reqNode.end();
  });
}

// ── OpenAI streaming call ──────────────────────────────────────────────────────
async function openaiStream(res, { system, messages, model, callerRef }) {
  if (!OPENAI_KEY) {
    sseWrite(res, { delta: "[OPENAI_API_KEY missing — set it in your environment]" });
    sseWrite(res, { cost_cents: 0 });
    sseDone(res);
    return;
  }

  const oaiMessages = [];
  if (system) oaiMessages.push({ role: "system", content: system });
  oaiMessages.push(...messages);

  const payload = JSON.stringify({
    model:          model || OPENAI_MODEL_DEFAULT,
    stream:         true,
    stream_options: { include_usage: true }, // L-2: required for accurate token counts
    messages:       oaiMessages,
  });

  return new Promise((resolve) => {
    const reqNode = https.request({
      hostname: "api.openai.com",
      path:     "/v1/chat/completions",
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization":  `Bearer ${OPENAI_KEY}`,
      },
    }, (apiRes) => {
      let inputTokens = 0, outputTokens = 0;
      let buf = "";

      apiRes.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            const delta = ev.choices?.[0]?.delta?.content;
            if (delta) sseWrite(res, { delta });
            if (ev.usage) {
              inputTokens  = ev.usage.prompt_tokens     || 0;
              outputTokens = ev.usage.completion_tokens || 0;
            }
          } catch { /* skip */ }
        }
      });

      apiRes.on("end", async () => {
        const costCents = estimateCost("openai", model || OPENAI_MODEL_DEFAULT, inputTokens, outputTokens);
        sseWrite(res, { cost_cents: costCents });
        sseDone(res);
        await recordEgress({
          provider: "openai",
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: model || OPENAI_MODEL_DEFAULT,
          inputTokens, outputTokens, cached: false, costCents,
          callerScript: callerRef || "v4-server-routes.mjs:openaiStream",
        });
        resolve();
      });
      apiRes.on("error", (e) => {
        sseWrite(res, { delta: `[OpenAI stream error: ${e.message}]` });
        sseDone(res);
        resolve();
      });
    });
    reqNode.on("error", (e) => {
      sseWrite(res, { delta: `[OpenAI request error: ${e.message}]` });
      sseDone(res);
      resolve();
    });
    reqNode.write(payload);
    reqNode.end();
  });
}

// ── Google Gemini streaming call ───────────────────────────────────────────────
async function geminiStream(res, { system, messages, model, callerRef }) {
  if (!GOOGLE_KEY) {
    sseWrite(res, { delta: "[GOOGLE_API_KEY missing — set it in your environment]" });
    sseWrite(res, { cost_cents: 0 });
    sseDone(res);
    return;
  }

  const m = model || GOOGLE_MODEL_DEFAULT;
  // Gemini: system goes into systemInstruction, messages into contents
  const contents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) }],
  }));

  const payload = JSON.stringify({
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: { maxOutputTokens: 4096 },
  });

  const geminiPath = `/v1beta/models/${m}:streamGenerateContent?key=${GOOGLE_KEY}&alt=sse`;

  return new Promise((resolve) => {
    const reqNode = https.request({
      hostname: "generativelanguage.googleapis.com",
      path:     geminiPath,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (apiRes) => {
      let buf = "";
      let outputTokens = 0;

      apiRes.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          try {
            const ev = JSON.parse(data);
            const text = ev.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) sseWrite(res, { delta: text });
            const usage = ev.usageMetadata;
            if (usage) outputTokens = usage.candidatesTokenCount || 0;
          } catch { /* skip */ }
        }
      });

      apiRes.on("end", async () => {
        const costCents = estimateCost("google", m, 0, outputTokens);
        sseWrite(res, { cost_cents: costCents });
        sseDone(res);
        await recordEgress({
          provider: "google",
          endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent`,
          model: m, inputTokens: 0, outputTokens, cached: false, costCents,
          callerScript: callerRef || "v4-server-routes.mjs:geminiStream",
        });
        resolve();
      });
      apiRes.on("error", (e) => {
        sseWrite(res, { delta: `[Gemini stream error: ${e.message}]` });
        sseDone(res);
        resolve();
      });
    });
    reqNode.on("error", (e) => {
      sseWrite(res, { delta: `[Gemini request error: ${e.message}]` });
      sseDone(res);
      resolve();
    });
    reqNode.write(payload);
    reqNode.end();
  });
}

// ── v6.0 Groq stream (OpenAI-compatible API) ───────────────────────────────────
async function groqStream(res, { system, messages, model, callerRef }) {
  if (!GROQ_KEY) {
    sseWrite(res, { delta: "[GROQ_API_KEY missing — set it to use Groq LPU]" });
    sseWrite(res, { cost_cents: 0 });
    sseDone(res);
    return;
  }
  const grqMessages = [];
  if (system) grqMessages.push({ role: "system", content: system });
  grqMessages.push(...messages);

  const payload = JSON.stringify({
    model:          model || GROQ_MODEL_DEFAULT,
    stream:         true,
    stream_options: { include_usage: true },
    messages:       grqMessages,
  });

  return new Promise((resolve) => {
    const reqNode = https.request({
      hostname: "api.groq.com",
      path:     "/openai/v1/chat/completions",
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization":  `Bearer ${GROQ_KEY}`,
      },
    }, (apiRes) => {
      let inputTokens = 0, outputTokens = 0;
      let buf = "";
      apiRes.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            const delta = ev.choices?.[0]?.delta?.content;
            if (delta) sseWrite(res, { delta });
            if (ev.usage || ev.x_groq?.usage) {
              const u = ev.usage || ev.x_groq?.usage || {};
              inputTokens  = u.prompt_tokens     || inputTokens;
              outputTokens = u.completion_tokens || outputTokens;
            }
          } catch { /* skip */ }
        }
      });
      apiRes.on("end", async () => {
        const m = model || GROQ_MODEL_DEFAULT;
        const costCents = estimateCost("groq", m, inputTokens, outputTokens);
        sseWrite(res, { cost_cents: costCents });
        sseDone(res);
        await recordEgress({
          provider: "groq",
          endpoint: "https://api.groq.com/openai/v1/chat/completions",
          model: m,
          inputTokens, outputTokens, cached: false, costCents,
          callerScript: callerRef || "v4-server-routes.mjs:groqStream",
        });
        resolve();
      });
      apiRes.on("error", (e) => {
        sseWrite(res, { delta: `[Groq stream error: ${e.message}]` });
        sseDone(res);
        resolve();
      });
    });
    reqNode.on("error", (e) => {
      sseWrite(res, { delta: `[Groq request error: ${e.message}]` });
      sseDone(res);
      resolve();
    });
    reqNode.write(payload);
    reqNode.end();
  });
}

// ── v6.0 Ollama stream (local, $0 cost, air-gap path) ──────────────────────────
// xAI Grok stream (OpenAI-compatible endpoint). This only runs when the caller
// explicitly selects/routes xAI and an XAI_API_KEY is configured.
async function xaiStream(res, { system, messages, model, callerRef }) {
  if (!XAI_KEY) {
    sseWrite(res, { delta: "[XAI_API_KEY missing - set it to use Grok execution]" });
    sseWrite(res, { cost_cents: 0 });
    sseDone(res);
    return;
  }
  const xaiMessages = chatMessagesForOpenAI(system, messages);
  const m = model || XAI_MODEL_DEFAULT;
  const payload = JSON.stringify({
    model: m,
    stream: true,
    stream_options: { include_usage: true },
    messages: xaiMessages,
  });

  return new Promise((resolve) => {
    const reqNode = https.request({
      hostname: "api.x.ai",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${XAI_KEY}`,
      },
    }, (apiRes) => {
      let inputTokens = 0, outputTokens = 0;
      let buf = "";
      apiRes.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            const delta = ev.choices?.[0]?.delta?.content;
            if (delta) sseWrite(res, { delta });
            if (ev.usage) {
              inputTokens = ev.usage.prompt_tokens || inputTokens;
              outputTokens = ev.usage.completion_tokens || outputTokens;
            }
          } catch { /* skip */ }
        }
      });
      apiRes.on("end", async () => {
        const costCents = estimateCost("xai", m, inputTokens, outputTokens);
        sseWrite(res, { cost_cents: costCents });
        sseDone(res);
        await recordEgress({
          provider: "xai",
          endpoint: "https://api.x.ai/v1/chat/completions",
          model: m,
          inputTokens,
          outputTokens,
          cached: false,
          costCents,
          callerScript: callerRef || "v4-server-routes.mjs:xaiStream",
        });
        resolve();
      });
      apiRes.on("error", (e) => {
        sseWrite(res, { delta: `[xAI stream error: ${e.message}]` });
        sseDone(res);
        resolve();
      });
    });
    reqNode.on("error", (e) => {
      sseWrite(res, { delta: `[xAI request error: ${e.message}]` });
      sseDone(res);
      resolve();
    });
    reqNode.write(payload);
    reqNode.end();
  });
}

async function ollamaStream(res, { system, messages, model, callerRef }) {
  const url = new URL(OLLAMA_HOST + "/api/chat");
  const olMessages = [];
  if (system) olMessages.push({ role: "system", content: system });
  olMessages.push(...messages);

  const payload = JSON.stringify({
    model:    model || OLLAMA_MODEL_DEFAULT,
    stream:   true,
    messages: olMessages,
  });

  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const reqNode = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port:     url.port,
      path:     url.pathname,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (apiRes) => {
      let buf = "";
      let inputTokens = 0, outputTokens = 0;
      apiRes.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const ev = JSON.parse(trimmed);
            const delta = ev.message?.content;
            if (delta) sseWrite(res, { delta });
            if (ev.done) {
              inputTokens  = ev.prompt_eval_count || 0;
              outputTokens = ev.eval_count        || 0;
            }
          } catch { /* skip */ }
        }
      });
      apiRes.on("end", async () => {
        sseWrite(res, { cost_cents: 0 });
        sseDone(res);
        await recordEgress({
          provider: "ollama",
          endpoint: OLLAMA_HOST + "/api/chat",
          model: model || OLLAMA_MODEL_DEFAULT,
          inputTokens, outputTokens, cached: false, costCents: 0,
          callerScript: callerRef || "v4-server-routes.mjs:ollamaStream",
        });
        resolve();
      });
      apiRes.on("error", (e) => {
        sseWrite(res, { delta: `[Ollama stream error: ${e.message} — is Ollama running at ${OLLAMA_HOST}?]` });
        sseDone(res);
        resolve();
      });
    });
    reqNode.on("error", (e) => {
      sseWrite(res, { delta: `[Ollama unreachable at ${OLLAMA_HOST}: ${e.message}]` });
      sseDone(res);
      resolve();
    });
    reqNode.write(payload);
    reqNode.end();
  });
}

// ── Cost estimate ──────────────────────────────────────────────────────────────
const PRICING = {
  "anthropic:claude-haiku-4-5-20251001":  { inp: 1.00,  out:  5.00 },
  "anthropic:claude-sonnet-4-5-20251015": { inp: 3.00,  out: 15.00 },
  "anthropic:claude-opus-4-7-20250930":   { inp: 15.00, out: 75.00 },
  "openai:gpt-5":                         { inp: 10.00, out: 30.00 },
  "google:gemini-1.5-pro-002":            { inp: 3.50,  out: 10.50 },
  "xai:grok-2":                            { inp: 2.00,  out: 10.00 },
  "xai:grok-2-mini":                       { inp: 0.30,  out: 1.50 },
  // v6.0
  "groq:llama-3.3-70b-versatile":         { inp: 0.59,  out:  0.79 },
  "groq:gemma2-9b-it":                    { inp: 0.20,  out:  0.20 },
  "ollama:qwen2.5:7b":                    { inp: 0.00,  out:  0.00 },
  "ollama:llama3.2:3b":                   { inp: 0.00,  out:  0.00 },
};

function estimateCost(provider, model, inputTok, outputTok) {
  const key = `${provider}:${model}`;
  let entry = PRICING[key];
  if (!entry) {
    // Try prefix match (strip date suffix)
    for (const [k, v] of Object.entries(PRICING)) {
      const [p, m] = k.split(":");
      if (p === provider && model.startsWith(m.split("-").slice(0, 3).join("-"))) { entry = v; break; }
    }
  }
  if (!entry) return 0;
  return Math.round(((inputTok / 1_000_000) * entry.inp + (outputTok / 1_000_000) * entry.out) * 100 * 10_000) / 10_000;
}

function chatMessagesForOpenAI(system, messages) {
  const out = [];
  if (system) out.push({ role: "system", content: system });
  for (const msg of messages || []) {
    out.push({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
    });
  }
  return out;
}

async function openAiCompatibleCall({
  provider,
  hostname,
  path_,
  key,
  missingMessage,
  system,
  messages,
  model,
  modelDefault,
  endpoint,
  callerRef,
}) {
  if (!key) return { ok: false, error: missingMessage };
  const m = model || modelDefault;
  const payload = JSON.stringify({
    model: m,
    stream: false,
    messages: chatMessagesForOpenAI(system, messages),
  });
  try {
    const r = await httpsPost(hostname, path_, {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    }, payload);
    const data = JSON.parse(r.body || "{}");
    if (data.error) return { ok: false, error: data.error.message || JSON.stringify(data.error) };
    const text = data.choices?.[0]?.message?.content || "";
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const costCents = estimateCost(provider, m, inputTokens, outputTokens);
    await recordEgress({
      provider,
      endpoint,
      model: m,
      inputTokens,
      outputTokens,
      cached: false,
      costCents,
      callerScript: callerRef || `v4-server-routes.mjs:${provider}Call`,
    });
    return { ok: true, text, costCents, model: m, cached: false, inputTokens, outputTokens, rawContent: data.choices || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function openaiCall({ system, messages, model, callerRef }) {
  return openAiCompatibleCall({
    provider: "openai",
    hostname: "api.openai.com",
    path_: "/v1/chat/completions",
    key: OPENAI_KEY,
    missingMessage: "OPENAI_API_KEY missing",
    system,
    messages,
    model,
    modelDefault: OPENAI_MODEL_DEFAULT,
    endpoint: "https://api.openai.com/v1/chat/completions",
    callerRef,
  });
}

async function xaiCall({ system, messages, model, callerRef }) {
  return openAiCompatibleCall({
    provider: "xai",
    hostname: "api.x.ai",
    path_: "/v1/chat/completions",
    key: XAI_KEY,
    missingMessage: "XAI_API_KEY missing",
    system,
    messages,
    model,
    modelDefault: XAI_MODEL_DEFAULT,
    endpoint: "https://api.x.ai/v1/chat/completions",
    callerRef,
  });
}

async function geminiCall({ system, messages, model, callerRef }) {
  if (!GOOGLE_KEY) return { ok: false, error: "GOOGLE_API_KEY missing" };
  const m = model || GOOGLE_MODEL_DEFAULT;
  const contents = (messages || []).map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) }],
  }));
  const payload = JSON.stringify({
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: { maxOutputTokens: 4096 },
  });
  try {
    const r = await httpsPost("generativelanguage.googleapis.com", `/v1beta/models/${m}:generateContent?key=${GOOGLE_KEY}`, {
      "Content-Type": "application/json",
    }, payload);
    const data = JSON.parse(r.body || "{}");
    if (data.error) return { ok: false, error: data.error.message || JSON.stringify(data.error) };
    const text = (data.candidates || [])
      .flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || "")
      .join("");
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const costCents = estimateCost("google", m, inputTokens, outputTokens);
    await recordEgress({
      provider: "google",
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
      model: m,
      inputTokens,
      outputTokens,
      cached: false,
      costCents,
      callerScript: callerRef || "v4-server-routes.mjs:geminiCall",
    });
    return { ok: true, text, costCents, model: m, cached: false, inputTokens, outputTokens, rawContent: data.candidates || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Anthropic non-streaming call (for /model/call) ────────────────────────────
// Accepts optional routed fields from smart-model-router:
//   routed.tools_prepend, routed.system_prepend, routed.user_prepend,
//   routed.beta_headers, routed.output_config, routed.thinking,
//   routed.breakpoint_strategy
async function anthropicCall({ system, messages, model, callerRef, routed, tools, output_config, context_management }) {
  if (!ANTHROPIC_KEY) return { error: "ANTHROPIC_API_KEY missing", ok: false };
  const m = model || (routed?.model) || ANTHROPIC_MODEL_DEFAULT;

  // Build system array — system_prepend first (with own cache_control), then main.
  const systemBlocks = [];
  if (routed?.system_prepend) {
    systemBlocks.push({ type: "text", text: routed.system_prepend, cache_control: { type: "ephemeral" } });
  }
  systemBlocks.push({ type: "text", text: system || "You are ORANGEBOX.", cache_control: { type: "ephemeral" } });

  // Build tools array — tools_prepend first.
  let toolsArr = undefined;
  if (routed?.tools_prepend?.length || tools?.length) {
    toolsArr = [...(routed?.tools_prepend || []), ...(tools || [])];
  }

  // Apply user_prepend to the last user message.
  let finalMessages = messages ? [...messages] : [];
  if (routed?.user_prepend && finalMessages.length > 0) {
    const lastUserIdx = [...finalMessages].map((m, i) => [m, i]).filter(([m]) => m.role === "user").pop()?.[1];
    if (lastUserIdx !== undefined) {
      const lastUser = finalMessages[lastUserIdx];
      const existingContent = typeof lastUser.content === "string"
        ? [{ type: "text", text: lastUser.content }]
        : [...(lastUser.content || [])];
      finalMessages[lastUserIdx] = {
        ...lastUser,
        content: [{ type: "text", text: routed.user_prepend }, ...existingContent],
      };
    }
  }

  // Beta headers — merge with base.
  const betaBase = "prompt-caching-2024-07-31";
  const extraBeta = routed?.beta_headers ? `,${routed.beta_headers}` : "";
  const betaHeader = betaBase + extraBeta;

  const body = {
    model: m, max_tokens: 4096,
    system: systemBlocks,
    messages: finalMessages,
  };
  if (toolsArr) body.tools = toolsArr;
  if (output_config || routed?.output_config) body.output_config = output_config || routed.output_config;
  if (routed?.thinking) body.thinking = routed.thinking;
  if (context_management) body.context_management = context_management;

  const payload = JSON.stringify(body);
  try {
    const r = await httpsPost("api.anthropic.com", "/v1/messages", {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta":    betaHeader,
    }, payload);
    const data = JSON.parse(r.body);
    if (data.error) return { ok: false, error: data.error.message || JSON.stringify(data.error) };
    const text         = data.content?.[0]?.text || "";
    const inputTokens  = data.usage?.input_tokens  || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    const cached       = (data.usage?.cache_read_input_tokens || 0) > 0;
    const costCents    = estimateCost("anthropic", m, inputTokens, outputTokens);
    await recordEgress({
      provider: "anthropic", endpoint: "https://api.anthropic.com/v1/messages",
      model: m, inputTokens, outputTokens, cached, costCents,
      callerScript: callerRef || "v4-server-routes.mjs:anthropicCall",
    });
    return { ok: true, text, costCents, model: m, cached, inputTokens, outputTokens, rawContent: data.content };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Multipart form parser (for /voice/transcribe) ─────────────────────────────
// L-6: Read raw Buffer; never decode binary parts as utf-8.
async function parseMultipart(req) {
  const ct = req.headers["content-type"] || "";
  const boundaryMatch = ct.match(/boundary=([^\s;]+)/i);
  if (!boundaryMatch) throw new Error("Content-Type boundary missing for multipart");
  const boundary = boundaryMatch[1];

  // Read raw chunks directly into a Buffer — never toString("utf8") or toString("binary").
  const buf = await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 4_194_304) { req.destroy(); return reject(new Error("Multipart body too large (4MB max)")); }
      chunks.push(c);
    });
    req.on("end",   () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

  const sep   = Buffer.from(`--${boundary}`);
  const CRLF4 = Buffer.from("\r\n\r\n");
  const parts = [];
  let pos = 0;
  while (pos < buf.length) {
    const start = buf.indexOf(sep, pos);
    if (start < 0) break;
    pos = start + sep.length;
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break; // --boundary--
    if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2; // skip \r\n after boundary
    // Headers end at \r\n\r\n — safe to decode as utf-8 (always ASCII)
    const headEnd = buf.indexOf(CRLF4, pos);
    if (headEnd < 0) break;
    const headStr = buf.slice(pos, headEnd).toString("utf8");
    pos = headEnd + 4;
    // Part body ends just before the next \r\n--boundary sequence
    const nextSepBuf = Buffer.from(`\r\n--${boundary}`);
    const nextSep    = buf.indexOf(nextSepBuf, pos);
    const bodyEnd    = nextSep >= 0 ? nextSep : buf.length;
    const partBody   = buf.slice(pos, bodyEnd); // raw Buffer — no utf-8 decode
    pos = bodyEnd;
    const nameMatch     = headStr.match(/name="([^"]+)"/i);
    const filenameMatch = headStr.match(/filename="([^"]+)"/i);
    const contentTypeM  = headStr.match(/content-type:\s*([^\r\n]+)/i);
    const partCT        = contentTypeM?.[1]?.trim() || "";
    // Only decode as text for non-binary content types.
    const isText = !partCT || partCT.startsWith("text/") || partCT === "application/json";
    parts.push({
      name:        nameMatch?.[1]     || "",
      filename:    filenameMatch?.[1] || null,
      contentType: partCT,
      data:        partBody,                                    // always raw Buffer
      text:        isText ? partBody.toString("utf8") : null,  // null for binary parts
    });
  }
  return parts;
}

// ── RFC 6455 WebSocket frame parser / builder ─────────────────────────────────
// Minimal inline implementation so we have zero deps.

function wsHandshake(req, socket) {
  const key = req.headers["sec-websocket-key"] || "";
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n` +
    "\r\n"
  );
}

function wsParseFrame(buf) {
  if (buf.length < 2) return null;
  const fin    = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked  = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;
  if (payloadLen === 126) { payloadLen = buf.readUInt16BE(offset); offset += 2; }
  else if (payloadLen === 127) { payloadLen = Number(buf.readBigUInt64BE(offset)); offset += 8; }
  if (buf.length < offset + (masked ? 4 : 0) + payloadLen) return null; // incomplete
  let payload;
  if (masked) {
    const mask = buf.slice(offset, offset + 4); offset += 4;
    payload = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) payload[i] = buf[offset + i] ^ mask[i % 4];
    offset += payloadLen;
  } else {
    payload = buf.slice(offset, offset + payloadLen);
    offset += payloadLen;
  }
  return { fin, opcode, payload, consumed: offset };
}

function wsBuildFrame(data, opcode = 0x01) {
  const payload = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

// ── Party-line in-memory store ─────────────────────────────────────────────────
const partyLineMessages = [];
const PARTY_LINE_MAX = 1000;

function partyLinePost({ from, text, channel }) {
  const msg = {
    id: uuidv4(),
    ts: new Date().toISOString(),
    from: from || "operator",
    channel: channel || "general",
    text: String(text || ""),
  };
  partyLineMessages.push(msg);
  if (partyLineMessages.length > PARTY_LINE_MAX) partyLineMessages.shift();
  return msg;
}

function partyLineRecent(limit) {
  const n = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
  return partyLineMessages.slice(-n);
}

// ── Cockpit status probe ───────────────────────────────────────────────────────
async function getSeeSuiteCoreStatus(dataRoot) {
  const checks = await Promise.allSettled([
    // project — look for data root; ID-06: include name and path fields
    fs.stat(dataRoot).then(() => ({
      ok:    true,
      label: "data root reachable",
      name:  process.env.ORANGEBOX_PROJECT_NAME || path.basename(dataRoot),
      path:  path.resolve(dataRoot),
    })).catch(() => ({
      ok:    false,
      label: "data root unreachable",
      name:  process.env.ORANGEBOX_PROJECT_NAME || path.basename(dataRoot),
      path:  path.resolve(dataRoot),
    })),
    // vault — check vault dir. Missing vault is a recoverable first-run/setup
    // state, not a Basic Install failure.
    fs.stat(path.join(dataRoot, "vault")).then(() => ({
      ok: true,
      status: "READY",
      label: "vault directory found",
      recoverable: false,
    })).catch(() => ({
      ok: null,
      status: "SETUP_PENDING",
      label: "vault setup pending - local workspace is usable",
      recoverable: true,
      action: "Open AE Operations > Vault Recovery when credentials are needed.",
    })),
    // router — check module loads
    getRouter().then(() => ({ ok: true, label: "smart-model-router loaded" })).catch(e => ({ ok: false, label: e.message })),
    // privacy — check privacy module
    getPrivacy().then(() => ({ ok: true, label: "privacy-audit loaded" })).catch(e => ({ ok: false, label: e.message })),
    // queue — check queue module
    getQueue().then(() => ({ ok: true, label: "bg-agent-queue loaded" })).catch(e => ({ ok: false, label: e.message })),
    // AI Box rail: prefer the new env var, accept the old one as compatibility.
    // No configured AI Box means Basic Install is active. It should render as
    // optional/setup, not as a broken product state.
    Promise.resolve(process.env.ORANGEBOX_AI_BOX_IP || process.env.ORANGEBOX_CODEXA_IP
      ? {
          ok: true,
          status: "CONFIGURED",
          label: `AI Box IP configured: ${process.env.ORANGEBOX_AI_BOX_IP || process.env.ORANGEBOX_CODEXA_IP}`,
          optional: false,
        }
      : {
          ok: null,
          status: "NOT_CONFIGURED_BASIC_INSTALL",
          label: "Basic Install active - Advanced AI Box not configured",
          optional: true,
          action: "Use AE Operations > Advanced AI Box only when adding a second AI computer.",
        }),
  ]);

  const [project, vault, router, privacy, queue, aiBoxRail] = checks.map(r =>
    r.status === "fulfilled" ? r.value : { ok: false, label: String(r.reason?.message || r.reason) }
  );

  // v6.0 — surface 2026-stack provider readiness so the native UI can show real status.
  const v6Stack = {
    local_mode_enabled: /^(1|true|yes|on)$/i.test(String(process.env.ORANGEBOX_LOCAL_MODE || "")),
    groq_key:           !!process.env.GROQ_API_KEY,
    ollama_host:        process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    route_tier:         (process.env.ORANGEBOX_ROUTE_TIER || "heuristic").toLowerCase(),
    providers: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai:    !!process.env.OPENAI_API_KEY,
      google:    !!process.env.GOOGLE_API_KEY,
      groq:      !!process.env.GROQ_API_KEY,
      xai:       !!process.env.XAI_API_KEY,
      ollama:    true, // probed lazily by /api/v4/router/route call; absence = local Ollama unreachable
    },
  };

  return { project, vault, router, privacy, queue, aiBox: aiBoxRail, v6: v6Stack };
}

function getSeeSuiteStatus(status) {
  return {
    project: status.project,
    vault: status.vault,
    router: status.router,
    privacy: status.privacy,
    queue: status.queue,
    aiBox: status.aiBox,
    v6: status.v6
  };
}

function getLegacyCockpitStatus(status) {
  return {
    ...status,
    codexa: status.aiBox,
    compatibility: {
      legacy_route: "/api/v4/cockpit/status",
      active_route: "/api/v4/see-suite/status",
      note: "Use AE See-Suite status for new clients.",
    },
  };
}

function aiBoxTenantPaths(root) {
  return {
    activeDir: path.join(root, "ai-box"),
    activeFile: path.join(root, "ai-box", "tenants.json"),
    legacyFile: path.join(root, "codexa", "tenants.json"),
  };
}

async function readTenantArray(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function tenantKey(record) {
  return `${record?.tenant_id || ""}::${record?.kid || ""}`;
}

async function loadAiBoxTenantRecords(root) {
  const paths = aiBoxTenantPaths(root);
  const legacy = await readTenantArray(paths.legacyFile);
  const active = await readTenantArray(paths.activeFile);
  const merged = new Map();
  for (const item of legacy) merged.set(tenantKey(item), item);
  for (const item of active) merged.set(tenantKey(item), item);
  return {
    tenants: [...merged.values()],
    active_count: active.length,
    legacy_count: legacy.length,
    paths,
  };
}

async function saveAiBoxTenantRecords(root, tenants) {
  const paths = aiBoxTenantPaths(root);
  await fs.mkdir(paths.activeDir, { recursive: true });
  await fs.writeFile(paths.activeFile, JSON.stringify(tenants, null, 2), "utf8");
  return paths;
}

function tenantRouteCompatibility(pathname) {
  if (!pathname.startsWith("/api/v4/codexa/tenant/")) return null;
  return {
    legacy_route: pathname,
    active_route: pathname.replace("/api/v4/codexa/tenant/", "/api/v4/ai-box/tenant/"),
    note: "Use AI Box tenant routes for new clients.",
  };
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * attachV4Routes — wire all v4 API endpoints.
 *
 * @param {object} opts
 *   getDataRoot {function():string} — returns the active data root path
 * @returns {function(req, res):void} — the route handler
 */
export function attachV4Routes({ getDataRoot } = {}) {
  const dataRoot = () => (typeof getDataRoot === "function" ? getDataRoot() : path.join(os.homedir(), ".orangebox"));

  // ── Route dispatcher ─────────────────────────────────────────────────────────
  async function handle(req, res) {
    cors(res, req);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    const raw     = req.url || "/";
    const parsed  = new URL(raw, "http://localhost");
    const method  = req.method?.toUpperCase() || "GET";
    const pathname = parsed.pathname;

    try {
      // GET /api/v4/see-suite/status; legacy /api/v4/cockpit/status remains as a hidden alias.
      if (method === "GET" && pathname === "/api/v4/see-suite/status") {
        const status = await getSeeSuiteCoreStatus(dataRoot());
        return sendJSON(res, getSeeSuiteStatus(status));
      }

      if (method === "GET" && pathname === "/api/v4/cockpit/status") {
        const status = await getSeeSuiteCoreStatus(dataRoot());
        return sendJSON(res, getLegacyCockpitStatus(status));
      }

      // ── POST /api/v4/router/route ──────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/router/route") {
        const body = await parseJSONBody(req);
        if (!body.task) return sendError(res, "task is required");
        const router = await getRouter();
        let runningBrainPreference = null;
        if (!body.prefer) {
          try {
            const switchboard = await import("./model-switchboard.mjs");
            runningBrainPreference = await switchboard.getActiveRoutePreference({ dataRoot: dataRoot() });
          } catch { /* switchboard must never break routing */ }
        }
        const normalizedTask = String(body.task || "").toLowerCase().trim().replace(/[^a-z_]/g, "_");
        const runningBrainOverrideTasks = new Set(["architecture", "pr_review", "synthesis"]);
        const shouldApplyRunningBrain = Boolean(
          runningBrainPreference &&
          !body.prefer &&
          runningBrainOverrideTasks.has(normalizedTask)
        );
        const decision = await router.route({
          task:              body.task,
          hint:              body.hint,
          budget:            body.budget,
          prefer:            body.prefer || (shouldApplyRunningBrain ? runningBrainPreference : undefined),
          conversationTurns: body.conversationTurns ?? body.conversation_turns ?? null,
        });
        if (runningBrainPreference?.running_brain) {
          decision.running_brain = runningBrainPreference.running_brain;
          decision.running_brain_applied = shouldApplyRunningBrain;
          decision.running_brain_policy = shouldApplyRunningBrain
            ? "applied_to_deep_lane"
            : "advisory_only_for_fast_or_local_lane";
        }
        return sendJSON(res, decision);
      }

      // ── POST /api/v4/model/call ────────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/model/call") {
        const body = await parseJSONBody(req);
        if (!body.messages) return sendError(res, "messages array is required");
        let activeRouted = null;
        if (!body.routed) {
          try {
            const switchboard = await import("./model-switchboard.mjs");
            activeRouted = await switchboard.getActiveRoutePreference({ dataRoot: dataRoot() });
          } catch { /* keep existing Anthropic default if switchboard is unavailable */ }
        }
        const routed = body.routed || activeRouted || {};
        const task = body.task || body.routed?.task || "";
        // Memory tool auto-attach for qualifying tasks.
        const MEMORY_AUTO_ATTACH_TASKS = new Set(["chat", "inline_edit", "multi_file_edit", "architecture", "pr_review"]);
        const autoAttachMemory = MEMORY_AUTO_ATTACH_TASKS.has(task);
        const memoryTool = { type: "memory_20250818", name: "memory" };
        const callTools = autoAttachMemory ? [memoryTool, ...(body.tools || [])] : (body.tools || undefined);
        // Compaction for chat/architecture when history > 10 turns.
        const messageCount = Array.isArray(body.messages) ? body.messages.length : 0;
        const compactionTasks = new Set(["chat", "architecture"]);
        let callContextMgmt = body.context_management || undefined;
        if (compactionTasks.has(task) && messageCount > 10 && !callContextMgmt) {
          callContextMgmt = {
            edits: [{
              type:    "compact_20260112",
              trigger: { type: "input_tokens", value: 150000 },
            }],
          };
        }
        const callBeta = compactionTasks.has(task) && messageCount > 10
          ? (routed?.beta_headers ? `${routed.beta_headers},compact-2026-01-12` : "compact-2026-01-12")
          : routed?.beta_headers;
        const provider = routed?.provider || "anthropic";
        let result;
        if (provider === "openai") {
          result = await openaiCall({ system: body.system, messages: body.messages, model: routed?.model, callerRef: "v4-server-routes.mjs:/api/v4/model/call" });
        } else if (provider === "google") {
          result = await geminiCall({ system: body.system, messages: body.messages, model: routed?.model, callerRef: "v4-server-routes.mjs:/api/v4/model/call" });
        } else if (provider === "xai") {
          result = await xaiCall({ system: body.system, messages: body.messages, model: routed?.model, callerRef: "v4-server-routes.mjs:/api/v4/model/call" });
        } else {
          result = await anthropicCall({
          system:    body.system,
          messages:  body.messages,
          model:     routed?.model,
          callerRef: "v4-server-routes.mjs:/api/v4/model/call",
          routed:    { ...routed, beta_headers: callBeta },
          tools:     callTools?.length ? callTools : undefined,
          context_management: callContextMgmt,
          });
        }
        if (activeRouted?.running_brain) result.running_brain = activeRouted.running_brain;
        return sendJSON(res, result, result.ok ? 200 : 502);
      }

      // ── POST /api/v4/model/stream ──────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/model/stream") {
        const body = await parseJSONBody(req);
        if (!body.messages) return sendError(res, "messages array is required");
        let activeRouted = null;
        if (!body.routed) {
          try {
            const switchboard = await import("./model-switchboard.mjs");
            activeRouted = await switchboard.getActiveRoutePreference({ dataRoot: dataRoot() });
          } catch { /* keep existing Anthropic default if switchboard is unavailable */ }
        }
        const routed = body.routed || activeRouted || {};
        const task = body.task || routed?.task || "";
        startSSE(res);
        const provider = routed?.provider || "anthropic";
        const model    = routed?.model;
        // Memory tool auto-attach for qualifying tasks.
        const MEM_STREAM_TASKS = new Set(["chat", "inline_edit", "multi_file_edit", "architecture", "pr_review"]);
        const memoryToolStream = { type: "memory_20250818", name: "memory" };
        const streamTools = MEM_STREAM_TASKS.has(task) ? [memoryToolStream, ...(body.tools || [])] : (body.tools || undefined);
        // Compaction for chat/architecture when history > 10 turns.
        const msgCount = Array.isArray(body.messages) ? body.messages.length : 0;
        const compactTasks = new Set(["chat", "architecture"]);
        let streamContextMgmt = body.context_management || undefined;
        let streamBeta = routed?.beta_headers;
        if (compactTasks.has(task) && msgCount > 10) {
          if (!streamContextMgmt) {
            streamContextMgmt = {
              edits: [{
                type:    "compact_20260112",
                trigger: { type: "input_tokens", value: 150000 },
              }],
            };
          }
          streamBeta = streamBeta ? `${streamBeta},compact-2026-01-12` : "compact-2026-01-12";
        }
        if (provider === "openai") {
          await openaiStream(res, { system: body.system, messages: body.messages, model, callerRef: "v4:/model/stream" });
        } else if (provider === "google") {
          await geminiStream(res, { system: body.system, messages: body.messages, model, callerRef: "v4:/model/stream" });
        } else if (provider === "xai") {
          await xaiStream(res, { system: body.system, messages: body.messages, model, callerRef: "v4:/model/stream" });
        } else if (provider === "groq") {
          // v6.0 — Groq LPU, sub-300ms first token for quick_reply / route_dispatch.
          await groqStream(res, { system: body.system, messages: body.messages, model, callerRef: "v4:/model/stream" });
        } else if (provider === "ollama") {
          // v6.0 — local Ollama; $0 cost, zero egress (Privacy lane air-gap).
          await ollamaStream(res, { system: body.system, messages: body.messages, model, callerRef: "v4:/model/stream" });
        } else {
          await anthropicStream(res, {
            system:             body.system,
            messages:           body.messages,
            model,
            dataRoot:           dataRoot(),
            callerRef:          "v4:/model/stream",
            routed:             { ...routed, beta_headers: streamBeta },
            tools:              streamTools?.length ? streamTools : undefined,
            context_management: streamContextMgmt,
          });
        }
        return;
      }

      // ── POST /api/v4/vault/cited-query ─────────────────────────────────────
      // HTP-7 / L-4: keyword-scored lattice.jsonl lookup + Anthropic Citations beta.
      if (method === "POST" && pathname === "/api/v4/vault/cited-query") {
        const body = await parseJSONBody(req);
        if (!body.question) return sendError(res, "question is required");
        if (!ANTHROPIC_KEY) return sendError(res, "ANTHROPIC_API_KEY missing", 502);

        const topN        = Math.min(Math.max(1, parseInt(body.topN, 10) || 10), 30);
        const question    = String(body.question);
        const queryTokens = question.toLowerCase().split(/\W+/).filter(t => t.length > 2);

        // ── 1. Score chunks from lattice.jsonl ──────────────────────────────
        const latticeFile = path.join(
          dataRoot(),
          "memory", "orangebox-knowledge-v2", "lattice.jsonl"
        );
        const candidates = [];
        try {
          const raw2 = await fs.readFile(latticeFile, "utf8");
          for (const line of raw2.split("\n")) {
            if (!line.trim()) continue;
            let entry;
            try { entry = JSON.parse(line); } catch { continue; }
            const textContent = String(entry.text || entry.content || entry.chunk || "");
            if (!textContent) continue;
            const lower = textContent.toLowerCase();
            let score = 0;
            for (const tok of queryTokens) score += (lower.split(tok).length - 1);
            candidates.push({ entry, textContent, score });
          }
          candidates.sort((a, b) => b.score - a.score);
        } catch { /* lattice.jsonl absent — fall through to vault .md files */ }

        // ── 2. Fall back to vault .md if lattice is empty ───────────────────
        // Phase 2: 1-hour TTL on vault document blocks (vault changes rarely).
        let documents = [];
        if (candidates.length > 0) {
          documents = candidates.slice(0, topN).map((c, i) => ({
            type:    "document",
            source:  { type: "text", data: c.textContent },
            title:   c.entry.id || c.entry.source || `lattice-chunk-${i}`,
            context: { citations: { enabled: true } },
            cache_control: { type: "ephemeral", ttl: "1h" },
          }));
        } else {
          try {
            const vaultDir = path.join(dataRoot(), body.vault || "vault");
            const entries  = await fs.readdir(vaultDir, { withFileTypes: true });
            const files    = entries.filter(e => e.isFile() && e.name.endsWith(".md")).slice(0, topN);
            documents = await Promise.all(files.map(async (f) => {
              const text = await fs.readFile(path.join(vaultDir, f.name), "utf8");
              return {
                type:    "document",
                source:  { type: "text", data: text },
                title:   f.name,
                context: { citations: { enabled: true } },
                cache_control: { type: "ephemeral", ttl: "1h" },
              };
            }));
          } catch { /* vault may be empty */ }
        }

        const payload = JSON.stringify({
          model:      ANTHROPIC_MODEL_DEFAULT,
          max_tokens: 2048,
          system: [{ type: "text", text: "Answer the question using ONLY the provided vault documents. Cite every claim with the document source.", cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: documents.length
            ? [...documents, { type: "text", text: question }]
            : [{ type: "text", text: question }]
          }],
        });

        const r = await httpsPost("api.anthropic.com", "/v1/messages", {
          "Content-Type":      "application/json",
          "x-api-key":         ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          // L-4: citations-2025-06-30 required for the citations array; prompt-caching for cost.
          "anthropic-beta":    "citations-2025-06-30,prompt-caching-2024-07-31",
        }, payload);

        const data = JSON.parse(r.body);
        if (data.error) return sendError(res, data.error.message || "Anthropic error", 502);
        const text       = data.content?.find(c => c.type === "text")?.text || "";
        const citations  = data.content?.filter(c => c.citations)?.flatMap(c => c.citations || []) || [];
        // v6.0.11 — Inline citation markers: walk content blocks and emit [N] after each cited segment
        let answerWithMarkers = "";
        const citationMap = [];
        let citationIdx = 0;
        for (const c of (data.content || [])) {
          if (c.type !== "text") continue;
          answerWithMarkers += c.text;
          if (c.citations && c.citations.length) {
            citationIdx++;
            answerWithMarkers += ` [${citationIdx}]`;
            citationMap.push({
              n: citationIdx,
              document_title: c.citations[0]?.document_title || `source ${citationIdx}`,
              cited_text:     c.citations.map(x => x.cited_text || "").join(" / ").slice(0, 400),
              location:       c.citations[0]?.document_location || null,
              raw:            c.citations,
            });
          }
        }
        const inputTokens  = data.usage?.input_tokens  || 0;
        const outputTokens = data.usage?.output_tokens || 0;
        const cached       = (data.usage?.cache_read_input_tokens || 0) > 0;
        await recordEgress({
          provider: "anthropic", endpoint: "https://api.anthropic.com/v1/messages",
          model: ANTHROPIC_MODEL_DEFAULT, inputTokens, outputTokens, cached,
          costCents: estimateCost("anthropic", ANTHROPIC_MODEL_DEFAULT, inputTokens, outputTokens),
          callerScript: "v4:/vault/cited-query",
        });
        // Canonical receipt (UX spec §3.8.4 source=vault-cited-query)
        await emitReceipt(dataRoot(), {
          source:   "vault-cited-query",
          title:    `Cited query: ${String(body.question || "").slice(0, 60)}`,
          summary:  `${citations?.length || 0} citation(s) · ${documents.length} docs searched`,
          evidence: { question_excerpt: String(body.question || "").slice(0, 200), citations: citations?.slice(0, 5), docs: documents.length },
        });
        return sendJSON(res, {
          answer:              text,
          answer_with_markers: answerWithMarkers,
          citations,
          citation_map:        citationMap,
          documentsSearched:   documents.length,
        });
      }

      // ── POST /api/v4/receipts/emit ─────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/receipts/emit") {
        const body = await parseJSONBody(req);
        const rec  = await emitReceipt(dataRoot(), body);
        return sendJSON(res, rec, 201);
      }

      // ── GET /api/v4/receipts/list ──────────────────────────────────────────
      if (method === "GET" && pathname === "/api/v4/receipts/list") {
        const qs    = urlParams(raw);
        const since = qs.get("since") ? new Date(qs.get("since")).getTime() : 0;
        const src   = qs.get("source") || null;
        const limit = Math.min(Math.max(1, parseInt(qs.get("limit") || "50", 10)), 500);
        const dir   = path.join(dataRoot(), "receipts", "v4");
        let items   = [];
        try {
          const files = await fs.readdir(dir);
          const jsons = files.filter(f => f.endsWith(".json")).slice(-500);
          const read  = await Promise.all(jsons.map(f =>
            fs.readFile(path.join(dir, f), "utf8").then(t => JSON.parse(t)).catch(() => null)
          ));
          items = read
            .filter(Boolean)
            .filter(r => !since || new Date(r.ts).getTime() >= since)
            .filter(r => !src   || r.source === src)
            .sort((a, b) => new Date(b.ts) - new Date(a.ts))
            .slice(0, limit);
        } catch { /* dir may not exist yet */ }
        return sendJSON(res, { items });
      }

      // ── GET /api/v4/receipts/:id ───────────────────────────────────────────
      {
        const m = pathname.match(/^\/api\/v4\/receipts\/([a-z0-9-]+)$/);
        if (method === "GET" && m) {
          const id  = m[1];
          const dir = path.join(dataRoot(), "receipts", "v4");
          try {
            const raw2 = await fs.readFile(path.join(dir, `${id}.json`), "utf8");
            return sendJSON(res, { receipt: JSON.parse(raw2) });
          } catch {
            return sendError(res, `Receipt not found: ${id}`, 404);
          }
        }
      }

      // ── POST /api/v4/receipts/share ───────────────────────────────────────
      // ID-04: generates a self-contained HTML artifact for sharing and returns { shareUrl, htmlPath, sha256 }
      if (method === "POST" && pathname === "/api/v4/receipts/share") {
        const body = await parseJSONBody(req);
        if (!body.receiptId) return sendError(res, "receiptId is required");
        const dir = path.join(dataRoot(), "receipts", "v4");
        let rec;
        try {
          rec = JSON.parse(await fs.readFile(path.join(dir, `${body.receiptId}.json`), "utf8"));
        } catch {
          return sendError(res, `Receipt not found: ${body.receiptId}`, 404);
        }
        // Generate self-contained HTML artifact
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ORANGEBOX Receipt — ${escapeHtml(rec.title || rec.id)}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;background:#0a0a0a;color:#e0e0e0;}
  h1{font-size:1.4rem;color:#fff;border-bottom:1px solid #333;padding-bottom:8px;}
  .meta{font-size:.85rem;color:#888;margin-bottom:20px;}
  .field{margin:12px 0;}
  .label{font-size:.75rem;text-transform:uppercase;color:#555;letter-spacing:.06em;}
  .value{margin-top:4px;white-space:pre-wrap;word-break:break-word;}
  pre{background:#111;border:1px solid #222;padding:12px;border-radius:4px;overflow:auto;font-size:.85rem;}
  .badge{display:inline-block;background:#1a3a1a;color:#4caf50;border-radius:3px;padding:2px 8px;font-size:.75rem;font-weight:600;}
</style>
</head>
<body>
<h1>${escapeHtml(rec.title || "Receipt")}</h1>
<div class="meta">
  <span class="badge">ORANGEBOX Engine</span>&nbsp;
  ID: <code>${escapeHtml(rec.id)}</code>&nbsp;&nbsp;
  Source: <code>${escapeHtml(rec.source || "v4-server")}</code>&nbsp;&nbsp;
  Time: <code>${escapeHtml(rec.ts || "")}</code>
</div>
${rec.summary ? `<div class="field"><div class="label">Summary</div><div class="value">${escapeHtml(rec.summary)}</div></div>` : ""}
${rec.evidence ? `<div class="field"><div class="label">Evidence</div><pre>${escapeHtml(JSON.stringify(rec.evidence, null, 2))}</pre></div>` : ""}
<hr style="border-color:#222;margin-top:32px">
<div style="font-size:.75rem;color:#444">Generated by ORANGEBOX Engine v6.3.0-alpha.7 · local-first · receipts everywhere</div>
</body>
</html>`;
        const htmlDir  = path.join(dir, "shares");
        await fs.mkdir(htmlDir, { recursive: true });
        const htmlPath = path.join(htmlDir, `${rec.id}.html`);
        await fs.writeFile(htmlPath, html, "utf8");
        const sha256 = crypto.createHash("sha256").update(html, "utf8").digest("hex");
        // shareUrl is a file:// path — the operator can serve it or proxy it
        const shareUrl = `file://${htmlPath.replace(/\\/g, "/")}`;
        return sendJSON(res, { shareUrl, htmlPath, sha256 }, 201);
      }

      // ── OpenAPI + Operating Spine ──────────────────────────────────────────
      if (method === "GET" && pathname === "/api/v4/openapi.json") {
        const api = await import("./api-doctor.mjs");
        const loaded = await api.loadOpenApiSpec();
        return sendJSON(res, loaded.spec);
      }

      if (method === "GET" && pathname === "/api/v4/api/doctor") {
        const doctor = await import("./api-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runApiDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/model-switch/status") {
        const switchboard = await import("./model-switchboard.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await switchboard.getModelSwitchboardStatus({ dataRoot: dataRoot(), writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/model-switch/select") {
        const body = await parseJSONBody(req);
        const switchboard = await import("./model-switchboard.mjs");
        const result = await switchboard.selectModelProfile({
          profileId: body.profile_id || body.profileId || body.id,
          dataRoot: dataRoot(),
          reason: body.reason || "operator selected Running Brain from AE Operations",
          writeReceipt: !!body.receipt,
        });
        return sendJSON(res, result, result.ok ? 200 : 400);
      }

      if (method === "GET" && pathname === "/api/v4/model-switch/doctor") {
        const switchboard = await import("./model-switchboard.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await switchboard.runModelSwitchboardDoctor({ dataRoot: dataRoot(), writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/cache/query") {
        const body = await parseJSONBody(req);
        if (!body.prompt) return sendError(res, "prompt is required");
        const cache = await import("./semantic-cache.mjs");
        const result = await cache.getCache(body.prompt, {
          threshold: body.threshold ?? 0.92,
          model: body.model || "nomic-embed-text",
        });
        return sendJSON(res, result);
      }

      if (method === "POST" && pathname === "/api/v4/cache/set") {
        const body = await parseJSONBody(req);
        if (!body.prompt) return sendError(res, "prompt is required");
        if (!body.completion) return sendError(res, "completion is required");
        const cache = await import("./semantic-cache.mjs");
        const result = await cache.setCache(body.prompt, body.completion, {
          model: body.model || "nomic-embed-text",
        });
        return sendJSON(res, { status: "VERIFIED", ...result });
      }

      if (method === "GET" && pathname === "/api/v4/cache/stats") {
        const cache = await import("./semantic-cache.mjs");
        const result = await cache.stats();
        return sendJSON(res, result);
      }

      if (method === "POST" && pathname === "/api/v4/cache/clear") {
        const cache = await import("./semantic-cache.mjs");
        await cache.clearCache();
        return sendJSON(res, { status: "VERIFIED", action: "cache_cleared" });
      }

      if (method === "GET" && pathname === "/api/v4/aelang/doctor") {
        const aelang = await import("./aelang.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await aelang.runAELangDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/aelang/compile") {
        try {
          const body = await parseJSONBody(req);
          const aelang = await import("./aelang.mjs");
          const result = await aelang.compileAELang({
            source: body.source || "",
            tier: body.tier || "auto",
            writeReceipt: !!body.receipt,
          });
          return sendJSON(res, result, result.ok ? 200 : 400);
        } catch (error) {
          return sendJSON(res, {
            ok: false,
            version: "orangebox-aelang/v0.1",
            error: error?.message || String(error),
          }, 400);
        }
      }

      if (method === "GET" && pathname === "/api/v4/install/doctor") {
        const doctor = await import("./install-clarity-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runInstallClarityDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/install/rehearsal") {
        const rehearsal = await import("./install-rehearsal.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const keepDataRoot = parsed.searchParams.get("clean_temp") !== "1" && parsed.searchParams.get("clean-temp") !== "1";
        const result = await rehearsal.runInstallRehearsal({ writeReceipt, keepDataRoot });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/install/rehearsal/latest") {
        const rehearsal = await import("./install-rehearsal.mjs");
        const limit = Number(parsed.searchParams.get("limit") || 6);
        const result = await rehearsal.getLatestInstallRehearsal({ limit: Number.isFinite(limit) ? limit : 6 });
        return sendJSON(res, result, result.found ? 200 : 404);
      }

      if (method === "GET" && pathname === "/api/v4/install/recovery-guide") {
        const recovery = await import("./recovery-guide.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await recovery.runRecoveryGuide({ writeReceipt });
        return sendJSON(res, result);
      }

      if (method === "GET" && pathname === "/api/v4/install/service-freshness") {
        const fresh = await import("./service-freshness.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const baseUrl = parsed.searchParams.get("base_url") || parsed.searchParams.get("base-url") || `http://${req.headers.host || "127.0.0.1:8787"}`;
        const result = await fresh.runServiceFreshnessDoctor({ writeReceipt, baseUrl });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/install/service-freshness/latest") {
        const fresh = await import("./service-freshness.mjs");
        const limit = Number(parsed.searchParams.get("limit") || 8);
        const result = await fresh.getLatestServiceFreshnessProof({ limit: Number.isFinite(limit) ? limit : 8 });
        return sendJSON(res, result, result.found ? 200 : 404);
      }

      if (method === "GET" && pathname === "/api/v4/product-language/doctor") {
        const doctor = await import("./product-language-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const baseUrl = parsed.searchParams.get("base_url") || parsed.searchParams.get("base-url") || `http://${req.headers.host || "127.0.0.1:8787"}`;
        const result = await doctor.runProductLanguageDoctor({
          writeReceipt,
          startServer: false,
          includeMutationSmoke: parsed.searchParams.get("mutating") === "1" || parsed.searchParams.get("include_mutation_smoke") === "1",
          baseUrl,
          forceTempServer: false,
        });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/install/first-run-proof") {
        const proof = await import("./first-run-visual-proof.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await proof.runFirstRunVisualProof({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/install/see-suite-proof") {
        const proof = await import("./ae-see-suite-visual-proof.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await proof.runAeSeeSuiteVisualProof({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/install/operations-proof") {
        const proof = await import("./ae-operations-visual-proof.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await proof.runAeOperationsVisualProof({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/finish/latest") {
        const result = await readLatestFinalGreenBoardReceipt();
        return sendJSON(res, result, result.found ? 200 : 404);
      }

      if (method === "GET" && pathname === "/api/v4/finish/process-doctor") {
        const doctor = await import("./process-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runProcessDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/finish/feature-reality") {
        const doctor = await import("./feature-reality-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runFeatureRealityDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/finish/user-journey") {
        const doctor = await import("./user-journey-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const full = parsed.searchParams.get("full") === "1";
        const result = await doctor.runUserJourneyDoctor({ writeReceipt, full, baseUrl: `http://${req.headers.host || "127.0.0.1:8787"}` });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/finish/closeout-plan") {
        const closeout = await import("./release-closeout.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await closeout.runReleaseCloseoutPlan({ writeReceipt });
        return sendJSON(res, result, 200);
      }

      if (method === "GET" && pathname === "/api/v4/finish/decision-card") {
        const closeout = await import("./release-closeout.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const plannedCardPath = closeout.plannedReleaseDecisionCardPath();
        const result = await closeout.runReleaseCloseoutPlan({
          writeReceipt,
          plannedDecisionCardPath: plannedCardPath,
        });
        const cardPath = await closeout.writeReleaseDecisionCard(result, plannedCardPath);
        return sendJSON(res, {
          ok: result.ok === true,
          version: "orangebox-release-decision-card/v1",
          card_path: cardPath,
          closeout_receipt_path: result.receipt_path || null,
          summary: result.summary || {},
          package: result.package || {},
          blockers: result.blockers || [],
          warnings: result.warnings || [],
          next_action: "Review the decision card and approve or revise the stage/hold split.",
        }, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/finish/path-lists") {
        const closeout = await import("./release-closeout.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await closeout.runReleaseCloseoutPlan({ writeReceipt });
        const lists = await closeout.writeReleasePathLists(result);
        return sendJSON(res, lists, lists.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/finish/release-packet") {
        const closeout = await import("./release-closeout.mjs");
        const packet = await closeout.writeReleasePacket();
        return sendJSON(res, packet, packet.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/finish/green-board") {
        const board = await import("./final-green-board.mjs");
        const result = await board.runFinalGreenBoard({
          writeReceipt: parsed.searchParams.get("receipt") === "1",
          full: parsed.searchParams.get("full") === "1",
          requireClean: parsed.searchParams.get("require_clean") === "1" || parsed.searchParams.get("require-clean") === "1",
        });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/openapi/drift") {
        const api = await import("./api-doctor.mjs");
        const result = await api.runApiDoctor({ writeReceipt: false });
        const drift = result.checks?.find((check) => check.name === "undocumented_public_routes_reported");
        const evidence = drift?.evidence || {};
        return sendJSON(res, {
          ok: result.ok === true && drift?.ok !== false,
          version: "orangebox-openapi-drift/v1",
          created_at: new Date().toISOString(),
          doctor_version: result.version,
          documented_count: evidence.documented_count ?? 0,
          source_route_count: result.checks?.find((check) => check.name === "documented_routes_map_to_source")?.evidence?.source_route_count ?? 0,
          known_compatibility_count: evidence.known_compatibility_count ?? 0,
          known_compatibility_routes: evidence.known_compatibility_routes || [],
          undocumented_count: evidence.undocumented_count ?? 0,
          undocumented_sample: evidence.undocumented_sample || [],
          note: evidence.note || "OpenAPI drift is reported so contract coverage can be reduced deliberately.",
        }, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/ai-box-network/doctor") {
        const net = await import("./ai-box-network.mjs");
        const result = await net.runAiBoxNetworkDoctor({
          writeReceipt: parsed.searchParams.get("receipt") === "1",
          deep: parsed.searchParams.get("deep") === "1",
        });
        return sendJSON(res, result);
      }

      if (method === "POST" && pathname === "/api/v4/ai-box-network/pack") {
        const body = await parseJSONBody(req);
        const net = await import("./ai-box-network.mjs");
        const result = await net.buildAiBoxNetworkPack({
          includeBrowsers: !!body.include_browsers,
          includeGameLaunchers: body.include_game_launchers !== false,
          emergencyBlockLaunchers: !!body.emergency_block_launchers,
          writeReceipt: !!body.receipt,
        });
        return sendJSON(res, result);
      }

      if (method === "GET" && pathname === "/api/v4/ai-box-network/ethereal/doctor") {
        const net = await import("./ai-box-network.mjs");
        const result = await net.runEtherealLinkDoctor({
          writeReceipt: parsed.searchParams.get("receipt") === "1",
          deep: parsed.searchParams.get("deep") === "1",
          adapterAlias: parsed.searchParams.get("adapter") || parsed.searchParams.get("adapter_alias") || "",
          subnet: parsed.searchParams.get("subnet") || "",
          hostIp: parsed.searchParams.get("host_ip") || "",
          peerIp: parsed.searchParams.get("peer_ip") || "",
        });
        return sendJSON(res, result);
      }

      if (method === "GET" && pathname === "/api/v4/ai-box-network/ethereal/latest") {
        const net = await import("./ai-box-network.mjs");
        const limit = Number(parsed.searchParams.get("limit") || 8);
        const result = await net.getLatestEtherealLinkProof({ limit: Number.isFinite(limit) ? limit : 8 });
        return sendJSON(res, result, result.found ? 200 : 404);
      }

      if (method === "POST" && pathname === "/api/v4/ai-box-network/ethereal/pack") {
        const body = await parseJSONBody(req);
        const net = await import("./ai-box-network.mjs");
        const result = await net.buildEtherealLinkPack({
          role: body.role || "both",
          adapterAlias: body.adapter_alias || body.adapter || "",
          subnet: body.subnet || "",
          hostIp: body.host_ip || "",
          peerIp: body.peer_ip || "",
          tcpDatacenterMode: !!body.tcp_datacenter,
          storageMode: body.storage_mode || "None",
          storageShareName: body.share_name || "OrangeBoxAI",
          storageSharePath: body.share_path || "C:\\OrangeBoxAI-Share",
          storageDriveLetter: body.drive || "O:",
          writeReceipt: !!body.receipt,
        });
        return sendJSON(res, result);
      }

      if (method === "GET" && pathname === "/api/v4/route/plan") {
        const spine = await import("./operating-spine.mjs");
        const objective = parsed.searchParams.get("objective") || "Run the ORANGEBOX operating spine.";
        const project = parsed.searchParams.get("project") || "orangebox";
        const result = await spine.planOperatingRoute({
          objective,
          project,
          dataRoot: dataRoot(),
          writeRoute: false,
        });
        return sendJSON(res, result);
      }

      if (method === "GET" && pathname === "/api/v4/route/current") {
        const state = await import("./route-state.mjs");
        return sendJSON(res, await state.loadCurrentRoute({ dataRoot: dataRoot() }));
      }

      if (method === "GET" && pathname === "/api/v4/route/rail") {
        const state = await import("./route-state.mjs");
        const current = await state.loadCurrentRoute({ dataRoot: dataRoot() });
        return sendJSON(res, {
          ok: current.ok,
          version: current.version,
          route_id: current.projection?.route_id || null,
          projection: current.projection,
          vision_rail: current.projection?.vision_rail || [],
          current_macro: current.projection?.current_macro || null,
          proof_gates: current.projection?.proof_gates || [],
          current_route_path: current.current_route_path,
          error: current.error || null,
        }, current.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/route/history") {
        const state = await import("./route-state.mjs");
        return sendJSON(res, await state.loadRouteHistory({
          dataRoot: dataRoot(),
          limit: parseInt(parsed.searchParams.get("limit") || "25", 10),
        }));
      }

      if (method === "GET" && pathname === "/api/v4/route/detail") {
        const state = await import("./route-state.mjs");
        const result = await state.loadRouteDetail({
          dataRoot: dataRoot(),
          routeId: parsed.searchParams.get("id") || parsed.searchParams.get("route_id") || "current",
        });
        return sendJSON(res, result, result.ok ? 200 : 404);
      }

      if (method === "GET" && pathname === "/api/v4/route/replay") {
        const state = await import("./route-state.mjs");
        const result = await state.loadRouteReplay({
          dataRoot: dataRoot(),
          routeId: parsed.searchParams.get("id") || parsed.searchParams.get("route_id") || "current",
        });
        return sendJSON(res, result, result.ok ? 200 : 404);
      }

      if (method === "GET" && pathname === "/api/v4/route/artifact") {
        const state = await import("./route-state.mjs");
        const result = await state.loadRouteArtifact({
          dataRoot: dataRoot(),
          routeId: parsed.searchParams.get("id") || parsed.searchParams.get("route_id") || "current",
          artifact: parsed.searchParams.get("artifact") || "package",
          maxBytes: parseInt(parsed.searchParams.get("max_bytes") || "262144", 10),
        });
        return sendJSON(res, result, result.ok ? 200 : 404);
      }

      if (method === "POST" && pathname === "/api/v4/route/plan") {
        const body = await parseJSONBody(req);
        const objective = body.objective || body.goal || body.task || "";
        if (!objective) return sendError(res, "objective is required", 400, req);
        const spine = await import("./operating-spine.mjs");
        const result = await spine.planOperatingRoute({
          objective,
          project: body.project || "orangebox",
          dataRoot: dataRoot(),
          maxDepartments: body.max_departments || body.maxDepartments || 6,
          writeRoute: true,
          emitReceipt: body.receipt ? (receipt) => emitReceipt(dataRoot(), receipt) : null,
        });
        const state = await import("./route-state.mjs");
        const saved = await state.saveCurrentRoute({
          route: result,
          dataRoot: dataRoot(),
          emitReceipt: body.receipt ? (receipt) => emitReceipt(dataRoot(), receipt) : null,
          postPartyLine: body.party_line === false ? null : (text) => partyLinePost({
            from: "AE0",
            channel: "mission-spine",
            text,
          }),
        });
        result.current_route_path = saved.current_route_path;
        result.current_projection = saved.projection;
        result.route_state_receipt = saved.receipt;
        result.party_line_message = saved.party_line_message;
        return sendJSON(res, result);
      }

      if (method === "POST" && pathname === "/api/v4/route/progress") {
        const body = await parseJSONBody(req);
        const state = await import("./route-state.mjs");
        const result = await state.updateCurrentRouteProgress({
          macroId: body.macro_id || body.macroId || "next",
          status: body.status || "done",
          proofNote: body.proof_note || body.proofNote || "",
          actor: body.actor || "operator",
          dataRoot: dataRoot(),
          emitReceipt: body.receipt ? (receipt) => emitReceipt(dataRoot(), receipt) : null,
          postPartyLine: body.party_line === false ? null : (text) => partyLinePost({
            from: "AE0",
            channel: "mission-spine",
            text,
          }),
        });
        return sendJSON(res, result);
      }

      if (method === "POST" && pathname === "/api/v4/route/verify-gates") {
        const body = await parseJSONBody(req).catch(() => ({}));
        const gates = await import("./proof-gates.mjs");
        const result = await gates.runCurrentRouteProofGates({
          dataRoot: dataRoot(),
          writeReceipt: !!body.receipt,
          timeoutMs: body.timeout_ms || body.timeoutMs || 180000,
          postPartyLine: body.party_line === false ? null : (text) => partyLinePost({
            from: "AE14",
            channel: "mission-spine",
            text,
          }),
        });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/route/package") {
        const body = await parseJSONBody(req).catch(() => ({}));
        const pack = await import("./route-package.mjs");
        const result = await pack.packageCurrentRoute({
          dataRoot: dataRoot(),
          writeReceipt: !!body.receipt,
          postPartyLine: body.party_line === false ? null : (text) => partyLinePost({
            from: "AE8",
            channel: "mission-spine",
            text,
          }),
        });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/route/receipt") {
        const body = await parseJSONBody(req).catch(() => ({}));
        const pack = await import("./route-package.mjs");
        const result = await pack.synthesizeRouteReceipt({
          dataRoot: dataRoot(),
          postPartyLine: body.party_line === false ? null : (text) => partyLinePost({
            from: "AE14",
            channel: "mission-spine",
            text,
          }),
        });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/route/promote") {
        const body = await parseJSONBody(req).catch(() => ({}));
        const pack = await import("./route-package.mjs");
        const result = await pack.promoteCurrentRoute({
          dataRoot: dataRoot(),
          writeReceipt: !!body.receipt,
          postPartyLine: body.party_line === false ? null : (text) => partyLinePost({
            from: "ORANGE",
            channel: "mission-spine",
            text,
          }),
        });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/route/doctor") {
        const doctor = await import("./operating-spine.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runRouteDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/route/state-doctor") {
        const doctor = await import("./route-state.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runRouteStateDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/claude/export-route") {
        const body = await parseJSONBody(req);
        const objective = body.objective || body.goal || body.task || "";
        if (!objective) return sendError(res, "objective is required", 400, req);
        const spine = await import("./operating-spine.mjs");
        const result = await spine.exportClaudeRoute({
          objective,
          project: body.project || "orangebox",
          dataRoot: dataRoot(),
          writeFile: body.write_file !== false,
          writeReceipt: body.receipt === true,
        });
        return sendJSON(res, result);
      }

      // ── POST /api/v4/party-line/send ───────────────────────────────────────
      // Department OS: deterministic ORANGEBOX PM/router packets.
      if (method === "GET" && pathname === "/api/v4/dept/registry") {
        const reg = await import("./dept-registry.mjs");
        return sendJSON(res, reg.registrySummary());
      }

      if (method === "GET" && pathname === "/api/v4/dept/trust") {
        const trust = await import("./trust-ledger.mjs");
        return sendJSON(res, await trust.trustSummary({ dataRoot: dataRoot() }));
      }

      if (method === "POST" && pathname === "/api/v4/dept/route") {
        const body = await parseJSONBody(req);
        const goal = body.goal || body.task || "";
        if (!goal) return sendError(res, "goal is required", 400, req);
        const router = await import("./dept-router.mjs");
        const result = await router.routeGoal({
          goal,
          project: body.project || "orangebox",
          dataRoot: dataRoot(),
          maxDepartments: body.max_departments || body.maxDepartments || 5,
          writeRoute: true,
          emitReceipt: body.receipt ? (receipt) => emitReceipt(dataRoot(), receipt) : null,
          postPartyLine: body.party_line === false ? null : (text) => partyLinePost({
            from: "AE0",
            channel: "dept-os",
            text,
          }),
        });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/dept/doctor") {
        const doctor = await import("./dept-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runDeptDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/party-line/send") {
        const body = await parseJSONBody(req);
        if (!body.text) return sendError(res, "text is required");
        const msg = partyLinePost({ from: body.from, text: body.text, channel: body.channel });
        return sendJSON(res, { id: msg.id, ts: msg.ts }, 201);
      }

      // ── GET /api/v4/party-line/recent ──────────────────────────────────────
      if (method === "GET" && pathname === "/api/v4/party-line/recent") {
        const limit = urlParams(raw).get("limit");
        return sendJSON(res, { messages: partyLineRecent(limit) });
      }

      // ── GET /api/v4/dag/current ────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/v4/dag/current") {
        const dagFile = path.join(dataRoot(), "dag", "current.json");
        try {
          const data = JSON.parse(await fs.readFile(dagFile, "utf8"));
          return sendJSON(res, { current: data.current || null, nodes: data.nodes || [] });
        } catch {
          return sendJSON(res, { current: null, nodes: [] });
        }
      }

      // ── POST /api/v4/dag/update ────────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/dag/update") {
        const body    = await parseJSONBody(req);
        if (!body.nodeId) return sendError(res, "nodeId is required");
        const dagFile = path.join(dataRoot(), "dag", "current.json");
        let dag;
        try {
          dag = JSON.parse(await fs.readFile(dagFile, "utf8"));
        } catch {
          dag = { current: null, nodes: [] };
        }
        const idx = dag.nodes.findIndex(n => n.id === body.nodeId);
        if (idx >= 0) {
          dag.nodes[idx] = { ...dag.nodes[idx], ...body.patch };
        } else {
          dag.nodes.push({ id: body.nodeId, ...body.patch });
        }
        dag.updatedAt = new Date().toISOString();
        await fs.mkdir(path.join(dataRoot(), "dag"), { recursive: true });
        await fs.writeFile(dagFile, JSON.stringify(dag, null, 2), "utf8");
        return sendJSON(res, { ok: true });
      }

      // ── POST /api/v4/queue/enqueue ─────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/queue/enqueue") {
        const body = await parseJSONBody(req);
        if (!body.title || !body.prompt) return sendError(res, "title and prompt are required");
        const q = await getQueue();
        const job = await q.enqueue({
          title:    body.title,
          prompt:   body.prompt,
          priority: body.priority,
          worker:   body.worker,
        });
        return sendJSON(res, { id: job.id }, 201);
      }

      // ── GET /api/v4/queue/list ─────────────────────────────────────────────
      if (method === "GET" && pathname === "/api/v4/queue/list") {
        const status = urlParams(raw).get("status") || undefined;
        const q    = await getQueue();
        const jobs = await q.list({ status });
        return sendJSON(res, { jobs });
      }

      // ── POST /api/v4/queue/cancel ──────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/queue/cancel") {
        const body = await parseJSONBody(req);
        if (!body.id) return sendError(res, "id is required");
        const q = await getQueue();
        try {
          await q.cancel(body.id);
          return sendJSON(res, { ok: true });
        } catch (e) {
          return sendError(res, e.message, 400);
        }
      }

      // ── POST /api/v4/privacy/record-egress ────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/privacy/record-egress") {
        const meta = await parseJSONBody(req);
        await recordEgress(meta);
        return sendJSON(res, { ok: true });
      }

      // ── GET /api/v4/privacy/summary ────────────────────────────────────────
      if (method === "GET" && pathname === "/api/v4/privacy/summary") {
        const sinceStr = urlParams(raw).get("since");
        let sinceMs = null;
        if (sinceStr) {
          const m = sinceStr.match(/^(\d+(?:\.\d+)?)(h|d|m|s)$/i);
          if (m) {
            const n = parseFloat(m[1]);
            const u = m[2].toLowerCase();
            const mul = { h: 3_600_000, d: 86_400_000, m: 60_000, s: 1_000 };
            sinceMs = n * (mul[u] || 3_600_000);
          }
        }
        const priv = await getPrivacy();
        const rows = await priv.loadEgress(sinceMs);
        const totals = { calls: rows.length, costCents: 0, inputTokens: 0, outputTokens: 0, cached: 0 };
        const byProvider = {};
        for (const r of rows) {
          totals.costCents    += r.costCents    || 0;
          totals.inputTokens  += r.inputTokens  || 0;
          totals.outputTokens += r.outputTokens || 0;
          if (r.cached) totals.cached++;
          const p = r.provider || "unknown";
          if (!byProvider[p]) byProvider[p] = { calls: 0, costCents: 0 };
          byProvider[p].calls++;
          byProvider[p].costCents += r.costCents || 0;
        }
        return sendJSON(res, { totals, byProvider });
      }

      // ── POST /api/v4/voice/transcribe ──────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/voice/transcribe") {
        const ct = req.headers["content-type"] || "";
        let audioPath;
        let tmpCreated = false;
        try {
          if (ct.includes("multipart/form-data")) {
            const parts = await parseMultipart(req);
            const audioPart = parts.find(p => p.filename || p.name === "audio");
            if (!audioPart) return sendError(res, "No audio part in multipart body");
            const ext    = path.extname(audioPart.filename || "audio.wav") || ".wav";
            audioPath    = path.join(os.tmpdir(), `ob-voice-${Date.now()}${ext}`);
            tmpCreated   = true;
            await fs.writeFile(audioPath, audioPart.data);
          } else if (ct.includes("application/octet-stream")) {
            const raw2 = await readBody(req);
            audioPath   = path.join(os.tmpdir(), `ob-voice-${Date.now()}.wav`);
            tmpCreated  = true;
            await fs.writeFile(audioPath, Buffer.from(raw2, "binary"));
          } else {
            return sendError(res, "Expected multipart/form-data or application/octet-stream");
          }

          const whisper = await getWhisper();
          const result  = await whisper.transcribe(audioPath);
          await recordEgress({
            provider:    result.cloudFallback ? "openai-whisper-cloud" : "local-whisper",
            endpoint:    result.cloudFallback ? "https://api.openai.com/v1/audio/transcriptions" : "local",
            model:       result.model || "whisper",
            inputTokens: 0, outputTokens: 0, cached: false, costCents: 0,
            callerScript: "v4:/voice/transcribe",
          });
          // Canonical receipt (UX spec §3.8.4 source=voice-transcribe)
          await emitReceipt(dataRoot(), {
            source:   "voice-transcribe",
            title:    `WAV transcribe: ${path.basename(audioPath)}`,
            summary:  `${(result.text || "").slice(0, 200)}`,
            evidence: { model: result.model, durationMs: result.durationMs, cloudFallback: !!result.cloudFallback },
          });
          return sendJSON(res, {
            text:       result.text       || "",
            durationMs: result.durationMs || 0,
            model:      result.model      || "whisper",
            local:      result.local      ?? !result.cloudFallback,
          });
        } finally {
          if (tmpCreated && audioPath) {
            fs.unlink(audioPath).catch(() => {});
          }
        }
      }

      // ── POST /api/v4/fs/tree ───────────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/fs/tree") {
        const body = await parseJSONBody(req);
        if (!body.path) return sendError(res, "path is required");
        if (!isFsPathSafe(body.path)) return sendError(res, "Access denied: path outside allowed root or blocked pattern", 403);
        const maxDepth = Math.min(Math.max(1, parseInt(body.depth, 10) || 3), 6);
        const resolvedPath = path.resolve(body.path);
        // L-pillar2: hard-fail with 400 when root is missing, not silent { type: "missing" }.
        const rootStat = await fs.stat(resolvedPath).catch(e => ({ _err: e.message }));
        if (rootStat._err !== undefined) {
          return sendError(res, `Cannot stat path: ${rootStat._err}`, 400);
        }
        const tree = await buildTree(resolvedPath, 0, maxDepth);
        return sendJSON(res, tree);
      }

      // ── POST /api/v4/fs/read ───────────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/fs/read") {
        const body = await parseJSONBody(req);
        if (!body.path) return sendError(res, "path is required");
        if (!isFsPathSafe(body.path)) return sendError(res, "Access denied", 403);
        try {
          const content = await fs.readFile(path.resolve(body.path), "utf8");
          return sendJSON(res, { content, encoding: "utf8" });
        } catch (e) {
          return sendError(res, `Cannot read file: ${e.message}`, 404);
        }
      }

      // ── POST /api/v4/fs/write ──────────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/fs/write") {
        const body = await parseJSONBody(req);
        if (!body.path || body.content === undefined) return sendError(res, "path and content are required");
        if (!isFsPathSafe(body.path)) return sendError(res, "Access denied", 403);
        // v6.0.2 — freeze hook
        const fz = await import("./freeze-guard.mjs");
        const fzCheck = fz.checkPathAllowed(body.path, { project: body.project || null });
        if (!fzCheck.allowed) return sendError(res, fzCheck.reason || "FROZEN", 403);
        const resolved = path.resolve(body.path);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        const buf = Buffer.from(body.content, "utf8");
        await fs.writeFile(resolved, buf);
        await emitReceipt(dataRoot(), {
          source:   "fs-write",
          title:    `File write: ${path.basename(resolved)}`,
          summary:  `Wrote ${buf.length} bytes to ${resolved}`,
          evidence: { path: resolved, bytes: buf.length },
        });
        return sendJSON(res, { ok: true, bytes: buf.length });
      }

      // ── POST /api/v4/ide/autocomplete ──────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/ide/autocomplete") {
        const body = await parseJSONBody(req);
        const { before, after, lang, path: filePath, maxChars } = body;
        if (!before) return sendError(res, "before is required");
        const prompt = `Complete the following ${lang || "code"} (file: ${filePath || "unknown"}).\n` +
          `Before cursor:\n${String(before).slice(-(maxChars || 400))}\n` +
          `After cursor:\n${String(after || "").slice(0, 200)}\n` +
          `Return ONLY the completion text, no explanation.`;
        const result = await anthropicCall({
          system:    "You are a code completion engine. Return only the completion, no explanation.",
          messages:  [{ role: "user", content: prompt }],
          model:     "claude-haiku-4-5-20251001",
          callerRef: "v4:/ide/autocomplete",
        });
        return sendJSON(res, {
          suggestion: result.text || "",
          model:      result.model || ANTHROPIC_MODEL_DEFAULT,
          costCents:  result.costCents || 0,
        }, result.ok ? 200 : 502);
      }

      // ── POST /api/v4/ide/composer ──────────────────────────────────────────
      // Phase 2: structured outputs — schema-validated JSON, no fence-strip retry.
      // Memory tool auto-attached (memory_20250818).
      if (method === "POST" && pathname === "/api/v4/ide/composer") {
        const body = await parseJSONBody(req);
        const { files, instruction } = body;
        if (!Array.isArray(files) || !instruction) return sendError(res, "files (array of paths) and instruction are required");

        const fileParts = await Promise.all(files.slice(0, 10).map(async (fp) => {
          if (!isFsPathSafe(fp)) return `// [BLOCKED: ${fp}]\n`;
          try {
            const content = await fs.readFile(path.resolve(fp), "utf8");
            return `// FILE: ${fp}\n${content}\n`;
          } catch { return `// [MISSING: ${fp}]\n`; }
        }));

        const prompt =
          `Instruction: ${instruction}\n\n` +
          `Files:\n${fileParts.join("\n---\n")}`;

        const composerTools = [
          { type: "memory_20250818", name: "memory" },
        ];

        const composerOutputConfig = {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                plan:    { type: "string" },
                changes: {
                  type:  "array",
                  items: {
                    type: "object",
                    properties: {
                      path:       { type: "string" },
                      preview:    { type: "string" },
                      newContent: { type: "string" },
                    },
                    required: ["path", "preview", "newContent"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["plan", "changes"],
              additionalProperties: false,
            },
          },
        };

        const result = await anthropicCall({
          system:        "You are a multi-file code editor. Follow the instruction. Return structured output.",
          messages:      [{ role: "user", content: prompt }],
          model:         ANTHROPIC_MODEL_DEFAULT,
          callerRef:     "v4:/ide/composer",
          tools:         composerTools,
          output_config: composerOutputConfig,
        });

        if (!result.ok) return sendError(res, result.error || "Model call failed", 502);

        // Structured output — parse rawContent directly (no fence-strip needed).
        let parsed = { plan: "", changes: [] };
        try {
          const jsonBlock = result.rawContent?.find(c => c.type === "text");
          if (jsonBlock?.text) parsed = JSON.parse(jsonBlock.text);
          else if (result.text) parsed = JSON.parse(result.text);
        } catch {
          parsed = { plan: result.text || "", changes: [] };
        }

        await emitReceipt(dataRoot(), {
          source:   "ide-composer",
          title:    `Composer: ${instruction.slice(0, 60)}`,
          summary:  parsed.plan || "",
          evidence: { files, changeCount: (parsed.changes || []).length },
        });

        return sendJSON(res, { plan: parsed.plan || "", changes: parsed.changes || [] });
      }

      // ── POST /api/v4/terminal/suggest ──────────────────────────────────────
      // Phase 2: structured outputs — schema validates command/reasoning/danger_level.
      if (method === "POST" && pathname === "/api/v4/terminal/suggest") {
        const body = await parseJSONBody(req);
        const { shell, cwd, intent, history, platform } = body;
        if (!intent) return sendError(res, "intent is required");
        const prompt =
          `Shell: ${shell || "bash"}\nPlatform: ${platform || process.platform}\n` +
          `CWD: ${cwd || "unknown"}\n` +
          (history?.length ? `Recent history:\n${history.slice(-5).join("\n")}\n` : "") +
          `Intent: ${intent}`;
        const terminalOutputConfig = {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                command:      { type: "string" },
                reasoning:    { type: "string" },
                danger_level: { type: "string", enum: ["safe", "moderate", "dangerous", "destructive"] },
              },
              required: ["command", "reasoning", "danger_level"],
              additionalProperties: false,
            },
          },
        };
        const result = await anthropicCall({
          system:        "You are a terminal command assistant. Return structured output with the command, reasoning, and danger_level.",
          messages:      [{ role: "user", content: prompt }],
          model:         "claude-haiku-4-5-20251001",
          callerRef:     "v4:/terminal/suggest",
          output_config: terminalOutputConfig,
        });
        if (!result.ok) return sendError(res, result.error || "Model call failed", 502);
        let parsed;
        try {
          const jsonBlock = result.rawContent?.find(c => c.type === "text");
          parsed = JSON.parse(jsonBlock?.text || result.text);
        } catch {
          parsed = { command: result.text.trim(), reasoning: "", danger_level: "moderate" };
        }
        return sendJSON(res, {
          command:      parsed.command      || "",
          reasoning:    parsed.reasoning    || "",
          danger_level: parsed.danger_level || "moderate",
        });
      }

      // ── POST /api/v4/trilane/stream ────────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/trilane/stream") {
        const body = await parseJSONBody(req);
        const leg  = (body.leg || "claude").toLowerCase();
        const msgs = body.messages || [{ role: "user", content: body.prompt || "" }];
        const sys  = body.system || "You are an expert AI assistant in the ORANGEBOX trilane debate.";
        startSSE(res);
        if (leg === "gpt" || leg === "openai") {
          await openaiStream(res, { system: sys, messages: msgs, model: body.model, callerRef: "v4:/trilane/stream" });
        } else if (leg === "gemini" || leg === "google") {
          await geminiStream(res, { system: sys, messages: msgs, model: body.model, callerRef: "v4:/trilane/stream" });
        } else {
          await anthropicStream(res, { system: sys, messages: msgs, model: body.model, dataRoot: dataRoot(), callerRef: "v4:/trilane/stream" });
        }
        return;
      }

      // ── POST /api/v4/trilane/conflicts ─────────────────────────────────────
      // ID-05 / L-3: responses is [{leg, text}] or plain strings.
      // Phase 2: structured outputs — schema enforces axis/positions/severity shape.
      if (method === "POST" && pathname === "/api/v4/trilane/conflicts") {
        const body = await parseJSONBody(req);
        const { responses, prompt: tPrompt } = body;
        if (!Array.isArray(responses) || responses.length < 2) return sendError(res, "responses (array of >=2 {leg,text} objects or strings) is required");

        // Normalize: accept both {leg, text} objects and plain strings.
        const normalized = responses.map((r, i) => ({
          leg:  (typeof r === "object" && r !== null && r.leg)  ? String(r.leg)  : `Model ${i + 1}`,
          text: (typeof r === "object" && r !== null && r.text) ? String(r.text) : String(r || ""),
        }));

        const inp =
          `Prompt given to all models: ${tPrompt || "(not provided)"}\n\n` +
          normalized.map(r => `${r.leg}:\n${r.text}`).join("\n\n") +
          `\n\nList all meaningful conflicts between these responses. Each conflict needs an axis, positions array, and severity.`;

        const conflictsOutputConfig = {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                conflicts: {
                  type:  "array",
                  items: {
                    type: "object",
                    properties: {
                      axis:      { type: "string" },
                      positions: {
                        type:  "array",
                        items: {
                          type: "object",
                          properties: {
                            leg:      { type: "string", enum: ["claude", "gpt", "gemini", "Model 1", "Model 2", "Model 3"] },
                            position: { type: "string" },
                          },
                          required: ["leg", "position"],
                          additionalProperties: false,
                        },
                      },
                      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    },
                    required: ["axis", "positions", "severity"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["conflicts"],
              additionalProperties: false,
            },
          },
        };

        const result = await anthropicCall({
          system:        "You are a conflict-detection engine. Identify conflicts between model responses.",
          messages:      [{ role: "user", content: inp }],
          model:         ANTHROPIC_MODEL_DEFAULT,
          callerRef:     "v4:/trilane/conflicts",
          output_config: conflictsOutputConfig,
        });
        if (!result.ok) return sendError(res, result.error || "Model call failed", 502);
        let parsed;
        try {
          const jsonBlock = result.rawContent?.find(c => c.type === "text");
          parsed = JSON.parse(jsonBlock?.text || result.text);
        } catch {
          parsed = { conflicts: [] };
        }
        // Normalize positions to ensure leg enum validity — fallback to raw value if not matching enum.
        const conflicts = (parsed.conflicts || []).map(c => ({
          axis:      c.axis || "unknown",
          positions: Array.isArray(c.positions)
            ? c.positions.map(p => ({ leg: p.leg || "unknown", position: p.position || "" }))
            : [],
          severity: c.severity || "medium",
        }));
        return sendJSON(res, { conflicts });
      }

      // ── POST /api/v4/trilane/synthesize ────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/trilane/synthesize") {
        const body = await parseJSONBody(req);
        const { prompt: tPrompt, legs, votedFor } = body;
        if (!tPrompt) return sendError(res, "prompt is required");
        const legsText = Array.isArray(legs) && legs.length
          ? legs.map((l, i) => `${l.label || `Model ${i + 1}`}:\n${l.text}`).join("\n\n")
          : "(no individual leg responses provided)";
        const authority = "Authority order: GPT-5 (Architect) > Gemini 1.5 Pro (Consigliere) > Claude Sonnet (Compiler)";
        const inp =
          `${authority}\n\n` +
          `Prompt: ${tPrompt}\n\n` +
          `Model responses:\n${legsText}\n\n` +
          (votedFor ? `Operator voted for: ${votedFor}\n\n` : "") +
          `Synthesize a final verdict respecting the authority order. Return JSON: { verdict, detail, authority_note }`;
        const result = await anthropicCall({
          system:    "You are the ORANGEBOX trilane synthesizer. Follow authority order strictly. Return only valid JSON.",
          messages:  [{ role: "user", content: inp }],
          model:     ANTHROPIC_MODEL_DEFAULT,
          callerRef: "v4:/trilane/synthesize",
        });
        if (!result.ok) return sendError(res, result.error || "Model call failed", 502);
        let parsed;
        try {
          const jm = result.text.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(jm ? jm[0] : result.text);
        } catch {
          parsed = { verdict: result.text, detail: "", authority_note: authority };
        }
        await emitReceipt(dataRoot(), {
          source:   "trilane-synthesize",
          title:    `Trilane synthesis: ${tPrompt.slice(0, 60)}`,
          summary:  parsed.verdict || "",
          evidence: { votedFor: votedFor || null, legCount: Array.isArray(legs) ? legs.length : 0 },
        });
        return sendJSON(res, {
          verdict:        parsed.verdict        || "",
          detail:         parsed.detail         || "",
          authority_note: parsed.authority_note || authority,
        });
      }

      // ── POST /api/v4/voice/intent ──────────────────────────────────────────
      // Phase 2: structured outputs — schema enforces intent enum / params / suggestedAction.
      if (method === "POST" && pathname === "/api/v4/voice/intent") {
        const body = await parseJSONBody(req);
        const { transcript, context: vCtx } = body;
        if (!transcript) return sendError(res, "transcript is required");
        const intentOutputConfig = {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                intent: {
                  type: "string",
                  enum: [
                    "compose", "edit", "explain", "search", "navigate",
                    "run", "refactor", "commit", "review", "chat", "unknown",
                  ],
                },
                params:          { type: "object", additionalProperties: true },
                suggestedAction: { type: "string" },
              },
              required: ["intent", "params", "suggestedAction"],
              additionalProperties: false,
            },
          },
        };
        const result = await anthropicCall({
          system:        "You are a voice intent classifier for ORANGEBOX. Classify the operator's intent from transcribed speech.",
          messages:      [{ role: "user", content: `Transcript: ${transcript}${vCtx ? `\nContext: ${vCtx}` : ""}` }],
          model:         "claude-haiku-4-5-20251001",
          callerRef:     "v4:/voice/intent",
          output_config: intentOutputConfig,
        });
        if (!result.ok) return sendError(res, result.error || "Model call failed", 502);
        let parsed;
        try {
          const jsonBlock = result.rawContent?.find(c => c.type === "text");
          parsed = JSON.parse(jsonBlock?.text || result.text);
        } catch {
          parsed = { intent: "unknown", params: {}, suggestedAction: result.text || "" };
        }
        // Emit canonical receipt
        await emitReceipt(dataRoot(), {
          source:   "voice-intent",
          title:    `Voice intent: ${String(transcript).slice(0, 60)}`,
          summary:  `intent=${parsed.intent || "unknown"} · ${parsed.suggestedAction || ""}`.slice(0, 200),
          evidence: { transcript_excerpt: String(transcript).slice(0, 300), intent: parsed.intent, params: parsed.params },
        });
        return sendJSON(res, {
          intent:          parsed.intent          || "unknown",
          params:          parsed.params          || {},
          suggestedAction: parsed.suggestedAction || "",
        });
      }

      // ── POST /api/v4/compound/build ────────────────────────────────────────
      // Build compound system prompt from vault + mistakes ledger.
      if (method === "POST" && pathname === "/api/v4/compound/build") {
        const body = await parseJSONBody(req);
        const { task, baseSystem, query, hint } = body;
        const compound = await getCompound();
        const result = await compound.compoundSystem({
          task:       task       || "chat",
          baseSystem: baseSystem || "",
          query:      query      || "",
          hint:       hint       || "",
        });
        return sendJSON(res, {
          system:        result.system,
          vaultHash:     result.vaultHash,
          mistakesCount: result.mistakesCount,
        });
      }

      // ── POST /api/v4/mcp/add ───────────────────────────────────────────────
      // Append an MCP server definition to servers.json + emit receipt.
      if (method === "POST" && pathname === "/api/v4/mcp/add") {
        const body = await parseJSONBody(req);
        const { name, type, url, description } = body;
        if (!name || !type || !url) return sendError(res, "name, type, and url are required");
        const mcpDir     = path.join(dataRoot(), "mcp");
        const serversFile = path.join(mcpDir, "servers.json");
        await fs.mkdir(mcpDir, { recursive: true });
        let servers = [];
        try { servers = JSON.parse(await fs.readFile(serversFile, "utf8")); } catch { /* new file */ }
        const id = uuidv4();
        const entry = { id, name, type, url, description: description || "", added_at: new Date().toISOString() };
        servers.push(entry);
        await fs.writeFile(serversFile, JSON.stringify(servers, null, 2), "utf8");
        // Emit receipt to receipts/mcp/<ts>-add.json
        const receiptDir = path.join(dataRoot(), "receipts", "mcp");
        await fs.mkdir(receiptDir, { recursive: true });
        const ts = Date.now();
        const receiptPath = path.join(receiptDir, `${ts}-add.json`);
        await fs.writeFile(receiptPath, JSON.stringify({ id, name, type, url, description, added_at: entry.added_at }, null, 2), "utf8");
        return sendJSON(res, { ok: true, id }, 201);
      }

      // ── GET /api/v4/settings/api-keys ─────────────────────────────────────
      // Return presence (boolean) of each key — NEVER the values.
      if (method === "GET" && pathname === "/api/v4/mcp/servers") {
        const bridge = await import("./mcp-bridge.mjs");
        return sendJSON(res, await bridge.listServers({ dataRoot: dataRoot() }));
      }
      if (method === "GET" && pathname === "/api/v4/mcp/doctor") {
        const doctor = await import("./mcp-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runMcpDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }
      if (method === "POST" && pathname === "/api/v4/mcp/register") {
        const bridge = await import("./mcp-bridge.mjs");
        const body = await parseJSONBody(req);
        const result = await bridge.registerServer({ dataRoot: dataRoot(), body });
        await emitReceipt(dataRoot(), {
          source: "mcp-bridge",
          title: `MCP registered: ${result.server.name}`,
          summary: `${result.server.transport} ${result.server.url || result.server.command || ""}`.trim(),
          evidence: { server: result.server, registry_path: result.registry_path },
        });
        return sendJSON(res, result, 201);
      }
      if (method === "POST" && pathname.startsWith("/api/v4/mcp/probe/")) {
        const bridge = await import("./mcp-bridge.mjs");
        const id = decodeURIComponent(pathname.replace("/api/v4/mcp/probe/", ""));
        const body = await parseJSONBody(req).catch(() => ({}));
        const result = await bridge.probeServer({ dataRoot: dataRoot(), id, timeoutMs: Number(body.timeout_ms || 7000) });
        await emitReceipt(dataRoot(), {
          source: "mcp-bridge",
          title: `MCP probe: ${id}`,
          summary: `${result.promotion_gate || "probe"}; tools=${result.tools_count || 0}`,
          evidence: result,
        });
        return sendJSON(res, result);
      }
      if (method === "GET" && pathname.startsWith("/api/v4/mcp/tools/")) {
        const bridge = await import("./mcp-bridge.mjs");
        const id = decodeURIComponent(pathname.replace("/api/v4/mcp/tools/", ""));
        return sendJSON(res, await bridge.listTools({ dataRoot: dataRoot(), id }));
      }
      if (method === "POST" && pathname === "/api/v4/mcp/code-search") {
        const body = await parseJSONBody(req);
        const codeMode = await import("./code-mode-mcp.mjs");
        const result = await codeMode.searchDocs({
          query: body.query || body.q || "",
          limit: body.limit || 8,
        });
        return sendJSON(res, result);
      }
      if (method === "POST" && pathname === "/api/v4/mcp/code-execute") {
        const body = await parseJSONBody(req);
        const codeMode = await import("./code-mode-mcp.mjs");
        const result = await codeMode.executeSnippet({
          command: body.command || body.snippet || "",
          timeoutMs: body.timeout_ms || body.timeoutMs || 120000,
          dataRoot: dataRoot(),
          writeReceipt: body.receipt !== false,
        });
        return sendJSON(res, result, result.blocked ? 403 : 200);
      }
      if (method === "POST" && pathname.startsWith("/api/v4/mcp/disable/")) {
        const bridge = await import("./mcp-bridge.mjs");
        const id = decodeURIComponent(pathname.replace("/api/v4/mcp/disable/", ""));
        const body = await parseJSONBody(req).catch(() => ({}));
        const result = await bridge.disableServer({ dataRoot: dataRoot(), id, disabled: body.disabled !== false });
        await emitReceipt(dataRoot(), {
          source: "mcp-bridge",
          title: `MCP ${result.disabled ? "disabled" : "enabled"}: ${id}`,
          summary: "Operator-controlled bridge registry override.",
          evidence: result,
        });
        return sendJSON(res, result);
      }

      if (method === "GET" && pathname === "/api/v4/intel/items") {
        const intel = await import("./intel-integration.mjs");
        return sendJSON(res, await intel.listIntel({
          priority: parsed.searchParams.get("priority"),
          domain: parsed.searchParams.get("domain"),
        }));
      }

      if (method === "GET" && pathname === "/api/v4/intel/brief") {
        const intel = await import("./intel-integration.mjs");
        return sendJSON(res, await intel.buildIntelBrief({
          priority: parsed.searchParams.get("priority"),
          domain: parsed.searchParams.get("domain"),
        }));
      }

      if (method === "GET" && pathname === "/api/v4/intel/doctor") {
        const intel = await import("./intel-integration.mjs");
        const result = await intel.runIntelDoctor();
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/intel/surface") {
        const surface = await import("./intel-surface.mjs");
        const result = await surface.runIntelSurfaceDoctor({
          dataRoot: dataRoot(),
          writeReceipt: true,
        });
        return sendJSON(res, result, result.ok ? 201 : 409);
      }

      if (method === "GET" && pathname === "/api/v4/settings/api-keys") {
        // v6.0.1 — include Groq + Ollama host status + LOCAL_MODE + budget mode
        return sendJSON(res, {
          keys: {
            ANTHROPIC_API_KEY:  Boolean(ANTHROPIC_KEY),
            OPENAI_API_KEY:     Boolean(OPENAI_KEY),
            GOOGLE_API_KEY:     Boolean(GOOGLE_KEY),
            OPENROUTER_API_KEY: Boolean(OPENROUTER_KEY),
            GROQ_API_KEY:       Boolean(GROQ_KEY),
            XAI_API_KEY:        Boolean(XAI_KEY),
          },
          v6: {
            local_mode_enabled: /^(1|true|yes|on)$/i.test(String(process.env.ORANGEBOX_LOCAL_MODE || "")),
            ollama_host:        OLLAMA_HOST,
            budget_mode:        (process.env.ORANGEBOX_BUDGET_MODE || "balanced").toLowerCase(),
            route_tier:         (process.env.ORANGEBOX_ROUTE_TIER || "heuristic").toLowerCase(),
            // v6.0.11 — display + project + onboarding state
            density:               (process.env.ORANGEBOX_DENSITY || "comfortable").toLowerCase(),
            zoom:                  parseFloat(process.env.ORANGEBOX_ZOOM || "1.0"),
            project_name:          process.env.ORANGEBOX_PROJECT_NAME || "",
            onboarding_dismissed:  /^(1|true|yes|on)$/i.test(String(process.env.ORANGEBOX_ONBOARDING_DISMISSED || "")),
          },
        });
      }

      // POST /api/v4/settings/api-keys — persist keys to .env-like file in data root.
      // The buyer's UI never sees the raw values back; presence flags only.
      if (method === "POST" && pathname === "/api/v4/settings/api-keys") {
        const body = await parseJSONBody(req);
        const keyOrder = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "XAI_API_KEY"];
        const settingsDir  = path.join(dataRoot(), "settings");
        const settingsFile = path.join(settingsDir, "api-keys.env");
        await fs.mkdir(settingsDir, { recursive: true });
        let existing = "";
        try { existing = await fs.readFile(settingsFile, "utf8"); } catch { /* fresh */ }
        const lines = existing.split(/\r?\n/).filter(Boolean);
        const map = new Map();
        for (const ln of lines) {
          const m = ln.match(/^([A-Z_]+)=(.*)$/);
          if (m) map.set(m[1], m[2]);
        }
        for (const k of keyOrder) {
          if (typeof body[k] === "string" && body[k].length > 0) {
            map.set(k, body[k]);
            // Hot-set in current process so subsequent calls pick it up.
            process.env[k] = body[k];
          }
        }
        if (typeof body.ORANGEBOX_LOCAL_MODE !== "undefined") {
          const v = body.ORANGEBOX_LOCAL_MODE ? "1" : "0";
          map.set("ORANGEBOX_LOCAL_MODE", v);
          process.env.ORANGEBOX_LOCAL_MODE = v;
        }
        if (typeof body.ORANGEBOX_BUDGET_MODE === "string") {
          map.set("ORANGEBOX_BUDGET_MODE", body.ORANGEBOX_BUDGET_MODE);
          process.env.ORANGEBOX_BUDGET_MODE = body.ORANGEBOX_BUDGET_MODE;
        }
        // v6.0.11 — display + project preferences
        if (typeof body.ORANGEBOX_DENSITY === "string")      { map.set("ORANGEBOX_DENSITY",      body.ORANGEBOX_DENSITY); process.env.ORANGEBOX_DENSITY = body.ORANGEBOX_DENSITY; }
        if (typeof body.ORANGEBOX_ZOOM === "string")         { map.set("ORANGEBOX_ZOOM",         body.ORANGEBOX_ZOOM); process.env.ORANGEBOX_ZOOM = body.ORANGEBOX_ZOOM; }
        if (typeof body.ORANGEBOX_PROJECT_NAME === "string") { map.set("ORANGEBOX_PROJECT_NAME", body.ORANGEBOX_PROJECT_NAME); process.env.ORANGEBOX_PROJECT_NAME = body.ORANGEBOX_PROJECT_NAME; }
        if (typeof body.ORANGEBOX_ONBOARDING_DISMISSED === "boolean") {
          const v = body.ORANGEBOX_ONBOARDING_DISMISSED ? "1" : "0";
          map.set("ORANGEBOX_ONBOARDING_DISMISSED", v);
          process.env.ORANGEBOX_ONBOARDING_DISMISSED = v;
        }
        const out = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
        await fs.writeFile(settingsFile, out, { mode: 0o600 });
        refreshKeys();
        return sendJSON(res, {
          ok: true,
          saved_to: settingsFile,
          presence: {
            ANTHROPIC_API_KEY:  !!process.env.ANTHROPIC_API_KEY,
            OPENAI_API_KEY:     !!process.env.OPENAI_API_KEY,
            GOOGLE_API_KEY:     !!process.env.GOOGLE_API_KEY,
            OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
            GROQ_API_KEY:       !!process.env.GROQ_API_KEY,
            XAI_API_KEY:        !!process.env.XAI_API_KEY,
          },
        });
      }

      // ── GET /api/v4/hermes/status ──────────────────────────────────────────
      // Spawn hermes-status.mjs --json; on ENOENT return NOT_INSTALLED shape.
      if (method === "GET" && pathname === "/api/v4/hermes/status") {
        const hermesScript = path.join(appRoot, "scripts", "v4", "hermes", "hermes-status.mjs");
        const result = await new Promise((resolve) => {
          const proc = spawn(process.execPath, [hermesScript, "--json"], {
            cwd: appRoot,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
          });
          let out = "";
          let err = "";
          proc.stdout.on("data", (d) => { out += d.toString("utf8"); });
          proc.stderr.on("data", (d) => { err += d.toString("utf8"); });
          proc.on("error", (e) => {
            if (e.code === "ENOENT") resolve({ status: "NOT_INSTALLED", version: null, mcpReady: false });
            else resolve({ status: "ERROR", error: e.message, version: null, mcpReady: false });
          });
          proc.on("close", (code) => {
            if (code !== 0 && !out.trim()) {
              resolve({ status: "ERROR", error: err.trim() || `exit ${code}`, version: null, mcpReady: false });
              return;
            }
            try { resolve(JSON.parse(out.trim())); }
            catch { resolve({ status: "NOT_INSTALLED", version: null, mcpReady: false }); }
          });
        });
        // Verify hermes-status.mjs exists; if the spawn ENOENT came from the script path
        const exists = await fs.stat(hermesScript).then(() => true).catch(() => false);
        if (!exists) return sendJSON(res, { status: "NOT_INSTALLED", version: null, mcpReady: false });
        return sendJSON(res, result);
      }

      // ── POST /api/v4/cache/prewarm ─────────────────────────────────────────
      // Fire max_tokens:0 with canonical system prompt + cache_control ephemeral.
      // Reject re-warm within 240s.
      if (method === "GET" && pathname === "/api/v4/hermes/doctor") {
        const doctor = await import("./hermes/hermes-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runHermesDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      if (method === "POST" && pathname === "/api/v4/cache/prewarm") {
        const now = Date.now();
        if (now - _lastWarmedAt < PREWARM_COOLDOWN_MS) {
          return sendJSON(res, { ok: true, skipped: "warm-cache-already-active" });
        }
        if (!ANTHROPIC_KEY) return sendError(res, "ANTHROPIC_API_KEY missing", 502);
        const warmPayload = JSON.stringify({
          model:      ANTHROPIC_MODEL_DEFAULT,
          max_tokens: 0,
          system: [{
            type:          "text",
            text:          PREWARM_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          }],
          messages: [{ role: "user", content: "warmup" }],
        });
        try {
          const r = await httpsPost("api.anthropic.com", "/v1/messages", {
            "Content-Type":      "application/json",
            "x-api-key":         ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-beta":    "prompt-caching-2024-07-31",
          }, warmPayload, 30_000);
          const data = JSON.parse(r.body);
          // API returns stop_reason: "max_tokens" with empty content[] on success.
          const cacheCreationTokens = data.usage?.cache_creation_input_tokens || 0;
          _lastWarmedAt = Date.now();
          return sendJSON(res, {
            ok:                          true,
            cache_creation_input_tokens: cacheCreationTokens,
            model:                       ANTHROPIC_MODEL_DEFAULT,
            warmed_at:                   new Date(_lastWarmedAt).toISOString(),
          });
        } catch (e) {
          return sendError(res, `Prewarm failed: ${e.message}`, 502);
        }
      }

      // ── POST /api/v4/router/estimate ───────────────────────────────────────
      // Count tokens via /v1/messages/count_tokens and return cost estimate.
      if (method === "POST" && pathname === "/api/v4/router/estimate") {
        const body = await parseJSONBody(req);
        if (!body.messages) return sendError(res, "messages is required");
        if (!ANTHROPIC_KEY) return sendError(res, "ANTHROPIC_API_KEY missing", 502);
        const modelKey = body.model || ANTHROPIC_MODEL_DEFAULT;
        const countPayload = JSON.stringify({
          model:    modelKey,
          messages: body.messages,
          ...(body.system ? { system: [{ type: "text", text: body.system }] } : {}),
        });
        try {
          const r = await httpsPost("api.anthropic.com", "/v1/messages/count_tokens", {
            "Content-Type":      "application/json",
            "x-api-key":         ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "anthropic-beta":    "token-counting-2024-11-01",
          }, countPayload, 15_000);
          const data = JSON.parse(r.body);
          if (data.error) return sendError(res, data.error.message || "count_tokens error", 502);
          const inputTokens = data.input_tokens || 0;
          // Estimate output tokens at 25% of input (heuristic baseline).
          const predictedOutput = Math.round(inputTokens * 0.25);
          // Look up pricing by model prefix.
          let pricingEntry = null;
          for (const [k, v] of Object.entries(ROUTER_ESTIMATE_PRICING)) {
            if (modelKey.includes(k) || k.split("-").slice(0, 3).every(seg => modelKey.includes(seg))) {
              pricingEntry = v; break;
            }
          }
          const inpRate  = pricingEntry?.inp || 3;
          const outRate  = pricingEntry?.out || 15;
          const costCents = Math.round(
            ((inputTokens / 1_000_000) * inpRate + (predictedOutput / 1_000_000) * outRate) * 100 * 1000
          ) / 1000;
          return sendJSON(res, { input_tokens: inputTokens, predicted_output_tokens: predictedOutput, predicted_cost_cents: costCents });
        } catch (e) {
          return sendError(res, `Token count failed: ${e.message}`, 502);
        }
      }

      // ── Memory tool routes — POST /api/v4/memory/* ─────────────────────────
      // Anthropic memory_20250818 client-side command handler.
      // Maps Claude's /memories/* paths to <data_root>/memory/.
      // Returns Content-Type: text/plain (Anthropic expects raw string).
      {
        const memoryCommands = ["view", "create", "str_replace", "insert", "delete", "rename"];
        const memMatch = pathname.match(/^\/api\/v4\/memory\/([a-z_]+)$/);
        if (method === "POST" && memMatch && memoryCommands.includes(memMatch[1])) {
          const command = memMatch[1];
          const body = await parseJSONBody(req);
          let handler;
          try {
            const mod = await getMemoryHandler();
            handler = mod.handleMemoryCommand;
          } catch {
            // memory-tool-handler.mjs not yet present — return graceful error string.
            const txt = `[memory-tool-handler.mjs not installed — command: ${command}]`;
            cors(res, req);
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(txt) });
            return res.end(txt);
          }
          try {
            const result = await handler({ command, ...body, dataRoot: dataRoot() });
            const txt = typeof result === "string" ? result : JSON.stringify(result);
            cors(res, req);
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(txt) });
            return res.end(txt);
          } catch (e) {
            const txt = `[memory error: ${e.message}]`;
            cors(res, req);
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(txt) });
            return res.end(txt);
          }
        }
      }

      // ── POST /api/v4/telemetry/record ──────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/telemetry/record") {
        const body = await parseJSONBody(req);
        const { event, props } = body;
        if (!event) return sendError(res, "event is required");
        const telDir    = path.join(dataRoot(), "telemetry");
        const cfgFile   = path.join(telDir, "config.json");
        let enabled = false;
        try { enabled = JSON.parse(await fs.readFile(cfgFile, "utf8")).enabled === true; } catch { /* OFF by default */ }
        if (!enabled) return sendJSON(res, { ok: true, recorded: false });
        await fs.mkdir(telDir, { recursive: true });
        const line = JSON.stringify({ ts: new Date().toISOString(), event, props: props || {} }) + "\n";
        await fs.appendFile(path.join(telDir, "events.jsonl"), line, "utf8");
        return sendJSON(res, { ok: true, recorded: true });
      }

      // ── GET /api/v4/telemetry/status ───────────────────────────────────────
      if (method === "GET" && pathname === "/api/v4/telemetry/status") {
        const telDir  = path.join(dataRoot(), "telemetry");
        const cfgFile = path.join(telDir, "config.json");
        let enabled = false;
        let lastSentAt = null;
        try { const cfg = JSON.parse(await fs.readFile(cfgFile, "utf8")); enabled = cfg.enabled === true; lastSentAt = cfg.last_sent_at || null; } catch { /* defaults */ }
        let eventCount = 0;
        try {
          const evFile = await fs.readFile(path.join(telDir, "events.jsonl"), "utf8");
          eventCount = evFile.split("\n").filter(l => l.trim()).length;
        } catch { /* no file yet */ }
        return sendJSON(res, { enabled, event_count: eventCount, last_sent_at: lastSentAt, config_path: cfgFile });
      }

      // ── POST /api/v4/telemetry/enable ──────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/telemetry/enable") {
        const telDir  = path.join(dataRoot(), "telemetry");
        const cfgFile = path.join(telDir, "config.json");
        await fs.mkdir(telDir, { recursive: true });
        let cfg = {};
        try { cfg = JSON.parse(await fs.readFile(cfgFile, "utf8")); } catch { /* new */ }
        cfg.enabled = true;
        cfg.updated_at = new Date().toISOString();
        await fs.writeFile(cfgFile, JSON.stringify(cfg, null, 2), "utf8");
        await emitReceipt(dataRoot(), { source: "telemetry", title: "Telemetry enabled", summary: "Operator enabled telemetry", evidence: { config_path: cfgFile } });
        return sendJSON(res, { ok: true, enabled: true });
      }

      // ── POST /api/v4/telemetry/disable ─────────────────────────────────────
      if (method === "POST" && pathname === "/api/v4/telemetry/disable") {
        const telDir  = path.join(dataRoot(), "telemetry");
        const cfgFile = path.join(telDir, "config.json");
        await fs.mkdir(telDir, { recursive: true });
        let cfg = {};
        try { cfg = JSON.parse(await fs.readFile(cfgFile, "utf8")); } catch { /* new */ }
        cfg.enabled = false;
        cfg.updated_at = new Date().toISOString();
        await fs.writeFile(cfgFile, JSON.stringify(cfg, null, 2), "utf8");
        await emitReceipt(dataRoot(), { source: "telemetry", title: "Telemetry disabled", summary: "Operator disabled telemetry", evidence: { config_path: cfgFile } });
        return sendJSON(res, { ok: true, enabled: false });
      }

      // ── GET /api/v4/update/check ───────────────────────────────────────────
      // Fetch update manifest; compare version against running package.json.
      if (method === "GET" && pathname === "/api/v4/update/check") {
        const manifestUrl = process.env.ORANGEBOX_UPDATE_ENDPOINT || "https://atomeons.com/orangebox/update-manifest.json";
        let currentVersion = "0.0.0";
        try {
          const pkgJson = JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8"));
          currentVersion = pkgJson.version || "0.0.0";
        } catch { /* package.json missing */ }
        try {
          const url = new URL(manifestUrl);
          const isHttps = url.protocol === "https:";
          const manifest = await new Promise((resolve, reject) => {
            const client = isHttps ? https : http;
            const r = client.get(manifestUrl, { timeout: 10_000 }, (res2) => {
              let body2 = "";
              res2.on("data", d => { body2 += d; });
              res2.on("end",  () => { try { resolve(JSON.parse(body2)); } catch { reject(new Error("invalid JSON in manifest")); } });
            });
            r.on("error",   reject);
            r.on("timeout", () => { r.destroy(); reject(new Error("timeout")); });
          });
          const latestVersion = manifest.version || "0.0.0";
          const available = latestVersion !== currentVersion;
          return sendJSON(res, {
            available,
            latest_version:  latestVersion,
            current_version: currentVersion,
            manifest_url:    manifestUrl,
            download_url:    manifest.download_url || null,
          });
        } catch (e) {
          return sendJSON(res, { available: false, error: e.message, current_version: currentVersion });
        }
      }

      // ── GET /api/v4/update/manifest ────────────────────────────────────────
      // Return the raw manifest payload from the configured endpoint.
      if (method === "GET" && pathname === "/api/v4/update/manifest") {
        const manifestUrl = process.env.ORANGEBOX_UPDATE_ENDPOINT || "https://atomeons.com/orangebox/update-manifest.json";
        try {
          const url = new URL(manifestUrl);
          const isHttps = url.protocol === "https:";
          const manifest = await new Promise((resolve, reject) => {
            const client = isHttps ? https : http;
            const r = client.get(manifestUrl, { timeout: 10_000 }, (res2) => {
              let body2 = "";
              res2.on("data", d => { body2 += d; });
              res2.on("end",  () => { try { resolve(JSON.parse(body2)); } catch { reject(new Error("invalid JSON")); } });
            });
            r.on("error",   reject);
            r.on("timeout", () => { r.destroy(); reject(new Error("timeout")); });
          });
          return sendJSON(res, manifest);
        } catch (e) {
          return sendError(res, `Manifest fetch failed: ${e.message}`, 502);
        }
      }

      // ── Codexa per-tenant Ed25519 token endpoints ──────────────────────────
      // All three routes require Authorization: Bearer <ORANGEBOX_ADMIN_TOKEN>.

      // Admin auth helper.
      const checkAdminToken = (req2) => {
        if (!ORANGEBOX_ADMIN_TOKEN) return false;
        const authHeader = req2.headers["authorization"] || "";
        const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        return provided === ORANGEBOX_ADMIN_TOKEN;
      };

      // ── POST /api/v4/codexa/tenant/issue ──────────────────────────────────
      if (
        method === "POST" &&
        (pathname === "/api/v4/ai-box/tenant/issue" || pathname === "/api/v4/codexa/tenant/issue")
      ) {
        if (!checkAdminToken(req)) return sendError(res, "Unauthorized", 401);
        const body = await parseJSONBody(req);
        const { tenant_id, label } = body;
        if (!tenant_id) return sendError(res, "tenant_id is required");
        const store = await loadAiBoxTenantRecords(dataRoot());
        const tenants = store.tenants;
        // Generate Ed25519 keypair.
        const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519", {
          privateKeyEncoding: { type: "pkcs8",   format: "pem" },
          publicKeyEncoding:  { type: "spki",    format: "pem" },
        });
        const kid = uuidv4();
        const issuedAt = new Date().toISOString();
        // Store public key + metadata only — private key shown ONCE, never persisted.
        tenants.push({ kid, tenant_id, public_key: publicKey, label: label || null, issued_at: issuedAt, revoked_at: null });
        await saveAiBoxTenantRecords(dataRoot(), tenants);
        await emitReceipt(dataRoot(), {
          source:   "ai-box-tenant",
          title:    `AI Box tenant issued: ${tenant_id}`,
          summary:  `kid=${kid}`,
          evidence: {
            tenant_id,
            kid,
            issued_at: issuedAt,
            active_route: "/api/v4/ai-box/tenant/issue",
            compatibility_route: tenantRouteCompatibility(pathname),
            migrated_legacy_count: store.legacy_count,
          },
        });
        return sendJSON(res, {
          tenant_id,
          private_key_pem: privateKey,
          public_key_pem: publicKey,
          kid,
          active_route: "/api/v4/ai-box/tenant/issue",
          compatibility: tenantRouteCompatibility(pathname),
        }, 201);
      }

      // ── POST /api/v4/codexa/tenant/revoke ─────────────────────────────────
      if (
        method === "POST" &&
        (pathname === "/api/v4/ai-box/tenant/revoke" || pathname === "/api/v4/codexa/tenant/revoke")
      ) {
        if (!checkAdminToken(req)) return sendError(res, "Unauthorized", 401);
        const body = await parseJSONBody(req);
        const { tenant_id } = body;
        if (!tenant_id) return sendError(res, "tenant_id is required");
        const store = await loadAiBoxTenantRecords(dataRoot());
        let tenants = store.tenants;
        if (tenants.length === 0) return sendError(res, "No tenants found", 404);
        const revokedAt = new Date().toISOString();
        let found = false;
        tenants = tenants.map(t => {
          if (t.tenant_id === tenant_id && !t.revoked_at) { found = true; return { ...t, revoked_at: revokedAt }; }
          return t;
        });
        if (!found) return sendError(res, `Tenant not found or already revoked: ${tenant_id}`, 404);
        await saveAiBoxTenantRecords(dataRoot(), tenants);
        return sendJSON(res, {
          ok: true,
          active_route: "/api/v4/ai-box/tenant/revoke",
          compatibility: tenantRouteCompatibility(pathname),
        });
      }

      // ── GET /api/v4/codexa/tenant/list ────────────────────────────────────
      if (
        method === "GET" &&
        (pathname === "/api/v4/ai-box/tenant/list" || pathname === "/api/v4/codexa/tenant/list")
      ) {
        if (!checkAdminToken(req)) return sendError(res, "Unauthorized", 401);
        const store = await loadAiBoxTenantRecords(dataRoot());
        const tenants = store.tenants;
        // Strip private keys — public keys only.
        const safe = tenants.map(({ private_key_pem: _drop, ...rest }) => rest);
        return sendJSON(res, {
          tenants: safe,
          active_route: "/api/v4/ai-box/tenant/list",
          compatibility: tenantRouteCompatibility(pathname),
          store: {
            active_count: store.active_count,
            legacy_count: store.legacy_count,
          },
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.0.2 ENDPOINTS — gstack + trending integration
      // ═══════════════════════════════════════════════════════════════════════

      // ── POST /api/v4/sprint/run ─ /autoplan-style composite Think→Plan→Build→Review
      if (method === "POST" && pathname === "/api/v4/sprint/run") {
        const blocked = await freezeAllBlock("sprint-run");
        if (blocked) return sendJSON(res, blocked, 423);
        const body = await parseJSONBody(req);
        if (!body.prompt) return sendError(res, "prompt is required");
        const sprint = await import("./sprint-runner.mjs");
        const plan = sprint.planSprint({ prompt: body.prompt, project: body.project || "default" });
        // Persist plan + emit canonical receipt (UX spec §3.8.4 source=sprint)
        const recDir = path.join(dataRoot(), "sprints");
        await fs.mkdir(recDir, { recursive: true });
        await fs.writeFile(path.join(recDir, `${plan.sprint_id}.json`), JSON.stringify(plan, null, 2));
        await emitReceipt(dataRoot(), {
          source:   "sprint",
          title:    `Sprint plan: ${plan.project}`,
          summary:  `${plan.phases.length} phase(s) · ${plan.scope.ui ? "UI" : ""}${plan.scope.devTool ? " devtool" : ""}`,
          evidence: { sprint_id: plan.sprint_id, phases: plan.phases.map(p => p.id), prompt_excerpt: String(body.prompt).slice(0, 200) },
        });
        return sendJSON(res, plan);
      }

      // ── POST /api/v4/sprint/decision ─ append a decision row to a sprint plan
      if (method === "POST" && pathname === "/api/v4/sprint/decision") {
        const body = await parseJSONBody(req);
        if (!body.sprint_id || !body.decision) return sendError(res, "sprint_id and decision required");
        const sprint = await import("./sprint-runner.mjs");
        const file = path.join(dataRoot(), "sprints", `${body.sprint_id}.json`);
        let plan;
        try { plan = JSON.parse(await fs.readFile(file, "utf8")); }
        catch { return sendError(res, "sprint plan not found", 404); }
        sprint.appendDecision(plan, body);
        await fs.writeFile(file, JSON.stringify(plan, null, 2));
        return sendJSON(res, { ok: true, plan: sprint.summarizePlan(plan) });
      }

      // ── GET /api/v4/freeze/status ─ current freeze state
      if (method === "GET" && pathname === "/api/v4/freeze/status") {
        const fz = await import("./freeze-guard.mjs");
        return sendJSON(res, fz.getFreezeState());
      }
      // ── POST /api/v4/freeze/set ─ activate/clear freeze
      if (method === "POST" && pathname === "/api/v4/freeze/set") {
        const body = await parseJSONBody(req);
        const fz = await import("./freeze-guard.mjs");
        const state = fz.setFreeze(body);
        const cancelled = { agent_runs: 0, silent_canvas_runs: 0, shell_sessions: 0 };
        if (fz.isFreezeAll(state)) {
          const jobs = await import("./agent-jobs.mjs");
          const sc = await import("./silent-canvas.mjs");
          const sh = await import("./shell-stream.mjs");
          const aa = await import("./ad-architecture.mjs").catch(() => null);
          const agentCancel = jobs.cancelAll("freeze-all");
          const canvasCancel = sc.cancelAll("freeze-all");
          const shellKill = sh.killAllSessions();
          cancelled.agent_runs = agentCancel.cancelled_count || 0;
          cancelled.silent_canvas_runs = canvasCancel.cancelled_count || 0;
          cancelled.shell_sessions = shellKill.killed_count || 0;
          if (aa?.setRulesGuard) {
            aa.setRulesGuard({
              global_pause: true,
              simulation_mode: true,
              reason: "ORANGEBOX Freeze-All engaged",
              updated_by: "freeze-all",
            });
          }
        }
        await emitReceipt(dataRoot(), {
          source: state.freeze_all ? "freeze-all" : "freeze-state",
          title: state.freeze_all ? "Freeze-All engaged" : `Freeze ${state.active ? "enabled" : "cleared"}`,
          summary: state.freeze_all
            ? `Paused dispatches and cancelled running ORANGEBOX work: agents=${cancelled.agent_runs}, canvas=${cancelled.silent_canvas_runs}, shell=${cancelled.shell_sessions}`
            : `scope=${state.scope || "global"} active=${state.active}`,
          evidence: { state, cancelled },
        });
        return sendJSON(res, { ...state, cancelled });
      }

      // ── POST /api/v4/careful/check ─ destructive-command pre-check
      if (method === "POST" && pathname === "/api/v4/careful/check") {
        const body = await parseJSONBody(req);
        if (!body.command) return sendError(res, "command is required");
        const c = await import("./careful-check.mjs");
        return sendJSON(res, c.check(body.command));
      }

      // ── POST /api/v4/checkpoint/save ─ trigger continuous checkpoint commit
      if (method === "POST" && pathname === "/api/v4/checkpoint/save") {
        const body = await parseJSONBody(req);
        const cp = await import("./checkpoint-mode.mjs");
        return sendJSON(res, cp.maybeCheckpoint(body.receipt || {}, body.opts || {}));
      }
      // ── GET /api/v4/checkpoint/restore ─ rebuild session-restore prompt
      if (method === "GET" && pathname === "/api/v4/checkpoint/restore") {
        const cp = await import("./checkpoint-mode.mjs");
        return sendJSON(res, cp.restorePrompt({ cwd: process.cwd(), limit: 10 }));
      }
      // ── GET /api/v4/checkpoint/list ─ list recent WIP checkpoints
      if (method === "GET" && pathname === "/api/v4/checkpoint/list") {
        const cp = await import("./checkpoint-mode.mjs");
        return sendJSON(res, cp.listRecentCheckpoints({ cwd: process.cwd(), limit: 20 }));
      }

      // ── /api/v4/context/{save,list,restore} ─ markdown-file checkpoints
      if (method === "POST" && pathname === "/api/v4/context/save") {
        const body = await parseJSONBody(req);
        const cs = await import("./context-store.mjs");
        return sendJSON(res, cs.saveContext(body || {}));
      }
      if (method === "GET" && pathname === "/api/v4/context/list") {
        const qs = parsed.searchParams;
        const cs = await import("./context-store.mjs");
        return sendJSON(res, cs.listContexts({ project: qs.get("project") || "default", branch: qs.get("branch") || null }));
      }
      if (method === "POST" && pathname === "/api/v4/context/restore") {
        const body = await parseJSONBody(req);
        if (!body.path) return sendError(res, "path is required");
        const cs = await import("./context-store.mjs");
        return sendJSON(res, cs.restoreContext({ path: body.path }));
      }

      // ── /api/v4/memory/{summary,consolidate,decay} ─ 4-tier memory
      if (method === "POST" && pathname === "/api/v4/relevance/project") {
        const body = await parseJSONBody(req);
        const workspace = body.workspace || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const rc = await import("./relevance-controller.mjs");
        const payload = await rc.buildScopedContext({
          goal: body.goal || "",
          workspace,
          selected_node: body.selected_node || null,
          viewport: body.viewport || null,
          route: body.route || null,
          actor: body.actor || { id: "api", trust_tier: "T-Conditional" },
          max_nodes: body.max_nodes || 16,
          max_receipts: body.max_receipts || 10,
          dataRoot: dataRoot(),
          appRoot,
        });
        await emitReceipt(dataRoot(), {
          source: "relevance-projection",
          title: `Relevance projection: ${payload.intent.intent_type}`,
          summary: `${payload.sources.canvas_state.nodes_included}/${payload.sources.canvas_state.nodes_total} nodes included; ${payload.estimated_chars} chars`,
          evidence: { projection_id: payload.projection_id, intent: payload.intent, sources: payload.sources, omitted: payload.omitted },
        });
        return sendJSON(res, payload);
      }
      if (method === "GET" && pathname === "/api/v4/relevance/project") {
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const rc = await import("./relevance-controller.mjs");
        return sendJSON(res, await rc.buildScopedContext({
          goal: parsed.searchParams.get("goal") || "",
          workspace,
          selected_node: parsed.searchParams.get("selected_node") || null,
          viewport: parsed.searchParams.has("x") ? {
            x: Number(parsed.searchParams.get("x")),
            y: Number(parsed.searchParams.get("y")),
            w: Number(parsed.searchParams.get("w") || parsed.searchParams.get("width")),
            h: Number(parsed.searchParams.get("h") || parsed.searchParams.get("height")),
          } : null,
          route: parsed.searchParams.get("route") || null,
          dataRoot: dataRoot(),
          appRoot,
        }));
      }
      if (method === "POST" && pathname === "/api/v4/relevance/classify") {
        const body = await parseJSONBody(req);
        const ic = await import("./intent-classifier.mjs");
        return sendJSON(res, ic.classifyIntent(body || {}));
      }
      if (method === "GET" && pathname === "/api/v4/memory/summary") {
        const mt = await import("./memory-tiers.mjs");
        return sendJSON(res, mt.summary());
      }
      if (method === "POST" && pathname === "/api/v4/memory/consolidate") {
        const mt = await import("./memory-tiers.mjs");
        return sendJSON(res, mt.consolidate());
      }
      if (method === "POST" && pathname === "/api/v4/memory/decay") {
        const body = await parseJSONBody(req);
        const mt = await import("./memory-tiers.mjs");
        const results = [];
        for (const tier of (body?.tiers || ["working", "episodic"])) results.push(mt.decayStep(tier));
        return sendJSON(res, { results });
      }
      if (method === "POST" && pathname === "/api/v4/memory/write") {
        const body = await parseJSONBody(req);
        if (!body.tier || !body.doc) return sendError(res, "tier and doc required");
        const mt = await import("./memory-tiers.mjs");
        return sendJSON(res, mt.write(body.tier, body.doc));
      }

      // ── POST /api/v4/incident/intake ─ SRE webhook intake → structured RCA
      if (method === "POST" && pathname === "/api/v4/incident/intake") {
        const body = await parseJSONBody(req);
        const sre = await import("./sre-incident.mjs");
        const incident = sre.normalizeAlert(body);
        const persisted = sre.persist(incident);
        const prompt = sre.compose(incident);
        // Auto-fire a sprint for the incident
        const sprint = await import("./sprint-runner.mjs");
        const plan = sprint.planSprint({ prompt, project: "incident-" + incident.alert_id });
        const recDir = path.join(dataRoot(), "sprints");
        await fs.mkdir(recDir, { recursive: true });
        await fs.writeFile(path.join(recDir, `${plan.sprint_id}.json`), JSON.stringify(plan, null, 2));
        const slack = process.env.SLACK_WEBHOOK_URL ? sre.postSlack({ webhookUrl: process.env.SLACK_WEBHOOK_URL, incident, summary: prompt.slice(0, 200) }) : { posted: false };
        // Canonical receipt (UX spec §3.8.4 source=incident-intake)
        await emitReceipt(dataRoot(), {
          source:   "incident-intake",
          title:    `Incident: ${incident.alert_id}`,
          summary:  `${incident.title} · severity=${incident.severity} · service=${incident.service || "unknown"}`,
          evidence: { source: incident.source, severity: incident.severity, sprint_id: plan.sprint_id, slack_posted: slack.posted === true },
        });
        return sendJSON(res, { incident, persisted, plan_id: plan.sprint_id, slack });
      }

      // ── /api/v4/router/combos ─ list / save named combos
      if (method === "GET" && pathname === "/api/v4/router/combos") {
        const c = await import("./router/combos.mjs");
        return sendJSON(res, { combos: c.loadCombos() });
      }
      if (method === "POST" && pathname === "/api/v4/router/combos") {
        const body = await parseJSONBody(req);
        const c = await import("./router/combos.mjs");
        return sendJSON(res, { saved: c.saveCombos(body.combos || {}) });
      }

      // -- /api/v4/surfaces/* - Silent Canvas Surface Factory
      if (method === "GET" && pathname === "/api/v4/surfaces/templates") {
        const sf = await import("./surface-factory.mjs");
        return sendJSON(res, { ok: true, templates: sf.listTemplates() });
      }
      if (method === "GET" && pathname === "/api/v4/surfaces/list") {
        const sf = await import("./surface-factory.mjs");
        return sendJSON(res, await sf.listSurfaces({ dataRoot: dataRoot() }));
      }
      if (method === "GET" && pathname === "/api/v4/surfaces/doctor") {
        const doctor = await import("./surface-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runSurfaceDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }
      if (method === "POST" && pathname === "/api/v4/surfaces/create") {
        const blocked = await freezeAllBlock("surface-create");
        if (blocked) return sendJSON(res, blocked, 423);
        const body = await parseJSONBody(req);
        if (!body.name) return sendError(res, "surface name required", 400);
        const sf = await import("./surface-factory.mjs");
        const result = await sf.createSurface({
          name: body.name,
          template_id: body.template_id || "core-v1",
          root: body.root || null,
          description: body.description || "",
          overwrite: body.overwrite === true,
          dataRoot: dataRoot(),
        });
        await emitReceipt(dataRoot(), {
          source: "surface-factory",
          title: `Surface created: ${result.surface.name}`,
          summary: `${result.template.template_id} -> ${result.surface.workspace} | ${result.graph.nodes} nodes / ${result.graph.wires} wires`,
          evidence: {
            surface: result.surface,
            template: result.template,
            graph: result.graph,
            applied: result.applied,
            registry_path: result.registry_path,
          },
        });
        return sendJSON(res, result, 201);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.0.3 — Karpathy + Pocock + Osmani patterns
      // ═══════════════════════════════════════════════════════════════════════

      // ── POST /api/v4/caveman ─ output-side token compression (75%)
      if (method === "POST" && pathname === "/api/v4/caveman") {
        const body = await parseJSONBody(req);
        if (!body.text) return sendError(res, "text is required");
        const cv = await import("./caveman-compressor.mjs");
        return sendJSON(res, cv.compressOutput(body.text, { level: body.level || "medium" }));
      }

      // ── POST /api/v4/handoff/compose ─ agent-to-agent handoff doc
      if (method === "POST" && pathname === "/api/v4/handoff/compose") {
        const body = await parseJSONBody(req);
        const ho = await import("./handoff-composer.mjs");
        return sendJSON(res, ho.compose(body || {}));
      }
      // ── GET /api/v4/handoff/list ─ list handoff docs
      if (method === "GET" && pathname === "/api/v4/handoff/list") {
        const ho = await import("./handoff-composer.mjs");
        return sendJSON(res, { items: ho.listHandoffs({ limit: parseInt(parsed.searchParams.get("limit") || "20", 10) }) });
      }
      // ── POST /api/v4/handoff/read ─ read a handoff by id or path
      if (method === "POST" && pathname === "/api/v4/handoff/read") {
        const body = await parseJSONBody(req);
        if (!body.id && !body.path) return sendError(res, "id or path required");
        const ho = await import("./handoff-composer.mjs");
        const out = ho.read(body.path || body.id);
        if (!out) return sendError(res, "not found", 404);
        return sendJSON(res, out);
      }

      // ── POST /api/v4/zoom-out ─ structural summary of a file/dir
      if (method === "POST" && pathname === "/api/v4/zoom-out") {
        const body = await parseJSONBody(req);
        if (!body.root) return sendError(res, "root is required");
        if (!isFsPathSafe(body.root)) return sendError(res, "Access denied", 403);
        const zo = await import("./zoom-out.mjs");
        return sendJSON(res, await zo.zoomOut({ root: body.root, workspace: body.workspace, maxFiles: body.maxFiles || 80 }));
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.0.7 — Phase 7 build: Skills + Composer + Cost + Reasoning surface
      // ═══════════════════════════════════════════════════════════════════════

      // ── GET /api/v4/skills/list ─ enumerate skills/agents/rules/internal
      if (method === "GET" && pathname === "/api/v4/skills/list") {
        const se = await import("./skills-enumerator.mjs");
        return sendJSON(res, await se.listAll());
      }
      // ── POST /api/v4/skills/fire ─ resolve a skill into a suggested API call
      if (method === "POST" && pathname === "/api/v4/skills/fire") {
        const blocked = await freezeAllBlock("skills-fire");
        if (blocked) return sendJSON(res, blocked, 423);
        const body = await parseJSONBody(req);
        if (!body.name) return sendError(res, "name is required");
        const se = await import("./skills-enumerator.mjs");
        return sendJSON(res, await se.fireSkill({ name: body.name, prompt: body.prompt || "" }));
      }

      // ── POST /api/v4/composer/scaffold ─ build LLM prompt + file blocks
      if (method === "POST" && pathname === "/api/v4/composer/scaffold") {
        const body = await parseJSONBody(req);
        if (!body.prompt || !Array.isArray(body.files)) return sendError(res, "prompt + files[] required");
        if (body.files.length === 0) return sendError(res, "files[] cannot be empty", 400);
        for (const f of body.files) {
          if (!isFsPathSafe(f)) return sendError(res, "Access denied", 403);
        }
        const co = await import("./composer.mjs");
        try {
          return sendJSON(res, co.planScaffold({ prompt: body.prompt, files: body.files }));
        } catch (e) {
          return sendError(res, e.message || "scaffold failed", 400);
        }
      }
      // ── POST /api/v4/composer/plan ─ build plan from LLM JSON response
      if (method === "POST" && pathname === "/api/v4/composer/plan") {
        const body = await parseJSONBody(req);
        if (!body.llm_json) return sendError(res, "llm_json required");
        const co = await import("./composer.mjs");
        return sendJSON(res, co.buildPlanFromLlmResponse(body));
      }
      // ── GET /api/v4/deps/status ─ versions of bundled node + hermes vs latest upstream
      if (method === "GET" && pathname === "/api/v4/deps/status") {
        const du = await import("./dep-updater.mjs");
        return sendJSON(res, await du.status());
      }
      // ── POST /api/v4/deps/update ─ pull latest node and/or hermes, install in place
      if (method === "POST" && pathname === "/api/v4/deps/update") {
        const body = await parseJSONBody(req);
        const du = await import("./dep-updater.mjs");
        const result = await du.update({ which: body.which || "all" });
        await emitReceipt(dataRoot(), {
          source: "dep-updater",
          title:  `Deps update: ${Object.keys(result).join(", ")}`,
          summary: Object.entries(result).map(([k,v]) => `${k}=${v.ok ? "ok" : "err"}`).join("; "),
          evidence: result,
        });
        return sendJSON(res, result);
      }

      // ── GET /api/v4/vault/summary ─ inspect lattice WITHOUT API key
      if (method === "GET" && pathname === "/api/v4/vault/summary") {
        const ve = await import("./vault-explorer.mjs");
        return sendJSON(res, await ve.summary());
      }
      // ── POST /api/v4/vault/search ─ BM25-ish keyword scan, no LLM, no key needed
      if (method === "POST" && pathname === "/api/v4/vault/search") {
        const body = await parseJSONBody(req);
        if (!body.query) return sendError(res, "query is required");
        const ve = await import("./vault-explorer.mjs");
        return sendJSON(res, await ve.search(body.query, { limit: body.limit || 20 }));
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.0.11 — Trilane vote + Receipts export
      // ═══════════════════════════════════════════════════════════════════════
      // ═══════════════════════════════════════════════════════════════════════
      // v6.3.0-alpha.1 — SILENT CANVAS (Dual-Model Split Pipeline + HSMP + Project Graph)
      // Per Silent Canvas Doctrine §§5–7. Operator types intent → Creative Brain
      // produces engineering plan + layout guidelines → Fast Interpreter extracts
      // HSMP JSON → Frontend State Execution applies mutations to project graph
      // and emits events for Progress Dashboard + Visual Telemetry Engine.
      // ═══════════════════════════════════════════════════════════════════════
      if (method === "POST" && pathname === "/api/v4/silent-canvas/run") {
        const blocked = await freezeAllBlock("silent-canvas-run");
        if (blocked) return sendJSON(res, blocked, 423);
        const body = await parseJSONBody(req);
        if (!body.goal) return sendError(res, "goal required", 400);
        const workspace = body.workspace || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const sc = await import("./silent-canvas.mjs");
        const started = sc.start({
          goal: body.goal,
          workspace,
          opts: {
            creative_provider:    body.creative_provider    || "anthropic",
            creative_model:       body.creative_model       || "claude-sonnet-4-5",
            interpreter_provider: body.interpreter_provider || "anthropic",
            interpreter_model:    body.interpreter_model    || "claude-haiku-4-5",
            recent_receipts:      body.recent_receipts      || [],
            context_expansion_rounds: body.context_expansion_rounds ?? 2,
            selected_node: body.selected_node || null,
            viewport: body.viewport || null,
            max_nodes: body.max_nodes || 16,
            max_receipts: body.max_receipts || 10,
          },
          emitReceipt: (r) => emitReceipt(dataRoot(), r),
        });
        return sendJSON(res, started);
      }
      if (method === "GET" && pathname.startsWith("/api/v4/silent-canvas/status/")) {
        const id = pathname.replace("/api/v4/silent-canvas/status/", "");
        const sc = await import("./silent-canvas.mjs");
        const st = sc.status(id);
        if (!st) return sendError(res, "no such run", 404);
        return sendJSON(res, st);
      }
      if (method === "POST" && pathname.startsWith("/api/v4/silent-canvas/cancel/")) {
        const id = pathname.replace("/api/v4/silent-canvas/cancel/", "");
        const sc = await import("./silent-canvas.mjs");
        return sendJSON(res, sc.cancel(id));
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/list") {
        const sc = await import("./silent-canvas.mjs");
        const limit = parseInt(parsed.searchParams.get("limit") || "20", 10);
        return sendJSON(res, sc.list({ limit }));
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/observatory") {
        const po = await import("./pipeline-observatory.mjs");
        const run_id = parsed.searchParams.get("run_id") || null;
        const limit = parseInt(parsed.searchParams.get("limit") || "40", 10);
        return sendJSON(res, await po.observe({ dataRoot: dataRoot(), run_id, limit }));
      }
      if (method === "GET" && pathname.startsWith("/api/v4/silent-canvas/replay/")) {
        const id = pathname.replace("/api/v4/silent-canvas/replay/", "");
        const sc = await import("./silent-canvas.mjs");
        const r = sc.replayEvents(id);
        if (!r) return sendError(res, "no such run", 404);
        return sendJSON(res, r);
      }
      if (method === "POST" && pathname === "/api/v4/silent-canvas/compile") {
        // v6.3.0-alpha.6 — Codeless Engine Integration (Silent Canvas Doctrine §5)
        // Walks project graph and materializes node.details.content to disk with
        // sha256-before/after receipts. freeze-guard checked first.
        const body = await parseJSONBody(req);
        const workspace = body.workspace || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const fz = await import("./freeze-guard.mjs");
        const cc = await import("./canvas-compiler.mjs");
        const result = await cc.compile({
          workspace,
          opts: body.opts || {},
          emitReceipt: (r) => emitReceipt(dataRoot(), r),
          freezeGuard: fz,
        });
        await emitReceipt(dataRoot(), {
          source:  "silent-canvas-compile-summary",
          title:   `Silent Canvas compile: ${result.files_written} written / ${result.files_skipped} skipped / ${result.files_failed} failed`,
          summary: `${result.graph_nodes_count} nodes · ${result.graph_wires_count} wires · ${result.duration_ms}ms`,
          evidence: { workspace, files_written: result.files_written, files_skipped: result.files_skipped, files_failed: result.files_failed, errors_count: result.errors.length, duration_ms: result.duration_ms, compiler_version: result.compiler_version },
        });
        return sendJSON(res, result);
      }
      if (method === "POST" && pathname === "/api/v4/silent-canvas/solidify") {
        const body = await parseJSONBody(req).catch(() => ({}));
        const workspace = body.workspace || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const fz = await import("./freeze-guard.mjs");
        const sf = await import("./solidify.mjs");
        const result = await sf.solidify({
          workspace,
          dataRoot: dataRoot(),
          opts: body.opts || {},
          emitReceipt: (r) => emitReceipt(dataRoot(), r),
          freezeGuard: fz,
        });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/benefits") {
        // v6.3.0-alpha.6 — three-benefits aggregator (Doctrine §9)
        const bn = await import("./benefits.mjs");
        const limit = parseInt(parsed.searchParams.get("limit") || "100", 10);
        const aggregate = await bn.aggregate({ limit, dataRoot: dataRoot() });
        if (parsed.searchParams.get("gate") === "1") {
          const minRuns = parseInt(parsed.searchParams.get("min_runs") || "1", 10);
          return sendJSON(res, { ...aggregate, gate: bn.evaluateBenefitsGate(aggregate, { minRuns }) });
        }
        return sendJSON(res, aggregate);
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/wire-gate") {
        const wg = await import("./wire-path-gate.mjs");
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const tolerancePx = parseFloat(parsed.searchParams.get("tolerance_px") || parsed.searchParams.get("tolerance-px") || "1");
        const samples = parseInt(parsed.searchParams.get("samples") || "9", 10);
        return sendJSON(res, await wg.runWirePathGate({ workspace, tolerancePx, samples }));
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/snapshot") {
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const pg = await import("./project-graph.mjs");
        return sendJSON(res, await pg.loadOrInit(workspace));
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/workspace-state") {
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const pg = await import("./project-graph.mjs");
        return sendJSON(res, await pg.workspaceState(workspace));
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/active-bbox") {
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const pg = await import("./project-graph.mjs");
        const viewport = parsed.searchParams.has("x") ? {
          x: Number(parsed.searchParams.get("x")),
          y: Number(parsed.searchParams.get("y")),
          w: Number(parsed.searchParams.get("w") || parsed.searchParams.get("width")),
          h: Number(parsed.searchParams.get("h") || parsed.searchParams.get("height")),
        } : null;
        return sendJSON(res, await pg.getActiveBoundingBox(workspace, {
          viewport,
          selected_node: parsed.searchParams.get("selected_node") || null,
          maxNodes: parseInt(parsed.searchParams.get("max_nodes") || "24", 10),
          padding: parseFloat(parsed.searchParams.get("padding") || "80"),
        }));
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/alpha7-doctor") {
        const doctor = await import("./alpha7-doctor.mjs");
        const full = parsed.searchParams.get("full") === "1";
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runAlpha7Doctor({ full, writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/visual-engine-doctor") {
        const doctor = await import("./visual-engine-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runVisualEngineDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/relevance-doctor") {
        const doctor = await import("./relevance-doctor.mjs");
        const writeReceipt = parsed.searchParams.get("receipt") === "1";
        const result = await doctor.runRelevanceDoctor({ writeReceipt });
        return sendJSON(res, result, result.ok ? 200 : 409);
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/snapshots") {
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const pg = await import("./project-graph.mjs");
        const limit = parseInt(parsed.searchParams.get("limit") || "50", 10);
        return sendJSON(res, await pg.listSnapshots(workspace, { limit }));
      }
      if (method === "GET" && pathname === "/api/v4/silent-canvas/snapshot-file") {
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const file = parsed.searchParams.get("file") || "";
        if (!file) return sendJSON(res, { ok: false, error: "missing file" }, 400);
        const pg = await import("./project-graph.mjs");
        return sendJSON(res, await pg.loadSnapshotFile(workspace, file));
      }
      if (method === "POST" && pathname === "/api/v4/silent-canvas/desync-recover") {
        const body = await parseJSONBody(req).catch(() => ({}));
        const workspace = body.workspace || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const pg = await import("./project-graph.mjs");
        const result = await pg.restoreSnapshot(workspace, {
          file: body.file || null,
          reason: body.reason || "desync-recover",
        });
        if (result.ok) {
          await emitReceipt(dataRoot(), {
            source: "silent-canvas-desync-recover",
            title: "Silent Canvas desync recovery",
            summary: `restored ${result.nodes} nodes / ${result.wires} wires from snapshot`,
            evidence: { workspace, ...result },
          });
        }
        return sendJSON(res, result, result.ok ? 200 : 409);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.3.0-alpha.5 — CONNECTOR FABRIC (Silent Canvas Doctrine §8.4.5 expanded)
      // 60+ services. OAuth + API-key with one-time setup, refresh-token sweep
      // every 6 min, encrypted credentials vault. Set-and-forget per operator.
      // ═══════════════════════════════════════════════════════════════════════
      if (method === "GET" && pathname === "/api/v4/vault/recovery") {
        const v = await import("./credentials-vault.mjs");
        return sendJSON(res, await v.recoveryDiagnostics());
      }
      if (method === "GET" && pathname === "/api/v4/connectors/list") {
        const reg = await import("./connectors-registry.mjs");
        const v = await import("./credentials-vault.mjs");
        const services = reg.listServices();
        const connected = await v.listConnected();
        const connectedMap = new Map(connected.map(c => [c.service, c]));
        const merged = services.map(s => ({
          ...s,
          connection: connectedMap.get(s.name) || null,
        }));
        return sendJSON(res, { services: merged, categories: reg.servicesByCategory() });
      }
      if (method === "POST" && pathname.startsWith("/api/v4/connectors/connect/")) {
        const service = pathname.replace("/api/v4/connectors/connect/", "");
        const body = await parseJSONBody(req).catch(() => ({}));
        const reg  = await import("./connectors-registry.mjs");
        const cfg  = reg.getServiceConfig(service);
        if (!cfg) return sendError(res, `unknown service: ${service}`, 404);
        if (cfg.auth_type === "apikey") {
          if (!body.key) return sendError(res, "key required for apikey service", 400);
          const v = await import("./credentials-vault.mjs");
          const r = await v.setApiKey(service, body.key, body.extra || {});
          await emitReceipt(dataRoot(), {
            source: "connector-auth",
            title:  `Connected: ${cfg.label}`,
            summary: `auth_type=apikey · stored encrypted in credentials vault`,
            evidence: { service, label: cfg.label, category: cfg.category, granted_at: new Date().toISOString() },
          });
          return sendJSON(res, r);
        }
        if (cfg.auth_type === "apikey_pair") {
          if (!body.key || !body.secondary) return sendError(res, "key + secondary required for apikey_pair", 400);
          const v = await import("./credentials-vault.mjs");
          const r = await v.setApiKey(service, body.key, { ...body.extra, secondary: body.secondary });
          await emitReceipt(dataRoot(), {
            source: "connector-auth",
            title:  `Connected: ${cfg.label}`,
            summary: `auth_type=apikey_pair`,
            evidence: { service, label: cfg.label, category: cfg.category },
          });
          return sendJSON(res, r);
        }
        if (cfg.auth_type === "oauth2") {
          const oh = await import("./oauth-handler.mjs");
          const r = await oh.begin(service);
          return sendJSON(res, r);
        }
        if (cfg.auth_type === "webhook_only") {
          if (!body.url) return sendError(res, "url required for webhook service", 400);
          const v = await import("./credentials-vault.mjs");
          const r = await v.setApiKey(service, body.url, { webhook: true, ...body.extra });
          await emitReceipt(dataRoot(), {
            source: "connector-auth",
            title:  `Connected: ${cfg.label}`,
            summary: `auth_type=webhook_only · url stored`,
            evidence: { service, label: cfg.label },
          });
          return sendJSON(res, r);
        }
        return sendError(res, `auth_type ${cfg.auth_type} not handled yet`, 501);
      }
      // OAuth callback — provider redirects here. Pattern: /oauth/<service>/callback?code=...&state=...
      if (method === "GET" && /^\/oauth\/[a-z0-9-]+\/callback$/.test(pathname)) {
        const service = pathname.split("/")[2];
        const code = parsed.searchParams.get("code");
        const state = parsed.searchParams.get("state");
        const error = parsed.searchParams.get("error");
        const oh = await import("./oauth-handler.mjs");
        const r = await oh.complete({ service, code, state, error });
        if (r.ok) {
          await emitReceipt(dataRoot(), {
            source: "connector-auth",
            title:  `OAuth connected: ${service}`,
            summary: `scope=${r.scope || "(default)"} · expires_in=${r.expires_in || "(never)"}`,
            evidence: { service, scope: r.scope, expires_in: r.expires_in },
          });
        }
        // Render a tiny HTML page so the browser shows a friendly success/failure
        res.statusCode = r.ok ? 200 : 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(`<!doctype html><html><head><title>OrangeBox · ${service}</title><style>body{font-family:system-ui;background:#1a1410;color:#e8d5b7;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:#221a14;border:1px solid #3d2f22;border-radius:12px;padding:32px;max-width:480px;box-shadow:0 0 40px rgba(255,119,51,${r.ok ? 0.3 : 0.15})}h1{color:${r.ok ? "#88cc66" : "#cc6644"};margin:0 0 12px 0}p{color:#c4ad8e;line-height:1.5}.muted{color:#8a7560;font-size:13px;margin-top:16px}</style></head><body><div class="card"><h1>${r.ok ? "✓ Connected" : "✗ Connection failed"}</h1><p>${r.ok ? `OrangeBox is now connected to <b>${service}</b>. You can close this window and return to OrangeBox.` : `Could not complete OAuth for <b>${service}</b>.`}</p>${r.error ? `<p class="muted">${r.error}</p>` : ""}<p class="muted">${r.ok ? "Set-and-forget: refresh tokens persist; OrangeBox will rotate them in the background." : ""}</p></div></body></html>`);
        return;
      }
      if (method === "GET" && pathname === "/api/v4/connectors/status") {
        const v = await import("./credentials-vault.mjs");
        return sendJSON(res, { connected: await v.listConnected() });
      }
      if (method === "POST" && pathname.startsWith("/api/v4/connectors/disconnect/")) {
        const service = pathname.replace("/api/v4/connectors/disconnect/", "");
        const v = await import("./credentials-vault.mjs");
        const r = await v.disconnect(service);
        await emitReceipt(dataRoot(), {
          source: "connector-auth",
          title:  `Disconnected: ${service}`,
          summary: "credentials cleared from vault",
          evidence: { service },
        });
        return sendJSON(res, r);
      }
      if (method === "POST" && pathname.startsWith("/api/v4/connectors/refresh/")) {
        const service = pathname.replace("/api/v4/connectors/refresh/", "");
        const oh = await import("./oauth-handler.mjs");
        return sendJSON(res, await oh.refresh(service));
      }
      // ── POST /api/v4/connectors/use/:service ─ unified dispatcher
      // Body: { method: "reddit.post" | "meta.postToFacebookPage" | ... , args: {...} }
      // Looks up the helper on the per-service ALL registry and invokes it.
      if (method === "POST" && pathname.startsWith("/api/v4/connectors/use/")) {
        const service = pathname.replace("/api/v4/connectors/use/", "");
        const body = await parseJSONBody(req);
        if (!body.method) return sendError(res, "method required (e.g., 'post', 'me', 'listAdAccounts')", 400);
        try {
          const mod = await import("./connectors/index.mjs");
          const reg = mod.ALL || mod.default;
          const ns  = reg[service];
          if (!ns) return sendError(res, `no helper namespace for service: ${service}`, 404);
          const fn  = ns[body.method];
          if (typeof fn !== "function") return sendError(res, `no method ${body.method} on ${service}`, 404);
          const result = await fn(body.args || {});
          await emitReceipt(dataRoot(), {
            source:  "connector-use",
            title:   `Connector call: ${service}.${body.method} ${result?.ok === false ? "✗" : "✓"}`,
            summary: result?.error ? `error=${String(result.error).slice(0, 200)}` : `status=${result?.status ?? "n/a"}`,
            evidence: { service, method: body.method, args_keys: Object.keys(body.args || {}), result_status: result?.status, result_ok: result?.ok !== false },
          });
          return sendJSON(res, result);
        } catch (e) {
          return sendError(res, e.message, 500);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.3.0-alpha.6 — AD ARCHITECTURE
      // Native ad layer per operator scope addition: Meta CAPI + Google Enhanced
      // Conversions + UTM standardizer + DCO asset pools + automated rules
      // engine. Replaces dependency on Revealbot/Madgicx/AdStellar SaaS.
      // ═══════════════════════════════════════════════════════════════════════
      if (method === "POST" && pathname === "/api/v4/ads/capi/dispatch") {
        const blocked = await freezeAllBlock("ads-capi-dispatch");
        if (blocked) return sendJSON(res, blocked, 423);
        const body = await parseJSONBody(req);
        if (!body.pixel_id || !body.event_name) return sendError(res, "pixel_id + event_name required", 400);
        const aa = await import("./ad-architecture.mjs");
        const result = await aa.dispatchMetaCAPI(body);
        await emitReceipt(dataRoot(), {
          source:  "ad-capi-dispatch",
          title:   `Meta CAPI: ${body.event_name} ${result?.ok ? "✓" : "✗"}`,
          summary: `pixel_id=${body.pixel_id} · status=${result?.status ?? "n/a"}`,
          evidence: { pixel_id: body.pixel_id, event_name: body.event_name, action_source: body.action_source, ok: result?.ok, status: result?.status },
        });
        return sendJSON(res, result);
      }
      if (method === "POST" && pathname === "/api/v4/ads/google-enhanced/dispatch") {
        const blocked = await freezeAllBlock("ads-google-enhanced-dispatch");
        if (blocked) return sendJSON(res, blocked, 423);
        const body = await parseJSONBody(req);
        if (!body.customer_id || !body.conversion_action_resource) return sendError(res, "customer_id + conversion_action_resource required", 400);
        const aa = await import("./ad-architecture.mjs");
        const result = await aa.dispatchGoogleEnhanced(body);
        await emitReceipt(dataRoot(), {
          source:  "ad-google-enhanced-dispatch",
          title:   `Google Enhanced Conversion: ${result?.ok ? "✓" : "✗"}`,
          summary: `customer_id=${body.customer_id} · value=${body.conversion_value || "(n/a)"} ${body.currency_code || ""}`,
          evidence: { customer_id: body.customer_id, conversion_value: body.conversion_value, currency_code: body.currency_code, ok: result?.ok, status: result?.status },
        });
        return sendJSON(res, result);
      }
      if (method === "POST" && pathname === "/api/v4/ads/utm/standardize") {
        const body = await parseJSONBody(req);
        const aa = await import("./ad-architecture.mjs");
        return sendJSON(res, aa.standardizeUTM(body));
      }
      // DCO asset pools
      if (method === "POST" && pathname === "/api/v4/ads/dco/pools") {
        const body = await parseJSONBody(req);
        if (!body.name || !body.kind) return sendError(res, "name + kind required (kind in video|image|headline|primary_text)", 400);
        const aa = await import("./ad-architecture.mjs");
        const result = aa.createAssetPool({ name: body.name, kind: body.kind, assets: body.assets || [] });
        await emitReceipt(dataRoot(), {
          source:  "ad-dco-pool-create",
          title:   `DCO pool created: ${result.id} · ${body.name}`,
          summary: `kind=${body.kind} · seeded_assets=${result.count}`,
          evidence: { pool_id: result.id, name: body.name, kind: body.kind, count: result.count },
        });
        return sendJSON(res, result);
      }
      if (method === "GET" && pathname === "/api/v4/ads/dco/pools") {
        const aa = await import("./ad-architecture.mjs");
        return sendJSON(res, { pools: aa.listAssetPools() });
      }
      if (method === "GET" && pathname.startsWith("/api/v4/ads/dco/pools/") && !pathname.endsWith("/assets")) {
        const pool_id = pathname.replace("/api/v4/ads/dco/pools/", "");
        const aa = await import("./ad-architecture.mjs");
        const p = aa.getAssetPool(pool_id);
        if (!p) return sendError(res, `no such pool: ${pool_id}`, 404);
        return sendJSON(res, p);
      }
      if (method === "POST" && pathname.startsWith("/api/v4/ads/dco/pools/") && pathname.endsWith("/assets")) {
        const pool_id = pathname.replace("/api/v4/ads/dco/pools/", "").replace("/assets", "");
        const body = await parseJSONBody(req);
        if (!body.asset) return sendError(res, "asset object required (e.g., {path, label, dimensions, ...})", 400);
        const aa = await import("./ad-architecture.mjs");
        const result = aa.addAssetToPool({ pool_id, asset: body.asset });
        if (result?.ok) {
          await emitReceipt(dataRoot(), {
            source:  "ad-dco-asset-add",
            title:   `DCO asset added → pool ${pool_id}`,
            summary: `pool_size=${result.count}`,
            evidence: { pool_id, asset_meta: { label: body.asset.label, path: body.asset.path }, count: result.count },
          });
        }
        return sendJSON(res, result);
      }
      // Global rules guard: master pause + simulation mode for automated ad actions.
      if (method === "GET" && pathname === "/api/v4/ads/guard") {
        const aa = await import("./ad-architecture.mjs");
        return sendJSON(res, { ok: true, guard: aa.getRulesGuard() });
      }
      if (method === "POST" && pathname === "/api/v4/ads/guard") {
        const body = await parseJSONBody(req).catch(() => ({}));
        const aa = await import("./ad-architecture.mjs");
        const guard = aa.setRulesGuard({
          global_pause: typeof body.global_pause === "boolean" ? body.global_pause : undefined,
          simulation_mode: typeof body.simulation_mode === "boolean" ? body.simulation_mode : undefined,
          reason: body.reason || "operator route update",
          updated_by: body.updated_by || "operator",
        });
        await emitReceipt(dataRoot(), {
          source:  "ad-guard-update",
          title:   `Ad rules guard updated: pause=${guard.global_pause} simulation=${guard.simulation_mode}`,
          summary: guard.reason,
          evidence: { guard },
        });
        return sendJSON(res, { ok: true, guard });
      }
      // Automated rules engine
      if (method === "POST" && pathname === "/api/v4/ads/rules") {
        const body = await parseJSONBody(req);
        if (!body.name || !body.condition || !body.action) return sendError(res, "name + condition + action required", 400);
        const aa = await import("./ad-architecture.mjs");
        const result = aa.createRule({
          name: body.name,
          platform: body.platform || "meta-ads",
          account_id: body.account_id || null,
          condition: body.condition, // {metric, op, value, time_window_h}
          action: body.action,       // {type, scale_pct?, target, entity_id?, notify_channel?}
        });
        await emitReceipt(dataRoot(), {
          source:  "ad-rule-create",
          title:   `Ad rule created: ${result.id} · ${body.name}`,
          summary: `metric=${body.condition.metric} ${body.condition.op} ${body.condition.value} → ${body.action.type}`,
          evidence: { rule_id: result.id, name: body.name, platform: body.platform, condition: body.condition, action: body.action },
        });
        return sendJSON(res, result);
      }
      if (method === "GET" && pathname === "/api/v4/ads/rules") {
        const aa = await import("./ad-architecture.mjs");
        return sendJSON(res, { rules: aa.listRules() });
      }
      if (method === "POST" && pathname.startsWith("/api/v4/ads/rules/") && pathname.endsWith("/toggle")) {
        const rule_id = pathname.replace("/api/v4/ads/rules/", "").replace("/toggle", "");
        const body = await parseJSONBody(req).catch(() => ({}));
        const aa = await import("./ad-architecture.mjs");
        const result = aa.setRuleEnabled(rule_id, body.enabled !== false);
        return sendJSON(res, result);
      }
      if (method === "DELETE" && pathname.startsWith("/api/v4/ads/rules/")) {
        const rule_id = pathname.replace("/api/v4/ads/rules/", "");
        const aa = await import("./ad-architecture.mjs");
        const result = aa.deleteRule(rule_id);
        await emitReceipt(dataRoot(), {
          source:  "ad-rule-delete",
          title:   `Ad rule deleted: ${rule_id}`,
          summary: `result=${result?.ok ? "ok" : "fail"}`,
          evidence: { rule_id },
        });
        return sendJSON(res, result);
      }
      if (method === "POST" && pathname.startsWith("/api/v4/ads/rules/") && pathname.endsWith("/eval")) {
        const rule_id = pathname.replace("/api/v4/ads/rules/", "").replace("/eval", "");
        const body = await parseJSONBody(req).catch(() => ({}));
        const aa = await import("./ad-architecture.mjs");
        // Caller supplies metrics inline so the route can be exercised even
        // when no platform connector is wired yet.
        const rule = aa.listRules().find(r => r.id === rule_id);
        if (!rule) return sendError(res, `no such rule: ${rule_id}`, 404);
        const fetchMetrics = async () => ({ ok: true, value: body.observed_value ?? null });
        const result = await aa.evalRule({
          rule,
          fetchMetrics,
          emitReceipt: (r) => emitReceipt(dataRoot(), r),
          dryRun: !!body.dry_run,
        });
        return sendJSON(res, result);
      }
      if (method === "POST" && pathname === "/api/v4/ads/rules/engine/start") {
        const blocked = await freezeAllBlock("ads-rules-engine-start");
        if (blocked) return sendJSON(res, blocked, 423);
        const body = await parseJSONBody(req).catch(() => ({}));
        const aa = await import("./ad-architecture.mjs");
        // Default metrics reader is intentionally neutral for local simulation;
        // platform-specific connectors replace it when a real ad account is connected.
        const fetchMetrics = async () => ({ ok: true, value: 0 });
        const start = aa.startRulesEngine({
          fetchMetrics,
          emitReceipt: (r) => emitReceipt(dataRoot(), r),
          interval_minutes: body.interval_minutes || 15,
        });
        await emitReceipt(dataRoot(), {
          source:  "ad-rules-engine-start",
          title:   `Ad Rules engine started (sweep every ${body.interval_minutes || 15}min)`,
          summary: `rules_count=${aa.listRules().length} · pause=${start.guard.global_pause} · simulation=${start.guard.simulation_mode}`,
          evidence: { interval_minutes: body.interval_minutes || 15, rules_count: aa.listRules().length, guard: start.guard, already_started: start.already_started },
        });
        return sendJSON(res, { ok: true, interval_minutes: body.interval_minutes || 15, guard: start.guard, already_started: start.already_started });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.3.0-alpha.2.5 — SETUP WIZARD + OpenRouter universal fallback
      // Per Silent Canvas Doctrine §8.4.5 set-and-forget auth model.
      // ═══════════════════════════════════════════════════════════════════════
      if (method === "GET" && pathname === "/api/v4/setup/wizard") {
        const sw = await import("./setup-wizard.mjs");
        return sendJSON(res, await sw.status());
      }
      if (method === "POST" && pathname === "/api/v4/setup/openrouter") {
        const body = await parseJSONBody(req);
        if (!body.key) return sendError(res, "key required", 400);
        const sw = await import("./setup-wizard.mjs");
        const result = await sw.setOpenRouterKey({ key: body.key });
        if (result.ok) {
          await emitReceipt(dataRoot(), {
            source: "setup-wizard",
            title:  "OpenRouter key set (universal fallback enabled)",
            summary: "ORANGEBOX_OPENROUTER_KEY persisted. Replaces 5+ deprecated provider env vars.",
            evidence: { saved_to: result.saved_to },
          });
        }
        return sendJSON(res, result);
      }
      if (method === "GET" && pathname === "/api/v4/openrouter/probe") {
        const or = await import("./openrouter-fallback.mjs");
        return sendJSON(res, await or.probe());
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.3.0-alpha.0 — SUBSCRIPTION PIPE TRANSPORT (Silent Canvas Doctrine §5.0)
      // Detect installed CLIs (claude/codex/gemini/grok/cursor) so every model
      // call can prefer the operator's monthly subscription over per-token API.
      // ═══════════════════════════════════════════════════════════════════════
      if (method === "GET" && pathname === "/api/v4/pipes/list") {
        const sp = await import("./subscription-pipes.mjs");
        return sendJSON(res, await sp.listForOperator());
      }
      if (method === "POST" && pathname === "/api/v4/pipes/redetect") {
        const sp = await import("./subscription-pipes.mjs");
        const result = await sp.redetect();
        await emitReceipt(dataRoot(), {
          source:   "pipes-redetect",
          title:    `Pipe redetect: ${result.summary.detected_count}/${Object.keys(result.providers).length} providers have a subscription CLI`,
          summary:  `Found pipes for: ${result.summary.providers_with_pipe.join(", ") || "(none)"}`,
          evidence: {
            detected:   result.summary.providers_with_pipe,
            missing:    Object.entries(result.providers).filter(([_, v]) => v.status === "missing").map(([k]) => k),
            providers:  Object.fromEntries(Object.entries(result.providers).map(([k, v]) => [k, { status: v.status, binary: v.binary || null, version: v.version || null }])),
            detected_at: result.detected_at,
          },
        });
        return sendJSON(res, result);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.2.0 — PROJECT MODE (daily-driver IDE surface)
      // ═══════════════════════════════════════════════════════════════════════
      if (method === "GET" && pathname === "/api/v4/project/recent") {
        const pm = await import("./project-manager.mjs");
        const limit = parseInt(parsed.searchParams.get("limit") || "20", 10);
        return sendJSON(res, await pm.listRecent({ limit }));
      }
      if (method === "POST" && pathname === "/api/v4/project/recent") {
        const body = await parseJSONBody(req);
        if (!body.root) return sendError(res, "root required", 400);
        const pm = await import("./project-manager.mjs");
        const result = await pm.addRecent({ root: body.root });
        await emitReceipt(dataRoot(), {
          source:  "project-open",
          title:   `Project opened: ${result.added.name}`,
          summary: `Root: ${result.added.root}`,
          evidence: { root: result.added.root, name: result.added.name, recent_count: result.count },
        });
        return sendJSON(res, result);
      }
      if (method === "DELETE" && pathname === "/api/v4/project/recent") {
        const body = await parseJSONBody(req);
        const pm = await import("./project-manager.mjs");
        return sendJSON(res, await pm.removeRecent({ root: body.root }));
      }
      if (method === "GET" && pathname === "/api/v4/project/tree") {
        const root = parsed.searchParams.get("root");
        const dir  = parsed.searchParams.get("dir") || "";
        if (!root) return sendError(res, "root required", 400);
        const pm = await import("./project-manager.mjs");
        return sendJSON(res, await pm.treeListing({ root, dir }));
      }
      if (method === "GET" && pathname === "/api/v4/project/state") {
        const root = parsed.searchParams.get("root");
        if (!root) return sendError(res, "root required", 400);
        const pm = await import("./project-manager.mjs");
        return sendJSON(res, await pm.getState({ root }));
      }
      if (method === "POST" && pathname === "/api/v4/project/state") {
        const body = await parseJSONBody(req);
        if (!body.root) return sendError(res, "root required", 400);
        const pm = await import("./project-manager.mjs");
        return sendJSON(res, await pm.saveState(body));
      }
      if (method === "POST" && pathname === "/api/v4/project/chat") {
        const body = await parseJSONBody(req);
        if (!body.root || !body.message) return sendError(res, "root + message required", 400);
        const pm = await import("./project-manager.mjs");
        return sendJSON(res, await pm.appendChatMessage(body));
      }
      if (method === "GET" && pathname === "/api/v4/project/git") {
        const root = parsed.searchParams.get("root");
        if (!root) return sendError(res, "root required", 400);
        const pm = await import("./project-manager.mjs");
        return sendJSON(res, await pm.gitBranch({ root }));
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.1.0 — AGENT MODE (multi-turn tool-using loop) + REPO INDEX + TAB COMPLETE
      // ═══════════════════════════════════════════════════════════════════════
      if (method === "POST" && pathname === "/api/v4/agent/run") {
        const blocked = await freezeAllBlock("agent-run");
        if (blocked) return sendJSON(res, blocked, 423);
        const body = await parseJSONBody(req);
        if (!body.goal) return sendError(res, "goal required", 400);
        if (!ANTHROPIC_KEY) return sendError(res, "ANTHROPIC_API_KEY missing", 502);
        const workspace = body.workspace || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const fz = await import("./freeze-guard.mjs");
        const jobs = await import("./agent-jobs.mjs");
        const started = jobs.start({
          goal: body.goal,
          workspace,
          anthropicKey: ANTHROPIC_KEY,
          maxSteps: body.max_steps || 25,
          model: body.model || "claude-sonnet-4-5-20251015",
          dataRoot: dataRoot(),
          freezeGuard: fz,
          emitReceipt: (r) => emitReceipt(dataRoot(), r),
        });
        return sendJSON(res, started);
      }
      if (method === "GET" && pathname.startsWith("/api/v4/agent/status/")) {
        const id = pathname.replace("/api/v4/agent/status/", "");
        const jobs = await import("./agent-jobs.mjs");
        const st = jobs.status(id);
        if (!st) return sendError(res, "no such job", 404);
        return sendJSON(res, st);
      }
      if (method === "POST" && pathname.startsWith("/api/v4/agent/cancel/")) {
        const id = pathname.replace("/api/v4/agent/cancel/", "");
        const jobs = await import("./agent-jobs.mjs");
        return sendJSON(res, jobs.cancel(id));
      }
      if (method === "GET" && pathname === "/api/v4/agent/list") {
        const jobs = await import("./agent-jobs.mjs");
        const limit = parseInt(parsed.searchParams.get("limit") || "20", 10);
        return sendJSON(res, jobs.list({ limit }));
      }

      // Repo indexer
      if (method === "POST" && pathname === "/api/v4/repo/index") {
        const body = await parseJSONBody(req);
        const workspace = body.workspace || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const ri = await import("./repo-indexer.mjs");
        const ix = await ri.buildIndex({ workspace, max_files: body.max_files || 5000 });
        const sum = ri.summary(workspace);
        await emitReceipt(dataRoot(), {
          source:   "repo-index",
          title:    `Repo index built: ${ix.files.length} files`,
          summary:  `${sum.total_symbols} symbols · ${ix.took_ms}ms`,
          evidence: { workspace, file_count: ix.files.length, total_symbols: sum.total_symbols, langs: sum.langs, took_ms: ix.took_ms },
        });
        return sendJSON(res, sum);
      }
      if (method === "GET" && pathname === "/api/v4/repo/summary") {
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const ri = await import("./repo-indexer.mjs");
        return sendJSON(res, ri.summary(workspace));
      }
      if (method === "GET" && pathname === "/api/v4/repo/find-symbol") {
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const name = parsed.searchParams.get("name") || "";
        if (!name) return sendError(res, "name required", 400);
        const ri = await import("./repo-indexer.mjs");
        return sendJSON(res, ri.findSymbol(workspace, name));
      }
      if (method === "GET" && pathname === "/api/v4/repo/symbol-prefix") {
        const workspace = parsed.searchParams.get("workspace") || process.env.ORANGEBOX_WORKSPACE_ROOT || appRoot;
        const prefix = parsed.searchParams.get("prefix") || "";
        if (!prefix) return sendError(res, "prefix required", 400);
        const ri = await import("./repo-indexer.mjs");
        return sendJSON(res, ri.searchSymbolPrefix(workspace, prefix, 20));
      }

      // Tab complete (Cursor-killer)
      if (method === "POST" && pathname === "/api/v4/ide/complete") {
        const body = await parseJSONBody(req);
        if (!body.prefix) return sendJSON(res, { completion: "", reason: "empty prefix" });
        const tc = await import("./tab-complete.mjs");
        const out = await tc.complete({
          prefix:       body.prefix,
          suffix:       body.suffix || "",
          language:     body.language || "text",
          file_path:    body.file_path || "",
          anthropicKey: ANTHROPIC_KEY,
          max_tokens:   body.max_tokens || 80,
          model:        body.model || "claude-haiku-4-5-20251015",
        });
        return sendJSON(res, out);
      }
      if (method === "POST" && pathname === "/api/v4/ide/complete/clear-cache") {
        const tc = await import("./tab-complete.mjs");
        return sendJSON(res, tc.clearCache());
      }
      if (method === "GET" && pathname === "/api/v4/ide/complete/cache-stats") {
        const tc = await import("./tab-complete.mjs");
        return sendJSON(res, tc.cacheStats());
      }

      // v6.0.11 — Whisper status detect (for Voice lane banner)
      if (method === "GET" && pathname === "/api/v4/voice/whisper-status") {
        try {
          const w = await getWhisper();
          const st = await w.checkWhisperBinary();
          return sendJSON(res, {
            present: !!st.localBinaryFound,
            path:    st.localBinaryPath || "",
            cloud_fallback: !!st.cloudFallbackAvailable,
            model_dir: st.modelDir,
            ready: !!st.ready,
            install_hint: st.localBinaryFound
              ? ""
              : "Releases page: github.com/ggerganov/whisper.cpp/releases. After install, ensure whisper-cli is on PATH or at ./bin/whisper-cli.",
          });
        } catch (e) {
          return sendJSON(res, { present: false, path: "", cloud_fallback: false, ready: false, install_hint: `(check failed: ${e.message})` });
        }
      }

      if (method === "POST" && pathname === "/api/v4/trilane/vote") {
        const body = await parseJSONBody(req);
        const tv = await import("./trilane-vote.mjs");
        try {
          const out = await tv.recordVote(body);
          await emitReceipt(dataRoot(), {
            source:   "trilane-vote",
            title:    `Trilane vote: ${body.winner} (${body.mode || "trilane"})`,
            summary:  `Prompt: ${String(body.prompt || "").slice(0, 100)}`,
            evidence: { vote_id: out.id, winner: body.winner, mode: body.mode || "trilane", adversarial: !!body.adversarial, leg_count: (body.legs || []).length },
          });
          return sendJSON(res, out);
        } catch (e) {
          return sendError(res, e.message, 400);
        }
      }
      if (method === "GET" && pathname === "/api/v4/trilane/votes") {
        const tv = await import("./trilane-vote.mjs");
        const limit = parseInt(parsed.searchParams.get("limit") || "50", 10);
        return sendJSON(res, await tv.listVotes({ limit }));
      }
      if (method === "POST" && pathname === "/api/v4/receipts/export") {
        const body = await parseJSONBody(req);
        const rx = await import("./receipts-export.mjs");
        const result = await rx.exportMarkdown({ source: body.source || null, since: body.since || null, limit: body.limit || 500 });
        if (result.ok) {
          await emitReceipt(dataRoot(), {
            source:   "receipts-export",
            title:    `Receipts export: ${result.count} entries`,
            summary:  `Saved to ${result.file} (${result.bytes} bytes)`,
            evidence: { file: result.file, count: result.count, bytes: result.bytes, filter_source: body.source || null, since: body.since || null },
          });
        }
        return sendJSON(res, result);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // v6.0.10 — AE Alpha News (curated from operator's X follows via Hermes)
      // ═══════════════════════════════════════════════════════════════════════
      if (method === "GET" && pathname === "/api/v4/ae-alpha-news/feed") {
        const ae = await import("./ae-alpha-news.mjs");
        const limit = parseInt(parsed.searchParams.get("limit") || "30", 10);
        const force = parsed.searchParams.get("refresh") === "1";
        return sendJSON(res, await ae.fetchFeed({ limit, force_refresh: force }));
      }
      if (method === "GET" && pathname === "/api/v4/ae-alpha-news/anchors") {
        const ae = await import("./ae-alpha-news.mjs");
        return sendJSON(res, await ae.listAnchors());
      }
      if (method === "POST" && pathname === "/api/v4/ae-alpha-news/anchors") {
        const body = await parseJSONBody(req);
        if (!Array.isArray(body.anchors)) return sendError(res, "anchors[] required");
        const ae = await import("./ae-alpha-news.mjs");
        const result = await ae.saveAnchors(body.anchors);
        await emitReceipt(dataRoot(), {
          source:   "ae-alpha-anchors",
          title:    `AE anchors updated: ${result.count} handles`,
          summary:  result.anchors.join(", "),
          evidence: { count: result.count, path: result.path },
        });
        return sendJSON(res, result);
      }
      if (method === "POST" && pathname === "/api/v4/ae-alpha-news/clear-cache") {
        const ae = await import("./ae-alpha-news.mjs");
        return sendJSON(res, await ae.clearCache());
      }
      if (method === "POST" && pathname === "/api/v4/ae-alpha-news/score") {
        const body = await parseJSONBody(req);
        if (!body.text) return sendError(res, "text required");
        const ae = await import("./ae-alpha-news.mjs");
        return sendJSON(res, { score: ae.scoreItem(body), links: ae.extractLinks(body) });
      }

      // ── GET /api/v4/hermes/feed ─ parsed Hermes X feed (graceful when not installed)
      if (method === "GET" && pathname === "/api/v4/hermes/feed") {
        const hf = await import("./hermes-feed.mjs");
        const limit = parseInt(parsed.searchParams.get("limit") || "20", 10);
        return sendJSON(res, await hf.fetchFeed({ limit }));
      }

      // ── POST /api/v4/reasoning/extract ─ extract thinking blocks from a model call result
      if (method === "POST" && pathname === "/api/v4/reasoning/extract") {
        const body = await parseJSONBody(req);
        if (!Array.isArray(body.rawContent)) return sendError(res, "rawContent[] required");
        const re = await import("./reasoning-extractor.mjs");
        return sendJSON(res, re.extractThinkingFromRaw(body.rawContent));
      }

      // ── POST /api/v4/benchmark/longmemeval/run ─ wired smoke benchmark, real receipt
      if (method === "POST" && pathname === "/api/v4/benchmark/longmemeval/run") {
        const body = await parseJSONBody(req);
        const harness = await import("./benchmarks/longmemeval-harness.mjs");
        try {
          const out = await harness.runBenchmark({ dataset: body.dataset || null, topk: body.topk || 5 });
          await emitReceipt(dataRoot(), {
            source:   "longmemeval",
            title:    `LongMemEval-S run: R@5=${(out.R5 * 100).toFixed(1)}%`,
            summary:  `N=${out.n} R@5=${(out.R5 * 100).toFixed(1)}% R@10=${(out.R10 * 100).toFixed(1)}% MRR=${(out.MRR * 100).toFixed(1)}%`,
            evidence: { n: out.n, R5: out.R5, R10: out.R10, MRR: out.MRR, note: out.note },
          });
          return sendJSON(res, out);
        } catch (e) {
          return sendError(res, "benchmark error: " + e.message, 500);
        }
      }

      // ── POST /api/v4/shell/start ─ start a persistent shell session
      if (method === "POST" && pathname === "/api/v4/shell/start") {
        const body = await parseJSONBody(req);
        const id = body.id || `shell_${Date.now()}`;
        const sh = await import("./shell-stream.mjs");
        const s = sh.startSession(id);
        return sendJSON(res, { id: s.id, pid: s.proc.pid, alive: s.alive });
      }
      // ── POST /api/v4/shell/exec ─ send a command + collect output for N ms
      if (method === "POST" && pathname === "/api/v4/shell/exec") {
        const body = await parseJSONBody(req);
        if (!body.id || !body.command) return sendError(res, "id + command required");
        // Optional careful check
        if (body.careful !== false) {
          const c = await import("./careful-check.mjs");
          const check = c.check(body.command);
          if (check.destructive) {
            return sendJSON(res, { ok: false, blocked: true, reason: check.reason, pattern: check.pattern });
          }
        }
        const sh = await import("./shell-stream.mjs");
        const collected = { stdout: "", stderr: "", exit: null };
        const off = sh.subscribe(body.id, ev => {
          if (ev.stream === "stdout") collected.stdout += ev.text;
          else if (ev.stream === "stderr") collected.stderr += ev.text;
          else if (ev.stream === "exit") collected.exit = ev.code;
        });
        sh.sendInput(body.id, body.command);
        const waitMs = Math.min(parseInt(body.wait_ms || "1500", 10), 15000);
        await new Promise(r => setTimeout(r, waitMs));
        off();
        return sendJSON(res, { ok: true, ...collected });
      }
      // ── POST /api/v4/shell/kill ─ kill a session
      if (method === "POST" && pathname === "/api/v4/shell/kill") {
        const body = await parseJSONBody(req);
        if (!body.id) return sendError(res, "id required");
        const sh = await import("./shell-stream.mjs");
        return sendJSON(res, { killed: sh.killSession(body.id) });
      }
      // ── GET /api/v4/shell/list ─ list active sessions
      if (method === "GET" && pathname === "/api/v4/shell/list") {
        const sh = await import("./shell-stream.mjs");
        return sendJSON(res, { sessions: sh.listSessions() });
      }

      // ── POST /api/v4/vault/stream ─ SSE token stream from cited-query
      if (method === "POST" && pathname === "/api/v4/vault/stream") {
        const body = await parseJSONBody(req);
        if (!body.question) return sendError(res, "question is required");
        if (!ANTHROPIC_KEY) return sendError(res, "ANTHROPIC_API_KEY missing", 502);
        startSSE(res);
        // Build minimal cited-query inline (mirrors vault/cited-query logic but streams)
        const messages = [{ role: "user", content: body.question }];
        await anthropicStream(res, {
          system:   `You are answering a question grounded in the operator's local CLC vault. Cite specific files when possible.`,
          messages, model: "claude-sonnet-4-5-20251015",
          dataRoot: dataRoot(), callerRef: "v4:/vault/stream",
          routed:   { provider: "anthropic" }, tools: undefined, context_management: undefined,
        });
        return;
      }

      // ── POST /api/v4/composer/run ─ FULL one-shot: scaffold → LLM call → plan → apply
      if (method === "POST" && pathname === "/api/v4/composer/run") {
        const body = await parseJSONBody(req);
        if (!body.prompt || !Array.isArray(body.files)) return sendError(res, "prompt + files[] required");
        for (const f of body.files) if (!isFsPathSafe(f)) return sendError(res, "Access denied", 403);
        if (!ANTHROPIC_KEY) return sendError(res, "ANTHROPIC_API_KEY missing — set it in Settings (Ctrl+,)", 502);
        const co = await import("./composer.mjs");
        const scaffold = co.planScaffold({ prompt: body.prompt, files: body.files });
        // Call Anthropic Sonnet 4.5 with output_config json_schema for strict JSON.
        const result = await anthropicCall({
          system:    "You are the OrangeBox Composer. Return ONLY a JSON object: { changes: [{file, after}] }.",
          messages:  [{ role: "user", content: scaffold.llm_prompt }],
          model:     body.model || "claude-sonnet-4-5-20251015",
          callerRef: "v4:/composer/run",
          output_config: {
            format: { type: "json_schema", schema: {
              type: "object",
              properties: { changes: { type: "array", items: { type: "object",
                properties: { file: { type: "string" }, after: { type: "string" } },
                required: ["file", "after"], additionalProperties: false } } },
              required: ["changes"], additionalProperties: false,
            } },
          },
        });
        if (!result.ok) return sendError(res, result.error || "LLM call failed", 502);
        // Parse JSON from response
        let llm_json;
        try {
          const text = result.rawContent?.find(c => c.type === "text")?.text || "";
          llm_json = JSON.parse(text);
        } catch (e) {
          return sendError(res, "LLM did not return valid JSON: " + e.message, 502);
        }
        const plan = co.buildPlanFromLlmResponse({ llm_json });
        if (!plan.ok) return sendJSON(res, plan, 400);
        // Apply if auto_apply, else return plan only
        if (body.auto_apply) {
          // Freeze guard on every file
          const fz = await import("./freeze-guard.mjs");
          for (const change of plan.proposed) {
            const ok = fz.checkPathAllowed(change.file);
            if (!ok.allowed) return sendError(res, ok.reason, 403);
          }
          const applied = await co.apply({ plan, accept_ids: null });
          await emitReceipt(dataRoot(), {
            source:   "composer-auto",
            title:    `Composer one-shot: ${applied.applied_count}/${plan.proposed.length} files`,
            summary:  body.prompt.slice(0, 200),
            evidence: { files: applied.results.filter(r => r.applied).map(r => r.file), prompt_excerpt: body.prompt.slice(0, 300) },
          });
          return sendJSON(res, { ok: true, plan, applied });
        }
        return sendJSON(res, { ok: true, plan });
      }

      // ── POST /api/v4/composer/apply ─ apply selected changes
      if (method === "POST" && pathname === "/api/v4/composer/apply") {
        const body = await parseJSONBody(req);
        if (!body.plan) return sendError(res, "plan required");
        // Freeze guard on every file
        const fz = await import("./freeze-guard.mjs");
        for (const change of body.plan.proposed || []) {
          if (body.accept_ids && !body.accept_ids.includes(change.id)) continue;
          const ok = fz.checkPathAllowed(change.file);
          if (!ok.allowed) return sendError(res, ok.reason, 403);
          if (!isFsPathSafe(change.file)) return sendError(res, "Access denied", 403);
        }
        const co = await import("./composer.mjs");
        const result = await co.apply(body);
        // Emit composite receipt — includes SHA-256 hash chain per file for audit trail
        await emitReceipt(dataRoot(), {
          source:   "composer",
          title:    `Composer apply: ${result.applied_count} files`,
          summary:  `Applied ${result.applied_count} of ${body.plan.proposed.length} proposed changes`,
          evidence: {
            applied:       result.results.filter(r => r.applied).map(r => r.file),
            chain_summary: result.chain_summary || [],
            files:         result.results.filter(r => r.applied).map(r => ({
              file: r.file, kind: r.kind, bytes: r.bytes,
              sha256_before: r.sha256_before, sha256_after: r.sha256_after,
              chain: r.chain,
            })),
          },
        });
        return sendJSON(res, result);
      }

      // ── GET /api/v4/cost/today ─ rollup cost across today's calls
      if (method === "GET" && pathname === "/api/v4/cost/today") {
        const priv = await getPrivacy().catch(() => null);
        if (!priv) return sendJSON(res, { ok: false, total_cents: 0, by_provider: [] });
        try {
          const summary = await priv.summarize(dataRoot(), { sinceHours: 24 });
          return sendJSON(res, summary);
        } catch (e) {
          return sendJSON(res, { ok: false, error: e.message, total_cents: 0 });
        }
      }

      // ── 404 ────────────────────────────────────────────────────────────────
      return sendError(res, `No v4 route: ${method} ${pathname}`, 404);

    } catch (err) {
      console.error("[v4-server-routes] Unhandled error:", err);
      return sendError(res, `Internal server error: ${err.message}`, 500);
    }
  }

  // ── WebSocket upgrade handler ─────────────────────────────────────────────
  // Attach to the HTTP server:
  //   server.on("upgrade", v4.handleUpgrade);
  //   server.on("upgrade", v4.upgrade);          // alias (ID-01)
  async function handleUpgrade(req, socket, head) {
    const parsed  = new URL(req.url || "/", "http://localhost");
    const pathname = parsed.pathname;

    if (pathname !== "/api/v4/terminal/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      return socket.destroy();
    }

    // SEC-003: Require Sec-WebSocket-Protocol: orangebox-v4.<token>
    const wsProto = req.headers["sec-websocket-protocol"] || "";
    const expectedProto = `orangebox-v4.${TERMINAL_TOKEN}`;
    if (wsProto.trim() !== expectedProto) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
      return socket.destroy();
    }

    // SEC-004: Shell whitelist
    const requestedShell = parsed.searchParams.get("shell") || "";
    if (requestedShell && !ALLOWED_SHELLS.has(requestedShell.toLowerCase())) {
      socket.write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
      return socket.destroy();
    }

    wsHandshake(req, socket);

    const shellEnv = requestedShell || (process.platform === "win32" ? "powershell" : "bash");

    // L-1: node-pty ESM-safe dynamic require via createRequire.
    // Falls back to child_process.spawn on failure (loss of resize / ANSI control).
    let ptyProc;
    let fallback = false;
    try {
      const { createRequire } = await import("node:module");
      const _req = createRequire(import.meta.url);
      const ptyMod = _req("node-pty");
      ptyProc = ptyMod.spawn(shellEnv, [], {
        name: "xterm-256color",
        cols:  80,
        rows:  24,
        cwd:   process.env.ORANGEBOX_WORKSPACE_ROOT || os.homedir(),
        env:   process.env,
      });
      ptyProc.onData((data) => {
        if (!socket.destroyed) socket.write(wsBuildFrame(data));
      });
      ptyProc.onExit(() => {
        if (!socket.destroyed) {
          socket.write(wsBuildFrame("[PTY exited]"));
          socket.destroy();
        }
      });
    } catch {
      // node-pty not installed or failed — fallback to plain spawn.
      // NOTE: resize and ANSI control sequences are unavailable in fallback mode.
      fallback = true;
      ptyProc = spawn(shellEnv, [], {
        cwd:   process.env.ORANGEBOX_WORKSPACE_ROOT || os.homedir(),
        env:   process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      ptyProc.stdout.on("data", (d) => {
        if (!socket.destroyed) socket.write(wsBuildFrame(d.toString("utf8")));
      });
      ptyProc.stderr.on("data", (d) => {
        if (!socket.destroyed) socket.write(wsBuildFrame(d.toString("utf8")));
      });
      ptyProc.on("close", () => {
        if (!socket.destroyed) socket.destroy();
      });
    }

    let wsBuf = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      wsBuf = Buffer.concat([wsBuf, chunk]);
      while (true) {
        const frame = wsParseFrame(wsBuf);
        if (!frame) break;
        wsBuf = wsBuf.slice(frame.consumed);
        if (frame.opcode === 0x08) { // close
          try { (fallback ? ptyProc.kill("SIGTERM") : ptyProc.kill()); } catch { /* */ }
          socket.destroy();
          break;
        }
        if (frame.opcode === 0x09) { // ping
          socket.write(wsBuildFrame(frame.payload, 0x0a));
          continue;
        }
        const text = frame.payload.toString("utf8");
        try {
          if (fallback) {
            ptyProc.stdin.write(text);
          } else {
            ptyProc.write(text);
          }
        } catch { /* stdin closed */ }
      }
    });

    socket.on("error", () => {
      try { (fallback ? ptyProc.kill("SIGTERM") : ptyProc.kill()); } catch { /* */ }
    });

    socket.on("close", () => {
      try { (fallback ? ptyProc.kill("SIGTERM") : ptyProc.kill()); } catch { /* */ }
    });
  }

  handle.handleUpgrade = handleUpgrade;
  handle.upgrade       = handleUpgrade; // ID-01: alias for __v4.upgrade(req, socket, head)
  return handle;
}
