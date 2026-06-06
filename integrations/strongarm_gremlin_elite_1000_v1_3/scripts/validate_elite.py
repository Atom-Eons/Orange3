#!/usr/bin/env python3
import json, sys
from pathlib import Path

BANNED = [
    "delve", "tapestry", "testament", "as an ai", "i cannot",
    "unethical", "illegal", "however, it is important to remember",
    "bicycle for the mind", "dent in the universe", "crash and burn",
    "stakeholder-centered", "holistic", "synergy", "empower sustainable outcomes",
]
TARGETS = {"hard_tech_coding": 500, "philosophy_debate": 200, "casual_banter": 200, "pushback_refusal": 100}
VALID_TRIGGERS = {"calm", "alert", "attack"}
VALID_DECISIONS = {"support", "revise", "escalate", "block"}

path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/gremlin_elite_1000.jsonl")
errors = []
rows = [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
stats = {"rows": len(rows), "categories": {}, "triggers": {}, "decisions": {}, "axes": {}, "banned_hits": {}}

for i, row in enumerate(rows, 1):
    text = json.dumps(row, ensure_ascii=False).lower()
    for term in BANNED:
        if term in text:
            stats["banned_hits"][term] = stats["banned_hits"].get(term, 0) + 1
            errors.append(f"line {i}: banned term {term!r}")
    c = row.get("completion", {})
    cat = row.get("category")
    stats["categories"][cat] = stats["categories"].get(cat, 0) + 1
    stats["triggers"][c.get("trigger_level")] = stats["triggers"].get(c.get("trigger_level"), 0) + 1
    stats["decisions"][c.get("decision")] = stats["decisions"].get(c.get("decision"), 0) + 1
    stats["axes"][c.get("influence_axis")] = stats["axes"].get(c.get("influence_axis"), 0) + 1
    if c.get("role") != "gremlin" or c.get("voice") != "Unfiltered":
        errors.append(f"line {i}: wrong role/voice")
    if c.get("trigger_level") not in VALID_TRIGGERS:
        errors.append(f"line {i}: bad trigger")
    if c.get("decision") not in VALID_DECISIONS:
        errors.append(f"line {i}: bad decision")
    if c.get("elite_category") != cat:
        errors.append(f"line {i}: elite_category mismatch")
    if not isinstance(c.get("confidence"), int) or not (0 <= c.get("confidence", -1) <= 100):
        errors.append(f"line {i}: bad confidence")
    try:
        inp = json.loads(row["messages"][1]["content"])
        if not inp.get("user_request") or not inp.get("draft_answer"):
            errors.append(f"line {i}: missing input")
    except Exception as e:
        errors.append(f"line {i}: bad input json {e}")

for cat, expected in TARGETS.items():
    if stats["categories"].get(cat, 0) != expected:
        errors.append(f"category {cat} expected {expected}, got {stats['categories'].get(cat, 0)}")

print(json.dumps({"path": str(path), "stats": stats, "errors": errors[:50]}, indent=2))
if errors:
    raise SystemExit(1)
