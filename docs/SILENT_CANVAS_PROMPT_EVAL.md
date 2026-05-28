# Silent Canvas Prompt Eval Gate

ORANGEBOX keeps the Creative Brain, Fast Interpreter, and Repair Interpreter prompts as versioned assets under `C:\AtomEons\orangebox\prompts\silent-canvas`.

The prompt eval gate is a local regression check. It does not call a model. It validates that:

- Prompt files load and produce stable hashes.
- Few-shot success rows point at the current prompt versions.
- Success rows contain HSMP payloads accepted by the live HSMP schema.
- Failure rows include repair rules.
- Failure repair examples can be wrapped into a schema-valid HSMP mutation.

Run:

```powershell
node C:\AtomEons\orangebox\scripts\v4\prompt-eval.mjs
node C:\AtomEons\orangebox\scripts\v4\prompt-eval.mjs --receipt
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas prompt-eval --json
```

This gate should run before promoting prompt edits, new few-shot rows, or Fast Interpreter schema changes.

Failure means the prompt corpus is no longer aligned with the code contract. Fix the prompt version, few-shot row, repair example, or HSMP schema before calling the build green.
