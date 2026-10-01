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

export type LibraryEntityType = "sku" | "character" | "scene" | "material";
export type LibraryEntityImage = LibraryAssetItem & { role: string; kind?: string };
export type LibraryEntity = {
    id: string;
    type: LibraryEntityType;
    name: string;
    aliases: string[];
    status: "approved" | "pending";
    category: string | null;
    folder: string;
    sidecar: string;
    cover: string | null;
    images: LibraryEntityImage[];
    related: string[];
    meta: Record<string, unknown>;
    warnings: string[];
};
export type LibraryEntities = { entities: LibraryEntity[]; unassigned: LibraryAssetItem[]; problems: string[] };

export const listLibrary = () => request<LibraryCategory[]>("/api/library");
export const listLibraryEntities = () => request<LibraryEntities>("/api/library/entities");
export const libraryFileUrl = (path: string) => `/api/library/files/${path.split("/").map(encodeURIComponent).join("/")}`;

export type ImportLibraryAssetResult = { ref: string; path: string; duplicate: boolean };
export const importLibraryAsset = (blob: Blob, name: string) => request<ImportLibraryAssetResult>(`/api/library/import?${new URLSearchParams({ name })}`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });

export type RegisterImageBody = { path: string } & ({ entityId: string; role: "identity" | "driver" | "passenger" | "other"; label?: string } | { create: { type: "character" | "scene" | "material"; name: string }; label?: string });
export const registerLibraryImage = (body: RegisterImageBody) => request<{ entityId: string; path: string; ref: string }>("/api/library/entities/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
