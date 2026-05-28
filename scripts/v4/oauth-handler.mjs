/* oauth-handler.mjs — v6.3.0-alpha.5 generic OAuth 2.0 code flow.
 *
 * Browser opens to the provider's authorize URL. Operator clicks "allow".
 * Provider redirects to http://127.0.0.1:8788/oauth/<service>/callback?code=XYZ.
 * The orangebox-command-server's tunnel listener handles the callback, hands
 * the code here, we exchange code → access_token + refresh_token, and store
 * via credentials-vault.
 *
 * Refresh token rotation runs in the background (every 6 minutes a sweep
 * checks expiring tokens and refreshes silently).
 *
 * PKCE supported for providers that require it (TikTok, some Twitter, etc.).
 */
import crypto from "node:crypto";
import https from "node:https";
import { spawn } from "node:child_process";
import * as vault from "./credentials-vault.mjs";
import { getServiceConfig } from "./connectors-registry.mjs";

// ── In-memory state per active flow (state → service + verifier) ───────────
const PENDING_FLOWS = new Map();
const FLOW_TTL_MS = 5 * 60 * 1000;          // 5 minutes to complete the flow

function newState() { return crypto.randomBytes(16).toString("hex"); }

// PKCE helpers
function newPkceVerifier() { return crypto.randomBytes(32).toString("base64url"); }
function pkceChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// Open browser (cross-platform)
function openBrowser(url) {
  let cmd, args;
  if (process.platform === "win32") {
    cmd = "cmd"; args = ["/C", "start", "", url];
  } else if (process.platform === "darwin") {
    cmd = "open"; args = [url];
  } else {
    cmd = "xdg-open"; args = [url];
  }
  try {
    const proc = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
    proc.unref();
    return true;
  } catch {
    return false;
  }
}

// ── HTTPS POST helper for token exchange ───────────────────────────────────
function postForm(url, formData, extraHeaders = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const body = new URLSearchParams(formData).toString();
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...extraHeaders,
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
    req.write(body);
    req.end();
  });
}

// ── PUBLIC: start an OAuth flow for a service ──────────────────────────────
/**
 * begin(service) →
 *   { ok, authorize_url, state }
 *
 * Opens the operator's browser to authorize_url. The callback at
 * /oauth/<service>/callback finishes the flow.
 */
export async function begin(service) {
  const cfg = getServiceConfig(service);
  if (!cfg) return { ok: false, error: `unknown service: ${service}` };
  if (cfg.auth_type !== "oauth2") return { ok: false, error: `service ${service} is not OAuth (it's ${cfg.auth_type})` };

  const client_id = process.env[cfg.client_id_env] || cfg.client_id_default;
  if (!client_id) {
    return {
      ok: false,
      needs_app_registration: true,
      hint: `Set ${cfg.client_id_env} (and ${cfg.client_secret_env || "<secret-env>"} if required). ${cfg.app_registration_hint || ""}`,
      app_registration_url: cfg.app_registration_url || null,
    };
  }

  const state = newState();
  const useP  = !!cfg.pkce;
  const verifier  = useP ? newPkceVerifier() : null;
  const challenge = useP ? pkceChallenge(verifier) : null;

  PENDING_FLOWS.set(state, { service, verifier, started_at: Date.now() });
  // Garbage-collect old flows
  for (const [k, v] of PENDING_FLOWS.entries()) {
    if (Date.now() - v.started_at > FLOW_TTL_MS) PENDING_FLOWS.delete(k);
  }

  const redirect_uri = cfg.redirect_uri || `http://127.0.0.1:8788/oauth/${service}/callback`;
  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    response_type: "code",
    state,
    scope: cfg.scope || "",
  });
  if (useP) {
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }
  if (cfg.duration) params.set("duration", cfg.duration);   // Reddit
  if (cfg.access_type) params.set("access_type", cfg.access_type);   // Google offline
  // Provider-specific extras
  if (cfg.extra_authorize_params) {
    for (const [k, v] of Object.entries(cfg.extra_authorize_params)) params.set(k, v);
  }
  const authorize_url = `${cfg.authorize_url}?${params.toString()}`;

  // Open the browser
  const opened = openBrowser(authorize_url);
  return { ok: true, authorize_url, state, opened, service };
}

// ── PUBLIC: handle the callback from the provider ──────────────────────────
/**
 * complete({ service, code, state }) → { ok, tokens, error }
 * Called by the server endpoint /oauth/:service/callback.
 */
export async function complete({ service, code, state, error }) {
  if (error) return { ok: false, error: `provider returned error: ${error}` };
  if (!code || !state) return { ok: false, error: "missing code or state" };
  const flow = PENDING_FLOWS.get(state);
  if (!flow) return { ok: false, error: "unknown or expired state" };
  if (flow.service !== service) return { ok: false, error: `state mismatch: state belongs to ${flow.service}, not ${service}` };
  PENDING_FLOWS.delete(state);

  const cfg = getServiceConfig(service);
  if (!cfg) return { ok: false, error: `unknown service: ${service}` };

  const client_id = process.env[cfg.client_id_env] || cfg.client_id_default;
  const client_secret = process.env[cfg.client_secret_env] || cfg.client_secret_default;
  const redirect_uri = cfg.redirect_uri || `http://127.0.0.1:8788/oauth/${service}/callback`;

  const form = {
    grant_type: "authorization_code",
    code,
    redirect_uri,
  };
  if (cfg.pkce && flow.verifier) form.code_verifier = flow.verifier;
  // Some providers want client_id in the body; others want HTTP Basic auth
  const extraHeaders = {};
  if (cfg.token_auth === "basic") {
    extraHeaders.Authorization = "Basic " + Buffer.from(`${client_id}:${client_secret || ""}`).toString("base64");
  } else {
    form.client_id = client_id;
    if (client_secret) form.client_secret = client_secret;
  }
  if (cfg.token_extra) Object.assign(form, cfg.token_extra);

  const r = await postForm(cfg.token_url, form, extraHeaders);
  if (r.status !== 200) {
    return { ok: false, error: `token exchange HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 400)}` };
  }
  const t = r.body;
  await vault.setOAuthTokens(service, {
    access_token:  t.access_token,
    refresh_token: t.refresh_token,
    expires_in:    t.expires_in,
    scope:         t.scope || cfg.scope,
    extra:         { token_type: t.token_type, id_token: t.id_token, raw: { granted: new Date().toISOString() } },
  });
  return { ok: true, service, scope: t.scope || cfg.scope, expires_in: t.expires_in };
}

// ── PUBLIC: refresh a single service's token ───────────────────────────────
export async function refresh(service) {
  const cfg = getServiceConfig(service);
  if (!cfg) return { ok: false, error: `unknown service: ${service}` };
  const rec = await vault.get(service);
  if (!rec || rec.auth_type !== "oauth2") return { ok: false, error: "not connected via OAuth" };
  if (!rec.refresh_token) return { ok: false, error: "no refresh token (operator may need to re-authorize)" };

  const client_id = process.env[cfg.client_id_env] || cfg.client_id_default;
  const client_secret = process.env[cfg.client_secret_env] || cfg.client_secret_default;
  const form = {
    grant_type: "refresh_token",
    refresh_token: rec.refresh_token,
  };
  const extraHeaders = {};
  if (cfg.token_auth === "basic") {
    extraHeaders.Authorization = "Basic " + Buffer.from(`${client_id}:${client_secret || ""}`).toString("base64");
  } else {
    form.client_id = client_id;
    if (client_secret) form.client_secret = client_secret;
  }
  const r = await postForm(cfg.token_url, form, extraHeaders);
  if (r.status !== 200) {
    return { ok: false, error: `refresh HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}` };
  }
  await vault.setOAuthTokens(service, {
    access_token:  r.body.access_token,
    refresh_token: r.body.refresh_token || rec.refresh_token, // some providers don't re-issue
    expires_in:    r.body.expires_in,
    scope:         r.body.scope || rec.scope,
    extra:         rec.extra,
  });
  return { ok: true, service };
}

// ── PUBLIC: background refresh sweep (call every ~6 minutes) ───────────────
export async function sweepRefresh() {
  const connected = await vault.listConnected();
  const refreshed = [];
  const failed = [];
  for (const c of connected) {
    if (c.auth_type !== "oauth2") continue;
    if (!c.has_refresh_token) continue;
    if (!c.expires_at) continue;
    const ms_left = new Date(c.expires_at).getTime() - Date.now();
    // Refresh if <8 minutes remaining
    if (ms_left < 8 * 60 * 1000) {
      const r = await refresh(c.service);
      if (r.ok) refreshed.push(c.service);
      else failed.push({ service: c.service, error: r.error });
    }
  }
  return { refreshed, failed };
}

// ── PUBLIC: get an access token, auto-refreshing if needed ─────────────────
export async function getValidAccessToken(service) {
  const rec = await vault.get(service);
  if (!rec) return { ok: false, error: "not connected" };
  if (rec.auth_type === "apikey") return { ok: true, token: rec.key, auth_type: "apikey" };
  if (rec.auth_type !== "oauth2") return { ok: false, error: `unsupported auth_type: ${rec.auth_type}` };
  if (rec.expires_at && new Date(rec.expires_at).getTime() < Date.now() + 30_000) {
    const r = await refresh(service);
    if (!r.ok) return r;
    const fresh = await vault.get(service);
    return { ok: true, token: fresh.access_token, auth_type: "oauth2" };
  }
  return { ok: true, token: rec.access_token, auth_type: "oauth2" };
}

// Kick off the background sweep loop (idempotent)
let _sweepStarted = false;
export function startBackgroundSweep() {
  if (_sweepStarted) return;
  _sweepStarted = true;
  setInterval(() => { sweepRefresh().catch(() => null); }, 6 * 60 * 1000);
}
