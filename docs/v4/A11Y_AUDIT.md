# ORANGEBOX v4 — Accessibility Audit

**Target:** WCAG 2.1 Level AA by v5.1
**Audited against:** v5.0.1 lane surface
**Last updated:** 2026-05-16
**Tool owner:** `builder` (implementation) / `security-reviewer` (gate authority on A11Y regressions)

---

## What is accessible in v5.0.1

These items are verified present in the shipped surface.

### Skip navigation
The `a11y.js` helper (`setupSkipLink`) injects a visually-hidden "Skip to main content" anchor at the top of `<body>`. It becomes visible on keyboard focus (orange border, dark background) and routes Tab focus to `<main>` on activation. Any lane that imports `a11y.js` and calls `setupSkipLink({ target: 'main' })` gains this behaviour for free.

### ARIA live regions
- The cockpit's `<div class="toast-layer" aria-live="polite">` announces all toasts.
- The voice lane's `<span id="mic-label" aria-live="polite">` announces recording state changes to screen readers.
- The permission warning in the voice lane uses `role="alert" aria-live="assertive"` for blocking errors.
- `setLiveRegion(message, kind)` in `a11y.js` provides a programmatic announcement path for any lane, creating a visually-hidden `role="status"` or `role="alert"` node once and reusing it.

### Keyboard shortcut visibility
Lane nav buttons in `index.html` carry `title` attributes that expose keyboard shortcuts (e.g., `title="Cockpit (Ctrl+1)"`). The `registerShortcut` function in `a11y.js` logs all registered shortcuts to a registry queryable via `listShortcuts()`, enabling a future Help dialog to enumerate them.

### Reduced-motion respect
`tokens.css` already zeros `--ob-dur-1`, `--ob-dur-2`, `--ob-dur-3` under `@media (prefers-reduced-motion: reduce)`. The `setReducedMotion(enabled)` export in `a11y.js` sets `data-reduced-motion` on `<html>` for operator-explicit override. CSS targeting `[data-reduced-motion]` will respect this in v5.0.2+.

### Mic button state
The voice lane mic button carries `aria-pressed="false"` in markup and `aria-label="Start voice recording"`. The button state must be toggled by `voice.js` at runtime; the HTML foundation is correct.

### Waveform labelling
The waveform canvas wrapper carries `role="img" aria-label="Audio waveform visualization"` and the canvas itself carries `aria-hidden="true"`, which is the correct pattern for decorative canvas.

### Concept SVG (Vault)
The concept cloud SVG in vault.html carries `aria-label="Concept tag cloud" role="img"` — readable as a named image by AT.

### Form labels
Settings inputs (radio buttons for cockpit pin) are wrapped in `<label>` elements. API key rows expose provider names as visible text adjacent to the state chip.

---

## Known gaps — retrofit punchlist for v5.0.2

These are the items the `builder` and `test-engineer` must address in the v5.0.2 lane-retrofit pass. Each item has a severity (A = blocks WCAG AA, B = notable gap, C = polish).

### [A] Missing landmark roles on lane HTML files

**Affected:** `ide.html`, `terminal.html`, `trilane.html`, `marketplace.html`, `settings.html`, `receipts.html`, `vault.html`, `x-feed.html`

Lane pages load inside `<iframe>` elements. Each iframe document needs its own landmark structure. The outer cockpit (`index.html`) has `<header>`, `<nav aria-label="Lane navigation">`, `<main>`, and `<aside aria-label="Now panel">`. But most lane iframes use `<div class="*-shell">` as the root with no semantic landmarks.

**Fix:** Add `role="banner"` to lane headers, `role="main"` to primary content containers, and `role="complementary"` to side panels. For lanes that already use `<header>`, `<main>`, `<aside>`, verify they are direct descendants of the body — iframes with nested landmarks inside divs still lack the top-level landmark.

### [A] Empty states lack aria-live announcements

**Affected:** Receipts list (`#list-empty`), Party-line rail (`#partyLineBody`), Vault empty state (`#vault-empty`), IDE empty states.

When these regions transition from empty to populated (or vice versa), screen readers receive no announcement. The state change is purely visual.

**Fix:** Apply `aria-live="polite"` to the empty-state container, or call `setLiveRegion(message)` from the JS that toggles empty/filled states.

### [A] Trilane needs `aria-busy` during streaming

**Affected:** `trilane.html` — the `lane-body` divs (`#claudeBody`, `#gptBody`, `#geminiBody`).

When a model is actively streaming a response, the container has no `aria-busy="true"` attribute. Screen readers cannot signal "content is loading." After the stream completes there is no announcement that the answer is ready.

**Fix:** `trilane.js` should toggle `aria-busy="true"` on the container at stream start and `aria-busy="false"` at stream end, then call `setLiveRegion('Claude response ready.')` (or equivalent).

### [A] Voice mic button missing `aria-pressed` toggle at runtime

**Affected:** `voice.html` mic button (`#mic-btn`).

The HTML has `aria-pressed="false"` as a static attribute. `voice.js` must update it on each toggle: `btn.setAttribute('aria-pressed', String(isRecording))`. Without this, the pressed/unpressed state is invisible to AT.

**Fix:** One-line change in `voice.js` inside the toggle handler.

### [B] Receipts virtualized list missing `aria-rowindex`

**Affected:** `receipts.html` — the virtual scroll rows rendered into `#list-rows`.

The virtualized list renders only the visible rows into the DOM. Without `aria-rowindex` on each row and `aria-rowcount` on the container, screen readers cannot announce "row 47 of 200" — the context is lost.

**Fix:** Set `role="grid"` on `#list-viewport`, `aria-rowcount` to total receipts, and `aria-rowindex` on each dynamically-rendered row.

### [B] Color-only status indicators (LED dots)

**Affected:** Status chips in `index.html` (`#statusVault`, `#statusRouter`, etc.), trilane model dots, x-feed Hermes status pill.

LED dots communicate status (green = ok, red = error, yellow = warning) through color alone. Operators with color-vision deficiency cannot distinguish states.

**Fix:** Add a visually-hidden text label adjacent to each LED (e.g., `<span class="sr-only">connected</span>`). The `sr-only` class — `position:absolute; width:1px; height:1px; overflow:hidden` — is standard. Alternatively, use `title` attribute on the `<i class="led">` element as a minimum.

### [B] Marketplace / Settings CTA buttons lack descriptive accessible names

**Affected:** `marketplace.html` buttons ("Copy", "Copy snippet", "Add to this cockpit"), settings `<a>` links.

"Copy" is ambiguous when there are two copy buttons. AT reads "Copy, button" twice with no context.

**Fix:** Use `aria-label` to distinguish: `aria-label="Copy MCP URL"` and `aria-label="Copy MCP config snippet"`.

### [C] IDE tab panel pattern is not fully ARIA-correct

**Affected:** `ide.html` AI side panel.

The `.ai-tabs` / `.ai-pane` structure acts like a tab panel but does not use `role="tablist"`, `role="tab"`, and `role="tabpanel"`. Without these, AT does not announce the tab identity or indicate how many tabs exist.

**Fix:** Apply the full ARIA tab pattern:
- `<div role="tablist">` on `.ai-tabs`
- `role="tab" aria-controls="pane-id" aria-selected="true/false"` on each button
- `role="tabpanel" id="pane-id" aria-labelledby="tab-id"` on each `.ai-pane`

### [C] Focus ring not always visible

`tokens.css` sets no explicit `:focus-visible` styles beyond browser defaults. Some lanes override the browser's default ring. Premium dark surfaces can swallow the ring.

**Fix:** Add to `tokens.css`:
```css
:focus-visible {
  outline: 2px solid var(--ob-orange);
  outline-offset: 2px;
}
```

---

## Test plan

### Screen reader targets

| Reader | Platform | Status |
|---|---|---|
| NVDA + Chrome | Windows 11 | Target for v5.1 QA |
| NVDA + Firefox | Windows 11 | Secondary |
| VoiceOver + Safari | macOS | When Mac build ships |
| TalkBack + Chrome | Android (mobile companion) | Deferred to mobile release |

### Keyboard-only navigation checklist

Run these manually on each lane before v5.1 ship gate:

1. Tab from address bar through all interactive elements — no focus trap leaks, no invisible focus.
2. Every button and link is reachable without a mouse.
3. Modals and overlays trap focus correctly; Escape dismisses and restores prior focus.
4. Trilane: Tab through all three model panels, vote buttons, and the launch button.
5. Receipts: Tab through the filter nav, search box, date inputs, and receipt rows.
6. Voice: Space to start/stop recording; all action-strip buttons reachable.
7. IDE: Tab into the AI side panel, switch tabs with arrow keys (once ARIA tab pattern is retrofitted).
8. Settings: All radio buttons navigable with arrow keys; all links reachable.

### Automated scan (CI)

Add `axe-core` as a devDependency. Run `axe` on each lane HTML at the Node level (using jsdom or Playwright) as part of the CI gate. Zero violations at WCAG AA level must pass before any lane ships to release.

---

## WCAG 2.1 AA compliance target

| Criterion | Status |
|---|---|
| 1.1.1 Non-text content | Partial — SVGs labelled; canvas hidden; color-only LEDs need fix |
| 1.3.1 Info and relationships | Partial — landmark gap in lane iframes |
| 1.4.1 Use of color | Gap — LED dots color-only |
| 1.4.3 Contrast (text) | Passes on primary text; muted text needs audit |
| 2.1.1 Keyboard | Partial — main nav keyboard-accessible; tab pattern incomplete |
| 2.1.2 No keyboard trap | Passes — trapFocus releases on Escape |
| 2.4.1 Bypass blocks | Passes — skip link wired |
| 2.4.3 Focus order | Partial — lane iframes not yet structured |
| 4.1.2 Name, role, value | Partial — aria-pressed missing at runtime; tabs not ARIA-complete |
| 4.1.3 Status messages | Partial — live regions present in some lanes; incomplete in others |

Full AA target: v5.1.
