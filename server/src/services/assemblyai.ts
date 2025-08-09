import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { writeJson } from '../utils/fsutil.js';
import { TranscriptResult, TranscriptSegment, WordInfo } from '../models/types.js';
import { nanoid } from 'nanoid';

const AAI_BASE = process.env.ASSEMBLYAI_BASE_URL || 'https://api.assemblyai.com/v2';
const AAI_KEY = process.env.ASSEMBLYAI_API_KEY || '';

function client() {
  return axios.create({
    baseURL: AAI_BASE,
    headers: { Authorization: AAI_KEY },
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
}

export async function uploadToAssemblyAI(localFilePath: string): Promise<string> {
  const c = client();
  const stream = fs.createReadStream(localFilePath);
  const resp = await c.post('/upload', stream, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  return resp.data.upload_url as string;
}

export interface StartTranscriptionOptions {
  audioUrl: string;
  languageCode?: string; // e.g., 'id'
}

export async function startTranscription(opts: StartTranscriptionOptions): Promise<string> {
  const c = client();
  const body = {
    audio_url: opts.audioUrl,
    language_code: opts.languageCode || 'id',
    speaker_labels: true,
    punctuate: true,
    format_text: true,
    disfluencies: true,
    word_boost: [],
    boost_param: 'high',
    // Enable per-word timestamps
    words: true,
    // Auto highlight can provide alternative suggestions baseline
    auto_highlights: true,
  };
  const resp = await c.post('/transcribe', body);
  return resp.data.id as string;
}

export async function pollTranscription(transcriptId: string) {
  const c = client();
  while (true) {
    const resp = await c.get(`/transcribe/${transcriptId}`);
    const status = resp.data.status as string;
    if (status === 'completed') return resp.data;
    if (status === 'error') throw new Error(resp.data.error || 'Transcription failed');
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export function mapAssemblyToResult(
  aai: any,
  rawSavePath?: string
): TranscriptResult {
  if (rawSavePath) {
    writeJson(rawSavePath, aai);
  }

  const durationMs = Math.round((aai.audio_duration ?? 0) * 1000);

  // Build speakers list from utterances speaker labels
  const speakerSet = new Set<string>();
  const utterances: any[] = aai.utterances || [];
  for (const u of utterances) {
    if (u.speaker) speakerSet.add(u.speaker);
  }
  const speakers = Array.from(speakerSet).map((label) => ({ label }));

  // Build segments: use utterances when available, else fallback to words grouped by 30s
  const segments: TranscriptSegment[] = [];
  if (utterances.length > 0) {
    for (const u of utterances) {
      const words: WordInfo[] = (u.words || []).map((w: any) => ({
        start: Math.round((w.start ?? 0)),
        end: Math.round((w.end ?? 0)),
        text: w.text || w.word || '',
        confidence: typeof w.confidence === 'number' ? w.confidence : undefined,
      }));
      segments.push({
        id: nanoid(),
        start: Math.round(u.start ?? (words[0]?.start ?? 0)),
        end: Math.round(u.end ?? (words[words.length - 1]?.end ?? 0)),
        speaker: u.speaker || 'Speaker 1',
        text: u.text || words.map((w) => w.text).join(' '),
        words,
      });
    }
  } else {
    const words: any[] = aai.words || [];
    const thirtySec = 30000;
    let bucketStart = words.length ? words[0].start : 0;
    let bucket: WordInfo[] = [];
    for (const w of words) {
      const wi: WordInfo = {
        start: Math.round(w.start ?? 0),
        end: Math.round(w.end ?? 0),
        text: w.text || w.word || '',
        confidence: typeof w.confidence === 'number' ? w.confidence : undefined,
      };
      if (wi.start - bucketStart > thirtySec && bucket.length > 0) {
        segments.push({
          id: nanoid(),
          start: bucket[0].start,
          end: bucket[bucket.length - 1].end,
          speaker: 'Speaker 1',
          text: bucket.map((b) => b.text).join(' '),
          words: bucket,
        });
        bucket = [];
        bucketStart = wi.start;
      }
      bucket.push(wi);
    }
    if (bucket.length > 0) {
      segments.push({
        id: nanoid(),
        start: bucket[0].start,
        end: bucket[bucket.length - 1].end,
        speaker: 'Speaker 1',
        text: bucket.map((b) => b.text).join(' '),
        words: bucket,
      });
    }
  }

  return {
    language: aai.language_code || 'id',
    durationMs,
    speakers: speakers.length
      ? speakers.map((s, idx) => ({ label: s.label, displayName: `Speaker ${idx + 1}` }))
      : [{ label: 'Speaker 1', displayName: 'Speaker 1' }],
    segments,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provider: 'assemblyai',
    rawProviderResponsePath: rawSavePath,
  };
}