# ORANGEBOX Hermes Readiness

Hermes is the Codexa worker/orchestration rail for ORANGEBOX. This readiness
slice prepares and proves the ORANGEBOX side without installing Hermes, mutating
Codexa, or changing model/provider auth.

## What Is Ready

- `obx hermes status` probes the local/Codexa Hermes rail and reports the real
  state.
- `obx hermes pack` builds the Codexa Hermes install bundle from local source
  files.
- `obx hermes doctor` proves the pack, status probe, CLI, and API surfaces.
- `GET /api/v4/hermes/status` exposes the non-mutating status probe to the
  cockpit.
- `GET /api/v4/hermes/doctor?receipt=1` runs the readiness doctor and writes a
  receipt.

## Commands

```powershell
cd C:\AtomEons\orangebox

node .\scripts\obx.mjs hermes status --json
node .\scripts\obx.mjs hermes pack --json
node .\scripts\obx.mjs hermes doctor --json --receipt
```

## Current Pack Artifact

```text
C:\AtomEons\orangebox\exports\codexa-hermes-pack-WINDOWS-NATIVE.zip
C:\AtomEons\orangebox\exports\codexa-hermes-pack-WINDOWS-NATIVE-2026-05-18.zip
C:\AtomEons\orangebox\exports\codexa-hermes-pack\manifest.json
```

The pack contains:

- `INSTALL_HERMES.ps1`
- `INSTALL_HERMES.sh`
- `hermes-status.mjs`
- `hermes-migrate-from-openclaw.mjs`
- `AGENTS.md`
- `README.md`

## Current Truth

Hermes is not installed on this machine right now. That is expected for this
slice. The status probe reports:

```json
{
  "status": "FAILED",
  "version": null,
  "mcpReady": false,
  "dashboardReady": false,
  "gatewayHealth": "DOWN",
  "configExists": false
}
```

This is still a passing ORANGEBOX readiness state because the system degrades
plainly and does not claim the rail is live.

## Guardrails

- The doctor does not install Hermes.
- The doctor does not run update scripts.
- The doctor writes temporary pack outputs under `%TEMP%` and deletes its temp
  directory unless `--keep-temp` is provided.
- Real pack builds write receipts under `C:\AtomEons\orangebox\receipts`.
- The previous root inference bug is fixed: the pack builder now resolves
  `C:\AtomEons\orangebox` from `scripts\v4\hermes`, not `C:\`.

## Proof Commands Run

```powershell
node --check .\scripts\v4\hermes\hermes-pack.mjs
node --check .\scripts\v4\hermes\hermes-doctor.mjs
node --check .\scripts\obx.mjs
node --check .\scripts\v4\v4-server-routes.mjs
node .\scripts\obx.mjs hermes doctor --json --receipt
node .\scripts\obx.mjs hermes pack --json
node .\scripts\obx.mjs hermes status --json
Invoke-RestMethod http://127.0.0.1:8787/api/v4/hermes/doctor?receipt=1
Invoke-RestMethod http://127.0.0.1:8787/api/v4/hermes/status
```

## Packaged Portable Proof

The shipped portable copy also runs the Hermes readiness doctor:

```powershell
cd C:\AtomEons\ship\orangebox-v6.3.0-alpha.7-portable
.\node.exe .\scripts\obx.mjs hermes doctor --json --receipt
```

Latest portable artifact:

```text
C:\AtomEons\ship\orangebox-v6.3.0-alpha.7-portable.zip
sha256: 32dfcb88963568f051893d897eb49fece0bbf596e7a60082d10b18d14f9c43bc
```
