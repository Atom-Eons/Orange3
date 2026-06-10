import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const v3Root = path.join(repoRoot, "orangebox-v3");
export const userRoot = process.env.USERPROFILE || os.homedir();
export const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
export const v3DataRoot = path.join(dataRoot, "v3");
export const repoReceiptRoot = path.join(repoRoot, "receipts");
export const v3ReceiptRoot = path.join(v3DataRoot, "receipts");

export type JsonRecord = Record<string, unknown>;

export function stamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export function readText(file: string, fallback = ""): string {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return fallback;
  }
}

export async function readTextAsync(file: string, fallback = ""): Promise<string> {
  try {
    return (await fsp.readFile(file, "utf8")).replace(/^\uFEFF/, "");
  } catch {
    return fallback;
  }
}

export function readJson<T = JsonRecord>(file: string, fallback: T): T {
  try {
    return JSON.parse(readText(file)) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function appendJsonl(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fsp.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

export function boolFlag(value: string | undefined | null): boolean {
  return value === "1" || /^true$/i.test(String(value || ""));
}

export function parseFlags(file = path.join(v3Root, "V3_FLAGS.env")): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = readText(file);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    out[trimmed.slice(0, i)] = trimmed.slice(i + 1);
  }
  return out;
}

export function flagValue(name: string, fallback = ""): string {
  return process.env[name] || parseFlags()[name] || fallback;
}

export async function run(cmd: string, args: string[] = [], options: { cwd?: string; timeoutMs?: number } = {}) {
  const started = Date.now();
  try {
    const result = await execFileAsync(cmd, args, {
      cwd: options.cwd || repoRoot,
      timeout: options.timeoutMs || 60_000,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    return {
      ok: true,
      command: [cmd, ...args].join(" "),
      cwd: options.cwd || repoRoot,
      exit_code: 0,
      duration_ms: Date.now() - started,
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
    };
  } catch (error: any) {
    return {
      ok: false,
      command: [cmd, ...args].join(" "),
      cwd: options.cwd || repoRoot,
      exit_code: typeof error?.code === "number" ? error.code : 1,
      duration_ms: Date.now() - started,
      stdout: String(error?.stdout || ""),
      stderr: String(error?.stderr || error?.message || error),
    };
  }
}

export async function git(args: string[], options: { cwd?: string; timeoutMs?: number } = {}) {
  return run("git", args, { cwd: options.cwd || repoRoot, timeoutMs: options.timeoutMs || 120_000 });
}

export async function currentHead(cwd = repoRoot): Promise<string | null> {
  const res = await git(["rev-parse", "HEAD"], { cwd });
  return res.ok ? res.stdout.trim() : null;
}

export async function currentBranch(cwd = repoRoot): Promise<string | null> {
  const res = await git(["branch", "--show-current"], { cwd });
  return res.ok ? res.stdout.trim() : null;
}

export async function fileHash(file: string): Promise<string | null> {
  try {
    return sha256(await fsp.readFile(file));
  } catch {
    return null;
  }
}

export function safeId(input: string): string {
  return String(input || "orangebox")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "orangebox";
}

export function argValue(args: string[], flag: string, fallback = ""): string {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
}

export function hasArg(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export async function writeReceipt(kind: string, payload: JsonRecord, options: { repoToo?: boolean } = {}) {
  const id = `orangebox-v3-${safeId(kind)}-${stamp()}`;
  const receipt = {
    receipt_id: id,
    kind,
    v3: true,
    created_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    ...payload,
  };
  const file = path.join(v3ReceiptRoot, `${id}.json`);
  await writeJson(file, receipt);
  let repo_file: string | null = null;
  if (options.repoToo) {
    repo_file = path.join(repoReceiptRoot, `${id}.json`);
    await writeJson(repo_file, receipt);
  }
  return { ...receipt, receipt_path: file, repo_receipt_path: repo_file };
}

export async function probeUrl(url: string, timeoutMs = 1500) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      url,
      bytes: text.length,
      body_sample: text.slice(0, 240),
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      url,
      error: String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function printResult(value: unknown, json = true): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(typeof value === "string" ? value : JSON.stringify(value));
}

export function isMain(metaUrl: string): boolean {
  if (!process.argv[1]) return false;
  return metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
}

export async function listFiles(root: string, options: { max?: number; exts?: RegExp; depth?: number } = {}) {
  const max = options.max ?? 5000;
  const depthLimit = options.depth ?? 8;
  const exts = options.exts || /\.(md|txt|json|jsonl|ya?ml|ts|tsx|js|jsx|mjs|css)$/i;
  const out: string[] = [];
  async function walk(dir: string, depth: number) {
    if (out.length >= max || depth > depthLimit) return;
    let entries: fs.Dirent[];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (out.length >= max) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (/^(\.git|node_modules|dist|build|target|\.cache|\.vite)$/.test(entry.name)) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile() && exts.test(entry.name)) {
        out.push(full);
      }
    }
  }
  await walk(root, 0);
  return out;
}
