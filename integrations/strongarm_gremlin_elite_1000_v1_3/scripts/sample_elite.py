#!/usr/bin/env python3
import json, random, sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/gremlin_elite_1000.jsonl")
n = int(sys.argv[2] if len(sys.argv) > 2 else "8")
category = sys.argv[3] if len(sys.argv) > 3 else None
rows = [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
if category:
    rows = [r for r in rows if r["category"] == category]
random.seed(5528)
for row in random.sample(rows, min(n, len(rows))):
    inp = json.loads(row["messages"][1]["content"])
    c = row["completion"]
    print("="*88)
    print(row["id"], row["category"], c["trigger_level"], c["decision"], c["influence_axis"])
    print("USER:", inp["user_request"])
    print("DRAFT:", inp["draft_answer"])
    print("GREMLIN:", json.dumps(c, indent=2, ensure_ascii=False))
