import { sha256 } from "../lib/core.ts";

export function atomSmashPack(input: { query: string; source_path: string; content: string; authority_level: number; source_hash: string }) {
  const lines = input.content.split(/\r?\n/);
  const queryTerms = new Set(input.query.toLowerCase().match(/[a-z0-9_-]{3,}/g) || []);
  const selected = lines
    .map((line, index) => ({ line, line_number: index + 1 }))
    .filter((item) => [...queryTerms].some((term) => item.line.toLowerCase().includes(term)) || /^#{1,6}\s+/.test(item.line))
    .slice(0, 40);
  const packet = {
    packet_type: "atomsmasher-k3-cold-truth-packet",
    query: input.query,
    source_path: input.source_path,
    source_hash: input.source_hash,
    authority_level: input.authority_level,
    line_count: lines.length,
    selected_lines: selected,
    raw_history_included: false,
    packet_hash: "",
  };
  packet.packet_hash = sha256(JSON.stringify({ ...packet, packet_hash: "" }));
  return packet;
}
