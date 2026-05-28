# ORANGEBOX Operator Manual

Comprehensive reference for AE See-Suite and AE Operations.

## Section 1 - Identity

ORANGEBOX turns operator intent into route packets, macro-actions, department work, review gates, receipts, proof, and rollback evidence without forcing a browser or model to hold the entire project in active memory.

The product has two visible surfaces:

- **AE See-Suite**: the main command surface.
- **AE Operations**: setup, systems, recovery, Advanced AI Box, proof, and package health.

## Section 2 - Product Law

AE See-Suite commands. AE Operations configures. Workers execute. Receipts prove. Review engines challenge. The operator approves protected actions.

ORANGEBOX is not a generic chat clone. It is the PM lead, mission spine, department router, party-line hub, AI Box dispatcher, proof rail, receipt rail, project-memory rail, review pressure surface, and operator command layer.

## Section 3 - The Main Zones

AE See-Suite uses three zones:

1. **Vision Rail**: macro-actions, route health, department pulses, blockers, proof gates, timeline.
2. **Command Center**: operator input, party-line, route status, Open Layer, Top Layer.
3. **Artifact Library**: receipts, screenshots, route packets, docs, proof output, rollback notes.

AE Operations uses a systems layout:

1. **Install Path**: Basic Install or Advanced AI Box.
2. **Model Lanes**: configured provider and local lanes.
3. **Network Health**: AI Box route, Ethereal link, bandwidth-priority posture.
4. **Proof Doctors**: route, department, API, package, product-language, visual proof.
5. **Recovery**: fallback to Basic Install, rebuild receipts, restore route state.

## Section 4 - Project Spine, DAG, and Route Object

The **Project Spine** is the human-readable numbered ladder of work.

The **DAG** is machine truth: dependency graph with weight, status, department, worker, approval flag, model lane, validation, evidence, notes, attempts, receipts, proof, and rollback pointers.

The **Route Object** is the active operating packet shared by CLI, API, AE See-Suite, AE Operations, receipts, and Claude/Opus exports. It includes:

- objective
- project
- macro-actions
- department route
- coordination profile
- clarification policy
- model lane
- proof gates
- rollback path
- receipt id

Macro-actions are:

```text
inspect -> scope -> route -> patch -> verify -> package -> receipt -> promote
```

## Section 5 - Departments

ORANGEBOX uses AE0 through AE14 as department lanes. The practical split:

- AE0: PM lead and route custody
- AE1: product scope
- AE2: research
- AE3: taste, LIPS, UX quality
- AE4: positioning and trust
- AE5: customer/operator empathy
- AE6: engineering
- AE7: data and memory
- AE8: release and packaging
- AE9: rights, policy, legal risk
- AE10: operations and machine routing
- AE11: security and approval boundaries
- AE12: finance/cost posture
- AE13: automation reliability
- AE14: CHECKMATE proof pressure

Review identities include LIPS, MIRRORS, CHECKMATE, ORANGE, and MISFITS. They challenge the work before it is called green.

## Section 6 - Model Lanes

Model lanes are configurable. ORANGEBOX should describe lanes by role and evidence, not by hype.

Default mental model:

- **Reasoning lane**: deep planning, synthesis, architecture, compression.
- **Execution lane**: file edits, commands, tests, receipts, packaging.
- **Fast lane**: low-risk classification, summaries, routing.
- **Review lane**: disagreement, proof pressure, risk checks.

Model claims are never hard-coded as permanent truth. Provider names and effort modes live in configuration and receipts.

## Section 7 - Advanced AI Box

Advanced AI Box is optional. It is for a second AI computer that can take heavy work away from the controller machine.

Basic Install must remain useful when no AI Box exists or when the AI Box is offline.

Advanced AI Box paths:

- router LAN
- direct Ethernet / Ethereal link
- Thunderbolt-class direct link
- future hosted AI Box Cloud

See:

- [AI_BOX_WORKER_RAIL.md](AI_BOX_WORKER_RAIL.md)
- [AI_BOX_NETWORK_PRIORITY.md](AI_BOX_NETWORK_PRIORITY.md)
- [AI_COMPUTER_BUYING_GUIDE.md](AI_COMPUTER_BUYING_GUIDE.md)

## Section 8 - Party-Line

The party-line is the project radio. It is a structured feed of department status, worker returns, proof events, warnings, handoffs, and next-action breadcrumbs.

Shape:

```json
{
  "project": "orangebox",
  "from": "AE6",
  "to": "AE0",
  "dag_node": "route-proof",
  "status": "verified",
  "confidence": 0.91,
  "message": "Route proof gate passed.",
  "evidence": ["receipt path", "command output", "screenshot path"],
  "receipt_path": "receipts/example.json",
  "blockers": [],
  "next_action": "package route"
}
```

The party-line is not a raw transcript dump. It is structured operational memory.

## Section 9 - Gates

Every meaningful autonomous action should pass through gates:

1. intent understood
2. scope bounded
3. approval line checked
4. route selected
5. action executed
6. evidence captured
7. review pressure applied
8. receipt written
9. rollback path recorded

Protected actions always require human approval.

## Section 10 - Guardrails

Guardrails are operating boundaries, not decorative policy. They protect:

- user authority
- local data
- secrets
- filesystem safety
- billing/payment actions
- production deploys
- customer-facing communication
- third-party installs
- broad scraping/crawling
- private/authenticated data access

If a guardrail blocks work, ORANGEBOX should state the blocker and continue safe parallel work.

## Section 11 - Receipts

A receipt has:

- result
- evidence
- blockers
- next action
- touched files
- commands run
- tests/checks
- proof paths
- assumptions
- residual risk
- rollback path

Receipts are the durable source of truth when memory, chat, or UI state disagree.

## Section 12 - Proof

Proof types include:

- syntax check
- test output
- endpoint JSON
- screenshots
- dead-control count
- overflow status
- security or policy scan
- benchmark result
- install/build smoke
- package manifest
- rollback file

Visual proof should include desktop and compact viewport checks when UI changes.

## Section 13 - Approval Lines

Manual approval is required for:

- production deploys
- global install
- firewall/router changes
- credential changes
- payment, banking, billing, tax
- customer-facing messages
- database writes
- destructive deletes
- permission expansion
- private/auth crawling
- broad unaudited scraping
- arbitrary remote worker shell mutation
- vendor/plugin installation or promotion
- third-party always-on automation

Allowed without approval:

- read-only inventory
- local syntax checks
- docs/manual/receipt writing
- non-destructive project-scoped code edits
- endpoint probes
- screenshot proof
- party-line messages
- local receipts

## Section 14 - Failure Rules

If a check fails:

1. Diagnose locally.
2. Fix if inside scope.
3. Rerun the smallest relevant check.
4. Receipt the failure if not fixed.
5. Report the blocker plainly.

If a model reports success without proof:

1. Mark unverified.
2. Ask for receipt/proof path.
3. Run CHECKMATE or a local gate.

If a route times out:

1. Mark degraded or stale.
2. Keep command input usable.
3. Fall back to cached posture.
4. Do not show fake live status.

## Section 15 - Customization

ORANGEBOX is yours after purchase. You can:

- edit the source for personal/internal use
- add custom departments
- modify the gate chain
- change the visual theme
- add MCP tools
- add local worker routes

You may not redistribute, sell, sublicense, or open-source your modifications unless the license explicitly allows it. See `LICENSE.txt`.

## Section 16 - Support

30-day operator onboarding window from date of purchase.

Contact: `a.mccree@gmail.com`

Material Failure Guarantee: full refund if it does not install or launch on Windows 10/11 + Node.js 20+.

## Appendix - V6 Native Runtime

v6 uses a native Rust shell built from `src-tauri/src/bin/native.rs` with `eframe + egui`. The Node sidecar serves local APIs on `127.0.0.1:8787`.

Important toggles:

| Variable | Effect |
|---|---|
| `ORANGEBOX_LOCAL_MODE=1` | Prefer local lanes where available. |
| `ORANGEBOX_ROUTE_TIER=gemma` | Enable optional pre-classifier routing. |
| `GROQ_API_KEY` | Enables configured Groq-backed fast lanes. |
| `OLLAMA_HOST` | Overrides local Ollama host. |

This manual is part of the ORANGEBOX sellable bundle.
