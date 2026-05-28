# ORANGEBOX Department OS

Department OS is the ORANGEBOX PM/router layer for AE0-AE14. It turns an operator goal into a bounded route packet with department ownership, trust posture, review gates, receipt obligations, and rollback lines.

It is not a model call and it is not proof by itself. It is the cockpit contract that tells Codex, Claude Code, Hermes, and future worker lanes who owns which part of the work and what evidence must exist before a result is called green.

## Core Files

- `scripts/v4/dept-registry.mjs` - canonical AE0-AE14 registry, review identities, trust tiers, and routing law.
- `scripts/v4/trust-ledger.mjs` - local trust ledger stored under the ORANGEBOX data root at `dept-os/trust-ledger.json`.
- `scripts/v4/dept-router.mjs` - deterministic route packet builder.
- `scripts/v4/dept-doctor.mjs` - model-free proof gate for registry, trust, routing, API/CLI/cockpit source coverage.
- `scripts/v4/v4-server-routes.mjs` - API routes.
- `scripts/obx.mjs` - CLI entrypoint.
- `src/v4/index.html`, `src/v4/cockpit.js`, `src/v4/cockpit.css` - cockpit Department OS panel.

## CLI

```powershell
node .\scripts\obx.mjs dept registry --json
node .\scripts\obx.mjs dept trust --json
node .\scripts\obx.mjs dept route "Build the next ORANGEBOX proof slice and run checks" --json --receipt
node .\scripts\obx.mjs dept doctor --json --receipt
```

## API

- `GET /api/v4/dept/registry`
- `GET /api/v4/dept/trust`
- `POST /api/v4/dept/route`
- `GET /api/v4/dept/doctor`

`POST /api/v4/dept/route` accepts:

```json
{
  "goal": "Build the next ORANGEBOX proof slice and run checks",
  "project": "orangebox",
  "receipt": true,
  "party_line": true,
  "max_departments": 5
}
```

It writes a route file under `<dataRoot>/dept-os/routes/`, can emit a v4 receipt, and posts a party-line update from AE0 unless `party_line` is `false`.

## Trust Law

Every department starts as `T-Advisor`. Advisor-only departments can recommend and draft but cannot mutate state, deploy, delete, spend, or claim proof. Promotions are intentionally not automatic in this slice.

The trust tiers are:

- `T-Advisor` - recommend, summarize, draft.
- `T-Conditional` - scoped mutations with receipts; no deploy/delete/spend above cap.
- `T-Autonomous` - routine scoped tasks inside budget; human final stop still binds.

## Review Identities

- `LIPS` - taste, UX voice, surface quality.
- `MIRRORS` - reality contact and contradiction pressure.
- `CHECKMATE` - proof pressure and final green/blocked status.
- `ORANGE` - priority, subtraction, sequencing, product coherence.
- `MISFITS` - unusual high-upside options.
- `HACK_THE_PLANET` - execution bottleneck breaking.

## Proof

Run the doctor before treating Department OS as available:

```powershell
node .\scripts\obx.mjs dept doctor --json --receipt
```

The doctor proves:

- 15 canonical AE departments exist.
- Trust defaults are advisor-only.
- Engineering routes include AE6 and AE14.
- Design routes include AE3 and LIPS.
- Automation/security routes include AE13, AE10, AE11 and approval-required risk.
- Legal routes include AE9.
- CLI/API/cockpit source surfaces are installed.

## Boundary

Department OS routes work. Codex still performs file mutations and verification. Claude Code still owns deep reasoning and synthesis. ORANGEBOX remains the visible command cockpit and PM/router. Product engines stay outside ORANGEBOX unless explicitly routed as separate projects.
