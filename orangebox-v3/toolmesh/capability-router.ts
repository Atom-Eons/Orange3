import { loadToolCards } from "./tool-registry";
import type { ToolCard } from "./tool-card.schema";
import { estimateCardRisk } from "./tool-card.schema";

export type CapabilityRoute = {
  intent: string;
  matchedLab: string;
  candidates: {
    id: string;
    name: string;
    lab: string;
    role: string;
    risk: number;
    status: string;
    reason: string;
  }[];
  executionAllowed: false;
  nextGate: string;
};

const LAB_KEYWORDS: Record<string, string[]> = {
  "image-lab": ["image", "logo", "poster", "thumbnail", "hero", "cover", "sprite", "photo", "art"],
  "video-lab": ["video", "reel", "clip", "trailer", "motion", "edit", "render"],
  "audio-lab": ["audio", "voice", "transcribe", "music", "stem", "sound", "podcast"],
  "design-lab": ["design", "vector", "svg", "wireframe", "brand", "layout", "canvas"],
  "coding-lab": ["code", "repo", "patch", "test", "refactor", "build", "ide"],
  "automation-lab": ["automate", "workflow", "trigger", "queue", "cron", "webhook"],
  "analytics-lab": ["analytics", "market", "campaign", "metric", "funnel", "seo", "report"],
  "public-agent-lab": ["public agent", "chatbot", "visitor", "lead", "support", "faq"],
  "observability-lab": ["trace", "latency", "observability", "eval", "telemetry", "tokens"],
  "security-lab": ["security", "secret", "vulnerability", "scan", "dependency", "sast"],
  "releaseops-lab": ["release", "deploy", "rollback", "package", "domain", "preflight"],
  "alpha-watchlist": ["candidate", "alpha", "new tool", "research", "watchlist", "benchmark"],
};

export function classifyIntent(intent: string): string {
  const text = intent.toLowerCase();
  let bestLab = "alpha-watchlist";
  let bestScore = 0;
  for (const [lab, keywords] of Object.entries(LAB_KEYWORDS)) {
    const score = keywords.filter((keyword) => text.includes(keyword)).length;
    if (score > bestScore) {
      bestLab = lab;
      bestScore = score;
    }
  }
  return bestLab;
}

export function routeCapability(intent: string, cards = loadToolCards()): CapabilityRoute {
  const matchedLab = classifyIntent(intent);
  const ranked = cards
    .filter((card) => card.lab === matchedLab || card.capabilities.some((capability) => intent.toLowerCase().includes(capability.toLowerCase())))
    .map((card: ToolCard) => ({
      id: card.id,
      name: card.name,
      lab: card.lab,
      role: card.orangeboxRole,
      risk: estimateCardRisk(card),
      status: card.status,
      reason: card.lab === matchedLab ? "lab keyword match" : "capability keyword match",
    }))
    .sort((a, b) => a.risk - b.risk || a.id.localeCompare(b.id))
    .slice(0, 5);

  return {
    intent,
    matchedLab,
    candidates: ranked,
    executionAllowed: false,
    nextGate: "Run the lab doctor, STRONGARM if repo/publish risk exists, then emit a tool receipt before execution.",
  };
}
