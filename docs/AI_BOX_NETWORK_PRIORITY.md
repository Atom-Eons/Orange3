# AI Box Network Priority

AI Box Network Priority is the ORANGEBOX module for keeping networked AI computers ahead of noisy background traffic.

It exists because a verified worker rail is not enough if unrelated downloads can consume the same pipe during a build, screenshot run, index, or local-model job.

## Product Model

- **AE See-Suite** is the top-page command surface.
- **AE Operations** owns worker rails, network policy, proof, receipts, and recovery.
- **Basic Install** runs ORANGEBOX on one computer.
- **Advanced AI Box** runs a controller plus a second AI computer over Thunderbolt-class direct networking, router LAN, or Ethereal Ethernet.
- **AI computers** do heavy work over a verified route.
- **AI Box Network Priority** protects that route.

## Policy Layers

1. **AI-box route detection**
   - Direct Cat 8: `ORANGEBOX_AI_BOX_DIRECT_IP`
   - Router Ethernet LAN: `ORANGEBOX_AI_BOX_IP`
   - Legacy Wi-Fi fallback: `ORANGEBOX_AI_BOX_LEGACY_IP`
   - Extra AI boxes: `ORANGEBOX_AI_BOX_IPS` as a comma-separated list

2. **Health probes**
   - `8097` command rail
   - `8098` bridge
   - `8099` knowledge / receipts

3. **Windows policy pack**
   - Marks AI-box traffic with high DSCP priority.
   - Can throttle known game launchers/update helpers.
   - Can optionally throttle browsers.
   - Can optionally add reversible emergency firewall blocks for launchers.

4. **Operator approval**
   - ORANGEBOX generates the pack and receipt.
   - The operator chooses whether to run the Administrator script.
   - Remove script is generated beside the apply scripts.

## Ethereal AI Link: Direct Cable Module

The priority pack protects an existing route. **Ethereal AI Link** creates the dedicated route itself.

Recommended physical topology:

1. Larger AI box / Beelink GTi15:
   - Port 1 stays on the router for internet.
   - Port 2 gets the Cat 8 cable for the direct AI highway.
2. Operator box / N150:
   - Ethernet port connects directly to the GTi15 direct port.
3. The direct cable uses an isolated subnet with no default gateway:
   - Host: `10.0.99.1/24`
   - Peer: `10.0.99.2/24`

The generated installer pack can configure:

- adapter isolation and optional rename to `Ethereal-Link`
- static IP assignment with no gateway
- jumbo MTU target
- Receive Side Scaling when available
- Large Send Offload / checksum offload when exposed by the NIC driver
- normal ping validation
- jumbo no-fragment ping validation

It deliberately refuses ambiguous adapter selection. If multiple wired adapters are active, the apply script requires the exact adapter alias.

## Storage Transport Cascade

Ethereal AI Link includes a storage cascade for machines that want more than command traffic:

1. **Tier 1: NVMe/TCP**
   - Checks for `nvmeofutil.exe`.
   - Requires explicit target address and NQN before it will attempt a block-device path.
   - Stays gated because block-device storage has a higher corruption/recovery blast radius than file sharing.

2. **Tier 2: SMB Multichannel**
   - Enables SMB Multichannel where supported.
   - Host can create an `OrangeBoxAI` share.
   - Peer can map that share over the direct-link IP.
   - This is the practical fallback for Windows 11 machines today.

3. **Tier 3: Raw TCP**
   - The safe baseline.
   - Uses the direct isolated subnet, jumbo MTU, RSS, and offload settings without mounting remote storage.

The module is designed so better AI boxes can graduate to NVMe/TCP or RDMA later without changing the product model.

## Ethereal Socket Daemon

For the sellable product path, ORANGEBOX also ships a raw TCP file pipe that avoids Windows drive mounting entirely.

The daemon is:

- OS-independent standard Python.
- Authenticated by token file.
- Bound to the direct-link IP.
- Constrained to a served root folder.
- Capable of `ping`, `list`, `stat`, `get`, and `put`.
- Optimized with `socket.sendfile()` where the OS supports it, with a reliable buffered fallback everywhere.
- Receipt-producing: every client transfer records bytes, SHA-256, throughput, source, destination, and timestamp.

This is the right default for a commercial module because it avoids fragile Windows storage-stack dependencies while preserving a fast path for massive AI artifacts.

Default socket port:

```text
9999
```

Generated commands:

```powershell
RUN_CREATE_SOCKET_TOKEN.cmd
RUN_SOCKET_SERVER_HOST.cmd
RUN_SOCKET_SERVER_PEER.cmd
RUN_SOCKET_PING_HOST.cmd
RUN_SOCKET_HELP.cmd
```

For a two-machine link, create `ETHEREAL_SOCKET_TOKEN.txt` once and copy the same file to the other machine. The socket daemon will reject clients that use a different token.

## Future Fabric Lanes

RDMA/RoCE and NVMe-oF are included as **advanced capability lanes**, not default actions.

- **RDMA/RoCE**: the doctor detects `Get-NetAdapterRdma` support and reports whether adapters are enabled/operational. It does not enable RDMA automatically because most consumer NIC paths do not support the full enterprise RoCE stack.
- **NVMe-oF / NVMe over TCP**: the manifest and doctor reserve the lane, but the module does not mount remote storage by default. Shared block storage changes trust, corruption, backup, lock, and recovery behavior, so it needs a separate proven storage plan.

This keeps the system upgrade-ready for better AI boxes while keeping the current Beelink/N150 path stable.

## Why It Is Honest

Windows local QoS cannot perfectly control every inbound download by itself. It is strongest for outbound/local app traffic and DSCP marking. The strongest setup is:

1. Direct Cat 8 or stable Ethernet AI-box route.
2. Windows AI-box priority policy.
3. Router QoS/DSCP honoring.
4. Emergency reversible blocks only when a build needs a clean lane.

## CLI

```powershell
node scripts\obx.mjs network doctor --json
node scripts\obx.mjs network doctor --deep --json --receipt
node scripts\obx.mjs network pack --json --receipt
node scripts\obx.mjs network pack --include-browsers --json --receipt
node scripts\obx.mjs network pack --emergency-block-launchers --json --receipt
node scripts\obx.mjs network ethereal doctor --json
node scripts\obx.mjs network ethereal doctor --deep --json --receipt
node scripts\obx.mjs network ethereal pack --json --receipt
node scripts\obx.mjs network ethereal pack --adapter="Ethernet 2" --json --receipt
```

## API

```text
GET  /api/v4/ai-box-network/doctor
POST /api/v4/ai-box-network/pack
GET  /api/v4/ai-box-network/ethereal/doctor
POST /api/v4/ai-box-network/ethereal/pack
```

## Generated Files

Default location:

```text
%USERPROFILE%\OrangeBox-Data\exports\ai-box-network-priority\
%USERPROFILE%\OrangeBox-Data\exports\ethereal-ai-link\
```

Files:

- `ai-box-network-policy.json`
- `AI_BOX_NETWORK_PRIORITY.ps1`
- `RUN_AS_ADMIN_DRY_RUN.cmd`
- `RUN_AS_ADMIN_APPLY_AI_PRIORITY.cmd`
- `RUN_AS_ADMIN_APPLY_WITH_BROWSER_GUARD.cmd`
- `RUN_AS_ADMIN_REMOVE_AI_PRIORITY.cmd`
- `README.md`

Ethereal direct-link files:

- `ethereal-ai-link-policy.json`
- `ETHEREAL_AI_LINK.ps1`
- `RUN_AS_ADMIN_DRY_RUN.cmd`
- `RUN_AS_ADMIN_APPLY_HOST.cmd`
- `RUN_AS_ADMIN_APPLY_PEER.cmd`
- `RUN_AS_ADMIN_APPLY_HOST_WITH_STORAGE_AUTO.cmd`
- `RUN_AS_ADMIN_APPLY_PEER_WITH_STORAGE_AUTO.cmd`
- `RUN_VALIDATION.cmd`
- `RUN_AS_ADMIN_REMOVE_ETHEREAL_LINK.cmd`
- `ETHEREAL_SOCKET.py`
- `ETHEREAL_SOCKET_TOKEN.txt`
- `RUN_CREATE_SOCKET_TOKEN.cmd`
- `RUN_SOCKET_SERVER_HOST.cmd`
- `RUN_SOCKET_SERVER_PEER.cmd`
- `RUN_SOCKET_PING_HOST.cmd`
- `RUN_SOCKET_HELP.cmd`
- `README.md`

## Safety Law

- Doctor is read-only.
- Pack generation is file-only.
- Applying/removing QoS or firewall policy requires explicit Administrator execution.
- Policies are prefixed `ORANGEBOX-AIBox` so rollback can remove only what ORANGEBOX created.
- Applying/removing direct-link adapter settings requires explicit Administrator execution.
- The Ethereal installer never creates a default gateway on the direct link.
- RDMA/NVMe-oF are detected and documented, not silently enabled.
