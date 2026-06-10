import { queryWithGate } from "./k3-hybrid-search.ts";

export async function alphaMatch(query: string, limit = 10) {
  const result = await queryWithGate(query, limit);
  return {
    ok: true,
    status: "K3_ALPHA_MATCH_READY",
    query,
    candidates: result.candidates,
    selected: result.selected,
    selected_paths: result.selected.map((item) => item.candidate.source_path),
    cold_truth_gate: "required_before_context",
    atom_smasher_packet_created: result.selected.length > 0,
    raw_db_text_used_as_truth: false,
    rule: "K3 locates Cold Truth candidates; it does not speak as truth.",
  };
}
