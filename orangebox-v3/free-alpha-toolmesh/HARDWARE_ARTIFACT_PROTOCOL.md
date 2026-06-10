# Hardware And Artifact Protocol

ToolMesh exists to keep Orangebox from crashing itself while adding powerful local tools.

## VRAM Semaphore

Every tool card declares:

- `vramRequiredGB`
- `ramRequiredGB`
- `requiresLLMUnload`
- `concurrencyLock`

Heavy image/video/kernel tools acquire a GPU/media lock before execution. If `requiresLLMUnload=true`, TriLane must pause or unload local LLM lanes before running the tool, then reload reasoning after the receipt is written.

## Artifact Vault

Binary artifacts must not travel through the Bun/API router as raw bytes or base64.

Tool outputs return:

- `file://` pointer
- SHA-256
- byte size
- receipt path

Rejected or failed artifact batches are garbage-collection candidates. Deletion remains a separate receipt-backed operator action.

## Immutable Workflow Templates

Rigid workflow tools do not accept model-generated node graphs as final truth.

The AI may inject approved variables into a prevalidated template:

- `prompt`
- `negative_prompt`
- `seed`
- `input_asset_pointer`
- `output_artifact_pointer`

For ComfyUI, example locked template ids are:

- `flux-book-cover-v1`
- `sdxl-proof-render-v1`

## Execution Mode

Tool cards declare one of:

- `headless`
- `workspace_prep`
- `headless_or_workspace_prep`
- `registry_only`

GUI-heavy tools use `workspace_prep` until headless automation is proven. Orangebox prepares assets, subtitles, project files, and receipts, then pauses for human finishing.
