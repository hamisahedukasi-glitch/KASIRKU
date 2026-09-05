# Rencana Migrasi Prototype → Produksi

## Fase 0 — Freeze baseline
- Backup `app/index.html`.
- Uji semua tombol dan alur yang sudah ada.
- Jangan refactor UI sekaligus dengan migrasi database.

## Fase 1 — Git + Next.js
- Masukkan project ke GitHub.
- Buat Next.js/React/TypeScript.
- Migrasikan komponen secara bertahap.
- Cover/login/register dipisahkan dari halaman aplikasi.

## Fase 2 — Supabase
- Auth untuk akun pemilik/admin/kasir.
- PostgreSQL untuk data bisnis.
- Storage untuk foto produk/logo.
- RLS berdasarkan `business_id` dan role.

## Fase 3 — Offline
- Service Worker/PWA.
- IndexedDB.
- Local repository.
- Sync queue.
- Idempotency key.
- Retry + conflict resolution.

## Fase 4 — Keamanan
- Tidak ada password plaintext.
- Validasi server.
- RLS.
- Audit log.
- Rate limiting untuk endpoint sensitif.
- Backup cloud.

## Fase 5 — Quality assurance
Uji minimal:
- Login/register/logout
- Produk + foto
- Stok masuk/keluar
- Barcode
- Transaksi cash/QRIS/e-wallet/bank
- Diskon/promo
- Struk print/PDF/WA
- Retur
- Pembelian/hutang
- Piutang
- Laba rugi
- Arus kas
- Posisi keuangan
- Backup/restore
- Offline → online sync
- Dua perangkat dengan transaksi bersamaan

## Fase 6 — Deploy
GitHub → Vercel → domain → PWA → Android wrapper.
