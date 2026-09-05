# KASIRKU — VS Code Ready

Tanggal paket: 5 September 2026

## Tujuan
Paket ini membawa **baseline aplikasi KASIRKU yang sudah ada** ke VS Code tanpa mengubah logika kasir, data lokal, pengaturan, produk, stok, transaksi, struk, laporan, dan fungsi yang sudah disetujui.

## Baseline utama
- `app/index.html` = salinan master aplikasi KASIRKU.
- Folder `backups/` berisi beberapa baseline penting untuk pemulihan.
- Folder `assets/` berisi logo dan aset cover.

> **PENTING:** Jangan menimpa `app/index.html` dengan eksperimen baru sebelum membuat salinan/commit Git. Prototype ini masih memakai penyimpanan lokal browser (`localStorage`). Data yang tersimpan di browser lama tidak otomatis berpindah ke browser/perangkat lain hanya karena file dipindahkan ke VS Code.

## Menjalankan sekarang di VS Code
1. Buka folder ini di VS Code.
2. Pasang ekstensi **Live Server** jika ingin menjalankan melalui server lokal.
3. Klik kanan `app/index.html` → **Open with Live Server**.
4. Gunakan browser yang sama untuk mempertahankan data lokal prototype.

## Target versi aplikasi produksi
Arsitektur yang disiapkan untuk tahap berikutnya:
- Frontend: Next.js + React + TypeScript
- Database/cloud: Supabase PostgreSQL
- Auth: Supabase Auth
- File/foto: Supabase Storage
- Offline: PWA + Service Worker + IndexedDB
- Sinkronisasi: local queue + sync engine + conflict handling
- Deploy: GitHub + Vercel
- Android: PWA/TWA setelah web production stabil

Lihat:
- `docs/ARCHITECTURE.md`
- `docs/OFFLINE_FIRST.md`
- `docs/MIGRATION_PLAN.md`
- `supabase/schema.sql`

## Aturan desain yang dikunci
- Pertahankan logo KASIRKU.
- Pertahankan UI kasir yang sudah bagus.
- Jangan mengubah tombol/fungsi/data yang sudah benar tanpa permintaan eksplisit.
- Cover, login, dan register boleh dikembangkan terpisah dari mesin kasir.
- HPP dan data sensitif tetap mengikuti role OWNER/ADMIN vs KASIR.
