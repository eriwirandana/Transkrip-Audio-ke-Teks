const sdk = require('microsoft-cognitiveservices-speech-sdk');
const fs = require('fs');
const winston = require('winston');

class AzureSpeechService {
  constructor() {
    this.speechConfig = null;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'azure-speech' },
      transports: [
        new winston.transports.File({ filename: 'logs/azure-speech.log' }),
        new winston.transports.Console()
      ]
    });

    this.initializeConfig();
  }

  initializeConfig() {
    try {
      const subscriptionKey = process.env.AZURE_SPEECH_KEY;
      const region = process.env.AZURE_SPEECH_REGION || 'southeastasia';

      if (!subscriptionKey) {
        this.logger.warn('Azure Speech subscription key not found');
        return;
      }

      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
      
      // Set default language
      this.speechConfig.speechRecognitionLanguage = 'id-ID';
      
      // Enable detailed output
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      
      this.logger.info('Azure Speech config initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Azure Speech config:', error);
      this.logger.warn('Azure Speech service will not be available');
    }
  }

  async transcribe(audioPath, options = {}, progressCallback = null) {
    if (!this.speechConfig) {
      throw new Error('Azure Speech config not initialized');
    }

    try {
      this.logger.info(`Starting Azure Speech transcription: ${audioPath}`);
      
      if (progressCallback) progressCallback(5);

      // Configure speech recognition
      const language = this.convertLanguageCode(options.language || 'id-ID');
      this.speechConfig.speechRecognitionLanguage = language;
      
      // Create audio config from file
      const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(audioPath));
      
      if (progressCallback) progressCallback(15);

      // Create speech recognizer
      const recognizer = sdk.SpeechRecognizer.FromConfig(this.speechConfig, audioConfig);
      
      if (progressCallback) progressCallback(25);

      // Enable word-level timestamps
      recognizer.properties.setProperty(
        sdk.PropertyId.SpeechServiceResponse_RequestWordLevelTimestamps,
        "true"
      );

      this.logger.info('Starting Azure Speech recognition');

      const result = await this.performRecognition(recognizer, progressCallback);
      
      if (progressCallback) progressCallback(100);

      this.logger.info(`Azure Speech transcription completed: ${result.segments.length} segments`);
      
      return result;

    } catch (error) {
      this.logger.error('Azure Speech transcription failed:', error);
      throw new Error(`Azure Speech transcription failed: ${error.message}`);
    }
  }

  async performRecognition(recognizer, progressCallback) {
    return new Promise((resolve, reject) => {
      const segments = [];
      const allWords = [];
      let segmentId = 0;
      let totalDuration = 0;

      // Handle recognition events
      recognizer.recognizing = (s, e) => {
        if (progressCallback) {
          // Estimate progress based on recognized text length
          const progress = Math.min(30 + (segments.length * 5), 80);
          progressCallback(progress);
        }
      };

      recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
          const segment = this.processRecognitionResult(e.result, segmentId++);
          segments.push(segment);
          
          if (segment.words) {
            allWords.push(...segment.words);
          }
          
          totalDuration = Math.max(totalDuration, segment.end);
        }
      };

      recognizer.canceled = (s, e) => {
        this.logger.error('Azure Speech recognition canceled:', e.errorDetails);
        recognizer.close();
        reject(new Error(e.errorDetails));
      };

      recognizer.sessionStopped = (s, e) => {
        this.logger.info('Azure Speech session stopped');
        recognizer.close();
        
        const result = {
          text: segments.map(seg => seg.text).join(' '),
          language: recognizer.speechRecognitionLanguage,
          duration: totalDuration,
          segments: segments,
          words: allWords
        };
        
        resolve(result);
      };

      // Start continuous recognition
      recognizer.startContinuousRecognitionAsync(
        () => {
          this.logger.info('Azure Speech recognition started');
        },
        (error) => {
          this.logger.error('Failed to start Azure Speech recognition:', error);
          recognizer.close();
          reject(new Error(error));
        }
      );

      // Stop recognition after timeout (for file-based recognition)
      setTimeout(() => {
        recognizer.stopContinuousRecognitionAsync();
      }, 300000); // 5 minutes timeout
    });
  }

  processRecognitionResult(result, segmentId) {
    // Parse the detailed result JSON
    const detailedResult = JSON.parse(result.json);
    const bestResult = detailedResult.NBest[0];
    
    const startTime = result.offset / 10000000; // Convert from ticks to seconds
    const duration = result.duration / 10000000;
    const endTime = startTime + duration;

    // Extract words with timestamps
    const words = [];
    if (bestResult && bestResult.Words) {
      bestResult.Words.forEach((word, index) => {
        words.push({
          id: index,
          text: word.Word,
          start: startTime + (word.Offset / 10000000),
          end: startTime + ((word.Offset + word.Duration) / 10000000),
          confidence: word.Confidence || bestResult.Confidence
        });
      });
    }

    return {
      id: segmentId,
      start: startTime,
      end: endTime,
      text: this.formatIndonesianText(result.text),
      confidence: bestResult ? bestResult.Confidence : 0.8,
      words: words,
      speaker: 'speaker_1' // Azure doesn't provide speaker diarization in this mode
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

  convertLanguageCode(language) {
    // Convert to Azure Speech language codes
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
    if (!this.speechConfig) {
      return false;
    }

    try {
      // Create a simple test recognizer to validate credentials
      const testAudioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      const testRecognizer = sdk.SpeechRecognizer.FromConfig(this.speechConfig, testAudioConfig);
      
      // Just creating the recognizer validates the credentials
      testRecognizer.close();
      
      this.logger.info('Azure Speech credentials validated successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to validate Azure Speech credentials:', error);
      return false;
    }
  }

  getCapabilities() {
    return {
      supportedLanguages: ['id-ID', 'en-US', 'en-GB', 'ms-MY', 'zh-CN', 'ja-JP', 'ko-KR', 'th-TH', 'vi-VN'],
      supportedFormats: ['wav', 'ogg', 'mp3', 'm4a', 'flac'],
      maxFileSize: '50MB', // Azure Speech limit
      wordTimestamps: true,
      speakerDiarization: false, // Basic mode doesn't support diarization
      punctuation: true,
      confidence: true,
      realtime: true
    };
  }

  // For conversation transcription with speaker diarization
  async transcribeConversation(audioPath, options = {}, progressCallback = null) {
    if (!this.speechConfig) {
      throw new Error('Azure Speech config not initialized');
    }

    try {
      this.logger.info(`Starting Azure conversation transcription: ${audioPath}`);
      
      if (progressCallback) progressCallback(5);

      // Create conversation transcriber
      const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(audioPath));
      const conversationTranscriber = new sdk.ConversationTranscriber(this.speechConfig, audioConfig);
      
      if (progressCallback) progressCallback(15);

      const result = await this.performConversationTranscription(conversationTranscriber, progressCallback);
      
      if (progressCallback) progressCallback(100);

      this.logger.info(`Azure conversation transcription completed: ${result.segments.length} segments`);
      
      return result;

    } catch (error) {
      this.logger.error('Azure conversation transcription failed:', error);
      throw new Error(`Azure conversation transcription failed: ${error.message}`);
    }
  }

  async performConversationTranscription(transcriber, progressCallback) {
    return new Promise((resolve, reject) => {
      const segments = [];
      const speakers = new Map();
      let segmentId = 0;
      let totalDuration = 0;

      // Handle transcription events
      transcriber.transcribing = (s, e) => {
        if (progressCallback) {
          const progress = Math.min(30 + (segments.length * 3), 80);
          progressCallback(progress);
        }
      };

      transcriber.transcribed = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text) {
          const speakerId = e.result.speakerId || 'speaker_1';
          
          // Track speakers
          if (!speakers.has(speakerId)) {
            speakers.set(speakerId, {
              id: speakerId,
              name: `Speaker ${speakers.size + 1}`,
              segments: 0
            });
          }
          
          const segment = this.processConversationResult(e.result, segmentId++, speakerId);
          segments.push(segment);
          
          speakers.get(speakerId).segments++;
          totalDuration = Math.max(totalDuration, segment.end);
        }
      };

      transcriber.canceled = (s, e) => {
        this.logger.error('Azure conversation transcription canceled:', e.errorDetails);
        transcriber.close();
        reject(new Error(e.errorDetails));
      };

      transcriber.sessionStopped = (s, e) => {
        this.logger.info('Azure conversation transcription stopped');
        transcriber.close();
        
        const result = {
          text: segments.map(seg => seg.text).join(' '),
          language: transcriber.speechRecognitionLanguage,
          duration: totalDuration,
          segments: segments,
          speakers: Array.from(speakers.values()),
          words: segments.flatMap(seg => seg.words || [])
        };
        
        resolve(result);
      };

      // Start transcription
      transcriber.startTranscribingAsync(
        () => {
          this.logger.info('Azure conversation transcription started');
        },
        (error) => {
          this.logger.error('Failed to start Azure conversation transcription:', error);
          transcriber.close();
          reject(new Error(error));
        }
      );

      // Stop transcription after timeout
      setTimeout(() => {
        transcriber.stopTranscribingAsync();
      }, 300000); // 5 minutes timeout
    });
  }

  processConversationResult(result, segmentId, speakerId) {
    const startTime = result.offset / 10000000;
    const duration = result.duration / 10000000;
    const endTime = startTime + duration;

    return {
      id: segmentId,
      start: startTime,
      end: endTime,
      text: this.formatIndonesianText(result.text),
      speaker: speakerId,
      confidence: 0.8, // Azure doesn't provide confidence in conversation mode
      words: [] // Word-level timestamps not available in conversation mode
    };
  }
}

module.exports = AzureSpeechService;