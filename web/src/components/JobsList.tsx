import { useEffect, useState } from 'react';
import { Paper, Typography, List, ListItem, ListItemText, IconButton, Chip, Box, LinearProgress } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { listJobs } from '../api';
import type { TranscriptionJob } from '../types';

export default function JobsList({ onOpen }: { onOpen: (id: string) => void }) {
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);

  useEffect(() => {
    let alive = true;
    const fetchJobs = async () => {
      try {
        const j = await listJobs();
        if (alive) setJobs(j);
      } catch {}
    };
    fetchJobs();
    const t = setInterval(fetchJobs, 2000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>Pekerjaan (Antrian)</Typography>
      <List>
        {jobs.map((j) => (
          <ListItem key={j.id} secondaryAction={
            <IconButton edge="end" onClick={() => onOpen(j.id)}><OpenInNewIcon /></IconButton>
          }>
            <ListItemText
              primary={j.file.originalName}
              secondary={
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip size="small" label={j.status} />
                  <Box minWidth={120}>
                    <LinearProgress variant="determinate" value={j.progress?.progressPercent ?? 0} />
                  </Box>
                  <Typography variant="caption">{j.progress?.progressPercent ?? 0}%</Typography>
                </Box>
              }
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}