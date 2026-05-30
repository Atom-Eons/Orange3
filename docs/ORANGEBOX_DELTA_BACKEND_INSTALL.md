# Orangebox Delta Backend Install

Orangebox Delta has a backend-only install lane for Ops work. It does not require the visual frontend, `frontend/dist`, Playwright proof, or `build:web`.

## Install Or Refresh

```powershell
cd C:\AtomEons\orangebox-delta
npm.cmd install
npm.cmd run backend:install
```

This writes user-space launchers under:

```text
C:\AtomEons\tools\bin\
```

Installed launchers:

```text
orangebox-delta-backend.ps1       # command/Ops server, default http://127.0.0.1:8787
orangebox-delta-api.ps1           # API server, default http://127.0.0.1:8797
orangebox-delta-backend-proof.ps1 # backend proof runner
```

Install metadata is written to:

```text
C:\Users\a\OrangeBox-Data\backend-install\backend-runtime.json
C:\Users\a\OrangeBox-Data\backend-install\latest-backend-install.json
```

## Backend-Only Proof

```powershell
npm.cmd run backend:proof
```

The proof runner checks:

- primer skill sync for installed agent surfaces during `backend:install`
- root command-server syntax
- API TypeScript build
- API tests
- AtomSmasher API smoke
- AtomSmasher doctor
- temporary command server health
- temporary API health
- Ops readiness

It does not run:

```text
npm run build:web
npm run frontend:proof:*
```

## Manual Backend Start

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\AtomEons\tools\bin\orangebox-delta-backend.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\AtomEons\tools\bin\orangebox-delta-api.ps1
```

The command/Ops server can still serve a frontend route when a frontend build exists, but backend endpoints and Ops proof do not depend on it.

## Primer Skills Installed

The backend install mirrors the `orangebox-primer` skill into local agent/IDE skill roots so a fresh chat can be shifted into Orangebox from the operator's preferred tool.

Default skill targets:

```text
C:\Users\a\.codex\skills\orangebox-primer
C:\Users\a\.agents\skills\orangebox-primer
C:\Users\a\.claude\skills\orangebox-primer
C:\Users\a\AppData\Roaming\Claude\skills\orangebox-primer
C:\Users\a\AppData\Roaming\Claude-3p\skills\orangebox-primer
C:\Users\a\.gemini\config\plugins\orangebox-plugin\skills\orangebox-primer
C:\Users\a\AppData\Roaming\Antigravity\skills\orangebox-primer
C:\Users\a\.gemini\skills\orangebox-primer
C:\AtomEons\orangebox-delta\skills\orangebox-primer
```

When a local tool does not support `SKILL.md` directly but has rules, the installer writes a lightweight adapter when detected:

```text
C:\Users\a\.cursor\rules\orangebox-primer.mdc
```

Visual/frontend capability remains an optional lane upgrade. The primer defaults the agent to backend Ops unless the operator explicitly opens the visual lane.
