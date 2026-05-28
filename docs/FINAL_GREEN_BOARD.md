# ORANGEBOX Final Green Board

The final green board is the finish-line proof surface for AE See-Suite and AE Operations.

Run it from the ORANGEBOX root:

```powershell
node .\scripts\obx.mjs finish green-board --json --receipt
```

Full mode also runs the heavier alpha.7 readiness path:

```powershell
npm run finish:green
```

AE Operations uses the same proof lane through local API routes:

```powershell
GET http://127.0.0.1:8787/api/v4/finish/latest
GET http://127.0.0.1:8787/api/v4/finish/process-doctor?receipt=1
GET http://127.0.0.1:8787/api/v4/finish/green-board?receipt=1&full=1
```

`latest` only reads the newest receipt so the surface hydrates quickly. `green-board` runs the full proof pass and writes a receipt. `process-doctor` is read-only and reports stale proof/build processes without killing anything.

## What It Proves

- Finish-line Codex automations exist and are active.
- Every JSON receipt in `receipts/` parses.
- Product-facing language uses AE See-Suite / AE Operations and reports stale naming debt.
- First-run Basic vs Advanced AI Box visual proof renders at desktop and compact sizes.
- AE Operations visual proof renders at desktop and compact sizes and blocks old Settings-surface copy.
- `node --check`, `npm run check`, and the final board script parse.
- OpenAPI, route, route-state, Department OS, Surface Factory, MCP, AI-box network, Ethereal link, and Silent Canvas alpha.7 doctors run under one board.
- Process hygiene detects stale finish-board and visual-proof browser processes before the board reports green.
- The portable package manifest exists and points to a zip.
- Git state is recorded without reverting unrelated changes.

## Clean Repo Law

The board records dirty git state as a warning by default because this repository currently has many older untracked and deleted paths. Use `--require-clean` only when the release branch has been intentionally staged or cleaned:

```powershell
node .\scripts\obx.mjs finish green-board --json --receipt --require-clean
```

If `--require-clean` fails, the correct response is to stage or explicitly decide each changed/deleted path. Do not auto-revert unrelated work.

## Product Naming

Product-facing names:

- Top page: **AE See-Suite**
- Operations page: **AE Operations**
- System name: **ORANGEBOX**
- Networked AI-box module: **Ethereal AI Link**

Legacy/internal names like `cockpit` may remain as route, CSS, or source compatibility terms until a deliberate API migration removes them. They should not be visible as the primary product name.

## Receipts

Every green-board run with `--receipt` writes:

```text
receipts/orangebox-final-green-board-<timestamp>.json
```

That receipt is the one file to hand another agent when asking, "Is ORANGEBOX actually green right now?"
