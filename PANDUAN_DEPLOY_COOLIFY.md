# PANDUAN DEPLOY — PT Sopiak Satria Saga ke Coolify

Panduan lengkap step-by-step untuk deploy aplikasi PT Sopiak Satria Saga ke VPS yang sudah memiliki Coolify (alongside Sakral & Bengkel-Jaya).

> **Asumsi:**
> - VPS dengan IP `31.97.106.106` sudah punya Coolify yang berjalan di `http://31.97.106.106:8000`
> - Coolify GitHub App sudah ter-connect (digunakan oleh Sakral & Bengkel sebelumnya)
> - Anda punya domain `sopiaksatriasaga.com`
> - Repo project ada di `D:\Deploy\Sopiak\sopiak-satria-saga`

Total estimasi waktu: **30–45 menit** (mayoritas waktu DNS propagasi & build pertama).

---

## Daftar Isi

1. [Fase A — Persiapan & Generate Secrets](#fase-a)
2. [Fase B — Setup DNS di Cloudflare](#fase-b)
3. [Fase C — Push ke GitHub](#fase-c)
4. [Fase D — Buat Project & Resource di Coolify](#fase-d)
5. [Fase E — Set Domain per Service](#fase-e)
6. [Fase F — Set Environment Variables](#fase-f)
7. [Fase G — Deploy Pertama Kali](#fase-g)
8. [Fase H — Verifikasi Aplikasi Berjalan](#fase-h)
9. [Fase I — Setup pgAdmin](#fase-i)
10. [Fase J — Build & Distribusi APK](#fase-j)
11. [Troubleshooting](#troubleshooting)
12. [Maintenance & Update](#maintenance--update)

---

<a id="fase-a"></a>
## Fase A — Persiapan & Generate Secrets

### A.1 — Generate 3 password kuat

SSH ke VPS atau buka terminal manapun:

```bash
openssl rand -base64 24    # → DB_PASSWORD
openssl rand -base64 48    # → JWT_SECRET
openssl rand -base64 24    # → PGADMIN_PASSWORD
```

**Catat ketiga output di password manager.** Anda akan butuh ini di Fase F.

### A.2 — Verifikasi project lokal

```powershell
cd D:\Deploy\Sopiak\sopiak-satria-saga
dir
```

Anda harus melihat folder: `backend/`, `web-admin-next/`, `website/`, `database/`, `docker/`, `downloads/`, `src/`, `assets/`. Plus file: `docker-compose.yml`, `.env.example`, `PANDUAN_DEPLOY_COOLIFY.md`, `README.md`, `app.json`, `package.json`.

Folder `ptsss/` dan `scripts/` HARUS TIDAK ADA (sudah dihapus — `ptsss/` adalah Expo starter sample, `scripts/` berisi seeder Supabase legacy yang sudah tidak dipakai. Seeder yang aktif sekarang berada di `backend/src/utils/seed.js` dan dijalankan otomatis oleh `bootstrap.js` saat backend start).

---

<a id="fase-b"></a>
## Fase B — Setup DNS di Cloudflare

Anda butuh **5 record A** untuk subdomain. Semua harus **Proxied** (orange cloud).

### B.1 — Login & pilih domain

1. Buka https://dash.cloudflare.com → login
2. Klik domain `sopiaksatriasaga.com`
3. Menu **DNS → Records**

### B.2 — Tambah 5 record A

Klik **Add record**. Type `A`, TTL `Auto`, Proxy `Proxied` ✅:

| Type | Name      | Content (IPv4)   | Proxy     | Untuk              |
|------|-----------|------------------|-----------|--------------------|
| A    | `@`       | `31.97.106.106`  | Proxied ✅ | website publik     |
| A    | `www`     | `31.97.106.106`  | Proxied ✅ | redirect ke root   |
| A    | `hq`      | `31.97.106.106`  | Proxied ✅ | web admin          |
| A    | `api`     | `31.97.106.106`  | Proxied ✅ | backend REST + WS  |
| A    | `pgadmin` | `31.97.106.106`  | Proxied ✅ | pgAdmin            |

> Kalau record sudah ada, klik **Edit**. Pastikan Content `31.97.106.106` & Proxied ✅.

### B.3 — SSL/TLS mode

Menu **SSL/TLS → Overview** → pilih **Full** (Anda bisa upgrade ke **Full (strict)** nanti).

### B.4 — Test propagasi DNS

```bash
nslookup hq.sopiaksatriasaga.com
nslookup api.sopiaksatriasaga.com
```

Setiap query harus return IP Cloudflare (104.x atau 172.x — bukan langsung 31.97.106.106 karena Proxied).

---

<a id="fase-c"></a>
## Fase C — Push ke GitHub

### C.1 — Buat repo private baru

1. https://github.com/new
2. Repository name: `sopiak-satria-saga`
3. Pilih **Private**
4. **Jangan** centang "Add a README"
5. **Create repository**

### C.2 — Initialize Git lokal & push

```powershell
cd D:\Deploy\Sopiak\sopiak-satria-saga

# Cek status
git status
# Kalau "fatal: not a git repository":
git init
git branch -M main

git add .
git commit -m "initial: sopiak satria saga v9 coolify-ready"

git remote add origin https://github.com/USERNAME_ANDA/sopiak-satria-saga.git
git push -u origin main
```

> Push ditolak? `git push -u origin main --force` (HANYA untuk first commit).

### C.3 — Verifikasi di GitHub

Buka `https://github.com/USERNAME_ANDA/sopiak-satria-saga`. Pastikan semua folder ter-push.

### C.4 — Beri akses Coolify GitHub App ke repo baru

1. https://github.com/settings/installations
2. Klik **Configure** di sebelah Coolify GitHub App Anda
3. **Repository access** → **Select repositories** → centang `sopiak-satria-saga` → **Save**

---

<a id="fase-d"></a>
## Fase D — Buat Project & Resource di Coolify

### D.1 — Buat Project

1. Coolify: `http://31.97.106.106:8000`
2. **Projects** → **+ Add**
3. Name: `sopiak-satria-saga`
4. **Create**

### D.2 — Tambah Resource Docker Compose

1. Klik project `sopiak-satria-saga`
2. **+ New Resource**
3. Pilih **Private Repository (with GitHub App)**
4. Pilih GitHub App Anda
5. Pilih repository `sopiak-satria-saga`
6. Branch: `main`
7. **Build Pack**: pilih **Docker Compose**
8. Base Directory: `/`
9. **Docker Compose Location**: `/docker-compose.yml` ⚠️ (default `.yaml` — UBAH ke `.yml`)
10. **Continue** → **Load Compose File**

### D.3 — Verifikasi 5 services terdeteksi

- `postgres` (no domain)
- `backend`, `web-admin`, `website`, `pgadmin`

### D.4 — Rename resource

Field Name di atas, ganti ke `sopiak-app` → klik di luar field (auto-save).

---

<a id="fase-e"></a>
## Fase E — Set Domain per Service

Scroll ke section **Domains**. Isi 4 field **persis seperti ini**:

| Service     | Domain                                       |
|-------------|----------------------------------------------|
| `backend`   | `https://api.sopiaksatriasaga.com`           |
| `web-admin` | `https://hq.sopiaksatriasaga.com`            |
| `website`   | `https://sopiaksatriasaga.com`               |
| `pgadmin`   | `https://pgadmin.sopiaksatriasaga.com`       |

Klik field, paste URL, klik di luar → auto-save. Untuk `postgres` **biarkan kosong**.

> Popup "Confirm Redirection Setting?" → klik **Cancel**.

---

<a id="fase-f"></a>
## Fase F — Set Environment Variables

Klik **Environment Variables** di menu kiri.

### F.1 — Production Environment Variables

Klik **Developer view**. Paste blok berikut **persis** (ganti tiga `REPLACE_*` dengan nilai dari Fase A.1):

```env
DB_NAME=ptsss_db
DB_USER=ptsss_user
DB_PASSWORD=REPLACE_WITH_STRONG_DB_PASSWORD
DB_SSL=false

JWT_SECRET=REPLACE_WITH_STRONG_JWT_SECRET
JWT_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
MAX_FILE_SIZE=10485760
AUTO_BOOTSTRAP=true
DEFAULT_PAGE_SIZE=25
MAX_PAGE_SIZE=200
RATE_LIMIT_BYPASS_SECRET=

CORS_ORIGIN=https://sopiaksatriasaga.com,https://www.sopiaksatriasaga.com,https://hq.sopiaksatriasaga.com,https://api.sopiaksatriasaga.com
API_URL=https://api.sopiaksatriasaga.com

COOKIE_DOMAIN=.sopiaksatriasaga.com
COOKIE_SECURE=true
COOKIE_SAMESITE=none

NEXT_PUBLIC_API_URL=https://api.sopiaksatriasaga.com
NEXT_PUBLIC_SOCKET_URL=https://api.sopiaksatriasaga.com

PGADMIN_EMAIL=admin@sopiaksatriasaga.com
PGADMIN_PASSWORD=REPLACE_WITH_STRONG_PGADMIN_PASSWORD

FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
```

> **Catatan kritis:**
> - `FIREBASE_*` boleh kosong — Expo Push tetap jalan, hanya FCM native yang nonaktif
> - **`COOKIE_DOMAIN=.sopiaksatriasaga.com`** dengan **TITIK di depan** — WAJIB. Tanpa titik = login looping
> - `SERVICE_FQDN_*` tidak perlu diisi — Coolify auto-fill dari domain di Fase E
> - Jangan ada inline comment `#` setelah value (Coolify strip & kadang gagal save)

### F.2 — Preview Deployments Environment Variables

**Paste konten yang sama persis** ke kotak Preview Deployments. Coolify menolak Save kalau Preview punya placeholder (lesson dari Sakral).

### F.3 — Save

Klik **Save All Environment Variables**. Pesan sukses: `Environment variables updated.` ✅

---

<a id="fase-g"></a>
## Fase G — Deploy Pertama Kali

### G.1 — Klik Deploy

Pojok kanan atas → **Deploy**.

### G.2 — Pantau Deployment Logs

**Deployments** → klik run baru → **Show Debug Logs**.

Urutan normal:
1. **Importing repo** (~5–10 detik)
2. **Building docker images** ~7–15 menit pertama (npm ci 3x, Next.js build 2x)
3. **Starting containers** (~30–60 detik)
4. **Healthcheck wait** ~1–2 menit total

Sukses → log akhir: `New container is healthy. Rolling update completed.`

### G.3 — Cek log backend untuk konfirmasi bootstrap

Service **backend** → tab **Logs**. Anda akan lihat:

```
[DB] ✓ Connected to "ptsss_db"
[BOOTSTRAP] Schema not detected — initializing from database/ptsss_db.sql
[BOOTSTRAP] Executing schema (164.5 KB)...
[BOOTSTRAP] ✓ Schema loaded successfully
[BOOTSTRAP] Users table empty — seeding default users (PIN: 123456)
[BOOTSTRAP]   ✓ ADM001 (admin) PIN=123456
[BOOTSTRAP]   ✓ SPV001 (supervisor) PIN=123456
[BOOTSTRAP]   ✓ KMD001 (komandan) PIN=123456
[BOOTSTRAP]   ✓ AGT001 (anggota) PIN=123456
[BOOTSTRAP]   ✓ AGT002 (anggota) PIN=123456
[BOOTSTRAP]   ✓ AGT003 (anggota) PIN=123456
[BOOTSTRAP] ✓ Done

🚀 PT Sopiak Satria Saga Backend running!
```

> Bootstrap idempotent — re-deploy aman.

---

<a id="fase-h"></a>
## Fase H — Verifikasi Aplikasi Berjalan

### H.1 — Test backend health
`https://api.sopiaksatriasaga.com/api/health` → JSON dengan `"status": "ok"`

### H.2 — Test ping
`https://api.sopiaksatriasaga.com/ping` → `pong`

### H.3 — Test website publik
`https://sopiaksatriasaga.com` → halaman publik tampil

### H.4 — Test web admin & login

`https://hq.sopiaksatriasaga.com`

Login:
- **NRP**: `ADM001`
- **PIN**: `123456`

Setelah login → masuk dashboard tanpa redirect loop. ✅

### H.5 — Verifikasi cookie cross-subdomain (KRITIS)

Browser DevTools (F12) → **Application** → **Cookies** → `https://hq.sopiaksatriasaga.com`. Cari `ptsss_token`:

| Field    | Expected                        |
|----------|---------------------------------|
| Domain   | `.sopiaksatriasaga.com` ⬅ DOT depan |
| SameSite | `None`                          |
| Secure   | ✓                               |
| HttpOnly | ✓                               |

Kalau Domain `api.sopiaksatriasaga.com` (tanpa dot) → env `COOKIE_DOMAIN` salah. Kembali ke Fase F.

### H.6 — Ganti PIN admin

Avatar pojok kanan → **Ganti PIN** → Old `123456`, New PIN kuat. Lakukan untuk semua user default.

---

<a id="fase-i"></a>
## Fase I — Setup pgAdmin

### I.1 — Login pgAdmin

`https://pgadmin.sopiaksatriasaga.com`

- Email: `admin@sopiaksatriasaga.com`
- Password: nilai `PGADMIN_PASSWORD` dari Fase A.1

### I.2 — Tambah server

Klik kanan **Servers** → **Register → Server**.

**Tab General**: Name = `ptsss-prod`

**Tab Connection**:
- **Host name/address**: `postgres` ⚠️ (WAJIB pakai nama service compose)
- **Port**: `5432`
- **Maintenance database**: `ptsss_db`
- **Username**: `ptsss_user`
- **Password**: `DB_PASSWORD` Anda
- Centang **Save password**

**Save**.

### I.3 — Verifikasi 24 tabel

Expand `ptsss-prod → Databases → ptsss_db → Schemas → public → Tables`. Harus 24 tabel.

### I.4 — Test query

Klik kanan `ptsss_db` → **Query Tool**:

```sql
-- User default
SELECT nrp, nama, role FROM users ORDER BY role, nrp;

-- Verifikasi panic_alerts.lokasi_id (CRITICAL fix v9)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'panic_alerts' AND column_name = 'lokasi_id';
-- Harus return 1 row

-- Total tabel
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Harus return: 24
```

---

<a id="fase-j"></a>
## Fase J — Build & Distribusi APK

### J.1 — Setup EAS (sekali saja)

```powershell
npm install -g eas-cli
eas login
```

### J.2 — Verifikasi `app.json` API URL

```powershell
type app.json | findstr apiUrl
# Output: "apiUrl": "https://api.sopiaksatriasaga.com"
```

Update tanpa edit kode (kalau perlu):
```powershell
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('app.json'));j.expo.extra.apiUrl='https://api.sopiaksatriasaga.com';fs.writeFileSync('app.json',JSON.stringify(j,null,2));"
```

### J.3 — Build APK

```powershell
eas build --platform android --profile preview
```

EAS upload kode ke server Expo, build APK, kasih link download (~10–20 menit).

### J.4 — Upload APK ke server

```bash
# Dari laptop:
scp ptsss-vX.X.X.apk deployer@31.97.106.106:/home/deployer/

# Di VPS:
ssh deployer@31.97.106.106
BACKEND_CT=$(sudo docker ps --format '{{.Names}}' | grep backend | head -1)
sudo docker cp /home/deployer/ptsss-vX.X.X.apk \
  $BACKEND_CT:/app/downloads/ptsss-latest.apk
```

> **Note**: `/app/downloads/` TIDAK persistent across redeploy. Untuk persistent, edit `docker-compose.yml`:
> ```yaml
> backend:
>   volumes:
>     ...
>     - backend_downloads:/app/downloads
> volumes:
>   ...
>   backend_downloads:
> ```

### J.5 — Anggota download

```
https://api.sopiaksatriasaga.com/download/ptsss-latest.apk
```

Browser HP → auto-download. Install (enable "Install from unknown sources" di Android).

---

<a id="troubleshooting"></a>
## Troubleshooting

### Bootstrap gagal — tabel tidak terbuat

```bash
BACKEND_CT=$(sudo docker ps --format '{{.Names}}' | grep backend | head -1)
POSTGRES_CT=$(sudo docker ps --format '{{.Names}}' | grep '^postgres' | head -1)
sudo docker cp $BACKEND_CT:/app/database/ptsss_db.sql /tmp/ptsss_db.sql
sudo docker cp /tmp/ptsss_db.sql $POSTGRES_CT:/tmp/ptsss_db.sql
sudo docker exec $POSTGRES_CT psql -U ptsss_user -d ptsss_db -f /tmp/ptsss_db.sql
sudo docker restart $BACKEND_CT
```

### Login looping `/login → / → /login`

DevTools → Cookies → `hq.sopiaksatriasaga.com`. Cek `ptsss_token`:
- Domain harus `.sopiaksatriasaga.com` (DENGAN dot)
- SameSite `None`, Secure ✓

Salah → di Coolify env, pastikan:
```
COOKIE_DOMAIN=.sopiaksatriasaga.com
COOKIE_SECURE=true
COOKIE_SAMESITE=none
```
Re-deploy backend, clear cookie browser, login ulang.

### Container backend "unhealthy"

Backend butuh > 60 detik bootstrap pertama. Tunggu satu siklus, klik **Restart** sekali. Boot kedua jauh cepat. Atau edit `backend/Dockerfile` `--start-period=40s` → `120s`, push, redeploy.

### Coolify gagal Save Environment Variables

Kotak **Preview** masih punya placeholder. Paste konten Production lengkap ke Preview juga.

### "Docker Compose file not found at /docker-compose.yaml"

Field **Docker Compose Location** harus `/docker-compose.yml` (`.yml` bukan `.yaml`).

### DB password berubah — backend gagal konek

Postgres volume mempertahankan password lama.

**A) Destruktif (dev)**:
```bash
sudo docker stop $(sudo docker ps -q -f name=postgres)
sudo docker volume rm <nama_volume_postgres>
# Re-deploy
```

**B) Production**:
```bash
POSTGRES_CT=$(sudo docker ps --format '{{.Names}}' | grep '^postgres' | head -1)
sudo docker exec -it $POSTGRES_CT psql -U ptsss_user -d ptsss_db
ALTER USER ptsss_user WITH PASSWORD 'PASSWORD_BARU';
\q
# Update env Coolify, redeploy
```

### Web-admin build gagal: "Cannot find module 'X'"

Coolify set `NODE_ENV=production` → `npm ci` skip devDependencies. Cek `web-admin-next/Dockerfile` stage `deps` pakai `npm ci` TANPA `--omit=dev`. Di v9 sudah benar.

### pgAdmin "could not connect: Connection refused"

Host harus `postgres` (nama service compose), bukan `localhost`/IP.

### Mobile: "Backend belum berjalan" / network error

Cek:
1. `https://api.sopiaksatriasaga.com/ping` → `pong`?
2. `app.json → extra.apiUrl` benar?
3. APK harus rebuild kalau `extra.apiUrl` berubah

### CORS error

Cek `CORS_ORIGIN` di Production — harus include `https://hq.sopiaksatriasaga.com`. Comma-separated, no space. Re-deploy.

### Rate limit throttle SEMUA user

Sudah di-fix di v9 dengan `app.set('trust proxy', ...)`. Verify di `backend/src/app.js` ada line:
```javascript
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
```

### Port 80/443 conflict dengan Sakral / Bengkel

Compose v9 tidak pakai bind port — Traefik routing yang handle. No conflict.

### Lihat semua container

```bash
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
sudo docker stats --no-stream
sudo docker logs -f --tail 50 <nama_container>
sudo docker exec -it <nama_container> sh
```

### Restore backup database

```bash
BACKEND_CT=$(sudo docker ps --format '{{.Names}}' | grep backend | head -1)
sudo docker exec $BACKEND_CT ls -lh /app/backups/

POSTGRES_CT=$(sudo docker ps --format '{{.Names}}' | grep '^postgres' | head -1)
sudo docker cp $BACKEND_CT:/app/backups/backup_X.sql /tmp/restore.sql
sudo docker cp /tmp/restore.sql $POSTGRES_CT:/tmp/restore.sql
sudo docker exec $POSTGRES_CT psql -U ptsss_user -d ptsss_db -f /tmp/restore.sql
```

---

<a id="maintenance--update"></a>
## Maintenance & Update

### Update aplikasi (auto-deploy)

```powershell
git add . && git commit -m "fix: ..." && git push
```

Coolify auto-redeploy ~30 detik.

### Setelah stabil — switch AUTO_BOOTSTRAP

Coolify env: `AUTO_BOOTSTRAP=true` → `schema-only`. Restart backend. Mode `schema-only`: cek schema saat startup tapi tidak re-seed user.

### Backup berkala database

Aplikasi punya fitur backup di halaman admin. Atau manual:
```bash
POSTGRES_CT=$(sudo docker ps --format '{{.Names}}' | grep '^postgres' | head -1)
sudo docker exec $POSTGRES_CT pg_dump -U ptsss_user -d ptsss_db > /home/deployer/backup_$(date +%Y%m%d).sql
```

### Monitor resource

```bash
htop
sudo docker stats --no-stream
df -h
sudo docker system df
```

### Bersihkan image lama

```bash
sudo docker image prune -a -f
sudo docker system prune --volumes -f  # ⚠️ HATI-HATI
```

---

## Penutup

Kalau semua fase sukses, Anda punya **3 sistem hidup** di VPS yang sama:

- ✅ `bengkeljaya.tech` → JayaMart POS
- ✅ `sakralrumahhantu.id` → SAKRAL Fear Lives Here
- ✅ `sopiaksatriasaga.com` + `hq.*` + `api.*` + `pgadmin.*` → PT Sopiak Satria Saga

Push selanjutnya ke `main` → auto-redeploy via Coolify CI/CD.

**Selamat — Anda sudah selesai!** 🎉

Kalau ada error saat deploy, screenshot log Coolify dan kasih tahu — pasti bisa kita selesaikan.
