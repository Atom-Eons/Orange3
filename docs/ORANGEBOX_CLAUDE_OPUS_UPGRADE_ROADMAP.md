# ORANGEBOX Claude / Opus Upgrade Roadmap

Validated: 2026-05-26

This is a reality check on the operator-provided Claude usage guide. The guide is broadly directionally correct, but ORANGEBOX should only adopt the parts that become durable operating behavior for the Codex plus Claude Code split.

## Confirmed By Current Sources

- Claude Projects are real persistent workspaces with project knowledge and project instructions. Use them for Claude.ai planning sessions, not for Codex execution.
  Source: https://support.anthropic.com/en/articles/9517075-what-are-projects

- Claude Project instructions apply across chats inside a Project, and Project knowledge can expand via RAG when it approaches context limits.
  Source: https://support.anthropic.com/en/articles/9519177-how-can-i-create-and-manage-projects

- Claude Code memory through `CLAUDE.md` is real and should hold project rules, workflows, style preferences, and repo commands.
  Source: https://docs.anthropic.com/en/docs/claude-code/memory

- Extended thinking is real on supported Claude models and is specifically useful for harder reasoning tasks, planning, and analysis.
  Source: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips

- Prompt caching is real for Claude API workloads and matters when repeated project context or long static prefixes are reused.
  Source: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

## What To Adopt

1. Create an ORANGEBOX Claude Project for Opus-only reasoning.
   - Load product brief, current receipts, AGENTS.md law, active roadmap, and AE See-Suite 72-state guide.
   - Instructions must say: Claude/Opus reasons, compresses, critiques, and shapes contracts; Codex executes, mutates, verifies, and receipts.

2. Add a repo-level Claude handoff file.
   - Keep `C:\AtomEons\orangebox\CLAUDE.md` short and operational.
   - Include latest proof command, rollback rule, current active surface `/v4/react`, and "do not promote without receipt".

3. Add a prompt-contract lane to ORANGEBOX.
   - Commands like "ask 5 questions first", "attack this plan", "steelman this plan", and "write the prompt then run it" become reusable operator modes.
   - These should become command templates in the command palette and chat dock, not one-off chat habits.

4. Add source-backed style cloning.
   - Only use operator-approved samples.
   - Store extracted style rules as versioned workspace memory, with source refs and rollback.

5. Add Claude API prompt caching later.
   - Relevant to Part 6 backend only.
   - Cache static project constitution, state schema, tool registry, and prompt protocol.
   - Do not build this into the browser.

6. Add context hygiene to automation.
   - New topic means a new Claude Project chat, but same Project memory.
   - Long-running ORANGEBOX work should emit compact receipts that Opus can read without replaying every token.

## What Not To Adopt Blindly

- "Unlock 100%" is marketing language, not an engineering claim.
- "Show your reasoning" is not a universal rule. Ask for conclusions, assumptions, uncertainty, and evidence. Do not require private chain-of-thought style output.
- Claude Projects are not a substitute for receipts, tests, or source-backed proof.
- Claude memory is advisory. It does not replace deterministic checks, build scripts, or rollback data.
- Prompt caching reduces repeated context cost only when the workload and model support it; it is not a generic web-chat optimization knob.

## ORANGEBOX Backlog Items

- `OB-CLAUDE-01`: Create `CLAUDE.md` for Orangebox with current split, commands, rollback, and proof rules.
- `OB-CLAUDE-02`: Add command palette templates for "ask clarifying questions", "attack plan", "steelman", and "write/run best prompt".
- `OB-CLAUDE-03`: Add a "Claude/Opus handoff packet" receipt generator from latest build/proof status.
- `OB-CLAUDE-04`: Add backend prompt-cache design for Part 6 agent runtime.
- `OB-CLAUDE-05`: Add source-backed style memory with versioned operator samples.
- `OB-CLAUDE-06`: Surface these as AE See-Suite operator modes, not generic chat tips: plan-contract, attack-plan, steelman, source-backed style clone, and Opus handoff receipt.

## Current Decision

Adopt the guide as a workflow input, not as a product pivot. AE See-Suite remains the active build. Claude/Opus is a reasoning lane for project shaping; Codex remains the mutation and proof lane.
