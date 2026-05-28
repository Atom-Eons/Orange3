# Pulse Ring Rate-Limit Trap

## Purpose

The Pulse Ring rate-limit trap protects Silent Canvas from duplicate operator sends while an instruction is already being handed to the server or applied by an active run.

The operator should see that the system is working instead of guessing whether another Enter press is needed.

## Native Contract

- File: `C:\AtomEons\orangebox\src-tauri\src\bin\native.rs`
- Threshold: `2500ms`
- Lock timeout: `120s` for a pending server handoff without status
- Visual: `vt_draw_pulse_ring(...)` plus elapsed seconds

## Behavior

When `chat_target == "silent-canvas"`:

1. Sending a goal immediately sets `sc_dispatch_inflight = true`.
2. Further sends are blocked while the handoff is pending or run status is `queued` / `running`.
3. After 2.5 seconds, the chat send controls show the pulse ring and elapsed time.
4. The lock clears when the run status leaves `queued` / `running`.
5. If dispatch fails immediately, the lock clears and a system error message is added to the chat.
6. If the server never responds, the stale handoff lock expires after 120 seconds.

## Why It Matters

This closes the launch-day "rate limit trap": the UI no longer invites repeated commands during a slow response, and the operator gets visual proof that work is still in motion.

