#!/usr/bin/env python3
import json
from pathlib import Path

path = Path("config/misfits_set.json")
data = json.loads(path.read_text(encoding="utf-8"))

print(f"# {data['name']} v{data['version']}")
print(data["authority_rule"])

for lane, body in data["runtime_lanes"].items():
    print(f"\n## {lane}")
    print(body["purpose"])
    for i, m in enumerate(body["models"], 1):
        print(f"{i}. {m['id']} [{m.get('size','?')}] — {m.get('type','')}")
        if "ollama" in m:
            print(f"   run: {m['ollama']}")
