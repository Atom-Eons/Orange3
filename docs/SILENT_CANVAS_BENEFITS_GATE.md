# Silent Canvas Benefits Gate

The Silent Canvas benefits gate is the local regression check for the market
promise behind ORANGEBOX v6.3:

- reduced API expense
- lower latency
- consistent formatting
- organism health from proof density and mutation activity

It reads `silent-canvas-run` receipts from the ORANGEBOX data root, aggregates the
benefit evidence already emitted by the runtime, and compares the result against
the doctrine targets carried in `scripts/v4/benefits.mjs`.

## Command

```powershell
node C:\AtomEons\orangebox\scripts\v4\benefits.mjs --data-root=C:\path\to\data --min-runs=1
```

or through the ORANGEBOX CLI:

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas benefits-gate --json --receipt --min-runs=1
```

The command is intentionally local. It does not require the ORANGEBOX sidecar,
GUI, MCP server, model calls, or paid APIs.

## Gate Inputs

The gate reads JSON receipts from:

```text
%ORANGEBOX_DATA_ROOT%\receipts\v4
```

If `ORANGEBOX_DATA_ROOT` is not set, the default data root is:

```text
%APPDATA%\com.atomeons.orangebox.command
```

Only receipts with `source: "silent-canvas-run"` are counted as benefit runs.
Other v4 receipts still contribute to the organism health panel.

## Hard Checks

The gate fails when:

- `run_count` is below `--min-runs`
- `consistent_formatting.parse_success_pct` is below target
- `consistent_formatting.schema_valid_pct` is below target
- `lower_latency.objective_p50_ms` exceeds target
- `lower_latency.roadmap_p50_ms` exceeds target
- `lower_latency.first_mutation_p50_ms` exceeds target

By default, cost savings are warning-level because local runs may cost zero and
some development receipts do not include model billing. Use `--require-cost` to
make cost evidence a hard failure.

## Warning Checks

The gate warns when:

- `consistent_formatting.first_try_pct` is below target
- cost savings evidence is missing or below zero without `--require-cost`
- a metric is absent from otherwise valid receipts

Warnings keep the build honest without blocking local development when receipt
coverage is still growing.

## Useful Flags

```text
--json
--receipt
--data-root=C:\path\to\data
--limit=100
--min-runs=1
--format-target-pct=99
--no-latency
--no-formatting
--require-cost
```

## Receipt

With `--receipt`, the gate writes:

```text
C:\AtomEons\orangebox\receipts\orangebox-silent-canvas-benefits-gate-<timestamp>.json
```

The receipt includes the aggregate report, gate version, exact checks, warnings,
failures, target summary, and data root used for the run.

## Why This Exists

Silent Canvas should not merely feel better. It must prove that it is reducing
text churn, lowering latency, and preserving clean structured output. This gate
turns those claims into repeatable evidence that can run before alpha releases,
demo builds, and promotion decisions.
