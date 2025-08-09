import express from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.resolve('./uploads')),
  filename: (_req, file, cb) => {
    const id = randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
});

router.post('/', upload.array('files', 10), (req, res) => {
  const files = (req.files as Express.Multer.File[]).map((f) => ({
    id: path.parse(f.filename).name,
    filename: f.originalname,
    storedFilename: f.filename,
    mimetype: f.mimetype,
    size: f.size,
    url: `/uploads/${f.filename}`,
    path: f.path,
    uploadedAt: new Date().toISOString(),
  }));
  res.json({ files });
});

export default router;