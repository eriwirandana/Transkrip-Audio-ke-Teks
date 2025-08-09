const { SpeechClient } = require('@google-cloud/speech');
const fs = require('fs');
const winston = require('winston');

class GoogleSpeechService {
  constructor() {
    this.client = null;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'google-speech' },
      transports: [
        new winston.transports.File({ filename: 'logs/google-speech.log' }),
        new winston.transports.Console()
      ]
    });

    this.initializeClient();
  }

  initializeClient() {
    try {
      // Initialize Google Cloud Speech client
      // Requires GOOGLE_APPLICATION_CREDENTIALS environment variable
      // or service account key file
      this.client = new SpeechClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE
      });
      
      this.logger.info('Google Cloud Speech client initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Google Cloud Speech client:', error);
      this.logger.warn('Google Cloud Speech service will not be available');
    }
  }

  async transcribe(audioPath, options = {}, progressCallback = null) {
    if (!this.client) {
      throw new Error('Google Cloud Speech client not initialized');
    }

    try {
      this.logger.info(`Starting Google Speech transcription: ${audioPath}`);
      
      if (progressCallback) progressCallback(5);

      // Read audio file
      const audioBytes = fs.readFileSync(audioPath).toString('base64');
      
      if (progressCallback) progressCallback(15);

      // Configure recognition request
      const request = {
        audio: {
          content: audioBytes,
        },
        config: {
          encoding: this.getAudioEncoding(audioPath),
          sampleRateHertz: options.sampleRate || 16000,
          languageCode: this.convertLanguageCode(options.language || 'id-ID'),
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
          enableAutomaticPunctuation: true,
          enableSpeakerDiarization: true,
          diarizationSpeakerCount: options.expectedSpeakers || 2,
          model: options.model || 'latest_long',
          useEnhanced: true,
          metadata: {
            interactionType: 'DICTATION',
            industryNanosectorCode: 6541, // Education
            microphoneDistance: 'NEARFIELD',
            originalMediaType: 'AUDIO',
            recordingDeviceType: 'OTHER_INDOOR_DEVICE'
          }
        }
      };

      if (progressCallback) progressCallback(25);

      this.logger.info('Sending request to Google Cloud Speech API');

      // Perform transcription
      const [response] = await this.client.recognize(request);
      
      if (progressCallback) progressCallback(80);

      // Format response
      const result = this.formatGoogleResponse(response, options);
      
      if (progressCallback) progressCallback(100);

      this.logger.info(`Google Speech transcription completed: ${result.segments.length} segments`);
      
      return result;

    } catch (error) {
      this.logger.error('Google Speech transcription failed:', error);
      throw new Error(`Google Speech transcription failed: ${error.message}`);
    }
  }

  formatGoogleResponse(response, options) {
    const results = response.results || [];
    const segments = [];
    const allWords = [];
    let segmentId = 0;

    for (const result of results) {
      const alternative = result.alternatives[0];
      if (!alternative) continue;

      const words = alternative.words || [];
      const confidence = alternative.confidence || 0;

      // Group words into segments (by speaker or time gaps)
      let currentSegment = null;
      let currentSpeaker = null;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const speaker = word.speakerTag || 1;
        const startTime = this.timeToSeconds(word.startTime);
        const endTime = this.timeToSeconds(word.endTime);

        // Start new segment if speaker changes or time gap is large
        if (!currentSegment || 
            speaker !== currentSpeaker || 
            (currentSegment.words.length > 0 && 
             startTime - currentSegment.words[currentSegment.words.length - 1].end > 2.0)) {
          
          if (currentSegment) {
            segments.push(this.finalizeSegment(currentSegment, segmentId++));
          }

          currentSegment = {
            start: startTime,
            end: endTime,
            words: [],
            speaker: `speaker_${speaker}`,
            confidence: confidence
          };
          currentSpeaker = speaker;
        }

        // Add word to current segment
        const formattedWord = {
          id: allWords.length,
          text: word.word,
          start: startTime,
          end: endTime,
          confidence: word.confidence || confidence
        };

        currentSegment.words.push(formattedWord);
        currentSegment.end = endTime;
        allWords.push(formattedWord);
      }

      // Add final segment
      if (currentSegment) {
        segments.push(this.finalizeSegment(currentSegment, segmentId++));
      }
    }

    // Calculate total duration
    const duration = segments.length > 0 ? 
      Math.max(...segments.map(seg => seg.end)) : 0;

    return {
      text: segments.map(seg => seg.text).join(' '),
      language: options.language || 'id-ID',
      duration: duration,
      segments: segments,
      words: allWords
    };
  }

  finalizeSegment(segment, id) {
    return {
      id: id,
      start: segment.start,
      end: segment.end,
      text: this.formatIndonesianText(segment.words.map(w => w.text).join(' ')),
      speaker: segment.speaker,
      confidence: segment.confidence,
      words: segment.words
    };
  }

  formatIndonesianText(text) {
    if (!text) return '';
    
    let formatted = text.trim();
    
    // Remove extra whitespace
    formatted = formatted.replace(/\s+/g, ' ');
    
    // Basic punctuation fixes
    formatted = formatted.replace(/\s+([,.!?;:])/g, '$1');
    formatted = formatted.replace(/([.!?])\s*([a-zA-Z])/g, '$1 $2');
    
    // Capitalize first letter of sentences
    formatted = formatted.replace(/(^|[.!?]\s+)([a-z])/g, (match, p1, p2) => {
      return p1 + p2.toUpperCase();
    });
    
    // Common Indonesian proper nouns
    const properNouns = [
      'Indonesia', 'Jakarta', 'Surabaya', 'Bandung', 'Medan',
      'Allah', 'Tuhan', 'Islam', 'Kristen', 'Katolik'
    ];
    
    properNouns.forEach(noun => {
      const regex = new RegExp(`\\b${noun.toLowerCase()}\\b`, 'gi');
      formatted = formatted.replace(regex, noun);
    });
    
    return formatted;
  }

  timeToSeconds(timeObj) {
    if (!timeObj) return 0;
    
    const seconds = parseInt(timeObj.seconds || 0);
    const nanos = parseInt(timeObj.nanos || 0);
    
    return seconds + (nanos / 1000000000);
  }

  getAudioEncoding(audioPath) {
    const ext = audioPath.toLowerCase().split('.').pop();
    
    const encodingMap = {
      'wav': 'LINEAR16',
      'flac': 'FLAC',
      'ogg': 'OGG_OPUS',
      'mp3': 'MP3',
      'm4a': 'MP3', // Treat as MP3 for simplicity
      'aac': 'MP3'
    };
    
    return encodingMap[ext] || 'LINEAR16';
  }

  convertLanguageCode(language) {
    // Convert to Google Cloud Speech language codes
    const languageMap = {
      'id-ID': 'id-ID', // Indonesian (Indonesia)
      'en-US': 'en-US', // English (US)
      'en-GB': 'en-GB', // English (UK)
      'ms-MY': 'ms-MY', // Malay (Malaysia)
      'zh-CN': 'zh-CN', // Chinese (Simplified)
      'ja-JP': 'ja-JP', // Japanese
      'ko-KR': 'ko-KR', // Korean
      'th-TH': 'th-TH', // Thai
      'vi-VN': 'vi-VN'  // Vietnamese
    };
    
    return languageMap[language] || 'id-ID';
  }

  async validateCredentials() {
    if (!this.client) {
      return false;
    }

    try {
      // Try to list available models to test credentials
      await this.client.listModels({
        parent: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/global`
      });
      
      this.logger.info('Google Cloud Speech credentials validated successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to validate Google Cloud Speech credentials:', error);
      return false;
    }
  }

  getCapabilities() {
    return {
      supportedLanguages: ['id-ID', 'en-US', 'en-GB', 'ms-MY', 'zh-CN', 'ja-JP', 'ko-KR', 'th-TH', 'vi-VN'],
      supportedFormats: ['wav', 'flac', 'ogg', 'mp3', 'm4a', 'aac'],
      maxFileSize: '10MB', // Google Cloud Speech limit
      wordTimestamps: true,
      speakerDiarization: true,
      punctuation: true,
      confidence: true,
      realtime: false
    };
  }

  // For streaming transcription (future implementation)
  async streamingTranscribe(audioStream, options = {}) {
    if (!this.client) {
      throw new Error('Google Cloud Speech client not initialized');
    }

    // Implementation for streaming transcription
    throw new Error('Streaming transcription not implemented yet');
  }
}

module.exports = GoogleSpeechService;