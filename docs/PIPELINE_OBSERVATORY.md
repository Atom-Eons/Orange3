# ORANGEBOX Pipeline Observatory

Status: v0.1 implemented for Silent Canvas.

The Pipeline Observatory is the operator-facing trust lane for Silent Canvas. It turns the dual-model pipeline from a hidden background process into a visible sequence:

1. Relevance projection
2. Prompt bundle
3. Creative Brain
4. Fast Interpreter / HSMP
5. Apply diff
6. Summary receipt

## Route

`GET /api/v4/silent-canvas/observatory`

Query parameters:

- `run_id`: optional Silent Canvas run id. If omitted, the route selects the newest in-memory run.
- `limit`: optional receipt limit, default `40`.

Response shape:

```json
{
  "ok": true,
  "selected_run_id": "sc-...",
  "run": {},
  "events": [],
  "event_count": 0,
  "stages": [
    { "key": "relevance", "label": "Relevance projection", "status": "observed" }
  ],
  "receipts": [],
  "latest_run_receipt": null,
  "runs": []
}
```

## Cockpit UI

The active v4 cockpit includes a `Pipeline Observatory` panel below Surface Factory.

The panel shows:

- selected run id
- run status, event count, and receipt count
- stage checklist with `observed` / `waiting` states
- recent Silent Canvas / Relevance Controller receipts
- manual refresh button

If the running sidecar has stale routes, the panel reports the restart requirement instead of failing silently.

## Receipt Sources Observed

The observatory treats these as pipeline evidence:

- `relevance-projection`
- `relevance-projection-expansion`
- `silent-canvas-prompt-version`
- `silent-canvas-parse-error`
- `silent-canvas-milestone`
- `silent-canvas-summary`
- `silent-canvas-run`

It also reads in-memory Silent Canvas events when the run is still available in the active server process.

## Verification Notes

The implementation was verified with an injected-model Silent Canvas harness so no paid API call or external model was required. The proof run finished and the observatory reported all six stages as `observed`.

Headless Edge/Chrome local screenshot proof was attempted against a temp sidecar. The HTTP API and static `/v4` route were reachable by local clients, but the browser screenshot captured a connection/refused page. Treat visual screenshot proof as blocked until the local browser automation lane is repaired or a Browser/Playwright MCP is available.
