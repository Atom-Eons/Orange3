# ORANGEBOX v4 — Codexa Cloud Server
# Multi-stage build. Final image < 100MB. Non-root user. Alpine base.
# Disclosure: ATOM-OBX-V4-MOAT-2026-0516

# ── Stage 1: dependency resolution (nothing to install — zero npm deps) ──────
FROM node:20-alpine AS base

# Verify node version is exactly what we expect
RUN node --version | grep -E '^v20\.' || (echo "FATAL: wrong node version" && exit 1)

# Create app directory
WORKDIR /app

# Copy the server module
COPY codexa-cloud-server.mjs ./

# Validate the module parses clean before we bake the image
RUN node --check codexa-cloud-server.mjs

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: drop to non-root user
RUN addgroup -g 1001 -S codexa && \
    adduser -u 1001 -S codexa -G codexa

WORKDIR /app

# Copy validated server module from base stage
COPY --from=base /app/codexa-cloud-server.mjs ./

# Data directory structure — operator mounts /data as a volume.
# Pre-create so permissions are set correctly under non-root.
RUN mkdir -p /data && chown -R codexa:codexa /data

# Switch to non-root
USER codexa

# Expose HTTPS port
EXPOSE 8443

# Healthcheck — hits the no-auth /v1/codexa/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e " \
        const https = require('https'); \
        const opts = { hostname: 'localhost', port: 8443, path: '/v1/codexa/health', method: 'GET', rejectUnauthorized: false }; \
        const req = https.request(opts, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); \
        req.on('error', () => process.exit(1)); \
        req.end(); \
    "

# Server reads TLS cert/key from env-specified paths or generates a self-signed
# cert at startup when CODEXA_TLS_SELFGEN=true (local dev default).
# Production: mount real certs and set CODEXA_TLS_CERT_PATH / CODEXA_TLS_KEY_PATH.
ENV NODE_ENV=production \
    CODEXA_PORT=8443 \
    CODEXA_TLS_SELFGEN=false

ENTRYPOINT ["node", "codexa-cloud-server.mjs"]
