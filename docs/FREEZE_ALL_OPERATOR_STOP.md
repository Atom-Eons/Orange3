# Freeze-All Operator Stop

Freeze-All is the ORANGEBOX hard stop for runaway work.

It is not just an edit-scope lock. When active, it blocks new high-impact
dispatches and cancels running ORANGEBOX work that the local command server can
control.

## Operator Controls

- Native cockpit: `Ctrl+.` toggles Freeze-All.
- Native Silent Canvas tab row: `FREEZE` / `UNFREEZE` button.
- API status: `GET /api/v4/freeze/status`
- API set:

```powershell
Invoke-RestMethod -Method POST http://127.0.0.1:8787/api/v4/freeze/set `
  -ContentType "application/json" `
  -Body (@{ active=$true; scope="global"; root="C:\__ORANGEBOX_FREEZE_ALL__" } | ConvertTo-Json)
```

Unfreeze:

```powershell
Invoke-RestMethod -Method POST http://127.0.0.1:8787/api/v4/freeze/set `
  -ContentType "application/json" `
  -Body (@{ active=$false; scope="global" } | ConvertTo-Json)
```

## What Freeze-All Does

When active with root `C:\__ORANGEBOX_FREEZE_ALL__`, ORANGEBOX treats the state as
`freeze_all: true`.

The server then:

- cancels running v4 agent jobs
- cancels running Silent Canvas runs
- kills ORANGEBOX shell-stream sessions
- sets ad rules guard to `global_pause: true`
- sets ad rules guard to `simulation_mode: true`
- emits a freeze receipt
- blocks new high-impact dispatch routes with HTTP `423 Locked`

## Routes Blocked While Frozen

- `POST /api/v4/sprint/run`
- `POST /api/v4/skills/fire`
- `POST /api/v4/surfaces/create`
- `POST /api/v4/silent-canvas/run`
- `POST /api/v4/agent/run`
- `POST /api/agent/run`
- `POST /api/v4/ads/capi/dispatch`
- `POST /api/v4/ads/google-enhanced/dispatch`
- `POST /api/v4/ads/rules/engine/start`

Freeze-All does not block its own unfreeze route.

## Response Shape

Blocked dispatches return:

```json
{
  "allowed": false,
  "status": "FROZEN",
  "error": "ORANGEBOX Freeze-All is active. New dispatches, agent runs, rule engines, and mutations are paused until the operator unfreezes.",
  "operation": "silent-canvas-run",
  "freeze": {
    "active": true,
    "root": "C:\\__ORANGEBOX_FREEZE_ALL__",
    "scope": "global",
    "freeze_all": true
  }
}
```

## Doctrine

The model, agent, worker, and ad rule engine are subordinate to the operator.
Freeze-All is the visible proof of that law.
