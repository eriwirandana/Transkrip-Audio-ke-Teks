# Instalasi (Step-by-step)

Prasyarat:
- Node.js 20+
- Redis (opsional, untuk antrian; tanpa Redis fallback in-memory)
- FFmpeg (opsional, untuk konversi audio)

## 1. Clone & Struktur
- Direktori: `server/` (backend), `web/` (frontend)

## 2. Konfigurasi Backend
- Salin `.env` contoh:
  ```bash
  cp server/.env.example server/.env
  ```
- Isi `ASSEMBLYAI_API_KEY` dengan API key Anda.
- (Opsional) Set `REDIS_URL` jika memakai Redis.

## 3. Install Dependensi
```bash
cd server && npm i
cd ../web && npm i
```

## 4. Menjalankan (Dev)
- Jalankan backend:
  ```bash
  cd server
  npm run dev
  ```
- Jalankan frontend:
  ```bash
  cd web
  npm run dev
  ```
- Akses: `http://localhost:5173`

## 5. Docker Compose (Opsional)
```bash
docker compose up --build
```
Backend di `:4000`, Frontend di `:5173`.

## 6. Catatan
- File upload disimpan di `server/uploads/`.
- Job & hasil tersimpan di `server/data/jobs/`.
- Data dihapus otomatis sesuai kebijakan Anda (tambahkan cron/worker jika perlu).