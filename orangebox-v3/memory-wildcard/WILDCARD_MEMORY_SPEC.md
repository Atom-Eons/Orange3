# Knowledge Engine v3 Wildcard Spec

K3 closes the v2 lexical recall gap by adding alias, lexical, authority, and optional local embedding pointer search.

The database stores pointer cards and chunk coordinates. It does not store raw truth as authoritative memory. The model receives only content opened through the Cold Truth Gate and compressed into an AtomSmasher packet.

W1 status:

- Receipts, primers, and curated Cold Truth aliases are allowed.
- Chat archive indexing is disabled and must report zero indexed rows.
- The active repo root is recorded on each card so stale installed-copy cards do not outrank current source.
- Vector search is optional until the local Ollama embedding lane is online; lexical/alias fallback must be labeled degraded.
