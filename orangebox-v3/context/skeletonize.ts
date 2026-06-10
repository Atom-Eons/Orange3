import fs from "node:fs";
import path from "node:path";
import { argValue, fileHash, isMain, repoRoot, sha256, writeJson, writeReceipt } from "../lib/core.ts";

function lineOf(text: string, index: number) {
  return text.slice(0, index).split(/\r?\n/).length;
}

export async function skeletonizeFile(args = process.argv.slice(2)) {
  const rel = argValue(args, "--file", args[0] || "");
  if (!rel) return { ok: false, status: "SKELETON_FILE_REQUIRED" };
  const file = path.resolve(repoRoot, rel);
  if (!file.startsWith(repoRoot) || !fs.existsSync(file)) return { ok: false, status: "SKELETON_FILE_NOT_FOUND", file };
  const text = fs.readFileSync(file, "utf8");
  const exports = [...text.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_]+)/g)].map((m) => ({ name: m[1], line: lineOf(text, m.index || 0) }));
  const components = [...text.matchAll(/\bfunction\s+([A-Z][A-Za-z0-9_]*)\s*\(|\bconst\s+([A-Z][A-Za-z0-9_]*)\s*=/g)].map((m) => ({ name: m[1] || m[2], line: lineOf(text, m.index || 0) }));
  const imports = [...text.matchAll(/^\s*import\s+(.+?)\s+from\s+["'](.+?)["']/gm)].map((m) => ({ spec: m[1], from: m[2], line: lineOf(text, m.index || 0) }));
  const hooks = [...text.matchAll(/\buse[A-Z][A-Za-z0-9_]+\b/g)].map((m) => ({ name: m[0], line: lineOf(text, m.index || 0) }));
  const types = [...text.matchAll(/\b(?:interface|type)\s+([A-Za-z0-9_]+)/g)].map((m) => ({ name: m[1], line: lineOf(text, m.index || 0) }));
  const skeleton = {
    ok: true,
    status: "AST_SKELETON_READY",
    file: rel,
    absolute_file: file,
    hash: await fileHash(file),
    skeleton_hash: sha256(JSON.stringify({ exports, components, imports, hooks, types })),
    parser: "v3-regex-skeleton-compatible-tree-sitter-contract",
    exports,
    components,
    imports,
    hooks,
    props: types,
    lineRanges: [...exports, ...components].map((item) => ({ name: item.name, start: item.line, end: item.line })),
    domSourceTargets: [],
  };
  const out = path.join(repoRoot, "orangebox-v3", "context", "latest-skeleton.json");
  await writeJson(out, skeleton);
  const receipt = await writeReceipt("ast-skeleton", { ...skeleton, skeleton_path: out });
  return { ...skeleton, skeleton_path: out, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  skeletonizeFile().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "SKELETON_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
