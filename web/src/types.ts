export type StageName = 'uploading' | 'processing_audio' | 'transcribing' | 'speaker_detection' | 'finalizing' | 'completed' | 'failed';

export interface JobProgress {
  stage: StageName;
  progressPercent: number;
  elapsedSec: number;
  remainingSec?: number;
  totalDurationSec?: number;
  queuePosition?: number;
  message?: string;
}

export interface WordInfo {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  speaker: string;
  text: string;
  words: WordInfo[];
}

export interface SpeakerProfile {
  label: string;
  displayName?: string;
  confidence?: number;
}

export interface TranscriptResult {
  language: string;
  durationMs: number;
  speakers: SpeakerProfile[];
  segments: TranscriptSegment[];
  createdAt: string;
  updatedAt: string;
  provider: 'assemblyai';
}

export interface TranscriptionJob {
  id: string;
  file: {
    id: string;
    path: string;
    originalName: string;
    mimetype: string;
    size: number;
    webUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
  progress: JobProgress;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: TranscriptResult;
  error?: string;
}