# AELang Resiliency Module

Status: planned AELang extension and ORANGEBOX reliability feature set.
Version: `aelang-resiliency/v0.1-plan`
Date: 2026-05-23

## Why This Exists

The live operator problem is blunt:

- APIs stall.
- Claude/Codex/Grok/Gemini sessions can freeze, hit limits, or run out.
- Agents can be half-done, running, or stuck.
- Projects lose track of what actually happened.
- Generated artifacts can be claimed but not delivered to the operator machine.

This module makes continuity a first-class language and runtime concern. It does not replace doctors, receipts, or human approval. It gives AELang and ORANGEBOX the syntax, data model, and proof gates needed to survive real-world agent failures. In product terms, this is the planned checkpointed missions layer.

## Core Principle

Every serious agent action is a checkpointed transaction:

1. Intent receipt.
2. Heartbeat receipts while running.
3. Intermediate checkpoint receipts at safe boundaries.
4. Success, failure, paused, stalled, or resumed receipt.
5. Resume ticket when work cannot finish.

No route is "green" because a model said it finished. It is green only when the route has proof, artifact availability, and a recovery path.

## AELang-High Planned Syntax

```aelang
mission "Large Refactor With Continuity" {
  objective: "Refactor a large module without losing state if the model stalls"

  route {
    departments: [AE0.Factory, AE6.Code, AE7.Review, AE10.Ops]
    proof_gates: [tests_pass, receipt_chain_valid, rollback_ready]
  }

  checkpointed {
    heartbeat every 60s
    checkpoint on [file_patch, test_run, package_step]

    api_resilience {
      primary: Opus
      fallback: [GPT, Grok, Gemini, Local]
      retry: exponential_backoff max=5
      timeout: 45s
      circuit_breaker after=3_failures reset_after=10m
      queue: background if_stalled
    }

    parallel {
      AE6.Code implements refactor
      AE7.Review verifies diff
      AE10.Ops watches continuity
    }

    on_stall {
      pause_mission
      create_resume_ticket
      notify operator with exact_recovery_steps
    }

    on_resume {
      continue_from_last_green_receipt
    }
  }

  verify full_proof
}
```

## AELang-Core Planned Shape

```aelang
route_packet {
  id: "large-refactor-continuity-001"
  objective: "Refactor a large module without losing state if the model stalls"
  departments: ["AE0", "AE6", "AE7", "AE10"]
  actions: [
    { type: "implement", target: "refactor", department: "AE6" },
    { type: "verify", target: "diff", department: "AE7" },
    { type: "watch", target: "continuity", department: "AE10" }
  ]
  proof_gates: ["tests_pass", "receipt_chain_valid", "rollback_ready"]
  recovery: "last_green_receipt"
  receipt_policy: "checkpointed"
}
```

## Runtime Features Required

### 1. Provider Health Monitor

Tracks per-lane:

- availability
- latency
- timeout count
- rate-limit count
- last successful call
- last failed call
- circuit breaker state
- fallback target

Proof gate:

- `obx resilience doctor --provider-health --receipt`

### 2. Retry / Backoff Queue

Retries transient failures without losing route context.

Required policy fields:

- `retry_strategy`
- `max_retries`
- `timeout_ms`
- `next_retry_at`
- `last_error`
- `operator_override_required`

Proof gate:

- simulated timeout produces retry receipt, not silent failure.

### 3. Circuit Breakers

If a provider stalls repeatedly, ORANGEBOX marks the lane degraded and routes around it.

Required states:

- `closed`: provider usable
- `open`: provider blocked after repeated failures
- `half_open`: probe mode before restoring

Proof gate:

- simulated three failures opens circuit and AE Operations shows recovery.

### 4. Heartbeat Receipts

Every running agent emits periodic heartbeat receipts.

Required heartbeat fields:

- `receipt_id`
- `route_packet_id`
- `agent_id`
- `department`
- `model_lane`
- `status`
- `step_index`
- `last_checkpoint_id`
- `alive_at`

Proof gate:

- missing heartbeat triggers a stall receipt.

### 5. Stall Receipts

When work stops progressing, ORANGEBOX records the stall as state, not mystery.

Required stall fields:

- `receipt_id`
- `route_packet_id`
- `agent_id`
- `stalled_at`
- `last_heartbeat_id`
- `last_green_receipt_id`
- `suspected_cause`
- `safe_resume_command`
- `operator_recovery_steps`

Proof gate:

- `obx resilience simulate-stall --receipt` creates a stalled receipt and resume ticket.

### 6. Resume Tickets

Resume tickets let any capable lane continue from the last safe point.

Required ticket fields:

- `ticket_id`
- `route_packet_id`
- `resume_from_receipt_id`
- `remaining_macro_actions`
- `blocked_artifacts`
- `suggested_model_lane`
- `rollback_path`
- `approval_required`

Proof gate:

- `obx resilience resume-ticket --latest --json` returns a complete ticket.

### 7. Artifact Delivery Contract

Any claimed generated artifact must be accessible to the operator.

Required artifact claim fields:

- `artifact_id`
- `path`
- `exists`
- `bytes`
- `sha256`
- `preview_available`
- `open_action`
- `package_included`
- `created_by_receipt_id`

Failure rule:

- A claimed artifact that does not exist is a failed proof, not a warning.

Proof gate:

- `obx artifact doctor --receipt`

### 8. Offline Sync And Conflict Resolution

Offline work should create local receipt chains and reconcile later.

Required fields:

- `device_id`
- `local_receipt_chain`
- `route_packet_version_vector`
- `mutation_log`
- `conflict_set`
- `resolution_policy`
- `sync_receipt_id`

Conflict tiers:

- Tier 1: auto-merge non-overlapping route packet or canvas mutations.
- Tier 2: propose merge with visual diff.
- Tier 3: freeze route and require operator/department approval.

Proof gate:

- `obx sync doctor --offline-simulation --receipt`

## Planned Formal Receipt Schema

Receipts should validate against a canonical schema while allowing legacy receipts to remain readable.

Required common fields:

- `receipt_id`
- `created_at`
- `project`
- `action_type`
- `status`
- `route_packet_id`
- `department`
- `model_lane`
- `description`
- `proof`
- `rollback_path`

Recommended status values:

- `success`
- `warning`
- `blocked`
- `stalled`
- `failed`
- `paused`
- `resumed`
- `cancelled`

Recommended action types:

- `mission_start`
- `mission_complete`
- `mutation`
- `parallel_execution`
- `delegate`
- `verify`
- `release`
- `rollback`
- `api_call`
- `stall_detected`
- `sync`
- `error`
- `resume`
- `checkpoint`
- `artifact_claim`
- `artifact_verified`

Proof gate:

- `obx receipts schema-doctor --receipt`

## Implementation Phases

### Phase 1: Spec + Fixtures

- Add resiliency syntax examples.
- Add invalid syntax fixtures.
- Extend AELang doctor with planned-extension awareness.
- No runtime execution yet.

### Phase 2: Receipt Schema Doctor

- Add JSON Schema.
- Validate latest receipts.
- Legacy-lane old receipts.

### Phase 3: Artifact Delivery Doctor

- Validate generated artifact claims.
- Fail missing files hard.
- Add Artifact Library status in AE Operations.

### Phase 4: Agent Continuity

- Add heartbeat receipts to agent jobs.
- Add stall detection.
- Add resume tickets.
- Add restart rehearsal.

### Phase 5: Provider Resilience

- Add provider health monitor.
- Add retry/backoff queue.
- Add circuit breakers and fallback receipts.

### Phase 6: Offline Sync

- Add local receipt ledger.
- Add version vectors.
- Add conflict resolver and Silent Canvas diff display.

## Current Reality Check

AELang v0.1 is functional as a route language bridge. It is not yet a full programming language or runtime. The current implementation can parse and compile a useful subset into route packets, but this resiliency module is still planned. That distinction must stay visible in AE Operations and the Final Green Board.
