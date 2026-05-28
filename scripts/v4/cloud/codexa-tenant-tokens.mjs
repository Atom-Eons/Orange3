/**
 * ORANGEBOX v4 — Per-Tenant Ed25519 Token Manager for Codexa Cloud
 * Disclosure: ATOM-OBX-V4-TENANT-TOKENS-2026-0516
 *
 * Zero npm dependencies. Pure Node.js 18+ ESM.
 * Built-ins used: crypto, fs, path
 *
 * Token format (compact, JWT-like):
 *   <kid>.<payload-b64url>.<signature-b64url>
 *   payload = base64url(JSON.stringify({ tenant_id, iat, exp }))
 *   signature = Ed25519 sign( kid + "." + payload-b64url ) using private key
 *
 * Storage:
 *   <dataRoot>/codexa/tenants.json
 *   Schema: { tenants: [ { tenant_id, public_key_pem, kid, label, issued_at, revoked_at } ] }
 *   Private key is RETURNED ONCE to the caller — NEVER stored on disk.
 *
 * Token TTL: 365 days (configurable via TOKEN_TTL_DAYS env).
 *
 * Exports:
 *   issueTenantToken({ tenantId, label, dataRoot })
 *   revokeTenantToken({ tenantId, dataRoot })
 *   listTenants({ dataRoot })
 *   verifyTenantToken({ token, dataRoot })
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN_TTL_DAYS = parseInt(process.env.TOKEN_TTL_DAYS ?? '365', 10);
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

// ── Storage helpers ───────────────────────────────────────────────────────────

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * @param {string} dataRoot
 * @returns {string}
 */
function tenantsFilePath(dataRoot) {
  return path.join(dataRoot, 'codexa', 'tenants.json');
}

/**
 * @typedef {{
 *   tenant_id: string,
 *   public_key_pem: string,
 *   kid: string,
 *   label: string,
 *   issued_at: string,
 *   revoked_at: string|null,
 * }} TenantRecord
 */

/**
 * @param {string} dataRoot
 * @returns {{ tenants: TenantRecord[] }}
 */
function readStore(dataRoot) {
  const fp = tenantsFilePath(dataRoot);
  try {
    if (!fs.existsSync(fp)) return { tenants: [] };
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.tenants)) return { tenants: [] };
    return { tenants: parsed.tenants };
  } catch (_) {
    return { tenants: [] };
  }
}

/**
 * @param {string} dataRoot
 * @param {{ tenants: TenantRecord[] }} store
 */
function writeStore(dataRoot, store) {
  const fp = tenantsFilePath(dataRoot);
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, JSON.stringify(store, null, 2), 'utf8');
}

// ── Base64url helpers ─────────────────────────────────────────────────────────

/** @param {Buffer|Uint8Array} buf @returns {string} */
function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** @param {string} s @returns {Buffer} */
function b64urlDecode(s) {
  // Restore padding
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(pad), 'base64');
}

// ── Token construction/verification ──────────────────────────────────────────

/**
 * Build the token signing message: kid + "." + payloadB64url
 * @param {string} kid
 * @param {string} payloadB64url
 * @returns {Buffer}
 */
function signingMessage(kid, payloadB64url) {
  return Buffer.from(kid + '.' + payloadB64url, 'utf8');
}

/**
 * Issue a compact token using the given private key.
 * @param {{ kid: string, tenantId: string, privateKeyPem: string }} opts
 * @returns {string} compact token
 */
function buildToken({ kid, tenantId, privateKeyPem }) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + Math.floor(TOKEN_TTL_MS / 1000);
  const payload = { tenant_id: tenantId, iat, exp };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));

  const msg = signingMessage(kid, payloadB64);
  const privKey = crypto.createPrivateKey(privateKeyPem);
  const sigBuf = crypto.sign(null, msg, privKey);
  const sigB64 = b64url(sigBuf);

  return `${kid}.${payloadB64}.${sigB64}`;
}

/**
 * Parse a compact token string into its three parts.
 * Returns null if malformed.
 * @param {string} token
 * @returns {{ kid: string, payloadB64: string, sigB64: string, payload: object }|null}
 */
function parseToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  // kid may contain hyphens/underscores but not dots; we split on first and last dot
  // Format: <kid>.<payloadB64url>.<sigB64url>
  // kid itself can be alphanumeric + hyphens, no dots → safe to split on '.'
  if (parts.length !== 3) return null;
  const [kid, payloadB64, sigB64] = parts;
  if (!kid || !payloadB64 || !sigB64) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch (_) {
    return null;
  }
  return { kid, payloadB64, sigB64, payload };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Issue a new Ed25519 keypair for a tenant. Returns the token and private key (once).
 * Private key is NEVER persisted on disk.
 * @param {{ tenantId: string, label?: string, dataRoot: string }} opts
 * @returns {{ token: string, kid: string, private_key_pem: string, tenant_id: string, expires_at: string }}
 */
export async function issueTenantToken({ tenantId, label, dataRoot }) {
  if (!tenantId || !/^[a-zA-Z0-9_-]{1,64}$/.test(tenantId)) {
    throw new Error('tenant_id must be 1-64 chars, alphanumeric/hyphen/underscore only.');
  }

  const store = readStore(dataRoot);

  // If an active (non-revoked) record exists for this tenant, revoke it first
  const existing = store.tenants.find(t => t.tenant_id === tenantId && !t.revoked_at);
  if (existing) {
    existing.revoked_at = new Date().toISOString();
  }

  // Generate Ed25519 keypair
  const { publicKey, privateKey } = await new Promise((resolve, reject) => {
    crypto.generateKeyPair('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    }, (err, pub, priv) => {
      if (err) reject(err);
      else resolve({ publicKey: pub, privateKey: priv });
    });
  });

  const kid = crypto.randomBytes(12).toString('hex');
  const now = new Date().toISOString();

  /** @type {TenantRecord} */
  const record = {
    tenant_id: tenantId,
    public_key_pem: publicKey,
    kid,
    label: label ?? tenantId,
    issued_at: now,
    revoked_at: null,
  };

  store.tenants.push(record);
  writeStore(dataRoot, store);

  const token = buildToken({ kid, tenantId, privateKeyPem: privateKey });
  const exp = Math.floor(Date.now() / 1000) + Math.floor(TOKEN_TTL_MS / 1000);

  return {
    token,
    kid,
    private_key_pem: privateKey,
    tenant_id: tenantId,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}

/**
 * Revoke a tenant's active token. No-op if already revoked.
 * @param {{ tenantId: string, dataRoot: string }} opts
 * @returns {{ revoked: boolean, tenant_id: string }}
 */
export async function revokeTenantToken({ tenantId, dataRoot }) {
  const store = readStore(dataRoot);
  let revoked = false;
  for (const t of store.tenants) {
    if (t.tenant_id === tenantId && !t.revoked_at) {
      t.revoked_at = new Date().toISOString();
      revoked = true;
    }
  }
  if (revoked) writeStore(dataRoot, store);
  return { revoked, tenant_id: tenantId };
}

/**
 * List all tenants (active and revoked).
 * @param {{ dataRoot: string }} opts
 * @returns {{ tenants: Array<{ tenant_id, kid, label, issued_at, revoked_at, active }> }}
 */
export async function listTenants({ dataRoot }) {
  const store = readStore(dataRoot);
  const tenants = store.tenants.map(t => ({
    tenant_id: t.tenant_id,
    kid: t.kid,
    label: t.label,
    issued_at: t.issued_at,
    revoked_at: t.revoked_at,
    active: !t.revoked_at,
  }));
  return { tenants };
}

/**
 * Verify a compact tenant token.
 * @param {{ token: string, dataRoot: string }} opts
 * @returns {{ ok: boolean, tenant_id?: string, kid?: string, exp?: number, reason?: string }}
 */
export async function verifyTenantToken({ token, dataRoot }) {
  const parsed = parseToken(token);
  if (!parsed) {
    return { ok: false, reason: 'malformed_token' };
  }

  const { kid, payloadB64, sigB64, payload } = parsed;

  // Look up kid in store
  const store = readStore(dataRoot);
  const record = store.tenants.find(t => t.kid === kid);
  if (!record) {
    return { ok: false, reason: 'unknown_kid' };
  }

  // Check revocation
  if (record.revoked_at) {
    return { ok: false, reason: 'revoked', tenant_id: record.tenant_id };
  }

  // Verify expiry
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < nowSec) {
    return { ok: false, reason: 'expired', tenant_id: record.tenant_id };
  }

  // Verify signature
  let sigOk = false;
  try {
    const msg = signingMessage(kid, payloadB64);
    const sigBuf = b64urlDecode(sigB64);
    const pubKey = crypto.createPublicKey(record.public_key_pem);
    sigOk = crypto.verify(null, msg, pubKey, sigBuf);
  } catch (_) {
    return { ok: false, reason: 'signature_error', tenant_id: record.tenant_id };
  }

  if (!sigOk) {
    return { ok: false, reason: 'invalid_signature', tenant_id: record.tenant_id };
  }

  return {
    ok: true,
    tenant_id: record.tenant_id,
    kid,
    exp: payload.exp,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const DEFAULT_DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT
  ?? process.env.CODEXA_DATA_ROOT
  ?? '/data';

function printHelp() {
  console.log(`
codexa-tenant-tokens.mjs — Per-tenant Ed25519 token manager

  --issue --tenant-id=<id> [--label="<label>"]   Issue a new keypair + token
  --revoke --tenant-id=<id>                       Revoke a tenant's token
  --list                                           List all tenants
  --verify --token=<compact-token>                Verify a token
  --data-root=<path>                              Override data root
  --help                                           Show this help

Token format: <kid>.<payload-b64url>.<signature-b64url>
Private key is printed once on issue and NEVER stored on disk.
`.trim());
}

function getArg(args, name) {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    printHelp();
    return;
  }

  let dataRoot = getArg(args, 'data-root') ?? DEFAULT_DATA_ROOT;

  if (args.includes('--issue')) {
    const tenantId = getArg(args, 'tenant-id');
    if (!tenantId) { console.error('[tokens] --tenant-id is required for --issue'); process.exit(1); }
    const label = getArg(args, 'label') ?? tenantId;
    const result = await issueTenantToken({ tenantId, label, dataRoot });
    console.log(JSON.stringify({
      tenant_id: result.tenant_id,
      kid: result.kid,
      token: result.token,
      expires_at: result.expires_at,
      private_key_pem: result.private_key_pem,
    }, null, 2));
    console.log('\n[IMPORTANT] Private key above is shown ONCE and not stored on disk. Save it securely.');
    return;
  }

  if (args.includes('--revoke')) {
    const tenantId = getArg(args, 'tenant-id');
    if (!tenantId) { console.error('[tokens] --tenant-id is required for --revoke'); process.exit(1); }
    const result = await revokeTenantToken({ tenantId, dataRoot });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes('--list')) {
    const result = await listTenants({ dataRoot });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes('--verify')) {
    const token = getArg(args, 'token');
    if (!token) { console.error('[tokens] --token is required for --verify'); process.exit(1); }
    const result = await verifyTenantToken({ token, dataRoot });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error('[tokens] Unknown arguments:', args.join(' '));
  printHelp();
  process.exit(1);
}

// Run CLI only when invoked directly
const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

if (isMain) {
  runCli().catch(err => {
    console.error('[tokens] Fatal:', err.message);
    process.exit(1);
  });
}
