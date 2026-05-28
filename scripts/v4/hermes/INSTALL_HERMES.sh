#!/usr/bin/env bash
# =============================================================================
# INSTALL_HERMES.sh — ORANGEBOX Codexa Hermes Agent Installer (WSL2/Linux/macOS)
#
# Doctrine anchor : docs/V4_MOAT_DOCTRINE.md  (ATOM-OBX-V4-MOAT-2026-0516)
# Author          : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
# Date            : 2026-05-16
# Mom's Law       : Full effort. Real paths. No theater.
#
# Hermes Agent (Nous Research, MIT-licensed, free forever).
# Source: https://github.com/nousresearch/hermes-agent
#
# What this script does:
#   1. Detects existing Hermes install and exits early if found.
#   2. Verifies Node 22.14+ (optionally installs via NodeSource with --auto-node).
#   3. Asks operator before running the upstream curl | bash installer.
#   4. Writes the ORANGEBOX AGENTS.md guardrails to ~/.hermes/AGENTS.md.
#   5. Prints next-step instructions.
#
# Usage
# ─────
#   bash INSTALL_HERMES.sh              — interactive install
#   bash INSTALL_HERMES.sh --auto-node  — also install Node via NodeSource if missing
#   bash INSTALL_HERMES.sh --help       — this message
#
# =============================================================================

set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────

HERMES_INSTALL_URL="https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── CLI ──────────────────────────────────────────────────────────────────────

AUTO_NODE=0
for arg in "$@"; do
    case "$arg" in
        --help)
            cat <<'HELP'
INSTALL_HERMES.sh — Install Hermes Agent on WSL2 / Linux / macOS for ORANGEBOX.

  bash INSTALL_HERMES.sh              — interactive install
  bash INSTALL_HERMES.sh --auto-node  — install Node 24 via NodeSource if missing (requires root)
  bash INSTALL_HERMES.sh --help       — this message

Environment:
  HERMES_HOME   Override default ~/.hermes/ directory.

The script asks before running any curl | bash command. Node must be 22.14+.
HELP
            exit 0
            ;;
        --auto-node)
            AUTO_NODE=1
            ;;
        *)
            echo "[HERMES] Unknown flag: $arg  (run --help for usage)" >&2
            exit 1
            ;;
    esac
done

# ─── Helpers ──────────────────────────────────────────────────────────────────

step()  { echo ""; echo "[HERMES] $*"; }
ok()    { echo "  OK   $*"; }
warn()  { echo "  WARN $*"; }
die()   { echo ""; echo "  ERROR: $*" >&2; exit 1; }

# ─── 1. Detect existing Hermes install ────────────────────────────────────────

step "Checking for existing Hermes install..."

if command -v hermes >/dev/null 2>&1; then
    EXISTING_VER="$(hermes --version 2>/dev/null | head -1 || echo "(version unknown)")"
    ok "Hermes is already installed: $EXISTING_VER"
    echo ""
    echo "  If you need to update: hermes update"
    echo "  Next steps:  hermes model  |  hermes mcp serve  |  hermes status"
    echo ""
    exit 0
fi

echo "  Hermes not found on PATH. Proceeding with install."

# ─── 2. Verify Node 22.14+ ────────────────────────────────────────────────────

step "Checking Node.js version..."

node_ok=0
if command -v node >/dev/null 2>&1; then
    node -e "
        const v = process.versions.node.split('.').map(Number);
        process.exit((v[0] > 22 || (v[0] === 22 && v[1] >= 14)) ? 0 : 1);
    " 2>/dev/null && node_ok=1 || node_ok=0
fi

if [ "$node_ok" -ne 1 ]; then
    if [ "$AUTO_NODE" -eq 1 ]; then
        step "Node 22.14+ not found. Installing Node 24 via NodeSource (--auto-node)..."
        if [ "$(id -u)" -ne 0 ]; then
            die "Root is required to install Node via NodeSource. Re-run as root or with sudo."
        fi
        apt-get update -qq
        apt-get install -y -qq ca-certificates curl gnupg
        curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
        apt-get install -y -qq nodejs
        # Verify after install
        node -e "
            const v = process.versions.node.split('.').map(Number);
            process.exit((v[0] > 22 || (v[0] === 22 && v[1] >= 14)) ? 0 : 1);
        " || die "Node install succeeded but version check still fails."
        ok "Node $(node --version) installed."
    else
        echo ""
        echo "  ERROR: Node 22.14+ is required. Hermes will not install without it."
        echo ""
        echo "  To install automatically: bash INSTALL_HERMES.sh --auto-node"
        echo "  To install manually (Ubuntu/WSL2):"
        echo "    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -"
        echo "    sudo apt-get install -y nodejs"
        echo "  Then rerun this script."
        exit 10
    fi
else
    NODE_VER="$(node --version)"
    ok "Node $NODE_VER (required: 22.14+)"
fi

# ─── 3. Download and confirm before running the upstream installer ─────────────

step "Preparing to install Hermes Agent from Nous Research..."

echo ""
echo "  SECURITY CONFIRMATION REQUIRED"
echo ""
echo "  About to download and run the Hermes installer from:"
echo "    $HERMES_INSTALL_URL"
echo ""
echo "  The installer will:"
echo "    - Install Hermes Agent into ~/.hermes/"
echo "    - Add ~/.hermes/bin/ to your PATH (via ~/.bashrc or ~/.zshrc)"
echo "    - No data leaves your machine unless you route through Nous Portal"
echo ""
echo "  You can review the installer before proceeding:"
echo "    curl -fsSL $HERMES_INSTALL_URL | less"
echo ""

printf "  Type Y to proceed with installation, or anything else to cancel: "
read -r CONFIRM

if [ "$CONFIRM" != "Y" ] && [ "$CONFIRM" != "y" ]; then
    echo ""
    echo "  Installation cancelled by operator."
    echo "  To run manually when ready:"
    echo "    curl -fsSL $HERMES_INSTALL_URL | bash"
    exit 0
fi

step "Running Hermes installer..."

# Run the upstream installer
curl -fsSL "$HERMES_INSTALL_URL" | bash

ok "Hermes installer completed."

# ─── 4. Write ORANGEBOX AGENTS.md guardrails ──────────────────────────────────

step "Writing ORANGEBOX guardrails to $HERMES_HOME/AGENTS.md..."

mkdir -p "$HERMES_HOME"

AGENTS_SRC="$SCRIPT_DIR/AGENTS.md"
AGENTS_DST="$HERMES_HOME/AGENTS.md"

if [ -f "$AGENTS_SRC" ]; then
    cp "$AGENTS_SRC" "$AGENTS_DST"
    ok "Guardrails written from pack: $AGENTS_DST"
else
    # Inline fallback if AGENTS.md is not next to this script
    cat > "$AGENTS_DST" <<'AGENTS'
# ORANGEBOX Hermes Guardrails

ORANGEBOX is source of truth. Hermes is optional outer orchestration only.

- Do not run destructive actions without operator approval.
- Do not auto-install skills from public registries — operator approves each skill explicitly.
- Do not expose the Hermes gateway to LAN or internet by default. Loopback only.
- Summarize large logs before returning them.
- Use Codexa for local/worker actions and ORANGEBOX receipts for proof.
- Messaging gateway (Telegram/Discord/Signal) stays OFF until operator pairs it explicitly.
- Auto-generated skills go to ~/.hermes/skills-pending/ and require operator promotion to ~/.hermes/skills-active/.
- Persistent memory is operator-owned and never egresses unless explicitly cited.
- Trilane authority order (GPT > Gemini > Claude) applies in Hermes multi-model debates.
AGENTS
    ok "Guardrails written (inline fallback): $AGENTS_DST"
fi

# ─── 5. Verify install + PATH + next steps ────────────────────────────────────

step "Verifying Hermes install..."

# Make hermes discoverable in this session if the installer updated PATH
HERMES_BIN="$HOME/.hermes/bin"
if [ -d "$HERMES_BIN" ]; then
    export PATH="$HERMES_BIN:$PATH"
fi

if command -v hermes >/dev/null 2>&1; then
    INSTALLED_VER="$(hermes --version 2>/dev/null | head -1 || echo "(unknown)")"
    ok "hermes $INSTALLED_VER is on PATH."
else
    warn "hermes binary not found on PATH after install."
    echo "  Add to your shell profile and reload:"
    echo "    export PATH=\"\$HOME/.hermes/bin:\$PATH\""
    echo "  Or restart your terminal."
fi

echo ""
echo "============================================================"
echo "  HERMES AGENT INSTALLED — NEXT STEPS"
echo "============================================================"
echo ""
echo "  1. Set your active model:"
echo "       hermes model"
echo "       hermes model anthropic/claude-sonnet-4-5"
echo "       hermes model openai/gpt-4o"
echo "       hermes model openrouter/meta-llama/llama-3.1-405b-instruct"
echo ""
echo "  2. Run initial setup:"
echo "       hermes setup"
echo ""
echo "  3. Start the MCP server (ORANGEBOX connects here):"
echo "       hermes mcp serve"
echo "       # Default: http://127.0.0.1:18790/mcp/"
echo ""
echo "  4. Optional — start the dashboard:"
echo "       hermes dashboard --port 9119"
echo ""
echo "  5. Optional — register a systemd user service (Linux/WSL2):"
echo "       hermes hooks install"
echo ""
echo "  6. Health check from ORANGEBOX:"
echo "       node scripts/v4/hermes/hermes-status.mjs --text"
echo ""
echo "  Docs: https://github.com/nousresearch/hermes-agent"
echo "============================================================"
echo ""
