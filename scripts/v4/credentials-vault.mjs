/* credentials-vault.mjs — v6.3.0-alpha.5 Connector Fabric foundation.
 *
 * AES-256-GCM encrypted credential store. ONE file at
 * <dataRoot>/credentials.enc — holds API keys, OAuth tokens, refresh
 * tokens, and connection metadata for every service the operator has
 * connected. Master key resolution order:
 *
 *   1. OS keyring (Windows Credential Manager / macOS Keychain / Linux
 *      Secret Service via keytar-style API IF the optional dependency
 *      is present). If not, we fall through.
 *   2. Env var ORANGEBOX_VAULT_KEY (operator-supplied passphrase).
 *   3. Auto-generated key written to <dataRoot>/.vault.key with 0600
 *      perms. This is the convenience path for solo operators on
 *      single-machine setups — convenient but the key file is on disk.
 *
 * Operator never touches the master key. Pasting an API key once OR
 * authorizing OAuth once → credentials persist forever. Refresh tokens
 * are rotated by oauth-handler.mjs in the background; this module just
 * stores and retrieves.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";

const KEY_LEN = 32;          // AES-256
const IV_LEN  = 12;          // GCM
const TAG_LEN = 16;
const FILE_MAGIC = "OBX-VAULT-v1\n";

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}
function vaultPath()    { return path.join(dataRoot(), "credentials.enc"); }
function localKeyPath() { return path.join(dataRoot(), ".vault.key"); }

async function fileInfo(file) {
  try {
    const stat = await fs.stat(file);
    return {
      path: file,
      exists: true,
      bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
    };
  } catch {
    return {
      path: file,
      exists: false,
      bytes: 0,
      modified_at: null,
    };
  }
}

// ── Master key resolution ──────────────────────────────────────────────────
async function resolveMasterKey({ allowCreate = true } = {}) {
  // 1) OS keyring (optional). We TRY to require `keytar` — if it's not
  //    installed we fall through silently. Solo operators on single-machine
  //    setups don't need it; multi-machine teams should install it.
  try {
    const keytar = await import("keytar").then(m => m.default || m).catch(() => null);
    if (keytar) {
      const existing = await keytar.getPassword("orangebox", "vault-master-key").catch(() => null);
      if (existing) {
        return { key: Buffer.from(existing, "hex"), source: "os-keyring", created: false };
      }
      if (!allowCreate) {
        // Keep probing env/local key sources before declaring recovery blocked.
      } else {
        const fresh = crypto.randomBytes(KEY_LEN);
        await keytar.setPassword("orangebox", "vault-master-key", fresh.toString("hex"));
        return { key: fresh, source: "os-keyring", created: true };
      }
    }
  } catch { /* fall through */ }

  // 2) Env var
  if (process.env.ORANGEBOX_VAULT_KEY) {
    // Derive a 32-byte key from the passphrase via PBKDF2
    const salt = Buffer.from("orangebox-vault-v1-salt", "utf8");
    return {
      key: crypto.pbkdf2Sync(process.env.ORANGEBOX_VAULT_KEY, salt, 200_000, KEY_LEN, "sha256"),
      source: "env:ORANGEBOX_VAULT_KEY",
      created: false,
    };
  }

  // 3) Auto-generated key file (convenience for solo operators)
  if (fsSync.existsSync(localKeyPath())) {
    const buf = await fs.readFile(localKeyPath());
    if (buf.length === KEY_LEN) {
      return { key: buf, source: "local-key-file", created: false };
    }
    if (!allowCreate) return null;
  }
  if (!allowCreate) return null;
  await fs.mkdir(dataRoot(), { recursive: true });
  const fresh = crypto.randomBytes(KEY_LEN);
  await fs.writeFile(localKeyPath(), fresh, { mode: 0o600 });
  return { key: fresh, source: "local-key-file", created: true };
}

async function getMasterKey() {
  const resolved = await resolveMasterKey({ allowCreate: true });
  return resolved.key;
}

// ── Encrypt / decrypt blob ─────────────────────────────────────────────────
async function encryptBlob(plaintextJson) {
  const key = await getMasterKey();
  const iv  = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintextJson, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: magic | iv | tag | ciphertext (base64)
  return FILE_MAGIC + Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptBlobWithKey(stored, key) {
  if (!stored.startsWith(FILE_MAGIC)) throw new Error("vault file magic mismatch");
  const buf = Buffer.from(stored.slice(FILE_MAGIC.length), "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error("vault file truncated");
  const iv  = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return plain.toString("utf8");
}

async function decryptBlob(stored) {
  const key = await getMasterKey();
  return decryptBlobWithKey(stored, key);
}

function summarizeServices(vault) {
  const out = [];
  for (const [name, rec] of Object.entries(vault.services || {})) {
    const expired = rec.expires_at ? new Date(rec.expires_at).getTime() < Date.now() : false;
    out.push({
      service: name,
      auth_type: rec.auth_type,
      scope: rec.scope || null,
      granted_at: rec.granted_at || null,
      last_used_at: rec.last_used_at || null,
      expires_at: rec.expires_at || null,
      expired,
      has_refresh_token: !!rec.refresh_token,
    });
  }
  out.sort((a, b) => a.service.localeCompare(b.service));
  return out;
}

async function corruptBackups() {
  try {
    const entries = await fs.readdir(dataRoot(), { withFileTypes: true });
    const backups = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith("credentials.enc.corrupt-")) continue;
      backups.push(await fileInfo(path.join(dataRoot(), entry.name)));
    }
    backups.sort((a, b) => String(b.modified_at).localeCompare(String(a.modified_at)));
    return backups;
  } catch {
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
/**
 * Vault shape:
 *   {
 *     version: 1,
 *     services: {
 *       "reddit":   { auth_type: "oauth2",  access_token, refresh_token, expires_at, scope, granted_at, last_used_at, extra: {} },
 *       "openai":   { auth_type: "apikey", key, granted_at, last_used_at, extra: {} },
 *       "stripe":   { auth_type: "apikey", key, ... },
 *       ...
 *     }
 *   }
 */
let _cache = null;          // hot in-memory copy; cleared on disconnect
let _cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

export async function loadVault({ forceReload = false } = {}) {
  if (!forceReload && _cache && Date.now() - _cacheLoadedAt < CACHE_TTL_MS) return _cache;
  await fs.mkdir(dataRoot(), { recursive: true });
  if (!fsSync.existsSync(vaultPath())) {
    _cache = { version: 1, services: {} };
    _cacheLoadedAt = Date.now();
    return _cache;
  }
  try {
    const stored = await fs.readFile(vaultPath(), "utf8");
    const plain = await decryptBlob(stored);
    _cache = JSON.parse(plain);
    if (!_cache.services) _cache.services = {};
    _cacheLoadedAt = Date.now();
    return _cache;
  } catch (e) {
    // Corrupt / wrong key — back up + start fresh (operator gets a receipt)
    const bk = vaultPath() + ".corrupt-" + Date.now();
    await fs.rename(vaultPath(), bk).catch(() => null);
    _cache = { version: 1, services: {}, _last_corruption_backup: bk, _last_corruption_error: e.message };
    _cacheLoadedAt = Date.now();
    return _cache;
  }
}

export async function saveVault(vault) {
  vault.version = 1;
  vault.last_saved_at = new Date().toISOString();
  const blob = await encryptBlob(JSON.stringify(vault, null, 2));
  await fs.mkdir(dataRoot(), { recursive: true });
  await fs.writeFile(vaultPath(), blob, { mode: 0o600 });
  _cache = vault;
  _cacheLoadedAt = Date.now();
  return { ok: true, saved_to: vaultPath() };
}

export async function setApiKey(service, key, extra = {}) {
  if (!service || !key) throw new Error("service + key required");
  const v = await loadVault();
  v.services[service] = {
    auth_type: "apikey",
    key,
    granted_at: new Date().toISOString(),
    last_used_at: null,
    extra,
  };
  await saveVault(v);
  return { ok: true, service };
}

export async function setOAuthTokens(service, { access_token, refresh_token, expires_in, scope, extra = {} }) {
  if (!service || !access_token) throw new Error("service + access_token required");
  const v = await loadVault();
  const expires_at = expires_in
    ? new Date(Date.now() + (expires_in - 60) * 1000).toISOString()  // 60s safety
    : null;
  v.services[service] = {
    auth_type: "oauth2",
    access_token,
    refresh_token: refresh_token || v.services[service]?.refresh_token || null,
    expires_at,
    scope: scope || null,
    granted_at: new Date().toISOString(),
    last_used_at: null,
    extra,
  };
  await saveVault(v);
  return { ok: true, service, expires_at };
}

export async function get(service) {
  const v = await loadVault();
  return v.services[service] || null;
}

export async function markUsed(service) {
  const v = await loadVault();
  if (v.services[service]) {
    v.services[service].last_used_at = new Date().toISOString();
    await saveVault(v);
  }
}

export async function disconnect(service) {
  const v = await loadVault();
  delete v.services[service];
  await saveVault(v);
  return { ok: true, service };
}

export async function listConnected() {
  const v = await loadVault();
  // Never return secret material in the list — only metadata
  const out = [];
  for (const [name, rec] of Object.entries(v.services)) {
    const expired = rec.expires_at ? new Date(rec.expires_at).getTime() < Date.now() : false;
    out.push({
      service: name,
      auth_type: rec.auth_type,
      scope: rec.scope || null,
      granted_at: rec.granted_at,
      last_used_at: rec.last_used_at,
      expires_at: rec.expires_at || null,
      expired,
      has_refresh_token: !!rec.refresh_token,
    });
  }
  return out;
}

export async function recoveryDiagnostics() {
  const paths = {
    data_root: dataRoot(),
    vault_path: vaultPath(),
    local_key_path: localKeyPath(),
  };
  const vaultFile = await fileInfo(vaultPath());
  const localKeyFile = await fileInfo(localKeyPath());
  const backups = await corruptBackups();
  const resolved = await resolveMasterKey({ allowCreate: false });

  const base = {
    ok: true,
    status: "empty",
    mutates_vault: false,
    returns_secret_material: false,
    paths,
    files: {
      vault: vaultFile,
      local_key: localKeyFile,
      corrupt_backups: backups,
    },
    key_source: resolved?.source || "none",
    key_available: !!resolved,
    service_count: 0,
    services: [],
    recommended_actions: [],
  };

  if (!vaultFile.exists) {
    base.recommended_actions.push("No encrypted credential vault exists yet. Connect services normally when needed.");
    return base;
  }

  if (!resolved) {
    base.ok = false;
    base.status = "key_missing";
    base.recommended_actions.push("Restore the original OS keyring entry, ORANGEBOX_VAULT_KEY value, or local .vault.key used when the vault was created.");
    base.recommended_actions.push("If the key is permanently lost, reconnect services through the connector setup flow; old encrypted credentials cannot be decrypted.");
    return base;
  }

  try {
    const stored = await fs.readFile(vaultPath(), "utf8");
    const parsed = JSON.parse(decryptBlobWithKey(stored, resolved.key));
    const services = summarizeServices(parsed);
    base.status = "ok";
    base.service_count = services.length;
    base.services = services;
    base.recommended_actions.push(services.length
      ? "Vault decrypts cleanly. Keep the key source backed up and rotate/reconnect any expired OAuth services."
      : "Vault decrypts cleanly but has no connected services.");
    return base;
  } catch (e) {
    base.ok = false;
    base.status = "recovery_required";
    base.decrypt_error = e.message;
    base.recommended_actions.push("Do not delete credentials.enc. Restore the key source that originally encrypted it, then re-run vault recovery diagnostics.");
    base.recommended_actions.push("If the key is gone, move the broken vault aside only after copying it elsewhere, then reconnect services.");
    return base;
  }
}

// Apply Bearer-style auth headers to a fetch options object
export async function authHeaders(service) {
  const rec = await get(service);
  if (!rec) return null;
  if (rec.auth_type === "apikey") {
    return { Authorization: `Bearer ${rec.key}` };
  }
  if (rec.auth_type === "oauth2") {
    return { Authorization: `Bearer ${rec.access_token}` };
  }
  return null;
}
