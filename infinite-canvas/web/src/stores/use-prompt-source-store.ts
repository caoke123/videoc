import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_PROMPT_SOURCES, createPromptSource, type PromptSource } from "@/services/api/prompt-source-presets";
import { deleteSharedRecord, listSharedRecords, saveSharedRecord } from "@/services/api/shared-storage";

export type PromptSourceSchedule = {
    intervalMinutes: number;
    lastFetchedAt: string;
};

const PROMPT_SOURCE_STORE_KEY = "infinite-canvas:prompt_source_store_v2";

const defaultSchedule: PromptSourceSchedule = {
    intervalMinutes: 30,
    lastFetchedAt: "",
};

export const PROMPT_SOURCE_INTERVALS = [0, 30, 60, 360, 1440];

type PromptSourceStore = {
    sources: PromptSource[];
    schedule: PromptSourceSchedule;
    addSource: () => PromptSource;
    saveSource: (source: PromptSource) => void;
    removeSource: (id: string) => void;
    toggleSource: (id: string, enabled: boolean) => void;
    updateSchedule: <K extends keyof PromptSourceSchedule>(key: K, value: PromptSourceSchedule[K]) => void;
};

function customSources(sources: PromptSource[]) {
    return sources.filter((source) => !source.builtIn);
}

export const usePromptSourceStore = create<PromptSourceStore>()(
    persist(
        (set) => ({
            sources: DEFAULT_PROMPT_SOURCES,
            schedule: defaultSchedule,
            addSource: () => createPromptSource(),
            saveSource: (source) =>
                set((state) => ({
                    sources: state.sources.some((item) => item.id === source.id)
                        ? state.sources.map((item) => (item.id === source.id && !item.builtIn ? createPromptSource(source) : item))
                        : [...state.sources, createPromptSource(source)],
                })),
            removeSource: (id) => set((state) => ({ sources: state.sources.filter((item) => item.id !== id || item.builtIn) })),
            toggleSource: (id, enabled) => set((state) => ({ sources: state.sources.map((item) => (item.id === id ? { ...item, enabled } : item)) })),
            updateSchedule: (key, value) => set((state) => ({ schedule: { ...state.schedule, [key]: value } })),
        }),
        {
            name: PROMPT_SOURCE_STORE_KEY,
            partialize: (state) => ({ sources: state.sources, schedule: state.schedule }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<PromptSourceStore>;
                const savedSources = Array.isArray(persistedState.sources) ? persistedState.sources : [];
                const enabledById = new Map(savedSources.map((source) => [source.id, source.enabled]));
                const builtIn = DEFAULT_PROMPT_SOURCES.map((source) => ({ ...source, enabled: enabledById.get(source.id) ?? source.enabled }));
                const custom = savedSources.filter((source) => !source.builtIn).map((source) => createPromptSource(source));
                return { ...current, sources: [...builtIn, ...custom], schedule: { ...defaultSchedule, ...(persistedState.schedule || {}) } };
            },
        },
    ),
);

let applyingSources = false;
async function syncSources() {
    const shared = await listSharedRecords<PromptSource>("prompt-sources");
    const { fetchPromptSourceBackup } = await import("@/services/api/prompt-source-backup");
    const backup = await fetchPromptSourceBackup() || [];
    const known = new Set([...shared.items.map(source => source.id), ...shared.deletedIds]);
    for (const source of [...customSources(usePromptSourceStore.getState().sources), ...backup]) {
        if (known.has(source.id)) continue;
        await saveSharedRecord("prompt-sources", source.id, source);
        shared.items.push(source); known.add(source.id);
    }
    applyingSources = true;
    try { usePromptSourceStore.setState(state => ({ sources: [...state.sources.filter(source => source.builtIn), ...shared.items] })); }
    finally { applyingSources = false; }
}
function reportSourceError(error: unknown) {
    console.error("提示词来源同步失败", error);
    void import("antd").then(({ message }) => message.error("提示词来源未同步，请检查本地服务后刷新"));
}
let sourceWrites = syncSources().catch(reportSourceError);
usePromptSourceStore.subscribe((state, previous) => {
    if (applyingSources || state.sources === previous.sources) return;
    const custom = customSources(state.sources);
    const before = customSources(previous.sources);
    sourceWrites = sourceWrites.then(async () => {
        for (const source of custom) if (JSON.stringify(source) !== JSON.stringify(before.find(item => item.id === source.id))) await saveSharedRecord("prompt-sources", source.id, source);
        for (const source of before) if (!custom.some(item => item.id === source.id)) await deleteSharedRecord("prompt-sources", source.id);
    }).catch(reportSourceError);
});
window.addEventListener("focus", () => { sourceWrites = sourceWrites.then(syncSources).catch(reportSourceError); });
