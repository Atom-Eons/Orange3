/* reasoning-extractor.mjs — v6.0.8 pull "thinking" content from Anthropic
   adaptive-thinking responses so the cockpit can display reasoning live.
   Works with both raw streaming events (content_block_delta) and rawContent[]
   arrays from /api/v4/model/call. */

// Given anthropic rawContent (array of {type, text, thinking, ...}), pluck the thinking blocks.
export function extractThinkingFromRaw(rawContent) {
  if (!Array.isArray(rawContent)) return { thinking_text: "", text: "", blocks: [] };
  const thinking = [];
  const text = [];
  for (const block of rawContent) {
    if (block.type === "thinking") {
      thinking.push(block.thinking || block.text || "");
    } else if (block.type === "text") {
      text.push(block.text || "");
    }
  }
  return {
    thinking_text: thinking.join("\n\n"),
    text:          text.join("\n\n"),
    blocks:        rawContent.map(b => ({ type: b.type, length: (b.thinking || b.text || "").length })),
  };
}

// Parse SSE stream chunks for thinking deltas during streaming.
// Anthropic streams: { type: "content_block_start", content_block: { type: "thinking" } }
// then { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "..." } }.
export function makeStreamThinkingCollector() {
  let currentBlockIsThinking = false;
  const buf = { thinking: "", text: "" };
  return {
    onEvent(event) {
      if (!event || typeof event !== "object") return;
      if (event.type === "content_block_start") {
        currentBlockIsThinking = event.content_block?.type === "thinking";
        return;
      }
      if (event.type === "content_block_delta") {
        const d = event.delta || {};
        if (d.type === "thinking_delta" && typeof d.thinking === "string") {
          buf.thinking += d.thinking;
        } else if (d.type === "text_delta" && typeof d.text === "string") {
          buf.text += d.text;
        }
        return;
      }
      if (event.type === "content_block_stop") {
        currentBlockIsThinking = false;
      }
    },
    snapshot() { return { thinking: buf.thinking, text: buf.text }; },
  };
}
