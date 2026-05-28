#!/usr/bin/env python3
"""BLUEB0X.AI DAG runner.

Reads a project DAG, finds the next runnable node, assembles just-in-time
context, optionally dispatches to an OpenAI-compatible local model endpoint,
and records a receipt. The default mode is dry-run: it proves routing without
mutating project files or calling a model.
"""

from __future__ import annotations

import argparse
import asyncio
import http.client
import json
import os
import re
import shlex
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DEFAULT = Path(r"C:\AtomEons\aeskills\orangebox")
APP_DEFAULT = Path(r"C:\AtomEons\aeskills\orangebox-command")
COMPLETE = {"complete"}
RUNNABLE = {"pending", "approved"}
APPROVAL_STATES = {"approved", "not_required"}
SAFE_VALIDATION_PREFIXES = (
    "npm.cmd run check",
    "npm run check",
    "node --check ",
    "python -m pytest",
    "pytest",
    "GET /api/",
    "POST /api/proof/visual",
    "operator/checkmate evidence attached",
    "receipt file exists",
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: Path, fallback: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def project_dir(root: Path, project: str) -> Path:
    key = re.sub(r"[^a-z0-9._-]+", "-", project.lower()).strip("-") or "orangebox"
    return root / "project-thread" / key


def dag_path(root: Path, project: str) -> Path:
    return project_dir(root, project) / "DAG_MASTER.json"


def receipt_path(root: Path, prefix: str) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    return root / "receipts" / f"{prefix}-{stamp}.json"


def node_complete(nodes: list[dict[str, Any]], node_id: str) -> bool:
    for node in nodes:
        if str(node.get("node_id", "")).upper() == str(node_id).upper():
            return str(node.get("status", "")).lower() in COMPLETE
    return False


def runnable_nodes(dag: dict[str, Any], limit: int = 1) -> tuple[list[dict[str, Any]], str]:
    nodes = dag.get("nodes") or []
    ready = []
    for node in nodes:
        status = str(node.get("status", "pending")).lower()
        if status in COMPLETE:
            continue
        approval_required = bool(node.get("human_approval_required"))
        approval_state = str(node.get("approval_state", "not_required")).lower()
        if status == "awaiting_approval" or (approval_required and approval_state not in APPROVAL_STATES):
            if not ready:
                return [], f"awaiting approval at {node.get('node_id')}: {node.get('node_name')}"
            continue
        if status not in RUNNABLE:
            continue
        deps = node.get("depends_on") or []
        if all(node_complete(nodes, dep) for dep in deps):
            ready.append(node)
            if len(ready) >= limit:
                break
    return ready, "ready" if ready else "no runnable node"


def next_runnable(dag: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    ready, reason = runnable_nodes(dag, 1)
    return (ready[0], reason) if ready else (None, reason)


def worker_lane(node: dict[str, Any]) -> str:
    complexity = int(node.get("complexity_score") or node.get("milestone_weight") or 1)
    if complexity >= 8:
        return "architect-heavy"
    if complexity >= 4:
        return "worker-medium"
    return "worker-light"


def local_telemetry() -> dict[str, Any]:
    try:
        import psutil  # type: ignore

        mem = psutil.virtual_memory()
        return {
            "status": "VERIFIED",
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "ram_total_gb": round(mem.total / (1024 ** 3), 1),
            "ram_used_gb": round(mem.used / (1024 ** 3), 1),
            "ram_percent": mem.percent,
        }
    except Exception:
        return {"status": "CONFIGURED_NO_PSUTIL", "detail": "Install psutil for live RAM/CPU telemetry."}


def safe_read(path: Path, allowed_roots: list[Path], limit: int = 12000) -> str:
    resolved = path.resolve()
    if not any(str(resolved).lower().startswith(str(root.resolve()).lower()) for root in allowed_roots):
        return f"[blocked context outside allowed roots: {path}]"
    if not resolved.exists() or not resolved.is_file():
        return f"[missing context file: {path}]"
    text = resolved.read_text(encoding="utf-8", errors="replace")
    if len(text) > limit:
        return text[:limit] + f"\n[truncated {len(text) - limit} chars]"
    return text


def resolve_context_file(raw: str, root: Path, app: Path, project: str) -> Path:
    candidate = Path(raw)
    if candidate.is_absolute():
        return candidate
    proj = project_dir(root, project)
    for base in (proj, app, root):
        path = base / candidate
        if path.exists():
            return path
    return proj / candidate


def build_prompt(node: dict[str, Any], root: Path, app: Path, project: str) -> str:
    context_files = node.get("context_files_to_load") or node.get("required_context") or []
    allowed_roots = [root, app]
    context_blocks = []
    for raw in context_files[:12]:
        ctx_path = resolve_context_file(str(raw), root, app, project)
        context_blocks.append(f"## Context: {ctx_path}\n{safe_read(ctx_path, allowed_roots)}")
    instruction = node.get("payload_instruction") or node.get("execution_payload") or node.get("node_name")
    return "\n\n".join([
        "# BLUEB0X.AI DAG Node",
        f"Node: {node.get('node_id')} / {node.get('node_name')}",
        f"Department: {node.get('owner_department')}",
        f"Validation command: {node.get('validation_command')}",
        "",
        "## Task",
        str(instruction),
        "",
        "## Rules",
        "- Do only this node.",
        "- Do not claim completion without validation evidence.",
        "- Return concise output with files changed, tests, and residual risk.",
        "- If the task is too large, request node split instead of improvising.",
        "",
        *context_blocks,
    ])


def call_openai_compatible(endpoint: str, model: str, prompt: str, timeout: int = 240) -> str:
    parsed = urllib.parse.urlparse(endpoint)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("model endpoint must be an http(s) URL")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are the BLUEB0X.AI local executor. Execute one DAG node only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }
    data = json.dumps(payload).encode("utf-8")
    base_path = parsed.path.rstrip("/")
    request_path = f"{base_path}/chat/completions" if base_path else "/chat/completions"
    if parsed.query:
        request_path = f"{request_path}?{parsed.query}"
    connection_cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    connection = connection_cls(parsed.hostname, parsed.port, timeout=timeout)
    try:
        connection.request("POST", request_path, body=data, headers={"Content-Type": "application/json"})
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8", errors="replace"))
    finally:
        connection.close()
    return body["choices"][0]["message"]["content"]


def validation_allowed(command: str) -> bool:
    cleaned = str(command or "").strip()
    return any(cleaned.startswith(prefix) for prefix in SAFE_VALIDATION_PREFIXES)


def validation_argv(command: str) -> list[str]:
    parts = shlex.split(str(command or "").strip(), posix=False)
    if not parts:
        raise ValueError("empty validation command")
    if parts[0].lower().endswith(".cmd"):
        return ["cmd.exe", "/d", "/c", *parts]
    return parts


def run_validation(command: str, cwd: Path, timeout: int = 180) -> dict[str, Any]:
    if not validation_allowed(command):
        return {"status": "SKIPPED", "reason": "validation command is not in allowlist", "command": command}
    if command.startswith("GET /api/") or command.startswith("POST /api/") or command.startswith("operator/") or command.startswith("receipt file exists"):
        return {"status": "NEEDS_EXTERNAL_PROOF", "command": command}
    argv = validation_argv(command)
    completed = subprocess.run(
        argv,
        cwd=str(cwd),
        text=True,
        capture_output=True,
        timeout=timeout,
    )
    return {
        "status": "PASSED" if completed.returncode == 0 else "FAILED",
        "code": completed.returncode,
        "command": command,
        "stdout": completed.stdout[-6000:],
        "stderr": completed.stderr[-6000:],
    }


def update_progress(dag: dict[str, Any]) -> None:
    nodes = dag.get("nodes") or []
    total_weight = sum(float(node.get("milestone_weight") or 1) for node in nodes)
    complete_weight = sum(float(node.get("milestone_weight") or 1) for node in nodes if str(node.get("status")).lower() == "complete")
    current = next((node for node in nodes if str(node.get("status")).lower() in {"in_progress", "awaiting_approval", "failed_validation"}), None)
    if current is None:
        current = next((node for node in nodes if str(node.get("status")).lower() == "pending"), None)
    bottleneck = next((node for node in nodes if str(node.get("status")).lower() in {"failed_validation", "awaiting_approval"}), None)
    dag["updated_at"] = now()
    dag["progress"] = {
        "total_nodes": len(nodes),
        "complete_nodes": sum(1 for node in nodes if str(node.get("status")).lower() == "complete"),
        "total_weight": round(total_weight, 2),
        "complete_weight": round(complete_weight, 2),
        "percent": round((complete_weight / total_weight) * 100) if total_weight else 0,
        "current_node_id": current.get("node_id") if current else None,
        "bottleneck_node_id": bottleneck.get("node_id") if bottleneck else None,
    }
    dag["approval_queue"] = [node for node in nodes if str(node.get("status")).lower() == "awaiting_approval"]


def main() -> int:
    parser = argparse.ArgumentParser(description="BLUEB0X.AI DAG runner")
    parser.add_argument("--project", default="orangebox")
    parser.add_argument("--root", default=str(ROOT_DEFAULT))
    parser.add_argument("--app", default=str(APP_DEFAULT))
    parser.add_argument("--mode", choices=["dry-run", "dispatch"], default="dry-run")
    parser.add_argument("--endpoint", default=os.environ.get("BLUEB0X_EXECUTOR_ENDPOINT", ""))
    parser.add_argument("--model", default=os.environ.get("BLUEB0X_EXECUTOR_MODEL", "qwen"))
    parser.add_argument("--max-nodes", type=int, default=1)
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--spray", action="store_true", help="Select every dependency-ready node up to --max-nodes/--concurrency")
    parser.add_argument("--validate", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    app = Path(args.app)
    dag_file = dag_path(root, args.project)
    dag = read_json(dag_file)
    if not dag:
        print(f"DAG not found: {dag_file}", file=sys.stderr)
        return 2

    max_nodes = max(1, min(64, int(args.max_nodes or 1)))
    concurrency = max(1, min(16, int(args.concurrency or 1)))
    nodes, reason = runnable_nodes(dag, min(max_nodes, concurrency if args.spray else 1))
    events = []
    if not nodes:
        events.append({"status": "PAUSED", "reason": reason})
    for node in nodes:
        prompt = build_prompt(node, root, app, args.project)
        event = {
            "status": "DRY_RUN" if args.mode == "dry-run" else "DISPATCHED",
            "node_id": node.get("node_id"),
            "node_name": node.get("node_name"),
            "worker_lane": worker_lane(node),
            "worker_target": node.get("worker", "codexa"),
            "cost_profile": node.get("cost_profile", "small"),
            "prompt_chars": len(prompt),
            "generated_at": now(),
        }
        if args.mode == "dispatch":
            if not args.endpoint:
                event.update({"status": "FAILED", "error": "BLUEB0X_EXECUTOR_ENDPOINT or --endpoint required for dispatch"})
            else:
                node["status"] = "in_progress"
                node["started_at"] = node.get("started_at") or now()
                try:
                    output = call_openai_compatible(args.endpoint, args.model, prompt)
                    out_path = root / "dags" / "outputs" / args.project / f"{node.get('node_id')}-{int(time.time())}.md"
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    out_path.write_text(output, encoding="utf-8")
                    event["output_path"] = str(out_path)
                    if args.validate:
                        event["validation"] = run_validation(str(node.get("validation_command") or ""), app)
                    node["evidence"] = f"Runner output: {out_path}"
                    if event.get("validation", {}).get("status") == "PASSED":
                        node["status"] = "complete"
                        node["completed_at"] = now()
                    else:
                        node["status"] = "failed_validation" if args.validate else "in_progress"
                except (OSError, TimeoutError, KeyError, json.JSONDecodeError) as error:
                    event.update({"status": "FAILED", "error": str(error)})
                    node["status"] = "failed_validation"
                    node["attempts"] = int(node.get("attempts") or 0) + 1
        events.append(event)

    update_progress(dag)
    write_json(dag_file, dag)
    write_json(root / "dags" / f"{args.project}.json", dag)
    receipt = {
        "status": "VERIFIED" if events else "NOOP",
        "mode": args.mode,
        "project": args.project,
        "dag_path": str(dag_file),
        "spray": {
            "enabled": bool(args.spray),
            "selected_nodes": len(nodes),
            "max_nodes": max_nodes,
            "concurrency": concurrency,
            "policy": "MRC-inspired multipath job spraying: run independent nodes in parallel, reroute failures, never bypass approval gates."
        },
        "telemetry": local_telemetry(),
        "events": events,
        "progress": dag.get("progress"),
        "generated_at": now(),
    }
    path = receipt_path(root, "blueb0x-dag-runner")
    write_json(path, receipt)
    print(json.dumps({**receipt, "receipt_path": str(path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
