# Transkriptor ID — Aplikasi Transkripsi Otomatis Bahasa Indonesia

Aplikasi web untuk transkripsi audio Bahasa Indonesia secara verbatim dengan timestamp, deteksi pembicara, editor terpadu, dan ekspor ke DOCX/PDF/SRT/TXT/JSON/Excel. Dirancang untuk kebutuhan akademis.

## Fitur Utama
- Upload audio besar (hingga 500MB / ~3 jam) via drag & drop
- Transkripsi otomatis (verbatim, tanda baca, kapitalisasi) — Bahasa Indonesia
- Deteksi pembicara (speaker diarization) dan label yang dapat diubah
- Timestamp per pergantian pembicara atau tiap 30 detik
- Editor transkrip sinkron dengan pemutar audio dan waveform
- Penanda kepercayaan (confidence), highlight kata rendah, saran alternatif (baseline)
- Pencarian & penggantian, catatan, highlight
- Indikator progres real-time per tahap + estimasi waktu
- Ekspor DOCX, PDF, SRT, TXT, JSON, Excel
- Proyek dapat disimpan, versi, auto-backup, siap kolaborasi read-only

## Arsitektur
- Frontend: React + Vite + TypeScript + Material UI + WaveSurfer.js
- Backend: Node.js + Express + TypeScript
- STT Provider (default): AssemblyAI (mendukung Bahasa Indonesia, diarization, confidence)
- Antrian: BullMQ + Redis (fallback ke in-memory queue jika Redis tidak tersedia)
- Penyimpanan: Disk lokal (opsional S3)
- Ekspor: docx, pdfmake, exceljs
- Audio processing: FFmpeg (opsional, untuk konversi), Web Audio API/WaveSurfer untuk playback

## Direktori
- `server/` — Backend Express + layanan transkripsi
- `web/` — Frontend React editor
- `docs/` — Panduan instalasi, manual pengguna (Bahasa Indonesia), API, testing, deployment

## Mulai Cepat
1) Lihat `docs/INSTALLATION.md` untuk instalasi lengkap.
2) Siapkan environment `server/.env` (lihat `server/.env.example`).
3) Jalankan backend lalu frontend.

## Catatan Akurasi
Gunakan kualitas audio baik (microphone jelas, minim noise). Provider default mengaktifkan disfluencies agar filler words tetap dipertahankan (verbatim).

## Lisensi
Proprietary — untuk keperluan proyek ini. Dapat disesuaikan.
