#!/usr/bin/env bash
# v6-reality-audit.sh — 30-point honest audit of installed v6.0.9
# Tests EVERY claim made for v6.0.x across all 11 lanes.
# Pass/Fail/Skip per check; final tally.

set -u
B=http://127.0.0.1:8787
T=http://127.0.0.1:8788

PASS=0; FAIL=0; SKIP=0
declare -a FAILED
declare -a PASSED

check() {
  local name="$1"; shift
  local expected="$1"; shift
  local actual; actual="$("$@" 2>&1)"
  if [[ "$actual" == *"$expected"* ]]; then
    PASS=$((PASS+1)); PASSED+=("$name")
    printf "  PASS  %-55s\n" "$name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name :: expected='$expected' got='$(echo "$actual" | head -c 80)'")
    printf "  FAIL  %-55s  got: %s\n" "$name" "$(echo "$actual" | head -c 60)"
  fi
}

# 1. Process alive
check "01 orangebox.exe alive" "orangebox.exe" tasklist
# 2. Sidecar 8787
check "02 sidecar on 8787" ":8787" bash -c "cmd.exe //c \"netstat -ano | findstr LISTENING\" 2>&1 | grep :8787"
# 3. Tunnel 8788
check "03 tunnel on 8788" ":8788" bash -c "cmd.exe //c \"netstat -ano | findstr LISTENING\" 2>&1 | grep :8788"

# 4-10. Status + lanes
check "04 /cockpit/status v6 block"            '"v6"'             curl -s -m 4 $B/api/v4/cockpit/status
check "05 /privacy/summary totals"             '"totals"'         curl -s -m 4 $B/api/v4/privacy/summary
check "06 /receipts/list items"                '"items"'          curl -s -m 4 $B/api/v4/receipts/list
check "07 /freeze/status"                      '"active"'         curl -s -m 4 $B/api/v4/freeze/status
check "08 /memory/summary 4-tier"              '"working"'        curl -s -m 4 $B/api/v4/memory/summary
check "09 /router/combos"                      '"combos"'         curl -s -m 4 $B/api/v4/router/combos
check "10 /skills/list counts"                 '"counts"'         curl -s -m 4 $B/api/v4/skills/list

# 11-15. Router task types
check "11 router quick_reply  -> Groq"         '"groq"'           bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"task\":\"quick_reply\"}' $B/api/v4/router/route"
check "12 router synthesis@quality -> quadlane" '"quadlane"'       bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"task\":\"synthesis\",\"budget\":1000}' $B/api/v4/router/route"
check "13 router offline_chat -> Ollama"       '"ollama"'         bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"task\":\"offline_chat\"}' $B/api/v4/router/route"
check "14 router route_dispatch -> Groq"       '"groq"'           bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"task\":\"route_dispatch\"}' $B/api/v4/router/route"
check "15 agent_teams advisory on synthesis"   '"enabled":true'   bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"task\":\"synthesis\",\"budget\":1000}' $B/api/v4/router/route"

# 16-18. Careful + freeze
check "16 careful blocks rm -rf /"             '"destructive":true'  bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"command\":\"rm -rf /var\"}' $B/api/v4/careful/check"
check "17 careful allows safe rm node_modules" '"destructive":false' bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"command\":\"rm -rf node_modules\"}' $B/api/v4/careful/check"
check "18 freeze can be set"                   '"active":true'    bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"active\":true,\"root\":\"C:\\\\\\\\AtomEons\\\\\\\\orangebox\\\\\\\\src\"}' $B/api/v4/freeze/set"
# Clear freeze immediately
curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{"active":false}' $B/api/v4/freeze/set > /dev/null 2>&1

# 19-21. Shell stream
check "19 shell start session"                 '"id"'             bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{}' $B/api/v4/shell/start"
check "20 shell list active"                   '"sessions"'       curl -s -m 4 $B/api/v4/shell/list
check "21 shell exec destructive blocked"      '"blocked":true'   bash -c "SID=\$(curl -s -X POST -H 'Content-Type: application/json' -d '{}' $B/api/v4/shell/start | python -c 'import sys,json;print(json.load(sys.stdin)[\"id\"])' 2>/dev/null); curl -s -m 4 -X POST -H 'Content-Type: application/json' -d \"{\\\"id\\\":\\\"\$SID\\\",\\\"command\\\":\\\"rm -rf /var\\\"}\" $B/api/v4/shell/exec"

# 22-25. Composer + vault + sprint
check "22 composer scaffold returns prompt"    '"llm_prompt"'     bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"prompt\":\"test\",\"files\":[\"C:\\\\\\\\AtomEons\\\\\\\\orangebox\\\\\\\\README.md\"]}' $B/api/v4/composer/scaffold"
check "23 vault summary (no key needed)"       '"exists"'         curl -s -m 4 $B/api/v4/vault/summary
check "24 vault search (no key)"               '"hits"'           bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"query\":\"orangebox\"}' $B/api/v4/vault/search"
check "25 sprint plan composite"               '"phases"'         bash -c "curl -s -m 4 -X POST -H 'Content-Type: application/json' -d '{\"prompt\":\"build a thing\"}' $B/api/v4/sprint/run"

# 26-28. Deps + tunnel + hermes
check "26 deps status (current Node)"          '"current"'        curl -s -m 8 $B/api/v4/deps/status
check "27 hermes/feed graceful"                '"installed"'      curl -s -m 4 $B/api/v4/hermes/feed
check "28 tunnel allowlisted endpoint OK"      "HTTP/1.1 200"     bash -c "curl -s -m 4 -v $T/api/v4/cockpit/status 2>&1 | grep HTTP"

# 29-30. Tunnel allowlist + benchmark harness
check "29 tunnel denies non-allowlisted"       "HTTP/1.1 403"     bash -c "curl -s -m 4 -v $T/api/v4/codexa/tenant/list 2>&1 | grep HTTP"
check "30 benchmark/longmemeval runs"          '"R5"'             bash -c "curl -s -m 30 -X POST -H 'Content-Type: application/json' -d '{}' $B/api/v4/benchmark/longmemeval/run"

echo ""
echo "================================"
echo "v6.0.9 REALITY AUDIT — $PASS PASS / $FAIL FAIL"
echo "================================"
if [ $FAIL -gt 0 ]; then
  echo "Failures:"
  for f in "${FAILED[@]}"; do
    echo "  - $f"
  done
fi
exit $FAIL
