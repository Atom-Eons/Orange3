import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Step } from "./engine.ts";

export type ContextChunkKind = "file" | "step_output" | "step_hash" | "step_error";

export interface ContextResolver {
  getStepOutput(stepId: string): string | null;
  getStepHash(stepId: string): string | null;
  getStepError(stepId: string): string | null;
}

export interface ContextChunk {
  ref: string;
  kind: ContextChunkKind;
  bytes: number;
  sha256: string;
  text: string;
}

export interface ContextPack {
  step_id: string;
  refs: string[];
  chunks: ContextChunk[];
  text: string;
  total_bytes: number;
  sha256: string;
  max_bytes: number;
}

export interface ContextPackOptions {
  rootDir: string;
  resolver: ContextResolver;
  maxTotalBytes?: number;
}

const DEFAULT_MAX_TOTAL_BYTES = 256_000;
const STEP_REF = /^([A-Za-z0-9_.-]+)\.(output|hash|error)$/;

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function byteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function safeResolve(rootDir: string, ref: string) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, ref);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Context reference escapes manifest root: ${ref}`);
  }
  return resolved;
}

function makeChunk(ref: string, kind: ContextChunkKind, text: string): ContextChunk {
  return {
    ref,
    kind,
    bytes: byteLength(text),
    sha256: sha256(text),
    text,
  };
}

function resolveStepRef(ref: string, resolver: ContextResolver) {
  const match = STEP_REF.exec(ref);
  if (!match) return null;
  const [, stepId, field] = match;
  if (field === "output") return { kind: "step_output" as const, text: resolver.getStepOutput(stepId) };
  if (field === "hash") return { kind: "step_hash" as const, text: resolver.getStepHash(stepId) };
  return { kind: "step_error" as const, text: resolver.getStepError(stepId) };
}

export async function buildExplicitContextPack(stepId: string, step: Step, options: ContextPackOptions): Promise<ContextPack> {
  const maxBytes = step.context_max_bytes || options.maxTotalBytes || DEFAULT_MAX_TOTAL_BYTES;
  const chunks: ContextChunk[] = [];

  for (const ref of step.explicit_context) {
    const stepRef = resolveStepRef(ref, options.resolver);
    if (stepRef) {
      if (!stepRef.text) throw new Error(`${stepId} requested missing explicit context: ${ref}`);
      chunks.push(makeChunk(ref, stepRef.kind, stepRef.text));
      continue;
    }

    const filePath = safeResolve(options.rootDir, ref);
    const text = await fs.readFile(filePath, "utf8");
    chunks.push(makeChunk(ref, "file", text));
  }

  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  if (totalBytes > maxBytes) {
    throw new Error(`${stepId} explicit context is ${totalBytes} bytes, above cap ${maxBytes}.`);
  }

  const text = chunks.map((chunk) => `--- ${chunk.ref} (${chunk.kind}, sha256=${chunk.sha256}) ---\n${chunk.text}`).join("\n\n");
  return {
    step_id: stepId,
    refs: [...step.explicit_context],
    chunks,
    text,
    total_bytes: totalBytes,
    sha256: sha256(text),
    max_bytes: maxBytes,
  };
}

export function summarizeContextPack(pack: ContextPack) {
  return {
    step_id: pack.step_id,
    refs: pack.refs,
    total_bytes: pack.total_bytes,
    sha256: pack.sha256,
    max_bytes: pack.max_bytes,
    chunks: pack.chunks.map((chunk) => ({
      ref: chunk.ref,
      kind: chunk.kind,
      bytes: chunk.bytes,
      sha256: chunk.sha256,
    })),
  };
}
