import localforage from "localforage";
import { deleteSharedRecord, listSharedRecords, saveSharedRecord } from "@/services/api/shared-storage";
import { persistMediaReferences } from "@/services/persistent-media";

export function createServerRecordStore(collection: string, legacyStoreName: string) {
    const legacy = localforage.createInstance({ name: "infinite-canvas", storeName: legacyStoreName });
    let imported: Promise<void> | undefined;
    const recover = () => imported ||= (async () => {
        const shared = await listSharedRecords<{ id: string }>(collection);
        const known = new Set([...shared.items.map(item => item.id), ...shared.deletedIds]);
        const missing: Array<{ id: string }> = [];
        await legacy.iterate<{ id: string }, void>(item => { if (item?.id && !known.has(item.id)) missing.push(item); });
        for (const item of missing) await saveSharedRecord(collection, item.id, await persistMediaReferences(item));
    })().catch(error => { imported = undefined; throw error; });
    return {
        async list<T>() { await recover(); return (await listSharedRecords<T>(collection)).items; },
        async getItem<T>(id: string) { return (await this.list<T & { id: string }>()).find(item => item.id === id) || null; },
        async setItem<T>(id: string, value: T) {
            await recover();
            const saved = await persistMediaReferences(value);
            await saveSharedRecord(collection, id, saved);
            return saved;
        },
        async removeItem(id: string) { await recover(); await deleteSharedRecord(collection, id); },
        async iterate<T, R>(callback: (value: T, key: string, iteration: number) => R) {
            const items = await this.list<T & { id: string }>();
            for (const [index, item] of items.entries()) {
                const result = callback(item, item.id, index + 1);
                if (result !== undefined) return result;
            }
        },
    };
}
