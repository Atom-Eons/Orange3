/* openrouter-fallback.mjs — v6.3.0-alpha.2.5 (2026-05-18)
 *
 * The universal-fallback API layer per Silent Canvas Doctrine §8.4.5.
 *
 * One key. 200+ models. Set once, forget forever.
 *
 * OpenRouter (https://openrouter.ai) exposes a single Bearer-auth endpoint
 * that routes to every major provider's models. ORANGEBOX_OPENROUTER_KEY is
 * the one env var that replaces ANTHROPIC_API_KEY / OPENAI_API_KEY /
 * GOOGLE_API_KEY / GROQ_API_KEY / XAI_API_KEY at v6.3.0 GA.
 *
 * Model name mapping: OpenRouter prefixes models with provider name, e.g.
 *   "anthropic/claude-sonnet-4.5"
 *   "openai/gpt-5"
 *   "google/gemini-2.0-pro"
 *   "x-ai/grok-2"
 *   "meta-llama/llama-3.3-70b-instruct"
 *
 * Our internal model names (claude-sonnet-4-5, gpt-5, etc.) get normalized
 * to OpenRouter's slug form by `toOpenRouterModel()`.
 */

import https from "node:https";

// Internal-name → OpenRouter slug. (Maintain as new providers/models are added.)
const MODEL_MAP = {
  // Anthropic
  "claude-opus-4-7":      "anthropic/claude-opus-4.7",
  "claude-sonnet-4-5":    "anthropic/claude-sonnet-4.5",
  "claude-sonnet-4-5-20251015": "anthropic/claude-sonnet-4.5",
  "claude-haiku-4-5":     "anthropic/claude-haiku-4.5",
  // OpenAI
  "gpt-5":                "openai/gpt-5",
  "gpt-5-mini":           "openai/gpt-5-mini",
  "o4":                   "openai/o4",
  // Google
  "gemini-2.0-pro":       "google/gemini-2.0-pro",
  "gemini-1.5-pro":       "google/gemini-1.5-pro",
  "gemini-1.5-pro-002":   "google/gemini-1.5-pro",
  "gemini-1.5-flash":     "google/gemini-1.5-flash",
  // xAI
  "grok-2":               "x-ai/grok-2",
  "grok-2-mini":          "x-ai/grok-2-mini",
  // Meta (only via OpenRouter or Groq)
  "llama-3.3-70b":        "meta-llama/llama-3.3-70b-instruct",
  "llama-3.3-70b-versatile": "meta-llama/llama-3.3-70b-instruct",
};

// Rough USD/MTok pricing (in/out). Used for "would-have-cost" comparison
// only — actual billing comes from the operator's OpenRouter account.
const OR_PRICING = {
  "anthropic/claude-opus-4.7":   { in: 15.0, out: 75.0 },
  "anthropic/claude-sonnet-4.5": { in:  3.0, out: 15.0 },
  "anthropic/claude-haiku-4.5":  { in:  0.8, out:  4.0 },
  "openai/gpt-5":                { in:  3.0, out: 12.0 },
  "openai/gpt-5-mini":           { in:  0.4, out:  1.6 },
  "google/gemini-2.0-pro":       { in:  1.25, out: 5.0 },
  "google/gemini-1.5-pro":       { in:  1.25, out: 5.0 },
  "google/gemini-1.5-flash":     { in:  0.075, out: 0.30 },
  "x-ai/grok-2":                 { in:  2.0, out: 10.0 },
  "meta-llama/llama-3.3-70b-instruct": { in: 0.20, out: 0.80 },
};

export function toOpenRouterModel(internalModel) {
  if (!internalModel) return null;
  if (MODEL_MAP[internalModel]) return MODEL_MAP[internalModel];
  // If the operator already passes a slash-prefixed slug, pass-through
  if (internalModel.includes("/")) return internalModel;
  // Otherwise return null and let the caller decide
  return null;
}

export function hasOpenRouterKey() {
  const k = process.env.ORANGEBOX_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || "";
  return k.startsWith("sk-or-") && k.length > 20;
}

function loadKey() {
  return process.env.ORANGEBOX_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || "";
}

/**
 * call({ model, system, prompt, max_tokens, on_token })
 * Returns the same shape as subscription-pipes#call so silent-canvas can
 * treat it as a uniform transport.
 */
export async function call({ model, system, prompt, max_tokens = 2000, temperature = undefined }) {
  const apiKey = loadKey();
  if (!apiKey) {
    return {
      ok: false,
      pipe: "openrouter",
      error: "ORANGEBOX_OPENROUTER_KEY not set — set once in Settings (Ctrl+,) or via env",
      needs_setup: true,
    };
  }
  const orModel = toOpenRouterModel(model) || model;
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const payload = {
    model: orModel,
    messages,
    max_tokens,
  };
  if (typeof temperature === "number") payload.temperature = temperature;
  const body = JSON.stringify(payload);
  const t0 = Date.now();
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "openrouter.ai", port: 443, path: "/api/v1/chat/completions", method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://atomeons.com/orangebox",
        "X-Title": "OrangeBox Silent Canvas",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        try {
          if (res.statusCode >= 400) {
            return resolve({
              ok: false, pipe: "openrouter", binary: null, model: orModel,
              error: `HTTP ${res.statusCode}: ${buf.slice(0, 300)}`,
            });
          }
          const data = JSON.parse(buf);
          if (data.error) return resolve({ ok: false, pipe: "openrouter", error: data.error.message || JSON.stringify(data.error) });
          const text = data.choices?.[0]?.message?.content || "";
          const usage = data.usage || {};
          const px = OR_PRICING[orModel] || { in: 1.0, out: 4.0 };
          const dollar_cost = ((usage.prompt_tokens || 0) * px.in + (usage.completion_tokens || 0) * px.out) / 1_000_000;
          resolve({
            ok: true,
            text,
            tokens_in:  usage.prompt_tokens     || 0,
            tokens_out: usage.completion_tokens || 0,
            dollar_cost,
            pipe: "openrouter",
            binary: null,
            model: orModel,
            latency_ms: Date.now() - t0,
            subscription_quota_used_pct: null,
          });
        } catch (e) {
          resolve({ ok: false, pipe: "openrouter", error: `parse: ${e.message}`, raw_preview: buf.slice(0, 200) });
        }
      });
    });
    req.on("error", (e) => resolve({ ok: false, pipe: "openrouter", error: e.message }));
    req.setTimeout(120000, () => { req.destroy(new Error("timeout")); resolve({ ok: false, pipe: "openrouter", error: "timeout" }); });
    req.write(body);
    req.end();
  });
}

// Probe whether OpenRouter is reachable + key is valid.
export async function probe() {
  if (!hasOpenRouterKey()) return { ok: false, reason: "no_key", hint: "Set ORANGEBOX_OPENROUTER_KEY in Settings or env" };
  // Cheap call: list models endpoint
  return new Promise((resolve) => {
    const apiKey = loadKey();
    const req = https.request({
      hostname: "openrouter.ai", port: 443, path: "/api/v1/models", method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(buf);
            return resolve({ ok: true, reason: "ok", models_available: data.data?.length || 0 });
          } catch (e) {
            return resolve({ ok: true, reason: "ok", note: "parsed model count failed" });
          }
        }
        resolve({ ok: false, reason: `http_${res.statusCode}`, hint: buf.slice(0, 200) });
      });
    });
    req.on("error", (e) => resolve({ ok: false, reason: "network_error", hint: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, reason: "timeout" }); });
    req.end();
  });
}
