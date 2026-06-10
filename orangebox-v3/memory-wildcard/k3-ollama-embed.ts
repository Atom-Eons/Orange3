import { k3Config } from "./k3-config.ts";

export async function ollamaEmbed(text: string) {
  const cfg = k3Config();
  const started = Date.now();
  try {
    const res = await fetch("http://127.0.0.1:11434/api/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.embedModel, prompt: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`ollama embeddings status ${res.status}`);
    const json: any = await res.json();
    return { ok: true, model: cfg.embedModel, dimensions: Array.isArray(json.embedding) ? json.embedding.length : 0, embedding: json.embedding || [], ms: Date.now() - started };
  } catch (error: any) {
    // Deterministic fallback is a degraded locality vector, not semantic truth.
    const dims = 32;
    const vec = new Array(dims).fill(0);
    for (const token of String(text || "").toLowerCase().match(/[a-z0-9_-]{3,}/g) || []) {
      let h = 0;
      for (const ch of token) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      vec[h % dims] += 1;
    }
    const mag = Math.sqrt(vec.reduce((sum, n) => sum + n * n, 0)) || 1;
    return { ok: false, degraded: true, model: "deterministic-local-fallback", dimensions: dims, embedding: vec.map((n) => n / mag), ms: Date.now() - started, error: String(error?.message || error) };
  }
}
