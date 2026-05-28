# ORANGEBOX Delta Frontend

Standalone AE See-Suite React command-center frontend.

## Run

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
```

From the repo root, the workspace build is:

```powershell
npm run build -w @ae-see-suite/web
```

## State Atlas

The app supports visual-state URLs such as:

```txt
/?state=01
/?state=06
/?state=26
/?state=37
/?state=61
```

The 72-state atlas is implemented as one living dashboard shell with state presets, not separate pages or static screenshot backgrounds.

## Frontend-Owned Proof

The frontend now owns its own proof lane. This matters because visual proof should not depend on the older ORANGEBOX root script lane.

Run the five anchor states:

```powershell
npm run build
npm run proof:visual -- --states=01,06,26,37,61 --label=anchors
npm run proof:pixel -- --states=01,06,26,37,61
npm run proof:summary
```

Run all 72 states:

```powershell
npm run build
npm run proof:visual:72
```

The proof runner writes screenshots and receipts under:

```txt
frontend/proof/<timestamp>-<label>-frontend-visual-proof/
frontend/proof/<timestamp>-frontend-pixel-compare/
```

Pixel compare is intentionally honest:

- `GREEN` means the available source bank and React screenshots passed the configured score.
- `WEAK` means comparison ran but did not hit the target score.
- `INCOMPLETE` means the source mockup bank or screenshots are missing; the receipt is still non-empty and auditable.
- `FAILED` means the runner itself failed.

Default source mockup bank:

```txt
C:\Users\a\AppData\Local\Temp\ae-see-suite-mockup-bank-v2
```

Override it with:

```powershell
$env:AE_SEE_SUITE_MOCKUP_BANK="C:\path\to\mockup-bank"
npm run proof:pixel -- --states=01,06,26,37,61
```

## Current Status

Repo handoff is done. The masterpiece is not done.

Known remaining work:

1. Restore source-exact pixel green for anchors `01,06,26,37,61`.
2. Push states `37` and `61` above the current weak band.
3. Expand visual acceptance to all 72 states.
4. Use CI artifacts to preserve screenshots and receipts.
5. Add deployment configuration after visual proof stabilizes.
