// Minimal client for any Node/Bun agent.

export async function strongarmAudit({
  user_request,
  draft_answer,
  available_tools = [],
  hard_constraints = [],
  project_context = "",
  endpoint = "http://127.0.0.1:8094/rewrite_prompt",
}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      user_request,
      draft_answer,
      available_tools,
      hard_constraints,
      project_context,
    }),
  });

  if (!res.ok) {
    throw new Error(`STRONGARM error ${res.status}: ${await res.text()}`);
  }

  return await res.json();
}
