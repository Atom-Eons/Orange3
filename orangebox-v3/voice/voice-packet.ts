import path from "node:path";
import { argValue, dataRoot, isMain, sha256, stamp, writeJson, writeReceipt } from "../lib/core.ts";

export async function createVoicePacket(args = process.argv.slice(2)) {
  const packet = {
    ok: true,
    status: "SPATIAL_VOICE_PACKET_READY",
    chat_id: argValue(args, "--chat-id", ""),
    ide_context_id: argValue(args, "--ide-context-id", ""),
    cursor: {
      x: Number(argValue(args, "--x", "0")),
      y: Number(argValue(args, "--y", "0")),
    },
    target: {
      source: argValue(args, "--source", ""),
      component: argValue(args, "--component", ""),
      dom_id: argValue(args, "--dom-id", ""),
    },
    transcript: argValue(args, "--transcript", ""),
    visual_crop: argValue(args, "--crop", ""),
    cssom: {},
    risk: argValue(args, "--risk", "medium"),
    local_stt_required: true,
    cloud_stt_warrant_required: true,
    packet_hash: sha256(args.join("|")),
    created_at: new Date().toISOString(),
  };
  const file = path.join(dataRoot, "v3", "voice", `voice-packet-${stamp().toLowerCase()}.json`);
  await writeJson(file, packet);
  const receipt = await writeReceipt("spatial-voice-packet", { ...packet, packet_path: file });
  return { ...packet, packet_path: file, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  createVoicePacket().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "SPATIAL_VOICE_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
