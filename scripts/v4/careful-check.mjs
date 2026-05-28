/* careful-check.mjs — v6.0.2 destructive-command pre-execution check (gstack /careful)
   Returns { destructive, reason }. Caller asks for confirmation when destructive=true. */

const PATTERNS = [
  // Recursive deletion
  { re: /\brm\s+(-[rR]f?|--recursive)\b/,   reason: "recursive deletion (rm -rf / -r / --recursive)" },
  // Database
  { re: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,  reason: "destructive DDL (DROP TABLE/DATABASE/SCHEMA)" },
  { re: /\bTRUNCATE\b/i,                    reason: "TRUNCATE wipes table contents" },
  // Git history rewrites
  { re: /\bgit\s+push\s+(-f\b|--force\b|--force-with-lease\b)/, reason: "force-push rewrites remote history" },
  { re: /\bgit\s+reset\s+--hard\b/,         reason: "git reset --hard discards local changes" },
  // Git work loss
  { re: /\bgit\s+checkout\s+\.\s*$/m,       reason: "git checkout . discards uncommitted edits" },
  { re: /\bgit\s+restore\s+\.\s*$/m,        reason: "git restore . discards uncommitted edits" },
  // Container/cluster
  { re: /\bkubectl\s+delete\b/,             reason: "kubectl delete removes cluster resources" },
  { re: /\bdocker\s+rm\s+-f\b/,             reason: "docker rm -f force-removes containers" },
  { re: /\bdocker\s+system\s+prune\b/,      reason: "docker system prune wipes images + volumes" },
  // Filesystem wipers
  { re: /\bshred\b|\bsrm\b/,                reason: "secure-wipe utility (shred / srm)" },
  { re: /\bfdisk\b|\bmkfs\b/,               reason: "disk partitioner / format" },
];

// Patterns explicitly allowed (do not warn) — common dev cleanup
const SAFE = [
  /\brm\s+-rf?\s+(?:\.?\/)?(?:node_modules|\.next|dist|__pycache__|\.cache|build|\.turbo|coverage|target|\.venv|venv|out|\.pytest_cache)(?:\/[\w./-]+)?\s*$/,
];

export function check(command) {
  const cmd = String(command || "").trim();
  if (!cmd) return { destructive: false };
  if (process.env.ORANGEBOX_CAREFUL === "0") return { destructive: false };
  for (const safe of SAFE) {
    if (safe.test(cmd)) return { destructive: false, override: "safe-pattern" };
  }
  for (const p of PATTERNS) {
    if (p.re.test(cmd)) {
      return { destructive: true, reason: p.reason, pattern: p.re.toString() };
    }
  }
  return { destructive: false };
}
