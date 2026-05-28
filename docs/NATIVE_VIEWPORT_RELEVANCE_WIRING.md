# Native Viewport Relevance Wiring

The server-side Relevance Controller can accept a graph-space `viewport` for
Silent Canvas runs. The native egui cockpit now publishes the viewport it is
actually rendering and includes it in `/api/v4/silent-canvas/run`.

## Runtime Flow

1. `render_visual_telemetry` loads the current project graph snapshot.
2. The renderer computes the graph bounds currently fit into the native canvas.
3. It stores that graph-space rectangle in `LaneState.sc_last_viewport_json`.
4. `chat_send` includes this value as `viewport` when the active chat target is
   `silent-canvas`.
5. `scripts/v4/v4-server-routes.mjs` passes `viewport` to `silent-canvas.mjs`.
6. `scripts/v4/relevance-controller.mjs` uses it for active-bounding-box
   projection before the Creative Brain receives context.

## Current Shape

```json
{
  "x": 0,
  "y": 0,
  "w": 1280,
  "h": 720,
  "source": "native_visual_telemetry_fit",
  "scale": 0.75,
  "canvas_px": { "x": 10, "y": 120, "w": 1100, "h": 540 }
}
```

The current renderer fits the whole graph when no pan/zoom camera exists. That
still makes the contract real: the Brain receives the exact graph-space surface
the operator is seeing. Future camera/pan work should update this same state
slot instead of changing the API.

## Proof

The alpha.7 doctor source-probes the native file for:

- `sc_last_viewport_json`
- `native_visual_telemetry_fit`
- `viewport`

Run:

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas alpha7-doctor --full --receipt
```
