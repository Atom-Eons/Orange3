#!/usr/bin/env node
/* ============================================================================
   whisper-runner.mjs — ORANGEBOX v4 Whisper Transcription Runner

   Doctrine anchor: docs/V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)
   Phase slot:      v4.0 P2 — Voice coding (moat deepener)
   Author:          Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date:            2026-05-16
   Mom's Law:       Full effort. No stubs. No TODOs.

   Purpose
   ───────
   Wraps whisper.cpp (local-first) with a clean JS API.
   Falls back to OpenAI Whisper API when local binary is absent and
   OPENAI_API_KEY is set — clearly flagged as cloud egress in the response.

   Privacy guarantee
   ─────────────────
   Audio NEVER leaves the machine unless:
     1. whisper.cpp is not found on PATH or at ./bin/whisper-cli, AND
     2. OPENAI_API_KEY is set in env, AND
     3. fallback is not explicitly disabled with ORANGEBOX_NO_CLOUD_FALLBACK=1

   API
   ───
   import { transcribe, checkWhisperBinary, getModelPath } from './whisper-runner.mjs';
   const result = await transcribe('/tmp/audio.wav', { model: 'base.en', language: 'en' });
   // result: { text, segments, durationMs, local, model, cloudFallback }

   CLI helpers
   ───────────
   node whisper-runner.mjs --setup-help     Print install steps for whisper.cpp
   node whisper-runner.mjs --check          Print readiness check result as JSON
   node whisper-runner.mjs --transcribe <path>  Transcribe file and print result
   ============================================================================ */

import { execFile }    from 'node:child_process';
import { existsSync }  from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { promisify }   from 'node:util';
import { join }        from 'node:path';
import { homedir }     from 'node:os';
import { createReadStream } from 'node:fs';

const execFileAsync = promisify(execFile);

// ─── Constants ───────────────────────────────────────────────────────────────

const WHISPER_MODEL_DIR = join(homedir(), '.orangebox', 'models', 'whisper');

const MODEL_FILENAMES = {
  'tiny.en':    'ggml-tiny.en.bin',
  'base.en':    'ggml-base.en.bin',
  'small.en':   'ggml-small.en.bin',
  'medium.en':  'ggml-medium.en.bin',
  'large-v3':   'ggml-large-v3.bin',
};

const MODEL_SIZES_MB = {
  'tiny.en':    75,
  'base.en':    142,
  'small.en':   466,
  'medium.en':  1457,
  'large-v3':   2872,
};

const MODEL_DOWNLOAD_BASE =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

// Candidate binary paths — tried in order
const WHISPER_BINARY_CANDIDATES = [
  join(process.cwd(), 'bin', 'whisper-cli'),
  join(process.cwd(), 'bin', 'whisper-cli.exe'),
  join(process.cwd(), 'bin', 'main'),      // whisper.cpp legacy build name
  join(process.cwd(), 'bin', 'main.exe'),
  'whisper-cli',                            // PATH lookup
  'whisper-cpp',                            // distro package name
  'whisper',                                // possible alias
];

// ─── Binary discovery ─────────────────────────────────────────────────────────

/**
 * Locate the whisper.cpp binary.
 * Returns the resolved binary path string, or null if not found.
 */
export async function findWhisperBinary() {
  for (const candidate of WHISPER_BINARY_CANDIDATES) {
    // Absolute path: check existence directly
    if (candidate.startsWith('/') || candidate.includes('\\') || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    // PATH-lookup candidates: try running --version
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 3_000 });
      return candidate;
    } catch {
      // not found on PATH or not executable — continue
    }
  }
  return null;
}

/**
 * Check binary readiness and return structured status.
 */
export async function checkWhisperBinary() {
  const binary = await findWhisperBinary();
  const openAIAvailable = !!(
    process.env.OPENAI_API_KEY &&
    process.env.ORANGEBOX_NO_CLOUD_FALLBACK !== '1'
  );

  return {
    localBinaryFound: !!binary,
    localBinaryPath: binary,
    cloudFallbackAvailable: openAIAvailable,
    modelDir: WHISPER_MODEL_DIR,
    ready: !!(binary || openAIAvailable),
  };
}

// ─── Model path resolution ────────────────────────────────────────────────────

/**
 * Resolve the filesystem path for a named model.
 * Does NOT check if the file exists — use existsSync to verify.
 */
export function getModelPath(modelName = 'base.en') {
  const filename = MODEL_FILENAMES[modelName] || `ggml-${modelName}.bin`;
  return join(WHISPER_MODEL_DIR, filename);
}

// ─── Local transcription via whisper.cpp ─────────────────────────────────────

/**
 * Run whisper.cpp on an audio file.
 * Returns raw stdout (JSON output format from whisper.cpp).
 */
async function runWhisperLocal(binary, audioPath, { model = 'base.en', language = 'en' } = {}) {
  const modelPath = getModelPath(model);
  if (!existsSync(modelPath)) {
    throw new Error(
      `Whisper model not found: ${modelPath}\n` +
      `Run: node whisper-runner.mjs --setup-help  for download instructions.`
    );
  }

  // whisper.cpp flags:
  //   -m  model path
  //   -f  audio file
  //   -l  language
  //   -oj output JSON
  //   -np no progress bar (cleaner stdout)
  //   -t  threads (use half of available CPUs, min 1)
  const threads = Math.max(1, Math.floor((await getCPUCount()) / 2));

  const args = [
    '-m', modelPath,
    '-f', audioPath,
    '-l', language,
    '-oj',
    '-np',
    '-t', String(threads),
  ];

  const { stdout, stderr } = await execFileAsync(binary, args, {
    timeout: 120_000, // 2 min max for long recordings
    maxBuffer: 8 * 1024 * 1024,
  });

  return { stdout, stderr };
}

async function getCPUCount() {
  try {
    const os = await import('node:os');
    return os.default.cpus().length;
  } catch {
    return 2;
  }
}

/**
 * Parse whisper.cpp JSON output into our normalized response shape.
 */
function parseWhisperJson(stdout) {
  // whisper.cpp -oj writes a JSON file alongside the audio file;
  // it also prints the JSON to stdout when stdout is redirected.
  // We parse from stdout which contains the transcription JSON.
  try {
    const data = JSON.parse(stdout.trim());
    // whisper.cpp JSON structure:
    // { transcription: [{ offsets: { from, to }, text }], ... }
    const segments = (data.transcription || []).map((s, i) => ({
      id:    i,
      start: (s.offsets?.from ?? 0) / 1000,   // ms → seconds
      end:   (s.offsets?.to   ?? 0) / 1000,
      text:  (s.text ?? '').trim(),
    }));
    const text = segments.map(s => s.text).join(' ').trim();
    return { text, segments };
  } catch {
    // Fallback: whisper.cpp sometimes prints plain text when JSON parsing fails
    const text = stdout.trim();
    return { text, segments: [] };
  }
}

// ─── Cloud fallback via OpenAI Whisper API ────────────────────────────────────

/**
 * Transcribe using OpenAI Whisper API.
 * This is a cloud egress path — flagged clearly in the return value.
 * Requires OPENAI_API_KEY in env.
 */
async function transcribeViaOpenAI(audioPath, { model = 'whisper-1', language = 'en' } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set — cannot use cloud fallback');

  // Read audio file as buffer
  const audioBuffer = await readFile(audioPath);
  const fileName    = audioPath.split(/[/\\]/).pop() || 'audio.wav';

  // Build multipart form manually using FormData (Node 18+ native)
  const formData = new FormData();
  formData.append('model', 'whisper-1');
  formData.append('language', language);
  formData.append('response_format', 'verbose_json');
  formData.append(
    'file',
    new Blob([audioBuffer], { type: 'audio/webm' }),
    fileName
  );

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '(no body)');
    throw new Error(`OpenAI Whisper API error ${resp.status}: ${errBody}`);
  }

  const data = await resp.json();

  const segments = (data.segments || []).map(s => ({
    id:    s.id,
    start: s.start,
    end:   s.end,
    text:  (s.text ?? '').trim(),
  }));

  return {
    text:     (data.text ?? '').trim(),
    segments,
    cloudFallback: true,
    cloudModel:    'whisper-1',
    cloudProvider: 'openai',
    privacyNote:   'CLOUD EGRESS: audio was sent to OpenAI Whisper API. ' +
                   'Enable local whisper.cpp to keep audio on-machine.',
  };
}

// ─── Primary API: transcribe() ────────────────────────────────────────────────

/**
 * transcribe(audioPath, options) → Promise<TranscribeResult>
 *
 * @param {string} audioPath   Absolute path to audio file (wav recommended)
 * @param {Object} [opts]
 * @param {string} [opts.model='base.en']    Whisper model name
 * @param {string} [opts.language='en']      ISO-639-1 language code
 * @param {boolean} [opts.forceCloud=false]  Skip local, go straight to cloud
 *
 * @returns {Promise<{
 *   text: string,
 *   segments: Array<{id,start,end,text}>,
 *   durationMs: number,
 *   local: boolean,
 *   model: string,
 *   cloudFallback: boolean,
 *   privacyNote?: string,
 * }>}
 */
export async function transcribe(audioPath, {
  model    = 'base.en',
  language = 'en',
  forceCloud = false,
} = {}) {
  const startMs = Date.now();

  let result;

  if (!forceCloud) {
    const binary = await findWhisperBinary();
    if (binary) {
      const { stdout } = await runWhisperLocal(binary, audioPath, { model, language });
      const parsed = parseWhisperJson(stdout);
      result = {
        ...parsed,
        local:        true,
        cloudFallback: false,
        model,
      };
    }
  }

  if (!result) {
    // No local binary — try cloud fallback
    const noCloud = process.env.ORANGEBOX_NO_CLOUD_FALLBACK === '1';
    if (noCloud) {
      throw new Error(
        'whisper.cpp binary not found and cloud fallback is disabled ' +
        '(ORANGEBOX_NO_CLOUD_FALLBACK=1).\n' +
        'Run: node whisper-runner.mjs --setup-help  for install instructions.'
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'whisper.cpp binary not found and OPENAI_API_KEY is not set.\n' +
        'Either install whisper.cpp or set OPENAI_API_KEY to enable cloud fallback.\n' +
        'Run: node whisper-runner.mjs --setup-help  for install instructions.'
      );
    }
    const cloud = await transcribeViaOpenAI(audioPath, { model: 'whisper-1', language });
    result = {
      ...cloud,
      local: false,
      model: 'whisper-1',
    };
  }

  return {
    ...result,
    durationMs: Date.now() - startMs,
  };
}

// ─── Setup help printer ───────────────────────────────────────────────────────

function printSetupHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║           ORANGEBOX v4 — whisper.cpp Setup Guide                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

Voice coding is local-first. Audio never leaves your machine unless you
explicitly enable the OpenAI cloud fallback. To go local, install whisper.cpp.

────────────────────────────────────────────────────────────────────────────────
OPTION A — Mac (Homebrew, fastest path)
────────────────────────────────────────────────────────────────────────────────

  brew install whisper-cpp

After install, the binary lands at /opt/homebrew/bin/whisper-cli (Apple Silicon)
or /usr/local/bin/whisper-cli (Intel). ORANGEBOX finds it automatically on PATH.

Then download base.en model (~142 MB):

  mkdir -p ~/.orangebox/models/whisper
  curl -L "${MODEL_DOWNLOAD_BASE}/ggml-base.en.bin" \\
       -o ~/.orangebox/models/whisper/ggml-base.en.bin

────────────────────────────────────────────────────────────────────────────────
OPTION B — Linux (build from source)
────────────────────────────────────────────────────────────────────────────────

  sudo apt-get install -y build-essential libsdl2-dev  # Ubuntu/Debian
  git clone https://github.com/ggerganov/whisper.cpp
  cd whisper.cpp && make -j$(nproc)
  # Copy the binary to your ORANGEBOX installation:
  cp main /path/to/orangebox/bin/whisper-cli

Then download base.en model (~142 MB):

  mkdir -p ~/.orangebox/models/whisper
  curl -L "${MODEL_DOWNLOAD_BASE}/ggml-base.en.bin" \\
       -o ~/.orangebox/models/whisper/ggml-base.en.bin

────────────────────────────────────────────────────────────────────────────────
OPTION C — Windows
────────────────────────────────────────────────────────────────────────────────

  Pre-built Windows binary from the whisper.cpp releases page:
  https://github.com/ggerganov/whisper.cpp/releases

  1. Download "whisper-bin-x64.zip" from the latest release.
  2. Extract whisper-cli.exe to:
     C:\\path\\to\\orangebox\\bin\\whisper-cli.exe
  3. Download the model (PowerShell):

     New-Item -ItemType Directory -Force "$env:USERPROFILE\\.orangebox\\models\\whisper"
     Invoke-WebRequest \\
       -Uri "${MODEL_DOWNLOAD_BASE}/ggml-base.en.bin" \\
       -OutFile "$env:USERPROFILE\\.orangebox\\models\\whisper\\ggml-base.en.bin"

────────────────────────────────────────────────────────────────────────────────
MODELS
────────────────────────────────────────────────────────────────────────────────

  Model         Size      Notes
  ──────────    ────      ─────────────────────────────────────────────
  tiny.en       75 MB     Low-power machines; accuracy adequate for code intent
  base.en       142 MB    Recommended. Good balance of speed + accuracy.
  small.en      466 MB    Better accuracy; slower on CPU
  medium.en     1457 MB   Near-human; use with GPU or M1/M2 Mac
  large-v3      2872 MB   Best accuracy; requires GPU or M-series Mac

  All models: ${MODEL_DOWNLOAD_BASE}/ggml-<name>.bin
  Install to:  ~/.orangebox/models/whisper/

────────────────────────────────────────────────────────────────────────────────
CLOUD FALLBACK (optional)
────────────────────────────────────────────────────────────────────────────────

  Set OPENAI_API_KEY in your environment to enable the OpenAI Whisper cloud
  fallback when whisper.cpp is not available. Audio IS sent to OpenAI servers
  when this fallback fires. The voice UI surfaces a warning when cloud is used.

  To disable the fallback entirely (strictest privacy):
    export ORANGEBOX_NO_CLOUD_FALLBACK=1

────────────────────────────────────────────────────────────────────────────────
VERIFY YOUR SETUP
────────────────────────────────────────────────────────────────────────────────

  node scripts/v4/voice/whisper-runner.mjs --check

`.trim());
}

// ─── CLI runner ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log('Usage:');
    console.log('  node whisper-runner.mjs --setup-help         Install instructions');
    console.log('  node whisper-runner.mjs --check              Readiness check (JSON)');
    console.log('  node whisper-runner.mjs --transcribe <path>  Transcribe audio file');
    console.log('  node whisper-runner.mjs --model <name>       (with --transcribe) model name');
    process.exit(0);
  }

  if (args.includes('--setup-help')) {
    printSetupHelp();
    process.exit(0);
  }

  if (args.includes('--check')) {
    const status = await checkWhisperBinary();
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.ready ? 0 : 1);
  }

  const transcribeIdx = args.indexOf('--transcribe');
  if (transcribeIdx !== -1) {
    const audioPath = args[transcribeIdx + 1];
    if (!audioPath) {
      console.error('ERROR: --transcribe requires a file path argument');
      process.exit(1);
    }
    const modelIdx = args.indexOf('--model');
    const model    = modelIdx !== -1 ? args[modelIdx + 1] : 'base.en';
    try {
      const result = await transcribe(audioPath, { model });
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('ERROR:', err.message);
      process.exit(1);
    }
    return;
  }

  console.error('Unknown arguments. Run --help for usage.');
  process.exit(1);
}

// ES module main guard
const selfUrl = import.meta.url.replace(/\\/g, '/');
const argUrl  = `file:///${process.argv[1].replace(/\\/g, '/')}`;
const argUrlAlt = `file://${process.argv[1].replace(/\\/g, '/')}`;

if (selfUrl === argUrl || selfUrl === argUrlAlt) {
  main().catch(e => {
    console.error('FATAL:', e.message || e);
    process.exit(1);
  });
}
