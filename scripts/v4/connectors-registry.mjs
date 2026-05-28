/* connectors-registry.mjs — v6.3.0-alpha.5 — master config of every
 * service OrangeBox can connect to.
 *
 * One entry per service. Adding a new service = adding one block here.
 * The oauth-handler / credentials-vault / connectors fabric handle the
 * rest mechanically — operator just runs `obx connect <service>`.
 *
 * Auth types:
 *   - "oauth2"          full OAuth 2.0 code flow (needs client_id + maybe secret + maybe PKCE)
 *   - "apikey"          single Bearer token / API key (operator pastes once)
 *   - "apikey_pair"     two values (e.g., Twilio Account SID + Auth Token)
 *   - "service_account" Google-style JSON key file
 *   - "webhook_only"    no inbound auth — just an outgoing webhook URL
 *
 * The PRIORITY group at the top is the operator's social/ads/comms list
 * (fully wired this push). The rest follow with config-only entries that
 * activate the moment the operator runs `obx connect <name>` and the
 * generic OAuth/api-key handler does its thing.
 */

export const CONNECTORS = {

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY: SOCIAL / ADS / COMMS  (operator's must-have list, full OAuth)
  // ═══════════════════════════════════════════════════════════════════════
  reddit: {
    label: "Reddit",
    category: "social",
    auth_type: "oauth2",
    authorize_url: "https://www.reddit.com/api/v1/authorize",
    token_url:     "https://www.reddit.com/api/v1/access_token",
    token_auth:    "basic",  // Reddit wants client_id+secret in Basic auth header
    scope: "identity read submit edit history mysubreddits privatemessages",
    duration: "permanent",   // Reddit-specific: get a refresh_token
    pkce: false,
    client_id_env:     "ORANGEBOX_REDDIT_CLIENT_ID",
    client_secret_env: "ORANGEBOX_REDDIT_CLIENT_SECRET",
    api_base: "https://oauth.reddit.com",
    app_registration_url: "https://www.reddit.com/prefs/apps",
    app_registration_hint: "Create a 'script' or 'web app'; set redirect to http://127.0.0.1:8788/oauth/reddit/callback",
    extra_authorize_params: { },
    extra_headers: { "User-Agent": "OrangeBox/6.3 by ÆoNs" },
  },

  meta: {
    label: "Meta (Facebook + Instagram)",
    category: "social",
    auth_type: "oauth2",
    authorize_url: "https://www.facebook.com/v18.0/dialog/oauth",
    token_url:     "https://graph.facebook.com/v18.0/oauth/access_token",
    scope: "public_profile pages_read_engagement pages_manage_posts pages_show_list instagram_basic instagram_content_publish",
    pkce: false,
    client_id_env:     "ORANGEBOX_META_APP_ID",
    client_secret_env: "ORANGEBOX_META_APP_SECRET",
    api_base: "https://graph.facebook.com/v18.0",
    app_registration_url: "https://developers.facebook.com/apps",
    app_registration_hint: "Create a Business app, add Facebook Login, set OAuth redirect to http://127.0.0.1:8788/oauth/meta/callback. For Instagram you also need to connect a Business account.",
  },

  "meta-ads": {
    label: "Meta Ads",
    category: "ads",
    auth_type: "oauth2",
    authorize_url: "https://www.facebook.com/v18.0/dialog/oauth",
    token_url:     "https://graph.facebook.com/v18.0/oauth/access_token",
    scope: "ads_management ads_read business_management read_insights",
    pkce: false,
    client_id_env:     "ORANGEBOX_META_APP_ID",          // same app as meta
    client_secret_env: "ORANGEBOX_META_APP_SECRET",
    api_base: "https://graph.facebook.com/v18.0",
    app_registration_url: "https://developers.facebook.com/apps",
    app_registration_hint: "Same Meta app as the social connector; enable Marketing API product.",
  },

  tiktok: {
    label: "TikTok",
    category: "social",
    auth_type: "oauth2",
    authorize_url: "https://www.tiktok.com/v2/auth/authorize",
    token_url:     "https://open.tiktokapis.com/v2/oauth/token/",
    scope: "user.info.basic video.publish video.upload",
    pkce: true,
    client_id_env:     "ORANGEBOX_TIKTOK_CLIENT_KEY",
    client_secret_env: "ORANGEBOX_TIKTOK_CLIENT_SECRET",
    api_base: "https://open.tiktokapis.com/v2",
    app_registration_url: "https://developers.tiktok.com",
    app_registration_hint: "Register on TikTok for Developers; create an app; add Content Posting API; set redirect to http://127.0.0.1:8788/oauth/tiktok/callback",
  },

  "tiktok-ads": {
    label: "TikTok Ads",
    category: "ads",
    auth_type: "oauth2",
    authorize_url: "https://business-api.tiktok.com/portal/auth",
    token_url:     "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
    scope: "",
    pkce: false,
    client_id_env:     "ORANGEBOX_TIKTOK_ADS_APP_ID",
    client_secret_env: "ORANGEBOX_TIKTOK_ADS_SECRET",
    api_base: "https://business-api.tiktok.com/open_api/v1.3",
    app_registration_url: "https://business-api.tiktok.com/portal",
    app_registration_hint: "TikTok for Business Marketing API — create app, add advertiser account, set redirect to http://127.0.0.1:8788/oauth/tiktok-ads/callback",
  },

  linkedin: {
    label: "LinkedIn",
    category: "social",
    auth_type: "oauth2",
    authorize_url: "https://www.linkedin.com/oauth/v2/authorization",
    token_url:     "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "openid profile email w_member_social",
    pkce: false,
    client_id_env:     "ORANGEBOX_LINKEDIN_CLIENT_ID",
    client_secret_env: "ORANGEBOX_LINKEDIN_CLIENT_SECRET",
    api_base: "https://api.linkedin.com/v2",
    app_registration_url: "https://www.linkedin.com/developers/apps",
    app_registration_hint: "Create app; verify; request Sign In with LinkedIn + Share on LinkedIn products; set redirect to http://127.0.0.1:8788/oauth/linkedin/callback",
  },

  "linkedin-ads": {
    label: "LinkedIn Ads",
    category: "ads",
    auth_type: "oauth2",
    authorize_url: "https://www.linkedin.com/oauth/v2/authorization",
    token_url:     "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "r_ads rw_ads r_ads_reporting r_organization_admin",
    pkce: false,
    client_id_env:     "ORANGEBOX_LINKEDIN_CLIENT_ID",   // same app
    client_secret_env: "ORANGEBOX_LINKEDIN_CLIENT_SECRET",
    api_base: "https://api.linkedin.com/v2",
    app_registration_url: "https://www.linkedin.com/developers/apps",
    app_registration_hint: "Add Marketing Developer Platform product to the same LinkedIn app.",
  },

  "x-twitter": {
    label: "X (Twitter)",
    category: "social",
    auth_type: "oauth2",
    authorize_url: "https://twitter.com/i/oauth2/authorize",
    token_url:     "https://api.twitter.com/2/oauth2/token",
    scope: "tweet.read tweet.write users.read offline.access",
    pkce: true,
    client_id_env:     "ORANGEBOX_X_CLIENT_ID",
    client_secret_env: "ORANGEBOX_X_CLIENT_SECRET",
    token_auth: "basic",
    api_base: "https://api.twitter.com/2",
    app_registration_url: "https://developer.twitter.com/en/portal/dashboard",
    app_registration_hint: "X developer portal; create app; OAuth 2.0; redirect to http://127.0.0.1:8788/oauth/x-twitter/callback",
  },

  discord: {
    label: "Discord",
    category: "comms",
    auth_type: "oauth2",
    authorize_url: "https://discord.com/api/oauth2/authorize",
    token_url:     "https://discord.com/api/oauth2/token",
    scope: "identify messages.read guilds",
    pkce: false,
    client_id_env:     "ORANGEBOX_DISCORD_CLIENT_ID",
    client_secret_env: "ORANGEBOX_DISCORD_CLIENT_SECRET",
    api_base: "https://discord.com/api/v10",
    app_registration_url: "https://discord.com/developers/applications",
  },

  slack: {
    label: "Slack",
    category: "comms",
    auth_type: "oauth2",
    authorize_url: "https://slack.com/oauth/v2/authorize",
    token_url:     "https://slack.com/api/oauth.v2.access",
    scope: "chat:write channels:read chat:write.public",
    pkce: false,
    client_id_env:     "ORANGEBOX_SLACK_CLIENT_ID",
    client_secret_env: "ORANGEBOX_SLACK_CLIENT_SECRET",
    api_base: "https://slack.com/api",
    app_registration_url: "https://api.slack.com/apps",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AI FOUNDATION & INFERENCE
  // (Most are already routed via OpenRouter universal fallback; these entries
  //  let an operator paste a direct provider key if they prefer.)
  // ═══════════════════════════════════════════════════════════════════════
  openai:      { label: "OpenAI",       category: "ai",       auth_type: "apikey", api_base: "https://api.openai.com/v1",        signup_url: "https://platform.openai.com/api-keys" },
  anthropic:   { label: "Anthropic",    category: "ai",       auth_type: "apikey", api_base: "https://api.anthropic.com/v1",     signup_url: "https://console.anthropic.com/settings/keys" },
  "google-gemini": { label: "Google Gemini", category: "ai",  auth_type: "apikey", api_base: "https://generativelanguage.googleapis.com/v1beta", signup_url: "https://aistudio.google.com/app/apikey" },
  perplexity:  { label: "Perplexity",   category: "ai",       auth_type: "apikey", api_base: "https://api.perplexity.ai",        signup_url: "https://www.perplexity.ai/settings/api" },
  groq:        { label: "Groq",         category: "ai",       auth_type: "apikey", api_base: "https://api.groq.com/openai/v1",   signup_url: "https://console.groq.com/keys" },
  mistral:     { label: "Mistral",      category: "ai",       auth_type: "apikey", api_base: "https://api.mistral.ai/v1",        signup_url: "https://console.mistral.ai" },
  cohere:      { label: "Cohere",       category: "ai",       auth_type: "apikey", api_base: "https://api.cohere.ai/v1",         signup_url: "https://dashboard.cohere.com/api-keys" },
  openrouter:  { label: "OpenRouter",   category: "ai",       auth_type: "apikey", api_base: "https://openrouter.ai/api/v1",     signup_url: "https://openrouter.ai/keys", key_prefix: "sk-or-" },
  pinecone:    { label: "Pinecone",     category: "ai-infra", auth_type: "apikey", api_base: "https://api.pinecone.io",          signup_url: "https://app.pinecone.io" },
  "vercel-ai": { label: "Vercel AI Gateway", category: "ai-infra", auth_type: "apikey", api_base: "https://ai-gateway.vercel.ai", signup_url: "https://vercel.com/account/tokens" },
  "cloudflare-workers-ai": { label: "Cloudflare Workers AI", category: "ai-infra", auth_type: "apikey", api_base: "https://api.cloudflare.com/client/v4", signup_url: "https://dash.cloudflare.com/profile/api-tokens" },

  // ═══════════════════════════════════════════════════════════════════════
  // VISUAL / VIDEO / AUDIO
  // ═══════════════════════════════════════════════════════════════════════
  midjourney:  { label: "Midjourney",   category: "visual",   auth_type: "apikey", api_base: "https://api.midjourney.com/v1",    signup_url: "https://www.midjourney.com/account", note: "Use a community gateway like ImagineAPI if you don't have direct access" },
  runway:      { label: "Runway",       category: "video",    auth_type: "apikey", api_base: "https://api.runwayml.com/v1",      signup_url: "https://app.runwayml.com/account" },
  elevenlabs:  { label: "ElevenLabs",   category: "audio",    auth_type: "apikey", api_base: "https://api.elevenlabs.io/v1",     signup_url: "https://elevenlabs.io/app/settings/api-keys", key_header: "xi-api-key" },
  heygen:      { label: "HeyGen",       category: "video",    auth_type: "apikey", api_base: "https://api.heygen.com/v2",        signup_url: "https://app.heygen.com/settings/api" },
  synthesia:   { label: "Synthesia",    category: "video",    auth_type: "apikey", api_base: "https://api.synthesia.io/v2",      signup_url: "https://app.synthesia.io/#/account/api-access" },
  "luma-dream": { label: "Luma Dream Machine", category: "video", auth_type: "apikey", api_base: "https://api.lumalabs.ai/dream-machine/v1", signup_url: "https://lumalabs.ai/dream-machine/api" },
  descript:    { label: "Descript",     category: "video",    auth_type: "apikey", api_base: "https://api.descript.com/v1",      signup_url: "https://www.descript.com/" },

  // ═══════════════════════════════════════════════════════════════════════
  // DEV / WORKFLOW / CMS
  // ═══════════════════════════════════════════════════════════════════════
  linear: {
    label: "Linear", category: "workflow", auth_type: "oauth2",
    authorize_url: "https://linear.app/oauth/authorize",
    token_url:     "https://api.linear.app/oauth/token",
    scope: "read write",
    pkce: false,
    client_id_env:     "ORANGEBOX_LINEAR_CLIENT_ID",
    client_secret_env: "ORANGEBOX_LINEAR_CLIENT_SECRET",
    api_base: "https://api.linear.app/graphql",
    app_registration_url: "https://linear.app/settings/api/applications",
  },
  notion: {
    label: "Notion", category: "workflow", auth_type: "oauth2",
    authorize_url: "https://api.notion.com/v1/oauth/authorize",
    token_url:     "https://api.notion.com/v1/oauth/token",
    scope: "",
    pkce: false,
    token_auth: "basic",
    client_id_env:     "ORANGEBOX_NOTION_CLIENT_ID",
    client_secret_env: "ORANGEBOX_NOTION_CLIENT_SECRET",
    api_base: "https://api.notion.com/v1",
    app_registration_url: "https://www.notion.so/profile/integrations",
    extra_authorize_params: { owner: "user" },
  },
  supabase:  { label: "Supabase",  category: "workflow", auth_type: "apikey", api_base_template: "https://<project>.supabase.co", signup_url: "https://app.supabase.com" },
  wordpress: { label: "WordPress", category: "cms",      auth_type: "apikey_pair", note: "Use Application Passwords; pair = username + app_password" },
  webflow:   { label: "Webflow",   category: "cms",      auth_type: "apikey", api_base: "https://api.webflow.com/v2",  signup_url: "https://webflow.com/dashboard/account/integrations" },
  framer:    { label: "Framer",    category: "cms",      auth_type: "apikey", note: "Limited public API; mostly webhook/embed" },
  algolia:   { label: "Algolia",   category: "search",   auth_type: "apikey_pair", note: "Application ID + Admin API Key" },
  stripe:    { label: "Stripe",    category: "billing",  auth_type: "apikey", api_base: "https://api.stripe.com/v1", signup_url: "https://dashboard.stripe.com/apikeys", key_prefix: "sk_" },
  vercel:    { label: "Vercel",    category: "deploy",   auth_type: "apikey", api_base: "https://api.vercel.com",    signup_url: "https://vercel.com/account/tokens" },

  // ═══════════════════════════════════════════════════════════════════════
  // DATA / ANALYTICS / TRACKING
  // ═══════════════════════════════════════════════════════════════════════
  "google-analytics": { label: "Google Analytics", category: "analytics", auth_type: "oauth2",
    authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url:     "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    access_type: "offline",
    pkce: false,
    client_id_env:     "ORANGEBOX_GOOGLE_CLIENT_ID",
    client_secret_env: "ORANGEBOX_GOOGLE_CLIENT_SECRET",
    api_base: "https://analyticsdata.googleapis.com/v1beta",
    app_registration_url: "https://console.cloud.google.com/apis/credentials",
  },
  posthog:    { label: "PostHog",   category: "analytics", auth_type: "apikey", api_base_template: "https://<host>.posthog.com/api", signup_url: "https://posthog.com" },
  amplitude:  { label: "Amplitude", category: "analytics", auth_type: "apikey_pair", note: "API Key + Secret Key" },
  mixpanel:   { label: "Mixpanel",  category: "analytics", auth_type: "apikey_pair", note: "Service Account or Project Token + Secret" },
  segment:    { label: "Segment",   category: "cdp",       auth_type: "apikey", api_base: "https://api.segment.io/v1" },
  snowflake:  { label: "Snowflake", category: "warehouse", auth_type: "service_account", note: "Service account with public/private key pair" },
  databricks: { label: "Databricks",category: "warehouse", auth_type: "apikey", api_base_template: "https://<workspace>.cloud.databricks.com/api" },

  // ═══════════════════════════════════════════════════════════════════════
  // SEO / CONTENT OPTIMIZATION
  // ═══════════════════════════════════════════════════════════════════════
  "surfer-seo": { label: "Surfer SEO", category: "seo",   auth_type: "apikey", api_base: "https://app.surferseo.com/api/v1",  signup_url: "https://surferseo.com" },
  semrush:    { label: "Semrush",   category: "seo",     auth_type: "apikey", api_base: "https://api.semrush.com",    signup_url: "https://www.semrush.com/api-documentation" },
  ahrefs:     { label: "Ahrefs",    category: "seo",     auth_type: "apikey", api_base: "https://apiv2.ahrefs.com",   signup_url: "https://ahrefs.com/api" },
  clearscope: { label: "Clearscope",category: "seo",     auth_type: "apikey", note: "Limited API; mostly UI-driven", signup_url: "https://app.clearscope.io" },
  marketmuse: { label: "MarketMuse",category: "seo",     auth_type: "apikey", signup_url: "https://app.marketmuse.com" },
  jasper:     { label: "Jasper AI", category: "content", auth_type: "apikey", api_base: "https://api.jasper.ai/v1",   signup_url: "https://www.jasper.ai" },
  "copy-ai":  { label: "Copy.ai",   category: "content", auth_type: "apikey", api_base: "https://api.copy.ai/api",    signup_url: "https://www.copy.ai" },

  // ═══════════════════════════════════════════════════════════════════════
  // AUTOMATION / CRM / CHAT
  // ═══════════════════════════════════════════════════════════════════════
  zapier: {
    label: "Zapier", category: "automation", auth_type: "webhook_only",
    note: "Zapier integrates as outgoing webhooks — operator pastes a Zapier Catch Webhook URL; OrangeBox POSTs to it on events.",
  },
  make: {
    label: "Make.com", category: "automation", auth_type: "webhook_only",
    note: "Same pattern as Zapier — incoming webhook URL per scenario.",
  },
  n8n: {
    label: "n8n (self-host)", category: "automation", auth_type: "apikey",
    api_base_template: "https://<your-n8n>/api/v1",
    note: "API key + workspace URL. Self-hosted n8n is the privacy-preserving choice.",
  },
  gohighlevel: { label: "GoHighLevel", category: "crm",  auth_type: "apikey", api_base: "https://services.leadconnectorhq.com" },
  hubspot: {
    label: "HubSpot", category: "crm", auth_type: "oauth2",
    authorize_url: "https://app.hubspot.com/oauth/authorize",
    token_url:     "https://api.hubapi.com/oauth/v1/token",
    scope: "crm.objects.contacts.read crm.objects.contacts.write content automation",
    pkce: false,
    client_id_env:     "ORANGEBOX_HUBSPOT_CLIENT_ID",
    client_secret_env: "ORANGEBOX_HUBSPOT_CLIENT_SECRET",
    api_base: "https://api.hubapi.com",
    app_registration_url: "https://developers.hubspot.com/get-started",
  },
  salesforce: {
    label: "Salesforce", category: "crm", auth_type: "oauth2",
    authorize_url: "https://login.salesforce.com/services/oauth2/authorize",
    token_url:     "https://login.salesforce.com/services/oauth2/token",
    scope: "api refresh_token offline_access",
    pkce: false,
    client_id_env:     "ORANGEBOX_SALESFORCE_CLIENT_ID",
    client_secret_env: "ORANGEBOX_SALESFORCE_CLIENT_SECRET",
    api_base_template: "https://<instance>.my.salesforce.com",
    app_registration_url: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm",
  },
  intercom: {
    label: "Intercom", category: "comms", auth_type: "oauth2",
    authorize_url: "https://app.intercom.com/oauth",
    token_url:     "https://api.intercom.io/auth/eagle/token",
    scope: "",
    pkce: false,
    client_id_env:     "ORANGEBOX_INTERCOM_CLIENT_ID",
    client_secret_env: "ORANGEBOX_INTERCOM_CLIENT_SECRET",
    api_base: "https://api.intercom.io",
    app_registration_url: "https://developers.intercom.com",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EMAIL / COMMUNICATIONS
  // ═══════════════════════════════════════════════════════════════════════
  resend:      { label: "Resend",      category: "email", auth_type: "apikey", api_base: "https://api.resend.com",      signup_url: "https://resend.com/api-keys", key_prefix: "re_" },
  omnisend:    { label: "Omnisend",    category: "email", auth_type: "apikey", api_base: "https://api.omnisend.com/v3", signup_url: "https://app.omnisend.com" },
  "customer-io": { label: "Customer.io", category: "email", auth_type: "apikey_pair", note: "Site ID + API Key", api_base: "https://track.customer.io/api/v1" },
  klaviyo:     { label: "Klaviyo",     category: "email", auth_type: "apikey", api_base: "https://a.klaviyo.com/api",    signup_url: "https://www.klaviyo.com/account#api-keys-tab", key_prefix: "pk_" },
  sendgrid:    { label: "SendGrid",    category: "email", auth_type: "apikey", api_base: "https://api.sendgrid.com/v3",  signup_url: "https://app.sendgrid.com/settings/api_keys", key_prefix: "SG." },
  twilio:      { label: "Twilio",      category: "comms", auth_type: "apikey_pair", note: "Account SID + Auth Token", api_base_template: "https://api.twilio.com/2010-04-01/Accounts/<SID>" },

  // ═══════════════════════════════════════════════════════════════════════
  // OPERATOR PERSONAL STACK (pancake stack additions)
  // ═══════════════════════════════════════════════════════════════════════
  "convertkit-kit": { label: "Kit (ConvertKit)", category: "email", auth_type: "apikey", api_base: "https://api.convertkit.com/v3", signup_url: "https://app.kit.com/account_settings/api_keys" },
  "lemon-squeezy": { label: "Lemon Squeezy", category: "billing", auth_type: "apikey", api_base: "https://api.lemonsqueezy.com/v1", signup_url: "https://app.lemonsqueezy.com/settings/api" },
  mercury:     { label: "Mercury Bank", category: "billing", auth_type: "apikey", api_base: "https://api.mercury.com/api/v1", signup_url: "https://app.mercury.com/settings/tokens" },
  asana: {
    label: "Asana", category: "workflow", auth_type: "oauth2",
    authorize_url: "https://app.asana.com/-/oauth_authorize",
    token_url:     "https://app.asana.com/-/oauth_token",
    scope: "default",
    pkce: false,
    client_id_env:     "ORANGEBOX_ASANA_CLIENT_ID",
    client_secret_env: "ORANGEBOX_ASANA_CLIENT_SECRET",
    api_base: "https://app.asana.com/api/1.0",
    app_registration_url: "https://app.asana.com/0/my-apps",
  },
  cursor:      { label: "Cursor (subscription CLI)", category: "ai", auth_type: "apikey", note: "Use `cursor agent` CLI subscription path; this entry is for direct API if Cursor exposes one." },
  github: {
    label: "GitHub", category: "workflow", auth_type: "oauth2",
    authorize_url: "https://github.com/login/oauth/authorize",
    token_url:     "https://github.com/login/oauth/access_token",
    scope: "repo workflow read:user",
    pkce: false,
    client_id_env:     "ORANGEBOX_GITHUB_CLIENT_ID",
    client_secret_env: "ORANGEBOX_GITHUB_CLIENT_SECRET",
    api_base: "https://api.github.com",
    app_registration_url: "https://github.com/settings/applications/new",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ADVERTISING NATIVE LAYER (v6.3.0-alpha.5 ad-architecture additions)
  // Operator's blueprint: CAPI + Enhanced Conversions + DCO + automated rules.
  // Native primary, 3rd-party as optional connector.
  // ═══════════════════════════════════════════════════════════════════════
  "google-ads": {
    label: "Google Ads", category: "ads", auth_type: "oauth2",
    authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
    token_url:     "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    pkce: false,
    client_id_env:     "ORANGEBOX_GOOGLE_CLIENT_ID",
    client_secret_env: "ORANGEBOX_GOOGLE_CLIENT_SECRET",
    api_base: "https://googleads.googleapis.com/v17",
    app_registration_url: "https://console.cloud.google.com/apis/credentials",
    app_registration_hint: "Enable Google Ads API in your Cloud project; OAuth client; redirect http://127.0.0.1:8788/oauth/google-ads/callback. Also needs a developer_token from Google Ads UI > Tools > API Center.",
    extra_headers_template: { "developer-token": "${ORANGEBOX_GOOGLE_ADS_DEV_TOKEN}" },
  },

  // 3rd-party automation tools (operator's optional backup layer)
  revealbot:  { label: "Revealbot",  category: "ads-automation", auth_type: "apikey", api_base: "https://api.revealbot.com",  signup_url: "https://revealbot.com/account/api", note: "Optional backup automation; native ad-architecture preferred per Doctrine." },
  madgicx:    { label: "Madgicx",    category: "ads-automation", auth_type: "apikey", note: "Limited public API; webhook integrations preferred. Optional backup." },
  adstellar:  { label: "AdStellar",  category: "ads-automation", auth_type: "apikey", note: "Optional cross-platform budget allocator." },

  // ═══════════════════════════════════════════════════════════════════════
  // FRAMER (full helpers in connectors/framer.mjs)
  // ═══════════════════════════════════════════════════════════════════════
  framer: {
    label: "Framer",
    category: "cms",
    auth_type: "apikey",
    api_base: "https://api.framer.com/v1",
    signup_url: "https://www.framer.com/settings/api",
    note: "Framer's public API covers CMS collections, project lookups, and webhooks. Form submissions arrive via webhook into OrangeBox.",
    helpers: ["list_projects", "list_collections", "upsert_collection_item", "delete_collection_item", "register_webhook"],
  },
};

export function getServiceConfig(name) {
  return CONNECTORS[name] || null;
}

export function listServices() {
  return Object.entries(CONNECTORS).map(([name, cfg]) => ({
    name,
    label: cfg.label,
    category: cfg.category,
    auth_type: cfg.auth_type,
    needs_app_registration: cfg.auth_type === "oauth2" && !!cfg.app_registration_url,
    app_registration_url: cfg.app_registration_url || null,
    signup_url: cfg.signup_url || null,
    note: cfg.note || null,
  }));
}

export function servicesByCategory() {
  const out = {};
  for (const [name, cfg] of Object.entries(CONNECTORS)) {
    const cat = cfg.category || "other";
    out[cat] ||= [];
    out[cat].push({ name, label: cfg.label, auth_type: cfg.auth_type });
  }
  return out;
}
