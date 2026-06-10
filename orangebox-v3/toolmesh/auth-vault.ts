export type ToolAuthPolicy = {
  toolId: string;
  localOnly: boolean;
  cloudAllowed: boolean;
  warrantRequired: boolean;
  secretStorage: "none" | "env_pointer_only" | "external_vault_required";
  note: string;
};

export function authPolicyForTool(toolId: string, cloud: boolean): ToolAuthPolicy {
  return {
    toolId,
    localOnly: !cloud,
    cloudAllowed: cloud,
    warrantRequired: cloud,
    secretStorage: cloud ? "external_vault_required" : "none",
    note: cloud
      ? "Cloud-capable tools require an explicit Orangebox warrant and must not store secrets in receipts."
      : "Local tool; no secret material expected for registry/doctor gates.",
  };
}
