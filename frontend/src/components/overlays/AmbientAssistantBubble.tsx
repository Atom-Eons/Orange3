import { Bot } from "lucide-react";
import { motion } from "motion/react";
import { useAppStore } from "../../store/useAppStore";

export function AmbientAssistantBubble() {
  const mode = useAppStore((s) => s.mode);
  const tasks = useAppStore((s) => s.tasks);
  const activeCausalPath = useAppStore((s) => s.activeCausalPath);
  const setComposerValue = useAppStore((s) => s.setComposerValue);
  const running = tasks.some((task) => ["queued", "planning", "running", "waiting"].includes(task.status));
  const text = activeCausalPath ? "I found a causal trail." : running ? "Agents are working." : mode === "listening" ? "I am listening." : "I am learning in real time.";
  return (
    <motion.button className="ambient-assistant-bubble" type="button" onClick={() => setComposerValue("What should I look at next?")} initial={{ opacity: 0, scale: 0.82 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ scale: 1.06 }}>
      <span className="ambient-assistant-bubble__orb">
        <span className="ambient-assistant-bubble__lobe ambient-assistant-bubble__lobe--left" />
        <span className="ambient-assistant-bubble__lobe ambient-assistant-bubble__lobe--right" />
        <Bot size={24} />
      </span>
      <span>{text}</span>
    </motion.button>
  );
}
