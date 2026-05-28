# AI Computer Buying Guide

ORANGEBOX works in two install paths.

## Basic Install

Pick **No - Basic install** when you want ORANGEBOX to run on one computer.

This is the default path. It needs no second machine, no special networking, and no Administrator network setup. Builds, screenshots, indexing, local receipts, and the command surface all run on the same computer.

## Advanced AI Box

Pick **Yes - Advanced AI Box** when you have, or want to buy, a second computer dedicated to heavy work.

In this path:

- your everyday machine is the **controller**
- the second machine is the **AI computer**
- ORANGEBOX routes heavy jobs to that AI computer
- the machines can connect over router LAN, Thunderbolt-class direct networking, or Ethereal Ethernet

## What Is an AI Computer?

An AI computer is a second machine used for heavy ORANGEBOX work:

- long builds and tests
- screenshot and browser proof runs
- source indexing and knowledge compilation
- local models through Ollama or compatible runtimes
- media processing
- long-running agents that should not slow your controller

It does not need to be exotic. A good AI computer can be a mini PC, gaming PC, creator PC, workstation, or repurposed desktop.

## What to Buy

Good candidates:

- Mini PC: good for builds, screenshots, indexing, and light local models.
- Gaming or creator PC: good for GPU-backed local inference and media jobs.
- Workstation: best for larger memory, many drives, and all-day agent work.
- Rack or lab machine: best for teams, multiple AI boxes, or future fleet setups.

Recommended specs:

- CPU: 8 or more modern cores.
- RAM: 32 GB minimum, 64 GB preferred, 128 GB+ for larger local models.
- Storage: 1 TB SSD preferred if you keep models, datasets, and receipts locally.
- Network: Ethernet required for the best experience. 2.5 Gbps, 10 Gbps, or Thunderbolt-class direct networking improves large transfers.
- GPU: optional. NVIDIA GPUs help local inference and media work, but ORANGEBOX can use an AI computer without a GPU.

You can buy one from a PC maker, workstation vendor, local computer store, refurbished workstation seller, or mainstream electronics retailer.

## Connection Choices

1. **Router LAN**
   - Easiest advanced setup.
   - Both computers stay on the home or office network.
   - Good enough for command rail, receipts, and moderate file movement.

2. **Ethereal Ethernet**
   - Direct cable between controller and AI computer.
   - Uses an isolated subnet, normally `10.0.99.1` and `10.0.99.2`, with no default gateway.
   - Keeps AI traffic away from browser downloads, game launchers, and unrelated updates.
   - Ships with a token-authenticated raw TCP file pipe for large artifacts.

3. **Thunderbolt-class direct networking**
   - Upgrade lane for hardware that supports direct high-speed host-to-host networking.
   - ORANGEBOX treats it as an Advanced AI Box transport beside Ethereal Ethernet.
   - Hardware and OS support vary, so doctor proof decides whether it is available.

## Buyer Rule

If you are unsure, start with **Basic Install**. ORANGEBOX does not require an AI computer. Add one later when builds, screenshots, local models, media jobs, or all-day agents are worth moving off your controller.
