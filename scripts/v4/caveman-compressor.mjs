/* caveman-compressor.mjs — v6.0.3 OUTPUT-side token compression
   Inspired by mattpocock/skills/caveman.  Ultra-compressed communication mode
   reducing token usage by ~75% on chatty agent responses.
   Pairs with RTK (input-side); cavemen squeezes the WRITE path. */

const SAFE_VERBS  = ["build","add","test","ship","fix","drop","stub","wire","mount","gate","emit","fan","glob","grep","read","write","route","emit","plan","check","verify"];

const FILLER = new Set([
  "the","a","an","this","that","these","those",
  "is","are","was","were","be","been","being",
  "of","to","for","in","on","at","by","with","from","into","onto",
  "as","like","and","or","but","so","nor","yet",
  "we","i","you","they","it",
  "very","really","quite","just","actually","basically","essentially","simply",
]);

const HEDGE = /^(perhaps|maybe|i think|i believe|it seems|arguably|presumably|possibly|likely|probably)[,\s]+/i;

// Aggressive compressor. Tradeoff: more compression vs lossy.
// `level` = "loose" | "medium" | "tight"
export function compressOutput(text, { level = "medium" } = {}) {
  let s = String(text || "");
  if (!s) return { text: "", original: 0, compressed: 0, savings_pct: 0 };

  // Always: strip filler hedges at sentence starts
  s = s.replace(/(^|\.\s+)(perhaps|maybe|i think|i believe|it seems|arguably|presumably|possibly|likely|probably)[,\s]+/gi, "$1");

  // Always: strip "in order to" → "to", "in the event that" → "if", etc.
  s = s
    .replace(/\bin order to\b/gi, "to")
    .replace(/\bin the event that\b/gi, "if")
    .replace(/\bdue to the fact that\b/gi, "because")
    .replace(/\bin spite of the fact that\b/gi, "although")
    .replace(/\bat this point in time\b/gi, "now")
    .replace(/\bin the near future\b/gi, "soon")
    .replace(/\bfor the purpose of\b/gi, "for");

  if (level === "loose") {
    return finalize(text, s);
  }

  // medium: drop sentence-level filler words + collapse double-spaces
  if (level === "medium" || level === "tight") {
    s = s.replace(/\s+/g, " ");
    s = s.split(/(?<=[.!?])\s+/).map(stripFillerSentence).join(" ");
  }

  // tight: caveman the imperative bullets
  if (level === "tight") {
    s = s.split(/\n/).map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        // Try to keep only verb + key nouns
        const inner = trimmed.replace(/^[-*]\s+/, "");
        return "- " + cavemanLine(inner);
      }
      return line;
    }).join("\n");
  }
  return finalize(text, s);
}

function stripFillerSentence(sentence) {
  return sentence
    .split(/\s+/)
    .filter((w, i) => {
      const wl = w.toLowerCase().replace(/[.,;:!?]+$/g, "");
      // Keep first word (subject), strip filler from rest
      if (i === 0) return true;
      return !FILLER.has(wl);
    })
    .join(" ");
}

function cavemanLine(line) {
  // Keep verbs, nouns, numbers; drop filler / hedge / repeat-stylistics
  return line.split(/\s+/).filter(w => {
    const wl = w.toLowerCase().replace(/[.,;:!?]+$/g, "");
    if (!wl) return false;
    if (FILLER.has(wl)) return false;
    return true;
  }).join(" ");
}

function finalize(orig, compressed) {
  const o = String(orig).length;
  const c = compressed.length;
  return {
    text: compressed,
    original: o,
    compressed: c,
    savings_pct: o ? Math.round((1 - c / o) * 1000) / 10 : 0,
  };
}

// CLI
const selfUrl = import.meta.url.replace(/\\/g, "/");
const argv1   = (process.argv && process.argv[1]) ? String(process.argv[1]).replace(/\\/g, "/") : "";
if (argv1 && (selfUrl.endsWith(argv1) || selfUrl === `file:///${argv1}`)) {
  const fs = await import("node:fs");
  const f = process.argv[2];
  const level = process.argv[3] || "medium";
  if (!f) { console.error("Usage: node caveman-compressor.mjs <path> [loose|medium|tight]"); process.exit(1); }
  const text = fs.readFileSync(f, "utf8");
  const out = compressOutput(text, { level });
  console.log(`level=${level} original=${out.original} → compressed=${out.compressed} (${out.savings_pct}% saved)`);
  if (process.argv.includes("--show")) console.log("---\n" + out.text);
}
