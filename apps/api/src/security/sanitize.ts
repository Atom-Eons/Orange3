export function truncateString(value: string, max = 20_000) {
  return value.length > max ? `${value.slice(0, max)}...[truncated]` : value;
}

export function sanitizeCommand(command: string) {
  return truncateString(command.trim(), 4000);
}

export function sanitizeJson(value: unknown, maxChars = 50_000) {
  const raw = JSON.stringify(value);
  if (raw.length <= maxChars) return value;
  return { truncated: true, preview: raw.slice(0, maxChars) };
}

export function redactSecrets(value: unknown): unknown {
  if (value === undefined) return undefined;
  const raw = JSON.stringify(value);
  return JSON.parse(raw.replace(/("[^"]*(apiKey|token|secret|password)[^"]*"\s*:\s*)"[^"]*"/gi, '$1"[redacted]"'));
}
