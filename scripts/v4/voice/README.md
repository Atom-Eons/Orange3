# ORANGEBOX v4 — Voice Coding

Doctrine anchor: `docs/V4_MOAT_DOCTRINE.md` (ATOM-OBX-V4-MOAT-2026-0516)
Phase: v4.0 P2 — Voice coding (moat deepener #13)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OPERATOR'S MACHINE                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Browser (voice.html / voice.js)                        │   │
│  │                                                         │   │
│  │  MediaRecorder (16kHz mono webm/opus)                   │   │
│  │         │                                               │   │
│  │         │ POST /v1/voice/transcribe (multipart)         │   │
│  │         ▼                                               │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  voice-server.mjs   (port 8780)                 │   │   │
│  │  │                                                 │   │   │
│  │  │  parseMultipart → temp file → whisper-runner   │   │   │
│  │  │         │                                       │   │   │
│  │  │  ┌──────▼──────────────────────────────────┐   │   │   │
│  │  │  │  whisper-runner.mjs                     │   │   │   │
│  │  │  │                                         │   │   │   │
│  │  │  │  Local:  ./bin/whisper-cli  (preferred) │   │   │   │
│  │  │  │  Cloud:  OpenAI Whisper API (opt-in ⚠)  │   │   │   │
│  │  │  └─────────────────────────────────────────┘   │   │   │
│  │  │         │                                       │   │   │
│  │  │  { text, segments, durationMs, local }          │   │   │
│  │  │         │                                       │   │   │
│  │  │  POST /v1/voice/intent                          │   │   │
│  │  │         │                                       │   │   │
│  │  │  smart-model-router → Haiku 4.5 intent classify │   │   │
│  │  │         │                                       │   │   │
│  │  │  { intent, params, suggestedAction }            │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │         │                                               │   │
│  │  Browser streams response from Anthropic API            │   │
│  │  (Sonnet 4.5 for code generation, direct SSE stream)    │   │
│  │         │                                               │   │
│  │  UI: transcript + intent chip + agent response          │   │
│  │      Action buttons: Apply / Terminal / Copy / Discard  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ⚠  Cloud path: only if whisper.cpp NOT found                  │
│     AND OPENAI_API_KEY is set                                   │
│     AND ORANGEBOX_NO_CLOUD_FALLBACK != 1                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files

| File | Purpose |
|---|---|
| `scripts/v4/voice/voice-server.mjs` | Local HTTP server (port 8780). Transcribe + intent endpoints. |
| `scripts/v4/voice/whisper-runner.mjs` | whisper.cpp wrapper + OpenAI cloud fallback. |
| `src/v4/voice/voice.html` | UI shell. |
| `src/v4/voice/voice.js` | Recording, waveform, pipeline, streaming response. |
| `src/v4/voice/voice.css` | McLaren F1 dark premium aesthetic. |

---

## Privacy guarantee

**Audio NEVER leaves your machine** unless:

1. `whisper.cpp` is not found (neither on PATH nor at `./bin/whisper-cli`), **AND**
2. `OPENAI_API_KEY` is set in your environment, **AND**
3. `ORANGEBOX_NO_CLOUD_FALLBACK` is not set to `1`

When cloud fallback fires, the UI shows an amber `CLOUD` badge on the transcript,
and a clear warning is surfaced. The privacy dashboard (v3.9) will log this as
an API egress event.

To enforce strict local-only mode:
```
ORANGEBOX_NO_CLOUD_FALLBACK=1
```

Verify your setup at any time:
```
node scripts/v4/voice/whisper-runner.mjs --check
```

---

## Install whisper.cpp

### Mac (Homebrew — fastest path)

```bash
brew install whisper-cpp

# Download base.en model (~142 MB)
mkdir -p ~/.orangebox/models/whisper
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
     -o ~/.orangebox/models/whisper/ggml-base.en.bin
```

After install the binary lands at `/opt/homebrew/bin/whisper-cli` (Apple Silicon)
or `/usr/local/bin/whisper-cli` (Intel). ORANGEBOX finds it on PATH automatically.

### Linux (build from source)

```bash
sudo apt-get install -y build-essential  # Ubuntu/Debian
# (Fedora/RHEL: sudo dnf install gcc-c++ make)

git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make -j$(nproc)

# Copy binary into your ORANGEBOX installation
cp main /path/to/orangebox/bin/whisper-cli

# Download base.en model
mkdir -p ~/.orangebox/models/whisper
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
     -o ~/.orangebox/models/whisper/ggml-base.en.bin
```

### Windows

1. Go to **[whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases)**
2. Download `whisper-bin-x64.zip` from the latest release
3. Extract `whisper-cli.exe` to `C:\path\to\orangebox\bin\whisper-cli.exe`
4. Download the model (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.orangebox\models\whisper"
Invoke-WebRequest `
  -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" `
  -OutFile "$env:USERPROFILE\.orangebox\models\whisper\ggml-base.en.bin"
```

---

## Model download

All models are hosted at:
`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/`

Install to: `~/.orangebox/models/whisper/`

| Model | File | Size | Notes |
|---|---|---|---|
| `tiny.en` | `ggml-tiny.en.bin` | 75 MB | Low-power. Adequate for code intent. |
| `base.en` | `ggml-base.en.bin` | 142 MB | **Recommended.** Speed + accuracy balance. |
| `small.en` | `ggml-small.en.bin` | 466 MB | Better accuracy; slower on CPU. |
| `medium.en` | `ggml-medium.en.bin` | 1.4 GB | Near-human; good on M1/M2/GPU. |
| `large-v3` | `ggml-large-v3.bin` | 2.9 GB | Best accuracy; requires GPU or M-series. |

For code intent classification, `base.en` is the right default. Upgrade to
`small.en` if you find it misclassifying technical jargon.

---

## Start the server

```bash
node scripts/v4/voice/voice-server.mjs
```

Options (via environment):

| Variable | Default | Purpose |
|---|---|---|
| `ORANGEBOX_VOICE_PORT` | `8780` | HTTP port |
| `ORANGEBOX_VOICE_CORS` | `http://localhost:3000` | Allowed CORS origin |
| `ANTHROPIC_API_KEY` | — | Required for AI intent classification |
| `OPENAI_API_KEY` | — | Enables cloud Whisper fallback |
| `ORANGEBOX_NO_CLOUD_FALLBACK` | — | Set to `1` to disable cloud fallback |
| `ORANGEBOX_BUDGET_MODE` | `balanced` | `strict` / `balanced` / `quality` |

Check server:
```bash
curl http://localhost:8780/v1/voice/health
```

---

## Performance notes

- **`base.en`** transcribes a 30-second clip in ~2–4s on an M-series Mac or recent Intel CPU.
  For code voice commands (typically 3–10 seconds of speech), expect <1s transcription.
- **`tiny.en`** is ~2x faster; use on low-power machines. Slightly lower accuracy on
  technical vocabulary.
- **`large-v3`** requires an NVIDIA GPU or M1/M2/M3 Mac for real-time transcription.
  On CPU it can take 30–60s for a 30s clip — not suitable for interactive use.
- The intent classification step (Haiku 4.5) adds ~200–400ms round-trip.
- Code generation (Sonnet 4.5) streams tokens; first token typically <1s.

---

## Verify setup

```bash
# Check binary + model readiness
node scripts/v4/voice/whisper-runner.mjs --check

# Print install instructions
node scripts/v4/voice/whisper-runner.mjs --setup-help

# Test transcription directly
node scripts/v4/voice/whisper-runner.mjs --transcribe /path/to/audio.wav

# Check server help
node scripts/v4/voice/voice-server.mjs --help
```
