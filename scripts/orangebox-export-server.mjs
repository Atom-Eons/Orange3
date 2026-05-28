import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const exportRoot = path.resolve(process.argv[2] || "C:/AtomEons/aeskills/orangebox/exports");
const host = process.argv[3] || "0.0.0.0";
const port = Number(process.argv[4] || 8790);

function send(res, code, body, type = "text/plain") {
  res.writeHead(code, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store",
    "x-orangebox-export": "installer-only"
  });
  res.end(body);
}

function mimeFor(file) {
  if (file.endsWith(".zip")) return "application/zip";
  if (file.endsWith(".cmd") || file.endsWith(".ps1") || file.endsWith(".txt") || file.endsWith(".md")) return "text/plain";
  if (file.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const files = await fs.readdir(exportRoot);
      const links = files
        .filter((name) => name.endsWith(".zip"))
        .map((name) => `<li><a href="/${encodeURIComponent(name)}">${name}</a></li>`)
        .join("\n");
      return send(res, 200, `<!doctype html><title>OrangeBOX Exports</title><h1>OrangeBOX Codexa Installers</h1><ul>${links}</ul>`, "text/html");
    }
    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!rel || rel.includes("/") || rel.includes("\\")) return send(res, 403, "forbidden");
    const target = path.resolve(exportRoot, rel);
    if (!target.startsWith(exportRoot)) return send(res, 403, "forbidden");
    const bytes = await fs.readFile(target);
    res.writeHead(200, {
      "content-type": mimeFor(target),
      "content-length": bytes.length,
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${path.basename(target)}"`
    });
    res.end(bytes);
  } catch (error) {
    send(res, 404, `not found: ${error.message}`);
  }
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ status: "VERIFIED", exportRoot, host, port }, null, 2));
});
