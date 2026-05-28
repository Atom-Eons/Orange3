/* tab-complete.mjs — v6.1.0 inline IDE ghost-text completion.
   Cursor's bread-and-butter. Operator types in the IDE; on pause + Tab press,
   we send {prefix, suffix, language, file_path} to Anthropic Haiku (fast +
   cheap) and stream back a short continuation. Ghost text rendered in the
   native IDE buffer.

   Cost: Haiku is the only sane choice for tab-complete (low latency, low $).
   Fallback if no key: returns empty completion, no error.

   Caching: identical {prefix-tail-256, suffix-head-128} → cached for 30s.
*/
import crypto from "node:crypto";

const CACHE = new Map();        // key -> { completion, ts }
const CACHE_TTL_MS = 30_000;
const MAX_CACHE = 200;

function cacheKey(prefix, suffix, lang) {
  const pt = prefix.slice(-256);
  const sh = suffix.slice(0, 128);
  return crypto.createHash("md5").update(pt + "" + sh + "" + lang).digest("hex");
}

function cacheGet(key) {
  const v = CACHE.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > CACHE_TTL_MS) { CACHE.delete(key); return null; }
  return v.completion;
}

function cacheSet(key, completion) {
  if (CACHE.size >= MAX_CACHE) {
    const oldest = [...CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) CACHE.delete(oldest[0]);
  }
  CACHE.set(key, { completion, ts: Date.now() });
}

async function httpsPost(hostname, route, headers, payload) {
  const https = await import("node:https");
  return new Promise((resolve, reject) => {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    const req = https.request({
      hostname, port: 443, path: route, method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(new Error("timeout")); });
    req.write(data);
    req.end();
  });
}

/**
 * complete({ prefix, suffix, language, file_path, anthropicKey, max_tokens=80 })
 * Returns { completion: "<text>", cached: bool, tokens_in, tokens_out }
 */
export async function complete({
  prefix, suffix = "", language = "text", file_path = "",
  anthropicKey, max_tokens = 80, model = "claude-haiku-4-5-20251015",
}) {
  if (!prefix) return { completion: "", reason: "empty prefix" };
  if (!anthropicKey) return { completion: "", reason: "no API key" };

  const key = cacheKey(prefix, suffix, language);
  const cached = cacheGet(key);
  if (cached !== null) return { completion: cached, cached: true };

  // Trim context: 1500 chars before cursor, 500 after
  const before = prefix.slice(-1500);
  const after  = suffix.slice(0, 500);

  const systemPrompt = [
    "You are a code completion engine. The operator is typing in their IDE.",
    "Continue the code at the cursor position naturally.",
    "Output ONLY the continuation text — no commentary, no markdown fences, no explanation.",
    "Match the existing style, indentation, and language conventions.",
    "Keep continuations short: 1-3 lines maximum. Stop at a natural break.",
    "If unsure or the cursor is at a sentence-end, return an empty string.",
    `Language: ${language}. File: ${file_path || "(unknown)"}.`,
  ].join("\n");

  const userPrompt = [
    "Code before cursor:",
    "```",
    before,
    "```",
    "",
    "Code after cursor:",
    "```",
    after,
    "```",
    "",
    "Output the text that should appear at the cursor (and nothing else):",
  ].join("\n");

  try {
    const t0 = Date.now();
    const resp = await httpsPost("api.anthropic.com", "/v1/messages", {
      "Content-Type":      "application/json",
      "x-api-key":         anthropicKey,
      "anthropic-version": "2023-06-01",
    }, {
      model,
      max_tokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      stop_sequences: ["\n\n\n", "```"],
    });
    if (resp.status !== 200) {
      return { completion: "", error: `HTTP ${resp.status}: ${resp.body.slice(0, 200)}` };
    }
    const data = JSON.parse(resp.body);
    const text = data.content?.find(c => c.type === "text")?.text || "";
    // Strip stray code fences just in case
    const cleaned = text.replace(/^```[\w]*\n?/, "").replace(/```\s*$/, "").replace(/^\s*\n/, "");
    cacheSet(key, cleaned);
    return {
      completion: cleaned,
      cached: false,
      tokens_in: data.usage?.input_tokens || 0,
      tokens_out: data.usage?.output_tokens || 0,
      latency_ms: Date.now() - t0,
    };
  } catch (e) {
    return { completion: "", error: e.message || String(e) };
  }
}

export function clearCache() {
  const n = CACHE.size;
  CACHE.clear();
  return { cleared: n };
}

export function cacheStats() {
  return { entries: CACHE.size, ttl_ms: CACHE_TTL_MS, max: MAX_CACHE };
}
