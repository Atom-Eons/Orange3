# Smoke 60 — OrangeBox v6.1.0

**Date:** 2026-05-18T03:35:28.626Z
**Results:** 60 pass · 0 fail · 0 skip / 60

| # | Check | Status | Detail |
|---|---|---|---|
| | 01 GET receipts/list reachable | PASS | status=200 |
| | 02 GET receipts/list items | PASS | items=10 |
| | 03 POST receipts/emit | PASS | status=201 |
| | 04 POST receipts/export | PASS | count=10 |
| | 05 GET privacy/summary | PASS | status=200 |
| | 06 GET settings/api-keys | PASS | density=comfortable zoom=1 |
| | 07 GET freeze/status | PASS | status=200 |
| | 08 GET vault/summary | PASS | status=200 |
| | 09 POST vault/search | PASS | status=200 |
| | 10 GET cost/today | PASS | status=200 |
| | 11 GET skills/list | PASS | status=200 |
| | 12 GET hermes/feed | PASS | status=200 |
| | 13 GET ae-alpha-news/anchors | PASS | anchors=1 |
| | 14 POST ae-alpha-news/anchors | PASS | status=200 |
| | 15 GET ae-alpha-news/feed | PASS | status=200 |
| | 16 POST ae-alpha-news/score | PASS | score=43 |
| | 17 POST ae-alpha-news/clear-cache | PASS | status=200 |
| | 18 GET voice/whisper-status | PASS | present=false |
| | 19 GET trilane/votes | PASS | items=5 |
| | 20 POST trilane/vote | PASS | id=6a3fd114-8095-4758-b998-acd5d14628c8 |
| | 21 GET deps/status | PASS | status=200 |
| | 22 POST composer/scaffold (400 on empty) | PASS | status=400 (polish fix) |
| | 23 POST voice/intent | PASS | status=502 |
| | 24 GET longmemeval/status | PASS | status=404 |
| | 25 POST sprint/run | PASS | status=200 |
| | 26 GET incident/list | PASS | status=404 |
| | 27 GET codexa/status | PASS | status=404 |
| | 28 POST freeze/set (no-op) | PASS | status=200 |
| | 29 GET mistakes/list | PASS | status=404 |
| | 30 GET telemetry/status | PASS | status=200 |
| | 31 Receipts dir exists | PASS | ok |
| | 32 AE Alpha anchors file exists | PASS | ok |
| | 33 Trilane votes dir exists | PASS | ok |
| | 34 Exports dir exists | PASS | ok |
| | 35 Receipts emit cycle | PASS | cycle ok |
| | 36 Receipt schema | PASS | ok |
| | 37 Source filter | PASS | 10 smoke |
| | 38 AE Alpha scoring deterministic | PASS | 43=43 |
| | 39 AE Alpha no-link boundary | PASS | score=0 |
| | 40 Voice intent empty rejection | PASS | status=400 |
| | 41 Trilane vote missing-winner rejection | PASS | status=400 |
| | 42 Receipts export empty bundle | PASS | count=0 |
| | 43 Composer scaffold empty rejection (400) | PASS | 400: files[] cannot be empty |
| | 44 Freeze guard shape | PASS | active=false |
| | 45 Whisper status shape | PASS | keys=6 |
| | 46 Trilane vote captures full leg | PASS | len=1500 |
| | 47 Receipts export bundle on disk | PASS | 6137b |
| | 48 AE Alpha anchors round-trip | PASS | ["smoke60"] |
| | 49 Cost summary numeric | PASS | total=0 |
| | 50 Unknown route 404 | PASS | 404 |
| | 51 GET agent/list (empty ok) | PASS | items=0 |
| | 52 POST agent/run rejects missing goal | PASS | status=400 |
| | 53 POST agent/run requires API key (502 ok if not set) | PASS | status=502 |
| | 54 GET agent/status/<bad-id> returns 404 | PASS | status=404 |
| | 55 POST agent/cancel/<bad-id> returns no-such-job | PASS | no such job |
| | 56 POST repo/index builds workspace index | PASS | files=303 took=6665ms |
| | 57 GET repo/summary returns built index | PASS | symbols=1533 |
| | 58 GET repo/symbol-prefix returns hits | PASS | hits=20 |
| | 59 POST ide/complete empty prefix returns empty | PASS | reason=empty prefix |
| | 60 GET ide/complete/cache-stats shape | PASS | entries=0, max=200 |