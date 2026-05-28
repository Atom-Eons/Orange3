# ORANGEBOX Alpha.7 Readiness Doctor

`alpha7-doctor` is the one-command proof bundle for the current Silent Canvas
alpha.7 finish line. It is sidecar-free by default and runs in an isolated temp
data root so it does not mutate the operator's live ORANGEBOX state.

## Command

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas alpha7-doctor --receipt
```

Full local verification, including package and Rust checks from the source
tree. When the same full doctor runs from a portable package, it verifies the
shipped native binary and bundled native provenance files instead of attempting
a cold Rust compile from the zip:

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas alpha7-doctor --full --receipt
```

JSON output:

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas alpha7-doctor --json --receipt
```

Route, when the sidecar is running:

```text
GET /api/v4/silent-canvas/alpha7-doctor?receipt=1
GET /api/v4/silent-canvas/alpha7-doctor?receipt=1&full=1
```

## AE See-Suite Surface

AE See-Suite exposes this proof in the `Alpha.7 Readiness` panel:

```text
http://127.0.0.1:<port>/v4
```

The panel calls `GET /api/v4/silent-canvas/alpha7-doctor` in fast mode on load
and on the `Run Doctor` button. It shows passed/total checks, failures,
warnings, fixture node count, doctor mode, and each check status. The broader
`--full` path stays a CLI/operator proof because it runs package and Rust
checks and can take longer than the UI should block.

## What It Proves

- Prompt and few-shot gate passes with versioned Silent Canvas prompts.
- Surface Factory can instantiate a real `core-v1` surface.
- Wire path gate matches the native egui center-to-center render contract.
- Active bounding-box projection can focus the Brain context on a viewport.
- Workspace state exposes version, fingerprint, counts, and conflict markers.
- Snapshot list/load/restore data path works for replay and desync recovery.
- Benefits gate parses a Silent Canvas run receipt and passes doctrine targets.
- Freeze-All guard blocks dispatches and writes in an isolated data root.
- Native source contains the alpha.7 locks: replay, pulse ring, duplicate-send
  lock, Ctrl+B benefits, and Ctrl+. Freeze-All.
- AE See-Suite source contains the alpha.7 readiness panel, refresh action,
  endpoint call, 30-second refresh cadence, and status/check rendering hooks.
- CLI and route source contains alpha.7 proof endpoints.

## Safety

The default run creates a temp data root under the OS temp directory, exercises
the gates, then removes it. Use `--keep-temp` only when you want to inspect the
fixture workspace.

The command does not call paid APIs, download models, train, deploy, mutate
EIDOS, or depend on the live sidecar.

## Receipt

When `--receipt` is present, the command writes:

```text
C:\AtomEons\orangebox\receipts\orangebox-alpha7-readiness-doctor-<timestamp>.json
```

The receipt includes every check, pass/fail status, durations, source-probe
results, fixture workspace path, and command evidence when `--full` is used.
