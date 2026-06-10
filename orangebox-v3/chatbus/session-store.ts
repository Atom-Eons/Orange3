import path from "node:path";
import { appendJsonl, argValue, dataRoot, isMain, readTextAsync, safeId, sha256, stamp, writeJson, writeReceipt } from "../lib/core.ts";

const root = path.join(dataRoot, "v3", "chatbus");

export async function appendChatEvent(args = process.argv.slice(2)) {
  const chatId = argValue(args, "--chat-id", "default");
  const event = {
    event_id: `turn_${stamp().toLowerCase()}_${sha256(args.join("|")).slice(0, 8)}`,
    chat_id: chatId,
    turn_id: argValue(args, "--turn-id", ""),
    ide_context_id: argValue(args, "--ide-context-id", ""),
    executor_context_id: argValue(args, "--executor-context-id", ""),
    ghost_id: argValue(args, "--ghost-id", ""),
    model_lane: argValue(args, "--model-lane", ""),
    receipt_ids: args.filter((item, i) => args[i - 1] === "--receipt-id"),
    artifact_ids: args.filter((item, i) => args[i - 1] === "--artifact-id"),
    active_file: argValue(args, "--active-file", ""),
    active_selection: argValue(args, "--active-selection", ""),
    target_dom_id: argValue(args, "--target-dom-id", ""),
    message: argValue(args, "--message", ""),
    created_at: new Date().toISOString(),
  };
  const file = path.join(root, `${safeId(chatId)}.jsonl`);
  await appendJsonl(file, event);
  await writeJson(path.join(root, "latest-event.json"), event);
  const receipt = await writeReceipt("chatbus-event", { ok: true, status: "CHATBUS_EVENT_APPENDED", event, event_log: file });
  return { ok: true, status: "CHATBUS_EVENT_APPENDED", event, event_log: file, receipt_path: receipt.receipt_path };
}

export async function replayChat(args = process.argv.slice(2)) {
  const chatId = argValue(args, "--chat-id", "default");
  const file = path.join(root, `${safeId(chatId)}.jsonl`);
  const raw = await readTextAsync(file, "");
  const events = raw.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  return { ok: true, status: "CHATBUS_REPLAY_READY", chat_id: chatId, event_count: events.length, events };
}

export async function compactChat(args = process.argv.slice(2)) {
  const replay = await replayChat(args);
  const events = (replay as any).events || [];
  const summary = {
    chat_id: (replay as any).chat_id,
    event_count: events.length,
    latest_event: events[events.length - 1] || null,
    receipt_ids: [...new Set(events.flatMap((e: any) => e.receipt_ids || []))],
    ghost_ids: [...new Set(events.map((e: any) => e.ghost_id).filter(Boolean))],
    model_lanes: [...new Set(events.map((e: any) => e.model_lane).filter(Boolean))],
    compacted_at: new Date().toISOString(),
  };
  const file = path.join(root, `${safeId(summary.chat_id || "default")}.compact.json`);
  await writeJson(file, summary);
  const receipt = await writeReceipt("chatbus-compact", { ok: true, status: "CHATBUS_COMPACT_READY", summary, compact_path: file });
  return { ok: true, status: "CHATBUS_COMPACT_READY", summary, compact_path: file, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const cmd = args[0] || "append";
  const fn = cmd === "replay" ? replayChat : cmd === "compact" ? compactChat : appendChatEvent;
  fn(args.slice(1)).then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "CHATBUS_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
