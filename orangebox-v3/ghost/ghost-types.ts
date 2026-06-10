export type GhostStatus = "active" | "destroyed" | "promotion_candidate" | "promoted" | "failed";

export type GhostEnvelope = {
  ghost_id: string;
  task_id: string;
  chat_id: string | null;
  ide_context_id: string | null;
  base_head_sha: string;
  branch_name: string;
  worktree_path: string;
  source_targets: string[];
  ast_hash: string | null;
  memory_snapshot_hash: string | null;
  model_lane: string;
  risk_score: number;
  status: GhostStatus;
  created_at: string;
  updated_at: string;
  invalidation_rules: string[];
  promotion_rules: string[];
  rollback_pointer: {
    remove_worktree: string;
    delete_branch: string;
    patch_file?: string;
    reverse_patch?: string;
  };
  receipts: string[];
};

export type GhostCommandResult = {
  ok: boolean;
  status: string;
  ghost?: GhostEnvelope;
  ghosts?: GhostEnvelope[];
  checks?: Array<{ id: string; ok: boolean; detail?: unknown }>;
  receipt_path?: string;
  error?: string;
};
