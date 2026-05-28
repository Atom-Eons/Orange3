# ORANGEBOX Finish-Line Scope Review

Updated: 2026-05-20 04:20 America/New_York

## Target

ORANGEBOX should feel like one intentional product, not a pile of agent utilities.

- Top page: **AE See-Suite**
- Operations page: **AE Operations**
- Install choice: **Basic Install** or **Advanced AI Box**
- Network module: **Ethereal AI Link**
- Proof posture: doctors, screenshots, receipts, package manifest, rollback path

EIDOS is paused and separate.

## Build History Lines

1. **AE See-Suite product shell**
   - Product-facing v4 surface exists as the main top page.
   - Stale buyer-facing "cockpit", "Codexa", and BLUEB0X language is gated by product-language doctors.
   - Compatibility route names may remain internally while old route/class migration finishes.

2. **AE Operations**
   - Operations lane exists for setup, recovery, proof health, install status, AI Box network status, package state, and final board health.
   - Recovery/proof panel exposes final-board status, git cleanliness, package hash, process hygiene, and screenshot proof.

3. **Basic Install vs Advanced AI Box**
   - First-run asks: "Do you have an AI computer to set up?"
   - Basic Install is the default and requires no second machine, network setup, or admin networking prompts.
   - Advanced AI Box is optional and covers controller plus AI computer over router LAN, Ethereal Ethernet, or Thunderbolt-class direct networking.
   - A buyer-facing "What is an AI computer and where can I buy one?" explainer is present.

4. **First-run visual proof**
   - `obx install visual-proof --json` renders desktop and compact screenshots.
   - Proof verifies Basic Install is checked by default, Advanced AI Box is present, and no remote AI Box is required.
   - Static HTML now carries the same Basic/Advanced contract as a hidden fallback so proof cannot miss the install choice if browser script execution falls back.
   - Screenshot capture retries with classic headless mode if new Edge headless flakes.

5. **Ethereal AI Link**
   - Direct-cable AI-box network module exists with generated installer payload.
   - Pack includes dry-run, apply-host, apply-peer, remove, validation, socket helper, socket server, and token creation commands.
   - Ethereal uses approval-gated admin scripts; it does not silently change adapters.
   - Raw socket daemon path is included for large file movement without depending on SMB/NVMe-oF.

6. **Network priority and self-diagnosis**
   - AI-box network doctor reports Basic/Advanced route status and distinguishes required failures from optional evidence.
   - Ethereal doctor surfaces adapter inventory, subnet status, socket status, warnings, next action, and rollback path.
   - Process doctor reports duplicate ORANGEBOX MCP servers as a watch item instead of killing anything without approval.

7. **OpenAPI and API-first spine**
   - `docs/api/orangebox-openapi.yaml` covers the v4 command surface.
   - API doctors verify spec parse, documented routes, route shape smoke, live server smoke, and drift.
   - OpenAPI is the tool-contract spine for future SDK/MCP/tooling alignment.

8. **Operating spine**
   - Route planning and route doctors exist through the `obx route` lane and v4 API routes.
   - Route object includes objective, project, macro-actions, department route, coordination, clarification policy, model lane, proof gates, rollback, and receipts.

9. **Department and proof board**
   - Department OS, Surface Factory, MCP, Silent Canvas, route, route-state, API, install clarity, AI-box network, Ethereal, process hygiene, and package manifest are pulled into the final board.
   - Final board distinguishes hard failures from advisories.

10. **Silent Canvas and Surface Factory**
    - Silent Canvas alpha.7 doctors exist.
    - Surface Factory docs and doctors exist.
    - Visual telemetry and replay direction are documented, with implementation still needing deeper product polish.

11. **Claude/Opus handoff**
    - Claude export lane exists to produce gather/act/verify handoff packets.
    - ORANGEBOX remains vendor-flexible; Claude is supported deeply without becoming the only model lane.

12. **Portable package**
    - Portable package is rebuilt at `C:\AtomEons\ship\orangebox-v6.3.0-alpha.7-portable.zip`.
    - Latest package hash after first-run proof hardening:
      `5e6374e6b1398bf44aa61ce5e4cdd06a7af17696c11c2079015f4a93b866f0ce`
    - Package includes buyer docs, OpenAPI docs, Ethereal AI Link payload, node runtime, app sources, executable, and manifest.

## Current Percent To The Desired Product

**70% to the product you described.**

This is not a "repo feature percent." It is the percent to your actual target: a pristine, ahead-of-class, luxury command product that a normal operator can trust.

Why not higher:

- The operating spine and proof system are real, but the visual product still needs more luxury-level polish.
- Basic/Advanced install is now coherent, but needs more user-flow testing from a fresh machine state.
- Ethereal AI Link is packaged and self-diagnosing, but true two-machine proof depends on both machines being reachable and intentionally configured.
- The final board is strong, but still carries advisory watch items for duplicate ORANGEBOX MCP processes.
- Some internal compatibility naming remains by design until route/class migration is finished.
- Silent Canvas and Surface Factory exist, but the distinctive "different experience to create with" still needs more native interaction depth.

## Remaining Full Scope

1. **Luxury UX pass**
   - Make AE See-Suite feel less like a technical dashboard and more like a premium creation command surface.
   - Tighten spacing, motion, visual hierarchy, empty states, microcopy, loading states, and responsive polish.
   - Remove any remaining developer-shaped surfaces from the first operator path.

2. **Fresh install rehearsal**
   - Run the package from a clean data root.
   - Prove first-run, Basic Install, skip key, add key later, AE Operations, final board, rollback docs, and package manifest.

3. **Advanced AI Box real-machine proof**
   - On two reachable machines, prove host/peer configuration, direct route, token setup, socket ping, large-file benchmark, and rollback.
   - Keep this separate from Basic Install so one-machine buyers are never blocked.

4. **Compatibility naming migration**
   - Keep internal aliases working, but migrate route/class/file names away from stale cockpit/Codexa/BLUEB0X language where it is no longer needed.
   - Product-facing language gate stays strict.

5. **Final green board as one screen**
   - Turn the doctor evidence into a clear AE Operations "green board" that a non-coder can understand instantly.
   - Keep raw receipt links available, but not front-and-center.

6. **Silent Canvas differentiation**
   - Deepen mutation replay, visual telemetry, route-to-canvas updates, and low-scroll command flow.
   - This is where ORANGEBOX becomes a different creation experience instead of a nicer operations shell.

7. **Installer maturity**
   - Package signing, clearer update flow, uninstall/repair flow, and clean rollback scripts.
   - Avoid silent admin changes; every privileged network action must be explicit and reversible.

8. **Performance and process hygiene**
   - Reduce duplicate background ORANGEBOX MCP servers.
   - Add a one-click approved cleanup path in AE Operations.
   - Keep process doctor read-only until approval is explicit.

9. **Route/API/MCP hardening**
   - Keep OpenAPI as source of truth.
   - Add more response-shape assertions.
   - Continue tightening code-mode MCP safety and execution allow-list.

10. **Release candidate package**
    - Rebuild from clean git.
    - Run final board with `--full --require-clean`.
    - Produce screenshots, manifest, receipt, rollback note, and final package hash.

## Decisions For Atom

1. **Name lock**
   - Keep **AE See-Suite** and **AE Operations** as final product-facing names?

2. **Advanced transport priority**
   - For the public product, should Advanced AI Box lead with router LAN first, Ethereal Ethernet first, or "we detect the best route" first?

3. **Process cleanup approval**
   - Should AE Operations include an explicit "Clean duplicate ORANGEBOX helpers" button that kills only listed ORANGEBOX helper PIDs after confirmation?

4. **Launch bar**
   - Is alpha.7 meant to become a private operator release, or should the next package be held until Silent Canvas has stronger visual creation depth?

5. **Package signing**
   - Do we treat unsigned portable zip as enough for private use, or prioritize signed installer polish before broader sharing?

6. **Ethereal proof timing**
   - Do we pause product UX and prove the two-machine direct link now, or keep Basic Install green and do Advanced proof as the next focused pass?

## Current Evidence Commands

- `npm run check`
- `npm run pack:portable`
- `node .\scripts\obx.mjs install visual-proof --json`
- `node .\scripts\obx.mjs install doctor --json`
- `node .\scripts\obx.mjs api language-doctor --json --isolated`

## Current Known Watch Items

- Duplicate ORANGEBOX MCP servers may be active on this machine; process doctor reports this as a watch item requiring approval before cleanup.
- Ethereal direct-link real-machine proof is environment-dependent and must not block Basic Install.
- Internal compatibility names remain in selected scripts/routes while migration continues.
