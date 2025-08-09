export type StageName =
  | 'uploading'
  | 'processing_audio'
  | 'transcribing'
  | 'speaker_detection'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface WordInfo {
  start: number; // ms
  end: number; // ms
  text: string;
  confidence?: number; // 0..1
}

export interface TranscriptSegment {
  id: string;
  start: number; // ms
  end: number; // ms
  speaker: string; // e.g., Speaker 1
  text: string;
  words: WordInfo[];
  comments?: string[];
  highlights?: { startChar: number; endChar: number; color: string }[];
}

export interface SpeakerProfile {
  label: string; // Speaker 1
  displayName?: string; // custom name
  confidence?: number; // 0..1
}

export interface TranscriptResult {
  language: string;
  durationMs: number;
  speakers: SpeakerProfile[];
  segments: TranscriptSegment[];
  createdAt: string;
  updatedAt: string;
  provider: 'assemblyai';
  rawProviderResponsePath?: string;
}

export interface JobProgress {
  stage: StageName;
  progressPercent: number; // 0..100
  elapsedSec: number;
  remainingSec?: number;
  totalDurationSec?: number;
  queuePosition?: number;
  message?: string;
}

export interface TranscriptionJob {
  id: string;
  file: {
    id: string;
    path: string;
    originalName: string;
    mimetype: string;
    size: number;
  };
  createdAt: string;
  updatedAt: string;
  progress: JobProgress;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: TranscriptResult;
  error?: string;
}