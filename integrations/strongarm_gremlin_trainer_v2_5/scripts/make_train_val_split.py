#!/usr/bin/env python3
import json
import random
import sys
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else "data/gremlin_seed_sft.jsonl")
out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "data/splits")
out_dir.mkdir(parents=True, exist_ok=True)

rows = [json.loads(x) for x in src.read_text(encoding="utf-8").splitlines() if x.strip()]
random.Random(1337).shuffle(rows)

n_val = max(1, int(len(rows) * 0.15))
val = rows[:n_val]
train = rows[n_val:]

(out_dir / "train.jsonl").write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in train) + "\n", encoding="utf-8")
(out_dir / "val.jsonl").write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in val) + "\n", encoding="utf-8")

print(json.dumps({"train": len(train), "val": len(val), "out_dir": str(out_dir)}, indent=2))
