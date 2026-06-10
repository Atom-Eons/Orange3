import fs from "node:fs";
import path from "node:path";
import { dataRoot, sha256 } from "../lib/core";

export const toolmeshArtifactRoot = path.join(dataRoot, "v3", "toolmesh", "artifacts");

export type ToolArtifactPointer = {
  artifact_id: string;
  path: string;
  uri: string;
  exists: boolean;
  sha256: string | null;
  mime: string;
  sizeBytes: number;
  created_at: string;
  tool: string;
  receipt_id: string | null;
  retentionClass: "ephemeral" | "session" | "project" | "campaign" | "permanent";
  metadataSidecar: boolean;
  rawBytesIncluded: false;
};

function fileUri(file: string): string {
  return `file://${path.resolve(file).replace(/\\/g, "/")}`;
}

function mimeFromPath(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".json") return "application/json";
  if (ext === ".txt" || ext === ".md") return "text/plain";
  return "application/octet-stream";
}

export function describeArtifact(
  artifactPath: string,
  options: {
    tool?: string;
    receiptId?: string | null;
    retentionClass?: ToolArtifactPointer["retentionClass"];
    artifactId?: string;
  } = {},
): ToolArtifactPointer {
  fs.mkdirSync(toolmeshArtifactRoot, { recursive: true });
  const resolved = path.resolve(artifactPath);
  const exists = fs.existsSync(artifactPath);
  const artifact_id = options.artifactId || `asset_${sha256(resolved).slice(0, 16)}`;
  if (!exists) {
    return {
      artifact_id,
      path: resolved,
      uri: fileUri(resolved),
      exists: false,
      sha256: null,
      mime: mimeFromPath(resolved),
      sizeBytes: 0,
      created_at: new Date().toISOString(),
      tool: options.tool || "unknown",
      receipt_id: options.receiptId ?? null,
      retentionClass: options.retentionClass || "ephemeral",
      metadataSidecar: true,
      rawBytesIncluded: false,
    };
  }
  const bytes = fs.readFileSync(resolved);
  return {
    artifact_id,
    path: resolved,
    uri: fileUri(resolved),
    exists: true,
    sha256: sha256(bytes),
    mime: mimeFromPath(resolved),
    sizeBytes: bytes.length,
    created_at: new Date().toISOString(),
    tool: options.tool || "unknown",
    receipt_id: options.receiptId ?? null,
    retentionClass: options.retentionClass || "session",
    metadataSidecar: true,
    rawBytesIncluded: false,
  };
}

export function validateArtifactPointer(pointer: ToolArtifactPointer): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (pointer.rawBytesIncluded !== false) failures.push("artifact pointer attempted to include raw bytes");
  if (!pointer.uri.startsWith("file://")) failures.push("artifact pointer must use file:// uri");
  if (pointer.exists && !pointer.sha256) failures.push("existing artifact pointer must include sha256");
  if (!pointer.artifact_id) failures.push("artifact pointer must include artifact_id");
  if (!pointer.mime) failures.push("artifact pointer must include MIME type");
  if (!pointer.retentionClass) failures.push("artifact pointer must include retention class");
  if (pointer.metadataSidecar !== true) failures.push("artifact pointer must declare metadata sidecar");
  return { ok: failures.length === 0, failures };
}

export function planArtifactGarbageCollection(pointers: ToolArtifactPointer[]) {
  return {
    dryRun: true,
    candidates: pointers.filter((pointer) => pointer.exists && pointer.sizeBytes > 0),
    note: "Garbage collection is dry-run by default; deletion requires a separate receipt-backed operator action.",
  };
}
