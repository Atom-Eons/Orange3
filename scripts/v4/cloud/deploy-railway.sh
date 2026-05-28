#!/usr/bin/env bash
# ORANGEBOX v4 — Codexa Cloud — Railway deployment
# Disclosure: ATOM-OBX-V4-MOAT-2026-0516
#
# Prerequisites:
#   - Railway CLI installed and authenticated (railway.app account)
#   - CODEXA_CLOUD_TOKEN, CODEXA_ALLOWED_TENANTS set in environment
#   - Railway project created (or RAILWAY_PROJECT_ID set for CI)
#
# Usage:
#   chmod +x deploy-railway.sh
#   CODEXA_CLOUD_TOKEN="<token>" CODEXA_ALLOWED_TENANTS="tenant-a,tenant-b" ./deploy-railway.sh
#
# Environment overrides:
#   RAILWAY_PROJECT_ID     — existing Railway project ID (optional; CLI prompts if absent)
#   RAILWAY_SERVICE_NAME   — service name in Railway (default: codexa-cloud)
#   RAILWAY_REGION         — region (default: us-east; options: us-west, eu-west)
#   CODEXA_CLOUD_TOKEN     — REQUIRED: bearer token (min 32 chars)
#   CODEXA_ALLOWED_TENANTS — REQUIRED: comma-sep list of tenant IDs

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SERVICE_NAME="${RAILWAY_SERVICE_NAME:-codexa-cloud}"
REGION="${RAILWAY_REGION:-us-east}"
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

# ── Guard: railway CLI present ────────────────────────────────────────────────
if ! command -v railway &>/dev/null; then
  echo "[ERROR] Railway CLI not found. Install: npm i -g @railway/cli" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[deploy-railway] Service: ${SERVICE_NAME} | Region: ${REGION}"
echo "[deploy-railway] Context: ${SCRIPT_DIR}"

# ── Link to project (no-op if RAILWAY_PROJECT_ID set in env) ─────────────────
if [[ -n "${RAILWAY_PROJECT_ID:-}" ]]; then
  echo "[deploy-railway] Using RAILWAY_PROJECT_ID from env: ${RAILWAY_PROJECT_ID}"
else
  echo "[deploy-railway] No RAILWAY_PROJECT_ID set — Railway CLI will prompt for project."
fi

# ── Set environment variables on the service ──────────────────────────────────
echo "[deploy-railway] Setting environment variables..."
railway variables set \
  "NODE_ENV=production" \
  "CODEXA_PORT=${PORT}" \
  "CODEXA_TLS_SELFGEN=true" \
  "CODEXA_DATA_ROOT=/data" \
  "CODEXA_RATE_LIMIT_RPM=100" \
  "CODEXA_COMMAND_TIMEOUT_MS=60000" \
  "CODEXA_CLOUD_TOKEN=${CODEXA_CLOUD_TOKEN}" \
  "CODEXA_ALLOWED_TENANTS=${CODEXA_ALLOWED_TENANTS}" \
  ${RAILWAY_PROJECT_ID:+--project "${RAILWAY_PROJECT_ID}"}

echo "[deploy-railway] Variables set."

# ── Volume note ───────────────────────────────────────────────────────────────
# Railway persistent volumes must be created via the Railway dashboard or CLI:
#   railway volume create --name codexa-data --mount /data
# This script does not auto-create volumes because the CLI prompts interactively.
echo ""
echo "[deploy-railway] NOTE: If this is a first deploy, create a persistent volume:"
echo "  railway volume create --name codexa-data --mount /data"
echo "  (Then re-run this script to deploy.)"
echo ""

# ── Write railway.json (service configuration) ────────────────────────────────
RAILWAY_JSON="${SCRIPT_DIR}/railway.json"
cat > "${RAILWAY_JSON}" <<RAILWAYJSON
{
  "\$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node codexa-cloud-server.mjs",
    "healthcheckPath": "/v1/codexa/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
RAILWAYJSON

echo "[deploy-railway] railway.json written."

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "[deploy-railway] Deploying..."
railway up \
  --dockerfile "${SCRIPT_DIR}/Dockerfile" \
  --service "${SERVICE_NAME}" \
  ${RAILWAY_PROJECT_ID:+--project "${RAILWAY_PROJECT_ID}"}

echo ""
echo "[deploy-railway] Deployment initiated."
echo "[deploy-railway] Monitor at: https://railway.app/dashboard"
echo ""
echo "[deploy-railway] Once deployed, get your service URL from:"
echo "  railway domain"
echo ""
echo "[deploy-railway] Test with:"
echo "  curl https://<your-railway-domain>/v1/codexa/health"
echo ""
echo "[deploy-railway] Receipt: railway.json written to ${RAILWAY_JSON}"
echo "[deploy-railway] Do not commit railway.json if it contains sensitive config."
