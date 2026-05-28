#!/usr/bin/env node
/* react-see-suite-css-sweep.mjs - proof-time CSS parameter sweeps for state-atlas fidelity. */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runReactSeeSuite72StateProof } from "./react-see-suite-72-state-proof.mjs";
import { runReactSeeSuitePixelCompare } from "./react-see-suite-pixel-compare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PROOF_DIR = path.join(ROOT, "proof");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DEFAULT_BANK_ROOT = "C:\\Users\\a\\AppData\\Local\\Temp\\ae-see-suite-mockup-bank-v2";

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const args = new Map();
  for (const arg of argv) {
    const [key, ...rest] = arg.split("=");
    args.set(key, rest.length ? rest.join("=") : "1");
  }
  return args;
}

function parseStateIds(value) {
  if (!value) return ["37"];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.padStart(2, "0"));
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function compact(value, max = 1200) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function state37Candidates() {
  const candidates = [];
  for (const opacity of [0.38, 0.42, 0.46]) {
    for (const saturate of [0.58, 0.68, 0.78]) {
      for (const brightness of [0.76, 0.82, 0.9]) {
        candidates.push({
          id: `s37-panels-o${opacity}-s${saturate}-b${brightness}`.replace(/\./g, "p"),
          description: `State 37 floating panel opacity ${opacity}, saturate ${saturate}, brightness ${brightness}`,
          css: `
.app-shell--state-37 .floating-panel-layer {
  opacity: ${opacity};
  filter: saturate(${saturate}) brightness(${brightness});
}
`,
        });
      }
    }
  }

  for (const alpha of [0.06, 0.1, 0.14, 0.18]) {
    candidates.push({
      id: `s37-magenta-veil-${String(alpha).replace(".", "p")}`,
      description: `State 37 violet/magenta atmosphere veil ${alpha}`,
      css: `
.app-shell--state-37::before {
  background:
    radial-gradient(circle at 50% 34%, rgba(240, 68, 255, ${alpha}), transparent 34%),
    radial-gradient(circle at 72% 16%, rgba(47, 252, 255, ${Math.max(0.04, alpha - 0.04)}), transparent 24%),
    radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.18) 55%, rgba(0, 0, 0, 0.82) 100%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 18%, rgba(47, 252, 255, 0.025));
}
`,
    });
  }

  for (const titleSize of [31, 32, 34, 35]) {
    candidates.push({
      id: `s37-banner-title-${titleSize}`,
      description: `State 37 banner title font ${titleSize}px`,
      css: `
.app-shell--state-37 .state-choreography__banner strong {
  font-size: ${titleSize}px;
}
`,
    });
  }

  for (const [name, blue, violet, bottom] of [
    ["drawer-blue-lift-a", 0.16, 0.08, 0.08],
    ["drawer-blue-lift-b", 0.22, 0.1, 0.12],
    ["drawer-blue-lift-c", 0.28, 0.12, 0.16],
    ["drawer-violet-bottom-a", 0.14, 0.18, 0.18],
    ["drawer-violet-bottom-b", 0.18, 0.24, 0.24],
    ["drawer-violet-bottom-c", 0.22, 0.3, 0.3],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 drawer source-atlas backplate ${name}`,
      css: `
.app-shell--state-37 .drawer-shell {
  background:
    radial-gradient(circle at 100% 18%, rgba(47,252,255,${blue}), transparent 34%),
    radial-gradient(circle at 52% 92%, rgba(87,92,255,${violet}), transparent 30%),
    radial-gradient(circle at 88% 78%, rgba(47,252,255,${bottom}), transparent 26%),
    linear-gradient(180deg, rgba(7, 13, 34, 0.9), rgba(7, 8, 30, 0.96));
}
`,
    });
  }

  for (const [name, border, glow, inset] of [
    ["drawer-border-a", 0.82, 0.22, 0.16],
    ["drawer-border-b", 0.96, 0.28, 0.2],
    ["drawer-border-c", 1, 0.36, 0.24],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 drawer cyan edge ${name}`,
      css: `
.app-shell--state-37 .drawer-shell {
  border-color: rgba(47, 252, 255, ${border});
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14),
    inset 0 0 42px rgba(47,252,255,${inset}),
    0 0 0 1px rgba(47,252,255,0.44),
    0 0 86px rgba(47,252,255,${glow}),
    0 28px 90px rgba(0,0,0,0.42);
}
`,
    });
  }

  for (const [name, brightness, saturate] of [
    ["drawer-cards-lift-a", 1.08, 1.08],
    ["drawer-cards-lift-b", 1.16, 1.14],
    ["drawer-cards-lift-c", 1.24, 1.2],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 source queue cards lift ${name}`,
      css: `
.app-shell--state-37 .agent-card--source-list {
  filter: brightness(${brightness}) saturate(${saturate});
}
`,
    });
  }

  for (const [name, border, glow, cardBrightness, cardSaturate] of [
    ["drawer-cards-border-a", 0.82, 0.22, 1.24, 1.2],
    ["drawer-cards-border-b", 0.96, 0.28, 1.24, 1.2],
    ["drawer-cards-border-c", 1, 0.36, 1.24, 1.2],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 cards plus cyan edge ${name}`,
      css: `
.app-shell--state-37 .agent-card--source-list {
  filter: brightness(${cardBrightness}) saturate(${cardSaturate});
}
.app-shell--state-37 .drawer-shell {
  border-color: rgba(47, 252, 255, ${border});
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14),
    inset 0 0 42px rgba(47,252,255,0.2),
    0 0 0 1px rgba(47,252,255,0.44),
    0 0 86px rgba(47,252,255,${glow}),
    0 28px 90px rgba(0,0,0,0.42);
}
`,
    });
  }

  for (const [name, bannerAlpha, borderAlpha, cardBrightness] of [
    ["banner-cards-a", 0.74, 0.78, 1.24],
    ["banner-cards-b", 0.82, 0.86, 1.24],
    ["banner-cards-c", 0.9, 0.94, 1.24],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 banner blue body plus cards ${name}`,
      css: `
.app-shell--state-37 .agent-card--source-list {
  filter: brightness(${cardBrightness}) saturate(1.2);
}
.app-shell--state-37 .state-choreography__banner {
  background:
    radial-gradient(circle at 8% 50%, rgba(47,252,255,0.18), transparent 24%),
    linear-gradient(90deg, rgba(5, 11, 30, ${bannerAlpha}), rgba(9, 13, 42, ${bannerAlpha}));
  border-color: rgba(47, 252, 255, ${borderAlpha});
  box-shadow:
    0 0 0 1px rgba(47,252,255,0.28),
    0 0 42px rgba(47,252,255,0.18),
    inset 0 0 34px rgba(47,252,255,0.1);
}
`,
    });
  }

  for (const [name, opacity, brightness, saturate] of [
    ["assistant-dim-a", 0.42, 0.68, 0.82],
    ["assistant-dim-b", 0.22, 0.54, 0.7],
    ["assistant-hidden", 0, 0.4, 0.5],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 ambient assistant bubble ${name}`,
      css: `
.app-shell--state-37 .ambient-assistant-bubble {
  opacity: ${opacity};
  filter: brightness(${brightness}) saturate(${saturate});
}
`,
    });
  }

  for (const [name, width, glow, inset] of [
    ["focus-cyan-line-a", 2, 0.42, 0.16],
    ["focus-cyan-line-b", 2, 0.54, 0.22],
    ["focus-cyan-line-c", 3, 0.48, 0.2],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 central focus frame cyan line ${name}`,
      css: `
.app-shell--state-37 .state-choreography__focus-frame.focus-agents,
.app-shell--state-37 .state-choreography__focus-frame.focus-core {
  border-width: ${width}px;
  border-color: rgba(47, 252, 255, 1);
  box-shadow:
    0 0 0 1px rgba(47, 252, 255, 0.22),
    0 0 44px rgba(47, 252, 255, ${glow}),
    inset 0 0 48px rgba(47, 252, 255, ${inset});
}
`,
    });
  }

  for (const [name, topCyan, centerBlue, bottomCyan] of [
    ["drawer-bottom-glow-a", 0.08, 0.1, 0.12],
    ["drawer-bottom-glow-b", 0.1, 0.12, 0.18],
    ["drawer-bottom-glow-c", 0.12, 0.14, 0.24],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 drawer lower source glow ${name}`,
      css: `
.app-shell--state-37 .drawer-shell {
  background:
    radial-gradient(circle at 92% 8%, rgba(47, 252, 255, ${topCyan}), transparent 28%),
    radial-gradient(circle at 58% 58%, rgba(87, 92, 255, ${centerBlue}), transparent 36%),
    radial-gradient(circle at 50% 102%, rgba(47, 252, 255, ${bottomCyan}), transparent 34%),
    linear-gradient(180deg, rgba(7, 13, 34, 0.9), rgba(7, 8, 30, 0.95));
}
`,
    });
  }

  for (const [name, backgroundAlpha, borderAlpha, glow] of [
    ["banner-cyan-edge-a", 0.68, 0.86, 0.18],
    ["banner-cyan-edge-b", 0.74, 0.96, 0.24],
    ["banner-cyan-edge-c", 0.8, 1, 0.3],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 banner cyan source edge ${name}`,
      css: `
.app-shell--state-37 .state-choreography__banner {
  background:
    radial-gradient(circle at 7% 50%, rgba(47, 252, 255, 0.2), transparent 28%),
    linear-gradient(90deg, rgba(5, 11, 30, ${backgroundAlpha}), rgba(9, 13, 42, ${backgroundAlpha}));
  border-color: rgba(47, 252, 255, ${borderAlpha});
  box-shadow:
    0 0 0 1px rgba(47, 252, 255, 0.32),
    0 0 44px rgba(47, 252, 255, ${glow}),
    inset 0 0 34px rgba(47, 252, 255, 0.12);
}
`,
    });
  }

  for (const [name, width, frameGlow, bottomCyan, bannerGlow] of [
    ["focus-drawer-banner-a", 2, 0.42, 0.12, 0.18],
    ["focus-drawer-banner-b", 2, 0.54, 0.18, 0.24],
    ["focus-drawer-banner-c", 3, 0.48, 0.24, 0.3],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 combined cyan frame, drawer bottom, and banner ${name}`,
      css: `
.app-shell--state-37 .state-choreography__focus-frame.focus-agents,
.app-shell--state-37 .state-choreography__focus-frame.focus-core {
  border-width: ${width}px;
  border-color: rgba(47, 252, 255, 1);
  box-shadow:
    0 0 0 1px rgba(47, 252, 255, 0.22),
    0 0 44px rgba(47, 252, 255, ${frameGlow}),
    inset 0 0 48px rgba(47, 252, 255, 0.2);
}
.app-shell--state-37 .drawer-shell {
  background:
    radial-gradient(circle at 92% 8%, rgba(47, 252, 255, 0.1), transparent 28%),
    radial-gradient(circle at 58% 58%, rgba(87, 92, 255, 0.12), transparent 36%),
    radial-gradient(circle at 50% 102%, rgba(47, 252, 255, ${bottomCyan}), transparent 34%),
    linear-gradient(180deg, rgba(7, 13, 34, 0.9), rgba(7, 8, 30, 0.95));
}
.app-shell--state-37 .state-choreography__banner {
  border-color: rgba(47, 252, 255, 1);
  box-shadow:
    0 0 0 1px rgba(47, 252, 255, 0.32),
    0 0 44px rgba(47, 252, 255, ${bannerGlow}),
    inset 0 0 34px rgba(47, 252, 255, 0.12);
}
`,
    });
  }

  for (const [name, opacity, brightness, saturate] of [
    ["assistant-bright-a", 0.78, 1.18, 1.18],
    ["assistant-bright-b", 0.92, 1.34, 1.26],
    ["assistant-bright-c", 1, 1.48, 1.36],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 ambient assistant source lift ${name}`,
      css: `
.app-shell--state-37 .ambient-assistant-bubble {
  opacity: ${opacity};
  filter: brightness(${brightness}) saturate(${saturate});
}
.app-shell--state-37 .ambient-assistant-bubble::before,
.app-shell--state-37 .ambient-assistant-bubble::after {
  opacity: ${Math.min(1, opacity + 0.08)};
}
`,
    });
  }

  for (const [name, topOpacity, railBrightness, panelOpacity] of [
    ["top-panel-dim-a", 0.78, 0.86, 0.38],
    ["top-panel-dim-b", 0.66, 0.78, 0.34],
    ["top-panel-dim-c", 0.56, 0.7, 0.3],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 top rail and panel dim ${name}`,
      css: `
.app-shell--state-37 .top-mode-rail {
  opacity: ${topOpacity};
  filter: brightness(${railBrightness}) saturate(0.86);
}
.app-shell--state-37 .floating-panel-layer {
  opacity: ${panelOpacity};
  filter: saturate(0.72) brightness(0.72);
}
`,
    });
  }

  for (const [name, alpha, glow] of [
    ["drawer-after-glow-a", 0.14, 0.22],
    ["drawer-after-glow-b", 0.2, 0.3],
    ["drawer-after-glow-c", 0.26, 0.38],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 drawer lower overlay glow ${name}`,
      css: `
.app-shell--state-37 .drawer-shell::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 48%;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 52% 96%, rgba(47, 252, 255, ${alpha}), transparent 42%),
    radial-gradient(ellipse at 90% 72%, rgba(139, 92, 255, ${alpha * 0.8}), transparent 36%);
  box-shadow: inset 0 -80px 120px rgba(47, 252, 255, ${glow * 0.3});
}
`,
    });
  }

  for (const [name, blue, border, glow] of [
    ["banner-blue-fill-a", 0.1, 0.92, 0.18],
    ["banner-blue-fill-b", 0.15, 1, 0.22],
    ["banner-blue-fill-c", 0.2, 1, 0.28],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 banner blue fill ${name}`,
      css: `
.app-shell--state-37 .state-choreography__banner {
  background:
    radial-gradient(circle at 8% 50%, rgba(47, 252, 255, 0.18), transparent 26%),
    radial-gradient(ellipse at 60% 55%, rgba(47, 252, 255, ${blue}), transparent 56%),
    linear-gradient(90deg, rgba(5, 11, 30, 0.72), rgba(9, 13, 42, 0.78));
  border-color: rgba(47, 252, 255, ${border});
  box-shadow:
    0 0 0 1px rgba(47, 252, 255, 0.32),
    0 0 44px rgba(47, 252, 255, ${glow}),
    inset 0 0 34px rgba(47, 252, 255, 0.12);
}
`,
    });
  }

  for (const [name, shellAlpha, shellGlow, chatBoost] of [
    ["shell-violet-lift-a", 0.62, 0.1, 1.08],
    ["shell-violet-lift-b", 0.72, 0.14, 1.16],
    ["shell-violet-lift-c", 0.82, 0.18, 1.24],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 left rail and composer source violet lift ${name}`,
      css: `
.app-shell--state-37 .left-rail.glass,
.app-shell--state-37 .chat-dock.glass {
  border-color: rgba(134, 124, 255, 0.24);
  background:
    radial-gradient(circle at 22% 12%, rgba(47, 252, 255, ${shellGlow}), transparent 28%),
    radial-gradient(circle at 12% 72%, rgba(240, 68, 255, ${shellGlow * 0.72}), transparent 34%),
    linear-gradient(180deg, rgba(24, 18, 70, ${shellAlpha}), rgba(13, 10, 44, ${shellAlpha + 0.08}));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 0 58px rgba(87, 92, 255, ${shellGlow}),
    0 22px 88px rgba(0, 0, 0, 0.42);
}
.app-shell--state-37 .chat-dock.glass {
  filter: brightness(${chatBoost}) saturate(1.18) hue-rotate(8deg);
}
`,
    });
  }

  for (const [name, brightness, saturate, hue] of [
    ["field-violet-grade-a", 0.94, 1.16, 8],
    ["field-violet-grade-b", 0.9, 1.28, 12],
    ["field-violet-grade-c", 0.86, 1.38, 16],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 flow field source color grade ${name}`,
      css: `
.app-shell--state-37 .flow-field {
  filter: brightness(${brightness}) saturate(${saturate}) hue-rotate(${hue}deg);
}
.app-shell--state-37 .state-choreography__focus-frame.focus-agents,
.app-shell--state-37 .state-choreography__focus-frame.focus-core {
  background:
    radial-gradient(circle at 53% 49%, rgba(240, 68, 255, 0.44), transparent 10%),
    radial-gradient(circle at 54% 50%, rgba(87, 92, 255, 0.34), transparent 24%),
    radial-gradient(circle at 22% 31%, rgba(47, 252, 255, 0.16), transparent 18%),
    radial-gradient(circle at 82% 29%, rgba(47, 252, 255, 0.14), transparent 18%),
    linear-gradient(145deg, rgba(8, 7, 36, 0.18), rgba(26, 18, 74, 0.28));
}
`,
    });
  }

  for (const [name, shellAlpha, shellGlow, brightness, saturate, hue] of [
    ["chrome-field-a", 0.68, 0.12, 0.92, 1.2, 10],
    ["chrome-field-b", 0.76, 0.15, 0.9, 1.3, 13],
    ["chrome-field-c", 0.84, 0.18, 0.88, 1.38, 16],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 combined shell and field source grade ${name}`,
      css: `
.app-shell--state-37 .left-rail.glass,
.app-shell--state-37 .chat-dock.glass {
  border-color: rgba(134, 124, 255, 0.24);
  background:
    radial-gradient(circle at 22% 12%, rgba(47, 252, 255, ${shellGlow}), transparent 28%),
    radial-gradient(circle at 12% 72%, rgba(240, 68, 255, ${shellGlow * 0.72}), transparent 34%),
    linear-gradient(180deg, rgba(24, 18, 70, ${shellAlpha}), rgba(13, 10, 44, ${shellAlpha + 0.08}));
}
.app-shell--state-37 .chat-dock.glass {
  filter: brightness(1.14) saturate(1.18) hue-rotate(8deg);
}
.app-shell--state-37 .flow-field {
  filter: brightness(${brightness}) saturate(${saturate}) hue-rotate(${hue}deg);
}
.app-shell--state-37 .state-choreography__focus-frame.focus-agents,
.app-shell--state-37 .state-choreography__focus-frame.focus-core {
  background:
    radial-gradient(circle at 53% 49%, rgba(240, 68, 255, 0.44), transparent 10%),
    radial-gradient(circle at 54% 50%, rgba(87, 92, 255, 0.34), transparent 24%),
    radial-gradient(circle at 22% 31%, rgba(47, 252, 255, 0.16), transparent 18%),
    radial-gradient(circle at 82% 29%, rgba(47, 252, 255, 0.14), transparent 18%),
    linear-gradient(145deg, rgba(8, 7, 36, 0.18), rgba(26, 18, 74, 0.28));
}
`,
    });
  }

  for (const [name, panelOpacity, panelBrightness, panelSaturate, fieldBrightness, fieldSaturate] of [
    ["signed-panel-restore-a", 0.46, 0.78, 0.84, 0.96, 1.24],
    ["signed-panel-restore-b", 0.54, 0.84, 0.94, 1, 1.3],
    ["signed-panel-restore-c", 0.62, 0.9, 1.04, 1.04, 1.36],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 signed hotspot panel/field luma restore ${name}`,
      css: `
.app-shell--state-37 .floating-panel-layer {
  opacity: ${panelOpacity};
  filter: saturate(${panelSaturate}) brightness(${panelBrightness});
}
.app-shell--state-37 .flow-field {
  filter: brightness(${fieldBrightness}) saturate(${fieldSaturate}) hue-rotate(10deg);
}
`,
    });
  }

  for (const [name, blue, violet, cyan, height] of [
    ["signed-drawer-lower-a", 0.07, 0.055, 0.035, 42],
    ["signed-drawer-lower-b", 0.11, 0.08, 0.05, 48],
    ["signed-drawer-lower-c", 0.15, 0.11, 0.065, 54],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 signed lower drawer luma/blue lift ${name}`,
      css: `
.app-shell--state-37 .drawer-shell::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: ${height}%;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 74% 90%, rgba(76, 112, 255, ${blue}), transparent 44%),
    radial-gradient(ellipse at 38% 94%, rgba(139, 92, 255, ${violet}), transparent 38%),
    radial-gradient(ellipse at 93% 72%, rgba(47, 252, 255, ${cyan}), transparent 30%);
  mix-blend-mode: screen;
}
`,
    });
  }

  for (const [name, panelOpacity, panelBrightness, blue, violet, cyan] of [
    ["signed-combo-a", 0.48, 0.8, 0.08, 0.06, 0.035],
    ["signed-combo-b", 0.54, 0.84, 0.11, 0.08, 0.05],
    ["signed-combo-c", 0.6, 0.88, 0.14, 0.1, 0.065],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 signed panel plus lower drawer correction ${name}`,
      css: `
.app-shell--state-37 .floating-panel-layer {
  opacity: ${panelOpacity};
  filter: saturate(0.94) brightness(${panelBrightness});
}
.app-shell--state-37 .drawer-shell::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 48%;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 74% 90%, rgba(76, 112, 255, ${blue}), transparent 44%),
    radial-gradient(ellipse at 38% 94%, rgba(139, 92, 255, ${violet}), transparent 38%),
    radial-gradient(ellipse at 93% 72%, rgba(47, 252, 255, ${cyan}), transparent 30%);
  mix-blend-mode: screen;
}
`, 
    });
  }

  for (const [name, topCyan, lowerCyan, lowerViolet, lowerBlue, opacity] of [
    ["hotspot-lift-a", 0.1, 0.12, 0.08, 0.1, 0.78],
    ["hotspot-lift-b", 0.16, 0.18, 0.12, 0.14, 0.86],
    ["hotspot-lift-c", 0.22, 0.24, 0.16, 0.18, 0.94],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 signed hotspot cyan/violet energy lift ${name}`,
      css: `
.app-shell--state-37 .flow-field::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 61% 12%, rgba(47, 252, 255, ${topCyan}), transparent 7%),
    radial-gradient(ellipse at 75% 89%, rgba(47, 252, 255, ${lowerCyan}), transparent 8%),
    radial-gradient(ellipse at 88% 88%, rgba(47, 252, 255, ${lowerCyan}), transparent 10%),
    radial-gradient(ellipse at 88% 94%, rgba(139, 92, 255, ${lowerViolet}), transparent 11%),
    radial-gradient(ellipse at 90% 82%, rgba(76, 112, 255, ${lowerBlue}), transparent 14%);
  mix-blend-mode: screen;
  opacity: ${opacity};
}
`,
    });
  }

  for (const [name, topCyan, leftCyan, lowerCyan, lowerBlue, opacity] of [
    ["post-hotspots-a", 0.26, 0.16, 0.28, 0.18, 0.94],
    ["post-hotspots-b", 0.34, 0.22, 0.36, 0.24, 1],
    ["post-hotspots-c", 0.42, 0.28, 0.44, 0.3, 1],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 post-baseline source hotspot lift ${name}`,
      css: `
.app-shell--state-37 .flow-field::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 61% 12%, rgba(47, 252, 255, ${topCyan}), transparent 8%),
    radial-gradient(circle at 17% 37%, rgba(47, 252, 255, ${leftCyan}), transparent 6%),
    radial-gradient(ellipse at 75% 89%, rgba(47, 252, 255, ${lowerCyan}), transparent 10%),
    radial-gradient(ellipse at 88% 88%, rgba(47, 252, 255, ${lowerCyan}), transparent 12%),
    radial-gradient(ellipse at 90% 84%, rgba(76, 112, 255, ${lowerBlue}), transparent 16%),
    radial-gradient(ellipse at 88% 94%, rgba(139, 92, 255, 0.18), transparent 12%);
  mix-blend-mode: screen;
  opacity: ${opacity};
}
`,
    });
  }

  for (const [name, topCyan, lowerCyan, opacity, blur] of [
    ["drawer-edge-source-a", 0.22, 0.16, 0.64, 36],
    ["drawer-edge-source-b", 0.3, 0.22, 0.76, 44],
    ["drawer-edge-source-c", 0.38, 0.28, 0.88, 52],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 drawer surrounding cyan source bloom ${name}`,
      css: `
.app-shell--state-37 .drawer-shell {
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14),
    inset 0 0 ${blur}px rgba(47,252,255,0.2),
    0 0 0 1px rgba(47,252,255,0.44),
    0 0 86px rgba(47,252,255,0.36),
    -42px 18px ${blur * 2}px rgba(47,252,255,${topCyan}),
    24px 190px ${blur * 2}px rgba(47,252,255,${lowerCyan}),
    0 28px 90px rgba(0,0,0,0.42);
  opacity: ${opacity};
}
`,
    });
  }

  for (const [name, layerOpacity, layerBrightness, panelBrightness, dialGlow] of [
    ["model-through-a", 0.48, 0.76, 1.26, 0.34],
    ["model-through-b", 0.54, 0.82, 1.42, 0.46],
    ["model-through-c", 0.6, 0.88, 1.58, 0.58],
    ["model-through-d", 0.66, 0.9, 1.7, 0.66],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 restore model-performance panel through focus frame ${name}`,
      css: `
.app-shell--state-37 .floating-panel-layer {
  opacity: ${layerOpacity};
  filter: saturate(0.92) brightness(${layerBrightness});
}
.app-shell--state-37 .floating-panel-frame:not([data-panel-id="model-performance"]) .floating-panel {
  opacity: 0.58 !important;
  filter: brightness(0.68) saturate(0.78);
}
.app-shell--state-37 [data-panel-id="model-performance"] .floating-panel {
  opacity: 1 !important;
  filter: brightness(${panelBrightness}) saturate(1.62) hue-rotate(-5deg);
  border-color: rgba(47, 252, 255, 0.48);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.16),
    0 0 52px rgba(47,252,255,0.22),
    0 28px 92px rgba(0,0,0,0.38);
}
.app-shell--state-37 [data-panel-id="model-performance"] .model-score-dial {
  filter: brightness(1.18) saturate(1.48);
  box-shadow:
    0 0 34px rgba(47, 252, 255, ${dialGlow}),
    0 0 58px rgba(139, 92, 255, ${dialGlow * 0.62});
}
`,
    });
  }

  for (const [name, right, bottom, size, cyan, green] of [
    ["composer-send-a", 72, 18, 42, 0.42, 0.78],
    ["composer-send-b", 92, 20, 46, 0.5, 0.86],
    ["composer-send-c", 112, 24, 48, 0.58, 0.92],
    ["composer-send-d", 132, 28, 50, 0.66, 0.96],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 source-position composer send control ${name}`,
      css: `
.app-shell--state-37 .composer {
  position: relative;
}
.app-shell--state-37 .composer__actions {
  position: absolute;
  right: ${right}px;
  bottom: ${bottom}px;
  z-index: 92;
  gap: 8px;
}
.app-shell--state-37 .composer__actions button {
  width: ${size}px;
  height: ${size}px;
}
.app-shell--state-37 .composer__actions button:first-child {
  color: rgba(214, 231, 248, 0.78);
  border-color: rgba(142, 227, 255, 0.2);
  background: rgba(10, 18, 45, 0.64);
}
.app-shell--state-37 .composer__actions button:last-child {
  color: white;
  border-color: rgba(47, 252, 255, 0.62);
  background:
    radial-gradient(circle at 34% 28%, rgba(255,255,255,0.42), transparent 18%),
    radial-gradient(circle at 58% 72%, rgba(56,255,179,${green}), transparent 42%),
    linear-gradient(135deg, rgba(47,252,255,${cyan}), rgba(56,255,179,${green}));
  box-shadow:
    0 0 34px rgba(47, 252, 255, 0.46),
    0 0 76px rgba(56, 255, 179, 0.34);
}
`,
    });
  }

  for (const [name, layerOpacity, layerBrightness, panelBrightness, right, bottom, size] of [
    ["model-send-a", 0.54, 0.82, 1.42, 92, 20, 46],
    ["model-send-b", 0.6, 0.88, 1.58, 112, 24, 48],
    ["model-send-c", 0.66, 0.9, 1.7, 132, 28, 50],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 combined model panel and composer send correction ${name}`,
      css: `
.app-shell--state-37 .floating-panel-layer {
  opacity: ${layerOpacity};
  filter: saturate(0.92) brightness(${layerBrightness});
}
.app-shell--state-37 .floating-panel-frame:not([data-panel-id="model-performance"]) .floating-panel {
  opacity: 0.58 !important;
  filter: brightness(0.68) saturate(0.78);
}
.app-shell--state-37 [data-panel-id="model-performance"] .floating-panel {
  opacity: 1 !important;
  filter: brightness(${panelBrightness}) saturate(1.62) hue-rotate(-5deg);
  border-color: rgba(47, 252, 255, 0.48);
}
.app-shell--state-37 [data-panel-id="model-performance"] .model-score-dial {
  filter: brightness(1.18) saturate(1.48);
  box-shadow:
    0 0 34px rgba(47, 252, 255, 0.52),
    0 0 58px rgba(139, 92, 255, 0.32);
}
.app-shell--state-37 .composer {
  position: relative;
}
.app-shell--state-37 .composer__actions {
  position: absolute;
  right: ${right}px;
  bottom: ${bottom}px;
  z-index: 92;
  gap: 8px;
}
.app-shell--state-37 .composer__actions button {
  width: ${size}px;
  height: ${size}px;
}
.app-shell--state-37 .composer__actions button:last-child {
  border-color: rgba(47, 252, 255, 0.62);
  background:
    radial-gradient(circle at 34% 28%, rgba(255,255,255,0.42), transparent 18%),
    radial-gradient(circle at 58% 72%, rgba(56,255,179,0.88), transparent 42%),
    linear-gradient(135deg, rgba(47,252,255,0.54), rgba(56,255,179,0.88));
  box-shadow:
    0 0 34px rgba(47, 252, 255, 0.46),
    0 0 76px rgba(56, 255, 179, 0.34);
}
`,
    });
  }

  for (const [name, headerBrightness, bodyBrightness, drawerOpacity] of [
    ["drawer-top-balance-a", 0.86, 1, 1],
    ["drawer-top-balance-b", 0.78, 0.98, 0.96],
    ["drawer-top-balance-c", 0.7, 0.96, 0.92],
  ]) {
    candidates.push({
      id: `s37-${name}`,
      description: `State 37 reduce overbright drawer header while preserving body ${name}`,
      css: `
.app-shell--state-37 .drawer-shell {
  opacity: ${drawerOpacity};
}
.app-shell--state-37 .drawer-shell__header {
  filter: brightness(${headerBrightness}) saturate(0.9);
}
.app-shell--state-37 .drawer-shell__body {
  filter: brightness(${bodyBrightness}) saturate(1.04);
}
`,
    });
  }

  return candidates;
}

function state01Candidates() {
  const candidates = [];

  for (const [name, opacity, brightness, saturate] of [
    ["core-frame-dim-a", 0.88, 0.82, 0.9],
    ["core-frame-dim-b", 0.72, 0.72, 0.82],
    ["core-frame-dim-c", 0.58, 0.62, 0.76],
    ["core-frame-dim-d", 0.44, 0.54, 0.7],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 central focus frame dim ${name}`,
      css: `
.app-shell--state-01 .state-choreography__focus-frame.focus-core {
  opacity: ${opacity};
  filter: brightness(${brightness}) saturate(${saturate});
}
`,
    });
  }

  for (const [name, glow, star, brain, knot] of [
    ["flow-core-dim-a", 0.48, 0.4, 0.5, 0.48],
    ["flow-core-dim-b", 0.34, 0.3, 0.38, 0.36],
    ["flow-core-dim-c", 0.22, 0.22, 0.28, 0.26],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 flow core dim ${name}`,
      css: `
.app-shell--state-01 .flow-field__core-glow {
  opacity: ${glow};
}
.app-shell--state-01 .flow-field__core-star {
  opacity: ${star};
}
.app-shell--state-01 .flow-field__brain {
  opacity: ${brain};
}
.app-shell--state-01 .flow-field__core-knot-map {
  opacity: ${knot};
}
`,
    });
  }

  for (const [name, frameOpacity, frameBrightness, glow, star, brain] of [
    ["core-combo-a", 0.72, 0.72, 0.34, 0.3, 0.38],
    ["core-combo-b", 0.58, 0.62, 0.34, 0.3, 0.38],
    ["core-combo-c", 0.58, 0.62, 0.22, 0.22, 0.28],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 central frame and flow dim ${name}`,
      css: `
.app-shell--state-01 .state-choreography__focus-frame.focus-core {
  opacity: ${frameOpacity};
  filter: brightness(${frameBrightness}) saturate(0.76);
}
.app-shell--state-01 .flow-field__core-glow {
  opacity: ${glow};
}
.app-shell--state-01 .flow-field__core-star {
  opacity: ${star};
}
.app-shell--state-01 .flow-field__brain {
  opacity: ${brain};
}
`,
    });
  }

  for (const [name, borderAlpha, lineAlpha] of [
    ["timeline-lift-a", 0.98, 0.68],
    ["timeline-lift-b", 1, 0.84],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 timeline stroke lift ${name}`,
      css: `
.app-shell--state-01 .state-choreography__focus-frame.focus-timeline {
  border-color: rgba(47, 252, 255, ${borderAlpha});
  box-shadow:
    0 0 0 3px rgba(47, 252, 255, 0.1),
    0 0 34px rgba(47, 252, 255, ${lineAlpha * 0.32}),
    inset 0 0 34px rgba(47, 252, 255, ${lineAlpha * 0.18});
}
`,
    });
  }

  for (const [name, frameOpacity, frameBrightness, borderAlpha, lineAlpha] of [
    ["core-frame-timeline-a", 0.88, 0.82, 0.98, 0.68],
    ["core-frame-timeline-b", 0.88, 0.82, 1, 0.84],
    ["core-frame-timeline-c", 0.82, 0.78, 0.98, 0.68],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 focus frame dim plus timeline lift ${name}`,
      css: `
.app-shell--state-01 .state-choreography__focus-frame.focus-core {
  opacity: ${frameOpacity};
  filter: brightness(${frameBrightness}) saturate(0.9);
}
.app-shell--state-01 .state-choreography__focus-frame.focus-timeline {
  border-color: rgba(47, 252, 255, ${borderAlpha});
  box-shadow:
    0 0 0 3px rgba(47, 252, 255, 0.1),
    0 0 34px rgba(47, 252, 255, ${lineAlpha * 0.32}),
    inset 0 0 34px rgba(47, 252, 255, ${lineAlpha * 0.18});
}
`,
    });
  }

  for (const [name, opacity, brightness, saturate] of [
    ["assistant-dim-a", 0.42, 0.68, 0.82],
    ["assistant-dim-b", 0.22, 0.54, 0.7],
    ["assistant-hidden", 0, 0.4, 0.5],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 ambient assistant bubble ${name}`,
      css: `
.app-shell--state-01 .ambient-assistant-bubble {
  opacity: ${opacity};
  filter: brightness(${brightness}) saturate(${saturate});
}
`,
    });
  }

  for (const [name, frameOpacity, frameBrightness, glow, star, brain, knot, orbital] of [
    ["core-flow-hard-a", 0.72, 0.64, 0.18, 0.18, 0.22, 0.22, 0.38],
    ["core-flow-hard-b", 0.62, 0.58, 0.12, 0.12, 0.16, 0.16, 0.3],
    ["core-flow-hard-c", 0.52, 0.52, 0.08, 0.08, 0.12, 0.12, 0.24],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 hard central core and flow dim ${name}`,
      css: `
.app-shell--state-01 .state-choreography__focus-frame.focus-core {
  opacity: ${frameOpacity};
  filter: brightness(${frameBrightness}) saturate(0.74);
}
.app-shell--state-01 .flow-field__core-glow {
  opacity: ${glow};
}
.app-shell--state-01 .flow-field__core-star {
  opacity: ${star};
}
.app-shell--state-01 .flow-field__brain {
  opacity: ${brain};
}
.app-shell--state-01 .flow-field__core-knot-map {
  opacity: ${knot};
}
.app-shell--state-01 .flow-field__orbital-shells {
  opacity: ${orbital};
}
.app-shell--state-01 .ambient-assistant-bubble {
  opacity: 0;
  filter: brightness(0.4) saturate(0.5);
}
`,
    });
  }

  for (const [name, flowOpacity, ribbon, thread, sparks] of [
    ["whole-flow-dim-a", 0.72, 0.13, 0.32, 0.28],
    ["whole-flow-dim-b", 0.6, 0.1, 0.26, 0.2],
    ["whole-flow-dim-c", 0.48, 0.08, 0.2, 0.16],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 broad flow field dim ${name}`,
      css: `
.app-shell--state-01 .flow-field {
  opacity: ${flowOpacity};
}
.app-shell--state-01 .flow-field__ribbon {
  opacity: ${ribbon};
}
.app-shell--state-01 .flow-field__thread {
  opacity: ${thread};
}
.app-shell--state-01 .flow-field__spark-trace {
  opacity: ${sparks};
}
.app-shell--state-01 .ambient-assistant-bubble {
  opacity: 0;
  filter: brightness(0.4) saturate(0.5);
}
`,
    });
  }

  for (const [name, opacity, brightness, saturate, hue] of [
    ["scene-grade-a", 0.84, 0.88, 1.12, 8],
    ["scene-grade-b", 0.76, 0.82, 1.22, 12],
    ["scene-grade-c", 0.68, 0.76, 1.34, 16],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 living scene source grade ${name}`,
      css: `
.app-shell--state-01 .living-scene {
  opacity: ${opacity};
  filter: brightness(${brightness}) saturate(${saturate}) hue-rotate(${hue}deg);
}
`,
    });
  }

  for (const [name, opacity, brightness, saturate] of [
    ["panel-recess-a", 0.5, 0.78, 0.78],
    ["panel-recess-b", 0.44, 0.68, 0.72],
    ["panel-recess-c", 0.38, 0.58, 0.66],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 floating panel recession ${name}`,
      css: `
.app-shell--state-01 .floating-panel-layer {
  opacity: ${opacity};
  filter: brightness(${brightness}) saturate(${saturate});
}
`,
    });
  }

  for (const [name, chatBrightness, chatSaturate, timelineGlow] of [
    ["composer-timeline-lift-a", 1.08, 1.16, 0.16],
    ["composer-timeline-lift-b", 1.14, 1.26, 0.22],
    ["composer-timeline-lift-c", 1.22, 1.36, 0.28],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 timeline and composer blue lift ${name}`,
      css: `
.app-shell--state-01 .chat-dock.glass {
  filter: brightness(${chatBrightness}) saturate(${chatSaturate}) hue-rotate(8deg);
}
.app-shell--state-01 .state-choreography__focus-frame.focus-timeline {
  background:
    linear-gradient(90deg, rgba(47, 252, 255, ${timelineGlow}), rgba(87, 92, 255, ${timelineGlow * 0.72}));
  box-shadow:
    0 0 0 3px rgba(47, 252, 255, 0.1),
    0 0 42px rgba(47, 252, 255, ${timelineGlow}),
    inset 0 0 32px rgba(47, 252, 255, ${timelineGlow * 0.72});
}
`,
    });
  }

  for (const [name, sceneOpacity, sceneBrightness, panelOpacity, chatBrightness] of [
    ["scene-panel-compose-a", 0.8, 0.86, 0.48, 1.1],
    ["scene-panel-compose-b", 0.72, 0.8, 0.42, 1.16],
    ["scene-panel-compose-c", 0.66, 0.76, 0.38, 1.22],
  ]) {
    candidates.push({
      id: `s01-${name}`,
      description: `State 01 scene, panels, and composer combined ${name}`,
      css: `
.app-shell--state-01 .living-scene {
  opacity: ${sceneOpacity};
  filter: brightness(${sceneBrightness}) saturate(1.24) hue-rotate(12deg);
}
.app-shell--state-01 .floating-panel-layer {
  opacity: ${panelOpacity};
  filter: brightness(0.68) saturate(0.72);
}
.app-shell--state-01 .chat-dock.glass {
  filter: brightness(${chatBrightness}) saturate(1.24) hue-rotate(8deg);
}
`,
    });
  }

  return candidates;
}

function state61Candidates() {
  const candidates = [];

  for (const opacity of [0, 0.24, 0.42, 0.62]) {
    candidates.push({
      id: `s61-orb-opacity-${String(opacity).replace(".", "p")}`,
      description: `State 61 artifact orb opacity ${opacity}`,
      css: `
.living-canvas--state-61 .artifact-stage__orb {
  opacity: ${opacity};
}
`,
    });
  }

  for (const [top, width] of [
    [68, 118],
    [74, 132],
    [84, 118],
    [96, 100],
  ]) {
    candidates.push({
      id: `s61-orb-t${top}-w${width}`,
      description: `State 61 artifact orb top ${top}px, width ${width}px`,
      css: `
.living-canvas--state-61 .artifact-stage__orb {
  top: ${top}px;
  width: ${width}px;
  opacity: 0.68;
}
`,
    });
  }

  for (const fontSize of [20, 24, 28, 32]) {
    candidates.push({
      id: `s61-orb-textonly-${fontSize}`,
      description: `State 61 artifact marker text-only ${fontSize}px`,
      css: `
.living-canvas--state-61 .artifact-stage__orb {
  top: 126px;
  width: auto;
  height: auto;
  aspect-ratio: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  opacity: 0.86;
}
.living-canvas--state-61 .artifact-stage__orb span {
  color: rgba(255, 255, 255, 0.84);
  font-size: ${fontSize}px;
  letter-spacing: 0;
  text-shadow: 0 0 18px rgba(240, 68, 255, 0.42);
}
`,
    });
  }

  for (const opacity of [0.72, 0.84, 0.94]) {
    candidates.push({
      id: `s61-lines-opacity-${String(opacity).replace(".", "p")}`,
      description: `State 61 artifact line opacity ${opacity}`,
      css: `
.living-canvas--state-61 .artifact-stage__lines span {
  opacity: ${opacity};
}
`,
    });
  }

  for (const [name, opacity, brightness, saturate] of [
    ["assistant-dim-a", 0.46, 0.7, 0.82],
    ["assistant-dim-b", 0.28, 0.58, 0.72],
    ["assistant-dim-c", 0.12, 0.46, 0.62],
    ["assistant-hidden", 0, 0.4, 0.5],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 ambient assistant bubble ${name}`,
      css: `
.app-shell--state-61 .ambient-assistant-bubble {
  opacity: ${opacity};
  filter: brightness(${brightness}) saturate(${saturate});
}
`,
    });
  }

  for (const [name, hue, saturate, brightness] of [
    ["lines-magenta-a", -8, 1.08, 0.98],
    ["lines-magenta-b", -14, 1.16, 0.96],
    ["lines-magenta-c", -20, 1.24, 0.94],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 artifact rows magenta hue ${name}`,
      css: `
.living-canvas--state-61 .artifact-stage__lines span {
  filter: hue-rotate(${hue}deg) saturate(${saturate}) brightness(${brightness});
}
`,
    });
  }

  for (const [name, magenta, cyan, alpha] of [
    ["row-button-lift-a", 0.58, 0.22, 0.06],
    ["row-button-lift-b", 0.64, 0.28, 0.08],
    ["row-button-lift-c", 0.7, 0.34, 0.1],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 branch buttons and artifact rows source lift ${name}`,
      css: `
.living-canvas--state-61 .artifact-branch-list button,
.living-canvas--state-61 .artifact-branch-list button.is-active,
.living-canvas--state-61 .artifact-branch-list button:hover {
  background:
    linear-gradient(90deg, rgba(255,255,255,${alpha + 0.08}), rgba(240,68,255,${magenta}), rgba(47,252,255,${cyan})),
    rgba(255,255,255,${alpha});
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.16),
    0 0 26px rgba(240,68,255,0.18);
}
.living-canvas--state-61 .artifact-stage__lines span {
  background:
    linear-gradient(90deg, rgba(255,255,255,${alpha + 0.08}), rgba(240,68,255,${magenta}), rgba(47,252,255,${cyan})),
    rgba(255,255,255,${alpha});
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.16),
    0 0 26px rgba(240,68,255,0.18);
}
`,
    });
  }

  for (const [name, panelAlpha, previewAlpha] of [
    ["panels-translucent-a", 0.62, 0.18],
    ["panels-translucent-b", 0.54, 0.24],
    ["panels-translucent-c", 0.48, 0.3],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 translucent canvas panels ${name}`,
      css: `
.living-canvas--state-61 .artifact-canvas__branches,
.living-canvas--state-61 .artifact-canvas__preview,
.living-canvas--state-61 .artifact-canvas__inspector {
  background:
    radial-gradient(circle at 56% 22%, rgba(86, 155, 255, 0.14), transparent 34%),
    linear-gradient(180deg, rgba(7, 5, 24, ${panelAlpha}), rgba(4, 5, 18, ${panelAlpha + 0.04})),
    radial-gradient(circle at 50% 10%, rgba(240, 68, 255, 0.2), transparent 42%);
}
.living-canvas--state-61 .artifact-preview {
  background:
    radial-gradient(circle at 50% 42%, rgba(240, 68, 255, ${previewAlpha}), transparent 36%),
    radial-gradient(circle at 64% 38%, rgba(47, 252, 255, ${previewAlpha * 0.64}), transparent 30%);
}
`,
    });
  }

  for (const [name, border, lowerGlow, innerGlow] of [
    ["shell-bottom-edge-a", 0.82, 0.34, 0.1],
    ["shell-bottom-edge-b", 0.92, 0.44, 0.14],
    ["shell-bottom-edge-c", 1, 0.54, 0.18],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 lower magenta canvas edge ${name}`,
      css: `
.living-canvas--state-61 {
  border-color: rgba(240, 68, 255, ${border});
  box-shadow:
    inset 0 -2px 0 rgba(255,255,255,0.12),
    inset 0 -48px 84px rgba(240,68,255,${innerGlow}),
    0 0 0 2px rgba(240,68,255,0.46),
    0 0 86px rgba(240,68,255,${lowerGlow}),
    0 30px 110px rgba(0,0,0,0.54);
}
`,
    });
  }

  for (const [name, magenta, cyan, panelAlpha, edgeGlow] of [
    ["rows-panels-edge-a", 0.58, 0.22, 0.62, 0.34],
    ["rows-panels-edge-b", 0.64, 0.28, 0.54, 0.44],
    ["rows-panels-edge-c", 0.7, 0.34, 0.48, 0.54],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 row, panel, and lower edge source combo ${name}`,
      css: `
.living-canvas--state-61 {
  box-shadow:
    inset 0 -2px 0 rgba(255,255,255,0.12),
    inset 0 -48px 84px rgba(240,68,255,0.14),
    0 0 0 2px rgba(240,68,255,0.46),
    0 0 86px rgba(240,68,255,${edgeGlow}),
    0 30px 110px rgba(0,0,0,0.54);
}
.living-canvas--state-61 .artifact-canvas__branches,
.living-canvas--state-61 .artifact-canvas__preview,
.living-canvas--state-61 .artifact-canvas__inspector {
  background:
    radial-gradient(circle at 56% 22%, rgba(86, 155, 255, 0.14), transparent 34%),
    linear-gradient(180deg, rgba(7, 5, 24, ${panelAlpha}), rgba(4, 5, 18, ${panelAlpha + 0.04})),
    radial-gradient(circle at 50% 10%, rgba(240, 68, 255, 0.2), transparent 42%);
}
.living-canvas--state-61 .artifact-branch-list button,
.living-canvas--state-61 .artifact-branch-list button.is-active,
.living-canvas--state-61 .artifact-branch-list button:hover,
.living-canvas--state-61 .artifact-stage__lines span {
  background:
    linear-gradient(90deg, rgba(255,255,255,0.18), rgba(240,68,255,${magenta}), rgba(47,252,255,${cyan})),
    rgba(255,255,255,0.08);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.16),
    0 0 26px rgba(240,68,255,0.18);
}
`, 
    });
  }

  for (const [name, magenta, cyan, white, opacity] of [
    ["row-magenta-source-a", 0.58, 0.14, 0.16, 0.9],
    ["row-magenta-source-b", 0.66, 0.1, 0.2, 0.86],
    ["row-magenta-source-c", 0.74, 0.06, 0.24, 0.82],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 artifact rows source-magenta balance ${name}`,
      css: `
.living-canvas--state-61 .artifact-stage__lines span,
.living-canvas--state-61 .artifact-branch-list button,
.living-canvas--state-61 .artifact-branch-list button.is-active,
.living-canvas--state-61 .artifact-branch-list button:hover {
  opacity: ${opacity};
  background:
    linear-gradient(90deg, rgba(255,255,255,${white}), rgba(240,68,255,${magenta}), rgba(47,252,255,${cyan})),
    rgba(255,255,255,0.055);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14),
    0 0 24px rgba(240,68,255,0.18);
}
`,
    });
  }

  for (const [name, alpha, brightness, magenta, cyan] of [
    ["chat-magenta-lift-a", 0.74, 1.12, 0.18, 0.05],
    ["chat-magenta-lift-b", 0.68, 1.22, 0.26, 0.03],
    ["chat-magenta-lift-c", 0.62, 1.32, 0.34, 0.02],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 chat dock source-magenta lift ${name}`,
      css: `
.app-shell--state-61 .chat-dock.glass {
  filter: brightness(${brightness}) saturate(1.22) hue-rotate(8deg);
  background:
    radial-gradient(circle at 20% 18%, rgba(240,68,255,${magenta}), transparent 38%),
    radial-gradient(circle at 88% 72%, rgba(47,252,255,${cyan}), transparent 34%),
    linear-gradient(146deg, rgba(42, 8, 58, ${alpha}), rgba(18, 6, 38, ${alpha + 0.08}));
  border-color: rgba(240,68,255,0.38);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.1),
    0 24px 94px rgba(0,0,0,0.46),
    0 0 70px rgba(240,68,255,0.26);
}
`,
    });
  }

  for (const [name, titleSize, subtitleSize, bannerAlpha, lift] of [
    ["banner-lift-a", 31, 16, 0.58, 1.08],
    ["banner-lift-b", 33, 17, 0.52, 1.16],
    ["banner-lift-c", 35, 18, 0.46, 1.24],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 source title banner lift ${name}`,
      css: `
.app-shell--state-61 .state-choreography__banner {
  background:
    radial-gradient(circle at 10% 50%, rgba(240,68,255,0.18), transparent 44%),
    rgba(3,10,26,${bannerAlpha});
  filter: brightness(${lift}) saturate(1.12);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14),
    0 0 44px rgba(240,68,255,0.28);
}
.app-shell--state-61 .state-choreography__banner strong {
  font-size: ${titleSize}px;
}
.app-shell--state-61 .state-choreography__banner em {
  font-size: ${subtitleSize}px;
}
`,
    });
  }

  for (const [name, topLift, glow, brightness] of [
    ["timeline-lift-a", 0, 0.3, 1.18],
    ["timeline-lift-b", -10, 0.42, 1.32],
    ["timeline-lift-c", -18, 0.54, 1.44],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 temporal memory ribbon magenta lift ${name}`,
      css: `
.app-shell--state-61 .temporal-memory-ribbon {
  bottom: ${214 - topLift}px;
  filter: brightness(${brightness}) saturate(1.28) hue-rotate(8deg);
  border-color: rgba(240,68,255,0.42);
  background:
    linear-gradient(90deg, rgba(240,68,255,0.22), rgba(47,252,255,0.08), rgba(240,68,255,0.2)),
    rgba(20,5,38,0.62);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 0 40px rgba(240,68,255,${glow});
}
`,
    });
  }

  for (const [name, railOpacity, railBrightness, appBeforeAlpha] of [
    ["shell-dim-a", 0.42, 0.68, 0.72],
    ["shell-dim-b", 0.36, 0.58, 0.78],
    ["shell-dim-c", 0.3, 0.5, 0.84],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 outer shell dim and vignette ${name}`,
      css: `
.app-shell--state-61 .left-rail,
.app-shell--state-61 .top-mode-rail {
  opacity: ${railOpacity};
  filter: saturate(0.58) brightness(${railBrightness});
}
.app-shell--state-61::before {
  background:
    linear-gradient(90deg, rgba(40,0,48,0.38), rgba(240,68,255,0.12) 22%, transparent 48%, rgba(18,0,28,0.3)),
    radial-gradient(circle at 53% 33%, rgba(240,68,255,0.24), transparent 32%),
    radial-gradient(circle at center, transparent 0%, rgba(24,0,30,0.22) 44%, rgba(0,0,0,${appBeforeAlpha}) 100%);
}
`,
    });
  }

  const state61ChatMagentaLiftA = `
.app-shell--state-61 .chat-dock.glass {
  filter: brightness(1.12) saturate(1.22) hue-rotate(8deg);
  background:
    radial-gradient(circle at 20% 18%, rgba(240,68,255,0.18), transparent 38%),
    radial-gradient(circle at 88% 72%, rgba(47,252,255,0.05), transparent 34%),
    linear-gradient(146deg, rgba(42, 8, 58, 0.74), rgba(18, 6, 38, 0.82));
  border-color: rgba(240,68,255,0.38);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.1),
    0 24px 94px rgba(0,0,0,0.46),
    0 0 70px rgba(240,68,255,0.26);
}
`;
  const state61ShellDimC = `
.app-shell--state-61 .left-rail,
.app-shell--state-61 .top-mode-rail {
  opacity: 0.3;
  filter: saturate(0.58) brightness(0.5);
}
.app-shell--state-61::before {
  background:
    linear-gradient(90deg, rgba(40,0,48,0.38), rgba(240,68,255,0.12) 22%, transparent 48%, rgba(18,0,28,0.3)),
    radial-gradient(circle at 53% 33%, rgba(240,68,255,0.24), transparent 32%),
    radial-gradient(circle at center, transparent 0%, rgba(24,0,30,0.22) 44%, rgba(0,0,0,0.84) 100%);
}
`;
  const state61TimelineLiftC = `
.app-shell--state-61 .temporal-memory-ribbon {
  bottom: 232px;
  filter: brightness(1.44) saturate(1.28) hue-rotate(8deg);
  border-color: rgba(240,68,255,0.42);
  background:
    linear-gradient(90deg, rgba(240,68,255,0.22), rgba(47,252,255,0.08), rgba(240,68,255,0.2)),
    rgba(20,5,38,0.62);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 0 40px rgba(240,68,255,0.54);
}
`;
  const state61LinesOpacity = `
.living-canvas--state-61 .artifact-stage__lines span {
  opacity: 0.84;
}
`;
  const state61RowMagentaB = `
.living-canvas--state-61 .artifact-stage__lines span,
.living-canvas--state-61 .artifact-branch-list button,
.living-canvas--state-61 .artifact-branch-list button.is-active,
.living-canvas--state-61 .artifact-branch-list button:hover {
  opacity: 0.86;
  background:
    linear-gradient(90deg, rgba(255,255,255,0.2), rgba(240,68,255,0.66), rgba(47,252,255,0.1)),
    rgba(255,255,255,0.055);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14),
    0 0 24px rgba(240,68,255,0.18);
}
`;

  for (const [name, parts] of [
    ["chat-shell", [state61ChatMagentaLiftA, state61ShellDimC]],
    ["chat-timeline", [state61ChatMagentaLiftA, state61TimelineLiftC]],
    ["chat-lines", [state61ChatMagentaLiftA, state61LinesOpacity]],
    ["chat-rows", [state61ChatMagentaLiftA, state61RowMagentaB]],
    ["chat-shell-timeline", [state61ChatMagentaLiftA, state61ShellDimC, state61TimelineLiftC]],
    ["chat-shell-lines", [state61ChatMagentaLiftA, state61ShellDimC, state61LinesOpacity]],
    ["chat-shell-rows", [state61ChatMagentaLiftA, state61ShellDimC, state61RowMagentaB]],
    ["chat-shell-timeline-lines", [state61ChatMagentaLiftA, state61ShellDimC, state61TimelineLiftC, state61LinesOpacity]],
  ]) {
    candidates.push({
      id: `s61-combo-${name}`,
      description: `State 61 measured combo ${name}`,
      css: parts.join("\n"),
    });
  }

  for (const [name, magenta, cyan, white, brightness, opacity] of [
    ["row-hot-a", 0.66, 0.08, 0.18, 1.08, 0.9],
    ["row-hot-b", 0.76, 0.05, 0.22, 1.16, 0.94],
    ["row-hot-c", 0.86, 0.03, 0.26, 1.24, 1],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 post-baseline artifact row heat ${name}`,
      css: `
.living-canvas--state-61 .artifact-stage__lines span {
  opacity: ${opacity};
  filter: brightness(${brightness}) saturate(1.36) hue-rotate(-7deg);
  background:
    linear-gradient(90deg, rgba(255,255,255,${white}), rgba(240,68,255,${magenta}), rgba(47,252,255,${cyan})),
    rgba(255,255,255,0.055);
}
`,
    });
  }

  for (const [name, panelAlpha, previewMagenta, previewCyan, brightness] of [
    ["panel-through-a", 0.7, 0.24, 0.08, 1.04],
    ["panel-through-b", 0.62, 0.3, 0.06, 1.08],
    ["panel-through-c", 0.56, 0.36, 0.04, 1.12],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 post-baseline canvas panels source-through ${name}`,
      css: `
.living-canvas--state-61 .artifact-canvas__branches,
.living-canvas--state-61 .artifact-canvas__preview,
.living-canvas--state-61 .artifact-canvas__inspector {
  filter: brightness(${brightness}) saturate(1.1);
  background:
    radial-gradient(circle at 52% 18%, rgba(240,68,255,0.2), transparent 38%),
    radial-gradient(circle at 56% 22%, rgba(86,155,255,0.1), transparent 34%),
    linear-gradient(180deg, rgba(7,5,24,${panelAlpha}), rgba(4,5,18,${panelAlpha + 0.06}));
}
.living-canvas--state-61 .artifact-preview {
  background:
    radial-gradient(circle at 50% 42%, rgba(240,68,255,${previewMagenta}), transparent 36%),
    radial-gradient(circle at 64% 38%, rgba(47,252,255,${previewCyan}), transparent 30%);
}
`,
    });
  }

  for (const [name, brightness, magenta, lift] of [
    ["chat-more-a", 1.16, 0.22, 0.36],
    ["chat-more-b", 1.2, 0.26, 0.4],
    ["chat-more-c", 1.24, 0.3, 0.44],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 post-baseline chat/timeline additional source lift ${name}`,
      css: `
.app-shell--state-61 .chat-dock.glass {
  filter: brightness(${brightness}) saturate(1.28) hue-rotate(8deg);
  background:
    radial-gradient(circle at 20% 18%, rgba(240,68,255,${magenta}), transparent 38%),
    radial-gradient(circle at 88% 72%, rgba(47,252,255,0.04), transparent 34%),
    linear-gradient(146deg, rgba(48,8,62,0.74), rgba(20,6,42,0.82));
}
.app-shell--state-61 .temporal-memory-ribbon {
  filter: brightness(${1.44 + lift}) saturate(1.34) hue-rotate(8deg);
}
`,
    });
  }

  for (const [name, rightMagenta, bottomMagenta, cyan, opacity] of [
    ["canvas-edge-hot-a", 0.2, 0.18, 0.08, 0.48],
    ["canvas-edge-hot-b", 0.28, 0.24, 0.1, 0.58],
    ["canvas-edge-hot-c", 0.36, 0.3, 0.12, 0.68],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 measured canvas right/bottom edge source lift ${name}`,
      css: `
.living-canvas--state-61::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(90deg, transparent 91%, rgba(47,252,255,${cyan}) 95%, rgba(240,68,255,${rightMagenta}) 98%, rgba(240,68,255,${rightMagenta * 0.72}) 100%),
    linear-gradient(180deg, transparent 91%, rgba(47,252,255,${cyan * 0.78}) 95%, rgba(240,68,255,${bottomMagenta}) 99%, rgba(240,68,255,${bottomMagenta * 0.86}) 100%);
  mix-blend-mode: screen;
  opacity: ${opacity};
}
`,
    });
  }

  for (const [name, magenta, cyan, opacity] of [
    ["canvas-frame-trace-a", 0.2, 0.08, 0.42],
    ["canvas-frame-trace-b", 0.26, 0.1, 0.52],
    ["canvas-frame-trace-c", 0.32, 0.12, 0.62],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 thin frame trace source lift ${name}`,
      css: `
.living-canvas--state-61::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(90deg, transparent 4%, rgba(240,68,255,${magenta}) 5%, transparent 6%, transparent 92%, rgba(240,68,255,${magenta}) 98%, transparent 100%),
    linear-gradient(180deg, transparent 4%, rgba(240,68,255,${magenta}) 5%, transparent 6%, transparent 91%, rgba(240,68,255,${magenta}) 98%, transparent 100%),
    radial-gradient(ellipse at 51% 1%, rgba(240,68,255,${magenta}), transparent 24%),
    radial-gradient(ellipse at 88% 16%, rgba(47,252,255,${cyan}), transparent 22%);
  mix-blend-mode: screen;
  opacity: ${opacity};
}
`,
    });
  }

  for (const [name, width, magenta, cyan, opacity] of [
    ["row-end-glow-a", "24%", 0.22, 0.08, 0.42],
    ["row-end-glow-b", "32%", 0.3, 0.1, 0.52],
    ["row-end-glow-c", "40%", 0.38, 0.12, 0.62],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 right-end artifact row glow ${name}`,
      css: `
.living-canvas--state-61 .artifact-stage__lines span {
  position: relative;
  overflow: hidden;
}
.living-canvas--state-61 .artifact-stage__lines span::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: ${width};
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(90deg, transparent, rgba(240,68,255,${magenta}), rgba(47,252,255,${cyan}));
  mix-blend-mode: screen;
  opacity: ${opacity};
}
`,
    });
  }

  for (const [name, magenta, cyan, white, opacity] of [
    ["top-energy-a", 0.16, 0.08, 0.12, 0.42],
    ["top-energy-b", 0.22, 0.1, 0.16, 0.52],
    ["top-energy-c", 0.3, 0.12, 0.2, 0.62],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 canvas top-edge source energy ${name}`,
      css: `
.living-canvas--state-61::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgba(255,255,255,${white}) 0%, rgba(240,68,255,${magenta}) 4%, transparent 15%),
    radial-gradient(ellipse at 50% 0%, rgba(47,252,255,${cyan}), transparent 30%),
    radial-gradient(ellipse at 13% 8%, rgba(240,68,255,${magenta}), transparent 18%);
  mix-blend-mode: screen;
  opacity: ${opacity};
}
`,
    });
  }

  for (const [name, brightness, magenta, overlay] of [
    ["chat-bottom-dim-a", 1.04, 0.14, 0.18],
    ["chat-bottom-dim-b", 1, 0.12, 0.26],
    ["chat-bottom-dim-c", 0.96, 0.1, 0.34],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 bottom chat luma correction ${name}`,
      css: `
.app-shell--state-61 .chat-dock.glass {
  filter: brightness(${brightness}) saturate(1.2) hue-rotate(8deg);
  background:
    radial-gradient(circle at 20% 18%, rgba(240,68,255,${magenta}), transparent 38%),
    radial-gradient(circle at 88% 72%, rgba(47,252,255,0.04), transparent 34%),
    linear-gradient(146deg, rgba(36,6,52,0.78), rgba(14,4,32,0.86));
}
.app-shell--state-61 .chat-dock.glass::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 46%;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(180deg, transparent, rgba(2,0,8,${overlay}));
}
`,
    });
  }

  for (const [name, minHeight, marginBottom, magenta, white, glow] of [
    ["branch-rows-hot-a", 46, 12, 0.46, 0.1, 0.18],
    ["branch-rows-hot-b", 49, 10, 0.55, 0.13, 0.24],
    ["branch-rows-hot-c", 52, 8, 0.64, 0.16, 0.3],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 branch rows source heat and spacing ${name}`,
      css: `
.living-canvas--state-61 .artifact-branch-list button {
  min-height: ${minHeight}px;
  margin-bottom: ${marginBottom}px;
  background:
    linear-gradient(90deg, rgba(255,255,255,${white}), rgba(240,68,255,${magenta}), rgba(47,252,255,0.1)),
    rgba(255,255,255,0.05);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 0 22px rgba(240,68,255,${glow});
}
`,
    });
  }

  for (const [name, panelAlpha, magenta, cyan, brightness] of [
    ["branch-panel-through-a", 0.68, 0.18, 0.06, 1.02],
    ["branch-panel-through-b", 0.6, 0.24, 0.08, 1.06],
    ["branch-panel-through-c", 0.52, 0.3, 0.1, 1.1],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 branch panel source-through ${name}`,
      css: `
.living-canvas--state-61 .artifact-canvas__branches {
  filter: brightness(${brightness}) saturate(1.08);
  background:
    radial-gradient(circle at 54% 16%, rgba(255,255,255,0.08), transparent 12%),
    radial-gradient(circle at 50% 34%, rgba(240,68,255,${magenta}), transparent 42%),
    radial-gradient(circle at 70% 12%, rgba(47,252,255,${cyan}), transparent 34%),
    linear-gradient(180deg, rgba(7,5,24,${panelAlpha}), rgba(4,5,18,${panelAlpha + 0.08}));
}
`,
    });
  }

  for (const [name, opacity, magenta, cyan, white] of [
    ["preview-texture-a", 0.22, 0.16, 0.08, 0.06],
    ["preview-texture-b", 0.32, 0.22, 0.1, 0.08],
    ["preview-texture-c", 0.42, 0.28, 0.12, 0.1],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 artifact preview cosmic source texture ${name}`,
      css: `
.living-canvas--state-61 .artifact-preview {
  position: relative;
}
.living-canvas--state-61 .artifact-preview::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 45% 34%, rgba(255,255,255,${white}), transparent 3%),
    radial-gradient(circle at 52% 42%, rgba(240,68,255,${magenta}), transparent 26%),
    radial-gradient(circle at 66% 34%, rgba(47,252,255,${cyan}), transparent 30%),
    repeating-conic-gradient(from 22deg at 50% 42%, rgba(240,68,255,0.08) 0 2deg, rgba(47,252,255,0.06) 3deg 5deg, transparent 6deg 14deg);
  mix-blend-mode: screen;
  opacity: ${opacity};
}
.living-canvas--state-61 .artifact-stage {
  position: relative;
  z-index: 1;
}
`,
    });
  }

  for (const [name, brightness, saturate, magenta, cyan, white, glow] of [
    ["first-row-lift-a", 1.08, 1.12, 0.7, 0.1, 0.2, 0.22],
    ["first-row-lift-b", 1.16, 1.18, 0.76, 0.12, 0.24, 0.3],
    ["first-row-lift-c", 1.24, 1.24, 0.82, 0.14, 0.28, 0.38],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 first artifact row source lift ${name}`,
      css: `
.living-canvas--state-61 .artifact-stage__lines span:first-child {
  filter: brightness(${brightness}) saturate(${saturate}) hue-rotate(-8deg);
  background:
    linear-gradient(90deg, rgba(255,255,255,${white}), rgba(240,68,255,${magenta}), rgba(47,252,255,${cyan})),
    rgba(255,255,255,0.06);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.16),
    0 0 28px rgba(240,68,255,${glow});
}
`,
    });
  }

  for (const [name, brightness, saturate, hue, magenta, alpha] of [
    ["preview-label-magenta-a", 0.92, 1.12, -10, 0.14, 0.84],
    ["preview-label-magenta-b", 0.86, 1.2, -18, 0.2, 0.88],
    ["preview-label-magenta-c", 0.8, 1.28, -26, 0.26, 0.92],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 preview source label magenta balance ${name}`,
      css: `
.living-canvas--state-61 .artifact-canvas__preview .artifact-canvas__source-label {
  filter: brightness(${brightness}) saturate(${saturate}) hue-rotate(${hue}deg);
  background:
    radial-gradient(circle at 50% 50%, rgba(240,68,255,${magenta}), transparent 58%),
    rgba(4,8,23,${alpha});
  border-color: rgba(240,68,255,0.42);
  box-shadow: 0 0 20px rgba(240,68,255,0.24);
}
`,
    });
  }

  for (const [name, opacity, brightness, vignette] of [
    ["rail-night-a", 0.24, 0.42, 0.86],
    ["rail-night-b", 0.18, 0.34, 0.88],
    ["rail-night-c", 0.12, 0.26, 0.9],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 darker source outer rails ${name}`,
      css: `
.app-shell--state-61 .left-rail,
.app-shell--state-61 .top-mode-rail {
  opacity: ${opacity};
  filter: saturate(0.48) brightness(${brightness});
}
.app-shell--state-61::before {
  background:
    linear-gradient(90deg, rgba(18,0,28,0.48), rgba(240,68,255,0.1) 22%, transparent 48%, rgba(14,0,24,0.34)),
    radial-gradient(circle at 53% 33%, rgba(240,68,255,0.22), transparent 32%),
    radial-gradient(circle at center, transparent 0%, rgba(20,0,30,0.24) 44%, rgba(0,0,0,${vignette}) 100%);
}
`,
    });
  }

  for (const [name, brightness, saturate, cyan, white, alpha] of [
    ["source-label-green-a", 0.96, 1.12, 0.08, 0.06, 0.86],
    ["source-label-green-b", 1.04, 1.18, 0.12, 0.08, 0.82],
    ["source-label-green-c", 1.12, 1.24, 0.16, 0.1, 0.78],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 source label luma and green correction ${name}`,
      css: `
.living-canvas--state-61 .artifact-canvas__source-label {
  filter: brightness(${brightness}) saturate(${saturate}) hue-rotate(-10deg);
  background:
    radial-gradient(circle at 50% 50%, rgba(255,255,255,${white}), transparent 46%),
    radial-gradient(circle at 48% 55%, rgba(47,252,255,${cyan}), transparent 58%),
    rgba(4,8,23,${alpha});
  border-color: rgba(240,68,255,0.46);
  box-shadow: 0 0 22px rgba(240,68,255,0.25), 0 0 16px rgba(47,252,255,${cyan});
}
.living-canvas--state-61 .artifact-canvas__preview .artifact-canvas__source-label {
  filter: brightness(${Math.max(0.82, brightness - 0.12)}) saturate(${saturate}) hue-rotate(-20deg);
}
`,
    });
  }

  for (const [name, brightness, saturate, white, magenta, cyan, glow] of [
    ["row-top-rebalance-a", 1.04, 1.08, 0.18, 0.58, 0.18, 0.18],
    ["row-top-rebalance-b", 1.08, 1.1, 0.2, 0.62, 0.22, 0.22],
    ["row-top-rebalance-c", 1.12, 1.12, 0.22, 0.66, 0.26, 0.26],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 first artifact row measured source rebalance ${name}`,
      css: `
.living-canvas--state-61 .artifact-stage__lines span:first-child {
  filter: brightness(${brightness}) saturate(${saturate}) hue-rotate(-6deg);
  background:
    linear-gradient(90deg, rgba(255,255,255,${white}), rgba(240,68,255,${magenta}), rgba(47,252,255,${cyan})),
    rgba(255,255,255,0.055);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.16),
    0 0 20px rgba(240,68,255,${glow});
}
`,
    });
  }

  for (const [name, panelAlpha, magenta, cyan, blur] of [
    ["panel-through-layer-a", 0.62, 0.2, 0.08, 0],
    ["panel-through-layer-b", 0.56, 0.24, 0.1, 0.5],
    ["panel-through-layer-c", 0.5, 0.28, 0.12, 1],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 canvas panels source-through layer ${name}`,
      css: `
.living-canvas--state-61 .artifact-canvas__branches,
.living-canvas--state-61 .artifact-canvas__preview,
.living-canvas--state-61 .artifact-canvas__inspector {
  backdrop-filter: blur(${blur}px) saturate(1.2);
  background:
    radial-gradient(circle at 48% 18%, rgba(255,255,255,0.08), transparent 10%),
    radial-gradient(circle at 48% 34%, rgba(240,68,255,${magenta}), transparent 38%),
    radial-gradient(circle at 62% 28%, rgba(47,252,255,${cyan}), transparent 34%),
    linear-gradient(180deg, rgba(7,5,24,${panelAlpha}), rgba(4,5,18,${panelAlpha + 0.08}));
}
`,
    });
  }

  for (const [name, opacity, white, magenta, cyan] of [
    ["preview-source-through-d", 0.28, 0.08, 0.22, 0.12],
    ["preview-source-through-e", 0.36, 0.1, 0.26, 0.14],
    ["preview-source-through-f", 0.44, 0.12, 0.3, 0.16],
  ]) {
    candidates.push({
      id: `s61-${name}`,
      description: `State 61 artifact preview source-through texture ${name}`,
      css: `
.living-canvas--state-61 .artifact-preview {
  position: relative;
}
.living-canvas--state-61 .artifact-preview::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 48% 22%, rgba(255,255,255,${white}), transparent 3%),
    radial-gradient(circle at 50% 40%, rgba(240,68,255,${magenta}), transparent 28%),
    radial-gradient(circle at 62% 33%, rgba(47,252,255,${cyan}), transparent 34%),
    repeating-linear-gradient(115deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 18px);
  mix-blend-mode: screen;
  opacity: ${opacity};
}
.living-canvas--state-61 .artifact-stage {
  position: relative;
  z-index: 1;
}
`,
    });
  }

  return candidates;
}

function state06Candidates() {
  const candidates = [];

  for (const [name, flowBrightness, flowSaturate, sceneOpacity, ribbonOpacity] of [
    ["scene-dim-a", 0.78, 0.82, 0.86, 0.1],
    ["scene-dim-b", 0.66, 0.72, 0.78, 0.07],
    ["scene-dim-c", 0.56, 0.64, 0.72, 0.045],
  ]) {
    candidates.push({
      id: `s06-${name}`,
      description: `State 06 alert scene/core dim ${name}`,
      css: `
.app-shell--state-06 .living-scene {
  opacity: ${sceneOpacity};
  filter: brightness(${flowBrightness}) saturate(${flowSaturate}) hue-rotate(-14deg);
}
.app-shell--state-06 .flow-field {
  filter: brightness(${flowBrightness}) saturate(${flowSaturate}) hue-rotate(-18deg);
}
.app-shell--state-06 .flow-field__ribbon,
.app-shell--state-06 .flow-field.flow-field--alert .flow-field__ribbon,
.app-shell--state-06 .flow-field.flow-field--causal .flow-field__ribbon {
  opacity: ${ribbonOpacity};
}
.app-shell--state-06 .flow-field__thread,
.app-shell--state-06 .flow-field__spark-trace,
.app-shell--state-06 .flow-field.flow-field--alert .flow-field__thread,
.app-shell--state-06 .flow-field.flow-field--causal .flow-field__thread,
.app-shell--state-06 .flow-field.flow-field--alert .flow-field__spark-trace,
.app-shell--state-06 .flow-field.flow-field--causal .flow-field__spark-trace {
  opacity: ${ribbonOpacity * 2.4};
}
`,
    });
  }

  for (const [name, layerOpacity, brightness, red, alpha] of [
    ["panel-red-a", 0.66, 1.04, 0.18, 0.76],
    ["panel-red-b", 0.76, 1.1, 0.26, 0.7],
    ["panel-red-c", 0.86, 1.16, 0.34, 0.64],
  ]) {
    candidates.push({
      id: `s06-${name}`,
      description: `State 06 alert panel red lift ${name}`,
      css: `
.app-shell--state-06 .floating-panel-layer {
  opacity: ${layerOpacity};
  filter: brightness(${brightness}) saturate(1.22) hue-rotate(-10deg);
}
.app-shell--state-06 .floating-panel.glass {
  border-color: rgba(255,59,95,0.42);
  background:
    radial-gradient(circle at 20% 18%, rgba(255,59,95,${red}), transparent 36%),
    radial-gradient(circle at 72% 32%, rgba(255,138,50,0.08), transparent 34%),
    linear-gradient(146deg, rgba(54,8,24,${alpha}), rgba(24,4,18,${alpha + 0.08}));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.1),
    0 0 54px rgba(255,59,95,0.18),
    0 22px 80px rgba(0,0,0,0.36);
}
`,
    });
  }

  for (const [name, brightness, red, alpha] of [
    ["chat-red-a", 1.12, 0.18, 0.78],
    ["chat-red-b", 1.22, 0.26, 0.72],
    ["chat-red-c", 1.32, 0.34, 0.66],
  ]) {
    candidates.push({
      id: `s06-${name}`,
      description: `State 06 alert chat red lift ${name}`,
      css: `
.app-shell--state-06 .chat-dock.glass {
  filter: brightness(${brightness}) saturate(1.22) hue-rotate(-8deg);
  border-color: rgba(255,59,95,0.34);
  background:
    radial-gradient(circle at 18% 18%, rgba(255,59,95,${red}), transparent 38%),
    radial-gradient(circle at 88% 72%, rgba(240,68,255,0.07), transparent 34%),
    linear-gradient(146deg, rgba(56,8,24,${alpha}), rgba(22,5,18,${alpha + 0.08}));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.1),
    0 24px 94px rgba(0,0,0,0.48),
    0 0 70px rgba(255,59,95,0.26);
}
`,
    });
  }

  const sceneDimB = `
.app-shell--state-06 .living-scene {
  opacity: 0.78;
  filter: brightness(0.66) saturate(0.72) hue-rotate(-14deg);
}
.app-shell--state-06 .flow-field {
  filter: brightness(0.66) saturate(0.72) hue-rotate(-18deg);
}
.app-shell--state-06 .flow-field__ribbon,
.app-shell--state-06 .flow-field.flow-field--alert .flow-field__ribbon,
.app-shell--state-06 .flow-field.flow-field--causal .flow-field__ribbon {
  opacity: 0.07;
}
.app-shell--state-06 .flow-field__thread,
.app-shell--state-06 .flow-field__spark-trace,
.app-shell--state-06 .flow-field.flow-field--alert .flow-field__thread,
.app-shell--state-06 .flow-field.flow-field--causal .flow-field__thread,
.app-shell--state-06 .flow-field.flow-field--alert .flow-field__spark-trace,
.app-shell--state-06 .flow-field.flow-field--causal .flow-field__spark-trace {
  opacity: 0.168;
}
`;
  const panelRedB = `
.app-shell--state-06 .floating-panel-layer {
  opacity: 0.76;
  filter: brightness(1.1) saturate(1.22) hue-rotate(-10deg);
}
.app-shell--state-06 .floating-panel.glass {
  border-color: rgba(255,59,95,0.42);
  background:
    radial-gradient(circle at 20% 18%, rgba(255,59,95,0.26), transparent 36%),
    radial-gradient(circle at 72% 32%, rgba(255,138,50,0.08), transparent 34%),
    linear-gradient(146deg, rgba(54,8,24,0.7), rgba(24,4,18,0.78));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.1),
    0 0 54px rgba(255,59,95,0.18),
    0 22px 80px rgba(0,0,0,0.36);
}
`;
  const chatRedA = `
.app-shell--state-06 .chat-dock.glass {
  filter: brightness(1.12) saturate(1.22) hue-rotate(-8deg);
  border-color: rgba(255,59,95,0.34);
  background:
    radial-gradient(circle at 18% 18%, rgba(255,59,95,0.18), transparent 38%),
    radial-gradient(circle at 88% 72%, rgba(240,68,255,0.07), transparent 34%),
    linear-gradient(146deg, rgba(56,8,24,0.78), rgba(22,5,18,0.86));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.1),
    0 24px 94px rgba(0,0,0,0.48),
    0 0 70px rgba(255,59,95,0.26);
}
`;

  for (const [name, parts] of [
    ["scene-panel", [sceneDimB, panelRedB]],
    ["scene-chat", [sceneDimB, chatRedA]],
    ["panel-chat", [panelRedB, chatRedA]],
    ["scene-panel-chat", [sceneDimB, panelRedB, chatRedA]],
  ]) {
    candidates.push({
      id: `s06-combo-${name}`,
      description: `State 06 alert measured combo ${name}`,
      css: parts.join("\n"),
    });
  }

  return candidates;
}

function state26Candidates() {
  const candidates = [];

  const sourceLargeBase = ({
    name,
    top = 86,
    width = 782,
    maxHeight = 544,
    radius = 24,
    shellAlpha = 0.52,
    shellBottomAlpha = 0.46,
    border = 0.58,
    cyan = 0.12,
    itemCyan = 0.24,
    itemCyanEnd = 0.14,
    titleSize = 31,
    subtitleSize = 16,
    searchHeight = 53,
    itemHeight = 58,
    itemTitle = 24,
    itemSubtitle = 18,
  }) => ({
    id: `s26-${name}`,
    description: `State 26 command-palette source-scale ${name}`,
    css: `
.app-shell--state-26 .command-palette-backdrop {
  padding-top: ${top}px;
  background:
    radial-gradient(circle at 50% 30%, rgba(47, 252, 255, 0.06), transparent 36%),
    rgba(0, 20, 20, 0.12);
  backdrop-filter: none;
}

.app-shell--state-26 .command-palette {
  position: relative;
  width: ${width}px;
  max-height: ${maxHeight}px;
  border-radius: ${radius}px;
  border-color: rgba(47, 252, 255, ${border});
  background:
    radial-gradient(circle at 50% 48%, rgba(47, 252, 255, ${cyan}), transparent 34%),
    linear-gradient(180deg, rgba(3, 10, 26, ${shellAlpha}), rgba(3, 8, 20, ${shellBottomAlpha}));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(47, 252, 255, 0.24),
    0 24px 78px rgba(0, 0, 0, 0.42),
    0 0 52px rgba(47, 252, 255, 0.14);
}

.app-shell--state-26 .command-palette::before {
  content: "CMD K GLOBAL ACTIONS";
  position: absolute;
  left: 51%;
  top: -24px;
  z-index: 2;
  transform: translateX(-50%);
  height: 36px;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(47, 252, 255, 0.66);
  border-radius: 999px;
  color: white;
  background: rgba(2, 8, 18, 0.88);
  box-shadow: 0 0 20px rgba(47, 252, 255, 0.2);
  padding: 0 18px;
  font-size: 22px;
  font-weight: 900;
}

.app-shell--state-26 .command-palette__title {
  padding: 29px 33px 14px;
}

.app-shell--state-26 .command-palette__title strong {
  font-size: ${titleSize}px;
}

.app-shell--state-26 .command-palette__title span {
  margin-top: 9px;
  font-size: ${subtitleSize}px;
}

.app-shell--state-26 .command-palette__search {
  position: relative;
  height: ${searchHeight}px;
  grid-template-columns: 50px 1fr;
  margin: 0 26px 13px;
  border-radius: 18px;
  background: rgba(47, 252, 255, 0.18);
  overflow: hidden;
}

.app-shell--state-26 .command-palette__search::before {
  content: "CMD";
  color: white;
  font-size: 18px;
  font-weight: 900;
}

.app-shell--state-26 .command-palette__search svg,
.app-shell--state-26 .command-palette__search kbd {
  display: none;
}

.app-shell--state-26 .command-palette__search input {
  font-size: 24px;
  font-weight: 760;
}

.app-shell--state-26 .command-palette__list {
  max-height: none;
  padding: 0 26px 25px;
}

.app-shell--state-26 .command-palette__list button {
  position: relative;
  min-height: ${itemHeight}px;
  grid-template-columns: 1fr;
  margin-top: 8px;
  border-radius: 13px;
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.08), transparent 68%),
    linear-gradient(90deg, rgba(47, 252, 255, ${itemCyan}), rgba(47, 252, 255, ${itemCyanEnd})),
    rgba(255, 255, 255, 0.02);
  padding: 0 32px;
}

.app-shell--state-26 .command-palette__item-icon,
.app-shell--state-26 .command-palette__list button > kbd {
  display: none;
}

.app-shell--state-26 .command-palette__item-copy {
  min-width: 0;
}

.app-shell--state-26 .command-palette__item-copy strong {
  display: block;
  color: white;
  font-size: ${itemTitle}px;
  line-height: 1;
  font-weight: 750;
}

.app-shell--state-26 .command-palette__item-copy em {
  position: absolute;
  right: 30px;
  top: 50%;
  transform: translateY(-50%);
  max-width: 220px;
  color: rgba(232, 246, 255, 0.72);
  font-size: ${itemSubtitle}px;
  line-height: 1;
  text-align: right;
}
`,
  });

  [
    sourceLargeBase({ name: "source-large-a" }),
    sourceLargeBase({ name: "source-large-b", top: 76, width: 820, maxHeight: 566, shellAlpha: 0.62, shellBottomAlpha: 0.54, border: 0.68, cyan: 0.16, itemCyan: 0.28, itemCyanEnd: 0.16 }),
    sourceLargeBase({ name: "source-large-c", top: 96, width: 748, maxHeight: 526, shellAlpha: 0.46, shellBottomAlpha: 0.42, border: 0.5, cyan: 0.1, itemCyan: 0.2, itemCyanEnd: 0.1, titleSize: 29, subtitleSize: 15, itemTitle: 22, itemSubtitle: 17 }),
    sourceLargeBase({ name: "source-large-d", top: 68, width: 842, maxHeight: 584, radius: 22, shellAlpha: 0.7, shellBottomAlpha: 0.62, border: 0.74, cyan: 0.18, itemCyan: 0.32, itemCyanEnd: 0.18, titleSize: 32, subtitleSize: 17, itemHeight: 62, itemTitle: 25, itemSubtitle: 19 }),
  ].forEach((candidate) => candidates.push(candidate));

  for (const [name, top, blur, alpha, cyan] of [
    ["backdrop-clear-a", 86, "none", 0.12, 0.06],
    ["backdrop-clear-b", 74, "none", 0.18, 0.1],
    ["backdrop-soft-a", 92, "blur(2px)", 0.18, 0.12],
    ["backdrop-soft-b", 72, "blur(4px)", 0.22, 0.14],
  ]) {
    candidates.push({
      id: `s26-${name}`,
      description: `State 26 command backdrop ${name}`,
      css: `
.app-shell--state-26 .command-palette-backdrop {
  padding-top: ${top}px;
  background:
    radial-gradient(circle at 50% 24%, rgba(47,252,255,${cyan}), transparent 34%),
    rgba(0,0,0,${alpha});
  backdrop-filter: ${blur};
}
`,
    });
  }

  for (const [name, opacity, brightness, saturation] of [
    ["shell-dim-a", 0.62, 0.78, 0.78],
    ["shell-dim-b", 0.52, 0.7, 0.72],
    ["shell-dim-c", 0.42, 0.62, 0.66],
  ]) {
    candidates.push({
      id: `s26-${name}`,
      description: `State 26 background shell dim ${name}`,
      css: `
.app-shell--state-26 .living-scene,
.app-shell--state-26 .floating-panel-layer,
.app-shell--state-26 .chat-dock.glass,
.app-shell--state-26 .temporal-memory-ribbon {
  opacity: ${opacity};
  filter: brightness(${brightness}) saturate(${saturation});
}
`,
    });
  }

  for (const [name, width, alpha, cyan, itemCyan, border] of [
    ["palette-tint-a", 780, 0.78, 0.12, 0.18, 0.32],
    ["palette-tint-b", 800, 0.64, 0.18, 0.26, 0.52],
    ["palette-tint-c", 760, 0.52, 0.1, 0.2, 0.42],
  ]) {
    candidates.push({
      id: `s26-${name}`,
      description: `State 26 current palette tint ${name}`,
      css: `
.app-shell--state-26 .command-palette {
  width: ${width}px;
  border-color: rgba(47,252,255,${border});
  background:
    radial-gradient(circle at 48% 45%, rgba(47,252,255,${cyan}), transparent 42%),
    linear-gradient(180deg, rgba(3,10,26,${alpha}), rgba(4,10,24,${Math.max(0.46, alpha - 0.12)}));
}
.app-shell--state-26 .command-palette__list button {
  background:
    radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08), transparent 68%),
    linear-gradient(90deg, rgba(47,252,255,${itemCyan}), rgba(47,252,255,${itemCyan / 2}));
}
`,
    });
  }

  return candidates;
}

export function builtInCandidates(states) {
  const set = new Set(states);
  let candidates = [{ id: "baseline", description: "No proof-time CSS override", css: "" }];
  if (set.has("01")) candidates = candidates.concat(state01Candidates());
  if (set.has("06")) candidates = candidates.concat(state06Candidates());
  if (set.has("26")) candidates = candidates.concat(state26Candidates());
  if (set.has("37")) candidates = candidates.concat(state37Candidates());
  if (set.has("61")) candidates = candidates.concat(state61Candidates());
  return candidates;
}

export async function runReactSeeSuiteCssSweep({
  states = ["37"],
  bankRoot = DEFAULT_BANK_ROOT,
  proofDir = PROOF_DIR,
  candidateOffset = 0,
  candidateLimit = null,
  writeReceipt = true,
} = {}) {
  await fs.mkdir(proofDir, { recursive: true });
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const id = `${stamp()}-react-see-suite-css-sweep`;
  const sweepDir = path.join(proofDir, id);
  const overrideDir = path.join(sweepDir, "overrides");
  await fs.mkdir(overrideDir, { recursive: true });

  const offset = Number(candidateOffset) || 0;
  const limit = candidateLimit ? Number(candidateLimit) : undefined;
  const candidates = builtInCandidates(states).slice(offset, limit ? offset + limit : undefined);
  const results = [];
  const failures = [];
  const startedAt = new Date().toISOString();
  const receiptPath = path.join(RECEIPTS_DIR, `${id}-receipt.json`);

  async function writePartialReceipt() {
    if (!writeReceipt) return;
    const sorted = [...results].sort((a, b) => b.average_score_1000 - a.average_score_1000);
    await fs.writeFile(receiptPath, `${JSON.stringify({
      ok: failures.length === 0,
      version: "orangebox-react-see-suite-css-sweep/v1",
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      states,
      candidate_offset: offset,
      candidate_count: candidates.length,
      result_count: results.length,
      in_progress: results.length + failures.length < candidates.length,
      sweep_dir: sweepDir,
      best: sorted[0] || null,
      results,
      failures,
      rollback: "CSS overrides are proof-time only unless promoted into /v4/react source CSS.",
      receipt_path: receiptPath,
    }, null, 2)}\n`, "utf8");
  }

  for (const candidate of candidates) {
    const cssPath = path.join(overrideDir, `${candidate.id}.css`);
    if (candidate.css) await fs.writeFile(cssPath, candidate.css.trimStart(), "utf8");

    try {
      const proof = await runReactSeeSuite72StateProof({
        bankRoot,
        proofDir,
        states,
        cssOverridePath: candidate.css ? cssPath : null,
        writeReceipt: false,
      });
      const compare = await runReactSeeSuitePixelCompare({
        runDir: proof.run_dir,
        bankRoot,
        proofDir,
        states,
        writeReceipt: false,
      });

      results.push({
        id: candidate.id,
        description: candidate.description,
        css_path: candidate.css ? cssPath : null,
        css_sha256: candidate.css ? sha256Text(candidate.css) : null,
        ok: Boolean(proof.ok && compare.ok),
        average_score_1000: compare.average_score_1000,
        worst_score_1000: compare.worst_score_1000,
        best_score_1000: compare.best_score_1000,
        source_exact_count: compare.source_exact_count,
        proof_run_dir: proof.run_dir,
        pixel_out_dir: compare.out_dir,
        states: (compare.states || []).map((state) => ({
          id: state.id,
          score_1000: state.score_1000,
          mae: state.mae,
          edge_mae: state.edge_mae,
          hotspots: (state.hotspots || []).slice(0, 3),
        })),
      });
      await writePartialReceipt();
    } catch (error) {
      failures.push({
        id: candidate.id,
        description: candidate.description,
        message: error instanceof Error ? error.message : String(error),
        stack: compact(error?.stack, 2200),
      });
      await writePartialReceipt();
    }
  }

  const sorted = [...results].sort((a, b) => b.average_score_1000 - a.average_score_1000);
  const receipt = {
    ok: failures.length === 0,
    version: "orangebox-react-see-suite-css-sweep/v1",
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    started_at: startedAt,
    states,
    candidate_offset: offset,
    candidate_count: candidates.length,
    result_count: results.length,
    in_progress: false,
    sweep_dir: sweepDir,
    best: sorted[0] || null,
    results,
    failures,
    rollback: "CSS overrides are proof-time only unless promoted into /v4/react source CSS.",
    receipt_path: receiptPath,
  };
  if (writeReceipt) await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const result = await runReactSeeSuiteCssSweep({
    bankRoot: args.get("--bank-root") || DEFAULT_BANK_ROOT,
    proofDir: args.get("--proof-dir") || PROOF_DIR,
    states: parseStateIds(args.get("--states")),
    candidateOffset: args.get("--offset") || 0,
    candidateLimit: args.get("--limit") || null,
    writeReceipt: !args.has("--no-receipt"),
  });
  if (args.has("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.version}`);
    console.log(`best: ${result.best?.id || "(none)"} ${result.best?.average_score_1000?.toFixed?.(2) || ""}`);
    console.log(`receipt: ${result.receipt_path}`);
  }
}
