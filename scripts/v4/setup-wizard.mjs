/* setup-wizard.mjs — v6.3.0-alpha.2.5 — One-time guided setup.
 *
 * Per Silent Canvas Doctrine §8.4.5. The wizard probes the operator's
 * machine for installed subscription CLIs and OpenRouter key, then
 * returns the SHORTEST checklist of one-time actions to be fully ready.
 *
 * Honest goal: zero env tokens to manage going forward. Either the
 * subscription CLI is logged in once (preferred, $0), or OpenRouter
 * key is set once (universal fallback, ~$0.04/run), or both.
 */

import * as pipes from "./subscription-pipes.mjs";
import * as openrouter from "./openrouter-fallback.mjs";

/**
 * status() — synchronous-style probe returning the operator's current setup state.
 * Returns:
 *   {
 *     ready: bool,        // can OrangeBox do a Silent Canvas run RIGHT NOW?
 *     primary_path: "subscription-cli" | "openrouter" | "none",
 *     subscription_clis: [{ provider, binary, status, oauth_ok, version, login_cmd, install_hint }],
 *     openrouter:         { key_set, probe_ok, reason },
 *     deprecated_env_vars_set: [{ name, deprecated_since: "v6.3.0", replacement }],
 *     actions:            [ "..."  ],  // ordered checklist for operator
 *     recommended_next:   "...",       // single most-impactful action
 *     test_command:       "obx chat \"test\""
 *   }
 */
export async function status() {
  const reg = await pipes.load();
  const orProbe = await openrouter.probe().catch(() => ({ ok: false, reason: "probe_error" }));

  const subscription_clis = [];
  for (const [provider, p] of Object.entries(reg.providers || {})) {
    subscription_clis.push({
      provider,
      binary: p.binary || (p.candidate_binaries && p.candidate_binaries[0]) || null,
      status: p.status,
      oauth_ok: p.oauth_ok ?? null,
      version: p.version || null,
      login_cmd: p.binary ? `${p.binary} login` : null,
      install_hint: p.install_hint || null,
      auth_hint: p.auth_hint || null,
      subscription_label: p.subscription_label,
    });
  }

  const openrouter_state = {
    key_set: openrouter.hasOpenRouterKey(),
    probe_ok: orProbe.ok,
    reason: orProbe.reason,
    models_available: orProbe.models_available || null,
    set_via: openrouter.hasOpenRouterKey() ? "env: ORANGEBOX_OPENROUTER_KEY" : null,
  };

  // Deprecated env vars (each one should die at v6.3.0 GA, replaced by OpenRouter)
  const deprecated = [];
  for (const [name, replacement] of Object.entries({
    "ANTHROPIC_API_KEY": "OpenRouter (one key, all providers) OR `claude login`",
    "OPENAI_API_KEY":    "OpenRouter OR `codex login`",
    "GOOGLE_API_KEY":    "OpenRouter OR `gemini login`",
    "GROQ_API_KEY":      "OpenRouter (Llama-3.3-70B is on OpenRouter)",
    "XAI_API_KEY":       "OpenRouter OR `grok login`",
  })) {
    if (process.env[name]) {
      deprecated.push({
        name,
        deprecated_since: "v6.3.0",
        replacement,
        still_works: "yes (but discouraged — migrate to OpenRouter or CLI)",
      });
    }
  }

  // Determine primary path + readiness
  const anyCliReady = subscription_clis.some(c => c.status === "detected" && c.oauth_ok !== false);
  const orReady = openrouter_state.probe_ok;
  const apiReady = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  const ready = anyCliReady || orReady || apiReady;
  const primary_path = anyCliReady ? "subscription-cli" : (orReady ? "openrouter" : (apiReady ? "deprecated-api-key" : "none"));

  // Build operator-facing action checklist (shortest path to ready)
  const actions = [];
  if (!ready) {
    actions.push({
      step: 1,
      label: "Authenticate one of your existing subscriptions OR set OpenRouter",
      options: subscription_clis
        .filter(c => c.status === "detected" && c.oauth_ok === false)
        .map(c => ({ kind: "cli_login", text: `Run: ${c.login_cmd}  (uses your ${c.subscription_label}, $0 ongoing)` })),
      fallback: { kind: "openrouter_key", text: "OR set ORANGEBOX_OPENROUTER_KEY in Settings (one key, 200+ models, ~$0.04/run)" },
    });
    // For each NOT-detected CLI that might be a quick install
    const notInstalled = subscription_clis.filter(c => c.status === "missing");
    if (notInstalled.length) {
      actions.push({
        step: 2,
        label: "(Optional) Install any other subscription CLI you have",
        options: notInstalled.map(c => ({ kind: "install_cli", text: `${c.subscription_label}: ${c.install_hint}` })),
      });
    }
  } else {
    actions.push({
      step: 1,
      label: "READY — you can send a goal in OrangeBox now",
      options: [{ kind: "test", text: "Test: obx chat \"create a simple Notes.md with 3 bullets about today\"" }],
    });
    // Suggest deepening setup
    const undetected = subscription_clis.filter(c => c.status === "missing");
    if (undetected.length && !orReady) {
      actions.push({
        step: 2,
        label: "(Optional) Add OpenRouter for universal fallback when CLI auth lapses",
        options: [{ kind: "openrouter_key", text: "Get a free key at https://openrouter.ai; paste into Settings" }],
      });
    }
  }
  // Deprecate-env-vars action
  if (deprecated.length) {
    actions.push({
      step: actions.length + 1,
      label: "(Hygiene) Migrate deprecated env vars to OpenRouter (one key replaces them all)",
      options: deprecated.map(d => ({ kind: "deprecate_env", text: `${d.name} → ${d.replacement}` })),
    });
  }

  // Recommended-next: the single highest-impact action
  let recommended_next;
  if (!ready) {
    const firstCliWithLogin = subscription_clis.find(c => c.status === "detected" && c.oauth_ok === false);
    if (firstCliWithLogin) {
      recommended_next = `Run: ${firstCliWithLogin.login_cmd}  (one-time, $0 ongoing)`;
    } else if (subscription_clis.some(c => c.binary === "claude" && c.status === "missing")) {
      recommended_next = "Install Claude Code: npm i -g @anthropic-ai/claude-code  →  claude login";
    } else {
      recommended_next = "Get an OpenRouter key at https://openrouter.ai and paste it into Settings";
    }
  } else if (deprecated.length) {
    recommended_next = "Hygiene: replace " + deprecated.map(d => d.name).join("+") + " with one OpenRouter key";
  } else {
    recommended_next = "All set — start using Silent Canvas (Ctrl+Shift+S)";
  }

  return {
    ready,
    primary_path,
    subscription_clis,
    openrouter: openrouter_state,
    deprecated_env_vars_set: deprecated,
    actions,
    recommended_next,
    test_command: "obx chat \"create a simple Notes.md with 3 bullets about Silent Canvas\"",
  };
}

/**
 * setOpenRouterKey({ key }) — persists ORANGEBOX_OPENROUTER_KEY into
 * the operator's settings file (same path as the existing api-keys POST).
 */
export async function setOpenRouterKey({ key }) {
  if (!key || !key.startsWith("sk-or-")) {
    return { ok: false, error: "key must start with sk-or-" };
  }
  // Reuse existing api-keys settings file machinery
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const os = await import("node:os");
  const dataRoot = process.env.ORANGEBOX_DATA_ROOT ||
    path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
  const settingsDir = path.join(dataRoot, "settings");
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
  map.set("ORANGEBOX_OPENROUTER_KEY", key);
  process.env.ORANGEBOX_OPENROUTER_KEY = key;
  const out = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  await fs.writeFile(settingsFile, out, { mode: 0o600 });
  return { ok: true, saved_to: settingsFile };
}
