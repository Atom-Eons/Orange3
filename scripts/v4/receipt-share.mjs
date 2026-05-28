#!/usr/bin/env node
/**
 * receipt-share.mjs — ORANGEBOX v4
 * Render a receipt JSON as a beautiful self-contained shareable HTML artifact,
 * or upload to a configured share endpoint.
 *
 * CLI usage:
 *   node receipt-share.mjs --receipt=<path>  --output=<html_path>   # local render
 *   node receipt-share.mjs --receipt=<path>  --publish               # upload to endpoint
 *
 * Env:
 *   ORANGEBOX_DATA_ROOT     base of data dir (default: process.cwd())
 *   ORANGEBOX_SHARE_ENDPOINT  REST endpoint for --publish
 *   ORANGEBOX_ORG           operator org name (cosmetic)
 *   ORANGEBOX_PROJECT       project name (cosmetic)
 *
 * 2026-05-16
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import http from "node:http";
import https from "node:https";

// ── Args ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] !== undefined ? m[2] : true;
  }
  return out;
}

function usage() {
  console.error(`receipt-share.mjs

  --receipt=<path>     Path to a receipt JSON file (required)
  --output=<path>      Write standalone HTML to this path (local render)
  --publish            Upload to ORANGEBOX_SHARE_ENDPOINT
  --help               Show this message`);
  process.exit(1);
}

if (args.help) usage();
if (!args.receipt) { console.error("[receipt-share] --receipt is required."); usage(); }

// ── Config ───────────────────────────────────────────────────────────────────

const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.cwd();
const ORG       = process.env.ORANGEBOX_ORG       || "AtomEons";
const PROJECT   = process.env.ORANGEBOX_PROJECT   || "ORANGEBOX v4";
const ENDPOINT  = process.env.ORANGEBOX_SHARE_ENDPOINT || null;

// ── Load receipt ─────────────────────────────────────────────────────────────

async function loadReceipt(p) {
  const resolved = path.isAbsolute(p) ? p : path.resolve(DATA_ROOT, p);
  const raw = await fs.readFile(resolved, "utf8");
  const receipt = JSON.parse(raw);
  // Normalise: ensure _id
  if (!receipt._id) {
    receipt._id = path.basename(p, ".json");
  }
  return { receipt, resolved };
}

// ── Screenshot embedding ─────────────────────────────────────────────────────

async function embedScreenshots(receipt) {
  // evidence items with type "screenshot" or "file" ending in image ext
  const ev = receipt.evidence || [];
  for (const e of ev) {
    const imgExts = /\.(png|jpg|jpeg|gif|webp|svg)$/i;
    const candidate = e.type === "screenshot" ? (e.src || e.path) :
                      (e.type === "file" && imgExts.test(e.path || "")) ? e.path : null;
    if (!candidate) continue;
    try {
      const imgPath = path.isAbsolute(candidate) ? candidate : path.resolve(DATA_ROOT, candidate);
      const bytes = await fs.readFile(imgPath);
      const ext = path.extname(imgPath).slice(1).toLowerCase();
      const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
      e._embedded = `data:${mime};base64,${bytes.toString("base64")}`;
    } catch {
      // embedding failed — fall through, HTML will reference path directly
    }
  }
  return receipt;
}

// ── Markdown → HTML (minimal, self-contained — no external deps) ─────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s) {
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1">$1</a>');
}

function mdToHtml(md) {
  if (!md) return "";
  const lines = String(md).split("\n");
  const out = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  let inUl = false;

  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (!inCode) {
        if (inUl) { out.push("</ul>"); inUl = false; }
        inCode = true;
        codeLang = raw.slice(3).trim();
        codeLines = [];
      } else {
        inCode = false;
        out.push(`<pre><code class="lang-${escHtml(codeLang)}">${escHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        codeLang = "";
      }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    const hm = raw.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      if (inUl) { out.push("</ul>"); inUl = false; }
      const lv = hm[1].length + 2;
      out.push(`<h${lv}>${inline(hm[2])}</h${lv}>`);
      continue;
    }

    const li = raw.match(/^[\-\*]\s+(.+)/);
    if (li) {
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (inUl) { out.push("</ul>"); inUl = false; }

    if (raw.trim() === "") { out.push("<br>"); continue; }
    out.push(`<p>${inline(raw)}</p>`);
  }
  if (inUl) out.push("</ul>");
  if (inCode) out.push(`<pre><code>${escHtml(codeLines.join("\n"))}</code></pre>`);
  return out.join("\n");
}

// ── Diff renderer ─────────────────────────────────────────────────────────────

function renderDiff(content) {
  return (content || "").split("\n").map((l) => {
    if (l.startsWith("+")) return `<span class="diff-add">${escHtml(l)}</span>`;
    if (l.startsWith("-")) return `<span class="diff-del">${escHtml(l)}</span>`;
    return `<span class="diff-ctx">${escHtml(l)}</span>`;
  }).join("\n");
}

// ── Evidence section renderer ─────────────────────────────────────────────────

function renderEvidenceSection(ev) {
  if (!ev || ev.length === 0) return "";
  return ev.map((e) => {
    const label = escHtml(e.label || e.type || "evidence");

    if (e._embedded || (e.type === "screenshot")) {
      const src = e._embedded || escHtml(e.src || e.path || "");
      return `
        <details class="ev-block" open>
          <summary>${label}</summary>
          <div class="ev-body">
            <img src="${typeof src === "string" ? src : escHtml(src)}" style="max-width:100%;border-radius:6px;" alt="screenshot" />
          </div>
        </details>`;
    }

    if (e.type === "diff") {
      return `
        <details class="ev-block">
          <summary>${label}</summary>
          <div class="ev-body diff-block"><pre>${renderDiff(e.content)}</pre></div>
        </details>`;
    }

    if (e.type === "file") {
      return `
        <details class="ev-block">
          <summary>${label}</summary>
          <div class="ev-body"><span class="file-ref">${escHtml(e.path || "(file)")}</span></div>
        </details>`;
    }

    return `
      <details class="ev-block">
        <summary>${label}</summary>
        <div class="ev-body"><pre>${escHtml(e.content || e.text || "(empty)")}</pre></div>
      </details>`;
  }).join("\n");
}

// ── Meta table renderer ───────────────────────────────────────────────────────

function renderMeta(receipt) {
  const skip = new Set(["summary", "detail", "evidence"]);
  const rows = Object.entries(receipt)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `
      <tr>
        <td class="mk">${escHtml(k)}</td>
        <td class="mv">${escHtml(typeof v === "object" ? JSON.stringify(v) : String(v ?? "—"))}</td>
      </tr>`).join("");
  return `<table class="meta-table"><tbody>${rows}</tbody></table>`;
}

// ── Standalone HTML render ────────────────────────────────────────────────────

function fmtTs(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toUTCString(); } catch { return String(ts); }
}

function buildShareHtml(receipt) {
  const ts      = fmtTs(receipt.ts);
  const source  = escHtml(receipt.source || "unknown");
  const summary = escHtml(receipt.summary || "(no summary)");
  const mdHtml  = mdToHtml(receipt.detail || receipt.summary || "");
  const evHtml  = renderEvidenceSection(receipt.evidence || []);
  const metaHtml = renderMeta(receipt);
  const id       = escHtml(receipt._id || "receipt");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt: ${summary} — ORANGEBOX v4</title>
<meta name="description" content="${summary}">
<meta property="og:title" content="Receipt: ${summary}">
<meta property="og:description" content="Proof of work from ORANGEBOX v4. Source: ${source}. ${ts}">
<style>
/* ORANGEBOX v4 — Shareable Receipt Artifact
   Self-contained. No external refs. Safe to email, tweet, attach. */
:root{
  --bg:#050711;--panel:#0d1020;--panel-2:#14172b;
  --line:#27304c;--text:#f4f7ff;--muted:#9ba6c4;
  --green:#69e6ff;--red:#ff5c7a;--amber:#ffd166;
  --cyan:#7dd3fc;--orange:#9aa8ff;--violet:#b69cff;--magenta:#ff7bd5;
  --font:"Bahnschrift","Segoe UI",system-ui,sans-serif;
  --mono:"Cascadia Code","Consolas","Courier New",monospace;
}
*{box-sizing:border-box;margin:0;padding:0;}
html{background:var(--bg);color:var(--text);font:15px/1.6 var(--font);min-height:100%;}
body{max-width:820px;margin:0 auto;padding:0 20px 60px;}
a{color:var(--cyan);}

/* hero */
.hero{
  background:
    linear-gradient(135deg,rgba(138,164,255,.18) 0%,rgba(125,211,252,.1) 40%,rgba(255,123,213,.12) 100%),
    var(--panel);
  border-bottom:2px solid rgba(138,164,255,.4);
  padding:42px 36px 32px;
  margin:0 -20px 36px;
  position:relative;
  overflow:hidden;
}
.hero::before{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:
    linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px),
    linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px);
  background-size:28px 28px;
}
.hero-eyebrow{
  font-family:var(--mono);font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--cyan);margin-bottom:10px;
  display:flex;align-items:center;gap:8px;
}
.hero-dot{
  width:8px;height:8px;border-radius:50%;background:var(--orange);
  box-shadow:0 0 12px var(--orange);display:inline-block;
}
.hero-org{font-size:12px;color:var(--muted);margin-bottom:4px;letter-spacing:.06em;}
.hero-title{
  font-size:clamp(22px,5vw,40px);line-height:1.1;color:var(--text);
  font-weight:900;margin-bottom:12px;letter-spacing:-.01em;
  text-shadow:0 0 28px rgba(138,164,255,.22);
}
.hero-ts{font-family:var(--mono);font-size:12px;color:var(--muted);margin-bottom:6px;}
.hero-source{
  display:inline-flex;align-items:center;gap:6px;
  background:rgba(138,164,255,.1);border:1px solid rgba(138,164,255,.25);
  border-radius:999px;padding:4px 12px;
  font-family:var(--mono);font-size:11px;color:var(--orange);
}

/* sections */
.section{margin-bottom:28px;}
.section-label{
  font-family:var(--mono);font-size:10px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--muted);
  border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:14px;
}

/* md */
.md-body p{margin-bottom:10px;font-size:14px;line-height:1.65;}
.md-body pre{
  background:rgba(2,5,16,.9);border:1px solid var(--line);border-radius:6px;
  padding:14px;overflow-x:auto;font-family:var(--mono);font-size:12px;
  line-height:1.5;margin-bottom:14px;
}
.md-body code{
  background:rgba(138,164,255,.1);border:1px solid rgba(138,164,255,.2);
  border-radius:3px;padding:1px 4px;font-family:var(--mono);font-size:12px;
}
.md-body h4,.md-body h5{color:var(--cyan);margin:10px 0 6px;font-size:14px;}
.md-body ul{padding-left:18px;margin-bottom:10px;}
.md-body li{margin-bottom:4px;font-size:14px;}
.md-body strong{color:var(--amber);}
.md-body a{color:var(--cyan);}
.md-body br{display:block;height:4px;}

/* evidence */
.ev-block{
  background:rgba(2,5,16,.82);border:1px solid var(--line);
  border-radius:6px;overflow:hidden;margin-bottom:8px;
}
.ev-block summary{
  padding:10px 14px;cursor:pointer;font-size:12px;color:var(--muted);
  display:flex;align-items:center;gap:8px;list-style:none;user-select:none;
}
.ev-block summary::before{content:"▸";font-size:10px;transition:transform .15s;}
.ev-block[open] summary::before{transform:rotate(90deg);}
.ev-body{
  padding:12px 14px;border-top:1px solid var(--line);
  font-family:var(--mono);font-size:12px;line-height:1.55;
  overflow-x:auto;
}
.ev-body pre{white-space:pre-wrap;word-break:break-all;margin:0;}
.diff-block pre{color:var(--muted);}
.diff-add{color:#69e6c0;background:rgba(105,230,192,.06);display:block;}
.diff-del{color:var(--red);background:rgba(255,92,122,.06);display:block;}
.diff-ctx{color:var(--muted);display:block;}
.file-ref{color:var(--cyan);font-family:var(--mono);font-size:12px;}

/* meta table */
.meta-table{width:100%;border-collapse:collapse;font-size:12px;}
.meta-table td{
  padding:6px 10px;border-bottom:1px solid rgba(39,48,76,.5);
  font-family:var(--mono);vertical-align:top;
}
.meta-table .mk{color:var(--muted);white-space:nowrap;width:140px;}
.meta-table .mv{color:var(--text);word-break:break-all;}

/* footer */
footer{
  margin-top:48px;padding-top:20px;border-top:1px solid var(--line);
  font-size:11px;color:var(--muted);display:flex;
  align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
}
footer strong{color:var(--orange);}
footer a{color:var(--cyan);}
.receipt-id{font-family:var(--mono);font-size:10px;color:rgba(155,166,196,.5);}

/* scrollbar */
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(138,164,255,.25);border-radius:3px;}
</style>
</head>
<body>

<div class="hero">
  <div class="hero-eyebrow"><span class="hero-dot"></span>RECEIPT &mdash; PROOF OF WORK</div>
  <div class="hero-org">${escHtml(ORG)} &mdash; ${escHtml(PROJECT)}</div>
  <h1 class="hero-title">${summary}</h1>
  <div class="hero-ts">${ts}</div>
  <div class="hero-source">${source}</div>
</div>

${mdHtml ? `
<div class="section">
  <div class="section-label">Summary</div>
  <div class="md-body">${mdHtml}</div>
</div>` : ""}

${evHtml ? `
<div class="section">
  <div class="section-label">Evidence</div>
  ${evHtml}
</div>` : ""}

<div class="section">
  <div class="section-label">Metadata</div>
  ${metaHtml}
</div>

<footer>
  <div>
    Rendered by <strong>ORANGEBOX v4</strong> &mdash; the OS, not the tool. &mdash;
    <a href="https://atomeons.com/orangebox" target="_blank" rel="noopener">atomeons.com/orangebox</a>
  </div>
  <div class="receipt-id">id: ${id}</div>
</footer>

</body>
</html>`;
}

// ── Meta-receipt emitter ──────────────────────────────────────────────────────

async function emitMetaReceipt(originalId, outputPath, mode) {
  const ts = new Date().toISOString();
  const metaId = `${originalId}-shared-${ts.replace(/[:.]/g, "-")}`;
  const meta = {
    _id: metaId,
    ts,
    source: "receipt-share",
    summary: `Shared receipt ${originalId} via ${mode}`,
    original_receipt_id: originalId,
    output: outputPath || null,
    mode,
  };
  const shareDir = path.join(DATA_ROOT, "receipts", "share");
  try {
    await fs.mkdir(shareDir, { recursive: true });
    await fs.writeFile(
      path.join(shareDir, `${metaId}.json`),
      JSON.stringify(meta, null, 2),
      "utf8"
    );
    console.log(`[receipt-share] meta-receipt → ${path.join(shareDir, metaId + ".json")}`);
  } catch (err) {
    console.warn("[receipt-share] meta-receipt write failed:", err.message);
  }
}

// ── HTTP upload helper ────────────────────────────────────────────────────────

async function httpPost(url, body) {
  const parsed = new URL(url);
  const mod = parsed.protocol === "https:" ? https : http;
  const data = Buffer.from(JSON.stringify(body), "utf8");
  return new Promise((resolve, reject) => {
    const req = mod.request(url, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": data.length },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(text)); }
          catch { resolve({ raw: text }); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.end(data);
  });
}

// ── SHA-256 of content ────────────────────────────────────────────────────────

function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load + enrich receipt
  let receipt, resolved;
  try {
    ({ receipt, resolved } = await loadReceipt(args.receipt));
  } catch (err) {
    console.error(`[receipt-share] Cannot load receipt: ${err.message}`);
    process.exit(1);
  }

  console.log(`[receipt-share] loaded: ${resolved}`);
  console.log(`[receipt-share] id: ${receipt._id}  ts: ${receipt.ts}`);

  // Embed screenshots
  receipt = await embedScreenshots(receipt);

  // Build HTML
  const html = buildShareHtml(receipt);
  const digest = sha256(html);

  if (args.publish) {
    // ── publish mode ─────────────────────────────────────────────────────
    if (!ENDPOINT) {
      console.error("[receipt-share] endpoint not configured; use --output for local render.");
      console.error("  Set ORANGEBOX_SHARE_ENDPOINT env var to enable --publish.");
      process.exit(1);
    }
    try {
      const result = await httpPost(ENDPOINT, {
        receipt_id: receipt._id,
        receipt,
        html,
        sha256: digest,
      });
      console.log(`[receipt-share] published: ${JSON.stringify(result)}`);
      await emitMetaReceipt(receipt._id, result.url || null, "publish");
    } catch (err) {
      console.error(`[receipt-share] publish failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // ── local render mode ─────────────────────────────────────────────────
  if (!args.output) {
    console.error("[receipt-share] Provide --output=<path> for local render, or --publish to upload.");
    usage();
  }

  const outputPath = path.isAbsolute(args.output) ? args.output : path.resolve(process.cwd(), args.output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, "utf8");

  console.log(`[receipt-share] rendered → ${outputPath}`);
  console.log(`[receipt-share] sha256: ${digest}`);
  console.log(`[receipt-share] size: ${(html.length / 1024).toFixed(1)} KB`);

  await emitMetaReceipt(receipt._id, outputPath, "local");
}

main().catch((err) => {
  console.error("[receipt-share] fatal:", err);
  process.exit(1);
});
