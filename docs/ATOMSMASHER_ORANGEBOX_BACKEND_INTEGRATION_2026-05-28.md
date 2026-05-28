# AtomSmasher Orangebox Backend Integration

Date: 2026-05-28

Status: `INTEGRATED_GREEN`

Lane: Orangebox Operations backend. Visual, website, shop, media, mobile, native, and dashboard outputs remain valid Orangebox product lanes, but this Ops chat does not mutate them.

## Source Bundles

- `C:\Users\a\Downloads\AtomSmasher_OrangeBox_Backend_Integration_Bundle.zip`
  - SHA-256: `abd95baeb28f85dad8eb81852f5accf4d0d68688bf53e788bf198a52a27ff3a2`
- `C:\Users\a\Downloads\AtomSmasher_Full_Scope_Total_Work_Compiler_v1_0.zip`
  - SHA-256: `385f95ace32460d5ee771c4eb6820cd46ccb5b9af829f92e684579a89c8e7b83`

## Vendored Runtime

- `C:\AtomEons\orangebox\integrations\atomsmasher_full_scope_v1_0`
- Runtime DB: `C:\Users\a\OrangeBox-Data\atomsmasher\atomsmasher-orangebox.db`
- Latest proof: `C:\Users\a\OrangeBox-Data\atomsmasher\latest-atomsmasher-doctor.json`

The package is received as a completed backend capability pack. Orangebox wraps it with deterministic Node commands, API routes, receipts, and watcher checks. It is not reimplemented from partial chat fragments.

## Commands

```powershell
npm.cmd run atomsmasher:doctor
npm.cmd run atomsmasher:api-smoke
npm.cmd run atomsmasher:init
npm.cmd run atomsmasher:proof
npm.cmd run atomsmasher:run-all
npm.cmd run atomsmasher:compile
```

## API Surface

Mounted prefix: `/api/atomsmasher`

Implemented endpoints:

- `POST /api/atomsmasher/init`
- `POST /api/atomsmasher/sources/ingest-text`
- `POST /api/atomsmasher/sources/ingest-file`
- `GET /api/atomsmasher/orders`
- `POST /api/atomsmasher/orders`
- `POST /api/atomsmasher/orders/supersede`
- `GET /api/atomsmasher/heat`
- `GET /api/atomsmasher/coverage`
- `POST /api/atomsmasher/search`
- `GET /api/atomsmasher/air`
- `POST /api/atomsmasher/equations/fit`
- `GET /api/atomsmasher/equations/{id}/reconstruct`
- `POST /api/atomsmasher/compile`
- `POST /api/atomsmasher/security/scan`
- `POST /api/atomsmasher/agents/lease`
- `POST /api/atomsmasher/features/{name}/execute`
- `POST /api/atomsmasher/features/run-all`
- `GET /api/atomsmasher/proof`
- `GET /api/atomsmasher/receipts`

## Proof

Latest green receipts:

- AtomSmasher doctor: `C:\AtomEons\orangebox\receipts\orangebox-atomsmasher-doctor-20260528T051058.json`
- AtomSmasher API smoke: `C:\AtomEons\orangebox\receipts\orangebox-atomsmasher-api-smoke-20260528T111111Z.json`
- Full green: `C:\AtomEons\orangebox\receipts\orangebox-gauntlet-orangebox-full-green-20260528T051312.json`
- Reality watcher: `C:\AtomEons\orangebox\receipts\orangebox-reality-watch-20260528T111320Z.json`
- Ops readiness: `C:\AtomEons\orangebox\receipts\orangebox-ops-readiness-20260528T111320Z.json`

Validated gates:

- Vendor package imports and tests pass.
- Schema version is `10`.
- Feature registry contains `620` modules.
- Feature executor runs all `620` modules with `0` errors.
- Local proof lab reports registry live.
- Equation memory fits/reconstructs a linear series.
- Total work compiler returns least-action route and saved-work certificate data.
- API smoke validates init, proof, ingest-text, compile, equation-fit, and receipts endpoints.
- No external service, paid model API, or GPU is required.

## Watcher Contract

`npm.cmd run reality:watch` now checks:

- latest full-green proof,
- ChatBackup heartbeat,
- Ops readiness,
- local llama listener,
- AI Box command/wiki rails,
- AtomSmasher doctor proof and 620-feature status.

This is the doer/watcher split: backend scripts do the work; the local deterministic watcher reports what is actually reachable and recently proven.
