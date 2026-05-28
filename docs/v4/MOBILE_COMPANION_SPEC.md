# ORANGEBOX v4 — Mobile Companion Specification
**Version:** 4.0.0-rc1
**Date locked:** 2026-05-16
**Doctrine:** ATOM-OBX-V4-MOAT-2026-0516
**Status:** Authoritative spec for companion app build team.

---

## Table of Contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [What is NOT in v4.0](#2-what-is-not-in-v40)
3. [Recommended stack](#3-recommended-stack)
4. [Architecture overview](#4-architecture-overview)
5. [Pairing flow](#5-pairing-flow)
6. [Authentication model](#6-authentication-model)
7. [Token storage — security requirement](#7-token-storage--security-requirement)
8. [Certificate pinning](#8-certificate-pinning)
9. [App attestation](#9-app-attestation)
10. [REST API — base URL and versioning](#10-rest-api--base-url-and-versioning)
11. [Endpoint: GET /v1/mobile/health](#11-endpoint-get-v1mobilehealth)
12. [Endpoint: GET /v1/mobile/dag](#12-endpoint-get-v1mobiledag)
13. [Endpoint: GET /v1/mobile/party-line/recent](#13-endpoint-get-v1mobileparty-linerecent)
14. [Endpoint: POST /v1/mobile/party-line](#14-endpoint-post-v1mobileparty-line)
15. [Endpoint: GET /v1/mobile/queue](#15-endpoint-get-v1mobilequeue)
16. [Endpoint: POST /v1/mobile/approve/:approvalId](#16-endpoint-post-v1mobileapproveapprovalid)
17. [Endpoint: POST /v1/mobile/deny/:approvalId](#17-endpoint-post-v1mobiledenyal-approvalid)
18. [Endpoint: GET /v1/mobile/receipts/recent](#18-endpoint-get-v1mobilereceiptsrecent)
19. [WebSocket stream — /v1/mobile/stream](#19-websocket-stream--v1mobilestream)
20. [WS event: connected](#20-ws-event-connected)
21. [WS event: party-line](#21-ws-event-party-line)
22. [WS event: approval-request](#22-ws-event-approval-request)
23. [WS event: approval-resolved](#23-ws-event-approval-resolved)
24. [WS event: dag-update](#24-ws-event-dag-update)
25. [WS event: receipt](#25-ws-event-receipt)
26. [WS event: pong](#26-ws-event-pong)
27. [Rate limits](#27-rate-limits)
28. [Error shapes](#28-error-shapes)
29. [Screen: Pairing](#29-screen-pairing)
30. [Screen: DAG View](#30-screen-dag-view)
31. [Screen: Party-Line](#31-screen-party-line)
32. [Screen: Queue](#32-screen-queue)
33. [Screen: Approvals](#33-screen-approvals)
34. [Approval UX — hold-to-approve gesture](#34-approval-ux--hold-to-approve-gesture)
35. [Screen: Receipts](#35-screen-receipts)
36. [Screen: Settings](#36-screen-settings)
37. [Offline behavior](#37-offline-behavior)
38. [Stale data indicator](#38-stale-data-indicator)
39. [WS reconnect policy](#39-ws-reconnect-policy)
40. [Push notifications — model](#40-push-notifications--model)
41. [Push notifications — APNS setup](#41-push-notifications--apns-setup)
42. [Push notifications — FCM setup](#42-push-notifications--fcm-setup)
43. [Theme — dark McLaren F1 aesthetic](#43-theme--dark-mclaren-f1-aesthetic)
44. [Typography](#44-typography)
45. [Motion and haptics](#45-motion-and-haptics)
46. [Performance budget](#46-performance-budget)
47. [Accessibility](#47-accessibility)
48. [Wire format — DAG node](#48-wire-format--dag-node)
49. [Wire format — approval record](#49-wire-format--approval-record)
50. [Wire format — receipt](#50-wire-format--receipt)
51. [Wire format — queue job](#51-wire-format--queue-job)
52. [Wire format — party-line message](#52-wire-format--party-line-message)
53. [Phone authority model](#53-phone-authority-model)
54. [Audit and logging](#54-audit-and-logging)
55. [Release gates before ship](#55-release-gates-before-ship)

---

## 1. Purpose and scope

The ORANGEBOX v4 mobile companion is a native phone app (iOS + Android) that gives the operator visibility into and limited control over the ORANGEBOX cockpit running on their machine.

The cockpit is the chairman. The phone is a remote viewport and approval terminal. The phone never originates destructive actions on its own.

**What the phone CAN do:**
- View the mission DAG (read-only).
- Read the party-line (cockpit chat channel).
- Send messages to the party-line.
- See pending agent approval requests.
- Approve or deny pending agent actions.
- Browse the bg-agent queue.
- Browse recent receipts.
- Receive push notifications for approval requests and receipts.

**What the phone CANNOT do:**
- Create or delete DAG nodes.
- Enqueue bg-agent jobs directly.
- Issue model calls.
- Access the vault.
- Modify cockpit settings.
- Bypass the cockpit's Human Final Stop Authority.

---

## 2. What is NOT in v4.0

Ship discipline: do not scope-creep mobile.

**Excluded from v4.0:**
- Remote terminal (xterm.js) — security surface too wide for v4; v4.1 candidate.
- Code editor on phone — wrong device for code review at this fidelity.
- Receipt sharing/exporting from phone — cockpit-side feature; phone gets read-only view.
- Voice input to party-line — v4.1 candidate after voice coding lands in cockpit.
- Multi-cockpit switching — v4.1 (when Team SKU ships with shared DAG).
- Trilane debate viewer on phone — DAG view covers the graph; debate UI is cockpit-only for v4.
- OTA skill install from phone — security gate; install from cockpit only.
- Biometric lock screen within app — defer to OS-level lock; app requires device authentication to open in v4.1.
- Offline approval (sign and queue for sync) — adds cryptographic complexity; require live connection for approvals in v4.0.

---

## 3. Recommended stack

**Framework:** React Native + Expo SDK 53+

**Why Expo:**
- OTA updates via expo-updates (ship fixes without App Store review).
- expo-notifications handles APNS + FCM with a single API.
- expo-secure-store maps to iOS Keychain + Android Keystore.
- expo-local-authentication for biometric unlock (v4.1).
- Expo Router for file-system-based navigation.
- TypeScript first.

**State management:** Zustand (minimal footprint, no boilerplate).

**WS client:** Native WebSocket API (built into React Native — no library needed).

**Charts (DAG):** react-native-svg + a minimal DAG layout engine (dagre-d3 port or custom). Keep the DAG renderer < 50 KB gzipped.

**Minimum OS targets:**
- iOS 16.0+
- Android API 31+ (Android 12+)

---

## 4. Architecture overview

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  OPERATOR'S MACHINE                                             │
  │                                                                 │
  │  ┌──────────────────┐     ┌─────────────────────────────────┐  │
  │  │  ORANGEBOX       │────>│  mobile-api-server.mjs          │  │
  │  │  Cockpit         │     │  port 8781 (configurable)       │  │
  │  │  (Tauri app)     │<────│  REST + WebSocket               │  │
  │  └──────────────────┘     └──────────────┬──────────────────┘  │
  │          |                               │                      │
  │  ┌───────┴──────────┐                   │                      │
  │  │  bg-agent-queue  │                   │                      │
  │  │  dag/current.json│                   │                      │
  │  │  receipts/       │                   │                      │
  │  │  mobile/devices  │                   │                      │
  │  └──────────────────┘                   │                      │
  └──────────────────────────────────────── │ ────────────────────┘
                                            │
                                   LAN / Internet
                                            │
  ┌─────────────────────────────────────────┴───────────────────────┐
  │  PHONE                                                          │
  │                                                                 │
  │  ┌──────────────────────────────────────────────────────────┐  │
  │  │  ORANGEBOX Companion App (React Native + Expo)           │  │
  │  │                                                          │  │
  │  │  Pairing → token stored in Keychain/Keystore             │  │
  │  │  REST polling (DAG, receipts, queue)                     │  │
  │  │  WS connection → real-time updates                       │  │
  │  │  Push notifications (APNS / FCM)                         │  │
  │  └──────────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 5. Pairing flow

**One-time setup. The cockpit generates the trust; the phone receives it.**

1. Operator runs on cockpit machine:
   ```
   node pairing-flow.mjs --init
   node pairing-flow.mjs --pair --device="iPhone 16 Pro"
   ```
2. `--init` generates an Ed25519 keypair, persists to `~/.orangebox/mobile/devices.json`, prints a QR code containing the pairing payload JSON.
3. App user opens companion app, taps "Pair with cockpit", scans QR code.
4. App extracts the pairing payload:
   ```json
   {
     "v": 4,
     "cockpitId": "uuid",
     "publicKey": "<base64-SPKI-Ed25519>",
     "host": "192.168.1.42",
     "api": "http://192.168.1.42:8781",
     "ws": "ws://192.168.1.42:8781/v1/mobile/stream",
     "pairEndpoint": "http://192.168.1.42:8781/v1/mobile/health",
     "issuedAt": "2026-05-16T10:00:00.000Z"
   }
   ```
5. App stores `api`, `ws`, `publicKey`, `cockpitId` in secure storage.
6. Operator runs `--pair --device="iPhone 16 Pro"` on cockpit; it prints a bearer token.
7. Operator enters (or QR-transfers) the token into the companion app.
8. App stores token in iOS Keychain (kSecClassGenericPassword) / Android Keystore (EncryptedSharedPreferences).
9. All subsequent requests use `Authorization: Bearer <token>`.

**Future v4.1:** The `--pair` flow emits a second QR that encodes the token so step 6-7 is also a scan.

---

## 6. Authentication model

All REST endpoints except `/v1/mobile/health` require:

```
Authorization: Bearer <token>
```

Tokens are Ed25519-signed JWTs:
```
base64url({"alg":"EdDSA","typ":"JWT"}) . base64url(payload) . base64url(signature)
```

Payload fields:
```json
{
  "sub": "<deviceId>",
  "name": "<deviceName>",
  "iat": 1747389600,
  "exp": 1778925600,
  "iss": "orangebox-v4-cockpit"
}
```

The server verifies the signature against the cockpit's Ed25519 public key. No external auth service. No shared secret. The keypair never leaves the cockpit machine.

For WebSocket, pass the token as a query parameter:
```
ws://192.168.1.42:8781/v1/mobile/stream?token=<bearer-token>
```

---

## 7. Token storage — security requirement

**iOS:** Store in iOS Keychain using `expo-secure-store` with:
- `kSecAttrAccessible = kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- `kSecAttrSynchronizable = false` (never iCloud-sync the token)

**Android:** Store using `expo-secure-store` which uses Android Keystore + EncryptedSharedPreferences. Require `setUserAuthenticationRequired(true)` with biometric or device credential in v4.1; relax to PIN-only for v4.0.

**Never:**
- Log the token to console or analytics.
- Include the token in crash reports.
- Send the token to any server other than the paired cockpit's `api` host.

---

## 8. Certificate pinning

For v4.0, the cockpit runs plain HTTP on the LAN (port 8781). Certificate pinning applies when HTTPS is configured (v4.1+).

**v4.0 pinning approach:** The pairing payload includes the cockpit's Ed25519 public key fingerprint. The app verifies that every JWT it receives was signed by that key. This is cryptographic source pinning — any MITM would need the cockpit's private key to forge tokens.

**v4.1 TLS pinning:** When the cockpit enables TLS, the pairing payload will include:
```json
"tlsFingerprint": "SHA256:<hex-of-DER-cert>"
```
The app pins to that fingerprint using `react-native-ssl-pinning` or a custom `fetch` wrapper.

---

## 9. App attestation

**v4.0:** Not required. The app is distributed via TestFlight / APK sideload for early access. App attestation adds significant operational complexity for a v4.0 companion.

**v4.1 plan:**
- iOS: Use Apple DeviceCheck + App Attest. The cockpit server issues a challenge; the app signs with its App Attest key; the cockpit validates with Apple's API.
- Android: Use Google Play Integrity API.

---

## 10. REST API — base URL and versioning

```
Base: http://<cockpit-ip>:<port>
Version prefix: /v1/mobile/
```

All responses are `application/json`. All timestamps are ISO 8601 UTC. All IDs are UUID v4.

**Request headers (required on all authenticated calls):**
```
Authorization: Bearer <token>
Content-Type: application/json    (for POST bodies)
Accept: application/json
```

---

## 11. Endpoint: GET /v1/mobile/health

No authentication required. Use this for connectivity checks and WS reconnect probing.

**Response 200:**
```json
{
  "ok": true,
  "at": "2026-05-16T10:00:00.000Z",
  "port": 8781,
  "wsClients": 1,
  "partyLineBuffered": 42
}
```

---

## 12. Endpoint: GET /v1/mobile/dag

Returns the current mission DAG. The cockpit writes `~/.orangebox/dag/current.json`; this endpoint proxies that file.

**Response 200:**
```json
{
  "ok": true,
  "dag": {
    "updatedAt": "2026-05-16T09:55:00.000Z",
    "nodes": [
      {
        "id": "node-1a2b3c",
        "label": "Scaffold auth module",
        "type": "task",
        "status": "running",
        "assignedTo": "builder",
        "createdAt": "2026-05-16T09:00:00.000Z",
        "completedAt": null,
        "receiptPath": null,
        "metadata": {}
      }
    ],
    "edges": [
      {
        "from": "node-root",
        "to": "node-1a2b3c",
        "label": "depends"
      }
    ]
  }
}
```

**Node status values:** `pending` | `running` | `done` | `failed` | `blocked`

**Node type values:** `mission` | `task` | `approval` | `receipt` | `gate`

---

## 13. Endpoint: GET /v1/mobile/party-line/recent

Returns the most recent party-line messages (ring buffer, max 500 entries on server). Default limit: 50. Max limit: 200.

**Query params:**
- `limit` (integer, optional, default 50, max 200)

**Response 200:**
```json
{
  "ok": true,
  "messages": [
    {
      "id": "uuid",
      "from": "cockpit",
      "text": "Builder started: scaffold auth module",
      "at": "2026-05-16T09:00:01.000Z",
      "deviceId": null
    },
    {
      "id": "uuid",
      "from": "device:iPhone 16 Pro",
      "text": "Looks good, proceed.",
      "at": "2026-05-16T09:01:00.000Z",
      "deviceId": "device-uuid"
    }
  ]
}
```

---

## 14. Endpoint: POST /v1/mobile/party-line

Send a message from the phone to the cockpit party-line. Message is broadcast to all WS clients immediately.

**Request body:**
```json
{
  "text": "Approve the scaffolding approach, LGTM."
}
```

**Response 200:**
```json
{
  "ok": true,
  "message": {
    "id": "uuid",
    "from": "device:iPhone 16 Pro",
    "text": "Approve the scaffolding approach, LGTM.",
    "at": "2026-05-16T09:01:00.000Z",
    "deviceId": "device-uuid"
  }
}
```

**Validation:** `text` is required, must be non-empty string, max 2000 chars (enforced server-side with 400 response).

---

## 15. Endpoint: GET /v1/mobile/queue

Returns all bg-agent queue jobs (not filtered by status — show all so operator has full picture).

**Response 200:**
```json
{
  "ok": true,
  "total": 3,
  "jobs": [
    {
      "id": "uuid",
      "title": "Rebuild CLC lattice for auth module",
      "status": "queued",
      "priority": 2,
      "worker": "local",
      "createdAt": "2026-05-16T08:00:00.000Z",
      "startedAt": null,
      "completedAt": null,
      "error": null
    }
  ]
}
```

---

## 16. Endpoint: POST /v1/mobile/approve/:approvalId

Approve a pending agent action. The cockpit unblocks the waiting agent. Emits a receipt. Broadcasts `approval-resolved` to all WS clients.

**Path param:** `approvalId` — UUID of the pending approval

**Request body:** empty (or `{}`)

**Response 200:**
```json
{
  "ok": true,
  "approval": {
    "id": "uuid",
    "title": "Delete 47 generated test files",
    "status": "approved",
    "resolvedAt": "2026-05-16T09:10:00.000Z",
    "resolvedBy": "device-uuid"
  }
}
```

**Response 404:** approval not found.
**Response 409:** approval already resolved (include `current` field with current status).

---

## 17. Endpoint: POST /v1/mobile/deny/:approvalId

Deny a pending agent action. The cockpit aborts the waiting agent step. Emits a receipt. Broadcasts `approval-resolved` to all WS clients.

Same shape as approve, but `status: "denied"`.

---

## 18. Endpoint: GET /v1/mobile/receipts/recent

Returns the most recent mobile-domain receipts. Default limit: 20. Max: 100.

**Query params:**
- `limit` (integer, optional, default 20, max 100)

**Response 200:**
```json
{
  "ok": true,
  "receipts": [
    {
      "id": "uuid",
      "transition": "pending→approved",
      "at": "2026-05-16T09:10:00.000Z",
      "summary": "Approval approved: Delete 47 generated test files",
      "evidence": {
        "decision": "approved",
        "deviceId": "device-uuid",
        "approvalId": "uuid",
        "title": "Delete 47 generated test files"
      }
    }
  ]
}
```

---

## 19. WebSocket stream — /v1/mobile/stream

**Connection URL:**
```
ws://<cockpit-ip>:<port>/v1/mobile/stream?token=<bearer-token>
```

The server upgrades the HTTP connection to WebSocket after verifying the token. If auth fails, the server closes with HTTP 401 before upgrade.

**Protocol:** standard WebSocket (RFC 6455), text frames, JSON payloads.

**Server behavior:**
- Sends a `connected` event immediately after upgrade.
- Sends `ping` frames every 25 seconds; client should respond with `pong` frames.
- Client may send `{"type":"ping"}` text frames; server responds with `{"type":"pong","at":"..."}`.
- Server sends events for: `party-line`, `approval-request`, `approval-resolved`, `dag-update`, `receipt`.

**Reconnect:** see section 39.

---

## 20. WS event: connected

```json
{
  "type": "connected",
  "deviceId": "device-uuid",
  "at": "2026-05-16T09:00:00.000Z"
}
```

---

## 21. WS event: party-line

Sent when a new party-line message is added (from cockpit or any phone).

```json
{
  "type": "party-line",
  "data": {
    "id": "uuid",
    "from": "cockpit",
    "text": "Builder completed: scaffold auth module. Receipt emitted.",
    "at": "2026-05-16T09:05:00.000Z",
    "deviceId": null
  }
}
```

---

## 22. WS event: approval-request

Sent when the cockpit needs operator approval before an agent proceeds.

```json
{
  "type": "approval-request",
  "data": {
    "id": "uuid",
    "title": "Delete 47 generated test files",
    "description": "Builder wants to remove all *.test.ts files in /auth/tests/ before regenerating.",
    "command": "rm -rf src/auth/tests/*.test.ts",
    "diff": null,
    "destructive": true,
    "metadata": {
      "agent": "builder",
      "jobId": "queue-job-uuid",
      "fileCount": 47
    },
    "status": "pending",
    "createdAt": "2026-05-16T09:09:00.000Z"
  }
}
```

**destructive: true** — app MUST render the hold-to-approve gesture (section 34). Tap-to-approve is disabled for destructive actions.

---

## 23. WS event: approval-resolved

Sent when any device resolves a pending approval.

```json
{
  "type": "approval-resolved",
  "data": {
    "id": "uuid",
    "title": "Delete 47 generated test files",
    "status": "approved",
    "resolvedAt": "2026-05-16T09:10:00.000Z",
    "resolvedBy": "device-uuid"
  }
}
```

---

## 24. WS event: dag-update

Sent when the cockpit writes a new `dag/current.json`. May be partial (just changed nodes) or full.

```json
{
  "type": "dag-update",
  "data": {
    "nodes": [
      {
        "id": "node-1a2b3c",
        "status": "done",
        "completedAt": "2026-05-16T09:15:00.000Z",
        "receiptPath": "/receipts/mobile/uuid-running-done.json"
      }
    ],
    "edges": []
  }
}
```

App should merge received nodes into its local DAG state by `id`. A full replacement is signaled by `"full": true` in the payload.

---

## 25. WS event: receipt

Sent when a new mobile-domain receipt is emitted (approval, party-line action, etc.).

```json
{
  "type": "receipt",
  "data": {
    "id": "uuid",
    "transition": "pending→approved",
    "at": "2026-05-16T09:10:00.000Z",
    "summary": "Approval approved: Delete 47 generated test files",
    "evidence": {}
  }
}
```

---

## 26. WS event: pong

Response to a client-sent `{"type":"ping"}`.

```json
{
  "type": "pong",
  "at": "2026-05-16T09:00:30.000Z"
}
```

---

## 27. Rate limits

- 200 requests per minute per device token.
- Exceeded: `429 Too Many Requests` with body:
  ```json
  { "error": "rate_limit_exceeded", "limit": 200, "windowMs": 60000 }
  ```
- WS events do not count toward the REST rate limit.
- App should implement client-side debouncing: no polling loop faster than 10 seconds.

---

## 28. Error shapes

All errors follow this shape:

```json
{
  "error": "<machine_readable_code>",
  "hint": "<optional human description>",
  "current": "<optional: current state when conflict>"
}
```

Common codes:

| Code | HTTP status | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing or invalid token |
| `not_found` | 404 | Resource does not exist |
| `already_resolved` | 409 | Approval was already approved/denied |
| `rate_limit_exceeded` | 429 | Too many requests |
| `internal_server_error` | 500 | Cockpit error (check cockpit logs) |

---

## 29. Screen: Pairing

**Entry point for new users.**

- Full-screen camera view for QR scan.
- "Pair with cockpit" CTA.
- After scan: show extracted `host`, `port`, `cockpitId`; ask user to confirm.
- Prompt for bearer token (paste or manual entry — QR auto-pair token flow in v4.1).
- Validate by hitting `/v1/mobile/health` then a quick DAG fetch.
- On success: navigate to DAG View. Store host, port, publicKey, token in secure storage.
- On failure: show error with actionable text (e.g., "Check that mobile-api-server.mjs is running on the cockpit").
- No network permission prompts pre-empted — wait until user initiates.

---

## 30. Screen: DAG View

**Primary operational view.**

- Scrollable/zoomable DAG graph. Nodes rendered as cards with status color:
  - `pending`: gray
  - `running`: amber (pulsing animation)
  - `done`: green
  - `failed`: red
  - `blocked`: orange
- Tap a node: expand to detail sheet with label, assignedTo, timestamps, receipt link.
- Edges rendered as directional arrows labeled with `edge.label`.
- Badge on tab icon: count of `running` nodes.
- Poll `/v1/mobile/dag` every 15 seconds when WS is connected (as fallback sync).
- When `dag-update` WS event arrives: animate changed nodes.
- Read-only. No mutation controls on this screen.
- "Refresh" pull-to-refresh gesture.

---

## 31. Screen: Party-Line

**Real-time cockpit conversation.**

- Chat-style list, newest at bottom.
- Messages from `cockpit` and all devices shown with origin label.
- Phone operator's messages right-aligned (message bubble), others left-aligned.
- Text input at bottom: "Message cockpit..." placeholder. Send button.
- Character limit: 2000 chars (match server).
- WS `party-line` event → append to list, scroll to bottom.
- Load last 50 via REST on screen mount.
- Badge on tab: count of new messages since last view (reset on view).
- Message timestamps: relative ("2 min ago") with absolute on press.

---

## 32. Screen: Queue

**Background agent job monitor.**

- List of all queue jobs, sorted by createdAt descending.
- Each row: title, status badge, priority indicator, worker label, elapsed time.
- Status filter chips at top: All / Queued / Running / Done / Failed.
- Tap a job: detail sheet with full fields including prompt (truncated to 500 chars), receipt path, error message if failed.
- Poll `/v1/mobile/queue` every 30 seconds.
- No enqueue/cancel controls in v4.0. Read-only.
- Empty state: "No jobs in queue. Start a background task from the cockpit."

---

## 33. Screen: Approvals

**Critical path for operator control.**

- List of pending approval requests, newest first.
- Tabs: Pending / Resolved.
- Pending row: title, destructive badge if `destructive: true`, elapsed time since request.
- Tap a pending row: navigate to Approval Detail (section 34).
- Resolved row: title, status (approved/denied), who resolved, when.
- WS `approval-request` event: add to Pending list. Fire local push notification if app is backgrounded.
- WS `approval-resolved` event: move from Pending to Resolved.
- Badge on tab: count of pending approvals (high-priority indicator in red).

---

## 34. Approval UX — hold-to-approve gesture

Approval Detail screen layout:
- Header: title + `DESTRUCTIVE` badge if applicable.
- Description block: full `description` text.
- Command preview block (monospace font, dark background, syntax-highlighted if possible):
  ```
  rm -rf src/auth/tests/*.test.ts
  ```
- Diff preview (if `diff` is present): unified diff format, red/green highlight.
- Metadata block: agent name, job ID, any extra fields.
- Bottom action area:

**Non-destructive approvals (`destructive: false`):**
- "Approve" button (green) — single tap.
- "Deny" button (red) — single tap.
- No hold required.

**Destructive approvals (`destructive: true`):**
- "Deny" button (red) — single tap, always immediate.
- "Hold to approve" button (amber) — operator must press and hold for 3 seconds.
  - Progress ring fills during hold.
  - Release before 3 seconds = no action, ring resets.
  - Hold completes = POST /v1/mobile/approve/:id
  - Haptic feedback on completion (heavy impact).
  - Label during hold: "DESTRUCTIVE — hold 3s to confirm"
- This gesture is mandatory for destructive actions. It cannot be disabled by any setting.

After resolution: navigate back to Approvals list. Show brief confirmation toast.

---

## 35. Screen: Receipts

**Proof of work ledger.**

- List of recent mobile-domain receipts, newest first.
- Each row: summary, transition string, timestamp.
- Tap: detail sheet with full JSON evidence block (formatted, selectable).
- Pull-to-refresh.
- Poll `/v1/mobile/receipts/recent?limit=20` every 60 seconds.
- WS `receipt` event: prepend to list.
- Empty state: "No receipts yet. Actions you approve will appear here."

---

## 36. Screen: Settings

- **Cockpit connection:** show paired cockpit host, port, cockpit ID, last successful ping.
  - "Test connection" button — hits `/v1/mobile/health`.
  - "Unpair" button — clears all stored credentials (with confirmation dialog).
- **Notifications:** toggle push notifications on/off. Links to OS notification settings.
- **Auto-refresh intervals:** show current polling intervals (read-only in v4.0).
- **Theme:** dark only in v4.0 (light mode in v4.1).
- **About:** version, build number, doctrine ID, link to docs.

---

## 37. Offline behavior

When the network connection to the cockpit is lost:

1. App retains the last-fetched DAG, party-line buffer, queue snapshot, and receipts in memory (and AsyncStorage for persistence across app restarts).
2. WS reconnect policy kicks in (section 39).
3. "Stale" indicator shown on all screens (section 38).
4. REST polling suspended (no point hammering a dead connection).
5. Approve/Deny buttons disabled with label "Offline — reconnect to approve".
6. Party-line input disabled with label "Offline — reconnect to send".
7. On reconnect: re-fetch all data, remove stale indicator, resume WS.

---

## 38. Stale data indicator

A persistent amber banner at the top of every screen when offline or when last successful sync > 2 minutes ago:

```
Connection to cockpit lost — showing data from 3 min ago
[Retry]
```

The banner disappears when the WS connection is re-established and a successful REST fetch completes.

---

## 39. WS reconnect policy

Exponential backoff with jitter. Performance budget: first reconnect attempt within 2 seconds.

| Attempt | Wait before retry |
|---|---|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5+ | 16s (max cap) |

Jitter: ± 20% of the wait time (random, to prevent thundering herd if multiple clients reconnect simultaneously).

Before each reconnect attempt: probe `/v1/mobile/health` first. If health returns non-200 or times out, skip WS reconnect for that cycle and wait for the next interval.

After 10 consecutive failures: show "Cockpit unreachable" full-screen error with manual retry button. Stop automatic reconnect.

---

## 40. Push notifications — model

Operator opt-in. Notifications are never sent without explicit permission.

**Cockpit sends push for:**
- New `approval-request` (always, when app is backgrounded).
- `approval-request` with `destructive: true` (critical alert priority on iOS).
- `receipt` for completed bg-agent jobs.

**Cockpit does NOT send push for:**
- Party-line messages (operator sets their own threshold in v4.1).
- DAG updates (too frequent; surface in app on foreground).

**Flow:**
1. Operator enables notifications in Settings screen.
2. App requests OS permission.
3. App sends device push token to cockpit via `POST /v1/mobile/party-line` with type hint `system:push-token:<token>` (simple text convention in v4.0; dedicated endpoint in v4.1).
4. Cockpit stores push token in the device record (`devices.json`).
5. Cockpit POSTs to APNS/FCM when an event warrants a push.

---

## 41. Push notifications — APNS setup

Cockpit reads from env:
- `ORANGEBOX_APNS_KEY_ID` — APNs auth key ID
- `ORANGEBOX_APNS_TEAM_ID` — Apple Developer team ID
- `ORANGEBOX_APNS_KEY_PATH` — path to `.p8` key file
- `ORANGEBOX_APNS_BUNDLE_ID` — app bundle ID

The cockpit sends HTTP/2 requests to:
- Production: `https://api.push.apple.com/3/device/<token>`
- Sandbox: `https://api.sandbox.push.apple.com/3/device/<token>`

JWT auth (ES256 signed with the `.p8` key). Token cached for 55 minutes (APNS limit: 1 hour).

Payload example:
```json
{
  "aps": {
    "alert": {
      "title": "Agent action pending",
      "body": "Delete 47 test files — tap to review"
    },
    "sound": "default",
    "badge": 1,
    "interruption-level": "critical"
  },
  "approvalId": "uuid"
}
```

`interruption-level: critical` used only for `destructive: true` approvals. Requires the CriticalAlerts entitlement in the app.

---

## 42. Push notifications — FCM setup

Cockpit reads from env:
- `ORANGEBOX_FCM_PROJECT_ID` — Firebase project ID
- `ORANGEBOX_FCM_SERVICE_ACCOUNT_PATH` — path to service account JSON

The cockpit uses FCM HTTP v1 API:
`POST https://fcm.googleapis.com/v1/projects/<projectId>/messages:send`

Auth: OAuth2 bearer token from the service account, scoped to `https://www.googleapis.com/auth/firebase.messaging`.

Payload example:
```json
{
  "message": {
    "token": "<device-fcm-token>",
    "notification": {
      "title": "Agent action pending",
      "body": "Delete 47 test files — tap to review"
    },
    "data": {
      "approvalId": "uuid",
      "destructive": "true"
    },
    "android": {
      "priority": "high"
    }
  }
}
```

---

## 43. Theme — dark McLaren F1 aesthetic

The companion app matches the cockpit's visual language: dark, precise, premium, performance-oriented.

**Color palette:**

| Token | Value | Usage |
|---|---|---|
| `bg.base` | `#0A0A0A` | Main background |
| `bg.surface` | `#141414` | Cards, sheets |
| `bg.elevated` | `#1E1E1E` | Elevated surfaces |
| `accent.orange` | `#FF6200` | McLaren orange — primary CTA, running status, badges |
| `accent.amber` | `#FFB800` | Warnings, hold-to-approve progress |
| `accent.green` | `#00D46A` | Done status, success states |
| `accent.red` | `#FF3333` | Failed status, deny button, destructive badge |
| `text.primary` | `#FFFFFF` | Primary text |
| `text.secondary` | `#8A8A8A` | Secondary labels, timestamps |
| `text.mono` | `#C8FF00` | Command preview, receipt evidence, monospace data |
| `border.subtle` | `#2A2A2A` | Card borders, dividers |

**No light mode in v4.0.** The McLaren F1 aesthetic is dark-first. Light mode is a v4.1 deliverable.

---

## 44. Typography

| Usage | Font | Weight | Size |
|---|---|---|---|
| Screen titles | SF Pro Display (iOS) / Roboto (Android) | Bold | 24pt |
| Section headers | SF Pro Text / Roboto | Semibold | 16pt |
| Body | SF Pro Text / Roboto | Regular | 14pt |
| Monospace (commands, receipts) | SF Mono (iOS) / Roboto Mono (Android) | Regular | 13pt |
| Timestamps | SF Pro Text / Roboto | Regular | 12pt |
| Badges | SF Pro Text / Roboto | Semibold | 11pt |

---

## 45. Motion and haptics

**Keep motion purposeful and fast. No decorative animation.**

| Event | Animation | Duration |
|---|---|---|
| DAG node status change | color crossfade + scale pulse (1.0 → 1.03 → 1.0) | 300ms |
| New party-line message | slide in from bottom + fade | 200ms |
| Approval request (WS) | sheet slides up from bottom | 250ms |
| Hold-to-approve ring | smooth arc fill | 3000ms (linear) |
| Navigation transitions | default Expo Router push/pop | system default |

**Haptics:**
- New approval request (foreground): medium impact.
- Hold-to-approve completion: heavy impact + success notification.
- Approve/Deny confirmation: light notification.
- Error: warning notification.

**Respect `Reduce Motion` system setting.** When enabled: replace all animations with instant state changes.

---

## 46. Performance budget

| Metric | Target | Hard limit |
|---|---|---|
| Cold launch to first screen | < 1.5s | 2.0s |
| Hot launch (resume from background) | < 400ms | 600ms |
| WS reconnect after network drop | < 2s (first attempt) | 5s |
| REST fetch to visible update | < 500ms (LAN) | 2s |
| DAG render (50 nodes) | < 100ms | 300ms |
| Memory usage (typical session) | < 120 MB | 200 MB |
| Bundle size (initial download) | < 8 MB | 15 MB |

---

## 47. Accessibility

- All interactive elements have `accessibilityLabel` props.
- `accessibilityRole` set correctly: button, header, text, image.
- Minimum touch target: 44x44 pt (Apple HIG / Material minimum).
- Color is never the sole status indicator (status text label always accompanies color badge).
- `accessibilityHint` on hold-to-approve: "Press and hold for 3 seconds to confirm destructive action."
- VoiceOver / TalkBack tested before v4.0 ship.

---

## 48. Wire format — DAG node

Full node shape (superset of what any single event carries):

```json
{
  "id": "node-1a2b3c",
  "label": "Scaffold auth module",
  "type": "task",
  "status": "running",
  "assignedTo": "builder",
  "createdAt": "2026-05-16T09:00:00.000Z",
  "startedAt": "2026-05-16T09:01:00.000Z",
  "completedAt": null,
  "receiptPath": null,
  "metadata": {
    "prompt": "Scaffold the auth module with JWT + refresh token flow",
    "worker": "local"
  }
}
```

---

## 49. Wire format — approval record

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Delete 47 generated test files",
  "description": "Builder wants to remove all *.test.ts files in /auth/tests/ before regenerating.",
  "command": "rm -rf src/auth/tests/*.test.ts",
  "diff": "--- a/src/auth/tests/login.test.ts\n+++ /dev/null\n@@ -1,42 +0,0 @@\n...",
  "destructive": true,
  "metadata": {
    "agent": "builder",
    "jobId": "queue-job-uuid",
    "fileCount": 47
  },
  "status": "pending",
  "createdAt": "2026-05-16T09:09:00.000Z",
  "resolvedAt": null,
  "resolvedBy": null
}
```

---

## 50. Wire format — receipt

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "transition": "pending→approved",
  "at": "2026-05-16T09:10:00.000Z",
  "summary": "Approval approved: Delete 47 generated test files",
  "evidence": {
    "decision": "approved",
    "deviceId": "device-uuid",
    "approvalId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Delete 47 generated test files"
  }
}
```

---

## 51. Wire format — queue job

```json
{
  "id": "queue-uuid",
  "title": "Rebuild CLC lattice for auth module",
  "prompt": "Rebuild the CLC lattice for /src/auth/... using the current session artifacts as input.",
  "provider": "anthropic",
  "priority": 2,
  "createdAt": "2026-05-16T08:00:00.000Z",
  "startedAt": "2026-05-16T09:00:00.000Z",
  "completedAt": null,
  "status": "running",
  "worker": "local",
  "receiptPath": null,
  "error": null,
  "result": null
}
```

---

## 52. Wire format — party-line message

```json
{
  "id": "pl-uuid",
  "from": "device:iPhone 16 Pro",
  "text": "Looks good. Proceed with the deletion.",
  "at": "2026-05-16T09:09:30.000Z",
  "deviceId": "device-uuid"
}
```

`from` values: `"cockpit"` | `"device:<deviceName>"` | `"agent:<agentName>"`

---

## 53. Phone authority model

This section is the canonical authority definition. Never relax it without a doctrine update.

**Phone CAN:**
- Read DAG (immutable view).
- Read party-line.
- Write to party-line (text only, no system commands).
- Read queue (immutable view).
- Read receipts (immutable view).
- Approve a pending approval (operator-initiated, cockpit-raised).
- Deny a pending approval (operator-initiated, cockpit-raised).

**Phone CANNOT:**
- Create DAG nodes or edges.
- Delete DAG nodes.
- Enqueue bg-agent jobs.
- Cancel bg-agent jobs.
- Access vault data.
- Access cockpit file system.
- Issue model API calls.
- Modify cockpit settings or keys.
- Revoke or issue device tokens (must be done from cockpit CLI).
- Bypass the Human Final Stop Authority.
- Push new skills or plugins to the cockpit.

**The approval flow is unidirectional.** The cockpit raises an approval request; the phone responds. The phone cannot originate an approval request. The phone cannot instruct the cockpit to create an approval.

The cockpit enforces this at the API level. No endpoint exists for phone-originated destructive mutations.

---

## 54. Audit and logging

Every approve/deny action emits a receipt to `~/.orangebox/receipts/mobile/`. The receipt contains: who approved (device ID + device name), what was approved (approvalId, title, command), when, and the current approval state. This is the immutable audit trail.

The cockpit's mobile-api-server logs every authenticated request at INFO level (method, path, deviceId, status, latency). Logs go to stdout; the cockpit's log aggregator captures them.

The app should log WS connect/disconnect events and reconnect attempts at DEBUG level (never log the token).

---

## 55. Release gates before ship

Mobile companion v4.0 does not ship without all of the following green:

- Pairing flow tested end-to-end on iOS (TestFlight) and Android (APK).
- All REST endpoints tested against a live cockpit (not mocks).
- WS connect, receive party-line, receive approval-request, respond via REST — verified on device.
- Destructive hold-to-approve gesture tested: 2-second release = no action; 3-second hold = approved.
- Offline behavior tested: kill cockpit, verify stale banner; restart cockpit, verify reconnect < 2s.
- Cold launch < 1.5s measured on iPhone 14 (or equivalent mid-tier device).
- Push notification received when app is backgrounded and cockpit raises an approval.
- Token stored in Keychain/Keystore (not NSUserDefaults/SharedPreferences).
- VoiceOver smoke test on Approvals screen (hold-to-approve accessible).
- Security reviewer sign-off on token storage implementation.
- Receipt emitted for every approve/deny action (verified in `~/.orangebox/receipts/mobile/`).
- Rate limit enforcement tested: 201 requests in 60s returns 429.

---

*This specification is the authority for the ORANGEBOX v4 mobile companion app build. It overrides any wireframe, Notion doc, or verbal description. If there is a conflict, this document wins. To update: propose a change, get doctrine sign-off, increment the version field at the top.*
