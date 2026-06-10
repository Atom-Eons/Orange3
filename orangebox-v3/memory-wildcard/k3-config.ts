import { flagValue } from "../lib/core.ts";

export const K3_INDEX_VERSION = "k3-pointer-index-v0";

export function k3Config() {
  return {
    enabled: flagValue("ORANGEBOX_V3_MEMORY_WILDCARD", "0") === "1",
    indexReceipts: flagValue("ORANGEBOX_K3_INDEX_RECEIPTS", "1") === "1",
    indexPrimers: flagValue("ORANGEBOX_K3_INDEX_PRIMERS", "1") === "1",
    indexChatArchives: flagValue("ORANGEBOX_K3_INDEX_CHAT_ARCHIVES", "0") === "1",
    embedModel: flagValue("ORANGEBOX_K3_EMBED_MODEL", "nomic-embed-text"),
    embedFallback: flagValue("ORANGEBOX_K3_EMBED_FALLBACK", "mxbai-embed-large"),
    returnPathsOnly: flagValue("ORANGEBOX_K3_RETURN_PATHS_ONLY", "1") === "1",
    requireColdTruthGate: flagValue("ORANGEBOX_K3_REQUIRE_COLD_TRUTH_GATE", "1") === "1",
    storeRawText: flagValue("ORANGEBOX_K3_STORE_RAW_TEXT", "0") === "1",
    storeExcerpts: flagValue("ORANGEBOX_K3_STORE_EXCERPTS", "0") === "1",
  };
}
