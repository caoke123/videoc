async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
    return data as T;
}

export const listImageHistory = <T>() => request<T[]>("/api/image-history");
export const saveImageHistory = <T extends { id: string }>(log: T) => request<T>(`/api/image-history/${encodeURIComponent(log.id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(log),
});
export const deleteImageHistory = (ids: string[]) => request<{ ok: boolean }>("/api/image-history", {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
});
