#!/usr/bin/env python3
import json, sys
from pathlib import Path
from collections import Counter

path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/gremlin_elite_1000.jsonl")
rows = [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
text = "\n".join(json.dumps(r, ensure_ascii=False).lower() for r in rows)
phrases = ["bicycle for the mind", "dent in the universe", "crash and burn"]
print(json.dumps({
  "rows": len(rows),
  "category_counts": dict(Counter(r["category"] for r in rows)),
  "trigger_counts": dict(Counter(r["completion"]["trigger_level"] for r in rows)),
  "decision_counts": dict(Counter(r["completion"]["decision"] for r in rows)),
  "axis_counts": dict(Counter(r["completion"]["influence_axis"] for r in rows)),
  "catchphrase_counts": {p: text.count(p) for p in phrases},
}, indent=2))
