# Active Bounding Box Projection

## Purpose

Silent Canvas must not send the full project graph to the Brain on every turn. The active bounding box selects the visible or currently relevant canvas region, then includes first-degree neighbors so the Brain sees enough structure without paying full-graph context cost.

## Module

- Graph primitive: `C:\AtomEons\orangebox\scripts\v4\project-graph.mjs`
- Relevance spine: `C:\AtomEons\orangebox\scripts\v4\relevance-controller.mjs`
- CLI: `obx silent-canvas active-bbox`
- Route: `GET /api/v4/silent-canvas/active-bbox`

## Selection Order

1. Use explicit viewport coordinates when provided.
2. Otherwise use `selected_node` when provided.
3. Otherwise use active or recently touched nodes from graph details and mutation tail.
4. Otherwise use the tail of the graph as a safe deterministic fallback.

The selection is padded, neighbors are included through wires, and the result is capped by `maxNodes`.

## CLI

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas active-bbox C:\path\to\workspace --json --max-nodes=24
```

## HTTP

```text
GET /api/v4/silent-canvas/active-bbox?workspace=<encoded>&x=0&y=0&w=800&h=600&max_nodes=24
```

## Relevance Controller

`buildScopedContext(...)` now carries `active_bbox_strategy` and `active_bbox` in `sources.canvas_state`, and `formatScopedContextForBrain(...)` names the active bounding-box strategy in the prompt package.

This turns token optimization into a visible, auditable state-projection decision rather than a hidden truncation.

