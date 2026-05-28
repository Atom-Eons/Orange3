# receipt-share — ORANGEBOX v4

`receipt-share.mjs` turns any ORANGEBOX receipt JSON into a beautiful,
fully self-contained HTML artifact — ready to email, attach to a tweet,
or publish to a share endpoint.

---

## Quick start

```
node receipt-share.mjs --receipt=<path-to-receipt.json> --output=<output.html>
```

Open `output.html` in any browser. No server needed. No external refs.

---

## Browse receipts

The receipt browser lives at `src/v4/receipts/receipts.html`.  
Open it directly (file://) or serve it from the ORANGEBOX cockpit.

From the browser you can:
- Search summaries with fuzzy full-text search
- Filter by source, tag, or date range
- Pin important receipts to the top of the list
- Click **Share as proof** to call `POST /v1/receipts/share` and get a URL
- Click **Copy as artifact** to put the raw JSON on the clipboard

---

## Share a single receipt

**Local render** (no network required):

```
node receipt-share.mjs \
  --receipt=receipts/2026-05-16/build-abc123.json \
  --output=shared/build-abc123.html
```

This produces a single `.html` file with:
- Hero banner: operator org, project, timestamp, summary
- Rendered markdown body
- Collapsible evidence sections (diffs, stdout, screenshots embedded as base64)
- Metadata table
- Footer: "rendered by ORANGEBOX v4 — the OS, not the tool"

**Publish to endpoint**:

```
ORANGEBOX_SHARE_ENDPOINT=https://share.example.com/v1/receipts/share \
node receipt-share.mjs \
  --receipt=receipts/2026-05-16/build-abc123.json \
  --publish
```

If `ORANGEBOX_SHARE_ENDPOINT` is not set, the command prints:

```
endpoint not configured; use --output for local render.
```

---

## Share a sequence of receipts

Bash/PowerShell loop over a time window:

```bash
# bash
for f in receipts/2026-05-16/*.json; do
  id=$(basename "$f" .json)
  node receipt-share.mjs --receipt="$f" --output="shared/$id.html"
done
```

```powershell
# PowerShell
Get-ChildItem receipts\2026-05-16\*.json | ForEach-Object {
  node receipt-share.mjs --receipt=$_.FullName --output="shared\$($_.BaseName).html"
}
```

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ORANGEBOX_DATA_ROOT` | `process.cwd()` | Base directory for relative receipt paths and meta-receipt output |
| `ORANGEBOX_SHARE_ENDPOINT` | (unset) | REST endpoint for `--publish` |
| `ORANGEBOX_ORG` | `AtomEons` | Operator org name shown in hero banner |
| `ORANGEBOX_PROJECT` | `ORANGEBOX v4` | Project name shown in hero banner |

---

## Meta-receipt

Every `receipt-share` run emits a meta-receipt to:

```
<ORANGEBOX_DATA_ROOT>/receipts/share/<original-id>-shared-<ts>.json
```

This receipt records: original id, output path, mode (local/publish), and timestamp.
The meta-receipt itself appears in the browser like any other receipt.

---

## Privacy note

**Share artifacts embed the receipt's full evidence content**, including:
- stdout / stderr text blocks
- Diff blocks (file paths and changed lines)
- Screenshots (embedded as base64 data URIs — the actual pixel data is in the HTML)
- Metadata fields (timestamps, DAG node names, party-line message IDs)

Review the receipt before sharing. If the evidence contains internal paths,
access tokens referenced in diffs, or sensitive output, redact the JSON before running
`receipt-share.mjs`.

There is currently no automated redaction pass. That is a deliberate trade-off:
the artifact must be honest to be useful as proof of work.

---

## Future: signed shareable receipts

Planned for a later milestone:

- Each receipt artifact will be signed with the operator's ORANGEBOX key
- Signature embedded as a `<meta>` tag + JSON-LD block in the HTML
- Verifier CLI: `node receipt-verify.mjs --html=<path>` → prints VALID / INVALID + key fingerprint
- This turns a share artifact into a **verifiable proof of work** — cryptographically tied to the operator's identity

This is not shipped yet. Current shares are honest but not cryptographically verifiable.

---

## File structure

```
scripts/v4/
  receipt-share.mjs           CLI (this script)
  receipt-share.README.md     This doc

src/v4/receipts/
  receipts.html               Three-panel browser UI
  receipts.js                 Virtualized list + filter + detail logic (vanilla JS)
  receipts.css                Dark premium styles (McLaren F1 aesthetic)
```
