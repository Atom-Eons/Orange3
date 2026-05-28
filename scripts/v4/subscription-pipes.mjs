/* subscription-pipes.mjs — v6.3.0-alpha.0 (2026-05-18)
 *
 * The Silent Canvas Doctrine §5.0 transport layer.
 *
 * Every model call OrangeBox makes follows this routing order:
 *   1. subscription CLI pipe   ($0 incremental — uses operator's monthly quota)
 *   2. subscription MCP        (where available)
 *   3. direct provider API     (per-token billing — last resort)
 *   4. local Ollama            (free; LOCAL_MODE)
 *
 * The operator already pays monthly for Anthropic Max + ChatGPT Pro +
 * Gemini Advanced + X Premium+ + Cursor Pro. Burning API tokens on top of
 * those subscriptions is waste this module exists to prevent.
 *
 * NOTE on completeness: the DETECTOR + REGISTRY are wired in this file
 * (alpha.0). The actual subprocess INVOCATION wrappers for each CLI are
 * stubs marked with TODO[alpha.0.x] — each provider's CLI has slightly
 * different argv shape and streaming protocol; we land detection first,
 * then per-pipe call wrappers next, so the smart-model-router can already
 * branch on availability while we finish each pipe's call adapter.
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// ── PROVIDER REGISTRY ──────────────────────────────────────────────────────
// Each provider lists candidate binary names (in PATH order of preference).
// Detection picks the first that resolves + responds to --version.
export const PROVIDER_REGISTRY = {
  anthropic: {
    binaries: ["claude"],                                    // Claude Code CLI
    subscription_label: "Anthropic Pro / Max",
    version_args: ["--version"],
    install_hint: "npm i -g @anthropic-ai/claude-code  (then `claude login`)",
    models: ["claude-opus-4-7", "claude-sonnet-4-5", "claude-haiku-4-5"],
  },
  openai: {
    binaries: ["codex"],                                     // OpenAI Codex CLI (released May 2026)
    subscription_label: "ChatGPT Pro / Team",
    version_args: ["--version"],
    install_hint: "npm i -g @openai/codex  (then `codex login`)",
    models: ["gpt-5", "gpt-5-mini", "o4"],
  },
  google: {
    binaries: ["gemini"],                                    // Google Gemini CLI
    subscription_label: "Gemini Advanced (Google One AI)",
    version_args: ["--version"],
    install_hint: "npm i -g @google-gemini/cli  (then `gemini login`)",
    models: ["gemini-2.0-pro", "gemini-1.5-pro", "gemini-1.5-flash"],
  },
  xai: {
    binaries: ["grok"],                                      // Grok CLI (rolled out May 2026)
    subscription_label: "X Premium+",
    version_args: ["--version"],
    install_hint: "npm i -g @xai/grok-cli  (then `grok login`)",
    models: ["grok-2", "grok-2-mini"],
  },
  cursor: {
    binaries: ["cursor-agent", "cursor"],                    // Cursor Agent CLI
    subscription_label: "Cursor Pro / Team",
    version_args: ["agent", "--version"],
    install_hint: "Install Cursor from cursor.com; `cursor agent` ships with Pro subscription",
    models: ["auto"],
  },
};

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}
function pipesFile() { return path.join(dataRoot(), "pipes.json"); }

// ── DETECTION ──────────────────────────────────────────────────────────────
async function which(binary) {
  // Cross-platform `which`: try PATH-resolved spawn.
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileP(cmd, [binary], { windowsHide: true });
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
    return lines[0] || null;
  } catch {
    return null;
  }
}

async function probeVersion(binary, versionArgs) {
  try {
    const { stdout, stderr } = await execFileP(binary, versionArgs, { windowsHide: true, timeout: 4000 });
    const out = (stdout || stderr || "").trim().split(/\r?\n/)[0] || "";
    return out;
  } catch (e) {
    return null;
  }
}

// v6.3.0-alpha.2.1 — Probe whether the CLI is actually authenticated by
// running a tiny no-op prompt. Returns "ok" | "401-unauthenticated" |
// "other-error" | "skip". Skips when we don't have a tiny-prompt strategy
// for that binary yet.
async function probeAuth(provider, binary) {
  if (provider !== "anthropic") return "skip"; // only claude has a known fast probe today
  try {
    const { stdout, stderr } = await execFileP(binary, ["--print", "ping"], {
      windowsHide: true, timeout: 8000,
    });
    const combined = (stdout || "") + (stderr || "");
    if (combined.toLowerCase().includes("invalid authentication") || combined.includes("401")) return "401-unauthenticated";
    return "ok";
  } catch (e) {
    const msg = (e.stderr || e.message || "").toString();
    if (msg.toLowerCase().includes("invalid authentication") || msg.includes("401")) return "401-unauthenticated";
    return "other-error";
  }
}

/**
 * Detect every provider's CLI pipe. Returns the full state object and
 * persists it to `<dataRoot>/pipes.json`. Idempotent + safe to call
 * repeatedly. Re-run via POST /api/v4/pipes/redetect.
 */
export async function detect() {
  const result = {
    detected_at: new Date().toISOString(),
    providers: {},
    summary: { detected_count: 0, missing_count: 0, providers_with_pipe: [] },
  };
  for (const [provider, spec] of Object.entries(PROVIDER_REGISTRY)) {
    let found = null;
    for (const bin of spec.binaries) {
      const resolved = await which(bin);
      if (!resolved) continue;
      const version = await probeVersion(bin, spec.version_args);
      if (version === null) continue;          // resolved but didn't respond — broken install
      found = { binary: bin, path: resolved, version };
      break;
    }
    if (found) {
      // Probe OAuth state (cheap no-op prompt; skips for providers without
      // a known probe). When a binary is detected but auth is missing the
      // operator needs to run `<binary> login` once.
      const authState = await probeAuth(provider, found.binary);
      const oauth_ok = authState === "ok" ? true : (authState === "skip" ? null : false);
      const auth_hint = authState === "401-unauthenticated"
        ? `Binary detected but not authenticated. Run: ${found.binary} login`
        : (authState === "other-error" ? "Binary detected but probe returned an unexpected error. Verify with: " + found.binary + " --print 'ping'" : null);
      result.providers[provider] = {
        status: "detected",
        subscription_label: spec.subscription_label,
        binary: found.binary,
        path: found.path,
        version: found.version,
        models: spec.models,
        oauth_ok,
        oauth_state: authState,
        auth_hint,
      };
      if (oauth_ok || oauth_ok === null) {
        result.summary.detected_count += 1;
        result.summary.providers_with_pipe.push(provider);
      } else {
        result.summary.detected_but_unauthenticated_count = (result.summary.detected_but_unauthenticated_count || 0) + 1;
      }
    } else {
      result.providers[provider] = {
        status: "missing",
        subscription_label: spec.subscription_label,
        install_hint: spec.install_hint,
        candidate_binaries: spec.binaries,
      };
      result.summary.missing_count += 1;
    }
  }
  // Persist
  try {
    await fs.mkdir(path.dirname(pipesFile()), { recursive: true });
    await fs.writeFile(pipesFile(), JSON.stringify(result, null, 2));
  } catch { /* persist failure is non-fatal */ }
  return result;
}

/** Load the cached registry, or trigger a fresh detect() if absent / stale. */
export async function load({ maxAgeHours = 6 } = {}) {
  if (!fsSync.existsSync(pipesFile())) {
    return await detect();
  }
  try {
    const doc = JSON.parse(await fs.readFile(pipesFile(), "utf8"));
    const detectedAt = new Date(doc.detected_at).getTime();
    const ageMs = Date.now() - detectedAt;
    if (ageMs > maxAgeHours * 3600_000) {
      return await detect();
    }
    return doc;
  } catch {
    return await detect();
  }
}

// ── ROUTING DECISION ───────────────────────────────────────────────────────
/**
 * Given a provider preference + the operator's override env, return the
 * routing decision: which transport to use, which binary if subscription,
 * which fallback if anything fails.
 *
 *   choose({ provider: "anthropic" })
 *     -> {
 *          decision: "subscription-cli" | "api" | "local",
 *          binary: "claude" | null,
 *          binary_path: "/path/to/claude" | null,
 *          model_hint: "claude-sonnet-4-5",
 *          fallback_chain: ["anthropic-api", "google-cli", "ollama"],
 *          reason: "claude CLI detected · subscription"
 *        }
 */
export async function choose({ provider, requested_model = null, registry = null }) {
  // Honor overrides FIRST
  const forceApi = String(process.env.ORANGEBOX_FORCE_API || "").trim() === "1";
  const forcePipe = String(process.env.ORANGEBOX_FORCE_PIPE || "").trim();

  const reg = registry || await load();

  if (forceApi) {
    return {
      decision: "api",
      binary: null, binary_path: null, model_hint: requested_model,
      fallback_chain: ["local"],
      reason: "ORANGEBOX_FORCE_API=1",
    };
  }
  if (forcePipe) {
    const p = reg.providers[forcePipe];
    if (p?.status === "detected") {
      return {
        decision: "subscription-cli",
        binary: p.binary, binary_path: p.path, model_hint: requested_model,
        fallback_chain: ["api", "local"],
        reason: `ORANGEBOX_FORCE_PIPE=${forcePipe}`,
      };
    }
    // Forced pipe missing → still respect the override intent by going to API for that provider
    return {
      decision: "api",
      binary: null, binary_path: null, model_hint: requested_model,
      fallback_chain: ["local"],
      reason: `ORANGEBOX_FORCE_PIPE=${forcePipe} but binary not found`,
    };
  }

  // Normal flow: try the requested provider's CLI first
  const p = reg.providers[provider];
  if (p?.status === "detected" && p.oauth_ok !== false) {
    return {
      decision: "subscription-cli",
      binary: p.binary, binary_path: p.path, model_hint: requested_model,
      fallback_chain: [`${provider}-api`, "local"],
      reason: `${p.binary} detected (${p.version || "version-unknown"}) · subscription path`,
    };
  }
  // CLI installed but auth missing → fall to API with a named reason
  if (p?.status === "detected" && p.oauth_ok === false) {
    return {
      decision: "api",
      binary: null, binary_path: null, model_hint: requested_model,
      fallback_chain: ["local"],
      reason: `${p.binary} installed but not authenticated · ${p.auth_hint || "run `" + p.binary + " login`"}`,
    };
  }

  // CLI missing for that provider → respect the requested provider, fall through to API
  return {
    decision: "api",
    binary: null, binary_path: null, model_hint: requested_model,
    fallback_chain: ["local"],
    reason: `${provider} CLI not installed (would have used ${PROVIDER_REGISTRY[provider]?.binaries?.[0] || provider})`,
  };
}

// ── INVOCATION (per-pipe call adapter) ─────────────────────────────────────
// alpha.0: scaffolded — actually streaming integration lands in alpha.1.
//
// The shape of `call()` matches what the smart-model-router needs:
//   { provider, prompt, model_hint, system, max_tokens, on_token, on_done }
// Returns { ok, text, tokens_in, tokens_out, dollar_cost, pipe, fallback_reason }
//
// Each provider's CLI has its own argv shape:
//   claude --print "<prompt>"           [reads stdin if --print not given]
//   codex  --json --prompt "<prompt>"   [TBD — codex CLI just released, exact flags pending]
//   gemini chat -p "<prompt>"
//   grok   ask  "<prompt>"
//   cursor agent --prompt "<prompt>"
//
// alpha.0 implements `claude` (Anthropic) only — the dominant case and
// the one we can exercise immediately. Other providers stub-fall to API
// until alpha.0.1.

const ANTHROPIC_TOKEN_PRICE = {
  // Approximate USD/MTok — we only use this for the "what-it-would-have-cost" comparison receipt.
  "claude-opus-4-7":    { in: 15.0, out: 75.0 },
  "claude-sonnet-4-5":  { in:  3.0, out: 15.0 },
  "claude-haiku-4-5":   { in:  0.8, out:  4.0 },
};

function estimateWouldHaveCostUsd({ provider, model, tokens_in, tokens_out }) {
  if (provider !== "anthropic") return null;
  const px = ANTHROPIC_TOKEN_PRICE[model] || ANTHROPIC_TOKEN_PRICE["claude-sonnet-4-5"];
  return ((tokens_in * px.in) + (tokens_out * px.out)) / 1_000_000;
}

/**
 * callViaClaudeCli({ prompt, model, system, max_tokens, on_token })
 * Spawn `claude --print --model <model>` and pipe stdin/stdout. Streams
 * tokens to `on_token`. Returns final aggregated text + a synthetic
 * token-count estimate (Claude Code does not yet emit machine-readable
 * usage when invoked headlessly; we approximate from char counts).
 */
export async function callViaClaudeCli({ prompt, model = "claude-sonnet-4-5", system = null, max_tokens = 4096, on_token = null, timeout_ms = 120_000 }) {
  return new Promise((resolve) => {
    const args = ["--print", "--model", model];
    // Claude Code reads the user message from stdin when --print is used.
    let stdoutBuf = "";
    let stderrBuf = "";
    let killed = false;
    const proc = spawn("claude", args, { windowsHide: true });

    const killer = setTimeout(() => { killed = true; proc.kill(); }, timeout_ms);

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutBuf += text;
      if (on_token) {
        try { on_token(text); } catch { /* swallow */ }
      }
    });
    proc.stderr.on("data", (chunk) => { stderrBuf += chunk.toString(); });
    proc.on("error", (err) => {
      clearTimeout(killer);
      resolve({ ok: false, error: err.message, pipe: "subscription-cli", binary: "claude" });
    });
    proc.on("close", (code) => {
      clearTimeout(killer);
      if (killed) {
        return resolve({ ok: false, error: "timeout", pipe: "subscription-cli", binary: "claude" });
      }
      if (code !== 0) {
        return resolve({
          ok: false,
          error: `claude exit ${code}: ${stderrBuf.slice(0, 400)}`,
          pipe: "subscription-cli", binary: "claude",
        });
      }
      // Estimate tokens (3.6 chars/tok heuristic)
      const tokens_in  = Math.ceil(((system || "").length + prompt.length) / 3.6);
      const tokens_out = Math.ceil(stdoutBuf.length / 3.6);
      const would_have = estimateWouldHaveCostUsd({ provider: "anthropic", model, tokens_in, tokens_out });
      resolve({
        ok: true,
        text: stdoutBuf,
        tokens_in, tokens_out,
        dollar_cost: 0.00,
        would_have_api_cost_usd: would_have,
        pipe: "subscription-cli",
        binary: "claude",
        binary_path: null,             // resolved at routing layer
        model,
        subscription_quota_used_pct: null,   // not exposed by Claude Code CLI yet
      });
    });

    // Feed prompt (and optional system) via stdin
    try {
      if (system) {
        proc.stdin.write(`<system>${system}</system>\n`);
      }
      proc.stdin.write(prompt);
      proc.stdin.end();
    } catch (e) {
      clearTimeout(killer);
      resolve({ ok: false, error: `stdin write failed: ${e.message}`, pipe: "subscription-cli", binary: "claude" });
    }
  });
}

// ── Generic CLI subprocess wrapper (used by codex/gemini/grok/cursor) ──────
// Different CLIs have slightly different argv conventions; each pipe below
// configures argv + stdin protocol + token estimation, then delegates to
// this helper. All return the same shape as callViaClaudeCli.
async function callViaGenericCli({ binary, argv, stdin_text, timeout_ms = 120_000, on_token = null, provider, model }) {
  return new Promise((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let killed = false;
    const proc = spawn(binary, argv, { windowsHide: true });
    const killer = setTimeout(() => { killed = true; proc.kill(); }, timeout_ms);
    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutBuf += text;
      if (on_token) try { on_token(text); } catch { /* swallow */ }
    });
    proc.stderr.on("data", (chunk) => { stderrBuf += chunk.toString(); });
    proc.on("error", (err) => {
      clearTimeout(killer);
      resolve({ ok: false, error: err.message, pipe: "subscription-cli", binary, provider });
    });
    proc.on("close", (code) => {
      clearTimeout(killer);
      if (killed) return resolve({ ok: false, error: "timeout", pipe: "subscription-cli", binary, provider });
      if (code !== 0) {
        return resolve({
          ok: false,
          error: `${binary} exit ${code}: ${stderrBuf.slice(0, 400)}`,
          pipe: "subscription-cli", binary, provider,
        });
      }
      const tokens_in  = Math.ceil((stdin_text?.length || 0) / 3.6);
      const tokens_out = Math.ceil(stdoutBuf.length / 3.6);
      const would_have = estimateWouldHaveCostUsd({ provider, model, tokens_in, tokens_out });
      resolve({
        ok: true,
        text: stdoutBuf,
        tokens_in, tokens_out,
        dollar_cost: 0.00,
        would_have_api_cost_usd: would_have,
        pipe: "subscription-cli",
        binary, provider, model,
        binary_path: null,
        subscription_quota_used_pct: null,
      });
    });
    try {
      if (stdin_text) {
        proc.stdin.write(stdin_text);
      }
      proc.stdin.end();
    } catch (e) {
      clearTimeout(killer);
      resolve({ ok: false, error: `stdin write failed: ${e.message}`, pipe: "subscription-cli", binary, provider });
    }
  });
}

// Codex CLI (OpenAI). Released May 2026. Exact argv shape:
//   codex --print --model <model>  (reads stdin)
// (May change as the CLI matures; current shape matches `codex --help` from
// initial release.)
export async function callViaCodexCli({ prompt, model = "gpt-5", system = null, max_tokens = 4096, on_token = null }) {
  const stdin = (system ? `<system>${system}</system>\n` : "") + prompt;
  return callViaGenericCli({
    binary: "codex",
    argv:   ["--print", "--model", model],
    stdin_text: stdin,
    timeout_ms: 120_000,
    on_token, provider: "openai", model,
  });
}

// Gemini CLI (Google). Argv:
//   gemini chat --model <model> -p "<prompt>"
// Note: gemini's CLI doesn't pipe stdin uniformly; we pass prompt via -p.
export async function callViaGeminiCli({ prompt, model = "gemini-2.0-pro", system = null, on_token = null }) {
  // Gemini CLI accepts prompt as positional/-p arg, not stdin
  const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
  return callViaGenericCli({
    binary: "gemini",
    argv:   ["chat", "--model", model, "-p", fullPrompt],
    stdin_text: null,
    timeout_ms: 120_000,
    on_token, provider: "google", model,
  });
}

// Grok CLI (xAI). Argv:
//   grok ask --model <model> "<prompt>"
export async function callViaGrokCli({ prompt, model = "grok-2", system = null, on_token = null }) {
  const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
  return callViaGenericCli({
    binary: "grok",
    argv:   ["ask", "--model", model, fullPrompt],
    stdin_text: null,
    timeout_ms: 120_000,
    on_token, provider: "xai", model,
  });
}

// Cursor Agent CLI. Argv:
//   cursor agent --prompt "<prompt>"
// Cursor uses `cursor` as the binary with subcommand `agent`.
export async function callViaCursorAgentCli({ prompt, system = null, on_token = null }) {
  const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
  return callViaGenericCli({
    binary: "cursor",
    argv:   ["agent", "--prompt", fullPrompt],
    stdin_text: null,
    timeout_ms: 120_000,
    on_token, provider: "cursor", model: "auto",
  });
}

// ── PUBLIC ENTRY POINTS ────────────────────────────────────────────────────
/**
 * High-level call: given a provider preference, decide transport + invoke.
 * The smart-model-router will use this as its outer wrapper for every
 * model call from v6.3.0-alpha.0 onward.
 *
 *   call({ provider: "anthropic", model: "claude-sonnet-4-5", prompt, system, on_token })
 *
 * Returns the same shape regardless of transport, with `pipe` naming
 * which path was actually taken and `fallback_reason` set when the
 * preferred path was unavailable.
 */
export async function call({ provider, model = null, prompt, system = null, max_tokens = 4096, on_token = null }) {
  const decision = await choose({ provider, requested_model: model });

  if (decision.decision === "subscription-cli" && decision.binary) {
    let r;
    switch (decision.binary) {
      case "claude":  r = await callViaClaudeCli({ prompt, model: model || "claude-sonnet-4-5", system, max_tokens, on_token }); break;
      case "codex":   r = await callViaCodexCli({ prompt, model: model || "gpt-5", system, max_tokens, on_token }); break;
      case "gemini":  r = await callViaGeminiCli({ prompt, model: model || "gemini-2.0-pro", system, on_token }); break;
      case "grok":    r = await callViaGrokCli({ prompt, model: model || "grok-2", system, on_token }); break;
      case "cursor":  r = await callViaCursorAgentCli({ prompt, system, on_token }); break;
      default:
        return {
          ok: false, pipe: "unknown-binary", binary: decision.binary, provider, model,
          fallback_reason: `binary ${decision.binary} known but no wrapper implemented`, needs_api: true,
        };
    }
    if (r.ok) return { ...r, fallback_reason: null };
    return { ...r, fallback_reason: r.error || "subscription-cli failed" };
  }

  // No subscription pipe available — caller (router) should fall to direct API.
  return {
    ok: false,
    pipe: "no-pipe-available",
    decision: decision.decision,
    fallback_reason: decision.reason,
    needs_api: true,
    provider, model,
  };
}

/** For server endpoint GET /api/v4/pipes/list */
export async function listForOperator() {
  const reg = await load();
  return reg;
}

/** For server endpoint POST /api/v4/pipes/redetect */
export async function redetect() {
  return await detect();
}
