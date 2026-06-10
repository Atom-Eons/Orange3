import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../lib/core.ts";
import { openK3Db } from "./k3-card-writer.ts";
import { coldTruthGate } from "./k3-cold-truth-gate.ts";
import { atomSmashPack } from "./k3-atomsmash-pack.ts";
import type { K3Candidate } from "./k3-types.ts";

function tokens(text: string) {
  return new Set(String(text || "").toLowerCase().match(/[a-z0-9_-]{3,}/g) || []);
}

function overlapScore(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return hit / Math.max(1, Math.min(a.size, b.size));
}

function parseJsonArray(value: string | null) {
  try { return JSON.parse(value || "[]"); } catch { return []; }
}

function sameRepoScore(row: Record<string, unknown>) {
  const sourcePath = String(row.source_path || "");
  const cardRepo = String(row.repo_root || "");
  const activeRoot = path.resolve(repoRoot).toLowerCase();
  const sourceLower = path.resolve(sourcePath || ".").toLowerCase();
  if (cardRepo && path.resolve(cardRepo).toLowerCase() === activeRoot) return 1;
  if (sourceLower.startsWith(activeRoot)) return 1;
  return 0;
}

function collapseDuplicateSources(candidates: K3Candidate[], limit: number) {
  const seen = new Set<string>();
  const out: K3Candidate[] = [];
  for (const candidate of candidates) {
    const sourceType = candidate.source_type.toLowerCase();
    const key = sourceType === "receipt"
      ? [candidate.title.toLowerCase(), sourceType, candidate.source_hash || candidate.card_id].join("|")
      : [candidate.title.toLowerCase(), sourceType].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= limit) break;
  }
  return out;
}

export async function hybridSearch(query: string, limit = 10) {
  const db = await openK3Db();
  const qTokens = tokens(query);
  const rows = db.query("SELECT * FROM memory_card WHERE COALESCE(active, 1) = 1").all() as any[];
  const candidates: K3Candidate[] = rows.map((row) => {
    const aliases = parseJsonArray(row.aliases_json);
    const tags = parseJsonArray(row.tags_json);
    const haystack = tokens([row.title, row.search_text, ...aliases, ...tags].join(" "));
    const exact = [row.title, ...aliases].some((item) => String(item).toLowerCase() === query.toLowerCase()) ? 1 : 0;
    const aliasScore = Math.max(exact, ...aliases.map((alias: string) => {
      const lower = String(alias).toLowerCase();
      return lower.includes(query.toLowerCase()) || query.toLowerCase().includes(lower) ? 1 : overlapScore(qTokens, tokens(alias));
    }), 0);
    const lexicalScore = overlapScore(qTokens, haystack);
    const authorityScore = Math.min(1, Number(row.authority_level || 0) / 4);
    const mtime = Date.parse(row.source_mtime || "");
    const ageDays = Number.isFinite(mtime) ? (Date.now() - mtime) / 86_400_000 : 999;
    const recencyScore = Math.max(0, 1 - ageDays / 365);
    const stalePenalty = ageDays > 365 ? 0.08 : 0;
    const failedDoctorPenalty = /failed|not_green|needs_work/i.test(row.search_text || "") ? 0.1 : 0;
    const vectorScore = 0; // Vector adapter is doctor-gated; W1 is pointer/alias/FTS safe.
    const activeRepoScore = sameRepoScore(row);
    const sourceExists = fs.existsSync(String(row.source_path || ""));
    const finalScore = Math.max(0,
      exact * 0.25 +
      aliasScore * 0.25 +
      lexicalScore * 0.25 +
      vectorScore * 0.15 +
      authorityScore * 0.08 +
      recencyScore * 0.02 +
      activeRepoScore * 0.04 -
      stalePenalty -
      failedDoctorPenalty
    );
    return {
      card_id: row.card_id,
      source_path: row.source_path,
      source_type: row.source_type,
      source_hash: row.source_hash,
      authority_level: Number(row.authority_level || 0),
      title: row.title,
      repo_root: row.repo_root,
      aliases,
      tags,
      exact_score: exact,
      alias_score: aliasScore,
      lexical_score: lexicalScore,
      vector_score: vectorScore,
      authority_score: authorityScore,
      recency_score: recencyScore,
      stale_penalty: stalePenalty,
      failed_doctor_penalty: failedDoctorPenalty,
      active_repo_score: activeRepoScore,
      source_exists: sourceExists,
      final_score: finalScore,
      cold_truth_gate: "not_run",
    };
  }).filter((c) => c.final_score > 0)
    .sort((a, b) => b.final_score - a.final_score);
  return collapseDuplicateSources(candidates, limit);
}

export async function queryWithGate(query: string, limit = 10) {
  const candidates = await hybridSearch(query, limit);
  const selected = [];
  for (const candidate of candidates.slice(0, 3)) {
    const gate = coldTruthGate(candidate);
    if (gate.ok) {
      candidate.cold_truth_gate = "passed";
      selected.push({
        candidate,
        atom_smasher_packet: atomSmashPack({
          query,
          source_path: candidate.source_path,
          content: gate.content,
          authority_level: candidate.authority_level,
          source_hash: gate.source_hash,
        }),
      });
    } else {
      candidate.cold_truth_gate = "failed";
      candidate.gate_reason = gate.reason;
    }
  }
  return { candidates, selected };
}
