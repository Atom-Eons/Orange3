/**
 * ORANGEBOX v4 — Opt-In Anonymous Telemetry
 * Disclosure: ATOM-OBX-V4-TELEMETRY-2026-0516
 *
 * Zero npm dependencies. Pure Node.js 18+ ESM.
 * Built-ins used: fs, crypto, path, os
 *
 * Doctrine:
 *   - OFF by default. Operator must explicitly enable.
 *   - Local-only in v5.0.x. No network upload. No external endpoints.
 *   - Anonymous: install_id is a random UUID, never tied to identity.
 *   - Props are aggressively filtered: only string/number/bool primitives.
 *   - v5.1 MAY add optional upload with a separate explicit consent gate.
 *
 * Config:    <dataRoot>/telemetry/config.json
 * Events:    <dataRoot>/telemetry/events.jsonl  (NDJSON)
 *
 * Exports:
 *   record({ event, props, dataRoot })
 *   status({ dataRoot })
 *   enable({ dataRoot })
 *   disable({ dataRoot })
 *   summary({ dataRoot, since })
 *   clear({ dataRoot })
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIG_FILENAME = 'config.json';
const EVENTS_FILENAME = 'events.jsonl';

// Props value types that are safe to persist
const SAFE_PROP_TYPES = new Set(['string', 'number', 'boolean']);

// Patterns that look PII-shaped — redact value if key matches
const PII_KEY_PATTERNS = [
  /email/i, /mail/i, /phone/i, /mobile/i, /name/i, /user/i, /login/i,
  /account/i, /password/i, /passwd/i, /secret/i, /token/i, /key/i,
  /auth/i, /credential/i, /address/i, /ip\b/i, /host/i, /domain/i,
  /uuid/i, /id$/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** @param {string} dir */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * @param {string} dataRoot
 * @returns {string} telemetry subdirectory
 */
function telemetryDir(dataRoot) {
  return path.join(dataRoot, 'telemetry');
}

/**
 * @param {string} dataRoot
 * @returns {string}
 */
function configPath(dataRoot) {
  return path.join(telemetryDir(dataRoot), CONFIG_FILENAME);
}

/**
 * @param {string} dataRoot
 * @returns {string}
 */
function eventsPath(dataRoot) {
  return path.join(telemetryDir(dataRoot), EVENTS_FILENAME);
}

/**
 * @param {string} dataRoot
 * @returns {{ enabled: boolean, opted_in_at: string|null, install_id: string|null }}
 */
function readConfig(dataRoot) {
  const cp = configPath(dataRoot);
  try {
    if (!fs.existsSync(cp)) return { enabled: false, opted_in_at: null, install_id: null };
    const raw = fs.readFileSync(cp, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      opted_in_at: parsed.opted_in_at ?? null,
      install_id: parsed.install_id ?? null,
    };
  } catch (_) {
    return { enabled: false, opted_in_at: null, install_id: null };
  }
}

/**
 * @param {string} dataRoot
 * @param {{ enabled: boolean, opted_in_at: string|null, install_id: string|null }} cfg
 */
function writeConfig(dataRoot, cfg) {
  ensureDir(telemetryDir(dataRoot));
  fs.writeFileSync(configPath(dataRoot), JSON.stringify(cfg, null, 2), 'utf8');
}

/**
 * Filter props to safe primitives only. Redact keys that look PII-shaped.
 * @param {object|null|undefined} props
 * @returns {Record<string, string|number|boolean>}
 */
function filterProps(props) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (!SAFE_PROP_TYPES.has(typeof v)) continue;
    // Redact PII-shaped keys
    if (PII_KEY_PATTERNS.some(pat => pat.test(k))) {
      out[k] = '[redacted]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Parse a duration string like "7d", "24h", "60m" into milliseconds.
 * Returns 0 if unparseable (meaning: include all).
 * @param {string|null|undefined} since
 * @returns {number} epoch ms cutoff (entries AFTER this timestamp are included)
 */
function parseSince(since) {
  if (!since) return 0;
  const match = String(since).match(/^(\d+)(d|h|m|s)$/i);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms = { d: 864e5, h: 36e5, m: 6e4, s: 1e3 }[unit] ?? 0;
  return Date.now() - n * ms;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a telemetry event. NO-OP if telemetry is disabled.
 * @param {{ event: string, props?: object, dataRoot: string }} opts
 */
export async function record({ event, props, dataRoot }) {
  if (!dataRoot) return;
  const cfg = readConfig(dataRoot);
  if (!cfg.enabled) return; // silent no-op when disabled

  const filtered = filterProps(props);
  const entry = {
    ts: new Date().toISOString(),
    event: String(event).slice(0, 128),
    props: filtered,
    install_id: cfg.install_id,
  };

  ensureDir(telemetryDir(dataRoot));
  fs.appendFileSync(eventsPath(dataRoot), JSON.stringify(entry) + '\n', 'utf8');
}

/**
 * Return current telemetry config status.
 * @param {{ dataRoot: string }} opts
 * @returns {{ enabled: boolean, opted_in_at: string|null, install_id: string|null, events_path: string }}
 */
export async function status({ dataRoot }) {
  const cfg = readConfig(dataRoot);
  return {
    enabled: cfg.enabled,
    opted_in_at: cfg.opted_in_at,
    install_id: cfg.install_id,
    events_path: eventsPath(dataRoot),
  };
}

/**
 * Enable telemetry. Generates a random install_id (UUID v4) on first opt-in.
 * @param {{ dataRoot: string }} opts
 * @returns {{ enabled: true, install_id: string, opted_in_at: string }}
 */
export async function enable({ dataRoot }) {
  const cfg = readConfig(dataRoot);
  const now = new Date().toISOString();
  const install_id = cfg.install_id ?? crypto.randomUUID();
  const updated = {
    enabled: true,
    opted_in_at: cfg.opted_in_at ?? now,
    install_id,
  };
  writeConfig(dataRoot, updated);
  return { enabled: true, install_id, opted_in_at: updated.opted_in_at };
}

/**
 * Disable telemetry. Retains existing config/events for operator review.
 * @param {{ dataRoot: string }} opts
 * @returns {{ enabled: false }}
 */
export async function disable({ dataRoot }) {
  const cfg = readConfig(dataRoot);
  writeConfig(dataRoot, { ...cfg, enabled: false });
  return { enabled: false };
}

/**
 * Summarize recorded events, optionally filtered by time window.
 * @param {{ dataRoot: string, since?: string }} opts
 * @returns {{ total: number, by_event: Record<string, number>, window: string, earliest: string|null, latest: string|null }}
 */
export async function summary({ dataRoot, since }) {
  const cutoff = parseSince(since);
  const ep = eventsPath(dataRoot);

  if (!fs.existsSync(ep)) {
    return { total: 0, by_event: {}, window: since ?? 'all', earliest: null, latest: null };
  }

  const lines = fs.readFileSync(ep, 'utf8').split('\n').filter(Boolean);
  const by_event = {};
  let total = 0;
  let earliest = null;
  let latest = null;

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch (_) { continue; }
    if (!entry.ts || !entry.event) continue;
    const ts = new Date(entry.ts).getTime();
    if (cutoff && ts < cutoff) continue;
    total++;
    by_event[entry.event] = (by_event[entry.event] ?? 0) + 1;
    if (!earliest || ts < new Date(earliest).getTime()) earliest = entry.ts;
    if (!latest || ts > new Date(latest).getTime()) latest = entry.ts;
  }

  return { total, by_event, window: since ?? 'all', earliest, latest };
}

/**
 * Clear all recorded events. Config (enabled/disabled state) is preserved.
 * @param {{ dataRoot: string }} opts
 * @returns {{ cleared: true, events_path: string }}
 */
export async function clear({ dataRoot }) {
  const ep = eventsPath(dataRoot);
  if (fs.existsSync(ep)) {
    fs.writeFileSync(ep, '', 'utf8');
  }
  return { cleared: true, events_path: ep };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const DEFAULT_DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT
  ?? process.env.CODEXA_DATA_ROOT
  ?? '/data';

function printHelp() {
  console.log(`
telemetry.mjs — OrangeBox opt-in anonymous telemetry

  --status                  Show current telemetry config
  --enable                  Enable telemetry (generates anonymous install_id)
  --disable                 Disable telemetry (data retained, recording stops)
  --summary [--since=<7d|24h|60m>]  Summarize recorded events
  --clear                   Clear all recorded events (config preserved)
  --data-root=<path>        Override data root (default: $ORANGEBOX_DATA_ROOT or /data)
  --help                    Show this help

Doctrine: telemetry is NEVER on by default. Data NEVER leaves the machine in v5.0.x.
`.trim());
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    printHelp();
    return;
  }

  // Parse --data-root=<path>
  let dataRoot = DEFAULT_DATA_ROOT;
  const drArg = args.find(a => a.startsWith('--data-root='));
  if (drArg) dataRoot = drArg.slice('--data-root='.length);

  // Parse --since=<window>
  let since;
  const sinceArg = args.find(a => a.startsWith('--since='));
  if (sinceArg) since = sinceArg.slice('--since='.length);

  if (args.includes('--status')) {
    const result = await status({ dataRoot });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes('--enable')) {
    const result = await enable({ dataRoot });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes('--disable')) {
    const result = await disable({ dataRoot });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes('--summary')) {
    const result = await summary({ dataRoot, since });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.includes('--clear')) {
    const result = await clear({ dataRoot });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error('[telemetry] Unknown arguments:', args.join(' '));
  printHelp();
  process.exit(1);
}

// Run CLI only when invoked directly
const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

if (isMain) {
  runCli().catch(err => {
    console.error('[telemetry] Fatal:', err.message);
    process.exit(1);
  });
}
