// =============================================================================
// ORANGEBOX v4 — Mobile Companion API Server
// Doctrine: ATOM-OBX-V4-MOAT-2026-0516
// Rule: Receipts everywhere. No claim without proof. Every action emits a receipt.
// Rule: Local-first by default. Cloud is opt-in.
// Rule: The operator is the chairman. Human Final Stop Authority reachable always.
// Rule: Phone is NEVER given direct DAG-mutation authority for destructive actions.
//       Phone can only approve/deny prompts the cockpit raises.
// Rule: Mom's Law — full effort, no coasting, no theater.
//
// Purpose:
//   HTTP + WebSocket API server the cockpit exposes to the mobile companion app.
//   Pairing: phone pairs once via QR code → receives Ed25519-signed bearer token.
//   All subsequent requests use that token.
//
// Port: process.env.ORANGEBOX_MOBILE_PORT || 8781
// Data root: process.env.ORANGEBOX_DATA_ROOT || ~/.orangebox
//   mobile/devices.json        — paired device registry
//   mobile/approvals.json      — pending + resolved approval queue
//   receipts/mobile/<id>.json  — one receipt per action
//
// REST endpoints (all require Bearer token except /health):
//   GET  /v1/mobile/health
//   GET  /v1/mobile/dag
//   GET  /v1/mobile/party-line/recent?limit=50
//   POST /v1/mobile/party-line
//   GET  /v1/mobile/queue
//   POST /v1/mobile/approve/:approvalId
//   POST /v1/mobile/deny/:approvalId
//   GET  /v1/mobile/receipts/recent?limit=20
//
// WebSocket: /v1/mobile/stream
//   Server pushes: party-line messages, approval requests, DAG changes, receipts.
//
// Rate limit: 200 req/min per token.
// Zero npm deps. Built-in node:http, node:crypto, node:fs only.
// =============================================================================

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.ORANGEBOX_MOBILE_PORT) || 8781;
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
const MOBILE_DIR = path.join(DATA_ROOT, "mobile");
const DEVICES_PATH = path.join(MOBILE_DIR, "devices.json");
const APPROVALS_PATH = path.join(MOBILE_DIR, "approvals.json");
const RECEIPTS_DIR = path.join(DATA_ROOT, "receipts", "mobile");
const QUEUE_STATE_PATH = path.join(DATA_ROOT, "queue", "state.json");

// Party-line ring buffer: last N messages held in memory
const PARTY_LINE_BUFFER_SIZE = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 200;
const WS_PING_INTERVAL_MS = 25_000;
const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

let partyLineBuffer = []; // { id, from, text, at, deviceId? }
let wsClients = new Map(); // socketId -> { socket, deviceId, dead }
let rateLimitMap = new Map(); // deviceId -> { count, windowStart }

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

async function ensureDirs() {
  await fs.mkdir(MOBILE_DIR, { recursive: true });
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  await fs.mkdir(path.join(DATA_ROOT, "queue"), { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp." + process.pid;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

// ---------------------------------------------------------------------------
// UUID v4 — pure built-in
// ---------------------------------------------------------------------------

function uuidv4() {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

// ---------------------------------------------------------------------------
// Ed25519 token validation
// Tokens are structured JWTs signed with Ed25519.
// Format: base64url(header) . base64url(payload) . base64url(signature)
// ---------------------------------------------------------------------------

function b64urlDecode(str) {
  // Convert base64url to base64
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * verifyToken(tokenStr, publicKeyDer) → payload object | null
 * publicKeyDer: Buffer — raw DER-encoded Ed25519 public key
 */
function verifyToken(tokenStr, publicKeyDer) {
  try {
    const parts = tokenStr.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const message = Buffer.from(`${headerB64}.${payloadB64}`);
    const sig = b64urlDecode(sigB64);
    const publicKey = crypto.createPublicKey({ key: publicKeyDer, format: "der", type: "spki" });
    const valid = crypto.verify(null, message, publicKey, sig);
    if (!valid) return null;
    const payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * issueToken({ privateKeyDer, deviceId, deviceName, expiresInDays })
 * Returns a signed JWT string.
 */
function issueToken({ privateKeyDer, deviceId, deviceName, expiresInDays = 365 }) {
  const header = b64urlEncode(JSON.stringify({ alg: "EdDSA", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(
    JSON.stringify({
      sub: deviceId,
      name: deviceName,
      iat: now,
      exp: now + expiresInDays * 86400,
      iss: "orangebox-v4-cockpit",
    })
  );
  const message = Buffer.from(`${header}.${payload}`);
  const privateKey = crypto.createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
  const sig = b64urlEncode(crypto.sign(null, message, privateKey));
  return `${header}.${payload}.${sig}`;
}

// ---------------------------------------------------------------------------
// Devices registry
// ---------------------------------------------------------------------------

async function loadDevices() {
  return readJson(DEVICES_PATH, { version: 1, devices: [] });
}

async function saveDevices(data) {
  await writeJsonAtomic(DEVICES_PATH, data);
}

async function getPublicKey() {
  const reg = await loadDevices();
  if (!reg.publicKeyDer) return null;
  return Buffer.from(reg.publicKeyDer, "base64");
}

async function authenticateToken(tokenStr) {
  if (!tokenStr) return null;
  const pubKey = await getPublicKey();
  if (!pubKey) return null;
  const payload = verifyToken(tokenStr, pubKey);
  if (!payload) return null;
  // Check device is still active
  const reg = await loadDevices();
  const device = reg.devices.find((d) => d.id === payload.sub);
  if (!device || device.revoked) return null;
  // Update last seen
  device.lastSeen = new Date().toISOString();
  await saveDevices(reg);
  return { deviceId: device.id, deviceName: device.name, payload };
}

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, per deviceId)
// ---------------------------------------------------------------------------

function checkRateLimit(deviceId) {
  const now = Date.now();
  let entry = rateLimitMap.get(deviceId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    rateLimitMap.set(deviceId, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// ---------------------------------------------------------------------------
// Approvals I/O
// ---------------------------------------------------------------------------

async function loadApprovals() {
  return readJson(APPROVALS_PATH, { version: 1, approvals: [] });
}

async function saveApprovals(data) {
  await writeJsonAtomic(APPROVALS_PATH, data);
}

async function getPendingApprovals() {
  const data = await loadApprovals();
  return data.approvals.filter((a) => a.status === "pending");
}

async function resolveApproval(approvalId, decision, deviceId) {
  const data = await loadApprovals();
  const idx = data.approvals.findIndex((a) => a.id === approvalId);
  if (idx === -1) return { error: "not_found" };
  const approval = data.approvals[idx];
  if (approval.status !== "pending") return { error: "already_resolved", current: approval.status };
  data.approvals[idx] = {
    ...approval,
    status: decision,
    resolvedAt: new Date().toISOString(),
    resolvedBy: deviceId,
  };
  await saveApprovals(data);
  await emitReceipt({
    id: approvalId,
    transition: `pending→${decision}`,
    summary: `Approval ${decision}: ${approval.title}`,
    evidence: { decision, deviceId, approvalId, title: approval.title },
  });
  return { ok: true, approval: data.approvals[idx] };
}

// ---------------------------------------------------------------------------
// Queue read (read-only — queue is owned by bg-agent-queue.mjs)
// ---------------------------------------------------------------------------

async function getQueueJobs() {
  return readJson(QUEUE_STATE_PATH, { version: 1, jobs: [] });
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

async function emitReceipt({ id, transition, summary, evidence }) {
  await ensureDirs();
  const receipt = {
    id: id || uuidv4(),
    transition,
    at: new Date().toISOString(),
    summary: summary || "",
    evidence: evidence || {},
  };
  const safe = (transition || "").replace(/[^a-z0-9]/g, "-");
  const rp = path.join(RECEIPTS_DIR, `${receipt.id}-${safe}.json`);
  await fs.writeFile(rp, JSON.stringify(receipt, null, 2), "utf8");
  return rp;
}

async function getRecentReceipts(limit = 20) {
  try {
    const files = await fs.readdir(RECEIPTS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    // Read mtime for sorting
    const withStat = await Promise.all(
      jsonFiles.map(async (f) => {
        const fp = path.join(RECEIPTS_DIR, f);
        const stat = await fs.stat(fp);
        return { fp, mtime: stat.mtimeMs };
      })
    );
    withStat.sort((a, b) => b.mtime - a.mtime);
    const top = withStat.slice(0, limit);
    const receipts = await Promise.all(
      top.map(async ({ fp }) => {
        try {
          return JSON.parse(await fs.readFile(fp, "utf8"));
        } catch {
          return null;
        }
      })
    );
    return receipts.filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Party-line buffer
// ---------------------------------------------------------------------------

function pushToPartyLine(msg) {
  partyLineBuffer.push(msg);
  if (partyLineBuffer.length > PARTY_LINE_BUFFER_SIZE) {
    partyLineBuffer = partyLineBuffer.slice(-PARTY_LINE_BUFFER_SIZE);
  }
}

function recentPartyLine(limit = 50) {
  return partyLineBuffer.slice(-limit);
}

// ---------------------------------------------------------------------------
// Minimal WebSocket frame codec (RFC 6455, server-side, no deps)
// Handles: text frames (opcode 0x1), ping/pong (0x9/0xA), close (0x8).
// Client frames are always masked (browser spec); server frames are unmasked.
// ---------------------------------------------------------------------------

const WS_OPCODE_CONTINUATION = 0x0;
const WS_OPCODE_TEXT = 0x1;
const WS_OPCODE_BINARY = 0x2;
const WS_OPCODE_CLOSE = 0x8;
const WS_OPCODE_PING = 0x9;
const WS_OPCODE_PONG = 0xa;

/**
 * encodeWsFrame(payload, opcode) → Buffer
 * payload: Buffer or string
 */
function encodeWsFrame(payload, opcode = WS_OPCODE_TEXT) {
  const buf = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
  const len = buf.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode; // FIN + opcode
    header[1] = len; // no mask, length
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    // 64-bit length: write as two 32-bit values (we'll never exceed 4GB)
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, buf]);
}

/**
 * WsFrameParser — streaming parser for incoming masked client frames.
 * Usage: parser = new WsFrameParser(); parser.push(chunk) → array of frames
 * Each frame: { opcode, payload: Buffer, fin }
 */
class WsFrameParser {
  constructor() {
    this._buf = Buffer.alloc(0);
  }

  push(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    const frames = [];
    while (true) {
      const frame = this._tryParse();
      if (!frame) break;
      frames.push(frame);
    }
    return frames;
  }

  _tryParse() {
    const buf = this._buf;
    if (buf.length < 2) return null;

    const fin = !!(buf[0] & 0x80);
    const opcode = buf[0] & 0x0f;
    const masked = !!(buf[1] & 0x80);
    let lenByte = buf[1] & 0x7f;
    let offset = 2;

    let payloadLen;
    if (lenByte < 126) {
      payloadLen = lenByte;
    } else if (lenByte === 126) {
      if (buf.length < 4) return null;
      payloadLen = buf.readUInt16BE(2);
      offset = 4;
    } else {
      // 127 — 8-byte extended
      if (buf.length < 10) return null;
      // We only support up to 2^32 for safety
      payloadLen = buf.readUInt32BE(6);
      offset = 10;
    }

    const maskLen = masked ? 4 : 0;
    const totalLen = offset + maskLen + payloadLen;
    if (buf.length < totalLen) return null;

    let maskBytes = null;
    if (masked) {
      maskBytes = buf.slice(offset, offset + 4);
      offset += 4;
    }

    const rawPayload = buf.slice(offset, offset + payloadLen);
    let payload;
    if (masked && maskBytes) {
      payload = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        payload[i] = rawPayload[i] ^ maskBytes[i % 4];
      }
    } else {
      payload = rawPayload;
    }

    this._buf = buf.slice(totalLen);
    return { fin, opcode, payload };
  }
}

// ---------------------------------------------------------------------------
// WebSocket client registry + broadcast
// ---------------------------------------------------------------------------

let wsClientCounter = 0;

function wsRegister(socket, deviceId) {
  const id = ++wsClientCounter;
  wsClients.set(id, { socket, deviceId, dead: false, parser: new WsFrameParser() });
  return id;
}

function wsUnregister(id) {
  const client = wsClients.get(id);
  if (client) client.dead = true;
  wsClients.delete(id);
}

function wsSend(clientId, obj) {
  const client = wsClients.get(clientId);
  if (!client || client.dead) return;
  try {
    const frame = encodeWsFrame(JSON.stringify(obj));
    client.socket.write(frame);
  } catch {
    wsUnregister(clientId);
  }
}

function wsBroadcast(obj, deviceIdFilter = null) {
  for (const [id, client] of wsClients) {
    if (client.dead) continue;
    if (deviceIdFilter && client.deviceId !== deviceIdFilter) continue;
    wsSend(id, obj);
  }
}

// Broadcast to ALL connected devices (operator's own phones)
function broadcastAll(obj) {
  wsBroadcast(obj);
}

// ---------------------------------------------------------------------------
// Push helpers — called by cockpit internals / other modules
// ---------------------------------------------------------------------------

/**
 * pushPartyLineMessage(msg) — add to buffer + push to all WS clients.
 * msg: { from, text, at?, deviceId? }
 */
function pushPartyLineMessage(msg) {
  const full = {
    id: uuidv4(),
    from: msg.from || "cockpit",
    text: msg.text,
    at: msg.at || new Date().toISOString(),
    deviceId: msg.deviceId || null,
  };
  pushToPartyLine(full);
  broadcastAll({ type: "party-line", data: full });
  return full;
}

/**
 * pushApprovalRequest(approval) — cockpit raises an agent approval.
 * approval: { title, description, command, diff?, destructive, metadata? }
 * Returns the stored approval record.
 */
async function pushApprovalRequest(approval) {
  const record = {
    id: uuidv4(),
    title: approval.title,
    description: approval.description || "",
    command: approval.command || null,
    diff: approval.diff || null,
    destructive: !!approval.destructive,
    metadata: approval.metadata || {},
    status: "pending",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
  };
  const data = await loadApprovals();
  data.approvals.push(record);
  await saveApprovals(data);
  broadcastAll({ type: "approval-request", data: record });
  return record;
}

/**
 * pushDagUpdate(dag) — notify all WS clients of a DAG change.
 * dag: { nodes, edges } (partial or full)
 */
function pushDagUpdate(dag) {
  broadcastAll({ type: "dag-update", data: dag });
}

/**
 * pushReceiptUpdate(receipt) — notify all WS clients of a new receipt.
 */
function pushReceiptUpdate(receipt) {
  broadcastAll({ type: "receipt", data: receipt });
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "X-OrangeBox-Version": "4.0",
  });
  res.end(payload);
}

function extractBearerToken(req) {
  const auth = req.headers["authorization"] || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function parseQueryParam(url, param) {
  try {
    const u = new URL(url, "http://localhost");
    return u.searchParams.get(param);
  } catch {
    return null;
  }
}

function routeMatch(pathname, pattern) {
  // pattern: "/v1/mobile/approve/:id" → returns { id: "..." } or null
  const patParts = pattern.split("/");
  const urlParts = pathname.split("/");
  if (patParts.length !== urlParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(":")) {
      params[patParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// WebSocket upgrade handler
// ---------------------------------------------------------------------------

function handleWsUpgrade(req, socket, head) {
  const url = req.url ? req.url.split("?")[0] : "";
  if (url !== "/v1/mobile/stream") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  // Authenticate via query param token (WS can't set headers easily from app)
  let rawToken = null;
  try {
    const u = new URL(req.url, "http://localhost");
    rawToken = u.searchParams.get("token");
  } catch {}

  // Fall back to Authorization header if present
  if (!rawToken) {
    const auth = req.headers["authorization"] || "";
    if (auth.startsWith("Bearer ")) rawToken = auth.slice(7).trim();
  }

  // Async auth then upgrade
  authenticateToken(rawToken)
    .then((auth) => {
      if (!auth) {
        socket.write(
          "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n"
        );
        socket.destroy();
        return;
      }

      // Complete the WS handshake
      const key = req.headers["sec-websocket-key"];
      if (!key) {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      const acceptKey = crypto
        .createHash("sha1")
        .update(key + WS_MAGIC)
        .digest("base64");

      socket.write(
        [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${acceptKey}`,
          "",
          "",
        ].join("\r\n")
      );

      const clientId = wsRegister(socket, auth.deviceId);

      // Send a hello frame
      wsSend(clientId, {
        type: "connected",
        deviceId: auth.deviceId,
        at: new Date().toISOString(),
      });

      // Ping interval to keep connection alive
      const pingTimer = setInterval(() => {
        const client = wsClients.get(clientId);
        if (!client || client.dead) {
          clearInterval(pingTimer);
          return;
        }
        try {
          client.socket.write(encodeWsFrame(Buffer.alloc(0), WS_OPCODE_PING));
        } catch {
          wsUnregister(clientId);
          clearInterval(pingTimer);
        }
      }, WS_PING_INTERVAL_MS);

      const client = wsClients.get(clientId);

      socket.on("data", (chunk) => {
        if (!client || client.dead) return;
        const frames = client.parser.push(chunk);
        for (const frame of frames) {
          if (frame.opcode === WS_OPCODE_PING) {
            try {
              socket.write(encodeWsFrame(frame.payload, WS_OPCODE_PONG));
            } catch {}
          } else if (frame.opcode === WS_OPCODE_CLOSE) {
            try {
              socket.write(encodeWsFrame(frame.payload.slice(0, 2), WS_OPCODE_CLOSE));
            } catch {}
            wsUnregister(clientId);
            clearInterval(pingTimer);
            socket.destroy();
          } else if (frame.opcode === WS_OPCODE_TEXT) {
            // Client→server messages: currently informational only
            // (phone cannot push commands via WS — REST only)
            try {
              const msg = JSON.parse(frame.payload.toString("utf8"));
              if (msg.type === "ping") {
                wsSend(clientId, { type: "pong", at: new Date().toISOString() });
              }
            } catch {}
          }
        }
      });

      socket.on("close", () => {
        wsUnregister(clientId);
        clearInterval(pingTimer);
      });

      socket.on("error", () => {
        wsUnregister(clientId);
        clearInterval(pingTimer);
      });
    })
    .catch(() => {
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleRequest(req, res) {
  const rawUrl = req.url || "/";
  const pathname = rawUrl.split("?")[0];
  const method = req.method || "GET";

  // Health — no auth
  if (method === "GET" && pathname === "/v1/mobile/health") {
    jsonResponse(res, 200, {
      ok: true,
      at: new Date().toISOString(),
      port: PORT,
      wsClients: wsClients.size,
      partyLineBuffered: partyLineBuffer.length,
    });
    return;
  }

  // Auth gate for all other routes
  const token = extractBearerToken(req);
  const auth = await authenticateToken(token);
  if (!auth) {
    jsonResponse(res, 401, { error: "unauthorized", hint: "provide Authorization: Bearer <pairing-token>" });
    return;
  }

  // Rate limit
  if (!checkRateLimit(auth.deviceId)) {
    jsonResponse(res, 429, { error: "rate_limit_exceeded", limit: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
    return;
  }

  // GET /v1/mobile/dag
  if (method === "GET" && pathname === "/v1/mobile/dag") {
    // Read from cockpit's DAG state file if present; else return stub
    const dagPath = path.join(DATA_ROOT, "dag", "current.json");
    const dag = await readJson(dagPath, {
      nodes: [],
      edges: [],
      updatedAt: null,
      _note: "dag/current.json not found — start the cockpit DAG engine",
    });
    jsonResponse(res, 200, { ok: true, dag });
    return;
  }

  // GET /v1/mobile/party-line/recent
  if (method === "GET" && pathname === "/v1/mobile/party-line/recent") {
    const limit = Math.min(Number(parseQueryParam(rawUrl, "limit") || 50), 200);
    jsonResponse(res, 200, { ok: true, messages: recentPartyLine(limit) });
    return;
  }

  // POST /v1/mobile/party-line
  if (method === "POST" && pathname === "/v1/mobile/party-line") {
    const body = await readBody(req);
    if (!body.text || typeof body.text !== "string" || !body.text.trim()) {
      jsonResponse(res, 400, { error: "text is required" });
      return;
    }
    const msg = pushPartyLineMessage({
      from: `device:${auth.deviceName}`,
      text: body.text.trim(),
      deviceId: auth.deviceId,
    });
    jsonResponse(res, 200, { ok: true, message: msg });
    return;
  }

  // GET /v1/mobile/queue
  if (method === "GET" && pathname === "/v1/mobile/queue") {
    const state = await getQueueJobs();
    jsonResponse(res, 200, {
      ok: true,
      jobs: state.jobs,
      total: state.jobs.length,
    });
    return;
  }

  // POST /v1/mobile/approve/:approvalId
  const approveMatch = routeMatch(pathname, "/v1/mobile/approve/:approvalId");
  if (method === "POST" && approveMatch) {
    const result = await resolveApproval(approveMatch.approvalId, "approved", auth.deviceId);
    if (result.error) {
      const status = result.error === "not_found" ? 404 : 409;
      jsonResponse(res, status, { error: result.error, current: result.current || null });
      return;
    }
    broadcastAll({ type: "approval-resolved", data: result.approval });
    jsonResponse(res, 200, { ok: true, approval: result.approval });
    return;
  }

  // POST /v1/mobile/deny/:approvalId
  const denyMatch = routeMatch(pathname, "/v1/mobile/deny/:approvalId");
  if (method === "POST" && denyMatch) {
    const result = await resolveApproval(denyMatch.approvalId, "denied", auth.deviceId);
    if (result.error) {
      const status = result.error === "not_found" ? 404 : 409;
      jsonResponse(res, status, { error: result.error, current: result.current || null });
      return;
    }
    broadcastAll({ type: "approval-resolved", data: result.approval });
    jsonResponse(res, 200, { ok: true, approval: result.approval });
    return;
  }

  // GET /v1/mobile/receipts/recent
  if (method === "GET" && pathname === "/v1/mobile/receipts/recent") {
    const limit = Math.min(Number(parseQueryParam(rawUrl, "limit") || 20), 100);
    const receipts = await getRecentReceipts(limit);
    jsonResponse(res, 200, { ok: true, receipts });
    return;
  }

  // 404
  jsonResponse(res, 404, { error: "not_found", path: pathname });
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

async function startServer() {
  await ensureDirs();

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error("[mobile-api] request error:", err.message || err);
      try {
        jsonResponse(res, 500, { error: "internal_server_error" });
      } catch {}
    });
  });

  server.on("upgrade", (req, socket, head) => {
    handleWsUpgrade(req, socket, head);
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[mobile-api] ORANGEBOX v4 Mobile API listening on port ${PORT}`);
    console.log(`[mobile-api] Data root: ${DATA_ROOT}`);
    console.log(`[mobile-api] Devices  : ${DEVICES_PATH}`);
    console.log(`[mobile-api] WS stream: ws://localhost:${PORT}/v1/mobile/stream?token=<pairing-token>`);
  });

  // Graceful shutdown
  const shutdown = (sig) => {
    console.log(`[mobile-api] ${sig} received — shutting down`);
    // Close all WS clients cleanly
    for (const [id, client] of wsClients) {
      try {
        client.socket.write(encodeWsFrame(Buffer.alloc(2), WS_OPCODE_CLOSE));
        client.socket.destroy();
      } catch {}
    }
    wsClients.clear();
    server.close(() => {
      console.log("[mobile-api] server closed.");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return server;
}

// ---------------------------------------------------------------------------
// Exports (for cockpit integration)
// ---------------------------------------------------------------------------

export {
  startServer,
  pushPartyLineMessage,
  pushApprovalRequest,
  pushDagUpdate,
  pushReceiptUpdate,
  issueToken,
  verifyToken,
  loadDevices,
  saveDevices,
  loadApprovals,
  saveApprovals,
  getPendingApprovals,
  DATA_ROOT,
  MOBILE_DIR,
  DEVICES_PATH,
  APPROVALS_PATH,
};

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  startServer().catch((err) => {
    console.error("[mobile-api] fatal:", err.message || err);
    process.exit(1);
  });
}
