# PT Sopiak Satria Saga — Sistem Manajemen Keamanan

Sistem keamanan terintegrasi: web admin (Next.js), backend API (Express + Socket.io), website publik (Next.js), dan mobile app (React Native + Expo).

## Komponen

| Komponen        | Stack                          | Port | Subdomain produksi               |
|-----------------|--------------------------------|------|----------------------------------|
| Backend API     | Express.js + Socket.io         | 3000 | `api.sopiaksatriasaga.com`       |
| Web Admin       | Next.js 14 + PWA               | 3001 | `hq.sopiaksatriasaga.com`        |
| Public Website  | Next.js 14                     | 3002 | `sopiaksatriasaga.com`           |
| pgAdmin         | dpage/pgadmin4                 | 80   | `pgadmin.sopiaksatriasaga.com`   |
| Database        | PostgreSQL 16                  | 5432 | (internal-only)                  |
| Mobile App      | React Native + Expo SDK        | —    | (calls API subdomain)            |

Reverse proxy & SSL ditangani Coolify built-in Traefik. No nginx/certbot.

## Deploy ke Coolify

→ **[`PANDUAN_DEPLOY_COOLIFY.md`](./PANDUAN_DEPLOY_COOLIFY.md)** untuk panduan lengkap step-by-step (12 fase + troubleshooting).

Singkatnya:
1. Generate 3 secret (`openssl rand -base64 24`/`48`/`24`)
2. Tambah 5 record DNS A di Cloudflare (`@`, `www`, `hq`, `api`, `pgadmin`) — Proxied
3. Push repo ke GitHub
4. Coolify: New Resource → Docker Compose → set domain per service → isi env Production+Preview
5. Deploy → backend bootstrap auto-seed user
6. Login `ADM001` / `123456` di `https://hq.sopiaksatriasaga.com`

## Login Default (setelah bootstrap)

| NRP    | Role        | PIN    |
|--------|-------------|--------|
| ADM001 | admin       | 123456 |
| SPV001 | supervisor  | 123456 |
| KMD001 | komandan    | 123456 |
| AGT001 | anggota     | 123456 |
| AGT002 | anggota     | 123456 |
| AGT003 | anggota     | 123456 |

⚠️ Ganti PIN setelah login pertama.

## Development Lokal

```bash
cp .env.example .env
# Edit minimal: DB_PASSWORD, JWT_SECRET, COOKIE_SECURE=false, COOKIE_DOMAIN=

docker compose up --build -d
# Backend:    http://localhost:3000/api/health
# Web admin:  http://localhost:3001
# Website:    http://localhost:3002
```

Mobile app (Expo Go):
```bash
npm install
npx expo start
```

## License

Internal — PT Sopiak Satria Saga.
