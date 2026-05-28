/* design-state.mjs - v6.3.0-alpha.8
 * Canonical project design-state projection for Silent Canvas.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
}
function projectHash(workspace) {
  return crypto.createHash("sha256").update(path.resolve(workspace || ".")).digest("hex").slice(0, 16);
}
function stateDir(workspace) {
  return path.join(dataRoot(), "projects", projectHash(workspace), "state");
}
function statePath(workspace) {
  return path.join(stateDir(workspace), "design-state.json");
}

export function defaultDesignState(workspace) {
  return {
    schema_version: 1,
    workspace: path.resolve(workspace || "."),
    updated_at: new Date().toISOString(),
    doctrine: "Silent Canvas: high-value text, visual telemetry for structural mutation, calm premium AE See-Suite.",
    tokens: {
      palette: ["obsidian", "warm orange", "cyan signal", "soft green", "muted slate"],
      typography: ["compact monospace labels", "clear operator prose", "no hero-scale type inside tools"],
      motion: ["smooth rect lerp", "pulse on active work", "ripple on created state", "no noisy looping animation"],
    },
    components: [
      "Progress Dashboard",
      "Visual Telemetry Canvas",
      "Snapshot Scrubber",
      "Benefits Panel",
      "Freeze All control",
    ],
    constraints: [
      "Do not explain every change in chat.",
      "Do not show raw JSON to a non-coder operator unless in observatory/debug mode.",
      "Canvas changes should be visible through motion and receipts."
    ],
  };
}

export async function loadDesignState(workspace) {
  await fs.mkdir(stateDir(workspace), { recursive: true });
  if (!fsSync.existsSync(statePath(workspace))) return defaultDesignState(workspace);
  try {
    return JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
  } catch {
    return defaultDesignState(workspace);
  }
}

export async function saveDesignState(workspace, state) {
  await fs.mkdir(stateDir(workspace), { recursive: true });
  const stamped = { ...defaultDesignState(workspace), ...(state || {}), updated_at: new Date().toISOString() };
  await fs.writeFile(statePath(workspace), JSON.stringify(stamped, null, 2));
  return stamped;
}
