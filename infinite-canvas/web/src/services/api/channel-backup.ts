import type { ModelChannel } from "@/stores/use-config-store";

// Shared channel persistence; browsers send edited channels and explicitly removed IDs.

export type ChannelSnapshot = { channels: ModelChannel[]; deletedIds?: string[] };
export async function fetchChannelBackup(): Promise<ChannelSnapshot | null> {
    const response = await fetch("/api/config/channels");
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("读取服务端渠道失败");
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data?.channels)) throw new Error("服务端渠道数据无效");
    return data;
}

export async function saveChannelBackup(channels: ModelChannel[], deletedIds: string[] = []): Promise<ChannelSnapshot> {
    const response = await fetch("/api/config/channels", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels, deletedIds }) });
    if (!response.ok) throw new Error("渠道未保存到服务端，请重新保存");
    return response.json();
}
