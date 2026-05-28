# ORANGEBOX v4 — i18n Operator Guide

Adding a language to ORANGEBOX takes fewer than 30 minutes if the translation is ready. The framework is zero-dependency, file-based, and does not require a rebuild.

---

## How the framework works

`/v4/shared/i18n.js` is a tiny ESM module that:

1. Detects the operator's preferred locale from `localStorage` key `orangebox-locale`, then `navigator.language`, then falls back to `"en"`.
2. Fetches `/v4/shared/i18n/<lang>.json` (e.g., `/v4/shared/i18n/ja.json`) and caches it in memory.
3. Exposes a `t(key, vars)` function that resolves dot-notation keys against the active locale, falls back to English, and falls back to the key itself if neither locale has it.
4. After strings load, applies translations to DOM elements carrying `data-i18n` and `data-i18n-attr` attributes.

The English string table lives at `/v4/shared/i18n/en.json`. It is the source of truth. Every other locale file is a translated copy.

---

## Step 1 — Copy en.json to your language file

```
cp src/v4/shared/i18n/en.json src/v4/shared/i18n/<lang>.json
```

The IETF language tag becomes the filename:

| Language | File |
|---|---|
| Japanese | `ja.json` |
| Spanish | `es.json` |
| German | `de.json` |
| French | `fr.json` |
| Brazilian Portuguese | `pt-BR.json` |
| Simplified Chinese | `zh-CN.json` |

File names must be lowercase except for region suffixes (`pt-BR`, `zh-CN`). The i18n module looks up `navigator.language` verbatim first, then the two-char prefix, so `pt-BR.json` is found for both `"pt-BR"` and `"pt"` browsers.

---

## Step 2 — Translate the values

Open `<lang>.json` in your editor. Translate every **value**. Leave every **key** exactly as it is in English.

### What to translate

Every string value in the JSON file is translatable. Examples:

```json
"nav": {
  "cockpit": "コックピット",
  "ide": "IDE",
  "terminal": "ターミナル"
}
```

### What NOT to change

- **Keys** — `"nav"`, `"cockpit"`, `"ide"` must stay verbatim in English. The codebase calls `t("nav.cockpit")` and only the value changes.
- **Variable placeholders** — `{{name}}`, `{{n}}`, `{{cost}}`, `{{model}}`, `{{line}}`, `{{col}}`. These are substituted at runtime. Preserve them exactly, including the double braces and the name inside.
- **JSON structure** — do not add or remove keys relative to `en.json`. Missing keys fall back to English automatically, but mismatched structure can break parsing.

### Variable placeholder example

English:
```json
"toast": {
  "copied": "{{name}} copied."
}
```

Japanese translation (preserve `{{name}}`):
```json
"toast": {
  "copied": "{{name}}をコピーしました。"
}
```

At runtime: `t("toast.copied", { name: "MCP URL" })` → `"MCP URL をコピーしました。"`

### Notes on direction and punctuation

- For right-to-left languages (Arabic, Hebrew) — the string table can be added today. RTL CSS layout is a v5.1 item and will use `dir="rtl"` on `<html>`.
- Japanese and Chinese typically omit sentence-ending periods in UI strings — adapt to locale convention, not English punctuation rules.
- German compounds nouns can make strings long. Leave whitespace-handling to CSS (`white-space: nowrap` or `overflow: hidden`) — do not shorten meaning to fit.

---

## Step 3 — Register in Settings (or override via localStorage)

### Operator-side switch (instant, no restart)

Open the browser console in any ORANGEBOX lane and run:

```js
import('/v4/shared/i18n.js').then(m => m.setLocale('ja'));
```

Or write directly to localStorage and reload:

```js
localStorage.setItem('orangebox-locale', 'ja');
location.reload();
```

### Settings lane (v5.0.2+)

The Settings lane will gain a Language selector. When the operator picks a language from the dropdown, the cockpit calls `setLocale(lang)`, which writes `orangebox-locale` to localStorage and re-applies all `data-i18n` bindings without a page reload.

Until the dropdown ships, use the localStorage method above.

---

## Step 4 — Submit to the ORANGEBOX repo

If you want your translation bundled with future ORANGEBOX releases rather than living only in your local installation:

1. Fork the ORANGEBOX repository.
2. Add your `<lang>.json` to `src/v4/shared/i18n/`.
3. Verify JSON is valid: `python -c "import json; json.load(open('src/v4/shared/i18n/<lang>.json'))"` — no errors.
4. Open a pull request titled `i18n: add <Language> translation (<lang>)`.
5. The release steward will spot-check variable placeholders and JSON structure before merging.

Community translations are welcome. Native speakers who also use ORANGEBOX as their daily driver make the best reviewers.

---

## Anticipated launch languages

| Code | Language | Status |
|---|---|---|
| `en` | English | Shipped (v5.0.1) |
| `ja` | Japanese | Community contribution welcome |
| `es` | Spanish | Community contribution welcome |
| `de` | German | Community contribution welcome |
| `fr` | French | Community contribution welcome |
| `pt-BR` | Brazilian Portuguese | Community contribution welcome |
| `zh-CN` | Simplified Chinese | Community contribution welcome |

The i18n framework has no hardcoded list of supported languages. Any JSON file placed in `src/v4/shared/i18n/` is automatically discoverable via `getAvailableLocales()`, which probes each known language code for a live JSON response.

---

## Fallback chain

```
operator locale (e.g. "ja")
  → ja.json value
    → en.json value (English fallback)
      → key itself (e.g. "nav.cockpit")
```

This means an incomplete translation is always safe. Missing keys render in English instead of crashing or showing an empty string.

---

## Developer usage (lane JS)

Any lane that wants translated strings imports from the shared module:

```js
import { loadLocale, t } from '/v4/shared/i18n.js';

// At lane init — loadLocale() is idempotent; the first call wins
await loadLocale();

// Render a string
document.getElementById('myTitle').textContent = t('ide.title');

// With variables
showToast(t('toast.copied', { name: 'MCP URL' }));
```

### DOM auto-binding (no JS required)

Add `data-i18n` to any element whose `textContent` should be translated:

```html
<button data-i18n="actions.copy"></button>
<!-- After loadLocale() → textContent = "Copy" (en) or locale equivalent -->
```

For attributes (placeholder, title, aria-label):

```html
<input data-i18n-attr="placeholder:ide.ask.placeholder" />
<button data-i18n-attr="aria-label:voice.mic.start,title:voice.mic.spaceHint"></button>
```

Multiple attribute bindings are comma-separated. The format is `attr:key`.

---

## Validation checklist before submitting a translation

- [ ] File is valid JSON (run `python -c "import json; json.load(open('path/to/file.json'))"`)
- [ ] All keys from `en.json` are present (structure is identical)
- [ ] All `{{placeholder}}` tokens are preserved verbatim
- [ ] No HTML tags are embedded in values (ORANGEBOX sets `textContent`, not `innerHTML`)
- [ ] Strings longer than ~60 chars have been checked against the UI at 1280px width
- [ ] RTL strings noted if applicable (full RTL layout is a v5.1 item)

---

## Troubleshooting

**Strings don't change after I set the locale.**
Check: `localStorage.getItem('orangebox-locale')` in the browser console. If correct, the JSON fetch may have failed — open DevTools Network and look for the `<lang>.json` request. A 404 means the file is not in the right location or the server is not serving `/v4/shared/i18n/` statically.

**Some strings still show in English.**
This is the fallback behavior for keys that exist in `en.json` but not in your translation file. Add the missing keys to your file to fix it.

**`getAvailableLocales()` doesn't include my language.**
The function probes a hardcoded list of known codes. If your code (`ar`, `ko`, etc.) is not in the list, the probe won't find it, but `loadLocale('ar')` will still work if the file exists. File a PR to add your code to the `known` array in `i18n.js`.
