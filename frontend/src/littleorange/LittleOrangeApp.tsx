import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  Copy,
  Folder,
  RefreshCcw,
  Send,
  ShieldCheck,
  Square,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../types/app";
import {
  littleOrangeEndpoints,
  loadProjectThread,
  loadProjects,
  probeOrangeboxRails,
  streamLittleOrangeRun,
  type LittleOrangeProject,
  type RailProbe,
} from "./littleOrangeClient";

type MessageStatus = "complete" | "streaming" | "error";

interface LittleMessage extends ChatMessage {
  meta?: string;
  status?: MessageStatus;
}

const starterMessages: LittleMessage[] = [
  {
    id: "lo-system",
    role: "system",
    content: "LittleOrange online. Pick a project, ask for code work, and keep the proof rails visible.",
    createdAt: Date.now(),
    status: "complete",
  },
];

const commandPresets = [
  {
    label: "Health",
    value: "Give me the current Orangebox health in plain English. Separate local, Codexa, models, receipts, and blockers.",
  },
  {
    label: "Project",
    value: "Produce a full project report for the selected Orangebox project. Include real status, next action, and proof path.",
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
];

const defaultProject: LittleOrangeProject = {
  id: "orangebox",
  name: "Orangebox Ops",
  detail: "Backend rails, receipts, Codexa",
  status: "active",
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

export function LittleOrangeApp() {
  const [projects, setProjects] = useState<LittleOrangeProject[]>([defaultProject]);
  const [activeProject, setActiveProject] = useState<LittleOrangeProject>(defaultProject);
  const [rails, setRails] = useState<RailProbe[]>([
    { id: "api", label: "API", state: "checking", detail: "checking", url: littleOrangeEndpoints.apiHealth },
    { id: "command", label: "Command", state: "checking", detail: "checking", url: littleOrangeEndpoints.commandHealth },
    { id: "ops", label: "Ops", state: "checking", detail: "checking", url: littleOrangeEndpoints.status },
  ]);
  const [messages, setMessages] = useState<LittleMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadNote, setThreadNote] = useState("No project thread loaded yet.");
  const abortRef = useRef<AbortController | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const onlineCount = rails.filter((rail) => rail.state === "online").length;
  const hasAgentRail = rails.some((rail) => rail.id === "api" && rail.state === "online");
  const canRun = input.trim().length > 0 && !busy;

  const contextLine = useMemo(() => {
    return `${activeProject.name} / ${onlineCount} of ${rails.length} rails online / ${hasAgentRail ? "agent stream ready" : "local draft mode"}`;
  }, [activeProject.name, hasAgentRail, onlineCount, rails.length]);

  async function refresh() {
    setRails((current) => current.map((rail) => ({ ...rail, state: "checking", detail: "checking" })));
    const [loadedProjects, railResults] = await Promise.all([loadProjects(), probeOrangeboxRails()]);
    setProjects(loadedProjects);
    setRails(railResults);
    setActiveProject((current) => loadedProjects.find((project) => project.id === current.id) ?? loadedProjects[0] ?? defaultProject);
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
    const delta = Math.max(360, target.clientHeight * 0.82);
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

  async function send() {
    const command = input.trim();
    if (!command || busy) return;

    const userMessage = makeMessage("user", command);
    const assistantId = `lo-assistant-${Date.now()}`;
    const assistantMessage = makeMessage("assistant", "", { id: assistantId, status: "streaming", meta: "Routing through Orangebox..." });
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
      "LittleOrange session primer:",
      `Project: ${activeProject.name} (${activeProject.id})`,
      "Operate as Orangebox. Preserve receipts, proof, rollback, and scope.",
      "Use backend/Ops truth first. Keep visual work in the separate visual lane unless explicitly assigned.",
      `Rails: ${rails.map((rail) => `${rail.label}=${rail.state}`).join(", ")}`,
    ].join("\n");
    void navigator.clipboard?.writeText(text);
    setMessages((current) => [...current, makeMessage("tool", "Copied LittleOrange primer to clipboard.")]);
  }

  return (
    <main className="littleorange" data-testid="littleorange-app">
      <aside className="littleorange__projects" aria-label="Recent projects">
        <div className="littleorange__brand">
          <span>LO</span>
          <div>
            <strong>LittleOrange</strong>
            <em>Orangebox code chat</em>
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
            <button type="button" aria-label="Refresh Orangebox rails" onClick={() => void refresh()}>
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
            <span className="littleorange__eyebrow">CortexIDE-inspired / Orangebox-connected</span>
            <h1>{activeProject.name}</h1>
          </div>
          <div className="littleorange__status-strip">
            <span className={hasAgentRail ? "is-good" : "is-warn"}>{hasAgentRail ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} Agent rail</span>
            <span><ShieldCheck size={15} /> {threadNote}</span>
            <button type="button" onClick={copyPrimer}><Copy size={15} /> Primer</button>
          </div>
        </header>

        <div className="littleorange__workspace">
          <div className="littleorange__chat-wrap">
            <div className="littleorange__scroll-controls" aria-label="Chat scroll controls">
              <button type="button" aria-label="Scroll chat up" onClick={() => scrollChat("up")}>
                <ArrowUp size={42} strokeWidth={2.4} />
              </button>
              <button type="button" aria-label="Scroll chat down" onClick={() => scrollChat("down")}>
                <ArrowDown size={42} strokeWidth={2.4} />
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
            placeholder="Ask for code work, a project report, proof, or the next exact patch..."
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
