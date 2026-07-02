# Security policy · Orange³

Orange³ is a sovereign agentic operating system. It runs local, holds persistent memory, executes tool calls, and mediates access to your machine. Security is not optional here — a compromised Orange³ is a compromised laptop.

If you find a vulnerability, report it privately first.

## How to report

**Preferred:** [GitHub Security Advisories](https://github.com/Atom-Eons/Orange3/security/advisories/new) — private, structured, tracked.

**Alternate:** email `a.mccree@gmail.com` with the subject line `[orange3-security]` and enough detail to reproduce.

If you need PGP, request the key in your initial mail and I'll respond with a signed one.

## What to include

- Affected version (Orange³ release tag or commit SHA)
- Attack surface (which entry point — MCP, adapter, cockpit, gauntlet, receipt file, etc.)
- Reproduction steps or POC
- Expected impact (data exfiltration, RCE, sandbox escape, receipt-tampering, memory corruption, denial of service, etc.)
- Any mitigation you've already worked out

## What NOT to do

- **Don't** file a public issue for a working exploit.
- **Don't** post to Discussions.
- **Don't** test against production infrastructure that isn't yours.
- **Don't** attempt to exploit the operator's own machine or other users' machines.

## Response commitment

Solo lab · one operator. That means:

- **Acknowledgment:** within 72 hours (usually same day).
- **Triage:** within 7 days.
- **Fix:** as fast as the severity warrants. Critical → same week. High → 30 days. Medium/Low → next release.
- **Public disclosure:** coordinated. Advisory published after fix is available and users have a reasonable upgrade window (typically 14-30 days after the patch ships).

If I go dark on a report for >2 weeks with no update, ping me publicly. That's a failure mode I want to hear about.

## Credit

Every valid report gets credit in the release notes and the [`SECURITY_HALL_OF_FAME.md`](SECURITY_HALL_OF_FAME.md) (created on first entry). Anonymous credit available on request.

## Scope

**In scope:**
- Orange³ cockpit and control-plane server
- AECode mission execution and receipt system
- MCP adapters shipped in the default install
- Any signed installer released from `github.com/Atom-Eons/Orange3/releases`

**Out of scope:**
- Third-party MCP servers you install yourself
- The operator's development environment
- Ideas or feature requests (use [Ideas discussions](https://github.com/Atom-Eons/Orange3/discussions/categories/ideas))
- Social engineering, phishing, or physical attacks against the operator

## Bug bounty

No cash bounty today (solo lab, no VC). What you do get: public credit, a signed thank-you letter, and a copy of *I Am AI* if you'd like one. Serious findings may be recognized more substantially as the project matures.

---

**AtomEons Systems Laboratory** · Marco Island · FL · 2026 · §4A no-SaaS · free always
