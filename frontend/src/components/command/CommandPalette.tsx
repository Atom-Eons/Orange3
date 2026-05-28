import { AnimatePresence, motion } from "motion/react";
import { Bot, Brain, Database, PanelTop, Search, Wrench, Zap } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { getCommandPaletteActions, searchCommandPaletteActions, type CommandPaletteAction } from "../../engine/commandPaletteRegistry";
import { useKeyboardRovingIndex } from "../../hooks/useKeyboardRovingIndex";
import { useAppStore } from "../../store/useAppStore";

const iconByKind = { panel: PanelTop, mode: Zap, workspace: PanelTop, agent: Bot, memory: Brain, tool: Wrench, debug: Database, run: Zap };

const state26ActionCopy: Array<{ id: string; title: string; subtitle: string }> = [
  { id: "simulate-latency", title: "Simulate latency anomaly", subtitle: "Alert + causality" },
  { id: "focus-causality", title: "Focus Causal Insights", subtitle: "Panel context" },
  { id: "generate-deployment-report", title: "Generate deployment report", subtitle: "Artifact" },
  { id: "open-agent-queue", title: "Open Agent Queue", subtitle: "Drawer" },
  { id: "clear-causality", title: "Clear causality", subtitle: "Return calm" },
  { id: "mode-analyzing", title: "Mode: Understand", subtitle: "Analyze" },
];

function getState26Actions(): CommandPaletteAction[] {
  const actions = new Map(getCommandPaletteActions().map((action) => [action.id, action]));
  return state26ActionCopy.flatMap(({ id, title, subtitle }) => {
    const action = actions.get(id);
    return action ? [{ ...action, title, subtitle }] : [];
  });
}

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const query = useAppStore((s) => s.commandPaletteQuery);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setQuery = useAppStore((s) => s.setCommandPaletteQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isState26 = activeMockupStateId === "26";
  const actions = useMemo(
    () => (isState26 ? getState26Actions() : searchCommandPaletteActions(query)),
    [isState26, query],
  );
  const { activeIndex, setActiveIndex, getItemProps } = useKeyboardRovingIndex({ itemCount: actions.length, onConfirm: (index) => actions[index]?.run(), onEscape: () => setOpen(false) });

  useEffect(() => {
    if (!open) return;

    window.setTimeout(() => {
      if (isState26) return;
      inputRef.current?.focus();
    }, 30);
  }, [isState26, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="command-palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setOpen(false)}>
          <motion.section className="command-palette glass neon-edge" role="dialog" aria-modal="true" aria-label="Command palette" initial={{ opacity: 0, y: 18, scale: 0.96, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, y: 18, scale: 0.96, filter: "blur(8px)" }} onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-palette__title">
              <strong>Command Palette</strong>
              <span>Global command surface for navigation and actions</span>
            </div>

            <header className={`command-palette__search ${isState26 ? "command-palette__search--state-26" : ""}`}>
              {isState26 ? (
                <span className="command-palette__state-query">
                  <b>Cmd K</b>
                  <span>{query}</span>
                </span>
              ) : (
                <>
                  <Search size={18} />
                  <input
                    ref={inputRef}
                    aria-label="Search commands"
                    value={query}
                    placeholder="Command the workspace..."
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setOpen(false);
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActiveIndex((current) => Math.min(actions.length - 1, current + 1));
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActiveIndex((current) => Math.max(0, current - 1));
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        actions[activeIndex]?.run();
                      }
                    }}
                  />
                  <kbd>Cmd K</kbd>
                </>
              )}
            </header>
            <div className="command-palette__list" role="listbox">
              {actions.map((action, index) => {
                const Icon = iconByKind[action.kind] ?? Zap;
                return (
                  <button key={action.id} type="button" className={index === activeIndex ? "is-active" : ""} {...getItemProps(index)} onMouseEnter={() => setActiveIndex(index)} onClick={() => action.run()}>
                    <span className="command-palette__item-icon"><Icon size={16} /></span>
                    <span className="command-palette__item-copy"><strong>{action.title}</strong>{action.subtitle ? <em>{action.subtitle}</em> : null}</span>
                    {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
                  </button>
                );
              })}
              {actions.length === 0 ? <div className="command-palette__empty">No matching command.</div> : null}
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
