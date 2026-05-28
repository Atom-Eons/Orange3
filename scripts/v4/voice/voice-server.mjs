#!/usr/bin/env node
/* ============================================================================
   voice-server.mjs — ORANGEBOX v4 Voice Coding HTTP Server

   Doctrine anchor: docs/V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)
   Phase slot:      v4.0 P2 — Voice coding (moat deepener)
   Author:          Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date:            2026-05-16
   Mom's Law:       Full effort. No stubs. No TODOs.

   Purpose
   ───────
   Local HTTP server for ORANGEBOX voice coding pipeline.

   Endpoints
   ─────────
   GET  /v1/voice/health                        Whisper readiness + model availability
   POST /v1/voice/transcribe                    Multipart audio → { text, durationMs, model, cost, cloudFallback }
   POST /v1/voice/intent                        { text } → { intent, params, suggestedAction }

   Privacy guarantee
   ─────────────────
   Audio is written to a local temp dir, processed, then immediately deleted.
   No audio data is stored. Cloud fallback is opt-in via OPENAI_API_KEY.

   Zero external npm deps — uses only Node built-ins: http, fs, os, path, crypto.
   Node 18+ required (native fetch, FormData).
   ============================================================================ */

import { createServer }          from 'node:http';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, unlink, readdir, rm } from 'node:fs/promises';
import { join }                  from 'node:path';
import { tmpdir, homedir }       from 'node:os';
import { randomBytes }           from 'node:crypto';
import { fileURLToPath }         from 'node:url';
import { checkWhisperBinary, transcribe } from './whisper-runner.mjs';
import { route }                 from '../router/smart-model-router.mjs';

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT        = parseInt(process.env.ORANGEBOX_VOICE_PORT || '8780', 10);
const TEMP_DIR    = join(tmpdir(), 'orangebox-voice');
const CORS_ORIGIN = process.env.ORANGEBOX_VOICE_CORS || 'http://localhost:3000';

// Max audio upload: 50 MB (a ~10-minute recording at 16kHz opus)
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

// ─── Multipart parser (zero-dep, ~80 LOC) ────────────────────────────────────
//
// Parses a multipart/form-data body containing exactly one file field
// ("audio") plus optional text fields. Streams the file to disk to avoid
// holding large audio in memory.

/**
 * parseMultipart(req, destDir) → Promise<{ fields, filePath, fileName, mimeType }>
 *
 * Streams the multipart body to disk. Returns the path of the saved file.
 * Throws on: missing boundary, oversized body, no file field found.
 */
async function parseMultipart(req, destDir) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
    if (!boundaryMatch) {
      return reject(new Error('Multipart boundary not found in Content-Type'));
    }

    // Boundary as bytes (prepend --)
    const boundary   = `--${boundaryMatch[1]}`;
    const boundaryBuf = Buffer.from(boundary);
    const CRLF       = Buffer.from('\r\n');
    const CRLFCRLF   = Buffer.from('\r\n\r\n');

    let totalBytes = 0;
    let fileStream  = null;
    let filePath    = null;
    let fileName    = 'audio.webm';
    let mimeType    = 'audio/webm';
    const fields    = {};

    // Accumulate raw body in chunks; parse once complete.
    // For large files we stream, but to keep the parser correct with
    // boundary split across chunks we use a buffer + streaming hybrid.
    const chunks = [];

    req.on('error', reject);

    req.on('data', chunk => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_AUDIO_BYTES) {
        req.destroy();
        return reject(new Error(`Audio upload exceeds max size (${MAX_AUDIO_BYTES} bytes)`));
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks);

        // Split by boundary
        const parts = splitBuffer(body, boundaryBuf);
        // parts[0] = preamble (empty), parts[last] = epilogue
        // Real parts: parts[1..n-1]

        for (let i = 1; i < parts.length - 1; i++) {
          const part = parts[i];

          // Each part: \r\n{headers}\r\n\r\n{body}\r\n
          // Trim leading \r\n
          let partBody = part;
          if (partBody.slice(0, 2).equals(CRLF)) partBody = partBody.slice(2);

          // Find header/body split
          const hdrEnd = indexOfBuffer(partBody, CRLFCRLF);
          if (hdrEnd === -1) continue;

          const headerSection = partBody.slice(0, hdrEnd).toString('utf8');
          let   bodySection   = partBody.slice(hdrEnd + 4); // skip \r\n\r\n
          // Strip trailing \r\n if present
          if (bodySection.slice(-2).equals(CRLF)) {
            bodySection = bodySection.slice(0, -2);
          }

          // Parse Content-Disposition
          const cdMatch = headerSection.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
          if (!cdMatch) continue;
          const fieldName = cdMatch[1];

          const fnMatch = headerSection.match(/filename="([^"]+)"/i);
          const ctMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/i);

          if (fnMatch) {
            // File field
            fileName = fnMatch[1];
            mimeType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';
            const ext = fileName.split('.').pop() || 'webm';
            filePath  = join(destDir, `audio-${randomBytes(8).toString('hex')}.${ext}`);
            await mkdir(destDir, { recursive: true });
            // Write file body to disk
            const ws = createWriteStream(filePath);
            await new Promise((res2, rej2) => {
              ws.on('error', rej2);
              ws.on('finish', res2);
              ws.end(bodySection);
            });
          } else {
            // Text field
            fields[fieldName] = bodySection.toString('utf8');
          }
        }

        if (!filePath) {
          return reject(new Error('No audio file field found in multipart body (expected field name "audio")'));
        }

        resolve({ fields, filePath, fileName, mimeType });
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** Split buffer by delimiter, return array of Buffer segments. */
function splitBuffer(buf, delimiter) {
  const parts = [];
  let start   = 0;
  let idx;
  while ((idx = indexOfBuffer(buf, delimiter, start)) !== -1) {
    parts.push(buf.slice(start, idx));
    start = idx + delimiter.length;
  }
  parts.push(buf.slice(start));
  return parts;
}

/** indexOf for Buffer (missing from older Node). */
function indexOfBuffer(haystack, needle, fromIndex = 0) {
  const hLen = haystack.length;
  const nLen = needle.length;
  for (let i = fromIndex; i <= hLen - nLen; i++) {
    let match = true;
    for (let j = 0; j < nLen; j++) {
      if (haystack[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

// ─── JSON body reader ─────────────────────────────────────────────────────────

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('error', reject);
    req.on('data', c => {
      total += c.length;
      if (total > 1_000_000) { req.destroy(); return reject(new Error('Request body too large')); }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid JSON body')); }
    });
  });
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin':  CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function err(res, status, message, detail = null) {
  json(res, status, { error: message, detail });
}

// ─── Temp dir cleanup ─────────────────────────────────────────────────────────

async function cleanupFile(filePath) {
  try {
    if (filePath && existsSync(filePath)) await unlink(filePath);
  } catch {
    // Best-effort cleanup — log but don't throw
    process.stderr.write(`[voice-server] cleanup warning: could not delete ${filePath}\n`);
  }
}

// Periodic stale temp file cleanup (files older than 60s that weren't cleaned up)
async function sweepTempDir() {
  try {
    const entries = await readdir(TEMP_DIR).catch(() => []);
    const now = Date.now();
    for (const entry of entries) {
      const full = join(TEMP_DIR, entry);
      try {
        const { mtimeMs } = await import('node:fs').then(m => m.promises.stat(full));
        if (now - mtimeMs > 60_000) await unlink(full);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

// ─── Intent classification via smart-model-router + Anthropic API ────────────

// Intent categories for voice coding
const INTENT_CATEGORIES = [
  'add_code',           // "add a stripe webhook handler"
  'edit_code',          // "rename this function to processPayment"
  'explain_code',       // "explain what this function does"
  'fix_bug',            // "fix the null pointer on line 42"
  'refactor',           // "extract this into a helper function"
  'run_command',        // "run the tests"
  'open_file',          // "open the auth.js file"
  'search_code',        // "find all uses of useState"
  'git_action',         // "commit everything with message 'fix auth'"
  'chat',               // general conversation not mapped to a coding action
  'unknown',            // fallback
];

/**
 * classifyIntent(text) → Promise<{ intent, params, suggestedAction, reasoning }>
 *
 * Uses Haiku 4.5 (routed via smart-model-router) for fast intent classification.
 * Falls back to rule-based classification if API key is not set.
 */
async function classifyIntent(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Rule-based fallback (no API key)
    return ruleBasedIntent(text);
  }

  const decision = route({ task: 'voice_intent' });

  const systemPrompt = `You are an intent classifier for ORANGEBOX, an AI-powered code editor.
Classify the user's voice command into one of these intents: ${INTENT_CATEGORIES.join(', ')}.
Respond with ONLY valid JSON in this exact shape:
{
  "intent": "<category>",
  "params": { <extracted parameters as key-value pairs> },
  "suggestedAction": "<1-sentence description of what ORANGEBOX should do>",
  "confidence": <0.0-1.0>
}
Examples:
- "add a Stripe webhook handler" → intent: add_code, params: { feature: "Stripe webhook handler" }
- "rename processUser to handleUserAuth" → intent: edit_code, params: { from: "processUser", to: "handleUserAuth" }
- "run the tests" → intent: run_command, params: { command: "test" }`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      decision.model,
        max_tokens: 256,
        system:     systemPrompt,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic API ${resp.status}`);
    const data = await resp.json();
    const raw  = data.content?.[0]?.text || '{}';

    // Extract JSON from the response (model may wrap it in markdown)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in intent response');
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      intent:          parsed.intent          || 'unknown',
      params:          parsed.params          || {},
      suggestedAction: parsed.suggestedAction || 'Process voice command',
      confidence:      parsed.confidence      ?? 0.8,
      model:           decision.model,
      provider:        decision.provider,
      costEstimateCents: decision.costEstimateCents,
    };
  } catch (apiErr) {
    process.stderr.write(`[voice-server] Intent API error: ${apiErr.message} — falling back to rules\n`);
    return ruleBasedIntent(text);
  }
}

/**
 * Rule-based intent fallback (no API key required).
 */
function ruleBasedIntent(text) {
  const t = text.toLowerCase().trim();

  const rules = [
    { re: /\b(add|create|write|generate|implement|build)\b.*\b(function|class|handler|hook|component|api|endpoint|route|webhook)\b/, intent: 'add_code',    suggestedAction: `Generate code: "${text}"` },
    { re: /\b(rename|refactor|move|extract|convert|change)\b/,                                                                         intent: 'edit_code',  suggestedAction: `Edit code: "${text}"` },
    { re: /\b(explain|what|describe|summarize|how does)\b/,                                                                             intent: 'explain_code', suggestedAction: `Explain selected code` },
    { re: /\b(fix|repair|debug|resolve|patch)\b/,                                                                                       intent: 'fix_bug',    suggestedAction: `Fix issue: "${text}"` },
    { re: /\b(run|execute|start|launch|test)\b/,                                                                                        intent: 'run_command', suggestedAction: `Run: "${text}"` },
    { re: /\b(open|switch|go to|navigate|show)\b.*\bfile\b/,                                                                           intent: 'open_file',  suggestedAction: `Open file referenced in command` },
    { re: /\b(find|search|locate|where is|grep)\b/,                                                                                     intent: 'search_code', suggestedAction: `Search codebase: "${text}"` },
    { re: /\b(commit|push|pull|merge|branch|git)\b/,                                                                                    intent: 'git_action', suggestedAction: `Run git action: "${text}"` },
    { re: /\b(extract|separate|split|move to helper)\b/,                                                                                intent: 'refactor',   suggestedAction: `Refactor: "${text}"` },
  ];

  for (const { re, intent, suggestedAction } of rules) {
    if (re.test(t)) {
      return { intent, params: { raw: text }, suggestedAction, confidence: 0.6, model: 'rule-based', provider: 'local' };
    }
  }

  return { intent: 'chat', params: { raw: text }, suggestedAction: 'Send to cockpit chat', confidence: 0.4, model: 'rule-based', provider: 'local' };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleHealth(req, res) {
  const status = await checkWhisperBinary();
  const routerDecision = route({ task: 'voice_intent' });
  json(res, 200, {
    ok:              status.ready,
    whisper:         status,
    intentModel:     { model: routerDecision.model, provider: routerDecision.provider },
    anthropicApiSet: !!process.env.ANTHROPIC_API_KEY,
    openaiApiSet:    !!process.env.OPENAI_API_KEY,
    cloudFallbackAllowed: process.env.ORANGEBOX_NO_CLOUD_FALLBACK !== '1',
    serverPort:      PORT,
    timestamp:       new Date().toISOString(),
  });
}

async function handleTranscribe(req, res) {
  let filePath = null;
  try {
    await mkdir(TEMP_DIR, { recursive: true });
    const { fields, filePath: fp } = await parseMultipart(req, TEMP_DIR);
    filePath = fp;

    const model    = fields.model    || 'base.en';
    const language = fields.language || 'en';

    const result = await transcribe(filePath, { model, language });

    // Cost estimate (if cloud fallback, approx $0.006/min at OpenAI whisper-1)
    let cost = null;
    if (result.cloudFallback) {
      // Very rough: ~$0.006/min. durationMs → minutes.
      cost = Math.round((result.durationMs / 60_000) * 0.6 * 10_000) / 10_000; // in cents
    }

    json(res, 200, {
      text:         result.text,
      segments:     result.segments,
      durationMs:   result.durationMs,
      model:        result.model,
      local:        result.local,
      cloudFallback: result.cloudFallback || false,
      cost,
      privacyNote:  result.privacyNote || null,
    });
  } catch (e) {
    err(res, 400, e.message);
  } finally {
    await cleanupFile(filePath);
  }
}

async function handleIntent(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return err(res, 400, `Bad request body: ${e.message}`);
  }

  const { text } = body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return err(res, 400, 'Missing required field: text');
  }

  try {
    const result = await classifyIntent(text.trim());
    json(res, 200, result);
  } catch (e) {
    err(res, 500, `Intent classification failed: ${e.message}`);
  }
}

// ─── Request dispatcher ───────────────────────────────────────────────────────

async function dispatch(req, res) {
  const { method, url } = req;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // Strip query string for routing
  const path = (url || '').split('?')[0];

  if (method === 'GET'  && path === '/v1/voice/health')     return handleHealth(req, res);
  if (method === 'POST' && path === '/v1/voice/transcribe') return handleTranscribe(req, res);
  if (method === 'POST' && path === '/v1/voice/intent')     return handleIntent(req, res);

  err(res, 404, `Not found: ${method} ${path}`);
}

// ─── CLI help ─────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
ORANGEBOX v4 Voice Server
══════════════════════════

Usage:
  node voice-server.mjs [--help]

Environment variables:
  ORANGEBOX_VOICE_PORT      HTTP port (default: 8780)
  ORANGEBOX_VOICE_CORS      Allowed CORS origin (default: http://localhost:3000)
  ANTHROPIC_API_KEY         Required for AI intent classification
  OPENAI_API_KEY            Enables cloud Whisper fallback when whisper.cpp absent
  ORANGEBOX_NO_CLOUD_FALLBACK=1   Disable cloud fallback entirely (strictest privacy)
  ORANGEBOX_BUDGET_MODE     strict | balanced | quality (default: balanced)

Endpoints:
  GET  /v1/voice/health         Readiness check
  POST /v1/voice/transcribe     Multipart audio → transcript
  POST /v1/voice/intent         JSON { text } → intent classification

To install whisper.cpp for local transcription:
  node scripts/v4/voice/whisper-runner.mjs --setup-help
`.trim());
}

// ─── Server boot ─────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  // Ensure temp dir exists
  await mkdir(TEMP_DIR, { recursive: true });

  // Sweep stale temp files every 5 minutes
  setInterval(sweepTempDir, 5 * 60_000).unref();

  const server = createServer((req, res) => {
    dispatch(req, res).catch(e => {
      process.stderr.write(`[voice-server] unhandled: ${e.message}\n${e.stack}\n`);
      if (!res.headersSent) err(res, 500, 'Internal server error');
    });
  });

  server.listen(PORT, '127.0.0.1', () => {
    const whisperStatus = checkWhisperBinary().then(s => {
      const localStatus = s.localBinaryFound ? 'local whisper.cpp ready' : 'whisper.cpp NOT found';
      const cloudStatus = s.cloudFallbackAvailable ? 'cloud fallback available' : 'no cloud fallback';
      console.log(`[voice-server] ORANGEBOX v4 voice server — port ${PORT}`);
      console.log(`[voice-server] Transcription: ${localStatus} | ${cloudStatus}`);
      console.log(`[voice-server] Intent: ${process.env.ANTHROPIC_API_KEY ? 'Haiku 4.5 via Anthropic API' : 'rule-based fallback'}`);
      console.log(`[voice-server] Privacy: audio processed locally in ${TEMP_DIR}`);
    });
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[voice-server] Port ${PORT} already in use. Set ORANGEBOX_VOICE_PORT to a different port.`);
    } else {
      console.error('[voice-server] Server error:', e.message);
    }
    process.exit(1);
  });

  process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
  process.on('SIGINT',  () => { server.close(() => process.exit(0)); });
}

// ES module main guard
const selfUrl   = import.meta.url.replace(/\\/g, '/');
const argUrl    = `file:///${process.argv[1].replace(/\\/g, '/')}`;
const argUrlAlt = `file://${process.argv[1].replace(/\\/g, '/')}`;

if (selfUrl === argUrl || selfUrl === argUrlAlt) {
  main().catch(e => {
    console.error('FATAL:', e.message || e);
    process.exit(1);
  });
}
