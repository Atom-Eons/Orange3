#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 council_v2.py init
python3 council_v2.py server
