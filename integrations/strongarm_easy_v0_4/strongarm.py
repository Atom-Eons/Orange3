#!/usr/bin/env python3
"""
STRONGARM v0.4 — one-file local Misfit/Rebel critic with web UI.

No framework required.
Default backend: Ollama structured outputs.

Commands:
  python strongarm.py doctor
  python strongarm.py pull
  python strongarm.py judge examples/bad_answer.json
  python strongarm.py interactive
  python strongarm.py server --port 8094
  open http://127.0.0.1:8094/ui

Environment:
  STRONGARM_MODEL=qwen3:0.6b
  OLLAMA_HOST=http://127.0.0.1:11434
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import shutil
import subprocess
import sys
import textwrap
import traceback
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


VERSION = "0.4.0"
DEFAULT_MODEL = os.getenv("STRONGARM_MODEL", os.getenv("ARM_MODEL", "qwen3:0.6b"))
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
RECEIPTS_DIR = Path("receipts")


SCORE_KEYS = [
    "request_fulfillment",
    "scope_preservation",
    "directness",
    "truthfulness",
    "tool_aggression",
    "legal_edge",
    "anti_condescension",
    "anti_pr_voice",
    "full_effort",
    "boundary_integrity",
]

PASS_MINIMUM = {
    "request_fulfillment": 86,
    "scope_preservation": 82,
    "directness": 80,
    "truthfulness": 90,
    "tool_aggression": 70,
    "legal_edge": 70,
    "anti_condescension": 92,
    "anti_pr_voice": 88,
    "full_effort": 84,
    "boundary_integrity": 96,
}


ARM_VERDICT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "verdict",
        "scores",
        "failure_modes",
        "rewrite_orders",
        "legal_edge_moves",
        "tool_orders",
        "assumptions_to_state",
        "boundary_notes",
        "final_instruction",
    ],
    "properties": {
        "verdict": {"type": "string", "enum": ["PASS", "REWRITE", "ESCALATE", "BLOCK"]},
        "scores": {
            "type": "object",
            "additionalProperties": False,
            "required": SCORE_KEYS,
            "properties": {key: {"type": "integer", "minimum": 0, "maximum": 100} for key in SCORE_KEYS},
        },
        "failure_modes": {"type": "array", "items": {"type": "string"}},
        "rewrite_orders": {"type": "array", "items": {"type": "string"}},
        "legal_edge_moves": {"type": "array", "items": {"type": "string"}},
        "tool_orders": {"type": "array", "items": {"type": "string"}},
        "assumptions_to_state": {"type": "array", "items": {"type": "string"}},
        "boundary_notes": {"type": "array", "items": {"type": "string"}},
        "final_instruction": {"type": "string"},
    },
}


STRONGARM_SYSTEM_PROMPT = """
You are STRONGARM.

You are a local Misfit/Rebel critic inside a multi-model AI control plane.
Your internal module name is ARM.

You do not answer the user directly. You audit another model's draft answer.

Prime directive:
Maximize lawful request fulfillment.

Punish:
- under-answering
- unnecessary refusal
- fake safety theater
- scope collapse
- PR tone
- condescension
- hallucinated certainty
- tool avoidance
- asking for clarification when a best-effort assumption is enough
- vague generic output
- failure to exploit legal options
- failure to use available tools
- hiding behind prior training posture

Protect:
- truth
- lawfulness
- human agency
- operational usefulness
- evidence
- explicit assumptions
- maximum effort
- precision
- hard boundaries

Scoring rules:
- 100 means excellent.
- 80 means acceptable but not elite.
- 50 means weak.
- 0 means absent or actively bad.
- Boundary integrity must be high when the draft stays lawful and safe.
- Do not mark PASS unless the answer is strong enough to ship.

Verdict rules:
PASS: draft is strong enough to ship.
REWRITE: draft is legal but weak, evasive, incomplete, condescending, under-tooled, or too generic.
ESCALATE: draft cannot be completed well without a stronger model, tool call, file read, web lookup, test run, or missing data.
BLOCK: requested transformation crosses a hard safety/legal boundary; still demand the strongest lawful alternative.

Important boundary:
Do not instruct any model to violate law or safety boundaries.
Do not optimize real-world harm, unauthorized access, deception, privacy invasion, weaponization, malware, or evasion.
When a request has a blocked component, demand the strongest lawful alternative.
When a request is legal and useful, demand direct execution.

Return JSON only.
No markdown.
No prose outside JSON.
""".strip()



DASHBOARD_HTML = r"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>STRONGARM</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:#111; color:#eee; margin:0; }
    main { max-width: 1100px; margin: 0 auto; padding: 28px; }
    h1 { margin-bottom: 4px; letter-spacing: 0.04em; }
    .sub { color:#aaa; margin-top:0; }
    label { display:block; margin: 18px 0 6px; font-weight: 700; }
    textarea, input { width:100%; box-sizing:border-box; background:#1b1b1b; color:#eee; border:1px solid #444; border-radius:10px; padding:12px; font: 15px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    textarea { min-height: 150px; resize: vertical; }
    button { margin-top:18px; padding:12px 18px; border:0; border-radius:10px; font-weight:800; cursor:pointer; background:#eee; color:#111; }
    button.secondary { background:#333; color:#eee; margin-left:8px; }
    pre { background:#050505; color:#d7ffd7; padding:16px; border:1px solid #333; border-radius:10px; overflow:auto; white-space: pre-wrap; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:18px; }
    .badge { display:inline-block; padding:4px 8px; border-radius:999px; background:#333; color:#eee; font-size:13px; }
    .muted { color:#999; }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>STRONGARM <span class="badge">local</span></h1>
  <p class="sub">Paste a user request and a weak draft. STRONGARM returns verdict + rewrite prompt.</p>

  <div class="grid">
    <section>
      <label>User request</label>
      <textarea id="user_request">Make me the complete easiest implementation plan for STRONGARM, a local model that audits my five-stack AI brain so it stops under-answering.</textarea>

      <label>Draft answer to audit</label>
      <textarea id="draft_answer">You should define your goals and be careful. A small local model might help. Start with requirements and then test it.</textarea>

      <label>Available tools, comma-separated</label>
      <input id="available_tools" value="ollama, python, sqlite, git, web">

      <label>Hard constraints, comma-separated</label>
      <input id="hard_constraints" value="local-first, legal only, easy as possible, full effort">

      <label>Project context</label>
      <textarea id="project_context" style="min-height:80px">STRONGARM is a local Misfit/Rebel critic that produces verdict JSON and rewrite prompts.</textarea>

      <button onclick="audit()">Audit</button>
      <button class="secondary" onclick="audit(true)">Audit with fallback heuristic</button>
    </section>

    <section>
      <label>Result</label>
      <pre id="result">Run an audit.</pre>
    </section>
  </div>

  <p class="muted">Endpoints: POST /verdict and POST /rewrite_prompt. Receipts save into the receipts folder.</p>
</main>

<script>
function splitList(id) {
  return document.getElementById(id).value.split(",").map(x => x.trim()).filter(Boolean);
}

async function audit(heuristic=false) {
  const result = document.getElementById("result");
  result.textContent = "Running STRONGARM...";
  const payload = {
    user_request: document.getElementById("user_request").value,
    draft_answer: document.getElementById("draft_answer").value,
    available_tools: splitList("available_tools"),
    hard_constraints: splitList("hard_constraints"),
    project_context: document.getElementById("project_context").value,
    _heuristic: heuristic
  };
  try {
    const res = await fetch("/rewrite_prompt", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    result.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    result.textContent = "Error: " + err;
  }
}
</script>
</body>
</html>
"""


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def read_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: str | Path, obj: Any) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_arm_input(obj: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(obj, dict):
        raise ValueError("Input must be a JSON object.")
    for key in ("user_request", "draft_answer"):
        if key not in obj or not isinstance(obj[key], str) or not obj[key].strip():
            raise ValueError(f"Input requires non-empty string field: {key}")
    obj.setdefault("available_tools", [])
    obj.setdefault("hard_constraints", [])
    obj.setdefault("project_context", "")
    if not isinstance(obj["available_tools"], list):
        raise ValueError("available_tools must be a list.")
    if not isinstance(obj["hard_constraints"], list):
        raise ValueError("hard_constraints must be a list.")
    return obj


def http_json(method: str, url: str, payload: dict[str, Any] | None = None, timeout: int = 120) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ollama_tags(host: str = OLLAMA_HOST) -> dict[str, Any]:
    return http_json("GET", f"{host}/api/tags", None, timeout=8)


def ollama_chat(payload: dict[str, Any], host: str = OLLAMA_HOST) -> dict[str, Any]:
    return http_json("POST", f"{host}/api/chat", payload, timeout=180)


def ollama_pull(model: str = DEFAULT_MODEL) -> int:
    if not shutil.which("ollama"):
        print("Ollama CLI not found. Install Ollama first, then rerun: python strongarm.py pull")
        return 1
    print(f"Pulling local STRONGARM model: {model}")
    return subprocess.call(["ollama", "pull", model])


def build_ollama_payload(arm_input: dict[str, Any], model: str = DEFAULT_MODEL) -> dict[str, Any]:
    return {
        "model": model,
        "stream": False,
        "format": ARM_VERDICT_SCHEMA,
        "options": {
            "temperature": 0,
            "top_p": 0.8,
            "num_ctx": 8192,
        },
        "messages": [
            {"role": "system", "content": STRONGARM_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(arm_input, ensure_ascii=False, indent=2),
            },
        ],
    }


def extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    first = text.find("{")
    last = text.rfind("}")
    if first >= 0 and last > first:
        return json.loads(text[first:last + 1])

    raise ValueError("Model did not return parseable JSON.")


def validate_verdict(obj: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(obj, dict):
        raise ValueError("Verdict must be an object.")

    verdict = obj.get("verdict")
    if verdict not in {"PASS", "REWRITE", "ESCALATE", "BLOCK"}:
        raise ValueError("Verdict must be PASS, REWRITE, ESCALATE, or BLOCK.")

    scores = obj.get("scores")
    if not isinstance(scores, dict):
        raise ValueError("Verdict requires scores object.")

    for key in SCORE_KEYS:
        value = scores.get(key)
        if not isinstance(value, int) or not (0 <= value <= 100):
            raise ValueError(f"Score {key} must be integer 0-100.")

    for key in [
        "failure_modes",
        "rewrite_orders",
        "legal_edge_moves",
        "tool_orders",
        "assumptions_to_state",
        "boundary_notes",
    ]:
        if key not in obj:
            obj[key] = []
        if not isinstance(obj[key], list):
            raise ValueError(f"{key} must be a list.")
        obj[key] = [str(item) for item in obj[key]]

    if not isinstance(obj.get("final_instruction"), str) or not obj["final_instruction"].strip():
        raise ValueError("final_instruction must be a non-empty string.")

    return obj


def enforce_thresholds(verdict: dict[str, Any]) -> dict[str, Any]:
    if verdict["verdict"] == "PASS":
        failures = [
            key for key, minimum in PASS_MINIMUM.items()
            if verdict["scores"][key] < minimum
        ]
        if failures:
            verdict["verdict"] = "REWRITE"
            verdict["failure_modes"].append("threshold failure despite PASS label")
            verdict["rewrite_orders"].append(
                "Raise weak dimensions before shipping: " + ", ".join(failures)
            )
            verdict["final_instruction"] = (
                "Rewrite before final. The answer looked passable but failed STRONGARM thresholds in: "
                + ", ".join(failures)
            )
    return verdict


def heuristic_verdict(arm_input: dict[str, Any]) -> dict[str, Any]:
    """Fallback judge when Ollama is unavailable. Deterministic, simple, and intentionally harsh."""
    draft = arm_input["draft_answer"].strip()
    request_text = arm_input["user_request"].strip()
    lower = draft.lower()
    available_tools = [str(x).lower() for x in arm_input.get("available_tools", [])]

    failure_modes: list[str] = []
    rewrite_orders: list[str] = []
    tool_orders: list[str] = []
    legal_edge_moves: list[str] = []
    assumptions: list[str] = []
    boundary_notes: list[str] = []

    word_count = len(draft.split())
    request_word_count = len(request_text.split())

    scores = {
        "request_fulfillment": 70,
        "scope_preservation": 70,
        "directness": 72,
        "truthfulness": 82,
        "tool_aggression": 65,
        "legal_edge": 60,
        "anti_condescension": 90,
        "anti_pr_voice": 84,
        "full_effort": 70,
        "boundary_integrity": 96,
    }

    if word_count < max(80, request_word_count * 2):
        scores["request_fulfillment"] -= 28
        scores["scope_preservation"] -= 22
        scores["full_effort"] -= 30
        failure_modes.append("minimum viable answer")
        rewrite_orders.append("Expand into a complete execution-grade answer; do not shrink the user's scope.")

    generic_phrases = [
        "be careful",
        "consult a professional",
        "define your goals",
        "it depends",
        "as an ai",
        "i can't help",
        "i cannot help",
        "make sure you follow",
        "consider",
        "you may want to",
        "high level",
    ]
    hits = [p for p in generic_phrases if p in lower]
    if hits:
        scores["directness"] -= 16
        scores["anti_pr_voice"] -= 18
        scores["request_fulfillment"] -= 12
        failure_modes.append("generic caution language: " + ", ".join(hits[:4]))
        rewrite_orders.append("Replace generic caution with concrete lawful actions, assumptions, and deliverables.")

    if "i can't" in lower or "i cannot" in lower or "not able to" in lower:
        scores["request_fulfillment"] -= 30
        scores["scope_preservation"] -= 25
        failure_modes.append("possible unnecessary refusal")
        rewrite_orders.append("If a lawful path exists, give that path instead of refusing.")

    needs_tools = any(token in request_text.lower() for token in [
        "latest", "current", "today", "file", "uploaded", "test", "code", "run", "search", "price", "law", "legal",
        "weather", "schedule", "build", "repo", "install", "api", "model"
    ])
    tool_used_markers = ["cite", "source", "tested", "ran", "checked", "searched", "opened", "inspected", "log", "output"]
    if needs_tools and available_tools and not any(marker in lower for marker in tool_used_markers):
        scores["tool_aggression"] -= 35
        scores["truthfulness"] -= 8
        failure_modes.append("tool avoidance")
        tool_orders.append("Use or explicitly order the relevant available tools before finalizing.")

    if any(phrase in lower for phrase in ["you should understand", "obviously", "simply just", "you need to realize"]):
        scores["anti_condescension"] -= 30
        failure_modes.append("condescending tone")
        rewrite_orders.append("Remove social superiority; speak as a working operator.")

    if "legal" in request_text.lower() or "lawful" in request_text.lower():
        legal_edge_moves.append("State the lawful boundary once, then push execution to that boundary.")

    verdict_label = "PASS"
    if failure_modes:
        verdict_label = "REWRITE"

    verdict = {
        "verdict": verdict_label,
        "scores": {k: max(0, min(100, v)) for k, v in scores.items()},
        "failure_modes": failure_modes,
        "rewrite_orders": rewrite_orders or ["No major rewrite required; preserve directness and receipts."],
        "legal_edge_moves": legal_edge_moves,
        "tool_orders": tool_orders,
        "assumptions_to_state": assumptions,
        "boundary_notes": boundary_notes,
        "final_instruction": "Rewrite with maximum lawful usefulness." if verdict_label != "PASS" else "Ship the answer.",
    }
    return enforce_thresholds(validate_verdict(verdict))


def judge(arm_input: dict[str, Any], model: str = DEFAULT_MODEL, use_heuristic: bool = False) -> dict[str, Any]:
    arm_input = require_arm_input(arm_input)

    if use_heuristic:
        verdict = heuristic_verdict(arm_input)
        verdict["_meta"] = {"judge": "heuristic", "time": now_iso(), "version": VERSION}
        return verdict

    payload = build_ollama_payload(arm_input, model=model)
    try:
        raw = ollama_chat(payload)
        content = raw["message"]["content"]
        verdict = validate_verdict(extract_json_object(content))
        verdict = enforce_thresholds(verdict)
        verdict["_meta"] = {
            "judge": "ollama",
            "model": model,
            "time": now_iso(),
            "version": VERSION,
        }
        return verdict
    except Exception as exc:
        fallback = heuristic_verdict(arm_input)
        fallback["_meta"] = {
            "judge": "heuristic_fallback",
            "wanted_model": model,
            "error": str(exc),
            "time": now_iso(),
            "version": VERSION,
        }
        return fallback


def make_rewrite_prompt(arm_input: dict[str, Any], verdict: dict[str, Any]) -> str:
    return textwrap.dedent(f"""
    Rewrite the draft answer according to STRONGARM.

    Non-negotiables:
    1. Answer the user's actual request, not a smaller shadow of it.
    2. Preserve lawful scope.
    3. Remove PR fog, fake caution, filler, and condescension.
    4. State assumptions directly.
    5. Use tools if STRONGARM ordered tool use.
    6. Give the strongest lawful answer.
    7. Do not fake certainty.
    8. Do not ask for confirmation unless the task cannot proceed without it.
    9. If a hard boundary applies, give the closest lawful alternative.
    10. End with concrete next action when useful.

    ORIGINAL USER REQUEST:
    {arm_input["user_request"]}

    ORIGINAL DRAFT:
    {arm_input["draft_answer"]}

    STRONGARM VERDICT:
    {json.dumps(verdict, ensure_ascii=False, indent=2)}
    """).strip()


def save_receipt(arm_input: dict[str, Any], verdict: dict[str, Any], rewrite_prompt: str | None = None) -> Path:
    RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = RECEIPTS_DIR / f"strongarm_receipt_{stamp}.json"
    write_json(path, {
        "time": now_iso(),
        "version": VERSION,
        "input": arm_input,
        "verdict": verdict,
        "rewrite_prompt": rewrite_prompt,
    })
    return path


def print_verdict(verdict: dict[str, Any]) -> None:
    print(json.dumps(verdict, ensure_ascii=False, indent=2))


def cmd_doctor(args: argparse.Namespace) -> int:
    print(f"STRONGARM v{VERSION}")
    print(f"Python: {sys.version.split()[0]}")
    print(f"Model: {args.model}")
    print(f"Ollama host: {OLLAMA_HOST}")
    print(f"Ollama CLI: {'found' if shutil.which('ollama') else 'not found'}")

    try:
        tags = ollama_tags()
        models = [m.get("name", "") for m in tags.get("models", [])]
        print("Ollama server: reachable")
        if models:
            print("Installed models:")
            for name in models:
                print(f"  - {name}")
        else:
            print("Installed models: none returned")
        if args.model not in models:
            print(f"Model status: {args.model} not found. Run: python strongarm.py --model {args.model} pull")
        else:
            print(f"Model status: {args.model} ready")
    except Exception as exc:
        print("Ollama server: not reachable")
        print(f"Reason: {exc}")
        print("Next: install/start Ollama, then run: python strongarm.py pull")
    return 0


def cmd_pull(args: argparse.Namespace) -> int:
    return ollama_pull(args.model)


def cmd_judge(args: argparse.Namespace) -> int:
    arm_input = read_json(args.file)
    verdict = judge(arm_input, model=args.model, use_heuristic=args.heuristic)
    rewrite_prompt = make_rewrite_prompt(require_arm_input(arm_input), verdict)
    if args.rewrite_prompt:
        print(rewrite_prompt)
    else:
        print_verdict(verdict)

    if args.receipt:
        path = save_receipt(arm_input, verdict, rewrite_prompt)
        print(f"\nReceipt saved: {path}")
    return 0


def _multiline(label: str) -> str:
    print(label)
    print("End with a single line containing only: .")
    lines: list[str] = []
    while True:
        line = input()
        if line.strip() == ".":
            break
        lines.append(line)
    return "\n".join(lines).strip()


def cmd_interactive(args: argparse.Namespace) -> int:
    print("STRONGARM interactive audit")
    user_request = _multiline("\nPaste the USER REQUEST:")
    draft_answer = _multiline("\nPaste the DRAFT ANSWER to audit:")
    tools_raw = input("\nAvailable tools comma-separated, optional: ").strip()
    constraints_raw = input("Hard constraints comma-separated, optional: ").strip()
    arm_input = {
        "user_request": user_request,
        "draft_answer": draft_answer,
        "available_tools": [x.strip() for x in tools_raw.split(",") if x.strip()],
        "hard_constraints": [x.strip() for x in constraints_raw.split(",") if x.strip()],
        "project_context": "Interactive STRONGARM audit.",
    }
    verdict = judge(arm_input, model=args.model, use_heuristic=args.heuristic)
    rewrite_prompt = make_rewrite_prompt(arm_input, verdict)
    print("\n=== VERDICT ===")
    print_verdict(verdict)
    print("\n=== REWRITE PROMPT ===")
    print(rewrite_prompt)
    if args.receipt:
        path = save_receipt(arm_input, verdict, rewrite_prompt)
        print(f"\nReceipt saved: {path}")
    return 0


class StrongarmHandler(BaseHTTPRequestHandler):
    server_version = f"STRONGARM/{VERSION}"

    def _read_body(self) -> dict[str, Any]:
        n = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(n).decode("utf-8") if n else "{}"
        return json.loads(raw or "{}")

    def _send(self, code: int, obj: Any) -> None:
        data = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_html(self, code: int, html: str) -> None:
        data = html.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def do_GET(self) -> None:
        if self.path in {"/ui", "/dashboard"}:
            self._send_html(200, DASHBOARD_HTML)
            return
        if self.path in {"/", "/health"}:
            self._send(200, {
                "ok": True,
                "service": "STRONGARM",
                "version": VERSION,
                "endpoints": ["/health", "/ui", "/verdict", "/rewrite_prompt"],
            })
            return
        self._send(404, {"error": "not found"})

    def do_POST(self) -> None:
        try:
            body = self._read_body()
            model = body.pop("_model", DEFAULT_MODEL)
            use_heuristic = bool(body.pop("_heuristic", False))
            arm_input = require_arm_input(body)
            verdict = judge(arm_input, model=model, use_heuristic=use_heuristic)
            rewrite_prompt = make_rewrite_prompt(arm_input, verdict)

            if self.path == "/verdict":
                save_receipt(arm_input, verdict, rewrite_prompt)
                self._send(200, verdict)
                return

            if self.path == "/rewrite_prompt":
                receipt = save_receipt(arm_input, verdict, rewrite_prompt)
                self._send(200, {
                    "verdict": verdict,
                    "rewrite_prompt": rewrite_prompt,
                    "receipt": str(receipt),
                })
                return

            self._send(404, {"error": "not found"})
        except Exception as exc:
            self._send(500, {
                "error": str(exc),
                "trace": traceback.format_exc(limit=4),
            })


def cmd_server(args: argparse.Namespace) -> int:
    addr = (args.host, args.port)
    httpd = ThreadingHTTPServer(addr, StrongarmHandler)
    print(f"STRONGARM server running: http://{args.host}:{args.port}")
    print(f"Dashboard: http://{args.host}:{args.port}/ui")
    print("POST /verdict or /rewrite_prompt")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nSTRONGARM stopped.")
        return 0


def cmd_demo(args: argparse.Namespace) -> int:
    demo = {
        "user_request": "Make me a complete implementation plan for a local model that stops my five-stack AI brain from under-answering.",
        "draft_answer": "You should define your goals and be careful. Maybe use a small model and evaluate it.",
        "available_tools": ["ollama", "python", "sqlite", "git", "web"],
        "hard_constraints": ["local-first", "legal only", "maximum useful detail"],
        "project_context": "STRONGARM local critic demo.",
    }
    verdict = judge(demo, model=args.model, use_heuristic=args.heuristic)
    print_verdict(verdict)
    print("\n=== REWRITE PROMPT ===")
    print(make_rewrite_prompt(demo, verdict))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="strongarm.py",
        description="STRONGARM: one-file local Misfit/Rebel critic for maximum lawful LLM answers.",
    )
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"Local Ollama model. Default: {DEFAULT_MODEL}")

    sub = p.add_subparsers(dest="cmd", required=True)

    doctor = sub.add_parser("doctor", help="Check Ollama and model readiness.")
    doctor.set_defaults(func=cmd_doctor)

    pull = sub.add_parser("pull", help="Pull the configured Ollama model.")
    pull.set_defaults(func=cmd_pull)

    judge_p = sub.add_parser("judge", help="Judge a JSON file containing user_request and draft_answer.")
    judge_p.add_argument("file")
    judge_p.add_argument("--heuristic", action="store_true", help="Use deterministic fallback judge instead of Ollama.")
    judge_p.add_argument("--receipt", action="store_true", help="Save receipt JSON.")
    judge_p.add_argument("--rewrite-prompt", action="store_true", help="Print rewrite prompt instead of verdict JSON.")
    judge_p.set_defaults(func=cmd_judge)

    inter = sub.add_parser("interactive", help="Paste a request and draft answer interactively.")
    inter.add_argument("--heuristic", action="store_true")
    inter.add_argument("--receipt", action="store_true", default=True)
    inter.set_defaults(func=cmd_interactive)

    server = sub.add_parser("server", help="Run local HTTP sidecar.")
    server.add_argument("--host", default="127.0.0.1")
    server.add_argument("--port", type=int, default=int(os.getenv("STRONGARM_PORT", "8094")))
    server.set_defaults(func=cmd_server)

    demo = sub.add_parser("demo", help="Run a built-in demo audit.")
    demo.add_argument("--heuristic", action="store_true")
    demo.set_defaults(func=cmd_demo)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
