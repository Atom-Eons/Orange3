#!/usr/bin/env node
import process from "node:process";

const defaults = {
  server: process.env.BLUEB0X_COMMAND_URL || "http://127.0.0.1:8787",
  project: process.env.BLUEB0X_PROJECT || "orangebox",
  from: process.env.BLUEB0X_FROM || "OPERATOR",
  to: "AE0",
  intent: "command",
  node: "",
  priority: "normal",
  message: "",
  mode: "call"
};

function help() {
  return `FATCAT - BLUEB0X.AI structured AI phone system

Create a directed command call:
  npm run fatcat -- --to CODEXA --intent run_tests --node 1Q --message "Run build and return receipt."
  npm run fatcat -- --to LIPS,MIRRORS --intent review_ui --node 1J --message "Review compact layout."

Read switchboard:
  npm run fatcat -- --status
  npm run fatcat -- --calls

Resolve a call:
  npm run fatcat -- --update --id <call-id> --call-status verified --message "Build passed." --receipt "C:/..."

Raise a DAG conflict:
  npm run fatcat -- --conflict --node 1J --from AE6 --type buildability --message "Compact layout overflows." --evidence "visual-proof path"

Options:
  --server <url>       default ${defaults.server}
  --project <name>     default ${defaults.project}
  --from <team>        OPERATOR, OPUS, CODEX, CODEXA, AE0-AE14, LIPS, MIRRORS
  --to <targets>       comma-separated targets
  --intent <name>      run_tests, review_ui, ask_opus, stop_all, etc.
  --node <id>          DAG node id
  --priority <level>   low, normal, high, urgent
  --message <text>     request/body
  --approval           force approval-required call
  --call-status <s>    update status
  --id <call-id>       update target
  --receipt <path>     evidence receipt path
`;
}

function parseArgs(argv) {
  const args = { ...defaults, approval: false };
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--help" || item === "-h") args.mode = "help";
    else if (item === "--status") args.mode = "status";
    else if (item === "--calls") args.mode = "calls";
    else if (item === "--update") args.mode = "update";
    else if (item === "--conflict") args.mode = "conflict";
    else if (item === "--approval") args.approval = true;
    else if (item === "--server") args.server = argv[++i] || args.server;
    else if (item === "--project") args.project = argv[++i] || args.project;
    else if (item === "--from" || item === "--team") args.from = argv[++i] || args.from;
    else if (item === "--to" || item === "--target") args.to = argv[++i] || args.to;
    else if (item === "--intent") args.intent = argv[++i] || args.intent;
    else if (item === "--node" || item === "--dag-node") args.node = argv[++i] || args.node;
    else if (item === "--priority") args.priority = argv[++i] || args.priority;
    else if (item === "--message" || item === "-m") args.message = argv[++i] || args.message;
    else if (item === "--id" || item === "--call-id") args.id = argv[++i] || args.id;
    else if (item === "--status-value" || item === "--call-status" || item === "--status-name") args.status = argv[++i] || args.status;
    else if (item === "--receipt") args.receipt = argv[++i] || args.receipt;
    else if (item === "--type") args.type = argv[++i] || args.type;
    else if (item === "--evidence") args.evidence = argv[++i] || args.evidence;
  }
  args.server = String(args.server).replace(/\/+$/, "");
  return args;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { status: "UNPARSED", text };
  }
  if (!response.ok) throw new Error(parsed?.error || parsed?.message || `${response.status} ${response.statusText}`);
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.mode === "help") return console.log(help());
  if (args.mode === "status") {
    const payload = await request(`${args.server}/api/fatcat/status?project=${encodeURIComponent(args.project)}`);
    return console.log(JSON.stringify(payload, null, 2));
  }
  if (args.mode === "calls") {
    const payload = await request(`${args.server}/api/fatcat/calls?project=${encodeURIComponent(args.project)}&limit=80`);
    return console.log(JSON.stringify(payload, null, 2));
  }
  if (args.mode === "update") {
    if (!args.id) throw new Error("--id is required for --update");
    const payload = await request(`${args.server}/api/fatcat/call/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: args.project,
        id: args.id,
        status: args.status || "verified",
        summary: args.message,
        receiptPath: args.receipt || null,
        evidence: args.evidence || ""
      })
    });
    return console.log(JSON.stringify(payload, null, 2));
  }
  if (args.mode === "conflict") {
    if (!args.node) throw new Error("--node is required for --conflict");
    const payload = await request(`${args.server}/api/project-dag/conflict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: args.project,
        node_id: args.node,
        raised_by: args.from,
        type: args.type || args.intent || "cross_department",
        claim: args.message,
        evidence: args.evidence || args.receipt || "",
        severity: args.priority
      })
    });
    return console.log(JSON.stringify(payload, null, 2));
  }
  if (!String(args.message || "").trim()) throw new Error("--message is required for a FATCAT call");
  const payload = await request(`${args.server}/api/fatcat/call`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: args.project,
      from: args.from,
      to: args.to,
      intent: args.intent,
      priority: args.priority,
      dagNode: args.node,
      request: args.message,
      approvalRequired: args.approval
    })
  });
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(`FATCAT_FAILED: ${error.message}`);
  process.exit(1);
});
