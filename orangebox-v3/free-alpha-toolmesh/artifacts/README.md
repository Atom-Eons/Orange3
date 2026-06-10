# ToolMesh Artifact Vault

Binary artifacts do not flow through Bun, Elysia, TriLane, or the command rail as raw bytes.

ToolMesh actions return:

- absolute path
- `file://` URI
- SHA-256 hash
- MIME type
- size
- receipt id
- retention class

Deletion is always a separate receipt-backed action.
