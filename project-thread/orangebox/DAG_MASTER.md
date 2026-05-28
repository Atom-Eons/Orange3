# orangebox DAG Master

Progress: 0/29 nodes / 0% weighted.
Current: 1A
Bottleneck: none

This file is the machine execution truth. The Project Spine is the human-readable ladder.

## 1A Idea intake
Status: in_progress
Department: AE0
Approval required: false
Weight: 1
Depends on: none
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS
Payload: AE0 executes: Capture the raw idea, target outcome, operator constraints, and forbidden areas.
Validation: operator/checkmate evidence attached

## 1B Project contract
Status: awaiting_approval
Department: AE1
Approval required: true
Weight: 3
Depends on: 1A
Worker: cockpit
Triad: STRATEGY / Marketing + Product Strategy / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE1 executes: Define objective, audience, non-goals, evidence, rollback, and approval lines.
Validation: operator/checkmate evidence attached

## 1C Source inventory
Status: pending
Department: AE2
Approval required: false
Weight: 1
Depends on: 1B
Worker: cockpit
Triad: STRATEGY / Marketing + Product Strategy / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS
Payload: AE2 executes: Map files, folders, prior docs, receipts, screenshots, and current system state.
Validation: operator/checkmate evidence attached

## 1D Memory recall
Status: pending
Department: AE10
Approval required: false
Weight: 1
Depends on: 1C
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS
Payload: AE10 executes: Load relevant lessons, mistakes, evolution reports, LakeStrike/Factory history, and current project position.
Validation: operator/checkmate evidence attached

## 1E AECommander extract
Status: pending
Department: AE7
Approval required: false
Weight: 1
Depends on: 1D
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE7 executes: Port only proven ideas: wave queue, handoff, FocusPane, cost gates, validator, snapshot receipts.
Validation: operator/checkmate evidence attached

## 1F Scope map
Status: pending
Department: AE1
Approval required: false
Weight: 1
Depends on: 1E
Worker: cockpit
Triad: STRATEGY / Marketing + Product Strategy / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS
Payload: AE1 executes: Turn the goal into features, acceptance criteria, and what must be visible to the operator.
Validation: operator/checkmate evidence attached

## 1G Risk map
Status: pending
Department: AE11
Approval required: false
Weight: 1
Depends on: 1F
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE11 executes: Flag secrets, destructive actions, network exposure, deploys, database writes, and vendor/plugin installs.
Validation: operator/checkmate evidence attached

## 1H Architecture route
Status: awaiting_approval
Department: AE6
Approval required: true
Weight: 3
Depends on: 1G
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE6 executes: Choose the smallest durable architecture and name the write boundaries.
Validation: operator/checkmate evidence attached

## 1I Mission graph
Status: pending
Department: AE0
Approval required: false
Weight: 1
Depends on: 1H
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS
Payload: AE0 executes: Convert the scope into ordered nodes with owners, status, blockers, and receipts.
Validation: operator/checkmate evidence attached

## 1J UX and visual system
Status: pending
Department: AE3
Approval required: false
Weight: 1
Depends on: 1I
Worker: cockpit
Triad: EXPERIENCE / Lips Design + UI Experience / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS
Payload: AE3 executes: Define the command surface, interaction model, motion direction, responsive checks, and no-dead-control rule.
Validation: operator/checkmate evidence attached

## 1K Positioning and copy
Status: pending
Department: AE4
Approval required: false
Weight: 1
Depends on: 1J
Worker: cockpit
Triad: EXPERIENCE / Lips Design + UI Experience / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS
Payload: AE4 executes: Make the value proposition, product language, onboarding, and launch copy specific.
Validation: operator/checkmate evidence attached

## 1L Offer and value model
Status: pending
Department: AE5
Approval required: false
Weight: 1
Depends on: 1K
Worker: cockpit
Triad: EXPERIENCE / Lips Design + UI Experience / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS
Payload: AE5 executes: Clarify buyer value, pricing logic, proof of value, onboarding promise, and support boundary.
Validation: operator/checkmate evidence attached

## 1M Claims and legal review
Status: pending
Department: AE9
Approval required: false
Weight: 1
Depends on: 1L
Worker: cockpit
Triad: STRATEGY / Marketing + Product Strategy / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS
Payload: AE9 executes: Check naming, claims, license posture, privacy, data handling, and customer-facing language.
Validation: operator/checkmate evidence attached

## 1N Data and memory contract
Status: pending
Department: AE12
Approval required: false
Weight: 1
Depends on: 1M
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS
Payload: AE12 executes: Define what is stored, summarized, forgotten, linked, exported, and used for handoff.
Validation: operator/checkmate evidence attached

## 1O Codexa capacity gate
Status: pending
Department: AE10
Approval required: false
Weight: 1
Depends on: 1N
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS
Payload: AE10 executes: Prove Codexa rail, RAM, Docker, browser workers, local models, and network path before heavy work.
Validation: operator/checkmate evidence attached

## 1P Work sharding
Status: pending
Department: AE13
Approval required: false
Weight: 1
Depends on: 1O
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS
Payload: AE13 executes: Split only independent work. Keep cockpit interactive. Cap frontier lanes and heavy jobs.
Validation: operator/checkmate evidence attached

## 1Q Implementation slice
Status: pending
Department: AE6
Approval required: false
Weight: 1
Depends on: 1P
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE6 executes: Build the smallest complete useful slice, not a decorative dashboard.
Validation: operator/checkmate evidence attached

## 1R Local checks
Status: pending
Department: AE14
Approval required: false
Weight: 1
Depends on: 1Q
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE14 executes: Run syntax, build, tests, and endpoint smoke checks locally.
Validation: operator/checkmate evidence attached

## 1S Codexa checks
Status: pending
Department: AE14
Approval required: false
Weight: 1
Depends on: 1R
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE14 executes: Run heavier checks on Codexa, summarize logs, and save raw receipts out of context.
Validation: operator/checkmate evidence attached

## 1T Visual proof loop
Status: pending
Department: AE3
Approval required: false
Weight: 5
Depends on: 1S
Worker: codexa
Triad: EXPERIENCE / Lips Design + UI Experience / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE3 executes: Capture desktop and compact screenshots; check overflow, blank panels, dead controls, and visual coherence.
Validation: POST /api/proof/visual

## 1U Checkmate verification
Status: pending
Department: AE7
Approval required: false
Weight: 5
Depends on: 1T
Worker: codexa
Triad: EXPERIENCE / Lips Design + UI Experience / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE7 executes: Run UI, runtime, API, data, security, and CI quality gates with honest statuses.
Validation: GET /api/checkmate?force=1

## 1V Hallucination gate
Status: pending
Department: AE7
Approval required: false
Weight: 1
Depends on: 1U
Worker: cockpit
Triad: STRATEGY / Marketing + Product Strategy / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE7 executes: Separate verified facts from assumptions. Block RED claims and require evidence for completion.
Validation: operator/checkmate evidence attached

## 1W Security scan
Status: awaiting_approval
Department: AE11
Approval required: true
Weight: 5
Depends on: 1V
Worker: codexa
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE11 executes: Scan raw secret patterns, permissions, supply chain, and state-changing paths.
Validation: GET /api/checkmate?force=1 + Semgrep/OSV gate

## 1X Review panel
Status: pending
Department: AE7
Approval required: false
Weight: 1
Depends on: 1W
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE7 executes: Apply Goose/Iceman/Phoenix/Slider/Viper judgment before ship.
Validation: operator/checkmate evidence attached

## 1Y Release plan
Status: awaiting_approval
Department: AE8
Approval required: true
Weight: 3
Depends on: 1X
Worker: cockpit
Triad: EXPERIENCE / Lips Design + UI Experience / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE8 executes: Name install/run path, smoke checks, rollback path, and operator handoff.
Validation: operator/checkmate evidence attached

## 1Z Deploy or install smoke
Status: awaiting_approval
Department: AE8
Approval required: true
Weight: 2
Depends on: 1Y
Worker: codexa
Triad: EXPERIENCE / Lips Design + UI Experience / llama3.3:70b-instruct-q4_0
Triad shadows: MIRRORS, CHECKMATE
Payload: AE8 executes: Only after approval, prove install/deploy with receipts and rollback.
Validation: operator-approved deploy/install smoke receipt

## 2A Receipt
Status: pending
Department: AE0
Approval required: false
Weight: 1
Depends on: 1Z
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS
Payload: AE0 executes: Record touched files, commands, tests, proof, risks, rollback, and next action.
Validation: receipt file exists and lists touched files, commands, proof, risk, rollback

## 2B Memory compile
Status: pending
Department: AE10
Approval required: false
Weight: 2
Depends on: 2A
Worker: codexa
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS
Payload: AE10 executes: Keep the lesson, decay noise, update wiki/spine, and surface what not to repeat.
Validation: npm.cmd run knowledge

## 2C Next scope with new eyes
Status: pending
Department: AE0
Approval required: false
Weight: 1
Depends on: 2B
Worker: cockpit
Triad: ENGINEERING / Engineering + Security Review / qwen2.5-coder:32b-instruct-q8_0
Triad shadows: MIRRORS
Payload: AE0 executes: Re-scope after evidence arrives. Iteration produces the innovation.
Validation: operator/checkmate evidence attached
