# Arsitektur KASIRKU

## Prinsip utama
KASIRKU harus **offline-first** dan **cloud-ready**.

### Lapisan
1. UI — halaman cover, login/register, dashboard, kasir, produk, stok, pembelian, pelanggan, promo, laporan, keuangan, pengaturan.
2. Application services — transaksi, stok, pembayaran, struk, laporan, backup/restore.
3. Local data — IndexedDB untuk operasi offline.
4. Sync engine — antrean perubahan, retry, idempotency, konflik stok.
5. Cloud — Supabase PostgreSQL/Auth/Storage.

## Aturan penting
- Jangan menjadikan `localStorage` sebagai database produksi.
- Jangan menyimpan password mentah.
- Setiap transaksi punya ID unik dan idempotency key.
- Stok produksi dicatat sebagai movement (`IN`, `OUT`, `ADJUSTMENT`, `RETURN`) bukan sekadar mengganti angka stok.
- Perubahan penting dicatat pada audit log.
- Sinkronisasi harus aman jika koneksi putus di tengah proses.
