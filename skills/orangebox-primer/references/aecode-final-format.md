# AECode Final Format

AECode Source is canonical. React, Flutter, Slint, ImGui, Wails/Tauri, docs, tests, screenshots, and deployment packages are outputs, not the master.

## Compiler Shape

```text
intent -> mission contract -> target plan -> isolated patch/artifact -> gauntlet -> receipt -> approval
```

## AECode Source Sections

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

## Active Languages

Currently active in Orangebox Ops:

- AECode Source
- JavaScript ESM / Node.js
- TypeScript when Bun control-plane lanes are used
- Python for local workers/utilities
- PowerShell wrappers on Windows
- SQLite schema
- JSON
- YAML
- JSON Schema
- Markdown for human-facing reports

## Gated Output Languages And Targets

Registered but not active by default:

- TypeScript + React + Next/Vite + Tailwind + shadcn/ui
- Dart + Flutter
- Slint with Rust/C++ host
- Go/Gio
- Dear ImGui
- Wails/Go
- Tauri/Rust
- GitHub Actions YAML / Vercel config for deploy packages

These targets require explicit lane authorization before generation.

## Current Proof Files

```text
C:\Users\a\OrangeBox-Data\aecode-format\latest-final-format.json
C:\AtomEons\orangebox\docs\AECODE_FINAL_FORMAT_AND_TARGET_LANGUAGES_2026-05-28.md
C:\AtomEons\orangebox\schemas\aecode-final-format.schema.json
```
