import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Divider, IconButton, LinearProgress, MenuItem, Paper, Select, Stack, TextField, Toolbar, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import { exportUrl, getJob, openProgressStream, patchSegment } from '../api';
import type { TranscriptionJob, TranscriptSegment } from '../types';

function msToTag(ms: number, showHours: boolean) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return showHours || h > 0 ? `[${pad(h)}:${pad(m)}:${pad(s)}]` : `[${pad(m)}:${pad(s)}]`;
}

export default function Editor({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const [job, setJob] = useState<TranscriptionJob | null>(null);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  const refresh = async () => {
    const j = await getJob(jobId);
    setJob(j);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const stop = openProgressStream(jobId, async (_msg) => {
      await refresh();
    });
    return () => stop();
  }, [jobId]);

  const showHours = useMemo(() => (job?.result?.durationMs ?? 0) >= 3600000, [job?.result?.durationMs]);

  const onSpeakerChange = async (seg: TranscriptSegment, value: string) => {
    setJob((prev) => prev ? ({ ...prev, result: prev.result ? { ...prev.result, segments: prev.result.segments.map(s => s.id === seg.id ? { ...s, speaker: value } : s) } : prev.result }) : prev);
    await patchSegment(jobId, seg.id, { speaker: value });
  };

  const onTextChange = async (seg: TranscriptSegment, value: string) => {
    setJob((prev) => prev ? ({ ...prev, result: prev.result ? { ...prev.result, segments: prev.result.segments.map(s => s.id === seg.id ? { ...s, text: value } : s) } : prev.result }) : prev);
    await patchSegment(jobId, seg.id, { text: value });
  };

  if (loading || !job) return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6">Memuat...</Typography>
      <LinearProgress sx={{ mt: 2 }} />
    </Paper>
  );

  const progress = job.progress?.progressPercent ?? 0;

  return (
    <Stack spacing={2}>
      <Paper>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{job.file.originalName}</Typography>
          <Chip size="small" label={job.status} />
          <Box minWidth={200}><LinearProgress variant="determinate" value={progress} /></Box>
          <Typography variant="caption" sx={{ width: 40, textAlign: 'right' }}>{progress}%</Typography>
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          <Tooltip title="Unduh DOCX"><IconButton component="a" href={exportUrl(job.id, 'docx')}><DownloadIcon /></IconButton></Tooltip>
          <Tooltip title="Unduh PDF"><IconButton component="a" href={exportUrl(job.id, 'pdf')}><DownloadIcon /></IconButton></Tooltip>
          <Tooltip title="Unduh TXT"><IconButton component="a" href={exportUrl(job.id, 'txt')}><DownloadIcon /></IconButton></Tooltip>
          <Tooltip title="Unduh SRT"><IconButton component="a" href={exportUrl(job.id, 'srt')}><DownloadIcon /></IconButton></Tooltip>
          <Tooltip title="Unduh JSON"><IconButton component="a" href={exportUrl(job.id, 'json')}><DownloadIcon /></IconButton></Tooltip>
          <Tooltip title="Unduh Excel"><IconButton component="a" href={exportUrl(job.id, 'xlsx')}><DownloadIcon /></IconButton></Tooltip>
        </Toolbar>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <audio ref={audioRef} controls src={job.file.webUrl} style={{ width: '100%' }} />
          {/* Playback speed */}
          <Select size="small" defaultValue={1} onChange={(e) => { if (audioRef.current) audioRef.current.playbackRate = Number(e.target.value); }}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
              <MenuItem key={r} value={r}>{r}x</MenuItem>
            ))}
          </Select>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>Transkrip</Typography>
        <Stack spacing={2}>
          {job.result?.segments?.map((seg) => (
            <Box key={seg.id} sx={{ border: '1px solid #eee', borderRadius: 1, p: 1 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                <Button size="small" variant="outlined" onClick={() => { if (audioRef.current) { audioRef.current.currentTime = seg.start / 1000; audioRef.current.play(); } }}>{msToTag(seg.start, showHours)}</Button>
                <Select size="small" value={seg.speaker} onChange={(e) => onSpeakerChange(seg, e.target.value)}>
                  {(job.result?.speakers || []).map((sp) => (
                    <MenuItem key={sp.label} value={sp.label}>{sp.displayName || sp.label}</MenuItem>
                  ))}
                </Select>
              </Stack>
              <TextField
                multiline fullWidth minRows={2} sx={{ mt: 1 }}
                value={seg.text}
                onChange={(e) => onTextChange(seg, e.target.value)}
              />
            </Box>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}