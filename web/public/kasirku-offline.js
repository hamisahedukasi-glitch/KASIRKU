(function () {
  "use strict";

  const DB_NAME = "kasirku-offline";
  const DB_VERSION = 2;

  const SALES = "sales";
  const SALE_ITEMS = "sale_items";
  const QUEUE = "sync_queue";

  let dbPromise = null;

  function getWorkspaceId() {
    return String(
      window.__kkActiveOwner ||
      window.__kkWorkspaceOwner ||
      window.__kkSupabaseBusinessId ||
      ""
    ).trim();
  }

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB tidak tersedia."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function () {
        const db = request.result;

        [SALES, SALE_ITEMS, QUEUE].forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id" });
          }
        });

        const stores = [
          SALES,
          SALE_ITEMS,
          QUEUE
        ];

        stores.forEach(function (name) {
          const store = request.transaction.objectStore(name);

          if (!store.indexNames.contains("workspaceId")) {
            store.createIndex(
              "workspaceId",
              "workspaceId",
              { unique: false }
            );
          }

          if (!store.indexNames.contains("updatedAt")) {
            store.createIndex(
              "updatedAt",
              "updatedAt",
              { unique: false }
            );
          }
        });

        const queue = request.transaction.objectStore(QUEUE);

        if (!queue.indexNames.contains("status")) {
          queue.createIndex(
            "status",
            "status",
            { unique: false }
          );
        }

        if (!queue.indexNames.contains("entityId")) {
          queue.createIndex(
            "entityId",
            "entityId",
            { unique: false }
          );
        }
      };

      request.onsuccess = function () {
        const db = request.result;

        db.onversionchange = function () {
          db.close();
          dbPromise = null;
        };

        resolve(db);
      };

      request.onerror = function () {
        dbPromise = null;
        reject(
          request.error ||
          new Error("Gagal membuka Local DB.")
        );
      };
    });

    return dbPromise;
  }

  function putMany(records) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(
          [SALES, SALE_ITEMS, QUEUE],
          "readwrite"
        );

        records.forEach(function (item) {
          tx.objectStore(item.store).put(item.data);
        });

        tx.oncomplete = function () {
          resolve();
        };

        tx.onerror = function () {
          reject(
            tx.error ||
            new Error("Gagal menyimpan Local DB.")
          );
        };

        tx.onabort = function () {
          reject(
            tx.error ||
            new Error("Transaksi Local DB dibatalkan.")
          );
        };
      });
    });
  }

  function makeId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return (
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2)
    );
  }

  async function saveSale(tx, operation) {
    if (!tx || !tx.id) return false;

    const workspaceId = getWorkspaceId();

    if (!workspaceId) {
      console.warn(
        "KASIRKU Offline: workspace belum aktif. Transaksi tidak dimasukkan ke Local DB."
      );
      return false;
    }

    const timestamp = new Date().toISOString();
    const saleId = String(tx.id);

    const saleRecord = {
      ...tx,
      id: saleId,
      workspaceId: workspaceId,
      updatedAt: timestamp,
      localOnly: true
    };

    const records = [
      {
        store: SALES,
        data: saleRecord
      }
    ];

    const items = Array.isArray(tx.items)
      ? tx.items
      : [];

    items.forEach(function (item, index) {
      records.push({
        store: SALE_ITEMS,
        data: {
          id: saleId + "-" + String(index + 1),
          saleId: saleId,
          workspaceId: workspaceId,
          ...item,
          updatedAt: timestamp
        }
      });
    });

    records.push({
      store: QUEUE,
      data: {
        id: workspaceId + ":" + saleId,
        entity: "sales",
        entityId: saleId,
        workspaceId: workspaceId,
        operation: operation || "insert",
        payload: saleRecord,
        status: "pending",
        attempts: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    });

    await putMany(records);

    return true;
  }

  function getLatestSale() {
    try {
      const raw = localStorage.getItem("kasirku_sales");
      const sales = JSON.parse(raw || "[]");

      if (!Array.isArray(sales) || !sales.length) {
        return null;
      }

      return sales[0] || null;
    } catch (e) {
      console.warn(
        "KASIRKU Offline: gagal membaca sales.",
        e
      );
      return null;
    }
  }

  function installPayHook() {
    if (window.__kkOfflinePayHookInstalled) {
      return;
    }

    if (typeof window.pay !== "function") {
      setTimeout(installPayHook, 100);
      return;
    }

    const originalPay = window.pay;

    window.pay = function () {
      const before = getLatestSale();
      const beforeId = before
        ? String(before.id)
        : "";

      const result = originalPay.apply(
        this,
        arguments
      );

      if (result === false) {
        return result;
      }

      const after = getLatestSale();

      if (!after || !after.id) {
        return result;
      }

      const afterId = String(after.id);

      if (afterId === beforeId) {
        return result;
      }

      saveSale(
        after,
        "insert"
      ).catch(function (error) {
        console.error(
          "KASIRKU Local DB save error:",
          error
        );
      });

      return result;
    };

    window.__kkOfflinePayHookInstalled = true;

    console.log(
      "KASIRKU Offline: Pay → Local DB aktif."
    );
  }

  window.KKOffline = {
    supported: function () {
      return !!window.indexedDB;
    },

    getWorkspaceId: getWorkspaceId,

    saveSale: saveSale,

    installPayHook: installPayHook
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      installPayHook
    );
  } else {
    installPayHook();
  }
})();
