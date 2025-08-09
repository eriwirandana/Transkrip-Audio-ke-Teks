const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

class WhisperService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'whisper' },
      transports: [
        new winston.transports.File({ filename: 'logs/whisper.log' }),
        new winston.transports.Console()
      ]
    });
  }

  async transcribe(audioPath, options = {}, progressCallback = null) {
    try {
      this.logger.info(`Starting Whisper transcription: ${audioPath}`);
      
      if (progressCallback) progressCallback(5);
      
      // Check if file exists and get size
      const stats = fs.statSync(audioPath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      this.logger.info(`Audio file size: ${fileSizeInMB.toFixed(2)} MB`);
      
      if (progressCallback) progressCallback(10);
      
      // For large files (>25MB), we need to split them
      if (fileSizeInMB > 25) {
        return await this.transcribeLargeFile(audioPath, options, progressCallback);
      }
      
      if (progressCallback) progressCallback(20);
      
      const transcriptionOptions = {
        file: fs.createReadStream(audioPath),
        model: options.model || 'whisper-1',
        language: this.extractLanguageCode(options.language || 'id-ID'),
        response_format: 'verbose_json',
        timestamp_granularities: ['word', 'segment']
      };
      
      if (progressCallback) progressCallback(30);
      
      this.logger.info('Sending request to OpenAI Whisper API');
      
      const transcription = await this.openai.audio.transcriptions.create(transcriptionOptions);
      
      if (progressCallback) progressCallback(80);
      
      const result = this.formatWhisperResponse(transcription, options);
      
      if (progressCallback) progressCallback(100);
      
      this.logger.info(`Whisper transcription completed: ${result.segments.length} segments`);
      
      return result;
      
    } catch (error) {
      this.logger.error('Whisper transcription failed:', error);
      throw new Error(`Whisper transcription failed: ${error.message}`);
    }
  }

  async transcribeLargeFile(audioPath, options = {}, progressCallback = null) {
    this.logger.info('Transcribing large file with chunking');
    
    const ffmpeg = require('fluent-ffmpeg');
    const { v4: uuidv4 } = require('uuid');
    const tempDir = path.join(__dirname, '../uploads/temp');
    
    // Split audio into 20-minute chunks
    const chunkDuration = 20 * 60; // 20 minutes in seconds
    const chunks = [];
    
    try {
      if (progressCallback) progressCallback(10);
      
      // Get audio duration
      const duration = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata.format.duration);
        });
      });
      
      const numChunks = Math.ceil(duration / chunkDuration);
      this.logger.info(`Splitting into ${numChunks} chunks`);
      
      // Create chunks
      for (let i = 0; i < numChunks; i++) {
        const chunkPath = path.join(tempDir, `chunk_${uuidv4()}.wav`);
        const startTime = i * chunkDuration;
        
        await new Promise((resolve, reject) => {
          ffmpeg(audioPath)
            .seekInput(startTime)
            .duration(chunkDuration)
            .audioChannels(1)
            .audioFrequency(16000)
            .format('wav')
            .on('end', resolve)
            .on('error', reject)
            .save(chunkPath);
        });
        
        chunks.push({
          path: chunkPath,
          startTime: startTime,
          endTime: Math.min(startTime + chunkDuration, duration)
        });
        
        if (progressCallback) {
          const chunkProgress = 20 + (i / numChunks) * 20;
          progressCallback(chunkProgress);
        }
      }
      
      // Transcribe each chunk
      const allSegments = [];
      let wordId = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        this.logger.info(`Transcribing chunk ${i + 1}/${chunks.length}`);
        
        const chunkResult = await this.transcribe(chunk.path, options, null);
        
        // Adjust timestamps
        chunkResult.segments.forEach(segment => {
          segment.start += chunk.startTime;
          segment.end += chunk.startTime;
          segment.id = allSegments.length;
          
          if (segment.words) {
            segment.words.forEach(word => {
              word.start += chunk.startTime;
              word.end += chunk.startTime;
              word.id = wordId++;
            });
          }
          
          allSegments.push(segment);
        });
        
        // Clean up chunk file
        try {
          fs.unlinkSync(chunk.path);
        } catch (error) {
          this.logger.warn(`Failed to delete chunk file: ${chunk.path}`);
        }
        
        if (progressCallback) {
          const transcriptionProgress = 40 + (i / chunks.length) * 50;
          progressCallback(transcriptionProgress);
        }
      }
      
      if (progressCallback) progressCallback(95);
      
      // Merge segments if they're close together (same speaker, short gap)
      const mergedSegments = this.mergeCloseSegments(allSegments);
      
      const result = {
        text: mergedSegments.map(seg => seg.text).join(' '),
        language: options.language || 'id-ID',
        duration: duration,
        segments: mergedSegments,
        words: mergedSegments.flatMap(seg => seg.words || [])
      };
      
      if (progressCallback) progressCallback(100);
      
      this.logger.info(`Large file transcription completed: ${result.segments.length} segments`);
      
      return result;
      
    } catch (error) {
      // Clean up chunk files on error
      chunks.forEach(chunk => {
        try {
          fs.unlinkSync(chunk.path);
        } catch (cleanupError) {
          this.logger.warn(`Failed to delete chunk file: ${chunk.path}`);
        }
      });
      
      throw error;
    }
  }

  formatWhisperResponse(transcription, options) {
    const segments = transcription.segments || [];
    const words = transcription.words || [];
    
    // Format segments
    const formattedSegments = segments.map((segment, index) => ({
      id: index,
      start: segment.start,
      end: segment.end,
      text: this.formatIndonesianText(segment.text, options),
      confidence: segment.avg_logprob ? Math.exp(segment.avg_logprob) : 0.8, // Convert log prob to confidence
      words: segment.words?.map((word, wordIndex) => ({
        id: wordIndex,
        text: word.word.trim(),
        start: word.start,
        end: word.end,
        confidence: word.probability || 0.8
      })) || []
    }));
    
    // If no word-level timestamps in segments, use the global words array
    if (words.length > 0 && formattedSegments.every(seg => !seg.words || seg.words.length === 0)) {
      // Assign words to segments based on timing
      formattedSegments.forEach(segment => {
        segment.words = words.filter(word => 
          word.start >= segment.start && word.end <= segment.end
        ).map((word, wordIndex) => ({
          id: wordIndex,
          text: word.word.trim(),
          start: word.start,
          end: word.end,
          confidence: word.probability || 0.8
        }));
      });
    }
    
    return {
      text: transcription.text,
      language: transcription.language || 'id',
      duration: transcription.duration || this.calculateDuration(segments),
      segments: formattedSegments,
      words: formattedSegments.flatMap(seg => seg.words || [])
    };
  }

  formatIndonesianText(text, options = {}) {
    if (!text) return '';
    
    let formatted = text.trim();
    
    // Remove extra whitespace
    formatted = formatted.replace(/\s+/g, ' ');
    
    // Basic Indonesian punctuation fixes
    formatted = formatted.replace(/\s+([,.!?;:])/g, '$1');
    formatted = formatted.replace(/([.!?])\s*([a-zA-Z])/g, '$1 $2');
    
    // Capitalize first letter of sentences
    formatted = formatted.replace(/(^|[.!?]\s+)([a-z])/g, (match, p1, p2) => {
      return p1 + p2.toUpperCase();
    });
    
    // Common Indonesian proper nouns and terms
    const properNouns = [
      'Indonesia', 'Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang',
      'Palembang', 'Makassar', 'Depok', 'Tangerang', 'Bekasi', 'Yogyakarta',
      'Solo', 'Malang', 'Denpasar', 'Balikpapan', 'Samarinda', 'Pontianak',
      'Banjarmasin', 'Pekanbaru', 'Batam', 'Padang', 'Manado', 'Ambon',
      'Jayapura', 'Kupang', 'Mataram', 'Banda Aceh', 'Bengkulu', 'Jambi',
      'Lampung', 'Riau', 'Sumatra', 'Kalimantan', 'Sulawesi', 'Papua',
      'Jawa', 'Bali', 'Nusa Tenggara', 'Maluku', 'Allah', 'Tuhan', 'Islam',
      'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'
    ];
    
    properNouns.forEach(noun => {
      const regex = new RegExp(`\\b${noun.toLowerCase()}\\b`, 'gi');
      formatted = formatted.replace(regex, noun);
    });
    
    // Handle common Indonesian abbreviations
    const abbreviations = {
      'dr ': 'Dr. ',
      'prof ': 'Prof. ',
      'ir ': 'Ir. ',
      'drs ': 'Drs. ',
      'dra ': 'Dra. ',
      'mt ': 'MT. ',
      'st ': 'ST. ',
      'pt ': 'PT. ',
      'cv ': 'CV. ',
      'ud ': 'UD. ',
      'pd ': 'PD. ',
      'tbk ': 'Tbk. '
    };
    
    Object.keys(abbreviations).forEach(abbr => {
      const regex = new RegExp(`\\b${abbr}`, 'gi');
      formatted = formatted.replace(regex, abbreviations[abbr]);
    });
    
    // Handle time expressions
    formatted = formatted.replace(/(\d{1,2})\s*:\s*(\d{2})/g, '$1:$2');
    
    // Handle numbers with Indonesian thousand separators
    formatted = formatted.replace(/(\d+)\s*ribu/g, '$1 ribu');
    formatted = formatted.replace(/(\d+)\s*juta/g, '$1 juta');
    formatted = formatted.replace(/(\d+)\s*miliar/g, '$1 miliar');
    
    return formatted;
  }

  mergeCloseSegments(segments, maxGap = 1.0) {
    if (!segments || segments.length === 0) return segments;
    
    const merged = [segments[0]];
    
    for (let i = 1; i < segments.length; i++) {
      const current = segments[i];
      const previous = merged[merged.length - 1];
      
      // If segments are close together, merge them
      if (current.start - previous.end <= maxGap) {
        previous.end = current.end;
        previous.text += ' ' + current.text;
        
        // Merge words arrays
        if (previous.words && current.words) {
          previous.words = previous.words.concat(current.words);
        }
        
        // Update confidence (average)
        previous.confidence = (previous.confidence + current.confidence) / 2;
      } else {
        merged.push(current);
      }
    }
    
    // Re-index merged segments
    merged.forEach((segment, index) => {
      segment.id = index;
    });
    
    return merged;
  }

  calculateDuration(segments) {
    if (!segments || segments.length === 0) return 0;
    return Math.max(...segments.map(seg => seg.end));
  }

  extractLanguageCode(language) {
    // Convert full language codes to Whisper format
    const languageMap = {
      'id-ID': 'id',
      'en-US': 'en',
      'en-GB': 'en',
      'ms-MY': 'ms',
      'zh-CN': 'zh',
      'ja-JP': 'ja',
      'ko-KR': 'ko',
      'th-TH': 'th',
      'vi-VN': 'vi'
    };
    
    return languageMap[language] || language.split('-')[0] || 'id';
  }

  async validateApiKey() {
    try {
      const models = await this.openai.models.list();
      const whisperModels = models.data.filter(model => 
        model.id.includes('whisper')
      );
      
      this.logger.info(`Available Whisper models: ${whisperModels.map(m => m.id).join(', ')}`);
      
      return whisperModels.length > 0;
    } catch (error) {
      this.logger.error('Failed to validate OpenAI API key:', error);
      return false;
    }
  }

  getCapabilities() {
    return {
      supportedLanguages: ['id', 'en', 'ms', 'zh', 'ja', 'ko', 'th', 'vi'],
      supportedFormats: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'],
      maxFileSize: '25MB',
      wordTimestamps: true,
      punctuation: true,
      verbatim: true,
      confidence: true
    };
  }
}

module.exports = WhisperService;