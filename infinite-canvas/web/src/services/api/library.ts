export type LibraryAssetItem = { ref: string; path: string; name: string; group: string | null; bytes: number; updated_at: string };
export type LibraryCategory = { id: string; label: string; items: LibraryAssetItem[] };

export const LIBRARY_CATEGORY_OPTIONS = [
    { value: "characters", label: "角色定妆照" },
    { value: "products", label: "产品参考图" },
    { value: "material-references", label: "材料参考图" },
    { value: "structure-references", label: "结构参考图" },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
    return data as T;
}

export const listLibrary = () => request<LibraryCategory[]>("/api/library");
export const libraryFileUrl = (path: string) => `/api/library/files/${path.split("/").map(encodeURIComponent).join("/")}`;

export type ImportLibraryAssetResult = { ref: string; path: string; duplicate: boolean };
export const importLibraryAsset = (blob: Blob, category: string, name: string, group?: string) => {
    const query = new URLSearchParams({ category, name });
    if (group) query.set("group", group);
    return request<ImportLibraryAssetResult>(`/api/library/import?${query}`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
};
