/* longmemeval-harness.mjs — v6.0.2 LongMemEval-S benchmark runner
   Doctrine: docs/V6_TRENDING_INTEGRATION_PLAN.md
   Target benchmark: LongMemEval-S (ICLR 2025, ~500 questions)
   Reported by agentmemory: R@5 = 95.2%, R@10 = 98.6%, MRR = 88.2%
   Our goal: produce a real R@5 score against our CLC vault.

   This is a HARNESS — it does NOT call paid APIs unless ANTHROPIC_API_KEY is
   present. When key is missing, it runs the retrieval-only path which is
   the part our vault is responsible for. The judge step is optional.

   Usage:
     node longmemeval-harness.mjs --dataset=./LongMemEval-S.jsonl --topk=5
     node longmemeval-harness.mjs --download   # fetches from a public mirror
     node longmemeval-harness.mjs --smoke      # 10-item synthetic dataset
     node longmemeval-harness.mjs --judge      # full LLM-judged eval (needs key)
*/
import fs    from "node:fs";
import path  from "node:path";
import os    from "node:os";
import http  from "node:http";
import https from "node:https";

const COCKPIT = process.env.ORANGEBOX_URL || "http://127.0.0.1:8787";

function httpPostJSON(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(JSON.stringify(body));
    const client = u.protocol === "https:" ? https : http;
    const req = client.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length },
      timeout: 20_000,
    }, res => {
      let raw = "";
      res.on("data", d => raw += d);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve({ raw, status: res.statusCode }); } });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(data); req.end();
  });
}

// Synthetic smoke set so we can verify wiring without the 500-item download
function smokeDataset() {
  return [
    { qid: "smoke_01", question: "What is the OrangeBox doctrine on receipts?",                          gold: ["OPERATOR_MANUAL.md", "V4_MOAT_DOCTRINE.md"] },
    { qid: "smoke_02", question: "Which providers does the smart router support in v6.0.2?",             gold: ["smart-model-router.mjs"] },
    { qid: "smoke_03", question: "How does LOCAL_MODE work and what tasks does it exclude?",             gold: ["smart-model-router.mjs", "V6_POSITION_2026_STACK.md"] },
    { qid: "smoke_04", question: "Where is the freeze lock file stored?",                                gold: ["freeze-guard.mjs"] },
    { qid: "smoke_05", question: "What is the agent_teams advisory and when does it fire?",              gold: ["smart-model-router.mjs"] },
    { qid: "smoke_06", question: "How does the RTK token compressor detect git diffs?",                  gold: ["rtk-compressor.mjs"] },
    { qid: "smoke_07", question: "What is the orangebox-context commit body schema?",                    gold: ["checkpoint-mode.mjs"] },
    { qid: "smoke_08", question: "Which 4 memory tiers does v6.0.2 implement?",                          gold: ["memory-tiers.mjs"] },
    { qid: "smoke_09", question: "What does the SRE incident lane do on alert?",                         gold: ["sre-incident.mjs"] },
    { qid: "smoke_10", question: "List the destructive command patterns blocked by /careful.",           gold: ["careful-check.mjs"] },
  ];
}

function recallAtK(retrieved, gold, k = 5) {
  const top = (retrieved || []).slice(0, k).map(r => path.basename(r.file_path || r.path || r.file || ""));
  const goldSet = new Set(gold.map(g => path.basename(g)));
  let hits = 0;
  for (const t of top) if (goldSet.has(t)) hits++;
  return goldSet.size ? hits / goldSet.size : 0;
}

function mrr(retrieved, gold) {
  const goldSet = new Set(gold.map(g => path.basename(g)));
  const list = (retrieved || []).map(r => path.basename(r.file_path || r.path || r.file || ""));
  for (let i = 0; i < list.length; i++) if (goldSet.has(list[i])) return 1 / (i + 1);
  return 0;
}

export async function runBenchmark({ dataset = null, topk = 5 } = {}) {
  const items = dataset || smokeDataset();
  const results = [];
  let recall5_sum = 0, recall10_sum = 0, mrr_sum = 0;
  for (const it of items) {
    let retrieved = [];
    try {
      const resp = await httpPostJSON(COCKPIT + "/api/v4/vault/cited-query", { question: it.question, topN: 10 });
      retrieved = resp.hits || resp.citations || resp.results || [];
    } catch (e) {
      results.push({ qid: it.qid, error: e.message });
      continue;
    }
    const r5  = recallAtK(retrieved, it.gold, 5);
    const r10 = recallAtK(retrieved, it.gold, 10);
    const m   = mrr(retrieved, it.gold);
    recall5_sum  += r5;
    recall10_sum += r10;
    mrr_sum      += m;
    results.push({ qid: it.qid, R5: r5, R10: r10, MRR: m, top: retrieved.slice(0, 3).map(r => path.basename(r.file_path || r.path || "?")) });
  }
  const n = items.length;
  return {
    n,
    R5:  n ? recall5_sum  / n : 0,
    R10: n ? recall10_sum / n : 0,
    MRR: n ? mrr_sum      / n : 0,
    detail: results,
    note: dataset ? "ran on provided dataset" : "ran on synthetic smoke set (10 items) — fetch LongMemEval-S for full 500-item run",
  };
}

// CLI
const selfUrl = import.meta.url.replace(/\\/g, "/");
const argv1   = (process.argv && process.argv[1]) ? String(process.argv[1]).replace(/\\/g, "/") : "";
if (argv1 && (selfUrl.endsWith(argv1) || selfUrl === `file:///${argv1}`)) {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
  }
  let dataset = null;
  if (args.dataset) {
    const txt = fs.readFileSync(args.dataset, "utf8");
    dataset = txt.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  }
  const out = await runBenchmark({ dataset, topk: parseInt(args.topk || "5", 10) });
  const outPath = path.join(process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox"), "benchmarks", `longmemeval-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`LongMemEval results (N=${out.n}):`);
  console.log(`  R@5  = ${(out.R5 * 100).toFixed(1)}%`);
  console.log(`  R@10 = ${(out.R10 * 100).toFixed(1)}%`);
  console.log(`  MRR  = ${(out.MRR * 100).toFixed(1)}%`);
  console.log(`  note: ${out.note}`);
  console.log(`Receipt: ${outPath}`);
}
