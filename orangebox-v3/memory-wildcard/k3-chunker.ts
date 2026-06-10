import { sha256 } from "./k3-hash.ts";

export function chunkTextPointerOnly(text: string, maxLines = 60) {
  const lines = String(text || "").split(/\r?\n/);
  const chunks = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    const slice = lines.slice(i, i + maxLines).join("\n");
    chunks.push({
      chunk_index: chunks.length,
      byte_start: Buffer.byteLength(lines.slice(0, i).join("\n")),
      byte_end: Buffer.byteLength(lines.slice(0, i + maxLines).join("\n")),
      line_start: i + 1,
      line_end: Math.min(lines.length, i + maxLines),
      chunk_hash: sha256(slice),
      heading_path: lines.slice(Math.max(0, i - 8), i + maxLines).find((line) => /^#{1,6}\s+/.test(line)) || "",
    });
  }
  return chunks.length ? chunks : [{ chunk_index: 0, byte_start: 0, byte_end: 0, line_start: 1, line_end: 1, chunk_hash: sha256(""), heading_path: "" }];
}
