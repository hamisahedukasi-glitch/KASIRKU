# Offline-First KASIRKU

## Yang tetap berjalan saat offline
- Buka aplikasi setelah pernah di-cache
- Login perangkat yang sudah terotorisasi
- Cari produk/barcode
- Keranjang dan qty
- Diskon/promo sesuai data lokal
- Pembayaran dan kembalian
- Simpan transaksi
- Cetak struk jika printer/browser mendukung
- Riwayat transaksi lokal
- Data stok lokal

## Alur sinkronisasi

Online → transaksi disimpan lokal → masuk queue → dikirim ke Supabase → server mengembalikan ACK → queue ditandai synced.

Offline → transaksi tetap masuk queue.

Internet kembali → queue diproses otomatis dengan retry.

## Konflik stok
Jangan memakai pola `stok = stok - qty` dari dua perangkat sebagai satu-satunya sumber kebenaran. Gunakan stock movements dan validasi server. Untuk transaksi offline dari beberapa perangkat, tetapkan aturan konflik dan audit.

## Status UI
- Online — Tersinkron
- Sinkronisasi — Mengirim data...
- Offline — Transaksi tetap dapat dilakukan
