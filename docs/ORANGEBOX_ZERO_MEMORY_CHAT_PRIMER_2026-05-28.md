# Orangebox Zero-Memory Chat Primer

Date: 2026-05-28
Purpose: boot a brand-new AI chat with no account memory into the current Orangebox Ops backend reality.

## First Rule

Assume the chat knows nothing.

Do not trust account memory, old AE Factory skills, old Claude department skills, or prior chat claims. Start from local files, receipts, and the system check.

## What Orangebox Is

Orangebox is AtomEons' local-first AI operations backend. It is a controlled software factory for building with AI while keeping control outside the model.

Orangebox owns:

- AECode Source and final-format registry
- mission contracts
- worktree/path-scope safety
- local provider/model adapters
- gauntlets
- receipts
- rollback evidence
- deploy failure intake
- chat backup
- system proof
- AtomSmasher backend compression capability proof
- AtomSmasher backend tool-merge proof

Orangebox is not one app, not a store, not a website task, and not a generic IDE.

## What AECode Is

AECode is the middle voice/compiler contract:

```text
intent -> AECode Source -> mission contract -> target plan -> isolated patch/artifact -> gauntlet -> receipt -> approval
```

AECode Source is canonical. Output targets such as React, Flutter, Slint, ImGui, Wails/Tauri, docs, tests, screenshots, and deployment packages are outputs, not the master.

## What Compression Means

Compression is how Orangebox avoids wasting intelligence:

```text
reuse before recomputing
compress before expanding
hydrate only what is needed
route small before routing large
wake only necessary subsystems
prove saved work
expand only with warrant
```

## Default Active Lane

```text
Orangebox Ops backend
```

Allowed by default:

- backend scripts
- schemas
- docs
- receipts
- gauntlets
- chat backup/mirror
- local model/provider adapter contracts
- AtomSmasher integration commands and API routes
- AtomSmasher backend tool-upgrade merge lane
- system proof

Not handled by this Operations chat by default:

- website edits
- visual edits
- screenshot or browser visual QA
- web/mobile/native app generation
- store or marketplace generation
- production deploy
- paid API/model calls
- destructive rollback

This is not a project-wide rejection of visual, website, shop, media generation, mobile, native, desktop, or engine-room outputs. Orangebox can produce those lanes. The living visual frontend/dashboard is a huge separate project. This primer prevents this Operations chat from accidentally touching work that belongs to the separate visual/website/shop lane.

## System Check

On Windows, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\a\.codex\skills\orangebox-primer\scripts\orangebox_system_check.ps1
```

If the skill path is unavailable, check:

```text
C:\AtomEons\orangebox
C:\Users\a\OrangeBox-Data
C:\Users\a\OrangeBox-Data\gauntlet\latest-orangebox-full-green.json
C:\Users\a\OrangeBox-Data\aecode-format\latest-final-format.json
C:\Users\a\OrangeBox-Data\atomsmasher\latest-atomsmasher-doctor.json
C:\Users\a\OrangeBox-Data\atomsmasher\tool-merge\latest-tool-merge.json
C:\Users\a\OrangeBox-Data\system-proof\latest-system-proof-queue.json
C:\AtomEons\orangebox\docs\ATOMSMASHER_ORANGEBOX_BACKEND_INTEGRATION_2026-05-28.md
C:\AtomEons\orangebox\docs\ATOMSMASHER_TOOL_MERGE_2026-05-28.md
```

## ChatBackup

ChatBackup mirrors local Codex and Claude JSONL sessions into:

```text
C:\Users\a\OrangeBox-Data\chat-mirror
```

It is incremental and byte-budgeted so it can run often without dragging heavy data every time.

The purpose is account independence: if a chat account is suspended, compressed, deleted, or loses memory, Orangebox can rebuild project context from mirrored local records. Bookmaker/documentarian work is deferred.

## Done Means

For any Orangebox work, report:

- objective
- active lane
- touched files
- commands run
- proof receipt or proof file
- assumptions
- residual risk
- rollback path
