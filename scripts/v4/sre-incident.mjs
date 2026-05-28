/* sre-incident.mjs — v6.0.2 incident intake + structured RCA composer
   Inspired by Tracer-Cloud/opensre. Accepts Grafana / Datadog / PagerDuty
   webhook payloads and produces a structured incident skeleton that the
   sprint-runner can take through Think→Investigate→Recommend→Notify. */
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";

const SHAPE = {
  alert_id:  null,
  source:    null,
  severity:  null,
  title:     null,
  message:   null,
  ts:        null,
  service:   null,
  tags:      [],
  correlation: { logs: [], metrics: [], traces: [] },
  evidence:    [],
  hypothesis:  null,
  recommended: [],
  status:    "received",
};

function incidentsDir() {
  const root = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
  const dir = path.join(root, "incidents");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function normalizeAlert(payload) {
  // Detect source heuristically
  if (payload.alerts && Array.isArray(payload.alerts)) {
    // Alertmanager / Prom-style
    const a = payload.alerts[0] || {};
    return { ...SHAPE,
      alert_id: a.fingerprint || `am_${Date.now()}`,
      source: "alertmanager",
      severity: a.labels?.severity || "unknown",
      title: a.labels?.alertname || "alert",
      message: a.annotations?.description || a.annotations?.summary || "",
      ts: a.startsAt || new Date().toISOString(),
      service: a.labels?.service || a.labels?.job || null,
      tags: Object.entries(a.labels || {}).map(([k, v]) => `${k}=${v}`),
    };
  }
  if (payload.alertEventType || payload.alert) {
    // Datadog-style
    const a = payload.alert || payload;
    return { ...SHAPE,
      alert_id: a.id || `dd_${Date.now()}`,
      source: "datadog",
      severity: a.priority || "unknown",
      title: a.title || "alert",
      message: a.body || a.eventTitle || "",
      ts: a.date || new Date().toISOString(),
      service: a.aggregKey || null,
      tags: a.tags || [],
    };
  }
  if (payload.incident) {
    // PagerDuty-style
    const i = payload.incident;
    return { ...SHAPE,
      alert_id: i.id || `pd_${Date.now()}`,
      source: "pagerduty",
      severity: i.urgency || "unknown",
      title: i.title || "incident",
      message: i.description || "",
      ts: i.created_at || new Date().toISOString(),
      service: i.service?.summary || null,
      tags: (i.urgency ? ["urgency=" + i.urgency] : []),
    };
  }
  // Grafana-style or generic
  return { ...SHAPE,
    alert_id: payload.id || payload.fingerprint || `gen_${Date.now()}`,
    source: payload.source || "generic",
    severity: payload.severity || "unknown",
    title: payload.title || payload.alertname || "alert",
    message: payload.message || payload.description || JSON.stringify(payload).slice(0, 200),
    ts: payload.ts || new Date().toISOString(),
    service: payload.service || null,
    tags: payload.tags || [],
  };
}

export function persist(incident) {
  const dir = incidentsDir();
  const file = path.join(dir, `${incident.alert_id}.json`);
  fs.writeFileSync(file, JSON.stringify(incident, null, 2));
  return { file };
}

export function compose(incident) {
  // Produce a sprint-runner-compatible prompt
  const prompt = [
    `INCIDENT INTAKE — ${incident.title}`,
    `Source: ${incident.source} | Severity: ${incident.severity} | Service: ${incident.service || "unknown"}`,
    `Message: ${incident.message}`,
    `Tags: ${incident.tags.join(", ") || "(none)"}`,
    "",
    "Required output:",
    "  1. probable root cause with evidence references",
    "  2. recommended next steps (numbered, executable)",
    "  3. classification per step: monitor / mitigate / rollback / postmortem",
    "  4. notify-to: Slack / PagerDuty / human only",
  ].join("\n");
  return prompt;
}

export function postSlack({ webhookUrl, incident, summary }) {
  if (!webhookUrl) return { posted: false, reason: "no webhook configured" };
  // The HTTP post is left to the caller using its preferred client.
  // This function just returns the formatted payload.
  return {
    payload: {
      text: `🚨 *${incident.title}* (${incident.severity})\nService: ${incident.service || "unknown"}\nSummary: ${summary || incident.message}`,
      attachments: [{
        color: incident.severity === "critical" ? "danger" : "warning",
        fields: [
          { title: "Source", value: incident.source, short: true },
          { title: "Time",   value: incident.ts,     short: true },
        ],
      }],
    },
  };
}
