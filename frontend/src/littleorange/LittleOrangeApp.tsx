import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  FileText,
  Folder,
  GitBranch,
  Layers3,
  ListChecks,
  RefreshCcw,
  Route,
  Send,
  ShieldCheck,
  Square,
  Terminal,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../types/app";
import {
  LITTLEORANGE_REPO_ROOT,
  littleOrangeEndpoints,
  loadLittleOrangeSnapshot,
  loadProjectThread,
  runRepoIndex,
  streamLittleOrangeRun,
  type LittleOrangeProject,
  type LittleOrangeSnapshot,
  type RailProbe,
} from "./littleOrangeClient";

type MessageStatus = "complete" | "streaming" | "error";
type DeckTab = "truth" | "files" | "tools" | "radar" | "receipts";

interface LittleMessage extends ChatMessage {
  meta?: string;
  status?: MessageStatus;
}

const starterMessages: LittleMessage[] = [
  {
    id: "lo-system",
    role: "system",
    content: "LittleOrange v2 online. This is a custom Orangebox code cockpit: chat, route, receipts, files, model lane, and real tool status in one place.",
    createdAt: Date.now(),
    status: "complete",
  },
];

const commandPresets = [
  {
    label: "Health",
    value: "Give me the current Orangebox health in plain English. Separate local, Codexa, models, receipts, and blockers. Use proof-backed facts only.",
  },
  {
    label: "Project",
    value: "Produce a full project report for the selected Orangebox project. Include real status, next action, proof path, and what is not connected.",
  },
  {
    label: "Patch Plan",
    value: "Create a surgical code patch plan. Name files, tests, risk, rollback, and the smallest first edit.",
  },
  {
    label: "Receipts",
    value: "Find the latest receipt-backed truth for this project and summarize only verified facts.",
  },
  {
    label: "Codexa",
    value: "Check the Codexa lane and tell me what can run there now, what is blocked, and what needs proof.",
  },
  {
    label: "Route",
    value: "Read the current route spine. Tell me the active objective, completed gates, open gaps, and the next exact command.",
  },
];

const upgradeRadar = [
  {
    name: "Context7 MCP",
    status: "verified-candidate",
    use: "Fresh version-specific docs before code edits.",
    action: "Add as doc-hydration lane after MCP import gate.",
  },
  {
    name: "OpenJarvis",
    status: "verified-candidate",
    use: "Local-first efficiency telemetry around Ollama/vLLM/llama.cpp.",
    action: "Benchmark against current active council before adopting.",
  },
  {
    name: "ElysiaJS",
    status: "fast-lane-candidate",
    use: "Bun-native local API/SSE bridge for Ollama and cockpit tool calls.",
    action: "Prototype as sidecar first; replace Express only after latency proof.",
  },
  {
    name: "AI SDK + Ollama Provider",
    status: "fast-lane-candidate",
    use: "Typed local token streaming and chat state protocol for Bun/React.",
    action: "Use for LittleOrange local model stream once Ollama route is benchmarked.",
  },
  {
    name: "libSQL vectors",
    status: "memory-candidate",
    use: "Zero-telemetry local vector memory for decisions, AST hints, and preferences.",
    action: "Permanent decision ledger yes; ephemeral scratch cache per session.",
  },
  {
    name: "MCP TypeScript SDK",
    status: "tooling-candidate",
    use: "Bun-runnable tool/context servers for docs, files, browser, and project state.",
    action: "Prefer official SDK for new Orangebox MCP servers.",
  },
  {
    name: "Goose",
    status: "verified-candidate",
    use: "Local desktop/CLI/API agent bridge with MCP extensions.",
    action: "Treat as optional executor lane, not hidden ruler.",
  },
  {
    name: "Continue Agent Mode",
    status: "verified-candidate",
    use: "Headless/code-agent comparison lane for local model tool use.",
    action: "Use as benchmark opponent or plugin lane after capability config.",
  },
  {
    name: "DeepSeek V4-Flash",
    status: "model-watch",
    use: "Fast 1M-context MoE candidate; not assumed local-ready on N150.",
    action: "Route to Codexa only after weight/runtime/VRAM proof.",
  },
  {
    name: "MiniMax M3",
    status: "model-watch",
    use: "1M-context multimodal coding candidate for visual/code translation.",
    action: "Visual lane can evaluate; Ops tracks benchmark receipts.",
  },
  {
    name: "Microsoft Agent Framework",
    status: "blocked-by-policy",
    use: "Semantic Kernel/AutoGen successor.",
    action: "Do not adopt unless operator explicitly overrides policy.",
  },
];

const defaultProject: LittleOrangeProject = {
  id: "orangebox",
  name: "Orangebox Ops",
  detail: "Backend rails, receipts, Codexa",
  status: "active",
  root: LITTLEORANGE_REPO_ROOT,
};

function makeMessage(role: LittleMessage["role"], content: string, patch: Partial<LittleMessage> = {}): LittleMessage {
  return {
    id: `lo-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
    status: "complete",
    ...patch,
  };
}

function railTone(state: RailProbe["state"]) {
  if (state === "online") return "is-online";
  if (state === "checking") return "is-checking";
  return "is-offline";
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(value);
}

function textValue(value: unknown, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function short(value: unknown, limit = 96) {
  const text = textValue(value, "");
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function currentRoute(snapshot: LittleOrangeSnapshot | null) {
  return (snapshot?.route?.current ?? undefined) as
    | {
        objective?: string;
        project?: string;
        route_id?: string;
        macro_actions?: Array<{ id?: string; label?: string; status?: string; owner?: string; proof?: string }>;
        department_route?: { primary_dept?: string; active_department_count?: number };
      }
    | undefined;
}

function activeProfile(snapshot: LittleOrangeSnapshot | null) {
  return (snapshot?.modelSwitch?.active_profile ?? undefined) as
    | { label?: string; default_model?: string; runnable_now?: boolean; availability?: { status?: string } }
    | undefined;
}

function activeBranch(snapshot: LittleOrangeSnapshot | null) {
  return textValue(snapshot?.git?.branch, "unknown");
}

export function LittleOrangeApp() {
  const [projects, setProjects] = useState<LittleOrangeProject[]>([defaultProject]);
  const [activeProject, setActiveProject] = useState<LittleOrangeProject>(defaultProject);
  const [rails, setRails] = useState<RailProbe[]>([
    { id: "api", label: "API", state: "checking", detail: "checking", url: littleOrangeEndpoints.apiHealth },
    { id: "command", label: "Command", state: "checking", detail: "checking", url: littleOrangeEndpoints.commandHealth },
    { id: "ops", label: "Ops", state: "checking", detail: "checking", url: littleOrangeEndpoints.status },
  ]);
  const [snapshot, setSnapshot] = useState<LittleOrangeSnapshot | null>(null);
  const [messages, setMessages] = useState<LittleMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolBusy, setToolBusy] = useState<string | null>(null);
  const [threadNote, setThreadNote] = useState("No project thread loaded yet.");
  const [deckTab, setDeckTab] = useState<DeckTab>("truth");
  const abortRef = useRef<AbortController | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const onlineCount = rails.filter((rail) => rail.state === "online").length;
  const hasAgentRail = rails.some((rail) => rail.id === "api" && rail.state === "online");
  const commandRailOnline = rails.some((rail) => rail.id === "command" && rail.state === "online");
  const canRun = input.trim().length > 0 && !busy;
  const route = currentRoute(snapshot);
  const profile = activeProfile(snapshot);
  const macroActions = route?.macro_actions ?? [];
  const treeItems = snapshot?.tree?.items ?? [];
  const receipts = snapshot?.receipts?.items ?? [];
  const tools = snapshot?.skills?.internal ?? [];
  const agentItems = snapshot?.agents?.items ?? [];

  const contextLine = useMemo(() => {
    const model = profile?.label || "model lane unknown";
    return `${activeProject.name} / ${onlineCount} of ${rails.length} rails online / ${model}`;
  }, [activeProject.name, onlineCount, profile?.label, rails.length]);

  async function refresh(showToolMessage = false) {
    setRails((current) => current.map((rail) => ({ ...rail, state: "checking", detail: "checking" })));
    const nextSnapshot = await loadLittleOrangeSnapshot(activeProject);
    setSnapshot(nextSnapshot);
    setProjects(nextSnapshot.projects);
    setRails(nextSnapshot.rails);
    setActiveProject((current) => nextSnapshot.projects.find((project) => project.id === current.id) ?? nextSnapshot.projects[0] ?? defaultProject);
    if (showToolMessage) {
      setMessages((current) => [
        ...current,
        makeMessage("tool", `Truth deck refreshed. Rails online: ${nextSnapshot.rails.filter((rail) => rail.state === "online").length}/${nextSnapshot.rails.length}.`),
      ]);
    }
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    void loadProjectThread(activeProject.id).then((thread) => {
      if (!alive) return;
      const count = Array.isArray((thread as { messages?: unknown[] } | undefined)?.messages)
        ? (thread as { messages: unknown[] }).messages.length
        : undefined;
      setThreadNote(count === undefined ? "Project thread unavailable." : `${count} thread events available.`);
    });
    void refresh();
    return () => {
      alive = false;
    };
  }, [activeProject.id]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  function scrollChat(direction: "up" | "down") {
    const target = chatRef.current;
    if (!target) return;
    const delta = Math.max(420, target.clientHeight * 0.86);
    target.scrollBy({ top: direction === "up" ? -delta : delta, behavior: "smooth" });
  }

  function setPreset(value: string) {
    setInput(value);
    inputRef.current?.focus();
  }

  function stopRun() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setMessages((current) => [...current, makeMessage("tool", "Run stopped locally.", { status: "complete" })]);
  }

  async function executeTool(action: "refresh" | "index" | "receipts" | "route" | "tools") {
    if (toolBusy) return;
    setToolBusy(action);
    try {
      if (action === "refresh") {
        await refresh(true);
        return;
      }
      if (action === "index") {
        const result = await runRepoIndex(activeProject.root || LITTLEORANGE_REPO_ROOT);
        setMessages((current) => [...current, makeMessage("tool", `${result.title}: ${result.detail}`, { status: result.ok ? "complete" : "error" })]);
        await refresh();
        return;
      }
      if (action === "receipts") {
        setDeckTab("receipts");
        await refresh(true);
        return;
      }
      if (action === "route") {
        setDeckTab("truth");
        setPreset("Use the live route spine and receipts to tell me the current objective, active lane, completed gates, open gaps, and next exact command.");
        return;
      }
      if (action === "tools") {
        setDeckTab("tools");
        setPreset("Use the LittleOrange tool belt. Pick the smallest Orangebox tool path for this task and explain what will be proof-backed before doing work.");
      }
    } finally {
      setToolBusy(null);
    }
  }

  async function send() {
    const command = input.trim();
    if (!command || busy) return;

    const userMessage = makeMessage("user", command);
    const assistantId = `lo-assistant-${Date.now()}`;
    const assistantMessage = makeMessage("assistant", "", { id: assistantId, status: "streaming", meta: "Routing through Orangebox API stream..." });
    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamLittleOrangeRun({
        command,
        project: activeProject,
        messages: nextMessages,
        signal: controller.signal,
        onMeta: (meta) => {
          setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, meta } : message)));
        },
        onToken: (token) => {
          setMessages((current) =>
            current.map((message) => (message.id === assistantId ? { ...message, content: `${message.content}${token}`, status: "streaming" } : message)),
          );
        },
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: message.content || "Orangebox returned no text output.", status: "complete", meta: "Receipt-backed run completed." }
            : message,
        ),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown run failure";
      const offlineHelp = hasAgentRail
        ? detail
        : "API rail is offline. Start Orangebox API or use this as a planning shell until the rail is back.";
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: offlineHelp,
                status: "error",
                meta: "Run did not complete.",
              }
            : message,
        ),
      );
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function copyPrimer() {
    const text = [
      "LittleOrange v2 session primer:",
      `Project: ${activeProject.name} (${activeProject.id})`,
      `Root: ${activeProject.root || LITTLEORANGE_REPO_ROOT}`,
      "Operate as Orangebox. Preserve receipts, proof, rollback, and scope.",
      "Use backend/Ops truth first. Keep visual work in the separate visual lane unless explicitly assigned.",
      `Route: ${short(route?.objective, 180)}`,
      `Rails: ${rails.map((rail) => `${rail.label}=${rail.state}`).join(", ")}`,
      `Model lane: ${profile?.label || "unknown"}`,
    ].join("\n");
    void navigator.clipboard?.writeText(text);
    setMessages((current) => [...current, makeMessage("tool", "Copied LittleOrange v2 primer to clipboard.")]);
  }

  return (
    <main className="littleorange" data-testid="littleorange-app">
      <aside className="littleorange__projects" aria-label="Recent projects">
        <div className="littleorange__brand">
          <span>LO</span>
          <div>
            <strong>LittleOrange</strong>
            <em>Custom Orangebox cockpit</em>
          </div>
        </div>

        <section className="littleorange__project-list">
          <header>
            <Folder size={16} />
            <span>Recent</span>
          </header>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={project.id === activeProject.id ? "is-active" : ""}
              onClick={() => setActiveProject(project)}
            >
              <strong>{project.name}</strong>
              <span>{project.detail}</span>
            </button>
          ))}
        </section>

        <section className="littleorange__rail-card">
          <header>
            <Activity size={16} />
            <span>Rails</span>
            <button type="button" aria-label="Refresh Orangebox rails" onClick={() => void refresh(true)}>
              <RefreshCcw size={14} />
            </button>
          </header>
          {rails.map((rail) => (
            <div key={rail.id} className={`littleorange__rail ${railTone(rail.state)}`}>
              {rail.state === "online" ? <Wifi size={15} /> : rail.state === "offline" ? <WifiOff size={15} /> : <RefreshCcw size={15} />}
              <span>{rail.label}</span>
              <em>{rail.latencyMs ? `${rail.latencyMs}ms` : rail.detail}</em>
            </div>
          ))}
        </section>
      </aside>

      <section className="littleorange__main">
        <header className="littleorange__topbar">
          <div>
            <span className="littleorange__eyebrow">LittleOrange v2 / independent Orangebox pieces</span>
            <h1>{activeProject.name}</h1>
          </div>
          <div className="littleorange__status-strip">
            <span className={hasAgentRail ? "is-good" : "is-warn"}>{hasAgentRail ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} Agent rail</span>
            <span className={commandRailOnline ? "is-good" : "is-warn"}><Terminal size={15} /> Command rail</span>
            <span><BrainCircuit size={15} /> {profile?.label || "Model lane unknown"}</span>
            <button type="button" onClick={copyPrimer}><Copy size={15} /> Primer</button>
          </div>
        </header>

        <section className="littleorange__truth-deck" aria-label="LittleOrange truth deck">
          <article>
            <GitBranch size={17} />
            <div>
              <span>Branch</span>
              <strong>{activeBranch(snapshot)}</strong>
            </div>
          </article>
          <article>
            <Route size={17} />
            <div>
              <span>Route</span>
              <strong>{short(route?.route_id || route?.project || "no route", 34)}</strong>
            </div>
          </article>
          <article>
            <ListChecks size={17} />
            <div>
              <span>Gates</span>
              <strong>{macroActions.filter((item) => item.status === "done").length}/{macroActions.length || 0} done</strong>
            </div>
          </article>
          <article>
            <FileText size={17} />
            <div>
              <span>Receipts</span>
              <strong>{receipts.length} loaded</strong>
            </div>
          </article>
          <article>
            <Wrench size={17} />
            <div>
              <span>Tools</span>
              <strong>{tools.length} internal</strong>
            </div>
          </article>
        </section>

        <div className="littleorange__workspace">
          <div className="littleorange__chat-wrap">
            <div className="littleorange__scroll-controls" aria-label="Chat scroll controls">
              <button type="button" aria-label="Scroll chat up" onClick={() => scrollChat("up")}>
                <ArrowUp size={48} strokeWidth={2.4} />
              </button>
              <button type="button" aria-label="Scroll chat down" onClick={() => scrollChat("down")}>
                <ArrowDown size={48} strokeWidth={2.4} />
              </button>
            </div>

            <div ref={chatRef} className="littleorange__chat" aria-label="Main chat screen">
              {messages.map((message) => (
                <article key={message.id} className={`littleorange__message littleorange__message--${message.role} ${message.status === "error" ? "is-error" : ""}`}>
                  <div className="littleorange__avatar" aria-hidden="true">
                    {message.role === "assistant" ? <Bot size={18} /> : message.role === "tool" ? <Terminal size={18} /> : message.role === "system" ? <ShieldCheck size={18} /> : "A"}
                  </div>
                  <div>
                    <header>
                      <strong>{message.role === "user" ? "Atom" : message.role === "assistant" ? "LittleOrange" : message.role === "tool" ? "Tool" : "System"}</strong>
                      <span>{formatTime(message.createdAt)}</span>
                    </header>
                    {message.meta ? <em>{message.meta}</em> : null}
                    <p>{message.content || (message.status === "streaming" ? "Working..." : "")}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="littleorange__side">
            <section className="littleorange__action-grid">
              <h2>Action Belt</h2>
              <button type="button" onClick={() => void executeTool("refresh")} disabled={Boolean(toolBusy)}>
                <RefreshCcw size={16} /> Refresh Truth
              </button>
              <button type="button" onClick={() => void executeTool("index")} disabled={Boolean(toolBusy)}>
                <Database size={16} /> Index Repo
              </button>
              <button type="button" onClick={() => void executeTool("route")} disabled={Boolean(toolBusy)}>
                <Route size={16} /> Route Read
              </button>
              <button type="button" onClick={() => void executeTool("receipts")} disabled={Boolean(toolBusy)}>
                <FileText size={16} /> Receipts
              </button>
              <button type="button" onClick={() => void executeTool("tools")} disabled={Boolean(toolBusy)}>
                <Wrench size={16} /> Tool Path
              </button>
            </section>

            <section>
              <h2>Fast Moves</h2>
              <div className="littleorange__presets">
                {commandPresets.map((preset) => (
                  <button key={preset.label} type="button" onClick={() => setPreset(preset.value)}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="littleorange__tabs">
              <h2>Live Pieces</h2>
              <div className="littleorange__tab-row">
                {(["truth", "files", "tools", "radar", "receipts"] as DeckTab[]).map((tab) => (
                  <button key={tab} type="button" className={deckTab === tab ? "is-active" : ""} onClick={() => setDeckTab(tab)}>
                    {tab}
                  </button>
                ))}
              </div>

              {deckTab === "truth" ? (
                <div className="littleorange__live-panel">
                  <p><strong>Objective</strong>{short(route?.objective || "No route objective loaded.", 220)}</p>
                  <p><strong>Thread</strong>{threadNote}</p>
                  <p><strong>Root</strong>{activeProject.root || LITTLEORANGE_REPO_ROOT}</p>
                  <p><strong>Queue</strong>{agentItems.length} in memory</p>
                  <div className="littleorange__mini-steps">
                    {macroActions.slice(0, 8).map((item) => (
                      <span key={item.id || item.label} className={item.status === "done" ? "is-done" : "is-open"}>
                        {item.label || item.id}: {item.status || "unknown"}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {deckTab === "files" ? (
                <div className="littleorange__file-list">
                  {treeItems.slice(0, 18).map((item) => (
                    <button key={item.rel_path} type="button" onClick={() => setPreset(`Inspect ${item.rel_path} in ${activeProject.name}. Explain what it does and whether it matters to the current task.`)}>
                      {item.type === "dir" ? <Folder size={14} /> : <Code2 size={14} />}
                      <span>{item.rel_path}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {deckTab === "tools" ? (
                <div className="littleorange__tool-list">
                  {tools.slice(0, 12).map((tool) => (
                    <button key={tool.name} type="button" onClick={() => setPreset(`Use the Orangebox ${tool.slash} path if appropriate. Task: `)}>
                      <Zap size={14} />
                      <span>{tool.title}</span>
                      <em>{tool.description}</em>
                    </button>
                  ))}
                  <p className="littleorange__small-note">
                    Deps: Node {textValue((snapshot?.deps?.node as { current?: string } | undefined)?.current, "not bundled")} / Hermes {textValue((snapshot?.deps?.hermes as { latest?: string } | undefined)?.latest, "unknown")}
                  </p>
                </div>
              ) : null}

              {deckTab === "radar" ? (
                <div className="littleorange__radar-list">
                  {upgradeRadar.map((item) => (
                    <button key={item.name} type="button" onClick={() => setPreset(`Evaluate ${item.name} for Orangebox. Use receipts, benchmarks, install risk, and whether it should be wired now or only tracked.`)}>
                      <Layers3 size={14} />
                      <span>{item.name}</span>
                      <strong>{item.status}</strong>
                      <em>{item.use} {item.action}</em>
                    </button>
                  ))}
                </div>
              ) : null}

              {deckTab === "receipts" ? (
                <div className="littleorange__receipt-list">
                  {receipts.map((receipt, index) => (
                    <button key={receipt.id || receipt.path || index} type="button" onClick={() => setPreset(`Use receipt ${receipt.id || receipt.title || index} as evidence. Summarize what it proves and what it does not prove.`)}>
                      <FileText size={14} />
                      <span>{receipt.title || receipt.source || receipt.id || "receipt"}</span>
                      <em>{short(receipt.summary || receipt.ts || receipt.path, 110)}</em>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section>
              <h2>Connection</h2>
              <dl>
                <div>
                  <dt>API</dt>
                  <dd>{littleOrangeEndpoints.apiBase}</dd>
                </div>
                <div>
                  <dt>Command</dt>
                  <dd>{littleOrangeEndpoints.commandBase}</dd>
                </div>
                <div>
                  <dt>Context</dt>
                  <dd>{contextLine}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>

        <footer className="littleorange__composer">
          <textarea
            ref={inputRef}
            value={input}
            aria-label="LittleOrange command"
            placeholder="Ask for code work, a project report, proof, route, repo inspection, or the next exact patch..."
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div>
            <span>{contextLine}</span>
            <div>
              <button type="button" className="littleorange__stop" disabled={!busy} onClick={stopRun}>
                <Square size={16} /> Stop
              </button>
              <button type="button" className="littleorange__send" disabled={!canRun} onClick={() => void send()}>
                <Send size={17} /> Send
              </button>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
