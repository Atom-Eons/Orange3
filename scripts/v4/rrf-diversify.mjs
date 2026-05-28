/* rrf-diversify.mjs — v6.0.2 Reciprocal Rank Fusion with per-session cap
   (agentmemory pattern: max 3 results per session prevents one chatty session
   from monopolizing top-k retrieval). */

export function rrf(rankings, { k = 60 } = {}) {
  // rankings: Array<Array<{id, ...}>>
  const scores = new Map();
  for (const ranked of rankings) {
    ranked.forEach((item, idx) => {
      const cur = scores.get(item.id) || { item, score: 0 };
      cur.score += 1 / (k + idx + 1);
      scores.set(item.id, cur);
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map(x => ({ ...x.item, _rrf_score: x.score }));
}

export function diversifyBySession(ranked, { perSessionCap = 3, sessionKey = "session_id" } = {}) {
  const counts = new Map();
  const out = [];
  for (const item of ranked) {
    const key = item[sessionKey] || item.file_path || item.id;
    const n = counts.get(key) || 0;
    if (n >= perSessionCap) continue;
    counts.set(key, n + 1);
    out.push(item);
  }
  return out;
}

export function hybridSearch({ bm25Ranked = [], vectorRanked = [], graphRanked = [], topK = 10, perSessionCap = 3 } = {}) {
  const fused = rrf([bm25Ranked, vectorRanked, graphRanked].filter(r => r.length));
  const diverse = diversifyBySession(fused, { perSessionCap });
  return diverse.slice(0, topK);
}
