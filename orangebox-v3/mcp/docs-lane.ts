import { isMain, writeReceipt } from "../lib/core.ts";

export async function docsLaneDoctor() {
  const report = {
    ok: true,
    status: "MCP_CONTEXT7_DOCS_LANE_READY",
    mode: "read_only_docs_hydration",
    allowed_initial_tools: ["docs search", "versioned library context", "metadata-only source pointers"],
    forbidden_initial_tools: ["arbitrary shell", "repo mutation", "write tools", "secrets access"],
    promoted_by_default: false,
    proof_required: ["MCP quarantine doctor", "output cap", "localhost binding or approved connector", "receipt"],
    context7_contract: {
      role: "fresh versioned documentation hydration for coding tasks",
      accepted_modes: ["CLI + skill", "MCP server"],
      authority_limit: "Context7 may provide source pointers and docs snippets; it cannot mutate the repo, run shell commands, or decide routes.",
      promotion_blockers: [
        "API-key/rate-limit behavior must be explicit",
        "Output caps must prevent context flooding",
        "Every hydrated doc packet needs source metadata",
        "MCP quarantine must remain green",
      ],
    },
  };
  const receipt = await writeReceipt("mcp-context7-docs-lane", report);
  return { ...report, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  docsLaneDoctor().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "MCP_DOCS_LANE_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
