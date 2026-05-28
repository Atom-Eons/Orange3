# Silent Canvas Prompt Versioning

ORANGEBOX no longer treats the Creative Brain and Fast Interpreter prompts as anonymous code strings.

## Canonical Assets

- `C:\AtomEons\orangebox\prompts\silent-canvas\creative-brain\v1.md`
- `C:\AtomEons\orangebox\prompts\silent-canvas\fast-interpreter\v1.md`
- `C:\AtomEons\orangebox\prompts\silent-canvas\repair-interpreter\v1.md`
- `C:\AtomEons\orangebox\prompts\silent-canvas\fewshots\hsmp-success.jsonl`
- `C:\AtomEons\orangebox\prompts\silent-canvas\fewshots\hsmp-failures.jsonl`

Runtime loader:

- `C:\AtomEons\orangebox\scripts\v4\prompt-registry.mjs`

## Receipt Contract

Every Silent Canvas run now emits `silent-canvas-prompt-version` before model calls, with:

- prompt version strings
- prompt SHA-256 hashes
- prompt file paths
- HSMP schema version
- HSMP compatibility version

The final `silent-canvas-run` receipt also carries this producer/provenance block so runs can be replayed, audited, and compared after prompt changes.

## Compatibility Law

The runtime stamps HSMP output with canonical provenance through `stampHSMPProvenance`.

Model-provided `producer` fields are not trusted blindly. The runtime overwrites prompt versions and hashes with the prompt files actually loaded for the run.

Current schema:

- `schema_version`: `1.0`
- `hsmp_compat_version`: `hsmp-1.0.0`
- `min_compiler_version`: `6.3.0-alpha.7`

## Promotion Law

A new prompt version is not promoted just because it sounds better. It needs:

- successful syntax checks
- Silent Canvas injected-model harness pass
- parse-success evidence
- receipt showing prompt hashes
- no regression in existing HSMP examples
