export async function storageRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "服务端保存失败");
    return data as T;
}
export const mediaFileUrl = (key: string) => `/api/media-files/${encodeURIComponent(key)}`;
export async function mediaFileExists(key: string) {
    const response = await fetch(mediaFileUrl(key), { method: "HEAD" });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("读取服务端文件状态失败");
    return true;
}
export async function saveMediaBlob(key: string, blob: Blob) {
    return storageRequest<{ url: string }>(mediaFileUrl(key), { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
}
export async function fetchMediaBlob(key: string): Promise<Blob | null> {
    const response = await fetch(mediaFileUrl(key));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("读取服务端文件失败");
    return response.blob();
}
export const listSharedRecords = <T>(collection: string) => storageRequest<{ items: T[]; deletedIds: string[] }>(`/api/shared-records/${collection}`);
export const fetchSharedRecord = <T>(collection: string, id: string) => storageRequest<T>(`/api/shared-records/${collection}/${encodeURIComponent(id)}`);
export const saveSharedRecord = (collection: string, id: string, value: unknown) => storageRequest(`/api/shared-records/${collection}/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
export const deleteSharedRecord = (collection: string, id: string) => storageRequest(`/api/shared-records/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" });
