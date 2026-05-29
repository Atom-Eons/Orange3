export function registerAeSeeSuiteTools({ server, z, textContent, orangebox, trackedTool }) {
  const frontendBuild = "npm run build:web";

  async function runCommand(command, timeoutMs = 240000) {
    return orangebox("/api/v4/mcp/code-execute", {
      method: "POST",
      body: { command, timeoutMs, receipt: true },
      timeoutMs
    });
  }

  server.registerTool(
    "ae_see_suite_help",
    {
      title: "AE See-Suite Help",
      description: "Show the AE See-Suite living dashboard build contract, state atlas workflow, and proof commands.",
      inputSchema: {}
    },
    trackedTool("ae_see_suite_help", async () => textContent({
      status: "VERIFIED",
      product: "AE See-Suite living AI operating environment",
      law: "One AppShell, many semantic states. Never build 72 pages or use mockup images as UI.",
      anchors: ["01 Calm", "06 Alert", "22 Temporal Memory", "26 Command Palette", "37 Agent Queue", "61 Living Canvas"],
      commands: {
        build: frontendBuild,
        proofAnchors: "npm run build:web && npm run frontend:proof:visual -- --states=01,06,22,26,37,61 --label=mcp-anchors",
        proof72: "npm run build:web && npm run frontend:proof:visual:72"
      },
      nextGoal: "Convert state atlas surfaces into real product behavior driven by Zustand state, user actions, and backend stream events."
    }))
  );

  server.registerTool(
    "ae_see_suite_build_frontend",
    {
      title: "Build AE See-Suite Frontend",
      description: "Run the frontend TypeScript/Vite build through the receipted OrangeBOX executor.",
      inputSchema: {}
    },
    trackedTool("ae_see_suite_build_frontend", async () => textContent(await runCommand(frontendBuild, 240000)))
  );

  server.registerTool(
    "ae_see_suite_proof_anchors",
    {
      title: "Proof AE See-Suite Anchor States",
      description: "Build and capture the highest-value AE See-Suite anchor states: 01, 06, 22, 26, 37, 61.",
      inputSchema: {
        states: z.string().optional().describe("Comma-separated state ids. Default: 01,06,22,26,37,61"),
        label: z.string().optional().describe("Visual proof label. Default: mcp-anchors")
      }
    },
    trackedTool("ae_see_suite_proof_anchors", async ({ states = "01,06,22,26,37,61", label = "mcp-anchors" }) => {
      const command = `npm run build:web && npm run frontend:proof:visual -- --states=${states} --label=${label}`;
      return textContent(await runCommand(command, 420000));
    })
  );

  server.registerTool(
    "ae_see_suite_proof_72",
    {
      title: "Proof AE See-Suite 72-State Atlas",
      description: "Build and capture all 72 AE See-Suite state atlas entries.",
      inputSchema: {
        label: z.string().optional().describe("Visual proof label. Default: mcp-72-state")
      }
    },
    trackedTool("ae_see_suite_proof_72", async ({ label = "mcp-72-state" }) => {
      const command = `npm run build:web && npm run frontend:proof:visual:72 -- --label=${label}`;
      return textContent(await runCommand(command, 900000));
    })
  );

  server.registerTool(
    "ae_see_suite_state_open_command",
    {
      title: "AE See-Suite State URL Helper",
      description: "Return direct local URLs and acceptance checks for a state atlas id.",
      inputSchema: {
        state: z.string().describe("State id such as 01, 06, 22, 26, 37, or 61."),
        baseUrl: z.string().optional().describe("Frontend base URL. Default http://localhost:5173")
      }
    },
    trackedTool("ae_see_suite_state_open_command", async ({ state, baseUrl = "http://localhost:5173" }) => {
      const normalized = String(state).padStart(2, "0");
      const acceptance = {
        "01": ["calm shell", "no forced incident", "panels readable", "chat dock available"],
        "06": ["alert mode", "causal path visible", "watcher/analyst active", "remediation suggestions"],
        "22": ["temporal expanded overlay", "timeline events visible", "scrub controls visible", "composer can receive timeline prompt"],
        "26": ["command palette open", "dashboard recessed", "actions searchable"],
        "37": ["agent queue drawer open", "tasks/agents visible", "dashboard remains behind drawer"],
        "61": ["living canvas primary", "artifact branches visible", "chat dock remains command surface"]
      };
      return textContent({
        status: "VERIFIED",
        state: normalized,
        url: `${baseUrl}/?state=${normalized}`,
        acceptance: acceptance[normalized] ?? ["same AppShell", "state reachable", "no mockup image as UI"],
        note: "Use this as a local browser target or proof-run target."
      });
    })
  );
}
