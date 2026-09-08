(function () {
  "use strict";

  const DB_NAME = "kasirku-offline";
  const DB_VERSION = 3;
  const QUEUE = "sync_queue";

  let running = false;

  function getWorkspaceId() {
    return String(
      window.__kkActiveOwner ||
      window.__kkWorkspaceOwner ||
      window.__kkSupabaseBusinessId ||
      ""
    ).trim();
  }

  function getSupabase() {
    return window.__kkSupabase || window.supabase || null;
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onsuccess = function () {
        resolve(req.result);
      };

      req.onerror = function () {
        reject(req.error || new Error("Local DB tidak dapat dibuka."));
      };
    });
  }

  function getAllQueue(db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(QUEUE, "readonly");
      const req = tx.objectStore(QUEUE).getAll();

      req.onsuccess = function () {
        resolve(req.result || []);
      };

      req.onerror = function () {
        reject(req.error || new Error("Gagal membaca sync queue."));
      };
    });
  }

  function updateQueue(db, item) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(QUEUE, "readwrite");
      tx.objectStore(QUEUE).put(item);

      tx.oncomplete = function () {
        resolve();
      };

      tx.onerror = function () {
        reject(tx.error || new Error("Gagal memperbarui sync queue."));
      };
    });
  }

  function deleteQueue(db, id) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(QUEUE, "readwrite");
      tx.objectStore(QUEUE).delete(id);

      tx.oncomplete = function () {
        resolve();
      };

      tx.onerror = function () {
        reject(tx.error || new Error("Gagal menghapus queue."));
      };
    });
  }

  function makeUUID() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === "x"
          ? r
          : (r & 0x3 | 0x8);
        return v.toString(16);
      }
    );
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  async function findProduct(client, businessId, item) {
    const code = String(item.code || "").trim();
    const barcode = String(item.barcode || "").trim();
    const sku = String(item.sku || "").trim();

    const candidates = [];

    if (code) candidates.push(["code", code]);
    if (barcode) candidates.push(["barcode", barcode]);
    if (sku) candidates.push(["sku", sku]);

    // 1. Cari produk yang sudah ada di cloud.
    for (const pair of candidates) {
      const result = await client
        .from("products")
        .select("id,code,barcode,sku,name,hpp,selling_price")
        .eq("business_id", businessId)
        .eq(pair[0], pair[1])
        .limit(1);

      if (result.error) {
        throw result.error;
      }

      if (result.data && result.data.length) {
        return result.data[0];
      }
    }

    // 2. Produk belum ada di cloud.
    //    Buat otomatis dari master produk lokal yang tersimpan
    //    di sale_items offline.
    const now = new Date().toISOString();

    const payload = {
      id: makeUUID(),
      business_id: businessId,
      code: code || null,
      barcode: barcode || null,
      sku: sku || null,
      name: String(item.name || "Produk"),
      category: item.category ? String(item.category) : null,
      unit: String(item.unit || "pcs"),
      hpp: number(item.hpp),
      selling_price: number(item.price),
      min_stock: number(item.min ?? item.minStock ?? 0),
      photo_url: item.photo_url || item.photoUrl || null,
      active: true,
      created_at: now,
      updated_at: now
    };

    const created = await client
      .from("products")
      .insert(payload)
      .select("id,code,barcode,sku,name,hpp,selling_price")
      .single();

    if (created.error) {
      throw new Error(
        "Gagal membuat produk cloud: " +
        String(item.code || item.name || "") +
        " — " +
        String(created.error.message || created.error)
      );
    }

    return created.data;
  }

  async function findCustomer(client, businessId, tx) {
    const name = String(tx.customer || "").trim();

    if (!name || name === "UMUM") {
      return null;
    }

    const result = await client
      .from("customers")
      .select("id,name")
      .eq("business_id", businessId)
      .eq("name", name)
      .limit(1);

    if (result.error) {
      throw result.error;
    }

    return result.data && result.data[0]
      ? result.data[0]
      : null;
  }

  async function findExistingSale(client, businessId, idempotencyKey) {
    const result = await client
      .from("sales")
      .select("id,trx_no,idempotency_key")
      .eq("business_id", businessId)
      .eq("idempotency_key", idempotencyKey)
      .limit(1);

    if (result.error) {
      throw result.error;
    }

    return result.data && result.data[0]
      ? result.data[0]
      : null;
  }

  async function syncOne(db, queueItem) {
    const workspaceId = getWorkspaceId();

    if (!workspaceId) {
      throw new Error("Workspace aktif belum tersedia.");
    }

    if (
      String(queueItem.workspaceId || "") !==
      workspaceId
    ) {
      return {
        skipped: true,
        reason: "workspace berbeda"
      };
    }

    const client = getSupabase();

    if (!client || !client.from) {
      throw new Error("Supabase client belum tersedia.");
    }

    const tx = queueItem.payload;

    if (!tx || !tx.id) {
      throw new Error("Payload transaksi tidak valid.");
    }

    const trxNo = String(tx.id);
    const idempotencyKey =
      workspaceId + ":" + trxNo;

    const existing = await findExistingSale(
      client,
      workspaceId,
      idempotencyKey
    );

    let cloudSaleId = existing
      ? existing.id
      : null;

    if (!cloudSaleId) {
      const customer = await findCustomer(
        client,
        workspaceId,
        tx
      );

      const salePayload = {
        id: makeUUID(),
        business_id: workspaceId,
        trx_no: trxNo,
        operator_id: null,
        customer_id: customer ? customer.id : null,
        subtotal: number(tx.subtotal),
        discount: number(
          tx.totalDiscount != null
            ? tx.totalDiscount
            : tx.discount
        ),
        total: number(tx.total),
        payment_method: String(
          tx.payment || ""
        ),
        payment_status: String(
          tx.status || "LUNAS"
        ),
        receivable:
          String(tx.status || "").toUpperCase() ===
          "BELUM LUNAS"
            ? number(tx.total)
            : 0,
        idempotency_key: idempotencyKey,
        created_at:
          tx.date ||
          new Date().toISOString()
      };

      const inserted = await client
        .from("sales")
        .insert(salePayload)
        .select("id")
        .single();

      if (inserted.error) {
        /*
         * Jika ada race condition/idempotency conflict,
         * cek ulang transaksi sebelum dianggap gagal.
         */
        const retry = await findExistingSale(
          client,
          workspaceId,
          idempotencyKey
        );

        if (!retry) {
          throw inserted.error;
        }

        cloudSaleId = retry.id;
      } else {
        cloudSaleId = inserted.data.id;
      }
    }

    const items = Array.isArray(tx.items)
      ? tx.items
      : [];

    for (const item of items) {
      const product = await findProduct(
        client,
        workspaceId,
        item
      );

      if (!product) {
        throw new Error(
          "Produk cloud tidak ditemukan: " +
          String(item.code || item.name || "")
        );
      }

      const itemId =
        workspaceId +
        ":" +
        trxNo +
        ":" +
        String(item.code || product.id);

      const existingItem = await client
        .from("sale_items")
        .select("id")
        .eq("sale_id", cloudSaleId)
        .eq("product_id", product.id)
        .limit(1);

      if (existingItem.error) {
        throw existingItem.error;
      }

      if (
        existingItem.data &&
        existingItem.data.length
      ) {
        continue;
      }

      const saleItem = {
        id: makeUUID(),
        sale_id: cloudSaleId,
        product_id: product.id,
        qty: number(item.qty),
        price: number(item.price),
        hpp: number(
          item.hpp != null
            ? item.hpp
            : product.hpp
        ),
        discount: number(item.disc),
        subtotal:
          number(item.price) *
            number(item.qty) -
          number(item.disc)
      };

      const insertedItem = await client
        .from("sale_items")
        .insert(saleItem);

      if (insertedItem.error) {
        /*
         * Jangan menghapus sales otomatis di sini.
         * Jika item gagal, queue tetap pending sehingga
         * retry berikutnya dapat menyelesaikannya.
         */
        throw insertedItem.error;
      }
    }

    return {
      synced: true,
      trxNo: trxNo,
      cloudSaleId: cloudSaleId
    };
  }

  async function syncPending() {
    if (running) {
      return {
        running: true
      };
    }

    if (!navigator.onLine) {
      return {
        offline: true,
        synced: 0
      };
    }

    const workspaceId = getWorkspaceId();

    if (!workspaceId) {
      return {
        error: "Workspace belum aktif.",
        synced: 0
      };
    }

    running = true;

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    try {
      const db = await openDB();
      const queue = await getAllQueue(db);

      const pending = queue
        .filter(function (item) {
          return (
            item &&
            item.status === "pending" &&
            String(item.workspaceId || "") ===
              workspaceId
          );
        })
        .sort(function (a, b) {
          return String(
            a.createdAt || ""
          ).localeCompare(
            String(b.createdAt || "")
          );
        });

      for (const item of pending) {
        const now =
          new Date().toISOString();

        item.status = "syncing";
        item.updatedAt = now;

        await updateQueue(db, item);

        try {
          const result =
            await syncOne(db, item);

          if (result && result.skipped) {
            item.status = "pending";
            item.updatedAt =
              new Date().toISOString();
            await updateQueue(db, item);
            skipped++;
            continue;
          }

          item.status = "synced";
          item.syncedAt =
            new Date().toISOString();
          item.updatedAt =
            item.syncedAt;

          await updateQueue(db, item);
          synced++;
        } catch (error) {
          item.status = "pending";
          item.attempts =
            number(item.attempts) + 1;
          item.lastError =
            String(
              error &&
              error.message
                ? error.message
                : error
            );
          item.updatedAt =
            new Date().toISOString();

          await updateQueue(db, item);
          failed++;

          console.error(
            "KASIRKU Sync gagal:",
            item.entityId,
            error
          );
        }
      }

      return {
        workspaceId: workspaceId,
        total: pending.length,
        synced: synced,
        failed: failed,
        skipped: skipped
      };
    } finally {
      running = false;
    }
  }

  async function getSyncStatus() {
    const db = await openDB();
    const workspaceId = getWorkspaceId();
    const queue = await getAllQueue(db);

    const own = queue.filter(function (item) {
      return (
        item &&
        String(item.workspaceId || "") ===
          workspaceId
      );
    });

    return {
      workspaceId: workspaceId,
      pending: own.filter(
        x => x.status === "pending"
      ).length,
      syncing: own.filter(
        x => x.status === "syncing"
      ).length,
      synced: own.filter(
        x => x.status === "synced"
      ).length,
      failed: own.filter(
        x => x.status === "failed"
      ).length
    };
  }

  window.KKSync = {
    syncPending: syncPending,
    syncOne: syncOne,
    getSyncStatus: getSyncStatus
  };

  window.addEventListener(
    "online",
    function () {
      setTimeout(function () {
        syncPending().catch(function (error) {
          console.error(
            "KASIRKU auto-sync error:",
            error
          );
        });
      }, 1000);
    }
  );

  console.log(
    "KASIRKU Sync Engine siap."
  );
})();


