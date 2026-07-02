# Orange³ · Orangebox Delta

**Orange³** · sovereign agentic operating system for Claude. Persistent memory · 10-80× context compression · tamper-evident receipts · 14-department router · local-first · zero telemetry. §4A no-SaaS covenant · **free always**.

`wave-138-stable` · atomeons.com/orangebox · [a.mccree@gmail.com](mailto:a.mccree@gmail.com)

---

## 🟢 GitHub is the site for the next few weeks

**If [atomeons.com/orangebox](https://atomeons.com/orangebox) is unreachable**, this repo is the canonical Orange³ source and download surface. See [Releases](https://github.com/Atom-Eons/Orange3/releases) for the current signed installer. All installers are §4A no-SaaS — free always, never a subscription.

Contact the operator: [a.mccree@gmail.com](mailto:a.mccree@gmail.com) · [@AtomMccree](https://x.com/AtomMccree)

---

## Orangebox Delta (backend project)

Private canonical Orangebox project folder and GitHub repo. This repo is the dev workspace behind the Orange³ product.

Orangebox Delta is the clean modern Orangebox stack:

- backend Ops control plane
- AECode mission/gauntlet/receipt system
- ChatBackup and restore primers
- Codexa / AI Box configuration lane
- AtomSmasher compression integration lane
- local model/control-plane proof tools
- frontend lane isolated under `frontend/`

## Project Law

Orangebox is a governed local-first software factory, not one app.

AECode is the middle voice for writing software-output contracts:

```text
intent -> AECode Source -> mission contract -> target plan -> isolated patch/artifact -> gauntlet -> receipt -> approval
```

React, Flutter, Slint, ImGui, Wails/Tauri, docs, tests, screenshots, and deployment packages are output targets, not the master.

## Folder Layout

```text
.
|-- scripts/              backend Ops, doctors, watchers, gauntlets
|-- control-plane/        Bun/TypeScript deterministic execution engine
|-- docs/                 Orangebox doctrine, AECode, AtomSmasher, proof docs
|-- schemas/              AECode and receipt schema contracts
|-- skills/               current orangebox-primer skill mirror
|-- integrations/         incoming module integration lanes
|-- apps/api/             backend API workspace
|-- frontend/             all visual/frontend/product UI work lives here
|-- receipts/             generated locally, ignored by git
```

## First Commands

```powershell
cd C:\AtomEons\orangebox-delta
npm.cmd run check
npm.cmd run restart:lock
npm.cmd run primer:mid -- --name "Orangebox Delta"
npm.cmd run ops:readiness
npm.cmd run system:full-green
```

## No-Visual-Ops Rule

This repo contains `frontend/` because Orangebox products include visual outputs, but backend Ops work should not mutate frontend files unless the operator explicitly opens that lane.

## GitHub

Private repo:

```text
https://github.com/AtomEons/orangebox-delta
```

The old `orangebox-os` repo is no longer the preferred clean target for this modern project folder.
