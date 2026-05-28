#!/usr/bin/env node
/* ============================================================================
   vault-audit.mjs — ORANGEBOX v4 Compounding Vault Audit

   Reads the v2 CLC-style knowledge vault (lattice + void) and shows the
   operator exactly how their vault has compounded over time.
   Sticky retention through proof of memory growth.

   CLI:
     node vault-audit.mjs --snapshot               capture metrics now
     node vault-audit.mjs --report [--weeks=4]     last N weeks delta report
     node vault-audit.mjs --diff <wk1> <wk2>       specific week compare
     node vault-audit.mjs --export-html=<path>      render standalone HTML
     node vault-audit.mjs --projection              linear extrapolation
     node vault-audit.mjs --snapshot --report       capture then report

   Zero npm deps. Pure Node + raw SVG/HTML.
   Disclosure: ATOM-ORANGEBOX-VAULT-AUDIT-V4-2026-0516
   ============================================================================ */

import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ─── Config ─────────────────────────────────────────────────────────────────

const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT
  || process.env.ORANGEBOX_ROOT
  || argVal("--root")
  || path.join(os.homedir(), "AppData", "Roaming", "com.atomeons.orangebox.command");

// The v2 engine writes here
const VAULT_DIR = (() => {
  // Try the path the v2 engine actually uses
  const canonical = path.join(DATA_ROOT, "memory", "orangebox-knowledge-v2");
  // Also accept spec path for future index.json placement
  const specPath  = path.join(DATA_ROOT, "knowledge-v2");
  return canonical; // canonical wins; spec path checked as fallback in readVaultMetrics()
})();

const SNAPSHOTS_DIR  = path.join(DATA_ROOT, "knowledge-v2", "snapshots");
const RECEIPTS_DIR   = path.join(DATA_ROOT, "receipts", "vault-audit");

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function hasFlag(flag) { return process.argv.includes(flag); }
function argVal(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  // --flag=value form
  const prefixed = process.argv.find(a => a.startsWith(flag + "="));
  if (prefixed) return prefixed.slice(flag.length + 1);
  return fallback;
}

const DO_SNAPSHOT    = hasFlag("--snapshot");
const DO_REPORT      = hasFlag("--report");
const DO_PROJECTION  = hasFlag("--projection");
const WEEKS_BACK     = parseInt(argVal("--weeks", "4"), 10);
const EXPORT_HTML    = argVal("--export-html");
const DIFF_ARGS      = (() => {
  const i = process.argv.indexOf("--diff");
  if (i >= 0 && i + 2 < process.argv.length) return [process.argv[i + 1], process.argv[i + 2]];
  return null;
})();

// ─── Utilities ───────────────────────────────────────────────────────────────

const iso = () => new Date().toISOString();
const sha256 = (s) => crypto.createHash("sha256").update(String(s || "")).digest("hex");

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

function isoWeek(d = new Date()) {
  // ISO 8601 week: week containing Thursday
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7; // 1=Mon, 7=Sun
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return { year: target.getUTCFullYear(), week: weekNum };
}

function fmtWeek(iw) {
  return `${iw.year}-W${String(iw.week).padStart(2, "0")}`;
}

function pct(a, b) {
  if (!b) return 0;
  return Math.round(((a - b) / b) * 1000) / 10; // one decimal
}

function commas(n) {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ─── Vault metrics reader ────────────────────────────────────────────────────
// Derives snapshot metrics from the v2 engine's actual output files.
// Supports: lattice.jsonl, void.jsonl, entities.json, topics.json, fidelity.json
// Also checks for index.json (future single-index format).

async function readVaultMetrics() {
  // Resolve actual vault directory (canonical or spec fallback)
  let vaultDir = VAULT_DIR;
  if (!(await fileExists(path.join(vaultDir, "lattice.jsonl")))) {
    const alt = path.join(DATA_ROOT, "knowledge-v2");
    if (await fileExists(path.join(alt, "lattice.jsonl"))) {
      vaultDir = alt;
    } else if (await fileExists(path.join(alt, "index.json"))) {
      // Future index.json path — read directly from it
      const idx = JSON.parse(await fs.readFile(path.join(alt, "index.json"), "utf8"));
      return normalizeIndexJson(idx);
    } else {
      return null; // vault not built
    }
  }

  // Stream lattice.jsonl for per-doc metrics
  const latticePath = path.join(vaultDir, "lattice.jsonl");
  let docCount = 0;
  let factCount = 0;
  let entityCount = 0; // doc-level entity sum (pre-noise-gate)
  let dreamCount = 0;
  let receiptCount = 0;
  let partyLineMsgCount = 0;
  const entityFreq = new Map();
  const conceptFreq = new Map();

  const latticeStream = createInterface({
    input: createReadStream(latticePath),
    crlfDelay: Infinity,
  });
  for await (const line of latticeStream) {
    if (!line.trim()) continue;
    try {
      const doc = JSON.parse(line);
      docCount++;
      factCount += (doc.facts || []).length;
      const ents = Object.entries(doc.entities || {});
      entityCount += ents.length;
      for (const [ent, n] of ents) {
        entityFreq.set(ent, (entityFreq.get(ent) || 0) + n);
      }
      // Tag concepts from topics
      for (const t of (doc.topics || [])) {
        conceptFreq.set(t, (conceptFreq.get(t) || 0) + 1);
      }
      // Heuristic: detect dream / receipt / party-line docs by source path
      const src = (doc.source || "").toLowerCase();
      if (/dream/.test(src))   dreamCount++;
      if (/receipt/.test(src)) receiptCount++;
      if (/party.?line/.test(src)) partyLineMsgCount++;
    } catch {}
  }

  // File sizes
  const latticeBytes = await fileSizeBytes(latticePath);
  const voidPath     = path.join(vaultDir, "void.jsonl");
  const voidBytes    = await fileSizeBytes(voidPath);

  // Global entity count from entities.json (post-noise-gate, if available)
  const entitiesJsonPath = path.join(vaultDir, "entities.json");
  let globalEntityCount = entityFreq.size;
  if (await fileExists(entitiesJsonPath)) {
    try {
      const ej = JSON.parse(await fs.readFile(entitiesJsonPath, "utf8"));
      globalEntityCount = ej.count || globalEntityCount;
    } catch {}
  }

  // Top 10 entities by frequency
  const top10Entities = [...entityFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Top 10 concepts (topics)
  const top10Concepts = [...conceptFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return {
    docCount,
    factCount,
    entityCount: globalEntityCount,
    latticeBytes,
    voidBytes,
    dreamCount,
    receiptCount,
    partyLineMsgCount,
    top10Entities,
    top10Concepts,
  };
}

function normalizeIndexJson(idx) {
  // Accept future index.json schema; pull what we need
  return {
    docCount:         idx.docCount         || idx.docs_compiled    || 0,
    factCount:        idx.factCount        || idx.facts            || 0,
    entityCount:      idx.entityCount      || idx.entities_after_noise_gate || 0,
    latticeBytes:     idx.latticeBytes     || 0,
    voidBytes:        idx.voidBytes        || 0,
    dreamCount:       idx.dreamCount       || 0,
    receiptCount:     idx.receiptCount     || 0,
    partyLineMsgCount:idx.partyLineMsgCount|| 0,
    top10Entities:    idx.top10Entities    || [],
    top10Concepts:    idx.top10Concepts    || [],
  };
}

async function fileSizeBytes(p) {
  try { return (await fs.stat(p)).size; } catch { return 0; }
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

async function captureSnapshot() {
  const metrics = await readVaultMetrics();
  if (!metrics) {
    console.error("[vault-audit] FAIL: vault not built. Run orangebox-knowledge-v2.mjs first.");
    process.exit(1);
  }

  const iw = isoWeek();
  const week = fmtWeek(iw);

  const snapshot = {
    week,
    iso_week: `${iw.year}-W${String(iw.week).padStart(2, "0")}`,
    capturedAt:       iso(),
    docCount:         metrics.docCount,
    factCount:        metrics.factCount,
    entityCount:      metrics.entityCount,
    latticeBytes:     metrics.latticeBytes,
    voidBytes:        metrics.voidBytes,
    dreamCount:       metrics.dreamCount,
    receiptCount:     metrics.receiptCount,
    partyLineMsgCount:metrics.partyLineMsgCount,
    top10Entities:    metrics.top10Entities,
    top10Concepts:    metrics.top10Concepts,
  };

  await ensureDir(SNAPSHOTS_DIR);
  const snapFile = path.join(SNAPSHOTS_DIR, `${week}.json`);
  await fs.writeFile(snapFile, JSON.stringify(snapshot, null, 2));

  console.log(`[vault-audit] snapshot saved → ${snapFile}`);
  console.log(`[vault-audit] docs=${snapshot.docCount} facts=${snapshot.factCount} entities=${snapshot.entityCount} lattice=${fmtBytes(snapshot.latticeBytes)} void=${fmtBytes(snapshot.voidBytes)}`);

  await emitReceipt("snapshot", { week, snapFile, metrics: snapshot });
  return snapshot;
}

// ─── Load snapshots ───────────────────────────────────────────────────────────

async function loadSnapshots(last = null) {
  await ensureDir(SNAPSHOTS_DIR);
  const files = await fs.readdir(SNAPSHOTS_DIR).catch(() => []);
  const snaps = [];
  for (const f of files.sort()) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = JSON.parse(await fs.readFile(path.join(SNAPSHOTS_DIR, f), "utf8"));
      snaps.push(s);
    } catch {}
  }
  if (last !== null) return snaps.slice(-last);
  return snaps;
}

// ─── Compute deltas ───────────────────────────────────────────────────────────

function computeDelta(prev, curr) {
  const totalBytePrev = (prev.latticeBytes || 0) + (prev.voidBytes || 0);
  const totalByteCurr = (curr.latticeBytes || 0) + (curr.voidBytes || 0);
  const densityPrev = totalBytePrev > 0
    ? (prev.latticeBytes / totalBytePrev) * 100 : 0;
  const densityCurr = totalByteCurr > 0
    ? (curr.latticeBytes / totalByteCurr) * 100 : 0;

  const newConcepts = (curr.top10Concepts || [])
    .filter(c => !(prev.top10Concepts || []).find(p => p.name === c.name))
    .map(c => c.name);

  return {
    from:            prev.week,
    to:              curr.week,
    factsAdded:      (curr.factCount || 0) - (prev.factCount || 0),
    entitiesAdded:   (curr.entityCount || 0) - (prev.entityCount || 0),
    docsAdded:       (curr.docCount || 0) - (prev.docCount || 0),
    docGrowthPct:    pct(curr.docCount, prev.docCount),
    latticeGrowthPct:pct(curr.latticeBytes, prev.latticeBytes),
    latticeDensityPct: Math.round(densityCurr * 10) / 10,
    latticeDensityDelta: Math.round((densityCurr - densityPrev) * 10) / 10,
    newTopConcepts:  newConcepts,
  };
}

// ─── Projection ───────────────────────────────────────────────────────────────

function computeProjection(snaps) {
  if (snaps.length < 2) return null;
  const first = snaps[0];
  const last  = snaps[snaps.length - 1];
  const weeksElapsed = snaps.length - 1;
  if (weeksElapsed === 0) return null;

  const factRate    = (last.factCount - first.factCount) / weeksElapsed;
  const entityRate  = (last.entityCount - first.entityCount) / weeksElapsed;
  const docRate     = (last.docCount - first.docCount) / weeksElapsed;
  const byteRate    = ((last.latticeBytes + last.voidBytes) - (first.latticeBytes + first.voidBytes)) / weeksElapsed;

  const currentTotal = last.factCount + last.entityCount;
  const firstTotal   = first.factCount + first.entityCount;
  if (firstTotal <= 0 || factRate + entityRate <= 0) return null;

  const weeksToDouble = Math.ceil(firstTotal / (factRate + entityRate));

  return {
    factRate:     Math.round(factRate),
    entityRate:   Math.round(entityRate),
    docRate:      Math.round(docRate * 10) / 10,
    bytesPerWeek: Math.round(byteRate),
    weeksToDouble,
    projectedFacts4wk:    Math.round(last.factCount + factRate * 4),
    projectedEntities4wk: Math.round(last.entityCount + entityRate * 4),
  };
}

// ─── Markdown report ──────────────────────────────────────────────────────────

function buildMarkdownReport(snaps, deltas, proj) {
  const lines = [];
  lines.push("# ORANGEBOX Vault Compound Report");
  lines.push(`Generated: ${iso()}`);
  lines.push("");

  if (snaps.length === 0) {
    lines.push("No snapshots found. Run `--snapshot` first.");
    return lines.join("\n");
  }

  const latest = snaps[snaps.length - 1];
  const first  = snaps[0];
  const totalGrowthPct = pct(latest.factCount, first.factCount);

  lines.push("## Hero");
  lines.push(`Your vault has compounded by **+${totalGrowthPct}%** since ${first.week}.`);
  lines.push(`**${commas(latest.factCount)}** facts · **${commas(latest.entityCount)}** entities · **${commas(latest.docCount)}** documents · **${commas(latest.dreamCount)}** dreams synthesized`);
  lines.push("");

  lines.push("## Latest snapshot");
  lines.push(`Week: ${latest.week} — captured ${latest.capturedAt}`);
  lines.push(`- Documents:   ${commas(latest.docCount)}`);
  lines.push(`- Facts:       ${commas(latest.factCount)}`);
  lines.push(`- Entities:    ${commas(latest.entityCount)}`);
  lines.push(`- Lattice:     ${fmtBytes(latest.latticeBytes)}`);
  lines.push(`- Void:        ${fmtBytes(latest.voidBytes)}`);
  lines.push(`- Density:     ${fmtDensity(latest.latticeBytes, latest.voidBytes)}%`);
  lines.push(`- Dreams:      ${commas(latest.dreamCount)}`);
  lines.push(`- Receipts:    ${commas(latest.receiptCount)}`);
  lines.push(`- Party-line:  ${commas(latest.partyLineMsgCount)}`);
  lines.push("");

  if (deltas.length > 0) {
    lines.push("## Week-over-week deltas");
    lines.push("| Week | Docs+ | Facts+ | Entities+ | Doc Growth | Lattice Density | New Concepts |");
    lines.push("|------|-------|--------|-----------|------------|-----------------|--------------|");
    for (const d of deltas) {
      const sign = (n) => n >= 0 ? `+${n}` : `${n}`;
      lines.push(`| ${d.from}→${d.to} | ${sign(d.docsAdded)} | ${sign(d.factsAdded)} | ${sign(d.entitiesAdded)} | ${sign(d.docGrowthPct)}% | ${d.latticeDensityPct}% (${sign(d.latticeDensityDelta)}%) | ${d.newTopConcepts.join(", ") || "—"} |`);
    }
    lines.push("");
  }

  if (proj) {
    lines.push("## Projection");
    lines.push(`At current rate (+${proj.factRate} facts/wk · +${proj.entityRate} entities/wk · +${proj.docRate} docs/wk):`);
    lines.push(`- Vault doubles in: **${proj.weeksToDouble} weeks**`);
    lines.push(`- 4-week forecast: ${commas(proj.projectedFacts4wk)} facts · ${commas(proj.projectedEntities4wk)} entities`);
    lines.push(`- Lattice growth rate: ${fmtBytes(proj.bytesPerWeek)}/week`);
    lines.push("");
  }

  lines.push("## Top concepts");
  if (latest.top10Concepts && latest.top10Concepts.length) {
    for (const c of latest.top10Concepts) {
      lines.push(`- ${c.name}: ${c.count} docs`);
    }
  } else {
    lines.push("(no concept data)");
  }
  lines.push("");

  lines.push("## Top entities");
  if (latest.top10Entities && latest.top10Entities.length) {
    for (const e of latest.top10Entities) {
      lines.push(`- ${e.name}: ${e.count}`);
    }
  } else {
    lines.push("(no entity data)");
  }

  return lines.join("\n");
}

// ─── Standalone HTML report ───────────────────────────────────────────────────
// Dark theme, McLaren F1 aesthetic: carbon, orange, chrome.
// Big numbers, SVG sparklines, concept cloud, WoW table.

function buildHtml(snaps, deltas, proj) {
  const latest = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  const first  = snaps.length > 0 ? snaps[0] : null;
  const totalGrowthPct = (latest && first) ? pct(latest.factCount, first.factCount) : 0;

  const heroFacts    = latest ? commas(latest.factCount)    : "0";
  const heroEntities = latest ? commas(latest.entityCount)  : "0";
  const heroDocs     = latest ? commas(latest.docCount)     : "0";
  const heroDreams   = latest ? commas(latest.dreamCount)   : "0";
  const heroWeek     = first  ? first.week : "—";

  // Sparkline: facts over weeks
  const sparkFacts   = buildSparkline(snaps.map(s => s.factCount),   "#FF6900", "facts");
  const sparkDocs    = buildSparkline(snaps.map(s => s.docCount),    "#C0C0C0", "docs");
  const sparkEntities= buildSparkline(snaps.map(s => s.entityCount), "#FF9940", "entities");
  const sparkDensity = buildSparkline(
    snaps.map(s => fmtDensityNum(s.latticeBytes, s.voidBytes)),
    "#FFD700", "density"
  );

  // WoW table rows
  const wowRows = deltas.map(d => {
    const sign = (n) => n >= 0 ? `<span class="pos">+${n}</span>` : `<span class="neg">${n}</span>`;
    const pctSign = (n) => n >= 0 ? `<span class="pos">+${n}%</span>` : `<span class="neg">${n}%</span>`;
    return `<tr>
      <td>${d.from}<br><span class="arrow">→</span>${d.to}</td>
      <td>${sign(d.docsAdded)}</td>
      <td>${sign(d.factsAdded)}</td>
      <td>${sign(d.entitiesAdded)}</td>
      <td>${pctSign(d.docGrowthPct)}</td>
      <td>${d.latticeDensityPct}% ${pctSign(d.latticeDensityDelta)}</td>
      <td class="concepts">${d.newTopConcepts.map(c => `<span class="concept-tag">${escHtml(c)}</span>`).join(" ") || "—"}</td>
    </tr>`;
  }).join("\n");

  // Concept cloud
  const conceptCloud = (latest?.top10Concepts || []).map((c, i) => {
    const size = Math.max(12, 22 - i * 1.1);
    const opacity = Math.max(0.55, 1 - i * 0.05);
    return `<span class="cloud-word" style="font-size:${size.toFixed(1)}px;opacity:${opacity.toFixed(2)}">${escHtml(c.name)}<sup>${c.count}</sup></span>`;
  }).join(" ");

  // Entity list
  const entityList = (latest?.top10Entities || []).map((e, i) => {
    const barPct = latest.top10Entities[0]
      ? Math.round((e.count / latest.top10Entities[0].count) * 100)
      : 0;
    return `<div class="entity-row">
      <span class="entity-name">${escHtml(e.name)}</span>
      <div class="entity-bar-wrap"><div class="entity-bar" style="width:${barPct}%"></div></div>
      <span class="entity-count">${e.count}</span>
    </div>`;
  }).join("\n");

  // Projection block
  const projBlock = proj ? `
  <section class="proj-section">
    <h2 class="section-title">Projection</h2>
    <div class="proj-grid">
      <div class="proj-card">
        <div class="proj-label">Doubles in</div>
        <div class="proj-value">${proj.weeksToDouble}<span class="unit">wks</span></div>
      </div>
      <div class="proj-card">
        <div class="proj-label">Facts / week</div>
        <div class="proj-value">+${commas(proj.factRate)}</div>
      </div>
      <div class="proj-card">
        <div class="proj-label">Entities / week</div>
        <div class="proj-value">+${commas(proj.entityRate)}</div>
      </div>
      <div class="proj-card">
        <div class="proj-label">4-wk facts</div>
        <div class="proj-value">${commas(proj.projectedFacts4wk)}</div>
      </div>
      <div class="proj-card">
        <div class="proj-label">Storage / week</div>
        <div class="proj-value">${fmtBytes(proj.bytesPerWeek)}</div>
      </div>
    </div>
  </section>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ORANGEBOX Vault Audit — ${latest?.week || "No data"}</title>
  <style>
    /* ── Reset & base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --carbon:   #0a0a0c;
      --carbon1:  #111115;
      --carbon2:  #18181e;
      --carbon3:  #222230;
      --chrome:   #b0b8c8;
      --chrome2:  #d0d8e8;
      --orange:   #FF6900;
      --orange2:  #FF9940;
      --gold:     #FFD700;
      --green:    #39d353;
      --red:      #ff4444;
      --white:    #f0f4ff;
      --mono:     'Courier New', Courier, monospace;
      --sans:     -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    }
    html, body {
      background: var(--carbon);
      color: var(--chrome2);
      font-family: var(--sans);
      min-height: 100vh;
      line-height: 1.55;
    }

    /* ── Layout ── */
    .shell {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 24px 80px;
    }

    /* ── Header ── */
    .masthead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--carbon3);
      padding-bottom: 20px;
      margin-bottom: 40px;
    }
    .wordmark {
      font-family: var(--mono);
      font-size: 13px;
      letter-spacing: 0.15em;
      color: var(--orange);
      text-transform: uppercase;
    }
    .wordmark span { color: var(--chrome); }
    .audit-label {
      font-family: var(--mono);
      font-size: 11px;
      color: var(--carbon3);
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    /* ── Hero ── */
    .hero {
      background: linear-gradient(135deg, var(--carbon1) 0%, var(--carbon2) 60%, #1a0e00 100%);
      border: 1px solid #2a1a00;
      border-left: 4px solid var(--orange);
      border-radius: 4px;
      padding: 36px 40px;
      margin-bottom: 48px;
    }
    .hero-headline {
      font-size: 15px;
      color: var(--chrome);
      margin-bottom: 18px;
      line-height: 1.6;
    }
    .hero-headline strong {
      color: var(--orange);
      font-size: 22px;
    }
    .hero-since {
      color: var(--chrome);
      font-size: 13px;
      opacity: 0.7;
    }
    .hero-metrics {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 24px;
      margin-top: 32px;
    }
    @media (max-width: 720px) {
      .hero-metrics { grid-template-columns: repeat(2, 1fr); }
    }
    .metric-card {
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--carbon3);
      border-radius: 4px;
      padding: 20px 18px;
    }
    .metric-label {
      font-family: var(--mono);
      font-size: 10px;
      color: var(--chrome);
      opacity: 0.6;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .metric-value {
      font-size: 36px;
      font-weight: 700;
      color: var(--orange2);
      letter-spacing: -0.02em;
      line-height: 1;
    }
    .metric-value.white { color: var(--white); }

    /* ── Sparklines section ── */
    .section-title {
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--orange);
      margin-bottom: 20px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--carbon3);
    }
    .sparks-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      margin-bottom: 48px;
    }
    @media (max-width: 720px) {
      .sparks-grid { grid-template-columns: 1fr; }
    }
    .spark-card {
      background: var(--carbon1);
      border: 1px solid var(--carbon3);
      border-radius: 4px;
      padding: 18px 20px;
    }
    .spark-title {
      font-family: var(--mono);
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--chrome);
      opacity: 0.55;
      margin-bottom: 10px;
    }
    .spark-card svg {
      display: block;
      width: 100%;
      height: 56px;
      overflow: visible;
    }

    /* ── WoW table ── */
    .wow-section { margin-bottom: 48px; }
    .wow-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .wow-table th {
      font-family: var(--mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--chrome);
      opacity: 0.55;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--carbon3);
    }
    .wow-table td {
      padding: 12px 12px;
      border-bottom: 1px solid var(--carbon2);
      color: var(--chrome2);
      vertical-align: top;
    }
    .wow-table tr:hover td { background: var(--carbon2); }
    .arrow { color: var(--orange); margin: 0 4px; font-size: 11px; }
    .pos { color: var(--green); font-weight: 600; }
    .neg { color: var(--red); font-weight: 600; }
    .concepts { font-size: 11px; }
    .concept-tag {
      display: inline-block;
      background: rgba(255,105,0,0.12);
      border: 1px solid rgba(255,105,0,0.3);
      border-radius: 2px;
      padding: 1px 6px;
      color: var(--orange2);
      font-size: 10px;
      margin: 2px 2px;
      font-family: var(--mono);
      letter-spacing: 0.05em;
    }
    .no-data {
      text-align: center;
      color: var(--chrome);
      opacity: 0.35;
      font-style: italic;
      padding: 32px;
    }

    /* ── Concept cloud ── */
    .cloud-section { margin-bottom: 48px; }
    .concept-cloud {
      background: var(--carbon1);
      border: 1px solid var(--carbon3);
      border-radius: 4px;
      padding: 28px 24px;
      line-height: 2.2;
    }
    .cloud-word {
      display: inline-block;
      color: var(--orange2);
      font-weight: 600;
      margin: 0 10px;
      cursor: default;
      transition: color 0.15s;
    }
    .cloud-word:hover { color: var(--gold); }
    .cloud-word sup {
      font-size: 9px;
      color: var(--chrome);
      opacity: 0.5;
      margin-left: 2px;
    }

    /* ── Entity bars ── */
    .entity-section { margin-bottom: 48px; }
    .entity-list { display: flex; flex-direction: column; gap: 10px; }
    .entity-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .entity-name {
      min-width: 180px;
      font-family: var(--mono);
      font-size: 12px;
      color: var(--chrome2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .entity-bar-wrap {
      flex: 1;
      height: 6px;
      background: var(--carbon3);
      border-radius: 3px;
      overflow: hidden;
    }
    .entity-bar {
      height: 100%;
      background: linear-gradient(90deg, var(--orange), var(--orange2));
      border-radius: 3px;
    }
    .entity-count {
      min-width: 32px;
      text-align: right;
      font-family: var(--mono);
      font-size: 11px;
      color: var(--chrome);
      opacity: 0.6;
    }

    /* ── Projection ── */
    .proj-section { margin-bottom: 48px; }
    .proj-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
    }
    @media (max-width: 900px) {
      .proj-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .proj-card {
      background: var(--carbon1);
      border: 1px solid var(--carbon3);
      border-radius: 4px;
      padding: 20px 16px;
      text-align: center;
    }
    .proj-label {
      font-family: var(--mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--chrome);
      opacity: 0.5;
      margin-bottom: 8px;
    }
    .proj-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--gold);
      letter-spacing: -0.02em;
    }
    .proj-value .unit {
      font-size: 14px;
      color: var(--chrome);
      opacity: 0.6;
      margin-left: 4px;
    }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid var(--carbon3);
      padding-top: 20px;
      margin-top: 48px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: var(--mono);
      font-size: 10px;
      color: var(--chrome);
      opacity: 0.35;
      letter-spacing: 0.08em;
    }
  </style>
</head>
<body>
<div class="shell">

  <header class="masthead">
    <div class="wordmark">ORANGE<span>BOX</span> · VAULT AUDIT</div>
    <div class="audit-label">Generated ${iso()}</div>
  </header>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-headline">
      Your vault has compounded by <strong>+${totalGrowthPct}%</strong> since week 1
      <span class="hero-since"> (${heroWeek})</span>.
    </div>
    <div class="hero-headline">
      <strong>${heroFacts}</strong> facts &nbsp;·&nbsp;
      <strong>${heroEntities}</strong> entities &nbsp;·&nbsp;
      <strong>${heroDocs}</strong> documents indexed &nbsp;·&nbsp;
      <strong>${heroDreams}</strong> dreams synthesized.
    </div>
    <div class="hero-metrics">
      <div class="metric-card">
        <div class="metric-label">Facts</div>
        <div class="metric-value">${heroFacts}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Entities</div>
        <div class="metric-value">${heroEntities}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Documents</div>
        <div class="metric-value white">${heroDocs}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Dreams</div>
        <div class="metric-value white">${heroDreams}</div>
      </div>
    </div>
  </section>

  <!-- Sparklines -->
  <section>
    <h2 class="section-title">Growth Trends</h2>
    <div class="sparks-grid">
      <div class="spark-card">
        <div class="spark-title">Facts</div>
        ${sparkFacts}
      </div>
      <div class="spark-card">
        <div class="spark-title">Documents</div>
        ${sparkDocs}
      </div>
      <div class="spark-card">
        <div class="spark-title">Entities</div>
        ${sparkEntities}
      </div>
      <div class="spark-card">
        <div class="spark-title">Lattice Density %</div>
        ${sparkDensity}
      </div>
    </div>
  </section>

  <!-- Week-over-week table -->
  <section class="wow-section">
    <h2 class="section-title">Week-over-Week Deltas</h2>
    ${deltas.length > 0 ? `
    <table class="wow-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Docs+</th>
          <th>Facts+</th>
          <th>Entities+</th>
          <th>Doc Growth</th>
          <th>Lattice Density</th>
          <th>New Concepts</th>
        </tr>
      </thead>
      <tbody>${wowRows}</tbody>
    </table>` : `<div class="no-data">No deltas yet — capture at least 2 snapshots in different weeks.</div>`}
  </section>

  <!-- Concept cloud -->
  <section class="cloud-section">
    <h2 class="section-title">Concept Cloud</h2>
    <div class="concept-cloud">
      ${conceptCloud || '<span style="opacity:0.35">No concept data</span>'}
    </div>
  </section>

  <!-- Entity bars -->
  <section class="entity-section">
    <h2 class="section-title">Top Entities</h2>
    <div class="entity-list">
      ${entityList || '<div class="no-data">No entity data</div>'}
    </div>
  </section>

  ${projBlock}

  <footer class="footer">
    <span>ORANGEBOX v4 · Vault Audit · ATOM-ORANGEBOX-VAULT-AUDIT-V4-2026-0516</span>
    <span>${latest?.week || "—"}</span>
  </footer>

</div>
</body>
</html>`;
}

// ─── SVG sparkline ────────────────────────────────────────────────────────────
// Pure SVG, no JS libs, no external deps.

function buildSparkline(values, color, label) {
  if (!values || values.length === 0) {
    return `<svg viewBox="0 0 400 56"><text x="8" y="32" fill="#444" font-size="11">No data</text></svg>`;
  }

  const W = 400;
  const H = 48;
  const PAD = 6;
  const pts = values.filter(v => typeof v === "number" && isFinite(v));
  if (pts.length === 0) return `<svg viewBox="0 0 ${W} ${H+8}"><text x="8" y="28" fill="#444" font-size="11">No data</text></svg>`;

  const minV = Math.min(...pts);
  const maxV = Math.max(...pts);
  const rng  = maxV - minV || 1;

  const coords = pts.map((v, i) => {
    const x = PAD + (i / Math.max(1, pts.length - 1)) * (W - PAD * 2);
    const y = PAD + ((maxV - v) / rng) * (H - PAD * 2);
    return [x, y];
  });

  const polyline = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  // Area fill path: line down to bottom, back along bottom
  const fillPath = [
    `M ${coords[0][0].toFixed(1)},${H}`,
    ...coords.map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`),
    `L ${coords[coords.length-1][0].toFixed(1)},${H}`,
    "Z",
  ].join(" ");

  const first = pts[0];
  const last  = pts[pts.length - 1];
  const dot   = coords[coords.length - 1];

  // Axis labels (first and last)
  const labelFirst = typeof first === "number" ? fmtSmall(first) : "";
  const labelLast  = typeof last  === "number" ? fmtSmall(last)  : "";

  const gradId = `sg_${label.replace(/\W/g, "_")}_${Math.random().toString(36).slice(2,6)}`;

  return `<svg viewBox="0 0 ${W} ${H + 18}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <path d="${fillPath}" fill="url(#${gradId})"/>
  <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${dot[0].toFixed(1)}" cy="${dot[1].toFixed(1)}" r="3.5" fill="${color}" opacity="0.9"/>
  <text x="4" y="${H + 14}" font-size="10" fill="#888" font-family="Courier New,monospace">${escHtml(labelFirst)}</text>
  <text x="${W - 4}" y="${H + 14}" font-size="10" fill="${color}" font-family="Courier New,monospace" text-anchor="end">${escHtml(labelLast)}</text>
</svg>`;
}

function fmtSmall(n) {
  if (!isFinite(n)) return "";
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + "k";
  if (n % 1 !== 0) return n.toFixed(1);
  return String(n);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(b) {
  b = b || 0;
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + " MB";
  if (b >= 1024)        return (b / 1024).toFixed(1) + " KB";
  return b + " B";
}

function fmtDensity(lattice, v) {
  const total = (lattice || 0) + (v || 0);
  if (!total) return "0";
  return Math.round((lattice / total) * 100 * 10) / 10;
}

function fmtDensityNum(lattice, v) {
  const total = (lattice || 0) + (v || 0);
  if (!total) return 0;
  return Math.round((lattice / total) * 100 * 10) / 10;
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Receipt emitter ──────────────────────────────────────────────────────────

async function emitReceipt(op, payload) {
  await ensureDir(RECEIPTS_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(RECEIPTS_DIR, `${ts}.json`);
  const receipt = {
    schema:    "vault-audit-receipt-v1",
    op,
    ts:        iso(),
    dataRoot:  DATA_ROOT,
    vaultDir:  VAULT_DIR,
    payload,
    sha256:    sha256(JSON.stringify(payload)),
  };
  await fs.writeFile(file, JSON.stringify(receipt, null, 2));
  console.log(`[vault-audit] receipt → ${file}`);
  return file;
}

// ─── Diff two specific weeks ──────────────────────────────────────────────────

async function runDiff(wk1, wk2) {
  const f1 = path.join(SNAPSHOTS_DIR, `${wk1}.json`);
  const f2 = path.join(SNAPSHOTS_DIR, `${wk2}.json`);
  let s1, s2;
  try { s1 = JSON.parse(await fs.readFile(f1, "utf8")); }
  catch { console.error(`[vault-audit] cannot read snapshot: ${f1}`); process.exit(1); }
  try { s2 = JSON.parse(await fs.readFile(f2, "utf8")); }
  catch { console.error(`[vault-audit] cannot read snapshot: ${f2}`); process.exit(1); }

  const delta = computeDelta(s1, s2);
  console.log(JSON.stringify(delta, null, 2));
  await emitReceipt("diff", { wk1, wk2, delta });
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function main() {
  // --diff mode
  if (DIFF_ARGS) {
    await runDiff(DIFF_ARGS[0], DIFF_ARGS[1]);
    return;
  }

  // --snapshot: capture now
  let freshSnap = null;
  if (DO_SNAPSHOT) {
    freshSnap = await captureSnapshot();
  }

  // --report or --export-html or --projection: need snapshots
  if (DO_REPORT || EXPORT_HTML || DO_PROJECTION) {
    const snaps = await loadSnapshots(WEEKS_BACK);

    if (snaps.length === 0) {
      console.log("[vault-audit] No snapshots found. Run --snapshot first.");
      return;
    }

    // Build deltas between consecutive snapshots
    const deltas = [];
    for (let i = 1; i < snaps.length; i++) {
      deltas.push(computeDelta(snaps[i - 1], snaps[i]));
    }

    // Projection
    const proj = DO_PROJECTION ? computeProjection(snaps) : null;

    if (DO_REPORT) {
      const md = buildMarkdownReport(snaps, deltas, proj);
      console.log(md);
      await emitReceipt("report", { weeks: snaps.length, snapshotWeeks: snaps.map(s => s.week) });
    }

    if (EXPORT_HTML) {
      const html = buildHtml(snaps, deltas, proj);
      const outPath = path.resolve(EXPORT_HTML);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, html, "utf8");
      console.log(`[vault-audit] HTML report → ${outPath}`);
      await emitReceipt("export-html", { path: outPath, weeks: snaps.length });
    }

    if (DO_PROJECTION && !DO_REPORT) {
      // Projection-only output
      if (proj) {
        console.log(JSON.stringify(proj, null, 2));
        console.log(`\n[vault-audit] At current rate, vault doubles in ${proj.weeksToDouble} weeks.`);
      } else {
        console.log("[vault-audit] Need at least 2 snapshots for projection.");
      }
    }
  }

  // No flags at all: print help
  if (!DO_SNAPSHOT && !DO_REPORT && !DO_PROJECTION && !EXPORT_HTML && !DIFF_ARGS) {
    console.log(`vault-audit.mjs — ORANGEBOX v4 Compounding Vault Audit

Usage:
  node vault-audit.mjs --snapshot               capture metrics now
  node vault-audit.mjs --report [--weeks=N]     last N weeks delta report (default 4)
  node vault-audit.mjs --diff <wk1> <wk2>       compare two specific weeks (e.g. 2026-W20 2026-W21)
  node vault-audit.mjs --export-html=<path>     render standalone HTML report
  node vault-audit.mjs --projection             linear extrapolation (requires ≥2 snapshots)
  node vault-audit.mjs --snapshot --report      capture then report immediately

Data root: ${DATA_ROOT}
Vault dir: ${VAULT_DIR}
Snapshots: ${SNAPSHOTS_DIR}
`);
  }
}

main().catch(e => {
  console.error("[vault-audit] FATAL", e);
  process.exit(1);
});
