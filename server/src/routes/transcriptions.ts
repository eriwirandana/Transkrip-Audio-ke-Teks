import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { writeJson, readJson } from '../utils/fsutil.js';
import { enqueueTranscription, initQueue } from '../services/queue.js';
import { TranscriptionJob, TranscriptResult } from '../models/types.js';

const router = express.Router();
const jobsDir = path.resolve('./data/jobs');

// Create transcription job from uploaded file metadata
router.post('/', (req, res) => {
  const { storedFilename, originalName, mimetype, size } = req.body || {};
  if (!storedFilename) return res.status(400).json({ error: 'storedFilename is required' });
  const filePath = path.resolve('./uploads', storedFilename);

  const id = randomUUID();
  const job: TranscriptionJob = {
    id,
    file: {
      id: path.parse(storedFilename).name,
      path: filePath,
      originalName: originalName || storedFilename,
      mimetype: mimetype || 'application/octet-stream',
      size: size ? Number(size) : 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'queued',
    progress: {
      stage: 'processing_audio',
      progressPercent: 10,
      elapsedSec: 0,
      message: 'Antri untuk diproses',
    },
  };

  writeJson(path.join(jobsDir, `${id}.json`), job);
  // enqueue if queue exists
  enqueueTranscription(id).catch(() => {/* fallback loop handles */});
  res.json({ jobId: id });
});

// List jobs (basic)
router.get('/', (_req, res) => {
  const fs = require('fs');
  const files = fs.readdirSync(jobsDir).filter((f: string) => f.endsWith('.json'));
  const jobs = files.map((f: string) => readJson<TranscriptionJob>(path.join(jobsDir, f), undefined as any))
    .filter(Boolean)
    .map((j: TranscriptionJob) => ({ id: j.id, status: j.status, progress: j.progress, file: j.file, createdAt: j.createdAt, updatedAt: j.updatedAt }));
  res.json({ jobs });
});

// Get job detail
router.get('/:id', (req, res) => {
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// SSE stream for progress
router.get('/:id/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = () => {
    const file = path.join(jobsDir, `${req.params.id}.json`);
    const job = readJson<TranscriptionJob>(file, undefined as any);
    if (job) {
      res.write(`data: ${JSON.stringify({ status: job.status, progress: job.progress })}\n\n`);
      if (job.status === 'completed' || job.status === 'failed') {
        clearInterval(interval);
        res.end();
      }
    }
  };
  const interval = setInterval(send, 1000);
  send();

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Patch speakers display names
router.patch('/:id/speakers', (req, res) => {
  const updates: { label: string; displayName: string }[] = req.body?.updates || [];
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job || !job.result) return res.status(404).json({ error: 'Result not found' });
  for (const up of updates) {
    const sp = job.result.speakers.find((s) => s.label === up.label);
    if (sp) sp.displayName = up.displayName;
  }
  job.updatedAt = new Date().toISOString();
  writeJson(file, job);
  res.json({ ok: true });
});

// Patch a segment (speaker assignment or text)
router.patch('/:id/segments/:segmentId', (req, res) => {
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job || !job.result) return res.status(404).json({ error: 'Result not found' });
  const seg = job.result.segments.find((s) => s.id === req.params.segmentId);
  if (!seg) return res.status(404).json({ error: 'Segment not found' });

  const { speaker, text } = req.body || {};
  if (typeof speaker === 'string') seg.speaker = speaker;
  if (typeof text === 'string') seg.text = text;

  job.updatedAt = new Date().toISOString();
  writeJson(file, job);
  res.json({ ok: true });
});

// Simple search & replace across segments
router.post('/:id/search-replace', (req, res) => {
  const { find, replace, caseSensitive } = req.body || {};
  if (!find || typeof replace !== 'string') return res.status(400).json({ error: 'find and replace required' });
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job || !job.result) return res.status(404).json({ error: 'Result not found' });
  const flags = caseSensitive ? 'g' : 'gi';
  const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  for (const seg of job.result.segments) {
    seg.text = seg.text.replace(re, replace);
  }
  job.updatedAt = new Date().toISOString();
  writeJson(file, job);
  res.json({ ok: true });
});

export default router;