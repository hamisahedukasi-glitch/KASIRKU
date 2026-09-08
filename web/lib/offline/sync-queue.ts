import {
  STORES,
  getAllRecords,
  getRecord,
  putRecord,
  deleteRecord,
} from "./db";

export type SyncOperation =
  | "insert"
  | "update"
  | "delete";

export type SyncStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed";

export interface SyncQueueItem {
  id: string;
  entity: string;
  entityId: string;
  operation: SyncOperation;
  payload: unknown;
  status: SyncStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function now(): string {
  return new Date().toISOString();
}

export async function enqueueSync(
  item: Omit<
    SyncQueueItem,
    "id" | "status" | "attempts" | "createdAt" | "updatedAt"
  >
): Promise<SyncQueueItem> {
  const timestamp = now();

  const queueItem: SyncQueueItem = {
    ...item,
    id: createId(),
    status: "pending",
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await putRecord(STORES.syncQueue, queueItem);

  return queueItem;
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  return getAllRecords<SyncQueueItem>(STORES.syncQueue);
}

export async function getPendingSyncQueue(): Promise<SyncQueueItem[]> {
  const items = await getSyncQueue();

  return items
    .filter(
      (item) =>
        item.status === "pending" ||
        item.status === "failed"
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() -
        new Date(b.createdAt).getTime()
    );
}

export async function getSyncQueueItem(
  id: string
): Promise<SyncQueueItem | undefined> {
  return getRecord<SyncQueueItem>(STORES.syncQueue, id);
}

export async function markSyncing(
  id: string
): Promise<SyncQueueItem | undefined> {
  const item = await getSyncQueueItem(id);

  if (!item) return undefined;

  item.status = "syncing";
  item.attempts += 1;
  item.updatedAt = now();

  await putRecord(STORES.syncQueue, item);

  return item;
}

export async function markSynced(
  id: string
): Promise<void> {
  const item = await getSyncQueueItem(id);

  if (!item) return;

  item.status = "synced";
  item.updatedAt = now();
  item.lastError = undefined;

  await putRecord(STORES.syncQueue, item);
}

export async function markFailed(
  id: string,
  error: unknown
): Promise<void> {
  const item = await getSyncQueueItem(id);

  if (!item) return;

  item.status = "failed";
  item.updatedAt = now();
  item.lastError =
    error instanceof Error
      ? error.message
      : String(error);

  await putRecord(STORES.syncQueue, item);
}

export async function removeSyncItem(
  id: string
): Promise<void> {
  await deleteRecord(STORES.syncQueue, id);
}

export async function retryFailedSync(): Promise<
  SyncQueueItem[]
> {
  const items = await getSyncQueue();

  const failed = items.filter(
    (item) => item.status === "failed"
  );

  for (const item of failed) {
    item.status = "pending";
    item.updatedAt = now();
    item.lastError = undefined;

    await putRecord(STORES.syncQueue, item);
  }

  return failed;
}

export async function getSyncQueueStats(): Promise<{
  total: number;
  pending: number;
  syncing: number;
  failed: number;
  synced: number;
}> {
  const items = await getSyncQueue();

  return {
    total: items.length,
    pending: items.filter((x) => x.status === "pending").length,
    syncing: items.filter((x) => x.status === "syncing").length,
    failed: items.filter((x) => x.status === "failed").length,
    synced: items.filter((x) => x.status === "synced").length,
  };
}
