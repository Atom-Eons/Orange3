# Advanced AI Box Worker Rail

The Advanced AI Box rail is the optional second-computer worker path for ORANGEBOX. It handles heavy work that should not steal focus from the controller: builds, tests, screenshots, indexing, knowledge compilation, local models, media jobs, and long-running agents.

There are two install paths. The first-run wizard asks one plain question:

> Do you have an AI computer to set up?

## Basic Install (default - one computer)

Pick **No - Basic install** when you want ORANGEBOX to run on one computer.

In Basic Install mode:

- AE See-Suite, AE Operations, receipts, project routes, doctors, and screenshots all run locally.
- No second computer is needed.
- No network configuration is needed.
- No AI Box token is needed.
- This is the recommended path for most buyers.

Trade-offs:

- Heavy builds share CPU and RAM with the command surface.
- Large local models may be impractical on small laptops or mini PCs.
- Background indexing should stay modest.

## Advanced AI Box (controller + AI computer)

Pick **Yes - Advanced AI Box** when you have, or plan to buy, a second computer dedicated to heavy work.

In Advanced mode:

- This machine is the controller.
- The second machine is the AI computer.
- AE See-Suite remains responsive while the AI computer runs heavier work.
- AE Operations owns setup, health checks, network priority, tokens, receipts, and rollback.

Supported transport paths:

- Router LAN
- Ethereal Ethernet direct cable
- Thunderbolt-class direct networking when the hardware and OS support it

## What Is An AI Computer?

An AI computer is a second Windows, Linux, or macOS machine dedicated to work that benefits from extra CPU, RAM, storage, GPU, or always-on time.

Good candidates:

- Creator PC or workstation
- Gaming PC with NVIDIA GPU
- Mini PC with 64 GB+ RAM
- Spare desktop with SSD and Ethernet
- Rack or homelab box

Recommended baseline:

- 8+ CPU cores
- 64 GB RAM minimum for serious multitasking
- 128 GB RAM for comfortable 70B local-model experiments
- 500 GB+ SSD for models, receipts, screenshots, and caches
- Ethernet, preferably 2.5 GbE or better
- Optional NVIDIA GPU with 12 GB+ VRAM for faster inference

You can buy one from normal PC makers, workstation vendors, local computer stores, or electronics retailers. ORANGEBOX does not require one. It unlocks Advanced mode.

## Advanced Wire-Up

1. Install Node.js 20+ on the AI computer.
2. Install Ollama if you want local models.
3. In AE Operations, open **AI Box Rail**.
4. Enter the AI computer address or let Ethereal Ethernet infer it from the direct-link subnet.
5. Generate the AI Box token.
6. Put the token into the AI computer environment.
7. Run the health probe.
8. Do not dispatch heavy work until the probe is green.

Default health endpoints:

```text
Command rail: http://<ai-box-ip>:8097/health
Bridge:       http://<ai-box-ip>:8098/health
Knowledge:    http://<ai-box-ip>:8099/
```

## Environment Names

Use the product-facing names first:

```text
ORANGEBOX_AI_BOX_DIRECT_IP
ORANGEBOX_AI_BOX_IP
ORANGEBOX_AI_BOX_LEGACY_IP
ORANGEBOX_AI_BOX_IPS
```

Older internal environment names may still be accepted for compatibility, but buyer docs and UI should use **AI Box** language.

## AI Box Returns

Every AI Box job must return:

- status
- summary
- files changed
- commands run
- test output summary
- proof paths
- receipt path
- rollback note
- risk notes

No vague "done" returns. Checkmate refuses to promote without proof.

## Security

- AI Box tokens are never displayed after entry.
- The AI computer must reject unauthenticated commands.
- Write and destructive actions require explicit approval gates.
- Production deploys, payment, banking, tax, customer messages, and broad deletes remain protected.
- The Ethereal installer never creates a default gateway on the direct-link subnet.

## Recovery

If Advanced mode fails:

1. Switch AE Operations back to Basic Install.
2. Run the final green board locally.
3. Confirm AE See-Suite still opens.
4. Re-run the AI Box doctor.
5. Repair one transport at a time: router LAN, Ethereal Ethernet, then advanced storage lanes.

Basic Install is always the fallback. ORANGEBOX must stay useful even when the AI computer is offline.

## Codexa Rail Recovery Script

If the AI Box is powered on but the controller cannot reach the command rail, run this on Codexa as Administrator:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\AtomEons\orangebox-delta\scripts\START_CODEXA_RAIL.ps1 -EnableRdp
```

If the script is copied from the final package instead of the repo, run it from that copied location. It repairs the Codexa-side rail without touching the visual/frontend lane.

What it does:

- starts the command rail on `0.0.0.0:8097`
- starts the bridge rail on `0.0.0.0:8098` when the bridge server file is present
- enables trusted-controller firewall rules for the configured controller IPs
- optionally enables the Remote Desktop firewall rule with `-EnableRdp`
- writes a controller token helper at `C:\AtomEons\ai-box\SET_CONTROLLER_ORANGEBOX_TOKENS.cmd`
- writes receipts under `C:\AtomEons\ai-box\receipts`
- optionally starts Ollama model pulls in the background with `-PullModels`

`READY` only means the command rail answered locally. Large model pulls may still be running in the background.
