import fs from "node:fs";
import path from "node:path";
import { dataRoot, sha256 } from "../lib/core";

export const toolmeshArtifactRoot = path.join(dataRoot, "v3", "toolmesh", "artifacts");

export type ToolArtifactPointer = {
  path: string;
  uri: string;
  exists: boolean;
  sha256: string | null;
  sizeBytes: number;
  rawBytesIncluded: false;
};

export function describeArtifact(artifactPath: string): ToolArtifactPointer {
  fs.mkdirSync(toolmeshArtifactRoot, { recursive: true });
  const exists = fs.existsSync(artifactPath);
  if (!exists) {
    return { path: artifactPath, uri: `file://${artifactPath.replace(/\\/g, "/")}`, exists: false, sha256: null, sizeBytes: 0, rawBytesIncluded: false };
  }
  const bytes = fs.readFileSync(artifactPath);
  return {
    path: artifactPath,
    uri: `file://${artifactPath.replace(/\\/g, "/")}`,
    exists: true,
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
    rawBytesIncluded: false,
  };
}

export function validateArtifactPointer(pointer: ToolArtifactPointer): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (pointer.rawBytesIncluded !== false) failures.push("artifact pointer attempted to include raw bytes");
  if (!pointer.uri.startsWith("file://")) failures.push("artifact pointer must use file:// uri");
  if (pointer.exists && !pointer.sha256) failures.push("existing artifact pointer must include sha256");
  return { ok: failures.length === 0, failures };
}

export function planArtifactGarbageCollection(pointers: ToolArtifactPointer[]) {
  return {
    dryRun: true,
    candidates: pointers.filter((pointer) => pointer.exists && pointer.sizeBytes > 0),
    note: "Garbage collection is dry-run by default; deletion requires a separate receipt-backed operator action.",
  };
}
