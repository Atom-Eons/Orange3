#!/usr/bin/env node
/* intel-integration.mjs - Durable ORANGEBOX research/intel backlog.
 *
 * This is intentionally local and source-light: it preserves operator-supplied
 * research packets as integration candidates, without treating social posts as
 * verified production truth. Promotion still requires primary-source checks,
 * local prototypes, doctors, and receipts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
export const INTEL_CATALOG_PATH = path.join(ROOT, "docs", "ORANGEBOX_INTEL_INTEGRATION_BACKLOG_2026-05-18.json");

export async function loadIntelCatalog({ catalogPath = INTEL_CATALOG_PATH } = {}) {
  const raw = await fs.readFile(catalogPath, "utf8");
  return JSON.parse(raw);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export async function listIntel({ priority = null, domain = null, catalogPath = INTEL_CATALOG_PATH } = {}) {
  const catalog = await loadIntelCatalog({ catalogPath });
  const p = normalize(priority);
  const d = normalize(domain);
  let items = catalog.items || [];
  if (p) items = items.filter((item) => normalize(item.priority) === p);
  if (d) items = items.filter((item) => (item.domains || []).map(normalize).includes(d));
  return {
    ok: true,
    catalog_id: catalog.catalog_id,
    source_basis: catalog.source_basis,
    count: items.length,
    items,
  };
}

export async function buildIntelBrief({ priority = null, domain = null } = {}) {
  const out = await listIntel({ priority, domain });
  const lines = [
    "# ORANGEBOX Intel Integration Brief",
    "",
    `Catalog: ${out.catalog_id}`,
    "",
    "This is an operator-supplied research integration backlog. Items are candidates, not verified production claims. Promotion requires primary-source verification, local proof, and receipts.",
    "",
    `Items: ${out.count}`,
    "",
  ];
  for (const item of out.items) {
    lines.push(`## ${item.priority} - ${item.name}`);
    lines.push("");
    lines.push(`ID: \`${item.id}\``);
    lines.push(`Status: \`${item.status}\``);
    lines.push(`Domains: ${(item.domains || []).map((d) => `\`${d}\``).join(", ")}`);
    lines.push("");
    lines.push(item.summary);
    lines.push("");
    lines.push("Why it matters:");
    lines.push(item.why_it_matters);
    lines.push("");
    lines.push("ORANGEBOX integration:");
    for (const step of item.orangebox_integration || []) lines.push(`- ${step}`);
    lines.push("");
    lines.push("Proof needed:");
    for (const proof of item.proof_needed || []) lines.push(`- ${proof}`);
    lines.push("");
    lines.push(`Risk: ${item.risk}`);
    lines.push("");
  }
  return {
    ok: true,
    markdown: lines.join("\n"),
    count: out.count,
    catalog_id: out.catalog_id,
  };
}

export async function writeIntelBrief({ outPath = null, priority = null, domain = null } = {}) {
  const brief = await buildIntelBrief({ priority, domain });
  const target = outPath || path.join(ROOT, "docs", "ORANGEBOX_INTEL_INTEGRATION_BRIEF_2026-05-18.md");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, brief.markdown + "\n", "utf8");
  return {
    ok: true,
    path: target,
    count: brief.count,
    catalog_id: brief.catalog_id,
  };
}

export async function runIntelDoctor() {
  const catalog = await loadIntelCatalog();
  const items = catalog.items || [];
  const ids = new Set(items.map((item) => item.id));
  const requiredIds = [
    "delta-mem",
    "aevo-agentic-evolution",
    "nanoresearch-skill-bank",
    "multi-agent-sovereignty-gap",
    "horizon-generalization-macro-actions",
    "coordination-as-architecture",
    "clarification-timing-policy",
    "structured-skill-distillation",
    "claude-native-optimizer",
  ];
  const missingIds = requiredIds.filter((id) => !ids.has(id));
  const missingProof = items.filter((item) => !(item.proof_needed || []).length).map((item) => item.id);
  const missingIntegration = items.filter((item) => !(item.orangebox_integration || []).length).map((item) => item.id);
  const domains = new Set(items.flatMap((item) => item.domains || []));
  const generated = await writeIntelBrief();
  const ok = items.length >= 12
    && missingIds.length === 0
    && missingProof.length === 0
    && missingIntegration.length === 0
    && domains.has("coordination")
    && domains.has("memory")
    && generated.ok;
  return {
    ok,
    doctor: "orangebox-intel-integration-doctor/v1",
    catalog_path: INTEL_CATALOG_PATH,
    brief_path: generated.path,
    count: items.length,
    required_ids_missing: missingIds,
    missing_proof_needed: missingProof,
    missing_orangebox_integration: missingIntegration,
    domains: [...domains].sort(),
    source_basis: catalog.source_basis,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const verb = argv[0] || "list";
  const json = argv.includes("--json");
  const getFlag = (name) => {
    const prefix = `--${name}=`;
    const found = argv.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
  };
  let out;
  if (verb === "brief" || verb === "export") out = await writeIntelBrief({ priority: getFlag("priority"), domain: getFlag("domain") });
  else if (verb === "doctor") out = await runIntelDoctor();
  else out = await listIntel({ priority: getFlag("priority"), domain: getFlag("domain") });
  if (json) console.log(JSON.stringify(out, null, 2));
  else if (verb === "brief" || verb === "export") console.log(`wrote ${out.path} (${out.count} items)`);
  else if (verb === "doctor") console.log(`${out.ok ? "PASS" : "FAIL"} intel integration doctor (${out.count} items)`);
  else {
    console.log(`ORANGEBOX intel backlog (${out.count} items)`);
    for (const item of out.items) console.log(`${item.priority.padEnd(2)} ${item.id.padEnd(38)} ${item.name}`);
  }
  process.exit(out.ok ? 0 : 4);
}
