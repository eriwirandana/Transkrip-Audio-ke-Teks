const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

// Import speech-to-text services
const WhisperService = require('./whisperService');
const GoogleSpeechService = require('./googleSpeechService');
const AzureSpeechService = require('./azureSpeechService');
const SpeakerDiarizationService = require('./speakerDiarizationService');

class TranscriptionQueue extends EventEmitter {
  constructor(io) {
    super();
    this.io = io;
    this.queue = [];
    this.processing = new Map();
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_JOBS) || 3;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'transcription-queue' },
      transports: [
        new winston.transports.File({ filename: 'logs/transcription.log' }),
        new winston.transports.Console()
      ]
    });

    // Initialize speech services
    this.speechServices = {
      whisper: new WhisperService(),
      google: new GoogleSpeechService(),
      azure: new AzureSpeechService()
    };

    this.speakerDiarization = new SpeakerDiarizationService();
    
    setInterval(() => this.processQueue(), 1000);
  }

  async addJob(jobData) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      ...jobData,
      status: 'queued',
      progress: 0,
      createdAt: new Date(),
      estimatedDuration: null,
      stages: {
        upload: { status: 'completed', progress: 100 },
        processing: { status: 'pending', progress: 0 },
        transcription: { status: 'pending', progress: 0 },
        diarization: { status: 'pending', progress: 0 },
        finalization: { status: 'pending', progress: 0 }
      }
    };

    this.queue.push(job);
    this.logger.info(`Job added to queue: ${jobId}`);
    
    // Emit to client
    this.io.to(`project-${job.projectId}`).emit('job-queued', {
      jobId,
      queuePosition: this.queue.length,
      estimatedWaitTime: this.estimateWaitTime()
    });

    return jobId;
  }

  async processQueue() {
    if (this.processing.size >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    this.processing.set(job.id, job);
    
    try {
      await this.processJob(job);
    } catch (error) {
      this.logger.error(`Job ${job.id} failed:`, error);
      this.handleJobError(job, error);
    } finally {
      this.processing.delete(job.id);
    }
  }

  async processJob(job) {
    this.logger.info(`Starting job: ${job.id}`);
    
    try {
      // Stage 1: Audio Processing (10-20%)
      await this.updateJobProgress(job, 'processing', 'in_progress', 0);
      const processedAudio = await this.processAudio(job);
      await this.updateJobProgress(job, 'processing', 'completed', 100);

      // Stage 2: Transcription (20-80%)
      await this.updateJobProgress(job, 'transcription', 'in_progress', 0);
      const transcriptionResult = await this.transcribeAudio(job, processedAudio);
      await this.updateJobProgress(job, 'transcription', 'completed', 100);

      // Stage 3: Speaker Diarization (80-95%)
      await this.updateJobProgress(job, 'diarization', 'in_progress', 0);
      const diarizedResult = await this.performSpeakerDiarization(job, processedAudio, transcriptionResult);
      await this.updateJobProgress(job, 'diarization', 'completed', 100);

      // Stage 4: Finalization (95-100%)
      await this.updateJobProgress(job, 'finalization', 'in_progress', 0);
      const finalResult = await this.finalizeTranscription(job, diarizedResult);
      await this.updateJobProgress(job, 'finalization', 'completed', 100);

      // Job completed
      job.status = 'completed';
      job.result = finalResult;
      job.completedAt = new Date();

      this.io.to(`project-${job.projectId}`).emit('job-completed', {
        jobId: job.id,
        result: finalResult
      });

      this.logger.info(`Job completed: ${job.id}`);

    } catch (error) {
      throw error;
    }
  }

  async processAudio(job) {
    const inputPath = job.audioPath;
    const outputPath = path.join(__dirname, '../processed', `${job.id}.wav`);
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1) // Convert to mono
        .audioFrequency(16000) // 16kHz sample rate
        .audioCodec('pcm_s16le') // PCM 16-bit
        .format('wav')
        .on('start', (commandLine) => {
          this.logger.info(`FFmpeg started: ${commandLine}`);
        })
        .on('progress', (progress) => {
          const progressPercent = Math.round(progress.percent || 0);
          this.updateJobProgress(job, 'processing', 'in_progress', progressPercent);
        })
        .on('end', () => {
          this.logger.info(`Audio processing completed: ${job.id}`);
          resolve(outputPath);
        })
        .on('error', (error) => {
          this.logger.error(`Audio processing failed: ${job.id}`, error);
          reject(error);
        })
        .save(outputPath);
    });
  }

  async transcribeAudio(job, audioPath) {
    const service = job.speechService || 'whisper';
    const options = {
      language: 'id-ID',
      enableWordTimestamps: true,
      enablePunctuation: true,
      enableVerbatim: true,
      model: job.model || 'whisper-1'
    };

    this.logger.info(`Starting transcription with ${service}: ${job.id}`);

    let transcriptionResult;
    
    try {
      switch (service) {
        case 'whisper':
          transcriptionResult = await this.speechServices.whisper.transcribe(audioPath, options, (progress) => {
            this.updateJobProgress(job, 'transcription', 'in_progress', progress);
          });
          break;
        case 'google':
          transcriptionResult = await this.speechServices.google.transcribe(audioPath, options, (progress) => {
            this.updateJobProgress(job, 'transcription', 'in_progress', progress);
          });
          break;
        case 'azure':
          transcriptionResult = await this.speechServices.azure.transcribe(audioPath, options, (progress) => {
            this.updateJobProgress(job, 'transcription', 'in_progress', progress);
          });
          break;
        default:
          throw new Error(`Unsupported speech service: ${service}`);
      }
    } catch (error) {
      this.logger.error(`Transcription failed with ${service}, falling back to Whisper: ${job.id}`, error);
      transcriptionResult = await this.speechServices.whisper.transcribe(audioPath, options, (progress) => {
        this.updateJobProgress(job, 'transcription', 'in_progress', progress);
      });
    }

    return transcriptionResult;
  }

  async performSpeakerDiarization(job, audioPath, transcriptionResult) {
    const options = {
      numSpeakers: job.expectedSpeakers || 'auto',
      minSpeakers: 2,
      maxSpeakers: 6
    };

    this.logger.info(`Starting speaker diarization: ${job.id}`);

    const diarizationResult = await this.speakerDiarization.process(
      audioPath, 
      transcriptionResult, 
      options,
      (progress) => {
        this.updateJobProgress(job, 'diarization', 'in_progress', progress);
      }
    );

    return diarizationResult;
  }

  async finalizeTranscription(job, diarizedResult) {
    // Apply post-processing: punctuation, capitalization, formatting
    const finalResult = {
      id: job.id,
      projectId: job.projectId,
      filename: job.filename,
      duration: diarizedResult.duration,
      speakers: diarizedResult.speakers,
      segments: this.formatSegments(diarizedResult.segments),
      metadata: {
        language: 'id-ID',
        service: job.speechService || 'whisper',
        model: job.model || 'whisper-1',
        createdAt: new Date(),
        processingTime: Date.now() - job.createdAt.getTime(),
        confidence: this.calculateAverageConfidence(diarizedResult.segments)
      },
      statistics: this.generateStatistics(diarizedResult)
    };

    // Save to database/file
    await this.saveTranscription(finalResult);

    return finalResult;
  }

  formatSegments(segments) {
    return segments.map(segment => ({
      id: segment.id,
      start: segment.start,
      end: segment.end,
      timestamp: this.formatTimestamp(segment.start),
      speaker: segment.speaker,
      text: this.formatText(segment.text),
      confidence: segment.confidence,
      words: segment.words?.map(word => ({
        text: word.text,
        start: word.start,
        end: word.end,
        confidence: word.confidence
      }))
    }));
  }

  formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
    } else {
      return `[${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
    }
  }

  formatText(text) {
    // Basic Indonesian text formatting
    let formatted = text.trim();
    
    // Capitalize first letter of sentences
    formatted = formatted.replace(/(^|[.!?]\s+)([a-z])/g, (match, p1, p2) => {
      return p1 + p2.toUpperCase();
    });
    
    // Common Indonesian proper nouns (this could be expanded)
    const properNouns = ['Indonesia', 'Jakarta', 'Surabaya', 'Bandung', 'Medan'];
    properNouns.forEach(noun => {
      const regex = new RegExp(`\\b${noun.toLowerCase()}\\b`, 'gi');
      formatted = formatted.replace(regex, noun);
    });
    
    return formatted;
  }

  calculateAverageConfidence(segments) {
    if (!segments || segments.length === 0) return 0;
    
    const totalConfidence = segments.reduce((sum, segment) => sum + (segment.confidence || 0), 0);
    return totalConfidence / segments.length;
  }

  generateStatistics(diarizedResult) {
    const segments = diarizedResult.segments || [];
    const speakers = diarizedResult.speakers || [];
    
    const stats = {
      totalDuration: diarizedResult.duration,
      totalWords: segments.reduce((sum, seg) => sum + (seg.words?.length || 0), 0),
      totalSegments: segments.length,
      speakerStats: {}
    };

    speakers.forEach(speaker => {
      const speakerSegments = segments.filter(seg => seg.speaker === speaker.id);
      const speakingTime = speakerSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
      const wordCount = speakerSegments.reduce((sum, seg) => sum + (seg.words?.length || 0), 0);
      
      stats.speakerStats[speaker.id] = {
        name: speaker.name,
        speakingTime,
        speakingPercentage: (speakingTime / diarizedResult.duration) * 100,
        wordCount,
        averageConfidence: this.calculateAverageConfidence(speakerSegments)
      };
    });

    return stats;
  }

  async saveTranscription(result) {
    const filePath = path.join(__dirname, '../processed', `transcription-${result.id}.json`);
    await fs.writeJson(filePath, result, { spaces: 2 });
    this.logger.info(`Transcription saved: ${filePath}`);
  }

  async updateJobProgress(job, stage, status, progress) {
    job.stages[stage].status = status;
    job.stages[stage].progress = progress;
    
    // Calculate overall progress
    const stageWeights = {
      upload: 10,
      processing: 10,
      transcription: 60,
      diarization: 15,
      finalization: 5
    };
    
    let totalProgress = 0;
    Object.keys(job.stages).forEach(stageName => {
      const stageProgress = job.stages[stageName].progress;
      totalProgress += (stageProgress * stageWeights[stageName]) / 100;
    });
    
    job.progress = Math.round(totalProgress);
    
    // Emit progress update
    this.io.to(`project-${job.projectId}`).emit('job-progress', {
      jobId: job.id,
      stage,
      status,
      progress,
      overallProgress: job.progress,
      stages: job.stages,
      estimatedTimeRemaining: this.estimateTimeRemaining(job)
    });
  }

  estimateTimeRemaining(job) {
    if (job.progress === 0) return null;
    
    const elapsedTime = Date.now() - job.createdAt.getTime();
    const totalEstimated = (elapsedTime / job.progress) * 100;
    const remaining = totalEstimated - elapsedTime;
    
    return Math.max(0, Math.round(remaining / 1000)); // seconds
  }

  estimateWaitTime() {
    const avgProcessingTime = 5 * 60 * 1000; // 5 minutes average
    return (this.queue.length * avgProcessingTime) / this.maxConcurrent;
  }

  handleJobError(job, error) {
    job.status = 'failed';
    job.error = error.message;
    job.failedAt = new Date();
    
    this.io.to(`project-${job.projectId}`).emit('job-failed', {
      jobId: job.id,
      error: error.message,
      stage: this.getCurrentStage(job)
    });
    
    this.logger.error(`Job failed: ${job.id}`, error);
  }

  getCurrentStage(job) {
    for (const [stage, info] of Object.entries(job.stages)) {
      if (info.status === 'in_progress') {
        return stage;
      }
    }
    return 'unknown';
  }

  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: Array.from(this.processing.values()).map(job => ({
        id: job.id,
        filename: job.filename,
        progress: job.progress,
        stage: this.getCurrentStage(job)
      })),
      maxConcurrent: this.maxConcurrent
    };
  }

  async cancelJob(jobId) {
    // Remove from queue
    const queueIndex = this.queue.findIndex(job => job.id === jobId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      this.logger.info(`Job cancelled from queue: ${jobId}`);
      return true;
    }
    
    // Check if currently processing
    const processingJob = this.processing.get(jobId);
    if (processingJob) {
      processingJob.status = 'cancelled';
      this.logger.info(`Job marked for cancellation: ${jobId}`);
      return true;
    }
    
    return false;
  }
}

module.exports = TranscriptionQueue;