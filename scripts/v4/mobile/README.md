# ORANGEBOX v4 — Mobile Companion API

Server + pairing CLI that the cockpit exposes to the ORANGEBOX companion phone app.

The phone app itself (React Native + Expo) is a separate codebase shipped later.
This directory is the backend: the HTTP/WebSocket API and the pairing tool.

---

## Files

| File | Purpose |
|---|---|
| `mobile-api-server.mjs` | HTTP + WebSocket server on port 8781 |
| `pairing-flow.mjs` | CLI: generate keypair, issue device tokens, manage devices |

---

## Quick start

### 1. Start the API server

```
node mobile-api-server.mjs
```

Default port: `8781`. Override with `ORANGEBOX_MOBILE_PORT=<port>`.

The server will log its LAN address and WebSocket endpoint on startup.

### 2. Initialize the keypair (one time per cockpit install)

```
node pairing-flow.mjs --init
```

This generates an Ed25519 keypair and prints a QR code. Scan the QR with the
companion app to load the cockpit's host, port, and public key.

### 3. Pair a phone

```
node pairing-flow.mjs --pair --device="iPhone 16 Pro"
```

Prints a bearer token. Enter this token in the companion app (or encode it
in a second QR code for scan-to-pair). The app stores the token in iOS Keychain /
Android Keystore.

### 4. List paired devices

```
node pairing-flow.mjs --list
```

### 5. Revoke a device

```
node pairing-flow.mjs --revoke="iPhone 16 Pro"
```

The revoked device can no longer authenticate. Tokens are verified against the
live device registry on every request.

---

## Architecture

```
  OPERATOR'S MACHINE
  ┌────────────────────────────────────────────────────────────┐
  │                                                            │
  │  ORANGEBOX Cockpit (Tauri)                                 │
  │    │                                                        │
  │    ├── bg-agent-queue  (~/.orangebox/queue/state.json)      │
  │    ├── DAG engine      (~/.orangebox/dag/current.json)      │
  │    ├── receipts        (~/.orangebox/receipts/mobile/)      │
  │    └── mobile devices  (~/.orangebox/mobile/devices.json)   │
  │                              │                              │
  │    mobile-api-server.mjs ────┘                              │
  │    port 8781                                                │
  │    REST + WebSocket (RFC 6455, no deps)                    │
  │                                                            │
  └─────────────────────────┬──────────────────────────────────┘
                            │ LAN / Internet
                            │
  PHONE
  ┌─────────────────────────┴──────────────────────────────────┐
  │                                                            │
  │  ORANGEBOX Companion App (React Native + Expo)             │
  │                                                            │
  │  Paired once via QR scan                                   │
  │  Token in Keychain / Keystore                             │
  │  REST: DAG, party-line, queue, approvals, receipts         │
  │  WS: real-time push (party-line, approvals, DAG, receipts) │
  │  Push notifications: APNS (iOS) + FCM (Android)            │
  │                                                            │
  └────────────────────────────────────────────────────────────┘
```

---

## REST endpoints

All require `Authorization: Bearer <pairing-token>` except `/health`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/mobile/health` | Heartbeat. No auth. |
| `GET` | `/v1/mobile/dag` | Current mission DAG. |
| `GET` | `/v1/mobile/party-line/recent?limit=50` | Recent party-line messages. |
| `POST` | `/v1/mobile/party-line` | Send a message from phone to cockpit. |
| `GET` | `/v1/mobile/queue` | All bg-agent queue jobs. |
| `POST` | `/v1/mobile/approve/:approvalId` | Approve a pending agent action. |
| `POST` | `/v1/mobile/deny/:approvalId` | Deny a pending agent action. |
| `GET` | `/v1/mobile/receipts/recent?limit=20` | Recent mobile receipts. |

---

## WebSocket stream

```
ws://<cockpit-ip>:8781/v1/mobile/stream?token=<pairing-token>
```

Server pushes JSON events:

| Event type | When |
|---|---|
| `connected` | Immediately after upgrade |
| `party-line` | New message posted |
| `approval-request` | Agent needs operator approval |
| `approval-resolved` | Approval approved or denied |
| `dag-update` | DAG node status changed |
| `receipt` | New receipt emitted |
| `pong` | Response to client ping |

---

## Phone authority

**Phone is NEVER given direct DAG-mutation authority for destructive actions.**

The phone can only approve or deny approval requests that the COCKPIT raises.
The cockpit enforces this at the API level. There is no endpoint for phone-originated
destructive mutations.

Destructive approvals require a 3-second hold-to-approve gesture in the companion app.
Single-tap approve is disabled for any action where `destructive: true`.

Full authority model: see `docs/v4/MOBILE_COMPANION_SPEC.md` section 53.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ORANGEBOX_MOBILE_PORT` | `8781` | API server port |
| `ORANGEBOX_DATA_ROOT` | `~/.orangebox` | Data directory root |
| `ORANGEBOX_APNS_KEY_ID` | — | APNs auth key ID (push notifications) |
| `ORANGEBOX_APNS_TEAM_ID` | — | Apple Developer team ID |
| `ORANGEBOX_APNS_KEY_PATH` | — | Path to `.p8` key file |
| `ORANGEBOX_APNS_BUNDLE_ID` | — | App bundle ID |
| `ORANGEBOX_FCM_PROJECT_ID` | — | Firebase project ID |
| `ORANGEBOX_FCM_SERVICE_ACCOUNT_PATH` | — | Path to FCM service account JSON |

Push notification env vars are optional. If absent, push is disabled and the server
logs a warning on startup.

---

## Data files

All written under `ORANGEBOX_DATA_ROOT` (default `~/.orangebox`):

```
~/.orangebox/
  mobile/
    devices.json       — paired device registry + Ed25519 keypair
    approvals.json     — pending + resolved approval queue
  receipts/
    mobile/
      <uuid>-<transition>.json   — one receipt per approval action
  dag/
    current.json       — written by cockpit DAG engine (read-only by API)
  queue/
    state.json         — written by bg-agent-queue.mjs (read-only by API)
```

---

## Rate limits

200 requests per minute per device token. WebSocket events do not count.
Exceeded: HTTP 429.

---

## Zero npm dependencies

`mobile-api-server.mjs` and `pairing-flow.mjs` use only Node.js built-in modules:
`node:http`, `node:crypto`, `node:fs`, `node:path`, `node:os`.

No install step. Run directly with `node`.

The WebSocket server (~200 LOC) is a self-contained RFC 6455 implementation.
The QR encoder (~250 LOC) is a self-contained QR Code Model 2 implementation.

---

## Full specification

See `../../docs/v4/MOBILE_COMPANION_SPEC.md` for:
- All 55 specification sections
- Wire format examples for every endpoint
- Screen-by-screen UX specification
- Push notification setup (APNS + FCM)
- Security model (token storage, certificate pinning, app attestation roadmap)
- Performance budgets
- Release gates
