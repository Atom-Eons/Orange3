/* prompt-registry.mjs - versioned prompt assets for ORANGEBOX pipelines. */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const PROMPT_REGISTRY_VERSION = "1.0.0";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, "..", "..");
const PROMPT_ROOT = path.join(ROOT, "prompts", "silent-canvas");

export const SILENT_CANVAS_PROMPT_KEYS = {
  creative: {
    key: "creative",
    version: "creative-brain/v1",
    path: path.join(PROMPT_ROOT, "creative-brain", "v1.md"),
  },
  interpreter: {
    key: "interpreter",
    version: "fast-interpreter/v1",
    path: path.join(PROMPT_ROOT, "fast-interpreter", "v1.md"),
  },
  repair: {
    key: "repair",
    version: "repair-interpreter/v1",
    path: path.join(PROMPT_ROOT, "repair-interpreter", "v1.md"),
  },
};

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function loadPromptAsset(spec) {
  const text = await fs.readFile(spec.path, "utf8");
  return {
    key: spec.key,
    version: spec.version,
    path: spec.path,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text),
    text,
  };
}

export async function loadSilentCanvasPrompts() {
  const [creative, interpreter, repair] = await Promise.all([
    loadPromptAsset(SILENT_CANVAS_PROMPT_KEYS.creative),
    loadPromptAsset(SILENT_CANVAS_PROMPT_KEYS.interpreter),
    loadPromptAsset(SILENT_CANVAS_PROMPT_KEYS.repair),
  ]);
  return {
    registry_version: PROMPT_REGISTRY_VERSION,
    creative,
    interpreter,
    repair,
    producer: {
      creative_prompt_version: creative.version,
      creative_prompt_sha256: creative.sha256,
      interpreter_prompt_version: interpreter.version,
      interpreter_prompt_sha256: interpreter.sha256,
      repair_prompt_version: repair.version,
      repair_prompt_sha256: repair.sha256,
    },
  };
}

export function promptEvidence(bundle) {
  return {
    registry_version: bundle.registry_version,
    creative: {
      version: bundle.creative.version,
      sha256: bundle.creative.sha256,
      path: bundle.creative.path,
      bytes: bundle.creative.bytes,
    },
    interpreter: {
      version: bundle.interpreter.version,
      sha256: bundle.interpreter.sha256,
      path: bundle.interpreter.path,
      bytes: bundle.interpreter.bytes,
    },
    repair: {
      version: bundle.repair.version,
      sha256: bundle.repair.sha256,
      path: bundle.repair.path,
      bytes: bundle.repair.bytes,
    },
  };
}
