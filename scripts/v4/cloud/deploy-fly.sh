#!/usr/bin/env bash
# ORANGEBOX v4 — Codexa Cloud — Fly.io deployment
# Disclosure: ATOM-OBX-V4-MOAT-2026-0516
#
# Prerequisites:
#   - flyctl installed and authenticated (fly.io account)
#   - CODEXA_CLOUD_TOKEN, CODEXA_ALLOWED_TENANTS set in environment
#   - Docker available locally (for fly deploy --local-only) or fly's remote builder
#
# Usage:
#   chmod +x deploy-fly.sh
#   CODEXA_CLOUD_TOKEN="<token>" CODEXA_ALLOWED_TENANTS="tenant-a,tenant-b" ./deploy-fly.sh
#
# Environment overrides:
#   FLY_APP_NAME      — app name on Fly.io (default: codexa-cloud)
#   FLY_REGION        — primary region (default: iad)
#   FLY_VM_SIZE       — VM size (default: shared-cpu-2x — 2 vCPU, 512MB RAM)
#   FLY_VOLUME_SIZE   — volume GB for /data (default: 10)
#   CODEXA_CLOUD_TOKEN — REQUIRED: bearer token (min 32 chars)
#   CODEXA_ALLOWED_TENANTS — REQUIRED: comma-sep list of tenant IDs
#   CODEXA_PORT       — internal port (default: 8443)
#   CODEXA_TLS_SELFGEN — "true" for dev; set to "false" + mount certs in prod

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
APP_NAME="${FLY_APP_NAME:-codexa-cloud}"
REGION="${FLY_REGION:-iad}"
VM_SIZE="${FLY_VM_SIZE:-shared-cpu-2x}"
VOLUME_SIZE="${FLY_VOLUME_SIZE:-10}"
PORT="${CODEXA_PORT:-8443}"

# ── Guard: required secrets ───────────────────────────────────────────────────
if [[ -z "${CODEXA_CLOUD_TOKEN:-}" ]]; then
  echo "[ERROR] CODEXA_CLOUD_TOKEN is not set. Aborting." >&2
  exit 1
fi
if [[ "${#CODEXA_CLOUD_TOKEN}" -lt 32 ]]; then
  echo "[ERROR] CODEXA_CLOUD_TOKEN must be at least 32 characters. Aborting." >&2
  exit 1
fi
if [[ -z "${CODEXA_ALLOWED_TENANTS:-}" ]]; then
  echo "[ERROR] CODEXA_ALLOWED_TENANTS is not set. Aborting." >&2
  exit 1
fi

# ── Guard: flyctl present ─────────────────────────────────────────────────────
if ! command -v flyctl &>/dev/null; then
  echo "[ERROR] flyctl not found. Install: https://fly.io/docs/hands-on/install-flyctl/" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[deploy-fly] App: ${APP_NAME} | Region: ${REGION} | VM: ${VM_SIZE}"
echo "[deploy-fly] Context: ${SCRIPT_DIR}"

# ── Create app if it doesn't exist ───────────────────────────────────────────
if ! flyctl apps list 2>/dev/null | grep -q "^${APP_NAME}\s"; then
  echo "[deploy-fly] Creating Fly.io app: ${APP_NAME}"
  flyctl apps create "${APP_NAME}" --org personal
else
  echo "[deploy-fly] App ${APP_NAME} already exists — skipping create."
fi

# ── Set secrets (idempotent) ──────────────────────────────────────────────────
echo "[deploy-fly] Setting secrets..."
flyctl secrets set \
  "CODEXA_CLOUD_TOKEN=${CODEXA_CLOUD_TOKEN}" \
  "CODEXA_ALLOWED_TENANTS=${CODEXA_ALLOWED_TENANTS}" \
  --app "${APP_NAME}"

# ── Create volume for /data if not present ────────────────────────────────────
EXISTING_VOLUMES=$(flyctl volumes list --app "${APP_NAME}" --json 2>/dev/null | \
  python3 -c "import sys,json; vols=json.load(sys.stdin); print(len([v for v in vols if v.get('name')=='codexa_data']))" 2>/dev/null || echo "0")

if [[ "${EXISTING_VOLUMES}" == "0" ]]; then
  echo "[deploy-fly] Creating volume codexa_data (${VOLUME_SIZE}GB) in ${REGION}..."
  flyctl volumes create codexa_data \
    --app "${APP_NAME}" \
    --region "${REGION}" \
    --size "${VOLUME_SIZE}"
else
  echo "[deploy-fly] Volume codexa_data already exists — skipping create."
fi

# ── Write fly.toml (generated, not committed) ─────────────────────────────────
FLY_TOML="${SCRIPT_DIR}/fly.toml"
cat > "${FLY_TOML}" <<FLYTOML
app = "${APP_NAME}"
primary_region = "${REGION}"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  CODEXA_PORT = "${PORT}"
  CODEXA_TLS_SELFGEN = "true"
  CODEXA_DATA_ROOT = "/data"
  CODEXA_RATE_LIMIT_RPM = "100"
  CODEXA_COMMAND_TIMEOUT_MS = "60000"

[[services]]
  internal_port = ${PORT}
  protocol = "tcp"

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [services.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200

  [[services.http_checks]]
    interval = "30s"
    timeout = "10s"
    grace_period = "15s"
    method = "GET"
    path = "/v1/codexa/health"

[[mounts]]
  source = "codexa_data"
  destination = "/data"

[metrics]
  port = 9091
  path = "/metrics"

FLYTOML

echo "[deploy-fly] fly.toml written."

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "[deploy-fly] Deploying..."
flyctl deploy \
  --app "${APP_NAME}" \
  --config "${FLY_TOML}" \
  --dockerfile "${SCRIPT_DIR}/Dockerfile" \
  --region "${REGION}" \
  --vm-size "${VM_SIZE}" \
  --wait-timeout 300

echo ""
echo "[deploy-fly] Deployment complete."
echo "[deploy-fly] App URL: https://${APP_NAME}.fly.dev"
echo "[deploy-fly] Health:  https://${APP_NAME}.fly.dev/v1/codexa/health"
echo ""
echo "[deploy-fly] Test with:"
echo "  curl -k https://${APP_NAME}.fly.dev/v1/codexa/health"
echo ""
echo "[deploy-fly] Receipt: fly.toml written to ${FLY_TOML} (do not commit — contains region/app config)"
