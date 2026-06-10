import fs from "node:fs";
import { readText, sha256 } from "../lib/core.ts";
import type { K3Candidate } from "./k3-types.ts";

export function coldTruthGate(candidate: K3Candidate) {
  if (!candidate.source_path || !fs.existsSync(candidate.source_path)) {
    return { ok: false, gate: "failed" as const, reason: "source_path_missing", candidate };
  }
  if (/chat[_-]?archive/i.test(candidate.source_type || "")) {
    return { ok: false, gate: "failed" as const, reason: "chat_archive_disabled_in_w1", candidate };
  }
  const text = readText(candidate.source_path);
  const currentHash = sha256(text);
  const hashMatches = !candidate.source_hash || candidate.source_hash === currentHash;
  if (!hashMatches) {
    return { ok: false, gate: "failed" as const, reason: "source_hash_changed", candidate, current_hash: currentHash };
  }
  return {
    ok: true,
    gate: "passed" as const,
    reason: "physical_source_opened",
    candidate,
    source_hash: currentHash,
    source_bytes: Buffer.byteLength(text),
    line_count: text.split(/\r?\n/).length,
    raw_db_text_used_as_truth: false,
    opened_from_disk: true,
    content: text,
  };
}
