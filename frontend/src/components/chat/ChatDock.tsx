import { Bot, ChevronDown, Paperclip, Send, Square, WandSparkles } from "lucide-react";
import { useRef } from "react";
import { cancelActiveRun, handleSubmitCommand } from "../../engine/taskRunner";
import { useAutoResizeTextarea } from "../../hooks/useAutoResizeTextarea";
import { useAppStore } from "../../store/useAppStore";

const modes: Array<"fast" | "deep" | "creative" | "code" | "agent"> = ["fast", "deep", "creative", "code", "agent"];
const tools = ["tools", "files", "memory", "context"];

export function ChatDock() {
  const composer = useAppStore((s) => s.composer);
  const expanded = useAppStore((s) => s.chatDockExpanded);
  const setChatDockExpanded = useAppStore((s) => s.setChatDockExpanded);
  const tasks = useAppStore((s) => s.tasks);
  const active = tasks.some((task) => ["queued", "planning", "running", "waiting"].includes(task.status));
  return (
    <section className={`chat-dock glass neon-edge ${expanded ? "is-expanded" : "is-compact"}`}>
      <header className="chat-dock__tabs">
        {["New Chat", "History", "Code", "Reports", "Canvas"].map((tab) => <button key={tab} type="button" className="chat-tab">{tab}</button>)}
        <span />
        <button type="button" className="chat-tab" onClick={() => setChatDockExpanded(!expanded)}>{expanded ? "Compact" : "Expand"}</button>
        <button type="button" className="chat-run" onClick={() => handleSubmitCommand(composer.value || composer.planPreview?.userCommand || "")}><Send size={15} />Run</button>
        <button type="button" className="chat-stop" disabled={!active} onClick={cancelActiveRun}><Square size={13} />Stop</button>
      </header>
      {composer.planPreview ? <PlanPreview /> : null}
      <ChatTranscript />
      <div className="chat-dock__main">
        <ContextChips />
        <Composer />
        {composer.slashMenuOpen ? <SlashCommandMenu /> : null}
        <ToolChips />
        <CommandHints />
      </div>
      <AgentQueue />
    </section>
  );
}

function PlanPreview() {
  const plan = useAppStore((s) => s.composer.planPreview);
  if (!plan) return null;
  return (
    <div className="plan-preview">
      <strong>{plan.summary}</strong>
      <div>{plan.steps.map((step) => <span key={step.id} className={`step-${step.status}`}>{step.label}</span>)}</div>
    </div>
  );
}

const SYNESTHETIC_COLORS = ["#2ffcff", "#8b5cff", "#ffbf48", "#ff5c8d", "#00ff9d"];

function SynestheticText({ text }: { text: string }) {
  if (!text) return null;
  const words = text.split(/(\s+)/);
  return (
    <>
      {words.map((word, i) => {
        if (!word.trim()) return <span key={i}>{word}</span>;
        const hash = Array.from(word).reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const color = SYNESTHETIC_COLORS[hash % SYNESTHETIC_COLORS.length];
        return (
          <span
            key={i}
            style={{
              color,
              textShadow: `0 0 8px ${color}80, 0 0 2px ${color}`,
              transition: "all 0.3s ease-in-out"
            }}
          >
            {word}
          </span>
        );
      })}
    </>
  );
}

function ChatTranscript() {
  const messages = useAppStore((s) => s.messages);
  return (
    <div className="chat-transcript">
      {messages.slice(-5).map((message) => (
        <article key={message.id} className={`chat-message chat-message--${message.role}`}>
          <span className="chat-message__avatar">{message.role === "user" ? "U" : message.role === "tool" ? "T" : <Bot size={13} />}</span>
          <div className="chat-message__body">
            <p>
              {message.content ? <SynestheticText text={message.content} /> : (message.status === "streaming" ? "Thinking..." : "")}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

function ContextChips() {
  const context = useAppStore((s) => s.composer.contextPanelIds);
  const setContextPanels = useAppStore((s) => s.setContextPanels);
  return (
    <div className="context-chips">
      {context.map((panelId) => <button key={panelId} type="button" onClick={() => setContextPanels(context.filter((id) => id !== panelId))}>{panelId} x</button>)}
    </div>
  );
}

function Composer() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const value = useAppStore((s) => s.composer.value);
  const selectedMode = useAppStore((s) => s.composer.selectedMode);
  const selectedTools = useAppStore((s) => s.composer.selectedTools);
  const context = useAppStore((s) => s.composer.contextPanelIds);
  const setComposerValue = useAppStore((s) => s.setComposerValue);
  const setComposerFocus = useAppStore((s) => s.setComposerFocus);
  useAutoResizeTextarea(textareaRef, value);
  return (
    <div className="composer">
      <div className="composer-meta"><span>{context.length} context panels</span><span>{selectedTools.length} tools</span><span>{selectedMode}</span></div>
      <textarea
        ref={textareaRef}
        className="composer__textarea"
        aria-label="Chat command input"
        placeholder="Ask AE See-Suite anything..."
        value={value}
        onFocus={() => setComposerFocus(true)}
        onBlur={() => setComposerFocus(false)}
        onChange={(event) => setComposerValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSubmitCommand(value);
          }
        }}
      />
      <div className="composer__actions">
        <button type="button" aria-label="Attach file"><Paperclip size={16} /></button>
        <button type="button" aria-label="Send command" onClick={() => handleSubmitCommand(value)}><Send size={16} /></button>
      </div>
    </div>
  );
}

function SlashCommandMenu() {
  const setComposerValue = useAppStore((s) => s.setComposerValue);
  const commands = ["/analyze latency", "/generate deployment report", "/simulate deployment", "/compare model versions"];
  return (
    <div className="slash-menu">
      {commands.map((command) => <button key={command} type="button" onClick={() => setComposerValue(command)}>{command}</button>)}
    </div>
  );
}

function ToolChips() {
  const selectedMode = useAppStore((s) => s.composer.selectedMode);
  const selectedTools = useAppStore((s) => s.composer.selectedTools);
  const setSelectedMode = useAppStore((s) => s.setSelectedMode);
  const setMode = useAppStore((s) => s.setMode);
  const toggleTool = useAppStore((s) => s.toggleTool);
  return (
    <div className="tool-chips">
      <button type="button" className="model-chip">GPT-5.5 <ChevronDown size={13} /></button>
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          className={selectedMode === mode ? "is-active" : ""}
          onClick={() => {
            setSelectedMode(mode);
            if (mode === "creative") setMode("generating");
            if (mode === "code") setMode("reviewing");
            if (mode === "agent") setMode("thinking");
            if (mode === "deep") setMode("analyzing");
            if (mode === "fast") setMode("calm");
          }}
        >
          {mode}
        </button>
      ))}
      {tools.map((tool) => <button key={tool} type="button" className={selectedTools.includes(tool) ? "is-active" : ""} onClick={() => toggleTool(tool)}>{tool}</button>)}
    </div>
  );
}

function CommandHints() {
  const setComposerValue = useAppStore((s) => s.setComposerValue);
  const hints = ["Why is latency high in us-east-1?", "/generate deployment report", "/simulate deployment risk"];
  return (
    <div className="command-hints">
      <WandSparkles size={14} />
      {hints.map((hint) => <button key={hint} type="button" onClick={() => setComposerValue(hint)}>{hint}</button>)}
    </div>
  );
}

function AgentQueue() {
  const tasks = useAppStore((s) => s.tasks);
  const agents = useAppStore((s) => s.agents);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const activeAgents = agents.filter((agent) => ["thinking", "working", "blocked"].includes(agent.state)).length;
  const activeTasks = tasks.filter((task) => ["queued", "planning", "running", "waiting"].includes(task.status)).length;
  return (
    <footer className="agent-queue-bar">
      <span>{activeAgents} Agents Active</span>
      <span>{activeTasks} Tasks Running</span>
      <button type="button" onClick={() => setDrawerOpen("agent-queue")}>View Queue</button>
    </footer>
  );
}
