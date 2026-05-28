# ORANGEBOX v4 — AI Box Cloud

**SKU:** AI Box Cloud — $19/mo optional worker rail
**Disclosure:** ATOM-OBX-V4-MOAT-2026-0516
**Stack:** Node 20 LTS / Alpine / HTTPS / zero npm deps

AI Box Cloud hosts the worker rail for ORANGEBOX buyers who do not have a
second machine to run the local AI Box rail. You pay $19/mo, AtomEons hosts the
worker, and AE See-Suite connects to it instead of a local machine.

---

## Architecture

```
                         AE See-Suite
                    (buyer's laptop / desktop)
                              |
                    Authorization: Bearer <token>
                    X-Tenant-Id: <tenant-id>
                              |
                      ┌───────▼────────┐
                      │  AI Box Cloud  │   ← this repo
                      │  HTTPS :8443   │
                      │                │
                      │  /command  ──► spawn()  ──► receipt
                      │  /job      ──► queue    ──► async
                      │  /job/:id  ──► poll     ──► receipt
                      │  /health   ──► 200 OK   (no auth)
                      └───────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
       /data/<tenant>/  /data/<tenant>/ /data/<tenant>/
          receipts/        knowledge/       logs/
          *.json            (future)      audit.jsonl
```

**Request flow:**
1. AE See-Suite sends `POST /v1/codexa/command` with `Authorization: Bearer <token>` and `X-Tenant-Id: <tenant>`.
2. Server validates token (constant-time), validates tenant against allowed list, checks rate bucket.
3. Safety doctrine runs: forbidden patterns, destructive pattern guard (requires `confirmFullAccess=true`), payment/banking block.
4. Command executes via `spawn()` — no shell expansion. Stdout/stderr captured, capped.
5. Receipt written to `/data/<tenant>/receipts/<id>.json` and returned in response.
6. Audit line appended to `/data/<tenant>/logs/audit.jsonl`.

**Async jobs (`/job`):** same flow but enqueued. Worker loop runs every 500ms. Tenant-isolated queue (one running job per tenant at a time). Poll `/job/:id` for status + receipt.

---

## Quickstart — self-host in 5 steps

### Step 1 — Clone and enter the cloud directory

```bash
cd orangebox-os/scripts/v4/cloud
```

### Step 2 — Create your env file

```bash
cp .env.codexa-cloud.example .env.codexa-cloud
```

Edit `.env.codexa-cloud`:

```env
# Required
CODEXA_CLOUD_TOKEN=<generate with: node -e "require('crypto').randomBytes(48).toString('hex')|console.log(process.stdout.read())">
CODEXA_ALLOWED_TENANTS=tenant-abc,tenant-def

# Optional (defaults shown)
CODEXA_PORT=8443
CODEXA_TLS_SELFGEN=true
CODEXA_DATA_ROOT=/data
CODEXA_RATE_LIMIT_RPM=100
CODEXA_COMMAND_TIMEOUT_MS=60000
```

Generate a strong token:
```bash
node -e "const c=require('crypto');process.stdout.write(c.randomBytes(48).toString('hex')+'\n')"
```

### Step 3 — Build and start

```bash
docker compose --env-file .env.codexa-cloud up --build -d
```

Data lives in `./data/` relative to this directory, mounted into the container.

### Step 4 — Verify health

```bash
curl -k https://localhost:8443/v1/codexa/health
```

Expected response:
```json
{
  "status": "up",
  "version": "4.0.0",
  "ts": "2026-05-16T...",
  "tenants": 2,
  "activeJobs": 0,
  "queuedJobs": 0
}
```

### Step 5 — Send a command

```bash
curl -k -X POST https://localhost:8443/v1/codexa/command \
  -H "Authorization: Bearer <your-token>" \
  -H "X-Tenant-Id: tenant-abc" \
  -H "Content-Type: application/json" \
  -d '{"command":"node","args":["--version"]}'
```

---

## Deploy to Fly.io

```bash
export CODEXA_CLOUD_TOKEN="$(node -e "const c=require('crypto');process.stdout.write(c.randomBytes(48).toString('hex'))")"
export CODEXA_ALLOWED_TENANTS="tenant-abc,tenant-def"
chmod +x deploy-fly.sh
./deploy-fly.sh
```

Default VM: `shared-cpu-2x` (2 vCPU / 512 MB RAM). Costs approximately $4-5/mo on Fly.io with 10 GB persistent volume. Adjust `FLY_VM_SIZE` for heavier workloads.

---

## Deploy to Railway

```bash
export CODEXA_CLOUD_TOKEN="<your-token>"
export CODEXA_ALLOWED_TENANTS="tenant-abc,tenant-def"
chmod +x deploy-railway.sh
./deploy-railway.sh
```

Create the persistent volume first (Railway dashboard or CLI):
```bash
railway volume create --name codexa-data --mount /data
```

---

## Pricing rationale — $19/mo break-even

| Cost item                        | Monthly estimate |
|----------------------------------|-----------------|
| Fly.io / Railway VM (2 vCPU)     | $4–5            |
| Persistent volume (10 GB)        | $1.50           |
| Bandwidth (avg tenant usage)     | $0.50           |
| **Total infra**                  | **~$6–7**       |
| Target margin                    | $12–13          |
| **Buyer price**                  | **$19/mo**      |

At $19/mo, break-even infra cost is ~33% of revenue. At 100 tenants on one host, infra stays sub-$10/mo total (multi-tenancy). Margin expands with scale.

**Buyer math:** AI Box Cloud replaces the need for a dedicated second machine (~$400-800 hardware). Payback on $19/mo = 21-42 months. Buyers who don't want ops overhead see immediate value. Buyers who want to cancel get a data export and self-host path.

---

## Security model

| Layer | Mechanism |
|-------|-----------|
| Transport | TLS (HTTPS only). Self-signed for dev; operator-supplied cert for production. |
| Authentication | `Authorization: Bearer <token>` on every request. Constant-time compare (`crypto.timingSafeEqual`). Token minimum 32 chars enforced at boot. |
| Tenant isolation | `X-Tenant-Id` header. Each tenant has its own data dir. Cross-tenant job access returns 404 (not 403 — does not reveal existence). |
| Rate limiting | 100 req/min per tenant. In-memory token bucket. Prunes stale buckets every 10 min. |
| Command safety | Forbidden command patterns blocked regardless of `confirmFullAccess`. Destructive patterns require `confirmFullAccess: true` (matches `CODEXA_WORKER_RAIL.md` doctrine). Payment/banking/tax commands blocked always. |
| Shell expansion | `spawn()` called with `shell: false`. Arguments are never shell-interpolated. |
| Output cap | stdout capped at 64KB per command, stderr at 16KB. Prevents receipt file bloat and log injection. |
| Audit trail | Every request logged to `/data/<tenant>/logs/audit.jsonl`. Includes IP, event type, command, exit code, duration. |
| Process isolation | Server runs as non-root user `codexa` (uid 1001). Container drops privileges at image build. |
| Secrets | Token read from env at boot, never logged. TLS key read at boot, not retained in memory beyond TLS handshake. |

**What AI Box Cloud never does (AI_BOX_WORKER_RAIL.md doctrine):**
- Broad shell mutation without `confirmFullAccess=true`
- Production deploys without operator approval
- Payment / banking / tax actions
- Destructive deletes outside declared scope

---

## Tenant onboarding flow

1. **Buyer purchases AI Box Cloud SKU** via ORANGEBOX pricing page.
2. **AtomEons assigns a tenant ID** (e.g., `obx-<uuid-prefix>`).
3. **Tenant ID added** to `CODEXA_ALLOWED_TENANTS` env var on the server (or to `CODEXA_TENANTS_FILE` JSON — hot-reloaded every 60s without restart).
4. **Buyer receives** their tenant ID and the shared `CODEXA_CLOUD_TOKEN` (or a per-tenant token if you fork to per-tenant auth — see Roadmap).
5. **AE See-Suite configuration:** buyer enters the AI Box Cloud URL + token in ORANGEBOX Settings → AI Box Rail → "Cloud mode."
6. **Smoke test:** AE See-Suite sends `GET /v1/codexa/health` — should return `200 OK`. Then sends a probe command — should return a receipt.
7. **Onboarding complete.** Buyer's tenant data dir auto-created on first request.

**Offboarding:** remove tenant ID from allowed list. Their `/data/<tenant>/` dir persists until manually purged. Provide data export before purge on request.

---

## Environment reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CODEXA_CLOUD_TOKEN` | Yes | — | Bearer token. Min 32 chars. |
| `CODEXA_ALLOWED_TENANTS` | Yes* | — | Comma-separated tenant IDs. |
| `CODEXA_TENANTS_FILE` | No | — | Path to JSON array of tenant IDs. Hot-reloads every 60s. Overrides env list. |
| `CODEXA_PORT` | No | `8443` | HTTPS listen port. |
| `CODEXA_TLS_SELFGEN` | No | `false` | Generate self-signed cert at startup (dev only). Requires `openssl` on PATH. |
| `CODEXA_TLS_CERT_PATH` | No* | — | Path to PEM cert. Required if `CODEXA_TLS_SELFGEN=false`. |
| `CODEXA_TLS_KEY_PATH` | No* | — | Path to PEM key. Required if `CODEXA_TLS_SELFGEN=false`. |
| `CODEXA_DATA_ROOT` | No | `/data` | Root dir for tenant data. |
| `CODEXA_RATE_LIMIT_RPM` | No | `100` | Max requests per minute per tenant. |
| `CODEXA_COMMAND_TIMEOUT_MS` | No | `60000` | Sync command timeout (ms). Async jobs get 5× this. |
| `CODEXA_JOB_RETENTION_MS` | No | `86400000` | How long to keep completed jobs in memory (ms). Default 24h. |

*Either `CODEXA_ALLOWED_TENANTS` or `CODEXA_TENANTS_FILE` must be set or no tenants will be authorized.

---

## Roadmap

- **v4.1:** Per-tenant token rotation (each tenant gets their own token; shared token becomes admin-only)
- **v4.2:** WireGuard tunnel mode — encrypted channel between AE See-Suite and AI Box Cloud node
- **v4.3:** Work-stealing queue across multiple AI Box Cloud nodes (fleet mode)
- **v4.4:** SQLite-backed tenant registry with admin API (add/remove tenants without restart)
- **v4.5:** Streaming command output (Server-Sent Events on `/v1/codexa/command/stream`)
