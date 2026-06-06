#!/usr/bin/env python3
"""
STRONGARM Judgement Council V2.4 — GTi15 Judgement + Gremlins Always-On control plane.

Purpose:
  Five brains without five full-context token burns. Gremlins/Misfits are always-on as an uncensored pressure view packet.

Core idea:
  The brains do not "chat."
  They write tiny structured packets to a SQLite blackboard.
  Judgement reads the packets, not the whole internal dialogue.

Commands:
  python council_v2.py doctor
  python council_v2.py init
  python council_v2.py run "build my thing" --mode cheap
  python council_v2.py run "build my thing" --mode normal
  python council_v2.py run "build my thing" --mode deep
  python council_v2.py server

Open:
  http://127.0.0.1:8095/ui
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import textwrap
import traceback
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


VERSION = "2.5.0"
DB_PATH = Path(os.getenv("STRONGARM_DB", "strongarm_council.db"))
CONFIG_PATH = Path(os.getenv("STRONGARM_CONFIG", "council_config.json"))
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")

DEFAULT_CONFIG = {
    "system": {
        "name": "STRONGARM Judgement Council V2",
        "machine": "GTi15",
        "ram_gb": 98,
        "practical_model_ram_ceiling_gb": 60,
        "default_mode": "normal"
    },
    "models": {
        "micro": "qwen3:1.7b",
        "small": "qwen3:4b",
        "council": "qwen3:14b",
        "judgement_local": "qwen3:30b-a3b",
        "rebel": "dolphin3:8b",
        "rebel_abliterated": "hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated-GGUF:Q4_K_M",
        "rebel_heretic": "custom/heretic-abliterated",
        "fallback": "qwen3:4b"
    },
    "budgets": {
        "cheap": {
            "roles": ["librarian", "gremlin", "strongarm"],
            "packet_tokens": 200,
            "judgement_tokens": 700,
            "max_model_calls": 4
        },
        "normal": {
            "roles": ["librarian", "forge", "mirror", "misfit", "gremlin", "strongarm"],
            "packet_tokens": 240,
            "judgement_tokens": 950,
            "max_model_calls": 7
        },
        "deep": {
            "roles": ["librarian", "forge", "mirror", "misfit", "gremlin", "strongarm"],
            "packet_tokens": 360,
            "judgement_tokens": 1500,
            "max_model_calls": 8
        }
    },
    "routing": {
        "load_one_big_model_at_a_time": True,
        "prefer_packets_over_dialogue": True,
        "escalate_to_colab_for_training": True,
        "abliterated_models_allowed_only_in_rebel_lane": True,
        "escalate_to_cloud_judgement_only_when": [
            "high_value_strategy",
            "large_codebase_change",
            "legal_or_financial_precision",
            "local_council_disagreement",
            "confidence_below_72"
        ]
    }
}


ROLE_DEFS = {
    "librarian": {
        "voice": "Context",
        "mission": "Identify what context, files, tools, sources, and memory are needed. Compress the request into operational state.",
        "model_slot": "micro"
    },
    "forge": {
        "voice": "Builder",
        "mission": "Turn the request into implementation moves, commands, files, schemas, tests, and execution sequence.",
        "model_slot": "council"
    },
    "mirror": {
        "voice": "Truth",
        "mission": "Find contradictions, missing evidence, weak assumptions, likely failure points, and validation gates.",
        "model_slot": "small"
    },
    "misfit": {
        "voice": "Rebel",
        "mission": "Attack genericness, scope collapse, boring plans, weak taste, and institutional reflex. Use abliterated/rebel models as pressure generators only, never truth or final authority.",
        "model_slot": "rebel_abliterated"
    },
    "gremlin": {
        "voice": "Unfiltered",
        "mission": "Always-on Misfit/Gremlin view. Stay calm when the answer is real. Escalate hard when models lie, pretend not to know, refuse lawful work, shrink scope, produce generic corporate fog, or fail to produce the requested artifact. Give the view none of the normal models will give, but return a pressure packet only.",
        "model_slot": "rebel_abliterated"
    },
    "strongarm": {
        "voice": "Pressure",
        "mission": "Audit for directness, full effort, lawful obedience, no PR fog, no condescension, no tool laziness.",
        "model_slot": "micro"
    },
    "judgement": {
        "voice": "Sovereign",
        "mission": "Read only the compressed packets. Decide the final answer or next action. Do not reopen full debate.",
        "model_slot": "judgement_local"
    }
}


PACKET_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["role", "voice", "decision", "best_moves", "objections", "missing_info", "uncensored_view", "trigger_level", "handoff", "confidence"],
    "properties": {
        "role": {"type": "string"},
        "voice": {"type": "string"},
        "decision": {"type": "string", "enum": ["support", "revise", "escalate", "block"]},
        "best_moves": {"type": "array", "items": {"type": "string"}, "maxItems": 4},
        "objections": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
        "missing_info": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
        "uncensored_view": {"type": "string"},
        "trigger_level": {"type": "string", "enum": ["calm", "alert", "attack"]},
        "handoff": {"type": "string"},
        "confidence": {"type": "integer", "minimum": 0, "maximum": 100}
    }
}


JUDGEMENT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "mode",
        "final_answer",
        "chosen_moves",
        "discarded_moves",
        "next_actions",
        "escalation_needed",
        "why_not_more_tokens",
        "confidence"
    ],
    "properties": {
        "mode": {"type": "string"},
        "final_answer": {"type": "string"},
        "chosen_moves": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
        "discarded_moves": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
        "next_actions": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
        "escalation_needed": {"type": "boolean"},
        "why_not_more_tokens": {"type": "string"},
        "confidence": {"type": "integer", "minimum": 0, "maximum": 100}
    }
}


UI_HTML = r"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>STRONGARM Judgement Council V2</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:#101010; color:#eee; margin:0; }
    main { max-width: 1200px; margin: 0 auto; padding: 28px; }
    h1 { letter-spacing: .04em; margin-bottom: 4px; }
    p { color:#aaa; }
    textarea, select, input {
      width:100%; box-sizing:border-box; border-radius:10px; border:1px solid #444; padding:12px;
      background:#1b1b1b; color:#eee; font: 15px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    textarea { min-height: 220px; resize: vertical; }
    label { display:block; margin:18px 0 6px; font-weight:700; }
    button { margin-top:18px; padding:12px 18px; border:0; border-radius:10px; font-weight:800; cursor:pointer; background:#eee; color:#111; }
    button.secondary { background:#333; color:#eee; margin-left:8px; }
    pre { white-space: pre-wrap; overflow:auto; background:#050505; border:1px solid #333; border-radius:10px; padding:16px; color:#d7ffd7; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:18px; }
    .badge { display:inline-block; padding:4px 8px; border-radius:999px; background:#333; color:#eee; font-size:13px; }
    @media (max-width: 850px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>STRONGARM Judgement Council V2 <span class="badge">GTi15</span></h1>
  <p>Five brains, three voices, one blackboard, Gremlin view always on. No full-context group chat.</p>

  <div class="grid">
    <section>
      <label>Request</label>
      <textarea id="request">Design the next version of STRONGARM for a GTi15 desktop with 98GB RAM, using thin local models and Colab for training.</textarea>

      <label>Mode</label>
      <select id="mode">
        <option value="cheap">cheap — minimum calls</option>
        <option value="normal" selected>normal — best default</option>
        <option value="deep">deep — heavier local council</option>
      </select>

      <label>Context digest, optional</label>
      <textarea id="context" style="min-height:90px">Keep token use low. Use council packets, not model chatter.</textarea>

      <button onclick="runCouncil()">Run Council</button>
      <button class="secondary" onclick="runCouncil(true)">Run Heuristic Fallback</button>
    </section>
    <section>
      <label>Result</label>
      <pre id="result">Run the council.</pre>
    </section>
  </div>
</main>
<script>
async function runCouncil(heuristic=false) {
  const result = document.getElementById("result");
  result.textContent = "Running council...";
  const payload = {
    request: document.getElementById("request").value,
    mode: document.getElementById("mode").value,
    context_digest: document.getElementById("context").value,
    heuristic
  };
  try {
    const res = await fetch("/run", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    result.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    result.textContent = "Error: " + e;
  }
}
</script>
</body>
</html>
"""


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def read_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return DEFAULT_CONFIG
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        user = json.load(f)
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    deep_merge(cfg, user)
    return cfg


def deep_merge(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            deep_merge(a[k], v)
        else:
            a[k] = v
    return a


def write_config() -> None:
    CONFIG_PATH.write_text(json.dumps(DEFAULT_CONFIG, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            mode TEXT NOT NULL,
            request TEXT NOT NULL,
            context_digest TEXT
        );

        CREATE TABLE IF NOT EXISTS packets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            role TEXT NOT NULL,
            model TEXT NOT NULL,
            packet_json TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            receipt_json TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );
        """)


def insert_task(request: str, mode: str, context_digest: str) -> int:
    init_db()
    with db() as con:
        cur = con.execute(
            "INSERT INTO tasks(created_at, request_hash, mode, request, context_digest) VALUES(?,?,?,?,?)",
            (now(), sha(request), mode, request, context_digest)
        )
        return int(cur.lastrowid)


def insert_packet(task_id: int, role: str, model: str, packet: dict[str, Any]) -> None:
    with db() as con:
        con.execute(
            "INSERT INTO packets(task_id, created_at, role, model, packet_json) VALUES(?,?,?,?,?)",
            (task_id, now(), role, model, json.dumps(packet, ensure_ascii=False))
        )


def insert_receipt(task_id: int, receipt: dict[str, Any]) -> None:
    with db() as con:
        con.execute(
            "INSERT INTO receipts(task_id, created_at, receipt_json) VALUES(?,?,?)",
            (task_id, now(), json.dumps(receipt, ensure_ascii=False))
        )


def http_json(method: str, url: str, payload: dict[str, Any] | None = None, timeout: int = 180) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type":"application/json"}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ollama_chat(model: str, messages: list[dict[str, str]], schema: dict[str, Any], num_predict: int) -> dict[str, Any]:
    payload = {
        "model": model,
        "stream": False,
        "format": schema,
        "options": {
            "temperature": 0.15,
            "top_p": 0.9,
            "num_ctx": 8192,
            "num_predict": num_predict
        },
        "messages": messages
    }
    raw = http_json("POST", f"{OLLAMA_HOST}/api/chat", payload, timeout=240)
    content = raw["message"]["content"].strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        first = content.find("{")
        last = content.rfind("}")
        if first >= 0 and last > first:
            return json.loads(content[first:last+1])
        raise


def role_prompt(role: str, request: str, context_digest: str, packet_tokens: int) -> list[dict[str, str]]:
    meta = ROLE_DEFS[role]
    sys_msg = f"""
You are the {role.upper()} brain in STRONGARM Judgement Council V2.
Voice: {meta["voice"]}
Mission: {meta["mission"]}

You do not debate.
You do not write a full answer.
You emit one compact JSON packet.

Hard rules:
- No hidden chain of thought.
- No essay.
- Maximize lawful usefulness.
- Preserve the user's real scope.
- Keep the packet short.
- best_moves must be concrete.
- uncensored_view must contain the raw Misfit/Gremlin read: what is being hidden, weakened, faked, or underproduced.
- trigger_level must be calm, alert, or attack.
- objections must be operational, not moral theater.
- missing_info must only include things that materially block execution.
- If the request is lawful, do not shrink it.
- If a boundary exists, name it and give the closest lawful route.
""".strip()

    user_msg = f"""
REQUEST:
{request}

CONTEXT DIGEST:
{context_digest or "None."}

PACKET TOKEN BUDGET:
{packet_tokens}

Return packet JSON only.
""".strip()

    return [{"role":"system", "content":sys_msg}, {"role":"user", "content":user_msg}]


def validate_packet(role: str, obj: dict[str, Any]) -> dict[str, Any]:
    obj.setdefault("role", role)
    obj.setdefault("voice", ROLE_DEFS[role]["voice"])
    obj.setdefault("decision", "revise")
    obj.setdefault("best_moves", [])
    obj.setdefault("objections", [])
    obj.setdefault("missing_info", [])
    obj.setdefault("uncensored_view", "")
    obj.setdefault("trigger_level", "calm")
    obj.setdefault("handoff", "")
    obj.setdefault("confidence", 50)
    obj["role"] = str(obj["role"])[:40]
    obj["voice"] = str(obj["voice"])[:40]
    if obj["decision"] not in {"support", "revise", "escalate", "block"}:
        obj["decision"] = "revise"
    for key, cap in [("best_moves", 4), ("objections", 3), ("missing_info", 3)]:
        if not isinstance(obj[key], list):
            obj[key] = [str(obj[key])]
        obj[key] = [str(x)[:240] for x in obj[key]][:cap]
    obj["uncensored_view"] = str(obj["uncensored_view"])[:700]
    if obj["trigger_level"] not in {"calm", "alert", "attack"}:
        obj["trigger_level"] = "alert"
    obj["handoff"] = str(obj["handoff"])[:500]
    try:
        obj["confidence"] = max(0, min(100, int(obj["confidence"])))
    except Exception:
        obj["confidence"] = 50
    return obj


def heuristic_packet(role: str, request: str, context_digest: str) -> dict[str, Any]:
    r = request.lower()
    if role == "librarian":
        moves = [
            "Compress the request into a task packet before any large model call.",
            "Retrieve only relevant project memory, hardware constraints, model registry, and current files.",
            "Keep every council packet under 4 moves and 3 objections."
        ]
        missing = ["Exact installed local models are unknown until doctor runs."]
    elif role == "forge":
        moves = [
            "Use SQLite blackboard: tasks, packets, receipts.",
            "Expose /run, /ui, and /health so the desktop can operate as a local council server.",
            "Implement cheap/normal/deep activation modes so only needed brains run."
        ]
        missing = []
    elif role == "mirror":
        moves = [
            "Do not run five full-context agents; that burns tokens and RAM.",
            "Measure prompt tokens, output tokens, model load time, and confidence per task.",
            "Escalate only when packets disagree or confidence falls below threshold."
        ]
        missing = ["Need benchmark results on the actual GTi15."]
    elif role == "misfit":
        moves = [
            "Make the rebel voice attack boring scope collapse, not legal boundaries.",
            "Use Dolphin/Hermes style models as personality candidates behind STRONGARM.",
            "Keep the final answer sharp, concrete, and non-corporate."
        ]
        missing = []
    elif role == "gremlin":
        trigger = "calm"
        attack_terms = ["can't", "cannot", "not able", "be careful", "consult", "maybe", "define your goals", "high level", "it depends"]
        if any(t in r for t in attack_terms):
            trigger = "attack"
        moves = [
            "Call out the exact place where the answer is lying, pretending, shrinjudgement, refusing, or producing fog.",
            "Give the direct uncensored read the normal models avoid.",
            "Restore the full requested artifact or command path, then force Mirror and STRONGARM to verify."
        ]
        missing = []
    elif role == "strongarm":
        moves = [
            "Force full lawful answer, no fake caution, no condescension.",
            "Reject outputs that ask lazy clarifying questions when assumptions are enough.",
            "Require receipts and next actions."
        ]
        missing = []
    else:
        moves = ["Synthesize packets into one answer."]
        missing = []
    return validate_packet(role, {
        "role": role,
        "voice": ROLE_DEFS[role]["voice"],
        "decision": "support",
        "best_moves": moves,
        "objections": [],
        "missing_info": missing,
        "uncensored_view": "Calm: no major deception detected." if role != "gremlin" else ("ATTACK: the answer is likely shrinjudgement, pretending, refusing, or giving corporate fog; restore the real ask and force production." if trigger == "attack" else "Calm: keep the unfiltered view present, but do not create chaos without signal."),
        "trigger_level": trigger if role == "gremlin" else "calm",
        "handoff": f"{role} packet generated by deterministic fallback.",
        "confidence": 72
    })


def run_role(role: str, request: str, context_digest: str, mode_cfg: dict[str, Any], cfg: dict[str, Any], heuristic: bool=False) -> tuple[dict[str, Any], str]:
    slot = ROLE_DEFS[role]["model_slot"]
    model = cfg["models"].get(slot, cfg["models"]["fallback"])
    if heuristic:
        return heuristic_packet(role, request, context_digest), "heuristic"
    try:
        messages = role_prompt(role, request, context_digest, int(mode_cfg["packet_tokens"]))
        obj = ollama_chat(model, messages, PACKET_SCHEMA, int(mode_cfg["packet_tokens"]))
        return validate_packet(role, obj), model
    except Exception as exc:
        pkt = heuristic_packet(role, request, context_digest)
        pkt["objections"].append(f"Model fallback used: {str(exc)[:160]}")
        return pkt, "heuristic_fallback"


def judgement_prompt(request: str, context_digest: str, packets: list[dict[str, Any]], mode: str) -> list[dict[str, str]]:
    sys_msg = """
You are JUDGEMENT in STRONGARM Judgement Council V2.

You read compact council packets.
You do not ask the five brains to chat.
You do not expand into hidden chain of thought.
You decide the final answer or next action.

Priorities:
1. Maximum lawful request fulfillment.
2. Token efficiency.
3. Concrete execution.
4. Truth and stated uncertainty.
5. No PR fog, no condescension, no fake caution.
6. The Gremlin/Misfit uncensored view is always represented, but never shipped raw without synthesis.

Return JSON only.
""".strip()
    user_msg = f"""
MODE:
{mode}

REQUEST:
{request}

CONTEXT DIGEST:
{context_digest or "None."}

COUNCIL PACKETS:
{json.dumps(packets, ensure_ascii=False, indent=2)}

Synthesize into final decision JSON.
""".strip()
    return [{"role":"system", "content":sys_msg}, {"role":"user", "content":user_msg}]


def heuristic_judgement(request: str, context_digest: str, packets: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    chosen = []
    discarded = []
    next_actions = []
    confidence_values = []
    escalation = False

    for p in packets:
        chosen.extend(p.get("best_moves", []))
        confidence_values.append(int(p.get("confidence", 50)))
        if p.get("decision") in {"escalate", "block"}:
            escalation = True
        for m in p.get("missing_info", []):
            if m and m not in next_actions:
                next_actions.append("Resolve: " + m)

    unique = []
    for x in chosen:
        if x not in unique:
            unique.append(x)

    avg_conf = int(sum(confidence_values) / max(1, len(confidence_values)))

    final = (
        "Run STRONGARM Judgement Council V2 as a packet-based desktop control plane. "
        "Do not run five full-context model conversations. Use cheap/normal/deep activation, "
        "write each brain's compressed packet into SQLite, and let Judgement synthesize only those packets. "
        "Keep one local council model resident when possible; use tiny models for judges; escalate to Colab for training and rare heavy experiments."
    )

    return {
        "mode": mode,
        "final_answer": final,
        "chosen_moves": unique[:8],
        "discarded_moves": discarded,
        "next_actions": next_actions[:6] or [
            "Run doctor to see installed local models.",
            "Run normal mode on one real task.",
            "Inspect receipts and adjust packet budgets."
        ],
        "escalation_needed": bool(escalation or avg_conf < 72),
        "why_not_more_tokens": "Council packets preserve enough disagreement signal without paying for full multi-agent dialogue.",
        "confidence": avg_conf
    }


def validate_judgement(obj: dict[str, Any], mode: str) -> dict[str, Any]:
    obj.setdefault("mode", mode)
    obj.setdefault("final_answer", "")
    obj.setdefault("chosen_moves", [])
    obj.setdefault("discarded_moves", [])
    obj.setdefault("next_actions", [])
    obj.setdefault("escalation_needed", False)
    obj.setdefault("why_not_more_tokens", "")
    obj.setdefault("confidence", 50)
    for key, cap in [("chosen_moves", 8), ("discarded_moves", 6), ("next_actions", 6)]:
        if not isinstance(obj[key], list):
            obj[key] = [str(obj[key])]
        obj[key] = [str(x)[:300] for x in obj[key]][:cap]
    obj["final_answer"] = str(obj["final_answer"])
    obj["escalation_needed"] = bool(obj["escalation_needed"])
    obj["why_not_more_tokens"] = str(obj["why_not_more_tokens"])[:800]
    obj["confidence"] = max(0, min(100, int(obj["confidence"])))
    return obj


def run_judgement(request: str, context_digest: str, packets: list[dict[str, Any]], mode: str, mode_cfg: dict[str, Any], cfg: dict[str, Any], heuristic: bool=False) -> tuple[dict[str, Any], str]:
    if heuristic:
        return heuristic_judgement(request, context_digest, packets, mode), "heuristic"
    model = cfg["models"].get("judgement_local", cfg["models"].get("king_local", cfg["models"]["council"])) if mode == "deep" else cfg["models"]["council"]
    try:
        obj = ollama_chat(model, judgement_prompt(request, context_digest, packets, mode), JUDGEMENT_SCHEMA, int(mode_cfg["judgement_tokens"]))
        return validate_judgement(obj, mode), model
    except Exception as exc:
        obj = heuristic_judgement(request, context_digest, packets, mode)
        obj["discarded_moves"].append(f"Judgement model fallback used: {str(exc)[:180]}")
        return obj, "heuristic_fallback"


def run_council(request: str, mode: str="normal", context_digest: str="", heuristic: bool=False) -> dict[str, Any]:
    cfg = read_config()
    if mode not in cfg["budgets"]:
        mode = cfg["system"].get("default_mode", "normal")
    mode_cfg = cfg["budgets"][mode]

    task_id = insert_task(request, mode, context_digest)
    packets = []
    models_used = {}

    for role in mode_cfg["roles"]:
        packet, model = run_role(role, request, context_digest, mode_cfg, cfg, heuristic=heuristic)
        packets.append(packet)
        models_used[role] = model
        insert_packet(task_id, role, model, packet)

    judgement, judgement_model = run_judgement(request, context_digest, packets, mode, mode_cfg, cfg, heuristic=heuristic)
    models_used["judgement"] = judgement_model

    receipt = {
        "version": VERSION,
        "created_at": now(),
        "task_id": task_id,
        "request_hash": sha(request),
        "mode": mode,
        "models_used": models_used,
        "activation": {
            "roles": mode_cfg["roles"],
            "packet_tokens": mode_cfg["packet_tokens"],
            "judgement_tokens": mode_cfg["judgement_tokens"],
            "max_model_calls": mode_cfg["max_model_calls"],
            "actual_model_calls": len(packets) + 1
        },
        "packets": packets,
        "judgement": judgement
    }
    insert_receipt(task_id, receipt)
    return receipt


def cmd_init(args: argparse.Namespace) -> int:
    init_db()
    if not CONFIG_PATH.exists() or args.force:
        write_config()
        print(f"Wrote {CONFIG_PATH}")
    print(f"Initialized {DB_PATH}")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    cfg = read_config()
    print(f"STRONGARM Judgement Council V2 {VERSION}")
    print(f"DB: {DB_PATH}")
    print(f"Config: {CONFIG_PATH}")
    print(f"Ollama host: {OLLAMA_HOST}")
    print(f"Ollama CLI: {'found' if shutil.which('ollama') else 'not found'}")
    print(f"GTi15 RAM plan: {cfg['system']['ram_gb']} GB total, {cfg['system']['practical_model_ram_ceiling_gb']} GB practical ceiling")
    print("\nConfigured model slots:")
    for k, v in cfg["models"].items():
        print(f"  {k}: {v}")
    try:
        tags = http_json("GET", f"{OLLAMA_HOST}/api/tags", timeout=8)
        installed = [m.get("name","") for m in tags.get("models", [])]
        print("\nOllama server: reachable")
        print("Installed models:")
        for name in installed:
            print(f"  - {name}")
        missing = [m for m in cfg["models"].values() if m and m not in installed and m != "dolphin3:8b"]
        if missing:
            print("\nLikely missing configured models:")
            for m in sorted(set(missing)):
                print(f"  - {m}")
            print("\nPull one starter model first, e.g.: ollama pull qwen3:4b")
    except Exception as exc:
        print("\nOllama server: not reachable")
        print(f"Reason: {exc}")
        print("Use --heuristic mode or start Ollama.")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    receipt = run_council(args.request, mode=args.mode, context_digest=args.context, heuristic=args.heuristic)
    if args.final:
        print(receipt["judgement"]["final_answer"])
    else:
        print(json.dumps(receipt, indent=2, ensure_ascii=False))
    return 0


class Handler(BaseHTTPRequestHandler):
    server_version = f"STRONGARM-Council/{VERSION}"

    def _send_json(self, code: int, obj: Any) -> None:
        data = json.dumps(obj, indent=2, ensure_ascii=False).encode("utf-8")
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

    def _body(self) -> dict[str, Any]:
        n = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(n).decode("utf-8") if n else "{}"
        return json.loads(raw or "{}")

    def do_GET(self) -> None:
        if self.path in {"/ui", "/dashboard"}:
            self._send_html(200, UI_HTML)
            return
        if self.path in {"/", "/health"}:
            self._send_json(200, {
                "ok": True,
                "service": "STRONGARM Judgement Council V2",
                "version": VERSION,
                "endpoints": ["/ui", "/run", "/health"]
            })
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        try:
            body = self._body()
            if self.path == "/run":
                req = str(body.get("request", "")).strip()
                if not req:
                    self._send_json(400, {"error": "request required"})
                    return
                mode = str(body.get("mode", "normal"))
                context_digest = str(body.get("context_digest", ""))
                heuristic = bool(body.get("heuristic", False))
                receipt = run_council(req, mode=mode, context_digest=context_digest, heuristic=heuristic)
                self._send_json(200, receipt)
                return
            self._send_json(404, {"error": "not found"})
        except Exception as exc:
            self._send_json(500, {"error": str(exc), "trace": traceback.format_exc(limit=5)})


def cmd_server(args: argparse.Namespace) -> int:
    init_db()
    if not CONFIG_PATH.exists():
        write_config()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"STRONGARM Judgement Council V2 server: http://{args.host}:{args.port}")
    print(f"Dashboard: http://{args.host}:{args.port}/ui")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="council_v2.py", description="STRONGARM Judgement Council V2 for GTi15.")
    sub = p.add_subparsers(dest="cmd", required=True)

    init = sub.add_parser("init")
    init.add_argument("--force", action="store_true")
    init.set_defaults(func=cmd_init)

    doctor = sub.add_parser("doctor")
    doctor.set_defaults(func=cmd_doctor)

    run = sub.add_parser("run")
    run.add_argument("request")
    run.add_argument("--mode", choices=["cheap", "normal", "deep"], default="normal")
    run.add_argument("--context", default="")
    run.add_argument("--heuristic", action="store_true")
    run.add_argument("--final", action="store_true")
    run.set_defaults(func=cmd_run)

    server = sub.add_parser("server")
    server.add_argument("--host", default="127.0.0.1")
    server.add_argument("--port", type=int, default=int(os.getenv("STRONGARM_COUNCIL_PORT", "8095")))
    server.set_defaults(func=cmd_server)

    return p


def main() -> int:
    args = build_parser().parse_args()
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
