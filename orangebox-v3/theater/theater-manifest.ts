import { isMain, writeReceipt } from "../lib/core.ts";

export async function theaterManifest() {
  const report = {
    ok: true,
    status: "CORTEX_THEATER_MANIFEST_READY",
    surfaces: [
      "Mission Opening",
      "Model Lane Lights",
      "Ghost Worktree Stage",
      "Retina Loop Playback",
      "STRONGARM Pressure Gate",
      "Chronos Timeline",
      "Receipt Seal",
      "Rollback Lever",
      "Rebel Swarm View",
      "Operator Voice Mode",
    ],
    aesthetic: ["OLED black", "amber/orange signal language", "lucide icons", "crisp motion", "premium technical theater"],
    rule: "Theater explains complex agent work; it never hides proof state.",
  };
  const receipt = await writeReceipt("theater-manifest", report);
  return { ...report, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  theaterManifest().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "THEATER_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
