import { Check, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { DrawerShell } from "./DrawerShell";

export function ToolApprovalDrawer() {
  const pendingApprovals = useAppStore((s) => s.pendingApprovals);
  const resolveApproval = useAppStore((s) => s.resolveApproval);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const active = pendingApprovals.filter((approval) => approval.status === "pending");

  return (
    <DrawerShell drawerId="tool-approval" title="Tool Approval" subtitle="Review execute/deploy action" width={430}>
      {active.length === 0 ? <div className="drawer-empty">No pending tool approvals.</div> : null}

      <div className="approval-list">
        {active.map((approval) => {
          const highRisk =
            approval.permissions.includes("deploy") || approval.permissions.includes("execute");
          const needsApproval =
            highRisk || approval.permissions.includes("write");
          const permissionLabel = approval.permissions.includes("deploy")
            ? "deploy permission"
            : approval.permissions.includes("execute")
              ? "execute permission"
              : approval.permissions.includes("write")
                ? "write permission"
                : "read permission";

          return (
            <article
              key={approval.id}
              className={`approval-card approval-card--compact ${highRisk ? "is-high-risk" : ""}`}
            >
              <span className="approval-card__icon">
                {highRisk ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
              </span>

              <div className="approval-card__copy">
                <header>
                  <strong>{approval.toolName}</strong>
                  <em>{permissionLabel}</em>
                </header>

                {approval.description ? <p>{approval.description}</p> : null}

                <div className="approval-card__permissions" aria-label="Tool permissions">
                  {approval.permissions.map((permission) => (
                    <span key={permission}>{permission}</span>
                  ))}
                </div>
              </div>

              <div className="approval-card__actions">
                {needsApproval ? (
                  <button
                    type="button"
                    className="approval-button approval-button--reject"
                    aria-label={`Reject ${approval.toolName}`}
                    onClick={() => resolveApproval(approval.id, "rejected")}
                  >
                    <X size={13} />
                  </button>
                ) : null}

                <button
                  type="button"
                  className="approval-button approval-button--approve"
                  onClick={() => {
                    resolveApproval(approval.id, "approved");
                    if (active.length === 1) setDrawerOpen(undefined);
                  }}
                >
                  {needsApproval ? <Check size={14} /> : null}
                  {needsApproval ? "Approve" : "auto"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </DrawerShell>
  );
}
