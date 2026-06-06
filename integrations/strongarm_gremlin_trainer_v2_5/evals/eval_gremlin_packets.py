#!/usr/bin/env python3
"""
Offline evaluator stub.

This script validates expected eval case format.
Hook it to your local model runner after training.
"""

import json
from pathlib import Path

cases = json.loads(Path("evals/gremlin_eval_cases.json").read_text(encoding="utf-8"))
print(json.dumps({
    "cases": len(cases),
    "names": [c["name"] for c in cases],
    "note": "Connect this to Ollama/llama.cpp after exporting the Gremlin model."
}, indent=2))
