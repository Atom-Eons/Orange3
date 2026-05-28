# AECode Final Format And Target Languages

Date: 2026-05-28
Lane: Orangebox Ops backend

## Purpose

AECode Source is the canonical software-intent format for Orangebox. It is not a store, not a website edit permission, and not a replacement for every programming language. It is the contract that describes what should exist, which target can produce it, what proof is required, and what remains gated.

The operating shape is:

```text
intent -> mission contract -> target plan -> isolated patch/artifact -> gauntlet -> receipt -> approval
```

## AECode Source Sections

An AECode Source packet must preserve these sections:

```text
identity
product_intent
operator_laws
scope
target_matrix
artifact_contracts
data_contracts
behavior_graph
permissions
model_roles
gauntlets
receipts
rollback
```

These sections make the source useful to the compiler and to the operator. A target language is allowed to implement a section, but it does not become the master copy of the section.

## Languages We Code In

Active Orangebox Ops backend lanes:

```text
AECode Source
JavaScript ESM / Node.js
TypeScript when Bun control-plane lanes are used
Python for local workers and utility modules
PowerShell wrappers for Windows local operations
SQLite schema
JSON
YAML
JSON Schema
Markdown for human reports
```

Gated output lanes:

```text
TypeScript + React + Next.js/Vite + Tailwind + shadcn/ui
Dart + Flutter
Slint with Rust or C++ host
Go/Gio
Dear ImGui with C++ or Go bindings
Wails/Go
Tauri/Rust
GitHub Actions YAML and Vercel config
```

The gated languages are registered because AECode must know its future targets. They are not currently authorized for code generation or website/visual mutation in this Ops lane.

## Compiler Law

- AECode Source is canonical; targets are outputs.
- No target owns product truth.
- The active backend may register and validate targets without generating their UI/code.
- Every compile path must emit a mission contract and receipt.
- Every code-producing target must pass worktree, path guard, gauntlet, and rollback law.
- Website, visual, mobile, native, engine-room, desktop-wrapper, and deploy targets remain gated until explicitly authorized.
- There is no store lane.

## Current Permission Boundary

Allowed now:

```text
AECode Source registry
mission artifacts
receipt chain
gauntlet outputs
Ops backend scripts
local provider-adapter contracts
control-plane proof
```

Blocked now:

```text
website edits
visual edits
web app generation
mobile app generation
native UI generation
engine-room UI generation
desktop wrapper packaging
production deploy
store or marketplace generation
```

## Proof

The backend proof command is:

```bash
npm.cmd run aecode:format
```

It writes:

```text
C:\Users\a\OrangeBox-Data\aecode-format\latest-final-format.json
C:\AtomEons\orangebox\receipts\orangebox-aecode-final-format-<stamp>.json
```

The registry is also included in `system:full-green` so the final format and target-language plan is tested with the rest of Orangebox Ops.
