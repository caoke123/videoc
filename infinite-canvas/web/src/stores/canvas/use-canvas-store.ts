import { create } from "zustand";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import * as canvasApi from "@/services/api/canvas-projects";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

// Stable per-tab id (not persisted) used to tell the server which client made a write, so this same
// tab can ignore the live broadcast echoing its own change instead of re-applying it on top of itself.
export const CANVAS_CLIENT_ID = nanoid();

type CanvasStore = {
    hydrated: boolean;
    hydrateError: string | null;
    projects: CanvasProject[];
    fetchProjects: () => Promise<void>;
    createProject: (title?: string) => Promise<CanvasProject>;
    importProject: (project: Partial<CanvasProject>) => Promise<CanvasProject>;
    openProject: (id: string) => Promise<CanvasProject | null>;
    renameProject: (id: string, title: string) => Promise<void>;
    deleteProjects: (ids: string[]) => Promise<void>;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => Promise<CanvasProject>;
    mergeRemoteProject: (project: CanvasProject) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };

function upsert(projects: CanvasProject[], project: CanvasProject) {
    return projects.some((item) => item.id === project.id) ? projects.map((item) => (item.id === project.id ? project : item)) : [project, ...projects];
}

// Canvas projects live only on the local server (production/canvases/) now; this store is just an
// in-memory mirror kept fresh by the actions below and by the live SSE subscription in project.tsx.
// There is no browser-local fallback: if the server is unreachable, `hydrateError` reports it.
export const useCanvasStore = create<CanvasStore>((set, get) => ({
    hydrated: false,
    hydrateError: null,
    projects: [],
    fetchProjects: async () => {
        try {
            const projects = await canvasApi.listCanvasProjects();
            set({ projects, hydrated: true, hydrateError: null });
        } catch (error) {
            set({ hydrated: true, hydrateError: error instanceof Error ? error.message : i18n.t("canvas.project.serverUnreachable") });
        }
    },
    createProject: async (title = i18n.t("canvas.project.untitled")) => {
        const project = await canvasApi.createCanvasProject(title);
        set((state) => ({ projects: [project, ...state.projects] }));
        return project;
    },
    importProject: async (source) => {
        const created = await canvasApi.createCanvasProject(source.title || i18n.t("canvas.project.imported"));
        const project = await canvasApi.updateCanvasProject(
            created.id,
            {
                nodes: source.nodes || [],
                connections: source.connections || [],
                chatSessions: source.chatSessions || [],
                activeChatId: source.activeChatId || null,
                backgroundMode: source.backgroundMode || "lines",
                showImageInfo: source.showImageInfo ?? false,
                viewport: source.viewport || initialViewport,
            },
            CANVAS_CLIENT_ID,
        );
        set((state) => ({ projects: upsert(state.projects, project) }));
        return project;
    },
    openProject: async (id) => {
        try {
            const project = await canvasApi.fetchCanvasProject(id, { create: id.startsWith("task-") });
            set((state) => ({ projects: upsert(state.projects, project) }));
            return project;
        } catch {
            return null;
        }
    },
    renameProject: async (id, title) => {
        const project = await canvasApi.updateCanvasProject(id, { title: title.trim() || undefined }, CANVAS_CLIENT_ID);
        set((state) => ({ projects: upsert(state.projects, project) }));
    },
    deleteProjects: async (ids) => {
        await canvasApi.deleteCanvasProjects(ids);
        set((state) => ({ projects: state.projects.filter((project) => !ids.includes(project.id)) }));
    },
    updateProject: async (id, patch) => {
        const project = await canvasApi.updateCanvasProject(id, patch, CANVAS_CLIENT_ID);
        set((state) => ({ projects: upsert(state.projects, project) }));
        return project;
    },
    mergeRemoteProject: (project) => set((state) => ({ projects: upsert(state.projects, project) })),
}));

// One-time initial fetch so pages relying on `hydrated` (e.g. site tools, the canvas list) get real data.
void useCanvasStore.getState().fetchProjects();
