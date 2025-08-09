import axios from 'axios';
import type { TranscriptionJob } from './types';

export const api = axios.create({ baseURL: '' });

export async function listJobs(): Promise<TranscriptionJob[]> {
  const r = await api.get('/api/transcriptions');
  return r.data.jobs;
}

export async function getJob(jobId: string): Promise<TranscriptionJob> {
  const r = await api.get(`/api/transcriptions/${jobId}`);
  return r.data;
}

export function openProgressStream(jobId: string, onMessage: (data: any) => void): () => void {
  const es = new EventSource(`/api/transcriptions/${jobId}/stream`);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch {}
  };
  es.onerror = () => {
    es.close();
  };
  return () => es.close();
}

export async function patchSegment(jobId: string, segmentId: string, payload: Partial<{ speaker: string; text: string }>) {
  await api.patch(`/api/transcriptions/${jobId}/segments/${segmentId}`, payload);
}

export async function patchSpeakers(jobId: string, updates: { label: string; displayName: string }[]) {
  await api.patch(`/api/transcriptions/${jobId}/speakers`, { updates });
}

export function exportUrl(jobId: string, fmt: 'json'|'txt'|'srt'|'docx'|'xlsx'|'pdf') {
  return `/api/export/${jobId}/${fmt}`;
}