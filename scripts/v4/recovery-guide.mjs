#!/usr/bin/env node
/* recovery-guide.mjs - read-only ORANGEBOX repair and rollback guide.
 *
 * This module turns the scattered install, network, process, package, and
 * vault recovery posture into one operator-safe guide. It never mutates the
 * machine. Any cleanup or network application still requires an explicit
 * future command and human approval.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RECOVERY_GUIDE_VERSION = "orangebox-recovery-guide/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function section({
  id,
  title,
  status = "available",
  purpose,
  safe_checks = [],
  recovery_action,
  rollback,
  approval_required = false,
  commands = [],
}) {
  return {
    id,
    title,
    status,
    purpose,
    safe_checks,
    recovery_action,
    rollback,
    approval_required,
    commands,
  };
}

export function buildRecoveryGuide() {
  const sections = [
    section({
      id: "basic-install-repair",
      title: "Basic Install Repair",
      purpose: "Restore the one-machine ORANGEBOX path without requiring an AI computer, direct cable, remote service, or model download.",
      safe_checks: [
        "obx install doctor --json --receipt",
        "obx install visual-proof --json --receipt",
        "obx install operations-proof --json --receipt",
      ],
      recovery_action: "Re-run the Basic path, leave Advanced AI Computer unchecked, open AE Operations, then run Install Doctor and First-Run Proof.",
      rollback: "Basic repair does not change network adapters or remote machines. If a package replacement was tested, keep the previous portable zip and receipts until the new Final Green Board passes.",
      commands: [
        "obx install doctor --json --receipt",
        "obx install visual-proof --json --receipt",
      ],
    }),
    section({
      id: "advanced-ai-computer-reset",
      title: "Advanced AI Computer Reset",
      purpose: "Diagnose controller plus AI computer setup without assuming the remote box is reachable.",
      safe_checks: [
        "obx network ethereal doctor --json --deep --receipt",
        "obx network doctor --json --deep --receipt",
      ],
      recovery_action: "Use the doctor output to confirm adapter, subnet, link speed, and socket proof. Generate a fresh Ethereal pack only after reading the adapter alias and role.",
      rollback: "Generated packs are approval-gated. Revert by removing the static IP/QoS/firewall rules shown in the generated rollback script, or disconnect Advanced and continue Basic Install.",
      approval_required: true,
      commands: [
        "obx network ethereal doctor --json --deep --receipt",
        "obx network ethereal pack --json --receipt",
      ],
    }),
    section({
      id: "process-hygiene-review",
      title: "Duplicate Helper Process Review",
      purpose: "Find stale proof browsers, duplicate command servers, and heavy duplicate ORANGEBOX helper processes before packaging.",
      safe_checks: [
        "obx install process-doctor --json --receipt",
      ],
      recovery_action: "Review PIDs and command lines. Stop processes only after operator approval; do not auto-kill from AE Operations.",
      rollback: "No process action is taken by the guide. If an approved stop was wrong, restart ORANGEBOX with node scripts/orangebox-command-server.mjs or launch the packaged app.",
      approval_required: true,
      commands: [
        "obx install process-doctor --json --receipt",
      ],
    }),
    section({
      id: "package-repair-uninstall",
      title: "Package, Repair, and Uninstall",
      purpose: "Keep release candidates replaceable and reversible without deleting the operator's data root.",
      safe_checks: [
        "npm run pack:portable",
        "obx finish green-board --json --receipt --full",
      ],
      recovery_action: "Replace the portable zip only after hash and manifest proof pass. Preserve receipts and the previous package until the new board is green.",
      rollback: "Use the previous portable zip and manifest. Do not delete OrangeBox-Data or receipts unless a separate backup exists and the operator explicitly approves.",
      commands: [
        "npm run pack:portable",
        "obx finish green-board --json --receipt --full",
      ],
    }),
    section({
      id: "vault-key-recovery",
      title: "Vault and Key Recovery",
      purpose: "Recover from missing credentials without displaying secrets or weakening privacy posture.",
      safe_checks: [
        "obx vault-recovery --json",
        "obx install doctor --json",
      ],
      recovery_action: "Treat lost keys as a re-auth event. Reconnect providers through approved login flows; never paste secrets into receipts or screenshots.",
      rollback: "Disable optional provider lanes until re-auth is complete. Local Basic Install and receipts should remain usable.",
      approval_required: true,
      commands: [
        "obx vault-recovery --json",
      ],
    }),
    section({
      id: "final-green-board-readiness",
      title: "Final Green Board Readiness",
      purpose: "Turn recovery work back into a non-coder readable release decision.",
      safe_checks: [
        "obx install operations-proof --json --receipt",
        "obx finish green-board --json --receipt --full",
      ],
      recovery_action: "Run Operations Proof, then Final Green Board. Warnings stay visible until fixed or explicitly accepted.",
      rollback: "If the board regresses, keep the previous package and receipt set as the last known good candidate.",
      commands: [
        "obx install operations-proof --json --receipt",
        "obx finish green-board --json --receipt --full",
      ],
    }),
  ];

  return {
    ok: true,
    version: RECOVERY_GUIDE_VERSION,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    root: ROOT,
    mutates_machine: false,
    read_only: true,
    no_process_kill: true,
    no_network_mutation: true,
    no_uninstall: true,
    no_data_deletion: true,
    operator_approval_required_for_cleanup: true,
    headline: "Read-only repair guidance. No process kill, network mutation, uninstall, or data deletion happens from this board.",
    defaults: {
      basic_install_always_available: true,
      advanced_ai_computer_optional: true,
      ethereal_ai_link_approval_gated: true,
      warnings_remain_visible_until_fixed_or_accepted: true,
    },
    sections,
    command_groups: [
      {
        title: "Install proof",
        commands: [
          "obx install doctor --json --receipt",
          "obx install visual-proof --json --receipt",
          "obx install operations-proof --json --receipt",
        ],
      },
      {
        title: "Network proof",
        commands: [
          "obx network ethereal doctor --json --deep --receipt",
          "obx network ethereal pack --json --receipt",
        ],
      },
      {
        title: "Release proof",
        commands: [
          "obx install process-doctor --json --receipt",
          "npm run pack:portable",
          "obx finish green-board --json --receipt --full",
        ],
      },
    ],
    rollback: {
      data_root_rule: "Preserve OrangeBox-Data, receipts, and package manifests before replacing or uninstalling anything.",
      network_rule: "Use generated rollback scripts for Ethereal/QoS/firewall changes; do not hand-edit adapters from AE Operations.",
      package_rule: "Keep the previous portable zip and manifest until the new Final Green Board passes.",
      process_rule: "Process cleanup is review-first and approval-only.",
    },
    next_action: "Run the Recovery Guide, Install Doctor, Process Doctor, Operations Proof, and Final Green Board after any repair change.",
  };
}

async function writeRecoveryReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-recovery-guide-${stamp()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return file;
}

export async function runRecoveryGuide({ writeReceipt = false } = {}) {
  const result = buildRecoveryGuide();
  if (writeReceipt) await writeRecoveryReceipt(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await runRecoveryGuide({ writeReceipt: process.argv.includes("--receipt") });
  console.log(JSON.stringify(out, null, 2));
}
