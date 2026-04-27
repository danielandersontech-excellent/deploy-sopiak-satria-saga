# Static Analysis Tools

Skrip Node.js untuk verifikasi repo tanpa perlu `npm install`.
Dipakai sebelum push ke Coolify untuk catch deploy-time bugs lebih awal.

## Cara pakai

Dari **root repo** (atau dari mana saja, skrip auto-detect path):

```bash
node verify/analyze.js          # cek import/module resolution
node verify/check-boundaries.js # cek 'use client' / boundary Next.js
node verify/sql-check.js        # cek struktural SQL schema
node verify/schema-xref.js      # cross-ref tabel SQL vs query di backend
node verify/env-audit.js        # audit env var: code vs docker-compose
```

Atau jalankan semua sekaligus:

```bash
node verify/run-all.js
```

Exit code 0 = lulus, non-zero = ada error yang harus difix dulu.

## Apa yang setiap skrip cek

| Skrip | Fungsi |
|---|---|
| `analyze.js` | Setiap `require()` / `import` dicocokkan dengan `package.json` deps + filesystem. Tangkap modul hilang & path typo. |
| `check-boundaries.js` | File yang pakai React hooks / event handler harus punya `'use client'`. Sumber #1 build failure di Next 14. |
| `sql-check.js` | Struktur SQL: paren balance, `$$` block, statement count, kompatibilitas PG version. |
| `schema-xref.js` | Setiap tabel yang dipakai di query backend ada di schema. |
| `env-audit.js` | Env var di code vs docker-compose. Plus list secret wajib untuk Coolify. |

## Best practice

Jalankan sebelum setiap `git push` ke branch yang akan deploy:

```bash
node verify/run-all.js && git push
```

Kalau ada error, fix dulu sebelum trigger deploy. Lebih cepat daripada
menunggu Coolify build gagal 5 menit kemudian.
