const DB_NAME = "kasirku-offline";
const DB_VERSION = 1;

export const STORES = {
  products: "products",
  customers: "customers",
  sales: "sales",
  saleItems: "sale_items",
  stockMovements: "stock_movements",
  syncQueue: "sync_queue",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(
      new Error("IndexedDB tidak tersedia di browser ini.")
    );
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          const objectStore = db.createObjectStore(store, { keyPath: "id" });
          objectStore.createIndex("updatedAt", "updatedAt", {
            unique: false,
          });
        }
      }

      const transaction = request.transaction;
      if (transaction) {
        const queue = transaction.objectStore(STORES.syncQueue);

        if (!queue.indexNames.contains("status")) {
          queue.createIndex("status", "status", { unique: false });
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(
        request.error ?? new Error("Gagal membuka IndexedDB.")
      );
    };
  });

  return dbPromise;
}

export function isOfflineDbSupported(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export async function putRecord<T extends { id: string }>(
  storeName: StoreName,
  record: T
): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");

    tx.objectStore(storeName).put(record);

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        tx.error ?? new Error("Gagal menyimpan data offline.")
      );
    tx.onabort = () =>
      reject(
        tx.error ?? new Error("Transaksi IndexedDB dibatalkan.")
      );
  });
}

export async function getRecord<T>(
  storeName: StoreName,
  id: string
): Promise<T | undefined> {
  const db = await openDb();

  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(id);

    request.onsuccess = () =>
      resolve(request.result as T | undefined);

    request.onerror = () =>
      reject(
        request.error ?? new Error("Gagal membaca data offline.")
      );
  });
}

export async function getAllRecords<T>(
  storeName: StoreName
): Promise<T[]> {
  const db = await openDb();

  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();

    request.onsuccess = () =>
      resolve((request.result as T[]) ?? []);

    request.onerror = () =>
      reject(
        request.error ?? new Error("Gagal membaca data offline.")
      );
  });
}

export async function deleteRecord(
  storeName: StoreName,
  id: string
): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");

    tx.objectStore(storeName).delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        tx.error ?? new Error("Gagal menghapus data offline.")
      );
    tx.onabort = () =>
      reject(
        tx.error ?? new Error("Transaksi IndexedDB dibatalkan.")
      );
  });
}

export async function clearStore(
  storeName: StoreName
): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");

    tx.objectStore(storeName).clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        tx.error ?? new Error("Gagal mengosongkan data offline.")
      );
    tx.onabort = () =>
      reject(
        tx.error ?? new Error("Transaksi IndexedDB dibatalkan.")
      );
  });
}

export async function closeOfflineDb(): Promise<void> {
  if (!dbPromise) return;

  const db = await dbPromise;
  db.close();
  dbPromise = null;
}
