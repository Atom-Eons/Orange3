#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 council_v2.py init
python3 council_v2.py run "Design STRONGARM v2 for GTi15 with low token burn" --mode normal --heuristic
