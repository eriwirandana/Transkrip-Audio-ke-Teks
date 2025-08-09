# Manual Pengguna

## Alur Dasar
1. Buka aplikasi (dashboard) — panel kiri untuk upload, kanan daftar pekerjaan.
2. Upload file audio (MP3/WAV/M4A/OGG/FLAC/AAC) hingga 500MB.
3. Setelah upload, sistem membuat job transkripsi. Lihat progres real-time.
4. Klik pekerjaan untuk membuka Editor.
5. Di Editor:
   - Putar audio, atur kecepatan.
   - Klik timestamp untuk lompat ke posisi audio.
   - Ubah label pembicara (Speaker 1/2/...).
   - Edit teks segmen secara langsung (auto-save per segmen).
6. Ekspor hasil dalam DOCX/PDF/TXT/SRT/JSON/Excel dari toolbar Editor.

## Pintasan Keyboard (dasar)
- Space: Play/Pause (fokus pada player/halaman)
- Ctrl+S: Disarankan edit akan otomatis tersimpan per segmen saat Anda berhenti mengetik.

## Catatan Akurasi
- Gunakan audio berkualitas baik untuk akurasi >95%.
- Filler words disertakan (verbatim).

## Masalah Umum
- Audio tidak dapat diputar: pastikan URL file tersedia (`/uploads/...`).
- Progres berhenti: cek koneksi internet; SSE membutuhkan koneksi stabil.
- Ekspor gagal: periksa apakah job sudah `completed`.