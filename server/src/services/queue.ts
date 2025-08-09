import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import path from 'path';
import fs from 'fs';
import { uploadToAssemblyAI, startTranscription, pollTranscription, mapAssemblyToResult } from './assemblyai.js';
import { readJson, writeJson } from '../utils/fsutil.js';
import { TranscriptionJob } from '../models/types.js';

const redisUrl = process.env.REDIS_URL;
const queueName = 'transcriptions';

let bullQueue: Queue | undefined;
let bullWorker: Worker | undefined;

const jobsDir = path.resolve('./data/jobs');

function updateJob(jobId: string, mutator: (j: TranscriptionJob) => void) {
  const file = path.join(jobsDir, `${jobId}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job) return;
  mutator(job);
  job.updatedAt = new Date().toISOString();
  writeJson(file, job);
}

async function processTranscription(jobData: any) {
  const jobId = jobData.jobId as string;
  const jobFile = path.join(jobsDir, `${jobId}.json`);
  const job = readJson<TranscriptionJob>(jobFile, undefined as any);
  if (!job) throw new Error('Job not found');

  const setStage = (stage: TranscriptionJob['progress']['stage'], progressPercent: number, message?: string) => {
    updateJob(jobId, (j) => {
      j.progress.stage = stage;
      j.progress.progressPercent = progressPercent;
      if (message) j.progress.message = message;
    });
  };

  try {
    setStage('processing_audio', 15, 'Mengunggah audio ke penyedia STT');
    const uploadUrl = await uploadToAssemblyAI(job.file.path);

    setStage('transcribing', 35, 'Memulai transkripsi');
    const transcriptId = await startTranscription({ audioUrl: uploadUrl, languageCode: 'id' });

    setStage('transcribing', 60, 'Menunggu hasil transkripsi');
    const result = await pollTranscription(transcriptId);

    setStage('speaker_detection', 85, 'Memproses pembicara & segmen');
    const rawPath = path.join(jobsDir, `${jobId}.provider.json`);
    const mapped = mapAssemblyToResult(result, rawPath);

    setStage('finalizing', 95, 'Finalisasi');
    updateJob(jobId, (j) => {
      j.status = 'completed';
      j.progress.stage = 'completed';
      j.progress.progressPercent = 100;
      j.result = mapped;
    });
  } catch (err: any) {
    updateJob(jobId, (j) => {
      j.status = 'failed';
      j.progress.stage = 'failed';
      j.error = err?.message || 'Processing failed';
    });
    throw err;
  }
}

export function initQueue() {
  if (redisUrl) {
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    bullQueue = new Queue(queueName, { connection });
    bullWorker = new Worker(queueName, async (job: Job) => {
      await processTranscription(job.data);
    }, { connection });
  } else {
    // In-memory fallback: simple FIFO using setInterval
    setInterval(async () => {
      const files = fs.readdirSync(jobsDir).filter((f) => f.endsWith('.json'));
      for (const f of files) {
        const job: TranscriptionJob = readJson(path.join(jobsDir, f), undefined as any);
        if (job && job.status === 'queued') {
          job.status = 'running';
          job.progress.stage = 'processing_audio';
          writeJson(path.join(jobsDir, f), job);
          try {
            await processTranscription({ jobId: job.id });
          } catch {
            // handled inside
          }
          break; // process one per tick
        }
      }
    }, 2000);
  }
}

export async function enqueueTranscription(jobId: string) {
  if (bullQueue) {
    await bullQueue.add('transcribe', { jobId }, { removeOnComplete: true, removeOnFail: true });
  }
}