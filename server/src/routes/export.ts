import express from 'express';
import path from 'path';
import { readJson } from '../utils/fsutil.js';
import { TranscriptionJob } from '../models/types.js';
import { buildDocxBuffer, buildSrtText, buildTxtText, buildJson, buildXlsxBuffer, buildPdfBuffer } from '../services/exporters.js';

const router = express.Router();
const jobsDir = path.resolve('./data/jobs');

router.get('/:id/json', (req, res) => {
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job || !job.result) return res.status(404).json({ error: 'Result not found' });
  const json = buildJson(job);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="transcript-${job.id}.json"`);
  res.send(JSON.stringify(json, null, 2));
});

router.get('/:id/txt', (req, res) => {
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job || !job.result) return res.status(404).json({ error: 'Result not found' });
  const txt = buildTxtText(job);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transcript-${job.id}.txt"`);
  res.send(txt);
});

router.get('/:id/srt', (req, res) => {
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job || !job.result) return res.status(404).json({ error: 'Result not found' });
  const srt = buildSrtText(job);
  res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transcript-${job.id}.srt"`);
  res.send(srt);
});

router.get('/:id/docx', async (req, res) => {
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job || !job.result) return res.status(404).json({ error: 'Result not found' });
  const buf = await buildDocxBuffer(job);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="transcript-${job.id}.docx"`);
  res.send(buf);
});

router.get('/:id/xlsx', async (req, res) => {
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job || !job.result) return res.status(404).json({ error: 'Result not found' });
  const buf = await buildXlsxBuffer(job);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="transcript-${job.id}.xlsx"`);
  res.send(buf);
});

router.get('/:id/pdf', async (req, res) => {
  const file = path.join(jobsDir, `${req.params.id}.json`);
  const job = readJson<TranscriptionJob>(file, undefined as any);
  if (!job || !job.result) return res.status(404).json({ error: 'Result not found' });
  const buf = await buildPdfBuffer(job);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="transcript-${job.id}.pdf"`);
  res.send(buf);
});

export default router;