# Orangebox Ops System Proof Queue - 2026-05-27

## Operator Ruling

Orangebox work is backend Ops only.

Out of scope:

- visual surface edits
- website edits
- screenshot proof runs
- app factory presets
- store-like generation
- production deploy execution

Active scope:

- mission manifests
- AECode Source backend contract
- AECode final format and target-language registry
- Orangebox Creations output-stack registry
- worktree sandboxing
- governed provider artifacts
- local llama listener lane
- gauntlet checks
- receipts and rollback evidence
- deploy failure intake
- operator status JSON
- system proof receipts

## Active Mission

Mission id: `orangebox-main-system-v0`

Purpose: make Orangebox Ops function as a receipt-backed local-first backend build system.

Primary commands:

```powershell
npm.cmd run system:doctor
npm.cmd run creations:doctor
npm.cmd run aecode:format
npm.cmd run aecode:schemas
npm.cmd run aecode:compile
npm.cmd run aecode:mission-run
npm.cmd run aecode:artifact-generate
npm.cmd run aecode:artifact-write
npm.cmd run aecode:deploy-full
npm.cmd run system:proof
npm.cmd run system:full-green
```

## Feature Acceptance Matrix

| Feature | Status | Proof |
| --- | --- | --- |
| Mission Manifest v0 | active | `.missions/orangebox-main-system-v0/mission.yaml` |
| Worktree Sandbox Law | active | writes target `.worktrees/orangebox-main-system-v0` |
| Governed Inference Main Nerve | active local v0 | mission run/provider artifact receipts |
| Gauntlet Engine v0 | active | `gauntlet:*` commands and receipts |
| ReceiptChain v0 | active | `receipts/orangebox-*.json` |
| Deploy Repair Rail | intake only | blocked from patching until real logs/repo exist |
| Visual / Website Exclusion Gate | active | visual commands disabled in active proof |
| Factory / Store Exclusion Gate | active | `ae create` disabled by operator |
| Operator Status Feed | active | `npm.cmd run aecode:operator` |
| AECode Source IR v0 | active backend contract | `source.aecode.json` |
| AECode Final Format / Target Languages | active registry only | `npm.cmd run aecode:format` |

## Do Not Cross

The current system proof must not touch `apps/web`, website routes, visual proof scripts, or design surfaces. Historical files can remain for audit, but active commands cannot rely on them.

## Rollback

All active proof work is receipt-backed. Remove generated mission data under `.missions/orangebox-main-system-v0`, `.worktrees/orangebox-main-system-v0`, and `C:\Users\a\OrangeBox-Data\system-proof` if this lane is superseded.
