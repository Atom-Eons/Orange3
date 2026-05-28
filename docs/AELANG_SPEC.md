# AELang - Agentic Engine Language

Version: 0.1  
Product: ORANGEBOX / AE See-Suite / AE Operations  
Date: 2026-05-23

## Purpose

AELang is a two-tier, AI-native route language for ORANGEBOX. It gives human operators and model lanes a compact way to describe work that can become a real Route Packet, Department OS plan, Silent Canvas mutation story, proof gate list, and receipt trail.

AELang is not a magic executor. It is a deterministic language bridge:

- Parse operator intent.
- Validate Department OS lanes.
- Compile high-level mission language into a precise route packet.
- Map route packets into the ORANGEBOX Operating Spine.
- Preserve proof, recovery, and receipt expectations.
- Avoid vendor lock-in across GPT, Opus, Grok, Gemini, and local lanes.

## Design Rules

- Route-first: every program becomes a Route Packet.
- Receipt-first: compile, doctor, and future execution steps produce receipts.
- Visual-first: mutations can feed Silent Canvas as replayable visual events.
- Model-agnostic: output is plain structured data, not a provider-specific prompt.
- Honest recovery: AELang declares rollback intent; ORANGEBOX proof gates and operator approval perform rollback.
- No fake green: compile success is not execution success.

## Two-Tier Architecture

| Tier | Purpose | Output |
| --- | --- | --- |
| AELang-High | Human/model-readable mission intent, department routing, parallel work, mutation intent, verification, release, recovery | Compiles to AELang-Core |
| AELang-Core | Deterministic route packet shape for agents and ORANGEBOX runtime | Maps to Operating Spine, API, receipts, and Silent Canvas events |

## AELang-High Grammar

```bnf
<program> ::= <mission>+

<mission> ::= "mission" <string_literal> "{"
                <objective>
                [<route_declaration>]
                [<parallel_block>]
                [<mutate_statement>]*
                [<verify_statement>]
                [<release_statement>]
                [<on_failure_block>]
              "}"

<objective> ::= "objective:" <string_literal>

<route_declaration> ::= "route" "{"
                          "departments:" "[" <department_list> "]"
                          ["proof_gates:" "[" <proof_list> "]"]
                        "}"

<parallel_block> ::= "parallel" "{" <action_line>+ "}"

<action_line> ::= <department_id> ["." <lane_label>] <operator> <target>

<mutate_statement> ::= "mutate" <target> "{" <mutation_body> "}"

<verify_statement> ::= "verify" <identifier>

<release_statement> ::= "release" <string_literal>

<on_failure_block> ::= "on_failure" "{" <recovery_action>+ "}"
```

## AELang-Core Grammar

```bnf
<program> ::= <route_packet>

<route_packet> ::= "route_packet" "{"
                     "id:" <string_literal>
                     "objective:" <string_literal>
                     "departments:" "[" <department_list> "]"
                     "actions:" "[" <action_list> "]"
                     ["proof_gates:" "[" <proof_list> "]"]
                     ["receipt_policy:" <string_literal>]
                     ["recovery:" <string_literal>]
                   "}"

<department_id> ::= "AE0" | "AE1" | "AE2" | "AE3" | "AE4" | "AE5" | "AE6" | "AE7" | "AE8" | "AE9" | "AE10" | "AE11" | "AE12" | "AE13" | "AE14"
```

## Example AELang-High

```aelang
mission "Ethereal AI Link Installer" {
  objective: "One-click Basic + Advanced AI Computer setup with full network proof"

  route {
    departments: [AE6.Code, AE3.Design, AE10.Ops, AE11.Security]
    proof_gates: [hash_verification, rollback_test, security_scan]
  }

  parallel {
    AE6.Code implements installer
    AE3.Design generates silent_canvas_ui
    AE10.Ops runs network_diagnostics
    AE11.Security runs audit
  }

  mutate silent_canvas {
    add_node "Ethereal Link" with status: healthy
    wire to Installer
    record_mutation_proof
  }

  verify full_proof
  release "v0.1.0"

  on_failure {
    rollback to last_green_state
    notify operator with exact_recovery_steps
  }
}
```

## Example AELang-Core

```aelang
route_packet {
  id: "ethereal-installer-001"
  objective: "One-click Basic + Advanced AI Computer setup with full network proof"
  departments: ["AE6", "AE3", "AE10", "AE11"]
  actions: [
    { type: "implement", target: "installer", department: "AE6" },
    { type: "generate_ui", target: "silent_canvas", department: "AE3" }
  ]
  proof_gates: ["hash_verification", "rollback_test"]
  recovery: "last_green_state"
  receipt_policy: "generate_on_every_action"
}
```

## ORANGEBOX Integration

- CLI: `obx aelang doctor`, `obx aelang compile --input=<file>`.
- API: `/api/v4/aelang/doctor`, `/api/v4/aelang/compile`.
- Route Packet: compiled output includes `route_packet`.
- Operating Spine: compiled output includes `operating_spine`.
- Silent Canvas: mutation blocks are preserved as mutation intent for visual replay.
- Receipts: compile and doctor can write `orangebox-aelang-*.json`.
- Final Green Board: AELang is proof-gated through API, feature reality, and receipts before release promotion.

## Planned Resiliency Extension

AELang is the right place to express continuity rules, but the current v0.1 compiler does not execute those rules yet. The planned module is documented in `docs/AELANG_RESILIENCY_MODULE.md` and covers:

- checkpointed missions
- provider health and fallback policy
- retry/backoff queues
- circuit breakers
- heartbeat receipts
- stall receipts
- resume tickets
- artifact delivery proof
- offline sync and conflict resolution
- formal receipt schema validation

These are accepted ORANGEBOX feature directions. They must remain `planned` or `partial` until backed by commands, APIs, receipts, UI proof, and doctors.

## Boundaries

- Current receipts are SHA-256 evidence receipts. Cryptographic signing is a future key-management feature.
- AELang declares rollback targets. It does not silently mutate or revert files.
- AELang compile does not call GPT, Opus, Grok, Gemini, or local models.
- AELang compile does not execute shell commands or package releases.
- Invalid Department OS lanes fail validation.
