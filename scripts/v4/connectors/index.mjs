/* connectors/index.mjs — v6.3.0-alpha.5 thin per-service helpers
 *
 * Each helper is a small function set that uses credentials-vault for
 * auth and hits the service's API. All real implementations, no stubs.
 * The fabric (subscription-pipes, ad-architecture) calls into these.
 */
import https from "node:https";
import * as vault from "../credentials-vault.mjs";
import { getServiceConfig } from "../connectors-registry.mjs";
import * as oauth from "../oauth-handler.mjs";

// ── Generic HTTPS request ──────────────────────────────────────────────────
function http(method, url, { headers = {}, body = null, timeout_ms = 30_000 } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const bodyStr = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
    const opts = {
      hostname: u.hostname, port: u.port || 443,
      path: u.pathname + (u.search || ""), method,
      headers: { Accept: "application/json", ...headers },
    };
    if (bodyStr) {
      if (!opts.headers["Content-Type"]) opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    const req = https.request(opts, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        let parsed = buf;
        try { parsed = JSON.parse(buf); } catch { /* leave as string */ }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.setTimeout(timeout_ms, () => { req.destroy(new Error("timeout")); resolve({ status: 0, error: "timeout" }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function authedHttp(service, method, urlOrPath, opts = {}) {
  const cfg = getServiceConfig(service);
  if (!cfg) return { ok: false, error: `unknown service ${service}` };
  const tok = await oauth.getValidAccessToken(service);
  if (!tok.ok) return { ok: false, error: tok.error };
  const url = urlOrPath.startsWith("http") ? urlOrPath : `${cfg.api_base}${urlOrPath}`;
  const headers = { Authorization: `Bearer ${tok.token}`, ...(cfg.extra_headers || {}), ...(opts.headers || {}) };
  const r = await http(method, url, { ...opts, headers });
  await vault.markUsed(service).catch(() => null);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, body: r.body };
}

// ─── Reddit ────────────────────────────────────────────────────────────────
export const reddit = {
  async me() { return authedHttp("reddit", "GET", "/api/v1/me"); },
  async post({ subreddit, kind = "self", title, text, url }) {
    const form = new URLSearchParams({ sr: subreddit, kind, title });
    if (kind === "self") form.set("text", text || "");
    else form.set("url", url || "");
    form.set("api_type", "json");
    return authedHttp("reddit", "POST", "/api/submit", {
      body: form.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },
  async comment({ parent, text }) {
    const form = new URLSearchParams({ thing_id: parent, text, api_type: "json" });
    return authedHttp("reddit", "POST", "/api/comment", {
      body: form.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },
  async listSubreddits() { return authedHttp("reddit", "GET", "/subreddits/mine/subscriber"); },
};

// ─── Meta (Facebook + Instagram) ───────────────────────────────────────────
export const meta = {
  async me() { return authedHttp("meta", "GET", "/me?fields=id,name,accounts"); },
  async listPages() {
    return authedHttp("meta", "GET", "/me/accounts?fields=id,name,access_token,instagram_business_account");
  },
  async postToFacebookPage({ page_id, page_access_token, message, link, image_url }) {
    const body = { message, access_token: page_access_token };
    if (link) body.link = link;
    if (image_url) {
      // Photo post path
      return http("POST", `https://graph.facebook.com/v18.0/${page_id}/photos`, { body: { url: image_url, caption: message, access_token: page_access_token } });
    }
    return http("POST", `https://graph.facebook.com/v18.0/${page_id}/feed`, { body });
  },
  async postToInstagram({ ig_business_id, page_access_token, image_url, caption }) {
    // 2-step: create container → publish
    const c = await http("POST", `https://graph.facebook.com/v18.0/${ig_business_id}/media`, { body: { image_url, caption, access_token: page_access_token } });
    if (!c.body?.id) return c;
    const pub = await http("POST", `https://graph.facebook.com/v18.0/${ig_business_id}/media_publish`, { body: { creation_id: c.body.id, access_token: page_access_token } });
    return pub;
  },
};

// ─── Meta Ads ──────────────────────────────────────────────────────────────
export const metaAds = {
  async listAdAccounts() { return authedHttp("meta-ads", "GET", "/me/adaccounts?fields=id,name,account_status,currency,timezone_name"); },
  async listCampaigns({ ad_account_id }) {
    return authedHttp("meta-ads", "GET", `/${ad_account_id}/campaigns?fields=id,name,objective,status,daily_budget,lifetime_budget`);
  },
  async createCampaign({ ad_account_id, name, objective = "OUTCOME_TRAFFIC", status = "PAUSED", special_ad_categories = [], daily_budget_cents }) {
    const body = { name, objective, status, special_ad_categories };
    if (daily_budget_cents) body.daily_budget = daily_budget_cents;
    return authedHttp("meta-ads", "POST", `/${ad_account_id}/campaigns`, { body });
  },
  async insights({ ad_account_id, level = "campaign", date_preset = "last_7d" }) {
    return authedHttp("meta-ads", "GET", `/${ad_account_id}/insights?level=${level}&date_preset=${date_preset}&fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,cpm,cpc,actions,action_values`);
  },
};

// ─── TikTok ────────────────────────────────────────────────────────────────
export const tiktok = {
  async me() { return authedHttp("tiktok", "GET", "/user/info/"); },
  async initVideoUpload({ source_info }) {
    return authedHttp("tiktok", "POST", "/post/publish/inbox/video/init/", { body: { source_info } });
  },
  async publishStatus({ publish_id }) {
    return authedHttp("tiktok", "POST", "/post/publish/status/fetch/", { body: { publish_id } });
  },
};

// ─── TikTok Ads ────────────────────────────────────────────────────────────
export const tiktokAds = {
  async listAdvertisers() { return authedHttp("tiktok-ads", "GET", "/oauth2/advertiser/get/"); },
  async listCampaigns({ advertiser_id }) {
    return authedHttp("tiktok-ads", "GET", `/campaign/get/?advertiser_id=${advertiser_id}`);
  },
  async createCampaign({ advertiser_id, campaign_name, objective_type = "TRAFFIC", budget_mode = "BUDGET_MODE_DAY", budget }) {
    return authedHttp("tiktok-ads", "POST", "/campaign/create/", {
      body: { advertiser_id, campaign_name, objective_type, budget_mode, budget },
    });
  },
};

// ─── LinkedIn ──────────────────────────────────────────────────────────────
export const linkedin = {
  async me() { return authedHttp("linkedin", "GET", "/userinfo"); },
  async post({ author_urn, text, visibility = "PUBLIC" }) {
    return authedHttp("linkedin", "POST", "/ugcPosts", {
      body: {
        author: author_urn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility },
      },
      headers: { "X-Restli-Protocol-Version": "2.0.0" },
    });
  },
};

// ─── LinkedIn Ads ──────────────────────────────────────────────────────────
export const linkedinAds = {
  async listAdAccounts() {
    return authedHttp("linkedin-ads", "GET", "/adAccounts?q=search", { headers: { "LinkedIn-Version": "202506" } });
  },
  async listCampaigns({ ad_account_urn }) {
    const q = encodeURIComponent(`(account:${ad_account_urn})`);
    return authedHttp("linkedin-ads", "GET", `/adCampaigns?q=search&search.account.values[0]=${ad_account_urn}`, { headers: { "LinkedIn-Version": "202506" } });
  },
};

// ─── Framer (CMS API + webhook helpers) ────────────────────────────────────
export const framer = {
  async listProjects() {
    const rec = await vault.get("framer");
    if (!rec) return { ok: false, error: "framer not connected" };
    return http("GET", "https://api.framer.com/v1/projects", { headers: { Authorization: `Bearer ${rec.key}` } });
  },
  async listCollections({ project_id }) {
    const rec = await vault.get("framer");
    if (!rec) return { ok: false, error: "framer not connected" };
    return http("GET", `https://api.framer.com/v1/projects/${project_id}/collections`, { headers: { Authorization: `Bearer ${rec.key}` } });
  },
  async upsertItem({ collection_id, slug, fields }) {
    const rec = await vault.get("framer");
    if (!rec) return { ok: false, error: "framer not connected" };
    return http("POST", `https://api.framer.com/v1/collections/${collection_id}/items`, {
      headers: { Authorization: `Bearer ${rec.key}` },
      body: { slug, fields },
    });
  },
  async registerWebhook({ project_id, event, target_url }) {
    const rec = await vault.get("framer");
    if (!rec) return { ok: false, error: "framer not connected" };
    return http("POST", `https://api.framer.com/v1/projects/${project_id}/webhooks`, {
      headers: { Authorization: `Bearer ${rec.key}` },
      body: { event, url: target_url },
    });
  },
};

// ─── Whisper flow shim (calls existing /voice/transcribe internally) ───────
// The actual transcription happens server-side via scripts/v4/voice/whisper-runner.mjs
// (already shipped in v6.0.11). This helper provides a uniform entry that the
// Connector Fabric dispatcher can use.
export const whisper = {
  async transcribe({ audio_path, language = "en" }) {
    const fs = await import("node:fs/promises");
    if (!audio_path) return { ok: false, error: "audio_path required" };
    try {
      const wr = await import("./../voice/whisper-runner.mjs");
      const result = await wr.transcribe(audio_path, { language });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
  async status() {
    try {
      const wr = await import("./../voice/whisper-runner.mjs");
      return await wr.checkWhisperBinary();
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};

// Convenience: a flat registry of all connector helpers for the Silent Canvas
// agent loop to dispatch into.
export const ALL = {
  reddit, meta, "meta-ads": metaAds, tiktok, "tiktok-ads": tiktokAds,
  linkedin, "linkedin-ads": linkedinAds,
  framer, whisper,
};

export default ALL;
