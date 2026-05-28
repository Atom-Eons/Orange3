#!/usr/bin/env node
import process from "node:process";
import fs from "node:fs/promises";

const defaults = {
  server: process.env.BLUEB0X_COMMAND_URL || "http://127.0.0.1:8787",
  project: process.env.BLUEB0X_PROJECT || "orangebox",
  team: process.env.BLUEB0X_TEAM || "AE0",
  room: "project",
  kind: "note",
  status: "INFO",
  node: "",
  message: "",
  evidence: "",
  mode: "post"
};

function help() {
  return `BLUEB0X.AI Party Line CLI

Post from Claude Code, Codex CLI/Desktop, OpenClaw, or a local worker:
  npm run party -- --team AE6 --node 1Q --status WORKING --message "Running build on Codexa."
  node ./scripts/blueb0x-party-line.mjs --team LIPS --kind verdict --status REVIEW_REQUIRED --stdin < lips-note.md

Read the room or stage Opus:
  npm run party -- --read
  npm run party -- --summary
  npm run party -- --awareness

Options:
  --server <url>       BLUEB0X command URL, default ${defaults.server}
  --project <name>     Project key, default ${defaults.project}
  --team <id>          AE0-AE14, LIPS, MIRRORS, or custom id
  --node <id>          DAG node id, e.g. 1B
  --kind <kind>        note, request, verdict, blocker, receipt
  --status <status>    INFO, WORKING, VERIFIED, BLOCKED, REVIEW_REQUIRED
  --message <text>     Message body
  --evidence <text>    Short evidence or receipt path
  --stdin              Read message from stdin
  --read               Print recent party-line messages as JSON
  --summary            Rebuild/print summary metadata
  --awareness          Generate and print Opus awareness packet
`;
}

function parseArgs(argv) {
  const args = { ...defaults };
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--help" || item === "-h") args.mode = "help";
    else if (item === "--read") args.mode = "read";
    else if (item === "--summary") args.mode = "summary";
    else if (item === "--awareness") args.mode = "awareness";
    else if (item === "--stdin") args.stdin = true;
    else if (item === "--server") args.server = argv[++i] || args.server;
    else if (item === "--project") args.project = argv[++i] || args.project;
    else if (item === "--team" || item === "--from") args.team = argv[++i] || args.team;
    else if (item === "--room") args.room = argv[++i] || args.room;
    else if (item === "--kind") args.kind = argv[++i] || args.kind;
    else if (item === "--status") args.status = argv[++i] || args.status;
    else if (item === "--node" || item === "--dag-node") args.node = argv[++i] || args.node;
    else if (item === "--message" || item === "-m") args.message = argv[++i] || args.message;
    else if (item === "--evidence") args.evidence = argv[++i] || args.evidence;
  }
  args.server = String(args.server).replace(/\/+$/, "");
  return args;
}

async function stdinText() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
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
  if (!response.ok) {
    const message = parsed?.error || parsed?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.mode === "help") {
    console.log(help());
    return;
  }
  if (args.mode === "read") {
    const payload = await request(`${args.server}/api/party-line?project=${encodeURIComponent(args.project)}&limit=80`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (args.mode === "summary") {
    const payload = await request(`${args.server}/api/party-line/summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: args.project })
    });
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (args.mode === "awareness") {
    const payload = await request(`${args.server}/api/opus-awareness?project=${encodeURIComponent(args.project)}`);
    console.log(payload.markdown || JSON.stringify(payload, null, 2));
    return;
  }
  const message = args.stdin ? await stdinText() : args.message;
  if (!String(message || "").trim()) throw new Error("party-line message is required; use --message or --stdin");
  const payload = await request(`${args.server}/api/party-line`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: args.project,
      team: args.team,
      room: args.room,
      kind: args.kind,
      status: args.status,
      dagNode: args.node,
      text: message,
      evidence: args.evidence
    })
  });
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(`BLUEB0X_PARTY_LINE_FAILED: ${error.message}`);
  process.exit(1);
});
