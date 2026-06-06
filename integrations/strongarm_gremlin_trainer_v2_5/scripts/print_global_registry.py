#!/usr/bin/env python3
import json
from pathlib import Path

registry = json.loads(Path("config/global_model_registry.json").read_text(encoding="utf-8"))
for lane, models in registry["lanes"].items():
    print(f"\n## {lane}")
    for m in models:
        print(f"- {m['name']}: {m.get('role', '')}")
