# HSMP Schema Versioning

Silent Canvas uses the Headless State Mutation Payload (HSMP) as the contract between the Fast Interpreter and the project graph reducer.

Current version:

- `schema_version`: `1.0`
- `hsmp_compat_version`: `hsmp-1.0.0`
- `primitive_version`: `silent-canvas-primitives/v1`

## Compatibility Rule

Every runtime-stamped HSMP carries:

```json
{
  "schema_version": "1.0",
  "hsmp_compat_version": "hsmp-1.0.0",
  "compatibility": {
    "min_compiler_version": "6.3.0-alpha.7",
    "migration_required": false,
    "schema_migration": {
      "supported": true,
      "applied": false,
      "from": "1.0",
      "to": "1.0",
      "reason": "already-current"
    }
  }
}
```

Missing-version payloads and known legacy labels (`0`, `0.1`, `0.9`, `legacy`, `v0`) are normalized to `1.0` and marked with `schema_migration.applied=true`.

Unknown future or foreign versions are not silently upgraded. They keep their incoming `schema_version`, set `migration_required=true`, fail validation, and emit parse-error evidence.

## Why This Exists

OrangeBox receipts are replay material. If mutation payload shapes change without a version bridge, old receipts become brittle and replay/audit breaks. Versioning lets the compiler distinguish:

- current payloads
- implicit legacy payloads
- explicitly legacy payloads
- unsupported payloads that must stop

## Runtime Evidence

Silent Canvas run metrics now include:

```json
{
  "schema": {
    "hsmp_schema_version": "1.0",
    "hsmp_compat_version": "hsmp-1.0.0",
    "migrations": []
  }
}
```

The composite `silent-canvas-run` receipt includes `hsmp_compatibility`.

The same receipt also includes:

```json
{
  "hsmp_primitive_version": "silent-canvas-primitives/v1",
  "primitive_versions": ["silent-canvas-primitives/v1"]
}
```

Every stamped `state_mutations[]` item receives `primitive_version` if the model omitted it. The project graph mutation log stores the same primitive version, plus `workspace_version_before` and `workspace_version_after`, so replay tools can tell which mutation contract was used.

`silent-canvas-parse-error` receipts include `schema` and `hsmp_compatibility` when available.

Runtime events:

- `hsmp_schema_migration`
- `hsmp_schema_unsupported`

## Operator Law

Do not hand-edit old receipts to "fix" schema version. If an old payload needs replay, run it through the compatibility path and receipt the migration. If a foreign or future payload is unsupported, stop and add an explicit migration shim before replaying it.
