/* shell-stream.mjs — v6.0.8 persistent shell-session with streamed output
   Not a full PTY (ANSI rendering happens client-side). What it IS:
     - Each session = spawn pwsh.exe -NoLogo -NoProfile -Command -
     - stdin = command + newline
     - stdout/stderr = streamed back via SSE
     - Per-session id + state, refcounted
   Good enough for: ls/dir, where, echo, git status, builds. Not interactive prompts.
*/
import { spawn } from "node:child_process";

const SESSIONS = new Map(); // id → { proc, stdoutBuf, stderrBuf, alive }

export function startSession(id) {
  if (SESSIONS.has(id)) return SESSIONS.get(id);
  const shellCmd = process.platform === "win32" ? "powershell.exe" : (process.env.SHELL || "bash");
  const args = process.platform === "win32"
    ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", "-"]
    : ["-i"];
  // windowsHide:true + DETACHED prevents the black flash on every spawn.
  const proc = spawn(shellCmd, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform === "win32",
  });
  const session = {
    id,
    proc,
    alive: true,
    started: Date.now(),
    listeners: new Set(),
  };
  proc.stdout.on("data", d => {
    for (const l of session.listeners) l({ stream: "stdout", text: d.toString("utf8") });
  });
  proc.stderr.on("data", d => {
    for (const l of session.listeners) l({ stream: "stderr", text: d.toString("utf8") });
  });
  proc.on("exit", code => {
    session.alive = false;
    for (const l of session.listeners) l({ stream: "exit", code });
  });
  SESSIONS.set(id, session);
  return session;
}

export function killSession(id) {
  const s = SESSIONS.get(id);
  if (!s) return false;
  try { s.proc.kill(); } catch {}
  SESSIONS.delete(id);
  return true;
}

export function killAllSessions() {
  const killed = [];
  for (const id of [...SESSIONS.keys()]) {
    if (killSession(id)) killed.push(id);
  }
  return { ok: true, killed_count: killed.length, killed };
}

export function listSessions() {
  return [...SESSIONS.keys()].map(id => {
    const s = SESSIONS.get(id);
    return { id, alive: s.alive, started: s.started, pid: s.proc.pid };
  });
}

export function sendInput(id, text) {
  const s = SESSIONS.get(id);
  if (!s || !s.alive) return false;
  s.proc.stdin.write(text);
  if (!text.endsWith("\n")) s.proc.stdin.write("\n");
  return true;
}

export function subscribe(id, fn) {
  const s = SESSIONS.get(id);
  if (!s) return () => {};
  s.listeners.add(fn);
  return () => s.listeners.delete(fn);
}
