# Session Primer

This workspace is the clean Orangebox Delta project.

Assume every new chat has zero memory. Prime from receipts and local files, not account memory.

## Canonical Primer

Read:

```text
C:\Users\a\OrangeBox-Data\primers\ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md
C:\Users\a\OrangeBox-Data\primers\ORANGEBOX_MID_SESSION_PRIMER.md
```

If those are missing, use:

```text
C:\AtomEons\orangebox-delta\docs\ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER_2026-05-28.md
C:\AtomEons\orangebox-delta\skills\orangebox-primer\SKILL.md
```

## Required System Check

```powershell
cd C:\AtomEons\orangebox-delta
npm.cmd run restart:lock
npm.cmd run ops:readiness
npm.cmd run reality:watch
```

For a fully green local proof:

```powershell
npm.cmd run system:full-green
```

## Active Lane

Default lane:

```text
Orangebox Operations backend
```

Visual/frontend/product UI work belongs under:

```text
C:\AtomEons\orangebox-delta\frontend
```

Do not mutate `frontend/` from the Ops lane unless the operator explicitly redirects the chat.

## OB0X Title Protocol

After a chat is primed and system checked, rename it:

```text
<Project Name> OB0X ON
```

If the host app cannot be renamed by tools, provide the exact title for the operator to use manually.
