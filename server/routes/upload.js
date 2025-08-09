const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

const router = express.Router();

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'upload' },
  transports: [
    new winston.transports.File({ filename: 'logs/upload.log' }),
    new winston.transports.Console()
  ]
});

// Supported audio formats
const SUPPORTED_FORMATS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.webm', '.3gp'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_DURATION = 3 * 60 * 60; // 3 hours in seconds

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/audio');
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueId}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (!SUPPORTED_FORMATS.includes(ext)) {
      return cb(new Error(`Format file tidak didukung. Format yang didukung: ${SUPPORTED_FORMATS.join(', ')}`));
    }
    
    // Check mime type
    const allowedMimes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mp4',
      'audio/m4a',
      'audio/ogg',
      'audio/flac',
      'audio/aac',
      'audio/webm',
      'audio/3gpp',
      'video/mp4', // Sometimes m4a files are detected as video
      'video/quicktime' // Sometimes m4a files
    ];
    
    if (!allowedMimes.includes(file.mimetype)) {
      logger.warn(`Rejected file with mime type: ${file.mimetype}`);
    }
    
    cb(null, true); // Accept all files, we'll validate format later
  }
});

// Single file upload endpoint
router.post('/single', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Tidak ada file yang diupload',
        message: 'Silakan pilih file audio untuk diupload'
      });
    }

    logger.info(`File uploaded: ${req.file.originalname} (${req.file.size} bytes)`);

    // Validate file format and get metadata
    const validation = await validateAudioFile(req.file.path);
    
    if (!validation.isValid) {
      // Delete invalid file
      await fs.unlink(req.file.path).catch(() => {});
      
      return res.status(400).json({
        error: 'File audio tidak valid',
        message: validation.error
      });
    }

    // Prepare job data
    const jobData = {
      projectId: req.body.projectId || uuidv4(),
      filename: req.file.originalname,
      audioPath: req.file.path,
      fileSize: req.file.size,
      duration: validation.duration,
      format: validation.format,
      speechService: req.body.speechService || 'whisper',
      model: req.body.model || 'whisper-1',
      expectedSpeakers: req.body.expectedSpeakers || 'auto',
      verbatim: req.body.verbatim === 'true',
      userId: req.user?.id,
      uploadedAt: new Date()
    };

    // Add job to transcription queue
    const jobId = await req.transcriptionQueue.addJob(jobData);

    res.json({
      success: true,
      message: 'File berhasil diupload dan ditambahkan ke antrian transkripsi',
      data: {
        jobId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        duration: validation.duration,
        format: validation.format,
        projectId: jobData.projectId
      }
    });

  } catch (error) {
    logger.error('Upload error:', error);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    res.status(500).json({
      error: 'Gagal mengupload file',
      message: error.message
    });
  }
});

// Multiple files upload endpoint
router.post('/multiple', upload.array('audio', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'Tidak ada file yang diupload',
        message: 'Silakan pilih minimal satu file audio untuk diupload'
      });
    }

    logger.info(`Multiple files uploaded: ${req.files.length} files`);

    const results = [];
    const errors = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      try {
        // Validate each file
        const validation = await validateAudioFile(file.path);
        
        if (!validation.isValid) {
          await fs.unlink(file.path).catch(() => {});
          errors.push({
            filename: file.originalname,
            error: validation.error
          });
          continue;
        }

        // Prepare job data
        const jobData = {
          projectId: req.body.projectId || uuidv4(),
          filename: file.originalname,
          audioPath: file.path,
          fileSize: file.size,
          duration: validation.duration,
          format: validation.format,
          speechService: req.body.speechService || 'whisper',
          model: req.body.model || 'whisper-1',
          expectedSpeakers: req.body.expectedSpeakers || 'auto',
          verbatim: req.body.verbatim === 'true',
          userId: req.user?.id,
          uploadedAt: new Date()
        };

        // Add job to transcription queue
        const jobId = await req.transcriptionQueue.addJob(jobData);

        results.push({
          jobId,
          filename: file.originalname,
          fileSize: file.size,
          duration: validation.duration,
          format: validation.format,
          projectId: jobData.projectId
        });

      } catch (error) {
        logger.error(`Error processing file ${file.originalname}:`, error);
        await fs.unlink(file.path).catch(() => {});
        
        errors.push({
          filename: file.originalname,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `${results.length} file berhasil diupload, ${errors.length} file gagal`,
      data: {
        successful: results,
        failed: errors,
        totalUploaded: results.length,
        totalFailed: errors.length
      }
    });

  } catch (error) {
    logger.error('Multiple upload error:', error);
    
    // Clean up all uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(() => {});
      }
    }

    res.status(500).json({
      error: 'Gagal mengupload file',
      message: error.message
    });
  }
});

// URL upload endpoint (for URLs like YouTube, etc.)
router.post('/url', async (req, res) => {
  try {
    const { url, projectId } = req.body;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL tidak diberikan',
        message: 'Silakan berikan URL audio/video yang valid'
      });
    }

    logger.info(`URL upload requested: ${url}`);

    // Download audio from URL
    const downloadResult = await downloadAudioFromUrl(url);
    
    if (!downloadResult.success) {
      return res.status(400).json({
        error: 'Gagal mengunduh audio dari URL',
        message: downloadResult.error
      });
    }

    // Validate downloaded file
    const validation = await validateAudioFile(downloadResult.filePath);
    
    if (!validation.isValid) {
      await fs.unlink(downloadResult.filePath).catch(() => {});
      
      return res.status(400).json({
        error: 'File audio dari URL tidak valid',
        message: validation.error
      });
    }

    // Prepare job data
    const jobData = {
      projectId: projectId || uuidv4(),
      filename: downloadResult.filename,
      audioPath: downloadResult.filePath,
      fileSize: validation.fileSize,
      duration: validation.duration,
      format: validation.format,
      speechService: req.body.speechService || 'whisper',
      model: req.body.model || 'whisper-1',
      expectedSpeakers: req.body.expectedSpeakers || 'auto',
      verbatim: req.body.verbatim === 'true',
      userId: req.user?.id,
      uploadedAt: new Date(),
      sourceUrl: url
    };

    // Add job to transcription queue
    const jobId = await req.transcriptionQueue.addJob(jobData);

    res.json({
      success: true,
      message: 'Audio berhasil diunduh dari URL dan ditambahkan ke antrian transkripsi',
      data: {
        jobId,
        filename: downloadResult.filename,
        fileSize: validation.fileSize,
        duration: validation.duration,
        format: validation.format,
        projectId: jobData.projectId,
        sourceUrl: url
      }
    });

  } catch (error) {
    logger.error('URL upload error:', error);
    
    res.status(500).json({
      error: 'Gagal mengunduh audio dari URL',
      message: error.message
    });
  }
});

// Get upload progress endpoint
router.get('/progress/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const queueStatus = req.transcriptionQueue.getQueueStatus();
    
    // Find job in processing queue
    const processingJob = queueStatus.processing.find(job => job.id === jobId);
    
    if (processingJob) {
      res.json({
        success: true,
        data: {
          jobId,
          status: 'processing',
          progress: processingJob.progress,
          stage: processingJob.stage
        }
      });
    } else {
      // Check if job is in queue
      const queuePosition = req.transcriptionQueue.queue.findIndex(job => job.id === jobId);
      
      if (queuePosition !== -1) {
        res.json({
          success: true,
          data: {
            jobId,
            status: 'queued',
            progress: 0,
            queuePosition: queuePosition + 1
          }
        });
      } else {
        res.json({
          success: true,
          data: {
            jobId,
            status: 'not_found',
            message: 'Job tidak ditemukan dalam antrian'
          }
        });
      }
    }

  } catch (error) {
    logger.error('Progress check error:', error);
    
    res.status(500).json({
      error: 'Gagal mengecek progress',
      message: error.message
    });
  }
});

// Cancel upload/transcription job
router.delete('/cancel/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const cancelled = await req.transcriptionQueue.cancelJob(jobId);
    
    if (cancelled) {
      res.json({
        success: true,
        message: 'Job berhasil dibatalkan'
      });
    } else {
      res.status(404).json({
        error: 'Job tidak ditemukan',
        message: 'Job mungkin sudah selesai atau tidak ada dalam antrian'
      });
    }

  } catch (error) {
    logger.error('Cancel job error:', error);
    
    res.status(500).json({
      error: 'Gagal membatalkan job',
      message: error.message
    });
  }
});

// Validate audio file
async function validateAudioFile(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.error('FFprobe error:', err);
        resolve({
          isValid: false,
          error: 'File bukan format audio yang valid atau rusak'
        });
        return;
      }

      try {
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        
        if (!audioStream) {
          resolve({
            isValid: false,
            error: 'File tidak mengandung stream audio'
          });
          return;
        }

        const duration = parseFloat(metadata.format.duration);
        const fileSize = parseInt(metadata.format.size);
        
        if (duration > MAX_DURATION) {
          resolve({
            isValid: false,
            error: `Durasi audio terlalu panjang. Maksimal ${MAX_DURATION / 3600} jam`
          });
          return;
        }

        if (duration < 1) {
          resolve({
            isValid: false,
            error: 'Durasi audio terlalu pendek. Minimal 1 detik'
          });
          return;
        }

        resolve({
          isValid: true,
          duration: duration,
          fileSize: fileSize,
          format: audioStream.codec_name,
          sampleRate: audioStream.sample_rate,
          channels: audioStream.channels,
          bitRate: audioStream.bit_rate
        });

      } catch (error) {
        logger.error('Metadata parsing error:', error);
        resolve({
          isValid: false,
          error: 'Gagal membaca metadata file audio'
        });
      }
    });
  });
}

// Download audio from URL
async function downloadAudioFromUrl(url) {
  const ytdl = require('ytdl-core');
  const axios = require('axios');
  
  try {
    // Check if it's a YouTube URL
    if (ytdl.validateURL(url)) {
      return await downloadFromYouTube(url);
    } else {
      return await downloadDirectUrl(url);
    }
  } catch (error) {
    logger.error('URL download error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function downloadFromYouTube(url) {
  // Note: ytdl-core might need additional setup for latest YouTube changes
  // Consider using yt-dlp as a subprocess instead for better reliability
  
  try {
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title.replace(/[^\w\s-]/g, '').substring(0, 50);
    const filename = `${title}_${Date.now()}.mp4`;
    const filePath = path.join(__dirname, '../uploads/audio', filename);
    
    return new Promise((resolve, reject) => {
      const stream = ytdl(url, {
        quality: 'highestaudio',
        filter: 'audioonly'
      });
      
      const writeStream = fs.createWriteStream(filePath);
      
      stream.pipe(writeStream);
      
      writeStream.on('finish', () => {
        resolve({
          success: true,
          filePath,
          filename
        });
      });
      
      stream.on('error', reject);
      writeStream.on('error', reject);
    });
    
  } catch (error) {
    throw new Error(`Gagal mengunduh dari YouTube: ${error.message}`);
  }
}

async function downloadDirectUrl(url) {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.includes('audio')) {
      throw new Error('URL tidak mengarah ke file audio');
    }
    
    const filename = `download_${Date.now()}.mp3`;
    const filePath = path.join(__dirname, '../uploads/audio', filename);
    
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      
      response.data.pipe(writeStream);
      
      writeStream.on('finish', () => {
        resolve({
          success: true,
          filePath,
          filename
        });
      });
      
      response.data.on('error', reject);
      writeStream.on('error', reject);
    });
    
  } catch (error) {
    throw new Error(`Gagal mengunduh dari URL: ${error.message}`);
  }
}

// Error handling middleware
router.use((error, req, res, next) => {
  logger.error('Upload route error:', error);
  
  // Clean up uploaded files on error
  if (req.file) {
    fs.unlink(req.file.path).catch(() => {});
  }
  if (req.files) {
    req.files.forEach(file => {
      fs.unlink(file.path).catch(() => {});
    });
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File terlalu besar',
        message: `Ukuran file maksimal ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      });
    }
    
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Terlalu banyak file',
        message: 'Maksimal 10 file per upload'
      });
    }
  }

  res.status(500).json({
    error: 'Terjadi kesalahan pada server',
    message: error.message
  });
});

module.exports = router;