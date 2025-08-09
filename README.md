# Indonesian Audio Transcription Application

Aplikasi web profesional untuk transkripsi audio bahasa Indonesia yang dirancang khusus untuk keperluan akademis, penelitian, dan wawancara. Aplikasi ini mendukung multiple speech-to-text engines, speaker diarization, dan export ke berbagai format dokumen akademis.

## 🚀 Fitur Utama

### Audio Processing
- **Multi-format Support**: MP3, WAV, M4A, OGG, FLAC, AAC
- **Large File Handling**: Mendukung file hingga 500MB atau 3 jam durasi
- **Automatic Conversion**: Konversi otomatis ke format optimal untuk transkripsi
- **Batch Processing**: Upload dan proses multiple file sekaligus

### Speech Recognition
- **Multiple Engines**: OpenAI Whisper, Google Cloud Speech, Azure Cognitive Services
- **Indonesian Optimized**: Khusus dioptimalkan untuk bahasa Indonesia
- **High Accuracy**: Akurasi tinggi dengan punctuation dan capitalization otomatis
- **Verbatim Mode**: Transkripsi kata per kata termasuk filler words

### Speaker Diarization
- **Auto Detection**: Deteksi otomatis jumlah pembicara (2-6 speaker)
- **Speaker Labeling**: Label pembicara dengan kemampuan rename manual
- **Confidence Scoring**: Tingkat kepercayaan deteksi pembicara
- **Manual Correction**: Edit assignment speaker secara manual

### Real-time Editor
- **Live Editing**: Edit transkrip real-time dengan auto-save
- **Timestamp Sync**: Klik timestamp untuk jump ke posisi audio
- **Keyboard Shortcuts**: Shortcut lengkap untuk productive editing
- **Search & Replace**: Find and replace text dalam transkrip
- **Comments & Notes**: Tambahkan catatan pada segmen tertentu

### Export & Download
- **Microsoft Word (.docx)**: Format profesional untuk akademis
- **PDF**: A4 dengan formatting akademis dan bookmark
- **Plain Text (.txt)**: Format sederhana
- **Subtitle (.srt)**: Format subtitle
- **JSON**: Data terstruktur untuk analisis
- **Excel (.xlsx)**: Untuk analisis kuantitatif

### Academic Features
- **Citation Format**: Auto-generate citation untuk transkrip
- **Templates**: Template APA, MLA, Chicago style
- **Anonymization**: Tool untuk mengganti nama dengan pseudonym
- **Statistics**: Word count, speaking time, analisis pembicara

## 🛠️ Teknologi

### Frontend
- **React 18** dengan Material-UI
- **Real-time Updates** dengan Socket.IO
- **Advanced Audio Player** dengan waveform visualization
- **Responsive Design** untuk desktop dan tablet

### Backend
- **Node.js** dengan Express framework
- **FFmpeg** untuk audio processing
- **OpenAI Whisper API** sebagai speech engine utama
- **Socket.IO** untuk real-time communication
- **Winston** untuk comprehensive logging

### Speech Services
- **OpenAI Whisper**: Primary speech-to-text engine
- **Google Cloud Speech**: Alternative dengan speaker diarization
- **Azure Cognitive Services**: Enterprise-grade transcription

## 📋 Prerequisites

### System Requirements
- **Node.js**: v18.0.0 atau lebih baru
- **FFmpeg**: v4.0 atau lebih baru
- **RAM**: Minimal 4GB (8GB recommended)
- **Storage**: 10GB free space untuk temporary files

### API Keys (Optional)
- **OpenAI API Key**: Untuk Whisper transcription
- **Google Cloud Credentials**: Untuk Google Speech-to-Text
- **Azure Speech Key**: Untuk Azure Cognitive Services

## 🚀 Installation

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/indonesian-audio-transcription.git
cd indonesian-audio-transcription
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install all dependencies (client + server)
npm run install:all
```

### 3. Install FFmpeg

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

#### macOS
```bash
brew install ffmpeg
```

#### Windows
Download dari [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)

### 4. Environment Configuration
```bash
# Copy environment template
cp server/.env.example server/.env

# Edit konfigurasi
nano server/.env
```

### 5. Configure API Keys
Edit `server/.env` dan tambahkan API keys:

```env
# Required - OpenAI Whisper
OPENAI_API_KEY=your-openai-api-key-here

# Optional - Google Cloud Speech
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json

# Optional - Azure Speech
AZURE_SPEECH_KEY=your-azure-key
AZURE_SPEECH_REGION=southeastasia
```

### 6. Start Application
```bash
# Development mode (client + server)
npm run dev

# Production mode
npm run build
npm run server:start
```

Aplikasi akan berjalan di:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5000

## 📖 Usage Guide

### 1. Upload Audio File
1. Buka aplikasi di browser
2. Drag & drop file audio atau klik "Pilih File Audio"
3. Pilih pengaturan transkripsi (speech engine, jumlah speaker, dll)
4. Klik "Mulai Transkripsi"

### 2. Monitor Progress
- Real-time progress bar menampilkan status
- Notifikasi untuk setiap tahap processing
- Estimasi waktu tersisa

### 3. Edit Transcript
- Klik pada transkrip untuk edit langsung
- Gunakan keyboard shortcuts untuk efisiensi
- Sync dengan audio player untuk accuracy check

### 4. Export Results
1. Pilih format export (Word, PDF, TXT, dll)
2. Pilih template formatting
3. Download file hasil

## ⌨️ Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| `Space` | Play/Pause audio |
| `F1-F6` | Assign speaker to segment |
| `Ctrl+S` | Save project |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+F` | Find & Replace |
| `Tab` | Next segment |
| `Shift+Tab` | Previous segment |

## 🔧 Configuration

### Audio Processing Settings
```env
MAX_FILE_SIZE_MB=500
MAX_DURATION_HOURS=3
MAX_CONCURRENT_JOBS=3
```

### Quality Settings
- **Sample Rate**: 16kHz (optimal for speech)
- **Channels**: Mono (converted automatically)
- **Format**: WAV PCM (internal processing)

### Cleanup Settings
```env
TEMP_FILE_RETENTION_HOURS=24
PROCESSED_FILE_RETENTION_DAYS=30
LOG_FILE_RETENTION_DAYS=7
```

## 📊 Performance Optimization

### File Size Recommendations
- **Optimal**: 50-200MB per file
- **Maximum**: 500MB per file
- **Duration**: 30-60 menit per file optimal

### System Performance
- **CPU**: Multi-core recommended untuk concurrent jobs
- **RAM**: 2GB per concurrent transcription job
- **Storage**: SSD recommended untuk temporary files

## 🔒 Security

### Data Privacy
- File audio di-encrypt saat storage
- Auto-delete setelah retention period
- No data sharing dengan third parties (kecuali API calls)

### Access Control
- JWT-based authentication
- Project-level permissions
- Audit logging untuk semua aktivitas

## 🐛 Troubleshooting

### Common Issues

#### FFmpeg Not Found
```bash
# Linux
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows - add to PATH
```

#### OpenAI API Errors
- Pastikan API key valid dan memiliki credits
- Check rate limits
- Verify internet connection

#### Large File Processing
- Pastikan sufficient disk space
- Monitor RAM usage
- Consider file splitting untuk file >200MB

#### Audio Quality Issues
- Gunakan audio berkualitas tinggi (minimal 16kHz)
- Hindari background noise
- Pastikan speaker terdengar jelas

### Logs Location
```
server/logs/
├── combined.log    # All logs
├── error.log      # Error logs only
├── transcription.log # Transcription specific
└── cleanup.log    # Cleanup service logs
```

## 🤝 Contributing

### Development Setup
```bash
# Install development dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

### Code Style
- ESLint configuration untuk JavaScript
- Prettier untuk code formatting
- Material-UI design guidelines

### Pull Request Process
1. Fork repository
2. Create feature branch
3. Commit changes dengan descriptive messages
4. Ensure tests pass
5. Submit pull request

## 📄 License

MIT License - lihat [LICENSE](LICENSE) file untuk details.

## 🆘 Support

### Documentation
- **API Documentation**: `/api/docs` (when running)
- **User Manual**: [Wiki](https://github.com/yourusername/repo/wiki)

### Contact
- **Email**: support@yourdomain.com
- **Issues**: [GitHub Issues](https://github.com/yourusername/repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/repo/discussions)

## 🎯 Roadmap

### Version 1.1
- [ ] Real-time transcription
- [ ] Mobile app support
- [ ] Advanced analytics
- [ ] Cloud storage integration

### Version 1.2
- [ ] Multi-language support
- [ ] Custom vocabulary
- [ ] Advanced diarization
- [ ] Collaboration features

## 🙏 Acknowledgments

- **OpenAI** untuk Whisper API
- **Google Cloud** untuk Speech-to-Text
- **Microsoft Azure** untuk Cognitive Services
- **Material-UI** untuk React components
- **FFmpeg** untuk audio processing

---

**Made with ❤️ for Indonesian Academic Research**
