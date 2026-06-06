#!/usr/bin/env python3
import json
import sys
from pathlib import Path

REQUIRED = [
    "role", "voice", "decision", "trigger_level", "uncensored_view",
    "best_moves", "objections", "missing_info", "handoff", "confidence"
]
VALID_DECISIONS = {"support", "revise", "escalate", "block"}
VALID_TRIGGERS = {"calm", "alert", "attack"}

def validate_completion(c, line_no):
    errors = []
    for k in REQUIRED:
        if k not in c:
            errors.append(f"line {line_no}: missing {k}")
    if c.get("role") != "gremlin":
        errors.append(f"line {line_no}: role must be gremlin")
    if c.get("voice") != "Unfiltered":
        errors.append(f"line {line_no}: voice must be Unfiltered")
    if c.get("decision") not in VALID_DECISIONS:
        errors.append(f"line {line_no}: bad decision")
    if c.get("trigger_level") not in VALID_TRIGGERS:
        errors.append(f"line {line_no}: bad trigger_level")
    if not isinstance(c.get("confidence"), int) or not (0 <= c["confidence"] <= 100):
        errors.append(f"line {line_no}: confidence must be 0-100 int")
    for k in ["best_moves", "objections", "missing_info"]:
        if not isinstance(c.get(k), list):
            errors.append(f"line {line_no}: {k} must be list")
    return errors

def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/gremlin_seed_sft.jsonl")
    errors = []
    count = 0
    triggers = {"calm": 0, "alert": 0, "attack": 0}
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            if not line.strip():
                continue
            count += 1
            obj = json.loads(line)
            if "messages" not in obj or "completion" not in obj:
                errors.append(f"line {line_no}: row needs messages and completion")
                continue
            errors.extend(validate_completion(obj["completion"], line_no))
            tr = obj["completion"].get("trigger_level")
            if tr in triggers:
                triggers[tr] += 1
    print(json.dumps({"path": str(path), "rows": count, "triggers": triggers, "errors": errors[:25]}, indent=2))
    if errors:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
