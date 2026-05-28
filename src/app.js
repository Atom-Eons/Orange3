const state = {
  pendingFiles: [],
  latestContextId: null,
  status: null,
  codexaReceipts: [],
  departments: [],
  stacks: [],
  agents: [],
  selectedDepartments: new Set(),
  power: null,
  optimizer: null,
  activeProject: "orangebox",
  projectThread: null,
  projectSpine: null,
  projectDag: null,
  partyLine: null,
  fatcat: null,
  reviewEngines: null,
  triad: null,
  departmentModels: null,
  departmentLearning: null,
  mirage: null,
  ae0Council: null,
  checkmate: null,
  hallucinationGate: null,
  tasteEngine: null,
  atomStandard: null,
  commandBrief: null,
  scopeLedger: null,
  decisionGates: null,
  buildout: null,
  mcpEvents: [],
  etherealLink: null,
  v4LoopRunning: false
};

let chatSessionId = crypto.randomUUID();
const inFlight = new Map();
const LEGACY_SURFACE_KEY = "c" + "ockpit";
const BASIC_INSTALL_RAIL_STATUS = "NOT_CONFIGURED_BASIC_INSTALL";

const $ = (id) => document.getElementById(id);

function singleFlight(key, task) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = Promise.resolve()
    .then(task)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function scheduleTask(key, delayMs, task) {
  setTimeout(() => {
    if (document.hidden) return;
    singleFlight(key, task).catch((error) => setStatus(error.message));
  }, delayMs);
}

const commandToolkit = [
  {
    group: "Control",
    items: [
      { label: "Plan", insert: "/plan ", detail: "Force structured thinking before execution." },
      { label: "Clear", insert: "/clear", detail: "Reset messy local context." },
      { label: "Compact", insert: "/compact", detail: "Compress the thread to what matters." }
    ]
  },
  {
    group: "Workspace",
    items: [
      { label: "Init", insert: "/init", detail: "Create base Claude workspace guidance." },
      { label: "Memory", insert: "/memory ", detail: "Tell Claude what to remember." },
      { label: "Permissions", insert: "/permissions", detail: "Review/edit tool permission posture." },
      { label: "Add Dir", insert: "/add-dir C:\\AtomEons\\", detail: "Attach project folders deliberately." }
    ]
  },
  {
    group: "Versions",
    items: [
      { label: "Branch", insert: "/branch ", detail: "Try an approach without losing the main line." },
      { label: "Rewind", insert: "/rewind", detail: "Back out when a direction breaks." },
      { label: "Resume", insert: "/resume ", detail: "Continue a prior Claude session." }
    ]
  },
  {
    group: "Systems",
    items: [
      { label: "MCP", insert: "/mcp", detail: "Inspect connected tools and servers." },
      { label: "Schedule", insert: "/schedule ", detail: "Create or manage Claude Code Routines / scheduled work." },
      { label: "Diff", insert: "/diff", detail: "Review code changes before calling done." },
      { label: "Security", insert: "/security-review", detail: "Run early risk review." },
      { label: "Export", insert: "/export", detail: "Save outputs/handoff." }
    ]
  },
  {
    group: "Usage",
    items: [
      { label: "Cost", insert: "/cost", detail: "Check token/cost visibility." },
      { label: "Model", insert: "/model ", detail: "Switch model lane deliberately." },
      { label: "Usage", insert: "/usage", detail: "Check remaining limits." }
    ]
  },
  {
    group: "ORANGEBOX",
    items: [
      { label: "Mission", insert: "/mission ", detail: "Create project graph from the current goal." },
      { label: "Team", insert: "/team ", detail: "Run smallest useful AE team." },
      { label: "Proof", insert: "/proof ", detail: "Demand visual/test/receipt evidence." },
      { label: "Checkmate", insert: "/checkmate ", detail: "Run Atom Standard review pressure." },
      { label: "Taste", insert: "/taste ", detail: "Run AE3 final filter language." },
      { label: "Design LLM", insert: "/department AE3\n/lips\nTask: ", detail: "Invoke AE3/LIPS design department packet." }
    ]
  }
];

function statusClass(status) {
  if (["VERIFIED", "Verified", "DONE", "PASSED", "complete", "approved", "CAN_INCREASE", "READY", "ACTIONABLE", "ADOPTED", "ADAPTED", "CHECKMATE_LIGHT_VERIFIED", "CHECKMATE_FULL_CONFIGURED", "ATOM_STANDARD_READY", "Atom Standard", "Tasteful", "hot", "released", "TRIAD_READY", "PRECHECK_OK", "ETHERNET_GATEWAY_READY", "DIRECT_CAT8_READY", "DIRECT_LINK_VERIFIED", "ROUTER_LAN_VERIFIED", "AI_BOX_EXTRA_VERIFIED", "AI_BOX_PRIORITY_ROUTE_VERIFIED", "ETHEREAL_DIRECT_READY", "ETHEREAL_JUMBO_VERIFIED"].includes(status)) return "green";
  if (["TIMEOUT", "Queued", "QUEUED", "pending", "in_progress", "awaiting_approval", "CONFIGURED", "CONFIGURED_UNPROBED", "Running", "RUNNING", "Needs Approval", "NEEDS_APPROVAL", "HOLD_OR_SMALL_INCREASE", "CONFIGURED_UNPARSED", "HOLD", "GUARDED", "TRAINABLE", "NOT_YET", "CONFIGURED_WITH_GAPS", "REJECTED_AS_CODE", "CHECKMATE_REVIEW_REQUIRED", "REVIEWED", "REVIEWED_WITH_ACTIONS", "EARLY_WARNING", "REVISE", "Revise", "Polish", "INFO", "cold", "warming", "cooldown", "TRIAD_GUARDED", "TRIAD_CONFIGURED_ROUTE_UNVERIFIED", "LOCAL_REPAIR_PACK_READY", "AI_BOX_CONFIGURED_UNVERIFIED", "ETHEREAL_CONFIGURED_UNVERIFIED", "ETHEREAL_UNCONFIGURED"].includes(status)) return "amber";
  return "red";
}

function statusLabel(status) {
  const raw = String(status || "checking");
  const label = raw.replace(/_/g, " ").toLowerCase();
  return label.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isBasicInstallRailStatus(status) {
  return status === BASIC_INSTALL_RAIL_STATUS;
}

function commandRailViewFromRail(commandRail = {}, status = {}) {
  const rawStatus = commandRail.status || BASIC_INSTALL_RAIL_STATUS;
  const isBasicInstall = isBasicInstallRailStatus(rawStatus);
  const tokenText = status.commandRailTokenConfigured === undefined
    ? "token not required"
    : `token ${status.commandRailTokenConfigured ? "configured" : "not required for Basic"}`;

  if (isBasicInstall) {
    return {
      rail: commandRail,
      isBasicInstall,
      rawStatus,
      displayStatus: "CONFIGURED",
      badge: "BASIC INSTALL",
      value: "Basic install active",
      shortDetail: "Local ORANGEBOX ready; Advanced AI Box not paired",
      detail: "Advanced AI Box is optional. Local Codex, ORANGEBOX, provider-watch, and Knowledge v2 can run on this machine.",
      railText: `Basic install active / local / ${tokenText}`,
      routeReady: true,
      routeDetail: "Local route ready / Advanced AI Box optional",
      routeStatus: "Basic Install is ready. Pair an Advanced AI Box only when you want remote worker execution.",
      brief: "Command rail: Basic Install active; Advanced AI Box not paired."
    };
  }

  return {
    rail: commandRail,
    isBasicInstall,
    rawStatus,
    displayStatus: rawStatus || "FAILED",
    badge: rawStatus || "checking",
    value: rawStatus === "VERIFIED" ? "rail live" : (rawStatus || "checking"),
    shortDetail: `${commandRail.url || "Advanced AI Box route not verified"} / ${msLabel(commandRail.ms)}`,
    detail: rawStatus === "VERIFIED"
      ? "Advanced AI Box command rail ready"
      : "Advanced AI Box command rail needs attention",
    railText: `${rawStatus} / ${msLabel(commandRail.ms)} / token ${status.commandRailTokenConfigured ? "configured" : "missing"}`,
    routeReady: rawStatus === "VERIFIED",
    routeDetail: `${rawStatus} / ${msLabel(commandRail.ms)}`,
    routeStatus: rawStatus === "VERIFIED"
      ? "Route is armed: think here, execute on the AI Box when configured, promote through Checkmate."
      : "Advanced AI Box route needs attention before remote worker execution.",
    brief: `Command rail: ${rawStatus} / ${msLabel(commandRail.ms)}. Keep the expensive brain on judgment; make the machine do the lifting.`
  };
}

function commandRailView(status = {}) {
  return commandRailViewFromRail(resolvedCommandRail(status), status);
}

function msLabel(ms) {
  const value = Number(ms);
  return Number.isFinite(value) ? `${value}ms` : "deferred";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function hardenControlLabels(root = document) {
  root.querySelectorAll("button,a.button,a.mark").forEach((el) => {
    const readable = (el.textContent || el.innerText || el.id || el.dataset?.jump || el.dataset?.spineStep || el.dataset?.dagNode || "").trim();
    if (readable && !el.getAttribute("aria-label")) el.setAttribute("aria-label", readable.replace(/\s+/g, " "));
    if (readable && !el.getAttribute("title") && (el.matches(".card-votes button") || el.dataset?.spineStep || el.dataset?.dagNode)) {
      el.setAttribute("title", readable.replace(/\s+/g, " "));
    }
  });
}

function setStatus(text) {
  if ($("statusLine")) $("statusLine").textContent = text;
  if ($("v4StatusLine")) $("v4StatusLine").textContent = text;
}

function appendChat(role, text, meta = "") {
  const feeds = Array.from(document.querySelectorAll("#chatFeed, #commandChatFeed"));
  if (!feeds.length) return;
  feeds.forEach((feed) => {
    const div = document.createElement("div");
    div.className = `chat-msg ${role}`;
    div.innerHTML = `
      <strong>${escapeHtml(role === "user" ? "You" : role === "assistant" ? "Claude Opus" : "ORANGEBOX")}</strong>
      <p>${escapeHtml(text)}</p>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
    `;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  });
}

async function api(path, options = {}) {
  const { timeoutMs = 60000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, { ...fetchOptions, signal: fetchOptions.signal || controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`${path} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(json?.error || text || res.statusText);
  return json ?? text;
}

function renderLights(endpoints) {
  $("codexaLights").innerHTML = endpoints.map((endpoint) => `
    <div class="light">
      <span class="led ${statusClass(endpoint.status)}"></span>
      <strong>${escapeHtml(endpoint.url)}</strong>
      <span class="chip">${escapeHtml(endpoint.status)}</span>
      <small>${escapeHtml(endpoint.code || "")} ${escapeHtml(endpoint.ms || 0)}ms ${escapeHtml(endpoint.error || "")}</small>
    </div>
  `).join("");
}

function renderSystemStrip(status) {
  const endpoints = (status.endpoints && status.endpoints.length)
    ? status.endpoints
    : (status.ethernetRepair?.endpoints || []);
  const bridge = findEndpoint({ endpoints }, ":8098");
  const wiki = findEndpoint({ endpoints: endpoints.filter((row) => !row.url?.includes("RECEIPTS")) }, ":8099/");
  const n8n = findEndpoint({ endpoints }, ":5678");
  const commandRail = resolvedCommandRail(status);
  const railView = commandRailViewFromRail(commandRail, status);
  const cards = [
    { label: "AE See-Suite", detail: "127.0.0.1:8787", status: "VERIFIED" },
    { label: "Command Rail", detail: railView.shortDetail, status: railView.displayStatus },
    { label: "AI Box Bridge", detail: bridge ? `${bridge.status} / ${msLabel(bridge.ms)}` : "deferred fast", status: bridge?.status || "CONFIGURED" },
    { label: "Wiki", detail: wiki ? `${wiki.status} / ${msLabel(wiki.ms)}` : "deferred fast", status: wiki?.status || "CONFIGURED" },
    { label: "n8n", detail: n8n ? `${n8n.status} / ${msLabel(n8n.ms)}` : "deferred fast", status: n8n?.status || "CONFIGURED" },
    { label: "Tokens", detail: status.telemetry?.subscriptionTokenCounts || "UNKNOWN", status: "CONFIGURED" }
  ];
  $("systemStrip").innerHTML = cards.map((card) => `
    <div class="meter">
      <span class="led ${statusClass(card.status)}"></span>
      <strong>${escapeHtml(card.label)}</strong>
      <small>${escapeHtml(card.detail)}</small>
    </div>
  `).join("");
  const railText = railView.railText;
  if ($("commandRailStatus")) $("commandRailStatus").textContent = railText;
  const checkmate = state.checkmate || {};
  const railGreen = railView.routeReady;
  if ($("routeCodexa")) $("routeCodexa").className = `route-node ${railGreen ? "live" : "warning"}`;
  if ($("routeCheckmate")) $("routeCheckmate").className = `route-node ${checkmate.status === "VERIFIED" ? "live" : "warning"}`;
  if ($("routeHandoff")) $("routeHandoff").className = "route-node live";
  if ($("routeCodexaDetail")) $("routeCodexaDetail").textContent = railView.routeDetail;
  if ($("routeCheckmateDetail")) $("routeCheckmateDetail").textContent = checkmate.counts
    ? `${checkmate.counts.VERIFIED || 0} tools verified`
    : "checking arsenal";
  if ($("routeStatus")) $("routeStatus").textContent = railView.routeStatus;
  if ($("routeBrief")) $("routeBrief").textContent = `Provider tokens: ${status.telemetry?.subscriptionTokenCounts || "UNKNOWN"}. ${railView.brief}`;
  renderCommandHub(status);
}

function renderGraph(mission) {
  if (!mission) {
    $("missionGraph").innerHTML = `<p class="muted">No mission yet. Create one and ORANGEBOX will build the graph.</p>`;
    $("agentMix").innerHTML = `<p class="muted">No AE department mix selected yet.</p>`;
    return;
  }
  $("missionGraph").innerHTML = mission.nodes.map((node) => `
    <div class="node">
      <span class="led ${statusClass(node.status)}"></span>
      <strong>${escapeHtml(node.label)}</strong>
      <span class="chip">${escapeHtml(node.status)}</span>
      <small>${escapeHtml(node.owner)} / ${escapeHtml(node.kind)}</small>
    </div>
  `).join("");
  $("agentMix").innerHTML = `
    <p class="eyebrow">Selected AE Department Mix</p>
    <div class="agent-chips">
      ${mission.agents.map((agent) => `<span class="chip">${escapeHtml(agent.id)} ${escapeHtml(agent.name)}</span>`).join("")}
    </div>
    ${mission.approvals?.length ? `<p class="warn">${escapeHtml(mission.approvals.join(" "))}</p>` : `<p class="muted">Smallest useful team selected. Add more only when work actually splits.</p>`}
  `;
}

function renderContexts(contexts) {
  const latest = contexts[0];
  $("contextBudget").textContent = `${latest?.estimatedTokens?.toLocaleString?.() || 0} tokens`;
  if (!latest) {
    $("contextList").innerHTML = `<p class="muted">Drop files or folders to create a context manifest.</p>`;
    return;
  }
  state.latestContextId = latest.id;
  $("contextList").innerHTML = latest.items.slice(0, 18).map((item) => `
    <div class="context-item">
      <span class="led ${item.risk === "HIGH" ? "red" : item.risk === "MEDIUM" ? "amber" : "green"}"></span>
      <strong>${escapeHtml(item.relativePath)}</strong>
      <span class="chip">${escapeHtml(item.action)}</span>
      <small>${escapeHtml(item.type)} / ${Number(item.size || 0).toLocaleString()} bytes / ${Number(item.estimatedTokens || 0).toLocaleString()} est tokens / risk ${escapeHtml(item.risk)}</small>
    </div>
  `).join("");
}

function renderProof(status) {
  const rows = [
    ...(status.benchmarks || []).map((row) => ({ ...row, kind: "benchmark" })),
    ...(status.receipts || []).map((row) => ({ ...row, kind: "receipt" })),
    ...(status.proofs || []).map((row) => ({ ...row, kind: "proof" }))
  ].slice(0, 18);
  $("proofList").innerHTML = rows.length ? rows.map((row) => `
    <div class="proof-item">
      <span class="led green"></span>
      <strong>${escapeHtml(row.name)}</strong>
      <span class="chip">${escapeHtml(row.kind)}</span>
      ${String(row.name || "").toLowerCase().endsWith(".png") ? `<img class="thumb" src="/orangebox/proof/${encodeURIComponent(row.name)}" alt="${escapeHtml(row.name)}">` : ""}
      <small>${escapeHtml(row.path)} / ${escapeHtml(row.mtime || "")}</small>
    </div>
  `).join("") : `<p class="muted">No proof yet. Run a benchmark or mission.</p>`;
}

function renderCodexaPulse(status) {
  const latest = (status.benchmarks || []).find((row) => row.name?.includes("codexa"));
  $("codexaPulse").innerHTML = latest ? `
    <div class="pulse-readout">
      <span class="led green"></span>
      <strong>${escapeHtml(latest.name)}</strong>
      <small>${escapeHtml(latest.mtime)} / ${Number(latest.size || 0).toLocaleString()} bytes</small>
    </div>
  ` : `<p class="muted">Run an AI Box benchmark pulse to prove the worker from AE See-Suite.</p>`;
}

function renderEthernetRepair(repair) {
  const target = $("ethernetRepair");
  if (!target) return;
  if (!repair) {
    target.className = "ethernet-repair red";
    target.innerHTML = `<p class="muted">AI Box Ethernet repair state has not loaded yet.</p>`;
    return;
  }
  const status = repair.status || "FAILED";
  const route = repair.codexa?.activeRoute || "ETHERNET_OFFLINE_OR_BLOCKED";
  const pack = repair.repairPack || {};
  const rail = repair.commandRail || {};
  const railView = commandRailViewFromRail(rail);
  const verifiedServices = repair.codexa?.verifiedServices || [];
  target.className = `ethernet-repair ${statusClass(status)}`;
  target.innerHTML = `
    <div class="repair-head">
      <div>
        <p class="eyebrow">AI Box Ethernet Repair</p>
        <h3>${escapeHtml(status === "VERIFIED" ? "Rail verified" : "Repair required before heavy work")}</h3>
      </div>
      <span class="chip ${statusClass(status)}">${escapeHtml(status)}</span>
    </div>
    <div class="repair-grid">
      <div>
        <span class="led ${statusClass(route)}"></span>
        <strong>Route</strong>
        <small>${escapeHtml(route)} / Ethernet ${escapeHtml(repair.aiBox?.ethernetIp || repair.codexa?.ethernetIp || "not configured")} / LAN fallback ${escapeHtml(repair.aiBox?.legacyWifiIp || repair.codexa?.legacyWifiIp || "not configured")}</small>
      </div>
      <div>
        <span class="led ${statusClass(railView.displayStatus)}"></span>
        <strong>Command rail</strong>
        <small>${escapeHtml(railView.shortDetail)}</small>
      </div>
      <div>
        <span class="led ${statusClass(pack.status)}"></span>
        <strong>Repair pack</strong>
        <small>${escapeHtml(pack.status || "UNKNOWN")} / ${Number(pack.zipBytes || 0).toLocaleString()} bytes</small>
      </div>
      <div>
        <span class="led ${statusClass(pack.localDownloadStatus)}"></span>
        <strong>Download helper</strong>
        <small>${escapeHtml(pack.localDownloadStatus || "UNKNOWN")} / local check ${escapeHtml(pack.localDownloadMs ?? "?")}ms</small>
      </div>
    </div>
    <div class="repair-actions">
      ${pack.downloadUrl ? `<a class="button" href="${escapeHtml(pack.downloadUrl)}" target="_blank">Download repair zip</a>` : ""}
      <a class="button" href="/api/codexa/ethernet-repair" target="_blank">Open repair JSON</a>
    </div>
    <ol class="repair-steps">
      ${(repair.nextActions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ol>
    <p class="muted">${escapeHtml(pack.localDownloadNote || "No helper note.")}</p>
    ${verifiedServices.length ? `<p class="muted">Verified services: ${escapeHtml(verifiedServices.join(", "))}</p>` : `<p class="warn">No AI Box services verified yet. ORANGEBOX should not dispatch work until this changes.</p>`}
  `;
}

function renderAiBoxNetwork(network) {
  const target = $("aiBoxNetworkPriority");
  if (!target) return;
  if (!network) {
    target.className = "ai-box-network red";
    target.innerHTML = `<p class="muted">AI Box Network Priority state has not loaded yet.</p>`;
    return;
  }
  const status = network.status || "AI_BOX_UNCONFIGURED";
  const route = network.active_route || "AI_BOX_OFFLINE_OR_UNCONFIGURED";
  const pack = network.pack || {};
  const hosts = network.hosts || {};
  const probes = Array.isArray(network.probes) ? network.probes : [];
  const policy = network.policy || {};
  const profile = policy.generated_profiles || {};
  const ethereal = state.etherealLink || {};
  const etherealStatus = ethereal.status || "ETHEREAL_UNCONFIGURED";
  const etherealConfig = ethereal.config || {};
  const advanced = ethereal.advanced_fabric_capabilities || {};
  const rdmaStatus = advanced.rdma?.status || "detect";
  const nvmeStatus = advanced.nvmeof?.status || "detect";
  target.className = `ai-box-network ${statusClass(status)}`;
  target.innerHTML = `
    <div class="repair-head">
      <div>
        <p class="eyebrow">AI Box Priority Lane</p>
        <h3>${escapeHtml(status === "AI_BOX_PRIORITY_ROUTE_VERIFIED" ? "AI traffic has a verified route" : "Protect the worker pipe before big runs")}</h3>
      </div>
      <span class="chip ${statusClass(status)}">${escapeHtml(status)}</span>
    </div>
    <div class="repair-grid">
      <div>
        <span class="led ${statusClass(route)}"></span>
        <strong>Active path</strong>
        <small>${escapeHtml(route)}</small>
      </div>
      <div>
        <span class="led ${pack.exists ? "green" : "amber"}"></span>
        <strong>Policy pack</strong>
        <small>${escapeHtml(pack.exists ? "generated" : "missing")} / ${escapeHtml(pack.directory || "")}</small>
      </div>
      <div>
        <span class="led ${hosts.ai_box_direct_ip || hosts.codexa_direct_ip ? "green" : "amber"}"></span>
        <strong>Direct AI box</strong>
        <small>${escapeHtml(hosts.ai_box_direct_ip || hosts.codexa_direct_ip || "unset")}</small>
      </div>
      <div>
        <span class="led ${hosts.ai_box_lan_ip || hosts.codexa_lan_ip ? "green" : "amber"}"></span>
        <strong>LAN AI box</strong>
        <small>${escapeHtml(hosts.ai_box_lan_ip || hosts.codexa_lan_ip || "unset")}</small>
      </div>
      <div>
        <span class="led ${statusClass(etherealStatus)}"></span>
        <strong>Ethereal direct link</strong>
        <small>${escapeHtml(etherealStatus)} / ${escapeHtml(etherealConfig.host_ip || "10.0.99.1")} -> ${escapeHtml(etherealConfig.peer_ip || "10.0.99.2")}</small>
      </div>
    </div>
    <div class="ai-box-policy-row">
      <span class="chip">DSCP priority ${profile.ai_box_priority ? "on" : "planned"}</span>
      <span class="chip">launchers ${profile.throttle_game_launchers ? "throttled" : "optional"}</span>
      <span class="chip">browser guard ${profile.throttle_browsers ? "on" : "manual"}</span>
      <span class="chip">emergency block ${profile.emergency_block_launchers ? "armed" : "off"}</span>
      <span class="chip">RDMA ${escapeHtml(rdmaStatus)}</span>
      <span class="chip">NVMe-oF ${escapeHtml(nvmeStatus)}</span>
    </div>
    <div class="repair-actions">
      <button id="buildAiBoxNetworkPack" class="primary">Build Priority Pack</button>
      <button id="buildAiBoxBrowserGuard">Pack With Browser Guard</button>
      <button id="buildEtherealLinkPack">Build Direct-Link Pack</button>
      <a class="button" href="/api/v4/ai-box-network/doctor?deep=1" target="_blank">Open Network Doctor</a>
      <a class="button" href="/api/v4/ai-box-network/ethereal/doctor?deep=1" target="_blank">Open Direct-Link Doctor</a>
    </div>
    ${network.observed_background_hogs?.length ? `<p class="warn">Background hogs observed: ${escapeHtml(network.observed_background_hogs.map((row) => row.image).join(", "))}</p>` : ""}
    ${network.blockers?.length ? `<ol class="repair-steps">${network.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : `<p class="muted">No current AI-box network blockers reported by the fast doctor.</p>`}
    <p class="muted">${escapeHtml((policy.limitations || [])[0] || "Local QoS is one layer; router QoS is the strongest full-pipe control.")}</p>
    ${probes.length ? `<p class="muted">Probe count: ${probes.length}. Verified: ${probes.filter((row) => row.status === "VERIFIED").length}.</p>` : ""}
  `;
  $("buildAiBoxNetworkPack")?.addEventListener("click", () => buildAiBoxNetworkPack(false).catch((error) => setStatus(error.message)));
  $("buildAiBoxBrowserGuard")?.addEventListener("click", () => buildAiBoxNetworkPack(true).catch((error) => setStatus(error.message)));
  $("buildEtherealLinkPack")?.addEventListener("click", () => buildEtherealLinkPack().catch((error) => setStatus(error.message)));
}

function renderRunway(status) {
  const target = $("runwayReadout");
  if (!target) return;
  const latestTeam = (status.benchmarks || []).find((row) => row.name?.includes("agent-team"));
  const latestProof = (status.proofs || []).find((row) => row.name?.includes("proof.json"));
  const commandRail = resolvedCommandRail(status);
  const railView = commandRailViewFromRail(commandRail, status);
  const cards = [
    {
      label: "Agent Team",
      status: latestTeam ? "VERIFIED" : "Queued",
      detail: latestTeam ? `${latestTeam.name} / ${new Date(latestTeam.mtime).toLocaleTimeString()}` : "Run the ideal AE team on the AI Box"
    },
    {
      label: "Proof",
      status: latestProof ? "VERIFIED" : "Queued",
      detail: latestProof ? `${latestProof.name} / ${new Date(latestProof.mtime).toLocaleTimeString()}` : "Capture desktop and compact proof"
    },
    {
      label: "AI Box",
        status: railView.displayStatus,
        detail: railView.detail
      }
  ];
  target.innerHTML = cards.map((card) => `
    <div>
      <span class="led ${statusClass(card.status)}"></span>
      <strong>${escapeHtml(card.label)}</strong>
      <small>${escapeHtml(card.detail)}</small>
    </div>
  `).join("");
}

function setLaunchMetric(id, status, text) {
  const target = $(id);
  if (!target) return;
  target.textContent = text;
  const led = target.parentElement?.querySelector(".led");
  if (led) led.className = `led ${statusClass(status)}`;
}

function setV4Card(id, status, title, detail) {
  const target = $(id);
  if (!target) return;
  target.className = `v4-status-card ${statusClass(status)}`;
  target.innerHTML = `
    <span class="led ${statusClass(status)}"></span>
    <strong>${escapeHtml(title)}</strong>
    <small>${escapeHtml(detail)}</small>
  `;
}

function setFlightCard(id, status, label, value, detail) {
  const target = $(id);
  if (!target) return;
  target.className = `flight-card ${statusClass(status)}`;
  target.innerHTML = `
    <span class="led ${statusClass(status)}"></span>
    <small>${escapeHtml(label)}</small>
    <strong>${escapeHtml(value)}</strong>
    <em>${escapeHtml(detail)}</em>
  `;
}

function setCommandStatus(id, status, label, value, detail) {
  const target = $(id);
  if (!target) return;
  target.className = `command-status ${id === "commandHubProject" ? "primary-readout " : ""}${statusClass(status)}`;
  target.innerHTML = `
    <span class="led ${statusClass(status)}"></span>
    <small>${escapeHtml(label)}</small>
    <strong>${escapeHtml(value)}</strong>
    <em>${escapeHtml(detail)}</em>
  `;
}

function renderCommandHub(status = state.status || {}) {
  const thread = state.projectThread || {};
  const spine = state.projectSpine || thread.spine || {};
  const dag = state.projectDag || thread.dag || {};
  const progress = dag.progress || {};
  const completion = thread.completion || {};
  const percent = Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : Number(completion.percent || spine.percent || 0);
  const currentNode = (dag.nodes || []).find((node) => node.node_id === progress.current_node_id);
  const nextStep = spine.nextStep || currentNode;
  const action = state.commandBrief?.nextActions?.[0]
    || currentNode?.execution_payload
    || nextStep?.gate
    || thread.position?.currentPosition
    || "Advance the next verified node and write proof.";
  const commandRail = resolvedCommandRail(status);
  const railView = commandRailViewFromRail(commandRail, status);
  const checkmate = state.checkmate || {};
  const partyMessages = state.partyLine?.messages || [];
  const latestParty = partyMessages[0];
  const claude = state.status?.claudeCode || state.claudeCode || {};
  const projectName = thread.name || state.activeProject || "orangebox";
  const badge = $("commandHubBadge");
  if (badge) {
    const railStatus = railView.displayStatus;
    badge.textContent = `${railView.badge} / ${Math.max(0, Math.min(100, Math.round(percent)))}%`;
    badge.className = `chip ${statusClass(railStatus)}`;
  }
  setCommandStatus(
    "commandHubProject",
    percent > 0 ? "VERIFIED" : "CONFIGURED",
    "Project",
    `${projectName} / ${Math.max(0, Math.min(100, Math.round(percent)))}%`,
    `${progress.complete_nodes || spine.doneCount || 0}/${progress.total_nodes || spine.count || 0} nodes; ${state.activeProject}`
  );
  setCommandStatus(
    "commandHubNext",
    currentNode?.status || nextStep?.status || "QUEUED",
    "Next",
    currentNode ? `${currentNode.node_id} ${currentNode.node_name}` : nextStep ? `${nextStep.id} ${nextStep.title}` : "No node loaded",
    action
  );
  setCommandStatus(
    "commandHubRail",
    railView.displayStatus,
    "AI Box",
    railView.value,
    railView.shortDetail
  );
  setCommandStatus(
    "commandHubClaude",
    claude.status || "CONFIGURED",
    "Claude Code",
    statusLabel(claude.status || "configured"),
    claude.message || "routed through /api/claude-code/chat"
  );
  setCommandStatus(
    "commandHubCheckmate",
    checkmate.status || "CONFIGURED",
    "Checkmate",
    statusLabel(checkmate.status || "checking"),
    checkmate.counts
      ? `${checkmate.counts.VERIFIED || 0} verified / ${checkmate.counts.MISSING_RUNTIME || 0} missing`
      : "quality gates loading"
  );
  setCommandStatus(
    "commandHubParty",
    latestParty?.status || (partyMessages.length ? "VERIFIED" : "CONFIGURED"),
    "Party Line",
    partyMessages.length ? `${partyMessages.length} updates` : "quiet",
    latestParty ? `${latestParty.from}: ${latestParty.status}` : "department room waiting"
  );
}

function renderFlightDeck() {
  const thread = state.projectThread || {};
  const dag = state.projectDag || thread.dag || {};
  const spine = state.projectSpine || thread.spine || {};
  const progress = dag.progress || {};
  const completion = thread.completion || {};
  const percent = Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : Number(completion.percent || spine.percent || 0);
  const currentNode = (dag.nodes || []).find((node) => node.node_id === progress.current_node_id);
  const nextStep = spine.nextStep || currentNode;
  const commandRail = resolvedCommandRail(state.status || {});
  const powerRecommendation = state.power?.recommendation || {};
  const aiBox = state.power?.aiBox || state.power?.codexa || {};
  const checkmate = state.checkmate || {};
  const truth = state.hallucinationGate || {};
  const partyMessages = state.partyLine?.messages || [];
  const latestParty = partyMessages[0];
  const action = state.commandBrief?.nextActions?.[0]
    || currentNode?.execution_payload
    || nextStep?.gate
    || "Keep the project in one thread, advance the next verified node, then prove it.";
  const railView = commandRailViewFromRail(commandRail, state.status || {});

  if ($("flightProject")) $("flightProject").textContent = `${thread.name || "ORANGEBOX"} / ${state.activeProject}`;
  if ($("flightAction")) $("flightAction").textContent = action;

  setFlightCard(
    "flightProgress",
    percent > 0 ? "VERIFIED" : "CONFIGURED",
    "Completion",
    `${Math.max(0, Math.min(100, Math.round(percent)))}%`,
    `${progress.complete_nodes || spine.doneCount || 0}/${progress.total_nodes || spine.count || 0} nodes; weighted truth wins`
  );
  setFlightCard(
    "flightNode",
    currentNode?.status || nextStep?.status || "QUEUED",
    "Current Node",
    currentNode ? `${currentNode.node_id} ${currentNode.node_name}` : nextStep ? `${nextStep.id} ${nextStep.title}` : "loading",
    currentNode ? `${currentNode.owner_department} / ${currentNode.worker} / ${currentNode.cost_profile}` : (nextStep?.gate || "mission spine loading")
  );
  setFlightCard(
    "flightCodexa",
    railView.displayStatus || aiBox.status || "CONFIGURED",
    "AI Box",
    railView.isBasicInstall ? railView.value : (commandRail.status === "VERIFIED" ? "rail live" : (aiBox.status || "checking")),
    railView.isBasicInstall
      ? railView.shortDetail
      : (aiBox.freeMemoryGB ? `${aiBox.cpuPercent}% CPU / ${aiBox.freeMemoryGB}GB free / ${powerRecommendation.label || "sampled"}` : `${commandRail.url || "<AI_BOX_IP>:8097"} / ${commandRail.ms ?? "?"}ms`)
  );
  setFlightCard(
    "flightCheckmate",
    checkmate.status || "CONFIGURED",
    "Checkmate",
    checkmate.status || "checking",
    checkmate.counts
      ? `${checkmate.counts.VERIFIED || 0} verified / ${checkmate.counts.CONFIGURED_WITH_GAPS || checkmate.counts.CONFIGURED || 0} gaps / ${checkmate.counts.MISSING_RUNTIME || 0} missing`
      : "quality arsenal loading"
  );
  setFlightCard(
    "flightTruth",
    truth.status || "CONFIGURED",
    "Truth Gate",
    truth.status || "checking",
    truth.counts ? `${truth.counts.green || 0} green / ${truth.counts.yellow || 0} yellow / ${truth.counts.red || 0} red` : "claims and assumptions"
  );
  setFlightCard(
    "flightParty",
    latestParty?.status || (partyMessages.length ? "VERIFIED" : "CONFIGURED"),
    "Party Line",
    partyMessages.length ? `${partyMessages.length} updates` : "quiet",
    latestParty ? `${latestParty.from}: ${latestParty.status}` : "department room waiting"
  );
  renderCommandHub(state.status || {});
}

function renderV4Command(status = state.status || {}) {
  const spine = state.projectThread?.spine || state.projectSpine;
  const next = spine?.nextStep;
  const v4Goal = $("v4Goal");
  if (v4Goal && !$("focusGoal")?.value && !$("goal")?.value && !v4Goal.value) {
    v4Goal.value = state.projectThread?.position?.currentPosition || "";
  }
  const count = $("v4SpineCount");
  if (count) count.textContent = spine ? `${spine.doneCount}/${spine.count} / ${spine.percent}%` : "0/0";
  const nextTarget = $("v4NextStep");
  if (nextTarget) {
    const nextStatus = next?.status || "QUEUED";
    nextTarget.className = `v4-next ${statusClass(nextStatus)}`;
    nextTarget.innerHTML = `
      <span class="led ${statusClass(nextStatus)}"></span>
      <strong>${escapeHtml(next ? `${next.id} ${next.title}` : "No next step loaded")}</strong>
      <small>${escapeHtml(next ? `${next.department} / ${next.status} / ${next.gate}` : "Load a project thread to arm the 1A/1B/1C spine.")}</small>
    `;
  }
  const mini = $("v4SpineMini");
  if (mini) {
    const steps = (spine?.steps || []).slice(0, 12);
    mini.innerHTML = steps.length ? steps.map((step) => `
      <article class="v4-mini-step ${statusClass(step.status)}">
        <span>${escapeHtml(step.id)}</span>
        <strong>${escapeHtml(step.title)}</strong>
        <small>${escapeHtml(`${step.department} / ${step.status}`)}</small>
      </article>
    `).join("") : `<p class="muted">Project spine loading.</p>`;
  }

  const commandRail = resolvedCommandRail(status);
  const railView = commandRailViewFromRail(commandRail, status);
  const briefAiBox = state.commandBrief?.aiBox || state.commandBrief?.codexa || state.power?.aiBox || state.power?.codexa || {};
  const railStatus = railView.displayStatus || briefAiBox.status || (status.generatedAt ? "FAILED" : "CONFIGURED");
  const railDetail = commandRail.url || state.commandBrief?.aiBox?.status || state.commandBrief?.codexa?.status
    ? `${commandRail.url || "http://<AI_BOX_IP>:8097"} / ${commandRail.ms ?? "brief"}ms`
    : "http://<AI_BOX_IP>:8097 / pending";
  const railCopy = railView.isBasicInstall
    ? railView.shortDetail
    : railStatus === "VERIFIED"
      ? `ready / ${briefAiBox.cpuPercent ?? "?"}% CPU / ${briefAiBox.freeMemoryGB ?? "?"}GB free`
      : status.generatedAt
        ? `needs attention / ${railDetail}`
        : `brief pending / ${railDetail}`;
  setV4Card("v4CodexaCard", railStatus, "AI Box", railCopy);

  const briefReview = state.commandBrief?.review || {};
  const checkmate = state.checkmate?.counts ? state.checkmate : {
    status: briefReview.status || state.checkmate?.status || "CONFIGURED",
    counts: state.checkmate?.counts || {
      VERIFIED: briefReview.status === "VERIFIED" ? 1 : 0,
      CONFIGURED_WITH_GAPS: briefReview.weakReviewCount || 0,
      MISSING_RUNTIME: 0
    }
  };
  const checkmateCounts = checkmate.counts
    ? `${checkmate.counts.VERIFIED || 0} verified / ${checkmate.counts.CONFIGURED_WITH_GAPS || checkmate.counts.CONFIGURED || 0} gaps / ${checkmate.counts.MISSING_RUNTIME || 0} missing`
    : "brief pending / no gate count yet";
  setV4Card("v4CheckmateCard", checkmate.status || "CONFIGURED", "Checkmate", checkmateCounts);

  const latestProof = latestByName(status.proofs, "proof.json") || (status.proofs || [])[0];
  setV4Card("v4ProofCard", latestProof ? "VERIFIED" : "Queued", "Proof", latestProof ? `${latestProof.name} / ${new Date(latestProof.mtime).toLocaleTimeString()}` : "run visual proof before calling UI work complete");

  const tokenStatus = status.telemetry?.subscriptionTokenCounts || "UNKNOWN_NO_SAFE_TAP";
  const capacityStatus = status.costLimits?.status || state.optimizer?.status || state.power?.recommendation?.status || "CONFIGURED";
  const capacityDetail = status.costLimits
    ? `${status.costLimits.localTelemetry?.processRamMB || "?"}MB server / ${status.costLimits.localTelemetry?.freeRamGB || "?"}GB free / ${status.costLimits.localTelemetry?.http?.total || 0} calls`
    : state.optimizer?.label || state.power?.recommendation?.label || "power sample pending";
  setV4Card("v4LimitCard", capacityStatus, "Limits + Load", `${tokenStatus} / ${capacityDetail}`);
  const knowledge = status.memory?.knowledge || {};
  const knowledgeStatus = knowledge.status || (status.memory ? "CONFIGURED" : "CONFIGURED");
  const knowledgeDetail = knowledge.status === "VERIFIED"
    ? `${Number(knowledge.documents || 0).toLocaleString()} docs / ${Number(knowledge.pageTreeNodes || 0).toLocaleString()} tree nodes / ${Number(knowledge.edges || 0).toLocaleString()} links`
    : `${Number(status.memory?.signals || 0).toLocaleString()} memory signals / rebuild available`;
  setV4Card("v4MemoryCard", knowledgeStatus, "Knowledge", knowledgeDetail);
  const mirage = state.mirage || {};
  const mirageDetail = mirage.counts
    ? `${mirage.counts.readyMounts || 0} ready / ${mirage.counts.missingEnvMounts || 0} need env / ${mirage.counts.mounts || 0} mounts`
    : "read-first data plane / probe available";
  setV4Card("v4MirageCard", mirage.status || "CONFIGURED", "Mirage Plane", mirageDetail);
  const exe = $("v4ExeStatus");
  if (exe) exe.textContent = "desktop app path: Tauri scaffold detected / build proof pending";
  renderFlightDeck();
}

function renderCommandBrief(brief = state.commandBrief) {
  const target = $("commandBriefCard");
  if (!target) return;
  if (!brief) {
    target.className = "command-brief-card amber";
    target.innerHTML = `
      <div>
        <p class="eyebrow">Command Brief</p>
        <strong>Loading operator card...</strong>
      </div>
      <small>Top-line project truth, next action, AI Box load, Checkmate, and party-line signals.</small>
    `;
    return;
  }
  if (brief.partyLine?.latest && !state.partyLine?.messages?.length) {
    state.partyLine = { status: brief.partyLine.status || "VERIFIED", messages: brief.partyLine.latest.map((msg) => ({
      from: msg.team || msg.from || "AE",
      status: msg.status || "INFO",
      text: msg.message || msg.text || "",
      dagNode: msg.dagNode || ""
    })) };
  }
  if (brief.review && !state.checkmate?.counts) {
    state.checkmate = {
      status: brief.review.status || "CONFIGURED",
      counts: { VERIFIED: brief.review.weakReviewCount ? 0 : 1, CONFIGURED_WITH_GAPS: brief.review.weakReviewCount || 0 }
    };
  }
  target.className = `command-brief-card ${statusClass(brief.status)}`;
  const actions = (brief.nextActions || []).slice(0, 4);
  target.innerHTML = `
    <div>
      <p class="eyebrow">Command Brief / ${escapeHtml(brief.status)}</p>
      <strong>${escapeHtml(actions[0] || brief.title || "Next action unavailable")}</strong>
    </div>
    <pre>${escapeHtml(brief.operatorCard || "")}</pre>
    ${actions.length ? `<ol class="command-brief-actions">${actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : ""}
    <small>FATCAT ${escapeHtml(brief.fatcat?.activeCalls ?? 0)} active / AI Box ${escapeHtml((brief.aiBox || brief.codexa)?.status || "UNKNOWN")} / generated ${escapeHtml(new Date(brief.generatedAt).toLocaleTimeString())}</small>
  `;
}

function renderScopeLedger(payload = state.scopeLedger) {
  const target = $("scopeLedgerCard");
  if (!target) return;
  if (!payload) {
    target.className = "command-brief-card amber";
    target.innerHTML = `
      <div>
        <p class="eyebrow">Scope Ledger</p>
        <strong>Loading dynamic scope additions...</strong>
      </div>
      <small>Shows new operator ideas that expanded the live spine and DAG.</small>
    `;
    return;
  }
  const counts = payload.counts || {};
  const latest = (payload.steps || []).slice(-3).reverse();
  target.className = `command-brief-card ${statusClass(payload.status)}`;
  target.innerHTML = `
    <div>
      <p class="eyebrow">Scope Ledger / ${escapeHtml(payload.status || "CONFIGURED")}</p>
      <strong>${escapeHtml(`${counts.verified || 0}/${counts.total || 0} dynamic additions verified`)}</strong>
    </div>
    ${latest.length ? `<ol class="command-brief-actions">${latest.map((step) => `<li>${escapeHtml(`${step.id || ""} ${step.title || step.key}: ${step.liveStatus || step.status}`)}</li>`).join("")}</ol>` : `<p class="muted">No dynamic scope additions recorded yet.</p>`}
    <small>${escapeHtml(payload.ledgerPath || "scope ledger pending")}</small>
  `;
}

function renderDecisionGates(payload = state.decisionGates) {
  const target = $("decisionGateCard");
  if (!target) return;
  if (!payload) {
    target.className = "command-brief-card amber";
    target.innerHTML = `
      <div>
        <p class="eyebrow">Decision Gates</p>
        <strong>Loading autonomy boundaries...</strong>
      </div>
      <small>Shows what ORANGEBOX can do autonomously and where it must pause.</small>
    `;
    return;
  }
  const waiting = payload.waiting || [];
  const counts = payload.counts || {};
  target.className = `command-brief-card ${statusClass(payload.status)}`;
  target.innerHTML = `
    <div>
      <p class="eyebrow">Decision Gates / ${escapeHtml(payload.status || "CONFIGURED")}</p>
      <strong>${escapeHtml(waiting.length ? `${counts.waiting || waiting.length} decision gate(s) waiting` : "Autonomous coding allowed in approved workspace")}</strong>
    </div>
    ${waiting.length ? `<ol class="command-brief-actions">${waiting.slice(0, 5).map((gate) => `<li>${escapeHtml(`${gate.id || gate.kind}: ${gate.title || gate.reason} / ${gate.owner || "AE0"}`)}</li>`).join("")}</ol>` : `<p class="muted">${escapeHtml(payload.nextAction || "No decision gates waiting.")}</p>`}
    <small>${escapeHtml(`${counts.dagApprovals || 0} DAG approvals / ${counts.pendingScope || 0} pending scope / mode ${payload.mode || "autonomous_coding_with_decision_gates"}`)}</small>
  `;
}

async function refreshDecisionGates() {
  return singleFlight("decision-gates", async () => {
    const payload = await api(`/api/decision-gates?project=${encodeURIComponent(state.activeProject)}`);
    state.decisionGates = payload;
    renderDecisionGates(payload);
    setStatus(`Decision gates: ${payload.status} / ${payload.counts?.waiting || 0} waiting`);
    return payload;
  });
}

async function refreshScopeLedger() {
  return singleFlight("scope-ledger", async () => {
    const payload = await api(`/api/project-scope/ledger?project=${encodeURIComponent(state.activeProject)}`);
    state.scopeLedger = payload;
    renderScopeLedger(payload);
    setStatus(`Scope ledger: ${payload.counts?.verified || 0}/${payload.counts?.total || 0} verified`);
    return payload;
  });
}

async function refreshCommandBrief() {
  return singleFlight("command-brief", async () => {
    const brief = await api(`/api/command-brief?project=${encodeURIComponent(state.activeProject)}`);
    state.commandBrief = brief;
    renderCommandBrief(brief);
    renderFlightDeck();
    renderV4Command(state.status || {});
    hardenControlLabels();
    setStatus(`Command brief: ${brief.status} / ${brief.nextActions?.[0] || "ready"}`);
    return brief;
  });
}

function renderFullScopeStatus(payload) {
  if (!payload) return;
  const card = $("commandBriefCard");
  if (!card) return;
  if (payload.reviews && !state.checkmate?.counts) {
    state.checkmate = {
      status: payload.reviews.status || "CONFIGURED",
      counts: { VERIFIED: payload.reviews.status === "VERIFIED" ? 1 : 0, CONFIGURED_WITH_GAPS: payload.reviews.status === "VERIFIED" ? 0 : 1 }
    };
  }
  const lanes = (payload.lanes || []).slice(0, 6);
  card.className = `command-brief-card ${statusClass(payload.status)}`;
  card.innerHTML = `
    <div>
      <p class="eyebrow">Full Scope / ${escapeHtml(payload.status)}</p>
      <strong>${escapeHtml(payload.doctrine || "Build full ORANGEBOX scope in order.")}</strong>
    </div>
    <pre>${escapeHtml(payload.brief?.operatorCard || "")}</pre>
    <ol class="command-brief-actions">
      ${lanes.map((lane) => `<li>${escapeHtml(lane.label)}: ${escapeHtml(lane.status)} / ${escapeHtml(lane.detail)}</li>`).join("")}
    </ol>
    <small>Model install ${escapeHtml(payload.install?.status || "UNKNOWN")} / Triad ${escapeHtml(payload.triad?.status || "UNKNOWN")} / Checkmate ${escapeHtml(payload.reviews?.status || "UNKNOWN")}</small>
  `;
  renderFlightDeck();
}

async function refreshFullScopeStatus() {
  const payload = await api(`/api/full-scope?project=${encodeURIComponent(state.activeProject)}`);
  renderFullScopeStatus(payload);
  setStatus(`Full scope: ${payload.status} / ${payload.lanes?.map((lane) => `${lane.id}:${lane.status}`).join(" ")}`);
  return payload;
}

async function advanceFullScope() {
  setStatus("Advancing full ORANGEBOX scope controller...");
  const scopeText = $("v4Goal")?.value.trim() || $("goal")?.value.trim() || "";
  const payload = await api("/api/full-scope/advance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: state.activeProject, approved: true, scope: scopeText })
  });
  renderFullScopeStatus(payload.after);
  await refreshProjectThread().catch(() => {});
  await refreshProjectDag().catch(() => {});
  await refreshPartyLine().catch(() => {});
  appendChat("system", `Full scope controller advanced: ${payload.advanced.join("; ") || "no node changed"}`, payload.receiptPath || "");
  setStatus(`Full scope advanced: ${payload.advanced.join(" / ") || "active"}`);
  return payload;
}

async function expandLiveScope() {
  const text = $("v4Goal")?.value.trim() || $("goal")?.value.trim() || $("focusGoal")?.value.trim() || "";
  if (!text) {
    setStatus("Expand Scope needs a typed project idea or requirement.");
    return null;
  }
  const payload = await api("/api/project-scope/expand", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: state.activeProject, text, forceGeneric: true })
  });
  state.projectSpine = payload.spine;
  if (state.projectThread) {
    state.projectThread.spine = payload.spine;
    state.projectThread.dag = payload.dag;
  }
  renderProjectSpine(payload.spine);
  renderProjectDag(payload.dag);
  renderFlightDeck();
  renderV4Command(state.status || {});
  await refreshPartyLine().catch(() => {});
  appendChat("system", `Scope expansion: ${payload.status}. Added ${payload.added} item(s). Progress is now ${payload.spine?.percent || 0}%.`);
  setStatus(`Scope expanded: ${payload.added} item(s), progress ${payload.spine?.percent || 0}%`);
  return payload;
}

function renderComprehensiveBuildout(payload) {
  if (!payload) return;
  state.buildout = payload;
  const card = $("buildoutCard");
  if (!card) return;
  const lanes = payload.lanes || [];
  const next = (payload.nextBuildQueue || [])[0];
  card.className = `command-brief-card ${statusClass(payload.status)}`;
  card.innerHTML = `
    <div>
      <p class="eyebrow">V4 Buildout / ${escapeHtml(payload.status || "CONFIGURED")}</p>
      <strong>${escapeHtml(payload.percent ?? "?")}% weighted / ${escapeHtml(lanes.length)} build lanes</strong>
    </div>
    <div class="buildout-meter" aria-label="Buildout progress"><span style="width:${Math.max(0, Math.min(100, Number(payload.percent || 0)))}%"></span></div>
    <ol class="command-brief-actions">
      ${lanes.slice(0, 6).map((lane) => `<li>${escapeHtml(lane.id)} ${escapeHtml(lane.label)}: ${escapeHtml(lane.status)} / ${Math.round(Number(lane.score || 0) * 100)}%</li>`).join("")}
    </ol>
    <small>Next: ${escapeHtml(next ? `${next.id} ${next.label}: ${next.nextAction}` : "all lanes green enough for next expansion")} / blockers ${escapeHtml(payload.blockers?.length || 0)}</small>
    <div class="spine-actions buildout-actions">
      <a class="button" href="${escapeHtml(payload.files?.markdownUrl || "/orangebox/project-thread/orangebox/ORANGEBOX_V4_COMPREHENSIVE_BUILDOUT.md")}" target="_blank">Open Map</a>
      <button id="materializeBuildoutInline">Materialize</button>
    </div>
  `;
  $("materializeBuildoutInline")?.addEventListener("click", () => materializeBuildout().catch((error) => setStatus(error.message)));
}

async function refreshComprehensiveBuildout() {
  return singleFlight("comprehensive-buildout", async () => {
    const payload = await api(`/api/comprehensive-buildout?project=${encodeURIComponent(state.activeProject)}`);
    renderComprehensiveBuildout(payload);
    setStatus(`Buildout: ${payload.percent}% / ${payload.status}`);
    return payload;
  });
}

async function materializeBuildout() {
  const payload = await api("/api/comprehensive-buildout/materialize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: state.activeProject })
  });
  renderComprehensiveBuildout(payload);
  await refreshPartyLine().catch(() => {});
  setStatus(`Buildout materialized: ${payload.percent}% / receipt ${payload.receiptPath || "written"}`);
  return payload;
}

function renderLaunchConsole(status) {
  const commandRail = resolvedCommandRail(status);
  const railView = commandRailViewFromRail(commandRail, status);
  const latestProof = (status.proofs || []).find((row) => row.name?.includes("proof.json"));
  const latestContext = (status.contexts || [])[0];
  const staged = state.pendingFiles.length;
  const readiness = $("focusReadiness");
  if (readiness) {
    readiness.textContent = railView.isBasicInstall
      ? "Basic install ready"
      : commandRail.status === "VERIFIED"
        ? "AI Box ready"
        : "AI Box needs attention";
  }
  const badge = $("claudeLaneBadge");
  if (badge && status.claudeCode) {
    badge.textContent = status.claudeCode.status;
    badge.className = `chip ${statusClass(status.claudeCode.status)}`;
  }
  setLaunchMetric(
    "focusContext",
    staged || latestContext ? "VERIFIED" : "Queued",
    staged
      ? `${staged} staged file(s)`
      : latestContext
        ? `${latestContext.itemCount || latestContext.items?.length || 0} stored / ${Number(latestContext.estimatedTokens || 0).toLocaleString()} est tokens`
        : "No context staged"
  );
  setLaunchMetric(
    "focusCodexa",
    railView.displayStatus,
    railView.isBasicInstall ? railView.shortDetail : (commandRail.status === "VERIFIED" ? "command rail ready" : "command rail offline or unverified")
  );
  setLaunchMetric(
    "focusProof",
    latestProof ? "VERIFIED" : "Queued",
    latestProof ? `${latestProof.name} / ${new Date(latestProof.mtime).toLocaleTimeString()}` : "Waiting for visual proof"
  );
}

function findEndpoint(status, token) {
  const matches = (status?.endpoints || []).filter((row) => row.url?.includes(token));
  return matches.find((row) => row.status === "VERIFIED") || matches[0];
}

function resolvedCommandRail(status = {}) {
  const endpoint = findEndpoint(status, ":8097");
  const preferredUrl = status?.commandRail?.url || endpoint?.url || null;
  const preferredMs = endpoint?.url === preferredUrl ? endpoint?.ms : (status?.commandRail?.ms ?? endpoint?.ms ?? null);
  const preferredStatus = status?.commandRail?.status || endpoint?.status || "NOT_CONFIGURED_BASIC_INSTALL";
  return {
    url: preferredUrl,
    ms: preferredMs,
    status: preferredStatus
  };
}

function latestByName(rows, token) {
  return (rows || []).find((row) => String(row.name || "").toLowerCase().includes(token));
}

function buildOperatorDecision(status) {
  const commandRail = resolvedCommandRail(status);
  const railView = commandRailViewFromRail(commandRail, status);
  const bridge = findEndpoint(status, ":8098") || {};
  const latestProof = latestByName(status?.proofs, "proof.json");
  const latestTeam = latestByName(status?.benchmarks, "agent-team");
  const running = (state.mcpEvents || []).find((event) => event.status === "Running");
  const power = state.power?.recommendation || {};
  const optimizer = state.optimizer || {};

  if (!railView.isBasicInstall && commandRail.status !== "VERIFIED") {
    return {
      status: "FAILED",
      title: "Repair AI Box command rail",
      detail: "8097 is the work rail. Until it is verified, ORANGEBOX should not pretend the AI Box can execute jobs.",
      action: "operatorDiagnose"
    };
  }
  if (!railView.isBasicInstall && bridge.status && bridge.status !== "VERIFIED") {
    return {
      status: "HOLD",
      title: "Bridge needs attention",
      detail: "Command rail is alive, but the bridge is not clean. Diagnose before increasing automation.",
      action: "operatorDiagnose"
    };
  }
  if (running) {
    return {
      status: "Running",
      title: `${running.tool} is running`,
      detail: running.summary || "ORANGEBOX has active work in flight. Watch receipts before adding more lanes.",
      action: "refreshWork"
    };
  }
  if (optimizer.status === "DO_NOT_INCREASE" || optimizer.status === "HOLD_OR_SMALL_INCREASE") {
    return {
      status: optimizer.status,
      title: optimizer.label || "Optimization hold",
      detail: optimizer.detail || "Machine pressure says to keep the workload capped.",
      action: "refreshPower"
    };
  }
  if (!latestTeam) {
    return {
      status: "READY",
      title: "Run the smallest useful team",
      detail: "The AI Box is reachable. Give the mission goal, then run the best AE team instead of staring at diagnostics.",
      action: "operatorTeam"
    };
  }
  if (!latestProof) {
    return {
      status: "Queued",
      title: "Proof is missing",
      detail: "The last team run has no current visual proof. Capture screenshots before calling the app good.",
      action: "operatorProof"
    };
  }
  if (power.status === "CAN_INCREASE") {
    return {
      status: "CAN_INCREASE",
      title: "You can increase one workload",
      detail: power.detail || "Capacity is available. Add one compatible AI Box job, then re-sample.",
      action: "operatorTeam"
    };
  }
  return {
    status: "VERIFIED",
    title: "Ready for the next mission",
    detail: "Rails, receipts, and proof are present. Start the next concrete outcome from the operator box.",
    action: "operatorTeam"
  };
}

function renderOperatorConsole(status) {
  const decision = buildOperatorDecision(status);
  const target = $("operatorNextMove");
  if (target) {
    target.className = `next-move ${statusClass(decision.status)}`;
    target.innerHTML = `
      <span class="led ${statusClass(decision.status)}"></span>
      <strong>${escapeHtml(decision.title)}</strong>
      <small>${escapeHtml(decision.detail)}</small>
    `;
  }

  const commandRail = resolvedCommandRail(status);
  const railView = commandRailViewFromRail(commandRail, status);
  const latestProof = latestByName(status?.proofs, "proof.json");
  const runningEvents = (state.mcpEvents || []).filter((event) => event.status === "Running");
  const power = state.power?.recommendation || {};
  const optimizer = state.optimizer || {};
  const tiles = [
    {
      label: "AI Box",
      status: railView.displayStatus,
      detail: railView.isBasicInstall ? railView.shortDetail : (commandRail.status === "VERIFIED" ? "work rail ready" : "rail unavailable")
    },
    {
      label: "Capacity",
      status: optimizer.status || power.status || "CONFIGURED",
      detail: optimizer.label || power.label || "power sample pending"
    },
    {
      label: "Active Work",
      status: runningEvents.length ? "Running" : (state.mcpEvents.length ? "VERIFIED" : "Queued"),
      detail: runningEvents.length ? `${runningEvents.length} running` : `${state.mcpEvents.length} recent event(s)`
    },
    {
      label: "Proof",
      status: latestProof ? "VERIFIED" : "Queued",
      detail: latestProof ? latestProof.name : "no current proof"
    }
  ];
  const tilesTarget = $("operatorTiles");
  if (tilesTarget) {
    tilesTarget.innerHTML = tiles.map((tile) => `
      <div>
        <span class="led ${statusClass(tile.status)}"></span>
        <strong>${escapeHtml(tile.label)}</strong>
        <small>${escapeHtml(tile.detail)}</small>
      </div>
    `).join("");
  }
}

function renderOptimizer(optimizer) {
  state.optimizer = optimizer;
  const summary = $("optimizerGovernor")?.querySelector(".optimizer-summary");
  if (summary) {
    summary.className = `optimizer-summary ${statusClass(optimizer?.status || "CONFIGURED")}`;
    summary.innerHTML = `
      <span class="led ${statusClass(optimizer?.status || "CONFIGURED")}"></span>
      <strong>${escapeHtml(optimizer?.label || "Optimization Governor")}</strong>
      <small>${escapeHtml(optimizer?.detail || "Machine-specific dispatch policy is waiting for a sample.")}</small>
    `;
  }
  const matrix = $("scopeCards");
  if (!matrix) return;
  const cc = optimizer?.concurrency || {};
  const seeSuite = cc.seeSuite || cc[LEGACY_SURFACE_KEY] || {};
  const aiBox = cc.aiBox || cc.codexa || {};
  const runNow = optimizer?.runNow || [];
  const holdNow = optimizer?.holdNow || [];
  matrix.innerHTML = `
    <div>
      <strong>AE See-Suite</strong>
      <small>${escapeHtml(`${seeSuite.smallJobs ?? 0} tiny jobs / ${seeSuite.heavyJobs ?? 0} heavy / ${optimizer?.machines?.seeSuite?.knownCpu || optimizer?.machines?.[LEGACY_SURFACE_KEY]?.knownCpu || "Intel N150"}`)}</small>
    </div>
    <div>
      <strong>AI Box</strong>
      <small>${escapeHtml(`${aiBox.smallJobs ?? 0} small / ${aiBox.heavyJobs ?? 0} heavy / ${aiBox.localModelWorkers ?? 0} model / ${optimizer?.machines?.aiBox?.knownRamGB || optimizer?.machines?.codexa?.knownRamGB || 96}GB RAM`)}</small>
    </div>
    <div>
      <strong>Run now</strong>
      <small>${escapeHtml(runNow.length ? runNow.join(" ") : "No new work until pressure clears.")}</small>
    </div>
    <div>
      <strong>Hold</strong>
      <small>${escapeHtml(holdNow.length ? holdNow.join(" ") : "No holds from current sample.")}</small>
    </div>
  `;
}

function renderProjectRail(projects = []) {
  const rail = $("projectRail");
  if (!rail) return;
  rail.innerHTML = projects.slice(0, 8).map((project) => `
    <button class="project-pill ${project.key === state.activeProject ? "active" : ""}" data-project="${escapeHtml(project.key)}" title="${escapeHtml(project.name)}">
      ${escapeHtml(project.name || project.key)}
    </button>
  `).join("");
  rail.querySelectorAll("[data-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeProject = button.dataset.project || "orangebox";
      refreshProjectThread().catch((error) => setStatus(error.message));
    });
  });
}

function renderVoteButtons(cardId) {
  return `
    <div class="card-votes" data-card="${escapeHtml(cardId)}">
      <button data-vote="up" aria-label="Mark this card useful" title="Useful">Useful</button>
      <button data-vote="down" aria-label="Mark this card as noise" title="Noise">Noise</button>
    </div>
  `;
}

function renderProjectSpine(spine) {
  state.projectSpine = spine;
  const count = $("spineCount");
  if (count) count.textContent = `${spine?.doneCount || 0}/${spine?.count || 0} live steps / ${spine?.percent || 0}%`;
  const next = $("spineNext");
  if (next) next.textContent = spine?.nextStep ? `Next: ${spine.nextStep.id} ${spine.nextStep.title} / ${spine.nextStep.department}` : "Next step unknown.";
  const bar = $("spineProgressBar");
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, Number(spine?.percent || 0)))}%`;
  const open = $("openSpine");
  if (open && state.projectThread?.spineUrl) open.href = state.projectThread.spineUrl;
  const target = $("projectSpine");
  if (!target) return;
  const steps = spine?.steps || [];
  target.innerHTML = steps.length ? steps.map((step) => `
    <article class="spine-step ${statusClass(step.status)}">
      <span class="spine-id">${escapeHtml(step.id)}</span>
      <div>
        <strong>${escapeHtml(step.title)}</strong>
        <small>${escapeHtml(step.department)} / ${escapeHtml(step.status)} / ${escapeHtml(step.gate || "")}</small>
        ${step.evidence ? `<em>Evidence: ${escapeHtml(step.evidence)}</em>` : ""}
        ${step.note ? `<em>Note: ${escapeHtml(step.note)}</em>` : ""}
      </div>
      <div class="spine-step-actions">
        <button data-spine-step="${escapeHtml(step.key)}" data-spine-status="RUNNING">Now</button>
        <button data-spine-step="${escapeHtml(step.key)}" data-spine-status="VERIFIED">Done</button>
        <button data-spine-step="${escapeHtml(step.key)}" data-spine-status="BLOCKED">Block</button>
      </div>
    </article>
  `).join("") : `<p class="muted">No project spine yet.</p>`;
  target.querySelectorAll("[data-spine-step]").forEach((button) => {
    button.addEventListener("click", () => {
      updateSpineStep(button.dataset.spineStep, button.dataset.spineStatus).catch((error) => setStatus(error.message));
    });
  });
}

function renderEidosClc(payload = {}) {
  const validation = payload.validation || {};
  const status = payload.status || (payload.ok ? "VERIFIED" : payload.error ? "NEEDS_RESTART_OR_API" : "READY");
  const statusEl = $("clcStatus");
  const summaryEl = $("clcSummary");
  const detailsEl = $("clcDetails");
  const clcLink = $("openEidosClc");
  const injectLink = $("openEidosInject");
  const confidence = payload.injection?.confidence;
  const contextChars = payload.injection?.context_chars;
  const messages = payload.messages ?? "--";
  const party = payload.party_line_messages ?? "--";
  const thread = payload.thread_messages ?? "--";

  if (statusEl) statusEl.textContent = `EIDOS CLC ${status}`;
  if (summaryEl) {
    const injectState = payload.injection?.inject === false ? "fresh-topic gate" : "continuation injection";
    summaryEl.textContent = `${messages} messages / ${party} party-line / ${thread} thread / ${injectState}`;
  }
  if (detailsEl) {
    detailsEl.innerHTML = `
      <span>entities: ${escapeHtml(validation.entities ?? "--")}</span>
      <span>facts: ${escapeHtml(validation.facts ?? "--")}</span>
      <span>decisions: ${escapeHtml(validation.decisions ?? "--")}</span>
      <span>void: ${escapeHtml(validation.void_items ?? "--")}</span>
      <span>confidence: ${escapeHtml(confidence == null ? "--" : Number(confidence).toFixed(3))}</span>
      <span>context: ${escapeHtml(contextChars ?? "--")} chars</span>
      <span>receipt: ${escapeHtml(payload.receiptPath ? "yes" : "local")}</span>
      <span>server: ${escapeHtml(payload.error ? "restart/check API" : "ready")}</span>
    `;
  }
  if (clcLink && (payload.clcUrl || payload.clc)) clcLink.href = payload.clcUrl || payload.clc;
  if (injectLink && (payload.injectUrl || payload.inject)) injectLink.href = payload.injectUrl || payload.inject;
}

async function buildEidosClc() {
  const project = state.activeProject || "eidos";
  const query = `continue ${project} project work through EIDOS Crystal Lattice Compression`;
  const payload = await api("/api/eidos/clc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, query }),
    timeoutMs: 120000
  });
  renderEidosClc(payload);
  appendChat("system", `EIDOS CLC built for ${project}: ${payload.validation?.entities ?? 0} entities, ${payload.validation?.void_items ?? 0} void items.`, payload.receiptPath || "");
  setStatus(`EIDOS CLC built for ${project}.`);
  return payload;
}

function renderProjectDag(dag) {
  state.projectDag = dag;
  const progress = dag?.progress || {};
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  const count = $("dagCount");
  if (count) count.textContent = `${progress.complete_nodes || 0}/${progress.total_nodes || 0} nodes / ${percent}% weighted`;
  const current = $("dagCurrent");
  if (current) {
    const currentNode = (dag?.nodes || []).find((node) => node.node_id === progress.current_node_id);
    const bottleneck = progress.bottleneck_node_id ? ` / bottleneck ${progress.bottleneck_node_id}` : "";
    current.textContent = currentNode ? `Current: ${currentNode.node_id} ${currentNode.node_name}${bottleneck}` : "Current node unknown.";
  }
  const bar = $("dagProgressBar");
  if (bar) bar.style.width = `${percent}%`;
  const open = $("openDag");
  if (open && dag?.dagUrl) open.href = dag.dagUrl;
  const approvals = $("dagApprovalQueue");
  if (approvals) {
    approvals.innerHTML = dag?.approval_queue?.length ? dag.approval_queue.map((node) => `
      <article class="dag-approval">
        <span class="led amber"></span>
        <strong>${escapeHtml(node.node_id)} approval required</strong>
        <small>${escapeHtml(node.node_name)} / ${escapeHtml(node.owner_department)} / weight ${escapeHtml(node.milestone_weight)}</small>
        <button data-dag-node="${escapeHtml(node.node_id)}" data-dag-action="approve">Approve</button>
      </article>
    `).join("") : `<p class="muted">No approval gates waiting.</p>`;
  }
  const target = $("projectDag");
  if (!target) return;
  const nodes = dag?.nodes || [];
  target.innerHTML = nodes.length ? nodes.map((node) => `
    <article class="dag-node ${statusClass(node.status)}">
      <span class="spine-id">${escapeHtml(node.node_id)}</span>
      <div>
        <strong>${escapeHtml(node.node_name)}</strong>
        <small>${escapeHtml(node.owner_department)} / ${escapeHtml(node.status)} / ${escapeHtml(node.worker)} / weight ${escapeHtml(node.milestone_weight)}</small>
        <em>Depends: ${escapeHtml((node.depends_on || []).join(", ") || "none")}</em>
        <em>Validate: ${escapeHtml(node.validation_command || "")}</em>
        ${node.evidence ? `<em>Evidence: ${escapeHtml(node.evidence)}</em>` : ""}
      </div>
      <div class="spine-step-actions">
        <button data-dag-node="${escapeHtml(node.node_id)}" data-dag-action="start">Start</button>
        <button data-dag-node="${escapeHtml(node.node_id)}" data-dag-action="complete">Done</button>
        <button data-dag-node="${escapeHtml(node.node_id)}" data-dag-action="fail">Fail</button>
      </div>
    </article>
  `).join("") : `<p class="muted">No DAG nodes yet.</p>`;
  document.querySelectorAll("[data-dag-node]").forEach((button) => {
    button.addEventListener("click", () => {
      updateDagNode(button.dataset.dagNode, button.dataset.dagAction).catch((error) => setStatus(error.message));
    });
  });
  renderFlightDeck();
}

function renderProjectThread(thread) {
  state.projectThread = thread;
  state.activeProject = thread.project || state.activeProject;
  renderProjectRail(thread.projects || []);
  const open = $("openThreadHistory");
  if (open) open.href = thread.historyUrl || "/orangebox/project-thread/orangebox/THREAD.md";
  renderProjectSpine(thread.spine);
  renderProjectDag(thread.dag);
  renderFatcat(thread.fatcat);
  renderReviewEngines(thread.reviewEngines);
  renderTriad(thread.triad);
  renderDepartmentModels(thread.departmentModels);
  scheduleTask("party-line", 150, () => refreshPartyLine());
  const feed = $("threadFeed");
  if (feed) {
    feed.innerHTML = thread.turns?.length ? thread.turns.map((turn) => `
      <article class="thread-turn">
        <strong>${escapeHtml(turn.heading)}</strong>
        <p>${escapeHtml(turn.body)}</p>
      </article>
    `).join("") : `<p class="muted">No turns yet. Start this project thread once, then stay in it.</p>`;
    feed.scrollTop = feed.scrollHeight;
  }
  const usage = $("threadUsage");
  if (usage) {
    usage.innerHTML = `
      <span class="led green"></span>
      <strong>${escapeHtml(thread.position?.brain || "claude-opus-4-7-max")}</strong>
      <small>history est ${Number(thread.stats?.estimatedHistoryTokens || 0).toLocaleString()} tokens / recent ${Number(thread.stats?.recentEstimatedTokens || 0).toLocaleString()} / provider ${escapeHtml(thread.stats?.providerTokens || "UNKNOWN")}</small>
    `;
  }
  const completion = $("projectCompletion");
  if (completion) {
    const percent = Math.max(0, Math.min(100, Number(thread.completion?.percent || 0)));
    completion.innerHTML = `
      <strong>${percent}%</strong>
      <span>${escapeHtml(thread.completion?.label || "evidence complete")}</span>
      <div class="progress-bar"><i style="width:${percent}%"></i></div>
    `;
  }
  renderFlightDeck();
  const notifications = $("notificationFeed");
  if (notifications) {
    notifications.innerHTML = thread.notifications?.length ? thread.notifications.map((card) => `
      <article class="update-card ${statusClass(card.status)}">
        ${renderVoteButtons(`notification:${card.id}`)}
        <strong>${escapeHtml(card.title)}</strong>
        <span>${escapeHtml(card.status)}${card.progress != null ? ` / ${card.progress}%` : ""}</span>
        ${card.body ? `<p>${escapeHtml(card.body)}</p>` : ""}
        ${card.next ? `<small>Next: ${escapeHtml(card.next)}</small>` : ""}
      </article>
    `).join("") : `<p class="muted">Claude update cards will appear here.</p>`;
  }
  const news = $("newsLinks");
  if (news) {
    news.innerHTML = thread.news?.map((item) => `
      <a class="news-card" href="${escapeHtml(item.url)}" target="_blank">
        ${renderVoteButtons(`news:${item.title}`)}
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.note)}</small>
      </a>
    `).join("") || `<p class="muted">News sources loading.</p>`;
  }
  const evolution = $("sourceEvolution");
  if (evolution) {
    evolution.innerHTML = thread.sourceEvolution?.map((idea) => `
      <article class="source-card ${statusClass(idea.status)}">
        ${renderVoteButtons(`aecommander:${idea.id}`)}
        <strong>${escapeHtml(idea.title)}</strong>
        <span>${escapeHtml(idea.status)}</span>
        <small>${escapeHtml(idea.use)}</small>
      </article>
    `).join("") || `<p class="muted">AECommander extraction loading.</p>`;
    setupCardVotes();
  }
  const matrix = $("optimizerMatrix");
  const cards = thread.scopeCards || [];
  if (matrix && cards.length) {
    matrix.innerHTML = cards.map((card) => `
      <div class="scope-card ${statusClass(card.status)}">
        ${renderVoteButtons(`scope:${card.id}`)}
        <strong>${escapeHtml(card.title)}</strong>
        <small>${escapeHtml(card.body)}</small>
        <em>${escapeHtml(card.need)}</em>
      </div>
    `).join("");
    setupCardVotes();
  }
  renderV4Command(state.status || {});
}

function renderPartyLine(payload) {
  state.partyLine = payload;
  const feed = $("partyLineFeed");
  if (!feed) return;
  feed.innerHTML = payload?.messages?.length ? payload.messages.map((msg) => `
    <article class="party-line-msg ${statusClass(msg.status)}">
      <span class="spine-id">${escapeHtml(msg.from)}</span>
      <div>
        <strong>${escapeHtml(msg.status)} / ${escapeHtml(msg.kind)}${msg.dagNode ? ` / ${escapeHtml(msg.dagNode)}` : ""}</strong>
        <p>${escapeHtml(msg.text)}</p>
        ${msg.evidence ? `<small>Evidence: ${escapeHtml(msg.evidence)}</small>` : ""}
        <em>${escapeHtml(new Date(msg.generatedAt).toLocaleString())}</em>
      </div>
    </article>
  `).join("") : `<p class="muted">No department messages yet. Post a note or let team LLMs write structured verdicts here.</p>`;
  renderFlightDeck();
}

async function refreshPartyLine() {
  return singleFlight("party-line", async () => {
    const payload = await api(`/api/party-line?project=${encodeURIComponent(state.activeProject)}&limit=24`);
    renderPartyLine(payload);
    setStatus(`Party line loaded: ${payload.messages?.length || 0} messages`);
    return payload;
  });
}

async function postPartyLineMessage() {
  const text = $("partyLineMessage")?.value || "";
  if (!text.trim()) throw new Error("Party line message is empty.");
  const payload = await api("/api/party-line", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      team: $("partyLineTeam")?.value || "AE0",
      dagNode: $("partyLineDagNode")?.value || state.projectDag?.progress?.current_node_id || "",
      kind: "operator-note",
      status: "INFO",
      text
    })
  });
  if ($("partyLineMessage")) $("partyLineMessage").value = "";
  await refreshPartyLine();
  setStatus(`Party line posted: ${payload.message?.from || "team"}`);
  return payload;
}

function renderFatcat(payload) {
  if (!payload) return;
  state.fatcat = payload;
  const summary = $("fatcatSummary");
  if (summary) summary.textContent = `${payload.activeCalls || 0} active calls / ${payload.protocol || "fatcat-v1"}`;
  const route = $("fatcatRoute");
  if (route) route.textContent = `${payload.route?.active || "route unknown"} - ${payload.route?.activeUrl || "no verified route yet"}`;
  const open = $("openFatcat");
  if (open) open.href = payload.summaryUrl || `/orangebox/fatcat/${state.activeProject}/FATCAT_SWITCHBOARD.md`;
  const target = $("fatcatCalls");
  if (!target) return;
  const calls = payload.latestCalls || payload.calls || [];
  target.innerHTML = calls.length ? calls.slice(0, 10).map((call) => `
    <article class="fatcat-call ${statusClass(call.status)}">
      <span class="spine-id">${escapeHtml(call.dagNode || "CALL")}</span>
      <div>
        <strong>${escapeHtml(call.status)} / ${escapeHtml(call.intent || "command")}</strong>
        <small>${escapeHtml(call.from || "OPERATOR")} -> ${escapeHtml((call.to || []).join(", "))} / ${escapeHtml(call.route?.active || "")}</small>
        <p>${escapeHtml(call.request || "")}</p>
        ${call.markdownPath ? `<em>${escapeHtml(call.markdownPath)}</em>` : ""}
      </div>
    </article>
  `).join("") : `<p class="muted">No FATCAT calls yet. Place a call to AI Box, Lips, Mirrors, Checkmate, Claude, or Codex.</p>`;
}

function renderReviewEngines(payload) {
  if (!payload) return;
  state.reviewEngines = payload;
  const summary = $("reviewEngineSummary");
  const latest = payload.latestRuns?.[0];
  if (summary) {
    summary.textContent = latest
      ? `${payload.engines?.length || 0} watchers / last ${latest.mode} / ${latest.status}`
      : `${payload.engines?.length || 0} watchers armed / no runs yet`;
  }
  const policy = $("reviewEnginePolicy");
  if (policy) {
    policy.textContent = "Watcher engines critique direction, truth, taste, frontier signal, unblock path, and early proof before heavy execution scales.";
  }
  const open = $("openReviewEngines");
  if (open) open.href = payload.dashboardUrl || `/orangebox/review-engines/${state.activeProject}/REVIEW_ENGINES.md`;
  const feed = $("reviewEngineCards");
  if (!feed) return;
  if (!latest) {
    feed.innerHTML = `
      <p class="muted">No watcher run yet. Use Early Checkmate at intake, Product Pass for creation, or Bug Pass for blockers.</p>
      ${(payload.engines || []).map((engine) => `
        <article class="review-engine-card ${statusClass("CONFIGURED")}">
          <span class="spine-id">${escapeHtml(engine.ext || engine.id)}</span>
          <div>
            <strong>${escapeHtml(engine.name)}</strong>
            <small>${escapeHtml(engine.authority || "")}</small>
            <em>${escapeHtml(engine.question || "")}</em>
          </div>
        </article>
      `).join("")}
    `;
    return;
  }
  feed.innerHTML = `
    <div class="review-engine-run">
      <span class="led ${statusClass(latest.status)}"></span>
      <strong>${escapeHtml(latest.status)} / ${escapeHtml(latest.mode)} / ${escapeHtml(latest.id || "")}</strong>
      <small>${escapeHtml(new Date(latest.generatedAt).toLocaleString())}</small>
    </div>
    ${(latest.cards || []).map((card) => `
      <article class="review-engine-card ${statusClass(card.status)}">
        <span class="spine-id">${escapeHtml(card.engine)}</span>
        <div>
          <strong>${escapeHtml(card.name)} / ${escapeHtml(card.status)}</strong>
          <p>${escapeHtml(card.finalVerdict || "")}</p>
          <small>Next: ${escapeHtml(card.nextAction || "n/a")}</small>
          <em>Falsifier: ${escapeHtml(card.falsifier || "n/a")}</em>
        </div>
      </article>
    `).join("")}
  `;
}

async function refreshReviewEngines() {
  return singleFlight("review-engines", async () => {
    const payload = await api(`/api/review-engines?project=${encodeURIComponent(state.activeProject)}`);
    renderReviewEngines(payload);
    setStatus(`Review engines: ${payload.engines?.length || 0} watchers / ${payload.latestRuns?.length || 0} runs`);
    return payload;
  });
}

async function runReviewEngines(mode = "product") {
  const text = $("threadMessage")?.value.trim()
    || $("v4Goal")?.value.trim()
    || $("operatorGoal")?.value.trim()
    || state.projectThread?.position?.currentPosition
    || "Review the current ORANGEBOX project position, active DAG, proof gaps, and next action.";
  const payload = await api("/api/review-engines/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      mode,
      text,
      evidence: "Run from ORANGEBOX AE Operations review-engine panel. Raw project state remains on disk."
    })
  });
  await refreshReviewEngines().catch(() => {});
  await refreshPartyLine().catch(() => {});
  setStatus(`Review engines ${mode}: ${payload.status} / ${payload.cards?.length || 0} cards`);
  appendChat("system", `Review engines ${mode}: ${payload.status}. Next: ${payload.nextAction || "n/a"}`, payload.mdPath || payload.receiptPath || "");
  return payload;
}

async function refreshFatcat() {
  const payload = await api(`/api/fatcat/status?project=${encodeURIComponent(state.activeProject)}`);
  renderFatcat(payload);
  setStatus(`FATCAT switchboard: ${payload.activeCalls || 0} active calls / ${payload.route?.active || "route unknown"}`);
  return payload;
}

async function placeFatcatCall() {
  const request = $("fatcatMessage")?.value || "";
  if (!request.trim()) throw new Error("FATCAT call needs a request.");
  const payload = await api("/api/fatcat/call", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      from: $("fatcatFrom")?.value || "OPERATOR",
      to: $("fatcatTo")?.value || "AI_BOX",
      intent: $("fatcatIntent")?.value || "command",
      dagNode: $("fatcatNode")?.value || state.projectDag?.progress?.current_node_id || "",
      request
    })
  });
  if ($("fatcatMessage")) $("fatcatMessage").value = "";
  await refreshFatcat();
  await refreshPartyLine().catch(() => {});
  setStatus(`FATCAT call placed: ${payload.call?.id || "call"}`);
  return payload;
}

async function raiseFatcatConflict() {
  const claim = $("fatcatMessage")?.value || "";
  if (!claim.trim()) throw new Error("Conflict needs a claim in the FATCAT message box.");
  const payload = await api("/api/project-dag/conflict", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      node_id: $("fatcatNode")?.value || state.projectDag?.progress?.current_node_id || "",
      raised_by: $("fatcatFrom")?.value || "MIRRORS",
      type: $("fatcatIntent")?.value || "cross_department",
      claim,
      evidence: "Raised from ORANGEBOX FATCAT rail."
    })
  });
  await refreshProjectDag().catch(() => {});
  await refreshPartyLine().catch(() => {});
  await refreshFatcat().catch(() => {});
  setStatus(`Conflict raised on ${payload.nodeId}: ${payload.conflict?.action || "review"}`);
  return payload;
}

function renderTriad(payload) {
  if (!payload) return;
  state.triad = payload;
  const summary = $("triadSummary");
  if (summary) summary.textContent = `${payload.status || "CONFIGURED"} / ${payload.readyRoutes?.length || 0} ready routes`;
  const policy = $("triadPolicy");
  if (policy) {
    const p = payload.memoryPolicy || payload.policy || {};
    policy.textContent = `resident ${p.residentModels ?? "?"} / parallel ${p.numParallel ?? "?"} / reserve ${p.reserveRamGB ?? "?"}GB / route ${payload.route?.active || "unknown"}`;
  }
  const open = $("openTriad");
  if (open) open.href = payload.markdownUrl || `/orangebox/triad/${state.activeProject}/TRIAD.md`;
  const routes = $("triadRoutes");
  if (routes) {
    routes.innerHTML = payload.readyRoutes?.length ? payload.readyRoutes.slice(0, 8).map((route) => `
      <article class="triad-route">
        <span class="spine-id">${escapeHtml(route.node_id)}</span>
        <div>
          <strong>${escapeHtml(route.triad?.head || "?")} / ${escapeHtml(route.triad?.name || "")}</strong>
          <small>${escapeHtml(route.node_name || "")}</small>
          <em>${escapeHtml(route.triad?.model || "")}</em>
        </div>
      </article>
    `).join("") : `<p class="muted">No ready DAG nodes for Triad routing yet.</p>`;
  }
}

function renderDepartmentModels(payload) {
  if (!payload) return;
  state.departmentModels = payload;
  const summary = $("departmentModelSummary");
  const hot = (payload.lifecycle || []).filter((item) => ["hot", "warming"].includes(item.lifecycle)).length;
  if (summary) summary.textContent = `${hot} hot/warming / ${payload.library?.length || 0} department brains`;
  const policy = $("departmentModelPolicy");
  if (policy) policy.textContent = `${payload.law || "Hot-swap department models."} Route: ${payload.route?.active || "unknown"}`;
  const open = $("openDepartmentModels");
  if (open) open.href = payload.dashboardUrl || `/orangebox/triad/${state.activeProject}/DEPARTMENT_MODELS.md`;
  const select = $("departmentModelSelect");
  if (select && select.dataset.loaded !== "1") {
    select.innerHTML = (payload.library || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.ext)} ${escapeHtml(item.id)} ${escapeHtml(item.name)}</option>`).join("");
    select.dataset.loaded = "1";
  }
  const grid = $("departmentModelGrid");
  if (!grid) return;
  const active = new Map((payload.lifecycle || []).map((item) => [item.id, item]));
  grid.innerHTML = (payload.library || []).map((item) => {
    const life = active.get(item.id) || {};
    const status = life.lifecycle || "cold";
    return `
      <article class="department-model ${statusClass(status)}">
        <span class="spine-id">${escapeHtml(item.id)}</span>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.family || item.lane)} / ${escapeHtml(item.model)} / ${escapeHtml(item.targetRamGB)}GB</small>
          <em>${escapeHtml(status)}${life.keepAlive ? ` / keep_alive ${escapeHtml(life.keepAlive)}` : ""}</em>
        </div>
      </article>
    `;
  }).join("");
}

function renderDepartmentLearning(payload) {
  if (!payload) return;
  state.departmentLearning = payload;
  const summary = $("departmentLearningSummary");
  if (summary) {
    summary.textContent = `${payload.status || "CONFIGURED"} / ${payload.trends?.length || 0} trends / ${payload.departments?.length || 0} departments / ${payload.trainingExamples || 0} seeds`;
  }
  const policy = $("departmentLearningPolicy");
  if (policy) {
    const crawl = payload.crawlPolicy || {};
    policy.textContent = `${crawl.cadence || "daily"} crawl / ${crawl.bandwidthCeiling || "10% bandwidth max"} / ${payload.sourceCount || 0} sources`;
  }
  const open = $("openDepartmentLearning");
  if (open) open.href = payload.dashboardUrl || "/orangebox/knowledge/department-learning/DEPARTMENT_LEARNING.md";
  const grid = $("departmentLearningGrid");
  if (!grid) return;
  const trends = payload.trends || [];
  grid.innerHTML = trends.length ? trends.slice(0, 8).map((trend) => `
    <article class="department-learning-card ${statusClass(trend.confidence || "configured")}">
      <span class="spine-id">${escapeHtml(trend.confidence || "SIG")}</span>
      <div>
        <strong>${escapeHtml(trend.signal || trend.id || "Learning signal")}</strong>
        <small>${escapeHtml((trend.departments || []).join(", "))}</small>
        <em>${escapeHtml(trend.executionRule || "")}</em>
        ${renderVoteButtons(`learning-trend:${trend.id || trend.signal || "unknown"}`)}
      </div>
    </article>
  `).join("") : `<p class="muted">Department learning is verified; no trend cards are queued for this view.</p>`;
  setupCardVotes();
}

async function refreshTriad(probe = false) {
  return singleFlight(`triad:${probe ? "probe" : "base"}`, async () => {
    const payload = await api(`/api/triad?project=${encodeURIComponent(state.activeProject)}${probe ? "&probe=1" : ""}`);
    renderTriad(payload);
    setStatus(`Triad: ${payload.status || "CONFIGURED"} / ${payload.readyRoutes?.length || 0} ready routes`);
    return payload;
  });
}

async function refreshDepartmentModels(probe = false) {
  return singleFlight(`department-models:${probe ? "probe" : "base"}`, async () => {
    const payload = await api(`/api/department-models?project=${encodeURIComponent(state.activeProject)}${probe ? "&probe=1" : ""}`);
    renderDepartmentModels(payload);
    setStatus(`Department model library: ${payload.lifecycle?.length || 0} lifecycle records`);
    return payload;
  });
}

async function refreshDepartmentLearning() {
  return singleFlight("department-learning", async () => {
    const payload = await api(`/api/department-learning?project=${encodeURIComponent(state.activeProject)}`);
    renderDepartmentLearning(payload);
    setStatus(`Department learning: ${payload.trends?.length || 0} trends / ${payload.sourceCount || 0} sources`);
    return payload;
  });
}

function renderMirage(payload) {
  state.mirage = payload;
  renderV4Command(state.status || {});
  const ready = payload.counts?.readyMounts || 0;
  const needs = payload.counts?.missingEnvMounts || 0;
  appendChat("system", `Mirage data plane: ${payload.status}. ${ready} mounts ready, ${needs} need env/OAuth. Receipt: ${payload.reportPath || payload.jsonPath || "written"}`);
}

async function refreshMirage() {
  return singleFlight("mirage", async () => {
    const payload = await api("/api/mirage/status");
    renderMirage(payload);
    setStatus(`Mirage data plane: ${payload.status} / ${payload.counts?.readyMounts || 0} ready mounts`);
    return payload;
  });
}

async function generateTomorrowBrief() {
  return singleFlight("tomorrow-brief", async () => {
    const payload = await api("/api/tomorrow/brief");
    appendChat("system", `Tomorrow brief: ${payload.status}. Artifacts ${payload.artifacts}; gaps ${payload.gaps}. Receipt: ${payload.receiptPath}`);
    await refreshPartyLine().catch(() => {});
    setStatus(`Tomorrow brief: ${payload.status} / gaps ${payload.gaps}`);
    return payload;
  });
}

async function runLocalGates() {
  return singleFlight("local-gates", async () => {
    const payload = await api("/api/local-gates");
    const gates = (payload.gates || []).map((gate) => `${gate.name}:${gate.status}`).join(" / ");
    appendChat("system", `Local gates: ${payload.status}. ${gates}. Receipt: ${payload.receiptPath}`);
    await refreshPartyLine().catch(() => {});
    setStatus(`Local gates: ${payload.status}`);
    return payload;
  });
}

async function invokeDesignModel() {
  const task = $("v4Goal")?.value?.trim()
    || $("goal")?.value?.trim()
    || "Review the ORANGEBOX command surface and produce concrete design improvements.";
  const payload = await api("/api/design/invoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      task,
      node: state.projectDag?.progress?.current_node_id || ""
    })
  });
  if ($("threadMessage")) $("threadMessage").value = payload.command + task;
  appendChat("system", `AE3/LIPS design packet staged: ${payload.packetPath}`);
  await refreshPartyLine().catch(() => {});
  setStatus(`Design LLM invoked: ${payload.status} / ${payload.packetPath}`);
  return payload;
}

async function invokeSelectedDepartment() {
  const department = $("departmentModelSelect")?.value || "AE0";
  const task = $("v4Goal")?.value?.trim()
    || $("goal")?.value?.trim()
    || `Prepare a scoped ${department} department pass for the current ORANGEBOX project node.`;
  const payload = await api("/api/department/invoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      department,
      task,
      node: state.projectDag?.progress?.current_node_id || ""
    })
  });
  if ($("threadMessage")) $("threadMessage").value = payload.command;
  appendChat("system", `${payload.department} department packet staged: ${payload.packetPath}`);
  await refreshPartyLine().catch(() => {});
  setStatus(`${payload.department} staged: ${payload.status} / ${payload.packetPath}`);
  return payload;
}

async function departmentModelAction(action) {
  const department = $("departmentModelSelect")?.value || "AE0";
  const keepAlive = $("departmentKeepAlive")?.value || "5m";
  const payload = await api("/api/department-models/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      department,
      action,
      keepAlive,
      node: state.projectDag?.progress?.current_node_id || ""
    })
  });
  renderDepartmentModels(payload.state ? { ...(state.departmentModels || {}), lifecycle: Object.values(payload.state.models || {}) } : state.departmentModels);
  await refreshDepartmentModels(false).catch(() => {});
  await refreshPartyLine().catch(() => {});
  setStatus(`${department} model ${action}: ${payload.lifecycle?.lifecycle || payload.status}`);
  return payload;
}

function renderModelInstallStatus(payload) {
  const grid = $("departmentModelGrid");
  if (!grid || !payload) return;
  const install = payload.state || {};
  if (!install.models) {
    setStatus(`Big model install: ${payload.status || "NOT_STARTED"}`);
    return;
  }
  const rows = install.models || [];
  grid.innerHTML = `
    <article class="department-model ${statusClass(install.status)}">
      <span class="spine-id">BIG</span>
      <div>
        <strong>AI Box Big-Model Install: ${escapeHtml(install.status)}</strong>
        <small>${escapeHtml(install.policy?.hotSwap || "hot-swap policy")} / started ${escapeHtml(install.startedAt || "")}</small>
        <em>${escapeHtml(payload.statePath || "")}</em>
      </div>
    </article>
    ${rows.map((item) => `
      <article class="department-model ${statusClass(item.status)}">
        <span class="spine-id">${escapeHtml(item.id)}</span>
        <div>
          <strong>${escapeHtml(item.tag)}</strong>
          <small>${escapeHtml(item.family)} / ${escapeHtml(item.departments)} / pull ${escapeHtml(item.pull?.status || "pending")} / smoke ${escapeHtml(item.smoke?.status || "pending")}</small>
          <em>${escapeHtml(item.pull?.logPath || item.status || "")}</em>
        </div>
      </article>
    `).join("")}
  `;
  setStatus(`Big model install: ${install.status || payload.status} / ${rows.filter((row) => row.status === "VERIFIED").length}/${rows.length} verified`);
}

async function startDepartmentModelInstall() {
  const payload = await api("/api/department-models/install", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: state.activeProject })
  });
  setStatus(`Big model install ${payload.status}: ${payload.statePath}`);
  await refreshDepartmentModelInstallStatus().catch(() => {});
  return payload;
}

async function refreshDepartmentModelInstallStatus() {
  const payload = await api(`/api/department-models/install?project=${encodeURIComponent(state.activeProject)}`);
  renderModelInstallStatus(payload);
  return payload;
}

function renderCheckmate(payload) {
  state.checkmate = payload;
  if (payload?.tasteEngine) state.tasteEngine = payload.tasteEngine;
  if (payload?.atomStandard) state.atomStandard = payload.atomStandard;
  const summary = $("checkmateSummary");
  if (summary) {
    const verified = payload?.counts?.VERIFIED || 0;
    const configured = payload?.counts?.CONFIGURED || 0;
    const missing = payload?.counts?.MISSING_RUNTIME || 0;
    const atomReport = payload?.atomReport || {};
    summary.className = `checkmate-summary ${statusClass(payload?.status || "CONFIGURED")}`;
    summary.innerHTML = `
      <span class="led ${statusClass(payload?.status || "CONFIGURED")}"></span>
      <strong>${escapeHtml(payload?.name || "Checkmate Team")}: ${verified} verified / ${configured} configured / ${missing} missing / Atom ${escapeHtml(atomReport.score ?? "?")}</strong>
      <small>${escapeHtml(atomReport.verdict || payload?.purpose || "Real-life quality verification.")}</small>
    `;
  }
  if ($("routeCheckmate")) $("routeCheckmate").className = `route-node ${payload?.status === "VERIFIED" ? "live" : "warning"}`;
  if ($("routeCheckmateDetail")) $("routeCheckmateDetail").textContent = `${payload?.counts?.VERIFIED || 0} verified / ${payload?.counts?.MISSING_RUNTIME || 0} missing`;
  const gates = $("checkmateGates");
  if (gates) {
    gates.innerHTML = (payload?.gates || []).map((gate) => `
      <article class="checkmate-gate ${gate.required ? "required" : ""}">
        <span class="led ${gate.required ? "amber" : "cyan"}"></span>
        <strong>${escapeHtml(gate.label)}</strong>
        <small>${escapeHtml(gate.owner)}${gate.required ? " / required" : " / optional by stack"}</small>
      </article>
    `).join("");
  }
  const internal = $("internalTeams");
  if (internal) {
    internal.innerHTML = (payload?.internalTeams || []).map((team) => `
      <article class="internal-team">
        ${renderVoteButtons(`internal:${team.id}`)}
        <strong>${escapeHtml(team.name)}</strong>
        <span>${escapeHtml(team.id)} / ${escapeHtml(team.status)}</span>
        <small>${escapeHtml(team.proves)}</small>
      </article>
    `).join("");
    setupCardVotes();
  }
  const tools = $("checkmateTools");
  if (tools) {
    tools.innerHTML = (payload?.tools || []).map((tool) => `
      <article class="checkmate-tool ${statusClass(tool.status)}">
        ${renderVoteButtons(`checkmate:${tool.id}`)}
        <div>
          <span class="tool-category">${escapeHtml(tool.category)}</span>
          <strong>${escapeHtml(tool.atomInstrument?.instrument || tool.name)}</strong>
          <p>${escapeHtml(tool.proves)}</p>
          <small>${escapeHtml(tool.status)} / ${escapeHtml(tool.detail || "")}</small>
          <small>10x: ${escapeHtml(tool.atomInstrument?.tenXMove || tool.atomUpgrade?.upgradeName || "")}</small>
          <em>${escapeHtml(tool.safeDefault || "")}</em>
        </div>
      </article>
    `).join("");
    setupCardVotes();
  }
  renderTasteEngine({ atomStandard: payload?.atomStandard, atomReport: payload?.atomReport, tasteEngine: payload?.tasteEngine, tools: payload?.tools });
  renderV4Command(state.status || {});
}

function renderTasteEngine(payload) {
  if (!payload) return;
  if (Object.prototype.hasOwnProperty.call(payload, "tasteEngine")) state.tasteEngine = payload.tasteEngine;
  state.atomStandard = payload.atomStandard || state.atomStandard;
  const taste = payload.tasteEngine || state.tasteEngine || {};
  const standard = payload.atomStandard || state.atomStandard || {};
  const report = payload.atomReport || state.checkmate?.atomReport || {};
  const summary = $("atomStandardSummary");
  if (summary) {
    summary.className = `atom-summary ${statusClass(report.status || payload.status || "CONFIGURED")}`;
    summary.innerHTML = `
      <span class="led ${statusClass(report.status || payload.status || "CONFIGURED")}"></span>
      <strong>${escapeHtml(standard.name || "The Atom Standard")}: ${escapeHtml(report.score ?? "?")} / ${escapeHtml(report.verdict || "loading")}</strong>
      <small>${escapeHtml(standard.doctrine || payload.aliasLaw || "Wiki means ORANGEBOX Knowledge / AEmemory.")}</small>
    `;
  }
  const influences = $("tasteInfluences");
  if (influences) {
    influences.innerHTML = (taste.influences || []).map((item) => `
      <article class="taste-card">
        ${renderVoteButtons(`taste:${item.id}`)}
        <span>Level ${escapeHtml(item.tasteLevel)}</span>
        <strong>${escapeHtml(item.name)}</strong>
        <p>${escapeHtml(item.use)}</p>
        <small>Apply: ${escapeHtml((item.apply || []).slice(0, 3).join(" / "))}</small>
        <em>Veto: ${escapeHtml((item.veto || []).slice(0, 2).join(" / "))}</em>
      </article>
    `).join("") || `<p class="muted">Taste engine not loaded yet.</p>`;
  }
  const finalPass = $("tasteFinalPass");
  if (finalPass) {
    finalPass.innerHTML = (taste.finalPass || []).map((item) => `
      <article class="taste-pass">
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.question)}</small>
      </article>
    `).join("") || `<p class="muted">Final pass loading.</p>`;
  }
  const instruments = $("atomInstrumentGrid");
  if (instruments) {
    instruments.innerHTML = (payload.tools || state.checkmate?.tools || []).map((tool) => `
      <article class="atom-instrument ${statusClass(tool.status)}">
        <span class="tool-category">${escapeHtml(tool.category || "Atom Instrument")}</span>
        <strong>${escapeHtml(tool.atomInstrument?.instrument || tool.name)}</strong>
        <p>${escapeHtml(tool.atomInstrument?.promise || tool.proves || "")}</p>
        <small><b>10x move:</b> ${escapeHtml(tool.atomInstrument?.tenXMove || "")}</small>
        <small><b>Stack:</b> ${escapeHtml((tool.atomInstrument?.stack || []).join(" / "))}</small>
        <small><b>Proof:</b> ${escapeHtml(tool.atomInstrument?.output || tool.atomUpgrade?.shipGate || "")}</small>
        <em>${escapeHtml(tool.atomVerdict || "")} / score ${escapeHtml(tool.atomScore ?? "?")}</em>
      </article>
    `).join("") || `<p class="muted">Refresh Checkmate to load Atom Instruments.</p>`;
  }
  setupCardVotes();
}

function renderKnowledgeResults(payload) {
  const target = $("knowledgeResults");
  if (!target) return;
  if (!payload || payload.status !== "VERIFIED") {
    target.innerHTML = `<p class="muted">${escapeHtml(payload?.message || payload?.status || "No ORANGEBOX Knowledge answer yet.")}</p>`;
    return;
  }
  const treeResults = payload.treeResults || [];
  const results = payload.results || [];
  const nodes = payload.relatedNodes || [];
  target.innerHTML = `
    <div class="knowledge-answer-head">
      <strong>${escapeHtml(payload.query || "query")}</strong>
      <small>${treeResults.length} PageTree paths / ${results.length} context hits / ${nodes.length} related nodes</small>
    </div>
    ${treeResults.length ? treeResults.map((row) => `
      <article class="knowledge-hit pagetree-hit">
        <span>PageTree / score ${escapeHtml(row.score)} / lines ${escapeHtml(row.startLine)}-${escapeHtml(row.endLine)}</span>
        <strong>${escapeHtml(row.path || row.title || "Untitled path")}</strong>
        <p>${escapeHtml(row.summary || "")}</p>
        <small>${escapeHtml(row.source || "")}${row.reasons?.length ? ` / ${escapeHtml(row.reasons.join(", "))}` : ""}</small>
      </article>
    `).join("") : `<p class="muted">No PageTree path matched yet. Rebuild ORANGEBOX Knowledge after adding more structured material.</p>`}
    ${results.length ? results.map((row) => `
      <article class="knowledge-hit">
        <span>${escapeHtml(row.topic || "general")} / score ${escapeHtml(row.score)}</span>
        <p>${escapeHtml(row.preview || "")}</p>
      </article>
    `).join("") : `<p class="muted">No matching context slices yet. Rebuild ORANGEBOX Knowledge after adding more material.</p>`}
  `;
}

async function refreshCheckmate(force = false) {
  return singleFlight(`checkmate:${force ? "force" : "base"}`, async () => {
    const payload = await api(`/api/checkmate${force ? "?force=1" : ""}`);
    renderCheckmate(payload);
    setStatus(`Checkmate Team: ${payload.status}${payload.cache ? ` / ${payload.cache}` : ""}`);
    return payload;
  });
}

async function refreshTaste(force = false) {
  return singleFlight(`taste:${force ? "force" : "base"}`, async () => {
    const payload = await api(`/api/atom-standard${force ? "?force=1" : ""}`);
    renderTasteEngine(payload);
    setStatus(`Atom Standard: ${payload.status || payload.atomReport?.status || "CONFIGURED"}`);
    return payload;
  });
}

async function runAtomReview() {
  const packet = $("atomReviewPacket")?.value || "";
  if (!packet.trim()) throw new Error("Paste a creation packet first: goal, artifact, proof, and design notes.");
  const payload = await api("/api/atom-standard/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      goal: state.projectThread?.position?.currentPosition || "ORANGEBOX creation packet",
      artifact: packet,
      evidence: packet,
      notes: packet
    })
  });
  const target = $("atomReviewResult");
  if (target) {
    target.className = `atom-review-result ${statusClass(payload.status)}`;
    target.innerHTML = `
      <span class="led ${statusClass(payload.status)}"></span>
      <strong>${escapeHtml(payload.verdict)} / ${escapeHtml(payload.score)} / ${escapeHtml(payload.status)}</strong>
      <small>${escapeHtml(payload.ruling)} Next: ${escapeHtml(payload.next || "")}</small>
      <div class="atom-review-checks">
        ${(payload.checks || []).map((check) => `<span class="${statusClass(check.status)}">${escapeHtml(check.label)}: ${escapeHtml(check.status)}</span>`).join("")}
      </div>
    `;
  }
  setStatus(`Atom Review: ${payload.status} / ${payload.score}`);
  return payload;
}

async function refreshProjectThread() {
  return singleFlight("project-thread", async () => {
    const thread = await api(`/api/project-thread?project=${encodeURIComponent(state.activeProject)}&lite=1`);
    renderProjectThread(thread);
    scheduleTask("ae0-council", 250, () => refreshAe0Council());
    scheduleTask("command-brief", 350, () => refreshCommandBrief());
    setStatus(`Project thread loaded: ${thread.project}`);
    return thread;
  });
}

async function updateSpineStep(stepKey, status) {
  const spine = await api("/api/project-spine/step", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      key: stepKey,
      status,
      evidence: status === "VERIFIED" ? `Operator marked ${stepKey} done from ORANGEBOX AE Operations.` : "",
      note: status === "BLOCKED" ? "Blocked from AE Operations; needs operator or evidence." : ""
    })
  });
  if (state.projectThread) state.projectThread.spine = spine;
  renderProjectSpine(spine);
  setStatus(`Project spine updated: ${stepKey} -> ${status}`);
  return spine;
}

async function refreshProjectDag() {
  const dag = await api(`/api/project-dag?project=${encodeURIComponent(state.activeProject)}`);
  renderProjectDag(dag);
  setStatus(`DAG loaded: ${dag.progress?.complete_nodes || 0}/${dag.progress?.total_nodes || 0} nodes / ${dag.progress?.percent || 0}% weighted`);
  return dag;
}

async function updateDagNode(nodeId, action) {
  const dag = await api("/api/project-dag/node", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      node_id: nodeId,
      action,
      evidence: action === "complete" ? `Operator marked ${nodeId} complete from ORANGEBOX DAG rail.` : "",
      notes: action === "fail" ? "Failed validation from AE Operations; break node smaller or repair payload." : ""
    })
  });
  if (state.projectThread) state.projectThread.dag = dag;
  renderProjectDag(dag);
  setStatus(`DAG node ${nodeId}: ${action}`);
  return dag;
}

async function runDagRunner(mode = "dry-run") {
  const payload = await api("/api/project-dag/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      mode,
      approved: mode === "dispatch",
      maxNodes: 1,
      spray: mode === "dispatch",
      concurrency: 3,
      validate: mode === "dispatch"
    })
  });
  const event = payload.events?.[0];
  if (payload.decisionGates) {
    state.decisionGates = payload.decisionGates;
    renderDecisionGates(payload.decisionGates);
  }
  setStatus(`DAG runner ${mode}: ${event?.status || payload.status} / ${event?.node_id || "paused"}`);
  appendChat("system", `DAG runner ${mode}: ${event?.status || payload.status}. ${event?.node_id ? `Node ${event.node_id}: ${event.node_name}` : event?.reason || ""}`, payload.receipt_path || "");
  await refreshProjectDag().catch(() => {});
  await refreshDecisionGates().catch(() => {});
  return payload;
}

async function exportBrainHandoff(target = "codex") {
  const payload = await api(`/api/project-handoff?project=${encodeURIComponent(state.activeProject)}&target=${encodeURIComponent(target)}`);
  if ($("chatMessage")) $("chatMessage").value = payload.markdown;
  const open = $("openSpine");
  if (open) open.href = payload.handoffUrl;
  setStatus(`${target} handoff staged: ${payload.estimatedTokens.toLocaleString()} estimated tokens. Full history stayed on disk.`);
  appendChat("system", `${target} handoff exported and staged. Path: ${payload.handoffPath}`);
  return payload;
}

async function openChatGptMax(userMessage = "") {
  const payload = await exportBrainHandoff("chatgpt-gpt-5.5-max-subscription");
  const operatorAsk = String(userMessage || "").trim();
  if (operatorAsk && $("chatMessage")) {
    $("chatMessage").value = `${payload.markdown}\n\n## Operator Request For This ChatGPT Turn\n${operatorAsk}`;
  }
  if ($("model")) $("model").value = "gpt-5.5";
  if ($("v4Model")) $("v4Model").value = "gpt-5.5";
  if ($("focusModel")) $("focusModel").value = "gpt-5.5";
  const url = payload.externalUrl || "https://chatgpt.com/";
  window.open(url, "_blank", "noopener,noreferrer");
  setStatus("ChatGPT GPT-5.5 Max packet staged. Paste the command box into ChatGPT; subscription tokens are UNKNOWN_NO_SAFE_TAP.");
  appendChat("system", `ChatGPT Max handoff is staged. Open ${url}, choose GPT-5.5/max reasoning, paste the packet, and return status/receipts to ORANGEBOX.`, payload.handoffPath || "");
  return payload;
}

async function exportOpusAwareness() {
  const payload = await api(`/api/opus-awareness?project=${encodeURIComponent(state.activeProject)}`);
  if ($("chatMessage")) $("chatMessage").value = payload.markdown;
  const open = $("openSpine");
  if (open) open.href = payload.awarenessUrl;
  const eta = payload.eta?.rangeHuman || "ETA unknown";
  const route = payload.eta?.route?.active || "route unknown";
  setStatus(`Opus packet staged: ${payload.estimatedTokens.toLocaleString()} estimated tokens / ${eta} / ${route}.`);
  appendChat("system", `Opus awareness packet staged. Path: ${payload.awarenessPath}`);
  return payload;
}

async function createProjectCheckpoint() {
  const payload = await api(`/api/project-checkpoint?project=${encodeURIComponent(state.activeProject)}`);
  const open = $("openSpine");
  if (open) open.href = payload.checkpointUrl;
  setStatus(`Checkpoint written: ${payload.estimatedTokens.toLocaleString()} estimated tokens. Resume packet is ready.`);
  appendChat("system", `Stop/start checkpoint written. Path: ${payload.checkpointPath}`, payload.receiptPath || "");
  return payload;
}

async function exportContinuityPacket() {
  const payload = await api(`/api/continuity-packet?project=${encodeURIComponent(state.activeProject)}`);
  const markdownUrl = `/orangebox/project-thread/${encodeURIComponent(state.activeProject)}/CONTINUITY_PACKET.md`;
  if ($("chatMessage")) $("chatMessage").value = `Load this ORANGEBOX continuity packet before continuing:\n${payload.markdownPath}\n\nContinue from the next spine/DAG action. Do not reset scope.`;
  if ($("threadMessage")) $("threadMessage").value = `Continuity packet generated: ${payload.markdownPath}`;
  const open = $("openSpine");
  if (open) open.href = markdownUrl;
  appendChat("system", `Continuity packet: ${payload.status}. Spine ${payload.spine?.doneCount || 0}/${payload.spine?.count || 0}; DAG ${payload.dag?.percent || 0}%. Path: ${payload.markdownPath}`);
  await refreshPartyLine().catch(() => {});
  setStatus(`Continuity packet: ${payload.status} / ${payload.estimatedTokens?.toLocaleString?.() || payload.estimatedTokens || "?"} estimated tokens`);
  return payload;
}

async function createProgressReport() {
  const payload = await api(`/api/project-progress-report?project=${encodeURIComponent(state.activeProject)}`);
  const open = $("openSpine");
  if (open) open.href = payload.reportUrl;
  if (payload.scopeLedger) {
    state.scopeLedger = payload.scopeLedger;
    renderScopeLedger(payload.scopeLedger);
  }
  const scopeCounts = payload.scopeLedger?.counts || {};
  setStatus(`Progress report written: DAG ${payload.dag?.progress?.percent || 0}% / spine ${payload.spine?.percent || 0}% / evidence ${payload.completion?.percent || 0}% / scope ${scopeCounts.verified || 0}/${scopeCounts.total || 0}`);
  appendChat("system", payload.report, payload.receiptPath || "");
  renderProjectSpine(payload.spine);
  renderProjectDag(payload.dag);
  await refreshDecisionGates().catch(() => {});
  return payload;
}

function renderAe0Council(council) {
  state.ae0Council = council;
  const summary = $("councilSummary");
  if (summary) {
    summary.textContent = `${council?.spineSummary?.doneCount || 0}/${council?.spineSummary?.count || 0} spine steps complete / next ${council?.spineSummary?.nextStep?.id || "n/a"} ${council?.spineSummary?.nextStep?.title || ""}`;
  }
  const grid = $("ae0CouncilGrid");
  if (!grid) return;
  grid.innerHTML = (council?.departments || []).map((department) => `
    <article class="council-card ${statusClass(department.status)}">
      <span class="led ${statusClass(department.status)}"></span>
      <strong>${escapeHtml(department.id)} ${escapeHtml(department.name)}</strong>
      <em>${escapeHtml(department.status)} / ${department.verified || 0} of ${department.stepCount || 0} steps verified</em>
      <small>${escapeHtml(department.currentStep ? `${department.currentStep.id} ${department.currentStep.title}: ${department.currentStep.gate}` : department.use)}</small>
    </article>
  `).join("");
}

async function refreshAe0Council() {
  return singleFlight("ae0-council", async () => {
    const council = await api(`/api/ae0/council?project=${encodeURIComponent(state.activeProject)}`);
    renderAe0Council(council);
    setStatus(`AE0 Council refreshed: ${council.departments.length} departments assigned.`);
    return council;
  });
}

async function runSelfBuild() {
  const result = await api("/api/ae0/self-build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: state.activeProject })
  });
  renderAe0Council(result.council);
  await refreshProjectThread().catch(() => {});
  setStatus(`AE0 self-build started: ${result.task.id}`);
  appendChat("system", `AE0 self-build started. All departments are auditing ORANGEBOX itself. Task log: ${result.task.logPath}`);
  return result;
}

function buildBrainPacket(thread, message, brain, scope) {
  const dropPassLaw = [
    "DROP/PASS LAW:",
    "- Continue this project from the packet; do not reset scope or skip queued spine items.",
    "- Preserve exact file roots, proof paths, receipts, blockers, and next step.",
    "- Use subscription lanes first where possible; token counts are UNKNOWN unless proven.",
    "- The AI Box executes heavy work when configured; Checkmate gates decide whether returned work can be promoted.",
    "- If evidence is missing, return a status card instead of claiming completion."
  ].join("\n");
  if (scope === "zero-scope") {
    return `BRAIN: ${brain}\nSCOPE: zero project scope\n${dropPassLaw}\n\nUSER:\n${message}`;
  }
  if (scope === "memory-primer") {
    return `BRAIN: ${brain}\nSCOPE: memory primer only\nPROJECT: ${thread.project}\n${dropPassLaw}\n\nMEMORY PRIMER:\n${thread.memoryPrimer}\n\nUSER:\n${message}`;
  }
  if (scope === "recent-thread") {
    return `BRAIN: ${brain}\nSCOPE: recent thread slice\nPROJECT: ${thread.project}\n${dropPassLaw}\n\nRECENT THREAD:\n${thread.recentText}\n\nUSER:\n${message}`;
  }
  const spine = thread.spine
    ? `\nPROJECT SPINE:\n${(thread.spine.steps || []).map((step) => `${step.id} [${step.status}] ${step.department}: ${step.title}`).join("\n")}\nNEXT: ${thread.spine.nextStep?.id || ""} ${thread.spine.nextStep?.title || ""}\n`
    : "";
  return `BRAIN: ${brain}\nSCOPE: current project position\nPROJECT: ${thread.project}\nANTHROPIC SESSION: ${thread.position?.claudeCodeSessionId || "pending"}\n${dropPassLaw}\n\nCURRENT POSITION:\n${thread.position?.currentPosition || "none"}\n${spine}\nMEMORY PRIMER:\n${thread.memoryPrimer}\n\nRECENT THREAD:\n${thread.recentText}\n\nUSER:\n${message}`;
}

async function appendThreadTurn(stage = false) {
  const text = $("threadMessage")?.value.trim();
  if (!text) {
    setStatus("Project thread message is empty.");
    return null;
  }
  const brain = $("threadBrain").value;
  const scope = $("threadScope").value;
  const thread = await api("/api/project-thread/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: state.activeProject, role: "user", text, brain, scope })
  });
  $("threadMessage").value = "";
  renderProjectThread(thread);
  if (stage) {
    const packet = buildBrainPacket(thread, text, brain, scope);
    if ($("chatMessage")) $("chatMessage").value = packet;
    if ($("model")) $("model").value = brain.startsWith("codex") ? "gpt-5.5" : "claude-opus-4-7";
    setStatus(`Brain turn staged for ${brain}. Full history stayed on disk; compact packet loaded.`);
  } else {
    setStatus(`Appended to ${thread.project} project thread.`);
  }
  return thread;
}

async function createNewProject() {
  const name = $("newProjectName")?.value.trim();
  if (!name) {
    setStatus("New project needs a name.");
    return;
  }
  state.activeProject = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "project";
  await api("/api/project-thread/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: state.activeProject,
      displayName: name,
      role: "system",
      brain: "claude-opus-4-7-max",
      scope: "current-position",
      text: `Project created: ${name}\n\nDefine scope, acceptance criteria, AI Box work lane, proof gates, and rollback path.`
    })
  });
  $("newProjectName").value = "";
  await refreshProjectThread();
}

async function sendCardFeedback(cardId, vote) {
  await api("/api/card-feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: state.activeProject, cardId, vote })
  });
  setStatus(`Wiki training vote recorded: ${cardId} ${vote}`);
}

function setupCardVotes() {
  document.querySelectorAll("[data-card] [data-vote]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const cardId = button.closest("[data-card]")?.dataset.card || "unknown";
      sendCardFeedback(cardId, button.dataset.vote).catch((error) => setStatus(error.message));
    });
  });
}

async function refreshClaudeLane() {
  const badge = $("claudeLaneBadge");
  if (!badge) return;
  try {
    const result = await api("/api/claude-code/status");
    badge.textContent = result.status;
    badge.className = `chip ${statusClass(result.status)}`;
    appendChat("system", `Claude Code ${result.version || "runtime"} / ${result.auth?.subscriptionType || "auth unknown"} / ${result.detail || result.status}`);
  } catch (error) {
    badge.textContent = "FAILED";
    badge.className = "chip red";
    appendChat("system", `Claude lane check failed: ${error.message}`);
  }
}

function renderDepartments() {
  if (!state.departments.length) {
    $("departmentGrid").innerHTML = `<p class="muted">Loading departments...</p>`;
    return;
  }
  $("departmentGrid").innerHTML = state.departments.map((department) => {
    const active = state.selectedDepartments.has(department.id);
    return `
      <button class="dept-card ${active ? "active" : ""}" data-dept="${escapeHtml(department.id)}">
        <strong>${escapeHtml(department.id)} ${escapeHtml(department.name)}</strong>
        <span>${escapeHtml(department.lane)}</span>
        <small>${escapeHtml(department.use)}</small>
      </button>
    `;
  }).join("");
  document.querySelectorAll("[data-dept]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.dept;
      if (state.selectedDepartments.has(id)) state.selectedDepartments.delete(id);
      else state.selectedDepartments.add(id);
      renderDepartments();
    });
  });
}

function renderAgents(agents = state.agents) {
  state.agents = agents || [];
  const target = $("agentProfiles");
  if (!target) return;
  target.innerHTML = state.agents.length ? state.agents.map((agent) => `
    <button class="agent-profile" data-agent="${escapeHtml(agent.id)}">
      <span class="led ${agent.id === "openclaw-guard" ? "cyan" : "green"}"></span>
      <strong>${escapeHtml(agent.name)}</strong>
      <span>${escapeHtml(agent.lane)} / ${escapeHtml(agent.risk)}</span>
      <small>${escapeHtml((agent.departments || []).join(" + "))}</small>
      <em>${escapeHtml(agent.description)}</em>
    </button>
  `).join("") : `<p class="muted">No agent profiles loaded.</p>`;
  document.querySelectorAll("[data-agent]").forEach((button) => {
    button.addEventListener("click", () => runAgent(button.dataset.agent).catch((error) => setStatus(error.message)));
  });
}

function selectStack(type) {
  const stack = state.stacks.find((item) => item.id === type);
  $("planType").value = type;
  state.selectedDepartments = new Set(stack?.departments || []);
  renderDepartments();
  const names = (stack?.departments || []).join(" + ");
  setStatus(`Loaded ${stack?.name || type}: ${names}`);
}

function renderProductionPlan(plan) {
  if (!plan) {
    $("productionPlan").innerHTML = `<p class="muted">Generate a production command to turn a big project into departments, gates, outputs, and AI Box jobs.</p>`;
    return;
  }
  $("productionPlan").innerHTML = `
    <div class="plan-title">
      <span class="led green"></span>
      <strong>${escapeHtml(plan.name)}</strong>
      <small>${escapeHtml(plan.status)} / ${escapeHtml(plan.id)}</small>
    </div>
    <div class="plan-columns">
      <div>
        <p class="eyebrow">Departments</p>
        <div class="agent-chips">${plan.departments.map((department) => `<span class="chip">${escapeHtml(department.id)} ${escapeHtml(department.name)}</span>`).join("")}</div>
      </div>
      <div>
        <p class="eyebrow">Outputs</p>
        <ul>${plan.outputs.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div>
        <p class="eyebrow">Quality Gates</p>
        <ul>${plan.qualityGates.map((gate) => `<li><strong>${escapeHtml(gate.owner)}</strong>: ${escapeHtml(gate.gate)} / ${escapeHtml(gate.standard)}</li>`).join("")}</ul>
      </div>
      <div>
        <p class="eyebrow">AI Box Jobs</p>
        <ul>${plan.jobs.map((job) => `<li><strong>${escapeHtml(job.runner)}</strong>: ${escapeHtml(job.id)} / ${escapeHtml(job.detail)}</li>`).join("")}</ul>
      </div>
    </div>
    <p class="warn">${escapeHtml(plan.commandGate)}</p>
  `;
}

function renderCodexaReceipts(payload) {
  const rows = Array.isArray(payload?.response) ? payload.response : [];
  state.codexaReceipts = rows;
  $("codexaReceipts").innerHTML = rows.length ? rows.slice(0, 10).map((row) => `
    <div class="receipt-row">
      <span class="led green"></span>
      <strong>${escapeHtml(row.name)}</strong>
      <small>${escapeHtml(row.mtime)} / ${Number(row.size || 0).toLocaleString()} bytes</small>
    </div>
  `).join("") : `<p class="muted">AI Box receipts not pulled yet.</p>`;
}

function renderWorkstream(events = []) {
  state.mcpEvents = events || [];
  const target = $("mcpWorkstream");
  const badge = $("workstreamBadge");
  if (!target) return;
  if (badge) {
    const running = state.mcpEvents.find((event) => event.status === "Running");
    badge.textContent = running ? "running" : `${state.mcpEvents.length} events`;
    badge.className = `chip ${running ? "amber" : state.mcpEvents.length ? "green" : "amber"}`;
  }
  target.innerHTML = state.mcpEvents.length ? state.mcpEvents.slice(0, 18).map((event) => `
    <div class="work-event">
      <span class="led ${statusClass(event.status)}"></span>
      <strong>${escapeHtml(event.tool)}</strong>
      <span class="chip">${escapeHtml(event.phase)} / ${escapeHtml(event.status)}</span>
      <small>${escapeHtml(event.generatedAt)}${event.durationMs ? ` / ${Number(event.durationMs).toLocaleString()}ms` : ""}</small>
      <p>${escapeHtml(event.summary || "No summary supplied.")}</p>
      ${event.receiptPath ? `<small class="receipt-path">${escapeHtml(event.receiptPath)}</small>` : ""}
      ${event.error ? `<small class="warn">${escapeHtml(event.error)}</small>` : ""}
    </div>
  `).join("") : `<p class="muted">No Claude Code MCP events yet. Ask Claude Code to use the ORANGEBOX AI Box tools and the work will show here.</p>`;
}

function metricCard(label, value, status = "CONFIGURED") {
  return `
    <div>
      <span class="led ${statusClass(status)}"></span>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(value)}</small>
    </div>
  `;
}

function renderPower(power) {
  state.power = power;
  const badge = $("powerBadge");
  const recommendation = power?.recommendation || { status: "FAILED", label: "No sample", detail: "Power endpoint has not returned yet." };
  if (badge) {
    badge.textContent = recommendation.label || recommendation.status;
    badge.className = `chip ${statusClass(recommendation.status)}`;
  }
  const recTarget = $("powerRecommendation");
  if (recTarget) {
    recTarget.className = `power-recommendation ${statusClass(recommendation.status)}`;
    recTarget.innerHTML = `
      <span class="led ${statusClass(recommendation.status)}"></span>
      <strong>${escapeHtml(recommendation.label || recommendation.status)}</strong>
      <small>${escapeHtml(recommendation.detail || "")}</small>
    `;
  }
  const seeSuite = power?.seeSuite || power?.[LEGACY_SURFACE_KEY] || {};
  const aiBox = power?.aiBox || power?.codexa || {};
  const aiBoxFreePct = aiBox.totalMemoryGB ? Math.round((aiBox.freeMemoryGB / aiBox.totalMemoryGB) * 1000) / 10 : 0;
  const metrics = $("powerMetrics");
  if (metrics) {
    metrics.innerHTML = [
      metricCard("AI Box CPU", aiBox.status === "VERIFIED" ? `${aiBox.cpuPercent}%` : aiBox.status || "FAILED", aiBox.status),
      metricCard("AI Box RAM", aiBox.status === "VERIFIED" ? `${aiBox.freeMemoryGB}GB free / ${aiBox.totalMemoryGB}GB (${aiBoxFreePct}% free)` : aiBox.error || "unavailable", aiBox.status),
      metricCard("AE See-Suite CPU", seeSuite.cpuPercent == null ? "sample unavailable" : `${seeSuite.cpuPercent}% / ${seeSuite.logicalCores} threads`, seeSuite.status || "CONFIGURED"),
      metricCard("AE See-Suite RAM", seeSuite.totalMemoryGB ? `${seeSuite.freeMemoryGB}GB free / ${seeSuite.totalMemoryGB}GB (${seeSuite.usedMemoryPercent}% used)` : "unavailable", seeSuite.status || "CONFIGURED")
    ].join("");
  }
  const processTarget = $("powerProcesses");
  if (processTarget) {
    const processes = Array.isArray(aiBox.processes) ? aiBox.processes : [];
    const docker = Array.isArray(aiBox.docker) ? aiBox.docker : [];
    processTarget.innerHTML = `
      <div class="process-block">
        <p class="eyebrow">AI Box top CPU processes</p>
        ${processes.length ? processes.map((proc) => `
          <div class="process-row">
            <strong>${escapeHtml(proc.Name || proc.ProcessName || "process")}</strong>
            <span>${escapeHtml(proc.Id || "")}</span>
            <small>CPU ${escapeHtml(proc.CPU ?? "0")} / RAM ${escapeHtml(proc.WorkingSetMB ?? "?")}MB</small>
          </div>
        `).join("") : `<p class="muted">${escapeHtml(aiBox.error || "No process sample available yet.")}</p>`}
      </div>
      <div class="process-block">
        <p class="eyebrow">AI Box Docker</p>
        ${docker.length ? docker.map((row) => `<div class="process-row"><strong>${escapeHtml(String(row).split("|")[0])}</strong><small>${escapeHtml(String(row).split("|").slice(1).join(" | "))}</small></div>`).join("") : `<p class="muted">No Docker rows in this sample.</p>`}
      </div>
    `;
  }
  if (state.status) renderOperatorConsole(state.status);
}

async function refreshWorkstream() {
  return singleFlight("workstream", async () => {
    const result = await api("/api/mcp/events?limit=12");
    renderWorkstream(result.events || []);
    return result;
  });
}

async function refreshPower(force = false) {
  return singleFlight(`power:${force ? "force" : "base"}`, async () => {
    const result = await api(`/api/power${force ? "?force=1" : ""}`);
    renderPower(result);
    renderV4Command(state.status || {});
    setStatus(`Power board: ${result.recommendation?.label || result.recommendation?.status || result.status}`);
    return result;
  });
}

async function refreshHallucinationGate(force = false) {
  return singleFlight(`hallucination:${force ? "force" : "base"}`, async () => {
    const result = await api(`/api/hallucination-gate?project=${encodeURIComponent(state.activeProject)}${force ? "&force=1" : ""}`);
    state.hallucinationGate = result;
    renderFlightDeck();
    setStatus(`Truth gate: ${result.status || "CONFIGURED"} / ${result.counts?.red || 0} red`);
    return result;
  });
}

async function refreshOptimizer(force = false) {
  return singleFlight(`optimizer:${force ? "force" : "base"}`, async () => {
    const result = await api(`/api/optimizer${force ? "?force=1" : ""}`);
    renderOptimizer(result);
    renderV4Command(state.status || {});
    if (state.status) renderOperatorConsole(state.status);
    setStatus(`Optimization governor: ${result.label || result.status}`);
    return result;
  });
}

async function refresh() {
  return singleFlight("status", async () => {
    const status = await api("/api/status");
    state.status = status;
    renderAgents(status.agents || []);
    renderSystemStrip(status);
    renderLights(status.endpoints || []);
    renderGraph((status.missions || [])[0]);
    renderContexts(status.contexts || []);
    renderProof(status);
    renderCodexaPulse(status);
    renderEthernetRepair(status.ethernetRepair);
    try {
      state.aiBoxNetwork = await api("/api/v4/ai-box-network/doctor");
      state.etherealLink = await api("/api/v4/ai-box-network/ethereal/doctor");
      renderAiBoxNetwork(state.aiBoxNetwork);
    } catch (error) {
      renderAiBoxNetwork({ status: "FAILED", active_route: "AI_BOX_DOCTOR_FAILED", blockers: [error.message], policy: {} });
    }
    renderRunway(status);
    renderLaunchConsole(status);
    renderV4Command(status);
    renderTriad(status.triad);
    renderDepartmentLearning(status.departmentLearning);
    renderDepartmentModels(status.departmentModels);
    renderReviewEngines(status.reviewEngines);
    renderCommandBrief(state.commandBrief);
    renderScopeLedger(state.scopeLedger);
    renderDecisionGates(state.decisionGates);
    renderFlightDeck();
    renderWorkstream((status.mcpEvents || []).slice(0, 12));
    renderOperatorConsole(status);
    $("missionCount").textContent = `${(status.missions || []).length} missions`;
    $("memoryStats").textContent = `signals: ${status.memory?.signals || 0} / lessons: ${status.memory?.lessons ? "yes" : "missing"} / mistakes: ${status.memory?.mistakes ? "yes" : "missing"} / CLC: ${status.memory?.clcPrimer ? "verified" : "missing"}`;
    if ($("knowledgeStats")) {
      const k = status.memory?.knowledge || {};
      $("knowledgeStats").textContent = `ORANGEBOX Knowledge: ${k.status || "MISSING"} / docs ${k.documents || 0} / PageTree ${k.pageTreeNodes || 0} / slices ${k.contextSlices || k.chunks || 0} / nodes ${k.nodes || 0} / edges ${k.edges || 0}`;
    }
    $("telemetry").textContent = `subscription tokens: ${status.telemetry?.subscriptionTokenCounts || "UNKNOWN"} / API tokens: ${status.telemetry?.apiTokenCounts || "UNKNOWN"}`;
    renderProductionPlan((status.productionPlans || [])[0]);
    return status;
  });
}

async function bootstrapApp() {
  await refreshClaudeLane().catch((error) => setStatus(error.message));
  await loadDepartments().catch((error) => setStatus(error.message));
  refreshProjectThread().catch((error) => setStatus(error.message));
  refreshCommandBrief().catch((error) => setStatus(error.message));
  refreshComprehensiveBuildout().catch((error) => setStatus(error.message));
  refreshHallucinationGate().catch((error) => setStatus(error.message));
  refreshCheckmate().catch((error) => setStatus(error.message));
  refreshPower().then(() => refreshOptimizer()).catch((error) => setStatus(error.message));
  refresh().catch((error) => setStatus(error.message));
  scheduleTask("project-thread", 200, () => refreshProjectThread());
  scheduleTask("command-brief", 500, () => refreshCommandBrief());
  scheduleTask("scope-ledger", 580, () => refreshScopeLedger());
  scheduleTask("decision-gates", 640, () => refreshDecisionGates());
  scheduleTask("comprehensive-buildout", 720, () => refreshComprehensiveBuildout());
  scheduleTask("truth-gate", 650, () => refreshHallucinationGate());
  scheduleTask("full-scope", 1100, () => refreshFullScopeStatus());
  scheduleTask("checkmate:base", 800, () => refreshCheckmate());
  scheduleTask("taste:base", 1400, () => refreshTaste());
  scheduleTask("power:base", 2000, () => refreshPower().then(() => refreshOptimizer()));
}

async function fileToPayload(file) {
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return {
    name: file.name,
    relativePath: file._orangeboxRelativePath || file.webkitRelativePath || file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
    data
  };
}

async function walkEntry(entry, prefix = "") {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise((resolve) => entry.file((file) => {
      file._orangeboxRelativePath = `${prefix}${file.name}`;
      resolve([file]);
    }, () => resolve([])));
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const all = [];
    let batch = [];
    do {
      batch = await new Promise((resolve) => reader.readEntries(resolve));
      for (const child of batch) {
        all.push(...await walkEntry(child, `${prefix}${entry.name}/`));
      }
    } while (batch.length);
    return all;
  }
  return [];
}

async function commitContext() {
  if (!state.pendingFiles.length) {
    setStatus("No files queued. Drop files/folders first.");
    return null;
  }
  setStatus(`Hashing and storing ${state.pendingFiles.length} context file(s)...`);
  const files = [];
  for (const file of state.pendingFiles.slice(0, 250)) {
    files.push(await fileToPayload(file));
  }
  const manifest = await api("/api/context/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "mission-context", files })
  });
  state.pendingFiles = [];
  setStatus(`Context committed: ${manifest.itemCount} item(s), ${manifest.estimatedTokens.toLocaleString()} estimated tokens.`);
  await refresh();
  return manifest;
}

async function buildAiBoxNetworkPack(includeBrowsers = false) {
  setStatus(includeBrowsers ? "Building AI Box Priority pack with browser guard..." : "Building AI Box Priority pack...");
  const result = await api("/api/v4/ai-box-network/pack", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      include_browsers: includeBrowsers,
      include_game_launchers: true,
      emergency_block_launchers: false,
      receipt: true
    })
  });
  state.aiBoxNetwork = await api("/api/v4/ai-box-network/doctor?deep=1");
  renderAiBoxNetwork(state.aiBoxNetwork);
  setStatus(`AI Box Priority pack ready: ${result.pack_dir}`);
  return result;
}

async function buildEtherealLinkPack() {
  setStatus("Building Ethereal AI Link direct-cable installer pack...");
  const result = await api("/api/v4/ai-box-network/ethereal/pack", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      role: "both",
      receipt: true
    })
  });
  state.etherealLink = await api("/api/v4/ai-box-network/ethereal/doctor?deep=1");
  renderAiBoxNetwork(state.aiBoxNetwork || {});
  setStatus(`Ethereal AI Link pack ready: ${result.pack_dir}`);
  return result;
}

async function createMission() {
  let contextIds = [];
  if (state.pendingFiles.length) {
    const manifest = await commitContext();
    if (manifest) contextIds = [manifest.id];
  } else if (state.latestContextId) {
    contextIds = [state.latestContextId];
  }
  const goal = $("goal").value.trim();
  if (!goal) {
    setStatus("Mission needs a goal.");
    return;
  }
  const mission = await api("/api/mission", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      goal,
      mode: $("mode").value,
      model: $("model").value,
      contextIds
    })
  });
  setStatus(`Mission graph created: ${mission.id}`);
  await refresh();
}

async function createProductionPlan() {
  const goal = $("goal").value.trim() || "ORANGEBOX production command";
  const plan = await api("/api/production-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      goal,
      type: $("planType").value,
      scale: $("planScale").value,
      departments: [...state.selectedDepartments]
    })
  });
  renderProductionPlan(plan);
  setStatus(`Production command generated: ${plan.name}`);
  await refresh();
}

async function postAction(path, label) {
  setStatus(`${label}...`);
  const result = await api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label }) });
  setStatus(`${label}: ${result.status || result.id || result.name || "queued"}`);
  await refresh();
  return result;
}

async function pullCodexaReceipts() {
  setStatus("Pulling AI Box receipts...");
  const result = await api("/api/codexa/receipts");
  renderCodexaReceipts(result);
  setStatus(`AI Box receipts: ${Array.isArray(result.response) ? result.response.length : 0} visible.`);
}

async function pullCommandRailReceipts() {
  setStatus("Pulling command rail receipts...");
  const result = await api("/api/codexa/command-rail/receipts");
  renderCodexaReceipts(result);
  setStatus(`Command rail receipts: ${Array.isArray(result.response) ? result.response.length : 0} visible.`);
}

function renderCommandResult(result) {
  const response = result?.result?.response || result?.response || result;
  const receipt = response?.response || response;
  const stdout = receipt?.stdout || receipt?.result?.stdout || "";
  const stderr = receipt?.stderr || receipt?.result?.stderr || "";
  $("codexaCommandOutput").textContent = JSON.stringify({
    status: result?.status || response?.status,
    checkmateGate: result?.checkmateGate || response?.checkmateGate || null,
    receiptPath: receipt?.receiptPath,
    totalMs: result?.totalMs || receipt?.totalMs,
    stdout,
    stderr
  }, null, 2);
}

function renderAgentOutput(result) {
  const target = $("agentOutput");
  if (!target) return;
  const judge = $("agentJudge");
  if (judge && Array.isArray(result?.results)) {
    judge.innerHTML = result.results.map((row) => {
      const verified = row.status === "VERIFIED";
      const score = verified ? 94 : 42;
      const receiptPath = row.result?.result?.response?.receiptPath || row.result?.receiptPath || "no receipt path";
      return `
        <div class="judge-card">
          <span class="led ${verified ? "green" : "red"}"></span>
          <strong>${escapeHtml(row.profile?.name || "Agent profile")}</strong>
          <span class="score">${score}</span>
          <small>${escapeHtml(row.status)} / ${escapeHtml(receiptPath)}</small>
        </div>
      `;
    }).join("");
  } else if (judge && result?.profile?.name) {
    const verified = result.status === "VERIFIED";
    judge.innerHTML = `
      <div class="judge-card">
        <span class="led ${verified ? "green" : "red"}"></span>
        <strong>${escapeHtml(result.profile.name)}</strong>
        <span class="score">${verified ? 94 : 42}</span>
        <small>${escapeHtml(result.status || "UNKNOWN")} / single profile run</small>
      </div>
    `;
  }
  const slim = {
    status: result?.status,
    id: result?.id,
    totalMs: result?.totalMs,
    profile: result?.profile?.name || result?.profileIds || null,
    sync: result?.sync ? { status: result.sync.status, remoteRoot: result.sync.remoteRoot, bytes: result.sync.bytes } : null,
    results: Array.isArray(result?.results) ? result.results.map((row) => ({
      profile: row.profile?.name,
      status: row.status,
      gate: row.checkmateGate?.status || row.result?.checkmateGate?.status || null,
      totalMs: row.totalMs,
      receiptPath: row.result?.result?.response?.receiptPath || row.result?.receiptPath || null
    })) : null,
    checkmateGate: result?.checkmateGate || null,
    receiptPath: result?.result?.result?.response?.receiptPath || result?.result?.receiptPath || null,
    stdout: String(result?.result?.result?.response?.stdout || result?.result?.stdout || "").slice(-2200),
    stderr: String(result?.result?.result?.response?.stderr || result?.result?.stderr || "").slice(-1200)
  };
  target.textContent = JSON.stringify(slim, null, 2);
}

async function runCodexaCommand() {
  const command = $("codexaCommand").value.trim();
  if (!command) {
    setStatus("AI Box command is empty.");
    return;
  }
  setStatus("Running command on AI Box command rail...");
  const result = await api("/api/codexa/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cwd: $("codexaCwd").value.trim() || "C:\\AtomEons",
      command,
      shell: "powershell",
      timeoutMs: 120000
    })
  });
  renderCommandResult(result);
  setStatus(`AI Box command: ${result.status}`);
  await refresh();
}

async function syncCommandApp() {
  setStatus("Syncing ORANGEBOX command app to the AI Box and running remote checks...");
  const result = await api("/api/codexa/sync-command-app", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  renderAgentOutput(result);
  setStatus(`AI Box app sync: ${result.status}`);
  await refresh();
  return result;
}

async function runAgent(profileId) {
  setStatus(`Running ${profileId} on the AI Box...`);
  const result = await api("/api/agent/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profileId })
  });
  renderAgentOutput(result);
  setStatus(`${profileId}: ${result.status}`);
  await refresh();
  return result;
}

async function runIdealTeam() {
  setStatus("Running ideal AI Box agent team...");
  const result = await api("/api/agent/team", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      goal: $("goal").value.trim(),
      mode: $("mode").value,
      syncFirst: true
    })
  });
  renderAgentOutput(result);
  setStatus(`Ideal team: ${result.status} / ${result.profileIds?.join(" + ") || ""}`);
  await refresh();
  return result;
}

function syncV4ToMain() {
  const text = $("v4Goal")?.value.trim() || "";
  if ($("goal")) $("goal").value = text;
  if ($("focusGoal")) $("focusGoal").value = text;
  if ($("operatorGoal")) $("operatorGoal").value = text;
  if ($("mode") && $("v4Mode")) $("mode").value = $("v4Mode").value;
  if ($("focusMode") && $("v4Mode")) $("focusMode").value = $("v4Mode").value;
  if ($("operatorMode") && $("v4Mode")) $("operatorMode").value = $("v4Mode").value;
  if ($("model") && $("v4Model")) $("model").value = $("v4Model").value;
  if ($("focusModel") && $("v4Model")) $("focusModel").value = $("v4Model").value;
}

function syncMainToV4() {
  if (!$("v4Goal")) return;
  const source = $("goal")?.value || $("focusGoal")?.value || $("operatorGoal")?.value || "";
  if (source && document.activeElement !== $("v4Goal")) $("v4Goal").value = source;
  if ($("v4Mode") && $("mode")) $("v4Mode").value = $("mode").value;
  if ($("v4Model") && $("model")) $("v4Model").value = $("model").value;
}

async function runV4Loop() {
  if (state.v4LoopRunning) {
    setStatus("V4 loop is already running.");
    return null;
  }
  syncV4ToMain();
  const goal = $("v4Goal")?.value.trim() || $("goal")?.value.trim() || "";
  if (!goal) {
    setStatus("V4 loop needs an outcome.");
    return null;
  }
  state.v4LoopRunning = true;
  $("v4RunLoop").disabled = true;
  try {
    setStatus("V4 loop 1/5: appending project thread and creating mission graph...");
    if ($("threadMessage")) $("threadMessage").value = goal;
    await appendThreadTurn(true);
    await createMission();

    setStatus("V4 loop 2/5: running AI Box agent team...");
    const team = await runIdealTeam();

    setStatus("V4 loop 3/5: capturing visual proof...");
    const proof = await postAction("/api/proof/visual", "orangebox-v4-loop-proof");

    setStatus("V4 loop 4/5: writing stop/start checkpoint...");
    const checkpoint = await createProjectCheckpoint();

    setStatus("V4 loop 5/5: refreshing Checkmate and power...");
    await refreshCheckmate(false);
    await refreshPower(false).catch(() => {});
    await refreshOptimizer(false).catch(() => {});
    await refreshProjectThread();
    appendChat("system", "V4 loop completed. AI Box, proof, checkpoint, and Checkmate refresh all returned.", checkpoint.receiptPath || "");
    setStatus(`V4 loop complete: team ${team.status}, proof ${proof.status}, checkpoint VERIFIED.`);
    return { team, proof, checkpoint };
  } finally {
    state.v4LoopRunning = false;
    if ($("v4RunLoop")) $("v4RunLoop").disabled = false;
  }
}

async function showOpenClawStatus() {
  setStatus("Checking OpenClaw through AI Box command rail...");
  const result = await api("/api/openclaw/status");
  renderAgentOutput({
    status: result.status,
    id: "openclaw-status",
    result: result.codexa?.commandRail || result
  });
  setStatus(`OpenClaw: ${result.status}`);
  await refresh();
}

function extractPathRefs(text) {
  const matches = String(text || "").match(/@[A-Za-z]:[^\s,;]+|@\.?[\/\\][^\s,;]+|@[\w.-]+(?:[\/\\][\w .-]+)*/g) || [];
  return matches.map((item) => item.slice(1)).slice(0, 20);
}

async function sendClaudeChat() {
  const message = $("chatMessage").value.trim();
  if (!message) {
    setStatus("Claude chat needs a message.");
    return;
  }
  $("chatMessage").value = "";
  appendChat("user", message, `${$("chatCwd").value} / ${$("chatEffort").value} / ${$("chatSupervision").value}`);
  const handled = await handleSlashCommand(message);
  if (handled) return;
  if ($("model").value === "gpt-5.5") {
    $("chatMessage").value = message;
    await openChatGptMax(message);
    return;
  }
  setStatus("Sending to Claude Code lane...");
  const result = await api("/api/claude-code/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: chatSessionId,
      message,
      cwd: $("chatCwd").value.trim() || "C:\\AtomEons",
      model: $("model").value,
      effort: $("chatEffort").value,
      permissionMode: $("chatSupervision").value,
      pathRefs: extractPathRefs(message),
      timeoutMs: 600000
    })
  });
  if (result.sessionId) chatSessionId = result.sessionId;
  appendChat(result.status === "VERIFIED" ? "assistant" : "system", result.result || result.stderr || result.status, `${result.status} / ${result.totalMs || 0}ms / ${result.receiptPath || ""}`);
  setStatus(`Claude Code lane: ${result.status}`);
  await refresh();
}

async function sendCommandHubChat() {
  const box = $("commandChatMessage");
  const message = box?.value.trim() || "";
  if (!message) {
    setStatus("Command chat needs a message.");
    return;
  }
  box.value = "";
  if ($("chatMessage")) $("chatMessage").value = "";
  const cwd = $("commandChatCwd")?.value.trim() || "C:\\AtomEons";
  const effort = $("commandChatEffort")?.value || $("chatEffort")?.value || "xhigh";
  const supervision = $("commandChatSupervision")?.value || $("chatSupervision")?.value || "plan";
  if ($("chatCwd")) $("chatCwd").value = cwd;
  if ($("chatEffort")) $("chatEffort").value = effort;
  if ($("chatSupervision")) $("chatSupervision").value = supervision;
  appendChat("user", message, `${cwd} / ${effort} / ${supervision}`);
  const handled = await handleSlashCommand(message);
  if (handled) return;
  if ($("model")?.value === "gpt-5.5") {
    box.value = message;
    if ($("chatMessage")) $("chatMessage").value = message;
    await openChatGptMax(message);
    return;
  }
  setStatus("Sending command hub message to Claude Code lane...");
  const result = await api("/api/claude-code/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: chatSessionId,
      message,
      cwd,
      model: $("model")?.value || "claude-opus-4-7",
      effort,
      permissionMode: supervision,
      pathRefs: extractPathRefs(message),
      timeoutMs: 600000
    })
  });
  if (result.sessionId) chatSessionId = result.sessionId;
  appendChat(result.status === "VERIFIED" ? "assistant" : "system", result.result || result.stderr || result.status, `${result.status} / ${result.totalMs || 0}ms / ${result.receiptPath || ""}`);
  setStatus(`Command hub: ${result.status}`);
  await refresh();
}

async function handleSlashCommand(message) {
  const [rawCommand, ...rest] = message.trim().split(/\s+/);
  const command = rawCommand.toLowerCase();
  const payload = rest.join(" ").trim();
  if (!command.startsWith("/")) return false;
  if (payload) {
    $("focusGoal").value = payload;
    syncFocusToMain();
  }
  if (command === "/mission") {
    await createMission();
    appendChat("system", "Mission graph created from command chat.", "slash /mission");
    return true;
  }
  if (command === "/team" || command === "/agents") {
    const result = await runIdealTeam();
    appendChat("system", `Ideal AI Box team finished: ${result.status}`, `profiles: ${result.profileIds?.join(" + ") || ""}`);
    return true;
  }
  if (command === "/sync") {
    const result = await syncCommandApp();
    appendChat("system", `ORANGEBOX synced to AI Box: ${result.status}`, result.remoteRoot || "");
    return true;
  }
  if (command === "/proof") {
    const result = await postAction("/api/proof/visual", "chat-proof");
    appendChat("system", `Visual proof finished: ${result.status}`, result.reportPath || "");
    return true;
  }
  if (command === "/chairman") {
    await createChairmanPlan(payload || $("focusGoal").value.trim());
    return true;
  }
  if (command === "/receipts") {
    await pullCommandRailReceipts();
    appendChat("system", "Receipts pulled into the AI Box panel.", "slash /receipts");
    return true;
  }
  if (command === "/openclaw") {
    await showOpenClawStatus();
    appendChat("system", "OpenClaw guard status checked.", "slash /openclaw");
    return true;
  }
  appendChat("system", `Unknown command ${command}. Try /mission, /team, /sync, /proof, /chairman, /receipts, or plain text for Claude Opus.`);
  setStatus(`Unknown slash command: ${command}`);
  return true;
}

async function createChairmanPlan(goalOverride = "") {
  const message = goalOverride || $("chatMessage").value.trim() || $("focusGoal").value.trim() || $("goal").value.trim();
  if (!message) {
    setStatus("Chairman plan needs a goal.");
    return;
  }
  appendChat("user", `/chairman ${message}`, "planning only; no fake multi-model execution");
  setStatus("Creating Chairman plan...");
  const result = await api("/api/chairman/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      goal: message,
      mode: $("mode").value
    })
  });
  const lines = [
    `Status: ${result.status}`,
    `Candidates: ${result.candidates.map((item) => `${item.id}=${item.status}`).join(", ")}`,
    `Loop: ${result.loop.join(" ")}`
  ].join("\n");
  appendChat("system", lines, "Chairman LLM scaffold / receipts written");
  setStatus(`Chairman plan: ${result.status}`);
  await refresh();
}

function setupDropzone() {
  const dropzone = $("dropzone");
  const picker = $("filePicker");
  const setFiles = (files) => {
    state.pendingFiles = Array.from(files || []);
    const total = state.pendingFiles.reduce((sum, file) => sum + file.size, 0);
    setStatus(`Queued ${state.pendingFiles.length} file(s), ${(total / 1024 / 1024).toFixed(2)} MB.`);
  };
  picker.addEventListener("change", (event) => setFiles(event.target.files));
  dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("drag"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag");
    const items = Array.from(event.dataTransfer.items || []);
    if (items.length && items.some((item) => item.webkitGetAsEntry)) {
      Promise.all(items.map((item) => walkEntry(item.webkitGetAsEntry?.()))).then((groups) => setFiles(groups.flat()));
    } else {
      setFiles(event.dataTransfer.files);
    }
  });
}

function setupNav() {
  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".rail-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const target = document.getElementById(button.dataset.jump);
      const drawer = target?.closest("details");
      if (drawer) drawer.open = true;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function setupDepartmentMix() {
  document.querySelectorAll("[data-mix]").forEach((button) => {
    button.addEventListener("click", () => {
      const goal = $("goal");
      const prefix = button.dataset.mix;
      goal.value = goal.value.trim() ? `${prefix}\n\n${goal.value.trim()}` : prefix;
      if (prefix.includes("Marketing") || prefix.includes("Design")) $("mode").value = "ui-product";
      if (prefix.includes("Security")) $("mode").value = "security-network";
      if (prefix.includes("Research")) $("mode").value = "research-memory";
      setStatus(`Department mix added: ${button.textContent.trim()}`);
    });
  });
}

function syncFocusToMain() {
  const focusGoal = $("focusGoal");
  if (!focusGoal) return;
  $("goal").value = focusGoal.value;
  $("mode").value = $("focusMode").value;
  $("model").value = $("focusModel").value;
}

function syncOperatorToMain() {
  const operatorGoal = $("operatorGoal");
  if (!operatorGoal) return;
  $("goal").value = operatorGoal.value.trim();
  $("focusGoal").value = operatorGoal.value.trim();
  $("mode").value = $("operatorMode").value;
  $("focusMode").value = $("operatorMode").value;
  const target = $("operatorTarget").value;
  if (target === "website") selectStack("website-launch");
  if (target === "bulk-skills") selectStack("skill-factory");
  if (target === "orangebox" || target === "project") selectStack("app-launch");
}

function syncMainToFocus() {
  if (!$("focusGoal")) return;
  $("focusGoal").value = $("goal").value;
  $("focusMode").value = $("mode").value;
  $("focusModel").value = $("model").value;
}

function syncMainToOperator() {
  if (!$("operatorGoal")) return;
  $("operatorGoal").value = $("goal").value || $("focusGoal")?.value || "";
  $("operatorMode").value = $("mode").value || "ui-product";
}

function setupOperatorConsole() {
  if (!$("operatorGoal")) return;
  $("operatorGoal").addEventListener("input", () => {
    $("goal").value = $("operatorGoal").value;
    if ($("focusGoal")) $("focusGoal").value = $("operatorGoal").value;
  });
  $("operatorMode").addEventListener("change", () => {
    $("mode").value = $("operatorMode").value;
    if ($("focusMode")) $("focusMode").value = $("operatorMode").value;
  });
  $("operatorGraph").addEventListener("click", () => {
    syncOperatorToMain();
    createMission().catch((error) => setStatus(error.message));
  });
  $("operatorTeam").addEventListener("click", () => {
    syncOperatorToMain();
    runIdealTeam().catch((error) => setStatus(error.message));
  });
  $("operatorProof").addEventListener("click", () => postAction("/api/proof/visual", "operator-proof").catch((error) => setStatus(error.message)));
  $("operatorDiagnose").addEventListener("click", () => runAgent("ae10-ai-box-ops").catch((error) => setStatus(error.message)));
  $("operatorSync").addEventListener("click", () => syncCommandApp().catch((error) => setStatus(error.message)));
  $("operatorReceipts").addEventListener("click", () => pullCommandRailReceipts().catch((error) => setStatus(error.message)));
  syncMainToOperator();
}

function setupLaunchConsole() {
  if (!$("focusGoal")) return;
  $("focusGoal").addEventListener("input", () => {
    $("goal").value = $("focusGoal").value;
    if ($("operatorGoal") && document.activeElement !== $("operatorGoal")) $("operatorGoal").value = $("focusGoal").value;
  });
  $("goal").addEventListener("input", () => {
    if (document.activeElement !== $("focusGoal")) $("focusGoal").value = $("goal").value;
    if ($("operatorGoal") && document.activeElement !== $("operatorGoal")) $("operatorGoal").value = $("goal").value;
  });
  $("focusMode").addEventListener("change", () => {
    $("mode").value = $("focusMode").value;
    if ($("operatorMode")) $("operatorMode").value = $("focusMode").value;
  });
  $("mode").addEventListener("change", () => {
    $("focusMode").value = $("mode").value;
    if ($("operatorMode")) $("operatorMode").value = $("mode").value;
  });
  $("focusModel").addEventListener("change", () => { $("model").value = $("focusModel").value; });
  $("model").addEventListener("change", () => { $("focusModel").value = $("model").value; });
  $("focusMission").addEventListener("click", () => {
    syncFocusToMain();
    createMission().catch((error) => setStatus(error.message));
  });
  $("focusTeam").addEventListener("click", () => {
    syncFocusToMain();
    runIdealTeam().catch((error) => setStatus(error.message));
  });
  $("sendClaudeChat").addEventListener("click", () => sendClaudeChat().catch((error) => {
    appendChat("system", error.message);
    setStatus(error.message);
  }));
  $("chairmanPlan").addEventListener("click", () => createChairmanPlan().catch((error) => {
    appendChat("system", error.message);
    setStatus(error.message);
  }));
  $("chatMessage").addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      sendClaudeChat().catch((error) => {
        appendChat("system", error.message);
        setStatus(error.message);
      });
    }
  });
  document.querySelectorAll("[data-slash]").forEach((button) => {
    button.addEventListener("click", () => {
      const prefix = button.dataset.slash || "";
      const current = $("chatMessage").value.trim();
      $("chatMessage").value = current ? `${prefix}${current}` : prefix;
      $("chatMessage").focus();
    });
  });
  setupCommandToolkit();
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      $("focusGoal").value = button.dataset.preset;
      $("focusMode").value = button.dataset.presetMode || "code-build";
      syncFocusToMain();
      setStatus(`Loaded launch preset: ${button.textContent.trim()}`);
    });
  });
  syncMainToFocus();
}

function setupCommandHub() {
  if (!$("commandChatMessage")) return;
  $("sendCommandChat")?.addEventListener("click", () => sendCommandHubChat().catch((error) => {
    appendChat("system", error.message);
    setStatus(error.message);
  }));
  $("commandChatMessage")?.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      sendCommandHubChat().catch((error) => {
        appendChat("system", error.message);
        setStatus(error.message);
      });
    }
  });
  document.querySelectorAll("[data-command-slash]").forEach((button) => {
    button.addEventListener("click", () => {
      const prefix = button.dataset.commandSlash || "";
      const current = $("commandChatMessage")?.value.trim() || "";
      $("commandChatMessage").value = current ? `${prefix}${current}` : prefix;
      $("commandChatMessage").focus();
    });
  });
  $("commandStageThread")?.addEventListener("click", () => {
    const text = $("commandChatMessage")?.value.trim() || $("focusGoal")?.value.trim() || $("goal")?.value.trim() || "";
    if (!text) return setStatus("Stage Thread needs a command or goal.");
    if ($("threadMessage")) $("threadMessage").value = text;
    appendThreadTurn(true).catch((error) => setStatus(error.message));
  });
  $("commandChatMessage")?.addEventListener("input", () => {
    const value = $("commandChatMessage").value;
    if ($("focusGoal") && document.activeElement === $("commandChatMessage")) $("focusGoal").value = value;
    if ($("goal") && document.activeElement === $("commandChatMessage")) $("goal").value = value;
    if ($("operatorGoal") && document.activeElement === $("commandChatMessage")) $("operatorGoal").value = value;
    if ($("v4Goal") && document.activeElement === $("commandChatMessage")) $("v4Goal").value = value;
  });
}

function insertIntoChat(value, mode = "prefix") {
  const box = $("chatMessage");
  if (!box) return;
  const current = box.value.trim();
  if (!current) {
    box.value = value;
  } else if (mode === "append") {
    box.value = `${current}\n${value}`;
  } else {
    box.value = `${value}${value.endsWith(" ") ? "" : " "}${current}`;
  }
  box.focus();
  box.selectionStart = box.selectionEnd = box.value.length;
}

function setupCommandToolkit() {
  const grid = $("toolkitGrid");
  if (!grid || grid.dataset.ready === "1") return;
  grid.dataset.ready = "1";
  grid.innerHTML = commandToolkit.map((group) => `
    <section class="toolkit-group">
      <strong>${escapeHtml(group.group)}</strong>
      <div>
        ${group.items.map((item) => `
          <button class="toolkit-command" data-insert="${escapeHtml(item.insert)}" title="${escapeHtml(item.detail)}">
            <span>${escapeHtml(item.label)}</span>
            <code>${escapeHtml(item.insert.trim())}</code>
            <small>${escapeHtml(item.detail)}</small>
          </button>
        `).join("")}
      </div>
    </section>
  `).join("");
  grid.querySelectorAll("[data-insert]").forEach((button) => {
    button.addEventListener("click", () => {
      insertIntoChat(button.dataset.insert || "");
      setStatus(`Inserted command: ${button.dataset.insert || ""}`);
    });
  });
}

function setupV4Console() {
  if (!$("v4Goal")) return;
  $("v4Goal").addEventListener("input", () => {
    if ($("goal")) $("goal").value = $("v4Goal").value;
    if ($("focusGoal")) $("focusGoal").value = $("v4Goal").value;
    if ($("operatorGoal")) $("operatorGoal").value = $("v4Goal").value;
  });
  $("v4Mode").addEventListener("change", () => {
    if ($("mode")) $("mode").value = $("v4Mode").value;
    if ($("focusMode")) $("focusMode").value = $("v4Mode").value;
    if ($("operatorMode")) $("operatorMode").value = $("v4Mode").value;
  });
  $("v4Model").addEventListener("change", () => {
    if ($("model")) $("model").value = $("v4Model").value;
    if ($("focusModel")) $("focusModel").value = $("v4Model").value;
  });
  $("v4Stage").addEventListener("click", () => {
    syncV4ToMain();
    if ($("threadMessage")) $("threadMessage").value = $("v4Goal").value.trim();
    appendThreadTurn(true).catch((error) => setStatus(error.message));
  });
  $("v4RunTeam").addEventListener("click", () => {
    syncV4ToMain();
    runIdealTeam().catch((error) => setStatus(error.message));
  });
  $("v4RunLoop").addEventListener("click", () => runV4Loop().catch((error) => {
    appendChat("system", `V4 loop failed: ${error.message}`);
    setStatus(error.message);
  }));
  $("v4Proof").addEventListener("click", () => postAction("/api/proof/visual", "orangebox-v4-proof").catch((error) => setStatus(error.message)));
  $("v4Checkpoint").addEventListener("click", () => createProjectCheckpoint().catch((error) => setStatus(error.message)));
  $("v4Power").addEventListener("click", () => refreshPower(true).then(() => refreshOptimizer(true)).catch((error) => setStatus(error.message)));
  syncMainToV4();
}

async function loadDepartments() {
  const result = await api("/api/departments");
  state.departments = result.departments || [];
  state.stacks = result.stacks || [];
  selectStack("website-launch");
}

$("createMission").addEventListener("click", () => createMission().catch((error) => setStatus(error.message)));
$("uploadContext").addEventListener("click", () => commitContext().catch((error) => setStatus(error.message)));
$("localBench").addEventListener("click", () => postAction("/api/benchmark/local", `${LEGACY_SURFACE_KEY}-benchmark`).catch((error) => setStatus(error.message)));
$("codexaBench").addEventListener("click", () => postAction("/api/benchmark/codexa", "codexa-benchmark").catch((error) => setStatus(error.message)));
$("visualProof").addEventListener("click", () => postAction("/api/proof/visual", "visual-proof").catch((error) => setStatus(error.message)));
$("runwaySync").addEventListener("click", () => syncCommandApp().catch((error) => setStatus(error.message)));
$("runwayTeam").addEventListener("click", () => runIdealTeam().catch((error) => setStatus(error.message)));
$("runwayProof").addEventListener("click", () => postAction("/api/proof/visual", "runway-proof").catch((error) => setStatus(error.message)));
$("runwayReceipts").addEventListener("click", () => pullCommandRailReceipts().catch((error) => setStatus(error.message)));
$("refreshWork").addEventListener("click", () => refreshWorkstream().then(() => setStatus("Claude Workstream refreshed.")).catch((error) => setStatus(error.message)));
$("refreshPower").addEventListener("click", () => refreshPower(true).then(() => refreshOptimizer(true)).catch((error) => setStatus(error.message)));
$("createProductionPlan").addEventListener("click", () => createProductionPlan().catch((error) => setStatus(error.message)));
$("loadWebsiteStack").addEventListener("click", () => selectStack("website-launch"));
$("loadSkillStack").addEventListener("click", () => selectStack("skill-factory"));
$("loadAppStack").addEventListener("click", () => selectStack("app-launch"));
$("refresh").addEventListener("click", () => refresh().catch((error) => setStatus(error.message)));
$("bridgePack").addEventListener("click", () => api("/api/bridge-pack").then(() => setStatus("Bridge pack generation queued.")).then(refresh).catch((error) => setStatus(error.message)));
$("commandRailPack").addEventListener("click", () => api("/api/command-rail-pack").then(() => setStatus("Command rail pack generation queued.")).then(refresh).catch((error) => setStatus(error.message)));
$("openClawPack").addEventListener("click", () => api("/api/openclaw-pack").then(() => setStatus("OpenClaw guarded pack generation queued.")).then(refresh).catch((error) => setStatus(error.message)));
$("pullReceipts").addEventListener("click", () => pullCodexaReceipts().catch((error) => setStatus(error.message)));
$("pullCommandRailReceipts").addEventListener("click", () => pullCommandRailReceipts().catch((error) => setStatus(error.message)));
  $("syncWiki").addEventListener("click", () => api("/api/codexa/sync-wiki", { method: "POST" }).then(() => setStatus("Wiki sync queued.")).then(refresh).catch((error) => setStatus(error.message)));
  $("rebuildKnowledge")?.addEventListener("click", () => api("/api/knowledge/rebuild", {
    method: "POST",
    body: JSON.stringify({ project: state.activeProject })
  }).then((result) => setStatus(`ORANGEBOX Knowledge rebuild started: ${result.task?.id || "task"}`)).then(refresh).catch((error) => setStatus(error.message)));
  $("askKnowledge")?.addEventListener("click", () => {
    const q = $("knowledgeQuery")?.value.trim();
    if (!q) return setStatus("Ask ORANGEBOX Knowledge needs a question.");
    api(`/api/knowledge/query?project=${encodeURIComponent(state.activeProject)}&q=${encodeURIComponent(q)}`)
      .then((result) => {
        renderKnowledgeResults(result);
        setStatus(`ORANGEBOX Knowledge answered: ${result.results?.length || 0} hits`);
      })
      .catch((error) => setStatus(error.message));
  });
  $("knowledgeQuery")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("askKnowledge")?.click();
  });
$("syncCommandApp").addEventListener("click", () => syncCommandApp().catch((error) => setStatus(error.message)));
$("runIdealTeam").addEventListener("click", () => runIdealTeam().catch((error) => setStatus(error.message)));
$("openClawStatus").addEventListener("click", () => showOpenClawStatus().catch((error) => setStatus(error.message)));
$("runCodexaCommand").addEventListener("click", () => runCodexaCommand().catch((error) => setStatus(error.message)));
$("loadHealthCommand").addEventListener("click", () => {
  $("codexaCommand").value = "hostname; whoami; Get-Date; Get-ComputerInfo | Select-Object CsName,OsName,OsArchitecture,CsTotalPhysicalMemory";
  setStatus("Loaded AI Box health command.");
});
$("loadBuildCommand").addEventListener("click", () => {
  $("codexaCommand").value = "cd C:\\AtomEons; git status --short; node --version; npm --version; docker ps --format \"table {{.Names}}\\t{{.Status}}\"";
  setStatus("Loaded AI Box build/test readiness command.");
});

setupDropzone();
setupNav();
setupDepartmentMix();
setupOperatorConsole();
setupLaunchConsole();
setupCommandHub();
setupV4Console();
$("threadAppend")?.addEventListener("click", () => appendThreadTurn(false).catch((error) => setStatus(error.message)));
$("threadStage")?.addEventListener("click", () => appendThreadTurn(true).catch((error) => setStatus(error.message)));
$("flightStage")?.addEventListener("click", () => exportOpusAwareness().catch((error) => setStatus(error.message)));
$("flightPower")?.addEventListener("click", () => refreshPower(true).then(() => refreshOptimizer(true)).catch((error) => setStatus(error.message)));
$("flightReport")?.addEventListener("click", () => createProgressReport().catch((error) => setStatus(error.message)));
$("newProject")?.addEventListener("click", () => createNewProject().catch((error) => setStatus(error.message)));
$("projectCheckpoint")?.addEventListener("click", () => createProjectCheckpoint().catch((error) => setStatus(error.message)));
$("progressReport")?.addEventListener("click", () => createProgressReport().catch((error) => setStatus(error.message)));
$("continuityPacket")?.addEventListener("click", () => exportContinuityPacket().catch((error) => setStatus(error.message)));
$("buildEidosClc")?.addEventListener("click", () => buildEidosClc().catch((error) => {
  renderEidosClc({ status: "SERVER_RESTART_OR_API_REQUIRED", error: error.message });
  appendChat("system", `EIDOS CLC build did not reach the live API: ${error.message}`);
  setStatus(error.message);
}));
$("v4FullScope")?.addEventListener("click", () => advanceFullScope().catch((error) => setStatus(error.message)));
$("v4ExpandScope")?.addEventListener("click", () => expandLiveScope().catch((error) => setStatus(error.message)));
$("v4Buildout")?.addEventListener("click", () => materializeBuildout().catch((error) => setStatus(error.message)));
$("v4Mirage")?.addEventListener("click", () => refreshMirage().catch((error) => setStatus(error.message)));
$("v4Tomorrow")?.addEventListener("click", () => generateTomorrowBrief().catch((error) => setStatus(error.message)));
$("v4LocalGates")?.addEventListener("click", () => runLocalGates().catch((error) => setStatus(error.message)));
$("v4Continuity")?.addEventListener("click", () => exportContinuityPacket().catch((error) => setStatus(error.message)));
$("v4ScopeLedger")?.addEventListener("click", () => refreshScopeLedger().catch((error) => setStatus(error.message)));
$("v4DecisionGates")?.addEventListener("click", () => refreshDecisionGates().catch((error) => setStatus(error.message)));
$("opusAwareness")?.addEventListener("click", () => exportOpusAwareness().catch((error) => setStatus(error.message)));
$("refreshDag")?.addEventListener("click", () => refreshProjectDag().catch((error) => setStatus(error.message)));
$("dagDryRun")?.addEventListener("click", () => runDagRunner("dry-run").catch((error) => setStatus(error.message)));
$("dagDispatch")?.addEventListener("click", () => runDagRunner("dispatch").catch((error) => setStatus(error.message)));
$("refreshPartyLine")?.addEventListener("click", () => refreshPartyLine().catch((error) => setStatus(error.message)));
$("partyLinePost")?.addEventListener("click", () => postPartyLineMessage().catch((error) => setStatus(error.message)));
$("refreshFatcat")?.addEventListener("click", () => refreshFatcat().catch((error) => setStatus(error.message)));
$("fatcatCall")?.addEventListener("click", () => placeFatcatCall().catch((error) => setStatus(error.message)));
$("fatcatConflict")?.addEventListener("click", () => raiseFatcatConflict().catch((error) => setStatus(error.message)));
$("refreshReviewEngines")?.addEventListener("click", () => refreshReviewEngines().catch((error) => setStatus(error.message)));
$("runEarlyCheckmate")?.addEventListener("click", () => runReviewEngines("preflight").catch((error) => setStatus(error.message)));
$("runReviewEnginesProduct")?.addEventListener("click", () => runReviewEngines("product").catch((error) => setStatus(error.message)));
$("runReviewEnginesBug")?.addEventListener("click", () => runReviewEngines("bug").catch((error) => setStatus(error.message)));
$("refreshTriad")?.addEventListener("click", () => refreshTriad(false).catch((error) => setStatus(error.message)));
$("probeTriad")?.addEventListener("click", () => refreshTriad(true).then(() => refreshDepartmentModels(true)).catch((error) => setStatus(error.message)));
$("refreshDepartmentModels")?.addEventListener("click", () => refreshDepartmentModels(false).catch((error) => setStatus(error.message)));
$("refreshDepartmentLearning")?.addEventListener("click", () => refreshDepartmentLearning().catch((error) => setStatus(error.message)));
$("installDepartmentModels")?.addEventListener("click", () => startDepartmentModelInstall().catch((error) => setStatus(error.message)));
$("modelInstallStatus")?.addEventListener("click", () => refreshDepartmentModelInstallStatus().catch((error) => setStatus(error.message)));
$("invokeDepartmentModel")?.addEventListener("click", () => invokeSelectedDepartment().catch((error) => setStatus(error.message)));
$("invokeDesignModel")?.addEventListener("click", () => invokeDesignModel().catch((error) => setStatus(error.message)));
$("warmDepartmentModel")?.addEventListener("click", () => departmentModelAction("warm").catch((error) => setStatus(error.message)));
$("releaseDepartmentModel")?.addEventListener("click", () => departmentModelAction("release").catch((error) => setStatus(error.message)));
$("claudeHandoff")?.addEventListener("click", () => exportBrainHandoff("claude-opus-4-7").catch((error) => setStatus(error.message)));
$("codexHandoff")?.addEventListener("click", () => exportBrainHandoff("codex-gpt-5.5").catch((error) => setStatus(error.message)));
$("chatgptHandoff")?.addEventListener("click", () => openChatGptMax().catch((error) => setStatus(error.message)));
$("sendChatGpt")?.addEventListener("click", () => openChatGptMax().catch((error) => setStatus(error.message)));
$("refreshCouncil")?.addEventListener("click", () => refreshAe0Council().catch((error) => setStatus(error.message)));
$("selfBuild")?.addEventListener("click", () => runSelfBuild().catch((error) => setStatus(error.message)));
$("refreshCheckmate")?.addEventListener("click", () => refreshCheckmate(true).catch((error) => setStatus(error.message)));
$("refreshTaste")?.addEventListener("click", () => refreshTaste(true).catch((error) => setStatus(error.message)));
$("runAtomReview")?.addEventListener("click", () => runAtomReview().catch((error) => setStatus(error.message)));
bootstrapApp().catch((error) => setStatus(error.message));
setInterval(() => {
  hardenControlLabels();
}, 2000);
setInterval(() => {
  if (!document.hidden) refreshWorkstream().catch(() => {});
}, 10000);
setInterval(() => {
  if (!document.hidden) refreshPower(false).then(() => refreshOptimizer(false)).catch(() => {});
}, 180000);
