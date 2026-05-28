/**
 * ORANGEBOX v4 — Codexa Cloud Server
 * Disclosure: ATOM-OBX-V4-MOAT-2026-0516
 *
 * Zero npm dependencies. Pure Node.js ES module.
 * Built-ins used: http, https, crypto, fs, child_process, path, os
 *
 * Endpoints:
 *   POST /v1/codexa/command  — execute shell command, return receipt (sync, ≤60s)
 *   POST /v1/codexa/job      — enqueue async job, return jobId
 *   GET  /v1/codexa/job/:id  — poll job status + receipt
 *   GET  /v1/codexa/health   — liveness check (no auth)
 *
 * Safety doctrine (from CODEXA_WORKER_RAIL.md):
 *   No destructive shell without confirmFullAccess=true in request body.
 *   No production deploys without operator approval.
 *   No payment/banking/tax actions ever.
 *   No destructive deletes outside declared scope.
 *
 * Auth modes:
 *   Legacy (default):     CODEXA_CLOUD_TOKEN + X-Tenant-Id header
 *   Per-tenant (new):     CODEXA_PER_TENANT=true  → Ed25519 compact tokens
 *                         via codexa-tenant-tokens.mjs; tenant_id comes from token claim.
 */

import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { verifyTenantToken } from './codexa-tenant-tokens.mjs';

// ── Optional native dep: node-pty ─────────────────────────────────────────────
// node-pty is optional. If absent, PTY proxy falls back to plain spawn.
let nodePty = null;
try {
  // Dynamic import so a missing native module doesn't crash the whole server.
  const ptyMod = await import('node-pty');
  nodePty = ptyMod.default ?? ptyMod;
  console.log('[codexa-cloud] node-pty loaded — PTY proxy enabled.');
} catch (_) {
  console.log('[codexa-cloud] node-pty not found — PTY proxy will use plain spawn fallback.');
}

// ── Configuration ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.CODEXA_PORT ?? '8443', 10);
const DATA_ROOT = process.env.CODEXA_DATA_ROOT ?? '/data';
const CLOUD_TOKEN = process.env.CODEXA_CLOUD_TOKEN ?? '';
const RATE_LIMIT_RPM = parseInt(process.env.CODEXA_RATE_LIMIT_RPM ?? '100', 10);
const TLS_SELFGEN = (process.env.CODEXA_TLS_SELFGEN ?? 'false') === 'true';
const TLS_CERT_PATH = process.env.CODEXA_TLS_CERT_PATH ?? '';
const TLS_KEY_PATH = process.env.CODEXA_TLS_KEY_PATH ?? '';
const COMMAND_TIMEOUT_MS = parseInt(process.env.CODEXA_COMMAND_TIMEOUT_MS ?? '60000', 10);
const JOB_RETENTION_MS = parseInt(process.env.CODEXA_JOB_RETENTION_MS ?? String(24 * 60 * 60 * 1000), 10);

// Auth mode: per-tenant Ed25519 (new) vs single shared bearer (legacy)
// Set CODEXA_PER_TENANT=true to activate per-tenant token verification.
// Legacy mode remains the default so existing v5.0 deployments continue unchanged.
const PER_TENANT_AUTH = (process.env.CODEXA_PER_TENANT ?? 'false') === 'true';

// Allowed tenants: comma-separated list in env, or path to JSON file
// Format env: CODEXA_ALLOWED_TENANTS=tenant-abc,tenant-def
// Format file: CODEXA_TENANTS_FILE=/data/tenants.json → ["tenant-abc","tenant-def"]
// In PER_TENANT_AUTH mode this list is still used as an optional extra allow-list guard.
const TENANTS_FILE = process.env.CODEXA_TENANTS_FILE ?? '';
const TENANTS_ENV = process.env.CODEXA_ALLOWED_TENANTS ?? '';

// ── Boot guard ────────────────────────────────────────────────────────────────

if (PER_TENANT_AUTH) {
  // Per-tenant mode: CODEXA_CLOUD_TOKEN is not required.
  console.log('[codexa-cloud] Auth mode: per-tenant Ed25519 tokens (CODEXA_PER_TENANT=true).');
} else {
  // Legacy single-token mode: token must be present and at least 32 chars.
  if (!CLOUD_TOKEN || CLOUD_TOKEN.length < 32) {
    console.error('[FATAL] CODEXA_CLOUD_TOKEN must be set and at least 32 characters.');
    console.error('        To use per-tenant Ed25519 tokens, set CODEXA_PER_TENANT=true.');
    process.exit(1);
  }
  console.log('[codexa-cloud] Auth mode: legacy single shared bearer token.');
}

// ── Tenant registry ───────────────────────────────────────────────────────────

/** @returns {Set<string>} */
function loadTenants() {
  if (TENANTS_FILE) {
    try {
      const raw = fs.readFileSync(TENANTS_FILE, 'utf8');
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error('tenants file must be a JSON array');
      return new Set(arr.map(String));
    } catch (err) {
      console.error('[WARN] Failed to load tenants file:', err.message);
    }
  }
  if (TENANTS_ENV) {
    return new Set(TENANTS_ENV.split(',').map(s => s.trim()).filter(Boolean));
  }
  // No tenant list configured: deny all
  return new Set();
}

let allowedTenants = loadTenants();

// Hot-reload tenants file every 60s
if (TENANTS_FILE) {
  setInterval(() => { allowedTenants = loadTenants(); }, 60_000);
}

/** @param {string} tenantId @returns {boolean} */
function isTenantAllowed(tenantId) {
  if (!tenantId || !/^[a-zA-Z0-9_-]{1,64}$/.test(tenantId)) return false;
  return allowedTenants.has(tenantId);
}

// ── Rate limiter (in-memory token bucket per tenant) ──────────────────────────

/** @type {Map<string, {tokens: number, lastRefill: number}>} */
const rateBuckets = new Map();

/** @param {string} tenantId @returns {boolean} true = allowed */
function checkRate(tenantId) {
  const now = Date.now();
  let bucket = rateBuckets.get(tenantId);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_RPM, lastRefill: now };
    rateBuckets.set(tenantId, bucket);
  }
  // Refill: tokens regenerate per minute
  const elapsed = (now - bucket.lastRefill) / 60_000;
  bucket.tokens = Math.min(RATE_LIMIT_RPM, bucket.tokens + elapsed * RATE_LIMIT_RPM);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

// Prune rate buckets every 10 minutes to avoid unbounded growth
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [id, b] of rateBuckets) {
    if (b.lastRefill < cutoff) rateBuckets.delete(id);
  }
}, 10 * 60_000);

// ── Job queue ─────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   id: string,
 *   tenantId: string,
 *   status: 'queued'|'running'|'done'|'error',
 *   command: string,
 *   args: string[],
 *   confirmFullAccess: boolean,
 *   createdAt: number,
 *   startedAt: number|null,
 *   completedAt: number|null,
 *   receipt: object|null,
 *   error: string|null,
 * }} Job
 */

/** @type {Map<string, Job>} */
const jobs = new Map();

/** @returns {string} */
function newJobId() {
  return 'job_' + crypto.randomBytes(12).toString('hex');
}

// Process one job at a time per tenant (simple FIFO within tenant)
// Background runner — checks for queued jobs every 500ms
setInterval(() => {
  for (const job of jobs.values()) {
    if (job.status === 'queued') {
      // Only run one job per tenant at a time
      const tenantRunning = [...jobs.values()].some(
        j => j.tenantId === job.tenantId && j.status === 'running'
      );
      if (!tenantRunning) {
        runJob(job);
      }
    }
  }
}, 500);

// Prune completed jobs older than retention window
setInterval(() => {
  const cutoff = Date.now() - JOB_RETENTION_MS;
  for (const [id, job] of jobs) {
    if ((job.status === 'done' || job.status === 'error') &&
        (job.completedAt ?? 0) < cutoff) {
      jobs.delete(id);
    }
  }
}, 60_000);

/** @param {Job} job */
async function runJob(job) {
  job.status = 'running';
  job.startedAt = Date.now();
  try {
    const result = await executeCommand({
      tenantId: job.tenantId,
      command: job.command,
      args: job.args,
      confirmFullAccess: job.confirmFullAccess,
      timeoutMs: COMMAND_TIMEOUT_MS * 5, // async jobs get 5× timeout
    });
    job.receipt = result;
    job.status = 'done';
  } catch (err) {
    job.error = err.message;
    job.status = 'error';
  } finally {
    job.completedAt = Date.now();
  }
}

// ── Safety doctrine ───────────────────────────────────────────────────────────

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf?\b/,
  /\bformat\b/,
  /\bdel\s+\/[sf]\b/i,
  /\bdropdb\b/,
  /\bdrop\s+database\b/i,
  /\btruncate\b/i,
  /\bdd\s+if=/,
  /\bmkfs\b/,
  /\bshred\b/,
  />\s*\/dev\/(s|h|nv)d/,
];

const FORBIDDEN_COMMANDS = [
  /^(sudo\s+)?shutdown/,
  /^(sudo\s+)?reboot/,
  /^(sudo\s+)?halt/,
  /\bpasswd\b/,
  /\bchmod\s+777\b/,
  /curl.*\|\s*(ba)?sh/,
  /wget.*\|\s*(ba)?sh/,
];

const PAYMENT_PATTERNS = [
  /stripe/i, /paypal/i, /\bpay\b/i, /\bbank\b/i, /\btax\b/i, /\binvoice\b/i,
];

/**
 * @param {string} command
 * @param {string[]} args
 * @param {boolean} confirmFullAccess
 * @returns {{ allowed: boolean, reason: string }}
 */
function safetyCheck(command, args, confirmFullAccess) {
  const full = [command, ...args].join(' ');

  for (const pat of FORBIDDEN_COMMANDS) {
    if (pat.test(full)) return { allowed: false, reason: `Forbidden command pattern: ${pat}` };
  }
  for (const pat of PAYMENT_PATTERNS) {
    if (pat.test(full)) return { allowed: false, reason: 'Payment/banking/tax commands not allowed via Codexa Cloud.' };
  }
  if (!confirmFullAccess) {
    for (const pat of DESTRUCTIVE_PATTERNS) {
      if (pat.test(full)) return { allowed: false, reason: `Destructive pattern detected (${pat}). Set confirmFullAccess=true to proceed.` };
    }
  }
  return { allowed: true, reason: '' };
}

// ── Command executor ──────────────────────────────────────────────────────────

/**
 * @param {{
 *   tenantId: string,
 *   command: string,
 *   args: string[],
 *   confirmFullAccess: boolean,
 *   timeoutMs: number,
 * }} opts
 * @returns {Promise<object>} receipt
 */
function executeCommand({ tenantId, command, args, confirmFullAccess, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const safety = safetyCheck(command, args, confirmFullAccess);
    if (!safety.allowed) {
      return reject(new Error(safety.reason));
    }

    const startedAt = Date.now();
    const tenantDir = path.join(DATA_ROOT, tenantId);
    const receiptsDir = path.join(tenantDir, 'receipts');
    ensureDir(receiptsDir);

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd: tenantDir,
      env: { ...process.env, HOME: tenantDir },
      timeout: timeoutMs,
      shell: false, // Do not use shell expansion — security
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 2000);
    }, timeoutMs);

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', (code, signal) => {
      clearTimeout(killTimer);
      const completedAt = Date.now();
      const receiptId = 'rcpt_' + crypto.randomBytes(8).toString('hex');
      const receipt = {
        receiptId,
        tenantId,
        command,
        args,
        confirmFullAccess,
        exitCode: timedOut ? 'TIMEOUT' : code,
        signal: signal ?? null,
        timedOut,
        stdout: stdout.slice(0, 65_536), // cap at 64KB
        stderr: stderr.slice(0, 16_384), // cap at 16KB
        durationMs: completedAt - startedAt,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
      };

      // Persist receipt
      const receiptPath = path.join(receiptsDir, `${receiptId}.json`);
      try {
        fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');
        receipt.receiptPath = receiptPath;
      } catch (e) {
        receipt.receiptPath = null;
        receipt.receiptWriteError = e.message;
      }

      if (timedOut) {
        return reject(Object.assign(new Error('Command timed out'), { receipt }));
      }
      resolve(receipt);
    });

    proc.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
  });
}

// ── Audit logger ──────────────────────────────────────────────────────────────

/**
 * @param {string} tenantId
 * @param {object} entry
 */
function auditLog(tenantId, entry) {
  try {
    const logsDir = path.join(DATA_ROOT, tenantId, 'logs');
    ensureDir(logsDir);
    const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
    fs.appendFileSync(path.join(logsDir, 'audit.jsonl'), line, 'utf8');
  } catch (_) {
    // Audit failure must not crash the server
  }
}

// ── Directory helpers ─────────────────────────────────────────────────────────

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureTenantDirs(tenantId) {
  for (const sub of ['receipts', 'knowledge', 'logs']) {
    ensureDir(path.join(DATA_ROOT, tenantId, sub));
  }
}

// ── TLS setup ─────────────────────────────────────────────────────────────────

/**
 * Generate a self-signed certificate using openssl CLI.
 * Only used when CODEXA_TLS_SELFGEN=true (local dev).
 * @returns {{ cert: Buffer, key: Buffer }}
 */
async function generateSelfSignedCert() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexa-tls-'));
  const keyPath = path.join(tmpDir, 'server.key');
  const certPath = path.join(tmpDir, 'server.crt');

  await new Promise((resolve, reject) => {
    const proc = spawn('openssl', [
      'req', '-x509', '-newkey', 'rsa:4096',
      '-keyout', keyPath,
      '-out', certPath,
      '-days', '365',
      '-nodes',
      '-subj', '/CN=codexa-cloud-dev/O=ORANGEBOX/C=US',
    ], { stdio: 'ignore' });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error('openssl failed: ' + code)));
    proc.on('error', reject);
  });

  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);
  // Clean up temp dir
  try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  return { cert, key };
}

// ── Request parsing helpers ───────────────────────────────────────────────────

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<object>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1_048_576) { // 1MB max
        req.destroy();
        return reject(new Error('Request body too large'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  res.end(payload);
}

// ── Auth middleware ───────────────────────────────────────────────────────────

/**
 * Per-tenant Ed25519 auth path.
 * Extracts tenant_id from the verified token claim (authoritative).
 * X-Tenant-Id header may be sent for clarity but is NOT trusted for access control.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {Promise<string|null>}
 */
async function authenticatePerTenant(req, res) {
  const authHeader = req.headers['authorization'] ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    jsonResponse(res, 401, { error: 'Missing or malformed Authorization header.' });
    return null;
  }
  const token = authHeader.slice(7).trim();

  let verification;
  try {
    verification = await verifyTenantToken({ token, dataRoot: DATA_ROOT });
  } catch (err) {
    jsonResponse(res, 500, { error: 'Token verification error.' });
    return null;
  }

  if (!verification.ok) {
    const status = verification.reason === 'revoked' ? 403 : 401;
    jsonResponse(res, status, { error: `Token rejected: ${verification.reason}` });
    return null;
  }

  const tenantId = verification.tenant_id;

  // If an allowedTenants list is configured, enforce it as an additional guard.
  // If the list is empty (not configured), the token alone is sufficient.
  if (allowedTenants.size > 0 && !isTenantAllowed(tenantId)) {
    jsonResponse(res, 403, { error: 'Tenant not on the allowed list.' });
    return null;
  }

  return tenantId;
}

/**
 * Legacy single-token auth path. Reads tenant from X-Tenant-Id header.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {string|null}
 */
function authenticateLegacy(req, res) {
  const authHeader = req.headers['authorization'] ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    jsonResponse(res, 401, { error: 'Missing or malformed Authorization header.' });
    return null;
  }
  const token = authHeader.slice(7).trim();
  // Constant-time comparison
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(CLOUD_TOKEN);
  if (tokenBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    jsonResponse(res, 403, { error: 'Invalid token.' });
    return null;
  }
  const tenantId = req.headers['x-tenant-id'] ?? '';
  if (!isTenantAllowed(tenantId)) {
    jsonResponse(res, 403, { error: 'Tenant not authorized.' });
    return null;
  }
  return tenantId;
}

/**
 * Unified auth entry point. Routes to per-tenant or legacy based on CODEXA_PER_TENANT.
 * Returns tenantId if auth passes, or null if it fails (and writes the error response).
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {Promise<string|null>}
 */
async function authenticate(req, res) {
  if (PER_TENANT_AUTH) {
    return authenticatePerTenant(req, res);
  }
  return authenticateLegacy(req, res);
}

// ── Route handlers ────────────────────────────────────────────────────────────

/** GET /v1/codexa/health — no auth */
function handleHealth(req, res) {
  jsonResponse(res, 200, {
    status: 'up',
    version: '4.0.0',
    ts: new Date().toISOString(),
    tenants: allowedTenants.size,
    activeJobs: [...jobs.values()].filter(j => j.status === 'running').length,
    queuedJobs: [...jobs.values()].filter(j => j.status === 'queued').length,
  });
}

/** POST /v1/codexa/command — sync command execution */
async function handleCommand(req, res, tenantId) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return jsonResponse(res, 400, { error: err.message });
  }

  const { command, args = [], confirmFullAccess = false } = body;

  if (typeof command !== 'string' || !command.trim()) {
    return jsonResponse(res, 400, { error: '`command` (string) is required.' });
  }
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) {
    return jsonResponse(res, 400, { error: '`args` must be an array of strings.' });
  }

  ensureTenantDirs(tenantId);
  auditLog(tenantId, { event: 'command.start', command, args, confirmFullAccess,
    ip: req.socket.remoteAddress });

  try {
    const receipt = await executeCommand({
      tenantId,
      command: command.trim(),
      args,
      confirmFullAccess: Boolean(confirmFullAccess),
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
    auditLog(tenantId, { event: 'command.done', receiptId: receipt.receiptId,
      exitCode: receipt.exitCode, durationMs: receipt.durationMs });
    return jsonResponse(res, 200, { ok: true, receipt });
  } catch (err) {
    auditLog(tenantId, { event: 'command.error', error: err.message });
    const status = err.message.includes('not allowed') || err.message.includes('Destructive') ? 403 : 500;
    return jsonResponse(res, status, { ok: false, error: err.message, receipt: err.receipt ?? null });
  }
}

/** POST /v1/codexa/job — enqueue async job */
async function handleJobCreate(req, res, tenantId) {
  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return jsonResponse(res, 400, { error: err.message });
  }

  const { command, args = [], confirmFullAccess = false } = body;

  if (typeof command !== 'string' || !command.trim()) {
    return jsonResponse(res, 400, { error: '`command` (string) is required.' });
  }
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) {
    return jsonResponse(res, 400, { error: '`args` must be an array of strings.' });
  }

  // Pre-flight safety check before even queuing
  const safety = safetyCheck(command.trim(), args, Boolean(confirmFullAccess));
  if (!safety.allowed) {
    return jsonResponse(res, 403, { ok: false, error: safety.reason });
  }

  ensureTenantDirs(tenantId);

  const jobId = newJobId();
  /** @type {Job} */
  const job = {
    id: jobId,
    tenantId,
    status: 'queued',
    command: command.trim(),
    args,
    confirmFullAccess: Boolean(confirmFullAccess),
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    receipt: null,
    error: null,
  };
  jobs.set(jobId, job);

  auditLog(tenantId, { event: 'job.queued', jobId, command, args, confirmFullAccess,
    ip: req.socket.remoteAddress });

  return jsonResponse(res, 202, {
    ok: true,
    jobId,
    status: 'queued',
    pollUrl: `/v1/codexa/job/${jobId}`,
  });
}

/** GET /v1/codexa/job/:id — poll job status */
function handleJobGet(req, res, tenantId, jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    return jsonResponse(res, 404, { error: 'Job not found.' });
  }
  if (job.tenantId !== tenantId) {
    // Do not reveal cross-tenant job existence
    return jsonResponse(res, 404, { error: 'Job not found.' });
  }
  return jsonResponse(res, 200, {
    ok: true,
    jobId: job.id,
    status: job.status,
    command: job.command,
    args: job.args,
    createdAt: new Date(job.createdAt).toISOString(),
    startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
    completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
    receipt: job.receipt,
    error: job.error,
  });
}

// ── Request router ────────────────────────────────────────────────────────────

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handleRequest(req, res) {
  const url = new URL(req.url ?? '/', `https://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method ?? 'GET';

  // ── Health: no auth ──────────────────────────────────────────────────────
  if (method === 'GET' && pathname === '/v1/codexa/health') {
    return handleHealth(req, res);
  }

  // ── All other routes require auth ────────────────────────────────────────
  const tenantId = await authenticate(req, res);
  if (!tenantId) return; // authenticate() already wrote the error response

  // Rate limit
  if (!checkRate(tenantId)) {
    auditLog(tenantId, { event: 'rate_limit', ip: req.socket.remoteAddress });
    return jsonResponse(res, 429, { error: 'Rate limit exceeded. Max 100 req/min per tenant.' });
  }

  // ── POST /v1/codexa/command ──────────────────────────────────────────────
  if (method === 'POST' && pathname === '/v1/codexa/command') {
    return handleCommand(req, res, tenantId);
  }

  // ── POST /v1/codexa/job ──────────────────────────────────────────────────
  if (method === 'POST' && pathname === '/v1/codexa/job') {
    return handleJobCreate(req, res, tenantId);
  }

  // ── GET /v1/codexa/job/:id ───────────────────────────────────────────────
  const jobMatch = pathname.match(/^\/v1\/codexa\/job\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && jobMatch) {
    return handleJobGet(req, res, tenantId, jobMatch[1]);
  }

  // ── 404 ──────────────────────────────────────────────────────────────────
  return jsonResponse(res, 404, { error: 'Route not found.' });
}

// ── Server bootstrap ──────────────────────────────────────────────────────────

async function main() {
  // Ensure data root exists
  ensureDir(DATA_ROOT);

  let tlsOptions;
  if (TLS_SELFGEN) {
    console.log('[codexa-cloud] Generating self-signed TLS certificate (dev mode)...');
    try {
      const { cert, key } = await generateSelfSignedCert();
      tlsOptions = { cert, key };
      console.log('[codexa-cloud] Self-signed cert generated.');
    } catch (err) {
      console.error('[FATAL] Could not generate self-signed cert:', err.message);
      console.error('Install openssl or set CODEXA_TLS_SELFGEN=false and provide cert/key paths.');
      process.exit(1);
    }
  } else {
    if (!TLS_CERT_PATH || !TLS_KEY_PATH) {
      console.error('[FATAL] CODEXA_TLS_CERT_PATH and CODEXA_TLS_KEY_PATH must be set when CODEXA_TLS_SELFGEN=false.');
      process.exit(1);
    }
    try {
      tlsOptions = {
        cert: fs.readFileSync(TLS_CERT_PATH),
        key: fs.readFileSync(TLS_KEY_PATH),
      };
    } catch (err) {
      console.error('[FATAL] Failed to read TLS cert/key:', err.message);
      process.exit(1);
    }
  }

  const server = https.createServer(tlsOptions, (req, res) => {
    handleRequest(req, res).catch(err => {
      console.error('[codexa-cloud] Unhandled error:', err.message);
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: 'Internal server error.' });
      }
    });
  });

  // Graceful shutdown
  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[codexa-cloud] ${signal} received — shutting down gracefully...`);
    server.close(() => {
      console.log('[codexa-cloud] Server closed. Goodbye.');
      process.exit(0);
    });
    // Force exit after 10s if connections are lingering
    setTimeout(() => {
      console.error('[codexa-cloud] Force exit after 10s timeout.');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, () => {
    console.log(`[codexa-cloud] ORANGEBOX v4 Codexa Cloud listening on port ${PORT} (HTTPS)`);
    console.log(`[codexa-cloud] Data root: ${DATA_ROOT}`);
    console.log(`[codexa-cloud] Auth mode: ${PER_TENANT_AUTH ? 'per-tenant Ed25519' : 'legacy shared bearer'}`);
    if (PER_TENANT_AUTH) {
      console.log(`[codexa-cloud] Tenant tokens stored at: ${DATA_ROOT}/codexa/tenants.json`);
      console.log(`[codexa-cloud] Tenant allowlist: ${allowedTenants.size === 0 ? 'disabled (token alone is sufficient)' : [...allowedTenants].join(', ')}`);
    } else {
      console.log(`[codexa-cloud] Allowed tenants: ${allowedTenants.size === 0 ? 'NONE — set CODEXA_ALLOWED_TENANTS' : [...allowedTenants].join(', ')}`);
    }
    console.log(`[codexa-cloud] Rate limit: ${RATE_LIMIT_RPM} req/min per tenant`);
    console.log(`[codexa-cloud] Command timeout: ${COMMAND_TIMEOUT_MS}ms`);
  });

  server.on('error', (err) => {
    console.error('[FATAL] Server error:', err.message);
    process.exit(1);
  });
}

main();
