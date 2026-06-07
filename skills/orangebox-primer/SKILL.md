---
name: orangebox-primer
description: Prime a new Codex, Claude, Antigravity, or OBox See-Suite coding chat with Orangebox Ops backend context. Use when starting or resuming any Orangebox, AECode, AtomEons, OBox, See-Suite, local AI build system, system proof, mission, receipt, gauntlet, model routing, worktree, deploy-intake, or new-project workflow; especially when the user says the chat should know what Orangebox is, asks for system check first, wants to code in AECode/OBox, or worries a chat is not actually using Orangebox.
---

# Orangebox Primer

Public-facing product name: **Orangebox Version 1**.

Installed final package path: `C:\AtomEons\orangebox\finals\Orangebox Delta Final`.

Development repo fallback: `C:\AtomEons\orangebox-delta`.

## Zero-Memory Assumption

Assume this chat has no prior memory, no prior Orangebox context, and may be running from a fresh Claude/OpenAI/Gemini account. The skill itself must teach the agent enough to avoid hallucinating the system.

Read `references/zero-memory-bootstrap.md` before acting if the agent is new, uncertain, or outside the OBox See-Suite.

## First Move

Start by proving the local system state. Do not assume this chat is using Orangebox just because the user says Orangebox.

If shell access is available on Windows, run the orange session badge first:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\AtomEons\orangebox\finals\Orangebox Delta Final\skills\orangebox-primer\scripts\orangebox_session_badge.ps1"
```

Then run the raw system check when you need machine-readable status:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\AtomEons\orangebox\finals\Orangebox Delta Final\skills\orangebox-primer\scripts\orangebox_system_check.ps1"
```

If the task will mutate Orangebox backend code, refresh lightweight receipts first:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\AtomEons\orangebox\finals\Orangebox Delta Final\skills\orangebox-primer\scripts\orangebox_system_check.ps1" -Refresh
```

## Real Command Deck

Use this wrapper when the host supports PowerShell and the user wants real Orangebox actions from a skill folder:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\AtomEons\orangebox\finals\Orangebox Delta Final\skills\orangebox-primer\scripts\orangebox_command.ps1" help
```

Canonical commands:

```text
badge                 show OB0X ON color badge
system-check          read current proof state
system-refresh        refresh lightweight proof receipts
backend-proof         run backend build/test/proof
health-report         generate full dev + AI Box health report
project-report        generate full Orangebox project scope/reality report
ops-readiness         verify Ops rails and installed features
ops-green             prove local Orangebox Ops green without requiring Codexa
reality-watch         report actual reachable rails and warnings
strongarm-doctor      verify STRONGARM pressure gate
gremlin-doctor        verify Misfits/Gremlin dataset and trainer handoff
trilane-doctor        verify model registry and router policy
model-lane-eval      verify local model role lanes and wildcard discipline
model-inventory      report registered, installed, reachable, cloud, core, heavy, and wildcard model truth
soul-doctor           verify SOUL GENOME continuity map
knowledge-improvements refresh learned improvement candidates without self-promotion
research-scout       fetch public research signals and park upgrade candidates
research-radar       synthesize current research into approval-ready upgrade candidates
assurance-doctor     verify research upgrades become scoped gates, receipts, and playbooks
harness-benchmark    run offline oracle tasks for tool/routing/proof harness quality
tool-ergonomics      verify command/tool names, outputs, receipts, and bounds
checkmate-eval       verify eval gates before prompt/model/routing/tool changes
signal-hygiene       verify alert cadence, severity labels, and confidence calibration
session-spine        verify active doer surfaces plus watcher freshness and one-reality state
feature-proof        verify feature claims have evidence, proof commands, and rollback truth
final-verify         refresh and verify Orangebox Delta Final backend package
final-zip            build and verify the Orangebox Delta Final Downloads zip
codexa-alert         probe AI Box rails and write an explicit alert receipt
codexa-alert-popup   show a throttled Windows popup when AI Box needs attention
codexa-smb-stage     prove whether SMB can stage recovery artifacts; dry by default
mcp-doctor           verify MCP quarantine/tool bridge
ipi-doctor           verify indirect prompt-injection drills and untrusted-text quarantine
memory-doctor        verify latest source-backed truth beats stale chat memory
action-doctor        verify pre-tool action classifier and unsafe-command blocking
skills-lifecycle     verify active skills are compressed executable procedures
obox2-pack            build Orangebox V2 Internal setup zip
obox2-doctor          expand and verify the setup zip
openclaw-retire-dry   preview OpenClaw startup retirement
openclaw-retire       retire OpenClaw startup hook with backup and popup
```

Example:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\AtomEons\orangebox\finals\Orangebox Delta Final\skills\orangebox-primer\scripts\orangebox_command.ps1" obox2-doctor
```

Mirrored installs have the same command runner under their local `orangebox-primer\scripts\` folder.

Known mirrored installs may use the same script at:

```text
C:\Users\a\.codex\skills\orangebox-primer\scripts\orangebox_system_check.ps1
C:\Users\a\.agents\skills\orangebox-primer\scripts\orangebox_system_check.ps1
C:\Users\a\.claude\skills\orangebox-primer\scripts\orangebox_system_check.ps1
C:\Users\a\AppData\Roaming\Claude\skills\orangebox-primer\scripts\orangebox_system_check.ps1
C:\Users\a\AppData\Roaming\Claude-3p\skills\orangebox-primer\scripts\orangebox_system_check.ps1
C:\Users\a\.gemini\config\plugins\orangebox-plugin\skills\orangebox-primer\scripts\orangebox_system_check.ps1
C:\Users\a\AppData\Roaming\Antigravity\skills\orangebox-primer\scripts\orangebox_system_check.ps1
C:\Users\a\.gemini\skills\orangebox-primer\scripts\orangebox_system_check.ps1
C:\AtomEons\orangebox\finals\Orangebox Delta Final\skills\orangebox-primer\scripts\orangebox_system_check.ps1
C:\AtomEons\orangebox-delta\skills\orangebox-primer\scripts\orangebox_system_check.ps1
```

If the chat UI cannot show color, put this exact badge at the top of the response after the system check:

```text
ORANGEBOX VERSION 1 | OB0X ON | OPS BACKEND VERIFIED
```

If the system check has not been run or fails, use:

```text
ORANGEBOX VERSION 1 | OB0X PENDING | OPS BACKEND NEEDS PROOF
```

If shell access is not available, read `references/orangebox-operating-law.md` and state that the system check could not be executed.

## Mid-Session Shift

When the user is already inside a normal chat that is not acting like Orangebox, generate the mid-session primer and use it as the bridge:

```powershell
cd "C:\AtomEons\orangebox\finals\Orangebox Delta Final"
npm.cmd run primer:mid -- --name "Current Chat Name"
```

Then rename the chat/session to:

```text
Current Chat Name OB0X ON
```

If the host app does not expose chat-title editing to tools, tell the operator the exact title to use manually and cite:

```text
C:\Users\a\OrangeBox-Data\primers\OB0X_ON_TITLE_PROTOCOL.json
```

The suffix `OB0X ON` means the chat has read the primer, run or summarized the system check, and accepted the Orangebox Ops backend lane.

## Core Truth

Orangebox is one large backend Ops system, not a random app project. The goal is always a finished green Ops system: functional, receipt-backed, rollback-aware, and optimized for the current machine state.

AECode is the middle voice/compiler contract for writing outputs faster and safer:

```text
intent -> AECode Source -> mission contract -> target plan -> isolated patch/artifact -> gauntlet -> receipt -> approval
```

Compression keeps the whole thing small and sleek: reuse before recomputing, hydrate only with warrant, route small before large, and prove saved work with receipts.

## Active Lane

Default this chat to Orangebox Ops backend unless the user explicitly reassigns this chat.

Allowed by default:

- AECode Source and final-format registry
- mission manifests
- receipts
- gauntlets
- worktree and path-scope law
- local provider/model adapter contracts
- control-plane proof
- deploy failure intake
- AtomSmasher compression/backend capability intake and proof
- system proof doctors
- backend docs and schemas

Not handled by this Operations chat by default:

- website edits
- visual design edits
- screenshots or visual QA runs
- web/mobile/native app generation
- store or marketplace generation
- production deploy execution
- paid model/API calls
- destructive rollback

This does not mean visuals, websites, shops, media generation, mobile, native, or engine-room interfaces are outside Orangebox. They are core Orangebox product/output lanes. The living visual frontend/dashboard is a large separate project. This skill keeps this Operations chat from touching that lane unless the operator explicitly moves this chat there.

## What To Read

Load only what the task needs.

- Read `references/zero-memory-bootstrap.md` when the chat is brand new, memoryless, or in a different account/tool.
- Always read `references/orangebox-operating-law.md` after triggering this skill.
- Read `references/aecode-final-format.md` for AECode Source, target languages, and what Orangebox codes in.
- Read `references/new-project-workflow.md` before creating or changing a project through Orangebox.

When local repo access exists, prefer current receipts and docs over memory:

```text
C:\AtomEons\orangebox-delta\receipts\
C:\Users\a\OrangeBox-Data\reports\health\latest-health-report.json
C:\Users\a\OrangeBox-Data\reports\project\latest-project-report.json
C:\Users\a\OrangeBox-Data\harness\latest-harness-benchmark.json
C:\Users\a\OrangeBox-Data\gauntlet\latest-orangebox-full-green.json
C:\Users\a\OrangeBox-Data\orangebox-source-of-truth.json
C:\Users\a\OrangeBox-Data\restart\latest-restart-lock.json
C:\Users\a\OrangeBox-Data\primers\ORANGEBOX_MID_SESSION_PRIMER.md
C:\Users\a\OrangeBox-Data\codexa-sync\latest-codexa-config.json
C:\Users\a\OrangeBox-Data\aecode-format\latest-final-format.json
C:\Users\a\OrangeBox-Data\atomsmasher\latest-atomsmasher-doctor.json
C:\Users\a\OrangeBox-Data\atomsmasher\tool-merge\latest-tool-merge.json
C:\Users\a\OrangeBox-Data\system-proof\latest-system-proof-queue.json
C:\AtomEons\orangebox\finals\Orangebox Delta Final\receipts\
C:\AtomEons\orangebox\finals\Orangebox Delta Final\docs\AECODE_FINAL_FORMAT_AND_TARGET_LANGUAGES_2026-05-28.md
C:\AtomEons\orangebox\finals\Orangebox Delta Final\docs\ATOMSMASHER_ORANGEBOX_BACKEND_INTEGRATION_2026-05-28.md
C:\AtomEons\orangebox\finals\Orangebox Delta Final\docs\ATOMSMASHER_TOOL_MERGE_2026-05-28.md
C:\AtomEons\orangebox\finals\Orangebox Delta Final\docs\ORANGEBOX_SYSTEM_PROOF_QUEUE_2026-05-27.md
C:\AtomEons\orangebox-delta\docs\AECODE_FINAL_FORMAT_AND_TARGET_LANGUAGES_2026-05-28.md
C:\AtomEons\orangebox-delta\docs\ATOMSMASHER_ORANGEBOX_BACKEND_INTEGRATION_2026-05-28.md
C:\AtomEons\orangebox-delta\docs\ATOMSMASHER_TOOL_MERGE_2026-05-28.md
C:\AtomEons\orangebox-delta\docs\ORANGEBOX_SYSTEM_PROOF_QUEUE_2026-05-27.md
```

## How To Work

1. Restate the objective in Orangebox terms.
2. Name the active lane: usually `Orangebox Ops backend`.
3. Run or summarize the system check.
4. Identify whether the request is active backend work, gated future output work, or forbidden by current operator law.
5. Make scoped backend edits only after reading the real files.
6. Prove the change with syntax checks, doctors, gauntlets, receipts, or the smallest correct proof command.
7. Report touched files, commands run, proof status, unverified assumptions, residual risk, and rollback path.

## New Project Rule

For a new project, do not start by making an app. Start by making the project legible to Orangebox:

```text
intent
-> AECode Source packet
-> mission.yaml
-> allowed/forbidden paths
-> target language selection
-> provider/model lane
-> gauntlet plan
-> receipt plan
-> rollback plan
```

Then choose an output target from the AECode registry. If the target is gated, stop and ask for explicit lane authorization before generating it.

## Verification

A claim that Orangebox is green needs a receipt. Preferred proof levels:

- light: `npm.cmd run aecode:format`
- system: `npm.cmd run system:doctor`
- compression/backend pack: `npm.cmd run atomsmasher:doctor`
- backend tool merge: `npm.cmd run atomsmasher:merge-tools`
- MCP/tool bridge: `npm.cmd run mcp:doctor`
- skill lifecycle: `npm.cmd run skills:lifecycle`
- local Ops backend install/proof: `npm.cmd run backend:proof`
- local Ops green aggregate: `npm.cmd run ops:green`
- final backend package proof: `npm.cmd run final:verify`
- final backend Downloads zip: `npm.cmd run final:zip`
- full two-machine/system proof: `npm.cmd run system:full-green`

`ops:green` proves the local backend/Ops machine. `system:full-green` is the broad gate. It may remain red when Codexa/AI Box rails, Ollama, Hermes, or wider two-device lanes are not proven. Do not confuse that with the local Ops backend, which is judged by `ops:green`, `backend:proof`, `final:verify`, `final:zip`, `health:report`, and `project:report`.

Do not call something done unless the proof path is named.
