import { useState } from 'react';
import { AppBar, Box, Button, Container, CssBaseline, Toolbar, Typography } from '@mui/material';
import UploadArea from './components/UploadArea';
import JobsList from './components/JobsList';
import Editor from './components/Editor';

export default function App() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  return (
    <>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Transkriptor ID</Typography>
          <Button color="inherit" onClick={() => setSelectedJobId(null)}>Dashboard</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        {!selectedJobId && (
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={3}>
            <UploadArea onJobsCreated={(ids) => ids.length && setSelectedJobId(ids[0])} />
            <JobsList onOpen={(id) => setSelectedJobId(id)} />
          </Box>
        )}
        {selectedJobId && <Editor jobId={selectedJobId} onBack={() => setSelectedJobId(null)} />}
      </Container>
    </>
  );
}