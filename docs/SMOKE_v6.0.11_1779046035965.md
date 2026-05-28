# Smoke 50 — OrangeBox v6.0.11

**Date:** 2026-05-17T19:27:15.964Z
**Results:** 49 pass · 1 fail · 0 skip / 50

| # | Check | Status | Detail |
|---|---|---|---|
| | 01 GET /api/v4/receipts/list reachable | PASS | status=200 |
| | 02 GET /api/v4/receipts/list | PASS | items=10 |
| | 03 POST /api/v4/receipts/emit | PASS | status=201 |
| | 04 POST /api/v4/receipts/export (v6.0.11) | PASS | count=10, file=C:\Users\a\AppData\Roaming\com.atomeons.orangebox.command\exports\receipts-1779046034659.md |
| | 05 GET /api/v4/privacy/summary | PASS | status=200 |
| | 06 GET /api/v4/settings/api-keys | PASS | status=200 |
| | 07 GET /api/v4/freeze/status | PASS | status=200 |
| | 08 GET /api/v4/vault/summary | PASS | status=200 |
| | 09 POST /api/v4/vault/search | PASS | status=200 |
| | 10 GET /api/v4/cost/today | PASS | status=200 |
| | 11 GET /api/v4/skills/list | PASS | status=200 |
| | 12 GET /api/v4/hermes/feed | PASS | status=200 |
| | 13 GET /api/v4/ae-alpha-news/anchors (v6.0.10) | PASS | anchors=1 |
| | 14 POST /api/v4/ae-alpha-news/anchors (v6.0.10) | PASS | status=200 |
| | 15 GET /api/v4/ae-alpha-news/feed (v6.0.10) | PASS | status=200 |
| | 16 POST /api/v4/ae-alpha-news/score (v6.0.10) | PASS | score=55, links=1 |
| | 17 POST /api/v4/ae-alpha-news/clear-cache (v6.0.10) | PASS | status=200 |
| | 18 GET /api/v4/voice/whisper-status (v6.0.11) | PASS | present=false, ready=false |
| | 19 GET /api/v4/trilane/votes (v6.0.11) | PASS | items=2 |
| | 20 POST /api/v4/trilane/vote (v6.0.11) | PASS | id=93a3cd04-7bf2-42fe-b854-9a1f677b35e0 |
| | 21 GET /api/v4/deps/status | PASS | status=200 |
| | 22 POST /api/v4/composer/scaffold (empty files) | PASS | status=500 |
| | 23 POST /api/v4/voice/intent (may 502 without API key) | PASS | status=502 |
| | 24 GET /api/v4/longmemeval/status | PASS | status=404 |
| | 25 POST /api/v4/sprint/run | PASS | status=200 |
| | 26 GET /api/v4/incident/list | PASS | status=404 |
| | 27 GET /api/v4/codexa/status | PASS | status=404 |
| | 28 POST /api/v4/freeze/set (no-op) | PASS | status=200 |
| | 29 GET /api/v4/mistakes/list | PASS | status=404 |
| | 30 GET /api/v4/telemetry/status | PASS | status=200 |
| | 31 Receipts directory exists | PASS | C:\Users\a\AppData\Roaming\com.atomeons.orangebox.command\receipts |
| | 32 AE Alpha anchors file exists | FAIL | ENOENT: no such file or directory, stat 'C:\Users\a\.orangebox\ae-alpha-news.json' |
| | 33 Trilane votes directory writable | PASS | C:\Users\a\AppData\Roaming\com.atomeons.orangebox.command\trilane-votes |
| | 34 Receipts exports directory exists | PASS | C:\Users\a\AppData\Roaming\com.atomeons.orangebox.command\exports |
| | 35 Receipts emit cycle (POST then GET) | PASS | emitted 8c147790-5541-46ce-a291-a949131d4809, list contains: true |
| | 36 Receipt schema (source, ts, id, title) | PASS | id=true source=true ts=true title=true |
| | 37 Sources filter works | PASS | 5 items, all smoke=true |
| | 38 AE Alpha scoring deterministic | PASS | score1=43 score2=43 |
| | 39 AE Alpha score boundary (zero on no-link) | PASS | score=0 |
| | 40 Voice intent normalization | PASS | status=400 (empty rejected) |
| | 41 Trilane vote rejects missing winner | PASS | status=400 |
| | 42 Receipts export negative-source returns empty bundle | PASS | count=0 |
| | 43 Composer scaffold rejects empty files | PASS | status=400 |
| | 44 Freeze guard active when set | PASS | active=false |
| | 45 Whisper status shape | PASS | keys=present,path,cloud_fallback,model_dir,ready,install_hint |
| | 46 Trilane vote captures full leg text | PASS | excerpt_len=1500 |
| | 47 Receipts export markdown bundle exists on disk | PASS | 6137b at C:\Users\a\AppData\Roaming\com.atomeons.orangebox.command\exports\receipts-1779046035937.md |
| | 48 AE Alpha anchors round-trip (handle normalized) | PASS | anchors=["smoke48"] |
| | 49 Cost summary numeric | PASS | total_cents=0 |
| | 50 Server unknown route returns 404 | PASS | status=404 |
