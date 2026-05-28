import type { ToolPermission } from "../types/tools.js";

export function canUseTool(input: { userRole?: string; permissions: ToolPermission[] }) {
  const role = input.userRole ?? "admin";
  if (role === "admin") return true;
  if (input.permissions.includes("deploy")) return false;
  if (input.permissions.includes("execute") && role !== "operator") return false;
  if (input.permissions.includes("write") && !["operator", "editor"].includes(role)) return false;
  return true;
}
