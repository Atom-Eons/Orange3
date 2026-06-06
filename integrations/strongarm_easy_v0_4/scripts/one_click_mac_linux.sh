#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "STRONGARM one-click start"
python3 strongarm.py doctor
python3 strongarm.py pull
python3 strongarm.py server
