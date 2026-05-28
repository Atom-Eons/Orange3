/**
 * files-api-sync.mjs
 *
 * Doctrine ID : ATOM-OBX-V4-FILES-API-2026-0516
 * Source spec : V4_ALPHA_FROM_ANTHROPIC_DOCS.md §7
 * Beta header : files-api-2025-04-14
 * Purpose     : Upload vault docs ONCE to Anthropic Files API → persist file_id
 *               mapping → reference in future Messages calls instead of inlining
 *               full text. Massive token savings on big vaults (50 MB+ lattice).
 *
 * Author  : builder (Claude Sonnet 4.6, sub-agent write authority)
 * Project : ORANGEBOX v4 — AtomEons Systems Laboratory
 *
 * Zero npm deps. ESM only. Node 18+ built-in fetch.
 * Mom's Law: every line earns its place.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, readdir, stat, writeFile, rm } from 'node:fs/promises';
import { basename, join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION  = '2023-06-01';
const FILES_API_BETA     = 'files-api-2025-04-14';
const CHUNK_SIZE         = 10 * 1024 * 1024; // 10 MB read-stream chunk threshold
const MAX_IN_MEMORY      = 100 * 1024 * 1024; // 100 MB — do NOT load more than this

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Derive MIME type from file extension.
 * Files API accepts application/octet-stream as fallback.
 */
function mimeFor(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    md:   'text/markdown',
    txt:  'text/plain',
    json: 'application/json',
    jsonl:'application/x-ndjson',
    pdf:  'application/pdf',
    html: 'text/html',
    csv:  'text/csv',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * Compute SHA-256 hex digest of a file without loading the whole thing into
 * memory. Safe for files up to the filesystem limit.
 */
async function sha256File(filePath) {
  return new Promise((res, rej) => {
    const hash   = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end',  ()      => res(hash.digest('hex')));
    stream.on('error', rej);
  });
}

/**
 * Build a multipart/form-data body for the Files API upload.
 *
 * Spec (from §7):
 *   --{boundary}\r\n
 *   Content-Disposition: form-data; name="file"; filename="{name}"\r\n
 *   Content-Type: {mime}\r\n
 *   \r\n
 *   {file bytes}\r\n
 *   --{boundary}--\r\n
 *
 * Files >MAX_IN_MEMORY are rejected before reaching here (see caller guard).
 */
async function buildMultipart(filePath, mime) {
  const boundary = `----OBXBoundary${Math.random().toString(36).slice(2)}`;
  const name     = basename(filePath);

  const fileBytes = await readFile(filePath);

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${name}"\r\n` +
    `Content-Type: ${mime}\r\n` +
    `\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  const body = Buffer.concat([header, fileBytes, footer]);
  return { boundary, body };
}

/**
 * Shared fetch wrapper with structured error capture.
 * Never throws on 4xx/5xx — returns { ok, status, data, error }.
 */
async function apiFetch(url, opts) {
  let response;
  try {
    response = await fetch(url, opts);
  } catch (networkErr) {
    return { ok: false, status: 0, data: null, error: String(networkErr) };
  }
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }
  return {
    ok:     response.ok,
    status: response.status,
    data,
    error: response.ok ? null : (data?.error?.message ?? `HTTP ${response.status}`),
  };
}

/**
 * Load the file_id mapping from disk.  Returns {} if the file does not exist.
 */
async function loadMapping(dataRoot) {
  const indexPath = join(dataRoot, 'files-api', 'index.json');
  if (!existsSync(indexPath)) return {};
  try {
    const raw = await readFile(indexPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Persist the mapping to disk, creating parent dirs as needed.
 */
async function saveMapping(dataRoot, mapping) {
  const dir       = join(dataRoot, 'files-api');
  const indexPath = join(dir, 'index.json');
  mkdirSync(dir, { recursive: true });
  await writeFile(indexPath, JSON.stringify(mapping, null, 2), 'utf8');
}

/**
 * Write a receipt to <dataRoot>/receipts/files-api/<name>.json.
 */
async function writeReceipt(dataRoot, name, payload) {
  const dir = join(dataRoot, 'receipts', 'files-api');
  mkdirSync(dir, { recursive: true });
  await writeFile(join(dir, name), JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * Discover candidate docs.
 * Priority 1: <dataRoot>/memory/orangebox-knowledge-v2/lattice.jsonl
 * Priority 2: <dataRoot>/vault/*.md
 * Returns array of absolute paths.
 */
async function discoverDocs(dataRoot) {
  const lattice = join(dataRoot, 'memory', 'orangebox-knowledge-v2', 'lattice.jsonl');
  if (existsSync(lattice)) return [lattice];

  const vaultDir = join(dataRoot, 'vault');
  if (!existsSync(vaultDir)) return [];

  const entries = await readdir(vaultDir);
  return entries
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(vaultDir, f));
}

/**
 * Compute relative path used as the mapping key.
 */
function mapKey(dataRoot, absPath) {
  return relative(dataRoot, absPath).replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walk vault docs, upload any that are new or whose SHA-256 changed.
 *
 * @param {object} opts
 * @param {string}  opts.dataRoot      - Absolute path to the ORANGEBOX data root
 * @param {string}  opts.anthropicKey  - Anthropic API key (sk-ant-…)
 * @param {boolean} [opts.dryRun=false] - Read docs, log plan, skip API calls
 * @returns {Promise<{uploaded: number, skipped: number, total: number, mapping: object}>}
 */
export async function syncVaultToFilesApi({ dataRoot, anthropicKey, dryRun = false }) {
  const ts      = new Date().toISOString().replace(/[:.]/g, '-');
  const docs    = await discoverDocs(dataRoot);
  const mapping = await loadMapping(dataRoot);

  let uploaded = 0;
  let skipped  = 0;
  const errors = [];

  for (const absPath of docs) {
    const key  = mapKey(dataRoot, absPath);
    const info = await stat(absPath);

    if (info.size > MAX_IN_MEMORY) {
      console.warn(`[files-api-sync] SKIP (>100 MB): ${key}`);
      skipped++;
      continue;
    }

    const sha = await sha256File(absPath);
    const existing = mapping[key];

    if (existing && existing.sha256 === sha) {
      console.log(`[files-api-sync] skip (unchanged): ${key}`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[files-api-sync] dry-run would upload: ${key}  (${info.size} bytes, sha256=${sha})`);
      uploaded++;
      continue;
    }

    const mime              = mimeFor(basename(absPath));
    const { boundary, body } = await buildMultipart(absPath, mime);

    console.log(`[files-api-sync] uploading: ${key}  (${info.size} bytes)`);

    const result = await apiFetch(`${ANTHROPIC_API_BASE}/v1/files`, {
      method:  'POST',
      headers: {
        'x-api-key':        anthropicKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta':   FILES_API_BETA,
        'content-type':     `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!result.ok) {
      const errMsg = `[files-api-sync] ERROR uploading ${key}: ${result.status} ${result.error}`;
      console.error(errMsg);
      errors.push({ key, status: result.status, error: result.error });
      continue;
    }

    const fileId = result.data?.id;
    if (!fileId) {
      const errMsg = `[files-api-sync] ERROR: no id in response for ${key}`;
      console.error(errMsg);
      errors.push({ key, status: result.status, error: 'missing id in response' });
      continue;
    }

    mapping[key] = {
      file_id:     fileId,
      sha256:      sha,
      uploaded_at: new Date().toISOString(),
      bytes:       info.size,
      mime_type:   mime,
    };
    uploaded++;
    console.log(`[files-api-sync] uploaded: ${key} → ${fileId}`);
  }

  if (!dryRun) {
    await saveMapping(dataRoot, mapping);
  }

  const receipt = {
    ts,
    dry_run:  dryRun,
    uploaded,
    skipped,
    total:    docs.length,
    errors,
    mapping:  dryRun ? '(dry-run — not written)' : mapping,
  };
  await writeReceipt(dataRoot, `sync-${ts}.json`, receipt);

  return { uploaded, skipped, total: docs.length, mapping };
}

/**
 * Look up the file_id for a vault-relative path.
 *
 * @param {object} opts
 * @param {string} opts.vaultPath  - Relative path as stored in the mapping (e.g. "vault/foo.md")
 * @param {string} opts.dataRoot
 * @returns {Promise<string|null>}
 */
export async function getFileIdFor({ vaultPath, dataRoot }) {
  const mapping = await loadMapping(dataRoot);
  return mapping[vaultPath]?.file_id ?? null;
}

/**
 * Delete a file from the Anthropic Files API and remove it from the local mapping.
 *
 * @param {object} opts
 * @param {string} opts.name          - Vault-relative path (mapping key)
 * @param {string} opts.dataRoot
 * @param {string} opts.anthropicKey
 */
export async function deleteFromFilesApi({ name, dataRoot, anthropicKey }) {
  const mapping = await loadMapping(dataRoot);
  const entry   = mapping[name];

  if (!entry) {
    console.warn(`[files-api-sync] delete: no mapping entry for "${name}"`);
    return;
  }

  const { file_id } = entry;
  console.log(`[files-api-sync] deleting: ${name} (${file_id})`);

  const result = await apiFetch(`${ANTHROPIC_API_BASE}/v1/files/${file_id}`, {
    method:  'DELETE',
    headers: {
      'x-api-key':        anthropicKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta':   FILES_API_BETA,
    },
  });

  if (!result.ok) {
    console.error(`[files-api-sync] DELETE error: ${result.status} ${result.error}`);
  } else {
    console.log(`[files-api-sync] deleted from API: ${file_id}`);
    delete mapping[name];
    await saveMapping(dataRoot, mapping);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await writeReceipt(dataRoot, `delete-${ts}.json`, {
    ts,
    name,
    file_id,
    ok:     result.ok,
    status: result.status,
    error:  result.error,
  });
}

/**
 * Return the entire mapping object (no API call).
 *
 * @param {object} opts
 * @param {string} opts.dataRoot
 * @returns {Promise<object>}
 */
export async function listFilesApiMapping({ dataRoot }) {
  return loadMapping(dataRoot);
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
files-api-sync.mjs — ORANGEBOX v4 Anthropic Files API sync tool
Doctrine ID: ATOM-OBX-V4-FILES-API-2026-0516

Usage:
  node files-api-sync.mjs --sync              Upload new/changed vault docs
  node files-api-sync.mjs --sync --dry-run    Preview uploads without firing API
  node files-api-sync.mjs --list              Print current file_id mapping as JSON
  node files-api-sync.mjs --delete <path>     Delete a file from API + mapping
  node files-api-sync.mjs --help              Show this message

Environment:
  ANTHROPIC_API_KEY   Required for --sync and --delete (sk-ant-…)
  OBX_DATA_ROOT       Override data root (default: CWD/data)

Examples:
  ANTHROPIC_API_KEY=sk-ant-... node files-api-sync.mjs --sync
  node files-api-sync.mjs --sync --dry-run
  node files-api-sync.mjs --list
  node files-api-sync.mjs --delete vault/old-doc.md
`);
}

async function main() {
  const args     = process.argv.slice(2);
  const dataRoot = process.env.OBX_DATA_ROOT
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');

  if (args.includes('--help') || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--list')) {
    const mapping = await listFilesApiMapping({ dataRoot });
    console.log(JSON.stringify(mapping, null, 2));
    process.exit(0);
  }

  if (args.includes('--delete')) {
    const idx  = args.indexOf('--delete');
    const name = args[idx + 1];
    if (!name) {
      console.error('[files-api-sync] --delete requires a relative path argument');
      process.exit(1);
    }
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      console.error('[files-api-sync] ANTHROPIC_API_KEY is not set');
      process.exit(1);
    }
    await deleteFromFilesApi({ name, dataRoot, anthropicKey: key });
    process.exit(0);
  }

  if (args.includes('--sync')) {
    const dryRun = args.includes('--dry-run');
    const key    = process.env.ANTHROPIC_API_KEY;
    if (!dryRun && !key) {
      console.error('[files-api-sync] ANTHROPIC_API_KEY is not set (required for --sync without --dry-run)');
      process.exit(1);
    }
    const result = await syncVaultToFilesApi({
      dataRoot,
      anthropicKey: key ?? '',
      dryRun,
    });
    console.log(`\n[files-api-sync] done — uploaded=${result.uploaded} skipped=${result.skipped} total=${result.total}`);
    process.exit(0);
  }

  console.error('[files-api-sync] unknown arguments. Run --help for usage.');
  process.exit(1);
}

// Run CLI only when invoked directly (not imported as a module).
const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error('[files-api-sync] fatal:', err);
    process.exit(1);
  });
}
