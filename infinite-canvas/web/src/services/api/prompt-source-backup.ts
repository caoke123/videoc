import type { PromptSource } from "@/services/api/prompt-source-presets";

// Backup/restore only, same reasoning as channel-backup.ts: localStorage stays the live store, this
// just recovers custom prompt sources if that storage is wiped.

export async function fetchPromptSourceBackup(): Promise<PromptSource[] | null> {
    const response = await fetch("/api/config/prompt-sources");
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return Array.isArray(data?.sources) ? data.sources : null;
}

export function savePromptSourceBackup(sources: PromptSource[]) {
    return fetch("/api/config/prompt-sources", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources }) }).catch(() => {});
}
