#!/usr/bin/env python3
"""
Minimal client for any Python agent.

Usage:
  from call_strongarm import strongarm_audit
"""

import json
import urllib.request


def strongarm_audit(
    user_request: str,
    draft_answer: str,
    available_tools=None,
    hard_constraints=None,
    project_context="",
    endpoint="http://127.0.0.1:8094/rewrite_prompt",
):
    payload = {
        "user_request": user_request,
        "draft_answer": draft_answer,
        "available_tools": available_tools or [],
        "hard_constraints": hard_constraints or [],
        "project_context": project_context,
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))
