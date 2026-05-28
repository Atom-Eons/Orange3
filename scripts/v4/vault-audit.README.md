# vault-audit.mjs — ORANGEBOX v4 Compounding Vault Audit

Shows the operator how their CLC-style knowledge vault has compounded over time.
Sticky retention through proof of memory growth.

## Usage

```bash
# Capture a snapshot of the vault right now
node scripts/v4/vault-audit.mjs --snapshot

# Show last 4 weeks of deltas in markdown
node scripts/v4/vault-audit.mjs --report

# Show last 8 weeks
node scripts/v4/vault-audit.mjs --report --weeks=8

# Capture snapshot then immediately report
node scripts/v4/vault-audit.mjs --snapshot --report

# Compare two specific weeks
node scripts/v4/vault-audit.mjs --diff 2026-W20 2026-W21

# Export a standalone HTML report (dark, McLaren F1 aesthetic)
node scripts/v4/vault-audit.mjs --export-html=./vault-report.html

# Projection: at this rate, vault doubles in N weeks
node scripts/v4/vault-audit.mjs --projection

# All at once: snapshot + report + HTML + projection
node scripts/v4/vault-audit.mjs --snapshot --report --projection --export-html=./vault-report.html

# Override data root
node scripts/v4/vault-audit.mjs --snapshot --root C:/path/to/orangebox-data
```

## Where things live

| Path | Purpose |
|------|---------|
| `<data_root>/memory/orangebox-knowledge-v2/` | The v2 vault (lattice.jsonl, void.jsonl, entities.json, …) |
| `<data_root>/knowledge-v2/snapshots/<YYYY-WW>.json` | Weekly snapshots (metrics only, <100 KB each) |
| `<data_root>/receipts/vault-audit/<ts>.json` | Receipt for every audit operation |

`<data_root>` resolves in order:
1. `ORANGEBOX_DATA_ROOT` env var
2. `ORANGEBOX_ROOT` env var
3. `--root <path>` flag
4. `%APPDATA%\com.atomeons.orangebox.command`

## Snapshot schema

```json
{
  "week":            "2026-W21",
  "iso_week":        "2026-W21",
  "capturedAt":      "2026-05-16T…Z",
  "docCount":        212,
  "factCount":       4831,
  "entityCount":     389,
  "latticeBytes":    9437184,
  "voidBytes":       524288,
  "dreamCount":      14,
  "receiptCount":    67,
  "partyLineMsgCount": 2041,
  "top10Entities":   [{ "name": "ORANGEBOX", "count": 38 }, …],
  "top10Concepts":   [{ "name": "memory", "count": 91 }, …]
}
```

Snapshots are keyed by ISO 8601 week. Capturing twice in the same week overwrites the earlier snapshot for that week — this is intentional, the snapshot represents "state as of that week."

## Delta fields

| Field | Meaning |
|-------|---------|
| `factsAdded` | Net new facts between snapshots |
| `entitiesAdded` | Net new entities (post-noise-gate) |
| `docsAdded` | Net new documents |
| `docGrowthPct` | Percentage growth in document count |
| `latticeGrowthPct` | Percentage growth in lattice file size |
| `latticeDensityPct` | latticeBytes / (latticeBytes + voidBytes) × 100 |
| `latticeDensityDelta` | Change in density from previous snapshot |
| `newTopConcepts` | Concept names that entered top-10 this week |

## Projection

`--projection` fits a linear trend to the snapshot series and reports:
- Facts per week rate
- Entities per week rate
- Weeks until vault doubles (total facts + entities)
- 4-week forecast for facts and entities

Requires at least 2 snapshots. Linear extrapolation — honest about the model.

## HTML report

`--export-html=<path>` writes a fully standalone HTML file. No CDN, no JS libs.
Includes:
- Hero line with compound growth since week 1
- Big-number metrics grid
- SVG sparklines (facts, docs, entities, lattice density)
- Week-over-week delta table
- Concept frequency cloud
- Entity frequency bar chart
- Projection cards (if `--projection` also passed)

Aesthetic: dark carbon, McLaren F1 orange (`#FF6900`), chrome type, gold accents.

## Zero dependencies

Pure Node. No npm install. Runs on Node 18+.
`node --check scripts/v4/vault-audit.mjs` passes with no errors.

## Receipts

Every operation (snapshot, report, export-html, diff) emits a JSON receipt to
`<data_root>/receipts/vault-audit/<timestamp>.json` with:
- op type
- timestamp
- SHA-256 of payload
- data root + vault dir paths

Disclosure: `ATOM-ORANGEBOX-VAULT-AUDIT-V4-2026-0516`
