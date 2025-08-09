import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import createError from 'http-errors';
import uploadRouter from './routes/upload.js';
import transcriptionsRouter from './routes/transcriptions.js';
import exportRouter from './routes/export.js';
import { ensureDirectories } from './utils/fsutil.js';
import { initQueue } from './services/queue.js';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(morgan('dev'));

// Ensure runtime dirs
ensureDirectories([
  path.resolve('./uploads'),
  path.resolve('./data/jobs'),
  path.resolve('./data/projects'),
]);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'transkriptor-id', time: new Date().toISOString() });
});

app.use('/api/upload', uploadRouter);
app.use('/api/transcriptions', transcriptionsRouter);
app.use('/api/export', exportRouter);

app.use('/uploads', express.static(path.resolve('./uploads')));

app.use((_req, _res, next) => {
  next(createError(404, 'Not Found'));
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

// Initialize queue/in-memory processor
initQueue();

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});