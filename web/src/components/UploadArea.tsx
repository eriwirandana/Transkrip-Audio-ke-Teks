import { Box, Button, LinearProgress, Paper, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import axios from 'axios';

type Props = { onJobsCreated: (jobIds: string[]) => void };

export default function UploadArea({ onJobsCreated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      const uploadRes = await axios.post('/api/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      const jobIds: string[] = [];
      for (const f of uploadRes.data.files as any[]) {
        const createRes = await axios.post('/api/transcriptions', {
          storedFilename: f.storedFilename,
          originalName: f.filename,
          mimetype: f.mimetype,
          size: f.size,
          url: f.url,
        });
        jobIds.push(createRes.data.jobId);
      }
      onJobsCreated(jobIds);
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>Upload Audio</Typography>
      <Typography variant="body2" gutterBottom>Format: MP3, WAV, M4A, OGG, FLAC, AAC — Maks 500MB atau 3 jam</Typography>
      <Box display="flex" gap={2} alignItems="center">
        <Button variant="contained" onClick={() => inputRef.current?.click()} disabled={busy}>Pilih File</Button>
        <input ref={inputRef} type="file" multiple accept="audio/*" hidden onChange={(e) => handleFiles(e.target.files)} />
        {busy && <Box flex={1}><LinearProgress variant="determinate" value={progress} /></Box>}
      </Box>
    </Paper>
  );
}