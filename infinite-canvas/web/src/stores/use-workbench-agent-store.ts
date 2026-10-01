import { create } from "zustand";
import { nanoid } from "nanoid";
import type { WorkbenchTarget } from "@/services/api/generated-images";

// The Agent panel dispatches commands through this store to set workbench prompts and optionally start generation.
// The panel writes model, quality, size, count, and other options to use-config-store, which workbench pages read directly.
// Prompt and run are sent here; pages identify new commands by nonce and call clear after consuming them.

// A reference image the Agent wants pre-filled into the image workbench before generating,
// pointing at something that already exists (shared library, "我的素材", a canvas node, or a URL)
// instead of a fresh upload. "resolved" is produced internally when a canvas-node source is looked
// up eagerly (its dataUrl is only valid in this browser session, so it never leaves the browser).
export type WorkbenchReferenceSource =
    | { type: "generated"; imageId: string }
    | { type: "library"; ref: string }
    | { type: "asset"; assetId: string }
    | { type: "url"; url: string }
    | { type: "resolved"; dataUrl: string; storageKey?: string; name?: string };

export type WorkbenchCommand = {
    target?: WorkbenchTarget;
    name?: string;
    nonce: number;
    taskId?: string;
    prompt?: string;
    references?: WorkbenchReferenceSource[];
    run: boolean;
};

export type WorkbenchGenerationTask = {
    imageIds?: string[];
    backfill?: "applied" | "skipped" | "failed";
    id: string;
    kind: "image" | "video";
    status: "queued" | "running" | "succeeded" | "failed";
    prompt?: string;
    createdAt: string;
    updatedAt: string;
    successCount?: number;
    failCount?: number;
    error?: string;
};

type WorkbenchAgentStore = {
    imageCommand: WorkbenchCommand | null;
    videoCommand: WorkbenchCommand | null;
    tasks: WorkbenchGenerationTask[];
    dispatchImage: (command: Omit<WorkbenchCommand, "nonce">) => string | undefined;
    dispatchVideo: (command: Omit<WorkbenchCommand, "nonce" | "taskId">) => string | undefined;
    updateTask: (id: string, patch: Partial<Pick<WorkbenchGenerationTask, "status" | "successCount" | "failCount" | "error" | "imageIds" | "backfill">>) => void;
    clearImageCommand: () => void;
    clearVideoCommand: () => void;
};

let nonce = 0;
const nextNonce = () => (nonce += 1);

export const useWorkbenchAgentStore = create<WorkbenchAgentStore>((set) => ({
    imageCommand: null,
    videoCommand: null,
    tasks: [],
    dispatchImage: (command) => {
        const commandNonce = nextNonce();
        const task = command.run ? { ...createTask("image", commandNonce, command.prompt), id: command.taskId || `image-${nanoid()}` } : undefined;
        set((state) => ({ imageCommand: { ...command, nonce: commandNonce, taskId: task?.id }, tasks: task ? [task, ...state.tasks].slice(0, 30) : state.tasks }));
        return task?.id;
    },
    dispatchVideo: (command) => {
        const commandNonce = nextNonce();
        const task = command.run ? createTask("video", commandNonce, command.prompt) : undefined;
        set((state) => ({ videoCommand: { ...command, nonce: commandNonce, taskId: task?.id }, tasks: task ? [task, ...state.tasks].slice(0, 30) : state.tasks }));
        return task?.id;
    },
    updateTask: (id, patch) => set((state) => ({ tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task)) })),
    clearImageCommand: () => set({ imageCommand: null }),
    clearVideoCommand: () => set({ videoCommand: null }),
}));

function createTask(kind: "image" | "video", commandNonce: number, prompt?: string): WorkbenchGenerationTask {
    const now = new Date().toISOString();
    return { id: `${kind}-${commandNonce}`, kind, status: "queued", prompt, createdAt: now, updatedAt: now };
}
