import { queryWithGate } from "./k3-hybrid-search.ts";

export async function alphaMatch(query: string, limit = 10) {
  const result = await queryWithGate(query, limit);
  return {
    ok: true,
    status: "K3_ALPHA_MATCH_READY",
    query,
    candidates: result.candidates,
    selected: result.selected,
    rule: "K3 locates Cold Truth candidates; it does not speak as truth.",
  };
}
