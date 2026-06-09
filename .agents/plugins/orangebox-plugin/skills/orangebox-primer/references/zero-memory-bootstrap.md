# Zero-Memory Orangebox Bootstrap

Assume the agent has never heard of Orangebox.

## What Orangebox Is

Orangebox is AtomEons' local-first AI operations backend. It is a controlled software factory and proof system for building with AI without letting chat history or a model become the boss.

Orangebox is not one app, not a website, not a visual design task, and not a generic IDE. Its core job is to make AI work bounded, testable, reversible, and receipt-backed.

## The Practical Loop

Orangebox turns work into this pipeline:

```text
human intent
-> AECode Source
-> mission contract
-> scoped files and allowed paths
-> model/provider worker if needed
-> patch or artifact
-> deterministic gauntlet
-> receipt
-> rollback or approval
```

## What AECode Is

AECode is the middle voice. It is the source-of-truth language/contract used to describe software intent before producing output code. It speeds up writing by making the target, proof, permissions, and rollback explicit.

AECode Source is canonical. React, Flutter, Slint, ImGui, Wails/Tauri, docs, tests, screenshots, and deploy packages are outputs, not the master.

## What Compression Means Here

Compression is an operating style:

```text
reuse before recomputing
compress before expanding
hydrate only what is needed
route small before routing large
wake only necessary subsystems
prove saved work with receipts
expand only with warrant
```

Do not flood context. Prefer current receipts, registries, and the smallest proof command.

## The Default Lane

The default lane is:

```text
Orangebox Ops backend
```

This includes:

- AECode Source and format registry
- mission manifests
- worktree/path guards
- provider adapter contracts
- model routing policy
- gauntlet checks
- receipts
- deploy failure intake
- local inference/system proof
- AtomSmasher compression/backend capability proof
- backend docs and schemas

## Forbidden By Default

Do not do these unless the user explicitly opens the lane:

- website edits
- visual/design edits
- screenshot or browser visual QA
- web/mobile/native app generation
- store or marketplace generation
- production deploy
- paid API/model calls
- destructive rollback

## Where Truth Lives

On the main machine, truth should be checked from:

```text
C:\AtomEons\orangebox
C:\Users\a\OrangeBox-Data
C:\AtomEons\orangebox\receipts
C:\Users\a\OrangeBox-Data\gauntlet\latest-orangebox-full-green.json
C:\Users\a\OrangeBox-Data\aecode-format\latest-final-format.json
C:\Users\a\OrangeBox-Data\atomsmasher\latest-atomsmasher-doctor.json
C:\Users\a\OrangeBox-Data\atomsmasher\tool-merge\latest-tool-merge.json
C:\Users\a\OrangeBox-Data\system-proof\latest-system-proof-queue.json
```

If these paths are unavailable, say the local Orangebox state cannot be verified and continue only with the conceptual primer.

## First Words To The User

When using this primer, start with a short status:

```text
I am priming from Orangebox as a zero-memory chat. I will verify the local system state first, then work only in the Orangebox Ops backend lane unless you explicitly open another lane.
```

Then run the system check if tools allow.
