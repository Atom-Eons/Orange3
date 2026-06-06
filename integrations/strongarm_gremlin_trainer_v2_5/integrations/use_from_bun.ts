export async function runStrongarmCouncil({
  request,
  mode = "normal",
  context_digest = "",
  heuristic = false,
  endpoint = "http://127.0.0.1:8095/run",
}: {
  request: string;
  mode?: "cheap" | "normal" | "deep";
  context_digest?: string;
  heuristic?: boolean;
  endpoint?: string;
}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({request, mode, context_digest, heuristic}),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}
