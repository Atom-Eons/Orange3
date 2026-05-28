# Z-Axis Rewind Morph

Silent Canvas snapshot replay should not feel like a silent JSON swap. The
native egui cockpit now gives snapshot scrub and replay a visible time-shift
language.

## Behavior

- Loading a snapshot through the scrubber stamps
  `LaneState.sc_snapshot_morph_started_at`.
- The loaded file name is stored in `LaneState.sc_snapshot_morph_label`.
- Visual Telemetry draws a short-lived `Z-AXIS REWIND` overlay:
  - warm dark veil
  - expanding rings
  - horizontal scan traces
  - snapshot label chip
- During automatic replay, the label becomes `Z-AXIS REPLAY`.
- Returning to live mode stamps the morph again with `LIVE GRAPH`.

The effect is ephemeral and fades in about 1.65 seconds, preserving the calm
Silent Canvas surface after the operator has perceived the state change.

## Code Path

- State: `C:\AtomEons\orangebox\src-tauri\src\bin\native.rs`
  - `sc_snapshot_morph_started_at`
  - `sc_snapshot_morph_label`
- Trigger: `load_canvas_snapshot_file`
- Render: `vt_draw_rewind_morph`
- Surface: `render_visual_telemetry`

## Proof

Run:

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas alpha7-doctor --full --receipt
```

The doctor source-probes native code for the replay/morph state and overlay
function so alpha.7 cannot silently regress this trust signal.
