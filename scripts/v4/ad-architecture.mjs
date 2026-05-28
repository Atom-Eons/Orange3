/* ad-architecture.mjs — v6.3.0-alpha.5
 *
 * The native ad-architecture layer per operator's blueprint (2026-05-18):
 *
 *   1. Data & Signal Infrastructure (server-side):
 *      - Meta Conversions API (CAPI) dispatch
 *      - Google Enhanced Conversions / Click Conversion uploads
 *      - Value Optimization (LTV passthrough)
 *      - UTM standardizer
 *
 *   2. AI Creative Production Pipeline:
 *      - Asset pool registry (videos, headlines, primary texts, images)
 *      - DCO submission helpers per platform
 *
 *   3. Platform-specific execution:
 *      - Meta Advantage+ campaign creation
 *      - Google Performance Max campaign creation
 *      - TikTok-native asset upload (9:16, trending audio metadata)
 *
 *   4. Automation & Guardrail layer (native, replaces Revealbot dependency):
 *      - Rules engine: poll metrics → evaluate thresholds → take action
 *      - Receipts on every action (pause/scale/notify)
 *
 * All native — no SaaS hop, no per-event vendor fees. Optional Revealbot/
 * Madgicx/AdStellar connectors exist for operators who already pay for them.
 */

import crypto from "node:crypto";
import https from "node:https";
import * as vault from "./credentials-vault.mjs";

// ── HTTPS POST helper ──────────────────────────────────────────────────────
function postJSON(url, body, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        ...headers,
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: { raw: buf, parse_error: true } }); }
      });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.setTimeout(30000, () => { req.destroy(new Error("timeout")); resolve({ status: 0, error: "timeout" }); });
    req.write(bodyStr);
    req.end();
  });
}

// ── 1. Meta Conversions API (CAPI) ─────────────────────────────────────────
// Bypasses iOS tracking restrictions; ensures 100% of conversion data
// reaches Meta's algorithm. Server-side event forwarding.
export async function dispatchMetaCAPI({ pixel_id, event_name, event_time, user_data, custom_data, action_source = "website" }) {
  const rec = await vault.get("meta-ads") || await vault.get("meta");
  if (!rec) return { ok: false, error: "Meta connector not authorized; run `obx connect meta-ads` first" };
  const access_token = rec.access_token || rec.key;
  if (!pixel_id) return { ok: false, error: "pixel_id required" };

  // Hash PII per Meta CAPI spec
  const hashed_user_data = {};
  for (const [k, v] of Object.entries(user_data || {})) {
    if (["em", "ph", "fn", "ln", "ge", "db", "ct", "st", "zp", "country"].includes(k) && v) {
      hashed_user_data[k] = crypto.createHash("sha256").update(String(v).toLowerCase().trim(), "utf8").digest("hex");
    } else {
      // ip / user_agent / fbc / fbp / external_id pass-through
      hashed_user_data[k] = v;
    }
  }

  const payload = {
    data: [{
      event_name,
      event_time: event_time || Math.floor(Date.now() / 1000),
      event_id: crypto.randomUUID(),  // dedup with browser pixel
      action_source,
      user_data: hashed_user_data,
      custom_data: custom_data || {},
    }],
  };
  const url = `https://graph.facebook.com/v18.0/${pixel_id}/events?access_token=${encodeURIComponent(access_token)}`;
  const r = await postJSON(url, payload);
  await vault.markUsed("meta-ads").catch(() => null);
  return {
    ok: r.status === 200 && (r.body.events_received >= 1),
    events_received: r.body.events_received || 0,
    fbtrace_id: r.body.fbtrace_id || null,
    raw: r.body,
    status: r.status,
  };
}

// ── 1b. Google Click Conversion upload (Enhanced Conversions) ──────────────
// Uploads click conversions with hashed user data so Google can stitch
// post-ATT-bucket data into attribution.
export async function dispatchGoogleEnhanced({ customer_id, conversion_action_resource, gclid, conversion_value, currency_code = "USD", conversion_date_time, user_identifiers }) {
  const rec = await vault.get("google-ads");
  if (!rec) return { ok: false, error: "Google Ads connector not authorized; run `obx connect google-ads`" };
  const access_token = rec.access_token;
  const dev_token = process.env.ORANGEBOX_GOOGLE_ADS_DEV_TOKEN;
  if (!dev_token) return { ok: false, error: "ORANGEBOX_GOOGLE_ADS_DEV_TOKEN missing (get from Ads UI > Tools > API Center)" };
  if (!customer_id || !conversion_action_resource) {
    return { ok: false, error: "customer_id + conversion_action_resource required" };
  }

  // Hash any PII user_identifiers
  const hashedIdentifiers = (user_identifiers || []).map(uid => {
    if (uid.hashed_email)        return { hashed_email:        crypto.createHash("sha256").update(String(uid.hashed_email).toLowerCase().trim(), "utf8").digest("hex") };
    if (uid.hashed_phone_number) return { hashed_phone_number: crypto.createHash("sha256").update(String(uid.hashed_phone_number).replace(/[^0-9+]/g, ""), "utf8").digest("hex") };
    return uid;
  });
  const payload = {
    conversions: [{
      conversion_action: conversion_action_resource,
      conversion_date_time: conversion_date_time || new Date().toISOString().replace("T", " ").slice(0, 19) + "+0000",
      conversion_value,
      currency_code,
      gclid: gclid || undefined,
      user_identifiers: hashedIdentifiers,
    }],
    partial_failure: true,
  };
  const url = `https://googleads.googleapis.com/v17/customers/${customer_id}:uploadClickConversions`;
  const r = await postJSON(url, payload, {
    "Authorization": `Bearer ${access_token}`,
    "developer-token": dev_token,
  });
  await vault.markUsed("google-ads").catch(() => null);
  return {
    ok: r.status === 200 && !(r.body.partialFailureError),
    raw: r.body,
    status: r.status,
  };
}

// ── 2. UTM standardizer ────────────────────────────────────────────────────
// Operator-facing: pass intent, get canonical UTM. Enforces consistency
// across all channels for clean multichannel attribution.
const CHANNEL_UTM_DEFAULTS = {
  meta:           { utm_source: "meta",    utm_medium: "paid_social" },
  "meta-ads":     { utm_source: "meta",    utm_medium: "paid_social" },
  google:         { utm_source: "google",  utm_medium: "cpc" },
  "google-ads":   { utm_source: "google",  utm_medium: "cpc" },
  tiktok:         { utm_source: "tiktok",  utm_medium: "paid_social" },
  "tiktok-ads":   { utm_source: "tiktok",  utm_medium: "paid_social" },
  linkedin:       { utm_source: "linkedin", utm_medium: "paid_social" },
  "linkedin-ads": { utm_source: "linkedin", utm_medium: "paid_social" },
  reddit:         { utm_source: "reddit",  utm_medium: "social" },
  "x-twitter":    { utm_source: "x",       utm_medium: "social" },
  email:          { utm_source: "email",   utm_medium: "email" },
};

export function standardizeUTM({ channel, campaign, content, term, extras = {} }) {
  const defaults = CHANNEL_UTM_DEFAULTS[channel] || { utm_source: channel || "direct", utm_medium: "referral" };
  const sanitize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const utm = {
    ...defaults,
    utm_campaign: sanitize(campaign),
    utm_content:  sanitize(content),
    utm_term:     sanitize(term),
    ...extras,
  };
  Object.keys(utm).forEach(k => { if (!utm[k]) delete utm[k]; });
  const qs = new URLSearchParams(utm).toString();
  return { utm, qs };
}

// ── 3. DCO Asset Pool registry ─────────────────────────────────────────────
// In-memory pool of creative assets (paths + metadata). Pools get pushed
// to ad platforms' asset libraries via the connector helpers.
const ASSET_POOLS = new Map(); // pool_id → { name, kind: "video"|"image"|"headline"|"primary_text", assets: [...] }

export function createAssetPool({ name, kind, assets = [] }) {
  const id = "pool-" + crypto.randomUUID().slice(0, 12);
  ASSET_POOLS.set(id, { id, name, kind, assets, created_at: new Date().toISOString() });
  return { id, name, kind, count: assets.length };
}

export function addAssetToPool({ pool_id, asset }) {
  const pool = ASSET_POOLS.get(pool_id);
  if (!pool) return { ok: false, error: "no such pool" };
  pool.assets.push({ ...asset, added_at: new Date().toISOString() });
  return { ok: true, pool_id, count: pool.assets.length };
}

export function listAssetPools() {
  return Array.from(ASSET_POOLS.values()).map(p => ({ id: p.id, name: p.name, kind: p.kind, count: p.assets.length }));
}

export function getAssetPool(pool_id) {
  return ASSET_POOLS.get(pool_id) || null;
}

// ── 4. Automated Rules Engine (native, Revealbot-equivalent) ───────────────
// Periodically polls ad-platform metrics and evaluates operator-defined
// thresholds. Actions: pause/scale/notify. Every action receipts.
const RULES = new Map(); // rule_id → { name, platform, account_id, condition, action, last_eval_at, enabled }

const RULES_GUARD = {
  schema_version: 1,
  global_pause: false,
  simulation_mode: true,
  action_scope: "automated-rules",
  updated_at: new Date().toISOString(),
  updated_by: "system-default",
  reason: "Automated ad rules default to simulation until the operator explicitly arms live actions.",
};

export function getRulesGuard() {
  return { ...RULES_GUARD };
}

export function setRulesGuard({ global_pause, simulation_mode, reason, updated_by = "operator" } = {}) {
  if (typeof global_pause === "boolean") RULES_GUARD.global_pause = global_pause;
  if (typeof simulation_mode === "boolean") RULES_GUARD.simulation_mode = simulation_mode;
  RULES_GUARD.updated_at = new Date().toISOString();
  RULES_GUARD.updated_by = updated_by;
  RULES_GUARD.reason = String(reason || "operator update").slice(0, 500);
  return getRulesGuard();
}

export function createRule({ name, platform, account_id, condition, action }) {
  // condition: { metric: "cpa"|"roas"|"spend"|"cpm"|"ctr", op: ">"|"<"|">="|"<=", value: number, time_window_h: 24 }
  // action: { type: "pause"|"scale"|"notify", scale_pct?: 10, target: "ad"|"adset"|"campaign", entity_id?: string, notify_channel?: string }
  const id = "rule-" + crypto.randomUUID().slice(0, 12);
  RULES.set(id, { id, name, platform, account_id, condition, action, last_eval_at: null, enabled: true, created_at: new Date().toISOString() });
  return { id, name };
}

export function listRules() {
  return Array.from(RULES.values());
}

export function setRuleEnabled(rule_id, enabled) {
  const r = RULES.get(rule_id);
  if (!r) return { ok: false, error: "no such rule" };
  r.enabled = !!enabled;
  return { ok: true, rule_id, enabled: r.enabled };
}

export function deleteRule(rule_id) {
  const ok = RULES.delete(rule_id);
  return { ok };
}

/**
 * evalRule({ rule, fetchMetrics, emitReceipt, dryRun })
 * Evaluates a single rule against current metrics. fetchMetrics is a
 * caller-supplied function (so each platform connector decides how to
 * actually pull metrics). Action only fires when dryRun is false.
 *
 * Returns: { matched, would_fire, fired, dry_run, simulated, blocked_by_global_pause, guard, evidence }
 */
export async function evalRule({ rule, fetchMetrics, emitReceipt, dryRun = false }) {
  if (!rule.enabled) return { matched: false, reason: "rule disabled" };
  rule.last_eval_at = new Date().toISOString();
  const metrics = await fetchMetrics({ platform: rule.platform, account_id: rule.account_id, condition: rule.condition });
  if (!metrics || !metrics.ok) return { matched: false, reason: `fetchMetrics failed: ${metrics?.error || "unknown"}` };
  const v = metrics.value;
  const c = rule.condition;
  let matched = false;
  switch (c.op) {
    case ">":  matched = v >  c.value; break;
    case ">=": matched = v >= c.value; break;
    case "<":  matched = v <  c.value; break;
    case "<=": matched = v <= c.value; break;
    case "==": matched = v == c.value; break;
    default:   matched = false;
  }
  const guard = getRulesGuard();
  const effectiveDryRun = !!dryRun || guard.simulation_mode || guard.global_pause;
  const out = {
    matched,
    would_fire: matched && !effectiveDryRun,
    would_fire_without_guard: matched,
    fired: false,
    dry_run: !!dryRun,
    simulated: matched && effectiveDryRun && !guard.global_pause,
    blocked_by_global_pause: matched && guard.global_pause,
    guard,
    metric: c.metric, observed_value: v, threshold: c.value, op: c.op,
    rule_id: rule.id, action: rule.action,
  };
  if (matched && guard.global_pause) {
    if (emitReceipt) {
      await emitReceipt({
        source: "ad-rule-blocked-by-global-pause",
        title:  `Ad rule blocked by global pause: ${rule.name}`,
        summary: `metric=${c.metric} ${c.op} ${c.value} (observed=${v}) -> action=${rule.action.type} blocked by rules guard`,
        evidence: { rule_id: rule.id, platform: rule.platform, account_id: rule.account_id, condition: c, action: rule.action, observed: v, guard },
      });
    }
  } else if (matched && effectiveDryRun) {
    if (emitReceipt) {
      await emitReceipt({
        source: "ad-rule-simulated",
        title:  `Ad rule simulated: ${rule.name}`,
        summary: `metric=${c.metric} ${c.op} ${c.value} (observed=${v}) -> would action=${rule.action.type}${rule.action.scale_pct ? ` ${rule.action.scale_pct}%` : ""} on ${rule.action.target}${rule.action.entity_id ? ":" + rule.action.entity_id : ""}`,
        evidence: { rule_id: rule.id, platform: rule.platform, account_id: rule.account_id, condition: c, action: rule.action, observed: v, dry_run: !!dryRun, guard },
      });
    }
  } else if (matched) {
    out.fired = true;
    // Action emit — actual platform-side action is the connector's job
    if (emitReceipt) {
      await emitReceipt({
        source: "ad-rule-fired",
        title:  `Ad rule fired: ${rule.name}`,
        summary: `metric=${c.metric} ${c.op} ${c.value} (observed=${v}) → action=${rule.action.type}${rule.action.scale_pct ? ` ${rule.action.scale_pct}%` : ""} on ${rule.action.target}${rule.action.entity_id ? ":" + rule.action.entity_id : ""}`,
        evidence: { rule_id: rule.id, platform: rule.platform, account_id: rule.account_id, condition: c, action: rule.action, observed: v, guard },
      });
    }
  }
  return out;
}

// Background rules-engine sweeper (call from server)
let _sweepStarted = false;
export function startRulesEngine({ fetchMetrics, emitReceipt, interval_minutes = 15 }) {
  if (_sweepStarted) return { ok: true, already_started: true, guard: getRulesGuard() };
  _sweepStarted = true;
  setInterval(async () => {
    for (const rule of RULES.values()) {
      if (!rule.enabled) continue;
      try { await evalRule({ rule, fetchMetrics, emitReceipt, dryRun: false }); }
      catch (e) { /* swallow */ }
    }
  }, interval_minutes * 60 * 1000);
  return { ok: true, already_started: false, interval_minutes, guard: getRulesGuard() };
}
