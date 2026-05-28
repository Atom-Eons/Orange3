import { AlertTriangle, Brain, Clock, FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { DrawerShell } from "./DrawerShell";

function iconForType(type: string) {
  if (type === "alert") return AlertTriangle;
  if (type === "memory") return Brain;
  if (type === "deployment") return FileText;
  return Clock;
}

export function MemoryBrowserDrawer() {
  const timeline = useAppStore((s) => s.timeline);
  const messages = useAppStore((s) => s.messages);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const setComposerValue = useAppStore((s) => s.setComposerValue);
  const setContextPanels = useAppStore((s) => s.setContextPanels);
  const focusPanel = useAppStore((s) => s.focusPanel);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"timeline" | "conversation">("timeline");
  const filteredTimeline = useMemo(() => timeline.slice().reverse().filter((event) => !query || `${event.title} ${event.description ?? ""} ${event.type}`.toLowerCase().includes(query.toLowerCase())), [timeline, query]);
  const filteredMessages = useMemo(() => messages.slice().reverse().filter((message) => !query || message.content.toLowerCase().includes(query.toLowerCase())), [messages, query]);
  const sourceCompact = activeMockupStateId === "38";

  return (
    <DrawerShell drawerId="memory" title="Memory Browser" subtitle="Timeline, conversation, and recall" width={520}>
      {!sourceCompact ? (
        <>
          <div className="memory-browser__search"><Search size={15} /><input value={query} placeholder="Search memory..." onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="memory-browser__tabs"><button type="button" className={scope === "timeline" ? "is-active" : ""} onClick={() => setScope("timeline")}>Timeline</button><button type="button" className={scope === "conversation" ? "is-active" : ""} onClick={() => setScope("conversation")}>Conversation</button></div>
        </>
      ) : null}

      <div className="memory-browser__list">
        {scope === "timeline"
          ? filteredTimeline.map((event) => {
              const Icon = iconForType(event.type);
              return (
                <article key={event.id} className={`memory-card memory-card--${event.severity}`}>
                  <span className="memory-card__icon"><Icon size={16} /></span>
                  <div><header><strong>{event.title}</strong><em>{event.timeLabel} · {event.severity}</em></header>{event.description ? <p>{event.description}</p> : null}{!sourceCompact ? <footer>{event.relatedPanelIds.slice(0, 4).map((panelId) => <button key={panelId} type="button" onClick={() => { focusPanel(panelId); setContextPanels(event.relatedPanelIds); }}>{panelId}</button>)}<button type="button" onClick={() => { setContextPanels(event.relatedPanelIds); setComposerValue(`/timeline explain "${event.title}"`); }}>Explain</button></footer> : null}</div>
                  {sourceCompact ? <button className="memory-card__action" type="button" onClick={() => { setContextPanels(event.relatedPanelIds); setComposerValue(`/timeline explain "${event.title}"`); }}>Explain</button> : null}
                </article>
              );
            })
          : filteredMessages.map((message) => (
              <article key={message.id} className="memory-card">
                <span className="memory-card__icon"><Brain size={16} /></span>
                <div><header><strong>{message.role}</strong><em>{new Date(message.createdAt).toLocaleTimeString()}</em></header><p>{message.content || "Empty message"}</p><footer><button type="button" onClick={() => setComposerValue(`Continue from: ${message.content.slice(0, 120)}`)}>Continue</button></footer></div>
              </article>
            ))}
      </div>
    </DrawerShell>
  );
}
