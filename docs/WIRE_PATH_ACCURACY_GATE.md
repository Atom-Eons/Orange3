# Silent Canvas Wire Path Accuracy Gate

## Purpose

The wire path accuracy gate verifies that graph wire declarations match the native visual telemetry renderer. ORANGEBOX currently renders wires as native egui center-to-center straight paths. If a graph wire carries `details.path`, that declared path must match the straight native contract within tolerance or the gate fails.

This prevents a dangerous mismatch: the data graph saying one route exists while the operator sees a different route on the canvas.

## Gate

- Gate id: `wire-path-accuracy`
- Gate version: `wire-path-accuracy/v1`
- Module: `C:\AtomEons\orangebox\scripts\v4\wire-path-gate.mjs`
- CLI: `obx silent-canvas wire-gate`
- Route: `GET /api/v4/silent-canvas/wire-gate`

## CLI

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas wire-gate C:\path\to\workspace --json --receipt
```

Options:

- `--workspace=C:\path\to\workspace`
- `--tolerance-px=1`
- `--samples=9`
- `--json`
- `--receipt`

## HTTP

```text
GET /api/v4/silent-canvas/wire-gate?workspace=C%3A%5Cpath%5Cto%5Cworkspace&tolerance_px=1&samples=9
```

The route is read-only and does not write receipts.

## Pass Contract

For every wire:

- `from` and `to` endpoint nodes must exist.
- The declared start point must match the center of the `from` node.
- The declared end point must match the center of the `to` node.
- Sampled points along `details.path`, when present, must match the native straight path within `tolerance_px`.

Wires without `details.path` use the native straight default and pass if endpoints exist.

## Failure Meaning

A failure means the graph has a stored visual path the native UI will not render. Fix either the graph path or the renderer before treating visual telemetry as proof.

