import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const NODE = process.execPath;

function normalizeForCompare(value) {
  return path.resolve(value).toLowerCase();
}

function assertReadableSourcePath(file, allowedRoots) {
  const resolved = path.resolve(file);
  const lowered = normalizeForCompare(resolved);
  const allowed = allowedRoots.some((root) => lowered.startsWith(normalizeForCompare(root) + path.sep.toLowerCase()) || lowered === normalizeForCompare(root));
  if (!allowed) throw new Error(`AtomSmasher source path denied: ${resolved}`);
  if (!fsSync.existsSync(resolved)) throw new Error(`AtomSmasher source path missing: ${resolved}`);
  return resolved;
}

function numberList(value) {
  if (Array.isArray(value)) return value.map(Number).filter((item) => Number.isFinite(item));
  return String(value || "").split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
}

export function attachAtomSmasherRoutes({ appRoot, getDataRoot, send, readBody }) {
  const script = path.join(appRoot, "scripts", "v4", "atomsmasher-runtime.mjs");
  const dataRoot = () => getDataRoot?.() || process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");

  async function runtime(command, extraArgs = [], { timeout = 180_000 } = {}) {
    const { stdout } = await execFileAsync(NODE, [script, command, "--json", "--no-receipt", ...extraArgs], {
      cwd: appRoot,
      env: { ...process.env, ORANGEBOX_DATA_ROOT: dataRoot() },
      timeout,
      maxBuffer: 20_000_000,
      windowsHide: true,
    });
    return JSON.parse(stdout || "{}");
  }

  async function tempTextFile(title, text) {
    const dir = path.join(dataRoot(), "atomsmasher", "api-tmp");
    await fs.mkdir(dir, { recursive: true });
    const safe = String(title || "source").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "source";
    const file = path.join(dir, `${Date.now()}-${safe}.txt`);
    await fs.writeFile(file, String(text || ""), "utf8");
    return file;
  }

  return async function handleAtomSmasher(req, res, url) {
    if (!url.pathname.startsWith("/api/atomsmasher")) return false;
    try {
      const suffix = url.pathname.slice("/api/atomsmasher".length) || "/";
      if (req.method === "POST" && suffix === "/init") return send(res, 200, await runtime("init"));
      if (req.method === "GET" && suffix === "/proof") return send(res, 200, await runtime("proof"));
      if (req.method === "GET" && suffix === "/doctor") return send(res, 200, await runtime("doctor", [], { timeout: 240_000 }));
      if (req.method === "GET" && suffix === "/orders") return send(res, 200, await runtime("orders"));
      if (req.method === "GET" && suffix === "/heat") return send(res, 200, await runtime("heat"));
      if (req.method === "GET" && suffix === "/coverage") return send(res, 200, await runtime("coverage"));
      if (req.method === "GET" && suffix === "/air") return send(res, 200, await runtime("air"));
      if (req.method === "GET" && suffix === "/receipts") {
        const args = ["--limit", url.searchParams.get("limit") || "100"];
        for (const [param, flag] of [["status", "--status"], ["action", "--action"], ["feature_id", "--feature-id"]]) {
          const value = url.searchParams.get(param);
          if (value) args.push(flag, value);
        }
        return send(res, 200, await runtime("receipts", args));
      }

      if (req.method === "POST" && suffix === "/sources/ingest-text") {
        const body = await readBody(req);
        if (!body.text) return send(res, 400, { ok: false, error: "text is required" });
        const textFile = await tempTextFile(body.title || "ingest-text", body.text);
        return send(res, 200, await runtime("ingest-text", ["--title", body.title || "Orangebox AtomSmasher API source", "--text-file", textFile]));
      }
      if (req.method === "POST" && suffix === "/sources/ingest-file") {
        const body = await readBody(req);
        const allowed = [appRoot, dataRoot(), path.join(os.homedir(), "Downloads")];
        const sourcePath = assertReadableSourcePath(body.path || body.file, allowed);
        return send(res, 200, await runtime("ingest-file", ["--path", sourcePath], { timeout: 240_000 }));
      }
      if (req.method === "POST" && suffix === "/orders") {
        const body = await readBody(req);
        if (!body.text) return send(res, 400, { ok: false, error: "text is required" });
        return send(res, 200, await runtime("orders", ["--add", body.text]));
      }
      if (req.method === "POST" && suffix === "/orders/supersede") {
        const body = await readBody(req);
        return send(res, 200, await runtime("orders-supersede", ["--old-id", body.old_id || body.oldId || "", "--text", body.text || ""]));
      }
      if (req.method === "POST" && suffix === "/search") {
        const body = await readBody(req);
        return send(res, 200, await runtime("search", ["--query", body.query || "", "--top-k", String(body.top_k || body.topK || 5)]));
      }
      if (req.method === "POST" && suffix === "/equations/fit") {
        const body = await readBody(req);
        const values = numberList(body.values);
        if (!values.length) return send(res, 400, { ok: false, error: "values are required" });
        return send(res, 200, await runtime("equation-fit", ["--name", body.name || "series", "--values", values.join(",")]));
      }
      const reconstruct = suffix.match(/^\/equations\/([^/]+)\/reconstruct$/);
      if (req.method === "GET" && reconstruct) {
        return send(res, 200, await runtime("equation-show", ["--id", decodeURIComponent(reconstruct[1])]));
      }
      if (req.method === "POST" && suffix === "/compile") {
        const body = await readBody(req);
        return send(res, 200, await runtime("compile", ["--query", body.query || "continue AtomSmasher without losing orders"]));
      }
      if (req.method === "POST" && suffix === "/security/scan") {
        const body = await readBody(req);
        return send(res, 200, await runtime("security-scan", ["--text", body.text || ""]));
      }
      if (req.method === "POST" && suffix === "/agents/lease") {
        const body = await readBody(req);
        return send(res, 200, await runtime("agent-lease", [
          "--agent", body.agent || "orangebox-agent",
          "--mission", body.mission || "bounded Orangebox mission",
          "--token-budget", String(body.token_budget || body.tokenBudget || 1000),
          "--time-budget-s", String(body.time_budget_s || body.timeBudgetS || 60),
        ]));
      }
      const featureExec = suffix.match(/^\/features\/([^/]+)\/execute$/);
      if (req.method === "POST" && featureExec) {
        return send(res, 200, await runtime("execute-addition", ["--name", decodeURIComponent(featureExec[1])]));
      }
      if (req.method === "POST" && suffix === "/features/run-all") {
        const body = await readBody(req);
        const args = body.limit ? ["--limit", String(body.limit)] : [];
        return send(res, 200, await runtime("run-all", args, { timeout: 240_000 }));
      }
      return send(res, 404, { ok: false, error: "AtomSmasher route not found", path: url.pathname });
    } catch (error) {
      return send(res, 500, { ok: false, error: error?.message || String(error), path: url.pathname });
    }
  };
}
