# Rollback Runbook — emergency operator procedure

What to do if a shipped version of ORANGEBOX Command has a critical post-ship defect that buyers are actually hitting.

**Audience:** Atom McCree (operator).

---

## When to invoke

Roll back if **any** of the following is true:
- More than 3 buyers report the same install/launch failure within 24 hours.
- A security vulnerability is reported that could harm a buyer (data loss, credential exposure, remote code execution).
- A legal/compliance issue surfaces (tax handling broken, refund mechanism failing, EU customer dispute).
- The first-run flow is silently losing buyer data.

Do NOT roll back for:
- Cosmetic bugs (typo, layout glitch, color off).
- Buyers who refuse to follow install docs (UAC declined, antivirus issue) — these are support, not rollback triggers.
- Single-buyer-specific environmental issues (their unique antivirus, their corporate firewall).

---

## MSI / NSIS rollback constraint

**Critical:** the MSI `upgradeCode` (`9F3E8B41-7C2A-4E5D-A1F6-2D7E9B5C4A18`) is shared across **all v1.x versions** (v1.0.0 through current). Windows Installer rules:

- Higher version installs over lower — OK.
- Same version installs over same — OK.
- **Lower version installs over higher — REJECTED** (Windows refuses to "downgrade" automatically).

This means: if v1.3.2 has a critical defect, you CANNOT push a v1.3.1 MSI to fix it. Windows will refuse the install on machines that already have v1.3.2.

**The actual rollback path:**

## Step-by-step

### 1. Pull the defective release from "Latest"

```bash
gh release edit v1.3.2 --repo AtomEons/orangebox-os --latest=false --prerelease
gh release edit v1.3.1 --repo AtomEons/orangebox-os --latest=true
```

This demotes v1.3.2 to a non-latest, hidden-by-default release. v1.3.1 becomes the visible Latest. New buyers will get v1.3.1.

### 2. Update the release page with a defect notice

```bash
gh release edit v1.3.2 --repo AtomEons/orangebox-os \
  --notes "⚠ DEFECT NOTICE: v1.3.2 has a critical issue: [DESCRIBE THE DEFECT]. New buyers should use v1.3.1 instead. v1.3.2 buyers — see DOWNGRADE-INSTRUCTIONS below."
```

### 3. Notify affected buyers via email

Send a transactional email to all v1.3.2 buyers (pull list from Stripe / Lemon Squeezy by purchase date):

```
Subject: ORANGEBOX v1.3.2 critical issue — action required

Hi <name>,

We discovered a critical issue in ORANGEBOX v1.3.2 that you may have already
hit, or may hit soon: [describe issue].

We've reverted the public ship to v1.3.1, which doesn't have this issue.

To downgrade your install:
1. Open Windows Settings → Apps → Installed apps.
2. Find ORANGEBOX Command. Click → Uninstall. Confirm.
3. Download v1.3.1 from: [URL of v1.3.1 release]
4. Run that installer. Same UAC + SmartScreen flow as before.
5. Your data in %APPDATA%\com.atomeons.orangebox.command\ is preserved.

If you'd prefer a refund instead: reply to this email with subject
"ORANGEBOX refund request" and we'll process it within 5 business days.

I'm sorry for the disruption. We're working on v1.3.3 to address this
properly.

— Atom McCree, AtomEons Systems Laboratory
   a.mccree@gmail.com
```

### 4. Create a fix branch + ship v1.3.3 with a higher version

Per the MSI constraint, the FIX must be v1.3.3 (higher than v1.3.2), not a v1.3.2.1 patch.

Once v1.3.3 ships:
- Make v1.3.3 the Latest.
- Move v1.3.2 to "deprecated, do not use" with notice.
- v1.3.3 will install over v1.3.2 fine (higher version).

### 5. Document the post-mortem

Write to `docs/post-mortems/v1.3.2.md`:
- What broke.
- How it was detected.
- How many buyers were affected.
- The fix.
- What changed in the process to prevent this class of defect.

This is internal but should be ready to share with concerned buyers.

---

## Pre-emptive: how to make rollback unnecessary

Before pushing a release as Latest:

1. **Run the full install-launch on a clean Windows 10/11 VM** (not your dev machine).
2. **Verify SHA-256 of the artifacts** against the receipts/LEDGER.md.
3. **Test the first-run flow with NO Node.js installed** (catch the no-prereqs case).
4. **Test the first-run flow WITH Node.js installed** (catch the happy path).
5. **Submit a test purchase** through the payment flow to confirm the full chain works.
6. **Wait 24 hours** before marking Latest if you can — let the release sit as Latest=false while you watch for any reports.

The cold-VM install test is the single most important step. **It's the one test that catches what a real buyer hits.**

---

## Rollback contact

If the operator is unreachable and a rollback is needed urgently:
- Anyone with `repo` scope on `AtomEons/orangebox-os` can demote the release.
- The owner of the GitHub account (Atom) is the only person who can do this in v1.

This is a single-person dependency. At scale, this becomes a P1 to delegate.
