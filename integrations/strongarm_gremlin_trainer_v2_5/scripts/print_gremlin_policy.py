#!/usr/bin/env python3
import json
from pathlib import Path

policy = json.loads(Path("config/gremlins_always_on_policy.json").read_text(encoding="utf-8"))

print(f"# {policy['name']} v{policy['version']}")
print(policy["principle"])
print()
print(policy["authority_rule"])

print("\n## Trigger levels")
for level, body in policy["trigger_levels"].items():
    print(f"\n### {level}")
    print(body["meaning"])
    for b in body["behavior"]:
        print(f"- {b}")

print("\n## Attack triggers")
for t in policy["triggers"]:
    print(f"- {t}")

print("\n## Allowed models")
for mode, models in policy["allowed_models"].items():
    print(f"\n### {mode}")
    for m in models:
        print(f"- {m}")
