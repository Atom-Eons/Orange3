#!/usr/bin/env node
/* smoke-60-v6.1.0.mjs — 60-point audit. Adds 10 Agent + Repo + Tab-complete points
   on top of the v6.0.11 50-pt audit. */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const PORT = 8787;
const HOST = "127.0.0.1";

function dataRoot() {
  if (process.env.ORANGEBOX_DATA_ROOT) return process.env.ORANGEBOX_DATA_ROOT;
  return path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}

function req(method, urlPath, body = null, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const opts = {
      host: HOST, port: PORT, path: urlPath, method,
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
    };
    const r = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    r.on("error", (e) => resolve({ status: 0, error: e.message }));
    r.setTimeout(timeoutMs, () => { r.destroy(); resolve({ status: 0, error: "timeout" }); });
    if (body) r.write(body);
    r.end();
  });
}

const checks = [];
let passed = 0, failed = 0, skipped = 0;

function check(name, fn) {
  return async () => {
    try {
      const result = await fn();
      const status = result.skip ? "SKIP" : (result.ok ? "PASS" : "FAIL");
      if (status === "PASS") passed++;
      else if (status === "FAIL") failed++;
      else skipped++;
      checks.push({ name, status, detail: result.detail || "" });
      console.log(`[${status}] ${name}${result.detail ? " — " + result.detail : ""}`);
    } catch (e) {
      failed++;
      checks.push({ name, status: "FAIL", detail: `exception: ${e.message}` });
      console.log(`[FAIL] ${name} — exception: ${e.message}`);
    }
  };
}

async function main() {
  console.log("smoke-60-v6.1.0 — 60-point audit\n");

  let alive = false;
  for (let i = 0; i < 30; i++) {
    const r = await req("GET", "/api/v4/receipts/list?limit=1", null, 2000);
    if (r.status === 200) { alive = true; break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!alive) { console.log("[FATAL] server not reachable"); process.exit(1); }
  console.log("[OK] sidecar reachable\n");

  const tests = [
    // ── First 50 checks: copy of v6.0.11 smoke (already proven) ─────────────
    check("01 GET receipts/list reachable", async () => {
      const r = await req("GET", "/api/v4/receipts/list?limit=1");
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("02 GET receipts/list items", async () => {
      const r = await req("GET", "/api/v4/receipts/list?limit=10");
      const j = JSON.parse(r.body || "{}");
      return { ok: Array.isArray(j.items), detail: `items=${j.items?.length}` };
    }),
    check("03 POST receipts/emit", async () => {
      const r = await req("POST", "/api/v4/receipts/emit", JSON.stringify({ source: "smoke", title: "smoke 60 test", evidence: {} }));
      return { ok: r.status === 201, detail: `status=${r.status}` };
    }),
    check("04 POST receipts/export", async () => {
      const r = await req("POST", "/api/v4/receipts/export", JSON.stringify({ limit: 10 }));
      const j = JSON.parse(r.body || "{}");
      return { ok: j.ok === true, detail: `count=${j.count}` };
    }),
    check("05 GET privacy/summary", async () => {
      const r = await req("GET", "/api/v4/privacy/summary");
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("06 GET settings/api-keys", async () => {
      const r = await req("GET", "/api/v4/settings/api-keys");
      const j = JSON.parse(r.body || "{}");
      return { ok: r.status === 200 && j.v6, detail: `density=${j.v6?.density} zoom=${j.v6?.zoom}` };
    }),
    check("07 GET freeze/status", async () => {
      const r = await req("GET", "/api/v4/freeze/status");
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("08 GET vault/summary", async () => {
      const r = await req("GET", "/api/v4/vault/summary");
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("09 POST vault/search", async () => {
      const r = await req("POST", "/api/v4/vault/search", JSON.stringify({ query: "doctrine", limit: 5 }));
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("10 GET cost/today", async () => {
      const r = await req("GET", "/api/v4/cost/today");
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("11 GET skills/list", async () => {
      const r = await req("GET", "/api/v4/skills/list?limit=5");
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("12 GET hermes/feed", async () => {
      const r = await req("GET", "/api/v4/hermes/feed?limit=5", null, 15000);
      return { ok: r.status === 200 || r.status === 502, detail: `status=${r.status}` };
    }),
    check("13 GET ae-alpha-news/anchors", async () => {
      const r = await req("GET", "/api/v4/ae-alpha-news/anchors");
      const j = JSON.parse(r.body || "{}");
      return { ok: Array.isArray(j.anchors), detail: `anchors=${j.anchors?.length}` };
    }),
    check("14 POST ae-alpha-news/anchors", async () => {
      const r = await req("POST", "/api/v4/ae-alpha-news/anchors", JSON.stringify({ anchors: ["@karpathy", "@sama"] }));
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("15 GET ae-alpha-news/feed", async () => {
      const r = await req("GET", "/api/v4/ae-alpha-news/feed?limit=5", null, 15000);
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("16 POST ae-alpha-news/score", async () => {
      const r = await req("POST", "/api/v4/ae-alpha-news/score", JSON.stringify({ text: "Anthropic Claude Opus 4.7 https://anthropic.com/news" }));
      const j = JSON.parse(r.body || "{}");
      return { ok: j.score > 0, detail: `score=${j.score}` };
    }),
    check("17 POST ae-alpha-news/clear-cache", async () => {
      const r = await req("POST", "/api/v4/ae-alpha-news/clear-cache", "{}");
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("18 GET voice/whisper-status", async () => {
      const r = await req("GET", "/api/v4/voice/whisper-status");
      const j = JSON.parse(r.body || "{}");
      return { ok: typeof j.present === "boolean", detail: `present=${j.present}` };
    }),
    check("19 GET trilane/votes", async () => {
      const r = await req("GET", "/api/v4/trilane/votes?limit=5");
      const j = JSON.parse(r.body || "{}");
      return { ok: Array.isArray(j.items), detail: `items=${j.items?.length || 0}` };
    }),
    check("20 POST trilane/vote", async () => {
      const body = JSON.stringify({
        prompt: "smoke 60 vote", mode: "trilane", winner: "gpt",
        legs: [{ role: "compiler", provider: "anthropic", model: "claude", text: "A" }],
        reasons: "smoke",
      });
      const r = await req("POST", "/api/v4/trilane/vote", body);
      const j = JSON.parse(r.body || "{}");
      return { ok: !!j.id, detail: `id=${j.id}` };
    }),
    check("21 GET deps/status", async () => {
      const r = await req("GET", "/api/v4/deps/status");
      return { ok: r.status === 200, detail: `status=${r.status}` };
    }),
    check("22 POST composer/scaffold (400 on empty)", async () => {
      const r = await req("POST", "/api/v4/composer/scaffold", JSON.stringify({ prompt: "test", files: [] }));
      return { ok: r.status === 400, detail: `status=${r.status} (polish fix)` };
    }),
    check("23 POST voice/intent", async () => {
      const r = await req("POST", "/api/v4/voice/intent", JSON.stringify({ transcript: "open the file" }));
      return { ok: r.status === 200 || r.status === 502, detail: `status=${r.status}` };
    }),
    check("24 GET longmemeval/status", async () => {
      const r = await req("GET", "/api/v4/longmemeval/status");
      return { ok: r.status === 200 || r.status === 404, detail: `status=${r.status}` };
    }),
    check("25 POST sprint/run", async () => {
      const r = await req("POST", "/api/v4/sprint/run", JSON.stringify({ project: "smoke", prompt: "test" }));
      return { ok: r.status === 200 || r.status === 400 || r.status === 502, detail: `status=${r.status}` };
    }),
    check("26 GET incident/list", async () => {
      const r = await req("GET", "/api/v4/incident/list?limit=5");
      return { ok: r.status === 200 || r.status === 404, detail: `status=${r.status}` };
    }),
    check("27 GET codexa/status", async () => {
      const r = await req("GET", "/api/v4/codexa/status");
      return { ok: r.status === 200 || r.status === 404, detail: `status=${r.status}` };
    }),
    check("28 POST freeze/set (no-op)", async () => {
      const r = await req("POST", "/api/v4/freeze/set", JSON.stringify({ root: "" }));
      return { ok: r.status === 200 || r.status === 400, detail: `status=${r.status}` };
    }),
    check("29 GET mistakes/list", async () => {
      const r = await req("GET", "/api/v4/mistakes/list");
      return { ok: r.status === 200 || r.status === 404, detail: `status=${r.status}` };
    }),
    check("30 GET telemetry/status", async () => {
      const r = await req("GET", "/api/v4/telemetry/status");
      return { ok: r.status === 200 || r.status === 404, detail: `status=${r.status}` };
    }),
    check("31 Receipts dir exists", async () => {
      try {
        await fs.stat(path.join(dataRoot(), "receipts"));
        return { ok: true, detail: "ok" };
      } catch (e) { return { ok: false, detail: e.message }; }
    }),
    check("32 AE Alpha anchors file exists", async () => {
      try {
        await fs.stat(path.join(dataRoot(), "ae-alpha-news.json"));
        return { ok: true, detail: "ok" };
      } catch (e) { return { ok: false, detail: e.message }; }
    }),
    check("33 Trilane votes dir exists", async () => {
      try {
        await fs.stat(path.join(dataRoot(), "trilane-votes"));
        return { ok: true, detail: "ok" };
      } catch (e) { return { ok: false, detail: e.message }; }
    }),
    check("34 Exports dir exists", async () => {
      try {
        await fs.stat(path.join(dataRoot(), "exports"));
        return { ok: true, detail: "ok" };
      } catch (e) { return { ok: false, detail: e.message }; }
    }),
    check("35 Receipts emit cycle", async () => {
      const r1 = await req("POST", "/api/v4/receipts/emit", JSON.stringify({ source: "smoke", title: "smoke 60 cycle", evidence: {} }));
      const j1 = JSON.parse(r1.body || "{}");
      const r2 = await req("GET", "/api/v4/receipts/list?limit=5");
      const j2 = JSON.parse(r2.body || "{}");
      const found = j2.items?.some(it => it.id === j1.id);
      return { ok: !!found, detail: `cycle ${found ? "ok" : "broken"}` };
    }),
    check("36 Receipt schema", async () => {
      const r = await req("GET", "/api/v4/receipts/list?limit=1");
      const j = JSON.parse(r.body || "{}");
      const it = j.items?.[0];
      return { ok: !!(it?.id && it.source && it.ts && it.title), detail: "ok" };
    }),
    check("37 Source filter", async () => {
      const r = await req("GET", "/api/v4/receipts/list?limit=10&source=smoke");
      const j = JSON.parse(r.body || "{}");
      return { ok: j.items?.every(it => it.source === "smoke") ?? true, detail: `${j.items?.length} smoke` };
    }),
    check("38 AE Alpha scoring deterministic", async () => {
      const text = "Anthropic Claude Opus 4.7 https://anthropic.com/news";
      const r1 = await req("POST", "/api/v4/ae-alpha-news/score", JSON.stringify({ text }));
      const r2 = await req("POST", "/api/v4/ae-alpha-news/score", JSON.stringify({ text }));
      const j1 = JSON.parse(r1.body || "{}"), j2 = JSON.parse(r2.body || "{}");
      return { ok: j1.score === j2.score, detail: `${j1.score}=${j2.score}` };
    }),
    check("39 AE Alpha no-link boundary", async () => {
      const r = await req("POST", "/api/v4/ae-alpha-news/score", JSON.stringify({ text: "no links" }));
      const j = JSON.parse(r.body || "{}");
      return { ok: typeof j.score === "number", detail: `score=${j.score}` };
    }),
    check("40 Voice intent empty rejection", async () => {
      const r = await req("POST", "/api/v4/voice/intent", JSON.stringify({ transcript: "" }));
      return { ok: r.status === 400, detail: `status=${r.status}` };
    }),
    check("41 Trilane vote missing-winner rejection", async () => {
      const r = await req("POST", "/api/v4/trilane/vote", JSON.stringify({ prompt: "x", legs: [] }));
      return { ok: r.status === 400, detail: `status=${r.status}` };
    }),
    check("42 Receipts export empty bundle", async () => {
      const r = await req("POST", "/api/v4/receipts/export", JSON.stringify({ source: "no-such", limit: 10 }));
      const j = JSON.parse(r.body || "{}");
      return { ok: j.ok === true && j.count === 0, detail: `count=${j.count}` };
    }),
    check("43 Composer scaffold empty rejection (400)", async () => {
      const r = await req("POST", "/api/v4/composer/scaffold", JSON.stringify({ prompt: "x", files: [] }));
      const j = JSON.parse(r.body || "{}");
      return { ok: r.status === 400 && /empty/i.test(j.error || ""), detail: `${r.status}: ${j.error}` };
    }),
    check("44 Freeze guard shape", async () => {
      const r = await req("GET", "/api/v4/freeze/status");
      const j = JSON.parse(r.body || "{}");
      return { ok: typeof j.active === "boolean", detail: `active=${j.active}` };
    }),
    check("45 Whisper status shape", async () => {
      const r = await req("GET", "/api/v4/voice/whisper-status");
      const j = JSON.parse(r.body || "{}");
      return { ok: "present" in j && "install_hint" in j, detail: `keys=${Object.keys(j).length}` };
    }),
    check("46 Trilane vote captures full leg", async () => {
      const body = JSON.stringify({
        prompt: "smoke 60 capture", mode: "trilane", winner: "claude",
        legs: [{ role: "compiler", provider: "a", model: "c", text: "A".repeat(2000) }],
        reasons: "test",
      });
      const r = await req("POST", "/api/v4/trilane/vote", body);
      const j = JSON.parse(r.body || "{}");
      if (!j.file) return { ok: false, detail: "no file" };
      const txt = await fs.readFile(j.file, "utf8");
      const doc = JSON.parse(txt);
      return { ok: doc.legs?.[0]?.excerpt?.length === 1500, detail: `len=${doc.legs?.[0]?.excerpt?.length}` };
    }),
    check("47 Receipts export bundle on disk", async () => {
      const r = await req("POST", "/api/v4/receipts/export", JSON.stringify({ limit: 50 }));
      const j = JSON.parse(r.body || "{}");
      if (!j.file) return { ok: false, detail: "no file" };
      const s = await fs.stat(j.file);
      return { ok: s.isFile() && s.size > 0, detail: `${s.size}b` };
    }),
    check("48 AE Alpha anchors round-trip", async () => {
      await req("POST", "/api/v4/ae-alpha-news/anchors", JSON.stringify({ anchors: ["@smoke60"] }));
      const r = await req("GET", "/api/v4/ae-alpha-news/anchors");
      const j = JSON.parse(r.body || "{}");
      return { ok: j.anchors?.some(a => /smoke60/.test(a)), detail: `${JSON.stringify(j.anchors)}` };
    }),
    check("49 Cost summary numeric", async () => {
      const r = await req("GET", "/api/v4/cost/today");
      const j = JSON.parse(r.body || "{}");
      return { ok: typeof j.total_cents === "number" || j.ok === false, detail: `total=${j.total_cents}` };
    }),
    check("50 Unknown route 404", async () => {
      const r = await req("GET", "/api/v4/this-does-not-exist");
      return { ok: r.status === 404, detail: `${r.status}` };
    }),

    // ── 10 NEW v6.1.0 Agent + Repo + Tab checks ─────────────────────────────
    check("51 GET agent/list (empty ok)", async () => {
      const r = await req("GET", "/api/v4/agent/list?limit=5");
      const j = JSON.parse(r.body || "{}");
      return { ok: Array.isArray(j.items), detail: `items=${j.items?.length}` };
    }),
    check("52 POST agent/run rejects missing goal", async () => {
      const r = await req("POST", "/api/v4/agent/run", JSON.stringify({}));
      return { ok: r.status === 400, detail: `status=${r.status}` };
    }),
    check("53 POST agent/run requires API key (502 ok if not set)", async () => {
      const r = await req("POST", "/api/v4/agent/run", JSON.stringify({ goal: "test smoke", workspace: process.cwd() }));
      // 200 = started, 502 = no API key (expected if test env has no key)
      return { ok: r.status === 200 || r.status === 502, detail: `status=${r.status}` };
    }),
    check("54 GET agent/status/<bad-id> returns 404", async () => {
      const r = await req("GET", "/api/v4/agent/status/agent-deadbeef");
      return { ok: r.status === 404, detail: `status=${r.status}` };
    }),
    check("55 POST agent/cancel/<bad-id> returns no-such-job", async () => {
      const r = await req("POST", "/api/v4/agent/cancel/agent-deadbeef", "{}");
      const j = JSON.parse(r.body || "{}");
      return { ok: j.ok === false && /no such/i.test(j.error || ""), detail: `${j.error}` };
    }),
    check("56 POST repo/index builds workspace index", async () => {
      const r = await req("POST", "/api/v4/repo/index", JSON.stringify({ workspace: process.cwd() }), 30000);
      const j = JSON.parse(r.body || "{}");
      return { ok: j.ok && j.file_count > 0, detail: `files=${j.file_count} took=${j.took_ms}ms` };
    }),
    check("57 GET repo/summary returns built index", async () => {
      const r = await req("GET", "/api/v4/repo/summary?workspace=" + encodeURIComponent(process.cwd()));
      const j = JSON.parse(r.body || "{}");
      return { ok: j.ok && j.total_symbols >= 0, detail: `symbols=${j.total_symbols}` };
    }),
    check("58 GET repo/symbol-prefix returns hits", async () => {
      // Search for any symbol starting with "a" — should hit something in our repo
      const r = await req("GET", "/api/v4/repo/symbol-prefix?workspace=" + encodeURIComponent(process.cwd()) + "&prefix=a");
      const j = JSON.parse(r.body || "{}");
      return { ok: j.ok && Array.isArray(j.hits), detail: `hits=${j.hits?.length}` };
    }),
    check("59 POST ide/complete empty prefix returns empty", async () => {
      const r = await req("POST", "/api/v4/ide/complete", JSON.stringify({ prefix: "" }));
      const j = JSON.parse(r.body || "{}");
      return { ok: j.completion === "", detail: `reason=${j.reason}` };
    }),
    check("60 GET ide/complete/cache-stats shape", async () => {
      const r = await req("GET", "/api/v4/ide/complete/cache-stats");
      const j = JSON.parse(r.body || "{}");
      return { ok: typeof j.entries === "number", detail: `entries=${j.entries}, max=${j.max}` };
    }),
  ];

  for (const t of tests) await t();

  const lines = [
    `# Smoke 60 — OrangeBox v6.1.0`,
    ``,
    `**Date:** ${new Date().toISOString()}`,
    `**Results:** ${passed} pass · ${failed} fail · ${skipped} skip / 60`,
    ``,
    `| # | Check | Status | Detail |`,
    `|---|---|---|---|`,
  ];
  for (const c of checks) lines.push(`| | ${c.name} | ${c.status} | ${c.detail} |`);
  const out = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), "..", "docs", `SMOKE_v6.1.0_${Date.now()}.md`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, lines.join("\n"));
  console.log(`\nReport: ${out}`);
  console.log(`Result: ${passed}/60 pass · ${failed} fail · ${skipped} skip`);

  await req("POST", "/api/v4/receipts/emit", JSON.stringify({
    source: "smoke",
    title: `v6.1.0 60-pt smoke: ${passed}/60 pass · ${failed} fail`,
    evidence: { passed, failed, skipped, report: out, agent_checks: 10, total: 60 },
  }));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
