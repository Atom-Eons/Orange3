#!/usr/bin/env python3
"""
Ethereal Socket Daemon

Cross-platform raw TCP file transfer for direct AI-box links.

Design:
- Standard-library only.
- Auth token required unless explicitly disabled.
- File access is constrained to an allow-listed root.
- GET and PUT use a length-prefixed JSON control plane plus raw file bytes.
- socket.sendfile() is used when available; buffered fallback works everywhere.
- Client writes transfer receipts with SHA-256 and throughput.

This is not SMB, not a mounted drive, and not a shell. It is a narrow data pipe.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import socket
import struct
import sys
import tempfile
import time
from pathlib import Path
from typing import BinaryIO, Dict, Iterable, Optional, Tuple


VERSION = "orangebox-ethereal-socket/v1"
DEFAULT_PORT = 9999
DEFAULT_CHUNK = 1024 * 1024
MAX_HEADER = 1024 * 1024


class ProtocolError(RuntimeError):
    pass


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def load_token(token: str = "", token_file: str = "") -> str:
    def clean(value: str) -> str:
        return value.strip().lstrip("\ufeff").strip()
    if token:
        return clean(token)
    if token_file:
        p = Path(token_file)
        if p.exists():
            return clean(p.read_text(encoding="utf-8-sig"))
    env = os.environ.get("ETHEREAL_SOCKET_TOKEN", "").strip()
    return clean(env)


def ensure_token_file(path: Path) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    token = secrets.token_urlsafe(32)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(token + "\n", encoding="utf-8")
    return token


def send_json(sock: socket.socket, payload: Dict) -> None:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    if len(raw) > MAX_HEADER:
        raise ProtocolError("JSON header too large")
    sock.sendall(struct.pack("!I", len(raw)))
    sock.sendall(raw)


def recvall(sock: socket.socket, n: int) -> bytes:
    chunks = []
    remaining = n
    while remaining > 0:
        chunk = sock.recv(min(remaining, 65536))
        if not chunk:
            raise ProtocolError("connection closed while receiving")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def recv_json(sock: socket.socket) -> Dict:
    raw_len = recvall(sock, 4)
    (length,) = struct.unpack("!I", raw_len)
    if length <= 0 or length > MAX_HEADER:
        raise ProtocolError(f"bad JSON header length: {length}")
    raw = recvall(sock, length)
    return json.loads(raw.decode("utf-8"))


def sha256_file(path: Path, chunk_size: int = DEFAULT_CHUNK) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def safe_relative_path(root: Path, user_path: str) -> Path:
    if not user_path:
        raise ProtocolError("path is required")
    candidate = Path(user_path)
    if candidate.is_absolute():
        raise ProtocolError("absolute paths are not accepted; use a path relative to the served root")
    if any(part in ("..", "") for part in candidate.parts):
        raise ProtocolError("path traversal is not accepted")
    resolved = (root / candidate).resolve()
    root_resolved = root.resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError as exc:
        raise ProtocolError("resolved path escapes served root") from exc
    return resolved


def make_receipt(path: Path, payload: Dict) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out = path / f"ethereal-socket-transfer-{stamp}-{secrets.token_hex(4)}.json"
    out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return out


def send_file_bytes(sock: socket.socket, file_obj: BinaryIO, count: int, chunk_size: int = DEFAULT_CHUNK) -> Tuple[int, str]:
    sent = 0
    mode = "socket.sendfile"
    try:
        while sent < count:
            n = sock.sendfile(file_obj, offset=sent, count=count - sent)
            if n is None:
                sent = count
                break
            if n == 0:
                break
            sent += n
        return sent, mode
    except Exception:
        mode = "buffered"
        file_obj.seek(sent)
        while sent < count:
            chunk = file_obj.read(min(chunk_size, count - sent))
            if not chunk:
                break
            sock.sendall(chunk)
            sent += len(chunk)
        return sent, mode


def require_auth(request: Dict, token: str, allow_no_token: bool = False) -> None:
    if allow_no_token and not token:
        return
    if not token:
        raise ProtocolError("server token is not configured")
    supplied = str(request.get("token", ""))
    if not secrets.compare_digest(supplied, token):
        raise ProtocolError("bad token")


def list_root(root: Path, rel: str = "", limit: int = 200) -> Dict:
    base = safe_relative_path(root, rel) if rel else root.resolve()
    if not base.exists() or not base.is_dir():
        raise ProtocolError("list target is not a directory")
    items = []
    for child in sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        try:
            stat = child.stat()
        except OSError:
            continue
        items.append({
            "name": child.name,
            "kind": "dir" if child.is_dir() else "file",
            "bytes": stat.st_size,
            "mtime": stat.st_mtime,
        })
        if len(items) >= limit:
            break
    return {"ok": True, "version": VERSION, "root": str(root), "path": rel, "items": items}


def handle_client(conn: socket.socket, addr: Tuple[str, int], *, root: Path, token: str, allow_put: bool, allow_no_token: bool) -> None:
    try:
        request = recv_json(conn)
        require_auth(request, token, allow_no_token=allow_no_token)
        op = str(request.get("op", "")).lower()
        if op == "ping":
            send_json(conn, {"ok": True, "version": VERSION, "time": now_iso(), "addr": addr[0]})
            return
        if op == "list":
            send_json(conn, list_root(root, str(request.get("path", "")), int(request.get("limit", 200))))
            return
        if op == "stat":
            path = safe_relative_path(root, str(request.get("path", "")))
            if not path.exists() or not path.is_file():
                raise ProtocolError("file not found")
            stat = path.stat()
            response = {"ok": True, "version": VERSION, "bytes": stat.st_size, "mtime": stat.st_mtime}
            if request.get("hash"):
                response["sha256"] = sha256_file(path)
            send_json(conn, response)
            return
        if op == "get":
            path = safe_relative_path(root, str(request.get("path", "")))
            if not path.exists() or not path.is_file():
                raise ProtocolError("file not found")
            stat = path.stat()
            header = {"ok": True, "version": VERSION, "bytes": stat.st_size, "mtime": stat.st_mtime, "path": str(request.get("path", ""))}
            send_json(conn, header)
            with path.open("rb") as handle:
                sent, mode = send_file_bytes(conn, handle, stat.st_size)
            if sent != stat.st_size:
                raise ProtocolError(f"short send: {sent}/{stat.st_size}")
            return
        if op == "put":
            if not allow_put:
                raise ProtocolError("PUT is disabled on this server")
            rel = str(request.get("path", ""))
            size = int(request.get("bytes", -1))
            if size < 0:
                raise ProtocolError("PUT requires bytes")
            dest = safe_relative_path(root, rel)
            dest.parent.mkdir(parents=True, exist_ok=True)
            send_json(conn, {"ok": True, "version": VERSION, "ready": True, "path": rel})
            tmp = dest.with_suffix(dest.suffix + ".ethereal-part")
            h = hashlib.sha256()
            remaining = size
            with tmp.open("wb") as handle:
                while remaining > 0:
                    chunk = conn.recv(min(DEFAULT_CHUNK, remaining))
                    if not chunk:
                        raise ProtocolError("connection closed during PUT")
                    handle.write(chunk)
                    h.update(chunk)
                    remaining -= len(chunk)
            tmp.replace(dest)
            send_json(conn, {"ok": True, "version": VERSION, "bytes": size, "sha256": h.hexdigest(), "path": rel})
            return
        raise ProtocolError(f"unknown op: {op}")
    except Exception as exc:
        try:
            send_json(conn, {"ok": False, "version": VERSION, "error": str(exc)})
        except Exception:
            pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


def serve(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    token = load_token(args.token, args.token_file)
    if not token and not args.allow_no_token:
        raise SystemExit("Refusing to start without token. Use --token-file, --token, ETHEREAL_SOCKET_TOKEN, or --allow-no-token for isolated lab use.")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((args.host, args.port))
        server.listen(args.backlog)
        print(json.dumps({
            "ok": True,
            "version": VERSION,
            "mode": "serve",
            "host": args.host,
            "port": args.port,
            "root": str(root),
            "allow_put": bool(args.allow_put),
            "token_required": not args.allow_no_token,
        }, sort_keys=True), flush=True)
        while True:
            conn, addr = server.accept()
            handle_client(conn, addr, root=root, token=token, allow_put=args.allow_put, allow_no_token=args.allow_no_token)


def open_client(args: argparse.Namespace) -> socket.socket:
    sock = socket.create_connection((args.host, args.port), timeout=args.timeout)
    sock.settimeout(args.timeout)
    return sock


def client_request(args: argparse.Namespace, payload: Dict) -> Dict:
    token = load_token(args.token, args.token_file)
    if token:
        payload["token"] = token
    with open_client(args) as sock:
        send_json(sock, payload)
        return recv_json(sock)


def cmd_ping(args: argparse.Namespace) -> int:
    print(json.dumps(client_request(args, {"op": "ping"}), indent=2, sort_keys=True))
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    out = client_request(args, {"op": "list", "path": args.path, "limit": args.limit})
    print(json.dumps(out, indent=2, sort_keys=True))
    return 0 if out.get("ok") else 2


def cmd_get(args: argparse.Namespace) -> int:
    token = load_token(args.token, args.token_file)
    request = {"op": "get", "path": args.remote}
    if token:
        request["token"] = token
    if args.verify_remote_hash:
        stat = client_request(args, {"op": "stat", "path": args.remote, "hash": True})
        if not stat.get("ok"):
            print(json.dumps(stat, indent=2, sort_keys=True), file=sys.stderr)
            return 2
        remote_hash = stat.get("sha256")
    else:
        remote_hash = None
    dest = Path(args.local).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".ethereal-part")
    started = time.time()
    h = hashlib.sha256()
    with open_client(args) as sock:
        send_json(sock, request)
        header = recv_json(sock)
        if not header.get("ok"):
            print(json.dumps(header, indent=2, sort_keys=True), file=sys.stderr)
            return 2
        remaining = int(header["bytes"])
        total = remaining
        with tmp.open("wb") as handle:
            while remaining > 0:
                chunk = sock.recv(min(DEFAULT_CHUNK, remaining))
                if not chunk:
                    raise ProtocolError("connection closed during GET")
                handle.write(chunk)
                h.update(chunk)
                remaining -= len(chunk)
    digest = h.hexdigest()
    if remote_hash and digest != remote_hash:
        tmp.unlink(missing_ok=True)
        raise ProtocolError(f"hash mismatch: local {digest} != remote {remote_hash}")
    tmp.replace(dest)
    elapsed = max(time.time() - started, 0.000001)
    receipt = {
        "ok": True,
        "version": VERSION,
        "op": "get",
        "remote": args.remote,
        "local": str(dest),
        "bytes": total,
        "sha256": digest,
        "remote_sha256": remote_hash,
        "seconds": elapsed,
        "mbps": (total * 8 / elapsed) / 1_000_000,
        "host": args.host,
        "port": args.port,
        "created_at": now_iso(),
    }
    receipt_path = make_receipt(Path(args.receipts), receipt)
    receipt["receipt_path"] = str(receipt_path)
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


def cmd_put(args: argparse.Namespace) -> int:
    src = Path(args.local).resolve()
    if not src.exists() or not src.is_file():
        raise SystemExit(f"local file not found: {src}")
    token = load_token(args.token, args.token_file)
    size = src.stat().st_size
    request = {"op": "put", "path": args.remote, "bytes": size}
    if token:
        request["token"] = token
    started = time.time()
    with open_client(args) as sock:
        send_json(sock, request)
        ready = recv_json(sock)
        if not ready.get("ok"):
            print(json.dumps(ready, indent=2, sort_keys=True), file=sys.stderr)
            return 2
        with src.open("rb") as handle:
            sent, mode = send_file_bytes(sock, handle, size)
        if sent != size:
            raise ProtocolError(f"short send: {sent}/{size}")
        final = recv_json(sock)
    digest = sha256_file(src)
    elapsed = max(time.time() - started, 0.000001)
    receipt = {
        "ok": bool(final.get("ok")),
        "version": VERSION,
        "op": "put",
        "local": str(src),
        "remote": args.remote,
        "bytes": size,
        "sha256": digest,
        "remote_sha256": final.get("sha256"),
        "send_mode": mode,
        "seconds": elapsed,
        "mbps": (size * 8 / elapsed) / 1_000_000,
        "host": args.host,
        "port": args.port,
        "created_at": now_iso(),
    }
    receipt_path = make_receipt(Path(args.receipts), receipt)
    receipt["receipt_path"] = str(receipt_path)
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if final.get("ok") else 2


def add_client_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--host", default="10.0.99.1")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--token", default="")
    parser.add_argument("--token-file", default="")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ethereal-socket", description="Raw TCP file pipe for Ethereal AI Link")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_token = sub.add_parser("token", help="create or read a token file")
    p_token.add_argument("--token-file", required=True)

    p_serve = sub.add_parser("serve", help="run the daemon")
    p_serve.add_argument("--host", default="10.0.99.1")
    p_serve.add_argument("--port", type=int, default=DEFAULT_PORT)
    p_serve.add_argument("--root", required=True)
    p_serve.add_argument("--token", default="")
    p_serve.add_argument("--token-file", default="")
    p_serve.add_argument("--allow-no-token", action="store_true")
    p_serve.add_argument("--allow-put", action="store_true")
    p_serve.add_argument("--backlog", type=int, default=16)

    p_ping = sub.add_parser("ping", help="ping the daemon protocol")
    add_client_common(p_ping)

    p_list = sub.add_parser("list", help="list files under the served root")
    add_client_common(p_list)
    p_list.add_argument("path", nargs="?", default="")
    p_list.add_argument("--limit", type=int, default=200)

    p_get = sub.add_parser("get", help="download a file")
    add_client_common(p_get)
    p_get.add_argument("remote")
    p_get.add_argument("local")
    p_get.add_argument("--verify-remote-hash", action="store_true")
    p_get.add_argument("--receipts", default=str(Path.home() / "OrangeBox-Data" / "receipts"))

    p_put = sub.add_parser("put", help="upload a file")
    add_client_common(p_put)
    p_put.add_argument("local")
    p_put.add_argument("remote")
    p_put.add_argument("--receipts", default=str(Path.home() / "OrangeBox-Data" / "receipts"))
    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.cmd == "token":
        print(ensure_token_file(Path(args.token_file)))
        return 0
    if args.cmd == "serve":
        return serve(args)
    if args.cmd == "ping":
        return cmd_ping(args)
    if args.cmd == "list":
        return cmd_list(args)
    if args.cmd == "get":
        return cmd_get(args)
    if args.cmd == "put":
        return cmd_put(args)
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
