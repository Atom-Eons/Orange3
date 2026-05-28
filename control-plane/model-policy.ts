import type { Step } from "./engine.ts";

export type ControlPlaneLane = "local_endpoint" | "local_fast" | "local_code" | "subscription_frontier" | "subscription_contrarian" | "tool_execution";

export interface StepRoutePolicy {
  step_id: string;
  task_type: string;
  assigned_node: string;
  primary_lane: ControlPlaneLane;
  subscription_first: boolean;
  api_last_resort: boolean;
  fallback_chain: string[];
  escalation_advisor: string;
  escalation_reason: string;
}

function lower(value: string) {
  return String(value || "").toLowerCase();
}

function laneForStep(step: Step): ControlPlaneLane {
  const task = lower(step.task_type);
  const node = lower(step.assigned_node);
  if (node.includes("llama-cpp")
    || node.includes("llama.cpp")
    || node.includes("local-llama")
    || node.includes("ai-box-readonly")
    || node.includes("ai-box-ollama-probe")
    || node.includes("ai-box-command-proof")
    || node.includes("ai-box-runtime-proof")
    || node.includes("ai-box-worker-proof")) return "local_endpoint";
  if (task.includes("os_execution") || task.includes("terminal") || node.includes("agy")) return "tool_execution";
  if (node.includes("qwen")) return "local_code";
  if (node.includes("bonsai") || node.includes("swarm") || node.includes("pod-")) return "local_fast";
  if (task.includes("contrarian") || node.includes("gemini") || node.includes("antigravity")) return "subscription_contrarian";
  if (task.includes("architecture") || task.includes("synthesis") || task.includes("review")) return "subscription_frontier";
  if (task.includes("code")) return "local_code";
  return "local_fast";
}

export function routePolicyForStep(stepId: string, step: Step): StepRoutePolicy {
  const lane = laneForStep(step);
  const fallbackByLane: Record<ControlPlaneLane, string[]> = {
    local_fast: ["local_bonsai", "local_qwen", "codex_subscription", "claude_subscription"],
    local_endpoint: ["local_llama_listener", "ai_box_triad_readonly", "local_qwen", "codex_subscription"],
    local_code: ["local_qwen", "codex_subscription", "claude_subscription"],
    subscription_frontier: ["claude_subscription", "codex_subscription", "local_qwen"],
    subscription_contrarian: ["agy_or_gemini_subscription", "claude_subscription", "local_qwen"],
    tool_execution: ["deterministic_tool", "agy_subscription", "codex_subscription"],
  };
  const advisorByLane: Record<ControlPlaneLane, string> = {
    local_fast: "claude_opus_synthesis",
    local_endpoint: "codex_validator_then_claude_opus",
    local_code: "codex_validator_then_claude_opus",
    subscription_frontier: "claude_opus_synthesis",
    subscription_contrarian: "gemini_contrarian_best_available",
    tool_execution: "codex_execution_validator",
  };
  return {
    step_id: stepId,
    task_type: step.task_type,
    assigned_node: step.assigned_node,
    primary_lane: lane,
    subscription_first: lane.startsWith("subscription") || lane === "tool_execution",
    api_last_resort: true,
    fallback_chain: fallbackByLane[lane],
    escalation_advisor: advisorByLane[lane],
    escalation_reason: "Retry cap reached under deterministic validation; package the explicit context, output, and error trace for one larger-model hint.",
  };
}

export function escalationAdvisorForStep(stepId: string, step: Step) {
  const policy = routePolicyForStep(stepId, step);
  return {
    advisor: policy.escalation_advisor,
    reason: policy.escalation_reason,
    fallback_chain: policy.fallback_chain,
    api_last_resort: policy.api_last_resort,
  };
}
