/* combos.mjs — v6.0.2 named-combo router fallback chains
   Inspired by 9router. Operator-defined task→model chains; router walks the list
   on quota/error. Combos live in ~/.orangebox/router/combos.json (one file). */
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";

const DEFAULT_COMBOS = {
  "premium-coding": [
    { provider: "anthropic", model: "claude-opus-4-7-20250930" },
    { provider: "groq",      model: "llama-3.3-70b-versatile" },
    { provider: "deepseek",  model: "deepseek-reasoner" },
    { provider: "ollama",    model: "qwen2.5:7b" },
  ],
  "fast-chat": [
    { provider: "groq",      model: "llama-3.3-70b-versatile" },
    { provider: "cerebras",  model: "llama-3.3-70b" },
    { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    { provider: "ollama",    model: "qwen2.5:7b" },
  ],
  "cheap-code": [
    { provider: "deepseek",  model: "deepseek-chat" },
    { provider: "mistral",   model: "codestral-latest" },
    { provider: "together",  model: "meta-llama/Llama-4-70b-instruct" },
  ],
  "air-gap": [
    { provider: "ollama",    model: "qwen2.5:7b" },
    { provider: "ollama",    model: "llama3.2:3b" },
  ],
  "ideas-and-solutions": [ // operator pref: opus 4.7 + GPT-5 + Gemini CLI + Grok-2
    { provider: "anthropic", model: "claude-opus-4-7-20250930" },
    { provider: "openai",    model: "gpt-5" },
    { provider: "google",    model: "gemini-1.5-pro-002", _mode: "cli" },
    { provider: "xai",       model: "grok-2" },
  ],
};

function combosPath() {
  const root = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
  return path.join(root, "router", "combos.json");
}

export function loadCombos() {
  try {
    const p = combosPath();
    if (!fs.existsSync(p)) return { ...DEFAULT_COMBOS };
    const raw = fs.readFileSync(p, "utf8");
    return { ...DEFAULT_COMBOS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_COMBOS }; }
}

export function saveCombos(obj) {
  const p = combosPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

export function listCombos() {
  return Object.keys(loadCombos());
}

export function resolveCombo(name) {
  const all = loadCombos();
  return all[name] || null;
}
