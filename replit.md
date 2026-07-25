# EMC Admission

Aplikasi manajemen admisi pasien untuk RS EMC Pekayon. Mencakup integrasi TrakCare (data pasien rawat inap & IGD), billing checker, estimasi biaya, sinkronisasi cloud via Google Apps Script, export PDF/Excel, dan autentikasi lokal.

## Run & Operate

- `pnpm --filter @workspace/emc-admission run dev` — jalankan frontend (port 26052)
- `pnpm --filter @workspace/api-server run dev` — jalankan API server (port 8080)
- `pnpm run typecheck` — typecheck semua package
- `pnpm run build` — typecheck + build semua package
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks dan Zod schemas dari OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS, shadcn/ui, Wouter, TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validasi: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (dari OpenAPI spec)
- Build: esbuild (CJS bundle)
- Sinkronisasi: Google Apps Script (cloud backup/restore)
- Export: jsPDF, jspdf-autotable, xlsx

## Where things live

- `artifacts/emc-admission/src/pages/` — halaman-halaman aplikasi
- `artifacts/emc-admission/src/components/` — komponen UI (Layout, BillingCheckerPanel, EstimasiPanel, dll)
- `artifacts/emc-admission/src/lib/` — logika bisnis (trakcare, billing, estimasi, cloudSync, auth, db, pdfExport, dll)
- `artifacts/emc-admission/src/context/` — AppContext & AuthContext
- `artifacts/api-server/src/routes/trakcare.ts` — proxy ke TrakCare (pasien rawat inap & IGD)
- `artifacts/api-server/src/routes/cloud.ts` — proxy ke Google Apps Script (backup/restore)
- `google-apps-script/Code.gs` — kode GAS untuk cloud sync

## Architecture decisions

- Data pasien disimpan secara lokal di IndexedDB (via `idb`) sebagai sumber utama, dengan cloud sync opsional ke Google Sheets via GAS
- API server bertindak sebagai proxy ke TrakCare & GAS untuk menghindari CORS
- Autentikasi menggunakan sistem login lokal (kredensial tersimpan di IndexedDB, di-hash dengan crypto-js)
- Export PDF dilakukan sepenuhnya di browser menggunakan jsPDF

## Product

- Login dengan autentikasi lokal (data user tersimpan di IndexedDB)
- Sinkronisasi data pasien dari TrakCare (rawat inap & IGD)
- Billing checker untuk pengecekan status tagihan pasien
- Estimasi biaya rawat inap
- Backup & restore data ke/dari cloud (Google Sheets via GAS)
- Export laporan ke PDF dan Excel

## User preferences

_Tambahkan preferensi user di sini sesuai kebutuhan._

## Gotchas

- Cloud sync memerlukan Google Apps Script yang di-deploy dengan pengaturan "Execute as: Me" dan "Who has access: Anyone"
- API server harus berjalan agar proxy ke TrakCare dan GAS bekerja
- TrakCare URL di-hardcode di `artifacts/api-server/src/routes/trakcare.ts`

## Pointers

- Lihat skill `pnpm-workspace` untuk struktur workspace, setup TypeScript, dan detail package
