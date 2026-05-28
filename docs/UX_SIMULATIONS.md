# UX Simulations — first-run installer

Walk-throughs of real buyer scenarios. Each simulation predicts what the buyer experiences, names the friction points, and locks in the design choice that handles them.

**Run before every installer release. Update when a real buyer reports a friction not on this list.**

---

## Simulation 1 — 15-year-old on a fresh Windows 11 laptop

**Profile:** Never used a terminal. Knows how to install games from Steam. Has Chrome, Discord, maybe VS Code.

**Walk-through:**
1. Receives email after purchase with a download link.
2. Clicks link → `ORANGEBOX-Installer-v1.3.0.exe` downloads to Downloads folder (~30 seconds).
3. Double-clicks the .exe.
4. **Windows SmartScreen pops up:** "Windows protected your PC."
   - 🚨 **FRICTION 1.A** — first-time installer authors hit this. Buyer may close.
   - **DESIGN CHOICE:** Pre-install README in the email AND the installer file is named `ORANGEBOX-Installer-v1.3.0.exe` (clearly named) so user is confident clicking "More info → Run anyway."
5. SmartScreen overridden → UAC prompt: "Allow this app to make changes?"
   - 🚨 **FRICTION 1.B** — first UAC, but expected.
   - **DESIGN CHOICE:** Email pre-purchase explains "you will see a UAC prompt — click Yes." No surprises.
6. UAC accepted → installer window opens. Dark space scene. Orange orb pulses softly. Atoms float.
   - ✅ **DELIGHT MOMENT** — looks like a sci-fi movie. They think "this is real."
7. Text appears: "Welcome to ORANGEBOX. We're checking your computer."
8. Progress ring fills 25% in 2 seconds. "Your computer is ready."
9. Text: "We need to install one free helper called Node.js. We'll do it for you."
   - 🚨 **FRICTION 1.C** — second UAC will appear in a moment when Node.js installer launches.
   - **DESIGN CHOICE:** Show pre-warning: "You'll see another permission prompt in a sec — click Yes. This is for Node.js, a free Microsoft-friendly tool."
10. Progress ring fills. Detail text: "Downloading... 12.4 MB / 32.1 MB"
11. Second UAC for Node.js silent install → user clicks Yes.
12. Progress: "Installing Node.js... almost there..."
13. 30 seconds later: "Almost done. Now we just need your AI key."
14. The orb opens up to reveal a form: "Paste your Claude API key here." Below: a link "Don't have one? Get one free at console.anthropic.com — opens in browser."
   - 🚨 **FRICTION 1.D** — many teenagers won't have an Anthropic account.
   - **DESIGN CHOICE:** "Skip for now" button. They can paste a key later from the cockpit's Settings panel.
15. They paste a key (or skip).
16. The orb shrinks to a point, then expands into the full cockpit window.
17. ✅ **DELIGHT MOMENT** — beautiful transition.

**Predicted friction points: 4 (1.A through 1.D). All addressed.**

---

## Simulation 2 — User on a slow internet connection (5 Mbps)

**Profile:** Rural area, mid-range connection, otherwise standard Windows laptop.

**Walk-through:**
1. Same start as Simulation 1.
2. At step 10, the Node.js download is 32 MB. At 5 Mbps that's ~50 seconds — fine but noticeable.
3. 🚨 **FRICTION 2.A** — without a progress bar, user thinks the installer is frozen.
4. **DESIGN CHOICE:** Progress ring shows real-time bytes downloaded + estimated time remaining. Below ring: "Downloading from nodejs.org — about 50 seconds left."
5. ✅ User is reassured. Watches the orbs.
6. After Node.js install: download proceeds OK.

**Predicted friction: 1 (2.A). Addressed.**

---

## Simulation 3 — User behind a corporate firewall

**Profile:** Office laptop with strict outbound firewall. nodejs.org may be blocked.

**Walk-through:**
1. Same start.
2. At step 10, download fails: "Connection refused."
3. 🚨 **FRICTION 3.A** — fatal failure, user doesn't know what went wrong.
4. **DESIGN CHOICE:** The installer shows:
   ```
   Couldn't download Node.js.

   This usually means your network blocks nodejs.org.

   If you're at work or school, ask your IT admin to allow:
     - nodejs.org
     - github.com (for some packages)

   Or click here to download Node.js manually:
     [Open nodejs.org →]

   When you have Node.js installed, restart this installer.
   ```
5. Soft failure mode. User has a path forward.
6. **DESIGN CHOICE 2:** Bundle the Node.js installer .msi INSIDE the ORANGEBOX installer .exe. Then no network needed for that step. Trade: +30 MB installer size.
7. Decision: **bundle Node.js installer for v1.3.0.** Worth the size.

**Predicted friction: 1 (3.A). Addressed via Node.js bundling.**

---

## Simulation 4 — User without admin rights (managed work laptop)

**Profile:** Office laptop where IT has locked down admin. UAC accept doesn't work.

**Walk-through:**
1. Buyer double-clicks installer.
2. SmartScreen passes (they have permission to run apps, just not install).
3. UAC prompt → admin password required → buyer doesn't have one.
4. 🚨 **FRICTION 4.A** — fatal.
5. **DESIGN CHOICE:** Before launching admin-requiring installers, the ORANGEBOX installer checks `IsUserAnAdmin()`. If false:
   ```
   You don't have admin rights on this computer.

   ORANGEBOX needs admin to install Node.js (one free helper tool).

   What to do:
     - At home/personal laptop: log in as the main user, then re-run.
     - At work/school: ask IT to install Node.js 20+ for you.
       Then re-run this installer — it will skip the Node.js step.

   For a full refund within 30 days: a.mccree@gmail.com
   ```

**Predicted friction: 1 (4.A). Addressed with clear message + refund offer.**

---

## Simulation 5 — User who already has Node.js installed

**Profile:** Developer or power user, Node.js 20+ already on PATH.

**Walk-through:**
1. Same start.
2. At step 9, installer runs `node --version`. Sees `v20.x` or higher.
3. **DESIGN CHOICE:** Skip the Node.js install entirely. Display: "Node.js already installed ✓ — skipping."
4. Progress ring jumps ahead to the next step.
5. ✅ Faster path for power users.

**Predicted friction: 0. Smooth.**

---

## Simulation 6 — User on a 8 GB RAM laptop trying Ollama

**Profile:** Mid-range Windows laptop. 8 GB RAM. Wants the "full experience."

**Walk-through:**
1. Same start.
2. After core install, the installer checks RAM.
3. Detection: 8 GB available.
4. **DESIGN CHOICE:** Ollama auto-install is **disabled** for this user. The "Optional: install Ollama" toggle in the installer is grayed out with a hover tooltip: "Ollama needs at least 16 GB of RAM. Your computer has 8 GB. Skip this — you can use cloud AI instead."
5. User can override by clicking "I know what I'm doing — install anyway." But it's NOT the default.

**Predicted friction: 0 (if defaults are smart). 1 (6.A) if user overrides:**
**6.A** — they override, install Ollama, try to load a 70b model, system thrashes. **DESIGN CHOICE:** override flow shows hard warning: "WARNING: Your computer may freeze. Continue?" with a 5-second forced delay before the button enables. Most teenagers will back out.

---

## Simulation 7 — User pasted wrong API key

**Profile:** Anyone typing in an API key. Maybe copied with extra whitespace, or copied the wrong key.

**Walk-through:**
1. Installer reaches the API-key step.
2. User pastes a key.
3. **DESIGN CHOICE:** Installer hits `https://api.anthropic.com/v1/messages` with a one-token test prompt.
4. If 401 unauthorized:
   ```
   This key doesn't seem to work.

   Common causes:
     - Extra spaces — try pasting again.
     - Wrong key — make sure you copied your Anthropic API key, not OpenAI.
     - Account out of credits — check console.anthropic.com.

   [Paste again]    [Skip for now]
   ```
5. If 200 OK: green check, proceed.

**Predicted friction: 1 (7.A). Addressed with validation.**

---

## Simulation 8 — User declines UAC

**Profile:** Cautious user. Sees UAC, panics, clicks No.

**Walk-through:**
1. UAC pops up, user clicks No.
2. Installer would normally fail.
3. **DESIGN CHOICE:** Installer detects user-declined-UAC. Shows:
   ```
   We need permission to install Node.js (a free Microsoft tool).

   Click "Try again" and click "Yes" on the permission prompt.

   If you're worried — Node.js is the same tool used by VS Code,
   Discord, and most modern apps. It's safe.

   [Try again]    [Skip Node.js — manual install later]
   ```
4. User can re-trigger. Soft fail.

**Predicted friction: 1 (8.A). Addressed with retry + explanation.**

---

## Simulation 9 — User closes the installer mid-flow

**Profile:** Anyone interrupted by a phone call, doorbell, etc.

**Walk-through:**
1. Installer is at step 10/15.
2. User clicks X. Installer closes.
3. **DESIGN CHOICE:** State is checkpointed to `%LOCALAPPDATA%\com.atomeons.orangebox.command\install-state.json`. On next launch, the installer resumes from the last completed step.
4. If they re-run the installer:
   ```
   Picking up where we left off (Step 10/15)...
   ```

**Predicted friction: 1 (9.A). Addressed with checkpoint+resume.**

---

## Simulation 10 — User on Windows 7

**Profile:** Older machine, Windows 7. Unsupported.

**Walk-through:**
1. User runs installer.
2. **DESIGN CHOICE:** First thing the installer does is check OS version.
3. If Windows 7 or 8:
   ```
   ORANGEBOX requires Windows 10 or 11.

   Your computer is running Windows 7, which isn't supported.

   For a full refund: email a.mccree@gmail.com within 30 days.

   [Email me]    [Close]
   ```
4. Polite refusal + clear refund path.

**Predicted friction: 1 (10.A). Addressed with version check + refund.**

---

## Simulation 11 — User who Googles "Anthropic API key" mid-install

**Profile:** Doesn't know what an API key is. Hits the API-key step and freezes.

**Walk-through:**
1. Installer reaches the API-key step.
2. User stares.
3. **DESIGN CHOICE:** The form has THREE buttons, not just one:
   - **Get a key** — opens console.anthropic.com in their default browser. Shows tooltip: "Make an account → click 'API Keys' → click 'Create Key' → paste it back here."
   - **I'll do this later** — skips. Saves a marker so the cockpit prompts again on first launch.
   - **Help me** — opens a one-page explainer with screenshots.
4. ✅ No one is stuck.

**Predicted friction: 1 (11.A). Addressed with 3-button approach.**

---

## Simulation 12 — Antivirus quarantines the installer

**Profile:** Aggressive antivirus (some Avast/Norton/etc setups flag unsigned installers).

**Walk-through:**
1. User double-clicks installer.
2. Antivirus eats it.
3. 🚨 **FRICTION 12.A** — installer doesn't even run. User doesn't know what happened.
4. **DESIGN CHOICE (purchase email):** Email includes a section:
   ```
   If the installer disappears or your antivirus warns:
   1. Open your antivirus, find "Quarantine" or "History."
   2. Find ORANGEBOX-Installer. Click "Restore" or "Allow."
   3. Try again.

   Tools that have flagged us: Avast, Norton (sometimes), Defender (rarely).

   The cure: a code-signing certificate. We're getting one for v1.4.
   ```
5. **DESIGN CHOICE (v1.4):** acquire a code-signing certificate. Eliminates this for good.

**Predicted friction: 1 (12.A). Half-addressed in v1.3 via email + plan; fully addressed in v1.4.**

---

## Summary table

| # | Scenario | Friction count | All addressed? |
|---|---|---|---|
| 1 | 15-yr-old fresh laptop | 4 | ✅ |
| 2 | Slow internet | 1 | ✅ |
| 3 | Corp firewall | 1 | ✅ (Node.js bundled) |
| 4 | No admin rights | 1 | ✅ (refund path) |
| 5 | Node already installed | 0 | ✅ |
| 6 | 8 GB RAM + Ollama | 1 if override | ✅ (hard warning) |
| 7 | Wrong API key | 1 | ✅ (validation) |
| 8 | Declined UAC | 1 | ✅ (retry + explainer) |
| 9 | Closed mid-flow | 1 | ✅ (checkpoint/resume) |
| 10 | Windows 7 | 1 | ✅ (version check) |
| 11 | Doesn't know what API key is | 1 | ✅ (3-button form) |
| 12 | Antivirus quarantine | 1 | 🟡 v1.4 fully via code-signing |

**Total predicted friction: 14 points across 12 scenarios. 13/14 fully addressed. 1 deferred to v1.4 (code-signing).**

---

## Update protocol

When a real buyer reports a friction not on this list:
1. Add a new simulation here.
2. Predict the friction.
3. Lock the design choice.
4. Ship the fix.
5. Move on.

The list grows. The installer gets smoother. The product gets less embarrassing.

*Last updated: 2026-05-14 · Pre-v1.3.0 ship*
