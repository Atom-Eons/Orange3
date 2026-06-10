import fs from "node:fs";
import path from "node:path";
import { argValue, dataRoot, isMain, sha256, stamp, writeJson, writeReceipt } from "../lib/core.ts";

export async function makeVisionPacket(args = process.argv.slice(2)) {
  const url = argValue(args, "--url", "");
  const screenshot = argValue(args, "--screenshot", "");
  const source = argValue(args, "--source", "");
  const packet = {
    ok: true,
    status: "OMNIVISION_PACKET_READY",
    created_at: new Date().toISOString(),
    url,
    screenshot_path: screenshot,
    screenshot_exists: screenshot ? fs.existsSync(screenshot) : false,
    source_target: source,
    bounding_boxes: [],
    computed_cssom: {},
    accessibility_snapshot: {},
    motion_trace: null,
    r3f_scene_graph: null,
    design_expectations: [],
    exact_patch_targets: source ? [source] : [],
    packet_hash: sha256(JSON.stringify({ url, screenshot, source, t: stamp() })),
  };
  const file = path.join(dataRoot, "v3", "vision", `vision-packet-${stamp().toLowerCase()}.json`);
  await writeJson(file, packet);
  const receipt = await writeReceipt("omnivision-packet", { ...packet, packet_path: file });
  return { ...packet, packet_path: file, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  makeVisionPacket().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "OMNIVISION_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
