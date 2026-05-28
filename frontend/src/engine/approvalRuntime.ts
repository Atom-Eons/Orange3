import type { ToolPermission } from "../types/tools";

export interface PendingToolApproval {
  id: string;
  toolName: string;
  label: string;
  description?: string;
  permissions: ToolPermission[];
  args: unknown;
  createdAt: number;
  status: "pending" | "approved" | "rejected";
}

export function requiresApproval(permissions: ToolPermission[]) {
  return permissions.some((permission) => ["write", "execute", "deploy"].includes(permission));
}
