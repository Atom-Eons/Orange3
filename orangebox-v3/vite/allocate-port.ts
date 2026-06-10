import net from "node:net";
import { argValue, isMain, writeReceipt } from "../lib/core.ts";

function isOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

export async function allocatePort(args = process.argv.slice(2)) {
  const start = Number(argValue(args, "--start", "5273"));
  const end = Number(argValue(args, "--end", "5373"));
  let selected: number | null = null;
  for (let port = start; port <= end; port++) {
    if (await isOpen(port)) {
      selected = port;
      break;
    }
  }
  const report = {
    ok: selected !== null,
    status: selected !== null ? "SHADOW_VITE_PORT_ALLOCATED" : "SHADOW_VITE_PORT_UNAVAILABLE",
    selected_port: selected,
    range: { start, end },
  };
  const receipt = await writeReceipt("shadow-vite-port", report);
  return { ...report, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  allocatePort().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "SHADOW_VITE_PORT_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
