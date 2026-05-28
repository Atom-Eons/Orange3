# ORANGEBOX Ads Rules Guard

Date: 2026-05-18

The ORANGEBOX native advertising layer includes an automated rules engine for threshold-based actions such as pause, scale, and notify. The rules engine now has a first-class guard so future Meta/TikTok/Google/Pipeboard MCP bridges can be powerful without becoming reckless.

## Default Law

Automated ad rules default to `simulation_mode: true`.

That means a matched rule can prove what it would do, emit receipts, and show operator evidence without firing live connector actions. Live firing requires an explicit operator arm step.

The guard only controls automated rules. Direct, explicit dispatch calls such as Meta CAPI and Google Enhanced Conversion remain separate operator-invoked actions.

## Guard Fields

```json
{
  "schema_version": 1,
  "global_pause": false,
  "simulation_mode": true,
  "action_scope": "automated-rules",
  "updated_at": "ISO-8601",
  "updated_by": "operator",
  "reason": "why the state changed"
}
```

## API

- `GET /api/v4/ads/guard`
- `POST /api/v4/ads/guard`

POST body:

```json
{
  "global_pause": true,
  "simulation_mode": true,
  "reason": "pause all automated ad actions during review"
}
```

Every guard update emits an `ad-guard-update` receipt.

## CLI

```powershell
node scripts/obx.mjs ads guard
node scripts/obx.mjs ads guard --pause --reason="operator review"
node scripts/obx.mjs ads guard --resume
node scripts/obx.mjs ads guard --simulation=off
node scripts/obx.mjs ads guard --arm-live --reason="approved live campaign automation"
```

## Rule Evaluation Outcomes

- `ad-rule-simulated`: rule matched, but simulation or dry-run prevented live action.
- `ad-rule-blocked-by-global-pause`: rule matched, but global pause blocked live action.
- `ad-rule-fired`: rule matched and guard allowed live action.

Every `evalRule` result carries:

- `would_fire_without_guard`
- `would_fire`
- `fired`
- `dry_run`
- `simulated`
- `blocked_by_global_pause`
- `guard`

This keeps the ad automation lane auditable and compatible with the broader ORANGEBOX receipt/proof law.
