# AtomSmasher Incoming Module Intake

Status: `WAITING_FOR_HEAVY_SPEC`

This is an Orangebox Ops backend intake lane, not an implementation of AtomSmasher v0.7.

## Purpose

Hold the incoming AtomSmasher module specification until it is ready to be converted into a scoped Orangebox mission contract.

## Current Law

- Do not build the AtomSmasher module from partial chat fragments.
- Do not start website, visual, store, deployment, or app output work from this Operations intake lane.
- This does not limit Orangebox product/output lanes. Visual and media generation remain part of Orangebox; they are just not handled by this Ops intake chat.
- Do not require API keys, GPU, external services, or paid model calls for baseline proof.
- Accept only backend module work with receipts, tests, rollback, and a deterministic proof path.
- Treat AtomSmasher as a backend intelligence-compression module candidate for Orangebox.

## Expected Intake Shape

When the heavy spec arrives, convert it into:

- mission contract
- allowed paths
- forbidden paths
- schema/migration plan
- test plan
- proof report requirements
- rollback plan
- acceptance matrix

## First Proof Target

The first implementation pass must prove:

- no external services required
- no GPU required
- Python and SQLite baseline if the module is standalone
- Orangebox receipt emitted
- all old tests preserved
- all new tests pass
- no unverified claims marked green
