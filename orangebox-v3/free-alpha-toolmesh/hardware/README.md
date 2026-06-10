# ToolMesh Hardware Runtime

This folder is the registry-side hardware contract for ToolMesh.

- Heavy tools declare VRAM, RAM, scratch disk, runtime, OOM risk, and exclusive GPU needs.
- The scheduler must acquire the declared lock before any execution promotion.
- If `requiresLLMUnload=true`, TriLane must seal reasoning state before the heavy job and resume after the receipt.
- This folder does not install GPU tools.
