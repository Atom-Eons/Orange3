# ORANGEBOX Quickstart

Five-minute orientation for AE See-Suite and AE Operations.

## What Opens First

ORANGEBOX is two connected surfaces:

- **AE See-Suite**: the top command surface for projects, route status, party-line, proof, and receipts.
- **AE Operations**: setup, keys, model lanes, install health, Advanced AI Box, recovery, and proof doctors.

Basic Install is the default. It runs on one computer and does not require a second machine, network tuning, AI Box token, or Administrator networking.

Advanced AI Box is optional. Use it only when you have, or plan to buy, a second AI computer for heavy work.

## The Main Experience

AE See-Suite is built around five operator questions:

1. What are we building?
2. Where are we in the numbered plan?
3. What is running now?
4. What is blocked?
5. What has been proven?

The interface answers those through three zones:

- **Vision Rail**: macro-action timeline, department pulses, route health, proof gates, blockers.
- **Command Center**: low-scroll command input, party-line, current route status, operator messages.
- **Artifact Library**: route packets, receipts, docs, screenshots, proof outputs, rollback notes.

AE Operations holds the systems view:

- Basic vs Advanced setup status
- API keys and model profiles
- Advanced AI Box network checks
- Ethereal/Thunderbolt-class direct-link diagnostics
- proof doctors and package health
- rollback and recovery paths

Useful proof commands:

```powershell
npm run proof:first-run
npm run proof:operations
npm run finish:green
```

## Day-One Workflow

1. Launch ORANGEBOX.
2. When asked "Do you have an AI computer to set up?", choose **No - Basic install** unless you already have a second AI computer ready.
3. Open AE See-Suite.
4. Read the Day-0 project route.
5. Type one concrete objective into the command bar.
6. Review the route packet ORANGEBOX creates.
7. Run the next proof gate or route step.
8. Open the Artifact Library and confirm a receipt exists before calling anything green.

## Command Bar Examples

Use short, direct commands:

- `status`
- `next`
- `route this to engineering`
- `run proof`
- `show blockers`
- `package the current route`
- `write a receipt`
- `switch to Basic Install`
- `open Advanced AI Box diagnostics`

The command bar should stay useful even when an AI Box is offline.

## What Done Means

A task is not complete until:

1. the requested output exists
2. evidence exists where relevant
3. blockers are stated explicitly
4. docs or commands are updated when relevant
5. unresolved risk is named
6. rollback is obvious
7. a receipt records the result

No receipt, no green.

## Where Data Lives

ORANGEBOX is local-first. Your project data lives under the ORANGEBOX application data root:

```text
%APPDATA%\com.atomeons.orangebox.command\
  project-thread\
  party-line\
  receipts\
  proof\
  review-engines\
  knowledge\
  missions\
```

Back this directory up like you would your Documents folder.

## Optional: Advanced AI Box

AI Box is the optional heavy-execution worker on a second machine. You do not need it on day one.

When ready, open AE Operations and choose Advanced AI Box. The guided path asks:

1. Do you have an AI computer?
2. Is it on the same router, direct Ethernet, or Thunderbolt-class link?
3. Can AE See-Suite reach it?
4. Are bandwidth-priority rules safe to apply?
5. What recovery path should be used if the link drops?

See [AI_BOX_WORKER_RAIL.md](AI_BOX_WORKER_RAIL.md), [AI_BOX_NETWORK_PRIORITY.md](AI_BOX_NETWORK_PRIORITY.md), and [AI_COMPUTER_BUYING_GUIDE.md](AI_COMPUTER_BUYING_GUIDE.md).

## Optional: Local Model Lanes

ORANGEBOX can route to local models through AE Operations when you install and configure them yourself. Local model setup is optional; cloud/subscription model lanes remain available when configured.

## Habits That Compound

- Open AE See-Suite before you open scattered project tabs.
- Write the next action before you stop work.
- Let AE Operations diagnose setup instead of guessing.
- Do not call green without a receipt.
- Do not trust memory over receipts.
- When stuck, route to MIRRORS for reality contact or CHECKMATE for proof pressure.

That is the loop: command, route, prove, receipt, continue.
